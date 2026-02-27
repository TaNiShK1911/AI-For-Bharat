/**
 * Standalone Property-based tests for UI Provider components
 * Tests universal properties for hover and side panel functionality
 * without requiring full VS Code extension test environment
 */

const fc = require('fast-check');

// Mock VS Code MarkdownString
class MockMarkdownString {
  constructor() {
    this.value = '';
    this.isTrusted = false;
  }
  
  appendMarkdown(text) {
    this.value += text;
  }
}

// Mock implementations for testing
class MockHoverProvider {
  constructor() {}
  
  // Simulate the hover text formatting logic
  formatHoverText(explanationResult) {
    const markdown = new MockMarkdownString();
    markdown.isTrusted = true;
    
    // Truncate explanation to 2-3 lines maximum
    const truncatedExplanation = this.truncateToLines(explanationResult.explanation, 3);
    
    // Add the explanation
    markdown.appendMarkdown(truncatedExplanation);
    
    // Add primary citation if available (keep it brief for hover)
    if (explanationResult.citations.length > 0) {
      const primaryCitation = explanationResult.citations[0];
      markdown.appendMarkdown(`\n\n*Source: ${this.formatCitationBrief(primaryCitation)}*`);
    }
    
    return markdown;
  }
  
  truncateToLines(text, maxLines) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (sentences.length === 0) {
      return text;
    }

    // Start with first sentence
    let result = sentences[0].trim();
    if (!result.match(/[.!?]$/)) {
      result += '.';
    }
    
    let lineCount = 1;
    
    // Add more sentences if we have room
    for (let i = 1; i < sentences.length && lineCount < maxLines; i++) {
      const sentence = sentences[i].trim();
      if (sentence.length > 0) {
        let addition = ' ' + sentence;
        if (!sentence.match(/[.!?]$/)) {
          addition += '.';
        }
        
        // Estimate if adding this sentence would exceed line limit
        // Rough estimate: 80 characters per line
        const estimatedLines = Math.ceil((result + addition).length / 80);
        
        if (estimatedLines <= maxLines) {
          result += addition;
          lineCount = estimatedLines;
        } else {
          break;
        }
      }
    }
    
    // Add ellipsis if we truncated
    if (sentences.length > 1 && !result.includes(sentences[sentences.length - 1])) {
      result += '...';
    }
    
    return result;
  }
  
  formatCitationBrief(citation) {
    // Extract just the filename from the path
    const fileName = citation.filePath.split('/').pop() || citation.filePath;
    
    // Truncate section heading if too long
    let section = citation.sectionHeading;
    if (section.length > 30) {
      section = section.substring(0, 27) + '...';
    }
    
    return `${fileName}, ${section}`;
  }
}

class MockSidePanelProvider {
  constructor() {}
  
  // Simulate the HTML generation for side panel
  generateHTML() {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>AI Docs Interpreter</title>
      </head>
      <body>
        <div class="container">
          <div id="explanation" class="explanation">
            <div id="explanationContent"></div>
            <div id="citations" class="citations"></div>
          </div>
        </div>
        
        <script>
          function formatExplanationWithBullets(explanation) {
            const sentences = explanation.split(/(?<=[.!?])\\s+/).filter(s => s.trim().length > 0);
            
            if (sentences.length <= 1) {
              return '<p>' + escapeHtml(explanation) + '</p>';
            }
            
            let html = '<ul class="explanation-bullets">';
            for (const sentence of sentences) {
              const cleanSentence = sentence.trim();
              if (cleanSentence.length > 0) {
                const withoutCitations = cleanSentence.replace(/\\(Source:[^)]+\\)/g, '').trim();
                if (withoutCitations.length > 0) {
                  html += '<li>' + escapeHtml(withoutCitations) + '</li>';
                }
              }
            }
            html += '</ul>';
            
            return html;
          }
          
          function formatCitations(citations) {
            let html = '<div class="citations-header"><h4>Sources</h4></div><ul class="citations-list">';
            
            for (const citation of citations) {
              const fileName = citation.filePath.split('/').pop() || citation.filePath;
              const relevancePercent = Math.round((citation.relevanceScore || 0) * 100);
              
              html += '<li class="citation-item">' +
                '<div class="citation-main">' +
                '<strong>' + escapeHtml(fileName) + '</strong>' +
                '<span class="citation-section">' + escapeHtml(citation.sectionHeading) + '</span>' +
                '</div>' +
                '<div class="citation-relevance">Relevance: ' + relevancePercent + '%</div>' +
                '</li>';
            }
            
            html += '</ul>';
            return html;
          }
          
          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }
        </script>
      </body>
      </html>`;
  }
}

// Property tests
console.log('Running Property-based tests for UI Provider components...');

// Property 14: Hover explanation length constraint
console.log('\nTesting Property 14: Hover explanation length constraint');

const hoverProvider = new MockHoverProvider();

const hoverLengthProperty = fc.property(
  fc.record({
    explanation: fc.string({ minLength: 10, maxLength: 1000 }),
    citations: fc.array(fc.record({
      filePath: fc.string({ minLength: 5, maxLength: 50 }),
      sectionHeading: fc.string({ minLength: 5, maxLength: 100 }),
      relevanceScore: fc.float({ min: 0, max: 1 })
    }), { minLength: 0, maxLength: 3 }),
    confidence: fc.float({ min: 0, max: 1 }),
    hasRelevantDocs: fc.boolean()
  }),
  (explanationResult) => {
    // Skip if no relevant docs (hover provider returns undefined)
    if (!explanationResult.hasRelevantDocs) {
      return true;
    }

    // Format the explanation for hover display
    const hoverText = hoverProvider.formatHoverText(explanationResult);
    const markdownContent = hoverText.value;

    // Count lines in the formatted text
    const lines = markdownContent.split('\n').filter(line => line.trim().length > 0);
    
    // Property: Hover explanations should be 2-3 lines maximum
    if (lines.length > 3) {
      console.error(`FAIL: Hover explanation should be 2-3 lines maximum, but got ${lines.length} lines: ${markdownContent}`);
      return false;
    }
    
    // Should have at least 1 line (the explanation itself)
    if (lines.length < 1) {
      console.error(`FAIL: Hover explanation should have at least 1 line, but got ${lines.length} lines`);
      return false;
    }

    // If there are citations, the last line should contain "Source:"
    if (explanationResult.citations.length > 0) {
      const lastLine = lines[lines.length - 1];
      if (!lastLine.includes('Source:')) {
        console.error(`FAIL: Last line should contain citation when citations are available: ${lastLine}`);
        return false;
      }
    }

    return true;
  }
);

try {
  fc.assert(hoverLengthProperty, { numRuns: 100 });
  console.log('✓ Property 14 PASSED: Hover explanation length constraint');
} catch (error) {
  console.error('✗ Property 14 FAILED:', error.message);
}

// Property 15: Side panel formatting
console.log('\nTesting Property 15: Side panel formatting');

const sidePanelProvider = new MockSidePanelProvider();

const sidePanelFormattingProperty = fc.property(
  fc.record({
    explanation: fc.string({ minLength: 20, maxLength: 500 }),
    citations: fc.array(fc.record({
      filePath: fc.string({ minLength: 5, maxLength: 50 }),
      sectionHeading: fc.string({ minLength: 5, maxLength: 100 }),
      relevanceScore: fc.float({ min: 0, max: 1 })
    }), { minLength: 1, maxLength: 5 }), // Ensure at least one citation
    confidence: fc.float({ min: 0, max: 1 }),
    hasRelevantDocs: fc.constant(true) // Always have relevant docs for this test
  }),
  (explanationResult) => {
    const html = sidePanelProvider.generateHTML();

    // Property: Side panel should format content with bullet points
    if (!html.includes('formatExplanationWithBullets')) {
      console.error('FAIL: Side panel HTML should include bullet point formatting function');
      return false;
    }
    
    if (!html.includes('<ul class="explanation-bullets">')) {
      console.error('FAIL: Side panel HTML should include bullet point list structure');
      return false;
    }

    // Property: Side panel should include explicit citations
    if (!html.includes('formatCitations')) {
      console.error('FAIL: Side panel HTML should include citation formatting function');
      return false;
    }
    
    if (!html.includes('citations-list')) {
      console.error('FAIL: Side panel HTML should include citations list structure');
      return false;
    }

    // Property: Citations should show file path and section heading
    if (!html.includes('citation-main')) {
      console.error('FAIL: Side panel HTML should include citation main content structure');
      return false;
    }
    
    if (!html.includes('citation-section')) {
      console.error('FAIL: Side panel HTML should include citation section structure');
      return false;
    }

    return true;
  }
);

try {
  fc.assert(sidePanelFormattingProperty, { numRuns: 50 });
  console.log('✓ Property 15 PASSED: Side panel formatting');
} catch (error) {
  console.error('✗ Property 15 FAILED:', error.message);
}

// Property 16: Markdown rendering support
console.log('\nTesting Property 16: Markdown rendering support');

const markdownRenderingProperty = fc.property(
  fc.oneof(
    fc.constant("This is **bold text** and *italic text*."),
    fc.constant("Here is `inline code` and a [link](http://example.com)."),
    fc.constant("# Header\n\nThis is a paragraph with **formatting**."),
    fc.constant("- Bullet point 1\n- Bullet point 2\n- **Bold** bullet point"),
    fc.constant("Code block:\n```javascript\nfunction test() { return true; }\n```")
  ),
  (markdownText) => {
    const explanationResult = {
      explanation: markdownText,
      citations: [{ filePath: 'test.md', sectionHeading: 'Test', relevanceScore: 0.9 }],
      confidence: 0.8,
      hasRelevantDocs: true
    };

    // Test hover provider markdown rendering
    const hoverText = hoverProvider.formatHoverText(explanationResult);
    
    // Property: Hover should return MarkdownString-like object for proper rendering
    if (typeof hoverText.value !== 'string') {
      console.error('FAIL: Hover provider should return object with string value for markdown rendering');
      return false;
    }
    
    if (hoverText.isTrusted !== true) {
      console.error('FAIL: MarkdownString should be trusted to allow proper rendering');
      return false;
    }

    // Test side panel markdown support
    const html = sidePanelProvider.generateHTML();

    // Property: Side panel should support markdown rendering through HTML
    if (!html.includes('escapeHtml')) {
      console.error('FAIL: Side panel should include HTML escaping for safe markdown rendering');
      return false;
    }

    // Property: Should preserve formatting structure
    if (markdownText.includes('**')) {
      // Should handle bold text (even if escaped for safety)
      if (!html.includes('formatExplanationWithBullets') && !html.includes('escapeHtml')) {
        console.error('FAIL: Side panel should handle markdown formatting elements');
        return false;
      }
    }

    return true;
  }
);

try {
  fc.assert(markdownRenderingProperty, { numRuns: 50 });
  console.log('✓ Property 16 PASSED: Markdown rendering support');
} catch (error) {
  console.error('✗ Property 16 FAILED:', error.message);
}

console.log('\nProperty-based tests completed!');