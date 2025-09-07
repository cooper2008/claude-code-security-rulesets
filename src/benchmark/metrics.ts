/**
 * Metrics collection and aggregation utilities
 */

import { EventEmitter } from 'events';
import { CacheMetrics, ValidationBenchmark, CLIBenchmark } from './types';

export class MetricsCollector extends EventEmitter {
  private metrics: Map<string, any[]> = new Map();
  private startTime: number = Date.now();

  /**
   * Record a metric
   */
  record(category: string, name: string, value: number, metadata?: any): void {
    const key = `${category}.${name}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const metric = {
      value,
      timestamp: Date.now(),
      metadata
    };

    this.metrics.get(key)!.push(metric);
    this.emit('metric', { category, name, ...metric });
  }

  /**
   * Record validation metrics
   */
  recordValidation(data: ValidationBenchmark): void {
    this.record('validation', 'ruleCount', data.ruleCount);
    this.record('validation', 'templateCount', data.templateCount);
    this.record('validation', 'conflictCount', data.conflictCount);
    this.record('validation', 'time', data.validationTime);
    this.record('validation', 'memory', data.memoryUsed);
  }

  /**
   * Record CLI metrics
   */
  recordCLI(data: CLIBenchmark): void {
    this.record('cli', data.command, data.responseTime, {
      args: data.args,
      outputSize: data.outputSize,
      exitCode: data.exitCode
    });
  }

  /**
   * Record cache metrics
   */
  recordCache(data: Partial<CacheMetrics>): void {
    if (data.hits !== undefined) this.record('cache', 'hits', data.hits);
    if (data.misses !== undefined) this.record('cache', 'misses', data.misses);
    if (data.hitRate !== undefined) this.record('cache', 'hitRate', data.hitRate);
    if (data.evictions !== undefined) this.record('cache', 'evictions', data.evictions);
    if (data.size !== undefined) this.record('cache', 'size', data.size);
  }

  /**
   * Get metrics for a specific key
   */
  getMetrics(category: string, name: string): any[] {
    const key = `${category}.${name}`;
    return this.metrics.get(key) || [];
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, any[]> {
    return this.metrics;
  }

  /**
   * Get aggregated statistics for a metric
   */
  getStats(category: string, name: string): any {
    const metrics = this.getMetrics(category, name);
    if (metrics.length === 0) return null;

    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    
    return {
      count: values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      median: values[Math.floor(values.length / 2)],
      p50: this.percentile(values, 50),
      p90: this.percentile(values, 90),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99),
      stdDev: this.standardDeviation(values)
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, index)];
  }

  /**
   * Calculate standard deviation
   */
  private standardDeviation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Get summary report
   */
  getSummary(): any {
    const summary: any = {
      duration: Date.now() - this.startTime,
      categories: {}
    };

    // Group metrics by category
    for (const [key, values] of this.metrics.entries()) {
      const [category, name] = key.split('.');
      if (!summary.categories[category]) {
        summary.categories[category] = {};
      }
      summary.categories[category][name] = this.getStats(category, name);
    }

    return summary;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
    this.emit('reset');
  }

  /**
   * Export metrics to JSON
   */
  toJSON(): any {
    const result: any = {};
    for (const [key, values] of this.metrics.entries()) {
      result[key] = values;
    }
    return result;
  }
}

/**
 * Time-series metrics collector for production monitoring
 */
export class TimeSeriesMetrics extends MetricsCollector {
  private windowSize: number;
  private windows: Map<string, any[]> = new Map();

  constructor(windowSize: number = 60000) { // Default 1 minute windows
    super();
    this.windowSize = windowSize;
    
    // Clean old windows periodically
    setInterval(() => this.cleanOldWindows(), this.windowSize);
  }

  /**
   * Record metric with time window
   */
  record(category: string, name: string, value: number, metadata?: any): void {
    super.record(category, name, value, metadata);
    
    const key = `${category}.${name}`;
    const now = Date.now();
    const windowKey = Math.floor(now / this.windowSize);
    
    const windowMapKey = `${key}:${windowKey}`;
    if (!this.windows.has(windowMapKey)) {
      this.windows.set(windowMapKey, []);
    }
    
    this.windows.get(windowMapKey)!.push({
      value,
      timestamp: now,
      metadata
    });
  }

  /**
   * Get metrics for current time window
   */
  getCurrentWindow(category: string, name: string): any[] {
    const key = `${category}.${name}`;
    const windowKey = Math.floor(Date.now() / this.windowSize);
    const windowMapKey = `${key}:${windowKey}`;
    
    return this.windows.get(windowMapKey) || [];
  }

  /**
   * Get rate metrics (operations per second)
   */
  getRate(category: string, name: string): number {
    const currentWindow = this.getCurrentWindow(category, name);
    if (currentWindow.length === 0) return 0;
    
    const duration = (Date.now() - currentWindow[0].timestamp) / 1000;
    return currentWindow.length / duration;
  }

  /**
   * Clean old windows
   */
  private cleanOldWindows(): void {
    const now = Date.now();
    const currentWindow = Math.floor(now / this.windowSize);
    
    for (const [key, _] of this.windows.entries()) {
      const windowKey = parseInt(key.split(':').pop()!);
      if (windowKey < currentWindow - 10) { // Keep last 10 windows
        this.windows.delete(key);
      }
    }
  }

  /**
   * Get time-series data for graphing
   */
  getTimeSeries(category: string, name: string, windows: number = 10): any[] {
    const key = `${category}.${name}`;
    const currentWindow = Math.floor(Date.now() / this.windowSize);
    const series = [];
    
    for (let i = windows - 1; i >= 0; i--) {
      const windowKey = currentWindow - i;
      const windowMapKey = `${key}:${windowKey}`;
      const windowData = this.windows.get(windowMapKey) || [];
      
      if (windowData.length > 0) {
        const values = windowData.map(d => d.value);
        series.push({
          timestamp: windowKey * this.windowSize,
          count: windowData.length,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length
        });
      }
    }
    
    return series;
  }
}