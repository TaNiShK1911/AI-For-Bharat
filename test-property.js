const fc = require('fast-check');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Import the compiled DocumentationIndexer
const { DocumentationIndexer } = require('./out/indexer/DocumentationIndexer');

async function testMarkdownFileDiscovery() {
  console.log('Testing Property 2: Markdown file discovery...');
  
  try {
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
            const expectedFiles = [];
            
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
            if (JSON.stringify(sortedDiscovered) !== JSON.stringify(sortedExpected)) {
              throw new Error(`File discovery mismatch. Expected: ${JSON.stringify(sortedExpected)}, Got: ${JSON.stringify(sortedDiscovered)}`);
            }

            // Additional assertion: all discovered files should be .md files
            for (const file of discoveredFiles) {
              if (!file.toLowerCase().endsWith('.md')) {
                throw new Error(`Non-markdown file discovered: ${file}`);
              }
            }

          } finally {
            // Cleanup temporary directory
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in the design
    );
    
    console.log('✅ Property 2: Markdown file discovery - PASSED');
    return true;
  } catch (error) {
    console.log('❌ Property 2: Markdown file discovery - FAILED');
    console.error('Error:', error.message);
    return false;
  }
}

// Run the test
testMarkdownFileDiscovery().then(success => {
  process.exit(success ? 0 : 1);
});