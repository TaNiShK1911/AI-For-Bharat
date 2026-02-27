/**
 * Simple VectorStore implementation using VS Code's built-in storage
 * Avoids native dependencies like SQLite3
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DocumentationChunk, VectorStoreConfig, VectorStore } from '../types/interfaces';

export class SimpleVectorStore implements VectorStore {
  private chunks: DocumentationChunk[] = [];
  private config: VectorStoreConfig;
  private isInitialized: boolean = false;
  private storageUri: vscode.Uri;

  constructor(config: VectorStoreConfig, context: vscode.ExtensionContext) {
    this.config = config;
    // Use workspace-based storage path from config instead of global storage
    const workspaceStoragePath = path.dirname(config.dbPath); // .aidocs directory
    const storageFileName = 'documentation-chunks.json';
    this.storageUri = vscode.Uri.file(path.join(workspaceStoragePath, storageFileName));
  }

  /**
   * Initialize the simple vector store
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Ensure storage directory exists
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.storageUri, '..'));
      
      // Load existing chunks if they exist
      await this.loadChunks();
      
      this.isInitialized = true;
      console.log('SimpleVectorStore initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SimpleVectorStore:', error);
      throw error;
    }
  }

  /**
   * Load chunks from storage
   */
  private async loadChunks(): Promise<void> {
    try {
      const data = await vscode.workspace.fs.readFile(this.storageUri);
      const jsonData = Buffer.from(data).toString('utf8');
      this.chunks = JSON.parse(jsonData);
      console.log(`Loaded ${this.chunks.length} documentation chunks from storage`);
    } catch (error) {
      // File doesn't exist or is corrupted, start with empty chunks
      this.chunks = [];
      console.log('No existing chunks found, starting with empty storage');
    }
  }

  /**
   * Save chunks to storage
   */
  private async saveChunks(): Promise<void> {
    try {
      const jsonData = JSON.stringify(this.chunks, null, 2);
      const data = Buffer.from(jsonData, 'utf8');
      await vscode.workspace.fs.writeFile(this.storageUri, data);
      console.log(`Saved ${this.chunks.length} documentation chunks to storage`);
    } catch (error) {
      console.error('Failed to save chunks:', error);
      throw error;
    }
  }

  /**
   * Store documentation chunks
   */
  async storeChunks(chunks: DocumentationChunk[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('VectorStore not initialized');
    }

    // Clear existing chunks and add new ones
    this.chunks = [...chunks];
    
    // Generate simple embeddings for each chunk
    for (const chunk of this.chunks) {
      chunk.embedding = await this.generateEmbedding(chunk.content);
    }

    await this.saveChunks();
    console.log(`Stored ${chunks.length} documentation chunks`);
  }

  /**
   * Search for similar chunks using simple text matching
   */
  async searchSimilar(query: string, topK: number = 5): Promise<DocumentationChunk[]> {
    if (!this.isInitialized) {
      throw new Error('VectorStore not initialized');
    }

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);

    // Score chunks based on keyword matches
    const scoredChunks = this.chunks.map(chunk => {
      const contentLower = chunk.content.toLowerCase();
      const headingLower = chunk.sectionHeading.toLowerCase();
      
      let score = 0;
      
      // Exact phrase match gets highest score
      if (contentLower.includes(queryLower)) {
        score += 10;
      }
      
      // Heading matches get high score
      if (headingLower.includes(queryLower)) {
        score += 8;
      }
      
      // Individual word matches
      for (const word of queryWords) {
        if (contentLower.includes(word)) {
          score += 1;
        }
        if (headingLower.includes(word)) {
          score += 2;
        }
      }
      
      return { chunk, score };
    });

    // Filter by similarity threshold and sort by score
    const filteredChunks = scoredChunks
      .filter(item => item.score >= this.config.similarityThreshold * 10) // Scale threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(topK, this.config.maxResults))
      .map(item => item.chunk);

    console.log(`Found ${filteredChunks.length} similar chunks for query: "${query}"`);
    return filteredChunks;
  }

  /**
   * Generate simple hash-based embedding
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Simple hash-based embedding for demonstration
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(100).fill(0);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const hash = this.simpleHash(word);
      const index = Math.abs(hash) % embedding.length;
      embedding[index] += 1;
    }
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  /**
   * Clear all stored chunks
   */
  async clearIndex(): Promise<void> {
    this.chunks = [];
    await this.saveChunks();
    console.log('Cleared all documentation chunks');
  }

  /**
   * Close the vector store (cleanup)
   */
  async close(): Promise<void> {
    // Nothing to close for file-based storage
    this.isInitialized = false;
    console.log('SimpleVectorStore closed');
  }

  /**
   * Get statistics about stored chunks
   */
  getStats(): { totalChunks: number; totalFiles: number } {
    const uniqueFiles = new Set(this.chunks.map(chunk => chunk.filePath));
    return {
      totalChunks: this.chunks.length,
      totalFiles: uniqueFiles.size
    };
  }

  /**
   * Health check for the vector store
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy' | 'not_initialized'; issues?: string[]; stats?: any; details?: any }> {
    return {
      status: this.isInitialized ? 'healthy' : 'not_initialized',
      details: {
        initialized: this.isInitialized,
        chunksCount: this.chunks.length,
        storageUri: this.storageUri.toString()
      }
    };
  }
}