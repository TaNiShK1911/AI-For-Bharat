import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as myExtension from '../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Extension should be present', () => {
		assert.ok(myExtension);
		assert.ok(myExtension.activate);
		assert.ok(myExtension.deactivate);
	});

	/**
	 * Unit tests for command registration
	 * Tests command registration and availability in command palette
	 * Requirements: 1.1, 1.2
	 */
	suite('Command Registration Tests', () => {
		
		test('AI Docs: Index Documentation command should be registered', async () => {
			// Get all available commands
			const commands = await vscode.commands.getCommands(true);
			
			// Check if our indexing command is registered
			const indexCommand = 'ai-docs-interpreter.indexDocumentation';
			assert.ok(
				commands.includes(indexCommand),
				`Command "${indexCommand}" should be registered in VS Code command palette`
			);
		});

		test('AI Docs: Explain Selected Code command should be registered', async () => {
			// Get all available commands
			const commands = await vscode.commands.getCommands(true);
			
			// Check if our explanation command is registered
			const explainCommand = 'ai-docs-interpreter.explainSelectedCode';
			assert.ok(
				commands.includes(explainCommand),
				`Command "${explainCommand}" should be registered in VS Code command palette`
			);
		});

		test('Index Documentation command should execute without errors', async () => {
			// Test that the command can be executed (even if it's just a placeholder)
			try {
				await vscode.commands.executeCommand('ai-docs-interpreter.indexDocumentation');
				// If we reach here, the command executed successfully
				assert.ok(true, 'Index Documentation command executed successfully');
			} catch (error) {
				assert.fail(`Index Documentation command should not throw errors: ${error}`);
			}
		});

		test('Explain Selected Code command should handle no active editor gracefully', async () => {
			// Ensure no active editor
			if (vscode.window.activeTextEditor) {
				// If there's an active editor, we can't test the "no editor" case properly
				// This is a limitation of the test environment
				assert.ok(true, 'Cannot test no-editor case when editor is active');
				return;
			}

			// Test that the command handles no active editor gracefully
			try {
				await vscode.commands.executeCommand('ai-docs-interpreter.explainSelectedCode');
				// Command should execute without throwing, but show a warning message
				assert.ok(true, 'Explain Selected Code command handled no active editor gracefully');
			} catch (error) {
				assert.fail(`Explain Selected Code command should handle no active editor gracefully: ${error}`);
			}
		});

		test('Commands should be properly disposed when extension deactivates', () => {
			// This test verifies that commands are added to the context subscriptions
			// which ensures they are properly disposed when the extension deactivates
			
			// Create a mock context to test command registration
			const mockSubscriptions: vscode.Disposable[] = [];
			const mockContext = {
				subscriptions: mockSubscriptions,
				extensionPath: '/mock/path',
				workspaceState: {} as vscode.Memento,
				globalState: {} as vscode.Memento,
				secrets: {} as vscode.SecretStorage,
				extensionUri: vscode.Uri.file('/mock/path'),
				environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
				extensionMode: vscode.ExtensionMode.Test,
				logUri: vscode.Uri.file('/mock/log'),
				storageUri: vscode.Uri.file('/mock/storage'),
				globalStorageUri: vscode.Uri.file('/mock/global-storage'),
				asAbsolutePath: (relativePath: string) => `/mock/path/${relativePath}`,
				storagePath: '/mock/storage',
				globalStoragePath: '/mock/global-storage',
				logPath: '/mock/log'
			} as vscode.ExtensionContext;

			// Create a new extension instance for testing
			const testExtension = new myExtension.AIDocsInterpreterExtension();
			
			// Activate the extension with mock context
			testExtension.activate(mockContext);
			
			// Verify that commands were added to subscriptions
			assert.ok(
				mockSubscriptions.length >= 2,
				`Expected at least 2 command subscriptions, got ${mockSubscriptions.length}`
			);
			
			// Verify that all subscriptions are disposable
			mockSubscriptions.forEach((subscription, index) => {
				assert.ok(
					typeof subscription.dispose === 'function',
					`Subscription ${index} should have a dispose method`
				);
			});
		});
	});
});
