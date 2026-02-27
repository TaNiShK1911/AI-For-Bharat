# API Reference

## DocumentationIndexer

### Constructor

```typescript
constructor(workspaceRoot: string, vectorStore?: VectorStore)
```

Creates a new DocumentationIndexer instance.

**Parameters:**
- `workspaceRoot` (string): Path to the workspace root directory
- `vectorStore` (VectorStore, optional): Vector store instance for embedding generation

### Methods

#### indexWorkspace()

```typescript
async indexWorkspace(): Promise<void>
```

Indexes the entire workspace documentation by scanning markdown files and storing chunks.

**Throws:** Error if indexing fails

#### scanMarkdownFiles()

```typescript
async scanMarkdownFiles(): Promise<string[]>
```

Scans for markdown files in the workspace.

**Returns:** Array of absolute file paths to markdown files

#### processFile(filePath)

```typescript
async processFile(filePath: string): Promise<DocumentationChunk[]>
```

Processes a single markdown file and extracts documentation chunks.

**Parameters:**
- `filePath` (string): Absolute path to the markdown file

**Returns:** Array of DocumentationChunk objects

## SimpleVectorStore

### Constructor

```typescript
constructor(config: VectorStoreConfig, context: vscode.ExtensionContext)
```

Creates a new SimpleVectorStore instance.

### Methods

#### initialize()

```typescript
async initialize(): Promise<void>
```

Initializes the vector store and loads existing chunks.

#### storeChunks(chunks)

```typescript
async storeChunks(chunks: DocumentationChunk[]): Promise<void>
```

Stores documentation chunks with embeddings.

#### searchSimilar(query, topK)

```typescript
async searchSimilar(query: string, topK: number): Promise<DocumentationChunk[]>
```

Performs similarity search and returns the most relevant chunks.

## RAGEngine

### Constructor

```typescript
constructor(vectorStore: VectorStore, cacheManager?: ExplanationCacheManager)
```

### Methods

#### explainCode(context)

```typescript
async explainCode(context: CodeContext): Promise<ExplanationResult>
```

Generates a grounded explanation for the given code context.