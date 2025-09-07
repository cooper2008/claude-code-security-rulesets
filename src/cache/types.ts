/**
 * Type definitions for the caching system
 */

/**
 * Cache entry with metadata
 */
export interface CacheEntry {
  key: string;
  value: any;
  size: number;
  createdAt: number;
  lastAccessed: number;
  expiresAt?: number;
  accessCount: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Cache key generation options
 */
export interface CacheKey {
  prefix: string;
  namespace: string;
  identifier: string;
  version?: string;
  hash?: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  sets: number;
  deletes: number;
  memoryUsed: number;
  entriesCount: number;
  avgResponseTime: number;
  hitRate: number;
  lastReset: number;
  errorCount?: number;
  cacheEfficiency?: number;
}

/**
 * Cache options for initialization
 */
export interface CacheOptions {
  maxEntries?: number;
  maxMemoryMB?: number;
  ttlMs?: number;
  enableMetrics?: boolean;
  enableCompression?: boolean;
  enablePipelining?: boolean;
  keyPrefix?: string;
  cleanupInterval?: number;
  redis?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    cluster?: boolean;
    sentinels?: Array<{ host: string; port: number }>;
    keyPrefix?: string;
    lazyConnect?: boolean;
    retryStrategy?: (times: number) => number | void;
  };
}

/**
 * Multi-tier cache configuration
 */
export interface MultiTierConfig {
  l1?: CacheOptions;
  l2?: CacheOptions;
  fallbackToL2?: boolean;
  writeThrough?: boolean;
  readThrough?: boolean;
  asyncWrites?: boolean;
  warmupOnStart?: boolean;
  syncInterval?: number;
}

/**
 * Cache invalidation strategy
 */
export interface InvalidationStrategy {
  type: 'ttl' | 'lru' | 'lfu' | 'fifo' | 'manual';
  ttlMs?: number;
  maxAge?: number;
  maxEntries?: number;
  pattern?: string | RegExp;
  tags?: string[];
}

/**
 * Cache warmup configuration
 */
export interface WarmupConfig {
  enabled: boolean;
  priority: 'high' | 'medium' | 'low';
  keys?: string[];
  patterns?: string[];
  loader?: () => Promise<Array<{ key: string; value: any; ttl?: number }>>;
  parallel?: boolean;
  batchSize?: number;
  retryOnFailure?: boolean;
  timeout?: number;
}

/**
 * Cache serializer interface
 */
export interface CacheSerializer {
  serialize(value: any): string | Buffer;
  deserialize<T = any>(data: string | Buffer): T;
  compress?(data: string | Buffer): Promise<Buffer>;
  decompress?(data: Buffer): Promise<string | Buffer>;
}

/**
 * Cache metrics for monitoring
 */
export interface CacheMetrics {
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    max: number;
    min: number;
  };
  throughput: {
    readsPerSecond: number;
    writesPerSecond: number;
    evictionsPerSecond: number;
  };
  memory: {
    used: number;
    available: number;
    percentage: number;
  };
  efficiency: {
    hitRate: number;
    missRate: number;
    evictionRate: number;
  };
  errors: {
    total: number;
    rate: number;
    lastError?: {
      message: string;
      timestamp: number;
      operation: string;
    };
  };
}

/**
 * Cache event types for monitoring
 */
export type CacheEvent = 
  | 'hit'
  | 'miss'
  | 'set'
  | 'delete'
  | 'eviction'
  | 'error'
  | 'connect'
  | 'disconnect'
  | 'clear'
  | 'warmup'
  | 'cleanup';

/**
 * Cache performance target
 */
export interface PerformanceTarget {
  maxResponseTime: number; // in milliseconds
  minHitRate: number; // percentage
  maxMemoryUsage: number; // in MB
  maxEvictionRate: number; // per minute
}

/**
 * Cache operation result
 */
export interface CacheResult<T = any> {
  success: boolean;
  value?: T;
  error?: Error;
  source?: 'l1' | 'l2' | 'origin';
  responseTime?: number;
  fromCache?: boolean;
}

/**
 * Batch operation result
 */
export interface BatchResult<T = any> {
  successful: Map<string, T>;
  failed: Map<string, Error>;
  totalTime: number;
  averageTime: number;
}

/**
 * Cache layer interface
 */
export interface ICacheLayer {
  get<T = any>(key: string): Promise<T | null> | T | null;
  set<T = any>(key: string, value: T, options?: { ttl?: number }): Promise<boolean> | boolean;
  delete(key: string): Promise<boolean> | boolean;
  has(key: string): Promise<boolean> | boolean;
  clear(): Promise<void> | void;
  getStats(): Promise<CacheStats> | CacheStats;
}

/**
 * Cache manager interface
 */
export interface ICacheManager {
  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T, options?: { ttl?: number; tags?: string[] }): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  invalidate(pattern: string | RegExp): Promise<number>;
  invalidateByTags(tags: string[]): Promise<number>;
  clear(): Promise<void>;
  getStats(): Promise<{ l1: CacheStats; l2?: CacheStats; combined: CacheStats }>;
  warmUp(config: WarmupConfig): Promise<void>;
  isHealthy(): Promise<boolean>;
}