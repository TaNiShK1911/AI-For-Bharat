import * as assert from 'assert';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { RAGEngine } from '../rag/RAGEngine';
import { VectorStore } from '../storage/VectorStore';
import { ExplanationCacheManager } from '../cache/ExplanationCache';
import { DocumentationChunk, CodeContext, VectorStoreConfig, ExplanationResult } from '../types/interfaces';

suite('RAG Engine Property Tests', () => {

	/**
	 * Property 11: Documentation retrieval consistency
	 * For any code explanation request, the RAG engine should retrieve documentation chunks 
	 * and include them in the generated prompt
	 * Feature: ai-docs-interpreter, Property 11: Documentation retrieval consistency
	 * Validates: Requirements 5.1, 5.3
	 */
	test('Property 11: Documentation retrieval consistency', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate various code contexts and documentation scenarios
				fc.record({
					codeContext: fc.record({
						selectedText: fc.string({ minLength: 1, maxLength: 200 }),
						fileName: fc.stringMatching(/^[a-zA-Z0-9_-]+\.(js|ts|jsx|tsx)$/),
						functionName: fc.option(fc.stringMatching(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/), { nil: undefined }),
						className: fc.option(fc.stringMatching(/^[A-Z][a-zA-Z0-9_$]*$/), { nil: undefined }),
						imports: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
						surroundingContext: fc.string({ minLength: 0, maxLength: 500 }),
						language: fc.constantFrom('javascript', 'typescript')
					}),
					documentationChunks: fc.array(
						fc.record({
							id: fc.uuid(),
							filePath: fc.stringMatching(/^[a-zA-Z0-9_/-]+\.md$/),
							sectionHeading: fc.string({ minLength: 1, maxLength: 100 }),
							content: fc.string({ minLength: 10, maxLength: 500 }),
							metadata: fc.record({
								level: fc.integer({ min: 1, max: 6 }),
								wordCount: fc.integer({ min: 5, max: 100 }),
								lastModified: fc.date()
							})
						}),
						{ minLength: 0, maxLength: 10 }
					)
				}),
				async (scenario) => {
					// Create temporary directory for vector store
					const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-test-'));
					
					try {
						// Set up vector store configuration
						const config: VectorStoreConfig = {
							dbPath: path.join(tempDir, 'test.db'),
							embeddingModel: 'simple-hash',
							similarityThreshold: 0.1,
							maxResults: 10
						};

						// Initialize vector store and RAG engine
						const vectorStore = new VectorStore(config);
						await vectorStore.initialize();
						
						// Store documentation chunks if any exist
						if (scenario.documentationChunks.length > 0) {
							await vectorStore.storeChunks(scenario.documentationChunks);
						}

						const ragEngine = new RAGEngine(vectorStore);

						// Test the explainCode method
						const result = await ragEngine.explainCode(scenario.codeContext);

						// Property 1: If documentation chunks exist, RAG engine should attempt retrieval
						if (scenario.documentationChunks.length > 0) {
							// The result should indicate whether relevant docs were found
							assert.ok(
								typeof result.hasRelevantDocs === 'boolean',
								'RAG engine should indicate whether relevant docs were found'
							);

							// If relevant docs were found, explanation should not be "Not documented."
							if (result.hasRelevantDocs) {
								assert.notStrictEqual(
									result.explanation,
									'Not documented.',
									'When relevant docs are found, explanation should not be "Not documented."'
								);

								// Citations should be provided when docs are found
								assert.ok(
									Array.isArray(result.citations),
									'Citations should be an array when docs are found'
								);

								// Confidence should be greater than 0 when docs are found
								assert.ok(
									result.confidence > 0,
									'Confidence should be greater than 0 when relevant docs are found'
								);
							}
						}

						// Property 2: When no documentation exists, should return "Not documented."
						if (scenario.documentationChunks.length === 0) {
							assert.strictEqual(
								result.explanation,
								'Not documented.',
								'When no documentation exists, should return "Not documented."'
							);

							assert.strictEqual(
								result.hasRelevantDocs,
								false,
								'When no documentation exists, hasRelevantDocs should be false'
							);

							assert.strictEqual(
								result.confidence,
								0,
								'When no documentation exists, confidence should be 0'
							);

							assert.deepStrictEqual(
								result.citations,
								[],
								'When no documentation exists, citations should be empty'
							);
						}

						// Property 3: Result should always have required fields
						assert.ok(
							typeof result.explanation === 'string',
							'Explanation should be a string'
						);

						assert.ok(
							Array.isArray(result.citations),
							'Citations should be an array'
						);

						assert.ok(
							typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1,
							'Confidence should be a number between 0 and 1'
						);

						assert.ok(
							typeof result.hasRelevantDocs === 'boolean',
							'hasRelevantDocs should be a boolean'
						);

						// Property 4: Citations should reference actual documentation chunks
						for (const citation of result.citations) {
							const referencedChunk = scenario.documentationChunks.find(
								chunk => chunk.filePath === citation.filePath && 
								        chunk.sectionHeading === citation.sectionHeading
							);
							
							if (referencedChunk) {
								assert.ok(
									citation.relevanceScore >= 0 && citation.relevanceScore <= 1,
									'Citation relevance score should be between 0 and 1'
								);
							}
						}

						// Clean up
						await vectorStore.close();

					} finally {
						// Cleanup temporary directory
						await fs.rm(tempDir, { recursive: true, force: true });
					}
				}
			),
			{ numRuns: 100 } // Run 100 iterations as specified in the design
		);
	});

	/**
	 * Property 12: System instruction inclusion
	 * For any prompt generated by the RAG engine, the prompt should contain 
	 * the system instruction "Answer only from provided documentation excerpts"
	 * Feature: ai-docs-interpreter, Property 12: System instruction inclusion
	 * Validates: Requirements 5.2
	 */
	test('Property 12: System instruction inclusion', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate various code contexts
				fc.record({
					codeContext: fc.record({
						selectedText: fc.string({ minLength: 1, maxLength: 200 }),
						fileName: fc.stringMatching(/^[a-zA-Z0-9_-]+\.(js|ts)$/),
						functionName: fc.option(fc.stringMatching(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/), { nil: undefined }),
						className: fc.option(fc.stringMatching(/^[A-Z][a-zA-Z0-9_$]*$/), { nil: undefined }),
						imports: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 3 }),
						surroundingContext: fc.string({ minLength: 0, maxLength: 300 }),
						language: fc.constantFrom('javascript', 'typescript')
					}),
					documentationChunks: fc.array(
						fc.record({
							id: fc.uuid(),
							filePath: fc.stringMatching(/^[a-zA-Z0-9_/-]+\.md$/),
							sectionHeading: fc.string({ minLength: 1, maxLength: 50 }),
							content: fc.string({ minLength: 10, maxLength: 200 }),
							metadata: fc.record({
								level: fc.integer({ min: 1, max: 6 }),
								wordCount: fc.integer({ min: 5, max: 50 }),
								lastModified: fc.date()
							})
						}),
						{ minLength: 1, maxLength: 5 } // Ensure at least one doc chunk
					)
				}),
				async (scenario) => {
					// Create temporary directory for vector store
					const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-prompt-test-'));
					
					try {
						// Set up vector store configuration
						const config: VectorStoreConfig = {
							dbPath: path.join(tempDir, 'test.db'),
							embeddingModel: 'simple-hash',
							similarityThreshold: 0.1,
							maxResults: 10
						};

						// Initialize vector store and RAG engine
						const vectorStore = new VectorStore(config);
						await vectorStore.initialize();
						
						// Store documentation chunks
						await vectorStore.storeChunks(scenario.documentationChunks);

						const ragEngine = new RAGEngine(vectorStore);

						// Access the private constructPrompt method through generateExplanation
						// We'll test this indirectly by checking the behavior
						const result = await ragEngine.explainCode(scenario.codeContext);

						// Property: The system should enforce documentation-only responses
						// This is validated by checking that when docs exist, we don't get "Not documented."
						// and when no relevant docs are found, we do get "Not documented."
						
						if (result.hasRelevantDocs) {
							// When docs are found, the system instruction should prevent generic responses
							assert.notStrictEqual(
								result.explanation,
								'Not documented.',
								'When relevant docs exist, system instruction should enable explanation generation'
							);

							// The explanation should reference the documentation (basic validation)
							assert.ok(
								result.explanation.length > 'Not documented.'.length,
								'Explanation should be more detailed when documentation is available'
							);

							// Citations should be present, indicating grounding in documentation
							assert.ok(
								result.citations.length > 0,
								'Citations should be present when documentation is used'
							);
						}

						// Property: System instruction should enforce "Not documented." when no relevant docs
						// This is tested by the retrieval consistency property above

						// Property: The system should maintain consistency in instruction application
						// Test by running the same context multiple times
						const result2 = await ragEngine.explainCode(scenario.codeContext);
						
						assert.strictEqual(
							result.hasRelevantDocs,
							result2.hasRelevantDocs,
							'System instruction should produce consistent results for identical contexts'
						);

						if (result.hasRelevantDocs && result2.hasRelevantDocs) {
							// Both should have citations when docs are found
							assert.ok(
								result.citations.length > 0 && result2.citations.length > 0,
								'System instruction should consistently produce citations when docs are available'
							);
						}

						// Clean up
						await vectorStore.close();

					} finally {
						// Cleanup temporary directory
						await fs.rm(tempDir, { recursive: true, force: true });
					}
				}
			),
			{ numRuns: 100 } // Run 100 iterations as specified in the design
		);
	});

	/**
	 * Property 13: Citation attachment
	 * For any explanation generated with retrieved documentation, the explanation should include 
	 * citations referencing the source file and section heading
	 * Feature: ai-docs-interpreter, Property 13: Citation attachment
	 * Validates: Requirements 5.6
	 */
	test('Property 13: Citation attachment', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate scenarios with documentation that should produce citations
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
						{ minLength: 1, maxLength: 5 } // Ensure at least one doc chunk for citations
					)
				}),
				async (scenario) => {
					// Create temporary directory for vector store
					const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'citation-test-'));
					
					try {
						// Set up vector store configuration
						const config: VectorStoreConfig = {
							dbPath: path.join(tempDir, 'test.db'),
							embeddingModel: 'simple-hash',
							similarityThreshold: 0.05, // Lower threshold to ensure we get results
							maxResults: 10
						};

						// Initialize vector store and RAG engine
						const vectorStore = new VectorStore(config);
						await vectorStore.initialize();
						
						// Store documentation chunks
						await vectorStore.storeChunks(scenario.documentationChunks);

						const ragEngine = new RAGEngine(vectorStore);

						// Test the explainCode method
						const result = await ragEngine.explainCode(scenario.codeContext);

						// Property 1: When relevant docs are found, citations should be present
						if (result.hasRelevantDocs) {
							assert.ok(
								Array.isArray(result.citations),
								'Citations should be an array when relevant docs are found'
							);

							assert.ok(
								result.citations.length > 0,
								'Citations array should not be empty when relevant docs are found'
							);

							// Property 2: Each citation should have required fields
							for (const citation of result.citations) {
								assert.ok(
									typeof citation.filePath === 'string' && citation.filePath.length > 0,
									'Citation should have a non-empty filePath'
								);

								assert.ok(
									typeof citation.sectionHeading === 'string' && citation.sectionHeading.length > 0,
									'Citation should have a non-empty sectionHeading'
								);

								assert.ok(
									typeof citation.relevanceScore === 'number' && 
									citation.relevanceScore >= 0 && 
									citation.relevanceScore <= 1,
									'Citation should have a relevanceScore between 0 and 1'
								);
							}

							// Property 3: Citations should reference actual documentation chunks
							for (const citation of result.citations) {
								const referencedChunk = scenario.documentationChunks.find(
									chunk => chunk.filePath === citation.filePath && 
									        chunk.sectionHeading === citation.sectionHeading
								);
								
								assert.ok(
									referencedChunk !== undefined,
									`Citation references non-existent documentation: ${citation.filePath}, ${citation.sectionHeading}`
								);
							}

							// Property 4: Explanation should contain citation information
							const explanationLower = result.explanation.toLowerCase();
							let citationFound = false;

							for (const citation of result.citations) {
								// Check if the explanation contains reference to the source
								if (explanationLower.includes('source:') || 
								    explanationLower.includes(citation.filePath.toLowerCase()) ||
								    explanationLower.includes(citation.sectionHeading.toLowerCase())) {
									citationFound = true;
									break;
								}
							}

							assert.ok(
								citationFound,
								'Explanation should contain citation information when citations are present'
							);

							// Property 5: Citations should be ordered by relevance (descending)
							if (result.citations.length > 1) {
								for (let i = 0; i < result.citations.length - 1; i++) {
									assert.ok(
										result.citations[i].relevanceScore >= result.citations[i + 1].relevanceScore,
										'Citations should be ordered by relevance score (descending)'
									);
								}
							}
						}

						// Property 6: When no relevant docs, no citations should be present
						if (!result.hasRelevantDocs) {
							assert.deepStrictEqual(
								result.citations,
								[],
								'Citations should be empty when no relevant docs are found'
							);

							assert.strictEqual(
								result.explanation,
								'Not documented.',
								'Explanation should be "Not documented." when no relevant docs are found'
							);
						}

						// Clean up
						await vectorStore.close();

					} finally {
						// Cleanup temporary directory
						await fs.rm(tempDir, { recursive: true, force: true });
					}
				}
			),
			{ numRuns: 100 } // Run 100 iterations as specified in the design
		);
	});

	/**
	 * Property 19: Explanation caching
	 * For any code symbol that has been explained before, requesting an explanation 
	 * for the same symbol should return the cached result
	 * Feature: ai-docs-interpreter, Property 19: Explanation caching
	 * Validates: Requirements 7.4
	 */
	test('Property 19: Explanation caching', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate code contexts and documentation for caching tests
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
						{ minLength: 1, maxLength: 3 } // Ensure some documentation exists
					)
				}),
				async (scenario) => {
					// Create temporary directory for vector store
					const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-test-'));
					
					try {
						// Set up vector store configuration
						const config: VectorStoreConfig = {
							dbPath: path.join(tempDir, 'test.db'),
							embeddingModel: 'simple-hash',
							similarityThreshold: 0.1,
							maxResults: 10
						};

						// Initialize vector store and cache manager
						const vectorStore = new VectorStore(config);
						await vectorStore.initialize();
						
						// Store documentation chunks
						await vectorStore.storeChunks(scenario.documentationChunks);

						const cacheManager = new ExplanationCacheManager();
						const ragEngine = new RAGEngine(vectorStore, cacheManager);

						// Property 1: First request should not be cached
						const initialCacheStats = ragEngine.getCacheStats();
						assert.strictEqual(
							initialCacheStats.size,
							0,
							'Cache should be empty initially'
						);

						// Make first explanation request
						const firstResult = await ragEngine.explainCode(scenario.codeContext);

						// Property 2: After first request, result should be cached
						const afterFirstStats = ragEngine.getCacheStats();
						assert.strictEqual(
							afterFirstStats.size,
							1,
							'Cache should contain one entry after first request'
						);

						assert.strictEqual(
							afterFirstStats.validEntries,
							1,
							'Cache should have one valid entry after first request'
						);

						// Property 3: Second identical request should return cached result
						const secondResult = await ragEngine.explainCode(scenario.codeContext);

						// Results should be identical
						assert.strictEqual(
							firstResult.explanation,
							secondResult.explanation,
							'Cached result should have identical explanation'
						);

						assert.deepStrictEqual(
							firstResult.citations,
							secondResult.citations,
							'Cached result should have identical citations'
						);

						assert.strictEqual(
							firstResult.hasRelevantDocs,
							secondResult.hasRelevantDocs,
							'Cached result should have identical hasRelevantDocs flag'
						);

						// Property 4: Cache size should remain the same after second request
						const afterSecondStats = ragEngine.getCacheStats();
						assert.strictEqual(
							afterSecondStats.size,
							1,
							'Cache size should remain 1 after second identical request'
						);

						// Property 5: Different code contexts should create separate cache entries
						const differentContext = {
							...scenario.codeContext,
							selectedText: scenario.codeContext.selectedText + '_different'
						};

						await ragEngine.explainCode(differentContext);

						const afterDifferentStats = ragEngine.getCacheStats();
						assert.strictEqual(
							afterDifferentStats.size,
							2,
							'Cache should contain two entries for different contexts'
						);

						// Property 6: Cache should handle "Not documented" results
						const emptyVectorStore = new VectorStore({
							...config,
							dbPath: path.join(tempDir, 'empty.db')
						});
						await emptyVectorStore.initialize();

						const emptyRagEngine = new RAGEngine(emptyVectorStore, new ExplanationCacheManager());
						
						const notDocumentedResult1 = await emptyRagEngine.explainCode(scenario.codeContext);
						const notDocumentedResult2 = await emptyRagEngine.explainCode(scenario.codeContext);

						assert.strictEqual(
							notDocumentedResult1.explanation,
							'Not documented.',
							'First request with no docs should return "Not documented."'
						);

						assert.strictEqual(
							notDocumentedResult2.explanation,
							'Not documented.',
							'Second request with no docs should return cached "Not documented."'
						);

						const emptyStats = emptyRagEngine.getCacheStats();
						assert.strictEqual(
							emptyStats.size,
							1,
							'Cache should store "Not documented" results'
						);

						// Property 7: Cache invalidation should work
						ragEngine.clearCache();
						const afterClearStats = ragEngine.getCacheStats();
						assert.strictEqual(
							afterClearStats.size,
							0,
							'Cache should be empty after clearing'
						);

						// Property 8: Cache should respect TTL (test with very short TTL)
						const shortTTLCache = new ExplanationCacheManager();
						shortTTLCache.setDefaultTTL(1); // 1 millisecond TTL

						const shortTTLEngine = new RAGEngine(vectorStore, shortTTLCache);
						
						await shortTTLEngine.explainCode(scenario.codeContext);
						
						// Wait for TTL to expire
						await new Promise(resolve => setTimeout(resolve, 10));
						
						// Cleanup expired entries
						shortTTLEngine.cleanupCache();
						
						const expiredStats = shortTTLEngine.getCacheStats();
						assert.strictEqual(
							expiredStats.size,
							0,
							'Cache should be empty after TTL expiration and cleanup'
						);

						// Clean up
						await vectorStore.close();
						await emptyVectorStore.close();

					} finally {
						// Cleanup temporary directory
						await fs.rm(tempDir, { recursive: true, force: true });
					}
				}
			),
			{ numRuns: 100 } // Run 100 iterations as specified in the design
		);
	});

	/**
	 * Property 20: Deterministic behavior
	 * For any identical code selection provided multiple times, the system should generate identical explanations
	 * Feature: ai-docs-interpreter, Property 20: Deterministic behavior
	 * Validates: Requirements 7.5
	 */
	test('Property 20: Deterministic behavior', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate code contexts and documentation for deterministic testing
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
						{ minLength: 0, maxLength: 3 } // Allow empty docs to test "Not documented" determinism
					)
				}),
				async (scenario) => {
					// Create temporary directory for vector store
					const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'deterministic-test-'));
					
					try {
						// Set up vector store configuration
						const config: VectorStoreConfig = {
							dbPath: path.join(tempDir, 'test.db'),
							embeddingModel: 'simple-hash',
							similarityThreshold: 0.1,
							maxResults: 10
						};

						// Initialize vector store
						const vectorStore = new VectorStore(config);
						await vectorStore.initialize();
						
						// Store documentation chunks if any exist
						if (scenario.documentationChunks.length > 0) {
							await vectorStore.storeChunks(scenario.documentationChunks);
						}

						// Create RAG engine without cache to test raw determinism
						const ragEngine = new RAGEngine(vectorStore, new ExplanationCacheManager());

						// Property 1: Multiple calls with identical context should produce identical results
						const results: ExplanationResult[] = [];
						const numIterations = 3;

						for (let i = 0; i < numIterations; i++) {
							// Clear cache before each iteration to test raw determinism
							ragEngine.clearCache();
							const result = await ragEngine.explainCode(scenario.codeContext);
							results.push(result);
						}

						// Verify all results are identical
						const firstResult = results[0];
						for (let i = 1; i < results.length; i++) {
							const currentResult = results[i];

							assert.strictEqual(
								firstResult.explanation,
								currentResult.explanation,
								`Explanation should be identical across iterations (iteration ${i})`
							);

							assert.deepStrictEqual(
								firstResult.citations,
								currentResult.citations,
								`Citations should be identical across iterations (iteration ${i})`
							);

							assert.strictEqual(
								Math.round(firstResult.confidence * 1000),
								Math.round(currentResult.confidence * 1000),
								`Confidence should be identical across iterations (iteration ${i})`
							);

							assert.strictEqual(
								firstResult.hasRelevantDocs,
								currentResult.hasRelevantDocs,
								`hasRelevantDocs should be identical across iterations (iteration ${i})`
							);
						}

						// Property 2: Built-in deterministic validation should pass
						ragEngine.clearCache();
						const isDeterministic = await ragEngine.validateDeterministicBehavior(scenario.codeContext, 3);
						assert.ok(
							isDeterministic,
							'Built-in deterministic validation should pass'
						);

						// Property 3: Request deduplication should work for concurrent requests
						ragEngine.clearCache();
						
						// Make multiple concurrent requests with the same context
						const concurrentPromises = Array(3).fill(null).map(() => 
							ragEngine.explainCode(scenario.codeContext)
						);

						const concurrentResults = await Promise.all(concurrentPromises);

						// All concurrent results should be identical
						for (let i = 1; i < concurrentResults.length; i++) {
							assert.strictEqual(
								concurrentResults[0].explanation,
								concurrentResults[i].explanation,
								`Concurrent request ${i} should have identical explanation`
							);

							assert.deepStrictEqual(
								concurrentResults[0].citations,
								concurrentResults[i].citations,
								`Concurrent request ${i} should have identical citations`
							);
						}

						// Property 4: Context hash generation should be consistent
						const contextHash1 = (ragEngine as any).generateContextHash(scenario.codeContext);
						const contextHash2 = (ragEngine as any).generateContextHash(scenario.codeContext);
						
						assert.strictEqual(
							contextHash1,
							contextHash2,
							'Context hash should be identical for identical contexts'
						);

						// Property 5: Different contexts should produce different hashes
						const differentContext = {
							...scenario.codeContext,
							selectedText: scenario.codeContext.selectedText + '_different'
						};
						
						const differentHash = (ragEngine as any).generateContextHash(differentContext);
						assert.notStrictEqual(
							contextHash1,
							differentHash,
							'Different contexts should produce different hashes'
						);

						// Property 6: Deterministic behavior should work with "Not documented" results
						if (scenario.documentationChunks.length === 0) {
							// All results should be "Not documented."
							for (const result of results) {
								assert.strictEqual(
									result.explanation,
									'Not documented.',
									'Empty documentation should consistently return "Not documented."'
								);

								assert.strictEqual(
									result.hasRelevantDocs,
									false,
									'Empty documentation should consistently have hasRelevantDocs = false'
								);

								assert.strictEqual(
									result.confidence,
									0,
									'Empty documentation should consistently have confidence = 0'
								);

								assert.deepStrictEqual(
									result.citations,
									[],
									'Empty documentation should consistently have empty citations'
								);
							}
						}

						// Property 7: Deterministic settings should be consistent
						const settings1 = ragEngine.getDeterministicSettings();
						const settings2 = ragEngine.getDeterministicSettings();
						
						assert.deepStrictEqual(
							settings1,
							settings2,
							'Deterministic settings should be consistent'
						);

						assert.ok(
							settings1.temperature <= 0.2,
							'Temperature should be low for deterministic output'
						);

						assert.ok(
							typeof settings1.seed === 'number',
							'Seed should be a number for reproducibility'
						);

						// Clean up
						await vectorStore.close();

					} finally {
						// Cleanup temporary directory
						await fs.rm(tempDir, { recursive: true, force: true });
					}
				}
			),
			{ numRuns: 100 } // Run 100 iterations as specified in the design
		);
	});

	/**
	 * Property 18: Documentation requirement enforcement
	 * For any explanation request where no relevant documentation is found, the system should reject 
	 * the request or respond with "Not documented."
	 * Feature: ai-docs-interpreter, Property 18: Documentation requirement enforcement
	 * Validates: Requirements 7.1
	 */
	test('Property 18: Documentation requirement enforcement', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate various scenarios to test documentation requirement enforcement
				fc.record({
					codeContext: fc.record({
						selectedText: fc.string({ minLength: 1, maxLength: 200 }),
						fileName: fc.stringMatching(/^[a-zA-Z0-9_-]+\.(js|ts|jsx|tsx)$/),
						functionName: fc.option(fc.stringMatching(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/), { nil: undefined }),
						className: fc.option(fc.stringMatching(/^[A-Z][a-zA-Z0-9_$]*$/), { nil: undefined }),
						imports: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
						surroundingContext: fc.string({ minLength: 0, maxLength: 500 }),
						language: fc.constantFrom('javascript', 'typescript')
					}),
					documentationScenario: fc.oneof(
						// Scenario 1: No documentation at all
						fc.constant({ type: 'empty', chunks: [] }),
						// Scenario 2: Documentation with very low relevance
						fc.constant({
							type: 'irrelevant',
							chunks: [
								{
									id: 'irrelevant-1',
									filePath: 'docs/unrelated.md',
									sectionHeading: 'Unrelated Topic',
									content: 'This documentation talks about completely different topics that have no relation to the code.',
									metadata: {
										level: 1,
										wordCount: 15,
										lastModified: new Date()
									}
								}
							]
						}),
						// Scenario 3: Documentation with insufficient content
						fc.constant({
							type: 'insufficient',
							chunks: [
								{
									id: 'insufficient-1',
									filePath: 'docs/brief.md',
									sectionHeading: 'Brief',
									content: 'TODO',
									metadata: {
										level: 1,
										wordCount: 1,
										lastModified: new Date()
									}
								}
							]
						}),
						// Scenario 4: Documentation with generic/placeholder content
						fc.constant({
							type: 'generic',
							chunks: [
								{
									id: 'generic-1',
									filePath: 'docs/placeholder.md',
									sectionHeading: 'Coming Soon',
									content: 'This feature is coming soon. Please check back later. TBD - to be determined.',
									metadata: {
										level: 1,
										wordCount: 12,
										lastModified: new Date()
									}
								}
							]
						}),
						// Scenario 5: Valid documentation (control case)
						fc.record({
							type: fc.constant('valid'),
							chunks: fc.array(
								fc.record({
									id: fc.uuid(),
									filePath: fc.stringMatching(/^[a-zA-Z0-9_/-]+\.md$/),
									sectionHeading: fc.string({ minLength: 5, maxLength: 50 }),
									content: fc.string({ minLength: 50, maxLength: 300 }),
									metadata: fc.record({
										level: fc.integer({ min: 1, max: 6 }),
										wordCount: fc.integer({ min: 25, max: 75 }),
										lastModified: fc.date()
									})
								}),
								{ minLength: 1, maxLength: 3 }
							)
						})
					)
				}),
				async (scenario) => {
					// Create temporary directory for vector store
					const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-enforcement-test-'));
					
					try {
						// Set up vector store configuration
						const config: VectorStoreConfig = {
							dbPath: path.join(tempDir, 'test.db'),
							embeddingModel: 'simple-hash',
							similarityThreshold: 0.1,
							maxResults: 10
						};

						// Initialize vector store and RAG engine
						const vectorStore = new VectorStore(config);
						await vectorStore.initialize();
						
						// Store documentation chunks based on scenario
						if (scenario.documentationScenario.chunks.length > 0) {
							await vectorStore.storeChunks(scenario.documentationScenario.chunks);
						}

						const ragEngine = new RAGEngine(vectorStore);

						// Test the explainCode method
						const result = await ragEngine.explainCode(scenario.codeContext);

						// Property 1: Empty documentation should always be rejected
						if (scenario.documentationScenario.type === 'empty') {
							assert.strictEqual(
								result.explanation,
								'Not documented.',
								'Empty documentation should result in "Not documented." response'
							);

							assert.strictEqual(
								result.hasRelevantDocs,
								false,
								'Empty documentation should have hasRelevantDocs = false'
							);

							assert.strictEqual(
								result.confidence,
								0,
								'Empty documentation should have confidence = 0'
							);

							assert.deepStrictEqual(
								result.citations,
								[],
								'Empty documentation should have empty citations'
							);
						}

						// Property 2: Irrelevant documentation should be rejected
						if (scenario.documentationScenario.type === 'irrelevant') {
							assert.strictEqual(
								result.explanation,
								'Not documented.',
								'Irrelevant documentation should result in "Not documented." response'
							);

							assert.strictEqual(
								result.hasRelevantDocs,
								false,
								'Irrelevant documentation should have hasRelevantDocs = false'
							);
						}

						// Property 3: Insufficient content should be rejected
						if (scenario.documentationScenario.type === 'insufficient') {
							assert.strictEqual(
								result.explanation,
								'Not documented.',
								'Insufficient documentation should result in "Not documented." response'
							);

							assert.strictEqual(
								result.hasRelevantDocs,
								false,
								'Insufficient documentation should have hasRelevantDocs = false'
							);
						}

						// Property 4: Generic/placeholder content should be rejected
						if (scenario.documentationScenario.type === 'generic') {
							assert.strictEqual(
								result.explanation,
								'Not documented.',
								'Generic/placeholder documentation should result in "Not documented." response'
							);

							assert.strictEqual(
								result.hasRelevantDocs,
								false,
								'Generic/placeholder documentation should have hasRelevantDocs = false'
							);
						}

						// Property 5: Valid documentation should be accepted (when relevant)
						if (scenario.documentationScenario.type === 'valid') {
							// Valid documentation might still result in "Not documented." if not relevant
							// But if it's relevant, it should not be rejected due to quality issues
							
							if (result.hasRelevantDocs) {
								assert.notStrictEqual(
									result.explanation,
									'Not documented.',
									'Valid relevant documentation should not result in "Not documented." response'
								);

								assert.ok(
									result.confidence > 0,
									'Valid relevant documentation should have confidence > 0'
								);

								assert.ok(
									result.citations.length > 0,
									'Valid relevant documentation should have citations'
								);
							}
							// If not relevant, it's still valid to return "Not documented."
						}

						// Property 6: All rejection responses should be consistent
						if (result.explanation === 'Not documented.') {
							assert.strictEqual(
								result.hasRelevantDocs,
								false,
								'All "Not documented." responses should have hasRelevantDocs = false'
							);

							assert.strictEqual(
								result.confidence,
								0,
								'All "Not documented." responses should have confidence = 0'
							);

							assert.deepStrictEqual(
								result.citations,
								[],
								'All "Not documented." responses should have empty citations'
							);
						}

						// Property 7: System should handle edge cases gracefully
						assert.ok(
							typeof result.explanation === 'string',
							'Explanation should always be a string'
						);

						assert.ok(
							result.explanation.length > 0,
							'Explanation should never be empty'
						);

						assert.ok(
							Array.isArray(result.citations),
							'Citations should always be an array'
						);

						assert.ok(
							typeof result.confidence === 'number' && 
							result.confidence >= 0 && 
							result.confidence <= 1,
							'Confidence should always be a number between 0 and 1'
						);

						assert.ok(
							typeof result.hasRelevantDocs === 'boolean',
							'hasRelevantDocs should always be a boolean'
						);

						// Property 8: Explanation grounding validation should work
						if (result.hasRelevantDocs && result.explanation !== 'Not documented.') {
							// The explanation should be grounded in the provided documentation
							const isGrounded = ragEngine.validateResponse(result.explanation, scenario.documentationScenario.chunks);
							assert.ok(
								isGrounded,
								'Explanations with relevant docs should be grounded in documentation'
							);
						}

						// Property 9: Caching should work for rejected requests
						const secondResult = await ragEngine.explainCode(scenario.codeContext);
						
						assert.strictEqual(
							result.explanation,
							secondResult.explanation,
							'Cached rejection should be identical to original rejection'
						);

						assert.strictEqual(
							result.hasRelevantDocs,
							secondResult.hasRelevantDocs,
							'Cached rejection hasRelevantDocs should be identical'
						);

						// Clean up
						await vectorStore.close();

					} finally {
						// Cleanup temporary directory
						await fs.rm(tempDir, { recursive: true, force: true });
					}
				}
			),
			{ numRuns: 100 } // Run 100 iterations as specified in the design
		);
	});
});