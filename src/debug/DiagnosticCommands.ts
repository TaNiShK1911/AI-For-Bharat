/**
 * Diagnostic commands for debugging the AI Docs Interpreter
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class DiagnosticCommands {
  
  static registerDiagnosticCommands(context: vscode.ExtensionContext): void {
    // Register diagnostic command
    const diagnosticCommand = vscode.commands.registerCommand(
      'ai-docs-interpreter.runDiagnostics',
      async () => {
        await DiagnosticCommands.runComprehensiveDiagnostics();
      }
    );
    
    context.subscriptions.push(diagnosticCommand);
  }
  
  static async runComprehensiveDiagnostics(): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('AI Docs Diagnostics');
    outputChannel.show();
    
    outputChannel.appendLine('🔍 AI Docs Interpreter - Comprehensive Diagnostics');
    outputChannel.appendLine('='.repeat(60));
    
    try {
      // Check 1: Workspace Information
      outputChannel.appendLine('\n📁 Workspace Information:');
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        outputChannel.appendLine(`  Workspace Root: ${workspaceRoot}`);
        
        // Check for documentation files
        const readmePath = path.join(workspaceRoot, 'README.md');
        const docsPath = path.join(workspaceRoot, 'docs');
        
        outputChannel.appendLine(`  README.md exists: ${fs.existsSync(readmePath)}`);
        outputChannel.appendLine(`  docs/ directory exists: ${fs.existsSync(docsPath)}`);
        
        if (fs.existsSync(docsPath)) {
          try {
            const docsFiles = fs.readdirSync(docsPath).filter(f => f.endsWith('.md'));
            outputChannel.appendLine(`  Markdown files in docs/: ${docsFiles.length}`);
            docsFiles.forEach(file => outputChannel.appendLine(`    - ${file}`));
          } catch (error) {
            outputChannel.appendLine(`  Error reading docs/: ${error}`);
          }
        }
        
        // Check .aidocs directory
        const aidocsPath = path.join(workspaceRoot, '.aidocs');
        outputChannel.appendLine(`  .aidocs directory exists: ${fs.existsSync(aidocsPath)}`);
        
        if (fs.existsSync(aidocsPath)) {
          try {
            const aidocsFiles = fs.readdirSync(aidocsPath);
            outputChannel.appendLine(`  Files in .aidocs: ${aidocsFiles.length}`);
            aidocsFiles.forEach(file => {
              const filePath = path.join(aidocsPath, file);
              const stats = fs.statSync(filePath);
              outputChannel.appendLine(`    - ${file} (${stats.size} bytes)`);
            });
            
            // Check documentation-chunks.json content
            const chunksFile = path.join(aidocsPath, 'documentation-chunks.json');
            if (fs.existsSync(chunksFile)) {
              try {
                const chunksData = fs.readFileSync(chunksFile, 'utf-8');
                const chunks = JSON.parse(chunksData);
                outputChannel.appendLine(`  Chunks in storage: ${chunks.length}`);
                chunks.forEach((chunk: any, index: number) => {
                  outputChannel.appendLine(`    ${index + 1}. "${chunk.sectionHeading}" from ${chunk.filePath}`);
                  outputChannel.appendLine(`       Content length: ${chunk.content?.length || 0} chars`);
                  outputChannel.appendLine(`       Has embedding: ${chunk.embedding ? 'Yes' : 'No'}`);
                });
              } catch (error) {
                outputChannel.appendLine(`  Error reading chunks file: ${error}`);
              }
            }
          } catch (error) {
            outputChannel.appendLine(`  Error reading .aidocs: ${error}`);
          }
        }
      } else {
        outputChannel.appendLine('  No workspace folder found!');
      }
      
      // Check 2: Extension Context
      outputChannel.appendLine('\n🔧 Extension Context:');
      const extension = vscode.extensions.getExtension('ai-docs-interpreter');
      if (extension) {
        outputChannel.appendLine(`  Extension active: ${extension.isActive}`);
        outputChannel.appendLine(`  Extension path: ${extension.extensionPath}`);
      } else {
        outputChannel.appendLine('  Extension not found!');
      }
      
      // Check 3: VS Code Storage Paths
      outputChannel.appendLine('\n💾 Storage Paths:');
      const context = (global as any).aiDocsContext; // We'll set this in extension.ts
      if (context) {
        outputChannel.appendLine(`  Global storage: ${context.globalStorageUri.fsPath}`);
        outputChannel.appendLine(`  Workspace storage: ${context.workspaceState ? 'Available' : 'Not available'}`);
      } else {
        outputChannel.appendLine('  Extension context not available');
      }
      
      // Check 4: Configuration
      outputChannel.appendLine('\n⚙️ Configuration:');
      const config = vscode.workspace.getConfiguration('aiDocsInterpreter');
      const includePaths = config.get('indexing.includePaths', []);
      const excludePaths = config.get('indexing.excludePaths', []);
      outputChannel.appendLine(`  Include paths: ${JSON.stringify(includePaths)}`);
      outputChannel.appendLine(`  Exclude paths: ${JSON.stringify(excludePaths)}`);
      
      // Check 5: Test Storage Write
      outputChannel.appendLine('\n✍️ Testing Storage Write:');
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const testDir = path.join(workspaceRoot, '.aidocs');
        const testFile = path.join(testDir, 'diagnostic-test.json');
        
        try {
          // Ensure directory exists
          if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
            outputChannel.appendLine('  Created .aidocs directory');
          }
          
          // Write test file
          const testData = {
            timestamp: new Date().toISOString(),
            test: 'diagnostic write test',
            chunks: []
          };
          
          fs.writeFileSync(testFile, JSON.stringify(testData, null, 2));
          outputChannel.appendLine('  ✅ Successfully wrote test file');
          
          // Read it back
          const readData = JSON.parse(fs.readFileSync(testFile, 'utf-8'));
          outputChannel.appendLine(`  ✅ Successfully read test file: ${readData.test}`);
          
          // Clean up
          fs.unlinkSync(testFile);
          outputChannel.appendLine('  ✅ Cleaned up test file');
          
        } catch (error) {
          outputChannel.appendLine(`  ❌ Storage test failed: ${error}`);
        }
      }
      
      outputChannel.appendLine('\n✅ Diagnostics completed!');
      outputChannel.appendLine('\nNext steps:');
      outputChannel.appendLine('1. Check if .aidocs directory was created');
      outputChannel.appendLine('2. Verify documentation files exist');
      outputChannel.appendLine('3. Run "AI Docs: Index Documentation" command');
      outputChannel.appendLine('4. Check this output for any errors');
      
    } catch (error) {
      outputChannel.appendLine(`\n❌ Diagnostics failed: ${error}`);
    }
  }
}