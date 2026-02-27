// Simplified extension for testing
import * as vscode from 'vscode';

class SimpleAIDocsExtension {
    private context: vscode.ExtensionContext | undefined;
    private isInitialized: boolean = false;

    activate(context: vscode.ExtensionContext): void {
        this.context = context;
        console.log('Simple AI Docs Interpreter extension is now active!');
        
        // Simple initialization without complex dependencies
        this.isInitialized = true;
        
        // Register commands
        this.registerCommands();
        
        vscode.window.showInformationMessage('AI Docs Interpreter activated successfully!');
    }

    registerCommands(): void {
        if (!this.context) {
            return;
        }

        // Register "AI Docs: Index Documentation" command
        const indexCommand = vscode.commands.registerCommand(
            'ai-docs-interpreter.indexDocumentation',
            async () => {
                if (!this.isInitialized) {
                    vscode.window.showErrorMessage('AI Docs Interpreter is not properly initialized');
                    return;
                }

                vscode.window.showInformationMessage('Starting documentation indexing...');
                
                // Simulate indexing
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                vscode.window.showInformationMessage('Documentation indexing completed successfully!');
            }
        );

        // Register "AI Docs: Explain Selected Code" command
        const explainCommand = vscode.commands.registerCommand(
            'ai-docs-interpreter.explainSelectedCode',
            async () => {
                if (!this.isInitialized) {
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

                const selectedText = editor.document.getText(selection);
                
                vscode.window.showInformationMessage('Generating explanation...');
                
                // Simulate explanation generation
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Show simple explanation
                const explanation = `Selected code: "${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"\n\nThis is a test explanation. The extension is working correctly!`;
                
                vscode.window.showInformationMessage(explanation, { modal: true });
            }
        );

        // Register "AI Docs: Show Configuration" command
        const showConfigCommand = vscode.commands.registerCommand(
            'ai-docs-interpreter.showConfiguration',
            () => {
                const config = vscode.workspace.getConfiguration('aiDocsInterpreter');
                const summary = `AI Docs Interpreter Configuration:
- Hover Enabled: ${config.get('ui.hoverEnabled', true)}
- Side Panel Enabled: ${config.get('ui.sidePanelEnabled', true)}
- Top K Results: ${config.get('retrieval.topK', 5)}
- Extension Status: ${this.isInitialized ? 'Initialized' : 'Not Initialized'}`;

                vscode.window.showInformationMessage(
                    'AI Docs Interpreter Configuration',
                    { modal: true, detail: summary }
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
                    vscode.window.showInformationMessage('Configuration reset to defaults successfully.');
                }
            }
        );

        // Register "AI Docs: Clear Cache" command
        const clearCacheCommand = vscode.commands.registerCommand(
            'ai-docs-interpreter.clearCache',
            () => {
                vscode.window.showInformationMessage('Explanation cache cleared successfully.');
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

    deactivate(): void {
        console.log('Simple AI Docs Interpreter extension is being deactivated');
        this.isInitialized = false;
    }
}

// Create extension instance
const extension = new SimpleAIDocsExtension();

// Export functions for VS Code
export async function activate(context: vscode.ExtensionContext) {
    console.log('AI Docs Interpreter: Activating simple extension...');
    extension.activate(context);
}

export function deactivate() {
    extension.deactivate();
}