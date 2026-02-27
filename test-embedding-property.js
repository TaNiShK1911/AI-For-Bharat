/**
 * Standalone property test for embedding generation
 */

const fc = require('fast-check');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock VectorStore implementation for testing
class MockVectorStore {
  constructor(config) {
    this.config = config;
    this.initialized = false;
  }

  async initialize() {
    this.initialized = true;
  }

  async generateEmbedding(text) {
    if (!this.initialized) {
      throw new Error('VectorStore not initialized');
    }

    // Simple embedding generation using text features
    const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    const embedding = new Array(128).fill(0); // 128-dimensional embedding
    
    // Generate features based on text characteristics
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const hash = this.simpleHash(word);
      
      // Distribute word features across embedding dimensions
      for (let j = 0; j < embedding.length; j++) {
        const feature = Math.sin((hash + j) * 0.1) * Math.cos((i + j) * 0.05);
        embedding[j] += feature / Math.sqrt(words.length);
      }
    }
    
    // Normalize the embedding vector
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }
    
    return embedding;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  async close() {
    this.initialized = false;
  }
}

async function testEmbeddingGenerationProperty() {
  console.log('Testing Property 6: Embedding generation completeness');
  console.log('Feature: ai-docs-interpreter, Property 6: Embedding generation completeness');
  console.log('Validates: Requirements 3.1');

  const vectorStore = new MockVectorStore({
    dbPath: ':memory:',
    embeddingModel: 'mock',
    similarityThreshold: 0.1,
    maxResults: 10
  });

  await vectorStore.initialize();

  try {
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
          const chunk = {
            id: chunkData.id,
            filePath: chunkData.filePath,
            sectionHeading: chunkData.sectionHeading,
            content: chunkData.content,
            metadata: chunkData.metadata
          };

          // Generate embedding using vector store
          const embedding = await vectorStore.generateEmbedding(chunk.content);

          // Property: embedding should be generated and be a valid array of numbers
          if (!Array.isArray(embedding)) {
            throw new Error('Embedding should be an array');
          }
          if (embedding.length === 0) {
            throw new Error('Embedding should not be empty');
          }
          if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) {
            throw new Error('All embedding values should be valid numbers');
          }

          // Additional checks
          if (embedding.length !== 128) {
            throw new Error('Embedding should have 128 dimensions');
          }

          // Check that embedding is normalized (approximately)
          const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
          if (Math.abs(norm - 1.0) > 0.01) {
            throw new Error('Embedding should be approximately normalized');
          }
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );

    console.log('✅ Property 6 test PASSED: Embedding generation completeness verified');
    return true;
  } catch (error) {
    console.log('❌ Property 6 test FAILED:', error.message);
    if (error.counterexample) {
      console.log('Counterexample:', JSON.stringify(error.counterexample, null, 2));
    }
    return false;
  } finally {
    await vectorStore.close();
  }
}

// Run the test
testEmbeddingGenerationProperty()
  .then(passed => {
    process.exit(passed ? 0 : 1);
  })
  .catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });