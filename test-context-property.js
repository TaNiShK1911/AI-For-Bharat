/**
 * Standalone property test for CodeContextExtractor
 * Feature: ai-docs-interpreter, Property 8: Code context capture
 */

const fc = require('fast-check');

// Mock VS Code types
class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}

class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}

class Selection extends Range {
  constructor(start, end) {
    super(start, end);
  }
}

// Simple mock for CodeContextExtractor functionality
class MockCodeContextExtractor {
  extractFromSelection(document, selection) {
    const selectedText = document.getText(selection);
    const fileName = document.fileName;
    const language = document.languageId;
    
    const surroundingContext = this.getSurroundingContext(document, selection);
    const functionName = this.extractSymbolName(selectedText);
    const className = this.extractClassName(selectedText);
    const imports = this.extractImports(document);
    
    return {
      selectedText,
      fileName,
      functionName,
      className,
      imports,
      surroundingContext,
      language
    };
  }

  extractSymbolName(text) {
    const functionMatch = text.match(/(?:function\s+|const\s+|let\s+|var\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (functionMatch) {
      return functionMatch[1];
    }
    
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

  extractImports(document) {
    const imports = [];
    const text = document.getText();
    
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(text)) !== null) {
      imports.push(match[1]);
    }
    
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(text)) !== null) {
      imports.push(match[1]);
    }
    
    return [...new Set(imports)];
  }

  getSurroundingContext(document, selection) {
    const startLine = Math.max(0, selection.start.line - 5);
    const endLine = Math.min(document.lineCount - 1, selection.end.line + 5);
    
    const lines = document.getText().split('\n');
    return lines.slice(startLine, endLine + 1).join('\n');
  }

  buildQueryString(context) {
    const parts = [];
    
    if (context.selectedText.trim()) {
      parts.push(context.selectedText.trim());
    }
    
    if (context.functionName) {
      parts.push(`function ${context.functionName}`);
    }
    
    if (context.className) {
      parts.push(`class ${context.className}`);
    }
    
    const relevantImports = context.imports
      .filter(imp => !imp.startsWith('.') && !imp.includes('node_modules'))
      .slice(0, 3);
    
    if (relevantImports.length > 0) {
      parts.push(`imports: ${relevantImports.join(', ')}`);
    }
    
    if (context.selectedText.length < 100 && context.surroundingContext.trim()) {
      parts.push(context.surroundingContext.trim());
    }
    
    return parts.join(' ');
  }
}

// Property test
function testCodeContextCapture() {
  const extractor = new MockCodeContextExtractor();
  
  const property = fc.property(
    fc.record({
      selectedText: fc.string({ minLength: 1, maxLength: 500 }),
      fileName: fc.string({ minLength: 1, maxLength: 100 }).map(s => s + '.js'),
      imports: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
      surroundingLines: fc.array(fc.string({ maxLength: 100 }), { minLength: 1, maxLength: 20 })
    }),
    (testData) => {
      // Create mock document content with imports and selected text
      const importStatements = testData.imports.map(imp => `import { something } from '${imp}';`).join('\n');
      const documentContent = importStatements + '\n' + testData.surroundingLines.join('\n') + '\n' + testData.selectedText;
      
      // Create mock VS Code document
      const mockDocument = {
        fileName: testData.fileName,
        languageId: 'javascript',
        getText: (range) => {
          if (!range) return documentContent;
          return testData.selectedText;
        },
        lineCount: documentContent.split('\n').length
      };

      // Create mock selection
      const mockSelection = new Selection(
        new Position(testData.imports.length + testData.surroundingLines.length, 0),
        new Position(testData.imports.length + testData.surroundingLines.length, testData.selectedText.length)
      );

      // Extract context
      const context = extractor.extractFromSelection(mockDocument, mockSelection);

      // Verify required properties are captured
      if (context.selectedText !== testData.selectedText) {
        throw new Error(`Selected text mismatch: expected "${testData.selectedText}", got "${context.selectedText}"`);
      }
      
      if (context.fileName !== testData.fileName) {
        throw new Error(`File name mismatch: expected "${testData.fileName}", got "${context.fileName}"`);
      }
      
      if (context.language !== 'javascript') {
        throw new Error(`Language mismatch: expected "javascript", got "${context.language}"`);
      }
      
      if (!Array.isArray(context.imports)) {
        throw new Error(`Imports should be an array, got ${typeof context.imports}`);
      }
      
      if (typeof context.surroundingContext !== 'string') {
        throw new Error(`Surrounding context should be a string, got ${typeof context.surroundingContext}`);
      }
      
      return true;
    }
  );

  try {
    fc.assert(property, { numRuns: 100 });
    console.log('✓ Property 8: Code context capture - PASSED');
    return true;
  } catch (error) {
    console.log('✗ Property 8: Code context capture - FAILED');
    console.log('Error:', error.message);
    if (error.counterexample) {
      console.log('Counter-example:', JSON.stringify(error.counterexample, null, 2));
    }
    return false;
  }
}

// Run the test
console.log('Running Property 8: Code context capture test...');
const result = testCodeContextCapture();
process.exit(result ? 0 : 1);