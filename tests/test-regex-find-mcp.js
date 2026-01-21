import { AntlrAnalyzer } from './dist/antlrAnalyzer.js';

const grammar = `grammar Calc;

expr : term ((ADD | SUB) term)*;
term : factor ((MUL | DIV) factor)*;
factor : NUMBER | '(' expr ')' | variable;
variable : ID;

ADD : '+';
SUB : '-';
MUL : '*';
DIV : '/';
NUMBER : [0-9]+;
ID : [a-zA-Z_][a-zA-Z0-9_]*;
WS : [ \\t\\n\\r]+ -> skip;
`;

console.log('=== Grammar ===\n' + grammar);

// Simulate MCP tool calls
function simulateMCPFindRule(useRegex, pattern) {
  console.log(`\n=== MCP Call: find-rule (use_regex=${useRegex}, pattern="${pattern}") ===`);

  if (useRegex) {
    const result = AntlrAnalyzer.findRulesByRegex(grammar, pattern);

    if (result.error) {
      console.log(`Error: ${result.error}`);
      return;
    }

    if (result.count === 0) {
      console.log(`No rules found matching pattern: ${pattern}`);
      return;
    }

    const analysis = AntlrAnalyzer.analyze(grammar);
    let text = `Found ${result.count} rule(s) matching pattern: ${pattern}\n\n`;

    for (const rule of result.matches) {
      text += `Rule: ${rule.name}\nType: ${rule.type}\nLine: ${rule.lineNumber}\nDefinition: ${rule.definition}\n`;

      if (rule.referencedRules.length > 0) {
        text += `References: ${rule.referencedRules.join(', ')}\n`;
      }

      const referencedBy = analysis.rules.filter(r => r.referencedRules.includes(rule.name)).map(r => r.name);
      if (referencedBy.length > 0) {
        text += `Referenced by: ${referencedBy.join(', ')}\n`;
      }

      text += '\n';
    }

    console.log(text.trim());
  } else {
    const analysis = AntlrAnalyzer.analyze(grammar);
    const rule = analysis.rules.find(r => r.name === pattern);

    if (!rule) {
      console.log(`Rule '${pattern}' not found in grammar`);
      return;
    }

    let text = `Rule: ${rule.name}\nType: ${rule.type}\nLine: ${rule.lineNumber}\n\nDefinition:\n${rule.definition}`;

    if (rule.referencedRules.length > 0) {
      text += `\n\nReferences:\n${rule.referencedRules.join(', ')}`;
    }

    const referencedBy = analysis.rules.filter(r => r.referencedRules.includes(pattern)).map(r => r.name);
    if (referencedBy.length > 0) {
      text += `\n\nReferenced by:\n${referencedBy.join(', ')}`;
    }

    console.log(text);
  }
}

// Test cases
console.log('\n========================================');
console.log('TEST CASES FOR REGEX FIND-RULE');
console.log('========================================');

simulateMCPFindRule(false, 'expr');
simulateMCPFindRule(true, '^[a-z]+$');
simulateMCPFindRule(true, '.*[aeiou].*');
simulateMCPFindRule(true, '^(ADD|SUB|MUL|DIV)$');
simulateMCPFindRule(false, 'nonexistent');
simulateMCPFindRule(true, '[invalid');
