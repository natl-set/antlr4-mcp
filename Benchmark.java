import org.antlr.v4.runtime.*;
import org.antlr.v4.runtime.tree.*;
import java.nio.file.Files;
import java.nio.file.Paths;

public class Benchmark {
    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            System.out.println("Usage: java -cp .:antlr.jar Benchmark <GrammarName> <StartRule> <InputFile> [Iterations]");
            System.exit(1);
        }

        String grammarName = args[0];
        String startRule = args[1];
        String inputFile = args[2];
        int iterations = args.length > 3 ? Integer.parseInt(args[3]) : 10;

        String input = new String(Files.readAllBytes(Paths.get(inputFile)));
        int inputSize = input.length();

        // Get lexer and parser classes via reflection
        Class<?> lexerClass = Class.forName(grammarName + "Lexer");
        Class<?> parserClass = Class.forName(grammarName + "Parser");

        // Warmup
        for (int i = 0; i < 3; i++) {
            parse(lexerClass, parserClass, startRule, input);
        }

        // Timed runs
        long[] times = new long[iterations];
        for (int i = 0; i < iterations; i++) {
            long start = System.nanoTime();
            parse(lexerClass, parserClass, startRule, input);
            long end = System.nanoTime();
            times[i] = end - start;
        }

        // Calculate statistics
        long sum = 0, min = Long.MAX_VALUE, max = Long.MIN_VALUE;
        for (long t : times) {
            sum += t;
            if (t < min) min = t;
            if (t > max) max = t;
        }
        double avg = (double) sum / iterations;

        // Standard deviation
        double variance = 0;
        for (long t : times) {
            variance += Math.pow(t - avg, 2);
        }
        double stdDev = Math.sqrt(variance / iterations);

        // Output results
        System.out.println("{\"avgMs\": " + (avg / 1_000_000) +
                         ", \"minMs\": " + (min / 1_000_000.0) +
                         ", \"maxMs\": " + (max / 1_000_000.0) +
                         ", \"stdDevMs\": " + (stdDev / 1_000_000) +
                         ", \"inputSize\": " + inputSize +
                         ", \"throughput\": " + (inputSize / (avg / 1_000_000_000)) +
                         ", \"iterations\": " + iterations + "}");
    }

    private static void parse(Class<?> lexerClass, Class<?> parserClass, String startRule, String input) throws Exception {
        CharStream chars = CharStreams.fromString(input);
        Lexer lexer = (Lexer) lexerClass.getConstructor(CharStream.class).newInstance(chars);
        CommonTokenStream tokens = new CommonTokenStream(lexer);
        Parser parser = (Parser) parserClass.getConstructor(TokenStream.class).newInstance(tokens);

        // Get and invoke the start rule
        parser.getClass().getMethod(startRule).invoke(parser);
    }
}
