/**
 * Performance tests for cache system
 * Verifies sub-10ms response times and cache efficiency
 */

import { createCacheManager, CacheManager } from './manager';
import { CacheKeyGenerator } from './keys';
import { ClaudeCodeConfiguration, ValidationResult } from '../types';

/**
 * Performance test suite for cache operations
 */
export class CachePerformanceTest {
  private cache: CacheManager;
  private keyGen: CacheKeyGenerator;
  private testData: Map<string, any>;

  constructor() {
    // Create cache with performance-optimized settings
    this.cache = createCacheManager({
      l1: {
        maxEntries: 10000,
        maxMemoryMB: 100,
        ttlMs: 5 * 60 * 1000,
        enableMetrics: true
      },
      l2: {
        // Redis config would go here if available
        ttlMs: 60 * 60 * 1000,
        enableCompression: true
      },
      writeThrough: true,
      asyncWrites: true
    });

    this.keyGen = new CacheKeyGenerator();
    this.testData = new Map();
  }

  /**
   * Generate test configuration
   */
  private generateTestConfig(id: number): ClaudeCodeConfiguration {
    return {
      permissions: {
        deny: [`test-deny-${id}`, 'common-deny'],
        allow: [`test-allow-${id}`, 'common-allow'],
        ask: [`test-ask-${id}`]
      },
      metadata: {
        version: '1.0.0',
        timestamp: Date.now(),
        environment: 'test'
      }
    };
  }

  /**
   * Generate test validation result
   */
  private generateTestResult(config: ClaudeCodeConfiguration): ValidationResult {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      conflicts: [],
      performance: {
        validationTime: Math.random() * 50 + 50, // 50-100ms simulated
        rulesProcessed: 10,
        performanceTarget: {
          target: 100,
          achieved: true
        }
      },
      suggestions: []
    };
  }

  /**
   * Test L1 cache performance
   */
  async testL1Performance(iterations: number = 10000): Promise<void> {
    console.log('\n🚀 Testing L1 (Memory) Cache Performance');
    console.log('=' . repeat(50));

    const responseTimes: number[] = [];

    // Warm up cache with test data
    console.log('Warming up cache...');
    for (let i = 0; i < 1000; i++) {
      const config = this.generateTestConfig(i);
      const key = this.keyGen.validationKey(config);
      const result = this.generateTestResult(config);
      
      await this.cache.set(key, result);
      this.testData.set(key, result);
    }

    // Test cache hits
    console.log(`Testing ${iterations} cache hits...`);
    const keys = Array.from(this.testData.keys());
    
    for (let i = 0; i < iterations; i++) {
      const key = keys[i % keys.length];
      const startTime = performance.now();
      
      const result = await this.cache.get(key);
      
      const responseTime = performance.now() - startTime;
      responseTimes.push(responseTime);
    }

    // Calculate statistics
    this.printPerformanceStats('L1 Cache Hit', responseTimes);
  }

  /**
   * Test cache miss and set performance
   */
  async testCacheMissPerformance(iterations: number = 1000): Promise<void> {
    console.log('\n🔍 Testing Cache Miss & Set Performance');
    console.log('=' . repeat(50));

    const missResponseTimes: number[] = [];
    const setResponseTimes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const config = this.generateTestConfig(Date.now() + i);
      const key = this.keyGen.validationKey(config);

      // Test cache miss
      const missStart = performance.now();
      const missResult = await this.cache.get(key);
      const missTime = performance.now() - missStart;
      missResponseTimes.push(missTime);

      // Test cache set
      const result = this.generateTestResult(config);
      const setStart = performance.now();
      await this.cache.set(key, result);
      const setTime = performance.now() - setStart;
      setResponseTimes.push(setTime);
    }

    this.printPerformanceStats('Cache Miss', missResponseTimes);
    this.printPerformanceStats('Cache Set', setResponseTimes);
  }

  /**
   * Test batch operations performance
   */
  async testBatchOperations(): Promise<void> {
    console.log('\n📦 Testing Batch Operations Performance');
    console.log('=' . repeat(50));

    // Prepare batch data
    const batchSize = 100;
    const entries: Array<{ key: string; value: any }> = [];
    
    for (let i = 0; i < batchSize; i++) {
      const config = this.generateTestConfig(Date.now() + i);
      const key = this.keyGen.validationKey(config);
      const result = this.generateTestResult(config);
      entries.push({ key, value: result });
    }

    // Test batch set
    const batchSetStart = performance.now();
    const setPromises = entries.map(entry => 
      this.cache.set(entry.key, entry.value)
    );
    await Promise.all(setPromises);
    const batchSetTime = performance.now() - batchSetStart;

    // Test batch get
    const batchGetStart = performance.now();
    const getPromises = entries.map(entry => this.cache.get(entry.key));
    await Promise.all(getPromises);
    const batchGetTime = performance.now() - batchGetStart;

    console.log(`Batch Set (${batchSize} items): ${batchSetTime.toFixed(2)}ms`);
    console.log(`  Average per item: ${(batchSetTime / batchSize).toFixed(2)}ms`);
    console.log(`Batch Get (${batchSize} items): ${batchGetTime.toFixed(2)}ms`);
    console.log(`  Average per item: ${(batchGetTime / batchSize).toFixed(2)}ms`);
  }

  /**
   * Test invalidation performance
   */
  async testInvalidationPerformance(): Promise<void> {
    console.log('\n🗑️ Testing Cache Invalidation Performance');
    console.log('=' . repeat(50));

    // Add tagged entries
    const taggedEntries = 100;
    const tag = 'test-tag';
    
    for (let i = 0; i < taggedEntries; i++) {
      const config = this.generateTestConfig(Date.now() + i);
      const key = this.keyGen.validationKey(config);
      const result = this.generateTestResult(config);
      await this.cache.set(key, result, { tags: [tag] });
    }

    // Test tag-based invalidation
    const invalidateStart = performance.now();
    const invalidated = await this.cache.invalidateByTags([tag]);
    const invalidateTime = performance.now() - invalidateStart;

    console.log(`Invalidated ${invalidated} entries by tag: ${invalidateTime.toFixed(2)}ms`);
    console.log(`  Average per entry: ${(invalidateTime / invalidated).toFixed(2)}ms`);
  }

  /**
   * Test memory efficiency
   */
  async testMemoryEfficiency(): Promise<void> {
    console.log('\n💾 Testing Memory Efficiency');
    console.log('=' . repeat(50));

    const initialStats = await this.cache.getStats();
    console.log(`Initial memory usage: ${(initialStats.l1.memoryUsed / 1024).toFixed(2)} KB`);

    // Add large objects
    const largeObjectCount = 1000;
    for (let i = 0; i < largeObjectCount; i++) {
      const config = this.generateTestConfig(i);
      const key = this.keyGen.validationKey(config);
      
      // Create a larger result object
      const result = this.generateTestResult(config);
      result.suggestions = Array(100).fill({
        type: 'optimization',
        message: 'Sample suggestion message that takes up some memory'
      });
      
      await this.cache.set(key, result);
    }

    const finalStats = await this.cache.getStats();
    const memoryPerEntry = finalStats.l1.memoryUsed / finalStats.l1.entriesCount;

    console.log(`Final memory usage: ${(finalStats.l1.memoryUsed / 1024).toFixed(2)} KB`);
    console.log(`Entries: ${finalStats.l1.entriesCount}`);
    console.log(`Average memory per entry: ${(memoryPerEntry / 1024).toFixed(2)} KB`);
    console.log(`Cache hit rate: ${finalStats.l1.hitRate.toFixed(2)}%`);
  }

  /**
   * Run comprehensive performance test suite
   */
  async runFullTestSuite(): Promise<void> {
    console.log('\n🏁 Starting Cache Performance Test Suite');
    console.log('=' . repeat(60));

    await this.testL1Performance(10000);
    await this.testCacheMissPerformance(1000);
    await this.testBatchOperations();
    await this.testInvalidationPerformance();
    await this.testMemoryEfficiency();

    // Get final metrics
    const metrics = this.cache.getMetrics();
    const report = this.cache.generateReport();

    console.log('\n📊 Final Performance Report');
    console.log('=' . repeat(60));
    console.log(report);

    // Verify performance targets
    console.log('\n✅ Performance Target Verification');
    console.log('=' . repeat(60));
    
    const meetsTargets = {
      responseTime: metrics.responseTime.p99 < 10,
      hitRate: metrics.efficiency.hitRate > 80,
      memoryUsage: metrics.memory.used < 100 * 1024 * 1024
    };

    console.log(`Response Time P99 < 10ms: ${meetsTargets.responseTime ? '✅' : '❌'} (${metrics.responseTime.p99.toFixed(2)}ms)`);
    console.log(`Hit Rate > 80%: ${meetsTargets.hitRate ? '✅' : '❌'} (${metrics.efficiency.hitRate.toFixed(2)}%)`);
    console.log(`Memory Usage < 100MB: ${meetsTargets.memoryUsage ? '✅' : '❌'} (${(metrics.memory.used / 1024 / 1024).toFixed(2)}MB)`);

    const allTargetsMet = Object.values(meetsTargets).every(met => met);
    console.log(`\nAll Performance Targets Met: ${allTargetsMet ? '✅ SUCCESS' : '❌ FAILED'}`);

    // Clean up
    await this.cache.destroy();
  }

  /**
   * Print performance statistics
   */
  private printPerformanceStats(operation: string, times: number[]): void {
    const sorted = [...times].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    console.log(`\n${operation} Performance:`);
    console.log(`  P50: ${p50.toFixed(3)}ms ${p50 < 1 ? '⚡' : p50 < 10 ? '✅' : '⚠️'}`);
    console.log(`  P95: ${p95.toFixed(3)}ms ${p95 < 5 ? '⚡' : p95 < 10 ? '✅' : '⚠️'}`);
    console.log(`  P99: ${p99.toFixed(3)}ms ${p99 < 10 ? '✅' : '⚠️'}`);
    console.log(`  Mean: ${mean.toFixed(3)}ms`);
    console.log(`  Min: ${min.toFixed(3)}ms`);
    console.log(`  Max: ${max.toFixed(3)}ms`);
    
    const under1ms = times.filter(t => t < 1).length;
    const under5ms = times.filter(t => t < 5).length;
    const under10ms = times.filter(t => t < 10).length;
    
    console.log(`  < 1ms: ${((under1ms / times.length) * 100).toFixed(1)}%`);
    console.log(`  < 5ms: ${((under5ms / times.length) * 100).toFixed(1)}%`);
    console.log(`  < 10ms: ${((under10ms / times.length) * 100).toFixed(1)}%`);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const test = new CachePerformanceTest();
  test.runFullTestSuite().catch(console.error);
}