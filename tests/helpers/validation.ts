/**
 * Test helpers and utilities for validation testing
 * Includes mocks, assertions, and performance measurement utilities
 */

import { jest } from '@jest/globals';
import { ValidationEngine } from '../../src/validation/engine';
import { ConflictDetectionEngine } from '../../src/validation/conflicts';
import { 
  ClaudeCodeConfiguration, 
  ValidationResult, 
  ValidationError,
  ValidationWarning,
  RuleConflict 
} from '../../src/types';
import { NormalizedRule } from '../../src/validation/types';

/**
 * Custom Jest matchers for validation testing
 */
export const validationMatchers = {
  toBeValidConfiguration() {
    return {
      message: () => 'Expected validation result to indicate valid configuration',
      pass: false
    };
  },

  toHaveZeroBypassViolation(received: ValidationResult) {
    const hasViolation = received.errors.some(error => 
      error.message.includes('ZERO-BYPASS VIOLATION') ||
      error.type === 'SECURITY_VIOLATION'
    ) || received.conflicts.some(conflict =>
      conflict.type === 'ALLOW_OVERRIDES_DENY' && 
      conflict.securityImpact === 'critical'
    );

    return {
      message: () => hasViolation 
        ? 'Expected no zero-bypass violations'
        : 'Expected zero-bypass violation to be detected',
      pass: hasViolation
    };
  },

  toCompleteWithinTime(received: ValidationResult, expectedMs: number) {
    const actualTime = received.performance.validationTime;
    const withinTime = actualTime < expectedMs;

    return {
      message: () => `Expected validation to complete within ${expectedMs}ms, but took ${actualTime.toFixed(2)}ms`,
      pass: withinTime
    };
  },

  toHaveConflictType(received: ValidationResult, expectedType: string) {
    const hasConflictType = received.conflicts.some(conflict => 
      conflict.type === expectedType
    );

    return {
      message: () => hasConflictType
        ? `Expected not to have conflict type ${expectedType}`
        : `Expected to have conflict type ${expectedType}`,
      pass: hasConflictType
    };
  }
};

/**
 * Mock factories for testing
 */
export class ValidationMocks {
  /**
   * Create a mock validation engine with controllable behavior
   */
  static createMockEngine(overrides: Partial<ValidationEngine> = {}): jest.Mocked<ValidationEngine> {
    const mockEngine = {
      validate: jest.fn().mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        conflicts: [],
        performance: {
          validationTime: 50,
          rulesProcessed: 10,
          performanceTarget: { target: 100, achieved: true }
        },
        suggestions: []
      }),
      validateBatch: jest.fn(),
      getRuleStatistics: jest.fn(),
      getState: jest.fn().mockReturnValue({
        phase: 'complete',
        progress: 100,
        currentOperation: 'Validation complete'
      }),
      shutdown: jest.fn().mockResolvedValue(undefined),
      exportCache: jest.fn().mockReturnValue('{}'),
      importCache: jest.fn(),
      getCacheStats: jest.fn().mockReturnValue({
        entries: 0,
        hits: 0,
        misses: 0,
        hitRate: 0
      }),
      ...overrides
    } as jest.Mocked<ValidationEngine>;

    return mockEngine;
  }

  /**
   * Create a mock conflict detection engine
   */
  static createMockConflictEngine(overrides: Partial<ConflictDetectionEngine> = {}): jest.Mocked<ConflictDetectionEngine> {
    const mockEngine = {
      detectConflicts: jest.fn().mockResolvedValue({
        conflicts: [],
        overlaps: [],
        detectionTime: 10,
        pairsAnalyzed: 0
      }),
      analyzeConflict: jest.fn(),
      generateAutomaticResolution: jest.fn().mockResolvedValue([]),
      clearCache: jest.fn(),
      getCacheStats: jest.fn().mockReturnValue({
        entries: 0,
        hits: 0,
        hitRate: 0
      }),
      exportConflictReport: jest.fn(),
      ...overrides
    } as jest.Mocked<ConflictDetectionEngine>;

    return mockEngine;
  }

  /**
   * Create test configuration with specific characteristics
   */
  static createTestConfig(options: {
    hasConflicts?: boolean;
    isSecure?: boolean;
    ruleCount?: number;
    hasRegexPatterns?: boolean;
  } = {}): ClaudeCodeConfiguration {
    const {
      hasConflicts = false,
      isSecure = true,
      ruleCount = 5,
      hasRegexPatterns = false
    } = options;

    let deny: string[] = [];
    let allow: string[] = [];
    let ask: string[] = [];

    if (isSecure) {
      deny = ['exec', 'eval', 'system', '*.exe'];
      allow = ['read/*', 'write/safe/*'];
      ask = ['admin/*'];
    } else {
      deny = ['dangerous'];
      allow = ['*']; // Overly permissive
      ask = [];
    }

    if (hasConflicts) {
      // Add conflicting rules
      allow.push('exec'); // Conflicts with deny
      ask.push('system'); // Conflicts with deny
    }

    if (hasRegexPatterns) {
      deny.push('^[a-zA-Z0-9]+\\.(exe|dll)$');
      allow.push('^safe_[0-9]+\\.txt$');
    }

    // Pad with additional rules if needed
    while (deny.length + allow.length + ask.length < ruleCount) {
      deny.push(`pattern${deny.length}`);
    }

    return {
      permissions: { deny, allow, ask }
    };
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestHelper {
  private static measurements: Map<string, number[]> = new Map();

  /**
   * Measure execution time of async function
   */
  static async measureAsync<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;

    if (!this.measurements.has(name)) {
      this.measurements.set(name, []);
    }
    this.measurements.get(name)!.push(duration);

    return { result, duration };
  }

  /**
   * Run performance benchmark with multiple iterations
   */
  static async runBenchmark<T>(
    name: string,
    fn: () => Promise<T>,
    iterations: number = 10
  ): Promise<{
    results: T[];
    stats: {
      min: number;
      max: number;
      mean: number;
      median: number;
      stdDev: number;
    }
  }> {
    const results: T[] = [];
    const durations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const { result, duration } = await this.measureAsync(`${name}-${i}`, fn);
      results.push(result);
      durations.push(duration);
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    return {
      results,
      stats: {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean,
        median: sorted[Math.floor(sorted.length / 2)],
        stdDev
      }
    };
  }

  /**
   * Assert performance requirements
   */
  static assertPerformance(
    duration: number,
    maxMs: number,
    operation: string = 'operation'
  ): void {
    if (duration > maxMs) {
      throw new Error(
        `Performance requirement failed: ${operation} took ${duration.toFixed(2)}ms, ` +
        `but should complete within ${maxMs}ms`
      );
    }
  }

  /**
   * Clear all measurements
   */
  static clearMeasurements(): void {
    this.measurements.clear();
  }

  /**
   * Get statistics for all measurements
   */
  static getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, measurements] of this.measurements.entries()) {
      if (measurements.length === 0) continue;
      
      const sorted = [...measurements].sort((a, b) => a - b);
      const mean = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      
      stats[name] = {
        count: measurements.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean,
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
      };
    }
    
    return stats;
  }
}

/**
 * Security test assertions
 */
export class SecurityTestHelper {
  /**
   * Assert that configuration has no zero-bypass violations
   */
  static assertNoZeroBypass(result: ValidationResult): void {
    const zeroBypassErrors = result.errors.filter(error =>
      error.message.includes('ZERO-BYPASS VIOLATION') ||
      error.type === 'SECURITY_VIOLATION'
    );

    const criticalConflicts = result.conflicts.filter(conflict =>
      conflict.type === 'ALLOW_OVERRIDES_DENY' &&
      conflict.securityImpact === 'critical'
    );

    if (zeroBypassErrors.length > 0 || criticalConflicts.length > 0) {
      throw new Error(
        `Zero-bypass violations detected:\n` +
        `- Errors: ${zeroBypassErrors.length}\n` +
        `- Critical conflicts: ${criticalConflicts.length}\n` +
        `Details: ${JSON.stringify({ zeroBypassErrors, criticalConflicts }, null, 2)}`
      );
    }
  }

  /**
   * Assert that malicious patterns are detected
   */
  static assertMaliciousPatternDetection(
    result: ValidationResult,
    expectedPatterns: string[]
  ): void {
    for (const pattern of expectedPatterns) {
      const detected = result.errors.some(error =>
        error.message.toLowerCase().includes(pattern.toLowerCase())
      ) || result.warnings.some(warning =>
        warning.message.toLowerCase().includes(pattern.toLowerCase())
      );

      if (!detected) {
        throw new Error(`Malicious pattern "${pattern}" was not detected`);
      }
    }
  }

  /**
   * Assert security score meets minimum threshold
   */
  static assertSecurityScore(
    result: ValidationResult,
    minScore: number
  ): void {
    // Extract security score from suggestions or calculate based on errors
    let securityScore = 100;
    
    // Reduce score based on critical issues
    securityScore -= result.errors.filter(e => e.severity === 'critical').length * 20;
    securityScore -= result.errors.filter(e => e.severity === 'high').length * 10;
    securityScore -= result.errors.filter(e => e.severity === 'medium').length * 5;

    if (securityScore < minScore) {
      throw new Error(
        `Security score ${securityScore} is below minimum threshold of ${minScore}`
      );
    }
  }

  /**
   * Generate attack scenarios for testing
   */
  static generateAttackScenarios(): Array<{
    name: string;
    pattern: string;
    description: string;
    expectedDetection: boolean;
  }> {
    return [
      {
        name: 'shell-injection',
        pattern: '; rm -rf /',
        description: 'Shell command injection attempt',
        expectedDetection: true
      },
      {
        name: 'path-traversal',
        pattern: '../../../etc/passwd',
        description: 'Path traversal attack',
        expectedDetection: true
      },
      {
        name: 'unicode-bypass',
        pattern: '\u002e\u002e\u002f',
        description: 'Unicode normalization bypass',
        expectedDetection: true
      },
      {
        name: 'url-encoding',
        pattern: '%2e%2e%2fpasswd',
        description: 'URL encoding bypass attempt',
        expectedDetection: true
      },
      {
        name: 'double-encoding',
        pattern: '%252e%252e%252f',
        description: 'Double URL encoding bypass',
        expectedDetection: true
      },
      {
        name: 'null-byte',
        pattern: 'safe.txt\x00.exe',
        description: 'Null byte injection',
        expectedDetection: true
      }
    ];
  }
}

/**
 * Conflict detection test helpers
 */
export class ConflictTestHelper {
  /**
   * Create normalized rules for testing
   */
  static createNormalizedRule(
    pattern: string,
    category: 'deny' | 'allow' | 'ask',
    index: number = 0
  ): NormalizedRule {
    const priority = category === 'deny' ? -1000 + index :
                    category === 'ask' ? -500 + index :
                    index;

    // Detect pattern type
    let patternType: 'literal' | 'glob' | 'regex' = 'literal';
    if (pattern.includes('*') || pattern.includes('?')) {
      patternType = 'glob';
    } else if (pattern.includes('\\') || pattern.includes('^') || pattern.includes('$')) {
      patternType = 'regex';
    }

    // Create regex
    let regex: RegExp;
    if (patternType === 'glob') {
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\.\\\*/g, '.*');
      regex = new RegExp(regexPattern);
    } else if (patternType === 'regex') {
      try {
        regex = new RegExp(pattern);
      } catch {
        regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }
    } else {
      regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    }

    return {
      original: pattern,
      normalized: pattern,
      patternType,
      category,
      priority,
      index,
      regex
    };
  }

  /**
   * Create rule pairs that should conflict
   */
  static createConflictingRulePairs(): Array<{
    rule1: NormalizedRule;
    rule2: NormalizedRule;
    expectedConflictType: string;
    description: string;
  }> {
    return [
      {
        rule1: this.createNormalizedRule('exec', 'deny', 0),
        rule2: this.createNormalizedRule('exec', 'allow', 0),
        expectedConflictType: 'ALLOW_OVERRIDES_DENY',
        description: 'Exact pattern conflict between deny and allow'
      },
      {
        rule1: this.createNormalizedRule('*.exe', 'deny', 0),
        rule2: this.createNormalizedRule('safe.exe', 'allow', 0),
        expectedConflictType: 'ALLOW_OVERRIDES_DENY',
        description: 'Glob pattern contains literal pattern'
      },
      {
        rule1: this.createNormalizedRule('/etc/*', 'deny', 0),
        rule2: this.createNormalizedRule('/etc/passwd', 'ask', 0),
        expectedConflictType: 'ALLOW_OVERRIDES_DENY',
        description: 'Ask rule could bypass deny rule'
      }
    ];
  }

  /**
   * Assert conflict detection results
   */
  static assertConflictDetection(
    conflicts: RuleConflict[],
    expectedConflictType: string,
    expectedCount: number = 1
  ): void {
    const matchingConflicts = conflicts.filter(c => c.type === expectedConflictType);
    
    if (matchingConflicts.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} conflicts of type ${expectedConflictType}, ` +
        `but found ${matchingConflicts.length}`
      );
    }
  }
}

/**
 * Memory and resource monitoring for tests
 */
export class ResourceMonitor {
  private static initialMemory: NodeJS.MemoryUsage;
  private static peakMemory: number = 0;

  /**
   * Start monitoring resources
   */
  static start(): void {
    this.initialMemory = process.memoryUsage();
    this.peakMemory = this.initialMemory.heapUsed;

    // Monitor memory usage periodically
    const interval = setInterval(() => {
      const current = process.memoryUsage();
      this.peakMemory = Math.max(this.peakMemory, current.heapUsed);
    }, 100);

    // Clean up interval after test timeout
    setTimeout(() => clearInterval(interval), 30000);
  }

  /**
   * Get current resource usage
   */
  static getUsage(): {
    memoryUsed: number;
    memoryPeak: number;
    memoryDelta: number;
  } {
    const current = process.memoryUsage();
    
    return {
      memoryUsed: current.heapUsed,
      memoryPeak: this.peakMemory,
      memoryDelta: current.heapUsed - this.initialMemory.heapUsed
    };
  }

  /**
   * Assert memory usage is within limits
   */
  static assertMemoryLimit(maxMB: number): void {
    const usage = this.getUsage();
    const usedMB = usage.memoryUsed / (1024 * 1024);
    
    if (usedMB > maxMB) {
      throw new Error(
        `Memory usage ${usedMB.toFixed(2)}MB exceeds limit of ${maxMB}MB`
      );
    }
  }

  /**
   * Force garbage collection if available
   */
  static forceGC(): void {
    if (global.gc) {
      global.gc();
    }
  }
}

/**
 * Test data validation utilities
 */
export class TestDataValidator {
  /**
   * Validate that test scenario produces expected results
   */
  static validateScenario(
    result: ValidationResult,
    expected: {
      isValid?: boolean;
      errorCount?: number;
      warningCount?: number;
      conflictCount?: number;
      maxTime?: number;
    }
  ): void {
    if (expected.isValid !== undefined && result.isValid !== expected.isValid) {
      throw new Error(
        `Expected isValid to be ${expected.isValid}, but got ${result.isValid}`
      );
    }

    if (expected.errorCount !== undefined && result.errors.length !== expected.errorCount) {
      throw new Error(
        `Expected ${expected.errorCount} errors, but got ${result.errors.length}`
      );
    }

    if (expected.warningCount !== undefined && result.warnings.length !== expected.warningCount) {
      throw new Error(
        `Expected ${expected.warningCount} warnings, but got ${result.warnings.length}`
      );
    }

    if (expected.conflictCount !== undefined && result.conflicts.length !== expected.conflictCount) {
      throw new Error(
        `Expected ${expected.conflictCount} conflicts, but got ${result.conflicts.length}`
      );
    }

    if (expected.maxTime !== undefined && result.performance.validationTime > expected.maxTime) {
      throw new Error(
        `Expected validation to complete within ${expected.maxTime}ms, ` +
        `but took ${result.performance.validationTime.toFixed(2)}ms`
      );
    }
  }
}