/**
 * VectorStore implementation using SQLite for vector operations
 * Uses simple hash-based embeddings for local operation without external dependencies
 */

import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { DocumentationChunk, VectorStoreConfig } from '../types/interfaces';
import { ComponentLogger, logger } from '../utils/Logger';

export class VectorStore {
  private db: sqlite3.Database | null = null;
  private config: VectorStoreConfig;
  private logger: ComponentLogger;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: VectorStoreConfig) {
    this.config = config;
    this.logger = logger.createComponentLogger('VectorStore');
    this.logger.info('VectorStore instance created', { dbPath: config.dbPath });
  }

  /**
   * Initialize the SQLite database with vector search capabilities
   */
  async initialize(): Promise<void> {
    // Prevent multiple initialization attempts
    if (this.isInitialized) {
      this.logger.debug('VectorStore already initialized');
      return;
    }

    if (this.initializationPromise) {
      this.logger.debug('VectorStore initialization in progress, waiting...');
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    this.logger.info('Initializing VectorStore database', { dbPath: this.config.dbPath });

    return new Promise((resolve, reject) => {
      try {
        // Validate configuration
        if (!this.config.dbPath) {
          const error = new Error('Database path is required in configuration');
          this.logger.error('Invalid configuration', error, { config: this.config });
          reject(error);
          return;
        }

        // Ensure the directory exists
        const dbDir = path.dirname(this.config.dbPath);
        try {
          if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            this.logger.info('Created database directory', { dbDir });
          }
        } catch (dirError) {
          const error = new Error(`Failed to create database directory: ${dirError}`);
          this.logger.error('Directory creation failed', error, { dbDir });
          reject(error);
          return;
        }

        // Initialize SQLite database with error handling
        this.db = new sqlite3.Database(this.config.dbPath, (err) => {
          if (err) {
            const error = new Error(`Failed to initialize database: ${err.message}`);
            this.logger.error('Database initialization failed', error, { dbPath: this.config.dbPath });
            reject(error);
            return;
          }

          this.logger.info('Database connection established');

          // Create the documentation_chunks table with comprehensive error handling
          this.db!.serialize(() => {
            this.db!.run(`
              CREATE TABLE IF NOT EXISTS documentation_chunks (
                id TEXT PRIMARY KEY,
                file_path TEXT NOT NULL,
                section_heading TEXT NOT NULL,
                content TEXT NOT NULL,
                embedding BLOB,
                word_count INTEGER,
                header_level INTEGER,
                last_modified DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )
            `, (err) => {
              if (err) {
                const error = new Error(`Failed to create table: ${err.message}`);
                this.logger.error('Table creation failed', error);
                reject(error);
                return;
              }
              this.logger.debug('Documentation chunks table created/verified');
            });

            this.db!.run(`
              CREATE INDEX IF NOT EXISTS idx_file_path ON documentation_chunks(file_path)
            `, (err) => {
              if (err) {
                this.logger.warn('Failed to create file_path index', new Error(err.message), { error: err.message });
              } else {
                this.logger.debug('File path index created/verified');
              }
            });

            this.db!.run(`
              CREATE INDEX IF NOT EXISTS idx_section_heading ON documentation_chunks(section_heading)
            `, (err) => {
              if (err) {
                this.logger.warn('Failed to create section_heading index', new Error(err.message), { error: err.message });
              } else {
                this.logger.debug('Section heading index created/verified');
              }
              
              // Mark as initialized and resolve
              this.isInitialized = true;
              this.logger.info('VectorStore initialization completed successfully');
              resolve();
            });
          });
        });

        // Handle database connection errors
        this.db.on('error', (err) => {
          this.logger.error('Database connection error', err);
        });

      } catch (error) {
        const initError = new Error(`VectorStore initialization failed: ${error}`);
        this.logger.error('Initialization exception', initError);
        reject(initError);
      }
    });
  }

  /**
   * Generate embedding for a given text using a simple hash-based approach
   * This is a simplified implementation for local operation without ML dependencies
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      this.logger.debug('Generating embedding', { textLength: text.length });

      // Validate input
      if (!text || typeof text !== 'string') {
        throw new Error('Text input is required and must be a string');
      }

      if (text.trim().length === 0) {
        this.logger.warn('Empty text provided for embedding generation');
        return new Array(128).fill(0);
      }

      // Simple embedding generation using text features
      // In production, this would use a proper embedding model like Universal Sentence Encoder
      
      const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 0);
      const embedding = new Array(128).fill(0); // 128-dimensional embedding
      
      if (words.length === 0) {
        this.logger.warn('No valid words found in text for embedding');
        return embedding;
      }
      
      // Generate features based on text characteristics
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        try {
          const hash = this.simpleHash(word);
          
          // Distribute word features across embedding dimensions
          for (let j = 0; j < embedding.length; j++) {
            const feature = Math.sin((hash + j) * 0.1) * Math.cos((i + j) * 0.05);
            embedding[j] += feature / Math.sqrt(words.length);
          }
        } catch (wordError) {
          this.logger.warn('Failed to process word in embedding', wordError instanceof Error ? wordError : new Error(String(wordError)), { word, error: wordError });
          continue;
        }
      }
      
      // Normalize the embedding vector
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      if (norm > 0) {
        for (let i = 0; i < embedding.length; i++) {
          embedding[i] /= norm;
        }
      } else {
        this.logger.warn('Zero norm embedding generated, using default');
        // Return a small random embedding to avoid zero vectors
        for (let i = 0; i < embedding.length; i++) {
          embedding[i] = (Math.random() - 0.5) * 0.01;
        }
      }
      
      this.logger.debug('Embedding generated successfully', { 
        textLength: text.length, 
        wordCount: words.length,
        embeddingDimensions: embedding.length 
      });
      
      return embedding;
    } catch (error) {
      const embeddingError = new Error(`Failed to generate embedding: ${error}`);
      this.logger.error('Embedding generation failed', embeddingError, { textLength: text?.length });
      throw embeddingError;
    }
  }
  /**
   * Simple hash function for consistent word encoding
   */
  private simpleHash(str: string): number {
    try {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash);
    } catch (error) {
      this.logger.warn('Hash function failed, using fallback', new Error(String(error)), { str, error });
      return Math.abs(str.length * 31); // Simple fallback
    }
  }

  /**
   * Store documentation chunks with their embeddings in the database
   */
  async storeChunks(chunks: DocumentationChunk[]): Promise<void> {
    try {
      this.logger.info('Storing documentation chunks', { chunkCount: chunks.length });

      // Validate database state
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      if (!this.isInitialized) {
        throw new Error('VectorStore not properly initialized');
      }

      if (!chunks || !Array.isArray(chunks)) {
        throw new Error('Chunks must be a valid array');
      }

      if (chunks.length === 0) {
        this.logger.info('No chunks to store');
        return;
      }

      // Validate chunks before processing
      const validChunks = chunks.filter((chunk, index) => {
        try {
          if (!chunk.id || !chunk.filePath || !chunk.sectionHeading || !chunk.content) {
            this.logger.warn('Invalid chunk detected, skipping', undefined, { 
              index, 
              hasId: !!chunk.id, 
              hasFilePath: !!chunk.filePath,
              hasSectionHeading: !!chunk.sectionHeading,
              hasContent: !!chunk.content
            });
            return false;
          }
          return true;
        } catch (validationError) {
          this.logger.warn('Chunk validation failed, skipping', validationError instanceof Error ? validationError : new Error(String(validationError)), { index, error: validationError });
          return false;
        }
      });

      if (validChunks.length === 0) {
        throw new Error('No valid chunks found to store');
      }

      if (validChunks.length < chunks.length) {
        this.logger.warn('Some chunks were invalid and skipped', undefined, { 
          originalCount: chunks.length, 
          validCount: validChunks.length 
        });
      }

      return new Promise(async (resolve, reject) => {
        let stmt: sqlite3.Statement | null = null;
        
        try {
          stmt = this.db!.prepare(`
            INSERT OR REPLACE INTO documentation_chunks 
            (id, file_path, section_heading, content, embedding, word_count, header_level, last_modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          let successCount = 0;
          let errorCount = 0;

          // Process chunks sequentially to avoid race conditions
          for (const [index, chunk] of validChunks.entries()) {
            try {
              this.logger.debug('Processing chunk', { index: index + 1, total: validChunks.length, chunkId: chunk.id });

              // Generate embedding if not already present
              if (!chunk.embedding) {
                try {
                  chunk.embedding = await this.generateEmbedding(chunk.content);
                } catch (embeddingError) {
                  this.logger.error('Failed to generate embedding for chunk', embeddingError instanceof Error ? embeddingError : new Error(String(embeddingError)), { chunkId: chunk.id });
                  errorCount++;
                  continue;
                }
              }

              // Validate embedding
              if (!Array.isArray(chunk.embedding) || chunk.embedding.length === 0) {
                this.logger.error('Invalid embedding generated for chunk', undefined, { chunkId: chunk.id });
                errorCount++;
                continue;
              }

              // Serialize embedding as Buffer
              let embeddingBuffer: Buffer;
              try {
                embeddingBuffer = Buffer.from(new Float32Array(chunk.embedding).buffer);
              } catch (bufferError) {
                this.logger.error('Failed to serialize embedding', bufferError instanceof Error ? bufferError : new Error(String(bufferError)), { chunkId: chunk.id });
                errorCount++;
                continue;
              }

              // Use a promise wrapper for the stmt.run call
              await new Promise<void>((runResolve, runReject) => {
                stmt!.run([
                  chunk.id,
                  chunk.filePath,
                  chunk.sectionHeading,
                  chunk.content,
                  embeddingBuffer,
                  chunk.metadata.wordCount,
                  chunk.metadata.level,
                  chunk.metadata.lastModified.toISOString()
                ], (err) => {
                  if (err) {
                    const storeError = new Error(`Failed to store chunk ${chunk.id}: ${err.message}`);
                    this.logger.error('Chunk storage failed', storeError, { chunkId: chunk.id });
                    runReject(storeError);
                    return;
                  }
                  successCount++;
                  runResolve();
                });
              });

            } catch (chunkError) {
              this.logger.error('Failed to process chunk', chunkError instanceof Error ? chunkError : new Error(String(chunkError)), { chunkId: chunk.id, index });
              errorCount++;
              continue;
            }
          }

          this.logger.info('Chunk storage completed', { 
            successCount, 
            errorCount, 
            totalProcessed: successCount + errorCount 
          });

          if (successCount === 0) {
            throw new Error('Failed to store any chunks successfully');
          }

          resolve();

        } catch (error) {
          const storeError = new Error(`Failed to store chunks: ${error}`);
          this.logger.error('Chunk storage operation failed', storeError);
          reject(storeError);
        } finally {
          if (stmt) {
            try {
              stmt.finalize();
            } catch (finalizeError) {
              this.logger.warn('Failed to finalize statement', finalizeError instanceof Error ? finalizeError : new Error(String(finalizeError)), { error: finalizeError });
            }
          }
        }
      });

    } catch (error) {
      const storeError = new Error(`Store chunks operation failed: ${error}`);
      this.logger.error('Store chunks failed', storeError, { chunkCount: chunks?.length });
      throw storeError;
    }
  }

  /**
   * Search for similar documentation chunks using vector similarity
   */
  async searchSimilar(query: string, topK: number = 5): Promise<DocumentationChunk[]> {
    try {
      this.logger.debug('Searching for similar chunks', { query: query.substring(0, 100), topK });

      // Validate database state
      if (!this.db) {
        throw new Error('Database not initialized');
      }

      if (!this.isInitialized) {
        throw new Error('VectorStore not properly initialized');
      }

      // Validate input parameters
      if (!query || typeof query !== 'string') {
        throw new Error('Query must be a non-empty string');
      }

      if (query.trim().length === 0) {
        this.logger.warn('Empty query provided for similarity search');
        return [];
      }

      if (topK <= 0 || !Number.isInteger(topK)) {
        throw new Error('topK must be a positive integer');
      }

      // Generate embedding for the query with error handling
      let queryEmbedding: number[];
      try {
        queryEmbedding = await this.generateEmbedding(query);
      } catch (embeddingError) {
        const searchError = new Error(`Failed to generate query embedding: ${embeddingError}`);
        this.logger.error('Query embedding generation failed', searchError, { query: query.substring(0, 100) });
        throw searchError;
      }
      
      return new Promise((resolve, reject) => {
        // Get all chunks and calculate similarity in memory
        // Note: This is a simplified approach. For production, consider using sqlite-vss
        this.db!.all(`
          SELECT id, file_path, section_heading, content, embedding, 
                 word_count, header_level, last_modified, created_at
          FROM documentation_chunks
        `, (err, rows: any[]) => {
          if (err) {
            const searchError = new Error(`Failed to search chunks: ${err.message}`);
            this.logger.error('Database query failed', searchError);
            reject(searchError);
            return;
          }

          try {
            this.logger.debug('Processing search results', { rowCount: rows.length });

            const results: Array<DocumentationChunk & { similarity: number }> = [];
            let processedCount = 0;
            let errorCount = 0;

            rows.forEach((row, index) => {
              try {
                // Validate row data
                if (!row.id || !row.file_path || !row.section_heading || !row.content) {
                  this.logger.warn('Invalid row data found, skipping', undefined, { 
                    index, 
                    hasId: !!row.id,
                    hasFilePath: !!row.file_path,
                    hasSectionHeading: !!row.section_heading,
                    hasContent: !!row.content
                  });
                  errorCount++;
                  return;
                }

                // Deserialize embedding with error handling
                let embedding: number[];
                try {
                  if (!row.embedding) {
                    this.logger.warn('No embedding found for chunk, skipping', undefined, { chunkId: row.id });
                    errorCount++;
                    return;
                  }

                  const embeddingBuffer = row.embedding;
                  embedding = Array.from(new Float32Array(embeddingBuffer.buffer));

                  if (!Array.isArray(embedding) || embedding.length === 0) {
                    this.logger.warn('Invalid embedding deserialized, skipping', undefined, { chunkId: row.id });
                    errorCount++;
                    return;
                  }
                } catch (deserializeError) {
                  this.logger.warn('Failed to deserialize embedding, skipping', deserializeError instanceof Error ? deserializeError : new Error(String(deserializeError)), { 
                    chunkId: row.id, 
                    error: deserializeError 
                  });
                  errorCount++;
                  return;
                }

                // Calculate cosine similarity with error handling
                let similarity: number;
                try {
                  similarity = this.cosineSimilarity(queryEmbedding, embedding);
                  
                  if (isNaN(similarity) || !isFinite(similarity)) {
                    this.logger.warn('Invalid similarity calculated, skipping', undefined, { 
                      chunkId: row.id, 
                      similarity 
                    });
                    errorCount++;
                    return;
                  }
                } catch (similarityError) {
                  this.logger.warn('Failed to calculate similarity, skipping', similarityError instanceof Error ? similarityError : new Error(String(similarityError)), { 
                    chunkId: row.id, 
                    error: similarityError 
                  });
                  errorCount++;
                  return;
                }

                // Apply similarity threshold
                if (similarity >= this.config.similarityThreshold) {
                  try {
                    const chunk: DocumentationChunk = {
                      id: row.id,
                      filePath: row.file_path,
                      sectionHeading: row.section_heading,
                      content: row.content,
                      embedding: embedding,
                      metadata: {
                        level: row.header_level || 1,
                        wordCount: row.word_count || 0,
                        lastModified: new Date(row.last_modified || Date.now())
                      }
                    };

                    results.push({ ...chunk, similarity });
                    processedCount++;
                  } catch (chunkError) {
                    this.logger.warn('Failed to create chunk object, skipping', chunkError instanceof Error ? chunkError : new Error(String(chunkError)), { 
                      chunkId: row.id, 
                      error: chunkError 
                    });
                    errorCount++;
                  }
                }
              } catch (rowError) {
                this.logger.warn('Failed to process row, skipping', rowError instanceof Error ? rowError : new Error(String(rowError)), { 
                  index, 
                  error: rowError 
                });
                errorCount++;
              }
            });

            this.logger.debug('Search processing completed', { 
              totalRows: rows.length,
              processedCount,
              errorCount,
              resultsCount: results.length,
              similarityThreshold: this.config.similarityThreshold
            });

            // Sort by similarity (descending) and take top-k
            results.sort((a, b) => b.similarity - a.similarity);
            const maxResults = Math.min(topK, this.config.maxResults);
            const topResults = results.slice(0, maxResults);

            // Remove similarity score from final results
            const finalResults = topResults.map(({ similarity, ...chunk }) => chunk);
            
            this.logger.info('Similarity search completed', { 
              queryLength: query.length,
              resultsFound: finalResults.length,
              topK,
              maxResults
            });

            resolve(finalResults);

          } catch (processingError) {
            const searchError = new Error(`Failed to process search results: ${processingError}`);
            this.logger.error('Search result processing failed', searchError);
            reject(searchError);
          }
        });
      });

    } catch (error) {
      const searchError = new Error(`Similarity search failed: ${error}`);
      this.logger.error('Similarity search operation failed', searchError, { 
        query: query?.substring(0, 100), 
        topK 
      });
      throw searchError;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    try {
      if (!Array.isArray(a) || !Array.isArray(b)) {
        throw new Error('Both inputs must be arrays');
      }

      if (a.length !== b.length) {
        throw new Error(`Vectors must have the same length: ${a.length} vs ${b.length}`);
      }

      if (a.length === 0) {
        throw new Error('Vectors cannot be empty');
      }

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < a.length; i++) {
        const valA = a[i];
        const valB = b[i];

        // Check for invalid values
        if (!isFinite(valA) || !isFinite(valB)) {
          this.logger.warn('Non-finite values in similarity calculation', undefined, { 
            index: i, 
            valA, 
            valB 
          });
          continue;
        }

        dotProduct += valA * valB;
        normA += valA * valA;
        normB += valB * valB;
      }

      normA = Math.sqrt(normA);
      normB = Math.sqrt(normB);

      if (normA === 0 || normB === 0) {
        this.logger.debug('Zero norm vector in similarity calculation');
        return 0;
      }

      const similarity = dotProduct / (normA * normB);

      // Ensure similarity is in valid range [-1, 1]
      if (similarity < -1 || similarity > 1) {
        this.logger.warn('Similarity out of valid range, clamping', undefined, { 
          similarity, 
          dotProduct, 
          normA, 
          normB 
        });
        return Math.max(-1, Math.min(1, similarity));
      }

      return similarity;
    } catch (error) {
      this.logger.error('Cosine similarity calculation failed', error instanceof Error ? error : new Error(String(error)), { 
        aLength: a?.length, 
        bLength: b?.length 
      });
      return 0; // Return 0 similarity on error
    }
  }

  /**
   * Clear all indexed data from the database
   */
  async clearIndex(): Promise<void> {
    try {
      this.logger.info('Clearing vector store index');

      if (!this.db) {
        throw new Error('Database not initialized');
      }

      if (!this.isInitialized) {
        throw new Error('VectorStore not properly initialized');
      }

      return new Promise((resolve, reject) => {
        this.db!.run('DELETE FROM documentation_chunks', (err) => {
          if (err) {
            const clearError = new Error(`Failed to clear index: ${err.message}`);
            this.logger.error('Index clearing failed', clearError);
            reject(clearError);
            return;
          }
          
          this.logger.info('Vector store index cleared successfully');
          resolve();
        });
      });
    } catch (error) {
      const clearError = new Error(`Clear index operation failed: ${error}`);
      this.logger.error('Clear index failed', clearError);
      throw clearError;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    try {
      this.logger.info('Closing vector store database connection');

      if (!this.db) {
        this.logger.debug('Database already closed or not initialized');
        return;
      }

      return new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) {
            const closeError = new Error(`Failed to close database: ${err.message}`);
            this.logger.error('Database close failed', closeError);
            reject(closeError);
            return;
          }
          
          this.db = null;
          this.isInitialized = false;
          this.initializationPromise = null;
          this.logger.info('Vector store database connection closed successfully');
          resolve();
        });
      });
    } catch (error) {
      const closeError = new Error(`Close database operation failed: ${error}`);
      this.logger.error('Close database failed', closeError);
      throw closeError;
    }
  }

  /**
   * Get database statistics for monitoring
   */
  async getStats(): Promise<{
    chunkCount: number;
    dbSize: number;
    isInitialized: boolean;
    dbPath: string;
  }> {
    try {
      if (!this.db || !this.isInitialized) {
        return {
          chunkCount: 0,
          dbSize: 0,
          isInitialized: false,
          dbPath: this.config.dbPath
        };
      }

      return new Promise((resolve, reject) => {
        this.db!.get('SELECT COUNT(*) as count FROM documentation_chunks', (err, row: any) => {
          if (err) {
            this.logger.error('Failed to get chunk count', err);
            reject(err);
            return;
          }

          let dbSize = 0;
          try {
            if (fs.existsSync(this.config.dbPath)) {
              const stats = fs.statSync(this.config.dbPath);
              dbSize = stats.size;
            }
          } catch (sizeError) {
            this.logger.warn('Failed to get database file size', sizeError instanceof Error ? sizeError : new Error(String(sizeError)), { error: sizeError });
          }

          resolve({
            chunkCount: row.count || 0,
            dbSize,
            isInitialized: this.isInitialized,
            dbPath: this.config.dbPath
          });
        });
      });
    } catch (error) {
      this.logger.error('Failed to get vector store stats', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Health check for the vector store
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    issues: string[];
    stats: any;
  }> {
    const issues: string[] = [];
    
    try {
      // Check initialization
      if (!this.isInitialized) {
        issues.push('VectorStore not initialized');
      }

      // Check database connection
      if (!this.db) {
        issues.push('Database connection not established');
      }

      // Check database file
      if (!fs.existsSync(this.config.dbPath)) {
        issues.push('Database file does not exist');
      }

      // Get stats
      let stats = {};
      try {
        stats = await this.getStats();
      } catch (statsError) {
        issues.push(`Failed to get stats: ${statsError}`);
      }

      const status = issues.length === 0 ? 'healthy' : 'unhealthy';
      
      this.logger.debug('Vector store health check completed', { status, issueCount: issues.length });

      return { status, issues, stats };
    } catch (error) {
      this.logger.error('Health check failed', error instanceof Error ? error : new Error(String(error)));
      return {
        status: 'unhealthy',
        issues: [`Health check failed: ${error}`],
        stats: {}
      };
    }
  }
}