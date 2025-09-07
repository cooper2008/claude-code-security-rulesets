/**
 * Ultra-fast in-memory L1 cache with LRU eviction
 * Achieves <1ms response times for cached data
 */

import { EventEmitter } from 'events';
import { CacheEntry, CacheKey, CacheStats, CacheOptions } from './types';

/**
 * High-performance in-memory cache with LRU eviction
 * Uses Map for O(1) lookups and maintains access order for efficient LRU
 */
export class MemoryCache extends EventEmitter {
  private cache: Map<string, CacheEntry>;
  private accessOrder: Map<string, number>;
  private readonly maxSize: number;
  private readonly maxMemoryMB: number;
  private readonly ttlMs: number;
  private currentMemoryUsage: number = 0;
  private stats: CacheStats;
  private readonly enableMetrics: boolean;

  constructor(options: CacheOptions = {}) {
    super();
    
    this.maxSize = options.maxEntries || 10000;
    this.maxMemoryMB = options.maxMemoryMB || 100;
    this.ttlMs = options.ttlMs || 5 * 60 * 1000; // 5 minutes default
    this.enableMetrics = options.enableMetrics !== false;
    
    this.cache = new Map();
    this.accessOrder = new Map();
    
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      deletes: 0,
      memoryUsed: 0,
      entriesCount: 0,
      avgResponseTime: 0,
      hitRate: 0,
      lastReset: Date.now()
    };

    // Periodic cleanup of expired entries
    if (options.cleanupInterval !== 0) {
      const interval = options.cleanupInterval || 60000; // 1 minute default
      setInterval(() => this.cleanupExpired(), interval).unref();
    }
  }

  /**
   * Get a value from cache
   * @returns Value and metadata, or null if not found/expired
   */
  get<T = any>(key: string): T | null {
    const startTime = this.enableMetrics ? performance.now() : 0;
    
    try {
      const entry = this.cache.get(key);
      
      if (!entry) {
        this.recordMiss();
        return null;
      }

      // Check expiration
      const now = Date.now();
      if (entry.expiresAt && entry.expiresAt < now) {
        this.delete(key);
        this.recordMiss();
        return null;
      }

      // Update access order for LRU
      this.accessOrder.set(key, now);
      entry.lastAccessed = now;
      entry.accessCount++;

      // Move to end of Map (most recently used)
      this.cache.delete(key);
      this.cache.set(key, entry);

      this.recordHit(startTime);
      return entry.value as T;
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Set a value in cache with automatic eviction if needed
   */
  set<T = any>(key: string, value: T, options: { ttl?: number; size?: number } = {}): boolean {
    const startTime = this.enableMetrics ? performance.now() : 0;
    
    try {
      const now = Date.now();
      const ttl = options.ttl || this.ttlMs;
      const size = options.size || this.estimateSize(value);

      // Check if we need to evict before adding
      if (this.shouldEvict(size)) {
        this.evictLRU(size);
      }

      // Create entry
      const entry: CacheEntry = {
        key,
        value,
        size,
        createdAt: now,
        lastAccessed: now,
        expiresAt: ttl > 0 ? now + ttl : undefined,
        accessCount: 0
      };

      // Update or add entry
      const existing = this.cache.get(key);
      if (existing) {
        this.currentMemoryUsage -= existing.size;
        this.stats.entriesCount--;
      }

      this.cache.set(key, entry);
      this.accessOrder.set(key, now);
      this.currentMemoryUsage += size;
      
      this.recordSet(startTime);
      this.emit('set', key, value);
      
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.accessOrder.delete(key);
    this.currentMemoryUsage -= entry.size;
    this.stats.deletes++;
    this.stats.entriesCount--;
    
    this.emit('delete', key);
    return true;
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.currentMemoryUsage = 0;
    this.stats.entriesCount = 0;
    this.emit('clear');
  }

  /**
   * Get multiple values at once (batch operation)
   */
  mget<T = any>(keys: string[]): Map<string, T | null> {
    const result = new Map<string, T | null>();
    
    for (const key of keys) {
      result.set(key, this.get<T>(key));
    }
    
    return result;
  }

  /**
   * Set multiple values at once (batch operation)
   */
  mset<T = any>(entries: Array<{ key: string; value: T; ttl?: number }>): Map<string, boolean> {
    const result = new Map<string, boolean>();
    
    for (const entry of entries) {
      const success = this.set(entry.key, entry.value, { ttl: entry.ttl });
      result.set(entry.key, success);
    }
    
    return result;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      memoryUsed: this.currentMemoryUsage,
      entriesCount: this.cache.size,
      hitRate: this.calculateHitRate()
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      deletes: 0,
      memoryUsed: this.currentMemoryUsage,
      entriesCount: this.cache.size,
      avgResponseTime: 0,
      hitRate: 0,
      lastReset: Date.now()
    };
  }

  /**
   * Get size of the cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get memory usage in bytes
   */
  memoryUsage(): number {
    return this.currentMemoryUsage;
  }

  /**
   * Export cache for persistence or analysis
   */
  export(): Array<{ key: string; value: any; metadata: Partial<CacheEntry> }> {
    const entries: Array<{ key: string; value: any; metadata: Partial<CacheEntry> }> = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (!entry.expiresAt || entry.expiresAt > Date.now()) {
        entries.push({
          key,
          value: entry.value,
          metadata: {
            createdAt: entry.createdAt,
            expiresAt: entry.expiresAt,
            accessCount: entry.accessCount
          }
        });
      }
    }
    
    return entries;
  }

  /**
   * Import cache from exported data
   */
  import(entries: Array<{ key: string; value: any; ttl?: number }>): void {
    this.clear();
    
    for (const entry of entries) {
      this.set(entry.key, entry.value, { ttl: entry.ttl });
    }
  }

  /**
   * Warm up cache with predefined data
   */
  async warmUp(loader: () => Promise<Array<{ key: string; value: any; ttl?: number }>>): Promise<void> {
    try {
      const entries = await loader();
      this.import(entries);
      this.emit('warmup', entries.length);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  // Private methods

  private shouldEvict(newSize: number): boolean {
    return (
      this.cache.size >= this.maxSize ||
      this.currentMemoryUsage + newSize > this.maxMemoryMB * 1024 * 1024
    );
  }

  private evictLRU(requiredSpace: number): void {
    const entries = Array.from(this.accessOrder.entries())
      .sort((a, b) => a[1] - b[1]); // Sort by access time (oldest first)

    let freedSpace = 0;
    const toEvict: string[] = [];

    for (const [key] of entries) {
      if (freedSpace >= requiredSpace && this.cache.size < this.maxSize) {
        break;
      }

      const entry = this.cache.get(key);
      if (entry) {
        freedSpace += entry.size;
        toEvict.push(key);
      }
    }

    for (const key of toEvict) {
      this.delete(key);
      this.stats.evictions++;
    }

    this.emit('eviction', toEvict.length);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.delete(key);
    }

    if (expired.length > 0) {
      this.emit('cleanup', expired.length);
    }
  }

  private estimateSize(value: any): number {
    if (typeof value === 'string') {
      return value.length * 2; // 2 bytes per character
    }
    
    if (typeof value === 'number') {
      return 8; // 64-bit number
    }
    
    if (typeof value === 'boolean') {
      return 4;
    }
    
    if (value === null || value === undefined) {
      return 0;
    }
    
    // For objects and arrays, use JSON stringification
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1024; // Default size for complex objects
    }
  }

  private recordHit(startTime: number): void {
    if (!this.enableMetrics) return;
    
    this.stats.hits++;
    const responseTime = performance.now() - startTime;
    this.updateAvgResponseTime(responseTime);
  }

  private recordMiss(): void {
    if (!this.enableMetrics) return;
    this.stats.misses++;
  }

  private recordSet(startTime: number): void {
    if (!this.enableMetrics) return;
    
    this.stats.sets++;
    this.stats.entriesCount++;
    const responseTime = performance.now() - startTime;
    this.updateAvgResponseTime(responseTime);
  }

  private updateAvgResponseTime(newTime: number): void {
    const totalOps = this.stats.hits + this.stats.sets;
    if (totalOps === 0) {
      this.stats.avgResponseTime = newTime;
    } else {
      this.stats.avgResponseTime = 
        (this.stats.avgResponseTime * (totalOps - 1) + newTime) / totalOps;
    }
  }

  private calculateHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? (this.stats.hits / total) * 100 : 0;
  }
}

/**
 * Create a singleton memory cache instance
 */
export const createMemoryCache = (options?: CacheOptions): MemoryCache => {
  return new MemoryCache(options);
};

// Export default instance for convenience
export const defaultMemoryCache = new MemoryCache();