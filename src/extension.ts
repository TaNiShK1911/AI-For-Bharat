// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { AIDocsExtension, VectorStoreConfig } from './types/interfaces';
import { DocumentationIndexer } from './indexer/DocumentationIndexer';
import { SimpleVectorStore } from './storage/SimpleVectorStore';
import { RAGEngine } from './rag/RAGEngine';
import { CodeContextExtractor } from './context/CodeContextExtractor';
import { UIProvider } from './ui/UIProvider';
import { ExplanationCacheManager } from './cache/ExplanationCache';
import { ConfigurationManager } from './config/ConfigurationManager';
import { DiagnosticCommands } from './debug/DiagnosticCommands';

/**
 * AI Docs Interpreter Extension
 * Provides grounded code explanations using only project documentation
 */
class AIDocsInterpreterExtension implements AIDocsExtension {
	private context: vscode.ExtensionContext | undefined;
	private documentationIndexer: DocumentationIndexer | undefined;
	private vectorStore: SimpleVectorStore | undefined;
	private ragEngine: RAGEngine | undefined;
	private codeContextExtractor: CodeContextExtractor | undefined;
	private uiProvider: UIProvider | undefined;
	private isInitialized: boolean = false;
	private configurationWatcher: vscode.Disposable | undefined;

	activate(context: vscode.ExtensionContext): void {
		this.context = context;
		
		// Make context globally available for diagnostics
		(global as any).aiDocsContext = context;
		
		console.log('AI Docs Interpreter: Activating extension...');
		console.log('AI Docs Interpreter extension is now active!');

		// Validate configuration
		const validation = ConfigurationManager.validateConfiguration();
		if (!validation.isValid) {
			console.warn('Configuration validation failed:', validation.errors);
			vscode.window.showWarningMessage(
				`AI Docs Interpreter configuration issues: ${validation.errors.join(', ')}`
			);
		}

		// Log configuration summary
		console.log(ConfigurationManager.getConfigurationSummary());

		// Watch for configuration changes
		this.setupConfigurationWatcher();

		// Initialize components asynchronously
		this.initializeComponents().then(() => {
			// Register providers after initialization
			this.registerProviders();
		}).catch(error => {
			console.error('Failed to complete extension activation:', error);
		});

		// Register commands immediately (they will check initialization status)
		this.registerCommands();
		
		// Register diagnostic commands
		DiagnosticCommands.registerDiagnosticCommands(context);
	}

	/**
	 * Initialize all core components with proper configuration
	 */
	private async initializeComponents(): Promise<void> {
		try {
			if (!this.context) {
				throw new Error('Extension context not available');
			}

			// Get workspace root
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				throw new Error('No workspace folder found');
			}
			const workspaceRoot = workspaceFolders[0].uri.fsPath;

			// Get configuration
			const config = ConfigurationManager.getConfiguration();
			const retrievalConfig = ConfigurationManager.getRetrievalConfig();

			// Configure vector store using settings
			const vectorStoreConfig: VectorStoreConfig = {
				dbPath: path.join(workspaceRoot, '.aidocs', 'vector_store.db'),
				embeddingModel: 'local-hash', // Using local hash-based embeddings
				similarityThreshold: retrievalConfig.similarityThreshold,
				maxResults: retrievalConfig.topK
			};

			// Initialize vector store using VS Code's storage
			this.vectorStore = new SimpleVectorStore(vectorStoreConfig, this.context);
			await this.vectorStore.initialize();

			// Initialize cache manager with configuration
			const cacheConfig = ConfigurationManager.getCacheConfig();
			const cacheManager = new ExplanationCacheManager();
			if (cacheConfig.enabled) {
				cacheManager.setDefaultTTL(cacheConfig.ttlMinutes * 60 * 1000); // Convert to milliseconds
			}

			// Initialize documentation indexer
			this.documentationIndexer = new DocumentationIndexer(workspaceRoot, this.vectorStore);

			// Initialize RAG engine
			this.ragEngine = new RAGEngine(this.vectorStore, cacheManager);

			// Initialize code context extractor
			this.codeContextExtractor = new CodeContextExtractor();

			// Initialize UI provider
			this.uiProvider = new UIProvider(this.context, this.ragEngine, this.codeContextExtractor);

			this.isInitialized = true;
			console.log('AI Docs Interpreter components initialized successfully');

		} catch (error) {
			console.error('Failed to initialize AI Docs Interpreter components:', error);
			vscode.window.showErrorMessage(`Failed to initialize AI Docs Interpreter: ${error}`);
		}
	}

	deactivate(): void {
		// Cleanup resources when extension is deactivated
		console.log('AI Docs Interpreter extension is being deactivated');
		
		// Clean up configuration watcher
		if (this.configurationWatcher) {
			this.configurationWatcher.dispose();
		}

		// Clean up UI provider
		if (this.uiProvider) {
			this.uiProvider.dispose();
		}

		// Close vector store connection
		if (this.vectorStore) {
			this.vectorStore.close().catch(error => {
				console.error('Error closing vector store:', error);
			});
		}

		// Clear component references
		this.documentationIndexer = undefined;
		this.vectorStore = undefined;
		this.ragEngine = undefined;
		this.codeContextExtractor = undefined;
		this.uiProvider = undefined;
		this.isInitialized = false;
	}

	registerCommands(): void {
		if (!this.context) {
			return;
		}

		// Register "AI Docs: Index Documentation" command
		const indexCommand = vscode.commands.registerCommand(
			'ai-docs-interpreter.indexDocumentation',
			async () => {
				try {
					if (!this.isInitialized || !this.documentationIndexer) {
						vscode.window.showErrorMessage('AI Docs Interpreter is not properly initialized');
						return;
					}

					vscode.window.showInformationMessage('Starting documentation indexing...');
					
					await vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: "Indexing Documentation",
						cancellable: false
					}, async (progress) => {
						progress.report({ increment: 0, message: "Scanning for markdown files..." });
						
						// Perform actual indexing
						await this.documentationIndexer!.indexWorkspace();
						
						progress.report({ increment: 100, message: "Indexing complete!" });
					});
					
					vscode.window.showInformationMessage('Documentation indexing completed successfully!');
				} catch (error) {
					console.error('Documentation indexing failed:', error);
					vscode.window.showErrorMessage(`Failed to index documentation: ${error}`);
				}
			}
		);

		// Register "AI Docs: Explain Selected Code" command
		const explainCommand = vscode.commands.registerCommand(
			'ai-docs-interpreter.explainSelectedCode',
			async () => {
				try {
					if (!this.isInitialized || !this.ragEngine || !this.codeContextExtractor || !this.uiProvider) {
						vscode.window.showErrorMessage('AI Docs Interpreter is not properly initialized');
						return;
					}

					const editor = vscode.window.activeTextEditor;
					if (!editor) {
						vscode.window.showWarningMessage('No active editor found. Please select some code first.');
						return;
					}

					const selection = editor.selection;
					if (selection.isEmpty) {
						vscode.window.showWarningMessage('No code selected. Please select some code to explain.');
						return;
					}

					// Extract code context
					const context = this.codeContextExtractor.extractFromSelection(editor.document, selection);
					
					vscode.window.showInformationMessage('Generating explanation...');
					
					// Generate explanation using RAG engine
					const result = await this.ragEngine.explainCode(context);
					
					// Display explanation in side panel
					this.uiProvider.showExplanation(result);
					
					// Also show a notification with the explanation for immediate feedback
					if (result.hasRelevantDocs) {
						const shortExplanation = result.explanation.length > 200 
							? result.explanation.substring(0, 200) + '...' 
							: result.explanation;
						vscode.window.showInformationMessage(
							`Code explanation: ${shortExplanation}`,
							'View Full Explanation'
						).then(selection => {
							if (selection === 'View Full Explanation') {
								// Show full explanation in a new document
								vscode.workspace.openTextDocument({
									content: `# Code Explanation\n\n${result.explanation}\n\n## Citations\n\n${result.citations.map(c => `- ${c.filePath}: ${c.sectionHeading} (relevance: ${c.relevanceScore.toFixed(2)})`).join('\n')}`,
									language: 'markdown'
								}).then(doc => {
									vscode.window.showTextDocument(doc);
								});
							}
						});
						vscode.window.showInformationMessage('Code explanation generated successfully!');
					} else {
						vscode.window.showWarningMessage('No relevant documentation found for the selected code.');
					}
					
				} catch (error) {
					console.error('Code explanation failed:', error);
					vscode.window.showErrorMessage(`Failed to explain code: ${error}`);
				}
			}
		);

		// Register "AI Docs: Show Configuration" command
		const showConfigCommand = vscode.commands.registerCommand(
			'ai-docs-interpreter.showConfiguration',
			() => {
				const configSummary = ConfigurationManager.getConfigurationSummary();
				vscode.window.showInformationMessage(
					'AI Docs Interpreter Configuration',
					{ modal: true, detail: configSummary }
				);
			}
		);

		// Register "AI Docs: Reset Configuration" command
		const resetConfigCommand = vscode.commands.registerCommand(
			'ai-docs-interpreter.resetConfiguration',
			async () => {
				const result = await vscode.window.showWarningMessage(
					'Are you sure you want to reset all AI Docs Interpreter settings to defaults?',
					{ modal: true },
					'Reset',
					'Cancel'
				);

				if (result === 'Reset') {
					try {
						await ConfigurationManager.resetConfiguration();
						vscode.window.showInformationMessage('Configuration reset to defaults successfully.');
					} catch (error) {
						vscode.window.showErrorMessage(`Failed to reset configuration: ${error}`);
					}
				}
			}
		);

		// Register "AI Docs: Clear Cache" command
		const clearCacheCommand = vscode.commands.registerCommand(
			'ai-docs-interpreter.clearCache',
			() => {
				if (this.ragEngine) {
					this.ragEngine.clearCache();
					vscode.window.showInformationMessage('Explanation cache cleared successfully.');
				} else {
					vscode.window.showWarningMessage('AI Docs Interpreter is not initialized.');
				}
			}
		);

		// Add commands to subscriptions for proper cleanup
		this.context.subscriptions.push(
			indexCommand, 
			explainCommand, 
			showConfigCommand, 
			resetConfigCommand, 
			clearCacheCommand
		);
	}

	registerProviders(): void {
		if (!this.context || !this.isInitialized || !this.uiProvider) {
			console.log('Cannot register providers - components not initialized');
			return;
		}

		try {
			console.log('Registering UI providers...');
			
			// Check UI configuration before registering providers
			const uiConfig = ConfigurationManager.getUIConfig();
			
			// Register hover provider if enabled
			if (uiConfig.hoverEnabled) {
				this.uiProvider.registerHoverProvider();
			}
			
			// Register side panel if enabled
			if (uiConfig.sidePanelEnabled) {
				this.uiProvider.registerSidePanel();
			}
			
			// Register dynamic updates if enabled
			if (uiConfig.dynamicUpdates) {
				this.uiProvider.registerDynamicUpdates();
			}
			
			console.log('UI providers registered successfully');
		} catch (error) {
			console.error('Failed to register providers:', error);
			vscode.window.showErrorMessage(`Failed to register UI providers: ${error}`);
		}
	}

	/**
	 * Setup configuration change watcher
	 */
	private setupConfigurationWatcher(): void {
		if (!this.context) {
			return;
		}

		this.configurationWatcher = ConfigurationManager.onConfigurationChanged(async (e) => {
			console.log('Configuration changed, updating components...');

			// Handle indexing configuration changes
			if (ConfigurationManager.hasConfigurationChanged(e, 'indexing')) {
				console.log('Indexing configuration changed');
				// Could trigger re-indexing if auto-reindex is enabled
				const indexingConfig = ConfigurationManager.getIndexingConfig();
				if (indexingConfig.autoReindex) {
					vscode.window.showInformationMessage('Indexing configuration changed. Re-indexing documentation...');
					if (this.documentationIndexer) {
						try {
							await this.documentationIndexer.indexWorkspace();
							vscode.window.showInformationMessage('Documentation re-indexing completed.');
						} catch (error) {
							vscode.window.showErrorMessage(`Re-indexing failed: ${error}`);
						}
					}
				}
			}

			// Handle retrieval configuration changes
			if (ConfigurationManager.hasConfigurationChanged(e, 'retrieval')) {
				console.log('Retrieval configuration changed');
				// Update vector store configuration
				if (this.vectorStore) {
					const retrievalConfig = ConfigurationManager.getRetrievalConfig();
					// Note: In a full implementation, we'd update the vector store config
					console.log('Updated retrieval config:', retrievalConfig);
				}
			}

			// Handle UI configuration changes
			if (ConfigurationManager.hasConfigurationChanged(e, 'ui')) {
				console.log('UI configuration changed');
				// Re-register providers with new settings
				if (this.isInitialized && this.uiProvider) {
					// Dispose existing providers
					this.uiProvider.unregisterDynamicUpdates();
					
					// Re-register with new configuration
					this.registerProviders();
				}
			}

			// Handle cache configuration changes
			if (ConfigurationManager.hasConfigurationChanged(e, 'cache')) {
				console.log('Cache configuration changed');
				const cacheConfig = ConfigurationManager.getCacheConfig();
				if (this.ragEngine) {
					const cacheManager = this.ragEngine.getCacheManager();
					if (cacheConfig.enabled) {
						cacheManager.setDefaultTTL(cacheConfig.ttlMinutes * 60 * 1000);
					} else {
						cacheManager.clear();
					}
				}
			}

			// Validate new configuration
			const validation = ConfigurationManager.validateConfiguration();
			if (!validation.isValid) {
				vscode.window.showWarningMessage(
					`Configuration validation failed: ${validation.errors.join(', ')}`
				);
			}
		});

		this.context.subscriptions.push(this.configurationWatcher);
	}

	/**
	 * Check if the current workspace is a JavaScript/Node.js project
	 */
	static async isJavaScriptProject(): Promise<boolean> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return false;
		}

		try {
			// Look for package.json files (excluding node_modules)
			const packageJsonFiles = await vscode.workspace.findFiles(
				'**/package.json', 
				'**/node_modules/**', 
				1
			);

			// Look for JavaScript/TypeScript files (excluding node_modules)
			const jsFiles = await vscode.workspace.findFiles(
				'**/*.{js,ts,jsx,tsx,mjs,cjs}', 
				'**/node_modules/**', 
				1
			);

			// Consider it a JS project if we find package.json OR JS files
			return packageJsonFiles.length > 0 || jsFiles.length > 0;
		} catch (error) {
			console.error('Error checking for JavaScript project:', error);
			return false;
		}
	}
}

// Create extension instance
const extension = new AIDocsInterpreterExtension();

// Export the class for testing
export { AIDocsInterpreterExtension };

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	console.log('AI Docs Interpreter: Activating extension...');
	
	// Activate the extension
	extension.activate(context);
}

// This method is called when your extension is deactivated
export function deactivate() {
	extension.deactivate();
}
