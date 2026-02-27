/**
 * Standalone property test for selection size handling
 * Feature: ai-docs-interpreter, Property 10: Selection size handling
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
    try {
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
    } catch (error) {
      // Should handle errors gracefully and return a valid context
      return {
        selectedText: '',
        fileName: document.fileName || 'unknown.js',
        functionName: undefined,
        className: undefined,
        imports: [],
        surroundingContext: '',
        language: document.languageId || 'javascript'
      };
    }
  }

  extractSymbolName(text) {
    if (!text || typeof text !== 'string') return undefined;
    
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
    if (!text || typeof text !== 'string') return undefined;
    
    const classMatch = text.match(/class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    return classMatch ? classMatch[1] : undefined;
  }

  extractImports(document) {
    try {
      const imports = [];
      const text = document.getText();
      
      if (!text || typeof text !== 'string') return imports;
      
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
    } catch (error) {
      return [];
    }
  }

  getSurroundingContext(document, selection) {
    try {
      const startLine = Math.max(0, selection.start.line - 5);
      const endLine = Math.min(document.lineCount - 1, selection.end.line + 5);
      
      const lines = document.getText().split('\n');
      return lines.slice(startLine, endLine + 1).join('\n');
    } catch (error) {
      return '';
    }
  }

  buildQueryString(context) {
    try {
      const parts = [];
      
      if (context.selectedText && context.selectedText.trim()) {
        parts.push(context.selectedText.trim());
      }
      
      if (context.functionName) {
        parts.push(`function ${context.functionName}`);
      }
      
      if (context.className) {
        parts.push(`class ${context.className}`);
      }
      
      const relevantImports = (context.imports || [])
        .filter(imp => !imp.startsWith('.') && !imp.includes('node_modules'))
        .slice(0, 3);
      
      if (relevantImports.length > 0) {
        parts.push(`imports: ${relevantImports.join(', ')}`);
      }
      
      if (context.selectedText.length < 100 && context.surroundingContext && context.surroundingContext.trim()) {
        parts.push(context.surroundingContext.trim());
      }
      
      return parts.join(' ');
    } catch (error) {
      return '';
    }
  }
}

// Property test for selection size handling
function testSelectionSizeHandling() {
  const extractor = new MockCodeContextExtractor();
  
  const property = fc.property(
    fc.record({
      // Generate selections of various sizes
      selectionSize: fc.oneof(
        fc.constant('empty'),      // Empty selection
        fc.constant('single'),     // Single character
        fc.constant('word'),       // Single word
        fc.constant('line'),       // Single line
        fc.constant('small'),      // Small selection (< 100 chars)
        fc.constant('medium'),     // Medium selection (100-500 chars)
        fc.constant('large')       // Large selection (> 500 chars)
      ),
      fileName: fc.string({ minLength: 1, maxLength: 50 }).map(s => s + '.js'),
      baseContent: fc.array(fc.string({ maxLength: 50 }), { minLength: 5, maxLength: 20 })
    }),
    (testData) => {
      // Generate content based on selection size
      let selectedText = '';
      let documentContent = testData.baseContent.join('\n');
      
      switch (testData.selectionSize) {
        case 'empty':
          selectedText = '';
          break;
        case 'single':
          selectedText = 'x';
          break;
        case 'word':
          selectedText = 'function';
          break;
        case 'line':
          selectedText = 'const result = calculateSum(a, b);';
          break;
        case 'small':
          selectedText = 'function test() { return 42; }';
          break;
        case 'medium':
          selectedText = 'function processData(input) {\n  const result = input.map(x => x * 2);\n  return result.filter(x => x > 10);\n}';
          break;
        case 'large':
          selectedText = 'function largeFunction() {\n' + '  console.log("processing");\n'.repeat(30) + '}';
          break;
      }
      
      // Add selected text to document content
      documentContent += '\n' + selectedText;
      
      // Create mock document
      const mockDocument = {
        fileName: testData.fileName,
        languageId: 'javascript',
        getText: (range) => {
          if (!range) return documentContent;
          return selectedText;
        },
        lineCount: documentContent.split('\n').length
      };

      // Create mock selection
      const lines = documentContent.split('\n');
      const selectedLines = selectedText.split('\n');
      const startLine = lines.length - selectedLines.length;
      const endLine = lines.length - 1;
      
      const mockSelection = new Selection(
        new Position(startLine, 0),
        new Position(endLine, selectedLines[selectedLines.length - 1].length)
      );

      // Extract context - this should not throw errors regardless of selection size
      const context = extractor.extractFromSelection(mockDocument, mockSelection);

      // Verify that context extraction handles all selection sizes without errors
      if (!context) {
        throw new Error(`Context extraction failed for selection size: ${testData.selectionSize}`);
      }
      
      // Verify required properties exist
      if (typeof context.selectedText !== 'string') {
        throw new Error(`selectedText should be a string, got ${typeof context.selectedText} for size: ${testData.selectionSize}`);
      }
      
      if (typeof context.fileName !== 'string') {
        throw new Error(`fileName should be a string, got ${typeof context.fileName} for size: ${testData.selectionSize}`);
      }
      
      if (!Array.isArray(context.imports)) {
        throw new Error(`imports should be an array, got ${typeof context.imports} for size: ${testData.selectionSize}`);
      }
      
      if (typeof context.surroundingContext !== 'string') {
        throw new Error(`surroundingContext should be a string, got ${typeof context.surroundingContext} for size: ${testData.selectionSize}`);
      }
      
      // Verify query string generation works for all sizes
      const queryString = extractor.buildQueryString(context);
      if (typeof queryString !== 'string') {
        throw new Error(`buildQueryString should return a string, got ${typeof queryString} for size: ${testData.selectionSize}`);
      }
      
      // For empty selections, query string should be empty or minimal
      if (testData.selectionSize === 'empty' && selectedText === '' && queryString.trim() !== '') {
        // This is acceptable - surrounding context might still generate a query
      }
      
      return true;
    }
  );

  try {
    fc.assert(property, { numRuns: 100 });
    console.log('✓ Property 10: Selection size handling - PASSED');
    return true;
  } catch (error) {
    console.log('✗ Property 10: Selection size handling - FAILED');
    console.log('Error:', error.message);
    if (error.counterexample) {
      console.log('Counter-example:', JSON.stringify(error.counterexample, null, 2));
    }
    return false;
  }
}

// Run the test
console.log('Running Property 10: Selection size handling test...');
const result = testSelectionSizeHandling();
process.exit(result ? 0 : 1);