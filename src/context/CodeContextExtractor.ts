/**
 * Code Context Extractor for AI Docs Interpreter
 * 
 * Extracts context from selected code including:
 * - Selected text and surrounding context
 * - Function/class names using AST parsing
 * - Import statements and dependencies
 * - Query string generation for vector search
 */

import * as vscode from 'vscode';
import { parse } from '@typescript-eslint/typescript-estree';
import { CodeContext, CodeContextExtractor as ICodeContextExtractor } from '../types/interfaces';

export class CodeContextExtractor implements ICodeContextExtractor {
  
  /**
   * Extract context from a VS Code selection
   */
  extractFromSelection(document: vscode.TextDocument, selection: vscode.Selection): CodeContext {
    const selectedText = document.getText(selection);
    const fileName = document.fileName;
    const language = document.languageId;
    
    // Get surrounding context (5 lines before and after)
    const surroundingContext = this.getSurroundingContext(document, selection);
    
    // Extract symbol name from selected text
    const functionName = this.extractSymbolName(selectedText);
    const className = this.extractClassName(selectedText);
    
    // Extract imports from the document
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

  /**
   * Extract function or class name from code text using AST parsing
   */
  extractSymbolName(text: string): string | undefined {
    try {
      // Try to parse as TypeScript/JavaScript
      const ast = parse(text, {
        loc: true,
        range: true,
        tokens: false,
        comment: false,
        jsx: true,
        errorOnUnknownASTType: false,
        errorOnTypeScriptSyntacticAndSemanticIssues: false
      });

      // Look for function declarations
      for (const node of ast.body) {
        if (node.type === 'FunctionDeclaration' && node.id) {
          return node.id.name;
        }
        if (node.type === 'VariableDeclaration') {
          for (const declarator of node.declarations) {
            if (declarator.id.type === 'Identifier' && 
                declarator.init && 
                (declarator.init.type === 'FunctionExpression' || 
                 declarator.init.type === 'ArrowFunctionExpression')) {
              return declarator.id.name;
            }
          }
        }
        if (node.type === 'ExportNamedDeclaration' && node.declaration) {
          if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
            return node.declaration.id.name;
          }
        }
      }
    } catch (error) {
      // If AST parsing fails, try regex fallback
      return this.extractSymbolNameRegex(text);
    }
    
    return undefined;
  }

  /**
   * Extract class name from code text using AST parsing
   */
  private extractClassName(text: string): string | undefined {
    try {
      const ast = parse(text, {
        loc: true,
        range: true,
        tokens: false,
        comment: false,
        jsx: true,
        errorOnUnknownASTType: false,
        errorOnTypeScriptSyntacticAndSemanticIssues: false
      });

      // Look for class declarations
      for (const node of ast.body) {
        if (node.type === 'ClassDeclaration' && node.id) {
          return node.id.name;
        }
        if (node.type === 'ExportNamedDeclaration' && node.declaration) {
          if (node.declaration.type === 'ClassDeclaration' && node.declaration.id) {
            return node.declaration.id.name;
          }
        }
      }
    } catch (error) {
      // If AST parsing fails, try regex fallback
      return this.extractClassNameRegex(text);
    }
    
    return undefined;
  }

  /**
   * Regex fallback for function name extraction
   */
  private extractSymbolNameRegex(text: string): string | undefined {
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

  /**
   * Regex fallback for class name extraction
   */
  private extractClassNameRegex(text: string): string | undefined {
    const classMatch = text.match(/class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    return classMatch ? classMatch[1] : undefined;
  }

  /**
   * Extract import statements from document
   */
  extractImports(document: vscode.TextDocument): string[] {
    const imports: string[] = [];
    const text = document.getText();
    
    // Match ES6 imports
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(text)) !== null) {
      imports.push(match[1]);
    }
    
    // Match CommonJS requires
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(text)) !== null) {
      imports.push(match[1]);
    }
    
    return [...new Set(imports)]; // Remove duplicates
  }

  /**
   * Build query string for vector search from context
   */
  buildQueryString(context: CodeContext): string {
    const parts: string[] = [];
    
    // Add selected text (most important)
    if (context.selectedText.trim()) {
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
    if (context.selectedText.length < 100 && context.surroundingContext.trim()) {
      parts.push(context.surroundingContext.trim());
    }
    
    return parts.join(' ');
  }

  /**
   * Get surrounding context around the selection
   */
  private getSurroundingContext(document: vscode.TextDocument, selection: vscode.Selection): string {
    const startLine = Math.max(0, selection.start.line - 5);
    const endLine = Math.min(document.lineCount - 1, selection.end.line + 5);
    
    const contextRange = new vscode.Range(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );
    
    return document.getText(contextRange);
  }
}