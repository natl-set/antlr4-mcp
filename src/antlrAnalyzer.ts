/**
 * ANTLR4 Grammar Analyzer
 * Parses and analyzes ANTLR4 grammar files
 */

import * as fs from 'fs';
import * as path from 'path';

export interface GrammarRule {
  name: string;
  type: 'lexer' | 'parser';
  definition: string;
  lineNumber: number;
  referencedRules: string[];
}

export interface GrammarToken {
  name: string;
  pattern: string;
  lineNumber: number;
}

export interface GrammarAnalysis {
  grammarName: string;
  type: 'lexer' | 'parser' | 'combined';
  rules: GrammarRule[];
  tokens: GrammarToken[];
  imports: string[];
  options: Record<string, string>;
  issues: GrammarIssue[];
}

export interface GrammarIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  lineNumber?: number;
  ruleName?: string;
}

export interface TokenInfo {
  type: string;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
  skipped: boolean;
  channel?: string;
}

export interface GrammarFormatting {
  colonPlacement: 'same-line' | 'new-line' | 'mixed';
  semicolonPlacement: 'same-line' | 'new-line' | 'mixed';
  indentStyle: string; // e.g., '  ', '    ', '\t'
  indentSize: number;
  spaceAroundColon: boolean;
  blankLinesBetweenRules: boolean;
}

export class AntlrAnalyzer {
  /**
   * Analyze an ANTLR4 grammar file
   */
  static analyze(grammarContent: string): GrammarAnalysis {
    const lines = grammarContent.split('\n');
    const result: GrammarAnalysis = {
      grammarName: '',
      type: 'combined',
      rules: [],
      tokens: [],
      imports: [],
      options: {},
      issues: [],
    };

    let currentLineNum = 0;
    let inBlockComment = false;
    let pendingRuleName: string | null = null;
    let pendingRuleLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentLineNum++;
      const trimmed = line.trim();

      // Skip empty lines (unless we are inside a rule definition extraction, handled below)
      if (trimmed === '') {
        continue;
      }

      // Handle block comments
      if (trimmed.includes('/*')) inBlockComment = true;
      if (trimmed.includes('*/')) inBlockComment = false;
      if (inBlockComment || trimmed.startsWith('//')) {
        continue;
      }

      // Parse grammar declaration
      if (trimmed.startsWith('lexer grammar ')) {
        result.grammarName = trimmed.replace('lexer grammar ', '').replace(';', '').trim();
        result.type = 'lexer';
        pendingRuleName = null;
        continue;
      } else if (trimmed.startsWith('parser grammar ')) {
        result.grammarName = trimmed.replace('parser grammar ', '').replace(';', '').trim();
        result.type = 'parser';
        pendingRuleName = null;
        continue;
      } else if (trimmed.startsWith('grammar ')) {
        result.grammarName = trimmed.replace('grammar ', '').replace(';', '').trim();
        result.type = 'combined';
        pendingRuleName = null;
        continue;
      }

      // Parse imports
      if (trimmed.startsWith('import ')) {
        const importMatch = trimmed.match(/import\s+(.+?);/);
        if (importMatch) {
          result.imports.push(importMatch[1]);
        }
        pendingRuleName = null;
        continue;
      }

      // Parse options
      if (trimmed.startsWith('options ')) {
        const optionsMatch = grammarContent.match(/options\s*\{([^}]+)\}/s);
        if (optionsMatch) {
          const optionsContent = optionsMatch[1];
          const optionLines = optionsContent.split(';');
          for (const optLine of optionLines) {
            const match = optLine.match(/(\w+)\s*=\s*(.+)/);
            if (match) {
              result.options[match[1].trim()] = match[2].trim();
            }
          }
        }
        pendingRuleName = null;
        continue;
      }

      // Check for rule definition start
      let ruleName: string | null = null;
      let isRuleStart = false;

      // Case 1: "ruleName :" or "fragment ruleName :" (Same line)
      // Matches: lowercase_name, UPPERCASE_NAME, or MixedCaseName
      const sameLineMatch = trimmed.match(/^(?:fragment\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (sameLineMatch) {
        ruleName = sameLineMatch[1];
        isRuleStart = true;
        pendingRuleName = null;
      }
      // Case 2a: Colon on this line, previously saw a potential rule name or "fragment"
      else if (pendingRuleName && trimmed.startsWith(':')) {
        // If pending was "fragment", extract rule name from trimmed (should be "ruleName :")
        if (pendingRuleName === 'fragment') {
          const match = trimmed.match(/^([A-Z_][A-Z0-9_]*|[a-z_][a-z0-9_]*)\s*:/);
          if (match) {
            ruleName = match[1];
          }
        } else {
          ruleName = pendingRuleName;
        }
        // Use the line number where the name was found
        currentLineNum = pendingRuleLine;
        isRuleStart = true;
        pendingRuleName = null;
      }
      // Case 2b: Line after "fragment" should be the rule name (potentially with colon)
      else if (pendingRuleName === 'fragment') {
        const ruleNameMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:|$)/);
        if (ruleNameMatch) {
          pendingRuleName = ruleNameMatch[1]; // Update pending to the actual rule name
          if (trimmed.includes(':')) {
            // Colon is on same line, so this is the rule start
            ruleName = ruleNameMatch[1];
            isRuleStart = true;
            currentLineNum = pendingRuleLine;
            pendingRuleName = null;
          } else {
            // Just the name, wait for colon on next line
            pendingRuleLine = currentLineNum;
            continue;
          }
        }
      }
      // Case 3: "fragment" keyword alone or potential rule name on this line (no colon yet)
      else if (trimmed === 'fragment' || /^([A-Za-z_][A-Za-z0-9_]*)$/.test(trimmed)) {
        const potentialName = trimmed;
        if (potentialName === 'fragment' || !this.isAntlrKeyword(potentialName)) {
          pendingRuleName = potentialName;
          pendingRuleLine = currentLineNum;
          continue; // Wait for next line to confirm
        }
      } else {
        // Not a rule start, reset pending
        pendingRuleName = null;
      }

      if (isRuleStart && ruleName) {
        const isLexerRule = /^[A-Z_]/.test(ruleName);
        const ruleType = isLexerRule ? 'lexer' : 'parser';

        // Extract the full rule definition
        // We need to reconstruct from the start of the rule (which might be previous line)
        // If we came from pending state, we need to handle that carefully.
        // Simplified: Start capturing from the current line (where colon is) or the previous line?
        // Actually, let's just capture from the verification point onwards until semicolon.

        let ruleContent = trimmed;

        // If we found it via pendingRuleName, we might want to include the name for display purposes?
        // The 'definition' field usually includes the whole thing.
        if (ruleContent.startsWith(':')) {
          ruleContent = `${ruleName}\n${ruleContent}`;
        }

        let checkLine = i + 1;
        // Safety limit to prevent infinite loops on missing semicolons
        // 10,000 lines is extremely generous - even the most complex rules are typically <1000 lines
        const maxLinesPerRule = 10000;
        let linesRead = 0;

        // Capture until semicolon
        // Careful: checkLine is index in 'lines' array. currentLineNum is 1-based index (approx).
        // Let's rely on lines[] index 'i'

        // Improve extraction: handle strings containing semicolons?
        // For now, simple semicolon check is consistent with previous logic.
        while (
          !ruleContent.includes(';') &&
          checkLine < lines.length &&
          linesRead < maxLinesPerRule
        ) {
          ruleContent += ' ' + lines[checkLine].trim();
          checkLine++;
          linesRead++;
        }

        // If we hit the line limit, report an issue
        if (linesRead >= maxLinesPerRule && !ruleContent.includes(';')) {
          result.issues.push({
            type: 'error',
            message: `Rule '${ruleName}' appears to be missing a semicolon or is extremely long (>${maxLinesPerRule} lines)`,
            ruleName: ruleName,
            lineNumber: pendingRuleLine > 0 ? pendingRuleLine : i + 1,
          });
          // Try to continue parsing - add semicolon to avoid breaking everything
          ruleContent += ';';
        }

        // Update loop counter to skip processed lines
        i = checkLine - 1;
        // Note: currentLineNum will be out of sync, but we restore it if needed or just track 'i'
        // Actually currentLineNum is only used for the *start* of the rule, which we already captured.
        // We need to re-sync currentLineNum for future iterations if we really care,
        // but 'i' effectively drives the loop.

        const rule: GrammarRule = {
          name: ruleName,
          type: ruleType,
          definition: ruleContent,
          lineNumber: pendingRuleLine > 0 ? pendingRuleLine : i + 1, // Approximate
          referencedRules: this.extractReferencedRules(ruleContent),
        };

        // Reset pending rule line for next one
        pendingRuleLine = 0;

        result.rules.push(rule);

        // For lexer rules, try to extract the pattern
        if (isLexerRule) {
          const patternMatch = ruleContent.match(/:(.+?);/);
          if (patternMatch) {
            result.tokens.push({
              name: ruleName,
              pattern: patternMatch[1].trim(),
              lineNumber: rule.lineNumber,
            });
          }
        }
      }
    }

    // Validate grammar
    result.issues = this.validateGrammar(result);

    return result;
  }

  /**
   * Extract rules referenced within a rule definition
   */
  private static extractReferencedRules(ruleContent: string): string[] {
    const references = new Set<string>();

    // Remove string literals and comments
    const cleaned = ruleContent.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');

    // Match rule references (alphanumeric identifiers)
    const matches = cleaned.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g);

    if (matches) {
      for (const match of matches) {
        // Exclude ANTLR keywords
        if (!this.isAntlrKeyword(match)) {
          references.add(match);
        }
      }
    }

    return Array.from(references);
  }

  /**
   * Check if a word is an ANTLR4 keyword
   */
  private static isAntlrKeyword(word: string): boolean {
    const keywords = new Set([
      'grammar',
      'lexer',
      'parser',
      'import',
      'options',
      'tokens',
      'fragment',
      'returns',
      'throws',
      'locals',
      'catch',
      'finally',
      'EOF',
      'mode',
      'channel',
      'skip',
      'more',
      'type',
      'pushMode',
      'popMode',
    ]);
    return keywords.has(word);
  }

  /**
   * Validate grammar and return issues
   */
  static validateGrammar(grammar: GrammarAnalysis): GrammarIssue[] {
    const issues: GrammarIssue[] = [];

    if (!grammar.grammarName) {
      issues.push({
        type: 'error',
        message: 'Grammar declaration not found (lexer grammar, parser grammar, or grammar)',
      });
    }

    // Check for undefined rule references
    const definedRules = new Set(grammar.rules.map((r) => r.name));
    const referenced = new Set<string>();

    for (const rule of grammar.rules) {
      for (const ref of rule.referencedRules) {
        referenced.add(ref);
        if (!definedRules.has(ref) && !this.isBuiltinRule(ref)) {
          issues.push({
            type: 'warning',
            message: `Reference to undefined rule: ${ref}`,
            lineNumber: rule.lineNumber,
            ruleName: rule.name,
          });
        }
      }
    }

    // Check for unused rules
    for (const rule of grammar.rules) {
      let isUsed = false;
      // Check if used by other rules
      for (const other of grammar.rules) {
        if (other.name !== rule.name && other.referencedRules.includes(rule.name)) {
          isUsed = true;
          break;
        }
      }

      if (!isUsed && !rule.name.startsWith('WS')) {
        issues.push({
          type: 'info',
          message: `Unused rule: ${rule.name}`,
          lineNumber: rule.lineNumber,
          ruleName: rule.name,
        });
      }
    }

    // Check for direct left recursion (rule as first element in alternatives)
    for (const rule of grammar.rules) {
      if (rule.type === 'parser') {
        // Split alternatives by |
        const alternatives = rule.definition.split('|');
        for (const alt of alternatives) {
          // Get the first significant token in the alternative
          const trimmed = alt.trim();
          const firstToken = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/)?.[1];
          if (firstToken === rule.name) {
            issues.push({
              type: 'warning',
              message: `Direct left recursion in rule: ${rule.name}`,
              lineNumber: rule.lineNumber,
              ruleName: rule.name,
            });
            break;
          }
        }
      }
    }

    return issues;
  }

  /**
   * Check if a rule is a built-in ANTLR4 rule
   */
  private static isBuiltinRule(name: string): boolean {
    const builtins = new Set(['EOF', 'ID', 'STRING', 'NUMBER', 'WS']);
    return builtins.has(name);
  }

  /**
   * Validate ANTLR4 syntax
   */
  static validate(grammarContent: string): GrammarIssue[] {
    const analysis = this.analyze(grammarContent);
    return analysis.issues;
  }

  /**
   * Format grammar for display
   */
  static format(grammarContent: string): string {
    const analysis = this.analyze(grammarContent);
    let formatted = '';

    formatted += `Grammar: ${analysis.grammarName} (${analysis.type})\n`;
    formatted += `\nRules (${analysis.rules.length}):\n`;

    for (const rule of analysis.rules) {
      formatted += `  - ${rule.name} (${rule.type})\n`;
    }

    if (analysis.imports.length > 0) {
      formatted += `\nImports:\n`;
      for (const imp of analysis.imports) {
        formatted += `  - ${imp}\n`;
      }
    }

    if (Object.keys(analysis.options).length > 0) {
      formatted += `\nOptions:\n`;
      for (const [key, value] of Object.entries(analysis.options)) {
        formatted += `  - ${key}: ${value}\n`;
      }
    }

    if (analysis.issues.length > 0) {
      formatted += `\nIssues (${analysis.issues.length}):\n`;
      for (const issue of analysis.issues) {
        const location = issue.lineNumber ? ` (line ${issue.lineNumber})` : '';
        formatted += `  - [${issue.type.toUpperCase()}] ${issue.message}${location}\n`;
      }
    }

    return formatted;
  }

  /**
   * Get suggestions for improving a grammar
   */
  static getSuggestions(grammarContent: string): string[] {
    const analysis = this.analyze(grammarContent);
    const suggestions: string[] = [];

    // Check grammar naming
    if (
      analysis.grammarName &&
      analysis.grammarName !==
        analysis.grammarName.charAt(0).toUpperCase() + analysis.grammarName.slice(1)
    ) {
      suggestions.push(
        `Grammar name should use PascalCase: ${analysis.grammarName.charAt(0).toUpperCase() + analysis.grammarName.slice(1)}`
      );
    }

    // Check for too many rules
    if (analysis.rules.length > 100) {
      suggestions.push(
        `Grammar has ${analysis.rules.length} rules - consider breaking it into multiple grammars`
      );
    }

    // Check for rules with too many alternatives
    for (const rule of analysis.rules) {
      const alternativeCount = (rule.definition.match(/\|/g) || []).length + 1;
      if (alternativeCount > 10) {
        suggestions.push(
          `Rule '${rule.name}' has ${alternativeCount} alternatives - consider refactoring`
        );
      }
    }

    // Check for common issues
    if (analysis.issues.length > 5) {
      suggestions.push(`Grammar has ${analysis.issues.length} issues - review and address them`);
    }

    return suggestions;
  }

  /**
   * Find the insertion point for a rule to maintain alphabetical sorting
   * Returns the line index where the rule should be inserted
   */
  private static findSortedInsertionPoint(
    lines: string[],
    newRuleName: string,
    ruleType: 'lexer' | 'parser'
  ): number {
    const isLexerRule = ruleType === 'lexer';
    const rulePattern = isLexerRule ? /^[A-Z_][A-Z0-9_]*\s*:/ : /^[a-z_][a-z0-9_]*\s*:/;

    // Find all rules of the same type with their line numbers
    const rulesOfType: { name: string; startLine: number; endLine: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (rulePattern.test(trimmed)) {
        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*|[a-z_][a-z0-9_]*)\s*:/);
        if (match) {
          const ruleName = match[1];
          // Find the end of this rule (marked by ;)
          let endLine = i;
          for (let j = i; j < lines.length; j++) {
            if (lines[j].includes(';')) {
              endLine = j;
              break;
            }
          }
          rulesOfType.push({ name: ruleName, startLine: i, endLine });
        }
      }
    }

    // If no rules of this type exist, insert at end of file
    if (rulesOfType.length === 0) {
      return lines.length;
    }

    // Sort rules by name to determine insertion position
    rulesOfType.sort((a, b) => a.name.localeCompare(b.name));

    // Find where the new rule should go alphabetically
    for (let i = 0; i < rulesOfType.length; i++) {
      if (newRuleName.localeCompare(rulesOfType[i].name) < 0) {
        // Insert before this rule
        return rulesOfType[i].startLine;
      }
    }

    // Insert after the last rule of this type
    const lastRule = rulesOfType[rulesOfType.length - 1];
    return lastRule.endLine + 1;
  }

  /**
   * Find insertion point relative to a specific rule
   */
  private static findPositionalInsertionPoint(
    lines: string[],
    placement: { after?: string; before?: string }
  ): { index: number; error?: string } {
    const targetRule = placement.after || placement.before;
    if (!targetRule) {
      return { index: -1, error: 'No target rule specified for positional insertion' };
    }

    // Find the target rule
    const rulePattern = /^(fragment\s+)?([A-Z_][A-Z0-9_]*|[a-z_][a-z0-9_]*)\s*:/;

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (rulePattern.test(trimmed)) {
        const match = trimmed.match(rulePattern);
        if (match && match[2] === targetRule) {
          // Found the target rule
          if (placement.before) {
            // Insert before this line
            return { index: i };
          } else {
            // Insert after this rule - find the end (marked by ;)
            for (let j = i; j < lines.length; j++) {
              if (lines[j].includes(';')) {
                return { index: j + 1 };
              }
            }
            return { index: i + 1 };
          }
        }
      }
    }

    return {
      index: -1,
      error: `Target rule '${targetRule}' not found in grammar`,
    };
  }

  /**
   * Add a lexer rule to the grammar (with alphabetical sort or positional insertion)
   */
  static addLexerRule(
    grammarContent: string,
    ruleName: string,
    pattern: string | string[],
    options?: {
      channel?: string;
      skip?: boolean;
      fragment?: boolean;
      insertAfter?: string;
      insertBefore?: string;
    }
  ): { success: boolean; modified: string; message: string } {
    // If pattern is an array, join with newlines
    const pat = Array.isArray(pattern) ? pattern.join('\n') : pattern;
    // Validate rule name (should be uppercase)
    if (!/^[A-Z_][A-Z0-9_]*$/.test(ruleName)) {
      return {
        success: false,
        modified: grammarContent,
        message: `Invalid lexer rule name: '${ruleName}'. Lexer rules must start with uppercase letter.`,
      };
    }

    const analysis = this.analyze(grammarContent);

    // Check if rule already exists
    if (analysis.rules.some((r) => r.name === ruleName)) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${ruleName}' already exists in grammar.`,
      };
    }

    const lines = grammarContent.split('\n');

    // Infer formatting from existing grammar
    const formatting = this.inferFormatting(grammarContent);

    // Determine insertion point
    let insertIndex: number;
    let positionDescription: string;

    if (options?.insertAfter || options?.insertBefore) {
      // Use positional insertion
      const result = this.findPositionalInsertionPoint(lines, {
        after: options.insertAfter,
        before: options.insertBefore,
      });

      if (result.error) {
        return {
          success: false,
          modified: grammarContent,
          message: result.error,
        };
      }

      insertIndex = result.index;
      positionDescription = options.insertAfter
        ? `after '${options.insertAfter}'`
        : `before '${options.insertBefore}'`;
    } else {
      // Use alphabetical sorting (default behavior)
      insertIndex = this.findSortedInsertionPoint(lines, ruleName, 'lexer');
      positionDescription = 'sorted alphabetically';
    }

    // Build the rule with inferred formatting
    const fragmentPrefix = options?.fragment ? 'fragment ' : '';
    const spaceBeforeColon = formatting.spaceAroundColon ? ' ' : '';
    const spaceAfterColon = ' ';

    let ruleDefinition = `${fragmentPrefix}${ruleName}${spaceBeforeColon}:${spaceAfterColon}${pat}`;

    if (options?.skip) {
      ruleDefinition += ' -> skip';
    } else if (options?.channel) {
      ruleDefinition += ` -> channel(${options.channel})`;
    }

    if (formatting.semicolonPlacement === 'new-line') {
      ruleDefinition += '\n;';
    } else {
      ruleDefinition += ';';
    }

    // Insert the rule
    lines.splice(insertIndex, 0, ruleDefinition);
    const modified = lines.join('\n');

    return {
      success: true,
      modified,
      message: `Added lexer rule '${ruleName}' at line ${insertIndex + 1} (${positionDescription}).`,
    };
  }

  /**
   * Add a parser rule to the grammar (with alphabetical sort or positional insertion)
   */
  static addParserRule(
    grammarContent: string,
    ruleName: string,
    definition: string | string[],
    options?: {
      returnType?: string;
      insertAfter?: string;
      insertBefore?: string;
    }
  ): { success: boolean; modified: string; message: string } {
    // If definition is an array, join with newlines
    const def = Array.isArray(definition) ? definition.join('\n') : definition;

    // Validate rule name (should be lowercase)
    if (!/^[a-z_][a-z0-9_]*$/.test(ruleName)) {
      return {
        success: false,
        modified: grammarContent,
        message: `Invalid parser rule name: '${ruleName}'. Parser rules must start with lowercase letter.`,
      };
    }

    const analysis = this.analyze(grammarContent);

    // Check if rule already exists
    if (analysis.rules.some((r) => r.name === ruleName)) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${ruleName}' already exists in grammar.`,
      };
    }

    const lines = grammarContent.split('\n');

    // Infer formatting from existing grammar
    const formatting = this.inferFormatting(grammarContent);

    // Determine insertion point
    let insertIndex: number;
    let positionDescription: string;

    if (options?.insertAfter || options?.insertBefore) {
      // Use positional insertion
      const result = this.findPositionalInsertionPoint(lines, {
        after: options.insertAfter,
        before: options.insertBefore,
      });

      if (result.error) {
        return {
          success: false,
          modified: grammarContent,
          message: result.error,
        };
      }

      insertIndex = result.index;
      positionDescription = options.insertAfter
        ? `after '${options.insertAfter}'`
        : `before '${options.insertBefore}'`;
    } else {
      // Use alphabetical sorting (default behavior)
      insertIndex = this.findSortedInsertionPoint(lines, ruleName, 'parser');
      positionDescription = 'sorted alphabetically';
    }

    // Build the rule with inferred formatting
    const spaceBeforeColon = formatting.spaceAroundColon ? ' ' : '';
    const spaceAfterColon = ' ';

    let ruleDefinition = ruleName;
    if (options?.returnType) {
      ruleDefinition += ` returns [${options.returnType}]`;
    }
    ruleDefinition += `${spaceBeforeColon}:${spaceAfterColon}${def}`;

    if (formatting.semicolonPlacement === 'new-line') {
      ruleDefinition += '\n;';
    } else {
      ruleDefinition += ';';
    }

    // Insert the rule
    lines.splice(insertIndex, 0, ruleDefinition);
    const modified = lines.join('\n');

    return {
      success: true,
      modified,
      message: `Added parser rule '${ruleName}' at line ${insertIndex + 1} (${positionDescription}).`,
    };
  }

  /**
   * Remove a rule from the grammar
   */
  static removeRule(
    grammarContent: string,
    ruleName: string
  ): { success: boolean; modified: string; message: string } {
    const analysis = this.analyze(grammarContent);

    const rule = analysis.rules.find((r) => r.name === ruleName);
    if (!rule) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${ruleName}' not found in grammar.`,
      };
    }

    const lines = grammarContent.split('\n');
    const startLine = rule.lineNumber - 1;

    // Find the end of the rule (marked by ;)
    let endLine = startLine;
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i].includes(';')) {
        endLine = i;
        break;
      }
    }

    // Remove the rule lines and the following blank line if present
    const removeCount = endLine - startLine + 1;
    lines.splice(startLine, removeCount);

    // Remove extra blank line if next line is blank
    if (startLine < lines.length && lines[startLine].trim() === '') {
      lines.splice(startLine, 1);
    }

    const modified = lines.join('\n');

    return {
      success: true,
      modified,
      message: `Removed rule '${ruleName}' (was at lines ${startLine + 1}-${endLine + 1}).`,
    };
  }

  /**
   * Infer formatting style from existing grammar
   */
  static inferFormatting(grammarContent: string): GrammarFormatting {
    const lines = grammarContent.split('\n');

    let colonSameLine = 0;
    let colonNewLine = 0;
    let semicolonSameLine = 0;
    let semicolonNewLine = 0;
    const indentations: string[] = [];
    let hasSpaceBeforeColon = 0;
    let noSpaceBeforeColon = 0;
    let blankLineCount = 0;
    let ruleCount = 0;
    let prevLineHadRuleName = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        prevLineHadRuleName = false;
        continue;
      }

      // Check if this line has a colon (possibly at start, indicating colon on new line)
      if (prevLineHadRuleName && (trimmed === ':' || trimmed.startsWith(':'))) {
        colonNewLine++;
        ruleCount++;
        prevLineHadRuleName = false;

        // Check if semicolon on same line as colon
        if (trimmed.includes(';')) {
          semicolonSameLine++;
        } else {
          // Look ahead for semicolon
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].includes(';')) {
              semicolonNewLine++;
              break;
            }
            if (lines[j].trim().match(/^(?:fragment\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\s*:|$)/)) {
              break; // Hit next rule
            }
          }
        }

        // Check if we had a blank line before the rule name
        if (i > 1 && lines[i - 2].trim() === '') {
          blankLineCount++;
        }
        continue;
      }

      // Detect rule definitions with colon on same line
      const ruleMatch = trimmed.match(/^(?:fragment\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (ruleMatch) {
        ruleCount++;
        colonSameLine++;
        prevLineHadRuleName = false;

        // Check space before colon
        if (trimmed.match(/\s:/)) {
          hasSpaceBeforeColon++;
        } else {
          noSpaceBeforeColon++;
        }

        // Check if semicolon on same line
        if (trimmed.includes(';')) {
          semicolonSameLine++;
        } else {
          // Look ahead for semicolon
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].includes(';')) {
              semicolonNewLine++;
              break;
            }
            if (lines[j].trim().match(/^(?:fragment\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\s*:|$)/)) {
              break; // Hit next rule
            }
          }
        }

        // Check if previous line was blank (spacing between rules)
        if (i > 0 && lines[i - 1].trim() === '') {
          blankLineCount++;
        }
      }
      // Check for rule name without colon (colon expected on next line)
      else if (trimmed.match(/^(?:fragment\s+)?([A-Za-z_][A-Za-z0-9_]*)$/)) {
        prevLineHadRuleName = true;
      } else {
        prevLineHadRuleName = false;
      }

      // Collect indentation patterns
      if (line.length > 0 && (line[0] === ' ' || line[0] === '\t')) {
        const indent = line.match(/^(\s+)/)?.[1];
        if (indent) {
          indentations.push(indent);
        }
      }
    }

    // Determine dominant patterns
    const colonPlacement: 'same-line' | 'new-line' | 'mixed' =
      colonSameLine > colonNewLine
        ? 'same-line'
        : colonNewLine > colonSameLine
          ? 'new-line'
          : 'mixed';

    const semicolonPlacement: 'same-line' | 'new-line' | 'mixed' =
      semicolonSameLine > semicolonNewLine
        ? 'same-line'
        : semicolonNewLine > semicolonSameLine
          ? 'new-line'
          : 'mixed';

    // Determine indentation style
    let indentStyle = '  '; // default: 2 spaces
    let indentSize = 2;

    if (indentations.length > 0) {
      // Find most common indentation
      const indentMap = new Map<string, number>();
      for (const indent of indentations) {
        indentMap.set(indent, (indentMap.get(indent) || 0) + 1);
      }

      let maxCount = 0;
      for (const [indent, count] of indentMap.entries()) {
        if (count > maxCount) {
          maxCount = count;
          indentStyle = indent;
        }
      }

      indentSize = indentStyle.length;
    }

    return {
      colonPlacement,
      semicolonPlacement,
      indentStyle,
      indentSize,
      spaceAroundColon: hasSpaceBeforeColon > noSpaceBeforeColon,
      blankLinesBetweenRules: blankLineCount > ruleCount / 2,
    };
  }

  /**
   * Update an existing rule definition
   */
  /**
   * Update a rule with new definition (supports multi-line)
   */
  static updateRule(
    grammarContent: string,
    ruleName: string,
    newDefinition: string | string[]
  ): { success: boolean; modified: string; message: string } {
    // If newDefinition is an array, join with newlines
    const definition = Array.isArray(newDefinition) ? newDefinition.join('\n') : newDefinition;

    const analysis = this.analyze(grammarContent);

    const rule = analysis.rules.find((r) => r.name === ruleName);
    if (!rule) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${ruleName}' not found in grammar.`,
      };
    }

    const lines = grammarContent.split('\n');

    // Find the actual start of the rule by searching for the rule name with colon
    // Handle both "ruleName :" and "fragment ruleName :" patterns
    let startLine = -1;
    const rulePattern = new RegExp(`^\\s*(?:fragment\\s+)?${ruleName}\\s*:`);

    for (let i = 0; i < lines.length; i++) {
      if (rulePattern.test(lines[i])) {
        startLine = i;
        break;
      }
    }

    // Fallback: search for just the rule name (for cases where colon is on next line)
    if (startLine === -1) {
      const namePattern = new RegExp(`^\\s*(?:fragment\\s+)?${ruleName}\\s*$`);
      for (let i = 0; i < lines.length; i++) {
        if (namePattern.test(lines[i])) {
          startLine = i;
          break;
        }
      }
    }

    if (startLine === -1) {
      return {
        success: false,
        modified: grammarContent,
        message: `Could not locate rule '${ruleName}' in grammar content.`,
      };
    }

    // Find the end of the rule (marked by ;)
    let endLine = startLine;
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i].includes(';')) {
        endLine = i;
        break;
      }
    }

    // Infer formatting from existing grammar
    const formatting = this.inferFormatting(grammarContent);

    // Preserve any leading fragment keyword
    const firstLine = lines[startLine];
    const isFragment = firstLine.trim().startsWith('fragment');
    const leadingWhitespace = firstLine.match(/^\s*/)?.[0] || '';

    // For new-line colon placement, check the actual colon line indentation
    // and check if definition is on separate line from colon
    let colonLineIndent = leadingWhitespace;
    let definitionOnSeparateLine = false;
    let definitionLineIndent = formatting.indentStyle;
    let semicolonLineIndent = leadingWhitespace;

    if (formatting.colonPlacement === 'new-line' && startLine + 1 < lines.length) {
      const colonLine = lines[startLine + 1];
      if (colonLine.trim().startsWith(':')) {
        colonLineIndent = colonLine.match(/^\s*/)?.[0] || '';

        // Check if colon line only contains ":"  (definition on next line)
        if (colonLine.trim() === ':' && startLine + 2 < lines.length) {
          definitionOnSeparateLine = true;
          const defLine = lines[startLine + 2];
          definitionLineIndent = defLine.match(/^\s*/)?.[0] || formatting.indentStyle;
        }
      }
    }

    // Check semicolon line indentation if it's on a separate line
    if (formatting.semicolonPlacement === 'new-line' && endLine > startLine) {
      const semicolonLine = lines[endLine];
      if (semicolonLine.trim() === ';' || semicolonLine.trim().startsWith(';')) {
        semicolonLineIndent = semicolonLine.match(/^\s*/)?.[0] || '';
      }
    }

    // Build new rule according to inferred formatting
    const fragmentPrefix = isFragment ? 'fragment ' : '';
    const spaceBeforeColon = formatting.spaceAroundColon ? ' ' : '';
    const spaceAfterColon = definitionOnSeparateLine ? '' : ' '; // No space if definition on next line
    let newRule: string | string[];

    if (formatting.colonPlacement === 'new-line') {
      if (definitionOnSeparateLine) {
        // Three-line format: name, colon, definition
        newRule = [
          `${leadingWhitespace}${fragmentPrefix}${ruleName}`,
          `${colonLineIndent}:`,
          `${definitionLineIndent}${definition}`,
        ];

        if (formatting.semicolonPlacement === 'new-line') {
          newRule.push(`${semicolonLineIndent};`);
        } else {
          newRule[2] += ';';
        }

        newRule = newRule.join('\n');
      } else {
        // Two-line format: name, colon+definition
        newRule = [
          `${leadingWhitespace}${fragmentPrefix}${ruleName}`,
          `${colonLineIndent}:${spaceAfterColon}${definition}`,
        ];

        if (formatting.semicolonPlacement === 'new-line') {
          newRule.push(`${semicolonLineIndent};`);
        } else {
          newRule[1] += ';';
        }

        newRule = newRule.join('\n');
      }
    } else {
      // Standard: rule name and colon on same line
      if (formatting.semicolonPlacement === 'new-line') {
        newRule = [
          `${leadingWhitespace}${fragmentPrefix}${ruleName}${spaceBeforeColon}: ${definition}`,
          `${semicolonLineIndent};`,
        ].join('\n');
      } else {
        newRule = `${leadingWhitespace}${fragmentPrefix}${ruleName}${spaceBeforeColon}: ${definition};`;
      }
    }

    // Replace the rule
    lines.splice(startLine, endLine - startLine + 1, newRule);

    const modified = lines.join('\n');

    return {
      success: true,
      modified,
      message: `Updated rule '${ruleName}'.`,
    };
  }

  /**
   * Rename a rule and update all references to it
   */
  static renameRule(
    grammarContent: string,
    oldName: string,
    newName: string
  ): { success: boolean; modified: string; message: string; refCount: number } {
    const analysis = this.analyze(grammarContent);

    // Validate new name
    const isLexer = /^[A-Z_]/.test(oldName);
    const namePattern = isLexer ? /^[A-Z_][A-Z0-9_]*$/ : /^[a-z_][a-z0-9_]*$/;
    if (!namePattern.test(newName)) {
      return {
        success: false,
        modified: grammarContent,
        message: `Invalid new rule name: '${newName}'.`,
        refCount: 0,
      };
    }

    // Check if old rule exists
    const rule = analysis.rules.find((r) => r.name === oldName);
    if (!rule) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${oldName}' not found in grammar.`,
        refCount: 0,
      };
    }

    // Check if new name already exists
    if (analysis.rules.some((r) => r.name === newName)) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${newName}' already exists in grammar.`,
        refCount: 0,
      };
    }

    // Replace old name with new name (whole word match)
    let modified = grammarContent;
    const regex = new RegExp(`\\b${oldName}\\b`, 'g');
    const refCount = (grammarContent.match(regex) || []).length - 1; // -1 for the rule definition itself
    modified = modified.replace(regex, newName);

    return {
      success: true,
      modified,
      message: `Renamed rule '${oldName}' to '${newName}' (${refCount} references updated).`,
      refCount,
    };
  }

  /**
   * Rename a rule across multiple grammar files (main + imports)
   */
  static renameRuleMultiFile(
    filePath: string,
    oldName: string,
    newName: string,
    basePath?: string
  ): {
    success: boolean;
    modifiedFiles: Array<{ filePath: string; content: string; refCount: number }>;
    message: string;
    totalRefCount: number;
  } {
    const normalizedPath = path.resolve(filePath);
    const cache = new Map<string, GrammarAnalysis>();
    const visited = new Set<string>();

    // Load main grammar
    const mainAnalysis = this.loadGrammarWithImports(normalizedPath, basePath, cache, visited);

    // Validate new name
    const isLexer = /^[A-Z_]/.test(oldName);
    const namePattern = isLexer ? /^[A-Z_][A-Z0-9_]*$/ : /^[a-z_][a-z0-9_]*$/;
    if (!namePattern.test(newName)) {
      return {
        success: false,
        modifiedFiles: [],
        message: `Invalid new rule name: '${newName}'.`,
        totalRefCount: 0,
      };
    }

    // Check if old rule exists in any file
    let ruleDefFile: string | null = null;
    for (const [filePath, analysis] of cache) {
      if (analysis.rules.some((r) => r.name === oldName)) {
        ruleDefFile = filePath;
        break;
      }
    }

    if (!ruleDefFile) {
      return {
        success: false,
        modifiedFiles: [],
        message: `Rule '${oldName}' not found in any grammar file.`,
        totalRefCount: 0,
      };
    }

    // Check if new name already exists in any file
    for (const [, analysis] of cache) {
      if (analysis.rules.some((r) => r.name === newName)) {
        return {
          success: false,
          modifiedFiles: [],
          message: `Rule '${newName}' already exists in grammar files.`,
          totalRefCount: 0,
        };
      }
    }

    const modifiedFiles: Array<{ filePath: string; content: string; refCount: number }> = [];
    let totalRefCount = 0;

    // Escape special regex characters to prevent ReDoS or unexpected behavior
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedOldName = escapeRegExp(oldName);

    // Process each file
    for (const filePath of cache.keys()) {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Check if this file contains the rule (as definition or reference)
      const regex = new RegExp(`\\b${escapedOldName}\\b`, 'g');
      const matches = content.match(regex);

      if (!matches || matches.length === 0) {
        continue; // Skip files that don't contain this rule
      }

      // Perform replacement in this file
      const modified = content.replace(regex, newName);
      const refCount = matches.length - (filePath === ruleDefFile ? 1 : 0); // -1 for definition
      totalRefCount += matches.length;

      modifiedFiles.push({
        filePath,
        content: modified,
        refCount: matches.length,
      });
    }

    return {
      success: true,
      modifiedFiles,
      message: `Renamed rule '${oldName}' to '${newName}' in ${modifiedFiles.length} file(s) (${totalRefCount} occurrences updated).`,
      totalRefCount,
    };
  }

  /**
   * Find all usages of a specific rule
   */
  static findRuleUsages(
    grammarContent: string,
    ruleName: string
  ): { locations: Array<{ lineNumber: number; context: string; inRule?: string }>; count: number } {
    const lines = grammarContent.split('\n');
    const locations: Array<{ lineNumber: number; context: string; inRule?: string }> = [];

    // Parse to get rule structure for better context
    const analysis = this.analyze(grammarContent);
    const ruleMap = new Map<number, string>();

    // Build map of line number to rule name (for context)
    // Count actual lines in the definition string
    for (const rule of analysis.rules) {
      const defLines = rule.definition.split('\n');
      for (let i = 0; i < defLines.length; i++) {
        ruleMap.set(rule.lineNumber + i, rule.name);
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Skip comments
      if (line.trim().startsWith('//')) continue;

      // Match whole word only
      if (new RegExp(`\\b${ruleName}\\b`).test(line)) {
        const inRule = ruleMap.get(lineNum);

        // Skip if this is the rule definition line itself
        if (inRule === ruleName && line.match(new RegExp(`^\\s*${ruleName}\\s*:`))) {
          continue;
        }

        locations.push({
          lineNumber: lineNum,
          context: line.trim(),
          inRule,
        });
      }
    }

    return {
      locations,
      count: locations.length,
    };
  }

  /**
   * Find rules matching a regex pattern
   */
  /**
   * Find rules by pattern with multiple matching modes
   */
  static findRules(
    grammarContent: string,
    pattern: string,
    mode: 'exact' | 'regex' | 'wildcard' | 'partial' = 'exact'
  ): {
    matches: GrammarRule[];
    count: number;
    error?: string;
  } {
    try {
      const analysis = this.analyze(grammarContent);
      let matches: GrammarRule[] = [];

      switch (mode) {
        case 'exact':
          // Exact match
          matches = analysis.rules.filter((r) => r.name === pattern);
          break;

        case 'regex':
          // Regular expression matching
          const regex = new RegExp(pattern);
          matches = analysis.rules.filter((r) => regex.test(r.name));
          break;

        case 'wildcard':
          // Wildcard matching: * matches any characters, ? matches single character
          const wildcardRegex = new RegExp(
            '^' +
              pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars except * and ?
                .replace(/\*/g, '.*') // * -> .*
                .replace(/\?/g, '.') + // ? -> .
              '$'
          );
          matches = analysis.rules.filter((r) => wildcardRegex.test(r.name));
          break;

        case 'partial':
          // Substring/partial matching (case-insensitive)
          const lowerPattern = pattern.toLowerCase();
          matches = analysis.rules.filter((r) => r.name.toLowerCase().includes(lowerPattern));
          break;

        default:
          return {
            matches: [],
            count: 0,
            error: `Unknown match mode: ${mode}`,
          };
      }

      return {
        matches,
        count: matches.length,
      };
    } catch (error) {
      return {
        matches: [],
        count: 0,
        error: `Pattern matching error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Find rules by regex pattern (legacy method - now uses findRules)
   * @deprecated Use findRules with mode='regex' instead
   */
  static findRulesByRegex(
    grammarContent: string,
    pattern: string
  ): {
    matches: GrammarRule[];
    count: number;
    error?: string;
  } {
    return this.findRules(grammarContent, pattern, 'regex');
  }

  /**
   * Get statistics about a rule
   */
  static getRuleStatistics(
    grammarContent: string,
    ruleName: string
  ): {
    name: string;
    type: string;
    definition: string;
    fanOut: number;
    fanIn: number;
    complexity: number;
    isRecursive: boolean;
  } | null {
    const analysis = this.analyze(grammarContent);
    const rule = analysis.rules.find((r) => r.name === ruleName);

    if (!rule) {
      return null;
    }

    // Fan-out: how many rules this rule references
    const fanOut = rule.referencedRules.length;

    // Fan-in: how many rules reference this rule
    const fanIn = analysis.rules.filter((r) => r.referencedRules.includes(ruleName)).length;

    // Complexity: number of alternatives
    const complexity = (rule.definition.match(/\|/g) || []).length + 1;

    // Check if recursive
    const isRecursive = rule.referencedRules.includes(ruleName);

    return {
      name: ruleName,
      type: rule.type,
      definition: rule.definition,
      fanOut,
      fanIn,
      complexity,
      isRecursive,
    };
  }

  /**
   * Extract a fragment from a pattern
   */
  static extractFragment(
    grammarContent: string,
    fragmentName: string,
    pattern: string
  ): { success: boolean; modified: string; message: string } {
    // Validate fragment name
    if (!/^[A-Z_][A-Z0-9_]*$/.test(fragmentName)) {
      return {
        success: false,
        modified: grammarContent,
        message: `Invalid fragment name: '${fragmentName}'. Must be uppercase.`,
      };
    }

    const analysis = this.analyze(grammarContent);

    // Check if fragment already exists
    if (analysis.rules.some((r) => r.name === fragmentName)) {
      return {
        success: false,
        modified: grammarContent,
        message: `Fragment '${fragmentName}' already exists.`,
      };
    }

    const lines = grammarContent.split('\n');

    // Find insertion point for fragment (before other lexer rules, or at end)
    let insertIndex = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('fragment') || /^[A-Z_][A-Z0-9_]*\s*:/.test(trimmed)) {
        insertIndex = i + 1;
        break;
      }
    }

    // Build fragment definition
    const fragmentDef = `fragment ${fragmentName} : ${pattern};`;
    lines.splice(insertIndex, 0, fragmentDef);

    return {
      success: true,
      modified: lines.join('\n'),
      message: `Created fragment '${fragmentName}' with pattern: ${pattern}`,
    };
  }

  /**
   * Export grammar as Markdown documentation
   */
  static exportAsMarkdown(grammarContent: string): string {
    const analysis = this.analyze(grammarContent);
    let markdown = `# Grammar: ${analysis.grammarName}\n\n`;

    markdown += `**Type**: ${analysis.type}\n\n`;

    if (analysis.imports.length > 0) {
      markdown += `## Imports\n\n`;
      for (const imp of analysis.imports) {
        markdown += `- \`${imp}\`\n`;
      }
      markdown += '\n';
    }

    if (Object.keys(analysis.options).length > 0) {
      markdown += `## Options\n\n`;
      markdown += '```\n';
      for (const [key, value] of Object.entries(analysis.options)) {
        markdown += `${key} = ${value};\n`;
      }
      markdown += '```\n\n';
    }

    // Parser rules
    const parserRules = analysis.rules.filter((r) => r.type === 'parser');
    if (parserRules.length > 0) {
      markdown += `## Parser Rules\n\n`;
      for (const rule of parserRules) {
        markdown += `### \`${rule.name}\`\n\n`;
        markdown += `**Definition**:\n\`\`\`antlr\n${rule.definition}\n\`\`\`\n\n`;

        if (rule.referencedRules.length > 0) {
          markdown += `**References**: ${rule.referencedRules.map((r) => `\`${r}\``).join(', ')}\n\n`;
        }
      }
    }

    // Lexer rules
    const lexerRules = analysis.rules.filter((r) => r.type === 'lexer');
    if (lexerRules.length > 0) {
      markdown += `## Lexer Rules\n\n`;
      for (const rule of lexerRules) {
        markdown += `### \`${rule.name}\`\n\n`;
        markdown += `**Pattern**:\n\`\`\`\n${rule.definition}\n\`\`\`\n\n`;
      }
    }

    if (analysis.issues.length > 0) {
      markdown += `## Issues\n\n`;
      for (const issue of analysis.issues) {
        const line = issue.lineNumber ? ` (line ${issue.lineNumber})` : '';
        markdown += `- **[${issue.type.toUpperCase()}]** ${issue.message}${line}\n`;
      }
      markdown += '\n';
    }

    return markdown;
  }

  /**
   * Merge two rules into one with alternatives
   */
  static mergeRules(
    grammarContent: string,
    rule1Name: string,
    rule2Name: string,
    newRuleName: string
  ): { success: boolean; modified: string; message: string } {
    const analysis = this.analyze(grammarContent);

    const rule1 = analysis.rules.find((r) => r.name === rule1Name);
    const rule2 = analysis.rules.find((r) => r.name === rule2Name);

    if (!rule1 || !rule2) {
      return {
        success: false,
        modified: grammarContent,
        message: `One or both rules not found (${rule1Name}, ${rule2Name}).`,
      };
    }

    if (rule1.type !== rule2.type) {
      return {
        success: false,
        modified: grammarContent,
        message: `Cannot merge rules of different types (${rule1.type} vs ${rule2.type}).`,
      };
    }

    if (analysis.rules.some((r) => r.name === newRuleName)) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${newRuleName}' already exists.`,
      };
    }

    const lines = grammarContent.split('\n');

    // Extract rule bodies (without "ruleName :")
    const body1 = rule1.definition.replace(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*/, '').replace(/;$/, '');
    const body2 = rule2.definition.replace(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*/, '').replace(/;$/, '');

    // Create merged rule
    const mergedDef = `${newRuleName} : (${body1}) | (${body2});`;

    // Find removal and insertion points
    const startLines = [rule1.lineNumber - 1, rule2.lineNumber - 1].sort();
    const startLine = startLines[0];

    // Find end of both rules
    let endLine = startLine;
    let rulesToRemove = 0;
    for (let i = startLine; i < lines.length && rulesToRemove < 2; i++) {
      if (lines[i].includes(';')) {
        endLine = i;
        rulesToRemove++;
        if (rulesToRemove < 2) {
          for (let j = i + 1; j < lines.length; j++) {
            if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(lines[j].trim())) {
              i = j - 1;
              break;
            }
          }
        }
      }
    }

    // Remove old rules and insert merged rule
    lines.splice(startLine, endLine - startLine + 1, mergedDef);

    return {
      success: true,
      modified: lines.join('\n'),
      message: `Merged '${rule1Name}' and '${rule2Name}' into '${newRuleName}'.`,
    };
  }

  /**
   * Generate a summary of grammar structure
   */
  static generateSummary(grammarContent: string): string {
    const analysis = this.analyze(grammarContent);
    let summary = '';

    summary += `Grammar Summary: ${analysis.grammarName}\n`;
    summary += `${'='.repeat(50)}\n\n`;

    summary += `Type: ${analysis.type}\n`;
    summary += `Total Rules: ${analysis.rules.length}\n`;
    summary += `  - Parser Rules: ${analysis.rules.filter((r) => r.type === 'parser').length}\n`;
    summary += `  - Lexer Rules: ${analysis.rules.filter((r) => r.type === 'lexer').length}\n\n`;

    if (analysis.imports.length > 0) {
      summary += `Imports: ${analysis.imports.join(', ')}\n\n`;
    }

    // Top referenced rules
    const ruleDeps = analysis.rules
      .map((r) => ({
        name: r.name,
        refCount: analysis.rules.filter((other) => other.referencedRules.includes(r.name)).length,
      }))
      .sort((a, b) => b.refCount - a.refCount)
      .slice(0, 5);

    if (ruleDeps.some((r) => r.refCount > 0)) {
      summary += `Most Referenced Rules:\n`;
      for (const dep of ruleDeps.filter((r) => r.refCount > 0)) {
        summary += `  - ${dep.name}: ${dep.refCount} references\n`;
      }
      summary += '\n';
    }

    if (analysis.issues.length > 0) {
      summary += `Issues: ${analysis.issues.length}\n`;
      const errors = analysis.issues.filter((i) => i.type === 'error').length;
      const warnings = analysis.issues.filter((i) => i.type === 'warning').length;
      const infos = analysis.issues.filter((i) => i.type === 'info').length;
      summary += `  - Errors: ${errors}\n`;
      summary += `  - Warnings: ${warnings}\n`;
      summary += `  - Info: ${infos}\n\n`;
    }

    return summary;
  }

  /**
   * Add multiple lexer rules in bulk
   */
  static addLexerRules(
    grammarContent: string,
    rules: Array<{
      name: string;
      pattern: string;
      options?: { channel?: string; skip?: boolean; fragment?: boolean };
    }>
  ): {
    success: boolean;
    modified: string;
    results: Array<{ name: string; success: boolean; message: string }>;
    summary: string;
  } {
    let current = grammarContent;
    const results: Array<{ name: string; success: boolean; message: string }> = [];
    let successCount = 0;
    let failCount = 0;

    // Add rules one by one, updating the grammar after each successful addition
    for (const rule of rules) {
      const result = this.addLexerRule(current, rule.name, rule.pattern, rule.options);
      results.push({
        name: rule.name,
        success: result.success,
        message: result.message,
      });

      if (result.success) {
        current = result.modified;
        successCount++;
      } else {
        failCount++;
      }
    }

    const summary = `Added ${successCount} lexer rule(s), ${failCount} failed.`;

    return {
      success: failCount === 0,
      modified: current,
      results,
      summary,
    };
  }

  /**
   * Add multiple parser rules in bulk
   */
  static addParserRules(
    grammarContent: string,
    rules: Array<{
      name: string;
      definition: string;
      options?: { returnType?: string };
    }>
  ): {
    success: boolean;
    modified: string;
    results: Array<{ name: string; success: boolean; message: string }>;
    summary: string;
  } {
    let current = grammarContent;
    const results: Array<{ name: string; success: boolean; message: string }> = [];
    let successCount = 0;
    let failCount = 0;

    // Add rules one by one, updating the grammar after each successful addition
    for (const rule of rules) {
      const result = this.addParserRule(current, rule.name, rule.definition, rule.options);
      results.push({
        name: rule.name,
        success: result.success,
        message: result.message,
      });

      if (result.success) {
        current = result.modified;
        successCount++;
      } else {
        failCount++;
      }
    }

    const summary = `Added ${successCount} parser rule(s), ${failCount} failed.`;

    return {
      success: failCount === 0,
      modified: current,
      results,
      summary,
    };
  }

  /**
   * Add multiple rules (mixed parser and lexer) in bulk
   */
  static addRules(
    grammarContent: string,
    rules: Array<{
      type: 'parser' | 'lexer';
      name: string;
      pattern?: string;
      definition?: string;
      options?: any;
    }>
  ): {
    success: boolean;
    modified: string;
    results: Array<{ name: string; type: string; success: boolean; message: string }>;
    summary: string;
  } {
    let current = grammarContent;
    const results: Array<{ name: string; type: string; success: boolean; message: string }> = [];
    let successCount = 0;
    let failCount = 0;

    // Add rules one by one
    for (const rule of rules) {
      let result: any;
      if (rule.type === 'lexer') {
        result = this.addLexerRule(current, rule.name, rule.pattern || '', rule.options);
      } else {
        result = this.addParserRule(current, rule.name, rule.definition || '', rule.options);
      }

      results.push({
        name: rule.name,
        type: rule.type,
        success: result.success,
        message: result.message,
      });

      if (result.success) {
        current = result.modified;
        successCount++;
      } else {
        failCount++;
      }
    }

    const summary = `Added ${successCount} rule(s), ${failCount} failed.`;

    return {
      success: failCount === 0,
      modified: current,
      results,
      summary,
    };
  }

  /**
   * Preview how input text would be tokenized by lexer rules
   */
  /**
   * Detect unsupported features in grammar
   */
  private static detectUnsupportedFeatures(grammarContent: string): {
    hasLexerModes: boolean;
    hasSemanticPredicates: boolean;
    hasActions: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let hasLexerModes = false;
    let hasSemanticPredicates = false;
    let hasActions = false;

    // Check for lexer modes
    if (/\b(mode|pushMode|popMode)\b/.test(grammarContent)) {
      hasLexerModes = true;
      warnings.push(
        '⚠️  Grammar uses lexer modes (mode/pushMode/popMode) - these are not fully supported'
      );
    }

    // Check for semantic predicates
    if (/\{[^}]*\?[^}]*\}/.test(grammarContent)) {
      hasSemanticPredicates = true;
      warnings.push('⚠️  Grammar uses semantic predicates {...?} - these cannot be evaluated');
    }

    // Check for actions
    if (/\{[^}?]*\}/.test(grammarContent) && !hasSemanticPredicates) {
      hasActions = true;
      warnings.push('⚠️  Grammar uses actions {...} - these cannot be executed');
    }

    return { hasLexerModes, hasSemanticPredicates, hasActions, warnings };
  }

  static previewTokens(
    grammarContent: string,
    input: string,
    options?: {
      showPositions?: boolean;
      rulesToTest?: string[];
    }
  ): {
    success: boolean;
    tokens: TokenInfo[];
    summary: string;
    errors: Array<{ position: number; char: string; message: string }>;
    warnings: string[];
  } {
    const analysis = this.analyze(grammarContent);
    const tokens: TokenInfo[] = [];
    const errors: Array<{ position: number; char: string; message: string }> = [];
    const warnings: string[] = [];

    // Detect unsupported features and add warnings
    const featureCheck = this.detectUnsupportedFeatures(grammarContent);
    warnings.push(...featureCheck.warnings);

    // Add recommendation if complex features detected
    if (featureCheck.hasLexerModes || featureCheck.hasSemanticPredicates) {
      warnings.push(
        '💡 Consider using test-parser-rule instead for testing parser rules (works without full lexer simulation)'
      );
    }

    // Extract lexer rules (exclude fragments as they're not tokens)
    const lexerRules = analysis.rules.filter((r) => r.type === 'lexer');

    // Filter rules if specified
    let rulesToUse = lexerRules;
    if (options?.rulesToTest && options.rulesToTest.length > 0) {
      rulesToUse = lexerRules.filter((r) => options.rulesToTest!.includes(r.name));
      const missing = options.rulesToTest.filter(
        (name) => !lexerRules.find((r) => r.name === name)
      );
      if (missing.length > 0) {
        warnings.push(`Rules not found: ${missing.join(', ')}`);
      }
    }

    // Parse rules to extract patterns and determine skip/channel
    const rulePatterns: Array<{
      name: string;
      pattern: RegExp | null;
      skip: boolean;
      channel?: string;
      rawPattern: string;
    }> = [];

    // First, collect all explicit lexer token patterns
    const explicitTokenPatterns = new Set<string>();
    for (const rule of rulesToUse) {
      const def = rule.definition.trim();
      let patternStr = def;
      patternStr = patternStr.replace(/^fragment\s+/, '');
      const colonIndex = patternStr.indexOf(':');
      if (colonIndex >= 0) {
        patternStr = patternStr.substring(colonIndex + 1);
      }
      patternStr = patternStr.split('->')[0].trim();
      patternStr = patternStr.replace(/;$/, '').trim();

      // Extract string literals from this token rule
      const literalMatches = patternStr.match(/'([^']+)'/g);
      if (literalMatches) {
        for (const match of literalMatches) {
          explicitTokenPatterns.add(match.slice(1, -1));
        }
      }
    }

    // Extract string literals from parser rules as implicit tokens
    // but ONLY if they don't have an explicit lexer rule
    const implicitTokens = new Set<string>();
    for (const rule of analysis.rules) {
      if (rule.type === 'parser') {
        const literalMatches = rule.definition.match(/'([^']+)'/g);
        if (literalMatches) {
          for (const match of literalMatches) {
            const literal = match.slice(1, -1);
            // Only add if not already covered by explicit token
            if (!explicitTokenPatterns.has(literal)) {
              implicitTokens.add(literal);
            }
          }
        }
      }
    }

    // Add implicit tokens as high-priority rules (before explicit rules)
    for (const literal of implicitTokens) {
      const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      rulePatterns.push({
        name: `'${literal}'`,
        pattern: new RegExp('^(?:' + escaped + ')'),
        skip: false,
        rawPattern: literal,
      });
    }

    for (const rule of rulesToUse) {
      const def = rule.definition.trim();

      // Check for skip directive
      const skip = def.includes('-> skip');

      // Check for channel directive
      let channel: string | undefined;
      const channelMatch = def.match(/-> channel\(([^)]+)\)/);
      if (channelMatch) {
        channel = channelMatch[1];
      }

      // Extract the pattern from "RULENAME : pattern ;" format
      // Remove the rule name and colon at the start
      let patternStr = def;

      // Remove "fragment" keyword if present
      patternStr = patternStr.replace(/^fragment\s+/, '');

      // Extract pattern between : and either -> or ;
      const colonIndex = patternStr.indexOf(':');
      if (colonIndex >= 0) {
        patternStr = patternStr.substring(colonIndex + 1);
      }

      // Remove everything after -> (skip/channel directives)
      patternStr = patternStr.split('->')[0].trim();

      // Remove trailing semicolon
      patternStr = patternStr.replace(/;$/, '').trim();

      try {
        // Convert ANTLR4 pattern to JavaScript regex
        const jsPattern = this.convertANTLRPatternToRegex(patternStr);

        // Anchor to start of string for matching
        const regex = new RegExp('^(?:' + jsPattern + ')', 's');

        rulePatterns.push({
          name: rule.name,
          pattern: regex,
          skip,
          channel,
          rawPattern: patternStr,
        });
      } catch {
        warnings.push(`Could not convert pattern for rule '${rule.name}': ${patternStr}`);
        rulePatterns.push({
          name: rule.name,
          pattern: null,
          skip,
          channel,
          rawPattern: patternStr,
        });
      }
    }

    // Tokenize the input
    let position = 0;
    let line = 1;
    let column = 0;

    while (position < input.length) {
      let matched = false;
      let longestMatch: { length: number; rule: (typeof rulePatterns)[0] } | null = null;

      // Try all rules and find longest match (maximal munch)
      for (const rule of rulePatterns) {
        if (!rule.pattern) continue;

        const remaining = input.substring(position);
        const match = remaining.match(rule.pattern);

        if (match && match[0].length > 0) {
          if (!longestMatch || match[0].length > longestMatch.length) {
            longestMatch = { length: match[0].length, rule };
          }
        }
      }

      if (longestMatch) {
        const value = input.substring(position, position + longestMatch.length);

        tokens.push({
          type: longestMatch.rule.name,
          value,
          start: position,
          end: position + longestMatch.length - 1,
          line,
          column,
          skipped: longestMatch.rule.skip,
          channel: longestMatch.rule.channel,
        });

        // Update line and column
        for (let i = 0; i < value.length; i++) {
          if (value[i] === '\n') {
            line++;
            column = 0;
          } else {
            column++;
          }
        }

        position += longestMatch.length;
        matched = true;
      }

      if (!matched) {
        // No rule matched - record error
        const char = input[position];
        errors.push({
          position,
          char: char === '\n' ? '\\n' : char,
          message: `Unexpected character '${char === '\n' ? '\\n' : char}' at position ${position}`,
        });

        // Skip the character and continue
        if (char === '\n') {
          line++;
          column = 0;
        } else {
          column++;
        }
        position++;
      }
    }

    // Generate summary
    const totalTokens = tokens.length;
    const skippedTokens = tokens.filter((t) => t.skipped).length;
    const channelTokens = tokens.filter((t) => t.channel).length;

    let summary = '';
    if (errors.length === 0) {
      summary = `✓ Successfully tokenized input: ${totalTokens} token(s)`;
      if (skippedTokens > 0) {
        summary += ` (${skippedTokens} skipped)`;
      }
      if (channelTokens > 0) {
        summary += ` (${channelTokens} on channels)`;
      }
    } else {
      summary = `✗ Tokenization failed: ${errors.length} error(s), ${totalTokens} token(s) recognized`;
    }

    return {
      success: errors.length === 0,
      tokens,
      summary,
      errors,
      warnings,
    };
  }

  /**
   * Convert ANTLR4 pattern syntax to JavaScript regex
   * Handles string literals, character classes, sequences, and basic modifiers
   */
  private static convertANTLRPatternToRegex(pattern: string): string {
    let result = '';
    let i = 0;

    while (i < pattern.length) {
      const char = pattern[i];

      // String literal: 'text'
      if (char === "'") {
        i++; // Skip opening quote
        let literal = '';
        while (i < pattern.length && pattern[i] !== "'") {
          if (pattern[i] === '\\' && i + 1 < pattern.length) {
            // Handle escape sequences
            i++;
            const escChar = pattern[i];
            switch (escChar) {
              case 'n':
                literal += '\\n';
                break;
              case 'r':
                literal += '\\r';
                break;
              case 't':
                literal += '\\t';
                break;
              case '\\':
                literal += '\\\\';
                break;
              case "'":
                literal += "'";
                break;
              default:
                literal += escChar;
            }
          } else {
            // Escape regex special characters for literals
            const c = pattern[i];
            if (/[.*+?^${}()|[\]\\]/.test(c)) {
              literal += '\\' + c;
            } else {
              literal += c;
            }
          }
          i++;
        }
        i++; // Skip closing quote
        result += literal;

        // Character class: [a-z]
      } else if (char === '[') {
        let charClass = '[';
        i++;
        while (i < pattern.length && pattern[i] !== ']') {
          charClass += pattern[i];
          i++;
        }
        charClass += ']';
        i++;
        result += charClass;

        // Parentheses and operators - pass through
      } else if ('()|?*+'.indexOf(char) >= 0) {
        result += char;
        i++;

        // Tilde (negation): ~'x' or ~[abc]
      } else if (char === '~') {
        // ANTLR uses ~ for negation, regex uses [^...]
        i++; // Skip ~
        // Skip whitespace
        while (i < pattern.length && /\s/.test(pattern[i])) {
          i++;
        }

        if (i < pattern.length && pattern[i] === '[') {
          // ~[abc] -> [^abc]
          result += '[^';
          i++; // Skip [
          while (i < pattern.length && pattern[i] !== ']') {
            result += pattern[i];
            i++;
          }
          result += ']';
          i++; // Skip ]
        } else if (i < pattern.length && pattern[i] === "'") {
          // ~'x' -> [^x]
          i++; // Skip '
          result += '[^';
          while (i < pattern.length && pattern[i] !== "'") {
            result += pattern[i];
            i++;
          }
          result += ']';
          i++; // Skip '
        }

        // Whitespace - skip
      } else if (/\s/.test(char)) {
        i++;

        // Fragment reference or other - keep as-is (may fail, but try)
      } else {
        result += char;
        i++;
      }
    }

    return result;
  }

  /**
   * Add multiple lexer tokens using template-based generation
   * Example: Add 5 tokens for "config X" patterns
   */
  static addTokensWithTemplate(
    grammarContent: string,
    template: {
      baseNames: string[]; // e.g., ["FTM_PUSH", "DNS", "FIREWALL"]
      precedingTokens?: string[]; // e.g., ["SYSTEM", "CONFIG"]
      pattern?: string; // Optional custom pattern
      options?: { channel?: string; skip?: boolean; fragment?: boolean };
    }
  ): {
    success: boolean;
    modified: string;
    results: Array<{ name: string; success: boolean; message: string }>;
    summary: string;
  } {
    const rules: Array<{
      name: string;
      pattern: string;
      options?: { channel?: string; skip?: boolean; fragment?: boolean };
    }> = [];

    // Generate rules for each base name
    for (const baseName of template.baseNames) {
      const ruleName = baseName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

      // Generate pattern
      let pattern: string;
      if (template.pattern) {
        // Use custom pattern, replacing {NAME} placeholder
        pattern = template.pattern.replace(/{NAME}/g, baseName);
      } else {
        // Default: string literal pattern
        const namePattern = baseName.toLowerCase().replace(/_/g, '-');
        pattern = `'${namePattern}'`;
      }

      rules.push({
        name: ruleName,
        pattern,
        options: template.options,
      });
    }

    // Use existing bulk add functionality
    return this.addLexerRules(grammarContent, rules);
  }

  /**
   * Generate lexer rule from natural language pattern
   * Example: "ignore config system ftm-push" → generates IGNORE, CONFIG, SYSTEM, FTM_PUSH tokens
   */
  static generateTokensFromPattern(
    grammarContent: string,
    inputPattern: string,
    options?: {
      tokenize?: boolean; // Split input into individual tokens (default: true)
      prefix?: string; // Optional prefix for token names
      options?: { channel?: string; skip?: boolean; fragment?: boolean };
    }
  ): {
    success: boolean;
    modified: string;
    generated: Array<{ name: string; pattern: string }>;
    results: Array<{ name: string; success: boolean; message: string }>;
    summary: string;
  } {
    const tokenize = options?.tokenize !== false;
    const generatedTokens: Array<{ name: string; pattern: string }> = [];

    if (tokenize) {
      // Split input into words and generate individual token rules
      const words = inputPattern.trim().split(/\s+/);

      for (const word of words) {
        // Convert to uppercase with underscores for rule name
        let ruleName = word.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        if (options?.prefix) {
          ruleName = `${options.prefix.toUpperCase()}_${ruleName}`;
        }

        // Generate pattern (use the original word as lowercase literal)
        const pattern = `'${word.toLowerCase()}'`;

        generatedTokens.push({ name: ruleName, pattern });
      }
    } else {
      // Treat entire input as single token
      let ruleName = inputPattern.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      if (options?.prefix) {
        ruleName = `${options.prefix.toUpperCase()}_${ruleName}`;
      }

      const pattern = `'${inputPattern.toLowerCase()}'`;
      generatedTokens.push({ name: ruleName, pattern });
    }

    // Add all generated tokens
    const rules = generatedTokens.map((t) => ({
      name: t.name,
      pattern: t.pattern,
      options: options?.options,
    }));

    const result = this.addLexerRules(grammarContent, rules);

    return {
      success: result.success,
      modified: result.modified,
      generated: generatedTokens,
      results: result.results,
      summary: result.summary,
    };
  }

  /**
   * Parse error logs and suggest tokens to add
   * Supports Batfish error log format and generic ANTLR parse errors
   */
  static suggestTokensFromErrors(
    grammarContent: string,
    errorLog: string
  ): {
    suggestions: Array<{
      token: string;
      pattern: string;
      reason: string;
      confidence: 'high' | 'medium' | 'low';
    }>;
    summary: string;
  } {
    const suggestions: Array<{
      token: string;
      pattern: string;
      reason: string;
      confidence: 'high' | 'medium' | 'low';
    }> = [];

    const lines = errorLog.split('\n');
    const existingRules = this.analyze(grammarContent).rules.map((r) => r.name);

    for (const line of lines) {
      // Pattern 1: Batfish-style errors - "unexpected token: 'word'"
      const batfishMatch = line.match(/unexpected token[:\s]+['"]([^'"]+)['"]/i);
      if (batfishMatch) {
        const word = batfishMatch[1];
        const tokenName = word.toUpperCase().replace(/[^A-Z0-9]/g, '_');

        if (!existingRules.includes(tokenName)) {
          suggestions.push({
            token: tokenName,
            pattern: `'${word.toLowerCase()}'`,
            reason: `Unexpected token '${word}' found in error log`,
            confidence: 'high',
          });
        }
        continue;
      }

      // Pattern 2: ANTLR-style errors - "mismatched input 'word'"
      const antlrMatch = line.match(/mismatched input ['"]([^'"]+)['"]/i);
      if (antlrMatch) {
        const word = antlrMatch[1];
        const tokenName = word.toUpperCase().replace(/[^A-Z0-9]/g, '_');

        if (!existingRules.includes(tokenName)) {
          suggestions.push({
            token: tokenName,
            pattern: `'${word.toLowerCase()}'`,
            reason: `Mismatched input '${word}' in error log`,
            confidence: 'high',
          });
        }
        continue;
      }

      // Pattern 3: "no viable alternative at input 'word'"
      const noViableMatch = line.match(/no viable alternative at input ['"]([^'"]+)['"]/i);
      if (noViableMatch) {
        const word = noViableMatch[1];
        const tokenName = word.toUpperCase().replace(/[^A-Z0-9]/g, '_');

        if (!existingRules.includes(tokenName)) {
          suggestions.push({
            token: tokenName,
            pattern: `'${word.toLowerCase()}'`,
            reason: `No viable alternative for '${word}'`,
            confidence: 'medium',
          });
        }
        continue;
      }

      // Pattern 4: Generic pattern - look for quoted strings
      const quotedMatches = line.matchAll(/['"]([a-zA-Z][a-zA-Z0-9\-_]*)['"]/g);
      for (const match of quotedMatches) {
        const word = match[1];
        const tokenName = word.toUpperCase().replace(/[^A-Z0-9]/g, '_');

        if (!existingRules.includes(tokenName) && !suggestions.some((s) => s.token === tokenName)) {
          suggestions.push({
            token: tokenName,
            pattern: `'${word.toLowerCase()}'`,
            reason: `Potential missing token from error context`,
            confidence: 'low',
          });
        }
      }
    }

    // Remove duplicates
    const uniqueSuggestions = suggestions.filter(
      (s, index, self) => index === self.findIndex((t) => t.token === s.token)
    );

    const summary =
      uniqueSuggestions.length > 0
        ? `Found ${uniqueSuggestions.length} suggested token(s) from error log`
        : 'No token suggestions found in error log';

    return {
      suggestions: uniqueSuggestions,
      summary,
    };
  }

  /**
   * Test if input text matches a parser rule (quick validation)
   * Returns match result with confidence score
   */
  static testParserRule(
    grammarContent: string,
    ruleName: string,
    input: string,
    options?: {
      fromFile?: string;
      basePath?: string;
      loadImports?: boolean;
    }
  ): {
    success: boolean;
    matched: boolean;
    confidence: 'high' | 'medium' | 'low';
    message: string;
    details?: {
      expectedTokens?: string[];
      actualTokens?: TokenInfo[];
      partialMatch?: boolean;
      matchedAlternative?: number;
    };
  } {
    // Load grammar with imports if requested
    let analysis;
    let finalGrammarContent = grammarContent;

    if (options?.fromFile && options?.loadImports !== false) {
      try {
        analysis = this.loadGrammarWithImports(options.fromFile, options.basePath);

        // Reconstruct grammar from merged analysis
        const lines: string[] = [];

        // Add parser rules
        const parserRules = analysis.rules.filter((r) => r.type === 'parser');
        for (const rule of parserRules) {
          // rule.definition already contains complete text
          lines.push(rule.definition);
          lines.push('');
        }

        // Add lexer rules
        const lexerRules = analysis.rules.filter((r) => r.type === 'lexer');
        for (const rule of lexerRules) {
          // rule.definition already contains complete text
          lines.push(rule.definition);
          lines.push('');
        }

        finalGrammarContent = lines.join('\n');
      } catch (error) {
        return {
          success: false,
          matched: false,
          confidence: 'low',
          message: `Failed to load grammar with imports: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } else {
      analysis = this.analyze(grammarContent);
    }

    // Find the rule
    const rule = analysis.rules.find((r) => r.name === ruleName);
    if (!rule) {
      return {
        success: false,
        matched: false,
        confidence: 'low',
        message: `Rule '${ruleName}' not found in grammar`,
      };
    }

    if (rule.type !== 'parser') {
      return {
        success: false,
        matched: false,
        confidence: 'low',
        message: `Rule '${ruleName}' is a lexer rule, not a parser rule`,
      };
    }

    // Tokenize input using the final grammar content (with imports if loaded)
    const tokenResult = this.previewTokens(finalGrammarContent, input, { showPositions: false });
    if (tokenResult.errors.length > 0) {
      const errorMessages = tokenResult.errors.map(
        (e) => `char '${e.char}' at position ${e.position}: ${e.message}`
      );
      return {
        success: true,
        matched: false,
        confidence: 'high',
        message: `Input has tokenization errors: ${errorMessages.join(', ')}`,
        details: {
          actualTokens: tokenResult.tokens,
        },
      };
    }

    // Parse rule structure
    const ruleStructure = this.parseRuleStructure(rule.definition);

    // Match tokens against rule structure
    const matchResult = this.matchTokensAgainstRule(
      tokenResult.tokens,
      ruleStructure,
      analysis.rules
    );

    return {
      success: true,
      matched: matchResult.matched,
      confidence: matchResult.confidence,
      message: matchResult.message,
      details: {
        expectedTokens: matchResult.expectedTokens,
        actualTokens: tokenResult.tokens,
        partialMatch: matchResult.partialMatch,
        matchedAlternative: matchResult.matchedAlternative,
      },
    };
  }

  /**
   * Parse rule structure into alternatives and elements
   */
  private static parseRuleStructure(definition: string): {
    alternatives: Array<
      Array<{
        element: string;
        modifier?: '?' | '*' | '+';
        isOptional: boolean;
        isRepeating: boolean;
      }>
    >;
  } {
    // Remove rule name and colon
    let body = definition.replace(/^[a-z_][a-z0-9_]*\s*:/i, '').trim();

    // Remove semicolon
    body = body.replace(/;$/, '').trim();

    // Remove labels (name=element -> element)
    body = body.replace(/[a-z_][a-z0-9_]*\s*=/gi, '');

    // Remove actions {code}
    body = body.replace(/\{[^}]*\}/g, '');

    // Split by | to get alternatives
    const alternativeStrings = this.splitByTopLevelPipe(body);

    const alternatives = alternativeStrings.map((alt) => {
      // Parse each alternative into elements
      return this.parseAlternative(alt.trim());
    });

    return { alternatives };
  }

  /**
   * Split string by top-level | (not inside parentheses)
   */
  private static splitByTopLevelPipe(text: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === '|' && depth === 0) {
        result.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      result.push(current.trim());
    }

    return result;
  }

  /**
   * Parse a single alternative into elements
   */
  private static parseAlternative(text: string): Array<{
    element: string;
    modifier?: '?' | '*' | '+';
    isOptional: boolean;
    isRepeating: boolean;
  }> {
    const elements: Array<{
      element: string;
      modifier?: '?' | '*' | '+';
      isOptional: boolean;
      isRepeating: boolean;
    }> = [];

    // Tokenize the alternative text
    const tokens = this.tokenizeAlternative(text);

    for (const token of tokens) {
      // Check for modifier
      const modifier = token.match(/([?*+])$/)?.[1] as '?' | '*' | '+' | undefined;
      const element = modifier ? token.slice(0, -1) : token;

      // Skip empty elements
      if (!element || element === '(' || element === ')') continue;

      elements.push({
        element: element.trim(),
        modifier,
        isOptional: modifier === '?' || modifier === '*',
        isRepeating: modifier === '*' || modifier === '+',
      });
    }

    return elements;
  }

  /**
   * Tokenize alternative text into elements
   */
  private static tokenizeAlternative(text: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let depth = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '(') {
        if (current.trim()) {
          tokens.push(current.trim());
          current = '';
        }
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
        if (depth === 0) {
          // Check for modifier after parentheses
          if (i + 1 < text.length && /[?*+]/.test(text[i + 1])) {
            current += text[i + 1];
            i++;
          }
          tokens.push(current.trim());
          current = '';
        }
      } else if (char === ' ' || char === '\t' || char === '\n') {
        if (depth === 0 && current.trim()) {
          tokens.push(current.trim());
          current = '';
        } else if (depth > 0) {
          current += char;
        }
      } else {
        current += char;
        // Check if next char is a modifier
        if (depth === 0 && i + 1 < text.length && /[?*+]/.test(text[i + 1])) {
          current += text[i + 1];
          i++;
          tokens.push(current.trim());
          current = '';
        }
      }
    }

    if (current.trim()) {
      tokens.push(current.trim());
    }

    return tokens;
  }

  /**
   * Match tokens against rule structure
   */
  private static matchTokensAgainstRule(
    tokens: TokenInfo[],
    ruleStructure: { alternatives: any[] },
    allRules: GrammarRule[]
  ): {
    matched: boolean;
    confidence: 'high' | 'medium' | 'low';
    message: string;
    expectedTokens?: string[];
    partialMatch?: boolean;
    matchedAlternative?: number;
  } {
    // Filter out skipped tokens (whitespace, comments)
    const activeTokens = tokens.filter((t) => !t.skipped);

    if (activeTokens.length === 0 && ruleStructure.alternatives.length > 0) {
      // Check if any alternative can be empty (all optional)
      const hasEmptyAlternative = ruleStructure.alternatives.some((alt) =>
        alt.every((el: any) => el.isOptional)
      );

      if (hasEmptyAlternative) {
        return {
          matched: true,
          confidence: 'high',
          message: `Input matches (empty alternative)`,
        };
      }

      return {
        matched: false,
        confidence: 'high',
        message: 'Input is empty but rule requires tokens',
      };
    }

    // Try each alternative
    for (let altIndex = 0; altIndex < ruleStructure.alternatives.length; altIndex++) {
      const alternative = ruleStructure.alternatives[altIndex];
      const matchResult = this.matchAlternative(activeTokens, alternative, allRules);

      if (matchResult.matched) {
        return {
          matched: true,
          confidence: matchResult.confidence,
          message: `Input matches alternative ${altIndex + 1}`,
          matchedAlternative: altIndex,
          expectedTokens: matchResult.expectedTokens,
        };
      }

      // Track partial matches for better error messages
      if (matchResult.partialMatch && altIndex === ruleStructure.alternatives.length - 1) {
        return {
          matched: false,
          confidence: 'medium',
          message: `Partial match found but incomplete`,
          partialMatch: true,
          expectedTokens: matchResult.expectedTokens,
        };
      }
    }

    // Build expected tokens list from first alternative
    const expectedTokens = ruleStructure.alternatives[0]?.map((el: any) => el.element) || [];

    return {
      matched: false,
      confidence: 'high',
      message: `No alternatives matched. Expected: ${expectedTokens.join(', ')}`,
      expectedTokens,
    };
  }

  /**
   * Match tokens against a single alternative
   */
  private static matchAlternative(
    tokens: TokenInfo[],
    alternative: Array<{
      element: string;
      modifier?: string;
      isOptional: boolean;
      isRepeating: boolean;
    }>,
    _allRules: GrammarRule[]
  ): {
    matched: boolean;
    confidence: 'high' | 'medium' | 'low';
    partialMatch?: boolean;
    expectedTokens?: string[];
  } {
    let tokenIndex = 0;
    let elementIndex = 0;
    const expectedTokens: string[] = [];

    while (elementIndex < alternative.length) {
      const element = alternative[elementIndex];
      expectedTokens.push(element.element);

      // Handle grouped elements: (A B C)*, (A | B)?, etc.
      if (element.element.startsWith('(') && element.element.endsWith(')')) {
        const groupContent = element.element.slice(1, -1).trim();

        // Parse the group as a mini-rule
        const groupAlternatives = this.splitByTopLevelPipe(groupContent).map((alt) =>
          this.parseAlternative(alt.trim())
        );

        // Try to match the group repeatedly if it has a repeating modifier
        let totalGroupMatches = 0;
        let continueMatching = true;

        while (continueMatching && tokenIndex < tokens.length) {
          let groupMatchedThisIteration = false;
          let bestMatchConsumed = 0;

          // Try each alternative in the group
          for (const groupAlt of groupAlternatives) {
            // Try to match this alternative starting from current position
            let tempIndex = tokenIndex;
            let allElementsMatched = true;

            for (const groupEl of groupAlt) {
              if (tempIndex >= tokens.length && !groupEl.isOptional) {
                allElementsMatched = false;
                break;
              }

              const isParser = /^[a-z]/.test(groupEl.element);

              if (isParser) {
                // Parser rule - consume at least one token
                if (tempIndex < tokens.length) {
                  tempIndex++;

                  // Handle repetition
                  if (groupEl.isRepeating) {
                    while (tempIndex < tokens.length) {
                      tempIndex++;
                    }
                  }
                } else if (!groupEl.isOptional) {
                  allElementsMatched = false;
                  break;
                }
              } else {
                // Lexer token - must match exactly
                if (tempIndex < tokens.length && tokens[tempIndex].type === groupEl.element) {
                  tempIndex++;

                  // Handle repetition
                  if (groupEl.isRepeating) {
                    while (
                      tempIndex < tokens.length &&
                      tokens[tempIndex].type === groupEl.element
                    ) {
                      tempIndex++;
                    }
                  }
                } else if (!groupEl.isOptional) {
                  allElementsMatched = false;
                  break;
                }
              }
            }

            if (allElementsMatched && tempIndex > tokenIndex) {
              // This alternative matched and consumed tokens
              const consumed = tempIndex - tokenIndex;
              if (consumed > bestMatchConsumed) {
                bestMatchConsumed = consumed;
                groupMatchedThisIteration = true;
              }
            }
          }

          if (groupMatchedThisIteration && bestMatchConsumed > 0) {
            tokenIndex += bestMatchConsumed;
            totalGroupMatches++;

            // Decide whether to continue
            if (!element.isRepeating) {
              continueMatching = false;
            }
          } else {
            continueMatching = false;
          }
        }

        // Check if we matched enough times
        if (element.modifier === '+' && totalGroupMatches === 0) {
          // + requires at least one match
          return {
            matched: false,
            confidence: 'medium',
            partialMatch: elementIndex > 0,
            expectedTokens,
          };
        }

        if (!element.isOptional && !element.isRepeating && totalGroupMatches === 0) {
          // Required element didn't match
          return {
            matched: false,
            confidence: 'medium',
            partialMatch: elementIndex > 0,
            expectedTokens,
          };
        }

        elementIndex++;
        continue;
      }

      // Check if element is a parser rule (lowercase)
      const isParserRule =
        /^[a-z_][a-z0-9_]*$/i.test(element.element) &&
        element.element[0] === element.element[0].toLowerCase();

      if (isParserRule) {
        // For parser rules, we can't fully validate without recursion
        // Just check if we have tokens available
        if (tokenIndex >= tokens.length) {
          if (element.isOptional) {
            elementIndex++;
            continue;
          }
          return {
            matched: false,
            confidence: 'medium',
            partialMatch: elementIndex > 0,
            expectedTokens,
          };
        }

        // Assume parser rule consumes at least one token
        tokenIndex++;

        // Handle repetition
        if (element.isRepeating) {
          // Consume more tokens (simple heuristic)
          while (tokenIndex < tokens.length) {
            tokenIndex++;
            if (elementIndex + 1 < alternative.length) {
              // Check if next element might match
              const nextElement = alternative[elementIndex + 1];
              if (tokens[tokenIndex]?.type === nextElement.element) {
                break;
              }
            }
          }
        }

        elementIndex++;
        continue;
      }

      // Element is a token (lexer rule)
      if (tokenIndex >= tokens.length) {
        if (element.isOptional) {
          elementIndex++;
          continue;
        }
        return {
          matched: false,
          confidence: 'high',
          partialMatch: elementIndex > 0,
          expectedTokens,
        };
      }

      const currentToken = tokens[tokenIndex];

      // Match token type
      if (currentToken.type === element.element) {
        tokenIndex++;

        // Handle repetition (*, +)
        if (element.isRepeating) {
          while (tokenIndex < tokens.length && tokens[tokenIndex].type === element.element) {
            tokenIndex++;
          }
        }

        elementIndex++;
      } else if (element.isOptional) {
        // Optional element doesn't match, skip it
        elementIndex++;
      } else {
        // Required element doesn't match
        return {
          matched: false,
          confidence: 'high',
          partialMatch: elementIndex > 0,
          expectedTokens,
        };
      }
    }

    // Check if we consumed all tokens
    if (tokenIndex === tokens.length) {
      return {
        matched: true,
        confidence: 'high',
        expectedTokens,
      };
    }

    // Extra tokens remaining
    return {
      matched: false,
      confidence: 'high',
      partialMatch: true,
      expectedTokens,
    };
  }

  /**
   * Inline a rule by replacing all references with its definition
   */
  static inlineRule(
    grammarContent: string,
    ruleName: string,
    options?: {
      preserveParentheses?: boolean;
      dryRun?: boolean;
    }
  ): {
    success: boolean;
    modified: string;
    message: string;
    stats?: {
      referencesReplaced: number;
      ruleDefinition: string;
      referencingRules: string[];
    };
  } {
    const analysis = this.analyze(grammarContent);

    // Find the rule
    const rule = analysis.rules.find((r) => r.name === ruleName);
    if (!rule) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${ruleName}' not found in grammar`,
      };
    }

    // Extract rule body first to check for actual recursion
    const ruleBody = this.extractRuleBody(rule.definition);

    // Check if rule body actually references itself (true recursion)
    const bodyReferences = new RegExp(`\\b${ruleName}\\b`);
    if (bodyReferences.test(ruleBody)) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${ruleName}' is recursive (references itself in body)`,
      };
    }

    // Check for circular references
    const circularCheck = this.detectCircularReference(analysis.rules, ruleName);
    if (circularCheck.hasCircular) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${ruleName}' has circular references: ${circularCheck.path?.join(' -> ')}`,
      };
    }

    // Find all usages
    const usages = this.findRuleUsages(grammarContent, ruleName);

    // Filter out the rule's own definition
    const actualUsages = usages.locations.filter((loc) => {
      // Check if this is the rule definition line
      const isDefinition = new RegExp(`^\\s*${ruleName}\\s*:`).test(loc.context);
      return !isDefinition;
    });

    if (actualUsages.length === 0) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${ruleName}' is not used anywhere`,
      };
    }

    // Determine if we need parentheses
    const needsParens = options?.preserveParentheses || this.ruleBodyNeedsParentheses(ruleBody);

    // Replace all references
    let modified = grammarContent;
    const referencingRules = new Set<string>();
    let replacedCount = 0;

    const lines = modified.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip the rule definition itself
      const isRuleDefinition = new RegExp(`^\\s*${ruleName}\\s*:`).test(line);
      if (isRuleDefinition) continue;

      // Check if line contains reference to the rule
      const refRegex = new RegExp(`\\b${ruleName}\\b`, 'g');
      const matches = line.match(refRegex);

      if (matches && matches.length > 0) {
        // Find which rule this line belongs to
        for (let j = i; j >= 0; j--) {
          const match = lines[j].match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
          if (match) {
            referencingRules.add(match[1]);
            break;
          }
        }

        // Determine replacement based on context
        const replacement = needsParens ? `(${ruleBody})` : ruleBody;

        // Replace with whole-word matching and count occurrences
        lines[i] = line.replace(new RegExp(`\\b${ruleName}\\b`, 'g'), replacement);
        replacedCount += matches.length; // Count actual occurrences, not just lines
      }
    }

    modified = lines.join('\n');

    // Remove the original rule
    if (!options?.dryRun) {
      const removeResult = this.removeRule(modified, ruleName);
      if (!removeResult.success) {
        return {
          success: false,
          modified: grammarContent,
          message: `Failed to remove rule after inlining: ${removeResult.message}`,
        };
      }
      modified = removeResult.modified;
    }

    return {
      success: true,
      modified,
      message: options?.dryRun
        ? `Would inline '${ruleName}' (${replacedCount} references in ${referencingRules.size} rules)`
        : `Inlined '${ruleName}' (${replacedCount} references in ${referencingRules.size} rules)`,
      stats: {
        referencesReplaced: replacedCount,
        ruleDefinition: rule.definition,
        referencingRules: Array.from(referencingRules),
      },
    };
  }

  /**
   * Extract rule body without rule name, colon, semicolon, labels, actions
   */
  private static extractRuleBody(definition: string): string {
    // Remove rule name and colon
    let body = definition.replace(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*/i, '').trim();

    // Remove semicolon
    body = body.replace(/;\s*$/, '').trim();

    // Remove labels (name=element -> element)
    body = body.replace(/[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*/g, '');

    // Remove alternative labels (# label at end of alternatives)
    body = body.replace(/\s*#\s*[a-zA-Z_][a-zA-Z0-9_]*/g, '');

    // Keep actions for now (they might be needed)

    return body.trim();
  }

  /**
   * Check if rule body needs parentheses when inlined
   */
  private static ruleBodyNeedsParentheses(body: string): boolean {
    // Always needs parentheses if contains alternatives
    if (body.includes('|')) return true;

    // Check if it's a simple single token/rule
    const tokens = body.trim().split(/\s+/);
    if (tokens.length === 1) return false;

    // Multiple elements might need parens depending on context
    return true;
  }

  /**
   * Detect circular references in rule dependencies
   */
  private static detectCircularReference(
    rules: GrammarRule[],
    startRule: string,
    visited: Set<string> = new Set(),
    path: string[] = []
  ): { hasCircular: boolean; path?: string[] } {
    if (visited.has(startRule)) {
      return { hasCircular: true, path: [...path, startRule] };
    }

    const rule = rules.find((r) => r.name === startRule);
    if (!rule) return { hasCircular: false };

    visited.add(startRule);
    path.push(startRule);

    for (const referencedRule of rule.referencedRules) {
      // Skip self-references (analyzer bug where rule name appears in its own referencedRules)
      if (referencedRule === startRule) continue;

      // Skip lexer rules (uppercase)
      if (referencedRule[0] === referencedRule[0].toUpperCase()) continue;

      const result = this.detectCircularReference(rules, referencedRule, new Set(visited), [
        ...path,
      ]);
      if (result.hasCircular) {
        return result;
      }
    }

    return { hasCircular: false };
  }

  /**
   * Sort rules in grammar by various strategies
   */
  static sortRules(
    grammarContent: string,
    strategy: 'alphabetical' | 'type' | 'dependency' | 'usage' = 'alphabetical',
    options?: {
      anchorRule?: string;
      parserFirst?: boolean;
      preserveGroups?: boolean;
    }
  ): {
    success: boolean;
    modified: string;
    message: string;
    stats?: {
      totalRules: number;
      reordered: number;
      strategy: string;
    };
  } {
    const analysis = this.analyze(grammarContent);

    if (analysis.rules.length === 0) {
      return {
        success: false,
        modified: grammarContent,
        message: 'No rules found in grammar',
      };
    }

    // Parse grammar structure
    const structure = this.parseGrammarStructure(grammarContent, analysis);

    // Sort rules according to strategy
    let sortedRules: typeof structure.rules;

    switch (strategy) {
      case 'alphabetical':
        sortedRules = this.sortRulesAlphabetical(structure.rules);
        break;

      case 'type':
        sortedRules = this.sortRulesByType(structure.rules, options?.parserFirst ?? true);
        break;

      case 'dependency':
        if (!options?.anchorRule) {
          return {
            success: false,
            modified: grammarContent,
            message: 'Dependency sorting requires anchorRule option',
          };
        }
        const depResult = this.sortRulesByDependency(structure.rules, options.anchorRule);
        if (!depResult.success) {
          return {
            success: false,
            modified: grammarContent,
            message: depResult.message || 'Dependency sort failed',
          };
        }
        sortedRules = depResult.rules;
        break;

      case 'usage':
        sortedRules = this.sortRulesByUsage(structure.rules);
        break;

      default:
        return {
          success: false,
          modified: grammarContent,
          message: `Unknown sorting strategy: ${strategy}`,
        };
    }

    // Reconstruct grammar
    const modified = this.reconstructGrammar(structure.header, sortedRules);

    return {
      success: true,
      modified,
      message: `Sorted ${analysis.rules.length} rules by ${strategy}`,
      stats: {
        totalRules: analysis.rules.length,
        reordered: analysis.rules.length,
        strategy,
      },
    };
  }

  /**
   * Parse grammar structure into header and rules
   */
  private static parseGrammarStructure(
    grammarContent: string,
    analysis: GrammarAnalysis
  ): {
    header: string;
    rules: Array<{
      name: string;
      type: 'lexer' | 'parser';
      text: string;
      referencedRules: string[];
      lineNumber: number;
    }>;
  } {
    const lines = grammarContent.split('\n');

    // Find where first rule starts
    let headerEndLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(lines[i].trim())) {
        headerEndLine = i;
        break;
      }
    }

    const header = lines.slice(0, headerEndLine).join('\n');

    // Extract each rule's complete text
    const rules = analysis.rules.map((rule) => {
      const ruleText = this.extractCompleteRuleText(grammarContent, rule);
      return {
        name: rule.name,
        type: rule.type,
        text: ruleText,
        referencedRules: rule.referencedRules,
        lineNumber: rule.lineNumber,
      };
    });

    return { header, rules };
  }

  /**
   * Extract complete text for a rule (including multi-line and trailing blank lines)
   */
  private static extractCompleteRuleText(grammarContent: string, rule: GrammarRule): string {
    const lines = grammarContent.split('\n');
    const startLine = rule.lineNumber - 1;

    // Find end (semicolon)
    let endLine = startLine;
    for (let i = startLine; i < lines.length; i++) {
      if (lines[i].includes(';')) {
        endLine = i;
        break;
      }
    }

    // Include one blank line after rule if present (common formatting)
    if (endLine + 1 < lines.length && lines[endLine + 1].trim() === '') {
      endLine++;
    }

    return lines.slice(startLine, endLine + 1).join('\n');
  }

  /**
   * Sort rules alphabetically (parser rules first, then lexer rules)
   */
  private static sortRulesAlphabetical(rules: any[]): any[] {
    const parserRules = rules
      .filter((r) => r.type === 'parser')
      .sort((a, b) => a.name.localeCompare(b.name));
    const lexerRules = rules
      .filter((r) => r.type === 'lexer')
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...parserRules, ...lexerRules];
  }

  /**
   * Sort rules by type
   */
  private static sortRulesByType(rules: any[], parserFirst: boolean): any[] {
    const parser = rules.filter((r) => r.type === 'parser');
    const lexer = rules.filter((r) => r.type === 'lexer');
    return parserFirst ? [...parser, ...lexer] : [...lexer, ...parser];
  }

  /**
   * Sort rules by dependency (rules used by anchor first)
   */
  private static sortRulesByDependency(
    rules: any[],
    anchorRule: string
  ): { success: boolean; message?: string; rules: any[] } {
    const anchor = rules.find((r) => r.name === anchorRule);
    if (!anchor) {
      return {
        success: false,
        message: `Anchor rule '${anchorRule}' not found`,
        rules,
      };
    }

    // Build dependency graph
    const graph = new Map<string, Set<string>>();
    for (const rule of rules) {
      graph.set(
        rule.name,
        new Set(rule.referencedRules.filter((ref: string) => rules.some((r) => r.name === ref)))
      );
    }

    // Get transitive dependencies
    const dependencies = this.getTransitiveDeps(graph, anchorRule);

    // Get transitive dependents
    const dependents = this.getTransitiveDependents(graph, anchorRule, rules);

    // Order: dependencies -> anchor -> dependents -> rest
    const ordered: any[] = [];

    // Dependencies (topologically sorted)
    const depRules = rules.filter((r) => dependencies.has(r.name) && r.name !== anchorRule);
    ordered.push(...this.topologicalSort(depRules));

    // Anchor
    ordered.push(anchor);

    // Dependents
    const depRules2 = rules.filter(
      (r) => dependents.has(r.name) && r.name !== anchorRule && !dependencies.has(r.name)
    );
    ordered.push(...depRules2);

    // Rest alphabetically
    const rest = rules.filter(
      (r) => !dependencies.has(r.name) && !dependents.has(r.name) && r.name !== anchorRule
    );
    ordered.push(...rest.sort((a, b) => a.name.localeCompare(b.name)));

    return { success: true, rules: ordered };
  }

  /**
   * Get transitive dependencies of a rule
   */
  private static getTransitiveDeps(graph: Map<string, Set<string>>, start: string): Set<string> {
    const result = new Set<string>();
    const visited = new Set<string>();

    const visit = (node: string) => {
      if (visited.has(node)) return;
      visited.add(node);

      const deps = graph.get(node);
      if (deps) {
        for (const dep of deps) {
          // Only include parser rules (lowercase)
          if (dep[0] === dep[0].toLowerCase()) {
            result.add(dep);
            visit(dep);
          }
        }
      }
    };

    visit(start);
    result.delete(start); // Don't include the start node itself

    return result;
  }

  /**
   * Get transitive dependents (rules that use this rule)
   */
  private static getTransitiveDependents(
    graph: Map<string, Set<string>>,
    target: string,
    allRules: any[]
  ): Set<string> {
    const result = new Set<string>();

    const visit = (node: string, visited: Set<string>) => {
      for (const rule of allRules) {
        if (visited.has(rule.name)) continue;

        const deps = graph.get(rule.name);
        if (deps && deps.has(node)) {
          result.add(rule.name);
          visited.add(rule.name);
          visit(rule.name, visited);
        }
      }
    };

    visit(target, new Set([target]));

    return result;
  }

  /**
   * Topological sort of rules
   */
  private static topologicalSort(rules: any[]): any[] {
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    // Build graph
    for (const rule of rules) {
      graph.set(
        rule.name,
        new Set(rule.referencedRules.filter((ref: string) => rules.some((r) => r.name === ref)))
      );
      inDegree.set(rule.name, 0);
    }

    // Calculate in-degrees
    for (const rule of rules) {
      const deps = graph.get(rule.name);
      if (deps) {
        for (const dep of deps) {
          inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: any[] = [];
    const result: any[] = [];

    for (const rule of rules) {
      if (inDegree.get(rule.name) === 0) {
        queue.push(rule);
      }
    }

    while (queue.length > 0) {
      const rule = queue.shift()!;
      result.push(rule);

      const deps = graph.get(rule.name);
      if (deps) {
        for (const dep of deps) {
          const degree = inDegree.get(dep)! - 1;
          inDegree.set(dep, degree);

          if (degree === 0) {
            const depRule = rules.find((r) => r.name === dep);
            if (depRule) queue.push(depRule);
          }
        }
      }
    }

    // If not all rules processed, there's a cycle - fall back to original order
    if (result.length < rules.length) {
      return rules;
    }

    return result;
  }

  /**
   * Sort rules by usage (most referenced first)
   */
  private static sortRulesByUsage(rules: any[]): any[] {
    // Count references for each rule
    const usageCount = new Map<string, number>();

    for (const rule of rules) {
      usageCount.set(rule.name, 0);
    }

    for (const rule of rules) {
      for (const ref of rule.referencedRules) {
        if (usageCount.has(ref)) {
          usageCount.set(ref, usageCount.get(ref)! + 1);
        }
      }
    }

    // Sort by usage count (descending)
    return rules.sort((a, b) => {
      const countA = usageCount.get(a.name) || 0;
      const countB = usageCount.get(b.name) || 0;

      if (countB !== countA) {
        return countB - countA;
      }

      // Tie-breaker: alphabetical
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Reconstruct grammar from header and sorted rules
   */
  private static reconstructGrammar(header: string, rules: any[]): string {
    const parts: string[] = [];

    // Add header
    if (header.trim()) {
      parts.push(header);

      // Add blank line after header if not already present
      if (!header.endsWith('\n\n')) {
        parts.push('');
      }
    }

    // Add rules
    for (const rule of rules) {
      parts.push(rule.text);
    }

    return parts.join('\n');
  }

  /**
   * Analyze grammar for common ambiguity patterns
   */
  static analyzeAmbiguities(
    grammarContent: string,
    options?: {
      checkIdenticalAlternatives?: boolean;
      checkOverlappingPrefixes?: boolean;
      checkAmbiguousOptionals?: boolean;
      checkLeftRecursion?: boolean;
      checkLexerConflicts?: boolean;
      minPrefixLength?: number;
    }
  ): {
    success: boolean;
    issues: Array<{
      severity: 'error' | 'warning' | 'info';
      type: string;
      rule: string;
      line?: number;
      description: string;
      suggestion?: string;
    }>;
    summary: {
      errors: number;
      warnings: number;
      infos: number;
      rulesAnalyzed: number;
    };
  } {
    const opts = {
      checkIdenticalAlternatives: options?.checkIdenticalAlternatives ?? true,
      checkOverlappingPrefixes: options?.checkOverlappingPrefixes ?? true,
      checkAmbiguousOptionals: options?.checkAmbiguousOptionals ?? true,
      checkLeftRecursion: options?.checkLeftRecursion ?? true,
      checkLexerConflicts: options?.checkLexerConflicts ?? true,
      minPrefixLength: options?.minPrefixLength ?? 2,
    };

    const analysis = this.analyze(grammarContent);
    const issues: any[] = [];

    // Run checks
    if (opts.checkIdenticalAlternatives) {
      issues.push(...this.checkIdenticalAlternatives(analysis));
    }

    if (opts.checkOverlappingPrefixes) {
      issues.push(...this.checkOverlappingPrefixes(analysis, opts.minPrefixLength));
    }

    if (opts.checkAmbiguousOptionals) {
      issues.push(...this.checkAmbiguousOptionals(analysis));
    }

    if (opts.checkLeftRecursion) {
      issues.push(...this.checkHiddenLeftRecursion(analysis));
    }

    if (opts.checkLexerConflicts) {
      issues.push(...this.checkLexerConflicts(analysis));
    }

    // Summarize
    const summary = {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      infos: issues.filter((i) => i.severity === 'info').length,
      rulesAnalyzed: analysis.rules.length,
    };

    return {
      success: summary.errors === 0,
      issues,
      summary,
    };
  }

  /**
   * Check for identical alternatives
   */
  private static checkIdenticalAlternatives(analysis: GrammarAnalysis): any[] {
    const issues: any[] = [];

    for (const rule of analysis.rules) {
      const alternatives = this.extractAlternativesFromDef(rule.definition);
      const seen = new Set<string>();

      for (const alt of alternatives) {
        const normalized = this.normalizeAlternative(alt);
        if (seen.has(normalized)) {
          issues.push({
            severity: 'error',
            type: 'identical-alternatives',
            rule: rule.name,
            line: rule.lineNumber,
            description: `Rule '${rule.name}' has duplicate alternative: ${alt}`,
            suggestion: 'Remove duplicate alternative',
          });
        }
        seen.add(normalized);
      }
    }

    return issues;
  }

  /**
   * Extract alternatives from rule definition
   */
  private static extractAlternativesFromDef(definition: string): string[] {
    // Remove rule name and colon
    let body = definition.replace(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*/i, '').trim();

    // Remove comments
    body = body
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();

    // Remove semicolon
    body = body.replace(/;\s*$/, '').trim();

    // Split by top-level |
    return this.splitByTopLevelPipe(body);
  }

  /**
   * Normalize alternative for comparison
   */
  private static normalizeAlternative(alt: string): string {
    return alt
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[a-zA-Z_][a-zA-Z0-9_]*\s*=/g, '') // Remove labels
      .replace(/\{[^}]*\}/g, '') // Remove actions
      .replace(/\s*#\s*[a-zA-Z_][a-zA-Z0-9_]*/g, '') // Remove alternative labels
      .trim();
  }

  /**
   * Check for overlapping prefixes in alternatives
   */
  private static checkOverlappingPrefixes(analysis: GrammarAnalysis, minLength: number): any[] {
    const issues: any[] = [];

    for (const rule of analysis.rules) {
      const alternatives = this.extractAlternativesFromDef(rule.definition);

      if (alternatives.length < 2) continue;

      for (let i = 0; i < alternatives.length; i++) {
        for (let j = i + 1; j < alternatives.length; j++) {
          const prefix = this.commonPrefixLength(alternatives[i], alternatives[j]);

          if (prefix >= minLength) {
            const prefixText = alternatives[i].split(/\s+/).slice(0, prefix).join(' ');
            issues.push({
              severity: 'warning',
              type: 'overlapping-prefix',
              rule: rule.name,
              line: rule.lineNumber,
              description: `Alternatives in '${rule.name}' share common prefix (${prefix} tokens): ${prefixText}`,
              suggestion: 'Consider factoring out common prefix',
            });
            break; // Only report once per rule
          }
        }
      }
    }

    return issues;
  }

  /**
   * Calculate common prefix length between two alternatives
   */
  private static commonPrefixLength(alt1: string, alt2: string): number {
    const tokens1 = alt1.trim().split(/\s+/);
    const tokens2 = alt2.trim().split(/\s+/);

    let length = 0;
    while (
      length < tokens1.length &&
      length < tokens2.length &&
      tokens1[length] === tokens2[length]
    ) {
      length++;
    }

    return length;
  }

  /**
   * Check for ambiguous optional patterns
   */
  private static checkAmbiguousOptionals(analysis: GrammarAnalysis): any[] {
    const issues: any[] = [];

    for (const rule of analysis.rules) {
      let body = rule.definition.replace(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*/i, '');

      // Remove comments
      body = body
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();

      // Remove semicolon
      body = body.replace(/;\s*$/, '').trim();

      const tokens = body.split(/\s+/);

      // Check for A? A pattern
      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].endsWith('?')) {
          const base = tokens[i].slice(0, -1);
          if (tokens[i + 1] === base) {
            issues.push({
              severity: 'warning',
              type: 'ambiguous-optional',
              rule: rule.name,
              line: rule.lineNumber,
              description: `Rule '${rule.name}' has ambiguous pattern: ${base}? ${base}`,
              suggestion: `Use ${base}+ or clarify which is optional`,
            });
          }
        }
      }

      // Check for A? A* pattern (redundant)
      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].endsWith('?')) {
          const base = tokens[i].slice(0, -1);
          if (tokens[i + 1] === base + '*') {
            issues.push({
              severity: 'warning',
              type: 'redundant-optional',
              rule: rule.name,
              line: rule.lineNumber,
              description: `Rule '${rule.name}' has redundant pattern: ${base}? ${base}*`,
              suggestion: `Use ${base}* alone (already handles zero occurrences)`,
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * Check for hidden left recursion
   */
  private static checkHiddenLeftRecursion(analysis: GrammarAnalysis): any[] {
    const issues: any[] = [];

    for (const rule of analysis.rules) {
      if (rule.type !== 'parser') continue;

      const visited = new Set<string>();
      const recStack = new Set<string>();

      if (this.hasHiddenLeftRecursionHelper(rule.name, analysis.rules, visited, recStack)) {
        issues.push({
          severity: 'error',
          type: 'hidden-left-recursion',
          rule: rule.name,
          line: rule.lineNumber,
          description: `Rule '${rule.name}' has hidden left recursion`,
          suggestion: 'Rewrite to eliminate indirect recursion',
        });
      }
    }

    return issues;
  }

  /**
   * Helper for hidden left recursion detection
   */
  private static hasHiddenLeftRecursionHelper(
    ruleName: string,
    allRules: GrammarRule[],
    visited: Set<string>,
    recStack: Set<string>
  ): boolean {
    if (recStack.has(ruleName)) {
      return true;
    }

    if (visited.has(ruleName)) {
      return false;
    }

    visited.add(ruleName);
    recStack.add(ruleName);

    const rule = allRules.find((r) => r.name === ruleName);
    if (!rule) {
      recStack.delete(ruleName);
      return false;
    }

    // Check first element of each alternative
    const alternatives = this.extractAlternativesFromDef(rule.definition);
    for (const alt of alternatives) {
      const firstToken = alt.trim().split(/\s+/)[0];

      // Skip if first token is lexer rule (uppercase)
      if (!firstToken || firstToken[0] === firstToken[0].toUpperCase()) continue;

      // Skip if it's direct recursion (ANTLR handles this)
      if (firstToken === ruleName) continue;

      // Check if it's a parser rule reference (hidden recursion)
      if (this.hasHiddenLeftRecursionHelper(firstToken, allRules, visited, recStack)) {
        recStack.delete(ruleName);
        return true;
      }
    }

    recStack.delete(ruleName);
    return false;
  }

  /**
   * Check for lexer conflicts
   */
  private static checkLexerConflicts(analysis: GrammarAnalysis): any[] {
    const issues: any[] = [];
    const lexerRules = analysis.rules.filter((r) => r.type === 'lexer');

    for (let i = 0; i < lexerRules.length; i++) {
      for (let j = i + 1; j < lexerRules.length; j++) {
        const rule1 = lexerRules[i];
        const rule2 = lexerRules[j];

        // Extract patterns
        const pattern1 = this.extractLexerPattern(rule1.definition);
        const pattern2 = this.extractLexerPattern(rule2.definition);

        // Check for obvious overlaps
        if (this.lexerPatternsOverlap(pattern1, pattern2)) {
          issues.push({
            severity: 'warning',
            type: 'lexer-conflict',
            rule: rule1.name,
            line: rule1.lineNumber,
            description: `Lexer rules '${rule1.name}' and '${rule2.name}' may conflict`,
            suggestion: 'ANTLR uses first match; reorder if needed',
          });
          break; // Only report once per rule
        }
      }
    }

    return issues;
  }

  /**
   * Extract lexer pattern from rule definition
   */
  private static extractLexerPattern(definition: string): string {
    // Remove rule name and colon
    let pattern = definition.replace(/^[A-Z_][A-Z0-9_]*\s*:\s*/i, '').trim();

    // Remove semicolon and directives (-> skip, -> channel(...))
    pattern = pattern
      .replace(/\s*->\s*\w+.*$/, '')
      .replace(/;\s*$/, '')
      .trim();

    return pattern;
  }

  /**
   * Check if two lexer patterns overlap
   */
  private static lexerPatternsOverlap(pattern1: string, pattern2: string): boolean {
    // Simple heuristic: check if one is a prefix of the other or both are character ranges

    // String literal overlap
    const literal1 = pattern1.match(/^'([^']+)'$/);
    const literal2 = pattern2.match(/^'([^']+)'$/);

    if (literal1 && literal2) {
      const str1 = literal1[1];
      const str2 = literal2[1];
      return str1.startsWith(str2) || str2.startsWith(str1);
    }

    // Check if one is a string literal and the other is a character class that could match it
    if (literal1 && !literal2) {
      // literal1 is string, pattern2 is regex
      const str = literal1[1];
      // Simple check: if pattern2 is [a-z]+ and string is all lowercase letters
      if (pattern2.includes('[a-z]') && /^[a-z]+$/.test(str)) {
        return true;
      }
      if (pattern2.includes('[A-Z]') && /^[A-Z]+$/.test(str)) {
        return true;
      }
      if (pattern2.includes('[0-9]') && /^[0-9]+$/.test(str)) {
        return true;
      }
    }

    if (literal2 && !literal1) {
      // literal2 is string, pattern1 is regex
      const str = literal2[1];
      if (pattern1.includes('[a-z]') && /^[a-z]+$/.test(str)) {
        return true;
      }
      if (pattern1.includes('[A-Z]') && /^[A-Z]+$/.test(str)) {
        return true;
      }
      if (pattern1.includes('[0-9]') && /^[0-9]+$/.test(str)) {
        return true;
      }
    }

    // Character class overlap (very basic check)
    const charClass1 = pattern1.includes('[') && pattern1.includes(']');
    const charClass2 = pattern2.includes('[') && pattern2.includes(']');

    if (charClass1 && charClass2) {
      // Both have character classes - might overlap
      // This is a very simplified check
      return (
        (pattern1.includes('[a-z]') && pattern2.includes('[a-z]')) ||
        (pattern1.includes('[A-Z]') && pattern2.includes('[A-Z]')) ||
        (pattern1.includes('[0-9]') && pattern2.includes('[0-9]'))
      );
    }

    return false;
  }

  // ============================================================================
  // Rule Positioning
  // ============================================================================

  /**
   * Move an existing rule to a new position relative to another rule
   */
  static moveRule(
    grammarContent: string,
    ruleName: string,
    position: 'before' | 'after',
    anchorRule: string
  ): {
    success: boolean;
    modified: string;
    message: string;
  } {
    const analysis = this.analyze(grammarContent);

    // Validate rule exists
    const rule = analysis.rules.find((r) => r.name === ruleName);
    if (!rule) {
      return {
        success: false,
        modified: grammarContent,
        message: `Rule '${ruleName}' not found in grammar.`,
      };
    }

    // Validate anchor exists
    const anchor = analysis.rules.find((r) => r.name === anchorRule);
    if (!anchor) {
      return {
        success: false,
        modified: grammarContent,
        message: `Anchor rule '${anchorRule}' not found in grammar.`,
      };
    }

    // Check if rule and anchor are the same
    if (ruleName === anchorRule) {
      return {
        success: false,
        modified: grammarContent,
        message: `Cannot move rule '${ruleName}' relative to itself.`,
      };
    }

    const lines = grammarContent.split('\n');

    // Find rule start line
    let ruleStartLine = -1;
    const rulePattern = new RegExp(`^\\s*(?:fragment\\s+)?${ruleName}\\s*[:\\n]`);
    for (let i = 0; i < lines.length; i++) {
      if (rulePattern.test(lines[i])) {
        ruleStartLine = i;
        break;
      }
    }

    // Fallback: search without colon
    if (ruleStartLine === -1) {
      const namePattern = new RegExp(`^\\s*(?:fragment\\s+)?${ruleName}\\s*$`);
      for (let i = 0; i < lines.length; i++) {
        if (namePattern.test(lines[i])) {
          ruleStartLine = i;
          break;
        }
      }
    }

    if (ruleStartLine === -1) {
      return {
        success: false,
        modified: grammarContent,
        message: `Could not locate rule '${ruleName}' in grammar content.`,
      };
    }

    // Find rule end line (marked by ;)
    let ruleEndLine = ruleStartLine;
    for (let i = ruleStartLine; i < lines.length; i++) {
      if (lines[i].includes(';')) {
        ruleEndLine = i;
        break;
      }
    }

    // Include trailing blank line if present
    let includeBlankLine = false;
    if (ruleEndLine + 1 < lines.length && lines[ruleEndLine + 1].trim() === '') {
      includeBlankLine = true;
    }

    // Find anchor start line
    let anchorStartLine = -1;
    const anchorPattern = new RegExp(`^\\s*(?:fragment\\s+)?${anchorRule}\\s*[:\\n]`);
    for (let i = 0; i < lines.length; i++) {
      if (anchorPattern.test(lines[i])) {
        anchorStartLine = i;
        break;
      }
    }

    // Fallback: search without colon
    if (anchorStartLine === -1) {
      const anchorNamePattern = new RegExp(`^\\s*(?:fragment\\s+)?${anchorRule}\\s*$`);
      for (let i = 0; i < lines.length; i++) {
        if (anchorNamePattern.test(lines[i])) {
          anchorStartLine = i;
          break;
        }
      }
    }

    if (anchorStartLine === -1) {
      return {
        success: false,
        modified: grammarContent,
        message: `Could not locate anchor rule '${anchorRule}' in grammar content.`,
      };
    }

    // Check if rule is already in target position
    // const targetLine = position === 'before' ? anchorStartLine : anchorStartLine + 1;
    if (position === 'before' && ruleEndLine + 1 === anchorStartLine) {
      return {
        success: true,
        modified: grammarContent,
        message: `Rule '${ruleName}' is already immediately before '${anchorRule}'.`,
      };
    }

    if (position === 'after') {
      // Find anchor end line
      let anchorEndLine = anchorStartLine;
      for (let i = anchorStartLine; i < lines.length; i++) {
        if (lines[i].includes(';')) {
          anchorEndLine = i;
          break;
        }
      }

      // Check if already in position
      if (anchorEndLine + 1 === ruleStartLine || anchorEndLine + 2 === ruleStartLine) {
        return {
          success: true,
          modified: grammarContent,
          message: `Rule '${ruleName}' is already immediately after '${anchorRule}'.`,
        };
      }
    }

    // Extract rule text
    const ruleLines = lines.slice(ruleStartLine, ruleEndLine + 1);
    if (includeBlankLine) {
      ruleLines.push('');
    }

    // Remove rule from current position
    const removeCount = includeBlankLine
      ? ruleEndLine - ruleStartLine + 2
      : ruleEndLine - ruleStartLine + 1;
    lines.splice(ruleStartLine, removeCount);

    // Adjust anchor position if it's after the removed rule
    let adjustedAnchorLine = anchorStartLine;
    if (anchorStartLine > ruleStartLine) {
      adjustedAnchorLine -= removeCount;
    }

    // Find insertion point
    let insertLine: number;
    if (position === 'before') {
      insertLine = adjustedAnchorLine;
    } else {
      // Find end of anchor rule
      let anchorEnd = adjustedAnchorLine;
      for (let i = adjustedAnchorLine; i < lines.length; i++) {
        if (lines[i].includes(';')) {
          anchorEnd = i;
          break;
        }
      }
      insertLine = anchorEnd + 1;

      // Skip blank line after anchor if present
      if (insertLine < lines.length && lines[insertLine].trim() === '') {
        insertLine++;
      }
    }

    // Insert rule at new position
    lines.splice(insertLine, 0, ...ruleLines);

    const modified = lines.join('\n');

    return {
      success: true,
      modified,
      message: `Moved rule '${ruleName}' to ${position} '${anchorRule}'.`,
    };
  }

  // ============================================================================
  // Multi-File Grammar Support
  // ============================================================================

  /**
   * Parse import statements from grammar
   */
  static parseImports(grammarContent: string): string[] {
    const imports: string[] = [];
    const importPattern = /^import\s+([^;]+);/gm;

    let match;
    while ((match = importPattern.exec(grammarContent)) !== null) {
      const importList = match[1];
      // Split by comma and trim
      const names = importList.split(',').map((name) => name.trim());
      imports.push(...names);
    }

    return imports;
  }

  /**
   * Parse tokenVocab option from grammar
   */
  static parseTokenVocab(grammarContent: string): string | null {
    const optionsMatch = grammarContent.match(/options\s*\{([^}]+)\}/s);
    if (!optionsMatch) return null;

    const optionsBlock = optionsMatch[1];
    const vocabMatch = optionsBlock.match(/tokenVocab\s*=\s*([A-Za-z0-9_]+)/);

    return vocabMatch ? vocabMatch[1] : null;
  }

  /**
   * Resolve import path relative to current file
   */
  static resolveImportPath(
    importName: string,
    currentFile: string,
    basePath?: string
  ): string | null {
    const currentDir = path.dirname(currentFile);

    // Try various locations
    const tryPaths = [
      // Same directory as current file
      path.join(currentDir, `${importName}.g4`),
      // Base path if provided
      ...(basePath ? [path.join(basePath, `${importName}.g4`)] : []),
      // Common subdirectories
      ...(basePath
        ? [
            path.join(basePath, importName, `${importName}.g4`),
            path.join(basePath, 'imports', `${importName}.g4`),
          ]
        : []),
    ];

    for (const tryPath of tryPaths) {
      try {
        if (fs.existsSync(tryPath)) {
          return tryPath;
        }
      } catch {
        // Continue to next path
      }
    }

    return null;
  }

  /**
   * Load grammar with all imports resolved
   */
  static loadGrammarWithImports(
    filePath: string,
    basePath?: string,
    cache: Map<string, GrammarAnalysis> = new Map(),
    visited: Set<string> = new Set()
  ): GrammarAnalysis {
    // Normalize path
    const normalizedPath = path.resolve(filePath);

    // Check cache
    if (cache.has(normalizedPath)) {
      return cache.get(normalizedPath)!;
    }

    // Detect circular imports
    if (visited.has(normalizedPath)) {
      console.warn(`Circular import detected: ${normalizedPath}`);
      return {
        grammarName: path.basename(normalizedPath, '.g4'),
        type: 'combined',
        rules: [],
        tokens: [],
        imports: [],
        options: {},
        issues: [
          {
            type: 'warning',
            message: `Circular import: ${normalizedPath}`,
          },
        ],
      };
    }

    visited.add(normalizedPath);

    // Read file
    let grammarContent: string;
    try {
      grammarContent = fs.readFileSync(normalizedPath, 'utf-8');
    } catch (error: any) {
      return {
        grammarName: path.basename(normalizedPath, '.g4'),
        type: 'combined',
        rules: [],
        tokens: [],
        imports: [],
        options: {},
        issues: [
          {
            type: 'error',
            message: `Failed to read file: ${error.message}`,
          },
        ],
      };
    }

    // Analyze main grammar
    const mainAnalysis = this.analyze(grammarContent);

    // Parse imports
    const importNames = this.parseImports(grammarContent);

    // Load imported grammars
    const importedAnalyses: GrammarAnalysis[] = [];
    for (const importName of importNames) {
      const importPath = this.resolveImportPath(importName, normalizedPath, basePath);

      if (importPath) {
        const importedAnalysis = this.loadGrammarWithImports(
          importPath,
          basePath,
          cache,
          new Set(visited) // Copy visited set for each import
        );
        importedAnalyses.push(importedAnalysis);
      } else {
        mainAnalysis.issues.push({
          type: 'warning',
          message: `Cannot resolve import: ${importName}`,
        });
      }
    }

    // Parse tokenVocab option
    const tokenVocab = this.parseTokenVocab(grammarContent);
    if (tokenVocab) {
      const vocabPath = this.resolveImportPath(tokenVocab, normalizedPath, basePath);

      if (vocabPath) {
        const vocabAnalysis = this.loadGrammarWithImports(
          vocabPath,
          basePath,
          cache,
          new Set(visited)
        );
        importedAnalyses.push(vocabAnalysis);
      } else {
        mainAnalysis.issues.push({
          type: 'warning',
          message: `Cannot resolve tokenVocab: ${tokenVocab}`,
        });
      }
    }

    // Merge analyses
    const mergedAnalysis = this.mergeAnalyses(mainAnalysis, importedAnalyses);

    // Re-run validation on merged result to properly check rule references
    // This fixes the issue where validation ran before imports were merged
    const importResolutionIssues = mergedAnalysis.issues.filter(
      (issue) =>
        issue.message.includes('Cannot resolve import') ||
        issue.message.includes('Cannot resolve tokenVocab') ||
        issue.message.includes('Circular import') ||
        issue.message.includes('Failed to read file')
    );
    mergedAnalysis.issues = [...importResolutionIssues, ...this.validateGrammar(mergedAnalysis)];

    // Cache result
    cache.set(normalizedPath, mergedAnalysis);

    return mergedAnalysis;
  }

  /**
   * Merge multiple grammar analyses into one
   */
  static mergeAnalyses(
    mainAnalysis: GrammarAnalysis,
    importedAnalyses: GrammarAnalysis[]
  ): GrammarAnalysis {
    const mergedRules: GrammarRule[] = [...mainAnalysis.rules];
    const mergedTokens: GrammarToken[] = [...mainAnalysis.tokens];
    const mergedIssues: GrammarIssue[] = [...mainAnalysis.issues];
    const allImports: string[] = [...mainAnalysis.imports];

    // Track seen rule names to avoid duplicates
    const seenRules = new Set(mainAnalysis.rules.map((r) => r.name));
    const seenTokens = new Set(mainAnalysis.tokens.map((t) => t.name));

    for (const imported of importedAnalyses) {
      // Add rules not already present
      for (const rule of imported.rules) {
        if (!seenRules.has(rule.name)) {
          mergedRules.push(rule);
          seenRules.add(rule.name);
        }
      }

      // Add tokens not already present
      for (const token of imported.tokens) {
        if (!seenTokens.has(token.name)) {
          mergedTokens.push(token);
          seenTokens.add(token.name);
        }
      }

      // Merge imports
      allImports.push(...imported.imports.filter((i) => !allImports.includes(i)));

      // Add issues from imported grammars (with context)
      for (const issue of imported.issues) {
        mergedIssues.push({
          ...issue,
          message: `[${imported.grammarName}] ${issue.message}`,
        });
      }
    }

    return {
      ...mainAnalysis,
      rules: mergedRules,
      tokens: mergedTokens,
      imports: allImports,
      issues: mergedIssues,
    };
  }

  /**
   * Smart validation aggregation - groups similar issues for actionable insights
   */
  static aggregateValidationIssues(issues: GrammarIssue[]): {
    summary: string;
    groups: Array<{
      category: string;
      count: number;
      uniqueItems: number;
      topItems: Array<{ name: string; count: number }>;
      suggestion?: string;
    }>;
  } {
    // Group undefined rule references
    const undefinedRefs = new Map<string, number>();
    const suspiciousQuantifiers: string[] = [];
    const nullUsages: string[] = [];
    const otherIssues: GrammarIssue[] = [];

    for (const issue of issues) {
      if (issue.message.includes('Reference to undefined rule:')) {
        const ruleName = issue.message.match(/Reference to undefined rule: (\w+)/)?.[1];
        if (ruleName) {
          undefinedRefs.set(ruleName, (undefinedRefs.get(ruleName) || 0) + 1);
        }
      } else if (issue.message.includes('Suspicious quantifier')) {
        suspiciousQuantifiers.push(issue.ruleName || 'unknown');
      } else if (issue.message.includes('null_rest_of_line')) {
        nullUsages.push(issue.ruleName || 'unknown');
      } else {
        otherIssues.push(issue);
      }
    }

    const groups = [];

    // Undefined tokens group
    if (undefinedRefs.size > 0) {
      const totalRefs = Array.from(undefinedRefs.values()).reduce((a, b) => a + b, 0);
      const topItems = Array.from(undefinedRefs.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      groups.push({
        category: 'Undefined Token References',
        count: totalRefs,
        uniqueItems: undefinedRefs.size,
        topItems,
        suggestion: `Add ${undefinedRefs.size} missing lexer tokens. Top priority: ${topItems
          .slice(0, 3)
          .map((t) => t.name)
          .join(', ')}`,
      });
    }

    // Suspicious quantifiers group
    if (suspiciousQuantifiers.length > 0) {
      const unique = [...new Set(suspiciousQuantifiers)];
      groups.push({
        category: 'Suspicious Quantifiers',
        count: suspiciousQuantifiers.length,
        uniqueItems: unique.length,
        topItems: unique.slice(0, 10).map((name) => ({ name, count: 1 })),
        suggestion: `Review ${unique.length} rules using '?' that may need '*' for multiple occurrences`,
      });
    }

    // null_rest_of_line usage group
    if (nullUsages.length > 0) {
      const unique = [...new Set(nullUsages)];
      groups.push({
        category: 'Incomplete Parsing (null_rest_of_line)',
        count: nullUsages.length,
        uniqueItems: unique.length,
        topItems: unique.slice(0, 10).map((name) => ({ name, count: 1 })),
        suggestion: `${unique.length} rules discard content instead of parsing it properly`,
      });
    }

    // Other issues
    if (otherIssues.length > 0) {
      groups.push({
        category: 'Other Issues',
        count: otherIssues.length,
        uniqueItems: otherIssues.length,
        topItems: otherIssues.slice(0, 5).map((i) => ({ name: i.message, count: 1 })),
      });
    }

    const summary =
      `Total: ${issues.length} issues across ${groups.length} categories. ` +
      `Priority: ${groups[0]?.suggestion || 'No major issues'}`;

    return { summary, groups };
  }

  /**
   * Detect suspicious quantifier patterns (? that should probably be *)
   */
  static detectSuspiciousQuantifiers(grammar: GrammarAnalysis): Array<{
    ruleName: string;
    lineNumber: number;
    pattern: string;
    suggestion: string;
    reasoning: string;
  }> {
    const suspicious = [];

    for (const rule of grammar.rules) {
      const def = rule.definition;

      // Pattern 1: Multiple optional similar elements (a? b? c?) - might need (a | b | c)*
      const multipleOptionals = def.match(/(\w+\?[\s\n]*){3,}/g);
      if (multipleOptionals) {
        suspicious.push({
          ruleName: rule.name,
          lineNumber: rule.lineNumber,
          pattern: multipleOptionals[0].trim(),
          suggestion: `Consider using (element1 | element2 | element3)* instead of element1? element2? element3?`,
          reasoning: 'Multiple optional elements suggest zero-or-more alternatives',
        });
      }

      // Pattern 2: Rule names suggesting collections (rules, settings, properties) with ?
      if (
        (rule.name.includes('_rule') ||
          rule.name.includes('_setting') ||
          rule.name.includes('_property')) &&
        def.includes('?')
      ) {
        const optionalPart = def.match(/(\w+\?)/g);
        if (optionalPart) {
          suspicious.push({
            ruleName: rule.name,
            lineNumber: rule.lineNumber,
            pattern: optionalPart.join(' '),
            suggestion: `Rule name suggests multiple items - consider changing ? to *`,
            reasoning: `Names with '_rule', '_setting', '_property' typically allow multiple occurrences`,
          });
        }
      }

      // Pattern 3: Repeated references to same rule with ?
      const references = def.match(/\w+\?/g);
      if (references) {
        const refCounts = new Map<string, number>();
        for (const ref of references) {
          const name = ref.replace('?', '');
          refCounts.set(name, (refCounts.get(name) || 0) + 1);
        }
        for (const [refName, count] of refCounts) {
          if (count > 1) {
            suspicious.push({
              ruleName: rule.name,
              lineNumber: rule.lineNumber,
              pattern: `${refName}? appears ${count} times`,
              suggestion: `Use ${refName}* for multiple occurrences`,
              reasoning: 'Same optional reference appears multiple times',
            });
          }
        }
      }
    }

    return suspicious;
  }

  /**
   * Detect null_rest_of_line usage (incomplete parsing anti-pattern)
   */
  static detectIncompleteParsing(grammar: GrammarAnalysis): Array<{
    ruleName: string;
    lineNumber: number;
    pattern: string;
    suggestion: string;
  }> {
    const incomplete = [];

    for (const rule of grammar.rules) {
      if (rule.definition.includes('null_rest_of_line')) {
        incomplete.push({
          ruleName: rule.name,
          lineNumber: rule.lineNumber,
          pattern: 'null_rest_of_line',
          suggestion: `This discards content. Consider implementing proper structure parsing for: ${rule.name}`,
        });
      }

      // Also detect other anti-patterns
      if (rule.definition.match(/~\[.*\]\+/) && rule.definition.length < 50) {
        incomplete.push({
          ruleName: rule.name,
          lineNumber: rule.lineNumber,
          pattern: 'Simple negation pattern',
          suggestion: `Rule uses ~[...] which may be too broad. Consider specific token types.`,
        });
      }
    }

    return incomplete;
  }

  /**
   * Generate smart suggestions for undefined tokens based on naming patterns
   */
  static suggestMissingTokens(undefinedRules: string[]): Array<{
    tokenName: string;
    suggestedPattern: string;
    reasoning: string;
  }> {
    const suggestions = [];

    for (const token of undefinedRules) {
      let pattern = '';
      let reasoning = '';

      // Pattern-based suggestions (order matters - check specific patterns first)
      if (token.includes('USERNAME') || token.includes('USER')) {
        pattern = `[a-zA-Z][a-zA-Z0-9_@.-]*`;
        reasoning = 'Usernames may include @ and dots';
      } else if (token.includes('ADDRESS')) {
        pattern = `[a-zA-Z0-9][a-zA-Z0-9._-]*`;
        reasoning = 'Addresses can include dots and dashes';
      } else if (token.includes('INTERFACE')) {
        pattern = `[a-zA-Z][a-zA-Z0-9_/-]*`;
        reasoning = 'Interface names often include slashes';
      } else if (token.includes('EVENT')) {
        pattern = `[a-zA-Z][a-zA-Z0-9_-]*`;
        reasoning = 'Event names typically use alphanumeric';
      } else if (token.endsWith('_REGEX')) {
        pattern = `~[ \\t\\r\\n]+`;
        reasoning = 'Regex patterns typically match non-whitespace';
      } else if (token.endsWith('_TYPE')) {
        pattern = `[a-zA-Z][a-zA-Z0-9_-]*`;
        reasoning = 'Type identifiers typically use alphanumeric with dashes';
      } else if (token.endsWith('_ID') || token.endsWith('_IDENTIFIER')) {
        pattern = `[a-zA-Z_][a-zA-Z0-9_]*`;
        reasoning = 'Identifiers typically start with letter/underscore';
      } else {
        // Default pattern
        pattern = `[a-zA-Z_][a-zA-Z0-9_-]*`;
        reasoning = 'Generic token pattern';
      }

      suggestions.push({
        tokenName: token,
        suggestedPattern: pattern,
        reasoning,
      });
    }

    return suggestions;
  }

  /**
   * Bulk fix suspicious quantifiers - changes )? to )* where appropriate
   */
  static fixSuspiciousQuantifiers(
    grammarContent: string,
    options: {
      ruleNames?: string[]; // Only fix these specific rules
      dryRun?: boolean; // Don't modify, just report what would change
    } = {}
  ): {
    success: boolean;
    modified: string;
    changes: Array<{
      ruleName: string;
      lineNumber: number;
      oldPattern: string;
      newPattern: string;
      reasoning: string;
    }>;
    message: string;
  } {
    const analysis = this.analyze(grammarContent);
    const suspicious = this.detectSuspiciousQuantifiers(analysis);
    const changes = [];

    let modified = grammarContent;

    // Determine which rules to fix
    const rulesToFix =
      options.ruleNames && options.ruleNames.length > 0
        ? suspicious.filter((s) => options.ruleNames!.includes(s.ruleName))
        : suspicious; // Default: all suspicious

    for (const issue of rulesToFix) {
      const rule = analysis.rules.find((r) => r.name === issue.ruleName);
      if (!rule) continue;

      const oldDef = rule.definition;
      // Look for )? at the end or within the definition
      const newDef = oldDef.replace(/\)\?(\s*)([;:])/g, ')*$1$2');

      if (oldDef !== newDef) {
        modified = modified.replace(oldDef, newDef);

        changes.push({
          ruleName: issue.ruleName,
          lineNumber: issue.lineNumber,
          oldPattern: ')?',
          newPattern: ')*',
          reasoning: issue.reasoning,
        });
      }
    }

    const message = options.dryRun
      ? `Would fix ${changes.length} of ${suspicious.length} detected issue(s)`
      : `Fixed ${changes.length} of ${suspicious.length} detected issue(s)`;

    return {
      success: true,
      modified: options.dryRun ? grammarContent : modified,
      changes,
      message,
    };
  }
}
