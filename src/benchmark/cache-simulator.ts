/**
 * Cache simulator for benchmark testing
 */

import { EventEmitter } from 'events';
import { CacheMetrics } from './types';

interface CacheEntry {
  key: string;
  value: any;
  size: number;
  accessCount: number;
  lastAccessed: number;
  created: number;
  ttl?: number;
}

export class CacheSimulator extends EventEmitter {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private currentSize: number = 0;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    evictions: 0,
    size: 0
  };

  constructor(maxSize: number = 100 * 1024 * 1024) { // 100MB default
    super();
    this.maxSize = maxSize;
  }

  /**
   * Get value from cache
   */
  async get(key: string): Promise<any> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.metrics.misses++;
      this.updateHitRate();
      this.emit('miss', key);
      
      // Simulate cache population on miss
      const value = await this.loadValue(key);
      await this.set(key, value);
      return value;
    }

    // Check TTL
    if (entry.ttl && Date.now() - entry.created > entry.ttl) {
      this.cache.delete(key);
      this.currentSize -= entry.size;
      this.metrics.misses++;
      this.updateHitRate();
      this.emit('expired', key);
      
      // Reload value
      const value = await this.loadValue(key);
      await this.set(key, value);
      return value;
    }

    // Update access info
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this.metrics.hits++;
    this.updateHitRate();
    this.emit('hit', key);
    
    return entry.value;
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const size = this.calculateSize(value);
    
    // Check if we need to evict
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictLRU();
    }
    
    const entry: CacheEntry = {
      key,
      value,
      size,
      accessCount: 0,
      lastAccessed: Date.now(),
      created: Date.now(),
      ttl
    };
    
    // Remove old entry if exists
    const oldEntry = this.cache.get(key);
    if (oldEntry) {
      this.currentSize -= oldEntry.size;
    }
    
    this.cache.set(key, entry);
    this.currentSize += size;
    this.metrics.size = this.cache.size;
    
    this.emit('set', key, value);
  }

  /**
   * Set with TTL
   */
  async setWithTTL(key: string, value: any, ttl: number): Promise<void> {
    return this.set(key, value, ttl);
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    this.cache.delete(key);
    this.currentSize -= entry.size;
    this.metrics.size = this.cache.size;
    
    this.emit('delete', key);
    return true;
  }

  /**
   * Clear cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.currentSize = 0;
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
      size: 0
    };
    
    this.emit('clear');
  }

  /**
   * Populate cache with test data
   */
  async populate(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      const key = `template-${i}`;
      const value = {
        id: i,
        data: `Test data ${i}`.repeat(100),
        timestamp: Date.now()
      };
      await this.set(key, value);
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestEntry: CacheEntry | null = null;
    let oldestKey: string | null = null;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!oldestEntry || entry.lastAccessed < oldestEntry.lastAccessed) {
        oldestEntry = entry;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.currentSize -= oldestEntry!.size;
      this.metrics.evictions++;
      this.metrics.size = this.cache.size;
      
      this.emit('evict', oldestKey);
    }
  }

  /**
   * Calculate size of value
   */
  private calculateSize(value: any): number {
    // Rough estimation of object size
    const str = JSON.stringify(value);
    return str.length * 2; // 2 bytes per character (UTF-16)
  }

  /**
   * Load value (simulated)
   */
  private async loadValue(key: string): Promise<any> {
    // Simulate loading from database/filesystem
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    
    return {
      key,
      data: `Loaded data for ${key}`,
      timestamp: Date.now()
    };
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cache info
   */
  getInfo(): any {
    const entries = Array.from(this.cache.values());
    
    return {
      size: this.cache.size,
      currentSize: this.currentSize,
      maxSize: this.maxSize,
      utilization: (this.currentSize / this.maxSize) * 100,
      metrics: this.metrics,
      oldestEntry: entries.reduce((oldest, entry) => 
        !oldest || entry.created < oldest.created ? entry : oldest, 
        null as CacheEntry | null
      ),
      mostAccessed: entries.reduce((most, entry) => 
        !most || entry.accessCount > most.accessCount ? entry : most,
        null as CacheEntry | null
      )
    };
  }

  /**
   * Warm up cache
   */
  async warmUp(keys: string[]): Promise<void> {
    const promises = keys.map(key => this.get(key));
    await Promise.all(promises);
  }
}

/**
 * Multi-level cache simulator
 */
export class MultiLevelCache extends EventEmitter {
  private l1Cache: CacheSimulator;
  private l2Cache: CacheSimulator;
  private l3Cache: CacheSimulator;

  constructor() {
    super();
    
    // L1: 10MB (in-memory)
    this.l1Cache = new CacheSimulator(10 * 1024 * 1024);
    
    // L2: 100MB (Redis-like)
    this.l2Cache = new CacheSimulator(100 * 1024 * 1024);
    
    // L3: 1GB (CDN-like)
    this.l3Cache = new CacheSimulator(1024 * 1024 * 1024);
    
    this.setupEventForwarding();
  }

  /**
   * Get from multi-level cache
   */
  async get(key: string): Promise<any> {
    // Try L1
    const l1Value = await this.checkLevel(this.l1Cache, key, 'L1');
    if (l1Value !== null) return l1Value;
    
    // Try L2
    const l2Value = await this.checkLevel(this.l2Cache, key, 'L2');
    if (l2Value !== null) {
      await this.l1Cache.set(key, l2Value); // Promote to L1
      return l2Value;
    }
    
    // Try L3
    const l3Value = await this.checkLevel(this.l3Cache, key, 'L3');
    if (l3Value !== null) {
      await this.l2Cache.set(key, l3Value); // Promote to L2
      await this.l1Cache.set(key, l3Value); // Promote to L1
      return l3Value;
    }
    
    // Cache miss - load and populate all levels
    const value = await this.loadFromSource(key);
    await this.setAllLevels(key, value);
    
    return value;
  }

  /**
   * Check cache level
   */
  private async checkLevel(cache: CacheSimulator, key: string, level: string): Promise<any | null> {
    const metrics = cache.getMetrics();
    const hitsBefore = metrics.hits;
    
    const value = await cache.get(key);
    
    const metricsAfter = cache.getMetrics();
    if (metricsAfter.hits > hitsBefore) {
      this.emit('hit', { level, key });
      return value;
    }
    
    return null;
  }

  /**
   * Set in all cache levels
   */
  private async setAllLevels(key: string, value: any): Promise<void> {
    await Promise.all([
      this.l1Cache.set(key, value),
      this.l2Cache.set(key, value),
      this.l3Cache.set(key, value)
    ]);
  }

  /**
   * Load from source (simulated)
   */
  private async loadFromSource(key: string): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate slow load
    return {
      key,
      data: `Source data for ${key}`,
      timestamp: Date.now()
    };
  }

  /**
   * Setup event forwarding
   */
  private setupEventForwarding(): void {
    this.l1Cache.on('evict', key => this.emit('evict', { level: 'L1', key }));
    this.l2Cache.on('evict', key => this.emit('evict', { level: 'L2', key }));
    this.l3Cache.on('evict', key => this.emit('evict', { level: 'L3', key }));
  }

  /**
   * Get combined metrics
   */
  getMetrics(): any {
    return {
      L1: this.l1Cache.getMetrics(),
      L2: this.l2Cache.getMetrics(),
      L3: this.l3Cache.getMetrics()
    };
  }

  /**
   * Clear all levels
   */
  async clearAll(): Promise<void> {
    await Promise.all([
      this.l1Cache.clear(),
      this.l2Cache.clear(),
      this.l3Cache.clear()
    ]);
  }
}