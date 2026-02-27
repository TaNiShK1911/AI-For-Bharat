const { DocumentationIndexer } = require('./out/indexer/DocumentationIndexer');
const path = require('path');

// Test the splitByHeaders functionality
function testSplitByHeaders() {
  console.log('Testing splitByHeaders functionality...');
  
  const indexer = new DocumentationIndexer('/test');
  
  // Test markdown content with various header levels
  const testContent = `# Introduction

This is the introduction section with some content.

## Getting Started

Here's how to get started with the project.

### Prerequisites

You need the following:
- Node.js
- npm

### Installation

Run these commands:
\`\`\`bash
npm install
\`\`\`

## API Reference

This section covers the API.

### Methods

#### authenticate()

This method handles authentication.

## Conclusion

Final thoughts about the project.`;

  const chunks = indexer.splitByHeaders(testContent, '/test/README.md');
  
  console.log(`Generated ${chunks.length} chunks:`);
  chunks.forEach((chunk, index) => {
    console.log(`\nChunk ${index + 1}:`);
    console.log(`  ID: ${chunk.id}`);
    console.log(`  File Path: ${chunk.filePath}`);
    console.log(`  Section Heading: ${chunk.sectionHeading}`);
    console.log(`  Header Level: ${chunk.metadata.level}`);
    console.log(`  Word Count: ${chunk.metadata.wordCount}`);
    console.log(`  Content Preview: ${chunk.content.substring(0, 100)}...`);
  });
  
  // Verify expected structure (Methods header has no content so it won't create a chunk)
  const expectedHeadings = [
    'Introduction',
    'Getting Started', 
    'Prerequisites',
    'Installation',
    'API Reference',
    'authenticate()', // Methods header is skipped because it has no content
    'Conclusion'
  ];
  
  const actualHeadings = chunks.map(chunk => chunk.sectionHeading);
  
  console.log('\nExpected headings:', expectedHeadings);
  console.log('Actual headings:', actualHeadings);
  
  if (JSON.stringify(expectedHeadings) === JSON.stringify(actualHeadings)) {
    console.log('✅ Header splitting test PASSED');
    return true;
  } else {
    console.log('❌ Header splitting test FAILED');
    return false;
  }
}

// Test edge cases
function testEdgeCases() {
  console.log('\nTesting edge cases...');
  
  const indexer = new DocumentationIndexer('/test');
  
  // Test content without headers
  const noHeaderContent = `This is just plain content without any headers.
  
It has multiple paragraphs but no markdown headers.`;
  
  const noHeaderChunks = indexer.splitByHeaders(noHeaderContent, '/test/plain.md');
  console.log(`No header content generated ${noHeaderChunks.length} chunks`);
  
  // Test empty content
  const emptyChunks = indexer.splitByHeaders('', '/test/empty.md');
  console.log(`Empty content generated ${emptyChunks.length} chunks`);
  
  // Test only headers
  const onlyHeadersContent = `# Header 1
## Header 2
### Header 3`;
  
  const onlyHeaderChunks = indexer.splitByHeaders(onlyHeadersContent, '/test/headers.md');
  console.log(`Only headers content generated ${onlyHeaderChunks.length} chunks`);
  
  return true;
}

// Run tests
const success1 = testSplitByHeaders();
const success2 = testEdgeCases();

process.exit(success1 && success2 ? 0 : 1);