/**
 * Shared TypeScript interfaces for the AI Docs Interpreter extension
 */

import * as vscode from 'vscode';

// Core data structures
export interface DocumentationChunk {
  id: string;
  filePath: string;
  sectionHeading: string;
  content: string;
  embedding?: number[];
  metadata: {
    level: number; // Header level (1-6)
    wordCount: number;
    lastModified: Date;
  };
}

export interface CodeContext {
  selectedText: string;
  fileName: string;
  functionName?: string;
  className?: string;
  imports: string[];
  surroundingContext: string;
  language: string;
}

export interface Citation {
  filePath: string;
  sectionHeading: string;
  relevanceScore: number;
}

export interface ExplanationResult {
  explanation: string;
  citations: Citation[];
  confidence: number;
  hasRelevantDocs: boolean;
}

export interface ExplanationCache {
  key: string; // Hash of code context
  explanation: string;
  citations: Citation[];
  timestamp: Date;
  ttl: number; // Time to live in milliseconds
}

// Configuration interfaces
export interface VectorStoreConfig {
  dbPath: string;
  embeddingModel: string;
  similarityThreshold: number;
  maxResults: number;
}

export interface ExtensionConfig {
  indexing: {
    includePaths: string[];
    excludePaths: string[];
    maxFileSize: number;
    autoReindex: boolean;
  };
  retrieval: {
    topK: number;
    similarityThreshold: number;
    maxContextLength: number;
  };
  ui: {
    hoverEnabled: boolean;
    sidePanelEnabled: boolean;
    maxHoverLines: number;
  };
}

// Component interfaces
export interface DocumentationIndexer {
  indexWorkspace(): Promise<void>;
  scanMarkdownFiles(): Promise<string[]>;
  processFile(filePath: string): Promise<DocumentationChunk[]>;
  splitByHeaders(content: string, filePath: string): DocumentationChunk[];
  generateEmbeddings(chunks: DocumentationChunk[]): Promise<DocumentationChunk[]>;
}

export interface VectorStore {
  initialize(): Promise<void>;
  storeChunks(chunks: DocumentationChunk[]): Promise<void>;
  searchSimilar(query: string, topK: number): Promise<DocumentationChunk[]>;
  generateEmbedding(text: string): Promise<number[]>;
  clearIndex(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<{ status: 'healthy' | 'unhealthy' | 'not_initialized'; issues?: string[]; stats?: any; details?: any }>;
}

export interface CodeContextExtractor {
  extractFromSelection(document: vscode.TextDocument, selection: vscode.Selection): CodeContext;
  extractSymbolName(text: string): string | undefined;
  extractImports(document: vscode.TextDocument): string[];
  buildQueryString(context: CodeContext): string;
}

export interface RAGEngine {
  explainCode(context: CodeContext): Promise<ExplanationResult>;
  retrieveRelevantDocs(query: string): Promise<DocumentationChunk[]>;
  generateExplanation(context: CodeContext, docs: DocumentationChunk[]): Promise<string>;
  validateResponse(response: string, docs: DocumentationChunk[]): boolean;
}

export interface UIProvider {
  registerHoverProvider(): vscode.HoverProvider;
  registerSidePanel(): vscode.WebviewViewProvider;
  showExplanation(result: ExplanationResult): void;
  formatHoverText(explanation: string): vscode.MarkdownString;
  updateSidePanel(result: ExplanationResult): void;
}

// VS Code extension interfaces
export interface AIDocsExtension {
  activate(context: vscode.ExtensionContext): void;
  deactivate(): void;
  registerCommands(): void;
  registerProviders(): void;
}