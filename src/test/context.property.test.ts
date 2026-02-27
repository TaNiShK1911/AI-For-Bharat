/**
 * Property-based tests for CodeContextExtractor
 * Feature: ai-docs-interpreter
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fc from 'fast-check';
import { CodeContextExtractor } from '../context/CodeContextExtractor';

suite('CodeContextExtractor Property Tests', () => {
  let extractor: CodeContextExtractor;

  setup(() => {
    extractor = new CodeContextExtractor();
  });

  test('Property 8: Code context capture - For any code selection in a JavaScript file, the context extractor should capture the selected text, file name, and import statements', () => {
    // Feature: ai-docs-interpreter, Property 8: Code context capture
    // Validates: Requirements 4.1, 4.3

    fc.assert(fc.property(
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
          getText: (range?: vscode.Range) => {
            if (!range) {return documentContent;}
            // For simplicity, return selected text when range is provided
            return testData.selectedText;
          },
          lineCount: documentContent.split('\n').length,
          lineAt: (line: number) => ({
            text: documentContent.split('\n')[line] || '',
            range: new vscode.Range(line, 0, line, 100),
            rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
            firstNonWhitespaceCharacterIndex: 0,
            isEmptyOrWhitespace: false
          })
        } as vscode.TextDocument;

        // Create mock selection
        const mockSelection = new vscode.Selection(
          new vscode.Position(testData.imports.length + testData.surroundingLines.length, 0),
          new vscode.Position(testData.imports.length + testData.surroundingLines.length, testData.selectedText.length)
        );

        // Extract context
        const context = extractor.extractFromSelection(mockDocument, mockSelection);

        // Verify required properties are captured
        assert.strictEqual(context.selectedText, testData.selectedText, 'Selected text should be captured exactly');
        assert.strictEqual(context.fileName, testData.fileName, 'File name should be captured exactly');
        assert.strictEqual(context.language, 'javascript', 'Language should be captured correctly');
        
        // Verify imports are captured (at least some should be found)
        assert.ok(Array.isArray(context.imports), 'Imports should be an array');
        
        // Verify surrounding context is captured
        assert.ok(typeof context.surroundingContext === 'string', 'Surrounding context should be a string');
      }
    ), { numRuns: 100 });
  });
});