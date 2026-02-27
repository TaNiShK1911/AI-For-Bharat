# AI Docs Interpreter

AI-powered documentation interpreter that explains code using only project documentation.

## Overview

This VS Code extension provides grounded code explanations by indexing your project's markdown documentation and using Retrieval-Augmented Generation (RAG) to answer questions about your code strictly based on the documentation.

## Features

- **Documentation Indexing**: Automatically scans README.md and docs/**/*.md files
- **Code Explanation**: Explains selected code using only project documentation
- **Local-First**: All processing happens locally without internet access
- **Grounded Responses**: Strict adherence to project documentation, no hallucination
- **Multiple UI Options**: Hover tooltips and detailed side panel explanations

## Commands

- `AI Docs: Index Documentation` - Scan and index project documentation
- `AI Docs: Explain Selected Code` - Explain the currently selected code

## Project Structure

```
src/
├── extension.ts                 // Main extension entry point
├── indexer/                     // Documentation scanning and processing
├── storage/                     // Local vector storage and similarity search
├── context/                     // Code analysis and context extraction
├── rag/                         // Retrieval-augmented generation logic
├── ui/                          // UI components (hover, side panel)
├── cache/                       // Performance caching system
└── types/                       // Shared TypeScript interfaces
```

## Development

### Prerequisites

- Node.js 18+
- VS Code

### Setup

1. Clone the repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to launch the extension in a new VS Code window

### Testing

```bash
npm test
```

## Requirements

- JavaScript/TypeScript/Node.js projects
- Markdown documentation in README.md or docs/ folder

## License

MIT