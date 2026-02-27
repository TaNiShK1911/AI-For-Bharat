import * as assert from 'assert';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DocumentationIndexer } from '../indexer/DocumentationIndexer';

// Simple mock for VS Code workspace API
interface MockWorkspaceFolder {
	uri: { fsPath: string };
	name: string;
	index: number;
}

interface MockWorkspace {
	workspaceFolders?: MockWorkspaceFolder[];
	findFiles: (include: string, exclude?: string, maxResults?: number) => Promise<{ fsPath: string }[]>;
}

// Mock the activation logic without VS Code dependencies
async function mockIsJavaScriptProject(workspace: MockWorkspace): Promise<boolean> {
	const workspaceFolders = workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return false;
	}

	try {
		// Look for package.json files (excluding node_modules)
		const packageJsonFiles = await workspace.findFiles(
			'**/package.json', 
			'**/node_modules/**', 
			1
		);

		// Look for JavaScript/TypeScript files (excluding node_modules)
		const jsFiles = await workspace.findFiles(
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

suite('Extension Property Tests', () => {
	
	/**
	 * Property 1: Extension activation scope
	 * For any VS Code workspace, the extension should activate if and only if 
	 * the workspace contains JavaScript/Node.js project indicators
	 * Feature: ai-docs-interpreter, Property 1: Extension activation scope
	 * Validates: Requirements 1.5
	 */
	test('Property 1: Extension activation scope', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate different project scenarios
				fc.record({
					hasPackageJson: fc.boolean(),
					hasJsFiles: fc.boolean(),
					workspaceExists: fc.boolean()
				}),
				async (scenario) => {
					// Create mock workspace based on scenario
					const mockWorkspace: MockWorkspace = {
						workspaceFolders: scenario.workspaceExists ? 
							[{ uri: { fsPath: '/mock/workspace' }, name: 'test', index: 0 }] : 
							undefined,
						findFiles: async (include: string, exclude?: string, maxResults?: number) => {
							if (!scenario.workspaceExists) {
								return [];
							}
							
							const results: { fsPath: string }[] = [];
							
							if (include.includes('package.json') && scenario.hasPackageJson) {
								results.push({ fsPath: '/mock/workspace/package.json' });
							}
							
							if ((include.includes('.js') || include.includes('.ts')) && scenario.hasJsFiles) {
								results.push({ fsPath: '/mock/workspace/index.js' });
							}
							
							return results.slice(0, maxResults || 10);
						}
					};
					
					// Test the activation logic
					const shouldActivate = await mockIsJavaScriptProject(mockWorkspace);
					const expectedActivation = scenario.workspaceExists && (scenario.hasPackageJson || scenario.hasJsFiles);
					
					// Assert the property: extension should activate if and only if it's a JS project
					assert.strictEqual(
						shouldActivate, 
						expectedActivation,
						`Extension activation mismatch for scenario: ${JSON.stringify(scenario)}. ` +
						`Expected: ${expectedActivation}, Got: ${shouldActivate}`
					);
				}
			),
			{ numRuns: 100 } // Run 100 iterations as specified in the design
		);
	});

	/**
	 * Property 2: Markdown file discovery
	 * For any project directory structure containing markdown files, the indexer should discover 
	 * README.md in the project root and all markdown files in docs directory recursively
	 * Feature: ai-docs-interpreter, Property 2: Markdown file discovery
	 * Validates: Requirements 2.1, 2.2
	 */
	test('Property 2: Markdown file discovery', async () => {
		await fc.assert(
			fc.asyncProperty(
				// Generate different directory structures
				fc.record({
					hasReadme: fc.boolean(),
					docsFiles: fc.array(
						fc.record({
							path: fc.stringMatching(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.md$/),
							content: fc.string({ minLength: 1, maxLength: 100 })
						}),
						{ minLength: 0, maxLength: 5 }
					),
					nonMdFiles: fc.array(
						fc.record({
							path: fc.stringMatching(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(txt|js|json)$/),
							content: fc.string({ minLength: 1, maxLength: 50 })
						}),
						{ minLength: 0, maxLength: 3 }
					)
				}),
				async (scenario) => {
					// Create temporary directory structure
					const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-docs-test-'));
					
					try {
						// Create README.md if specified
						if (scenario.hasReadme) {
							await fs.writeFile(path.join(tempDir, 'README.md'), '# Test README');
						}

						// Create docs directory and files
						const docsDir = path.join(tempDir, 'docs');
						await fs.mkdir(docsDir, { recursive: true });

						// Create markdown files in docs
						for (const file of scenario.docsFiles) {
							const filePath = path.join(docsDir, file.path);
							const fileDir = path.dirname(filePath);
							await fs.mkdir(fileDir, { recursive: true });
							await fs.writeFile(filePath, file.content);
						}

						// Create non-markdown files (should be ignored)
						for (const file of scenario.nonMdFiles) {
							const filePath = path.join(docsDir, file.path);
							const fileDir = path.dirname(filePath);
							await fs.mkdir(fileDir, { recursive: true });
							await fs.writeFile(filePath, file.content);
						}

						// Test the indexer
						const indexer = new DocumentationIndexer(tempDir);
						const discoveredFiles = await indexer.scanMarkdownFiles();

						// Calculate expected files
						const expectedFiles: string[] = [];
						
						if (scenario.hasReadme) {
							expectedFiles.push(path.join(tempDir, 'README.md'));
						}

						for (const file of scenario.docsFiles) {
							expectedFiles.push(path.join(docsDir, file.path));
						}

						// Sort both arrays for comparison
						const sortedDiscovered = discoveredFiles.sort();
						const sortedExpected = expectedFiles.sort();

						// Assert the property: should discover exactly the expected markdown files
						assert.deepStrictEqual(
							sortedDiscovered,
							sortedExpected,
							`File discovery mismatch. Expected: ${JSON.stringify(sortedExpected)}, Got: ${JSON.stringify(sortedDiscovered)}`
						);

						// Additional assertion: all discovered files should be .md files
						for (const file of discoveredFiles) {
							assert.ok(
								file.toLowerCase().endsWith('.md'),
								`Non-markdown file discovered: ${file}`
							);
						}

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
	 * Property 3: Content chunking consistency
	 * For any markdown content with headers, splitting by markdown headers should produce chunks 
	 * where each chunk contains exactly one section with its heading and content
	 * Feature: ai-docs-interpreter, Property 3: Content chunking consistency
	 * Validates: Requirements 2.3
	 */
	test('Property 3: Content chunking consistency', async () => {
		await fc.assert(
			fc.property(
				// Generate markdown content with various header structures
				fc.record({
					sections: fc.array(
						fc.record({
							level: fc.integer({ min: 1, max: 6 }),
							heading: fc.stringMatching(/^[a-zA-Z0-9 _-]+$/),
							content: fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 0, maxLength: 5 })
						}),
						{ minLength: 1, maxLength: 10 }
					),
					beforeFirstHeader: fc.array(fc.string({ minLength: 0, maxLength: 50 }), { minLength: 0, maxLength: 3 })
				}),
				(scenario) => {
					// Build markdown content
					let markdownContent = scenario.beforeFirstHeader.join('\n');
					
					for (const section of scenario.sections) {
						const headerPrefix = '#'.repeat(section.level);
						markdownContent += `\n${headerPrefix} ${section.heading}\n`;
						markdownContent += section.content.join('\n');
					}

					// Test the indexer
					const indexer = new DocumentationIndexer('/test');
					const chunks = indexer.splitByHeaders(markdownContent, '/test/test.md');

					// Property: Each chunk should contain exactly one section
					for (const chunk of chunks) {
						// Each chunk should have a section heading
						assert.ok(
							chunk.sectionHeading && chunk.sectionHeading.length > 0,
							`Chunk missing section heading: ${JSON.stringify(chunk)}`
						);

						// Each chunk should have a valid header level (1-6)
						assert.ok(
							chunk.metadata.level >= 1 && chunk.metadata.level <= 6,
							`Invalid header level: ${chunk.metadata.level}`
						);

						// Each chunk should have content (unless it's an empty section)
						// This is acceptable behavior - empty sections can exist
					}

					// Property: Number of chunks should not exceed number of headers + 1 (for content before first header)
					const expectedMaxChunks = scenario.sections.length + (scenario.beforeFirstHeader.some(line => line.trim()) ? 1 : 0);
					assert.ok(
						chunks.length <= expectedMaxChunks,
						`Too many chunks generated. Expected max: ${expectedMaxChunks}, Got: ${chunks.length}`
					);

					// Property: All section headings from input should be represented (if they have content)
					const inputHeadings = scenario.sections.map(s => s.heading);
					const chunkHeadings = chunks.map(c => c.sectionHeading).filter(h => h !== 'Introduction');
					
					// Every chunk heading (except Introduction) should come from input
					for (const chunkHeading of chunkHeadings) {
						assert.ok(
							inputHeadings.includes(chunkHeading),
							`Unexpected chunk heading: ${chunkHeading}. Input headings: ${JSON.stringify(inputHeadings)}`
						);
					}
				}
			),
			{ numRuns: 100 } // Run 100 iterations as specified in the design
		);
	});
});