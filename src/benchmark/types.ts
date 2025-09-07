/**
 * Type definitions for benchmark system
 */

export interface BenchmarkScenario {
  name: string;
  description: string;
  category: 'validation' | 'cli' | 'cache' | 'concurrency' | 'scale' | 'git';
  priority: 'critical' | 'high' | 'medium' | 'low';
  run: () => Promise<void>;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  config?: ScenarioConfig;
}

export interface ScenarioConfig {
  dataSize?: 'small' | 'medium' | 'large' | 'xlarge';
  complexity?: 'low' | 'medium' | 'high';
  concurrentOps?: number;
  iterations?: number;
  timeout?: number;
}

export interface PerformanceMetrics {
  duration: number;
  timestamp: number;
  cpuUsage: number;
  userId?: number;
  [key: string]: any;
}

export interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface BenchmarkResult {
  scenario: string;
  description: string;
  iterations: number;
  successRate: number;
  errors: number;
  metrics: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    stdDev: number;
  };
  memory: {
    avgHeapUsed: number;
    maxHeapUsed: number;
    avgRss: number;
  };
  throughput?: number;
  timestamp: number;
}

export interface BenchmarkReport {
  version: string;
  timestamp: number;
  system: {
    platform: NodeJS.Platform;
    release: string;
    cpus: number;
    memory: number;
    nodeVersion: string;
  };
  config: {
    warmupRuns: number;
    iterations: number;
    concurrentUsers: number;
    outputDir: string;
    verbose: boolean;
  };
  results: BenchmarkResult[];
  summary: {
    totalScenarios: number;
    totalIterations: number;
    totalDuration: number;
    failedScenarios: number;
    averageSuccessRate: number;
  };
}

export interface MonitoringData {
  cpuUsage: number;
  memoryUsage: NodeJS.MemoryUsage;
  eventLoopLag: number;
  activeHandles: number;
  activeRequests: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  size: number;
}

export interface RulesetData {
  small: {
    rules: number;
    templates: number;
    size: string;
  };
  medium: {
    rules: number;
    templates: number;
    size: string;
  };
  large: {
    rules: number;
    templates: number;
    size: string;
  };
  xlarge: {
    rules: number;
    templates: number;
    size: string;
  };
}

export interface ValidationBenchmark {
  ruleCount: number;
  templateCount: number;
  conflictCount: number;
  validationTime: number;
  memoryUsed: number;
}

export interface CLIBenchmark {
  command: string;
  args: string[];
  responseTime: number;
  outputSize: number;
  exitCode: number;
}

export interface ConcurrencyBenchmark {
  userCount: number;
  operationType: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  throughput: number;
}

export interface GitIntegrationBenchmark {
  operation: 'hook' | 'diff' | 'commit' | 'merge';
  fileCount: number;
  changeCount: number;
  processingTime: number;
  memoryPeak: number;
}