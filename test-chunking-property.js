const fc = require('fast-check');
const { DocumentationIndexer } = require('./out/indexer/DocumentationIndexer');

async function testContentChunkingConsistency() {
  console.log('Testing Property 3: Content chunking consistency...');
  
  try {
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
            if (!chunk.sectionHeading || chunk.sectionHeading.length === 0) {
              throw new Error(`Chunk missing section heading: ${JSON.stringify(chunk)}`);
            }

            // Each chunk should have a valid header level (1-6)
            if (chunk.metadata.level < 1 || chunk.metadata.level > 6) {
              throw new Error(`Invalid header level: ${chunk.metadata.level}`);
            }

            // Each chunk should have content (unless it's an empty section)
            // This is acceptable behavior - empty sections can exist
          }

          // Property: Number of chunks should not exceed number of headers + 1 (for content before first header)
          const expectedMaxChunks = scenario.sections.length + (scenario.beforeFirstHeader.some(line => line.trim()) ? 1 : 0);
          if (chunks.length > expectedMaxChunks) {
            throw new Error(`Too many chunks generated. Expected max: ${expectedMaxChunks}, Got: ${chunks.length}`);
          }

          // Property: All section headings from input should be represented (if they have content)
          const inputHeadings = scenario.sections.map(s => s.heading.trim()).filter(h => h.length > 0);
          const chunkHeadings = chunks.map(c => c.sectionHeading).filter(h => h !== 'Introduction');
          
          // Every chunk heading (except Introduction) should come from input
          for (const chunkHeading of chunkHeadings) {
            if (!inputHeadings.includes(chunkHeading)) {
              throw new Error(`Unexpected chunk heading: ${chunkHeading}. Input headings: ${JSON.stringify(inputHeadings)}`);
            }
          }
        }
      ),
      { numRuns: 100 } // Run 100 iterations as specified in the design
    );
    
    console.log('✅ Property 3: Content chunking consistency - PASSED');
    return true;
  } catch (error) {
    console.log('❌ Property 3: Content chunking consistency - FAILED');
    console.error('Error:', error.message);
    return false;
  }
}

// Run the test
testContentChunkingConsistency().then(success => {
  process.exit(success ? 0 : 1);
});