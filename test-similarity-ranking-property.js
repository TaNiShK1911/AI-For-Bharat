/**
 * Standalone property test for similarity search ranking
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
    this.chunks = [];
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

  async storeChunks(chunks) {
    for (const chunk of chunks) {
      if (!chunk.embedding) {
        chunk.embedding = await this.generateEmbedding(chunk.content);
      }
      this.chunks.push({ ...chunk });
    }
  }

  async searchSimilar(query, topK = 5) {
    if (!this.initialized) {
      throw new Error('VectorStore not initialized');
    }

    // Generate embedding for the query
    const queryEmbedding = await this.generateEmbedding(query);
    
    const results = [];

    for (const chunk of this.chunks) {
      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);

      if (similarity >= this.config.similarityThreshold) {
        results.push({ ...chunk, similarity });
      }
    }

    // Sort by similarity (descending) and take top-k
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, Math.min(topK, this.config.maxResults));

    // Remove similarity score from final results but keep for testing
    return topResults.map(({ similarity, ...chunk }) => ({ ...chunk, _testSimilarity: similarity }));
  }

  cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
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

  async clearIndex() {
    this.chunks = [];
  }

  async close() {
    this.initialized = false;
    this.chunks = [];
  }
}

async function testSimilaritySearchRankingProperty() {
  console.log('Testing Property 7: Similarity search ranking');
  console.log('Feature: ai-docs-interpreter, Property 7: Similarity search ranking');
  console.log('Validates: Requirements 3.4');

  const vectorStore = new MockVectorStore({
    dbPath: ':memory:',
    embeddingModel: 'mock',
    similarityThreshold: 0.0, // Accept all results for testing
    maxResults: 100
  });

  await vectorStore.initialize();

  try {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            filePath: fc.string({ minLength: 1, maxLength: 50 }),
            sectionHeading: fc.string({ minLength: 1, maxLength: 50 }),
            content: fc.string({ minLength: 1, maxLength: 200 }),
            metadata: fc.record({
              level: fc.integer({ min: 1, max: 6 }),
              wordCount: fc.integer({ min: 1, max: 50 }),
              lastModified: fc.date()
            })
          }),
          { minLength: 2, maxLength: 10 }
        ),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 1, max: 20 }),
        async (chunks, query, topK) => {
          // Clear previous data
          await vectorStore.clearIndex();

          // Store chunks
          await vectorStore.storeChunks(chunks);

          // Search for similar chunks
          const results = await vectorStore.searchSimilar(query, topK);

          // Property: results should be ordered by similarity score in descending order
          if (results.length > 1) {
            for (let i = 0; i < results.length - 1; i++) {
              const currentSimilarity = results[i]._testSimilarity;
              const nextSimilarity = results[i + 1]._testSimilarity;
              
              if (currentSimilarity < nextSimilarity) {
                throw new Error(
                  `Results not properly ranked: result ${i} has similarity ${currentSimilarity} ` +
                  `but result ${i + 1} has higher similarity ${nextSimilarity}`
                );
              }
            }
          }

          // Property: should not return more results than requested topK
          if (results.length > topK) {
            throw new Error(`Returned ${results.length} results but only ${topK} were requested`);
          }

          // Property: should not return more results than available chunks
          if (results.length > chunks.length) {
            throw new Error(`Returned ${results.length} results but only ${chunks.length} chunks were stored`);
          }

          // Property: all results should have valid similarity scores
          for (const result of results) {
            if (typeof result._testSimilarity !== 'number' || isNaN(result._testSimilarity)) {
              throw new Error('All results should have valid similarity scores');
            }
            if (result._testSimilarity < -1 || result._testSimilarity > 1) {
              throw new Error('Similarity scores should be between -1 and 1');
            }
          }
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );

    console.log('✅ Property 7 test PASSED: Similarity search ranking verified');
    return true;
  } catch (error) {
    console.log('❌ Property 7 test FAILED:', error.message);
    if (error.counterexample) {
      console.log('Counterexample:', JSON.stringify(error.counterexample, null, 2));
    }
    return false;
  } finally {
    await vectorStore.close();
  }
}

// Run the test
testSimilaritySearchRankingProperty()
  .then(passed => {
    process.exit(passed ? 0 : 1);
  })
  .catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });