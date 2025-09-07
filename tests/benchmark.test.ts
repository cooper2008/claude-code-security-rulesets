/**
 * Benchmark system tests
 */

import { BenchmarkRunner } from '../src/benchmark';
import { DataGenerator } from '../src/benchmark/data-generator';
import { CacheSimulator } from '../src/benchmark/cache-simulator';
import { PerformanceMonitor, ProductionMonitor } from '../src/benchmark/monitor';
import { MetricsCollector, TimeSeriesMetrics } from '../src/benchmark/metrics';
import { BenchmarkScenario } from '../src/benchmark/types';

describe('Benchmark System', () => {
  describe('BenchmarkRunner', () => {
    it('should initialize with default config', () => {
      const runner = new BenchmarkRunner();
      expect(runner).toBeDefined();
    });

    it('should run a simple scenario', async () => {
      const scenario: BenchmarkScenario = {
        name: 'test-scenario',
        description: 'Test scenario',
        category: 'validation',
        priority: 'low',
        run: jest.fn().mockResolvedValue(undefined)
      };

      const runner = new BenchmarkRunner({
        iterations: 5,
        warmupRuns: 0,
        verbose: false
      });

      const result = await runner.runScenario(scenario);
      
      expect(result).toBeDefined();
      expect(result.scenario).toBe('test-scenario');
      expect(result.iterations).toBe(5);
      expect(scenario.run).toHaveBeenCalledTimes(5);
    });
  });

  describe('DataGenerator', () => {
    let generator: DataGenerator;

    beforeEach(() => {
      generator = new DataGenerator();
    });

    it('should generate templates of different sizes', () => {
      const small = generator.generateTemplate('small');
      const medium = generator.generateTemplate('medium');
      const large = generator.generateTemplate('large');

      expect(small.rules.length).toBe(10);
      expect(medium.rules.length).toBe(100);
      expect(large.rules.length).toBe(1000);
    });

    it('should generate templates with conflicts', () => {
      const template = generator.generateTemplateWithConflicts(20, 5);
      expect(template.rules.length).toBeGreaterThanOrEqual(20);
    });

    it('should generate nested templates', () => {
      const template = generator.generateNestedTemplate(3, 5);
      expect(template.templates).toBeDefined();
      expect(template.templates.length).toBeGreaterThan(0);
    });

    it('should generate git diff', () => {
      const diff = generator.generateGitDiff(10);
      expect(diff).toContain('diff --git');
      expect(diff.split('diff --git').length - 1).toBe(10);
    });
  });

  describe('CacheSimulator', () => {
    let cache: CacheSimulator;

    beforeEach(() => {
      cache = new CacheSimulator();
    });

    it('should handle cache operations', async () => {
      await cache.set('key1', { data: 'test' });
      const value = await cache.get('key1');
      
      expect(value).toEqual({ data: 'test' });
      
      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(0);
    });

    it('should handle cache miss', async () => {
      const value = await cache.get('non-existent');
      expect(value).toBeDefined();
      
      const metrics = cache.getMetrics();
      expect(metrics.misses).toBeGreaterThan(0);
    });

    it('should handle TTL expiry', async () => {
      await cache.setWithTTL('ttl-key', { data: 'test' }, 50);
      
      // Should hit before expiry
      let value = await cache.get('ttl-key');
      expect(value).toEqual({ data: 'test' });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should miss after expiry
      value = await cache.get('ttl-key');
      const metrics = cache.getMetrics();
      expect(metrics.misses).toBeGreaterThan(0);
    });
  });

  describe('PerformanceMonitor', () => {
    it('should monitor performance metrics', async () => {
      const monitor = new PerformanceMonitor();
      
      monitor.start();
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const metrics = monitor.stop();
      
      expect(metrics.duration).toBeGreaterThan(40);
      expect(metrics.cpuUsage).toBeDefined();
      expect(metrics.heapStats).toBeDefined();
    });
  });

  describe('ProductionMonitor', () => {
    it('should emit alerts when thresholds exceeded', (done) => {
      const monitor = new ProductionMonitor({
        cpuUsage: 0.01, // Very low threshold to trigger
        eventLoopLag: 0.01
      });

      monitor.on('alert', (alert) => {
        expect(alert.type).toBeDefined();
        expect(alert.message).toBeDefined();
        monitor.reset();
        done();
      });

      monitor.start();
      
      // Simulate heavy work to trigger alert
      const startTime = Date.now();
      while (Date.now() - startTime < 100) {
        // Busy loop
      }
    });
  });

  describe('MetricsCollector', () => {
    let collector: MetricsCollector;

    beforeEach(() => {
      collector = new MetricsCollector();
    });

    it('should record and aggregate metrics', () => {
      collector.record('test', 'metric1', 10);
      collector.record('test', 'metric1', 20);
      collector.record('test', 'metric1', 30);

      const stats = collector.getStats('test', 'metric1');
      
      expect(stats.count).toBe(3);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(30);
      expect(stats.mean).toBe(20);
    });

    it('should calculate percentiles correctly', () => {
      for (let i = 1; i <= 100; i++) {
        collector.record('test', 'values', i);
      }

      const stats = collector.getStats('test', 'values');
      
      expect(stats.p50).toBe(50);
      expect(stats.p90).toBe(90);
      expect(stats.p95).toBe(95);
      expect(stats.p99).toBe(99);
    });
  });

  describe('TimeSeriesMetrics', () => {
    it('should track metrics over time windows', async () => {
      const metrics = new TimeSeriesMetrics(100); // 100ms windows
      
      metrics.record('test', 'rate', 1);
      await new Promise(resolve => setTimeout(resolve, 50));
      metrics.record('test', 'rate', 2);
      
      const currentWindow = metrics.getCurrentWindow('test', 'rate');
      expect(currentWindow.length).toBe(2);
      
      const rate = metrics.getRate('test', 'rate');
      expect(rate).toBeGreaterThan(0);
    });
  });
});