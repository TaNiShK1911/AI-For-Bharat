/**
 * Hover Provider for AI Docs Interpreter
 * 
 * Provides brief code explanations (2-3 lines) when hovering over code symbols
 * using grounded documentation through the RAG engine.
 */

import * as vscode from 'vscode';
import { RAGEngine } from '../rag/RAGEngine';
import { CodeContextExtractor } from '../context/CodeContextExtractor';
import { ExplanationResult } from '../types/interfaces';

export class HoverProvider implements vscode.HoverProvider {
  private ragEngine: RAGEngine;
  private contextExtractor: CodeContextExtractor;

  constructor(ragEngine: RAGEngine, contextExtractor: CodeContextExtractor) {
    this.ragEngine = ragEngine;
    this.contextExtractor = contextExtractor;
  }

  /**
   * Provide hover information for code symbols
   */
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    try {
      // Check if request was cancelled
      if (token.isCancellationRequested) {
        return undefined;
      }

      // Get word range at position
      const wordRange = document.getWordRangeAtPosition(position);
      if (!wordRange) {
        return undefined;
      }

      // Create selection from word range
      const selection = new vscode.Selection(wordRange.start, wordRange.end);
      
      // Extract context from the selection
      const context = this.contextExtractor.extractFromSelection(document, selection);
      
      // Check if we have meaningful content to explain
      if (!context.selectedText.trim() || context.selectedText.length < 2) {
        return undefined;
      }

      // Get explanation from RAG engine
      const explanationResult = await this.ragEngine.explainCode(context);
      
      // Check if request was cancelled during processing
      if (token.isCancellationRequested) {
        return undefined;
      }

      // Return undefined if no relevant documentation found
      if (!explanationResult.hasRelevantDocs || explanationResult.explanation === "Not documented.") {
        return undefined;
      }

      // Format explanation for hover display (2-3 lines maximum)
      const hoverText = this.formatHoverText(explanationResult);
      
      return new vscode.Hover(hoverText, wordRange);
    } catch (error) {
      console.error('Error in HoverProvider:', error);
      return undefined;
    }
  }

  /**
   * Format explanation text for hover display with 2-3 line constraint
   */
  private formatHoverText(result: ExplanationResult): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString();
    markdown.isTrusted = true;
    
    // Truncate explanation to 2-3 lines maximum
    const truncatedExplanation = this.truncateToLines(result.explanation, 3);
    
    // Add the explanation
    markdown.appendMarkdown(truncatedExplanation);
    
    // Add primary citation if available (keep it brief for hover)
    if (result.citations.length > 0) {
      const primaryCitation = result.citations[0];
      markdown.appendMarkdown(`\n\n*Source: ${this.formatCitationBrief(primaryCitation)}*`);
    }
    
    return markdown;
  }

  /**
   * Truncate text to specified number of lines
   */
  private truncateToLines(text: string, maxLines: number): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) {
      return text;
    }

    // Start with first sentence
    let result = sentences[0].trim();
    if (!result.match(/[.!?]$/)) {
      result += '.';
    }
    
    let lineCount = 1;
    
    // Add more sentences if we have room
    for (let i = 1; i < sentences.length && lineCount < maxLines; i++) {
      const sentence = sentences[i].trim();
      if (sentence.length > 0) {
        const addition = ' ' + sentence;
        if (!sentence.match(/[.!?]$/)) {
          addition + '.';
        }
        
        // Estimate if adding this sentence would exceed line limit
        // Rough estimate: 80 characters per line
        const estimatedLines = Math.ceil((result + addition).length / 80);
        
        if (estimatedLines <= maxLines) {
          result += addition;
          lineCount = estimatedLines;
        } else {
          break;
        }
      }
    }
    
    // Add ellipsis if we truncated
    if (sentences.length > 1 && !result.includes(sentences[sentences.length - 1])) {
      result += '...';
    }
    
    return result;
  }

  /**
   * Format citation for brief display in hover
   */
  private formatCitationBrief(citation: { filePath: string; sectionHeading: string }): string {
    // Extract just the filename from the path
    const fileName = citation.filePath.split('/').pop() || citation.filePath;
    
    // Truncate section heading if too long
    let section = citation.sectionHeading;
    if (section.length > 30) {
      section = section.substring(0, 27) + '...';
    }
    
    return `${fileName}, ${section}`;
  }
}