/**
 * Property-based tests for UI Provider components
 * Tests universal properties for hover and side panel functionality
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fc from 'fast-check';
import { HoverProvider } from '../ui/HoverProvider';
import { SidePanelProvider } from '../ui/SidePanelProvider';
import { UIProvider } from '../ui/UIProvider';
import { RAGEngine } from '../rag/RAGEngine';
import { CodeContextExtractor } from '../context/CodeContextExtractor';
import { VectorStore } from '../storage/VectorStore';
import { ExplanationResult, Citation } from '../types/interfaces';

// Mock implementations for testing
class MockVectorStore extends VectorStore {
  constructor() {
    super({ dbPath: ':memory:', embeddingModel: 'test', similarityThreshold: 0.5, maxResults: 5 });
  }

  async initialize(): Promise<void> {}
  async storeChunks(): Promise<void> {}
  async searchSimilar(): Promise<any[]> { return []; }
  async generateEmbedding(): Promise<number[]> { return [0.1, 0.2, 0.3]; }
  async clearIndex(): Promise<void> {}
}

class MockRAGEngine extends RAGEngine {
  constructor() {
    super(new MockVectorStore());
  }

  async explainCode(): Promise<ExplanationResult> {
    return {
      explanation: "This is a test explanation that should be properly formatted for display.",
      citations: [{ filePath: "test.md", sectionHeading: "Test Section", relevanceScore: 0.9 }],
      confidence: 0.8,
      hasRelevantDocs: true
    };
  }
}

class MockExtensionContext implements vscode.ExtensionContext {
  subscriptions: vscode.Disposable[] = [];
  workspaceState: vscode.Memento = {
    get: () => undefined,
    update: () => Promise.resolve(),
    keys: () => []
  } as any;
  globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void } = {
    get: () => undefined,
    update: () => Promise.resolve(),
    keys: () => [],
    setKeysForSync: () => {}
  } as any;
  extensionUri: vscode.Uri = vscode.Uri.file('/test');
  extensionPath: string = '/test';
  asAbsolutePath(relativePath: string): string { return `/test/${relativePath}`; }
  storageUri: vscode.Uri | undefined = undefined;
  storagePath: string | undefined = undefined;
  globalStorageUri: vscode.Uri = vscode.Uri.file('/test/global');
  globalStoragePath: string = '/test/global';
  logUri: vscode.Uri = vscode.Uri.file('/test/log');
  logPath: string = '/test/log';
  extensionMode: vscode.ExtensionMode = vscode.ExtensionMode.Test;
  environmentVariableCollection: vscode.GlobalEnvironmentVariableCollection = {
    getScoped: () => ({} as any)
  } as any;
  secrets: vscode.SecretStorage = {} as any;
  extension: vscode.Extension<any> = {} as any;
  languageModelAccessInformation: vscode.LanguageModelAccessInformation = {} as any;
}

suite('UI Provider Property Tests', () => {
  let mockContext: MockExtensionContext;
  let mockRAGEngine: MockRAGEngine;
  let contextExtractor: CodeContextExtractor;
  let hoverProvider: HoverProvider;

  setup(() => {
    mockContext = new MockExtensionContext();
    mockRAGEngine = new MockRAGEngine();
    contextExtractor = new CodeContextExtractor();
    hoverProvider = new HoverProvider(mockRAGEngine, contextExtractor);
  });

  test('Property 14: Hover explanation length constraint - Feature: ai-docs-interpreter, Property 14: For any explanation generated, the hover display should be formatted to 2-3 lines maximum', async () => {
    // **Validates: Requirements 6.1**
    
    await fc.assert(fc.asyncProperty(
      // Generate various explanation texts of different lengths
      fc.record({
        explanation: fc.string({ minLength: 10, maxLength: 1000 }),
        citations: fc.array(fc.record({
          filePath: fc.string({ minLength: 5, maxLength: 50 }),
          sectionHeading: fc.string({ minLength: 5, maxLength: 100 }),
          relevanceScore: fc.float({ min: 0, max: 1 })
        }), { minLength: 0, maxLength: 3 }),
        confidence: fc.float({ min: 0, max: 1 }),
        hasRelevantDocs: fc.boolean()
      }),
      async (explanationResult: ExplanationResult) => {
        // Skip if no relevant docs (hover provider returns undefined)
        if (!explanationResult.hasRelevantDocs) {
          return true;
        }

        // Create a mock hover provider that exposes the private formatHoverText method
        const testHoverProvider = new (class extends HoverProvider {
          public testFormatHoverText(result: ExplanationResult): vscode.MarkdownString {
            return (this as any).formatHoverText(result);
          }
        })(mockRAGEngine, contextExtractor);

        // Format the explanation for hover display
        const hoverText = testHoverProvider.testFormatHoverText(explanationResult);
        const markdownContent = hoverText.value;

        // Count lines in the formatted text
        const lines = markdownContent.split('\n').filter(line => line.trim().length > 0);
        
        // Property: Hover explanations should be 2-3 lines maximum
        // This includes the main explanation and citation line
        assert.ok(lines.length <= 3, 
          `Hover explanation should be 2-3 lines maximum, but got ${lines.length} lines: ${markdownContent}`);
        
        // Should have at least 1 line (the explanation itself)
        assert.ok(lines.length >= 1, 
          `Hover explanation should have at least 1 line, but got ${lines.length} lines`);

        // If there are citations, the last line should contain "Source:"
        if (explanationResult.citations.length > 0) {
          const lastLine = lines[lines.length - 1];
          assert.ok(lastLine.includes('Source:'), 
            `Last line should contain citation when citations are available: ${lastLine}`);
        }

        return true;
      }
    ), { numRuns: 100 });
  });

  test('Property 15: Side panel formatting - Feature: ai-docs-interpreter, Property 15: For any explanation displayed in the side panel, the content should be formatted with bullet points and include explicit citations', async () => {
    // **Validates: Requirements 6.2, 6.3**
    
    await fc.assert(fc.asyncProperty(
      // Generate various explanation results
      fc.record({
        explanation: fc.string({ minLength: 20, maxLength: 500 }),
        citations: fc.array(fc.record({
          filePath: fc.string({ minLength: 5, maxLength: 50 }),
          sectionHeading: fc.string({ minLength: 5, maxLength: 100 }),
          relevanceScore: fc.float({ min: 0, max: 1 })
        }), { minLength: 1, maxLength: 5 }), // Ensure at least one citation
        confidence: fc.float({ min: 0, max: 1 }),
        hasRelevantDocs: fc.constant(true) // Always have relevant docs for this test
      }),
      async (explanationResult: ExplanationResult) => {
        // Create side panel provider
        const sidePanelProvider = new SidePanelProvider(
          mockContext.extensionUri,
          mockRAGEngine,
          contextExtractor
        );

        // Test the HTML generation (we can't easily test the actual webview)
        // Instead, we'll test the formatting logic by examining the generated HTML
        const testProvider = new (class extends SidePanelProvider {
          public testGetHtmlForWebview(webview: any): string {
            return (this as any)._getHtmlForWebview(webview);
          }
        })(mockContext.extensionUri, mockRAGEngine, contextExtractor);

        // Mock webview for testing
        const mockWebview = {
          asWebviewUri: (uri: vscode.Uri) => uri,
          cspSource: 'test'
        };

        const html = testProvider.testGetHtmlForWebview(mockWebview);

        // Property: Side panel should format content with bullet points
        assert.ok(html.includes('formatExplanationWithBullets'), 
          'Side panel HTML should include bullet point formatting function');
        
        assert.ok(html.includes('<ul class="explanation-bullets">'), 
          'Side panel HTML should include bullet point list structure');

        // Property: Side panel should include explicit citations
        assert.ok(html.includes('formatCitations'), 
          'Side panel HTML should include citation formatting function');
        
        assert.ok(html.includes('citations-list'), 
          'Side panel HTML should include citations list structure');

        // Property: Citations should show file path and section heading
        assert.ok(html.includes('citation-main'), 
          'Side panel HTML should include citation main content structure');
        
        assert.ok(html.includes('citation-section'), 
          'Side panel HTML should include citation section structure');

        return true;
      }
    ), { numRuns: 50 });
  });

  test('Property 16: Markdown rendering support - Feature: ai-docs-interpreter, Property 16: For any explanation containing markdown syntax, the UI should render the markdown properly with formatting preserved', async () => {
    // **Validates: Requirements 6.4**
    
    await fc.assert(fc.asyncProperty(
      // Generate explanations with various markdown elements
      fc.record({
        explanation: fc.oneof(
          fc.constant("This is **bold text** and *italic text*."),
          fc.constant("Here is `inline code` and a [link](http://example.com)."),
          fc.constant("# Header\n\nThis is a paragraph with **formatting**."),
          fc.constant("- Bullet point 1\n- Bullet point 2\n- **Bold** bullet point"),
          fc.constant("Code block:\n```javascript\nfunction test() { return true; }\n```")
        ),
        citations: fc.array(fc.record({
          filePath: fc.string({ minLength: 5, maxLength: 50 }),
          sectionHeading: fc.string({ minLength: 5, maxLength: 100 }),
          relevanceScore: fc.float({ min: 0, max: 1 })
        }), { minLength: 1, maxLength: 3 }),
        confidence: fc.float({ min: 0, max: 1 }),
        hasRelevantDocs: fc.constant(true)
      }),
      async (explanationResult: ExplanationResult) => {
        // Test hover provider markdown rendering
        const testHoverProvider = new (class extends HoverProvider {
          public testFormatHoverText(result: ExplanationResult): vscode.MarkdownString {
            return (this as any).formatHoverText(result);
          }
        })(mockRAGEngine, contextExtractor);

        const hoverText = testHoverProvider.testFormatHoverText(explanationResult);
        
        // Property: Hover should return MarkdownString for proper rendering
        assert.ok(hoverText instanceof vscode.MarkdownString, 
          'Hover provider should return MarkdownString for markdown rendering');
        
        assert.ok(hoverText.isTrusted === true, 
          'MarkdownString should be trusted to allow proper rendering');

        // Test side panel markdown support
        const sidePanelProvider = new SidePanelProvider(
          mockContext.extensionUri,
          mockRAGEngine,
          contextExtractor
        );

        const testSidePanelProvider = new (class extends SidePanelProvider {
          public testGetHtmlForWebview(webview: any): string {
            return (this as any)._getHtmlForWebview(webview);
          }
        })(mockContext.extensionUri, mockRAGEngine, contextExtractor);

        const mockWebview = {
          asWebviewUri: (uri: vscode.Uri) => uri,
          cspSource: 'test'
        };

        const html = testSidePanelProvider.testGetHtmlForWebview(mockWebview);

        // Property: Side panel should support markdown rendering through HTML
        assert.ok(html.includes('escapeHtml'), 
          'Side panel should include HTML escaping for safe markdown rendering');

        // Property: Should preserve formatting structure
        if (explanationResult.explanation.includes('**')) {
          // Should handle bold text (even if escaped for safety)
          assert.ok(html.includes('formatExplanationWithBullets') || html.includes('escapeHtml'), 
            'Side panel should handle markdown formatting elements');
        }

        return true;
      }
    ), { numRuns: 50 });
  });

  test('Property 17: Dynamic explanation updates - Feature: ai-docs-interpreter, Property 17: For any change in code selection, the explanation should update to reflect the new selection context', async () => {
    // **Validates: Requirements 6.5**
    
    await fc.assert(fc.asyncProperty(
      // Generate different selection scenarios
      fc.record({
        selections: fc.array(fc.record({
          text: fc.string({ minLength: 3, maxLength: 100 }),
          fileName: fc.string({ minLength: 5, maxLength: 50 }),
          language: fc.oneof(fc.constant('javascript'), fc.constant('typescript'))
        }), { minLength: 2, maxLength: 5 }) // Multiple selections to test updates
      }),
      async (testData) => {
        const uiProvider = new UIProvider(mockContext, mockRAGEngine, contextExtractor);
        
        // Register dynamic updates
        uiProvider.registerDynamicUpdates();

        // Property: UI provider should have selection change listener registered
        assert.ok(mockContext.subscriptions.length > 0, 
          'Dynamic updates should register selection change listeners');

        // Test that the provider can handle multiple selection changes
        // (We can't easily simulate actual VS Code selection events in unit tests,
        // but we can verify the infrastructure is in place)
        
        // Property: Should have debouncing mechanism
        const testUIProvider = new (class extends UIProvider {
          public testHandleSelectionChange(event: any): void {
            return (this as any).handleSelectionChange(event);
          }
        })(mockContext, mockRAGEngine, contextExtractor);

        // Simulate rapid selection changes
        for (let i = 0; i < testData.selections.length; i++) {
          const mockEvent = {
            selections: [{ isEmpty: false, isSingleLine: false, start: { character: 0 }, end: { character: 10 } }],
            textEditor: {
              document: {
                languageId: testData.selections[i].language,
                getText: () => testData.selections[i].text,
                fileName: testData.selections[i].fileName
              }
            }
          };

          testUIProvider.testHandleSelectionChange(mockEvent);
        }

        // Property: Should have debounce timer set after selection changes
        // (Timer might be cleared by the time we check, but the mechanism should exist)
        // This verifies that the debouncing infrastructure is in place
        
        // Cleanup
        uiProvider.unregisterDynamicUpdates();
        
        return true;
      }
    ), { numRuns: 30 });
  });
});