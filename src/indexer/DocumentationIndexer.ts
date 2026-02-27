/**
 * Documentation Indexer for scanning and processing markdown files
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';
import { DocumentationIndexer as IDocumentationIndexer, DocumentationChunk, VectorStore } from '../types/interfaces';

export class DocumentationIndexer implements IDocumentationIndexer {
  private workspaceRoot: string;
  private vectorStore?: VectorStore;

  constructor(workspaceRoot: string, vectorStore?: VectorStore) {
    this.workspaceRoot = workspaceRoot;
    this.vectorStore = vectorStore;
  }

  /**
   * Index the entire workspace documentation
   */
  async indexWorkspace(): Promise<void> {
    try {
      const markdownFiles = await this.scanMarkdownFiles();
      const allChunks: DocumentationChunk[] = [];

      for (const filePath of markdownFiles) {
        try {
          const chunks = await this.processFile(filePath);
          allChunks.push(...chunks);
        } catch (error) {
          console.warn(`Failed to process file ${filePath}:`, error);
          // Continue processing other files
        }
      }

      // Generate embeddings for all chunks
      const chunksWithEmbeddings = await this.generateEmbeddings(allChunks);

      // Store chunks in vector store if available
      if (this.vectorStore) {
        await this.vectorStore.storeChunks(chunksWithEmbeddings);
      }

      console.log(`Indexed ${chunksWithEmbeddings.length} documentation chunks from ${markdownFiles.length} files`);
    } catch (error) {
      console.error('Failed to index workspace:', error);
      throw error;
    }
  }

  /**
   * Scan for markdown files in the workspace
   * Finds README.md in project root and all .md files in docs directory recursively
   */
  async scanMarkdownFiles(): Promise<string[]> {
    const markdownFiles: string[] = [];

    try {
      // Check for README.md in project root
      const readmePath = path.join(this.workspaceRoot, 'README.md');
      try {
        await fs.access(readmePath);
        markdownFiles.push(readmePath);
      } catch {
        // README.md doesn't exist, continue
      }

      // Find all markdown files in docs/**/*.md recursively
      const docsPattern = path.join(this.workspaceRoot, 'docs', '**', '*.md').replace(/\\/g, '/');
      const docsFiles = await glob(docsPattern, { 
        absolute: true,
        ignore: ['**/node_modules/**', '**/.git/**']
      });

      markdownFiles.push(...docsFiles);

      // Remove duplicates and sort
      const uniqueFiles = [...new Set(markdownFiles)].sort();
      
      return uniqueFiles;
    } catch (error) {
      console.error('Error scanning markdown files:', error);
      throw error;
    }
  }

  /**
   * Process a single markdown file and extract documentation chunks
   */
  async processFile(filePath: string): Promise<DocumentationChunk[]> {
    try {
      // Validate file extension
      if (!filePath.toLowerCase().endsWith('.md')) {
        throw new Error(`Invalid file type: ${filePath}. Only .md files are supported.`);
      }

      // Check if file exists and is accessible
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path is not a file: ${filePath}`);
      }

      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Parse frontmatter if present
      const parsed = matter(content);
      const markdownContent = parsed.content;

      // Split content by headers
      const chunks = this.splitByHeaders(markdownContent, filePath);

      return chunks;
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Split markdown content by headers into documentation chunks
   */
  splitByHeaders(content: string, filePath: string): DocumentationChunk[] {
    const chunks: DocumentationChunk[] = [];
    
    // Handle undefined or null content
    if (!content || typeof content !== 'string') {
      return chunks;
    }
    
    const lines = content.split('\n');
    const usedIds = new Set<string>();
    
    let currentChunk: {
      heading: string;
      level: number;
      content: string[];
      startLine: number;
    } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headerMatch) {
        // Save previous chunk if it exists
        if (currentChunk) {
          const chunkContent = currentChunk.content.join('\n').trim();
          if (chunkContent.length > 0 || currentChunk.content.length === 0) {
            chunks.push(this.createDocumentationChunk(
              currentChunk.heading,
              currentChunk.level,
              chunkContent,
              filePath,
              usedIds
            ));
          }
        }

        // Start new chunk
        const level = headerMatch[1].length;
        const heading = headerMatch[2].trim();
        
        // Skip headers with empty headings after trimming
        if (heading.length === 0) {
          continue;
        }
        
        currentChunk = {
          heading,
          level,
          content: [],
          startLine: i
        };
      } else if (currentChunk) {
        // Add line to current chunk
        currentChunk.content.push(line);
      } else {
        // Content before first header - create a default chunk
        if (line.trim()) {
          if (!currentChunk) {
            currentChunk = {
              heading: 'Introduction',
              level: 1,
              content: [],
              startLine: i
            };
          }
          currentChunk.content.push(line);
        }
      }
    }

    // Save final chunk
    if (currentChunk) {
      const chunkContent = currentChunk.content.join('\n').trim();
      chunks.push(this.createDocumentationChunk(
        currentChunk.heading,
        currentChunk.level,
        chunkContent,
        filePath,
        usedIds
      ));
    }

    return chunks.filter(chunk => chunk.content.trim().length > 0 || chunk.sectionHeading !== 'Introduction');
  }

  /**
   * Create a DocumentationChunk object with metadata
   */
  private createDocumentationChunk(
    heading: string,
    level: number,
    content: string,
    filePath: string,
    usedIds: Set<string>
  ): DocumentationChunk {
    const relativePath = path.relative(this.workspaceRoot, filePath);
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
    const id = this.generateUniqueChunkId(relativePath, heading, usedIds);
    
    return {
      id: id,
      filePath: relativePath,
      sectionHeading: heading,
      content: content,
      metadata: {
        level: level,
        wordCount: wordCount,
        lastModified: new Date()
      }
    };
  }

  /**
   * Generate a unique ID for a documentation chunk
   */
  private generateUniqueChunkId(filePath: string, heading: string, usedIds: Set<string>): string {
    // Create a base ID from file path and heading
    const baseId = `${filePath}#${heading}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Remove consecutive dashes and trim dashes from ends
    let cleanId = baseId.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    
    // Ensure we have a valid ID (fallback if everything was stripped)
    if (!cleanId) {
      cleanId = 'unnamed-section';
    }
    
    // Make it unique by adding a counter if needed
    let uniqueId = cleanId;
    let counter = 1;
    while (usedIds.has(uniqueId)) {
      uniqueId = `${cleanId}-${counter}`;
      counter++;
    }
    
    usedIds.add(uniqueId);
    return uniqueId;
  }

  /**
   * Generate embeddings for documentation chunks using the vector store
   */
  async generateEmbeddings(chunks: DocumentationChunk[]): Promise<DocumentationChunk[]> {
    if (!this.vectorStore) {
      console.warn('No vector store available for embedding generation');
      return chunks;
    }

    console.log(`Generating embeddings for ${chunks.length} chunks`);
    const chunksWithEmbeddings: DocumentationChunk[] = [];

    for (const chunk of chunks) {
      try {
        // Generate embedding for the chunk content
        const embedding = await this.vectorStore.generateEmbedding(chunk.content);
        
        // Create new chunk with embedding
        const chunkWithEmbedding: DocumentationChunk = {
          ...chunk,
          embedding: embedding
        };
        
        chunksWithEmbeddings.push(chunkWithEmbedding);
      } catch (error) {
        console.warn(`Failed to generate embedding for chunk ${chunk.id}:`, error);
        // Add chunk without embedding to continue processing
        chunksWithEmbeddings.push(chunk);
      }
    }

    return chunksWithEmbeddings;
  }
}