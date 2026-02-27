/**
 * Standalone property test for explanation caching
 * Feature: ai-docs-interpreter, Property 19: Explanation caching
 * Validates: Requirements 7.4
 */

const fc = require('fast-check');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Mock implementations for standalone testing
class MockVectorStore {
  constructor(config) {
    this.config = config;
    this.chunks = [];
  }

  async initialize() {
    // Mock initialization
  }

  async storeChunks(chunks) {
    this.chunks = chunks;
  }

  async searchSimilar(query, topK) {
    // Simple mock: return first few chunks that contain query words
    const queryWords = query.toLowerCase().split(/\s+/);
    const results = this.chunks.filter(chunk => {
      const content = chunk.content.toLowerCase();
      return queryWords.some(word => content.includes(word));
    }).slice(0, topK);
    
    return results;
  }

  async generateEmbedding(text) {
    // Mock embedding generation
    return new Array(128).fill(0).map(() => Math.random());
  }

  async close() {
    // Mock cleanup
  }
}

// Import the actual cache implementation
const { ExplanationCacheManager } = require('./out/cache/ExplanationCache');

// Mock RAG Engine for testing
class MockRAGEngine {
  constructor(vectorStore, cacheManager) {
    this.vectorStore = vectorStore;
    this.cacheManager = cacheManager || new ExplanationCacheManager();
  }

  async explainCode(context) {
    // Check cache first
    const cachedResult = this.cacheManager.retrieve(context);
    if (cachedResult) {
      return {
        explanation: cachedResult.explanation,
        citations: cachedResult.citations,
        confidence: 1.0,
        hasRelevantDocs: cachedResult.citations.length > 0
      };
    }

    // Mock explanation generation
    const query = this.buildQueryFromContext(context);
    const relevantDocs = await this.vectorStore.searchSimilar(query, 5);
    
    let explanation, citations, hasRelevantDocs;
    
    if (relevantDocs.length === 0) {
      explanation = "Not documented.";
      citations = [];
      hasRelevantDocs = false;
    } else {
      explanation = `This code is related to ${context.functionName || 'the selected functionality'}.`;
      citations = relevantDocs.map(doc => ({
        filePath: doc.filePath,
        sectionHeading: doc.sectionHeading,
        relevanceScore: Math.random()
      }));
      hasRelevantDocs = true;
    }

    const result = {
      explanation,
      citations,
      confidence: hasRelevantDocs ? 0.8 : 0,
      hasRelevantDocs
    };

    // Store in cache
    this.cacheManager.store(context, explanation, citations);

    return result;
  }

  buildQueryFromContext(context) {
    const parts = [];
    if (context.functionName) parts.push(context.functionName);
    if (context.className) parts.push(context.className);
    parts.push(...context.selectedText.split(/\s+/).slice(0, 3));
    return parts.join(' ');
  }

  getCacheStats() {
    return this.cacheManager.getStats();
  }

  clearCache() {
    this.cacheManager.clear();
  }

  cleanupCache() {
    this.cacheManager.cleanupExpired();
  }
}

async function testExplanationCaching() {
  console.log('Testing Property 19: Explanation caching...');

  await fc.assert(
    fc.asyncProperty(
      fc.record({
        codeContext: fc.record({
          selectedText: fc.string({ minLength: 5, maxLength: 100 }),
          fileName: fc.stringMatching(/^[a-zA-Z0-9_-]+\.(js|ts)$/),
          functionName: fc.option(fc.stringMatching(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/), { nil: undefined }),
          className: fc.option(fc.stringMatching(/^[A-Z][a-zA-Z0-9_$]*$/), { nil: undefined }),
          imports: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
          surroundingContext: fc.string({ minLength: 0, maxLength: 200 }),
          language: fc.constantFrom('javascript', 'typescript')
        }),
        documentationChunks: fc.array(
          fc.record({
            id: fc.uuid(),
            filePath: fc.stringMatching(/^[a-zA-Z0-9_/-]+\.md$/),
            sectionHeading: fc.string({ minLength: 3, maxLength: 50 }),
            content: fc.string({ minLength: 20, maxLength: 300 }),
            metadata: fc.record({
              level: fc.integer({ min: 1, max: 6 }),
              wordCount: fc.integer({ min: 10, max: 60 }),
              lastModified: fc.date()
            })
          }),
          { minLength: 1, maxLength: 3 }
        )
      }),
      async (scenario) => {
        // Initialize mock components
        const vectorStore = new MockVectorStore({
          dbPath: 'mock.db',
          embeddingModel: 'mock',
          similarityThreshold: 0.1,
          maxResults: 10
        });

        await vectorStore.initialize();
        await vectorStore.storeChunks(scenario.documentationChunks);

        const cacheManager = new ExplanationCacheManager();
        const ragEngine = new MockRAGEngine(vectorStore, cacheManager);

        // Property 1: First request should not be cached
        const initialStats = ragEngine.getCacheStats();
        if (initialStats.size !== 0) {
          throw new Error('Cache should be empty initially');
        }

        // Make first explanation request
        const firstResult = await ragEngine.explainCode(scenario.codeContext);

        // Property 2: After first request, result should be cached
        const afterFirstStats = ragEngine.getCacheStats();
        if (afterFirstStats.size !== 1) {
          throw new Error('Cache should contain one entry after first request');
        }

        // Property 3: Second identical request should return cached result
        const secondResult = await ragEngine.explainCode(scenario.codeContext);

        if (firstResult.explanation !== secondResult.explanation) {
          throw new Error('Cached result should have identical explanation');
        }

        if (JSON.stringify(firstResult.citations) !== JSON.stringify(secondResult.citations)) {
          throw new Error('Cached result should have identical citations');
        }

        // Property 4: Cache size should remain the same after second request
        const afterSecondStats = ragEngine.getCacheStats();
        if (afterSecondStats.size !== 1) {
          throw new Error('Cache size should remain 1 after second identical request');
        }

        // Property 5: Different code contexts should create separate cache entries
        const differentContext = {
          ...scenario.codeContext,
          selectedText: scenario.codeContext.selectedText + '_different'
        };

        await ragEngine.explainCode(differentContext);

        const afterDifferentStats = ragEngine.getCacheStats();
        if (afterDifferentStats.size !== 2) {
          throw new Error('Cache should contain two entries for different contexts');
        }

        // Property 6: Cache invalidation should work
        ragEngine.clearCache();
        const afterClearStats = ragEngine.getCacheStats();
        if (afterClearStats.size !== 0) {
          throw new Error('Cache should be empty after clearing');
        }

        await vectorStore.close();
      }
    ),
    { numRuns: 50 } // Reduced for standalone test
  );

  console.log('✓ Property 19: Explanation caching test passed!');
}

// Run the test
testExplanationCaching()
  .then(() => {
    console.log('All caching property tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Caching property test failed:', error);
    process.exit(1);
  });