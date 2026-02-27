const fc = require('fast-check');
const { DocumentationIndexer } = require('./out/indexer/DocumentationIndexer');

async function testChunkMetadataCompleteness() {
  console.log('Testing Property 4: Chunk metadata completeness...');
  
  try {
    await fc.assert(
      fc.property(
        // Generate markdown content with various structures
        fc.record({
          sections: fc.array(
            fc.record({
              level: fc.integer({ min: 1, max: 6 }),
              heading: fc.stringMatching(/^[a-zA-Z0-9 _-]+$/),
              content: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 10 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          filePath: fc.stringMatching(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.md$/)
        }),
        (scenario) => {
          // Build markdown content
          let markdownContent = '';
          
          for (const section of scenario.sections) {
            const headerPrefix = '#'.repeat(section.level);
            markdownContent += `${headerPrefix} ${section.heading}\n`;
            markdownContent += section.content.join('\n') + '\n\n';
          }

          // Test the indexer
          const indexer = new DocumentationIndexer('/test');
          const chunks = indexer.splitByHeaders(markdownContent, `/test/${scenario.filePath}`);

          // Property: Each chunk should contain all required metadata fields
          for (const chunk of chunks) {
            // Check required top-level fields
            if (!chunk.id || typeof chunk.id !== 'string') {
              throw new Error(`Chunk missing or invalid id: ${JSON.stringify(chunk.id)}`);
            }

            if (!chunk.filePath || typeof chunk.filePath !== 'string') {
              throw new Error(`Chunk missing or invalid filePath: ${JSON.stringify(chunk.filePath)}`);
            }

            if (!chunk.sectionHeading || typeof chunk.sectionHeading !== 'string') {
              throw new Error(`Chunk missing or invalid sectionHeading: ${JSON.stringify(chunk.sectionHeading)}`);
            }

            if (typeof chunk.content !== 'string') {
              throw new Error(`Chunk missing or invalid content: ${JSON.stringify(chunk.content)}`);
            }

            // Check metadata object exists
            if (!chunk.metadata || typeof chunk.metadata !== 'object') {
              throw new Error(`Chunk missing or invalid metadata object: ${JSON.stringify(chunk.metadata)}`);
            }

            // Check required metadata fields
            if (typeof chunk.metadata.level !== 'number' || chunk.metadata.level < 1 || chunk.metadata.level > 6) {
              throw new Error(`Chunk metadata missing or invalid level: ${JSON.stringify(chunk.metadata.level)}`);
            }

            if (typeof chunk.metadata.wordCount !== 'number' || chunk.metadata.wordCount < 0) {
              throw new Error(`Chunk metadata missing or invalid wordCount: ${JSON.stringify(chunk.metadata.wordCount)}`);
            }

            if (!(chunk.metadata.lastModified instanceof Date)) {
              throw new Error(`Chunk metadata missing or invalid lastModified: ${JSON.stringify(chunk.metadata.lastModified)}`);
            }

            // Verify word count is accurate
            const actualWordCount = chunk.content.split(/\s+/).filter(word => word.length > 0).length;
            if (chunk.metadata.wordCount !== actualWordCount) {
              throw new Error(`Word count mismatch. Expected: ${actualWordCount}, Got: ${chunk.metadata.wordCount}`);
            }

            // Verify file path is relative (not absolute)
            if (chunk.filePath.startsWith('/test/')) {
              throw new Error(`File path should be relative, got: ${chunk.filePath}`);
            }

            // Verify ID is generated correctly (should be based on file path and heading)
            const baseId = `${scenario.filePath}#${chunk.sectionHeading}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const cleanBaseId = baseId.replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed-section';
            
            // ID should either be the clean base ID or have a counter suffix for uniqueness
            const isValidId = chunk.id === cleanBaseId || chunk.id.startsWith(cleanBaseId + '-');
            if (!isValidId) {
              throw new Error(`ID format incorrect. Expected base: ${cleanBaseId}, Got: ${chunk.id}`);
            }
          }

          // Property: All chunks should have unique IDs
          const ids = chunks.map(c => c.id);
          const uniqueIds = new Set(ids);
          if (ids.length !== uniqueIds.size) {
            throw new Error(`Duplicate chunk IDs found: ${JSON.stringify(ids)}`);
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in the design
    );
    
    console.log('✅ Property 4: Chunk metadata completeness - PASSED');
    return true;
  } catch (error) {
    console.log('❌ Property 4: Chunk metadata completeness - FAILED');
    console.error('Error:', error.message);
    return false;
  }
}

// Run the test
testChunkMetadataCompleteness().then(success => {
  process.exit(success ? 0 : 1);
});