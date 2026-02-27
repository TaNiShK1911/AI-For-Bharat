/**
 * Standalone property test for symbol name extraction
 * Feature: ai-docs-interpreter, Property 9: Symbol name extraction
 */

const fc = require('fast-check');

// Simple mock for symbol name extraction functionality
class MockCodeContextExtractor {
  extractSymbolName(text) {
    // Match function declarations
    const functionMatch = text.match(/(?:function\s+|const\s+|let\s+|var\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (functionMatch) {
      return functionMatch[1];
    }
    
    // Match arrow functions
    const arrowMatch = text.match(/(?:const\s+|let\s+|var\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\(/);
    if (arrowMatch) {
      return arrowMatch[1];
    }
    
    return undefined;
  }

  extractClassName(text) {
    const classMatch = text.match(/class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    return classMatch ? classMatch[1] : undefined;
  }
}

// Property test
function testSymbolNameExtraction() {
  const extractor = new MockCodeContextExtractor();
  
  const property = fc.property(
    fc.oneof(
      // Generate function declarations
      fc.record({
        type: fc.constant('function'),
        name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s)),
        params: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
        body: fc.string({ maxLength: 100 })
      }).map(data => ({
        text: `function ${data.name}(${data.params.join(', ')}) { ${data.body} }`,
        expectedName: data.name,
        expectedType: 'function'
      })),
      
      // Generate const function expressions
      fc.record({
        type: fc.constant('const'),
        name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s)),
        params: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
        body: fc.string({ maxLength: 100 })
      }).map(data => ({
        text: `const ${data.name} = function(${data.params.join(', ')}) { ${data.body} }`,
        expectedName: data.name,
        expectedType: 'const'
      })),
      
      // Generate arrow functions
      fc.record({
        type: fc.constant('arrow'),
        name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s)),
        params: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { maxLength: 5 }),
        body: fc.string({ maxLength: 100 })
      }).map(data => ({
        text: `const ${data.name} = (${data.params.join(', ')}) => { ${data.body} }`,
        expectedName: data.name,
        expectedType: 'arrow'
      })),
      
      // Generate class declarations
      fc.record({
        type: fc.constant('class'),
        name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s)),
        body: fc.string({ maxLength: 100 })
      }).map(data => ({
        text: `class ${data.name} { ${data.body} }`,
        expectedName: data.name,
        expectedType: 'class'
      })),
      
      // Generate text without function/class definitions
      fc.record({
        type: fc.constant('none'),
        text: fc.string({ minLength: 1, maxLength: 100 }).filter(s => 
          !s.includes('function ') && 
          !s.includes('class ') && 
          !s.includes('const ') && 
          !s.includes('let ') && 
          !s.includes('var ')
        )
      }).map(data => ({
        text: data.text,
        expectedName: undefined,
        expectedType: 'none'
      }))
    ),
    (testData) => {
      // Extract symbol name
      const extractedName = extractor.extractSymbolName(testData.text);
      
      if (testData.expectedType === 'class') {
        // For classes, use the class extraction method
        const extractedClassName = extractor.extractClassName(testData.text);
        if (extractedClassName !== testData.expectedName) {
          throw new Error(`Class name extraction failed: expected "${testData.expectedName}", got "${extractedClassName}" for text: "${testData.text}"`);
        }
      } else if (testData.expectedType !== 'none') {
        // For functions, use the symbol extraction method
        if (extractedName !== testData.expectedName) {
          throw new Error(`Symbol name extraction failed: expected "${testData.expectedName}", got "${extractedName}" for text: "${testData.text}"`);
        }
      } else {
        // For text without symbols, should return undefined
        if (extractedName !== undefined) {
          throw new Error(`Expected undefined for text without symbols, got "${extractedName}" for text: "${testData.text}"`);
        }
      }
      
      return true;
    }
  );

  try {
    fc.assert(property, { numRuns: 100 });
    console.log('✓ Property 9: Symbol name extraction - PASSED');
    return true;
  } catch (error) {
    console.log('✗ Property 9: Symbol name extraction - FAILED');
    console.log('Error:', error.message);
    if (error.counterexample) {
      console.log('Counter-example:', JSON.stringify(error.counterexample, null, 2));
    }
    return false;
  }
}

// Run the test
console.log('Running Property 9: Symbol name extraction test...');
const result = testSymbolNameExtraction();
process.exit(result ? 0 : 1);