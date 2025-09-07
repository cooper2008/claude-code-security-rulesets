/**
 * Performance tests for template system
 * Tests template processing speed, memory usage, and scalability
 */

import { TemplateEngine } from '../../src/templates/engine';
import { TemplateMerger } from '../../src/templates/merger';
import { 
  mockBaseConfig,
  mockTemplate,
  mockLargeTemplate,
  mockParameterizedTemplate
} from './fixtures';

describe('Template Performance Tests', () => {
  let templateEngine: TemplateEngine;
  let templateMerger: TemplateMerger;

  // Performance targets (in milliseconds)
  const PERFORMANCE_TARGETS = {
    TEMPLATE_LOAD: 50,          // Template loading
    TEMPLATE_APPLY: 100,        // Basic template application
    TEMPLATE_MERGE: 150,        // Template merging with base config
    PARAMETER_PROCESS: 50,      // Parameter processing
    VALIDATION: 100,            // Template validation
    LARGE_TEMPLATE: 500,        // Large template operations
    CONCURRENT_OPS: 1000,       // Multiple concurrent operations
    CACHE_PERFORMANCE: 10       // Cached operations
  };

  beforeEach(() => {
    templateEngine = new TemplateEngine();
    templateMerger = new TemplateMerger();
  });

  afterEach(() => {
    templateEngine.clearCache();
  });

  describe('Template Loading Performance', () => {
    test('should load built-in templates quickly', async () => {
      const startTime = performance.now();
      
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });
      
      const loadTime = performance.now() - startTime;
      
      expect(templates.length).toBeGreaterThan(0);
      expect(loadTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_LOAD);
    });

    test('should retrieve specific template quickly', async () => {
      const startTime = performance.now();
      
      const template = await templateEngine.getTemplate('development');
      
      const retrievalTime = performance.now() - startTime;
      
      expect(template).toBeTruthy();
      expect(retrievalTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_LOAD);
    });

    test('should register template quickly', async () => {
      const startTime = performance.now();
      
      await templateEngine.registerTemplate(mockTemplate);
      
      const registrationTime = performance.now() - startTime;
      
      expect(registrationTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_LOAD);
    });
  });

  describe('Template Application Performance', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockTemplate);
      await templateEngine.registerTemplate(mockParameterizedTemplate);
    });

    test('should apply simple template within performance target', async () => {
      const startTime = performance.now();
      
      const result = await templateEngine.applyTemplate(mockTemplate.id, {
        validateResult: false
      });
      
      const applicationTime = performance.now() - startTime;
      
      expect(result.config).toBeDefined();
      expect(applicationTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_APPLY);
      expect(result.performance.totalTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_APPLY);
    });

    test('should apply template with base config within performance target', async () => {
      const startTime = performance.now();
      
      const result = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: false
      });
      
      const applicationTime = performance.now() - startTime;
      
      expect(result.config).toBeDefined();
      expect(applicationTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_MERGE);
      expect(result.performance.totalTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_MERGE);
    });

    test('should process parameters within performance target', async () => {
      const startTime = performance.now();
      
      const result = await templateEngine.applyTemplate(mockParameterizedTemplate.id, {
        parameters: {
          projectPath: '/test-project',
          templateName: 'Performance Test Template',
          allowedCommand: 'npm'
        },
        validateResult: false
      });
      
      const applicationTime = performance.now() - startTime;
      
      expect(result.config).toBeDefined();
      expect(result.appliedParameters).toBeDefined();
      expect(applicationTime).toBeLessThan(PERFORMANCE_TARGETS.PARAMETER_PROCESS);
    });

    test('should validate template application within performance target', async () => {
      const startTime = performance.now();
      
      const result = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: true
      });
      
      const applicationTime = performance.now() - startTime;
      
      expect(result.config).toBeDefined();
      expect(result.validation).toBeDefined();
      expect(applicationTime).toBeLessThan(PERFORMANCE_TARGETS.VALIDATION);
      
      if (result.performance.validationTime) {
        expect(result.performance.validationTime).toBeLessThan(PERFORMANCE_TARGETS.VALIDATION);
      }
    });
  });

  describe('Large Template Performance', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockLargeTemplate);
    });

    test('should handle large template efficiently', async () => {
      const startTime = performance.now();
      
      const result = await templateEngine.applyTemplate(mockLargeTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: false
      });
      
      const applicationTime = performance.now() - startTime;
      
      expect(result.config).toBeDefined();
      expect(applicationTime).toBeLessThan(PERFORMANCE_TARGETS.LARGE_TEMPLATE);
      expect(result.performance.totalTime).toBeLessThan(PERFORMANCE_TARGETS.LARGE_TEMPLATE);
    });

    test('should merge large templates efficiently', async () => {
      const startTime = performance.now();
      
      const result = await templateMerger.merge(
        mockBaseConfig,
        mockLargeTemplate.rules,
        { strategy: 'merge', validateResult: false }
      );
      
      const mergeTime = performance.now() - startTime;
      
      expect(result.config).toBeDefined();
      expect(mergeTime).toBeLessThan(PERFORMANCE_TARGETS.LARGE_TEMPLATE);
      expect(result.performance.mergeTime).toBeLessThan(PERFORMANCE_TARGETS.LARGE_TEMPLATE);
    });

    test('should validate large template efficiently', async () => {
      const startTime = performance.now();
      
      const validation = await templateEngine.validateTemplate(mockLargeTemplate);
      
      const validationTime = performance.now() - startTime;
      
      expect(validation).toBeDefined();
      expect(validationTime).toBeLessThan(PERFORMANCE_TARGETS.VALIDATION);
    });

    test('should handle large template parameters efficiently', async () => {
      // Create large parameter set
      const largeParams: Record<string, unknown> = {};
      for (let i = 0; i < 50; i++) {
        largeParams[`param${i}`] = `value${i}`;
      }

      const startTime = performance.now();
      
      const result = await templateEngine.applyTemplate(mockLargeTemplate.id, {
        parameters: largeParams,
        validateResult: false
      });
      
      const applicationTime = performance.now() - startTime;
      
      expect(result.config).toBeDefined();
      expect(applicationTime).toBeLessThan(PERFORMANCE_TARGETS.LARGE_TEMPLATE);
    });
  });

  describe('Merge Strategy Performance', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockTemplate);
    });

    const strategies = ['override', 'merge', 'combine'] as const;

    strategies.forEach(strategy => {
      test(`should perform ${strategy} merge within performance target`, async () => {
        const startTime = performance.now();
        
        const result = await templateEngine.applyTemplate(mockTemplate.id, {
          baseConfig: mockBaseConfig,
          mergeStrategy: strategy,
          validateResult: false
        });
        
        const applicationTime = performance.now() - startTime;
        
        expect(result.config).toBeDefined();
        expect(result.mergeDetails.strategy).toBe(strategy);
        expect(applicationTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_MERGE);
      });
    });

    test('should compare merge strategy performance', async () => {
      const results: Record<string, number> = {};
      
      for (const strategy of strategies) {
        const startTime = performance.now();
        
        await templateEngine.applyTemplate(mockTemplate.id, {
          baseConfig: mockBaseConfig,
          mergeStrategy: strategy,
          validateResult: false
        });
        
        results[strategy] = performance.now() - startTime;
      }
      
      // All strategies should be performant
      Object.values(results).forEach(time => {
        expect(time).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_MERGE);
      });
      
      // Override should be fastest (no merging required)
      expect(results.override).toBeLessThanOrEqual(Math.min(...Object.values(results)));
    });
  });

  describe('Caching Performance', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockTemplate);
    });

    test('should cache template applications for performance', async () => {
      const params = {
        baseConfig: mockBaseConfig,
        validateResult: false
      };

      // First application (uncached)
      const start1 = performance.now();
      const result1 = await templateEngine.applyTemplate(mockTemplate.id, params);
      const time1 = performance.now() - start1;

      // Second application (cached)
      const start2 = performance.now();
      const result2 = await templateEngine.applyTemplate(mockTemplate.id, params);
      const time2 = performance.now() - start2;

      expect(result1).toBe(result2); // Same object from cache
      expect(time2).toBeLessThan(PERFORMANCE_TARGETS.CACHE_PERFORMANCE);
      expect(time2).toBeLessThan(time1 * 0.5); // Should be significantly faster
    });

    test('should handle cache misses efficiently', async () => {
      // Fill cache with different parameters
      for (let i = 0; i < 10; i++) {
        await templateEngine.applyTemplate(mockTemplate.id, {
          parameters: { iteration: i },
          validateResult: false
        });
      }

      // New parameters should still be fast (cache miss)
      const startTime = performance.now();
      const result = await templateEngine.applyTemplate(mockTemplate.id, {
        parameters: { newParam: 'unique' },
        validateResult: false
      });
      const applicationTime = performance.now() - startTime;

      expect(result.config).toBeDefined();
      expect(applicationTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_APPLY);
    });

    test('should maintain performance as cache grows', async () => {
      const times: number[] = [];
      
      // Add many cached entries
      for (let i = 0; i < 20; i++) {
        const startTime = performance.now();
        
        await templateEngine.applyTemplate(mockTemplate.id, {
          parameters: { testParam: `value${i}` },
          validateResult: false
        });
        
        times.push(performance.now() - startTime);
      }

      // Performance should remain consistent
      const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      expect(averageTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_APPLY);
      
      // No significant performance degradation
      const firstHalfAvg = times.slice(0, 10).reduce((sum, time) => sum + time, 0) / 10;
      const secondHalfAvg = times.slice(10).reduce((sum, time) => sum + time, 0) / 10;
      expect(secondHalfAvg).toBeLessThan(firstHalfAvg * 2);
    });
  });

  describe('Concurrent Operations Performance', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockTemplate);
      await templateEngine.registerTemplate(mockParameterizedTemplate);
    });

    test('should handle concurrent template applications efficiently', async () => {
      const concurrentOps = 10;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentOps }, (_, i) =>
        templateEngine.applyTemplate(mockTemplate.id, {
          parameters: { concurrentTest: i },
          baseConfig: mockBaseConfig,
          validateResult: false
        })
      );

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      expect(results).toHaveLength(concurrentOps);
      expect(results.every(r => r.config !== undefined)).toBe(true);
      expect(totalTime).toBeLessThan(PERFORMANCE_TARGETS.CONCURRENT_OPS);
    });

    test('should handle mixed concurrent operations', async () => {
      const startTime = performance.now();
      
      const operations = [
        templateEngine.applyTemplate('development', { validateResult: false }),
        templateEngine.applyTemplate('production', { validateResult: false }),
        templateEngine.applyTemplate(mockTemplate.id, { 
          baseConfig: mockBaseConfig, 
          validateResult: false 
        }),
        templateEngine.applyTemplate(mockParameterizedTemplate.id, {
          parameters: { projectPath: '/concurrent', templateName: 'Concurrent Test' },
          validateResult: false
        }),
        templateEngine.discoverTemplates({ category: 'development' })
      ];

      const results = await Promise.all(operations);
      const totalTime = performance.now() - startTime;

      expect(results).toHaveLength(5);
      expect(totalTime).toBeLessThan(PERFORMANCE_TARGETS.CONCURRENT_OPS);
    });

    test('should scale with concurrent validation operations', async () => {
      const concurrentValidations = 5;
      const startTime = performance.now();
      
      const promises = Array.from({ length: concurrentValidations }, () =>
        templateEngine.applyTemplate(mockTemplate.id, {
          baseConfig: mockBaseConfig,
          validateResult: true
        })
      );

      const results = await Promise.all(promises);
      const totalTime = performance.now() - startTime;

      expect(results).toHaveLength(concurrentValidations);
      expect(results.every(r => r.validation !== undefined)).toBe(true);
      expect(totalTime).toBeLessThan(PERFORMANCE_TARGETS.CONCURRENT_OPS);
    });
  });

  describe('Memory Performance', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockLargeTemplate);
    });

    test('should not leak memory during repeated operations', async () => {
      // Get initial memory usage (if available)
      const initialMemory = process.memoryUsage?.()?.heapUsed || 0;
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        await templateEngine.applyTemplate(mockLargeTemplate.id, {
          parameters: { iteration: i },
          validateResult: false
        });
        
        // Clear cache periodically to prevent artificial memory growth
        if (i % 20 === 0) {
          templateEngine.clearCache();
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage?.()?.heapUsed || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });

    test('should manage cache size efficiently', async () => {
      // Fill cache beyond typical capacity
      for (let i = 0; i < 50; i++) {
        await templateEngine.applyTemplate(mockTemplate.id, {
          parameters: { cacheTest: i },
          validateResult: false
        });
      }

      const cacheStats = templateEngine.getCacheStats();
      
      expect(cacheStats.size).toBeLessThanOrEqual(cacheStats.maxSize);
    });
  });

  describe('Performance Regression Tests', () => {
    test('should maintain baseline performance for built-in templates', async () => {
      const templateIds = ['development', 'production', 'soc2'];
      const performanceBenchmarks: Record<string, number> = {};
      
      for (const templateId of templateIds) {
        const iterations = 5;
        const times: number[] = [];
        
        for (let i = 0; i < iterations; i++) {
          const startTime = performance.now();
          
          await templateEngine.applyTemplate(templateId, {
            baseConfig: mockBaseConfig,
            validateResult: false
          });
          
          times.push(performance.now() - startTime);
        }
        
        const averageTime = times.reduce((sum, time) => sum + time, 0) / iterations;
        performanceBenchmarks[templateId] = averageTime;
        
        expect(averageTime).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_APPLY);
      }
      
      // All templates should have reasonable performance
      Object.entries(performanceBenchmarks).forEach(([, time]) => {
        expect(time).toBeLessThan(PERFORMANCE_TARGETS.TEMPLATE_APPLY);
      });
    });

    test('should scale linearly with rule count', async () => {
      // Create templates with different rule counts
      const createTemplateWithRules = (ruleCount: number) => ({
        id: `perf-test-${ruleCount}`,
        name: `Performance Test ${ruleCount}`,
        version: '1.0.0',
        category: 'development' as const,
        description: `Template with ${ruleCount} rules`,
        compliance: [] as any,
        tags: ['performance'],
        isBuiltIn: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        rules: {
          permissions: {
            deny: Array.from({ length: ruleCount }, (_, i) => `**/*test${i}*/**`),
            allow: [] as any,
            ask: [] as any
          },
          metadata: {
            version: '1.0.0',
            timestamp: Date.now(),
            templateId: `perf-test-${ruleCount}`
          }
        },
        parameters: [] as any
      });

      const ruleCounts = [10, 50, 100, 200];
      const times: Array<{ ruleCount: number; time: number }> = [];
      
      for (const ruleCount of ruleCounts) {
        const template = createTemplateWithRules(ruleCount);
        await templateEngine.registerTemplate(template);
        
        const startTime = performance.now();
        await templateEngine.applyTemplate(template.id, { validateResult: false });
        const time = performance.now() - startTime;
        
        times.push({ ruleCount, time });
      }
      
      // Performance should scale reasonably with rule count
      times.forEach(({ ruleCount, time }) => {
        const maxExpectedTime = (ruleCount / 10) * PERFORMANCE_TARGETS.TEMPLATE_APPLY;
        expect(time).toBeLessThan(maxExpectedTime);
      });
    });
  });

  describe('Performance Monitoring and Reporting', () => {
    test('should provide detailed performance metrics', async () => {
      await templateEngine.registerTemplate(mockTemplate);
      
      const result = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: true
      });
      
      expect(result.performance).toBeDefined();
      expect(result.performance.applicationTime).toBeGreaterThan(0);
      expect(result.performance.totalTime).toBeGreaterThan(0);
      expect(result.performance.totalTime).toBeGreaterThanOrEqual(
        result.performance.applicationTime
      );
      
      if (result.performance.validationTime) {
        expect(result.performance.validationTime).toBeGreaterThan(0);
      }
    });

    test('should track merge performance separately', async () => {
      const result = await templateMerger.merge(
        mockBaseConfig,
        mockTemplate.rules,
        { strategy: 'merge', validateResult: false }
      );
      
      expect(result.performance.mergeTime).toBeGreaterThan(0);
      expect(result.performance.rulesProcessed).toBeGreaterThan(0);
    });

    test('should provide cache performance insights', () => {
      const stats = templateEngine.getCacheStats();
      
      expect(stats.size).toBeDefined();
      expect(stats.maxSize).toBeDefined();
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.maxSize).toBe('number');
      expect(stats.size).toBeGreaterThanOrEqual(0);
      expect(stats.maxSize).toBeGreaterThan(0);
    });
  });
});