/**
 * Simplified Integration tests for AI Docs Interpreter
 * Tests core functionality without VS Code environment dependencies
 * Requirements: All requirements
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { DocumentationIndexer } from '../indexer/DocumentationIndexer';
import { VectorStore } from '../storage/VectorStore';
import { RAGEngine } from '../rag/RAGEngine';
import { CodeContextExtractor } from '../context/CodeContextExtractor';
import { ExplanationCacheManager } from '../cache/ExplanationCache';
import { VectorStoreConfig, CodeContext } from '../types/interfaces';

suite('Simple Integration Test Suite', () => {
	let tempDir: string;
	let vectorStore: VectorStore;
	let documentationIndexer: DocumentationIndexer;
	let ragEngine: RAGEngine;
	let codeContextExtractor: CodeContextExtractor;

	suiteSetup(async () => {
		// Create temporary directory for test workspace
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-docs-simple-test-'));
		
		// Setup test workspace with documentation
		await setupTestWorkspace();
		
		// Initialize components
		await initializeComponents();
	});

	suiteTeardown(async () => {
		// Cleanup
		if (vectorStore) {
			await vectorStore.close();
		}
		
		// Clean up temporary directory
		try {
			await fs.rm(tempDir, { recursive: true, force: true });
		} catch (error) {
			console.warn('Failed to clean up temp directory:', error);
		}
	});

	/**
	 * Setup test workspace with sample documentation and code files
	 */
	async function setupTestWorkspace(): Promise<void> {
		// Create README.md
		const readmeContent = `# Test Project

This is a test project for the AI Docs Interpreter.

## API Reference

### calculateSum Function

The \`calculateSum\` function adds two numbers together.

**Parameters:**
- \`a\` (number): The first number
- \`b\` (number): The second number

**Returns:**
- (number): The sum of a and b

### UserManager Class

The \`UserManager\` class handles user operations.

**Methods:**
- \`createUser(name, email)\`: Creates a new user
- \`deleteUser(id)\`: Deletes a user by ID
`;

		await fs.writeFile(path.join(tempDir, 'README.md'), readmeContent);

		// Create docs directory with additional documentation
		const docsDir = path.join(tempDir, 'docs');
		await fs.mkdir(docsDir, { recursive: true });

		const apiDocsContent = `# API Documentation

## Data Processing

### processData Function

The \`processData\` function transforms input data according to specified rules.

**Parameters:**
- \`data\` (array): Input data array
- \`rules\` (object): Processing rules

**Returns:**
- (array): Processed data array
`;

		await fs.writeFile(path.join(docsDir, 'api.md'), apiDocsContent);

		// Create package.json to make it a valid JS project
		const packageJson = {
			name: 'test-project',
			version: '1.0.0',
			description: 'Test project for AI Docs Interpreter',
			main: 'index.js'
		};

		await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
	}

	/**
	 * Initialize all components for testing
	 */
	async function initializeComponents(): Promise<void> {
		// Configure vector store
		const vectorStoreConfig: VectorStoreConfig = {
			dbPath: path.join(tempDir, '.aidocs', 'test_vector_store.db'),
			embeddingModel: 'local-hash',
			similarityThreshold: 0.2,
			maxResults: 5
		};

		// Initialize vector store
		vectorStore = new VectorStore(vectorStoreConfig);
		await vectorStore.initialize();

		// Initialize documentation indexer
		documentationIndexer = new DocumentationIndexer(tempDir, vectorStore);

		// Initialize cache manager
		const cacheManager = new ExplanationCacheManager();

		// Initialize RAG engine
		ragEngine = new RAGEngine(vectorStore, cacheManager);

		// Initialize code context extractor
		codeContextExtractor = new CodeContextExtractor();
	}

	/**
	 * Test complete workflow from indexing to explanation
	 */
	suite('Core Integration Tests', () => {
		
		test('Documentation indexing should work', async function() {
			this.timeout(10000);

			// Index the test workspace
			await documentationIndexer.indexWorkspace();

			// Verify that documentation was indexed
			const stats = await vectorStore.getStats();
			assert.ok(stats.chunkCount > 0, 'Documentation chunks should be indexed');
			assert.ok(stats.chunkCount >= 2, `Expected at least 2 chunks, got ${stats.chunkCount}`);
		});

		test('Vector store similarity search should work', async function() {
			this.timeout(10000);

			// Ensure documentation is indexed
			const stats = await vectorStore.getStats();
			if (stats.chunkCount === 0) {
				await documentationIndexer.indexWorkspace();
			}

			// Search for documentation about calculateSum
			const results = await vectorStore.searchSimilar('calculateSum function add numbers', 3);

			// Verify search results
			assert.ok(results.length > 0, 'Should find relevant documentation chunks');
			
			// Check that results have proper structure
			results.forEach(chunk => {
				assert.ok(chunk.id, 'Chunk should have ID');
				assert.ok(chunk.filePath, 'Chunk should have file path');
				assert.ok(chunk.sectionHeading, 'Chunk should have section heading');
				assert.ok(chunk.content, 'Chunk should have content');
			});
		});

		test('Code context extraction should work', () => {
			// Create mock code context
			const selectedText = 'function calculateSum(a, b) { return a + b; }';
			
			// Create a simple context manually (without VS Code dependencies)
			const context: CodeContext = {
				selectedText: selectedText,
				fileName: 'test.js',
				functionName: 'calculateSum',
				className: undefined,
				imports: [],
				surroundingContext: selectedText,
				language: 'javascript'
			};

			// Test query string generation
			const queryString = codeContextExtractor.buildQueryString(context);
			
			assert.ok(queryString.length > 0, 'Query string should not be empty');
			assert.ok(queryString.includes('calculateSum'), 'Query should include function name');
		});

		test('RAG engine explanation generation should work', async function() {
			this.timeout(10000);

			// Ensure documentation is indexed
			const stats = await vectorStore.getStats();
			if (stats.chunkCount === 0) {
				await documentationIndexer.indexWorkspace();
			}

			// Create context for a documented function
			const context: CodeContext = {
				selectedText: 'function calculateSum(a, b) { return a + b; }',
				fileName: 'test.js',
				functionName: 'calculateSum',
				className: undefined,
				imports: [],
				surroundingContext: 'function calculateSum(a, b) { return a + b; }',
				language: 'javascript'
			};

			// Generate explanation
			const result = await ragEngine.explainCode(context);

			// Verify explanation result
			assert.ok(result.explanation.length > 0, 'Explanation should not be empty');
			assert.ok(typeof result.hasRelevantDocs === 'boolean', 'Should have hasRelevantDocs flag');
			assert.ok(Array.isArray(result.citations), 'Should have citations array');
			assert.ok(typeof result.confidence === 'number', 'Should have confidence score');

			// If relevant docs were found, verify explanation quality
			if (result.hasRelevantDocs) {
				assert.ok(result.citations.length > 0, 'Should include citations when docs found');
				assert.ok(result.confidence > 0, 'Should have positive confidence when docs found');
			}
		});

		test('Caching should work for identical requests', async function() {
			this.timeout(10000);

			// Ensure documentation is indexed
			const stats = await vectorStore.getStats();
			if (stats.chunkCount === 0) {
				await documentationIndexer.indexWorkspace();
			}

			// Create context for a function
			const context: CodeContext = {
				selectedText: 'function calculateSum(a, b) { return a + b; }',
				fileName: 'test.js',
				functionName: 'calculateSum',
				className: undefined,
				imports: [],
				surroundingContext: 'function calculateSum(a, b) { return a + b; }',
				language: 'javascript'
			};

			// Generate explanation first time
			const result1 = await ragEngine.explainCode(context);
			
			// Generate explanation second time (should use cache)
			const result2 = await ragEngine.explainCode(context);

			// Verify results are identical (indicating caching worked)
			assert.strictEqual(result1.explanation, result2.explanation, 'Cached results should be identical');
			assert.deepStrictEqual(result1.citations, result2.citations, 'Cached citations should be identical');
		});

		test('Error handling should work gracefully', async function() {
			this.timeout(5000);

			// Test with invalid context
			const invalidContext: CodeContext = {
				selectedText: '',
				fileName: 'nonexistent.js',
				functionName: undefined,
				className: undefined,
				imports: [],
				surroundingContext: '',
				language: 'javascript'
			};

			// Should handle empty selection gracefully
			const result = await ragEngine.explainCode(invalidContext);
			assert.ok(result, 'Should return a result even for invalid context');
			assert.ok(typeof result.explanation === 'string', 'Should return string explanation');
		});

		test('Health checks should work', async () => {
			// Test vector store health
			const vectorHealth = await vectorStore.healthCheck();
			assert.ok(vectorHealth, 'Vector store health check should return result');
			assert.ok(vectorHealth.status === 'healthy' || vectorHealth.status === 'unhealthy', 'Should have valid status');

			// Test RAG engine health
			const ragHealth = await ragEngine.healthCheck();
			assert.ok(ragHealth, 'RAG engine health check should return result');
			assert.ok(ragHealth.status === 'healthy' || ragHealth.status === 'unhealthy', 'Should have valid status');
		});

		test('Cache management should work', () => {
			const cacheManager = ragEngine.getCacheManager();
			
			// Test cache statistics
			const stats = cacheManager.getStats();
			assert.ok(typeof stats.size === 'number', 'Cache size should be a number');
			assert.ok(typeof stats.validEntries === 'number', 'Valid entries should be a number');
			assert.ok(typeof stats.expiredEntries === 'number', 'Expired entries should be a number');

			// Test cache operations
			const testContext: CodeContext = {
				selectedText: 'test code',
				fileName: 'test.js',
				functionName: 'testFunction',
				className: undefined,
				imports: [],
				surroundingContext: 'test code',
				language: 'javascript'
			};

			// Store and retrieve from cache
			cacheManager.store(testContext, 'test explanation', []);
			const cached = cacheManager.retrieve(testContext);
			
			assert.ok(cached, 'Should retrieve cached result');
			assert.strictEqual(cached.explanation, 'test explanation', 'Cached explanation should match');
		});
	});

	/**
	 * Test individual component functionality
	 */
	suite('Component Tests', () => {
		
		test('Documentation indexer should scan files correctly', async function() {
			this.timeout(5000);

			const files = await documentationIndexer.scanMarkdownFiles();
			
			assert.ok(files.length > 0, 'Should find markdown files');
			assert.ok(files.some(f => f.endsWith('README.md')), 'Should find README.md');
			assert.ok(files.some(f => f.includes('docs')), 'Should find files in docs directory');
		});

		test('Documentation indexer should process files correctly', async function() {
			this.timeout(5000);

			const readmePath = path.join(tempDir, 'README.md');
			const chunks = await documentationIndexer.processFile(readmePath);
			
			assert.ok(chunks.length > 0, 'Should create documentation chunks');
			
			chunks.forEach(chunk => {
				assert.ok(chunk.id, 'Chunk should have ID');
				assert.ok(chunk.filePath, 'Chunk should have file path');
				assert.ok(chunk.sectionHeading, 'Chunk should have section heading');
				assert.ok(chunk.content, 'Chunk should have content');
				assert.ok(chunk.metadata, 'Chunk should have metadata');
				assert.ok(typeof chunk.metadata.level === 'number', 'Metadata should have level');
				assert.ok(typeof chunk.metadata.wordCount === 'number', 'Metadata should have word count');
			});
		});

		test('Vector store should generate embeddings', async function() {
			this.timeout(5000);

			const testText = 'This is a test text for embedding generation';
			const embedding = await vectorStore.generateEmbedding(testText);
			
			assert.ok(Array.isArray(embedding), 'Embedding should be an array');
			assert.ok(embedding.length > 0, 'Embedding should not be empty');
			assert.ok(embedding.every(val => typeof val === 'number'), 'Embedding should contain numbers');
		});

		test('Vector store should handle empty queries gracefully', async () => {
			const results = await vectorStore.searchSimilar('', 5);
			assert.ok(Array.isArray(results), 'Should return array for empty query');
		});
	});
});