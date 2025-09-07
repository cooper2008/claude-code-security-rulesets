/**
 * Example usage of the validation engine
 * Demonstrates zero-bypass enforcement and performance optimization
 */

import { ValidationEngine } from '../src/validation/engine';
import { ClaudeCodeConfiguration } from '../src/types';

async function main() {
  console.log('Claude Code Security Validation Engine - Example Usage\n');
  console.log('=' .repeat(60));

  // Initialize the validation engine with custom configuration
  const engine = new ValidationEngine({
    maxWorkers: 4,
    cache: {
      enabled: true,
      maxEntries: 500,
      maxMemoryMB: 25,
      ttlMs: 10 * 60 * 1000 // 10 minutes
    },
    performance: {
      targetMs: 100,
      strictTimeout: false
    },
    security: {
      enforceZeroBypass: true,
      detectWeakPatterns: true,
      requireDenyRules: false
    }
  });

  // Example 1: Valid secure configuration
  console.log('\n1. Validating SECURE configuration:');
  const secureConfig: ClaudeCodeConfiguration = {
    permissions: {
      deny: [
        'exec',
        'eval',
        'shell',
        'system/*',
        '*.exe',
        '*.dll',
        '*.sh',
        '*.bat',
        '../*',
        '/etc/*',
        'C:\\Windows\\*'
      ],
      allow: [
        'read/docs/*',
        'write/output/*',
        'read/config/*.json',
        'write/logs/*.log'
      ],
      ask: [
        'delete/*',
        'modify/sensitive/*',
        'network/external/*'
      ]
    },
    metadata: {
      version: '1.0.0',
      timestamp: Date.now(),
      organization: 'ExampleCorp',
      environment: 'production'
    }
  };

  const secureResult = await engine.validate(secureConfig);
  printValidationResult('Secure Config', secureResult);

  // Example 2: Configuration with zero-bypass violation
  console.log('\n2. Validating configuration with ZERO-BYPASS VIOLATION:');
  const insecureConfig: ClaudeCodeConfiguration = {
    permissions: {
      deny: [
        'dangerous/*',
        '*.exe'
      ],
      allow: [
        '*',  // This would bypass all deny rules!
        'dangerous/exception.txt'  // This would bypass deny rule
      ],
      ask: [
        '*.exe.config'  // This could bypass *.exe deny rule
      ]
    }
  };

  const insecureResult = await engine.validate(insecureConfig);
  printValidationResult('Insecure Config', insecureResult);

  // Example 3: Configuration with overlapping patterns
  console.log('\n3. Validating configuration with OVERLAPPING patterns:');
  const overlappingConfig: ClaudeCodeConfiguration = {
    permissions: {
      deny: [
        'admin/*',
        'admin/**',
        'admin/users/*'  // Redundant
      ],
      allow: [
        'public/*',
        'public/**'  // Redundant
      ]
    }
  };

  const overlappingResult = await engine.validate(overlappingConfig);
  printValidationResult('Overlapping Config', overlappingResult);

  // Example 4: Performance test with caching
  console.log('\n4. Performance test with CACHING:');
  const perfConfig: ClaudeCodeConfiguration = {
    permissions: {
      deny: Array.from({ length: 100 }, (_, i) => `threat${i}/*`),
      allow: Array.from({ length: 100 }, (_, i) => `safe${i}/*`),
      ask: Array.from({ length: 50 }, (_, i) => `confirm${i}/*`)
    }
  };

  console.log('First validation (no cache):');
  const perfStart1 = performance.now();
  const perfResult1 = await engine.validate(perfConfig);
  const perfTime1 = performance.now() - perfStart1;
  console.log(`  Time: ${perfTime1.toFixed(2)}ms`);
  console.log(`  Target met: ${perfResult1.performance.performanceTarget.achieved}`);

  console.log('Second validation (with cache):');
  const perfStart2 = performance.now();
  await engine.validate(perfConfig);
  const perfTime2 = performance.now() - perfStart2;
  console.log(`  Time: ${perfTime2.toFixed(2)}ms`);
  console.log(`  Cache hit: ${perfTime2 < perfTime1 / 10}`);

  // Example 5: Batch validation
  console.log('\n5. BATCH validation of multiple configurations:');
  const batchConfigs: ClaudeCodeConfiguration[] = [
    {
      permissions: {
        deny: ['exec'],
        allow: ['read/*']
      }
    },
    {
      permissions: {
        deny: ['eval', 'exec'],
        allow: ['write/*']
      }
    },
    {
      permissions: {
        deny: ['system/*'],
        ask: ['admin/*']
      }
    }
  ];

  const batchResult = await engine.validateBatch({
    id: 'example-batch',
    configurations: batchConfigs,
    options: {}
  });

  console.log(`  Total configs: ${batchResult.count}`);
  console.log(`  Successful: ${batchResult.successCount}`);
  console.log(`  Failed: ${batchResult.failureCount}`);
  console.log(`  Total time: ${batchResult.totalTime.toFixed(2)}ms`);
  console.log(`  Avg per config: ${(batchResult.totalTime / batchResult.count).toFixed(2)}ms`);

  // Example 6: Rule statistics
  console.log('\n6. Rule STATISTICS analysis:');
  const stats = engine.getRuleStatistics(secureConfig);
  console.log('  Rule breakdown:');
  console.log(`    Deny rules: ${stats.byCategory.deny}`);
  console.log(`    Allow rules: ${stats.byCategory.allow}`);
  console.log(`    Ask rules: ${stats.byCategory.ask}`);
  console.log('  Complexity metrics:');
  console.log(`    Average pattern length: ${stats.complexity.averagePatternLength.toFixed(1)}`);
  console.log(`    Glob patterns: ${stats.complexity.globCount}`);
  console.log(`    Regex patterns: ${stats.complexity.regexCount}`);
  console.log(`    Literal patterns: ${stats.complexity.literalCount}`);

  // Example 7: Cache statistics
  console.log('\n7. Cache STATISTICS:');
  const cacheStats = engine.getCacheStats();
  console.log(`  Cache hits: ${cacheStats.hits}`);
  console.log(`  Cache misses: ${cacheStats.misses}`);
  console.log(`  Hit rate: ${cacheStats.hitRate.toFixed(1)}%`);
  console.log(`  Entries: ${cacheStats.entries}`);
  console.log(`  Memory used: ${(cacheStats.memoryUsed / 1024).toFixed(2)}KB`);
  console.log(`  Avg cache retrieval: ${cacheStats.avgCacheRetrievalTime.toFixed(2)}ms`);
  console.log(`  Avg validation time: ${cacheStats.avgValidationTime.toFixed(2)}ms`);

  // Cleanup
  await engine.shutdown();
  console.log('\n' + '=' .repeat(60));
  console.log('Validation engine shutdown complete.');
}

function printValidationResult(name: string, result: any) {
  console.log(`\n  ${name} Results:`);
  console.log(`  ├─ Valid: ${result.isValid ? '✅' : '❌'}`);
  console.log(`  ├─ Validation time: ${result.performance.validationTime.toFixed(2)}ms`);
  console.log(`  ├─ Performance target: ${result.performance.performanceTarget.achieved ? '✅ Met' : '❌ Exceeded'}`);
  console.log(`  ├─ Rules processed: ${result.performance.rulesProcessed}`);
  console.log(`  ├─ Errors: ${result.errors.length}`);
  console.log(`  ├─ Warnings: ${result.warnings.length}`);
  console.log(`  ├─ Conflicts: ${result.conflicts.length}`);
  console.log(`  └─ Suggestions: ${result.suggestions.length}`);

  // Print critical errors
  if (result.errors.length > 0) {
    console.log('\n  Critical Errors:');
    result.errors.slice(0, 3).forEach((error: any, i: number) => {
      console.log(`    ${i + 1}. [${error.severity}] ${error.message}`);
    });
    if (result.errors.length > 3) {
      console.log(`    ... and ${result.errors.length - 3} more`);
    }
  }

  // Print conflicts
  if (result.conflicts.length > 0) {
    console.log('\n  Conflicts Detected:');
    result.conflicts.slice(0, 3).forEach((conflict: any, i: number) => {
      console.log(`    ${i + 1}. [${conflict.securityImpact}] ${conflict.type}`);
      console.log(`       ${conflict.message}`);
    });
    if (result.conflicts.length > 3) {
      console.log(`    ... and ${result.conflicts.length - 3} more`);
    }
  }

  // Print suggestions
  if (result.suggestions.length > 0) {
    console.log('\n  Suggestions:');
    result.suggestions.slice(0, 2).forEach((suggestion: any, i: number) => {
      console.log(`    ${i + 1}. [${suggestion.type}] ${suggestion.message}`);
    });
    if (result.suggestions.length > 2) {
      console.log(`    ... and ${result.suggestions.length - 2} more`);
    }
  }
}

// Run the examples
main().catch(console.error);