/**
 * RAG Engine for AI Docs Interpreter
 * 
 * Implements Retrieval-Augmented Generation for code explanations
 * using only project documentation without hallucination.
 */

import { VectorStore } from '../types/interfaces';
import { ExplanationCacheManager } from '../cache/ExplanationCache';
import { ComponentLogger, logger } from '../utils/Logger';
import { 
  RAGEngine as IRAGEngine, 
  CodeContext, 
  ExplanationResult, 
  DocumentationChunk, 
  Citation 
} from '../types/interfaces';

export class RAGEngine implements IRAGEngine {
  private vectorStore: VectorStore;
  private cacheManager: ExplanationCacheManager;
  private logger: ComponentLogger;
  private systemInstruction: string;
  private deterministicSettings: {
    temperature: number;
    seed: number;
    maxTokens: number;
    topP: number;
  };
  private requestDeduplication: Map<string, Promise<ExplanationResult>>;

  constructor(vectorStore: VectorStore, cacheManager?: ExplanationCacheManager) {
    this.vectorStore = vectorStore;
    this.cacheManager = cacheManager || new ExplanationCacheManager();
    this.logger = logger.createComponentLogger('RAGEngine');
    this.requestDeduplication = new Map();
    this.systemInstruction = "You are a code documentation assistant. Answer ONLY using the provided documentation excerpts. If the documentation doesn't contain relevant information, respond with \"Not documented.\"";
    
    // Configure deterministic output settings for LLM
    this.deterministicSettings = {
      temperature: 0.1, // Low temperature for deterministic output
      seed: 42, // Fixed seed for reproducibility
      maxTokens: 500, // Reasonable limit for explanations
      topP: 0.9 // Slightly restrict token selection for consistency
    };

    this.logger.info('RAGEngine initialized', {
      systemInstruction: this.systemInstruction.substring(0, 100),
      deterministicSettings: this.deterministicSettings
    });
  }

  /**
   * Main entry point for code explanation
   */
  async explainCode(context: CodeContext): Promise<ExplanationResult> {
    try {
      this.logger.info('Code explanation request received', {
        fileName: context.fileName,
        selectedTextLength: context.selectedText?.length,
        functionName: context.functionName,
        className: context.className,
        language: context.language
      });

      // Validate input context
      if (!context || typeof context !== 'object') {
        throw new Error('Invalid code context provided');
      }

      if (!context.selectedText || typeof context.selectedText !== 'string') {
        throw new Error('Selected text is required and must be a string');
      }

      if (context.selectedText.trim().length === 0) {
        this.logger.warn('Empty selected text provided');
        return {
          explanation: "No code selected for explanation.",
          citations: [],
          confidence: 0,
          hasRelevantDocs: false
        };
      }

      // Generate deterministic context hash for deduplication
      const contextHash = this.generateContextHash(context);
      this.logger.debug('Generated context hash', { contextHash });
      
      // Check for ongoing identical requests (deduplication)
      const ongoingRequest = this.requestDeduplication.get(contextHash);
      if (ongoingRequest) {
        this.logger.debug('Found ongoing identical request, waiting for completion');
        return await ongoingRequest;
      }

      // Create the request promise and store it for deduplication
      const requestPromise = this.processExplanationRequest(context);
      this.requestDeduplication.set(contextHash, requestPromise);

      try {
        const result = await requestPromise;
        this.logger.info('Code explanation completed', {
          hasRelevantDocs: result.hasRelevantDocs,
          confidence: result.confidence,
          citationCount: result.citations.length,
          explanationLength: result.explanation.length
        });
        return result;
      } finally {
        // Clean up the deduplication entry
        this.requestDeduplication.delete(contextHash);
      }
    } catch (error) {
      const explainError = new Error(`Code explanation failed: ${error}`);
      this.logger.error('Code explanation failed', explainError, {
        fileName: context?.fileName,
        selectedTextLength: context?.selectedText?.length
      });
      
      return this.createErrorFallbackResponse(error);
    }
  }

  /**
   * Internal method to process explanation requests with deterministic behavior
   */
  private async processExplanationRequest(context: CodeContext): Promise<ExplanationResult> {
    try {
      // Check cache first for identical code contexts
      const cachedResult = this.cacheManager.retrieve(context);
      if (cachedResult) {
        return {
          explanation: cachedResult.explanation,
          citations: cachedResult.citations,
          confidence: 1.0, // Cached results have high confidence
          hasRelevantDocs: cachedResult.citations.length > 0
        };
      }

      // Ensure deterministic behavior for identical contexts
      this.ensureDeterministicBehavior(context);
      
      // Build query string from code context (deterministic)
      const query = this.buildQueryFromContext(context);
      
      // Retrieve relevant documentation (with consistent ranking)
      const relevantDocs = await this.retrieveRelevantDocsWithConsistentRanking(query);
      
      // Apply documentation requirement enforcement
      const enforcementResult = this.enforceDocumentationRequirement(context, relevantDocs);
      if (!enforcementResult.hasValidDocumentation) {
        const result: ExplanationResult = {
          explanation: enforcementResult.fallbackResponse,
          citations: [],
          confidence: 0,
          hasRelevantDocs: false
        };
        
        // Cache the rejection result to avoid repeated processing
        this.cacheManager.store(context, result.explanation, result.citations);
        return result;
      }

      // Generate explanation using retrieved docs (deterministic)
      const explanation = await this.generateDeterministicExplanation(context, relevantDocs);
      
      // Validate explanation grounding in retrieved documents
      const isGrounded = this.validateExplanationGrounding(explanation, relevantDocs);
      if (!isGrounded) {
        const result: ExplanationResult = {
          explanation: "Not documented.",
          citations: [],
          confidence: 0,
          hasRelevantDocs: false
        };
        
        // Cache the ungrounded result
        this.cacheManager.store(context, result.explanation, result.citations);
        return result;
      }
      
      // Extract citations from the relevant docs (consistent ordering)
      const citations = this.extractCitationsWithConsistentOrdering(relevantDocs);
      
      // Calculate confidence based on relevance and doc count (deterministic)
      const confidence = this.calculateDeterministicConfidence(relevantDocs);

      const result: ExplanationResult = {
        explanation,
        citations,
        confidence,
        hasRelevantDocs: true
      };

      // Store result in cache for future identical requests
      this.cacheManager.store(context, explanation, citations);

      return result;
    } catch (error) {
      console.error('Error in processExplanationRequest:', error);
      return this.createErrorFallbackResponse(error);
    }
  }

  /**
   * Retrieve relevant documentation chunks using vector similarity search with consistent ranking
   */
  async retrieveRelevantDocsWithConsistentRanking(query: string): Promise<DocumentationChunk[]> {
    try {
      // Use vector store to find similar documentation chunks
      const topK = 5; // Retrieve top 5 most relevant chunks
      const relevantChunks = await this.vectorStore.searchSimilar(query, topK);
      
      // Ensure consistent ordering by sorting by a deterministic property
      // Sort by filePath first, then by sectionHeading for consistent results
      return relevantChunks.sort((a, b) => {
        const fileComparison = a.filePath.localeCompare(b.filePath);
        if (fileComparison !== 0) {
          return fileComparison;
        }
        return a.sectionHeading.localeCompare(b.sectionHeading);
      });
    } catch (error) {
      console.error('Error retrieving relevant docs:', error);
      return [];
    }
  }

  /**
   * Generate explanation using retrieved documentation chunks with deterministic behavior
   */
  async generateDeterministicExplanation(context: CodeContext, docs: DocumentationChunk[]): Promise<string> {
    // Check if we have documentation to work with
    if (docs.length === 0) {
      return "Not documented.";
    }

    // Sort docs deterministically for consistent processing
    const sortedDocs = [...docs].sort((a, b) => {
      const fileComparison = a.filePath.localeCompare(b.filePath);
      if (fileComparison !== 0) {
        return fileComparison;
      }
      return a.sectionHeading.localeCompare(b.sectionHeading);
    });

    // Use the improved explanation generation logic with sorted docs
    return this.generateImprovedExplanation(context, sortedDocs);
  }

  /**
   * Extract citations with consistent ordering
   */
  private extractCitationsWithConsistentOrdering(docs: DocumentationChunk[]): Citation[] {
    return docs
      .map((doc, index) => ({
        filePath: doc.filePath,
        sectionHeading: doc.sectionHeading,
        relevanceScore: Math.max(0.1, 1.0 - (index * 0.2)) // Decreasing relevance by position
      }))
      .sort((a, b) => {
        // Sort by relevance score first (descending), then by file path for consistency
        const scoreComparison = b.relevanceScore - a.relevanceScore;
        if (Math.abs(scoreComparison) > 0.001) { // Use small epsilon for float comparison
          return scoreComparison;
        }
        const fileComparison = a.filePath.localeCompare(b.filePath);
        if (fileComparison !== 0) {
          return fileComparison;
        }
        return a.sectionHeading.localeCompare(b.sectionHeading);
      });
  }

  /**
   * Calculate confidence score with deterministic behavior
   */
  private calculateDeterministicConfidence(docs: DocumentationChunk[]): number {
    if (docs.length === 0) {
      return 0;
    }
    
    // Sort docs for consistent calculation
    const sortedDocs = [...docs].sort((a, b) => {
      const fileComparison = a.filePath.localeCompare(b.filePath);
      if (fileComparison !== 0) {
        return fileComparison;
      }
      return a.sectionHeading.localeCompare(b.sectionHeading);
    });
    
    // Simple confidence calculation based on number of relevant docs
    const baseConfidence = Math.min(sortedDocs.length / 3, 1.0); // Max confidence with 3+ docs
    
    // Adjust based on content quality (word count as proxy) - use sorted docs for consistency
    const avgWordCount = sortedDocs.reduce((sum, doc) => sum + doc.metadata.wordCount, 0) / sortedDocs.length;
    const qualityMultiplier = Math.min(avgWordCount / 50, 1.2); // Bonus for longer content
    
    return Math.min(baseConfidence * qualityMultiplier, 1.0);
  }

  /**
   * Generate explanation using retrieved documentation chunks
   * This is a placeholder implementation - in production would use an LLM
   */
  async generateExplanation(context: CodeContext, docs: DocumentationChunk[]): Promise<string> {
    return this.generateDeterministicExplanation(context, docs);
  }

  /**
   * Validate that the response is grounded in the provided documentation
   */
  validateResponse(response: string, docs: DocumentationChunk[]): boolean {
    // Check if response contains "Not documented." for empty docs
    if (docs.length === 0) {
      return response.includes("Not documented.");
    }

    // Basic validation - check if response references documentation content
    const docContent = docs.map(doc => doc.content.toLowerCase()).join(' ');
    const responseWords = response.toLowerCase().split(/\s+/);
    
    // Count how many response words appear in documentation
    let matchingWords = 0;
    for (const word of responseWords) {
      if (word.length > 3 && docContent.includes(word)) {
        matchingWords++;
      }
    }
    
    // Response should have reasonable overlap with documentation
    return matchingWords / responseWords.length > 0.3;
  }

  /**
   * Validate offline operation capability
   */
  async validateOfflineOperation(): Promise<boolean> {
    try {
      // Test that vector store can operate without network
      const testQuery = "test offline operation";
      await this.vectorStore.searchSimilar(testQuery, 1);
      
      // Test that embedding generation works locally
      await this.vectorStore.generateEmbedding("test embedding generation");
      
      return true;
    } catch (error) {
      console.error('Offline operation validation failed:', error);
      return false;
    }
  }

  /**
   * Get deterministic settings for LLM integration
   */
  getDeterministicSettings() {
    return { ...this.deterministicSettings };
  }

  /**
   * Get cache manager for external cache operations
   */
  getCacheManager(): ExplanationCacheManager {
    return this.cacheManager;
  }

  /**
   * Invalidate cache entries for a specific file
   * Useful when documentation is updated
   */
  invalidateCacheForFile(filePath: string): void {
    this.cacheManager.invalidateFile(filePath);
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cacheManager.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; validEntries: number; expiredEntries: number } {
    return this.cacheManager.getStats();
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupCache(): void {
    this.cacheManager.cleanupExpired();
  }

  /**
   * Validate deterministic behavior by running identical contexts multiple times
   */
  async validateDeterministicBehavior(context: CodeContext, iterations: number = 3): Promise<boolean> {
    const results: ExplanationResult[] = [];
    
    // Clear cache to ensure we're testing actual generation, not cached results
    const originalCache = this.cacheManager;
    this.cacheManager = new ExplanationCacheManager();
    
    try {
      // Run the same context multiple times
      for (let i = 0; i < iterations; i++) {
        const result = await this.processExplanationRequest(context);
        results.push(result);
      }
      
      // Check if all results are identical
      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        const currentResult = results[i];
        
        if (firstResult.explanation !== currentResult.explanation) {
          console.warn('Deterministic validation failed: explanations differ');
          return false;
        }
        
        if (JSON.stringify(firstResult.citations) !== JSON.stringify(currentResult.citations)) {
          console.warn('Deterministic validation failed: citations differ');
          return false;
        }
        
        if (Math.abs(firstResult.confidence - currentResult.confidence) > 0.001) {
          console.warn('Deterministic validation failed: confidence differs');
          return false;
        }
        
        if (firstResult.hasRelevantDocs !== currentResult.hasRelevantDocs) {
          console.warn('Deterministic validation failed: hasRelevantDocs differs');
          return false;
        }
      }
      
      return true;
    } finally {
      // Restore original cache
      this.cacheManager = originalCache;
    }
  }

  /**
   * Get request deduplication statistics
   */
  getDeduplicationStats(): { activeRequests: number; requestHashes: string[] } {
    return {
      activeRequests: this.requestDeduplication.size,
      requestHashes: Array.from(this.requestDeduplication.keys())
    };
  }

  /**
   * Legacy method for backward compatibility
   */
  async retrieveRelevantDocs(query: string): Promise<DocumentationChunk[]> {
    return this.retrieveRelevantDocsWithConsistentRanking(query);
  }

  /**
   * Generate deterministic hash for code context to ensure consistent results
   */
  private generateContextHash(context: CodeContext): string {
    // Create a deterministic hash based on context properties
    const hashInput = [
      context.selectedText,
      context.fileName,
      context.functionName || '',
      context.className || '',
      context.imports.sort().join(','), // Sort imports for consistency
      context.language
    ].join('|');
    
    // Simple hash function for deterministic results
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  }

  /**
   * Ensure deterministic behavior for identical contexts
   */
  private ensureDeterministicBehavior(context: CodeContext): void {
    // Generate context hash for caching and consistency
    const contextHash = this.generateContextHash(context);
    
    // In production, this would be used for:
    // 1. Caching identical requests
    // 2. Setting deterministic seeds for LLM calls
    // 3. Ensuring consistent ranking of documentation chunks
    
    // For now, we ensure consistent behavior through our implementation
    // by using deterministic algorithms and fixed parameters
  }

  /**
   * Build query string from code context
   */
  private buildQueryFromContext(context: CodeContext): string {
    const parts: string[] = [];
    
    // Add function name if available (most important)
    if (context.functionName) {
      parts.push(context.functionName);
    }
    
    // Add class name if available
    if (context.className) {
      parts.push(context.className);
    }
    
    // Extract keywords from selected text (avoid code syntax)
    const selectedWords = context.selectedText
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Split camelCase: inputArray -> input Array
      .toLowerCase()
      .split(/\s+/)
      .filter(word => 
        word.length > 2 && 
        !['const', 'let', 'var', 'function', 'class', 'return', 'if', 'else', 'for', 'while', 'result'].includes(word)
      )
      .slice(0, 3); // Take first 3 meaningful words
    
    parts.push(...selectedWords);
    
    // Add relevant imports (limit to avoid noise)
    const relevantImports = context.imports
      .filter(imp => !imp.startsWith('.') && !imp.includes('node_modules'))
      .slice(0, 2); // Limit to 2 most relevant imports
    
    parts.push(...relevantImports);
    
    return parts.filter(Boolean).join(' ');
  }

  /**
   * Construct prompt with system instructions and context
   */
  private constructPrompt(context: CodeContext, docs: DocumentationChunk[]): string {
    const docContext = docs.map(doc => 
      `File: ${doc.filePath}\nSection: ${doc.sectionHeading}\nContent: ${doc.content}`
    ).join('\n\n');

    return `${this.systemInstruction}

CONTEXT: 
${docContext}

USER: Explain this code:
${context.selectedText}

Requirements:
- Use only information from the provided documentation
- Include specific citations for each claim (file path and section heading)
- Be concise and accurate
- No speculation or general programming knowledge
- Use deterministic output with low temperature (${this.deterministicSettings.temperature})
- Avoid speculative language and generic explanations

LLM Settings:
- Temperature: ${this.deterministicSettings.temperature}
- Seed: ${this.deterministicSettings.seed}
- Max Tokens: ${this.deterministicSettings.maxTokens}
- Top P: ${this.deterministicSettings.topP}`;
  }

  /**
   * Generate a detailed explanation based on documentation content with proper citations
   * This is a placeholder for actual LLM integration
   */
  private generateDetailedExplanation(context: CodeContext, docs: DocumentationChunk[]): string {
    if (docs.length === 0) {
      return "Not documented.";
    }

    let explanation = "";
    const usedCitations: Set<string> = new Set();

    // Analyze the code context to determine what type of explanation to provide
    const isFunction = context.functionName !== undefined;
    const isClass = context.className !== undefined;
    const hasImports = context.imports.length > 0;

    // Start with context-appropriate introduction
    if (isFunction) {
      explanation += `The function "${context.functionName}" `;
    } else if (isClass) {
      explanation += `The class "${context.className}" `;
    } else {
      explanation += "This code ";
    }

    // Find the most relevant documentation chunks
    const relevantChunks = this.rankDocumentationByRelevance(context, docs);
    
    // Generate explanation based on the most relevant documentation
    const primaryDoc = relevantChunks[0];
    const citationKey = `${primaryDoc.filePath}#${primaryDoc.sectionHeading}`;
    
    // Extract key information from the primary documentation
    const docSentences = primaryDoc.content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    if (docSentences.length > 0) {
      // Find sentences that might relate to the code
      const relevantSentences = this.findRelevantSentences(context, docSentences);
      
      if (relevantSentences.length > 0) {
        explanation += `is related to ${relevantSentences[0].trim().toLowerCase()}`;
        if (!relevantSentences[0].endsWith('.')) {
          explanation += '.';
        }
      } else {
        explanation += `is documented in the ${primaryDoc.sectionHeading} section.`;
      }
    } else {
      explanation += `is documented in the ${primaryDoc.sectionHeading} section.`;
    }

    // Add citation for primary source
    explanation += ` (Source: ${primaryDoc.filePath}, ${primaryDoc.sectionHeading})`;
    usedCitations.add(citationKey);

    // Add additional context from other relevant docs if available
    if (relevantChunks.length > 1) {
      const secondaryDoc = relevantChunks[1];
      const secondaryCitationKey = `${secondaryDoc.filePath}#${secondaryDoc.sectionHeading}`;
      
      if (!usedCitations.has(secondaryCitationKey)) {
        const additionalInfo = this.extractAdditionalInfo(context, secondaryDoc);
        if (additionalInfo) {
          explanation += ` Additionally, ${additionalInfo} (Source: ${secondaryDoc.filePath}, ${secondaryDoc.sectionHeading})`;
          usedCitations.add(secondaryCitationKey);
        }
      }
    }

    // Handle imports if they're mentioned in documentation
    if (hasImports && relevantChunks.some(doc => 
      context.imports.some(imp => doc.content.toLowerCase().includes(imp.toLowerCase())))) {
      const importDoc = relevantChunks.find(doc => 
        context.imports.some(imp => doc.content.toLowerCase().includes(imp.toLowerCase())));
      
      if (importDoc) {
        const importCitationKey = `${importDoc.filePath}#${importDoc.sectionHeading}`;
        if (!usedCitations.has(importCitationKey)) {
          explanation += ` The imported dependencies are documented in ${importDoc.sectionHeading}.`;
          explanation += ` (Source: ${importDoc.filePath}, ${importDoc.sectionHeading})`;
        }
      }
    }

    return explanation;
  }

  /**
   * Rank documentation chunks by relevance to the code context
   */
  private rankDocumentationByRelevance(context: CodeContext, docs: DocumentationChunk[]): DocumentationChunk[] {
    return docs.map(doc => ({
      ...doc,
      relevanceScore: this.calculateRelevanceScore(context, doc)
    })).sort((a, b) => (b as any).relevanceScore - (a as any).relevanceScore);
  }

  /**
   * Calculate relevance score between code context and documentation chunk
   */
  private calculateRelevanceScore(context: CodeContext, doc: DocumentationChunk): number {
    let score = 0;
    const docContentLower = doc.content.toLowerCase();
    const docHeadingLower = doc.sectionHeading.toLowerCase();

    // Score based on function name match
    if (context.functionName) {
      const functionNameLower = context.functionName.toLowerCase();
      if (docContentLower.includes(functionNameLower) || docHeadingLower.includes(functionNameLower)) {
        score += 10;
      }
    }

    // Score based on class name match
    if (context.className) {
      const classNameLower = context.className.toLowerCase();
      if (docContentLower.includes(classNameLower) || docHeadingLower.includes(classNameLower)) {
        score += 10;
      }
    }

    // Score based on import matches
    for (const imp of context.imports) {
      if (docContentLower.includes(imp.toLowerCase())) {
        score += 5;
      }
    }

    // Score based on selected text keywords
    const selectedWords = context.selectedText.toLowerCase().split(/\s+/)
      .filter(word => word.length > 3 && !['function', 'class', 'const', 'let', 'var'].includes(word));
    
    for (const word of selectedWords) {
      if (docContentLower.includes(word)) {
        score += 2;
      }
      if (docHeadingLower.includes(word)) {
        score += 3;
      }
    }

    // Bonus for longer, more detailed documentation
    score += Math.min(doc.metadata.wordCount / 50, 2);

    return score;
  }

  /**
   * Find sentences in documentation that are most relevant to the code context
   */
  private findRelevantSentences(context: CodeContext, sentences: string[]): string[] {
    const relevantSentences: Array<{ sentence: string; score: number }> = [];

    for (const sentence of sentences) {
      let score = 0;
      const sentenceLower = sentence.toLowerCase();

      // Check for function name
      if (context.functionName && sentenceLower.includes(context.functionName.toLowerCase())) {
        score += 10;
      }

      // Check for class name
      if (context.className && sentenceLower.includes(context.className.toLowerCase())) {
        score += 10;
      }

      // Check for import matches
      for (const imp of context.imports) {
        if (sentenceLower.includes(imp.toLowerCase())) {
          score += 5;
        }
      }

      // Check for keywords from selected text
      const selectedWords = context.selectedText.toLowerCase().split(/\s+/)
        .filter(word => word.length > 3);
      
      for (const word of selectedWords) {
        if (sentenceLower.includes(word)) {
          score += 2;
        }
      }

      if (score > 0) {
        relevantSentences.push({ sentence: sentence.trim(), score });
      }
    }

    return relevantSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, 2) // Take top 2 most relevant sentences
      .map(item => item.sentence);
  }

  /**
   * Extract additional information from secondary documentation
   */
  private extractAdditionalInfo(context: CodeContext, doc: DocumentationChunk): string | null {
    const sentences = doc.content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const relevantSentences = this.findRelevantSentences(context, sentences);
    
    if (relevantSentences.length > 0) {
      let info = relevantSentences[0].trim().toLowerCase();
      // Remove redundant starting words
      info = info.replace(/^(this|the|it|that)\s+/, '');
      return info;
    }
    
    return null;
  }

  /**
   * Enforce documentation requirement - reject requests without relevant documentation
   */
  private enforceDocumentationRequirement(context: CodeContext, docs: DocumentationChunk[]): {
    hasValidDocumentation: boolean;
    fallbackResponse: string;
  } {
    // Check if we have any documentation at all
    if (docs.length === 0) {
      return {
        hasValidDocumentation: false,
        fallbackResponse: "Not documented."
      };
    }

    // Check if documentation meets minimum relevance threshold
    const minRelevanceThreshold = 0.1; // Minimum relevance score required
    const relevantDocs = docs.filter(doc => {
      const relevanceScore = this.calculateRelevanceScore(context, doc);
      return relevanceScore >= minRelevanceThreshold;
    });

    if (relevantDocs.length === 0) {
      return {
        hasValidDocumentation: false,
        fallbackResponse: "Not documented."
      };
    }

    // Check if documentation contains sufficient content
    const minContentLength = 20; // Minimum characters in documentation content
    const substantialDocs = relevantDocs.filter(doc => 
      doc.content.trim().length >= minContentLength
    );

    if (substantialDocs.length === 0) {
      return {
        hasValidDocumentation: false,
        fallbackResponse: "Not documented."
      };
    }

    // Check for generic or placeholder documentation
    const hasGenericContent = substantialDocs.some(doc => {
      const content = doc.content.toLowerCase();
      const genericPhrases = [
        'todo', 'tbd', 'to be determined', 'placeholder', 
        'coming soon', 'under construction', 'not implemented'
      ];
      return genericPhrases.some(phrase => content.includes(phrase));
    });

    if (hasGenericContent && substantialDocs.length === 1) {
      return {
        hasValidDocumentation: false,
        fallbackResponse: "Not documented."
      };
    }

    return {
      hasValidDocumentation: true,
      fallbackResponse: ""
    };
  }

  /**
   * Validate that explanation is grounded in retrieved documents
   */
  private validateExplanationGrounding(explanation: string, docs: DocumentationChunk[]): boolean {
    // Skip validation for "Not documented." responses
    if (explanation.includes("Not documented.")) {
      return true;
    }

    // Check if explanation contains content from documentation
    const explanationLower = explanation.toLowerCase();
    const docContents = docs.map(doc => doc.content.toLowerCase()).join(' ');
    
    // Extract meaningful words from explanation (excluding common words)
    const explanationWords = explanationLower
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length > 3 && 
        !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'will', 'were', 'said', 'each', 'which', 'their', 'time', 'would', 'there', 'could', 'other', 'more', 'very', 'what', 'know', 'just', 'first', 'into', 'over', 'think', 'also', 'your', 'work', 'life', 'only', 'can', 'still', 'should', 'after', 'being', 'now', 'made', 'before', 'here', 'through', 'when', 'where', 'much', 'some', 'these', 'many', 'then', 'them', 'well', 'were'].includes(word)
      );

    if (explanationWords.length === 0) {
      return false;
    }

    // Count how many explanation words appear in documentation
    let matchingWords = 0;
    for (const word of explanationWords) {
      if (docContents.includes(word)) {
        matchingWords++;
      }
    }

    // Require at least 30% overlap between explanation and documentation
    const overlapRatio = matchingWords / explanationWords.length;
    return overlapRatio >= 0.3;
  }

  /**
   * Create error fallback response for edge cases
   */
  private createErrorFallbackResponse(error: any): ExplanationResult {
    this.logger.error('Creating error fallback response', error);
    
    // Determine appropriate fallback based on error type
    let fallbackMessage = "Error generating explanation.";
    
    if (error && typeof error === 'object') {
      const errorMessage = error.message || error.toString();
      
      if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        fallbackMessage = "Unable to access documentation. Please check your connection.";
      } else if (errorMessage.includes('storage') || errorMessage.includes('database')) {
        fallbackMessage = "Documentation storage error. Please re-index documentation.";
      } else if (errorMessage.includes('embedding') || errorMessage.includes('vector')) {
        fallbackMessage = "Embedding generation error. Please try again.";
      } else if (errorMessage.includes('timeout')) {
        fallbackMessage = "Request timeout. Please try again with a smaller code selection.";
      } else if (errorMessage.includes('memory') || errorMessage.includes('resource')) {
        fallbackMessage = "Insufficient resources. Please try again with a smaller code selection.";
      }
    }

    this.logger.warn('Using error fallback response', undefined, { fallbackMessage });

    return {
      explanation: fallbackMessage,
      citations: [],
      confidence: 0,
      hasRelevantDocs: false
    };
  }

  /**
   * Health check for RAG engine components
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    issues: string[];
    componentHealth: {
      vectorStore: any;
      cache: any;
    };
  }> {
    const issues: string[] = [];
    
    try {
      this.logger.debug('Performing RAG engine health check');

      // Check vector store health
      let vectorStoreHealth = {};
      try {
        vectorStoreHealth = await this.vectorStore.healthCheck();
        if ((vectorStoreHealth as any).status === 'unhealthy') {
          issues.push('VectorStore is unhealthy');
        }
      } catch (vectorError) {
        issues.push(`VectorStore health check failed: ${vectorError}`);
        vectorStoreHealth = { status: 'unhealthy', error: (vectorError instanceof Error ? vectorError : new Error(String(vectorError))).toString() };
      }

      // Check cache health
      let cacheHealth = {};
      try {
        const cacheStats = this.cacheManager.getStats();
        cacheHealth = {
          status: 'healthy',
          stats: cacheStats
        };
      } catch (cacheError) {
        issues.push(`Cache health check failed: ${cacheError}`);
        cacheHealth = { status: 'unhealthy', error: (cacheError instanceof Error ? cacheError : new Error(String(cacheError))).toString() };
      }

      // Check deduplication map
      if (this.requestDeduplication.size > 100) {
        issues.push('High number of ongoing requests detected');
      }

      const status = issues.length === 0 ? 'healthy' : 'unhealthy';
      
      this.logger.debug('RAG engine health check completed', { 
        status, 
        issueCount: issues.length,
        ongoingRequests: this.requestDeduplication.size
      });

      return {
        status,
        issues,
        componentHealth: {
          vectorStore: vectorStoreHealth,
          cache: cacheHealth
        }
      };
    } catch (error) {
      this.logger.error('Health check failed', error instanceof Error ? error : new Error(String(error)));
      return {
        status: 'unhealthy',
        issues: [`Health check failed: ${error}`],
        componentHealth: {
          vectorStore: { status: 'unknown' },
          cache: { status: 'unknown' }
        }
      };
    }
  }

  /**
   * Extract citations from documentation chunks with relevance scoring
   */
  private extractCitations(docs: DocumentationChunk[]): Citation[] {
    return this.extractCitationsWithConsistentOrdering(docs);
  }

  /**
   * Calculate confidence score based on retrieved documentation
   */
  private calculateConfidence(docs: DocumentationChunk[]): number {
    return this.calculateDeterministicConfidence(docs);
  }

  /**
   * Improved explanation generation with better text processing
   */
  private generateImprovedExplanation(context: CodeContext, docs: DocumentationChunk[]): string {
    if (docs.length === 0) {
      return "Not documented.";
    }

    // Simple but functional explanation generation
    let explanation = "";
    
    // Start with context-appropriate introduction
    if (context.functionName) {
      explanation += `The function "${context.functionName}" `;
    } else if (context.className) {
      explanation += `The class "${context.className}" `;
    } else {
      explanation += "This code ";
    }
    
    // Use the most relevant documentation chunk
    const primaryDoc = docs[0];
    
    // Extract meaningful content from the documentation
    const content = primaryDoc.content.trim();
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    if (sentences.length > 0) {
      // Find the most relevant sentence
      let bestSentence = sentences[0];
      
      // Look for sentences that might contain relevant information
      for (const sentence of sentences) {
        const lowerSentence = sentence.toLowerCase();
        const lowerCode = context.selectedText.toLowerCase();
        
        // Check if sentence contains words from the code
        const codeWords = lowerCode.split(/\W+/).filter(w => w.length > 2);
        const matchCount = codeWords.filter(word => lowerSentence.includes(word)).length;
        
        if (matchCount > 0) {
          bestSentence = sentence;
          break;
        }
      }
      
      explanation += `is documented as: "${bestSentence.trim()}".`;
    } else {
      explanation += `is mentioned in the ${primaryDoc.sectionHeading} section.`;
    }
    
    // Add source information
    explanation += ` (Source: ${primaryDoc.filePath} - ${primaryDoc.sectionHeading})`;
    
    return explanation;
  }
}