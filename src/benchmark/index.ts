/**
 * Main Performance Benchmark Runner
 * Comprehensive benchmarking suite for Claude Code Security Rulesets Generator
 */

import { performance } from 'perf_hooks';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { 
  BenchmarkScenario,
  BenchmarkResult,
  BenchmarkReport,
  PerformanceMetrics,
  MemoryMetrics,
  ScenarioConfig
} from './types';
import { scenarios, getScenarioByName } from './scenarios';
import { PerformanceMonitor } from './monitor';
import { ReportGenerator } from './report';
import { MetricsCollector } from './metrics';

export class BenchmarkRunner {
  private monitor: PerformanceMonitor;
  private reporter: ReportGenerator;
  private metrics: MetricsCollector;
  private results: BenchmarkResult[] = [];
  private config: {
    warmupRuns: number;
    iterations: number;
    concurrentUsers: number;
    outputDir: string;
    verbose: boolean;
  };

  constructor(config?: Partial<BenchmarkRunner['config']>) {
    this.config = {
      warmupRuns: 3,
      iterations: 100,
      concurrentUsers: 10,
      outputDir: path.join(process.cwd(), 'benchmark', 'results'),
      verbose: false,
      ...config
    };

    this.monitor = new PerformanceMonitor();
    this.reporter = new ReportGenerator(this.config.outputDir);
    this.metrics = new MetricsCollector();
  }

  /**
   * Run all benchmark scenarios
   */
  async runAll(): Promise<BenchmarkReport> {
    console.log(chalk.cyan.bold('\n🚀 Starting Claude Code Security Rulesets Benchmark Suite\n'));
    console.log(chalk.gray(`System: ${os.type()} ${os.release()} | CPUs: ${os.cpus().length} | Memory: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`));
    console.log(chalk.gray(`Configuration: ${this.config.iterations} iterations, ${this.config.concurrentUsers} concurrent users\n`));

    const startTime = Date.now();
    
    // Run benchmarks for each scenario
    for (const scenario of scenarios) {
      await this.runScenario(scenario);
    }

    const totalTime = Date.now() - startTime;

    // Generate and save report
    const report = await this.generateReport(totalTime);
    await this.saveReport(report);

    // Print summary
    this.printSummary(report);

    return report;
  }

  /**
   * Run specific scenario
   */
  async runScenario(scenario: BenchmarkScenario): Promise<BenchmarkResult> {
    console.log(chalk.blue(`\n📊 Running: ${scenario.name}`));
    console.log(chalk.gray(`   ${scenario.description}`));

    // Warmup runs
    if (this.config.warmupRuns > 0) {
      console.log(chalk.gray(`   Warming up (${this.config.warmupRuns} runs)...`));
      for (let i = 0; i < this.config.warmupRuns; i++) {
        await scenario.run();
      }
    }

    const metrics: PerformanceMetrics[] = [];
    const memoryMetrics: MemoryMetrics[] = [];
    const errors: Error[] = [];

    // Progress tracking
    const progressBar = this.createProgressBar(this.config.iterations);

    // Run iterations
    for (let i = 0; i < this.config.iterations; i++) {
      try {
        // Start monitoring
        this.monitor.start();
        const memBefore = process.memoryUsage();

        // Run scenario
        const startTime = performance.now();
        await scenario.run();
        const endTime = performance.now();

        // Collect metrics
        const memAfter = process.memoryUsage();
        const monitorMetrics = this.monitor.stop();

        metrics.push({
          duration: endTime - startTime,
          timestamp: Date.now(),
          cpuUsage: monitorMetrics.cpuUsage,
          ...monitorMetrics
        });

        memoryMetrics.push({
          heapUsed: memAfter.heapUsed - memBefore.heapUsed,
          heapTotal: memAfter.heapTotal - memBefore.heapTotal,
          external: memAfter.external - memBefore.external,
          rss: memAfter.rss - memBefore.rss
        });

        progressBar.update(i + 1);
      } catch (error) {
        errors.push(error as Error);
        if (this.config.verbose) {
          console.error(chalk.red(`   Error in iteration ${i}: ${error}`));
        }
      }
    }

    progressBar.stop();

    // Calculate statistics
    const result = this.calculateStats(scenario, metrics, memoryMetrics, errors);
    this.results.push(result);

    // Print scenario results
    this.printScenarioResult(result);

    // Check performance requirements
    this.checkRequirements(result);

    return result;
  }

  /**
   * Run concurrent user simulation
   */
  async runConcurrentTest(scenarioName: string): Promise<BenchmarkResult> {
    const scenario = getScenarioByName(scenarioName);
    if (!scenario) {
      throw new Error(`Scenario '${scenarioName}' not found`);
    }

    console.log(chalk.blue(`\n🔄 Running Concurrent Test: ${scenario.name}`));
    console.log(chalk.gray(`   Simulating ${this.config.concurrentUsers} concurrent users`));

    const metrics: PerformanceMetrics[] = [];
    const errors: Error[] = [];

    // Create concurrent promises
    const promises = Array.from({ length: this.config.concurrentUsers }, async (_, userIndex) => {
      const userMetrics: PerformanceMetrics[] = [];
      
      for (let i = 0; i < Math.floor(this.config.iterations / this.config.concurrentUsers); i++) {
        try {
          const startTime = performance.now();
          await scenario.run();
          const endTime = performance.now();

          userMetrics.push({
            duration: endTime - startTime,
            timestamp: Date.now(),
            cpuUsage: 0, // Will be aggregated
            userId: userIndex
          });
        } catch (error) {
          errors.push(error as Error);
        }
      }

      return userMetrics;
    });

    // Execute concurrently
    const startTime = performance.now();
    const allUserMetrics = await Promise.all(promises);
    const totalDuration = performance.now() - startTime;

    // Flatten metrics
    allUserMetrics.forEach(userMetrics => metrics.push(...userMetrics));

    // Calculate throughput
    const throughput = (metrics.length / totalDuration) * 1000; // requests per second

    console.log(chalk.green(`   ✓ Processed ${metrics.length} requests in ${totalDuration.toFixed(2)}ms`));
    console.log(chalk.green(`   ✓ Throughput: ${throughput.toFixed(2)} req/s`));

    const result = this.calculateStats(scenario, metrics, [], errors);
    result.throughput = throughput;
    
    return result;
  }

  /**
   * Calculate statistics from metrics
   */
  private calculateStats(
    scenario: BenchmarkScenario,
    metrics: PerformanceMetrics[],
    memoryMetrics: MemoryMetrics[],
    errors: Error[]
  ): BenchmarkResult {
    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const successRate = ((metrics.length / (metrics.length + errors.length)) * 100);

    return {
      scenario: scenario.name,
      description: scenario.description,
      iterations: this.config.iterations,
      successRate,
      errors: errors.length,
      metrics: {
        min: Math.min(...durations),
        max: Math.max(...durations),
        mean: durations.reduce((a, b) => a + b, 0) / durations.length,
        median: durations[Math.floor(durations.length / 2)],
        p50: this.percentile(durations, 50),
        p90: this.percentile(durations, 90),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99),
        stdDev: this.standardDeviation(durations)
      },
      memory: {
        avgHeapUsed: memoryMetrics.length > 0 
          ? memoryMetrics.reduce((a, b) => a + b.heapUsed, 0) / memoryMetrics.length
          : 0,
        maxHeapUsed: memoryMetrics.length > 0
          ? Math.max(...memoryMetrics.map(m => m.heapUsed))
          : 0,
        avgRss: memoryMetrics.length > 0
          ? memoryMetrics.reduce((a, b) => a + b.rss, 0) / memoryMetrics.length
          : 0
      },
      timestamp: Date.now()
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
   * Check if results meet performance requirements
   */
  private checkRequirements(result: BenchmarkResult): void {
    const requirements = {
      'validation': { max: 100, metric: 'p95' },
      'cli-response': { max: 200, metric: 'p95' },
      'cached-response': { max: 10, metric: 'p95' },
      'memory': { max: 100 * 1024 * 1024, metric: 'maxHeapUsed' } // 100MB
    };

    // Check if scenario matches any requirement
    for (const [key, requirement] of Object.entries(requirements)) {
      if (result.scenario.toLowerCase().includes(key)) {
        const value = requirement.metric === 'maxHeapUsed' 
          ? result.memory.maxHeapUsed
          : result.metrics[requirement.metric as keyof typeof result.metrics];

        if (value > requirement.max) {
          console.log(chalk.red(`   ⚠️  FAILED: ${requirement.metric} = ${value.toFixed(2)}ms > ${requirement.max}ms requirement`));
        } else {
          console.log(chalk.green(`   ✓ PASSED: ${requirement.metric} = ${value.toFixed(2)}ms < ${requirement.max}ms requirement`));
        }
      }
    }
  }

  /**
   * Generate benchmark report
   */
  private async generateReport(totalTime: number): Promise<BenchmarkReport> {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      system: {
        platform: os.platform(),
        release: os.release(),
        cpus: os.cpus().length,
        memory: os.totalmem(),
        nodeVersion: process.version
      },
      config: this.config,
      results: this.results,
      summary: {
        totalScenarios: this.results.length,
        totalIterations: this.results.reduce((a, b) => a + b.iterations, 0),
        totalDuration: totalTime,
        failedScenarios: this.results.filter(r => r.successRate < 100).length,
        averageSuccessRate: this.results.reduce((a, b) => a + b.successRate, 0) / this.results.length
      }
    };
  }

  /**
   * Save report to file
   */
  private async saveReport(report: BenchmarkReport): Promise<void> {
    await fs.ensureDir(this.config.outputDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Save JSON report
    const jsonPath = path.join(this.config.outputDir, `benchmark-${timestamp}.json`);
    await fs.writeJson(jsonPath, report, { spaces: 2 });

    // Save HTML report
    const htmlPath = path.join(this.config.outputDir, `benchmark-${timestamp}.html`);
    await this.reporter.generateHTML(report, htmlPath);

    // Save latest symlink
    const latestJsonPath = path.join(this.config.outputDir, 'latest.json');
    const latestHtmlPath = path.join(this.config.outputDir, 'latest.html');
    
    if (await fs.pathExists(latestJsonPath)) {
      await fs.unlink(latestJsonPath);
    }
    if (await fs.pathExists(latestHtmlPath)) {
      await fs.unlink(latestHtmlPath);
    }
    
    await fs.symlink(jsonPath, latestJsonPath);
    await fs.symlink(htmlPath, latestHtmlPath);

    console.log(chalk.gray(`\n📁 Reports saved to:`));
    console.log(chalk.gray(`   JSON: ${jsonPath}`));
    console.log(chalk.gray(`   HTML: ${htmlPath}`));
  }

  /**
   * Print scenario result
   */
  private printScenarioResult(result: BenchmarkResult): void {
    console.log(chalk.gray(`   Success Rate: ${result.successRate.toFixed(1)}%`));
    console.log(chalk.gray(`   Performance (ms):`));
    console.log(chalk.gray(`     Min: ${result.metrics.min.toFixed(2)}  Max: ${result.metrics.max.toFixed(2)}`));
    console.log(chalk.gray(`     Mean: ${result.metrics.mean.toFixed(2)}  Median: ${result.metrics.median.toFixed(2)}`));
    console.log(chalk.gray(`     P90: ${result.metrics.p90.toFixed(2)}  P95: ${result.metrics.p95.toFixed(2)}  P99: ${result.metrics.p99.toFixed(2)}`));
    
    if (result.memory.avgHeapUsed > 0) {
      console.log(chalk.gray(`   Memory:`));
      console.log(chalk.gray(`     Avg Heap: ${(result.memory.avgHeapUsed / 1024 / 1024).toFixed(2)}MB`));
      console.log(chalk.gray(`     Max Heap: ${(result.memory.maxHeapUsed / 1024 / 1024).toFixed(2)}MB`));
    }
  }

  /**
   * Print final summary
   */
  private printSummary(report: BenchmarkReport): void {
    console.log(chalk.cyan.bold('\n📈 Benchmark Summary\n'));
    console.log(chalk.white(`Total Scenarios: ${report.summary.totalScenarios}`));
    console.log(chalk.white(`Total Iterations: ${report.summary.totalIterations}`));
    console.log(chalk.white(`Total Duration: ${(report.summary.totalDuration / 1000).toFixed(2)}s`));
    console.log(chalk.white(`Average Success Rate: ${report.summary.averageSuccessRate.toFixed(1)}%`));
    
    if (report.summary.failedScenarios > 0) {
      console.log(chalk.red(`Failed Scenarios: ${report.summary.failedScenarios}`));
    }

    // Performance requirements check
    console.log(chalk.cyan.bold('\n✅ Performance Requirements Check:\n'));
    const validationResult = report.results.find(r => r.scenario.includes('validation'));
    const cliResult = report.results.find(r => r.scenario.includes('cli-response'));
    const cacheResult = report.results.find(r => r.scenario.includes('cache'));

    if (validationResult) {
      const status = validationResult.metrics.p95 < 100 ? chalk.green('✓ PASS') : chalk.red('✗ FAIL');
      console.log(`${status} Validation < 100ms: ${validationResult.metrics.p95.toFixed(2)}ms`);
    }

    if (cliResult) {
      const status = cliResult.metrics.p95 < 200 ? chalk.green('✓ PASS') : chalk.red('✗ FAIL');
      console.log(`${status} CLI Response < 200ms: ${cliResult.metrics.p95.toFixed(2)}ms`);
    }

    if (cacheResult) {
      const status = cacheResult.metrics.p95 < 10 ? chalk.green('✓ PASS') : chalk.red('✗ FAIL');
      console.log(`${status} Cached Response < 10ms: ${cacheResult.metrics.p95.toFixed(2)}ms`);
    }

    console.log(chalk.cyan('\n🎉 Benchmark complete!\n'));
  }

  /**
   * Create progress bar
   */
  private createProgressBar(total: number): any {
    let current = 0;
    return {
      update: (value: number) => {
        current = value;
        const percentage = (current / total) * 100;
        const filled = Math.floor(percentage / 2);
        const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
        process.stdout.write(`\r   Progress: [${bar}] ${percentage.toFixed(0)}%`);
      },
      stop: () => {
        process.stdout.write('\n');
      }
    };
  }
}

// Export for CLI usage
export { scenarios } from './scenarios';
export { PerformanceMonitor } from './monitor';
export { ReportGenerator } from './report';
export { MetricsCollector } from './metrics';