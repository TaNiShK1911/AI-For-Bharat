/**
 * UI Provider for AI Docs Interpreter
 * 
 * Coordinates hover provider and side panel provider for displaying
 * code explanations with proper formatting and citations.
 */

import * as vscode from 'vscode';
import { HoverProvider } from './HoverProvider';
import { SidePanelProvider } from './SidePanelProvider';
import { RAGEngine } from '../rag/RAGEngine';
import { CodeContextExtractor } from '../context/CodeContextExtractor';
import { UIProvider as IUIProvider, ExplanationResult } from '../types/interfaces';

export class UIProvider implements IUIProvider {
  private hoverProvider: HoverProvider;
  private sidePanelProvider: SidePanelProvider;
  private context: vscode.ExtensionContext;
  private selectionChangeListener?: vscode.Disposable;
  private debounceTimer?: NodeJS.Timeout;
  private readonly debounceDelay = 500; // 500ms debounce

  // Expose for testing
  public get testDebounceTimer(): NodeJS.Timeout | undefined {
    return this.debounceTimer;
  }

  constructor(
    context: vscode.ExtensionContext,
    ragEngine: RAGEngine,
    contextExtractor: CodeContextExtractor
  ) {
    this.context = context;
    this.hoverProvider = new HoverProvider(ragEngine, contextExtractor);
    this.sidePanelProvider = new SidePanelProvider(context.extensionUri, ragEngine, contextExtractor);
  }

  /**
   * Register hover provider with VS Code
   */
  registerHoverProvider(): vscode.HoverProvider {
    // Register for JavaScript and TypeScript files
    const selector: vscode.DocumentSelector = [
      { scheme: 'file', language: 'javascript' },
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'javascriptreact' },
      { scheme: 'file', language: 'typescriptreact' }
    ];

    const disposable = vscode.languages.registerHoverProvider(selector, this.hoverProvider);
    this.context.subscriptions.push(disposable);

    return this.hoverProvider;
  }

  /**
   * Register side panel webview provider with VS Code
   */
  registerSidePanel(): vscode.WebviewViewProvider {
    const disposable = vscode.window.registerWebviewViewProvider(
      SidePanelProvider.viewType,
      this.sidePanelProvider
    );
    this.context.subscriptions.push(disposable);

    return this.sidePanelProvider;
  }

  /**
   * Show explanation in the side panel
   */
  showExplanation(result: ExplanationResult): void {
    this.sidePanelProvider.showExplanation(result);
  }

  /**
   * Format explanation text for hover display
   */
  formatHoverText(explanation: string): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    markdown.appendMarkdown(explanation);
    return markdown;
  }

  /**
   * Update side panel with new explanation
   */
  updateSidePanel(result: ExplanationResult): void {
    this.sidePanelProvider.updateSidePanel(result);
  }

  /**
   * Register dynamic explanation updates when selection changes
   */
  registerDynamicUpdates(): void {
    // Listen for selection changes in the active editor
    this.selectionChangeListener = vscode.window.onDidChangeTextEditorSelection(
      (event) => this.handleSelectionChange(event)
    );
    
    this.context.subscriptions.push(this.selectionChangeListener);
  }

  /**
   * Unregister dynamic updates
   */
  unregisterDynamicUpdates(): void {
    if (this.selectionChangeListener) {
      this.selectionChangeListener.dispose();
      this.selectionChangeListener = undefined;
    }
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  /**
   * Handle selection changes with debouncing
   */
  private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Only process meaningful selections
    const selection = event.selections[0];
    if (!selection || selection.isEmpty || selection.isSingleLine && selection.start.character === selection.end.character) {
      return;
    }

    // Debounce the update to prevent excessive API calls
    this.debounceTimer = setTimeout(() => {
      this.updateExplanationForSelection(event.textEditor, selection);
    }, this.debounceDelay);
  }

  /**
   * Update explanation for the current selection
   */
  private async updateExplanationForSelection(
    editor: vscode.TextEditor,
    selection: vscode.Selection
  ): Promise<void> {
    try {
      // Only process JavaScript/TypeScript files
      const language = editor.document.languageId;
      if (!['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(language)) {
        return;
      }

      // Check if selection is meaningful (more than just whitespace)
      const selectedText = editor.document.getText(selection).trim();
      if (selectedText.length < 3) {
        return;
      }

      // Extract context and get explanation
      // Note: This would integrate with the RAG engine in a full implementation
      // For now, we'll just update the side panel to show that selection changed
      
      // In a full implementation, this would:
      // 1. Extract context using CodeContextExtractor
      // 2. Get explanation using RAGEngine
      // 3. Update side panel with new explanation
      
      console.log(`Selection changed: "${selectedText}" in ${editor.document.fileName}`);
      
    } catch (error) {
      console.error('Error updating explanation for selection:', error);
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.unregisterDynamicUpdates();
  }
}