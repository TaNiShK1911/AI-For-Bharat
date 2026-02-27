/**
 * Property-based tests for VectorStore functionality
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { VectorStore } from '../storage/VectorStore';
import { DocumentationChunk, VectorStoreConfig } from '../types/interfaces';
import * as fc from 'fast-check';

suite('VectorStore Property Tests', () => {
  let vectorStore: VectorStore;
  let tempDbPath: string;

  setup(async () => {
    // Create temporary database path
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vectorstore-test-'));
    tempDbPath = path.join(tempDir, 'test.db');

    const config: VectorStoreConfig = {
      dbPath: tempDbPath,
      embeddingModel: 'universal-sentence-encoder',
      similarityThreshold: 0.1,
      maxResults: 10
    };

    vectorStore = new VectorStore(config);
    await vectorStore.initialize();
  });

  teardown(async () => {
    if (vectorStore) {
      await vectorStore.close();
    }
    // Clean up temp files
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
    const tempDir = path.dirname(tempDbPath);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  test('Property 6: Embedding generation completeness - For any documentation chunk processed by the vector store, an embedding vector should be generated and associated with that chunk', async () => {
    // Feature: ai-docs-interpreter, Property 6: Embedding generation completeness
    // Validates: Requirements 3.1

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          filePath: fc.string({ minLength: 1, maxLength: 100 }),
          sectionHeading: fc.string({ minLength: 1, maxLength: 100 }),
          content: fc.string({ minLength: 1, maxLength: 1000 }),
          metadata: fc.record({
            level: fc.integer({ min: 1, max: 6 }),
            wordCount: fc.integer({ min: 1, max: 200 }),
            lastModified: fc.date()
          })
        }),
        async (chunkData) => {
          // Create a documentation chunk without embedding
          const chunk: DocumentationChunk = {
            id: chunkData.id,
            filePath: chunkData.filePath,
            sectionHeading: chunkData.sectionHeading,
            content: chunkData.content,
            metadata: chunkData.metadata
          };

          // Generate embedding using vector store
          const embedding = await vectorStore.generateEmbedding(chunk.content);

          // Property: embedding should be generated and be a valid array of numbers
          assert.ok(Array.isArray(embedding), 'Embedding should be an array');
          assert.ok(embedding.length > 0, 'Embedding should not be empty');
          assert.ok(embedding.every(val => typeof val === 'number' && !isNaN(val)), 
                   'All embedding values should be valid numbers');

          // Store the chunk with embedding
          const chunkWithEmbedding = { ...chunk, embedding };
          await vectorStore.storeChunks([chunkWithEmbedding]);

          // Verify the chunk was stored with its embedding
          const searchResults = await vectorStore.searchSimilar(chunk.content, 1);
          assert.ok(searchResults.length > 0, 'Stored chunk should be retrievable');
          
          const retrievedChunk = searchResults[0];
          assert.ok(retrievedChunk.embedding, 'Retrieved chunk should have embedding');
          assert.ok(Array.isArray(retrievedChunk.embedding), 'Retrieved embedding should be an array');
          assert.strictEqual(retrievedChunk.embedding.length, embedding.length, 
                           'Retrieved embedding should have same length as original');
        }
      ),
      { numRuns: 10, timeout: 30000 } // Reduced runs due to ML model loading time
    );
  });
});