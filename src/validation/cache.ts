/**
 * High-performance caching system for validation results
 * Uses hash-based invalidation and LRU eviction for memory efficiency
 */

import { createHash } from 'crypto';
import { ClaudeCodeConfiguration, ValidationResult } from '../types';

/**
 * Cache entry with metadata for invalidation and eviction
 */
interface CacheEntry {
  /** Validation result */
  result: ValidationResult;
  /** Hash of the configuration */
  configHash: string;
  /** Timestamp when entry was created */
  createdAt: number;
  /** Number of times this entry has been accessed */
  accessCount: number;
  /** Last access timestamp */
  lastAccessedAt: number;
  /** Size estimate in bytes */
  sizeBytes: number;
}

/**
 * Cache statistics for monitoring and optimization
 */
export interface CacheStats {
  /** Total number of cache hits */
  hits: number;
  /** Total number of cache misses */
  misses: number;
  /** Current number of entries in cache */
  entries: number;
  /** Total memory used by cache in bytes */
  memoryUsed: number;
  /** Average validation time for cached results */
  avgCacheRetrievalTime: number;
  /** Average validation time for uncached results */
  avgValidationTime: number;
  /** Cache hit rate percentage */
  hitRate: number;
}

/**
 * High-performance validation cache with LRU eviction
 */
export class ValidationCache {
  private cache: Map<string, CacheEntry>;
  private readonly maxEntries: number;
  private readonly maxMemoryMB: number;
  private readonly ttlMs: number;
  private stats: CacheStats;
  private cacheRetrievalTimes: number[] = [];
  private validationTimes: number[] = [];

  /**
   * Initialize the validation cache
   * @param maxEntries Maximum number of cache entries (default: 1000)
   * @param maxMemoryMB Maximum memory usage in MB (default: 50)
   * @param ttlMs Time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(
    maxEntries: number = 1000,
    maxMemoryMB: number = 50,
    ttlMs: number = 5 * 60 * 1000
  ) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
    this.maxMemoryMB = maxMemoryMB;
    this.ttlMs = ttlMs;
    this.stats = {
      hits: 0,
      misses: 0,
      entries: 0,
      memoryUsed: 0,
      avgCacheRetrievalTime: 0,
      avgValidationTime: 0,
      hitRate: 0
    };
  }

  /**
   * Generate a stable hash for a configuration
   * @param config The configuration to hash
   * @returns Hex string hash
   */
  public generateHash(config: ClaudeCodeConfiguration): string {
    // Normalize the configuration for consistent hashing
    const normalized = this.normalizeConfig(config);
    const hash = createHash('sha256');
    hash.update(JSON.stringify(normalized));
    return hash.digest('hex');
  }

  /**
   * Normalize configuration for consistent hashing
   * Sorts arrays and object keys to ensure stable hashes
   */
  private normalizeConfig(config: ClaudeCodeConfiguration): any {
    if (Array.isArray(config)) {
      return config.slice().sort().map(item => this.normalizeConfig(item));
    }
    
    if (config && typeof config === 'object') {
      const normalized: any = {};
      const keys = Object.keys(config).sort();
      
      for (const key of keys) {
        // Skip metadata fields that don't affect validation
        if (key === 'metadata' || key === 'timestamp') {
          continue;
        }
        normalized[key] = this.normalizeConfig((config as any)[key]);
      }
      
      return normalized;
    }
    
    return config;
  }

  /**
   * Get a validation result from cache if available
   * @param configHash Hash of the configuration
   * @returns Cached validation result or null
   */
  public get(configHash: string): ValidationResult | null {
    const startTime = performance.now();
    const entry = this.cache.get(configHash);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.createdAt > this.ttlMs) {
      this.cache.delete(configHash);
      this.stats.entries--;
      this.stats.memoryUsed -= entry.sizeBytes;
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessedAt = now;
    
    // Move to end (most recently used)
    this.cache.delete(configHash);
    this.cache.set(configHash, entry);
    
    this.stats.hits++;
    this.updateHitRate();
    
    const retrievalTime = performance.now() - startTime;
    this.recordCacheRetrievalTime(retrievalTime);
    
    return { ...entry.result };
  }

  /**
   * Store a validation result in cache
   * @param configHash Hash of the configuration
   * @param result Validation result to cache
   * @param validationTime Time taken to validate (for stats)
   */
  public set(
    configHash: string,
    result: ValidationResult,
    validationTime?: number
  ): void {
    const sizeBytes = this.estimateSize(result);
    
    // Check memory limit
    if (this.stats.memoryUsed + sizeBytes > this.maxMemoryMB * 1024 * 1024) {
      this.evictLRU();
    }
    
    // Check entry limit
    if (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }
    
    const entry: CacheEntry = {
      result: { ...result },
      configHash,
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: Date.now(),
      sizeBytes
    };
    
    // If replacing existing entry, update memory stats
    const existing = this.cache.get(configHash);
    if (existing) {
      this.stats.memoryUsed -= existing.sizeBytes;
      this.stats.entries--;
    }
    
    this.cache.set(configHash, entry);
    this.stats.entries++;
    this.stats.memoryUsed += sizeBytes;
    
    if (validationTime !== undefined) {
      this.recordValidationTime(validationTime);
    }
  }

  /**
   * Evict least recently used entries
   */
  private evictLRU(): void {
    if (this.cache.size === 0) return;
    
    // Find least recently used entry
    let lruKey: string | null = null;
    let lruTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < lruTime) {
        lruTime = entry.lastAccessedAt;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      const entry = this.cache.get(lruKey)!;
      this.cache.delete(lruKey);
      this.stats.entries--;
      this.stats.memoryUsed -= entry.sizeBytes;
    }
  }

  /**
   * Estimate the size of a validation result in bytes
   */
  private estimateSize(result: ValidationResult): number {
    // Rough estimation based on JSON string length
    // Each character is approximately 2 bytes in memory
    return JSON.stringify(result).length * 2;
  }

  /**
   * Clear the entire cache
   */
  public clear(): void {
    this.cache.clear();
    this.stats.entries = 0;
    this.stats.memoryUsed = 0;
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.hitRate = 0;
    this.cacheRetrievalTimes = [];
    this.validationTimes = [];
  }

  /**
   * Invalidate cache entries matching a pattern
   * @param pattern Glob pattern or regex to match config hashes
   */
  public invalidate(pattern: string | RegExp): number {
    let invalidated = 0;
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern) 
      : pattern;
    
    for (const [key, entry] of this.cache.entries()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.stats.entries--;
        this.stats.memoryUsed -= entry.sizeBytes;
        invalidated++;
      }
    }
    
    return invalidated;
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Update hit rate statistic
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 
      ? (this.stats.hits / total) * 100 
      : 0;
  }

  /**
   * Record cache retrieval time for statistics
   */
  private recordCacheRetrievalTime(time: number): void {
    this.cacheRetrievalTimes.push(time);
    
    // Keep only last 100 measurements for moving average
    if (this.cacheRetrievalTimes.length > 100) {
      this.cacheRetrievalTimes.shift();
    }
    
    // Update average
    const sum = this.cacheRetrievalTimes.reduce((a, b) => a + b, 0);
    this.stats.avgCacheRetrievalTime = 
      this.cacheRetrievalTimes.length > 0 
        ? sum / this.cacheRetrievalTimes.length 
        : 0;
  }

  /**
   * Record validation time for statistics
   */
  private recordValidationTime(time: number): void {
    this.validationTimes.push(time);
    
    // Keep only last 100 measurements for moving average
    if (this.validationTimes.length > 100) {
      this.validationTimes.shift();
    }
    
    // Update average
    const sum = this.validationTimes.reduce((a, b) => a + b, 0);
    this.stats.avgValidationTime = 
      this.validationTimes.length > 0 
        ? sum / this.validationTimes.length 
        : 0;
  }

  /**
   * Warm up cache with common configurations
   * @param configs Array of configurations to pre-cache
   */
  public async warmUp(
    configs: ClaudeCodeConfiguration[],
    validator: (config: ClaudeCodeConfiguration) => Promise<ValidationResult>
  ): Promise<void> {
    const promises = configs.map(async (config) => {
      const hash = this.generateHash(config);
      
      // Skip if already cached
      if (this.cache.has(hash)) {
        return;
      }
      
      const startTime = performance.now();
      const result = await validator(config);
      const validationTime = performance.now() - startTime;
      
      this.set(hash, result, validationTime);
    });
    
    await Promise.all(promises);
  }

  /**
   * Export cache for persistence
   */
  public export(): string {
    const exportData = {
      version: '1.0.0',
      timestamp: Date.now(),
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        result: entry.result,
        configHash: entry.configHash,
        createdAt: entry.createdAt
      })),
      stats: this.stats
    };
    
    return JSON.stringify(exportData);
  }

  /**
   * Import cache from persistence
   */
  public import(data: string): void {
    try {
      const importData = JSON.parse(data);
      
      if (importData.version !== '1.0.0') {
        throw new Error(`Unsupported cache version: ${importData.version}`);
      }
      
      this.clear();
      
      const now = Date.now();
      for (const entry of importData.entries) {
        // Skip expired entries
        if (now - entry.createdAt > this.ttlMs) {
          continue;
        }
        
        const sizeBytes = this.estimateSize(entry.result);
        this.cache.set(entry.key, {
          result: entry.result,
          configHash: entry.configHash,
          createdAt: entry.createdAt,
          accessCount: 0,
          lastAccessedAt: now,
          sizeBytes
        });
        
        this.stats.entries++;
        this.stats.memoryUsed += sizeBytes;
      }
    } catch (error) {
      throw new Error(`Failed to import cache: ${error}`);
    }
  }
}