#!/usr/bin/env node

/**
 * Regression tests for targeted correctness fixes.
 */

const { AntlrAnalyzer } = require('../dist/antlrAnalyzer.js');
const { Antlr4Runtime } = require('../dist/antlr4Runtime.js');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`PASS: ${testName}`);
    passCount++;
  } else {
    console.log(`FAIL: ${testName}`);
    if (details) console.log(`  ${details}`);
    failCount++;
  }
}

function testLineNumberTracking() {
  const grammar = `grammar LineTracking;

firstRule
  : ID
  ;

secondRule: NUMBER;

ID: [a-z]+;
NUMBER: [0-9]+;
WS: [ \\t\\r\\n]+ -> skip;
`;

  const analysis = AntlrAnalyzer.analyze(grammar);
  const firstRule = analysis.rules.find((r) => r.name === 'firstRule');
  const secondRule = analysis.rules.find((r) => r.name === 'secondRule');
  const idRule = analysis.rules.find((r) => r.name === 'ID');

  assert(
    firstRule && firstRule.lineNumber === 3,
    'firstRule line number should point to rule start',
    `Got ${firstRule?.lineNumber}`
  );
  assert(
    secondRule && secondRule.lineNumber === 7,
    'secondRule line number should stay correct after skipping multi-line rule',
    `Got ${secondRule?.lineNumber}`
  );
  assert(
    idRule && idRule.lineNumber === 9,
    'ID line number should remain accurate',
    `Got ${idRule?.lineNumber}`
  );
}

function testJavaPathResolution() {
  const originalJavaHome = process.env.JAVA_HOME;

  try {
    process.env.JAVA_HOME = '/fake/java-home';

    const withExplicitPath = new Antlr4Runtime({ javaPath: '/custom/java' });
    assert(
      withExplicitPath.config.javaPath === '/custom/java',
      'explicit javaPath should take precedence over JAVA_HOME',
      `Got ${withExplicitPath.config.javaPath}`
    );

    const withJavaHomeOnly = new Antlr4Runtime();
    assert(
      withJavaHomeOnly.config.javaPath === '/fake/java-home/bin/java',
      'JAVA_HOME should be used when explicit javaPath is not provided',
      `Got ${withJavaHomeOnly.config.javaPath}`
    );

    delete process.env.JAVA_HOME;
    const withFallback = new Antlr4Runtime();
    assert(
      withFallback.config.javaPath === 'java',
      'java executable should be fallback when no javaPath or JAVA_HOME is set',
      `Got ${withFallback.config.javaPath}`
    );
  } finally {
    if (originalJavaHome === undefined) {
      delete process.env.JAVA_HOME;
    } else {
      process.env.JAVA_HOME = originalJavaHome;
    }
  }
}

function testCommentHandlingInAnalyze() {
  const grammar = `grammar CommentSafe;
/* start rule is below */
start: ID; /* trailing block comment */
/*
multi-line comment containing fake rule:
fakeRule: NUMBER;
*/
ID: [a-z]+; // trailing line comment
NUMBER: [0-9]+;
`;

  const analysis = AntlrAnalyzer.analyze(grammar);
  const ruleNames = analysis.rules.map((r) => r.name);

  assert(
    ruleNames.includes('start'),
    'real parser rule should be detected when comments are present',
    `Rules: ${ruleNames.join(', ')}`
  );
  assert(
    !ruleNames.includes('fakeRule'),
    'rule-like text inside block comments should not be parsed as a rule',
    `Rules: ${ruleNames.join(', ')}`
  );
}

function testLiteralCommentMarkersAreNotStripped() {
  const grammar = `lexer grammar LiteralComments;
LINE_COMMENT_TOKEN: '//';
BLOCK_COMMENT_START: '/*';
BLOCK_COMMENT_END: '*/';
SLASH: '/';
`;

  const analysis = AntlrAnalyzer.analyze(grammar);
  const ruleNames = analysis.rules.map((r) => r.name);

  assert(
    ruleNames.includes('LINE_COMMENT_TOKEN'),
    'lexer literal // should not be treated as an actual comment',
    `Rules: ${ruleNames.join(', ')}`
  );
  assert(
    ruleNames.includes('BLOCK_COMMENT_START') && ruleNames.includes('BLOCK_COMMENT_END'),
    'lexer literals /* and */ should not be stripped as block comments',
    `Rules: ${ruleNames.join(', ')}`
  );
}

function testEntryParserRuleNotFlaggedUnused() {
  const grammar = `grammar EntryRule;
start: item EOF;
item: ID;
ID: [a-z]+;
WS: [ \\t\\r\\n]+ -> skip;
`;

  const analysis = AntlrAnalyzer.analyze(grammar);
  const unusedStartIssue = analysis.issues.find(
    (issue) => issue.ruleName === 'start' && issue.message.includes('Unused rule')
  );

  assert(
    !unusedStartIssue,
    'entry parser rule should not be reported as unused',
    `Issues: ${analysis.issues.map((i) => i.message).join(' | ')}`
  );
}

function testImpactAnalysisBasicGraph() {
  const grammar = `grammar Impact;
start: expr EOF;
expr: term (PLUS term)*;
term: factor;
factor: ID;
PLUS: '+';
ID: [a-z]+;
WS: [ \\t\\r\\n]+ -> skip;
`;

  const impact = AntlrAnalyzer.analyzeRuleImpact(grammar, 'term');
  assert(impact.found, 'impact analysis should find existing rule');
  assert(impact.directDependencies.includes('factor'), 'term should directly depend on factor');
  assert(impact.directDependents.includes('expr'), 'term should be directly depended on by expr');
  assert(
    impact.transitiveDependents.includes('start'),
    'term should have start as transitive dependent'
  );
}

async function testCompileGrammarResultShape() {
  const runtime = new Antlr4Runtime();
  const grammar = `grammar CompileShape;
start: ID EOF;
ID: [a-z]+;
WS: [ \\t\\r\\n]+ -> skip;
`;

  const result = await runtime.compileGrammar(grammar, { loadImports: false });
  const hasValidMode = result.mode === 'native' || result.mode === 'simulation';
  const hasDiagnosticsArray = Array.isArray(result.diagnostics);

  assert(hasValidMode, 'compileGrammar should return native or simulation mode');
  assert(hasDiagnosticsArray, 'compileGrammar should always return diagnostics array');
}

function runTests() {
  console.log('Running regression fix tests...\n');

  testLineNumberTracking();
  testJavaPathResolution();
  testCommentHandlingInAnalyze();
  testLiteralCommentMarkersAreNotStripped();
  testEntryParserRuleNotFlaggedUnused();
  testImpactAnalysisBasicGraph();
  return testCompileGrammarResultShape().then(() => {
    console.log(`\nPassed: ${passCount}`);
    console.log(`Failed: ${failCount}`);

    if (failCount > 0) {
      process.exit(1);
    }
  });
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
