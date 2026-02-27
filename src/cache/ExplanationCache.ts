/**
 * Explanation caching system for the AI Docs Interpreter extension
 * Provides symbol-based caching with TTL and cache invalidation
 */

import * as crypto from 'crypto';
import { ExplanationCache, CodeContext, Citation } from '../types/interfaces';

export class ExplanationCacheManager {
  private cache: Map<string, ExplanationCache> = new Map();
  private readonly defaultTTL: number = 30 * 60 * 1000; // 30 minutes in milliseconds

  /**
   * Generate a cache key based on code context
   * Uses symbol name, file name, and selected text hash for uniqueness
   */
  private generateCacheKey(context: CodeContext): string {
    const keyComponents = [
      context.fileName,
      context.functionName || '',
      context.className || '',
      context.selectedText
    ];
    
    const keyString = keyComponents.join('|');
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Check if a cache entry is still valid based on TTL
   */
  private isValidEntry(entry: ExplanationCache): boolean {
    const now = new Date();
    const expirationTime = new Date(entry.timestamp.getTime() + entry.ttl);
    return now < expirationTime;
  }

  /**
   * Store an explanation in the cache
   */
  public store(context: CodeContext, explanation: string, citations: Citation[], ttl?: number): void {
    const key = this.generateCacheKey(context);
    const cacheEntry: ExplanationCache = {
      key,
      explanation,
      citations,
      timestamp: new Date(),
      ttl: ttl || this.defaultTTL
    };

    this.cache.set(key, cacheEntry);
  }

  /**
   * Retrieve an explanation from the cache
   * Returns null if not found or expired
   */
  public retrieve(context: CodeContext): ExplanationCache | null {
    const key = this.generateCacheKey(context);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (!this.isValidEntry(entry)) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Check if an explanation exists in cache for the given context
   */
  public has(context: CodeContext): boolean {
    const key = this.generateCacheKey(context);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    if (!this.isValidEntry(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate cache entries for a specific file
   * Useful when documentation is updated
   */
  public invalidateFile(filePath: string): void {
    for (const [key, entry] of this.cache.entries()) {
      // Check if any citations reference the updated file
      const hasFileReference = entry.citations.some(citation => 
        citation.filePath === filePath
      );

      if (hasFileReference) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all expired entries from the cache
   */
  public cleanupExpired(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (!this.isValidEntry(entry)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  public clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  public getStats(): { size: number; validEntries: number; expiredEntries: number } {
    let validEntries = 0;
    let expiredEntries = 0;

    for (const entry of this.cache.values()) {
      if (this.isValidEntry(entry)) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      size: this.cache.size,
      validEntries,
      expiredEntries
    };
  }

  /**
   * Set default TTL for new cache entries
   */
  public setDefaultTTL(ttl: number): void {
    if (ttl > 0) {
      (this as any).defaultTTL = ttl;
    }
  }
}