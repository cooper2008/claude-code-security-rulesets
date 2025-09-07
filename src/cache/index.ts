/**
 * High-performance multi-tier caching system for Claude Code Security Rulesets Generator
 * Achieves <10ms response times through L1 (memory) and L2 (Redis) caching
 * 
 * @module cache
 */

// Core cache implementations
export { MemoryCache, createMemoryCache, defaultMemoryCache } from './memory';
export { RedisCache, createRedisCache } from './redis';

// Multi-tier cache management
export { CacheManager, createCacheManager, defaultCacheManager } from './manager';

// Cache key generation and management
export {
  CacheKeyGenerator,
  CacheKeyManager,
  defaultKeyGenerator,
  defaultKeyManager
} from './keys';

// Serialization for efficient storage
export {
  JsonSerializer,
  MessagePackSerializer,
  SerializerFactory,
  defaultSerializer
} from './serializer';

// Cache invalidation strategies
export {
  InvalidationManager,
  FileWatcher,
  DependencyTracker,
  TTLInvalidation,
  createInvalidationManager,
  createFileWatcher,
  createDependencyTracker
} from './invalidation';

// Performance metrics and monitoring
export {
  CacheMetricsCollector,
  createMetricsCollector,
  defaultMetricsCollector
} from './metrics';

// Type definitions
export type {
  CacheEntry,
  CacheKey,
  CacheStats,
  CacheOptions,
  MultiTierConfig,
  InvalidationStrategy,
  WarmupConfig,
  CacheSerializer,
  CacheMetrics,
  CacheEvent,
  PerformanceTarget,
  CacheResult,
  BatchResult,
  ICacheLayer,
  ICacheManager
} from './types';

// Re-export types from main types file for convenience
export type {
  ClaudeCodeConfiguration,
  ValidationResult,
  SecurityTemplate
} from '../types';

/**
 * Quick start example:
 * 
 * ```typescript
 * import { createCacheManager, CacheKeyGenerator } from './cache';
 * 
 * // Create cache manager with L1 and L2 tiers
 * const cache = createCacheManager({
 *   l1: {
 *     maxEntries: 10000,
 *     maxMemoryMB: 100,
 *     ttlMs: 5 * 60 * 1000 // 5 minutes
 *   },
 *   l2: {
 *     redis: {
 *       host: 'localhost',
 *       port: 6379
 *     },
 *     ttlMs: 60 * 60 * 1000 // 1 hour
 *   },
 *   writeThrough: true,
 *   asyncWrites: true
 * });
 * 
 * // Generate cache keys
 * const keyGen = new CacheKeyGenerator();
 * const key = keyGen.validationKey(config);
 * 
 * // Cache validation results
 * const result = await cache.get(key);
 * if (!result) {
 *   const newResult = await validate(config);
 *   await cache.set(key, newResult, { ttl: 300000 });
 * }
 * ```
 */

/**
 * Performance characteristics:
 * 
 * L1 (Memory) Cache:
 * - Response time: <1ms
 * - Capacity: 10,000 entries or 100MB
 * - LRU eviction with access tracking
 * - Perfect for hot data
 * 
 * L2 (Redis) Cache:
 * - Response time: <5ms
 * - Capacity: Unlimited (bounded by Redis)
 * - Distributed for cluster deployments
 * - Persistence and replication support
 * 
 * Combined Performance:
 * - Cache hit rate: >80% for repeated operations
 * - Sub-10ms response for cached validations
 * - Automatic promotion from L2 to L1
 * - Smart invalidation on config changes
 */

/**
 * Cache invalidation strategies:
 * 
 * 1. TTL-based: Automatic expiration after configured time
 * 2. File-watch: Invalidate on configuration file changes
 * 3. Tag-based: Group related entries for bulk invalidation
 * 4. Pattern-based: Invalidate by key patterns
 * 5. Dependency-based: Cascade invalidation through dependencies
 */

// Default configuration for optimal performance
export const DEFAULT_CACHE_CONFIG = {
  l1: {
    maxEntries: 10000,
    maxMemoryMB: 100,
    ttlMs: 5 * 60 * 1000, // 5 minutes
    enableMetrics: true,
    cleanupInterval: 60000 // 1 minute
  },
  l2: {
    ttlMs: 60 * 60 * 1000, // 1 hour
    enableCompression: true,
    enablePipelining: true,
    keyPrefix: 'claude-code:'
  },
  fallbackToL2: true,
  writeThrough: true,
  readThrough: true,
  asyncWrites: true,
  warmupOnStart: false,
  syncInterval: 5000 // 5 seconds
};

// Performance targets for monitoring
export const PERFORMANCE_TARGETS = {
  maxResponseTime: 10, // 10ms
  minHitRate: 80, // 80%
  maxMemoryUsage: 100, // 100MB
  maxEvictionRate: 100 // 100 per minute
};

/**
 * Utility function to create a fully configured cache system
 */
export function createOptimizedCache(redisConfig?: any): CacheManager {
  const config = { ...DEFAULT_CACHE_CONFIG };
  
  if (redisConfig) {
    config.l2 = { ...config.l2, redis: redisConfig };
  }
  
  const manager = createCacheManager(config);
  
  // Set up file watching for automatic invalidation
  const invalidationManager = createInvalidationManager();
  
  // Watch common configuration paths
  invalidationManager.watchConfigFiles([
    './config',
    './.claude-code'
  ]);
  
  // Watch template directory
  invalidationManager.watchTemplateFiles('./templates');
  
  // Forward invalidation events to cache manager
  invalidationManager.on('invalidate', async (data) => {
    await manager.invalidate(data.pattern || '.*');
  });
  
  return manager;
}

/**
 * Utility function to warm up cache with common patterns
 */
export async function warmUpCache(
  cache: CacheManager,
  patterns: Array<{ key: string; value: any; ttl?: number }>
): Promise<void> {
  await cache.warmUp({
    enabled: true,
    priority: 'high',
    loader: async () => patterns,
    parallel: true,
    batchSize: 100,
    retryOnFailure: true
  });
}