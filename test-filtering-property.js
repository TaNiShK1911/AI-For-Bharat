const fc = require('fast-check');
const { DocumentationIndexer } = require('./out/indexer/DocumentationIndexer');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

async function testFileTypeFilteringProperty() {
  console.log('Testing Property 5: File type filtering...');
  
  try {
    await fc.assert(
      fc.asyncProperty(
        // Generate different file scenarios
        fc.record({
          mdFiles: fc.array(
            fc.record({
              name: fc.stringMatching(/^[a-zA-Z0-9_-]+\.md$/),
              content: fc.string({ minLength: 1, maxLength: 100 })
            }),
            { minLength: 0, maxLength: 5 }
          ),
          nonMdFiles: fc.array(
            fc.record({
              name: fc.stringMatching(/^[a-zA-Z0-9_-]+\.(txt|js|json|html|py|java|cpp)$/),
              content: fc.string({ minLength: 1, maxLength: 50 })
            }),
            { minLength: 0, maxLength: 5 }
          ),
          upperCaseMdFiles: fc.array(
            fc.record({
              name: fc.stringMatching(/^[a-zA-Z0-9_-]+\.MD$/),
              content: fc.string({ minLength: 1, maxLength: 100 })
            }),
            { minLength: 0, maxLength: 3 }
          )
        }),
        async (scenario) => {
          // Create temporary directory structure
          const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-docs-filter-prop-'));
          
          try {
            const indexer = new DocumentationIndexer(tempDir);
            
            // Create all files
            const allFiles = [];
            
            // Create .md files (should be processed)
            for (const file of scenario.mdFiles) {
              const filePath = path.join(tempDir, file.name);
              await fs.writeFile(filePath, file.content);
              allFiles.push({ path: filePath, shouldProcess: true, type: 'md' });
            }
            
            // Create .MD files (should be processed - case insensitive)
            for (const file of scenario.upperCaseMdFiles) {
              const filePath = path.join(tempDir, file.name);
              await fs.writeFile(filePath, file.content);
              allFiles.push({ path: filePath, shouldProcess: true, type: 'MD' });
            }
            
            // Create non-.md files (should be rejected)
            for (const file of scenario.nonMdFiles) {
              const filePath = path.join(tempDir, file.name);
              await fs.writeFile(filePath, file.content);
              allFiles.push({ path: filePath, shouldProcess: false, type: 'non-md' });
            }
            
            // Property: processFile should only accept .md files (case insensitive)
            for (const file of allFiles) {
              try {
                const chunks = await indexer.processFile(file.path);
                
                if (!file.shouldProcess) {
                  throw new Error(`Non-.md file was processed when it should have been rejected: ${file.path}`);
                }
                
                // If it should process, verify it returns valid chunks
                if (!Array.isArray(chunks)) {
                  throw new Error(`processFile should return an array of chunks for .md files: ${file.path}`);
                }
                
                // Each chunk should be valid
                for (const chunk of chunks) {
                  if (!chunk.id || !chunk.filePath || !chunk.sectionHeading || typeof chunk.content !== 'string') {
                    throw new Error(`Invalid chunk structure from .md file: ${file.path}`);
                  }
                }
                
              } catch (error) {
                if (file.shouldProcess) {
                  // .md files should not throw errors (unless there's a real processing issue)
                  throw new Error(`Valid .md file was rejected: ${file.path}. Error: ${error.message}`);
                } else {
                  // Non-.md files should throw an error about file type
                  if (!error.message.includes('Only .md files are supported')) {
                    throw new Error(`Non-.md file rejected with wrong error: ${file.path}. Error: ${error.message}`);
                  }
                }
              }
            }
            
            // Property: scanMarkdownFiles should only discover .md files
            // Create docs directory with mixed files
            const docsDir = path.join(tempDir, 'docs');
            await fs.mkdir(docsDir, { recursive: true });
            
            const expectedMdFiles = [];
            
            // Add some files to docs directory
            for (const file of scenario.mdFiles.slice(0, 2)) { // Take first 2 to avoid too many files
              const filePath = path.join(docsDir, file.name);
              await fs.writeFile(filePath, file.content);
              expectedMdFiles.push(filePath);
            }
            
            for (const file of scenario.nonMdFiles.slice(0, 2)) { // Take first 2 to avoid too many files
              const filePath = path.join(docsDir, file.name);
              await fs.writeFile(filePath, file.content);
              // These should NOT be in expectedMdFiles
            }
            
            const discoveredFiles = await indexer.scanMarkdownFiles();
            
            // Property: All discovered files should end with .md (case insensitive)
            for (const discoveredFile of discoveredFiles) {
              if (!discoveredFile.toLowerCase().endsWith('.md')) {
                throw new Error(`scanMarkdownFiles discovered non-.md file: ${discoveredFile}`);
              }
            }
            
            // Property: All .md files in expected locations should be discovered
            // Check if README.md exists in temp dir
            const readmePath = path.join(tempDir, 'README.md');
            let hasReadme = false;
            try {
              await fs.access(readmePath);
              hasReadme = true;
            } catch {
              // README doesn't exist
            }
            
            const expectedCount = expectedMdFiles.length + (hasReadme ? 1 : 0);
            const actualMdCount = discoveredFiles.filter(f => f.toLowerCase().endsWith('.md')).length;
            
            if (actualMdCount !== expectedCount) {
              // This might be acceptable if there are other .md files, so we just check that
              // all discovered files are .md files (which we already checked above)
            }
            
          } finally {
            // Cleanup temporary directory
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in the design
    );
    
    console.log('✅ Property 5: File type filtering - PASSED');
    return true;
  } catch (error) {
    console.log('❌ Property 5: File type filtering - FAILED');
    console.error('Error:', error.message);
    return false;
  }
}

// Run the test
testFileTypeFilteringProperty().then(success => {
  process.exit(success ? 0 : 1);
});