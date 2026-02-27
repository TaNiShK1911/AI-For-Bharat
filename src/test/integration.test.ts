/**
 * Integration tests for AI Docs Interpreter
 * Tests complete workflow from indexing to explanation display
 * Requirements: All requirements
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { DocumentationIndexer } from '../indexer/DocumentationIndexer';
import { VectorStore } from '../storage/VectorStore';
import { RAGEngine } from '../rag/RAGEngine';
import { CodeContextExtractor } from '../context/CodeContextExtractor';
import { UIProvider } from '../ui/UIProvider';
import { ExplanationCacheManager } from '../cache/ExplanationCache';
import { VectorStoreConfig } from '../types/interfaces';

suite('Integration Test Suite', () => {
	let tempDir: string;
	let vectorStore: VectorStore;
	let documentationIndexer: DocumentationIndexer;
	let ragEngine: RAGEngine;
	let codeContextExtractor: CodeContextExtractor;
	let uiProvider: UIProvider;
	let mockContext: vscode.ExtensionContext;

	suiteSetup(async () => {
		// Create temporary directory for test workspace
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-docs-test-'));
		
		// Create mock extension context
		mockContext = {
			subscriptions: [],
			extensionPath: tempDir,
			workspaceState: {} as vscode.Memento,
			globalState: {} as vscode.Memento,
			secrets: {} as vscode.SecretStorage,
			extensionUri: vscode.Uri.file(tempDir),
			environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
			extensionMode: vscode.ExtensionMode.Test,
			logUri: vscode.Uri.file(path.join(tempDir, 'log')),
			storageUri: vscode.Uri.file(path.join(tempDir, 'storage')),
			globalStorageUri: vscode.Uri.file(path.join(tempDir, 'global-storage')),
			asAbsolutePath: (relativePath: string) => path.join(tempDir, relativePath),
			storagePath: path.join(tempDir, 'storage'),
			globalStoragePath: path.join(tempDir, 'global-storage'),
			logPath: path.join(tempDir, 'log')
		} as unknown as vscode.ExtensionContext;

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
		if (uiProvider) {
			uiProvider.dispose();
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

## Getting Started

To get started with this project, follow these steps:

1. Install dependencies
2. Run the application
3. Test the functionality

## API Reference

### calculateSum Function

The \`calculateSum\` function adds two numbers together.

**Parameters:**
- \`a\` (number): The first number
- \`b\` (number): The second number

**Returns:**
- (number): The sum of a and b

**Example:**
\`\`\`javascript
const result = calculateSum(5, 3); // Returns 8
\`\`\`

### UserManager Class

The \`UserManager\` class handles user operations.

**Methods:**
- \`createUser(name, email)\`: Creates a new user
- \`deleteUser(id)\`: Deletes a user by ID
- \`getUserById(id)\`: Retrieves a user by ID
`;

		await fs.writeFile(path.join(tempDir, 'README.md'), readmeContent);

		// Create docs directory with additional documentation
		const docsDir = path.join(tempDir, 'docs');
		await fs.mkdir(docsDir, { recursive: true });

		const apiDocsContent = `# API Documentation

## Authentication

All API endpoints require authentication using JWT tokens.

### Login Endpoint

\`POST /api/login\`

Authenticates a user and returns a JWT token.

**Request Body:**
\`\`\`json
{
  "username": "string",
  "password": "string"
}
\`\`\`

**Response:**
\`\`\`json
{
  "token": "jwt-token-string",
  "user": {
    "id": "number",
    "username": "string"
  }
}
\`\`\`

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

		// Create sample JavaScript file
		const jsContent = `/**
 * Sample JavaScript file for testing
 */

function calculateSum(a, b) {
    return a + b;
}

class UserManager {
    constructor() {
        this.users = [];
    }

    createUser(name, email) {
        const user = {
            id: Date.now(),
            name: name,
            email: email
        };
        this.users.push(user);
        return user;
    }

    deleteUser(id) {
        const index = this.users.findIndex(user => user.id === id);
        if (index !== -1) {
            this.users.splice(index, 1);
            return true;
        }
        return false;
    }

    getUserById(id) {
        return this.users.find(user => user.id === id);
    }
}

function processData(data, rules) {
    return data.map(item => {
        // Apply processing rules
        return { ...item, processed: true };
    });
}

module.exports = { calculateSum, UserManager, processData };
`;

		await fs.writeFile(path.join(tempDir, 'sample.js'), jsContent);

		// Create package.json to make it a valid JS project
		const packageJson = {
			name: 'test-project',
			version: '1.0.0',
			description: 'Test project for AI Docs Interpreter',
			main: 'sample.js'
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

		// Initialize UI provider
		uiProvider = new UIProvider(mockContext, ragEngine, codeContextExtractor);
	}

	/**
	 * Test complete workflow from indexing to explanation
	 */
	suite('End-to-End Workflow Tests', () => {
		
		test('Complete indexing workflow should work', async function() {
			this.timeout(10000); // Increase timeout for indexing

			// Index the test workspace
			await documentationIndexer.indexWorkspace();

			// Verify that documentation was indexed
			const stats = await vectorStore.getStats();
			assert.ok(stats.chunkCount > 0, 'Documentation chunks should be indexed');
			assert.ok(stats.chunkCount >= 3, `Expected at least 3 chunks, got ${stats.chunkCount}`);
		});

		test('Code explanation workflow should work for documented function', async function() {
			this.timeout(10000);

			// Ensure documentation is indexed
			const stats = await vectorStore.getStats();
			if (stats.chunkCount === 0) {
				await documentationIndexer.indexWorkspace();
			}

			// Create mock document and selection for calculateSum function
			const jsFilePath = path.join(tempDir, 'sample.js');
			const jsContent = await fs.readFile(jsFilePath, 'utf-8');
			
			// Find the calculateSum function in the content
			const functionStart = jsContent.indexOf('function calculateSum');
			const functionEnd = jsContent.indexOf('}', functionStart) + 1;
			const selectedText = jsContent.substring(functionStart, functionEnd);

			// Create mock VS Code document and selection
			const mockDocument = {
				fileName: jsFilePath,
				languageId: 'javascript',
				getText: (range?: any) => range ? selectedText : jsContent,
				lineAt: (line: number) => ({ text: jsContent.split('\n')[line] || '' }),
				lineCount: jsContent.split('\n').length
			} as vscode.TextDocument;

			const mockSelection = {
				start: { line: 0, character: functionStart },
				end: { line: 0, character: functionEnd },
				isEmpty: false,
				isSingleLine: false
			} as vscode.Selection;

			// Extract context
			const context = codeContextExtractor.extractFromSelection(mockDocument, mockSelection);
			
			// Verify context extraction
			assert.ok(context.selectedText.includes('calculateSum'), 'Selected text should contain function name');
			assert.strictEqual(context.functionName, 'calculateSum', 'Function name should be extracted');
			assert.strictEqual(context.language, 'javascript', 'Language should be detected');

			// Generate explanation
			const result = await ragEngine.explainCode(context);

			// Verify explanation result
			assert.ok(result.explanation.length > 0, 'Explanation should not be empty');
			assert.ok(result.hasRelevantDocs, 'Should find relevant documentation');
			assert.ok(result.citations.length > 0, 'Should include citations');
			assert.ok(result.confidence > 0, 'Should have positive confidence');

			// Verify explanation mentions the function
			assert.ok(
				result.explanation.toLowerCase().includes('calculatesum') || 
				result.explanation.toLowerCase().includes('sum'),
				'Explanation should mention the function or its purpose'
			);
		});

		test('Code explanation workflow should handle undocumented code', async function() {
			this.timeout(10000);

			// Create context for undocumented code
			const undocumentedCode = 'const randomVariable = Math.random() * 100;';
			
			const mockDocument = {
				fileName: path.join(tempDir, 'sample.js'),
				languageId: 'javascript',
				getText: () => undocumentedCode,
				lineAt: (line: number) => ({ text: undocumentedCode }),
				lineCount: 1
			} as vscode.TextDocument;

			const mockSelection = {
				start: { line: 0, character: 0 },
				end: { line: 0, character: undocumentedCode.length },
				isEmpty: false,
				isSingleLine: true
			} as vscode.Selection;

			// Extract context
			const context = codeContextExtractor.extractFromSelection(mockDocument, mockSelection);

			// Generate explanation
			const result = await ragEngine.explainCode(context);

			// Verify that undocumented code is handled appropriately
			assert.ok(
				result.explanation.includes('Not documented') || !result.hasRelevantDocs,
				'Should indicate when code is not documented'
			);
		});

		test('UI provider registration should work', () => {
			// Test hover provider registration
			const hoverProvider = uiProvider.registerHoverProvider();
			assert.ok(hoverProvider, 'Hover provider should be registered');
			assert.ok(typeof hoverProvider.provideHover === 'function', 'Hover provider should have provideHover method');

			// Test side panel registration
			const sidePanelProvider = uiProvider.registerSidePanel();
			assert.ok(sidePanelProvider, 'Side panel provider should be registered');
			assert.ok(typeof sidePanelProvider.resolveWebviewView === 'function', 'Side panel should have resolveWebviewView method');
		});

		test('Caching should work for identical requests', async function() {
			this.timeout(10000);

			// Ensure documentation is indexed
			const stats = await vectorStore.getStats();
			if (stats.chunkCount === 0) {
				await documentationIndexer.indexWorkspace();
			}

			// Create context for a documented function
			const jsFilePath = path.join(tempDir, 'sample.js');
			const jsContent = await fs.readFile(jsFilePath, 'utf-8');
			const functionStart = jsContent.indexOf('function calculateSum');
			const functionEnd = jsContent.indexOf('}', functionStart) + 1;
			const selectedText = jsContent.substring(functionStart, functionEnd);

			const mockDocument = {
				fileName: jsFilePath,
				languageId: 'javascript',
				getText: () => selectedText,
				lineAt: (line: number) => ({ text: selectedText.split('\n')[line] || '' }),
				lineCount: selectedText.split('\n').length
			} as vscode.TextDocument;

			const mockSelection = {
				start: { line: 0, character: 0 },
				end: { line: 0, character: selectedText.length },
				isEmpty: false,
				isSingleLine: false
			} as vscode.Selection;

			const context = codeContextExtractor.extractFromSelection(mockDocument, mockSelection);

			// Generate explanation first time
			const result1 = await ragEngine.explainCode(context);
			
			// Generate explanation second time (should use cache)
			const result2 = await ragEngine.explainCode(context);

			// Verify results are identical (indicating caching worked)
			assert.strictEqual(result1.explanation, result2.explanation, 'Cached results should be identical');
			assert.deepStrictEqual(result1.citations, result2.citations, 'Cached citations should be identical');
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
			
			// Check that at least one result mentions calculateSum
			const hasRelevantResult = results.some(chunk => 
				chunk.content.toLowerCase().includes('calculatesum') ||
				chunk.sectionHeading.toLowerCase().includes('calculatesum')
			);
			
			assert.ok(hasRelevantResult, 'Search results should include relevant documentation');
		});

		test('Error handling should work gracefully', async function() {
			this.timeout(5000);

			// Test with invalid context
			const invalidContext = {
				selectedText: '',
				fileName: 'nonexistent.js',
				imports: [],
				surroundingContext: '',
				language: 'javascript'
			};

			// Should handle empty selection gracefully
			const result = await ragEngine.explainCode(invalidContext);
			assert.ok(result, 'Should return a result even for invalid context');
			assert.ok(
				result.explanation.includes('No code selected') || 
				result.explanation.includes('Error') ||
				!result.hasRelevantDocs,
				'Should handle invalid context gracefully'
			);
		});
	});

	/**
	 * Test command execution integration
	 */
	suite('Command Integration Tests', () => {
		
		test('Index Documentation command should work end-to-end', async function() {
			this.timeout(15000);

			// Clear any existing index
			await vectorStore.clearIndex();
			
			// Verify index is empty
			let stats = await vectorStore.getStats();
			assert.strictEqual(stats.chunkCount, 0, 'Index should be empty initially');

			// Execute indexing command (simulate command execution)
			await documentationIndexer.indexWorkspace();

			// Verify documentation was indexed
			stats = await vectorStore.getStats();
			assert.ok(stats.chunkCount > 0, 'Documentation should be indexed after command execution');
		});

		test('Explain Selected Code command workflow should work', async function() {
			this.timeout(10000);

			// Ensure documentation is indexed
			const stats = await vectorStore.getStats();
			if (stats.chunkCount === 0) {
				await documentationIndexer.indexWorkspace();
			}

			// Simulate the command workflow
			const jsFilePath = path.join(tempDir, 'sample.js');
			const jsContent = await fs.readFile(jsFilePath, 'utf-8');
			const functionStart = jsContent.indexOf('class UserManager');
			const functionEnd = jsContent.indexOf('}', jsContent.indexOf('}', functionStart) + 1) + 1;
			const selectedText = jsContent.substring(functionStart, functionEnd);

			const mockDocument = {
				fileName: jsFilePath,
				languageId: 'javascript',
				getText: () => selectedText,
				lineAt: (line: number) => ({ text: selectedText.split('\n')[line] || '' }),
				lineCount: selectedText.split('\n').length
			} as vscode.TextDocument;

			const mockSelection = {
				start: { line: 0, character: 0 },
				end: { line: 0, character: selectedText.length },
				isEmpty: false,
				isSingleLine: false
			} as vscode.Selection;

			// Extract context (simulating command execution)
			const context = codeContextExtractor.extractFromSelection(mockDocument, mockSelection);
			
			// Generate explanation (simulating command execution)
			const result = await ragEngine.explainCode(context);

			// Verify the complete workflow worked
			assert.ok(result.explanation.length > 0, 'Command workflow should generate explanation');
			assert.ok(context.className === 'UserManager', 'Should extract class name correctly');
		});
	});

	/**
	 * Test component health and monitoring
	 */
	suite('Health and Monitoring Tests', () => {
		
		test('Vector store health check should work', async () => {
			const health = await vectorStore.healthCheck();
			assert.ok(health, 'Health check should return result');
			assert.ok(health.status === 'healthy' || health.status === 'unhealthy', 'Should have valid status');
		});

		test('RAG engine health check should work', async () => {
			const health = await ragEngine.healthCheck();
			assert.ok(health, 'RAG engine health check should return result');
			assert.ok(health.status === 'healthy' || health.status === 'unhealthy', 'Should have valid status');
		});

		test('Cache statistics should be available', () => {
			const cacheManager = ragEngine.getCacheManager();
			const stats = cacheManager.getStats();
			
			assert.ok(typeof stats.size === 'number', 'Cache size should be a number');
			assert.ok(typeof stats.validEntries === 'number', 'Valid entries should be a number');
			assert.ok(typeof stats.expiredEntries === 'number', 'Expired entries should be a number');
		});
	});
});