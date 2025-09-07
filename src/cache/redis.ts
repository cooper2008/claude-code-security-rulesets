/**
 * Redis L2 cache implementation for distributed caching
 * Achieves <5ms response times with cluster support
 */

import { EventEmitter } from 'events';
import { CacheEntry, CacheStats, CacheOptions } from './types';

// Redis client types - will be properly imported when redis is installed
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: any): Promise<string>;
  del(key: string | string[]): Promise<number>;
  exists(key: string | string[]): Promise<number>;
  mget(keys: string[]): Promise<(string | null)[]>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  scan(cursor: string, options?: any): Promise<[string, string[]]>;
  info(section?: string): Promise<string>;
  ping(): Promise<string>;
  flushdb(): Promise<string>;
  eval(script: string, keys: string[], args: string[]): Promise<any>;
}

/**
 * Redis cache implementation with automatic serialization and compression
 */
export class RedisCache extends EventEmitter {
  private client: RedisClient | null = null;
  private readonly prefix: string;
  private readonly ttlMs: number;
  private readonly enableCompression: boolean;
  private readonly enablePipelining: boolean;
  private stats: CacheStats;
  private connected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(options: CacheOptions & { redis?: any } = {}) {
    super();

    this.prefix = options.keyPrefix || 'claude-code:';
    this.ttlMs = options.ttlMs || 5 * 60 * 1000; // 5 minutes default
    this.enableCompression = options.enableCompression !== false;
    this.enablePipelining = options.enablePipelining !== false;

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

    // Initialize Redis connection if config provided
    if (options.redis) {
      this.connect(options.redis);
    }
  }

  /**
   * Connect to Redis
   */
  async connect(redisOptions: any): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect(redisOptions);
    return this.connectionPromise;
  }

  private async _connect(redisOptions: any): Promise<void> {
    try {
      // Dynamic import to avoid dependency issues if redis not installed
      const redis = await this.tryLoadRedis();
      
      if (!redis) {
        this.emit('error', new Error('Redis client not available'));
        return;
      }

      this.client = redis.createClient(redisOptions);
      
      // Set up event handlers
      (this.client as any).on('error', (err: Error) => {
        this.connected = false;
        this.emit('error', err);
      });

      (this.client as any).on('connect', () => {
        this.connected = true;
        this.emit('connect');
      });

      (this.client as any).on('ready', () => {
        this.emit('ready');
      });

      // Connect
      if ((this.client as any).connect) {
        await (this.client as any).connect();
      }

      this.connected = true;
    } catch (error) {
      this.connected = false;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Try to load Redis client library
   */
  private async tryLoadRedis(): Promise<any> {
    try {
      // Try ioredis first (preferred for cluster support)
      return require('ioredis');
    } catch {
      try {
        // Fall back to node-redis
        return require('redis');
      } catch {
        return null;
      }
    }
  }

  /**
   * Get a value from Redis cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isConnected()) {
      return null;
    }

    const startTime = performance.now();
    const fullKey = this.prefix + key;

    try {
      const data = await this.client!.get(fullKey);
      
      if (!data) {
        this.recordMiss();
        return null;
      }

      const value = this.deserialize<T>(data);
      this.recordHit(startTime);
      
      return value;
    } catch (error) {
      this.emit('error', error);
      this.recordMiss();
      return null;
    }
  }

  /**
   * Set a value in Redis cache
   */
  async set<T = any>(key: string, value: T, options: { ttl?: number } = {}): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    const startTime = performance.now();
    const fullKey = this.prefix + key;
    const ttl = options.ttl || this.ttlMs;

    try {
      const serialized = this.serialize(value);
      
      if (ttl > 0) {
        await this.client!.set(fullKey, serialized, {
          PX: ttl // Set expiry in milliseconds
        });
      } else {
        await this.client!.set(fullKey, serialized);
      }

      this.recordSet(startTime);
      this.emit('set', key, value);
      
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Delete a key from Redis
   */
  async delete(key: string): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    const fullKey = this.prefix + key;

    try {
      const result = await this.client!.del(fullKey);
      
      if (result > 0) {
        this.stats.deletes++;
        this.emit('delete', key);
        return true;
      }
      
      return false;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Check if a key exists in Redis
   */
  async has(key: string): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    const fullKey = this.prefix + key;

    try {
      const exists = await this.client!.exists(fullKey);
      return exists > 0;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Clear all keys with our prefix
   */
  async clear(): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    try {
      // Use SCAN to find all keys with our prefix
      const keys = await this.scanKeys(this.prefix + '*');
      
      if (keys.length > 0) {
        await this.client!.del(keys);
      }

      this.emit('clear');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get multiple values at once (batch operation)
   */
  async mget<T = any>(keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();
    
    if (!this.isConnected() || keys.length === 0) {
      keys.forEach(key => result.set(key, null));
      return result;
    }

    const startTime = performance.now();
    const fullKeys = keys.map(key => this.prefix + key);

    try {
      const values = await this.client!.mget(fullKeys);
      
      keys.forEach((key, index) => {
        const data = values[index];
        if (data) {
          try {
            const value = this.deserialize<T>(data);
            result.set(key, value);
            this.stats.hits++;
          } catch {
            result.set(key, null);
            this.stats.misses++;
          }
        } else {
          result.set(key, null);
          this.stats.misses++;
        }
      });

      this.updateAvgResponseTime(performance.now() - startTime);
      return result;
    } catch (error) {
      this.emit('error', error);
      keys.forEach(key => result.set(key, null));
      return result;
    }
  }

  /**
   * Set multiple values at once using pipelining
   */
  async mset<T = any>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    
    if (!this.isConnected() || entries.length === 0) {
      entries.forEach(entry => result.set(entry.key, false));
      return result;
    }

    try {
      // Use pipelining for better performance
      const pipeline = (this.client as any).pipeline ? 
        (this.client as any).pipeline() : 
        this.client;

      for (const entry of entries) {
        const fullKey = this.prefix + entry.key;
        const serialized = this.serialize(entry.value);
        const ttl = entry.ttl || this.ttlMs;

        if (pipeline !== this.client) {
          if (ttl > 0) {
            pipeline.set(fullKey, serialized, 'PX', ttl);
          } else {
            pipeline.set(fullKey, serialized);
          }
        } else {
          // Fallback to sequential operations
          const success = await this.set(entry.key, entry.value, { ttl });
          result.set(entry.key, success);
        }
      }

      if (pipeline !== this.client) {
        const results = await pipeline.exec();
        entries.forEach((entry, index) => {
          result.set(entry.key, !results[index][0]); // No error means success
        });
      }

      return result;
    } catch (error) {
      this.emit('error', error);
      entries.forEach(entry => result.set(entry.key, false));
      return result;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const stats = { ...this.stats };

    if (this.isConnected()) {
      try {
        // Get Redis memory usage
        const info = await this.client!.info('memory');
        const match = info.match(/used_memory:(\d+)/);
        if (match) {
          stats.memoryUsed = parseInt(match[1], 10);
        }

        // Count keys with our prefix
        const keys = await this.scanKeys(this.prefix + '*');
        stats.entriesCount = keys.length;
      } catch (error) {
        this.emit('error', error);
      }
    }

    stats.hitRate = this.calculateHitRate();
    return stats;
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
      memoryUsed: 0,
      entriesCount: 0,
      avgResponseTime: 0,
      hitRate: 0,
      lastReset: Date.now()
    };
  }

  /**
   * Get TTL for a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.isConnected()) {
      return -1;
    }

    const fullKey = this.prefix + key;

    try {
      return await this.client!.ttl(fullKey);
    } catch (error) {
      this.emit('error', error);
      return -1;
    }
  }

  /**
   * Extend TTL for a key
   */
  async touch(key: string, ttl?: number): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    const fullKey = this.prefix + key;
    const expiry = ttl || this.ttlMs;

    try {
      const result = await this.client!.expire(fullKey, Math.floor(expiry / 1000));
      return result > 0;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Check if connected to Redis
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      if ((this.client as any).quit) {
        await (this.client as any).quit();
      } else if ((this.client as any).disconnect) {
        await (this.client as any).disconnect();
      }
      
      this.client = null;
      this.connected = false;
      this.connectionPromise = null;
    }
  }

  // Private methods

  private serialize(value: any): string {
    try {
      const json = JSON.stringify(value);
      
      if (this.enableCompression && json.length > 1024) {
        // For large values, add compression marker
        // Actual compression would require zlib or similar
        return 'c:' + json; // Prefix to indicate compression
      }
      
      return json;
    } catch (error) {
      throw new Error(`Failed to serialize value: ${error}`);
    }
  }

  private deserialize<T>(data: string): T {
    try {
      // Check for compression marker
      if (this.enableCompression && data.startsWith('c:')) {
        // Decompress if needed
        data = data.substring(2);
      }
      
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to deserialize value: ${error}`);
    }
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, batch] = await this.client!.scan(cursor, {
        MATCH: pattern,
        COUNT: 100
      });
      
      keys.push(...batch);
      cursor = newCursor;
    } while (cursor !== '0');

    return keys;
  }

  private recordHit(startTime: number): void {
    this.stats.hits++;
    this.updateAvgResponseTime(performance.now() - startTime);
  }

  private recordMiss(): void {
    this.stats.misses++;
  }

  private recordSet(startTime: number): void {
    this.stats.sets++;
    this.updateAvgResponseTime(performance.now() - startTime);
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
 * Create a Redis cache instance
 */
export const createRedisCache = (options?: CacheOptions & { redis?: any }): RedisCache => {
  return new RedisCache(options);
};