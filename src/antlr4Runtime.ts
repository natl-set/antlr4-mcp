/**
 * Native ANTLR4 Runtime Integration
 *
 * Provides 100% accurate tokenization and parsing by using the actual ANTLR4
 * Java runtime instead of simulation. Supports all ANTLR4 features:
 * - Lexer modes (pushMode, popMode)
 * - Semantic predicates ({...?})
 * - Actions ({...})
 * - Fragment rules
 * - All complex grammar features
 *
 * Falls back gracefully to simulation if ANTLR4 is not available.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface RuntimeConfig {
  antlr4Path?: string; // Path to antlr4 JAR or command
  javaPath?: string; // Path to java executable
  timeout?: number; // Execution timeout in ms (default: 30000)
}

export interface Token {
  type: string;
  text: string;
  line: number;
  column: number;
  channel?: string;
  startIndex?: number;
  stopIndex?: number;
}

export interface TokenizeResult {
  success: boolean;
  tokens: Token[];
  errors?: string[];
  mode: 'native' | 'simulation';
  compilationTime?: number;
  executionTime?: number;
}

export interface ParseResult {
  success: boolean;
  matches: boolean;
  tree?: string;
  errors?: string[];
  mode: 'native' | 'simulation';
  ruleInvoked?: string;
}

export interface CompileResult {
  success: boolean;
  mode: 'native' | 'simulation';
  diagnostics: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    file?: string;
    line?: number;
    column?: number;
  }>;
  generatedFiles?: string[];
  compilationTime?: number;
  errors?: string[];
}

/**
 * ANTLR4 Native Runtime Wrapper
 *
 * Detects and uses installed ANTLR4 runtime for 100% accurate parsing.
 * Automatically falls back to simulation if not available.
 */
export class Antlr4Runtime {
  private config: Required<RuntimeConfig>;
  private availabilityChecked: boolean = false;
  private available: boolean = false;
  private antlr4Command: string | null = null;

  constructor(config: RuntimeConfig = {}) {
    const javaPathFromJavaHome = process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : '';
    this.config = {
      antlr4Path: config.antlr4Path || process.env.ANTLR4_JAR || '',
      javaPath: config.javaPath || javaPathFromJavaHome || 'java',
      timeout: config.timeout || 30000,
    };
  }

  /**
   * Check if ANTLR4 runtime is available on the system
   *
   * Checks for:
   * 1. Java installation
   * 2. ANTLR4 JAR file (if path provided)
   * 3. antlr4 command (if no JAR path)
   *
   * Results are cached after first check.
   */
  async isAvailable(): Promise<boolean> {
    if (this.availabilityChecked) {
      return this.available;
    }

    this.availabilityChecked = true;

    try {
      // Check Java
      const { stdout: javaVersion } = await execAsync(`${this.config.javaPath} -version 2>&1`, {
        timeout: 5000,
      });

      if (!javaVersion.toLowerCase().includes('version')) {
        return false;
      }

      // Check ANTLR4
      if (this.config.antlr4Path && fs.existsSync(this.config.antlr4Path)) {
        // JAR file exists - test it
        try {
          await execAsync(`${this.config.javaPath} -jar ${this.config.antlr4Path} 2>&1`, {
            timeout: 5000,
          });
          this.antlr4Command = `${this.config.javaPath} -jar ${this.config.antlr4Path}`;
          this.available = true;
          return true;
        } catch {
          // JAR file exists but doesn't work
          return false;
        }
      }

      // Try antlr4 command
      try {
        const { stdout: antlrVersion } = await execAsync('antlr4 2>&1', {
          timeout: 5000,
        });

        if (antlrVersion.toLowerCase().includes('antlr')) {
          this.antlr4Command = 'antlr4';
          this.available = true;
          return true;
        }
      } catch {
        // antlr4 command not found
      }

      // Try grun command (indicates ANTLR4 is installed)
      try {
        await execAsync('grun 2>&1', {
          timeout: 5000,
        });
        // If grun exists, assume antlr4 tools are available
        this.antlr4Command = 'antlr4';
        this.available = true;
        return true;
      } catch {
        // grun not found
      }

      this.available = false;
      return false;
    } catch {
      this.available = false;
      return false;
    }
  }

  /**
   * Get installation instructions for the user's platform
   */
  getInstallInstructions(): string {
    const platform = os.platform();

    let instructions = 'To enable native ANTLR4 support:\n\n';

    // Java installation
    instructions += '1. Install Java:\n';
    if (platform === 'darwin') {
      instructions += '   brew install openjdk\n';
    } else if (platform === 'linux') {
      instructions += '   sudo apt install default-jdk   # Debian/Ubuntu\n';
      instructions += '   sudo yum install java-devel    # RedHat/CentOS\n';
    } else {
      instructions += '   Download from: https://adoptium.net/\n';
    }

    instructions += '\n2. Install ANTLR4:\n';
    instructions += '   cd /usr/local/lib\n';
    instructions += '   wget https://www.antlr.org/download/antlr-4.13.1-complete.jar\n';
    instructions += '\n3. Set environment variables:\n';
    instructions += '   export ANTLR4_JAR=/usr/local/lib/antlr-4.13.1-complete.jar\n';
    instructions += '   export CLASSPATH=".:$ANTLR4_JAR:$CLASSPATH"\n';
    instructions += "   alias antlr4='java -jar $ANTLR4_JAR'\n";
    instructions += "   alias grun='java org.antlr.v4.gui.TestRig'\n";
    instructions += '\nAdd these to your ~/.bashrc or ~/.zshrc to make them permanent.\n';

    return instructions;
  }

  /**
   * Tokenize input using native ANTLR4 lexer
   *
   * This provides 100% accurate tokenization including:
   * - Lexer mode transitions
   * - Semantic predicate evaluation
   * - Action execution
   * - All ANTLR4 features
   *
   * @param grammarContent - The lexer grammar content
   * @param input - Input text to tokenize
   * @param options - Additional options
   */
  async tokenize(
    grammarContent: string,
    input: string,
    options: {
      grammarName?: string;
      loadImports?: boolean;
      basePath?: string;
    } = {}
  ): Promise<TokenizeResult> {
    const available = await this.isAvailable();

    if (!available) {
      return {
        success: false,
        tokens: [],
        errors: [
          'ANTLR4 runtime not available. Install Java and ANTLR4 for accurate tokenization.',
        ],
        mode: 'simulation',
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antlr4-mcp-'));

    try {
      // Extract grammar name
      const grammarName =
        options.grammarName ||
        grammarContent.match(/(?:lexer\s+)?grammar\s+(\w+)/)?.[1] ||
        'TempGrammar';

      // Write grammar file
      const grammarFile = path.join(tmpDir, `${grammarName}.g4`);
      fs.writeFileSync(grammarFile, grammarContent, 'utf-8');

      // Handle imports if needed
      if (options.loadImports && options.basePath) {
        await this.copyImportedGrammars(grammarContent, options.basePath, tmpDir);
      }

      // Write input file
      const inputFile = path.join(tmpDir, 'input.txt');
      fs.writeFileSync(inputFile, input, 'utf-8');

      // Compile grammar
      const compileStart = Date.now();
      await execAsync(`cd ${tmpDir} && ${this.antlr4Command} ${grammarName}.g4`, {
        timeout: this.config.timeout,
      });

      // Compile Java
      await execAsync(`cd ${tmpDir} && javac -cp "${this.getClasspath()}" ${grammarName}*.java`, {
        timeout: this.config.timeout,
      });
      const compileTime = Date.now() - compileStart;

      // Run lexer with TestRig (grun)
      const execStart = Date.now();
      const grunCmd = this.getGrunCommand(tmpDir, grammarName, 'tokens', inputFile, ['-tokens']);
      const { stdout, stderr } = await execAsync(grunCmd, {
        timeout: this.config.timeout,
      });
      const execTime = Date.now() - execStart;

      // Parse token output
      const tokens = this.parseTokenOutput(stdout);

      const errors = stderr.trim() ? [stderr] : undefined;

      return {
        success: true,
        tokens,
        errors,
        mode: 'native',
        compilationTime: compileTime,
        executionTime: execTime,
      };
    } catch (error: any) {
      return {
        success: false,
        tokens: [],
        errors: [this.formatError(error)],
        mode: 'native',
      };
    } finally {
      // Cleanup temporary directory
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Test parser rule using native ANTLR4 parser
   *
   * Provides 100% accurate parsing including all ANTLR4 features.
   *
   * @param grammarContent - Combined or parser grammar content
   * @param ruleName - The parser rule to test
   * @param input - Input text to parse
   * @param options - Additional options
   */
  async testParserRule(
    grammarContent: string,
    ruleName: string,
    input: string,
    options: {
      grammarName?: string;
      loadImports?: boolean;
      basePath?: string;
      showTree?: boolean;
    } = {}
  ): Promise<ParseResult> {
    const available = await this.isAvailable();

    if (!available) {
      return {
        success: false,
        matches: false,
        errors: ['ANTLR4 runtime not available.'],
        mode: 'simulation',
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antlr4-mcp-'));

    try {
      const grammarName =
        options.grammarName ||
        grammarContent.match(/(?:parser\s+)?grammar\s+(\w+)/)?.[1] ||
        'TempGrammar';

      // Write grammar
      const grammarFile = path.join(tmpDir, `${grammarName}.g4`);
      fs.writeFileSync(grammarFile, grammarContent, 'utf-8');

      // Handle imports
      if (options.loadImports && options.basePath) {
        await this.copyImportedGrammars(grammarContent, options.basePath, tmpDir);
      }

      // Write input
      const inputFile = path.join(tmpDir, 'input.txt');
      fs.writeFileSync(inputFile, input, 'utf-8');

      // Compile grammar
      await execAsync(`cd ${tmpDir} && ${this.antlr4Command} ${grammarName}.g4`, {
        timeout: this.config.timeout,
      });

      // Compile Java
      await execAsync(`cd ${tmpDir} && javac -cp "${this.getClasspath()}" ${grammarName}*.java`, {
        timeout: this.config.timeout,
      });

      // Run parser
      const flags = options.showTree ? ['-tree'] : ['-tokens'];
      const grunCmd = this.getGrunCommand(tmpDir, grammarName, ruleName, inputFile, flags);
      const { stdout, stderr } = await execAsync(grunCmd, {
        timeout: this.config.timeout,
      });

      // Check for parse errors
      const hasErrors =
        stderr.toLowerCase().includes('error') ||
        stderr.includes('mismatched input') ||
        stderr.includes('no viable alternative');

      return {
        success: true,
        matches: !hasErrors,
        tree: options.showTree ? stdout : undefined,
        errors: hasErrors ? [stderr] : undefined,
        mode: 'native',
        ruleInvoked: ruleName,
      };
    } catch (error: any) {
      return {
        success: false,
        matches: false,
        errors: [this.formatError(error)],
        mode: 'native',
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Compile grammar(s) with native ANTLR4 for strict syntax/tooling validation.
   */
  async compileGrammar(
    grammarContent: string,
    options: {
      grammarName?: string;
      fromFile?: string;
      basePath?: string;
      loadImports?: boolean;
    } = {}
  ): Promise<CompileResult> {
    const available = await this.isAvailable();
    if (!available) {
      return {
        success: false,
        mode: 'simulation',
        diagnostics: [],
        errors: [
          'ANTLR4 runtime not available. Install Java and ANTLR4 for native compile checks.',
        ],
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antlr4-compile-'));

    try {
      const grammarName =
        options.grammarName ||
        grammarContent.match(/(?:lexer\s+|parser\s+)?grammar\s+(\w+)/)?.[1] ||
        'TempGrammar';
      const grammarFilename = options.fromFile
        ? path.basename(options.fromFile)
        : `${grammarName}.g4`;
      const grammarFile = path.join(tmpDir, grammarFilename);
      fs.writeFileSync(grammarFile, grammarContent, 'utf-8');

      if (options.loadImports) {
        const importBase =
          options.basePath || (options.fromFile ? path.dirname(options.fromFile) : undefined);
        if (importBase) {
          await this.copyImportedGrammars(grammarContent, importBase, tmpDir);
        }
      }

      const compileStart = Date.now();
      const { stdout, stderr } = await execAsync(`cd ${tmpDir} && ${this.antlr4Command} *.g4`, {
        timeout: this.config.timeout,
      });
      const compilationTime = Date.now() - compileStart;

      const diagnostics = this.parseAntlrDiagnostics(`${stdout}\n${stderr}`);
      const generatedFiles = fs
        .readdirSync(tmpDir)
        .filter((f) => f.endsWith('.java') || f.endsWith('.tokens') || f.endsWith('.interp'))
        .sort();

      return {
        success: !diagnostics.some((d) => d.severity === 'error'),
        mode: 'native',
        diagnostics,
        generatedFiles,
        compilationTime,
      };
    } catch (error: any) {
      const combined = [error.stdout || '', error.stderr || '', error.message || '']
        .filter(Boolean)
        .join('\n');
      const diagnostics = this.parseAntlrDiagnostics(combined);
      return {
        success: false,
        mode: 'native',
        diagnostics,
        errors: diagnostics.length > 0 ? undefined : [this.formatError(error)],
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Copy imported grammars to temporary directory
   */
  private async copyImportedGrammars(
    grammarContent: string,
    basePath: string,
    tmpDir: string,
    visited: Set<string> = new Set()
  ): Promise<void> {
    const imports = grammarContent.match(/import\s+([^;]+);/g) || [];
    const tokenVocabMatch = grammarContent.match(/tokenVocab\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/);
    const vocabName = tokenVocabMatch?.[1];
    const importNames = new Set<string>();

    for (const imp of imports) {
      const names = imp
        .replace(/import\s+|;/g, '')
        .split(',')
        .map((s) => s.trim());
      for (const name of names) {
        importNames.add(name);
      }
    }
    if (vocabName) {
      importNames.add(vocabName);
    }

    for (const name of importNames) {
      if (visited.has(name)) {
        continue;
      }
      visited.add(name);

      const importFile = path.join(basePath, `${name}.g4`);
      if (fs.existsSync(importFile)) {
        fs.copyFileSync(importFile, path.join(tmpDir, `${name}.g4`));

        // Recursively copy imports from imported grammars
        const importedContent = fs.readFileSync(importFile, 'utf-8');
        await this.copyImportedGrammars(importedContent, path.dirname(importFile), tmpDir, visited);
      }
    }
  }

  private parseAntlrDiagnostics(output: string): Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    file?: string;
    line?: number;
    column?: number;
  }> {
    const diagnostics: Array<{
      severity: 'error' | 'warning' | 'info';
      message: string;
      file?: string;
      line?: number;
      column?: number;
    }> = [];

    const lines = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^(error|warning)\(\d+\):\s*([^:]+):(\d+):(\d+):\s*(.+)$/i);
      if (match) {
        diagnostics.push({
          severity: match[1].toLowerCase() as 'error' | 'warning',
          file: match[2],
          line: Number(match[3]),
          column: Number(match[4]),
          message: match[5],
        });
        continue;
      }

      const lower = line.toLowerCase();
      if (lower.includes('error')) {
        diagnostics.push({ severity: 'error', message: line });
      } else if (lower.includes('warning')) {
        diagnostics.push({ severity: 'warning', message: line });
      }
    }

    return diagnostics;
  }

  /**
   * Get classpath for ANTLR4 compilation
   */
  private getClasspath(): string {
    if (this.config.antlr4Path && fs.existsSync(this.config.antlr4Path)) {
      return `${this.config.antlr4Path}:.`;
    }
    return '.';
  }

  /**
   * Build grun (TestRig) command
   */
  private getGrunCommand(
    workDir: string,
    grammarName: string,
    startRule: string,
    inputFile: string,
    flags: string[]
  ): string {
    const flagsStr = flags.join(' ');

    if (this.config.antlr4Path && fs.existsSync(this.config.antlr4Path)) {
      // Use TestRig directly with JAR in classpath
      return `cd ${workDir} && ${this.config.javaPath} -cp "${this.config.antlr4Path}:." org.antlr.v4.gui.TestRig ${grammarName} ${startRule} ${flagsStr} ${inputFile}`;
    } else {
      // Use grun alias
      return `cd ${workDir} && grun ${grammarName} ${startRule} ${flagsStr} ${inputFile}`;
    }
  }

  /**
   * Parse token output from TestRig
   *
   * Example format:
   * [@0,0:2='set',<SET>,1:0]
   * [@1,4:22='user-id-collector',<USER_ID_COLLECTOR>,1:4]
   */
  private parseTokenOutput(output: string): Token[] {
    const tokens: Token[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Parse: [@0,0:2='set',<SET>,1:0]
      const match = line.match(
        /@\d+,(\d+):(\d+)='([^']*)',<([^>]+)>,(\d+):(\d+)(?:,channel=(\w+))?/
      );
      if (match) {
        tokens.push({
          type: match[4],
          text: match[3],
          line: parseInt(match[5]),
          column: parseInt(match[6]),
          channel: match[7],
          startIndex: parseInt(match[1]),
          stopIndex: parseInt(match[2]),
        });
      }
    }

    return tokens;
  }

  /**
   * Benchmark grammar parsing performance using native ANTLR4
   *
   * @param grammarFiles - Map of filename to content for all grammar files
   * @param startRule - The parser rule to start from
   * @param input - Input text to parse
   * @param options - Benchmark options
   */
  async benchmark(
    grammarFiles: Map<string, string>,
    startRule: string,
    input: string,
    options: {
      iterations?: number;
      warmupIterations?: number;
    } = {}
  ): Promise<{
    success: boolean;
    metrics: {
      avgTimeMs: number;
      minTimeMs: number;
      maxTimeMs: number;
      stdDevMs: number;
      totalTokens: number;
      inputSize: number;
      throughput: number;
      iterations: number;
    };
    errors?: string[];
    performanceRating: 'excellent' | 'good' | 'fair' | 'slow';
  }> {
    const iterations = options.iterations || 10;
    const warmupIterations = options.warmupIterations || 3;

    const available = await this.isAvailable();
    if (!available) {
      return {
        success: false,
        metrics: {
          avgTimeMs: 0,
          minTimeMs: 0,
          maxTimeMs: 0,
          stdDevMs: 0,
          totalTokens: 0,
          inputSize: input.length,
          throughput: 0,
          iterations: 0,
        },
        errors: ['ANTLR4 runtime not available. Install Java and ANTLR4 JAR.'],
        performanceRating: 'slow',
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antlr4-bench-'));

    try {
      // Write all grammar files
      let mainGrammarName = '';
      for (const [filename, content] of grammarFiles) {
        const filePath = path.join(tmpDir, filename);
        fs.writeFileSync(filePath, content, 'utf-8');

        // Detect main grammar name from parser grammar
        const parserMatch = content.match(/parser\s+grammar\s+(\w+)/);
        const combinedMatch = content.match(/^grammar\s+(\w+)/m);
        if (parserMatch) {
          mainGrammarName = parserMatch[1];
        } else if (combinedMatch && !mainGrammarName) {
          mainGrammarName = combinedMatch[1];
        }
      }

      // Detect lexer name
      let lexerName = mainGrammarName;
      for (const [, content] of grammarFiles) {
        const lexerMatch = content.match(/lexer\s+grammar\s+(\w+)/);
        if (lexerMatch) {
          lexerName = lexerMatch[1];
          break;
        }
      }

      if (!mainGrammarName) {
        throw new Error('Could not detect grammar name');
      }

      // Write input file
      const inputFile = path.join(tmpDir, 'input.txt');
      fs.writeFileSync(inputFile, input, 'utf-8');

      // Write benchmark Java driver
      const benchmarkJava = `
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.tree.*;
import java.nio.file.Files;
import java.nio.file.Paths;

public class Benchmark {
    public static void main(String[] args) throws Exception {
        String lexerName = "${lexerName}";
        String parserName = "${mainGrammarName}";
        String startRule = "${startRule}";
        String inputFile = "${inputFile}";
        int iterations = ${iterations};
        int warmup = ${warmupIterations};

        String input = new String(Files.readAllBytes(Paths.get(inputFile)));
        int inputSize = input.length();

        Class<?> lexerClass = Class.forName(lexerName + "Lexer");
        Class<?> parserClass = Class.forName(parserName + "Parser");

        // Warmup
        for (int i = 0; i < warmup; i++) {
            parse(lexerClass, parserClass, startRule, input);
        }

        // Timed runs
        long[] times = new long[iterations];
        int totalTokens = 0;
        for (int i = 0; i < iterations; i++) {
            long start = System.nanoTime();
            CommonTokenStream tokens = parse(lexerClass, parserClass, startRule, input);
            long end = System.nanoTime();
            times[i] = end - start;
            if (i == 0) totalTokens = tokens.getNumberOfOnChannelTokens();
        }

        // Calculate stats
        long sum = 0, min = Long.MAX_VALUE, max = Long.MIN_VALUE;
        for (long t : times) {
            sum += t;
            if (t < min) min = t;
            if (t > max) max = t;
        }
        double avg = (double) sum / iterations;
        double variance = 0;
        for (long t : times) variance += Math.pow(t - avg, 2);
        double stdDev = Math.sqrt(variance / iterations);

        System.out.println("{\"avgMs\":" + (avg/1e6) + ",\"minMs\":" + (min/1e6) +
            ",\"maxMs\":" + (max/1e6) + ",\"stdDevMs\":" + (stdDev/1e6) +
            ",\"tokens\":" + totalTokens + ",\"inputSize\":" + inputSize +
            ",\"throughput\":" + (inputSize / (avg / 1e9)) + "}");
    }

    static CommonTokenStream parse(Class<?> lexerClass, Class<?> parserClass,
                                   String startRule, String input) throws Exception {
        CharStream chars = CharStreams.fromString(input);
        Lexer lexer = (Lexer) lexerClass.getConstructor(CharStream.class).newInstance(chars);
        CommonTokenStream tokens = new CommonTokenStream(lexer);
        Parser parser = (Parser) parserClass.getConstructor(TokenStream.class).newInstance(tokens);
        parser.getClass().getMethod(startRule).invoke(parser);
        return tokens;
    }
}
`;
      fs.writeFileSync(path.join(tmpDir, 'Benchmark.java'), benchmarkJava, 'utf-8');

      // Compile grammar
      const g4Files = Array.from(grammarFiles.keys())
        .filter((f: string) => f.endsWith('.g4'))
        .map((f: string) => path.basename(f))
        .join(' ');
      await execAsync(`cd ${tmpDir} && ${this.antlr4Command} ${g4Files}`, {
        timeout: this.config.timeout,
      });

      // Compile Java
      await execAsync(`cd ${tmpDir} && javac -cp "${this.getClasspath()}" *.java`, {
        timeout: this.config.timeout,
      });

      // Run benchmark
      const { stdout, stderr } = await execAsync(
        `cd ${tmpDir} && java -cp ".:${this.getClasspath()}" Benchmark`,
        { timeout: this.config.timeout }
      );

      // Parse result
      const result = JSON.parse(stdout.trim());
      const avgMs = result.avgMs;

      let performanceRating: 'excellent' | 'good' | 'fair' | 'slow';
      if (avgMs < 10) performanceRating = 'excellent';
      else if (avgMs < 50) performanceRating = 'good';
      else if (avgMs < 200) performanceRating = 'fair';
      else performanceRating = 'slow';

      return {
        success: true,
        metrics: {
          avgTimeMs: Math.round(result.avgMs * 100) / 100,
          minTimeMs: Math.round(result.minMs * 100) / 100,
          maxTimeMs: Math.round(result.maxMs * 100) / 100,
          stdDevMs: Math.round(result.stdDevMs * 100) / 100,
          totalTokens: result.tokens,
          inputSize: result.inputSize,
          throughput: Math.round(result.throughput),
          iterations,
        },
        errors: stderr.trim() ? [stderr] : undefined,
        performanceRating,
      };
    } catch (error: any) {
      return {
        success: false,
        metrics: {
          avgTimeMs: 0,
          minTimeMs: 0,
          maxTimeMs: 0,
          stdDevMs: 0,
          totalTokens: 0,
          inputSize: input.length,
          throughput: 0,
          iterations: 0,
        },
        errors: [this.formatError(error)],
        performanceRating: 'slow',
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Profile grammar parsing with detailed metrics
   *
   * @param grammarFiles - Map of filename to content for all grammar files
   * @param startRule - The parser rule to start from
   * @param input - Input text to parse
   */
  async profileParsing(
    grammarFiles: Map<string, string>,
    startRule: string,
    input: string
  ): Promise<{
    success: boolean;
    profile: {
      parseTimeMs: number;
      tokenCount: number;
      treeDepth: number;
      decisionCount: number;
      ambiguityCount: number;
      contextSensitivityCount: number;
      errors: string[];
    };
    rules: {
      invoked: string[];
      byFrequency: Array<{ rule: string; count: number }>;
    };
    suggestions: string[];
    errors?: string[];
  }> {
    const available = await this.isAvailable();
    if (!available) {
      return {
        success: false,
        profile: {
          parseTimeMs: 0,
          tokenCount: 0,
          treeDepth: 0,
          decisionCount: 0,
          ambiguityCount: 0,
          contextSensitivityCount: 0,
          errors: [],
        },
        rules: { invoked: [], byFrequency: [] },
        suggestions: ['ANTLR4 runtime not available. Install Java and ANTLR4 JAR.'],
        errors: ['ANTLR4 runtime not available'],
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antlr4-profile-'));

    try {
      // Write all grammar files
      let mainGrammarName = '';
      for (const [filename, content] of grammarFiles) {
        const filePath = path.join(tmpDir, filename);
        fs.writeFileSync(filePath, content, 'utf-8');

        const parserMatch = content.match(/parser\s+grammar\s+(\w+)/);
        const combinedMatch = content.match(/^grammar\s+(\w+)/m);
        if (parserMatch) {
          mainGrammarName = parserMatch[1];
        } else if (combinedMatch && !mainGrammarName) {
          mainGrammarName = combinedMatch[1];
        }
      }

      // Detect lexer name
      let lexerName = mainGrammarName;
      for (const [, content] of grammarFiles) {
        const lexerMatch = content.match(/lexer\s+grammar\s+(\w+)/);
        if (lexerMatch) {
          lexerName = lexerMatch[1];
          break;
        }
      }

      if (!mainGrammarName) {
        throw new Error('Could not detect grammar name');
      }

      // Write input file
      const inputFile = path.join(tmpDir, 'input.txt');
      fs.writeFileSync(inputFile, input, 'utf-8');

      // Write profiling Java driver
      const profilerJava = `
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.atn.*;
import org.antlr.v4.runtime.dfa.*;
import org.antlr.v4.runtime.tree.*;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;

public class Profiler extends DiagnosticErrorListener {
    private int decisionCount = 0;
    private int ambiguityCount = 0;
    private int contextSensitivityCount = 0;
    private int maxDepth = 0;
    private Map<String, Integer> ruleInvocations = new HashMap<>();

    public static void main(String[] args) throws Exception {
        String lexerName = "${lexerName}";
        String parserName = "${mainGrammarName}";
        String startRule = "${startRule}";
        String inputFile = "${inputFile}";

        String input = new String(Files.readAllBytes(Paths.get(inputFile)));
        int inputSize = input.length();

        Class<?> lexerClass = Class.forName(lexerName + "Lexer");
        Class<?> parserClass = Class.forName(parserName + "Parser");

        CharStream chars = CharStreams.fromString(input);
        Lexer lexer = (Lexer) lexerClass.getConstructor(CharStream.class).newInstance(chars);
        CommonTokenStream tokens = new CommonTokenStream(lexer);

        Parser parser = (Parser) parserClass.getConstructor(TokenStream.class).newInstance(tokens);

        Profiler profiler = new Profiler();
        parser.addErrorListener(profiler);

        long start = System.nanoTime();
        ParseTree tree = (ParseTree) parser.getClass().getMethod(startRule).invoke(parser);
        long end = System.nanoTime();

        double parseTimeMs = (end - start) / 1e6;
        int tokenCount = tokens.getNumberOfOnChannelTokens();
        int treeDepth = profiler.computeDepth(tree);

        // Build frequency map
        List<Map.Entry<String, Integer>> sorted = new ArrayList<>(profiler.ruleInvocations.entrySet());
        sorted.sort((a, b) -> b.getValue() - a.getValue());
        StringBuilder freqBuilder = new StringBuilder("[");
        for (int i = 0; i < Math.min(10, sorted.size()); i++) {
            if (i > 0) freqBuilder.append(",");
            freqBuilder.append("{\\\"rule\\\":\\\"").append(sorted.get(i).getKey())
                      .append("\\\",\\\"count\\\":").append(sorted.get(i).getValue()).append("}");
        }
        freqBuilder.append("]");

        System.out.println("{");
        System.out.println("  \\\"parseTimeMs\\\": " + parseTimeMs + ",");
        System.out.println("  \\\"tokenCount\\\": " + tokenCount + ",");
        System.out.println("  \\\"treeDepth\\\": " + treeDepth + ",");
        System.out.println("  \\\"decisionCount\\\": " + profiler.decisionCount + ",");
        System.out.println("  \\\"ambiguityCount\\\": " + profiler.ambiguityCount + ",");
        System.out.println("  \\\"contextSensitivityCount\\\": " + profiler.contextSensitivityCount + ",");
        System.out.println("  \\\"ruleInvocations\\\": " + freqBuilder);
        System.out.println("}");
    }

    @Override
    public void reportAmbiguity(Parser recognizer, DFA dfa, int startIndex, int stopIndex,
                                 boolean exact, BitSet ambigAlts, ATNConfigSet configs) {
        ambiguityCount++;
        decisionCount++;
    }

    @Override
    public void reportAttemptingFullContext(Parser recognizer, DFA dfa, int startIndex, int stopIndex,
                                             BitSet conflictingAlts, ATNConfigSet configs) {
        contextSensitivityCount++;
        decisionCount++;
    }

    @Override
    public void reportContextSensitivity(Parser recognizer, DFA dfa, int startIndex, int stopIndex,
                                          int prediction, ATNConfigSet configs) {
        contextSensitivityCount++;
        decisionCount++;
    }

    private int computeDepth(ParseTree tree) {
        if (tree == null) return 0;
        if (tree instanceof ParserRuleContext) {
            String ruleName = tree.getText().substring(0, Math.min(20, tree.getText().length()));
            // Track rule invocations
            String rule = ((ParserRuleContext) tree).getRuleIndex() >= 0 ?
                ((ParserRuleContext) tree).getClass().getSimpleName().replace("Context", "") : "unknown";
            ruleInvocations.merge(rule, 1, Integer::sum);
        }
        int maxChildDepth = 0;
        for (int i = 0; i < tree.getChildCount(); i++) {
            maxChildDepth = Math.max(maxChildDepth, computeDepth(tree.getChild(i)));
        }
        return 1 + maxChildDepth;
    }
}
`;
      fs.writeFileSync(path.join(tmpDir, 'Profiler.java'), profilerJava, 'utf-8');

      // Compile grammar
      const g4Files = Array.from(grammarFiles.keys())
        .filter((f: string) => f.endsWith('.g4'))
        .map((f: string) => path.basename(f))
        .join(' ');
      await execAsync(`cd ${tmpDir} && ${this.antlr4Command} ${g4Files}`, {
        timeout: this.config.timeout,
      });

      // Compile Java
      await execAsync(`cd ${tmpDir} && javac -cp "${this.getClasspath()}" *.java`, {
        timeout: this.config.timeout,
      });

      // Run profiler
      const { stdout } = await execAsync(
        `cd ${tmpDir} && java -cp ".:${this.getClasspath()}" Profiler`,
        { timeout: this.config.timeout }
      );

      // Parse result
      const result = JSON.parse(stdout.trim());

      // Build suggestions based on profile
      const suggestions: string[] = [];
      if (result.ambiguityCount > 0) {
        suggestions.push(
          `${result.ambiguityCount} ambiguities detected - consider restructuring alternatives`
        );
      }
      if (result.contextSensitivityCount > 10) {
        suggestions.push(
          `High context sensitivity (${result.contextSensitivityCount}) - grammar may benefit from left-factoring`
        );
      }
      if (result.treeDepth > 100) {
        suggestions.push(
          `Deep parse tree (${result.treeDepth} levels) - check for excessive nesting`
        );
      }

      const rulesInvoked = result.ruleInvocations.map(
        (r: { rule: string; count: number }) => r.rule
      );

      return {
        success: true,
        profile: {
          parseTimeMs: Math.round(result.parseTimeMs * 100) / 100,
          tokenCount: result.tokenCount,
          treeDepth: result.treeDepth,
          decisionCount: result.decisionCount,
          ambiguityCount: result.ambiguityCount,
          contextSensitivityCount: result.contextSensitivityCount,
          errors: [],
        },
        rules: {
          invoked: rulesInvoked,
          byFrequency: result.ruleInvocations,
        },
        suggestions,
      };
    } catch (error: any) {
      return {
        success: false,
        profile: {
          parseTimeMs: 0,
          tokenCount: 0,
          treeDepth: 0,
          decisionCount: 0,
          ambiguityCount: 0,
          contextSensitivityCount: 0,
          errors: [this.formatError(error)],
        },
        rules: { invoked: [], byFrequency: [] },
        suggestions: [],
        errors: [this.formatError(error)],
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Visualize parse tree as ASCII or JSON
   */
  async visualizeParseTree(
    grammarFiles: Map<string, string>,
    startRule: string,
    input: string,
    format: 'ascii' | 'json' | 'lisp' = 'ascii'
  ): Promise<{
    success: boolean;
    tree?: string;
    stats: {
      nodeCount: number;
      depth: number;
      ruleNodes: number;
      terminalNodes: number;
    };
    errors?: string[];
  }> {
    const available = await this.isAvailable();
    if (!available) {
      return {
        success: false,
        stats: { nodeCount: 0, depth: 0, ruleNodes: 0, terminalNodes: 0 },
        errors: ['ANTLR4 runtime not available'],
      };
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antlr4-tree-'));

    try {
      // Write grammar files
      let mainGrammarName = '';
      let lexerName = '';
      for (const [filename, content] of grammarFiles) {
        fs.writeFileSync(path.join(tmpDir, filename), content, 'utf-8');
        const parserMatch = content.match(/parser\s+grammar\s+(\w+)/);
        const combinedMatch = content.match(/^grammar\s+(\w+)/m);
        const lexerMatch = content.match(/lexer\s+grammar\s+(\w+)/);
        if (parserMatch) mainGrammarName = parserMatch[1];
        else if (combinedMatch && !mainGrammarName) mainGrammarName = combinedMatch[1];
        if (lexerMatch) lexerName = lexerMatch[1];
      }
      if (!lexerName) lexerName = mainGrammarName;
      if (!mainGrammarName) throw new Error('Could not detect grammar name');

      // Write input
      fs.writeFileSync(path.join(tmpDir, 'input.txt'), input, 'utf-8');

      // Write tree visualizer
      const visualizerJava = `
import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.tree.*;
import java.nio.file.Files;
import java.nio.file.Paths;

public class Visualizer {
    static int nodeCount = 0, ruleNodes = 0, terminalNodes = 0, maxDepth = 0;

    public static void main(String[] args) throws Exception {
        String input = new String(Files.readAllBytes(Paths.get("${tmpDir}/input.txt")));
        CharStream chars = CharStreams.fromString(input);
        Lexer lexer = (Lexer) Class.forName("${lexerName}Lexer").getConstructor(CharStream.class).newInstance(chars);
        CommonTokenStream tokens = new CommonTokenStream(lexer);
        Parser parser = (Parser) Class.forName("${mainGrammarName}Parser").getConstructor(TokenStream.class).newInstance(tokens);
        ParseTree tree = (ParseTree) parser.getClass().getMethod("${startRule}").invoke(parser);

        String output = "${format}".equals("json") ? toJson(tree, 0) :
                        "${format}".equals("lisp") ? toLisp(tree) : toAscii(tree, "", true);

        int depth = computeDepth(tree, 0);
        System.out.println("{\\"tree\\":\\"" + escape(output) + "\\",");
        System.out.println(\\"nodeCount:\\" + nodeCount + \\",\\");
        System.out.println(\\"ruleNodes:\\" + ruleNodes + \\",\\");
        System.out.println(\\"terminalNodes:\\" + terminalNodes + \\",\\");
        System.out.println(\\"depth:\\" + depth + \\"}\\");
    }

    static String toAscii(ParseTree tree, String prefix, boolean tail) {
        nodeCount++;
        String result = prefix + (tail ? "└── " : "├── ") + tree.getText().replace("\\n", "\\\\n").substring(0, Math.min(40, tree.getText().length()));
        if (tree instanceof ParserRuleContext) { ruleNodes++; result += " [" + ((ParserRuleContext) tree).getClass().getSimpleName().replace("Context", "") + "]"; }
        else terminalNodes++;
        result += "\\n";
        for (int i = 0; i < tree.getChildCount(); i++) {
            boolean isLast = (i == tree.getChildCount() - 1);
            String childPrefix = prefix + (tail ? "    " : "│   ");
            result += toAscii(tree.getChild(i), childPrefix, isLast);
        }
        return result;
    }

    static String toJson(ParseTree tree, int depth) {
        nodeCount++;
        if (tree instanceof ParserRuleContext) ruleNodes++; else terminalNodes++;
        StringBuilder sb = new StringBuilder("{\\"text\\":\\"" + escape(tree.getText().substring(0, Math.min(50, tree.getText().length()))) + "\\"");
        if (tree instanceof ParserRuleContext) sb.append(",\\"rule\\":\\"" + ((ParserRuleContext) tree).getClass().getSimpleName().replace("Context", "") + "\\"");
        if (tree.getChildCount() > 0) {
            sb.append(",\\"children\\":[");
            for (int i = 0; i < tree.getChildCount(); i++) {
                if (i > 0) sb.append(",");
                sb.append(toJson(tree.getChild(i), depth + 1));
            }
            sb.append("]");
        }
        sb.append("}");
        return sb.toString();
    }

    static String toLisp(ParseTree tree) {
        nodeCount++;
        if (tree instanceof ParserRuleContext) ruleNodes++; else terminalNodes++;
        if (tree.getChildCount() == 0) return tree.getText();
        StringBuilder sb = new StringBuilder("(" + ((ParserRuleContext) tree).getClass().getSimpleName().replace("Context", ""));
        for (int i = 0; i < tree.getChildCount(); i++) sb.append(" ").append(toLisp(tree.getChild(i)));
        return sb.append(")").toString();
    }

    static int computeDepth(ParseTree tree, int depth) {
        if (tree == null) return depth;
        int max = depth;
        for (int i = 0; i < tree.getChildCount(); i++) max = Math.max(max, computeDepth(tree.getChild(i), depth + 1));
        return max;
    }

    static String escape(String s) {
        return s.replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"").replace("\\n", "\\\\n").replace("\\r", "\\\\r").replace("\\t", "\\\\t");
    }
}
`;
      fs.writeFileSync(path.join(tmpDir, 'Visualizer.java'), visualizerJava, 'utf-8');

      // Compile
      const g4Files = Array.from(grammarFiles.keys())
        .filter((f) => f.endsWith('.g4'))
        .map((f) => path.basename(f))
        .join(' ');
      await execAsync(`cd ${tmpDir} && ${this.antlr4Command} ${g4Files}`, {
        timeout: this.config.timeout,
      });
      await execAsync(`cd ${tmpDir} && javac -cp ".:${this.getClasspath()}" *.java`, {
        timeout: this.config.timeout,
      });

      // Run
      const { stdout } = await execAsync(
        `cd ${tmpDir} && java -cp ".:${this.getClasspath()}" Visualizer`,
        { timeout: this.config.timeout }
      );
      const result = JSON.parse(stdout.trim());

      return {
        success: true,
        tree: result.tree,
        stats: {
          nodeCount: result.nodeCount,
          depth: result.depth,
          ruleNodes: result.ruleNodes,
          terminalNodes: result.terminalNodes,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        stats: { nodeCount: 0, depth: 0, ruleNodes: 0, terminalNodes: 0 },
        errors: [this.formatError(error)],
      };
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }

  /**
   * Generate stress test inputs based on grammar structure
   */
  generateStressTest(
    grammarContent: string,
    options: {
      maxSize?: number;
      targetRule?: string;
      includeComments?: boolean;
    } = {}
  ): {
    inputs: Array<{
      input: string;
      description: string;
      expectedSize: number;
    }>;
    ruleCoverage: string[];
  } {
    const analysis = this.analyze(grammarContent);
    const maxSize = options.maxSize || 1000;
    const inputs: Array<{ input: string; description: string; expectedSize: number }> = [];
    const coveredRules = new Set<string>();

    // Find lexer rules that produce literal tokens
    const literalTokens: Array<{ name: string; value: string }> = [];
    for (const rule of analysis.rules) {
      if (rule.type === 'lexer') {
        const match = rule.definition.match(/'([^']+)'/);
        if (match) {
          literalTokens.push({ name: rule.name, value: match[1] });
        }
      }
    }

    // Generate various test inputs
    // 1. Single token repetition
    if (literalTokens.length > 0) {
      const token = literalTokens[0];
      const repetitions = Math.floor(maxSize / token.value.length);
      inputs.push({
        input: token.value.repeat(Math.min(repetitions, 100)),
        description: `Repetition of '${token.value}' (${Math.min(repetitions, 100)} times)`,
        expectedSize: Math.min(repetitions, 100) * token.value.length,
      });
      coveredRules.add(token.name);
    }

    // 2. Token sequence
    if (literalTokens.length >= 3) {
      const sequence = literalTokens
        .slice(0, 5)
        .map((t) => t.value)
        .join(' ');
      const repetitions = Math.floor(maxSize / sequence.length);
      inputs.push({
        input: sequence.repeat(Math.min(repetitions, 20)),
        description: 'Alternating token sequence',
        expectedSize: sequence.length * Math.min(repetitions, 20),
      });
      literalTokens.slice(0, 5).forEach((t) => coveredRules.add(t.name));
    }

    // 3. Nested structures (if we detect recursive rules)
    for (const rule of analysis.rules) {
      if (rule.type === 'parser' && rule.referencedRules.includes(rule.name)) {
        // Found recursive rule - generate nested input
        const matchingTokens = literalTokens.filter(
          (t) => rule.definition.includes(t.name) || rule.definition.includes(`'${t.value}'`)
        );
        if (matchingTokens.length > 0) {
          const token = matchingTokens[0].value;
          let nested = token;
          for (let i = 0; i < Math.min(20, Math.floor(maxSize / (token.length * 2))); i++) {
            nested = `${token} ${nested} ${token}`;
          }
          inputs.push({
            input: nested.substring(0, maxSize),
            description: `Nested structure for ${rule.name} (${Math.min(20, Math.floor(maxSize / (token.length * 2)))} levels)`,
            expectedSize: nested.length,
          });
          coveredRules.add(rule.name);
        }
      }
    }

    // 4. All unique tokens
    if (literalTokens.length > 0) {
      const allTokens = literalTokens.map((t) => t.value).join(' ');
      inputs.push({
        input: allTokens,
        description: `All ${literalTokens.length} unique tokens`,
        expectedSize: allTokens.length,
      });
      literalTokens.forEach((t) => coveredRules.add(t.name));
    }

    return {
      inputs,
      ruleCoverage: Array.from(coveredRules),
    };
  }

  private analyze(grammarContent: string): any {
    // Simple inline analysis - avoid circular dependency
    const rules: Array<{
      name: string;
      type: string;
      definition: string;
      referencedRules: string[];
    }> = [];
    const lines = grammarContent.split('\n');
    let inBlock = false;
    let currentRule = '';
    let ruleStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('/*') || trimmed.startsWith('//')) continue;
      if (trimmed.startsWith('/*')) inBlock = true;
      if (inBlock && trimmed.includes('*/')) {
        inBlock = false;
        continue;
      }
      if (inBlock) continue;

      const ruleMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
      if (ruleMatch && !trimmed.includes('fragment')) {
        if (currentRule && ruleStartLine > 0) {
          const isLexer = /^[A-Z_]/.test(currentRule);
          rules.push({
            name: currentRule,
            type: isLexer ? 'lexer' : 'parser',
            definition: lines.slice(ruleStartLine - 1, i).join('\n'),
            referencedRules: [],
          });
        }
        currentRule = ruleMatch[1];
        ruleStartLine = i + 1;
      }
    }

    if (currentRule) {
      const isLexer = /^[A-Z_]/.test(currentRule);
      rules.push({
        name: currentRule,
        type: isLexer ? 'lexer' : 'parser',
        definition: lines.slice(ruleStartLine - 1).join('\n'),
        referencedRules: [],
      });
    }

    return { rules };
  }

  /**
   * Compare two profile results
   */
  static compareProfiles(
    profile1: {
      profile: {
        parseTimeMs: number;
        tokenCount: number;
        treeDepth: number;
        ambiguityCount: number;
        contextSensitivityCount: number;
      };
      rules: { byFrequency: Array<{ rule: string; count: number }> };
    },
    profile2: {
      profile: {
        parseTimeMs: number;
        tokenCount: number;
        treeDepth: number;
        ambiguityCount: number;
        contextSensitivityCount: number;
      };
      rules: { byFrequency: Array<{ rule: string; count: number }> };
    },
    labels: { profile1: string; profile2: string } = { profile1: 'Before', profile2: 'After' }
  ): {
    improvements: string[];
    regressions: string[];
    metrics: {
      parseTimeChange: number;
      tokenCountMatch: boolean;
      ambiguityChange: number;
      contextSensitivityChange: number;
    };
    summary: string;
  } {
    const improvements: string[] = [];
    const regressions: string[] = [];

    const parseTimeChange =
      ((profile2.profile.parseTimeMs - profile1.profile.parseTimeMs) /
        profile1.profile.parseTimeMs) *
      100;
    const ambiguityChange = profile2.profile.ambiguityCount - profile1.profile.ambiguityCount;
    const contextSensitivityChange =
      profile2.profile.contextSensitivityCount - profile1.profile.contextSensitivityCount;
    const tokenCountMatch = profile1.profile.tokenCount === profile2.profile.tokenCount;

    // Analyze changes
    if (parseTimeChange < -10) {
      improvements.push(`Parse time improved by ${Math.abs(parseTimeChange).toFixed(1)}%`);
    } else if (parseTimeChange > 10) {
      regressions.push(`Parse time worsened by ${parseTimeChange.toFixed(1)}%`);
    }

    if (ambiguityChange < 0) {
      improvements.push(`Ambiguities reduced by ${Math.abs(ambiguityChange)}`);
    } else if (ambiguityChange > 0) {
      regressions.push(`Ambiguities increased by ${ambiguityChange}`);
    }

    if (contextSensitivityChange < 0) {
      improvements.push(`Context sensitivity reduced by ${Math.abs(contextSensitivityChange)}`);
    } else if (contextSensitivityChange > 0) {
      regressions.push(`Context sensitivity increased by ${contextSensitivityChange}`);
    }

    if (!tokenCountMatch) {
      regressions.push(
        `Token count mismatch: ${profile1.profile.tokenCount} vs ${profile2.profile.tokenCount}`
      );
    }

    // Generate summary
    let summary = '';
    if (improvements.length > 0 && regressions.length === 0) {
      summary = `✅ ${labels.profile2} is better than ${labels.profile1}`;
    } else if (regressions.length > 0 && improvements.length === 0) {
      summary = `❌ ${labels.profile2} is worse than ${labels.profile1}`;
    } else if (improvements.length === 0 && regressions.length === 0) {
      summary = `➖ No significant difference between ${labels.profile1} and ${labels.profile2}`;
    } else {
      summary = `⚖️ Mixed results: ${improvements.length} improvements, ${regressions.length} regressions`;
    }

    return {
      improvements,
      regressions,
      metrics: {
        parseTimeChange,
        tokenCountMatch,
        ambiguityChange,
        contextSensitivityChange,
      },
      summary,
    };
  }

  /**
   * Format error message for user display
   */
  private formatError(error: any): string {
    if (error.stderr) {
      return error.stderr;
    }
    if (error.message) {
      return error.message;
    }
    return String(error);
  }
}

// Singleton instance
let runtimeInstance: Antlr4Runtime | null = null;

/**
 * Get or create singleton runtime instance
 */
export function getRuntime(config?: RuntimeConfig): Antlr4Runtime {
  if (!runtimeInstance) {
    runtimeInstance = new Antlr4Runtime(config);
  }
  return runtimeInstance;
}
