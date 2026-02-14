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
    this.config = {
      antlr4Path: config.antlr4Path || process.env.ANTLR4_JAR || '',
      javaPath:
        config.javaPath || process.env.JAVA_HOME ? `${process.env.JAVA_HOME}/bin/java` : 'java',
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
   * Copy imported grammars to temporary directory
   */
  private async copyImportedGrammars(
    grammarContent: string,
    basePath: string,
    tmpDir: string
  ): Promise<void> {
    const imports = grammarContent.match(/import\s+([^;]+);/g) || [];

    for (const imp of imports) {
      const importNames = imp
        .replace(/import\s+|;/g, '')
        .split(',')
        .map((s) => s.trim());

      for (const name of importNames) {
        const importFile = path.join(basePath, `${name}.g4`);
        if (fs.existsSync(importFile)) {
          fs.copyFileSync(importFile, path.join(tmpDir, `${name}.g4`));

          // Recursively copy imports from imported grammars
          const importedContent = fs.readFileSync(importFile, 'utf-8');
          await this.copyImportedGrammars(importedContent, basePath, tmpDir);
        }
      }
    }
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
      for (const [filename, content] of grammarFiles) {
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
      await execAsync(
        `cd ${tmpDir} && javac -cp "${this.getClasspath()}" *.java`,
        { timeout: this.config.timeout }
      );

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
