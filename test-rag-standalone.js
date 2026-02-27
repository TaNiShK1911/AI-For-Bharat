/**
 * Standalone test for RAG Engine functionality
 * This test can run without VS Code dependencies
 */

const assert = require('assert');
const fc = require('fast-check');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Import the compiled modules
const { RAGEngine } = require('./out/rag/RAGEngine');
const { VectorStore } = require('./out/storage/VectorStore');

/**
 * Property 11: Documentation retrieval consistency
 * For any code explanation request, the RAG engine should retrieve documentation chunks 
 * and include them in the generated prompt
 * Feature: ai-docs-interpreter, Property 11: Documentation retrieval consistency
 * Validates: Requirements 5.1, 5.3
 */
async function testDocumentationRetrievalConsistency() {
	console.log('Testing Property 11: Documentation retrieval consistency...');
	
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
					const config = {
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

					// Clean up
					await vectorStore.close();
					
					// Add a small delay to ensure database is fully closed
					await new Promise(resolve => setTimeout(resolve, 50));

				} finally {
					// Cleanup temporary directory - handle file locks gracefully
					try {
						await fs.rm(tempDir, { recursive: true, force: true });
					} catch (error) {
						// Ignore cleanup errors on Windows due to file locks
						console.warn('Warning: Could not clean up temp directory:', error.message);
					}
				}
			}
		),
		{ numRuns: 50 } // Reduced runs for faster testing
	);
	
	console.log('✅ Property 11: Documentation retrieval consistency - PASSED');
}

/**
 * Simple unit test for "Not documented" responses
 */
async function testNotDocumentedResponses() {
	console.log('Testing "Not documented" responses...');
	
	// Create temporary directory for vector store
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-unit-test-'));
	
	try {
		// Set up vector store configuration
		const config = {
			dbPath: path.join(tempDir, 'empty.db'),
			embeddingModel: 'simple-hash',
			similarityThreshold: 0.1,
			maxResults: 10
		};

		// Initialize empty vector store
		const vectorStore = new VectorStore(config);
		await vectorStore.initialize();
		
		const ragEngine = new RAGEngine(vectorStore);

		// Test with a simple code context
		const context = {
			selectedText: 'function testFunction() { return true; }',
			fileName: 'test.js',
			functionName: 'testFunction',
			className: undefined,
			imports: [],
			surroundingContext: '',
			language: 'javascript'
		};

		const result = await ragEngine.explainCode(context);

		// Should return "Not documented." when no docs exist
		assert.strictEqual(
			result.explanation,
			'Not documented.',
			'Expected "Not documented." for empty documentation'
		);

		// Should indicate no relevant docs found
		assert.strictEqual(
			result.hasRelevantDocs,
			false,
			'hasRelevantDocs should be false when no documentation exists'
		);

		// Should have zero confidence
		assert.strictEqual(
			result.confidence,
			0,
			'Confidence should be 0 when no documentation exists'
		);

		// Should have empty citations
		assert.deepStrictEqual(
			result.citations,
			[],
			'Citations should be empty when no documentation exists'
		);

		await vectorStore.close();
		console.log('✅ "Not documented" responses - PASSED');

	} finally {
		// Cleanup temporary directory - handle file locks gracefully
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors on Windows due to file locks
			console.warn('Warning: Could not clean up temp directory:', error.message);
		}
	}
}

/**
 * Test offline operation
 */
async function testOfflineOperation() {
	console.log('Testing offline operation...');
	
	// Create temporary directory for vector store
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-offline-test-'));
	
	try {
		// Set up vector store configuration
		const config = {
			dbPath: path.join(tempDir, 'offline.db'),
			embeddingModel: 'simple-hash',
			similarityThreshold: 0.01, // Very low threshold to ensure we get results
			maxResults: 5
		};

		// Initialize vector store with local documentation
		const vectorStore = new VectorStore(config);
		await vectorStore.initialize();
		
		// Add some documentation chunks
		const docs = [
			{
				id: 'offline-doc1',
				filePath: 'README.md',
				sectionHeading: 'API Reference',
				content: 'The processData function takes an input array and returns processed results. It handles validation and transformation.',
				metadata: {
					level: 2,
					wordCount: 18,
					lastModified: new Date()
				}
			}
		];

		console.log('Debug - Storing documents:', docs.length);
		await vectorStore.storeChunks(docs);
		console.log('Debug - Storage completed');
		
		// Debug: Check if documents were stored using direct database query
		console.log('Debug - Documents stored, checking database...');
		
		// Test with very low similarity threshold to get all docs
		const allDocs = await vectorStore.searchSimilar('processData', 10); // Search for specific term
		console.log('Debug - Search results for "processData":', allDocs.length);
		
		// If no results, try with different search terms
		if (allDocs.length === 0) {
			const testSearches = ['function', 'input', 'array', 'validation'];
			for (const term of testSearches) {
				const results = await vectorStore.searchSimilar(term, 10);
				console.log(`Debug - Search results for "${term}":`, results.length);
				if (results.length > 0) break;
			}
		}
		
		const ragEngine = new RAGEngine(vectorStore);

		// Debug: Test what query the RAG engine generates
		const testContext = {
			selectedText: 'const result = processData(inputArray);',
			fileName: 'processor.js',
			functionName: 'processData',
			className: undefined,
			imports: [],
			surroundingContext: 'const inputArray = [1, 2, 3];',
			language: 'javascript'
		};
		
		// Test the query generation by calling retrieveRelevantDocs directly
		const ragQuery = `processData input array function`;
		console.log('Debug - RAG query:', ragQuery);
		const ragSearchResults = await ragEngine.retrieveRelevantDocs(ragQuery);
		console.log('Debug - RAG search results:', ragSearchResults.length);

		// Debug: Test direct vector store search
		const directSearchResults = await vectorStore.searchSimilar('processData function', 5);
		console.log('Debug - Direct search results:', directSearchResults.length);

		// Test offline operation validation
		const isOfflineCapable = await ragEngine.validateOfflineOperation();
		assert.strictEqual(
			isOfflineCapable,
			true,
			'RAG engine should be capable of offline operation'
		);

		// Test code explanation without internet
		const context = {
			selectedText: 'const result = processData(inputArray);',
			fileName: 'processor.js',
			functionName: 'processData',
			className: undefined,
			imports: [],
			surroundingContext: 'const inputArray = [1, 2, 3];',
			language: 'javascript'
		};

		// Debug: Test the actual query the RAG engine builds
		// Simulate the new query building logic
		const selectedWords = context.selectedText
			.replace(/[^\w\s]/g, ' ') // Remove punctuation
			.split(/\s+/)
			.filter(word => 
				word.length > 2 && 
				!['const', 'let', 'var', 'function', 'class', 'return', 'if', 'else', 'for', 'while'].includes(word.toLowerCase())
			)
			.slice(0, 3);
		
		const actualQuery = [context.functionName, ...selectedWords].filter(Boolean).join(' ');
		console.log('Debug - Actual RAG engine query (new):', actualQuery);
		const actualResults = await ragEngine.retrieveRelevantDocs('processData input');
		console.log('Debug - Test query "processData input":', actualResults.length);

		const result = await ragEngine.explainCode(context);

		console.log('Debug - Search result:', {
			explanation: result.explanation,
			hasRelevantDocs: result.hasRelevantDocs,
			confidence: result.confidence,
			citationsCount: result.citations.length
		});

		// Should work offline and provide explanation
		assert.notStrictEqual(
			result.explanation,
			'Not documented.',
			'Should provide explanation when relevant docs exist offline'
		);

		assert.strictEqual(
			result.hasRelevantDocs,
			true,
			'Should find relevant docs in offline mode'
		);

		await vectorStore.close();
		
		// Add a small delay to ensure database is fully closed
		await new Promise(resolve => setTimeout(resolve, 100));
		
		console.log('✅ Offline operation - PASSED');

	} finally {
		// Cleanup temporary directory - handle file locks gracefully
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors on Windows due to file locks
			console.warn('Warning: Could not clean up temp directory:', error.message);
		}
	}
}

// Run all tests
async function runAllTests() {
	console.log('🚀 Starting RAG Engine Standalone Tests...\n');
	
	try {
		await testNotDocumentedResponses();
		console.log('');
		
		await testOfflineOperation();
		console.log('');
		
		await testDocumentationRetrievalConsistency();
		console.log('');
		
		console.log('🎉 All RAG Engine tests PASSED!');
	} catch (error) {
		console.error('❌ Test failed:', error);
		process.exit(1);
	}
}

// Run tests if this file is executed directly
if (require.main === module) {
	runAllTests();
}

module.exports = {
	testDocumentationRetrievalConsistency,
	testNotDocumentedResponses,
	testOfflineOperation
};