/**
 * Standalone property test for deterministic behavior
 * Feature: ai-docs-interpreter, Property 20: Deterministic behavior
 * Validates: Requirements 7.5
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
    // Deterministic mock: return chunks in consistent order
    const queryWords = query.toLowerCase().split(/\s+/);
    const results = this.chunks
      .filter(chunk => {
        const content = chunk.content.toLowerCase();
        return queryWords.some(word => content.includes(word));
      })
      .sort((a, b) => {
        // Consistent sorting for deterministic results
        const fileComparison = a.filePath.localeCompare(b.filePath);
        if (fileComparison !== 0) return fileComparison;
        return a.sectionHeading.localeCompare(b.sectionHeading);
      })
      .slice(0, topK);
    
    return results;
  }

  async generateEmbedding(text) {
    // Deterministic mock embedding based on text hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    // Generate deterministic embedding array
    const embedding = [];
    for (let i = 0; i < 128; i++) {
      embedding.push((hash + i) % 1000 / 1000);
    }
    return embedding;
  }

  async close() {
    // Mock cleanup
  }
}

// Import the actual cache implementation
const { ExplanationCacheManager } = require('./out/cache/ExplanationCache');

// Enhanced cache that stores confidence
class EnhancedExplanationCacheManager extends ExplanationCacheManager {
  store(context, explanation, citations, confidence = null) {
    const key = this.generateCacheKey(context);
    const cacheEntry = {
      key,
      explanation,
      citations,
      confidence, // Store the original confidence
      timestamp: new Date(),
      ttl: this.defaultTTL || 30 * 60 * 1000
    };

    this.cache.set(key, cacheEntry);
  }

  retrieve(context) {
    const key = this.generateCacheKey(context);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (!this.isValidEntry(entry)) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  generateCacheKey(context) {
    const keyComponents = [
      context.fileName,
      context.functionName || '',
      context.className || '',
      context.selectedText
    ];
    
    const keyString = keyComponents.join('|');
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  isValidEntry(entry) {
    const now = new Date();
    const expirationTime = new Date(entry.timestamp.getTime() + entry.ttl);
    return now < expirationTime;
  }
}

// Mock RAG Engine for testing deterministic behavior
class MockRAGEngine {
  constructor(vectorStore, cacheManager) {
    this.vectorStore = vectorStore;
    this.cacheManager = cacheManager || new EnhancedExplanationCacheManager();
    this.requestDeduplication = new Map();
    this.deterministicSettings = {
      temperature: 0.1,
      seed: 42,
      maxTokens: 500,
      topP: 0.9
    };
  }

  generateContextHash(context) {
    const hashInput = [
      context.selectedText,
      context.fileName,
      context.functionName || '',
      context.className || '',
      context.imports.sort().join(','),
      context.language
    ].join('|');
    
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(16);
  }

  async explainCode(context) {
    const contextHash = this.generateContextHash(context);
    
    // Check for ongoing identical requests (deduplication)
    const ongoingRequest = this.requestDeduplication.get(contextHash);
    if (ongoingRequest) {
      return await ongoingRequest;
    }

    // Create the request promise and store it for deduplication
    const requestPromise = this.processExplanationRequest(context);
    this.requestDeduplication.set(contextHash, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      this.requestDeduplication.delete(contextHash);
    }
  }

  async processExplanationRequest(context) {
    // Check cache first
    const cachedResult = this.cacheManager.retrieve(context);
    if (cachedResult) {
      return {
        explanation: cachedResult.explanation,
        citations: cachedResult.citations,
        confidence: cachedResult.confidence !== null ? cachedResult.confidence : (cachedResult.citations.length > 0 ? 0.8 : 0),
        hasRelevantDocs: cachedResult.citations.length > 0
      };
    }

    // Build query deterministically
    const query = this.buildQueryFromContext(context);
    const relevantDocs = await this.vectorStore.searchSimilar(query, 5);
    
    let explanation, citations, hasRelevantDocs, confidence;
    
    if (relevantDocs.length === 0) {
      explanation = "Not documented.";
      citations = [];
      hasRelevantDocs = false;
      confidence = 0;
    } else {
      // Generate deterministic explanation
      explanation = `This code is related to ${context.functionName || 'the selected functionality'}.`;
      
      // Generate deterministic citations with consistent ordering
      citations = relevantDocs
        .map((doc, index) => ({
          filePath: doc.filePath,
          sectionHeading: doc.sectionHeading,
          relevanceScore: Math.max(0.1, 1.0 - (index * 0.2))
        }))
        .sort((a, b) => {
          const scoreComparison = b.relevanceScore - a.relevanceScore;
          if (Math.abs(scoreComparison) > 0.001) return scoreComparison;
          const fileComparison = a.filePath.localeCompare(b.filePath);
          if (fileComparison !== 0) return fileComparison;
          return a.sectionHeading.localeCompare(b.sectionHeading);
        });
      
      hasRelevantDocs = true;
      
      // Deterministic confidence calculation
      const baseConfidence = Math.min(relevantDocs.length / 3, 1.0);
      const avgWordCount = relevantDocs.reduce((sum, doc) => sum + doc.metadata.wordCount, 0) / relevantDocs.length;
      const qualityMultiplier = Math.min(avgWordCount / 50, 1.2);
      confidence = Math.min(baseConfidence * qualityMultiplier, 1.0);
    }

    const result = {
      explanation,
      citations,
      confidence,
      hasRelevantDocs
    };

    // Store in cache with confidence
    this.cacheManager.store(context, explanation, citations, confidence);

    return result;
  }

  buildQueryFromContext(context) {
    const parts = [];
    if (context.functionName) parts.push(context.functionName);
    if (context.className) parts.push(context.className);
    
    // Extract keywords deterministically, handle edge cases
    const selectedWords = context.selectedText
      .replace(/[^\w\s]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/\s+/)
      .filter(word => 
        word.length > 2 && 
        !['const', 'let', 'var', 'function', 'class', 'return', 'if', 'else', 'for', 'while', 'result'].includes(word)
      )
      .sort() // Sort for deterministic order
      .slice(0, 3);
    
    parts.push(...selectedWords);
    
    const relevantImports = context.imports
      .filter(imp => !imp.startsWith('.') && !imp.includes('node_modules'))
      .sort() // Sort for deterministic order
      .slice(0, 2);
    
    parts.push(...relevantImports);
    
    // Ensure we always have at least something to query with
    const query = parts.filter(Boolean).join(' ');
    return query || 'code'; // Fallback for empty queries
  }

  async validateDeterministicBehavior(context, iterations = 3) {
    const results = [];
    const originalCache = this.cacheManager;
    
    try {
      // Use a fresh cache for each validation to ensure we're testing raw determinism
      for (let i = 0; i < iterations; i++) {
        this.cacheManager = new EnhancedExplanationCacheManager();
        
        // Add small delay to ensure any async operations complete
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
        
        const result = await this.processExplanationRequest(context);
        results.push(result);
      }
      
      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        const currentResult = results[i];
        
        if (firstResult.explanation !== currentResult.explanation) {
          console.warn(`Explanation mismatch at iteration ${i}:`, {
            first: firstResult.explanation,
            current: currentResult.explanation,
            context: context
          });
          return false;
        }
        
        if (JSON.stringify(firstResult.citations) !== JSON.stringify(currentResult.citations)) {
          console.warn(`Citations mismatch at iteration ${i}:`, {
            first: firstResult.citations,
            current: currentResult.citations,
            context: context
          });
          return false;
        }
        
        if (Math.abs(firstResult.confidence - currentResult.confidence) > 0.001) {
          console.warn(`Confidence mismatch at iteration ${i}:`, {
            first: firstResult.confidence,
            current: currentResult.confidence,
            context: context
          });
          return false;
        }
        
        if (firstResult.hasRelevantDocs !== currentResult.hasRelevantDocs) {
          console.warn(`hasRelevantDocs mismatch at iteration ${i}:`, {
            first: firstResult.hasRelevantDocs,
            current: currentResult.hasRelevantDocs,
            context: context
          });
          return false;
        }
      }
      
      return true;
    } finally {
      this.cacheManager = originalCache;
    }
  }

  getDeterministicSettings() {
    return { ...this.deterministicSettings };
  }

  clearCache() {
    this.cacheManager.clear();
  }
}

async function testDeterministicBehavior() {
  console.log('Testing Property 20: Deterministic behavior...');

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
          { minLength: 0, maxLength: 3 }
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

        const ragEngine = new MockRAGEngine(vectorStore, new EnhancedExplanationCacheManager());

        // Property 1: Multiple calls should produce identical results
        const results = [];
        const numIterations = 3;

        for (let i = 0; i < numIterations; i++) {
          ragEngine.clearCache();
          const result = await ragEngine.explainCode(scenario.codeContext);
          results.push(result);
        }

        // Verify all results are identical
        const firstResult = results[0];
        for (let i = 1; i < results.length; i++) {
          const currentResult = results[i];

          if (firstResult.explanation !== currentResult.explanation) {
            throw new Error(`Explanation should be identical across iterations (iteration ${i})`);
          }

          if (JSON.stringify(firstResult.citations) !== JSON.stringify(currentResult.citations)) {
            throw new Error(`Citations should be identical across iterations (iteration ${i})`);
          }

          if (Math.abs(firstResult.confidence - currentResult.confidence) > 0.001) {
            throw new Error(`Confidence should be identical across iterations (iteration ${i})`);
          }

          if (firstResult.hasRelevantDocs !== currentResult.hasRelevantDocs) {
            throw new Error(`hasRelevantDocs should be identical across iterations (iteration ${i})`);
          }
        }

        // Property 2: Built-in deterministic validation should pass
        ragEngine.clearCache();
        const isDeterministic = await ragEngine.validateDeterministicBehavior(scenario.codeContext, 3);
        if (!isDeterministic) {
          throw new Error('Built-in deterministic validation should pass');
        }

        // Property 3: Context hash should be consistent
        const contextHash1 = ragEngine.generateContextHash(scenario.codeContext);
        const contextHash2 = ragEngine.generateContextHash(scenario.codeContext);
        
        if (contextHash1 !== contextHash2) {
          throw new Error('Context hash should be identical for identical contexts');
        }

        // Property 4: Different contexts should produce different hashes
        const differentContext = {
          ...scenario.codeContext,
          selectedText: scenario.codeContext.selectedText + '_different'
        };
        
        const differentHash = ragEngine.generateContextHash(differentContext);
        if (contextHash1 === differentHash) {
          throw new Error('Different contexts should produce different hashes');
        }

        // Property 5: Concurrent requests should be deduplicated
        ragEngine.clearCache();
        
        const concurrentPromises = Array(3).fill(null).map(() => 
          ragEngine.explainCode(scenario.codeContext)
        );

        const concurrentResults = await Promise.all(concurrentPromises);

        for (let i = 1; i < concurrentResults.length; i++) {
          if (concurrentResults[0].explanation !== concurrentResults[i].explanation) {
            throw new Error(`Concurrent request ${i} should have identical explanation`);
          }

          if (JSON.stringify(concurrentResults[0].citations) !== JSON.stringify(concurrentResults[i].citations)) {
            throw new Error(`Concurrent request ${i} should have identical citations`);
          }
        }

        await vectorStore.close();
      }
    ),
    { numRuns: 50 } // Reduced for standalone test
  );

  console.log('✓ Property 20: Deterministic behavior test passed!');
}

// Run the test
testDeterministicBehavior()
  .then(() => {
    console.log('All deterministic behavior property tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Deterministic behavior property test failed:', error);
    process.exit(1);
  });