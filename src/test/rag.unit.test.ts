import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { RAGEngine } from '../rag/RAGEngine';
import { VectorStore } from '../storage/VectorStore';
import { CodeContext, VectorStoreConfig } from '../types/interfaces';

suite('RAG Engine Unit Tests', () => {

	/**
	 * Test behavior when no relevant documentation is found
	 * Validates: Requirements 5.5
	 */
	test('Should return "Not documented." when no documentation exists', async () => {
		// Create temporary directory for vector store
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-unit-test-'));
		
		try {
			// Set up vector store configuration
			const config: VectorStoreConfig = {
				dbPath: path.join(tempDir, 'empty.db'),
				embeddingModel: 'simple-hash',
				similarityThreshold: 0.1,
				maxResults: 10
			};

			// Initialize empty vector store
			const vectorStore = new VectorStore(config);
			await vectorStore.initialize();
			
			const ragEngine = new RAGEngine(vectorStore);

			// Test with various code contexts
			const testContexts: CodeContext[] = [
				{
					selectedText: 'function testFunction() { return true; }',
					fileName: 'test.js',
					functionName: 'testFunction',
					className: undefined,
					imports: [],
					surroundingContext: '',
					language: 'javascript'
				},
				{
					selectedText: 'class TestClass { constructor() {} }',
					fileName: 'test.ts',
					functionName: undefined,
					className: 'TestClass',
					imports: ['react', 'lodash'],
					surroundingContext: 'import React from "react";',
					language: 'typescript'
				},
				{
					selectedText: 'const x = 42;',
					fileName: 'variables.js',
					functionName: undefined,
					className: undefined,
					imports: [],
					surroundingContext: 'const y = 24;',
					language: 'javascript'
				}
			];

			for (const context of testContexts) {
				const result = await ragEngine.explainCode(context);

				// Should return "Not documented." when no docs exist
				assert.strictEqual(
					result.explanation,
					'Not documented.',
					`Expected "Not documented." for context: ${context.selectedText}`
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
			}

			await vectorStore.close();

		} finally {
			// Cleanup temporary directory
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	/**
	 * Test behavior when documentation exists but is not relevant
	 * Validates: Requirements 5.5
	 */
	test('Should return "Not documented." when documentation is not relevant', async () => {
		// Create temporary directory for vector store
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-irrelevant-test-'));
		
		try {
			// Set up vector store configuration with high similarity threshold
			const config: VectorStoreConfig = {
				dbPath: path.join(tempDir, 'irrelevant.db'),
				embeddingModel: 'simple-hash',
				similarityThreshold: 0.9, // Very high threshold to make docs irrelevant
				maxResults: 10
			};

			// Initialize vector store with irrelevant documentation
			const vectorStore = new VectorStore(config);
			await vectorStore.initialize();
			
			// Add completely unrelated documentation
			const irrelevantDocs = [
				{
					id: 'doc1',
					filePath: 'README.md',
					sectionHeading: 'Installation',
					content: 'To install this package, run npm install. Make sure you have Node.js version 14 or higher.',
					metadata: {
						level: 1,
						wordCount: 15,
						lastModified: new Date()
					}
				},
				{
					id: 'doc2',
					filePath: 'docs/deployment.md',
					sectionHeading: 'Docker Setup',
					content: 'Use Docker to containerize the application. Create a Dockerfile with the base image.',
					metadata: {
						level: 2,
						wordCount: 14,
						lastModified: new Date()
					}
				}
			];

			await vectorStore.storeChunks(irrelevantDocs);
			
			const ragEngine = new RAGEngine(vectorStore);

			// Test with code that has no relation to the documentation
			const context: CodeContext = {
				selectedText: 'function calculateQuantumEntanglement(particles) { return particles.map(p => p.spin); }',
				fileName: 'quantum.js',
				functionName: 'calculateQuantumEntanglement',
				className: undefined,
				imports: [],
				surroundingContext: '',
				language: 'javascript'
			};

			const result = await ragEngine.explainCode(context);

			// Should return "Not documented." when docs are not relevant
			assert.strictEqual(
				result.explanation,
				'Not documented.',
				'Should return "Not documented." when documentation is not relevant'
			);

			// Should indicate no relevant docs found
			assert.strictEqual(
				result.hasRelevantDocs,
				false,
				'hasRelevantDocs should be false when documentation is not relevant'
			);

			// Should have zero confidence
			assert.strictEqual(
				result.confidence,
				0,
				'Confidence should be 0 when documentation is not relevant'
			);

			// Should have empty citations
			assert.deepStrictEqual(
				result.citations,
				[],
				'Citations should be empty when documentation is not relevant'
			);

			await vectorStore.close();

		} finally {
			// Cleanup temporary directory
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	/**
	 * Test that "Not documented." response is consistent
	 * Validates: Requirements 5.5
	 */
	test('Should consistently return "Not documented." for identical contexts', async () => {
		// Create temporary directory for vector store
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-consistent-test-'));
		
		try {
			// Set up vector store configuration
			const config: VectorStoreConfig = {
				dbPath: path.join(tempDir, 'consistent.db'),
				embeddingModel: 'simple-hash',
				similarityThreshold: 0.5,
				maxResults: 10
			};

			// Initialize empty vector store
			const vectorStore = new VectorStore(config);
			await vectorStore.initialize();
			
			const ragEngine = new RAGEngine(vectorStore);

			// Test context
			const context: CodeContext = {
				selectedText: 'const result = processData(input);',
				fileName: 'processor.js',
				functionName: undefined,
				className: undefined,
				imports: ['lodash'],
				surroundingContext: 'import _ from "lodash";',
				language: 'javascript'
			};

			// Call explainCode multiple times with the same context
			const results = await Promise.all([
				ragEngine.explainCode(context),
				ragEngine.explainCode(context),
				ragEngine.explainCode(context)
			]);

			// All results should be identical
			for (let i = 0; i < results.length; i++) {
				assert.strictEqual(
					results[i].explanation,
					'Not documented.',
					`Result ${i} should return "Not documented."`
				);

				assert.strictEqual(
					results[i].hasRelevantDocs,
					false,
					`Result ${i} should have hasRelevantDocs = false`
				);

				assert.strictEqual(
					results[i].confidence,
					0,
					`Result ${i} should have confidence = 0`
				);

				assert.deepStrictEqual(
					results[i].citations,
					[],
					`Result ${i} should have empty citations`
				);
			}

			// All results should be identical to each other
			for (let i = 1; i < results.length; i++) {
				assert.deepStrictEqual(
					results[i],
					results[0],
					`Result ${i} should be identical to result 0`
				);
			}

			await vectorStore.close();

		} finally {
			// Cleanup temporary directory
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	/**
	 * Test edge cases for "Not documented." responses
	 * Validates: Requirements 5.5
	 */
	test('Should handle edge cases and return "Not documented."', async () => {
		// Create temporary directory for vector store
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-edge-test-'));
		
		try {
			// Set up vector store configuration
			const config: VectorStoreConfig = {
				dbPath: path.join(tempDir, 'edge.db'),
				embeddingModel: 'simple-hash',
				similarityThreshold: 0.1,
				maxResults: 10
			};

			// Initialize vector store
			const vectorStore = new VectorStore(config);
			await vectorStore.initialize();
			
			const ragEngine = new RAGEngine(vectorStore);

			// Test edge cases
			const edgeCases: CodeContext[] = [
				// Empty selected text
				{
					selectedText: '',
					fileName: 'empty.js',
					functionName: undefined,
					className: undefined,
					imports: [],
					surroundingContext: '',
					language: 'javascript'
				},
				// Very short selected text
				{
					selectedText: 'x',
					fileName: 'short.js',
					functionName: undefined,
					className: undefined,
					imports: [],
					surroundingContext: '',
					language: 'javascript'
				},
				// Only whitespace
				{
					selectedText: '   \n\t  ',
					fileName: 'whitespace.js',
					functionName: undefined,
					className: undefined,
					imports: [],
					surroundingContext: '',
					language: 'javascript'
				},
				// Special characters
				{
					selectedText: '!@#$%^&*()',
					fileName: 'special.js',
					functionName: undefined,
					className: undefined,
					imports: [],
					surroundingContext: '',
					language: 'javascript'
				}
			];

			for (const context of edgeCases) {
				const result = await ragEngine.explainCode(context);

				// Should handle edge cases gracefully
				assert.strictEqual(
					result.explanation,
					'Not documented.',
					`Should return "Not documented." for edge case: "${context.selectedText}"`
				);

				assert.strictEqual(
					result.hasRelevantDocs,
					false,
					'hasRelevantDocs should be false for edge cases'
				);

				assert.strictEqual(
					result.confidence,
					0,
					'Confidence should be 0 for edge cases'
				);

				assert.deepStrictEqual(
					result.citations,
					[],
					'Citations should be empty for edge cases'
				);
			}

			await vectorStore.close();

		} finally {
			// Cleanup temporary directory
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	/**
	 * Test RAG engine functionality without internet access
	 * Validates: Requirements 5.7
	 */
	test('Should operate offline without internet access', async () => {
		// Create temporary directory for vector store
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-offline-test-'));
		
		try {
			// Set up vector store configuration
			const config: VectorStoreConfig = {
				dbPath: path.join(tempDir, 'offline.db'),
				embeddingModel: 'simple-hash',
				similarityThreshold: 0.1,
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
				},
				{
					id: 'offline-doc2',
					filePath: 'docs/functions.md',
					sectionHeading: 'Data Processing',
					content: 'Data processing functions include processData, validateInput, and transformOutput. These work together to handle data flow.',
					metadata: {
						level: 1,
						wordCount: 19,
						lastModified: new Date()
					}
				}
			];

			await vectorStore.storeChunks(docs);
			
			const ragEngine = new RAGEngine(vectorStore);

			// Test offline operation validation
			const isOfflineCapable = await ragEngine.validateOfflineOperation();
			assert.strictEqual(
				isOfflineCapable,
				true,
				'RAG engine should be capable of offline operation'
			);

			// Test code explanation without internet
			const context: CodeContext = {
				selectedText: 'const result = processData(inputArray);',
				fileName: 'processor.js',
				functionName: 'processData',
				className: undefined,
				imports: [],
				surroundingContext: 'const inputArray = [1, 2, 3];',
				language: 'javascript'
			};

			const result = await ragEngine.explainCode(context);

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

			assert.ok(
				result.confidence > 0,
				'Should have confidence > 0 when docs are found offline'
			);

			assert.ok(
				result.citations.length > 0,
				'Should provide citations when operating offline'
			);

			// Verify citations reference local documentation
			for (const citation of result.citations) {
				const referencedDoc = docs.find(
					doc => doc.filePath === citation.filePath && 
					      doc.sectionHeading === citation.sectionHeading
				);
				assert.ok(
					referencedDoc !== undefined,
					'Citations should reference local documentation when offline'
				);
			}

			await vectorStore.close();

		} finally {
			// Cleanup temporary directory
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	/**
	 * Test deterministic behavior for offline operation
	 * Validates: Requirements 5.7, 5.4
	 */
	test('Should provide deterministic results in offline mode', async () => {
		// Create temporary directory for vector store
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-deterministic-test-'));
		
		try {
			// Set up vector store configuration
			const config: VectorStoreConfig = {
				dbPath: path.join(tempDir, 'deterministic.db'),
				embeddingModel: 'simple-hash',
				similarityThreshold: 0.1,
				maxResults: 5
			};

			// Initialize vector store
			const vectorStore = new VectorStore(config);
			await vectorStore.initialize();
			
			// Add documentation
			const docs = [
				{
					id: 'det-doc1',
					filePath: 'README.md',
					sectionHeading: 'Functions',
					content: 'The calculateSum function adds two numbers and returns the result. It performs basic arithmetic operations.',
					metadata: {
						level: 2,
						wordCount: 16,
						lastModified: new Date()
					}
				}
			];

			await vectorStore.storeChunks(docs);
			
			const ragEngine = new RAGEngine(vectorStore);

			// Test context
			const context: CodeContext = {
				selectedText: 'function calculateSum(a, b) { return a + b; }',
				fileName: 'math.js',
				functionName: 'calculateSum',
				className: undefined,
				imports: [],
				surroundingContext: '',
				language: 'javascript'
			};

			// Get deterministic settings
			const settings = ragEngine.getDeterministicSettings();
			assert.ok(
				typeof settings.temperature === 'number' && settings.temperature <= 0.2,
				'Temperature should be low for deterministic output'
			);
			assert.ok(
				typeof settings.seed === 'number',
				'Seed should be set for reproducibility'
			);
			assert.ok(
				typeof settings.maxTokens === 'number' && settings.maxTokens > 0,
				'Max tokens should be configured'
			);

			// Run multiple times to test deterministic behavior
			const results = await Promise.all([
				ragEngine.explainCode(context),
				ragEngine.explainCode(context),
				ragEngine.explainCode(context)
			]);

			// All results should be identical in offline mode
			for (let i = 1; i < results.length; i++) {
				assert.deepStrictEqual(
					results[i],
					results[0],
					`Result ${i} should be identical to result 0 in offline mode`
				);
			}

			// Verify offline capability
			const isOfflineCapable = await ragEngine.validateOfflineOperation();
			assert.strictEqual(
				isOfflineCapable,
				true,
				'Should validate offline operation capability'
			);

			await vectorStore.close();

		} finally {
			// Cleanup temporary directory
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	/**
	 * Test offline operation with various data scenarios
	 * Validates: Requirements 5.7
	 */
	test('Should handle various offline scenarios', async () => {
		// Create temporary directory for vector store
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rag-offline-scenarios-test-'));
		
		try {
			// Set up vector store configuration
			const config: VectorStoreConfig = {
				dbPath: path.join(tempDir, 'scenarios.db'),
				embeddingModel: 'simple-hash',
				similarityThreshold: 0.1,
				maxResults: 10
			};

			// Initialize vector store
			const vectorStore = new VectorStore(config);
			await vectorStore.initialize();
			
			const ragEngine = new RAGEngine(vectorStore);

			// Test 1: Empty database offline
			let result = await ragEngine.explainCode({
				selectedText: 'console.log("test");',
				fileName: 'test.js',
				functionName: undefined,
				className: undefined,
				imports: [],
				surroundingContext: '',
				language: 'javascript'
			});

			assert.strictEqual(
				result.explanation,
				'Not documented.',
				'Should return "Not documented." for empty database offline'
			);

			// Test 2: Add documentation and test offline retrieval
			const docs = [
				{
					id: 'scenario-doc1',
					filePath: 'docs/logging.md',
					sectionHeading: 'Console Output',
					content: 'Use console.log for debugging output. It prints messages to the console for development purposes.',
					metadata: {
						level: 2,
						wordCount: 16,
						lastModified: new Date()
					}
				}
			];

			await vectorStore.storeChunks(docs);

			result = await ragEngine.explainCode({
				selectedText: 'console.log("debug message");',
				fileName: 'debug.js',
				functionName: undefined,
				className: undefined,
				imports: [],
				surroundingContext: '',
				language: 'javascript'
			});

			assert.notStrictEqual(
				result.explanation,
				'Not documented.',
				'Should find documentation offline after adding docs'
			);

			assert.ok(
				result.hasRelevantDocs,
				'Should have relevant docs in offline mode'
			);

			// Test 3: Validate offline operation throughout
			const offlineValidation = await ragEngine.validateOfflineOperation();
			assert.strictEqual(
				offlineValidation,
				true,
				'Should maintain offline capability throughout operations'
			);

			await vectorStore.close();

		} finally {
			// Cleanup temporary directory
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});
});