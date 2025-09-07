/**
 * Performance monitoring and analytics for cache system
 * Provides detailed metrics and performance insights
 */

import { EventEmitter } from 'events';
import { CacheMetrics, CacheStats, PerformanceTarget } from './types';

/**
 * Percentile calculator for response times
 */
class PercentileCalculator {
  private values: number[] = [];
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  add(value: number): void {
    this.values.push(value);
    
    // Keep only recent values
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  getPercentile(percentile: number): number {
    if (this.values.length === 0) return 0;

    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getMean(): number {
    if (this.values.length === 0) return 0;
    const sum = this.values.reduce((a, b) => a + b, 0);
    return sum / this.values.length;
  }

  getMax(): number {
    return this.values.length > 0 ? Math.max(...this.values) : 0;
  }

  getMin(): number {
    return this.values.length > 0 ? Math.min(...this.values) : 0;
  }

  clear(): void {
    this.values = [];
  }
}

/**
 * Rate calculator for throughput metrics
 */
class RateCalculator {
  private timestamps: number[] = [];
  private windowMs: number;

  constructor(windowMs: number = 60000) { // 1 minute window
    this.windowMs = windowMs;
  }

  record(): void {
    const now = Date.now();
    this.timestamps.push(now);
    this.cleanup(now);
  }

  getRate(): number {
    const now = Date.now();
    this.cleanup(now);
    
    if (this.timestamps.length === 0) return 0;
    
    const windowSeconds = this.windowMs / 1000;
    return this.timestamps.length / windowSeconds;
  }

  private cleanup(now: number): void {
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter(ts => ts > cutoff);
  }

  clear(): void {
    this.timestamps = [];
  }
}

/**
 * Cache metrics collector and analyzer
 */
export class CacheMetricsCollector extends EventEmitter {
  private responseTimeCalculator: PercentileCalculator;
  private readRateCalculator: RateCalculator;
  private writeRateCalculator: RateCalculator;
  private evictionRateCalculator: RateCalculator;
  private errorRateCalculator: RateCalculator;
  
  private totalHits: number = 0;
  private totalMisses: number = 0;
  private totalSets: number = 0;
  private totalEvictions: number = 0;
  private totalErrors: number = 0;
  
  private lastError?: {
    message: string;
    timestamp: number;
    operation: string;
  };

  private performanceTargets?: PerformanceTarget;
  private violationCount: number = 0;
  private checkInterval: NodeJS.Timer | null = null;

  constructor(options: {
    responseTimeWindow?: number;
    throughputWindow?: number;
    performanceTargets?: PerformanceTarget;
    checkInterval?: number;
  } = {}) {
    super();

    this.responseTimeCalculator = new PercentileCalculator(
      options.responseTimeWindow || 1000
    );
    
    const throughputWindow = options.throughputWindow || 60000;
    this.readRateCalculator = new RateCalculator(throughputWindow);
    this.writeRateCalculator = new RateCalculator(throughputWindow);
    this.evictionRateCalculator = new RateCalculator(throughputWindow);
    this.errorRateCalculator = new RateCalculator(throughputWindow);

    this.performanceTargets = options.performanceTargets;

    // Start performance monitoring
    if (this.performanceTargets && options.checkInterval !== 0) {
      const interval = options.checkInterval || 10000; // 10 seconds default
      this.checkInterval = setInterval(() => this.checkPerformance(), interval);
      this.checkInterval.unref();
    }
  }

  /**
   * Record a cache hit
   */
  recordHit(responseTime: number): void {
    this.totalHits++;
    this.responseTimeCalculator.add(responseTime);
    this.readRateCalculator.record();
    this.emit('hit', { responseTime });
  }

  /**
   * Record a cache miss
   */
  recordMiss(): void {
    this.totalMisses++;
    this.readRateCalculator.record();
    this.emit('miss');
  }

  /**
   * Record a cache set operation
   */
  recordSet(responseTime: number): void {
    this.totalSets++;
    this.responseTimeCalculator.add(responseTime);
    this.writeRateCalculator.record();
    this.emit('set', { responseTime });
  }

  /**
   * Record a cache eviction
   */
  recordEviction(count: number = 1): void {
    this.totalEvictions += count;
    for (let i = 0; i < count; i++) {
      this.evictionRateCalculator.record();
    }
    this.emit('eviction', { count });
  }

  /**
   * Record an error
   */
  recordError(error: Error, operation: string): void {
    this.totalErrors++;
    this.errorRateCalculator.record();
    
    this.lastError = {
      message: error.message,
      timestamp: Date.now(),
      operation
    };

    this.emit('error', { error, operation });
  }

  /**
   * Get current metrics
   */
  getMetrics(): CacheMetrics {
    const hitRate = this.calculateHitRate();
    const missRate = 100 - hitRate;

    return {
      responseTime: {
        p50: this.responseTimeCalculator.getPercentile(50),
        p95: this.responseTimeCalculator.getPercentile(95),
        p99: this.responseTimeCalculator.getPercentile(99),
        mean: this.responseTimeCalculator.getMean(),
        max: this.responseTimeCalculator.getMax(),
        min: this.responseTimeCalculator.getMin()
      },
      throughput: {
        readsPerSecond: this.readRateCalculator.getRate(),
        writesPerSecond: this.writeRateCalculator.getRate(),
        evictionsPerSecond: this.evictionRateCalculator.getRate()
      },
      memory: {
        used: 0, // Will be set by cache implementation
        available: 0, // Will be set by cache implementation
        percentage: 0 // Will be set by cache implementation
      },
      efficiency: {
        hitRate,
        missRate,
        evictionRate: this.calculateEvictionRate()
      },
      errors: {
        total: this.totalErrors,
        rate: this.errorRateCalculator.getRate(),
        lastError: this.lastError
      }
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      hits: this.totalHits,
      misses: this.totalMisses,
      evictions: this.totalEvictions,
      sets: this.totalSets,
      deletes: 0, // Will be tracked by cache implementation
      memoryUsed: 0, // Will be set by cache implementation
      entriesCount: 0, // Will be set by cache implementation
      avgResponseTime: this.responseTimeCalculator.getMean(),
      hitRate: this.calculateHitRate(),
      lastReset: Date.now(),
      errorCount: this.totalErrors
    };
  }

  /**
   * Update memory metrics
   */
  updateMemoryMetrics(used: number, available: number): void {
    const metrics = this.getMetrics();
    metrics.memory.used = used;
    metrics.memory.available = available;
    metrics.memory.percentage = available > 0 ? (used / available) * 100 : 0;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.responseTimeCalculator.clear();
    this.readRateCalculator.clear();
    this.writeRateCalculator.clear();
    this.evictionRateCalculator.clear();
    this.errorRateCalculator.clear();

    this.totalHits = 0;
    this.totalMisses = 0;
    this.totalSets = 0;
    this.totalEvictions = 0;
    this.totalErrors = 0;
    this.violationCount = 0;

    this.lastError = undefined;

    this.emit('reset');
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Export metrics for persistence or analysis
   */
  export(): any {
    return {
      metrics: this.getMetrics(),
      stats: this.getStats(),
      totals: {
        hits: this.totalHits,
        misses: this.totalMisses,
        sets: this.totalSets,
        evictions: this.totalEvictions,
        errors: this.totalErrors
      },
      performanceViolations: this.violationCount,
      timestamp: Date.now()
    };
  }

  /**
   * Generate a performance report
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const stats = this.getStats();

    const report = [
      '=== Cache Performance Report ===',
      '',
      '📊 Response Times:',
      `  P50: ${metrics.responseTime.p50.toFixed(2)}ms`,
      `  P95: ${metrics.responseTime.p95.toFixed(2)}ms`,
      `  P99: ${metrics.responseTime.p99.toFixed(2)}ms`,
      `  Mean: ${metrics.responseTime.mean.toFixed(2)}ms`,
      `  Range: ${metrics.responseTime.min.toFixed(2)}ms - ${metrics.responseTime.max.toFixed(2)}ms`,
      '',
      '🚀 Throughput:',
      `  Reads/sec: ${metrics.throughput.readsPerSecond.toFixed(2)}`,
      `  Writes/sec: ${metrics.throughput.writesPerSecond.toFixed(2)}`,
      `  Evictions/sec: ${metrics.throughput.evictionsPerSecond.toFixed(2)}`,
      '',
      '📈 Efficiency:',
      `  Hit Rate: ${metrics.efficiency.hitRate.toFixed(2)}%`,
      `  Miss Rate: ${metrics.efficiency.missRate.toFixed(2)}%`,
      `  Total Hits: ${stats.hits.toLocaleString()}`,
      `  Total Misses: ${stats.misses.toLocaleString()}`,
      '',
      '⚠️ Errors:',
      `  Total: ${metrics.errors.total}`,
      `  Rate: ${metrics.errors.rate.toFixed(2)}/sec`
    ];

    if (metrics.errors.lastError) {
      const timeSince = Date.now() - metrics.errors.lastError.timestamp;
      report.push(
        `  Last Error: ${metrics.errors.lastError.message}`,
        `  Operation: ${metrics.errors.lastError.operation}`,
        `  Time Since: ${(timeSince / 1000).toFixed(1)}s ago`
      );
    }

    if (this.performanceTargets) {
      report.push(
        '',
        '🎯 Performance Targets:',
        `  Max Response Time: ${this.performanceTargets.maxResponseTime}ms`,
        `  Min Hit Rate: ${this.performanceTargets.minHitRate}%`,
        `  Violations: ${this.violationCount}`
      );
    }

    return report.join('\n');
  }

  // Private methods

  private calculateHitRate(): number {
    const total = this.totalHits + this.totalMisses;
    return total > 0 ? (this.totalHits / total) * 100 : 0;
  }

  private calculateEvictionRate(): number {
    const total = this.totalSets;
    return total > 0 ? (this.totalEvictions / total) * 100 : 0;
  }

  private checkPerformance(): void {
    if (!this.performanceTargets) return;

    const metrics = this.getMetrics();
    const violations: string[] = [];

    // Check response time
    if (metrics.responseTime.p99 > this.performanceTargets.maxResponseTime) {
      violations.push(
        `Response time P99 (${metrics.responseTime.p99.toFixed(2)}ms) ` +
        `exceeds target (${this.performanceTargets.maxResponseTime}ms)`
      );
    }

    // Check hit rate
    if (metrics.efficiency.hitRate < this.performanceTargets.minHitRate) {
      violations.push(
        `Hit rate (${metrics.efficiency.hitRate.toFixed(2)}%) ` +
        `below target (${this.performanceTargets.minHitRate}%)`
      );
    }

    // Check memory usage
    if (this.performanceTargets.maxMemoryUsage) {
      const memoryMB = metrics.memory.used / (1024 * 1024);
      if (memoryMB > this.performanceTargets.maxMemoryUsage) {
        violations.push(
          `Memory usage (${memoryMB.toFixed(2)}MB) ` +
          `exceeds target (${this.performanceTargets.maxMemoryUsage}MB)`
        );
      }
    }

    // Check eviction rate
    if (this.performanceTargets.maxEvictionRate) {
      const evictionRatePerMin = this.evictionRateCalculator.getRate() * 60;
      if (evictionRatePerMin > this.performanceTargets.maxEvictionRate) {
        violations.push(
          `Eviction rate (${evictionRatePerMin.toFixed(2)}/min) ` +
          `exceeds target (${this.performanceTargets.maxEvictionRate}/min)`
        );
      }
    }

    if (violations.length > 0) {
      this.violationCount++;
      this.emit('performanceViolation', { violations, metrics });
    }
  }
}

/**
 * Create a metrics collector instance
 */
export const createMetricsCollector = (options?: any): CacheMetricsCollector => {
  return new CacheMetricsCollector(options);
};

// Export default collector for convenience
export const defaultMetricsCollector = new CacheMetricsCollector();