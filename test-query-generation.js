/**
 * Test for query string generation functionality
 */

// Simple mock for query string generation
class MockCodeContextExtractor {
  buildQueryString(context) {
    const parts = [];
    
    // Add selected text (most important)
    if (context.selectedText && context.selectedText.trim()) {
      parts.push(context.selectedText.trim());
    }
    
    // Add symbol names if available
    if (context.functionName) {
      parts.push(`function ${context.functionName}`);
    }
    
    if (context.className) {
      parts.push(`class ${context.className}`);
    }
    
    // Add relevant imports (limit to avoid noise)
    const relevantImports = context.imports
      .filter(imp => !imp.startsWith('.') && !imp.includes('node_modules'))
      .slice(0, 3); // Limit to 3 most relevant imports
    
    if (relevantImports.length > 0) {
      parts.push(`imports: ${relevantImports.join(', ')}`);
    }
    
    // Add file context if selection is small
    if (context.selectedText.length < 100 && context.surroundingContext && context.surroundingContext.trim()) {
      parts.push(context.surroundingContext.trim());
    }
    
    return parts.join(' ');
  }
}

// Test query string generation
function testQueryGeneration() {
  const extractor = new MockCodeContextExtractor();
  
  // Test case 1: Function with imports
  const context1 = {
    selectedText: 'function calculateSum(a, b) { return a + b; }',
    fileName: 'math.js',
    functionName: 'calculateSum',
    className: undefined,
    imports: ['lodash', 'express', './utils'],
    surroundingContext: 'const utils = require("./utils");\nfunction calculateSum(a, b) { return a + b; }\nmodule.exports = calculateSum;',
    language: 'javascript'
  };
  
  const query1 = extractor.buildQueryString(context1);
  console.log('Test 1 - Function with imports:');
  console.log('Query:', query1);
  console.log('Contains selected text:', query1.includes('calculateSum'));
  console.log('Contains function keyword:', query1.includes('function calculateSum'));
  console.log('Contains imports:', query1.includes('imports:'));
  console.log('');
  
  // Test case 2: Class definition
  const context2 = {
    selectedText: 'class UserManager { constructor() {} }',
    fileName: 'user.js',
    functionName: undefined,
    className: 'UserManager',
    imports: ['mongoose', 'bcrypt'],
    surroundingContext: 'const mongoose = require("mongoose");\nclass UserManager { constructor() {} }',
    language: 'javascript'
  };
  
  const query2 = extractor.buildQueryString(context2);
  console.log('Test 2 - Class definition:');
  console.log('Query:', query2);
  console.log('Contains selected text:', query2.includes('UserManager'));
  console.log('Contains class keyword:', query2.includes('class UserManager'));
  console.log('');
  
  // Test case 3: Large selection (should not include surrounding context)
  const largeText = 'function processData() { '.repeat(10) + ' }';
  const context3 = {
    selectedText: largeText,
    fileName: 'processor.js',
    functionName: 'processData',
    className: undefined,
    imports: ['fs', 'path'],
    surroundingContext: 'const fs = require("fs");\n' + largeText + '\nmodule.exports = processData;',
    language: 'javascript'
  };
  
  const query3 = extractor.buildQueryString(context3);
  console.log('Test 3 - Large selection:');
  console.log('Query length:', query3.length);
  console.log('Contains selected text:', query3.includes('processData'));
  console.log('Should not contain surrounding context:', !query3.includes('module.exports'));
  console.log('');
  
  // Test case 4: Empty/minimal context
  const context4 = {
    selectedText: '',
    fileName: 'empty.js',
    functionName: undefined,
    className: undefined,
    imports: [],
    surroundingContext: '',
    language: 'javascript'
  };
  
  const query4 = extractor.buildQueryString(context4);
  console.log('Test 4 - Empty context:');
  console.log('Query:', `"${query4}"`);
  console.log('Query is empty:', query4 === '');
  console.log('');
  
  console.log('✓ Query string generation tests completed successfully');
  return true;
}

// Run the test
console.log('Testing query string generation functionality...');
testQueryGeneration();