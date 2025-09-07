/**
 * Multi-tier cache management with L1 (memory) and L2 (Redis) coordination
 * Achieves <10ms response times through intelligent tiering
 */

import { EventEmitter } from 'events';
import { MemoryCache } from './memory';
import { RedisCache } from './redis';
import { CacheKeyManager, CacheKeyGenerator } from './keys';
import { InvalidationManager } from './invalidation';
import { CacheMetricsCollector } from './metrics';
import { JsonSerializer } from './serializer';
import {
  ICacheManager,
  CacheOptions,
  MultiTierConfig,
  CacheStats,
  WarmupConfig,
  CacheResult
} from './types';

/**
 * Multi-tier cache manager implementation
 */
export class CacheManager extends EventEmitter implements ICacheManager {
  private l1Cache: MemoryCache;
  private l2Cache: RedisCache | null;
  private keyManager: CacheKeyManager;
  private keyGenerator: CacheKeyGenerator;
  private invalidationManager: InvalidationManager;
  private metricsCollector: CacheMetricsCollector;
  private serializer: JsonSerializer;
  
  private readonly config: MultiTierConfig;
  private readonly writeQueue: Map<string, any>;
  private writeTimer: NodeJS.Timer | null;
  private isHealthy: boolean = true;

  constructor(config: MultiTierConfig = {}) {
    super();

    this.config = {
      fallbackToL2: config.fallbackToL2 !== false,
      writeThrough: config.writeThrough !== false,
      readThrough: config.readThrough !== false,
      asyncWrites: config.asyncWrites !== false,
      warmupOnStart: config.warmupOnStart === true,
      syncInterval: config.syncInterval || 5000,
      ...config
    };

    // Initialize L1 cache (always present)
    this.l1Cache = new MemoryCache(config.l1 || {
      maxEntries: 10000,
      maxMemoryMB: 100,
      ttlMs: 5 * 60 * 1000,
      enableMetrics: true
    });

    // Initialize L2 cache (optional)
    this.l2Cache = config.l2?.redis ? new RedisCache(config.l2) : null;

    // Initialize supporting components
    this.keyManager = new CacheKeyManager();
    this.keyGenerator = this.keyManager.getGenerator();
    this.invalidationManager = new InvalidationManager();
    this.metricsCollector = new CacheMetricsCollector({
      performanceTargets: {
        maxResponseTime: 10, // 10ms target
        minHitRate: 80,
        maxMemoryUsage: 100,
        maxEvictionRate: 100
      }
    });
    this.serializer = new JsonSerializer({ compress: true });

    // Write queue for async writes
    this.writeQueue = new Map();
    this.writeTimer = null;

    // Set up event forwarding
    this.setupEventHandlers();

    // Start async write processing if enabled
    if (this.config.asyncWrites) {
      this.startAsyncWrites();
    }
  }

  /**
   * Get a value from cache (checks L1 first, then L2)
   */
  async get<T = any>(key: string): Promise<T | null> {
    const startTime = performance.now();

    try {
      // Try L1 first (fastest)
      const l1Value = this.l1Cache.get<T>(key);
      
      if (l1Value !== null) {
        const responseTime = performance.now() - startTime;
        this.metricsCollector.recordHit(responseTime);
        this.emit('hit', { key, source: 'l1', responseTime });
        return l1Value;
      }

      // Try L2 if available and fallback enabled
      if (this.l2Cache && this.config.fallbackToL2) {
        const l2Value = await this.l2Cache.get<T>(key);
        
        if (l2Value !== null) {
          // Promote to L1 for faster future access
          if (this.config.readThrough) {
            this.l1Cache.set(key, l2Value);
          }
          
          const responseTime = performance.now() - startTime;
          this.metricsCollector.recordHit(responseTime);
          this.emit('hit', { key, source: 'l2', responseTime });
          return l2Value;
        }
      }

      // Cache miss
      this.metricsCollector.recordMiss();
      this.emit('miss', { key });
      return null;
    } catch (error) {
      this.handleError(error as Error, 'get');
      return null;
    }
  }

  /**
   * Set a value in cache (writes to L1 immediately, L2 async if enabled)
   */
  async set<T = any>(
    key: string,
    value: T,
    options: { ttl?: number; tags?: string[] } = {}
  ): Promise<boolean> {
    const startTime = performance.now();

    try {
      // Register tags if provided
      if (options.tags && options.tags.length > 0) {
        this.keyManager.registerKey(key, options.tags);
      }

      // Write to L1 (immediate)
      const l1Success = this.l1Cache.set(key, value, { ttl: options.ttl });

      if (!l1Success) {
        return false;
      }

      // Write to L2 (async or sync based on config)
      if (this.l2Cache && this.config.writeThrough) {
        if (this.config.asyncWrites) {
          // Queue for async write
          this.writeQueue.set(key, { value, ttl: options.ttl });
        } else {
          // Sync write to L2
          await this.l2Cache.set(key, value, { ttl: options.ttl });
        }
      }

      const responseTime = performance.now() - startTime;
      this.metricsCollector.recordSet(responseTime);
      this.emit('set', { key, responseTime });
      
      return true;
    } catch (error) {
      this.handleError(error as Error, 'set');
      return false;
    }
  }

  /**
   * Delete a key from both cache tiers
   */
  async delete(key: string): Promise<boolean> {
    try {
      // Unregister from key manager
      this.keyManager.unregisterKey(key);

      // Delete from L1
      const l1Success = this.l1Cache.delete(key);

      // Delete from L2
      let l2Success = true;
      if (this.l2Cache) {
        l2Success = await this.l2Cache.delete(key);
      }

      this.emit('delete', { key });
      return l1Success || l2Success;
    } catch (error) {
      this.handleError(error as Error, 'delete');
      return false;
    }
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  async invalidate(pattern: string | RegExp): Promise<number> {
    const keys = this.keyManager.getKeysByPattern(pattern);
    let invalidated = 0;

    for (const key of keys) {
      if (await this.delete(key)) {
        invalidated++;
      }
    }

    this.emit('invalidate', { pattern: pattern.toString(), count: invalidated });
    return invalidated;
  }

  /**
   * Invalidate cache entries by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    const keys = this.keyManager.getKeysByTags(tags);
    let invalidated = 0;

    for (const key of keys) {
      if (await this.delete(key)) {
        invalidated++;
      }
    }

    this.emit('invalidateByTags', { tags, count: invalidated });
    return invalidated;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      // Clear L1
      this.l1Cache.clear();

      // Clear L2
      if (this.l2Cache) {
        await this.l2Cache.clear();
      }

      // Clear key manager
      this.keyManager.clear();

      this.emit('clear');
    } catch (error) {
      this.handleError(error as Error, 'clear');
    }
  }

  /**
   * Get cache statistics from all tiers
   */
  async getStats(): Promise<{ l1: CacheStats; l2?: CacheStats; combined: CacheStats }> {
    const l1Stats = this.l1Cache.getStats();
    const l2Stats = this.l2Cache ? await this.l2Cache.getStats() : undefined;

    // Calculate combined stats
    const combined: CacheStats = {
      hits: l1Stats.hits + (l2Stats?.hits || 0),
      misses: l1Stats.misses + (l2Stats?.misses || 0),
      evictions: l1Stats.evictions + (l2Stats?.evictions || 0),
      sets: l1Stats.sets + (l2Stats?.sets || 0),
      deletes: l1Stats.deletes + (l2Stats?.deletes || 0),
      memoryUsed: l1Stats.memoryUsed + (l2Stats?.memoryUsed || 0),
      entriesCount: l1Stats.entriesCount + (l2Stats?.entriesCount || 0),
      avgResponseTime: (l1Stats.avgResponseTime + (l2Stats?.avgResponseTime || 0)) / 2,
      hitRate: this.calculateCombinedHitRate(l1Stats, l2Stats),
      lastReset: Math.min(l1Stats.lastReset, l2Stats?.lastReset || Infinity)
    };

    return { l1: l1Stats, l2: l2Stats, combined };
  }

  /**
   * Warm up cache with predefined data
   */
  async warmUp(config: WarmupConfig): Promise<void> {
    if (!config.enabled) {
      return;
    }

    try {
      this.emit('warmupStart', { priority: config.priority });

      let entries: Array<{ key: string; value: any; ttl?: number }> = [];

      // Load from custom loader if provided
      if (config.loader) {
        entries = await config.loader();
      }

      // Load specific keys if provided
      if (config.keys && config.keys.length > 0) {
        // This would load from a data source
        // For now, we'll skip this
      }

      // Process in batches if configured
      if (config.batchSize && config.batchSize > 0) {
        for (let i = 0; i < entries.length; i += config.batchSize) {
          const batch = entries.slice(i, i + config.batchSize);
          
          if (config.parallel) {
            await Promise.all(
              batch.map(entry => this.set(entry.key, entry.value, { ttl: entry.ttl }))
            );
          } else {
            for (const entry of batch) {
              await this.set(entry.key, entry.value, { ttl: entry.ttl });
            }
          }
        }
      } else {
        // Load all at once
        if (config.parallel) {
          await Promise.all(
            entries.map(entry => this.set(entry.key, entry.value, { ttl: entry.ttl }))
          );
        } else {
          for (const entry of entries) {
            await this.set(entry.key, entry.value, { ttl: entry.ttl });
          }
        }
      }

      this.emit('warmupComplete', { loaded: entries.length });
    } catch (error) {
      this.emit('warmupError', error);
      
      if (!config.retryOnFailure) {
        throw error;
      }
    }
  }

  /**
   * Check if cache system is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Check L1 health (always required)
      const testKey = '__health_check__';
      const testValue = Date.now();
      
      // Test L1
      const l1Success = this.l1Cache.set(testKey, testValue);
      if (!l1Success) {
        return false;
      }
      
      const l1Retrieved = this.l1Cache.get(testKey);
      if (l1Retrieved !== testValue) {
        return false;
      }
      
      this.l1Cache.delete(testKey);

      // Test L2 if available
      if (this.l2Cache && this.l2Cache.isConnected()) {
        const l2Success = await this.l2Cache.set(testKey, testValue);
        if (!l2Success) {
          return false;
        }
        
        const l2Retrieved = await this.l2Cache.get(testKey);
        if (l2Retrieved !== testValue) {
          return false;
        }
        
        await this.l2Cache.delete(testKey);
      }

      this.isHealthy = true;
      return true;
    } catch (error) {
      this.isHealthy = false;
      return false;
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics() {
    return this.metricsCollector.getMetrics();
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    return this.metricsCollector.generateReport();
  }

  /**
   * Connect to L2 cache (Redis)
   */
  async connectL2(redisOptions: any): Promise<void> {
    if (!this.l2Cache) {
      this.l2Cache = new RedisCache({ redis: redisOptions });
    }
    
    await this.l2Cache.connect(redisOptions);
  }

  /**
   * Disconnect from L2 cache
   */
  async disconnectL2(): Promise<void> {
    if (this.l2Cache) {
      await this.l2Cache.disconnect();
    }
  }

  /**
   * Destroy cache manager and clean up resources
   */
  async destroy(): Promise<void> {
    // Stop timers
    if (this.writeTimer) {
      clearInterval(this.writeTimer);
      this.writeTimer = null;
    }

    // Process remaining writes
    await this.processWriteQueue();

    // Clear caches
    await this.clear();

    // Disconnect L2
    if (this.l2Cache) {
      await this.l2Cache.disconnect();
    }

    // Clean up other components
    this.invalidationManager.destroy();
    this.metricsCollector.stop();

    this.removeAllListeners();
  }

  // Private methods

  private setupEventHandlers(): void {
    // Forward L1 events
    this.l1Cache.on('error', (error) => this.handleError(error, 'l1'));
    this.l1Cache.on('eviction', (count) => {
      this.metricsCollector.recordEviction(count);
    });

    // Forward L2 events if available
    if (this.l2Cache) {
      this.l2Cache.on('error', (error) => this.handleError(error, 'l2'));
      this.l2Cache.on('connect', () => this.emit('l2Connect'));
      this.l2Cache.on('disconnect', () => this.emit('l2Disconnect'));
    }

    // Handle invalidation events
    this.invalidationManager.on('invalidate', async (data) => {
      for (const key of data.keys) {
        await this.delete(key);
      }
    });

    // Handle metrics events
    this.metricsCollector.on('performanceViolation', (data) => {
      this.emit('performanceViolation', data);
    });
  }

  private startAsyncWrites(): void {
    this.writeTimer = setInterval(() => {
      this.processWriteQueue();
    }, this.config.syncInterval || 5000);

    this.writeTimer.unref();
  }

  private async processWriteQueue(): Promise<void> {
    if (this.writeQueue.size === 0 || !this.l2Cache) {
      return;
    }

    const entries = Array.from(this.writeQueue.entries());
    this.writeQueue.clear();

    try {
      // Batch write to L2
      const writePromises = entries.map(([key, { value, ttl }]) =>
        this.l2Cache!.set(key, value, { ttl })
      );

      await Promise.all(writePromises);
    } catch (error) {
      // Re-queue failed writes
      for (const [key, data] of entries) {
        this.writeQueue.set(key, data);
      }
      
      this.handleError(error as Error, 'asyncWrite');
    }
  }

  private calculateCombinedHitRate(l1Stats: CacheStats, l2Stats?: CacheStats): number {
    const totalHits = l1Stats.hits + (l2Stats?.hits || 0);
    const totalMisses = l1Stats.misses + (l2Stats?.misses || 0);
    const total = totalHits + totalMisses;
    
    return total > 0 ? (totalHits / total) * 100 : 0;
  }

  private handleError(error: Error, operation: string): void {
    this.metricsCollector.recordError(error, operation);
    this.emit('error', { error, operation });

    // Log error but don't throw to maintain availability
    console.error(`Cache error in ${operation}:`, error);
  }
}

/**
 * Create a cache manager instance
 */
export const createCacheManager = (config?: MultiTierConfig): CacheManager => {
  return new CacheManager(config);
};

// Export default manager for convenience
export const defaultCacheManager = new CacheManager();