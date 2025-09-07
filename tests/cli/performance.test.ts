/**
 * CLI Performance Tests
 * 
 * Comprehensive performance testing to ensure CLI meets <200ms requirements
 * across platforms and various scenarios
 */

import { join } from 'path';
import { readFileSync } from 'fs';
import {
  CLITestRunner,
  TempDirectory,
  expectPerformance,
  ensureCLIBuilt,
  createTestConfig
} from './helpers';

const projectRoot = join(__dirname, '../../');
let cliRunner: CLITestRunner;
let tempDir: TempDirectory;

describe('CLI Performance Tests', () => {
  beforeAll(async () => {
    await ensureCLIBuilt(projectRoot);
    cliRunner = new CLITestRunner(projectRoot);
  });

  beforeEach(() => {
    tempDir = new TempDirectory('cli-performance-test-');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('Performance Requirements (<200ms)', () => {
    it('should meet performance requirement for help command', async () => {
      const performance = await cliRunner.testPerformance('--help', [], { timeout: 1000 }, 10);
      
      expect(performance.average).toBeLessThan(200);
      expect(performance.max).toBeLessThan(300); // Allow some variance but keep strict
      expect(performance.min).toBeGreaterThan(10); // Sanity check
      
      console.log(`Help command performance: avg=${performance.average.toFixed(1)}ms, min=${performance.min.toFixed(1)}ms, max=${performance.max.toFixed(1)}ms`);
    });

    it('should meet performance requirement for version command', async () => {
      const performance = await cliRunner.testPerformance('--version', [], { timeout: 1000 }, 10);
      
      expect(performance.average).toBeLessThan(200);
      expect(performance.max).toBeLessThan(250);
      
      console.log(`Version command performance: avg=${performance.average.toFixed(1)}ms, min=${performance.min.toFixed(1)}ms, max=${performance.max.toFixed(1)}ms`);
    });

    it('should meet performance requirement for init with template list', async () => {
      const performance = await cliRunner.testPerformance('init', ['--list-templates'], { timeout: 1000 }, 5);
      
      expect(performance.average).toBeLessThan(200);
      expect(performance.max).toBeLessThan(300);
      
      console.log(`Init list templates performance: avg=${performance.average.toFixed(1)}ms, min=${performance.min.toFixed(1)}ms, max=${performance.max.toFixed(1)}ms`);
    });

    it('should meet performance requirement for generate template list', async () => {
      const performance = await cliRunner.testPerformance('generate', ['--list'], { timeout: 1000 }, 5);
      
      expect(performance.average).toBeLessThan(200);
      expect(performance.max).toBeLessThan(300);
      
      console.log(`Generate list performance: avg=${performance.average.toFixed(1)}ms, min=${performance.min.toFixed(1)}ms, max=${performance.max.toFixed(1)}ms`);
    });

    it('should meet performance requirement for validate help', async () => {
      const performance = await cliRunner.testPerformance('validate', ['--help'], { timeout: 1000 }, 5);
      
      expect(performance.average).toBeLessThan(200);
      expect(performance.max).toBeLessThan(250);
      
      console.log(`Validate help performance: avg=${performance.average.toFixed(1)}ms, min=${performance.min.toFixed(1)}ms, max=${performance.max.toFixed(1)}ms`);
    });

    it('should meet performance requirement for deploy help', async () => {
      const performance = await cliRunner.testPerformance('deploy', ['--help'], { timeout: 1000 }, 5);
      
      expect(performance.average).toBeLessThan(200);
      expect(performance.max).toBeLessThan(250);
      
      console.log(`Deploy help performance: avg=${performance.average.toFixed(1)}ms, min=${performance.min.toFixed(1)}ms, max=${performance.max.toFixed(1)}ms`);
    });
  });

  describe('Operation Performance Tests', () => {
    let smallConfigFile: string;
    let mediumConfigFile: string;
    let largeConfigFile: string;

    beforeAll(() => {
      // Create test configurations of different sizes
      const smallConfig = createTestConfig({
        permissions: {
          deny: Array.from({ length: 5 }, (_, i) => `deny-rule-${i}`),
          allow: ["debug-logging"],
          ask: ["external-api"]
        }
      });

      const mediumConfig = createTestConfig({
        permissions: {
          deny: Array.from({ length: 20 }, (_, i) => `medium-deny-rule-${i}`),
          allow: Array.from({ length: 10 }, (_, i) => `medium-allow-rule-${i}`),
          ask: Array.from({ length: 15 }, (_, i) => `medium-ask-rule-${i}`)
        }
      });

      const largeConfig = createTestConfig({
        permissions: {
          deny: Array.from({ length: 100 }, (_, i) => `large-deny-rule-${i}`),
          allow: Array.from({ length: 50 }, (_, i) => `large-allow-rule-${i}`),
          ask: Array.from({ length: 75 }, (_, i) => `large-ask-rule-${i}`)
        }
      });

      smallConfigFile = tempDir.writeFile('small-config.json', JSON.stringify(smallConfig));
      mediumConfigFile = tempDir.writeFile('medium-config.json', JSON.stringify(mediumConfig));
      largeConfigFile = tempDir.writeFile('large-config.json', JSON.stringify(largeConfig));
    });

    it('should validate small configuration quickly', async () => {
      const performance = await cliRunner.testPerformance('validate', [smallConfigFile], {
        cwd: tempDir.path,
        timeout: 2000,
        silent: true
      }, 5);
      
      expect(performance.average).toBeLessThan(200);
      
      console.log(`Small config validation: avg=${performance.average.toFixed(1)}ms, rules=5`);
    });

    it('should validate medium configuration within reasonable time', async () => {
      const performance = await cliRunner.testPerformance('validate', [mediumConfigFile], {
        cwd: tempDir.path,
        timeout: 3000,
        silent: true
      }, 3);
      
      // Medium configs might exceed 200ms but should be reasonable
      expect(performance.average).toBeLessThan(500);
      expect(performance.max).toBeLessThan(1000);
      
      console.log(`Medium config validation: avg=${performance.average.toFixed(1)}ms, rules=100`);
    });

    it('should handle large configuration within acceptable limits', async () => {
      const performance = await cliRunner.testPerformance('validate', [largeConfigFile], {
        cwd: tempDir.path,
        timeout: 5000,
        silent: true
      }, 2);
      
      // Large configs are expected to take longer, but should be under 2 seconds
      expect(performance.average).toBeLessThan(2000);
      expect(performance.max).toBeLessThan(3000);
      
      console.log(`Large config validation: avg=${performance.average.toFixed(1)}ms, rules=1000`);
    });

    it('should initialize configuration quickly', async () => {
      const performance = await cliRunner.testPerformance('init', [
        '--template', 'security-baseline',
        '--non-interactive',
        '--output', join(tempDir.path, 'init-perf.json')
      ], {
        cwd: tempDir.path,
        timeout: 2000,
        silent: true
      }, 5);
      
      expect(performance.average).toBeLessThan(200);
      
      console.log(`Init performance: avg=${performance.average.toFixed(1)}ms`);
    });

    it('should generate configuration quickly', async () => {
      const performance = await cliRunner.testPerformance('generate', [
        '--template', 'security-baseline',
        '--output', join(tempDir.path, 'gen-perf.json')
      ], {
        cwd: tempDir.path,
        timeout: 2000,
        silent: true
      }, 5);
      
      expect(performance.average).toBeLessThan(200);
      
      console.log(`Generate performance: avg=${performance.average.toFixed(1)}ms`);
    });

    it('should perform dry-run deployment quickly', async () => {
      const performance = await cliRunner.testPerformance('deploy', [
        smallConfigFile,
        '--environment', 'development',
        '--dry-run'
      ], {
        cwd: tempDir.path,
        timeout: 2000,
        silent: true
      }, 3);
      
      expect(performance.average).toBeLessThan(200);
      
      console.log(`Deploy dry-run performance: avg=${performance.average.toFixed(1)}ms`);
    });
  });

  describe('Startup Performance', () => {
    it('should have fast CLI startup time', async () => {
      const startupTests = [
        { cmd: '--help', desc: 'Help display' },
        { cmd: '--version', desc: 'Version display' },
        { cmd: 'init', args: ['--help'], desc: 'Init help' },
        { cmd: 'generate', args: ['--help'], desc: 'Generate help' },
        { cmd: 'validate', args: ['--help'], desc: 'Validate help' },
        { cmd: 'deploy', args: ['--help'], desc: 'Deploy help' }
      ];

      for (const test of startupTests) {
        const performance = await cliRunner.testPerformance(
          test.cmd,
          test.args || [],
          { timeout: 1000, silent: true },
          3
        );
        
        expect(performance.average).toBeLessThan(200);
        
        console.log(`${test.desc} startup: avg=${performance.average.toFixed(1)}ms`);
      }
    });

    it('should have consistent performance across multiple runs', async () => {
      const performance = await cliRunner.testPerformance('--help', [], { timeout: 1000, silent: true }, 20);
      
      // Check variance - performance should be relatively consistent
      const variance = performance.results.map(r => Math.abs(r.executionTime - performance.average));
      const maxVariance = Math.max(...variance);
      
      expect(maxVariance).toBeLessThan(100); // Max 100ms variance from average
      expect(performance.average).toBeLessThan(200);
      
      console.log(`Consistency test: avg=${performance.average.toFixed(1)}ms, max_variance=${maxVariance.toFixed(1)}ms`);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should handle large configurations without memory issues', async () => {
      // Create an even larger configuration to stress test
      const stressConfig = createTestConfig({
        permissions: {
          deny: Array.from({ length: 1000 }, (_, i) => `stress-deny-rule-${i}`),
          allow: Array.from({ length: 500 }, (_, i) => `stress-allow-rule-${i}`),
          ask: Array.from({ length: 750 }, (_, i) => `stress-ask-rule-${i}`)
        }
      });

      const stressConfigFile = tempDir.writeFile('stress-config.json', JSON.stringify(stressConfig));
      
      const result = await cliRunner.runCommand('validate', [stressConfigFile], {
        cwd: tempDir.path,
        timeout: 10000,
        silent: true
      });
      
      // Should handle large config without crashing
      expect([0, 1]).toContain(result.exitCode); // May fail validation but shouldn't crash
      
      // Should complete within reasonable time even for large config
      expect(result.executionTime).toBeLessThan(5000);
      
      console.log(`Stress test (5000 rules): ${result.executionTime.toFixed(1)}ms, exitCode=${result.exitCode}`);
    });

    it('should handle concurrent CLI operations', async () => {
      const configFile = tempDir.writeFile('concurrent-config.json', JSON.stringify(createTestConfig()));
      
      // Run multiple operations concurrently
      const promises = Array.from({ length: 5 }, (_, i) => 
        cliRunner.runCommand('validate', [configFile], {
          cwd: tempDir.path,
          timeout: 3000,
          silent: true
        })
      );
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      results.forEach((result, i) => {
        expect(result.exitCode).toBe(0);
        expect(result.executionTime).toBeLessThan(1000);
        console.log(`Concurrent run ${i + 1}: ${result.executionTime.toFixed(1)}ms`);
      });
      
      const avgTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;
      console.log(`Concurrent operations average: ${avgTime.toFixed(1)}ms`);
    });
  });

  describe('Cold Start vs Warm Start', () => {
    it('should measure cold start performance', async () => {
      // First run after ensuring CLI is built (cold start)
      const coldStart = await cliRunner.runCommand('--version', [], { timeout: 2000 });
      
      // Subsequent runs (warm start)
      const warmRuns = await Promise.all(
        Array.from({ length: 5 }, () => 
          cliRunner.runCommand('--version', [], { timeout: 1000, silent: true })
        )
      );
      
      const avgWarmTime = warmRuns.reduce((sum, r) => sum + r.executionTime, 0) / warmRuns.length;
      
      console.log(`Cold start: ${coldStart.executionTime.toFixed(1)}ms`);
      console.log(`Warm start average: ${avgWarmTime.toFixed(1)}ms`);
      
      // Both should meet requirements, but warm start should be faster or equal
      expect(coldStart.executionTime).toBeLessThan(400); // Allow more time for cold start
      expect(avgWarmTime).toBeLessThan(200);
      expect(avgWarmTime).toBeLessThanOrEqual(coldStart.executionTime + 50); // Warm should be similar or better
    });
  });

  describe('Platform-specific Performance', () => {
    it('should report platform performance characteristics', async () => {
      const platformInfo = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        cpus: require('os').cpus().length
      };

      console.log('Platform Information:', JSON.stringify(platformInfo, null, 2));

      // Run a standard performance test
      const performance = await cliRunner.testPerformance('--help', [], { timeout: 1000, silent: true }, 10);
      
      console.log(`Platform performance baseline: avg=${performance.average.toFixed(1)}ms, min=${performance.min.toFixed(1)}ms, max=${performance.max.toFixed(1)}ms`);
      
      // Performance requirements should be met regardless of platform
      expect(performance.average).toBeLessThan(200);
      
      // Store results for CI/CD analysis
      const performanceReport = {
        platform: platformInfo,
        performance: {
          average: performance.average,
          min: performance.min,
          max: performance.max,
          iterations: performance.results.length
        },
        timestamp: new Date().toISOString()
      };
      
      // Write performance report for CI analysis
      tempDir.writeFile('performance-report.json', JSON.stringify(performanceReport, null, 2));
      
      console.log('Performance report written to:', join(tempDir.path, 'performance-report.json'));
    });
  });
});