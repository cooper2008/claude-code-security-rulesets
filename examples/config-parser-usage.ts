/**
 * Example usage of the Claude Code Configuration Parser
 * Demonstrates various features and use cases
 */

import {
  parseConfiguration,
  ConfigurationParser,
  discoverConfigurations,
  configUtils,
  defaultMergeOptions,
  defaultValidationOptions,
  type ClaudeCodeConfiguration,
  type ParserOptions
} from '../src/config/index.js';

/**
 * Basic configuration parsing example
 */
async function basicExample() {
  console.log('=== Basic Configuration Parsing ===');
  
  try {
    const result = await parseConfiguration({
      startDir: './my-project'
    });

    if (result.validation.isValid) {
      console.log('✅ Configuration is valid');
      console.log('Deny rules:', result.config.permissions?.deny);
      console.log('Allow rules:', result.config.permissions?.allow);
      console.log('Ask rules:', result.config.permissions?.ask);
      console.log('Performance:', `${result.performance.totalTime}ms`);
    } else {
      console.log('❌ Configuration has errors:');
      result.validation.errors.forEach(error => {
        console.log(`  - ${error.message} (${error.severity})`);
      });
    }
  } catch (error) {
    console.error('Failed to parse configuration:', error);
  }
}

/**
 * Advanced parsing with custom options
 */
async function advancedExample() {
  console.log('\n=== Advanced Configuration Parsing ===');
  
  const parser = new ConfigurationParser();
  
  const options: ParserOptions = {
    startDir: './enterprise-project',
    mergeOptions: {
      ...defaultMergeOptions.strict,
      trackRuleSources: true,
      preserveMetadata: true
    },
    validationOptions: {
      ...defaultValidationOptions.strict,
      validateEnvironmentVars: true
    },
    cliOverrides: {
      'permissions.deny': ['Write(/sensitive/**)', 'Execute(sudo)'],
      'metadata.environment': 'production'
    },
    envVars: {
      PROJECT_ROOT: '/app',
      API_ENDPOINT: 'https://api.company.com'
    }
  };

  try {
    const result = await parser.parseConfiguration(options);
    
    console.log('Configuration Sources:');
    result.sources.forEach(source => {
      console.log(`  ${source.level}: ${source.path} (${source.exists ? 'exists' : 'missing'})`);
    });

    console.log('\nMerge Information:');
    result.merge.sources.forEach(source => {
      console.log(`  ${source.level}: contributed ${source.contributedRules.deny.length} deny rules`);
      if (source.overriddenRules.length > 0) {
        console.log(`    Overridden rules: ${source.overriddenRules.join(', ')}`);
      }
    });

    if (result.validation.conflicts.length > 0) {
      console.log('\nRule Conflicts:');
      result.validation.conflicts.forEach(conflict => {
        console.log(`  ${conflict.type}: ${conflict.message}`);
        console.log(`    Security Impact: ${conflict.securityImpact}`);
        console.log(`    Resolution: ${conflict.resolution}`);
      });
    }

    console.log('\nPerformance Metrics:');
    console.log(`  Total time: ${result.performance.totalTime}ms`);
    console.log(`  Discovery: ${result.performance.discoveryTime}ms`);
    console.log(`  Loading: ${result.performance.loadingTime}ms`);
    console.log(`  Merging: ${result.performance.mergeTime}ms`);
    console.log(`  Validation: ${result.performance.validationTime}ms`);
    console.log(`  Configs processed: ${result.performance.configurationsProcessed}`);
    
  } catch (error) {
    console.error('Advanced parsing failed:', error);
  }
}

/**
 * Configuration discovery example
 */
async function discoveryExample() {
  console.log('\n=== Configuration Discovery ===');
  
  try {
    const sources = await discoverConfigurations({
      startDir: './my-project',
      maxDepth: 5,
      includeNonExistent: true,
      followSymlinks: false
    });

    console.log('Found configuration sources:');
    sources.forEach(source => {
      const status = source.exists ? '✅' : '❌';
      const size = source.size ? `(${source.size} bytes)` : '';
      const modified = source.modifiedTime ? source.modifiedTime.toISOString() : '';
      
      console.log(`  ${status} ${source.level}: ${source.path} ${size} ${modified}`);
    });
    
  } catch (error) {
    console.error('Discovery failed:', error);
  }
}

/**
 * Configuration utilities example
 */
async function utilitiesExample() {
  console.log('\n=== Configuration Utilities ===');
  
  // Create a sample configuration
  const config: ClaudeCodeConfiguration = {
    permissions: {
      deny: ['Write(*)', 'Execute(*)', 'Network(*.malicious.com)'],
      allow: ['Read(**)', 'Write(/tmp/**)', 'Network(api.company.com)'],
      ask: ['Write(/home/user/documents/**)', 'Execute(npm)']
    },
    metadata: {
      version: '2.1.0',
      timestamp: Date.now(),
      organization: 'Example Corp',
      environment: 'development'
    }
  };

  // Extract rule patterns
  const patterns = configUtils.extractRulePatterns(config);
  console.log('Rule patterns:');
  console.log(`  Total unique rules: ${patterns.all.length}`);
  console.log(`  Deny rules: ${patterns.deny.length}`);
  console.log(`  Allow rules: ${patterns.allow.length}`);
  console.log(`  Ask rules: ${patterns.ask.length}`);

  // Estimate complexity
  const complexity = configUtils.estimateComplexity(config);
  console.log('\nComplexity analysis:');
  console.log(`  Rule count: ${complexity.ruleCount}`);
  console.log(`  Wildcard patterns: ${complexity.wildcardCount}`);
  console.log(`  Complexity score: ${complexity.complexityScore}`);

  // Generate summary
  const summary = configUtils.generateSummary(config);
  console.log('\nConfiguration summary:');
  console.log(`  Has permissions: ${summary.hasPermissions}`);
  console.log(`  Rule count: ${summary.ruleCount}`);
  console.log(`  Version: ${summary.version}`);
  console.log(`  Created: ${summary.created?.toISOString()}`);

  // Validate patterns
  const invalidPatterns = patterns.all.filter(pattern => 
    !configUtils.isValidRulePattern(pattern)
  );
  if (invalidPatterns.length > 0) {
    console.log('\nInvalid patterns found:');
    invalidPatterns.forEach(pattern => console.log(`  ❌ ${pattern}`));
  } else {
    console.log('\n✅ All patterns are valid');
  }
}

/**
 * Enterprise workflow example
 */
async function enterpriseExample() {
  console.log('\n=== Enterprise Configuration Workflow ===');
  
  try {
    // Simulate enterprise configuration parsing with full hierarchy
    const result = await parseConfiguration({
      startDir: './enterprise-app',
      mergeOptions: {
        preserveMetadata: true,
        trackRuleSources: true,
        validateResult: true,
        allowCliOverrides: false, // Strict enterprise mode
        envVarSubstitution: true
      },
      validationOptions: {
        allowAdditionalProperties: false,
        validateEnvironmentVars: true,
        maxDepth: 10
      },
      envVars: {
        ENTERPRISE_ROOT: '/enterprise',
        APPROVED_DOMAINS: 'company.com,partner.com'
      }
    });

    // Audit information
    console.log('Enterprise Configuration Audit:');
    console.log(`  Configuration sources: ${result.sources.length}`);
    console.log(`  Total rules: ${configUtils.extractRulePatterns(result.config).all.length}`);
    console.log(`  Validation status: ${result.validation.isValid ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`  Security conflicts: ${result.validation.conflicts.length}`);
    console.log(`  Performance target met: ${result.validation.performance.performanceTarget.achieved ? '✅' : '❌'}`);

    // Security analysis
    const denyRules = result.config.permissions?.deny || [];
    const criticalSecurity = denyRules.filter(rule => 
      rule.includes('Write(*)') || 
      rule.includes('Execute(*)') || 
      rule.includes('Network(*)')
    );
    
    console.log(`\nSecurity Analysis:`);
    console.log(`  Critical security rules: ${criticalSecurity.length}`);
    console.log(`  Environment: ${result.config.metadata?.environment || 'unknown'}`);
    console.log(`  Organization: ${result.config.metadata?.organization || 'unknown'}`);

    // Configuration fingerprint for change detection
    const configJson = JSON.stringify(result.config, null, 0);
    const crypto = await import('crypto');
    const fingerprint = crypto.createHash('sha256').update(configJson).digest('hex').slice(0, 16);
    console.log(`  Configuration fingerprint: ${fingerprint}`);

  } catch (error) {
    console.error('Enterprise workflow failed:', error);
  }
}

/**
 * Performance monitoring example
 */
async function performanceExample() {
  console.log('\n=== Performance Monitoring ===');
  
  const parser = new ConfigurationParser();
  const iterations = 5;
  const results: number[] = [];

  console.log(`Running ${iterations} performance tests...`);
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    
    await parser.parseConfiguration({
      startDir: './test-project',
      useCache: i > 0 // Use cache after first iteration
    });
    
    const duration = Date.now() - start;
    results.push(duration);
    console.log(`  Run ${i + 1}: ${duration}ms`);
  }

  const avgTime = results.reduce((a, b) => a + b, 0) / results.length;
  const minTime = Math.min(...results);
  const maxTime = Math.max(...results);
  const cacheImprovement = results[0] - Math.min(...results.slice(1));

  console.log('\nPerformance Summary:');
  console.log(`  Average time: ${avgTime.toFixed(2)}ms`);
  console.log(`  Min time: ${minTime}ms`);
  console.log(`  Max time: ${maxTime}ms`);
  console.log(`  Cache improvement: ${cacheImprovement}ms`);
  console.log(`  Target met: ${avgTime < 100 ? '✅' : '❌'} (target: <100ms)`);

  // Cache statistics
  const stats = parser.getCacheStats();
  console.log(`  Cache size: ${stats.size} entries`);
  console.log(`  Cache hit rate: ${stats.hitRate.toFixed(2)}%`);
}

/**
 * Error handling and recovery example
 */
async function errorHandlingExample() {
  console.log('\n=== Error Handling and Recovery ===');
  
  try {
    // Test with various problematic configurations
    const testCases = [
      { name: 'Missing directory', startDir: './non-existent' },
      { name: 'Invalid JSON', startDir: './invalid-json-config' },
      { name: 'Timeout scenario', maxParseTime: 1 }, // Very short timeout
    ];

    for (const testCase of testCases) {
      console.log(`\nTesting: ${testCase.name}`);
      
      try {
        const result = await parseConfiguration(testCase);
        
        if (!result.validation.isValid) {
          console.log(`  ⚠️  Configuration issues found:`);
          result.validation.errors.slice(0, 3).forEach(error => {
            console.log(`    - ${error.type}: ${error.message}`);
          });
        } else {
          console.log(`  ✅ Handled gracefully`);
        }
        
      } catch (error) {
        console.log(`  ❌ Exception: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
  } catch (error) {
    console.error('Error handling test failed:', error);
  }
}

/**
 * Main example runner
 */
async function runExamples() {
  console.log('Claude Code Configuration Parser Examples');
  console.log('==========================================');
  
  const examples = [
    basicExample,
    advancedExample,
    discoveryExample,
    utilitiesExample,
    enterpriseExample,
    performanceExample,
    errorHandlingExample
  ];

  for (const example of examples) {
    try {
      await example();
    } catch (error) {
      console.error(`Example failed: ${example.name}`, error);
    }
  }

  console.log('\n✅ Examples completed');
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}

export {
  basicExample,
  advancedExample,
  discoveryExample,
  utilitiesExample,
  enterpriseExample,
  performanceExample,
  errorHandlingExample,
  runExamples
};