const { AntlrAnalyzer } = require('./dist/antlrAnalyzer.js');

const grammar = `grammar Test;

expression: term ((PLUS | MINUS) term)*;
term: NUMBER;

PLUS: '+';
MINUS: '-';
NUMBER: [0-9]+;
`;

console.log('=== Original Grammar ===');
console.log(grammar);

console.log('\n=== Test 1: Update parser rule "expression" ===');
const result1 = AntlrAnalyzer.updateRule(grammar, 'expression', 'term ((PLUS | MINUS | TIMES | DIVIDE) term)*');
console.log('Success:', result1.success);
console.log('Message:', result1.message);
console.log('\n=== Modified Grammar ===');
console.log(result1.modified);

console.log('\n=== Test 2: Update lexer rule "PLUS" ===');
const result2 = AntlrAnalyzer.updateRule(grammar, 'PLUS', "'+'");
console.log('Success:', result2.success);
console.log('Message:', result2.message);
console.log('\n=== Modified Grammar ===');
console.log(result2.modified);

console.log('\n=== Test 3: Update multi-line rule ===');
const multilineGrammar = `grammar Test;

expression
  : term ((PLUS | MINUS) term)*
  ;

term: NUMBER;

NUMBER: [0-9]+;
`;

const result3 = AntlrAnalyzer.updateRule(multilineGrammar, 'expression', 'term');
console.log('Success:', result3.success);
console.log('Message:', result3.message);
console.log('\n=== Modified Grammar ===');
console.log(result3.modified);
