const { DocumentationIndexer } = require('./out/indexer/DocumentationIndexer');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

async function testFileTypeFiltering() {
  console.log('Testing file type filtering and validation...');
  
  // Create temporary directory structure
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-docs-filter-test-'));
  
  try {
    const indexer = new DocumentationIndexer(tempDir);
    
    // Test 1: Valid .md file should be processed
    const validMdPath = path.join(tempDir, 'valid.md');
    await fs.writeFile(validMdPath, '# Test Header\nTest content');
    
    const validChunks = await indexer.processFile(validMdPath);
    console.log(`✅ Valid .md file processed: ${validChunks.length} chunks`);
    
    // Test 2: Invalid file extensions should be rejected
    const invalidFiles = [
      { path: path.join(tempDir, 'test.txt'), content: 'Text file content' },
      { path: path.join(tempDir, 'test.js'), content: 'console.log("hello");' },
      { path: path.join(tempDir, 'test.json'), content: '{"key": "value"}' },
      { path: path.join(tempDir, 'test.html'), content: '<h1>HTML</h1>' }
    ];
    
    for (const file of invalidFiles) {
      await fs.writeFile(file.path, file.content);
      
      try {
        await indexer.processFile(file.path);
        console.log(`❌ Should have rejected ${path.basename(file.path)}`);
        return false;
      } catch (error) {
        if (error.message.includes('Only .md files are supported')) {
          console.log(`✅ Correctly rejected ${path.basename(file.path)}`);
        } else {
          console.log(`❌ Wrong error for ${path.basename(file.path)}: ${error.message}`);
          return false;
        }
      }
    }
    
    // Test 3: Case insensitive extension check
    const upperCaseMdPath = path.join(tempDir, 'UPPER.MD');
    await fs.writeFile(upperCaseMdPath, '# Upper Case\nContent');
    
    const upperCaseChunks = await indexer.processFile(upperCaseMdPath);
    console.log(`✅ Upper case .MD file processed: ${upperCaseChunks.length} chunks`);
    
    // Test 4: Non-existent file should be rejected
    try {
      await indexer.processFile(path.join(tempDir, 'nonexistent.md'));
      console.log('❌ Should have rejected non-existent file');
      return false;
    } catch (error) {
      console.log('✅ Correctly rejected non-existent file');
    }
    
    // Test 5: Directory instead of file should be rejected
    const dirPath = path.join(tempDir, 'directory.md');
    await fs.mkdir(dirPath);
    
    try {
      await indexer.processFile(dirPath);
      console.log('❌ Should have rejected directory');
      return false;
    } catch (error) {
      if (error.message.includes('Path is not a file')) {
        console.log('✅ Correctly rejected directory');
      } else {
        console.log(`❌ Wrong error for directory: ${error.message}`);
        return false;
      }
    }
    
    // Test 6: scanMarkdownFiles should only find .md files
    const docsDir = path.join(tempDir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });
    
    // Create mixed files
    await fs.writeFile(path.join(docsDir, 'doc1.md'), '# Doc 1');
    await fs.writeFile(path.join(docsDir, 'doc2.txt'), 'Text file');
    await fs.writeFile(path.join(docsDir, 'doc3.md'), '# Doc 3');
    await fs.writeFile(path.join(docsDir, 'script.js'), 'console.log("js");');
    
    const discoveredFiles = await indexer.scanMarkdownFiles();
    const mdFiles = discoveredFiles.filter(f => f.toLowerCase().endsWith('.md'));
    
    if (discoveredFiles.length === mdFiles.length) {
      console.log(`✅ scanMarkdownFiles only found .md files: ${discoveredFiles.length} files`);
    } else {
      console.log(`❌ scanMarkdownFiles found non-.md files: ${discoveredFiles.length} total, ${mdFiles.length} .md`);
      return false;
    }
    
    console.log('✅ All file type filtering tests passed');
    return true;
    
  } finally {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

// Run the test
testFileTypeFiltering().then(success => {
  process.exit(success ? 0 : 1);
});