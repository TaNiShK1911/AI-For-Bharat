# Architecture

## Overview

The AI Docs Interpreter follows a modular architecture with clear separation of concerns.

## Core Components

### DocumentationIndexer

The DocumentationIndexer is responsible for:
- Scanning markdown files in the workspace
- Splitting content by headers into chunks
- Generating metadata for each chunk
- Coordinating with the vector store for embedding generation

### SimpleVectorStore

The SimpleVectorStore provides:
- Local storage of documentation chunks
- Hash-based embedding generation
- Similarity search functionality
- Health monitoring and diagnostics

### RAGEngine

The RAGEngine implements:
- Retrieval-augmented generation logic
- Query processing and context building
- Documentation grounding validation
- Explanation generation with citations

## Data Flow

1. **Indexing Phase**:
   - DocumentationIndexer scans markdown files
   - Content is split into chunks by headers
   - Embeddings are generated for each chunk
   - Chunks are stored in SimpleVectorStore

2. **Query Phase**:
   - User selects code in VS Code
   - CodeContextExtractor analyzes the selection
   - RAGEngine retrieves relevant documentation chunks
   - Explanation is generated with proper citations
   - Result is displayed in UI (hover or side panel)

## Configuration

The system supports various configuration options:
- File inclusion/exclusion patterns
- Similarity thresholds
- Maximum context lengths
- UI preferences