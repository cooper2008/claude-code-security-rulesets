/**
 * Performance monitoring utilities for production use
 */

import { performance } from 'perf_hooks';
import * as v8 from 'v8';
import { EventEmitter } from 'events';
import { MonitoringData } from './types';

export class PerformanceMonitor extends EventEmitter {
  private startTime: number = 0;
  private startCpuUsage: NodeJS.CpuUsage | null = null;
  private interval: NodeJS.Timer | null = null;
  private samples: MonitoringData[] = [];
  private isMonitoring: boolean = false;

  /**
   * Start monitoring
   */
  start(): void {
    this.startTime = performance.now();
    this.startCpuUsage = process.cpuUsage();
    this.samples = [];
    this.isMonitoring = true;

    // Collect samples at regular intervals
    this.interval = setInterval(() => {
      if (this.isMonitoring) {
        this.collectSample();
      }
    }, 10); // Sample every 10ms
  }

  /**
   * Stop monitoring and return aggregated metrics
   */
  stop(): any {
    this.isMonitoring = false;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    const endTime = performance.now();
    const endCpuUsage = process.cpuUsage(this.startCpuUsage!);
    
    const duration = endTime - this.startTime;
    const cpuUsage = ((endCpuUsage.user + endCpuUsage.system) / 1000) / duration * 100;

    // Calculate event loop lag
    const eventLoopLag = this.calculateEventLoopLag();
    
    // Get heap statistics
    const heapStats = v8.getHeapStatistics();
    
    return {
      duration,
      cpuUsage,
      eventLoopLag,
      samples: this.samples,
      heapStats: {
        totalHeapSize: heapStats.total_heap_size,
        usedHeapSize: heapStats.used_heap_size,
        heapSizeLimit: heapStats.heap_size_limit,
        mallocedMemory: heapStats.malloced_memory,
        peakMallocedMemory: heapStats.peak_malloced_memory
      }
    };
  }

  /**
   * Collect a monitoring sample
   */
  private collectSample(): void {
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    
    this.samples.push({
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000,
      memoryUsage,
      eventLoopLag: this.calculateEventLoopLag(),
      activeHandles: (process as any)._getActiveHandles?.()?.length || 0,
      activeRequests: (process as any)._getActiveRequests?.()?.length || 0
    });

    // Emit sample event for real-time monitoring
    this.emit('sample', this.samples[this.samples.length - 1]);
  }

  /**
   * Calculate event loop lag
   */
  private calculateEventLoopLag(): number {
    const start = performance.now();
    setImmediate(() => {
      const lag = performance.now() - start;
      this.emit('eventLoopLag', lag);
    });
    return this.samples.length > 0 
      ? this.samples[this.samples.length - 1].eventLoopLag 
      : 0;
  }

  /**
   * Get current metrics without stopping
   */
  getCurrentMetrics(): MonitoringData | null {
    return this.samples.length > 0 
      ? this.samples[this.samples.length - 1] 
      : null;
  }

  /**
   * Get average metrics
   */
  getAverageMetrics(): MonitoringData | null {
    if (this.samples.length === 0) return null;

    const sum = this.samples.reduce((acc, sample) => ({
      cpuUsage: acc.cpuUsage + sample.cpuUsage,
      memoryUsage: {
        rss: acc.memoryUsage.rss + sample.memoryUsage.rss,
        heapTotal: acc.memoryUsage.heapTotal + sample.memoryUsage.heapTotal,
        heapUsed: acc.memoryUsage.heapUsed + sample.memoryUsage.heapUsed,
        external: acc.memoryUsage.external + sample.memoryUsage.external,
        arrayBuffers: acc.memoryUsage.arrayBuffers + sample.memoryUsage.arrayBuffers
      },
      eventLoopLag: acc.eventLoopLag + sample.eventLoopLag,
      activeHandles: acc.activeHandles + sample.activeHandles,
      activeRequests: acc.activeRequests + sample.activeRequests
    }));

    const count = this.samples.length;
    return {
      cpuUsage: sum.cpuUsage / count,
      memoryUsage: {
        rss: sum.memoryUsage.rss / count,
        heapTotal: sum.memoryUsage.heapTotal / count,
        heapUsed: sum.memoryUsage.heapUsed / count,
        external: sum.memoryUsage.external / count,
        arrayBuffers: sum.memoryUsage.arrayBuffers / count
      },
      eventLoopLag: sum.eventLoopLag / count,
      activeHandles: sum.activeHandles / count,
      activeRequests: sum.activeRequests / count
    };
  }

  /**
   * Reset monitor
   */
  reset(): void {
    this.stop();
    this.samples = [];
    this.startTime = 0;
    this.startCpuUsage = null;
  }
}

/**
 * Production performance monitor with automatic alerting
 */
export class ProductionMonitor extends PerformanceMonitor {
  private thresholds = {
    cpuUsage: 80, // Alert if CPU usage > 80%
    memoryUsage: 1024 * 1024 * 1024, // Alert if memory > 1GB
    eventLoopLag: 100, // Alert if event loop lag > 100ms
    responseTime: 500 // Alert if response time > 500ms
  };

  private alerts: Array<{
    type: string;
    message: string;
    value: number;
    threshold: number;
    timestamp: number;
  }> = [];

  constructor(thresholds?: Partial<ProductionMonitor['thresholds']>) {
    super();
    if (thresholds) {
      this.thresholds = { ...this.thresholds, ...thresholds };
    }

    this.on('sample', this.checkThresholds.bind(this));
  }

  /**
   * Check if any thresholds are exceeded
   */
  private checkThresholds(sample: MonitoringData): void {
    // Check CPU usage
    if (sample.cpuUsage > this.thresholds.cpuUsage) {
      this.addAlert('cpu', `CPU usage exceeded: ${sample.cpuUsage.toFixed(2)}%`, sample.cpuUsage, this.thresholds.cpuUsage);
    }

    // Check memory usage
    if (sample.memoryUsage.heapUsed > this.thresholds.memoryUsage) {
      this.addAlert('memory', `Memory usage exceeded: ${(sample.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`, sample.memoryUsage.heapUsed, this.thresholds.memoryUsage);
    }

    // Check event loop lag
    if (sample.eventLoopLag > this.thresholds.eventLoopLag) {
      this.addAlert('eventLoop', `Event loop lag exceeded: ${sample.eventLoopLag.toFixed(2)}ms`, sample.eventLoopLag, this.thresholds.eventLoopLag);
    }
  }

  /**
   * Add alert
   */
  private addAlert(type: string, message: string, value: number, threshold: number): void {
    const alert = {
      type,
      message,
      value,
      threshold,
      timestamp: Date.now()
    };

    this.alerts.push(alert);
    this.emit('alert', alert);

    // Log to console in production
    console.warn(`⚠️ Performance Alert: ${message}`);
  }

  /**
   * Get all alerts
   */
  getAlerts(): typeof this.alerts {
    return this.alerts;
  }

  /**
   * Clear alerts
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Get performance report
   */
  getReport(): any {
    const metrics = this.getAverageMetrics();
    return {
      summary: {
        healthy: this.alerts.length === 0,
        alertCount: this.alerts.length,
        monitoringDuration: performance.now() - (this as any).startTime
      },
      metrics,
      alerts: this.alerts,
      thresholds: this.thresholds
    };
  }
}