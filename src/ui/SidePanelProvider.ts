/**
 * Side Panel Provider for AI Docs Interpreter
 * 
 * Provides detailed code explanations with citations in a VS Code webview side panel
 * with bullet point formatting and markdown rendering support.
 */

import * as vscode from 'vscode';
import { RAGEngine } from '../rag/RAGEngine';
import { CodeContextExtractor } from '../context/CodeContextExtractor';
import { ExplanationResult, Citation } from '../types/interfaces';

export class SidePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ai-docs-interpreter.sidePanel';
  
  private _view?: vscode.WebviewView;
  private ragEngine: RAGEngine;
  private contextExtractor: CodeContextExtractor;
  private currentExplanation?: ExplanationResult;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    ragEngine: RAGEngine,
    contextExtractor: CodeContextExtractor
  ) {
    this.ragEngine = ragEngine;
    this.contextExtractor = contextExtractor;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [
        this._extensionUri
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(data => {
      switch (data.type) {
        case 'explainSelection':
          this.explainCurrentSelection();
          break;
        case 'clearExplanation':
          this.clearExplanation();
          break;
      }
    });
  }

  /**
   * Update the side panel with a new explanation
   */
  public updateSidePanel(result: ExplanationResult): void {
    this.currentExplanation = result;
    
    if (this._view) {
      this._view.webview.postMessage({
        type: 'updateExplanation',
        explanation: result
      });
    }
  }

  /**
   * Show explanation in the side panel
   */
  public showExplanation(result: ExplanationResult): void {
    this.updateSidePanel(result);
    
    // Reveal the side panel if it's not visible
    if (this._view) {
      this._view.show?.(true);
    }
  }

  /**
   * Explain the currently selected code
   */
  private async explainCurrentSelection(): Promise<void> {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        this.showError('No active editor found. Please select some code first.');
        return;
      }

      const selection = editor.selection;
      if (selection.isEmpty) {
        this.showError('No code selected. Please select some code to explain.');
        return;
      }

      // Show loading state
      this.showLoading();

      // Extract context from selection
      const context = this.contextExtractor.extractFromSelection(editor.document, selection);
      
      // Get explanation from RAG engine
      const explanationResult = await this.ragEngine.explainCode(context);
      
      // Update the side panel with the result
      this.updateSidePanel(explanationResult);
      
    } catch (error) {
      console.error('Error explaining selection:', error);
      this.showError(`Failed to explain code: ${error}`);
    }
  }

  /**
   * Clear the current explanation
   */
  private clearExplanation(): void {
    this.currentExplanation = undefined;
    
    if (this._view) {
      this._view.webview.postMessage({
        type: 'clearExplanation'
      });
    }
  }

  /**
   * Show loading state in the side panel
   */
  private showLoading(): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'showLoading'
      });
    }
  }

  /**
   * Show error message in the side panel
   */
  private showError(message: string): void {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'showError',
        message
      });
    }
  }

  /**
   * Generate HTML content for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
    const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
    const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
    const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleResetUri}" rel="stylesheet">
        <link href="${styleVSCodeUri}" rel="stylesheet">
        <link href="${styleMainUri}" rel="stylesheet">
        <title>AI Docs Interpreter</title>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>AI Docs Interpreter</h2>
            <p class="subtitle">Grounded code explanations from your project documentation</p>
          </div>
          
          <div class="controls">
            <button id="explainBtn" class="button primary">Explain Selected Code</button>
            <button id="clearBtn" class="button secondary">Clear</button>
          </div>
          
          <div id="content" class="content">
            <div id="welcome" class="welcome">
              <p>Select some code in the editor and click "Explain Selected Code" to get a documentation-grounded explanation.</p>
              <ul class="features">
                <li>• Explanations based only on your project documentation</li>
                <li>• No hallucination or speculation</li>
                <li>• Complete citations for all claims</li>
                <li>• Works entirely offline</li>
              </ul>
            </div>
            
            <div id="loading" class="loading hidden">
              <div class="spinner"></div>
              <p>Analyzing code and searching documentation...</p>
            </div>
            
            <div id="error" class="error hidden">
              <h3>Error</h3>
              <p id="errorMessage"></p>
            </div>
            
            <div id="explanation" class="explanation hidden">
              <div id="explanationContent"></div>
              <div id="citations" class="citations"></div>
              <div id="confidence" class="confidence"></div>
            </div>
          </div>
        </div>
        
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          
          // Button event listeners
          document.getElementById('explainBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'explainSelection' });
          });
          
          document.getElementById('clearBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'clearExplanation' });
          });
          
          // Handle messages from the extension
          window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
              case 'updateExplanation':
                showExplanation(message.explanation);
                break;
              case 'clearExplanation':
                showWelcome();
                break;
              case 'showLoading':
                showLoading();
                break;
              case 'showError':
                showError(message.message);
                break;
            }
          });
          
          function showWelcome() {
            hideAll();
            document.getElementById('welcome').classList.remove('hidden');
          }
          
          function showLoading() {
            hideAll();
            document.getElementById('loading').classList.remove('hidden');
          }
          
          function showError(message) {
            hideAll();
            document.getElementById('error').classList.remove('hidden');
            document.getElementById('errorMessage').textContent = message;
          }
          
          function showExplanation(result) {
            hideAll();
            
            if (!result.hasRelevantDocs || result.explanation === "Not documented.") {
              showError("No relevant documentation found for the selected code. Make sure you've indexed your project documentation first.");
              return;
            }
            
            const explanationDiv = document.getElementById('explanation');
            const contentDiv = document.getElementById('explanationContent');
            const citationsDiv = document.getElementById('citations');
            const confidenceDiv = document.getElementById('confidence');
            
            // Format explanation with bullet points
            contentDiv.innerHTML = formatExplanationWithBullets(result.explanation);
            
            // Format citations
            if (result.citations && result.citations.length > 0) {
              citationsDiv.innerHTML = formatCitations(result.citations);
            } else {
              citationsDiv.innerHTML = '';
            }
            
            // Show confidence if available
            if (result.confidence !== undefined) {
              const confidencePercent = Math.round(result.confidence * 100);
              confidenceDiv.innerHTML = \`<div class="confidence-bar">
                <span class="confidence-label">Confidence: \${confidencePercent}%</span>
                <div class="confidence-progress">
                  <div class="confidence-fill" style="width: \${confidencePercent}%"></div>
                </div>
              </div>\`;
            } else {
              confidenceDiv.innerHTML = '';
            }
            
            explanationDiv.classList.remove('hidden');
          }
          
          function hideAll() {
            document.getElementById('welcome').classList.add('hidden');
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('error').classList.add('hidden');
            document.getElementById('explanation').classList.add('hidden');
          }
          
          function formatExplanationWithBullets(explanation) {
            // Split explanation into sentences and format as bullet points
            const sentences = explanation.split(/(?<=[.!?])\\s+/).filter(s => s.trim().length > 0);
            
            if (sentences.length <= 1) {
              return \`<p>\${escapeHtml(explanation)}</p>\`;
            }
            
            let html = '<ul class="explanation-bullets">';
            for (const sentence of sentences) {
              const cleanSentence = sentence.trim();
              if (cleanSentence.length > 0) {
                // Remove citation references from bullet points (they'll be shown separately)
                const withoutCitations = cleanSentence.replace(/\\(Source:[^)]+\\)/g, '').trim();
                if (withoutCitations.length > 0) {
                  html += \`<li>\${escapeHtml(withoutCitations)}</li>\`;
                }
              }
            }
            html += '</ul>';
            
            return html;
          }
          
          function formatCitations(citations) {
            let html = '<div class="citations-header"><h4>Sources</h4></div><ul class="citations-list">';
            
            for (const citation of citations) {
              const fileName = citation.filePath.split('/').pop() || citation.filePath;
              const relevancePercent = Math.round((citation.relevanceScore || 0) * 100);
              
              html += \`<li class="citation-item">
                <div class="citation-main">
                  <strong>\${escapeHtml(fileName)}</strong>
                  <span class="citation-section">\${escapeHtml(citation.sectionHeading)}</span>
                </div>
                <div class="citation-relevance">Relevance: \${relevancePercent}%</div>
              </li>\`;
            }
            
            html += '</ul>';
            return html;
          }
          
          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }
        </script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}