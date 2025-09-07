/**
 * Integration tests for validation engine + conflict detection
 * Tests the complete validation workflow with zero-bypass enforcement
 */

import { ValidationEngine } from '../../src/validation/engine';
import { ConflictDetectionEngine } from '../../src/validation/conflicts';
import { ClaudeCodeConfiguration, ValidationResult } from '../../src/types';
import { 
  securityScenarios, 
  realWorldScenarios,
  testDataGenerators,
  PerformanceBenchmark
} from '../fixtures/validation-scenarios';
import { 
  PerformanceTestHelper, 
  SecurityTestHelper,
  ConflictTestHelper,
  ResourceMonitor
} from '../helpers/validation';

describe('Validation Engine + Conflict Detection Integration', () => {
  let validationEngine: ValidationEngine;
  let conflictEngine: ConflictDetectionEngine;

  beforeEach(() => {
    validationEngine = new ValidationEngine({
      maxWorkers: 2,
      cache: {
        enabled: true,
        maxEntries: 100,
        maxMemoryMB: 10,
        ttlMs: 60000
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

    conflictEngine = new ConflictDetectionEngine({
      deepAnalysis: true,
      generateResolutions: true,
      securityLevel: 'strict'
    });

    ResourceMonitor.start();
  });

  afterEach(async () => {
    await validationEngine.shutdown();
    conflictEngine.clearCache();
    ResourceMonitor.clearMeasurements();
  });

  describe('End-to-End Validation Workflow', () => {
    test('should detect zero-bypass violations in complete workflow', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          deny: [
            'exec', 'eval', 'system', 'cmd.exe', '*.exe', 
            '/etc/*', '/root/*', 'dangerous/*'
          ],
          allow: [
            'exec',           // Direct violation
            'safe.exe',       // Pattern violation  
            '/etc/passwd',    // Path violation
            'dangerous/tool', // Directory violation
            '*'               // Universal violation
          ],
          ask: [
            'system',         // Ask violation
            'malware.exe',    // Pattern ask violation
            '/root/.ssh/id_rsa' // Critical file ask violation
          ]
        }
      };

      // Step 1: Full validation with conflict detection
      const { result: validationResult, duration } = await PerformanceTestHelper.measureAsync(
        'full-validation',
        () => validationEngine.validate(config)
      );

      // Should complete within performance target
      expect(duration).toBeLessThan(100);
      expect(validationResult.performance.performanceTarget.achieved).toBe(true);

      // Should detect configuration as invalid
      expect(validationResult.isValid).toBe(false);
      expect(validationResult.conflicts.length).toBeGreaterThan(5);

      // Should have zero-bypass violations
      const zeroBypassErrors = validationResult.errors.filter(e =>
        e.message.includes('ZERO-BYPASS VIOLATION')
      );
      expect(zeroBypassErrors.length).toBeGreaterThan(0);

      // Step 2: Detailed conflict analysis
      const rules = validationEngine.getRuleStatistics(config);
      expect(rules.totalRules).toBe(16); // 8 deny + 5 allow + 3 ask

      // Step 3: Critical conflicts should be flagged
      const criticalConflicts = validationResult.conflicts.filter(c =>
        c.securityImpact === 'critical'
      );
      expect(criticalConflicts.length).toBeGreaterThan(3);

      // Step 4: Auto-fix suggestions should be available
      expect(validationResult.suggestions.length).toBeGreaterThan(0);
      const autoFixSuggestions = validationResult.suggestions.filter(s =>
        s.autoFix !== undefined
      );
      expect(autoFixSuggestions.length).toBeGreaterThan(0);
    });

    test('should handle enterprise security configuration validation', async () => {
      const enterpriseConfig: ClaudeCodeConfiguration = {
        permissions: {
          deny: [
            // Execution prevention
            'exec', 'eval', 'system', 'shell', 'spawn', 'fork',
            
            // File type restrictions
            '*.exe', '*.dll', '*.bat', '*.cmd', '*.ps1', '*.sh',
            '*.com', '*.scr', '*.vbs', '*.jar',
            
            // System path restrictions  
            '/etc/*', '/root/*', '/proc/*', '/sys/*', '/dev/*',
            'C:\\Windows\\System32\\*', 'C:\\Windows\\SysWOW64\\*',
            
            // Directory traversal prevention
            '../*', '../../*', '../../../*', '....//.*',
            
            // Sensitive file patterns
            '*password*', '*secret*', '*private*', '*key*', 
            '*token*', '*credential*', '*.pem', '*.p12',
            
            // Network tools
            'curl', 'wget', 'nc', 'netcat', 'ssh', 'telnet', 'ftp'
          ],
          allow: [
            // Safe read operations
            'public/*', 'docs/*', 'readme.txt', 'help/*',
            
            // Application data
            'data/user/*', 'config/app.json', 'logs/*.log',
            
            // Safe file types
            '*.txt', '*.md', '*.json', '*.csv', '*.pdf',
            
            // Temporary files
            'temp/*.tmp', 'cache/*'
          ],
          ask: [
            // Administrative operations
            'admin/config/*', 'settings/*',
            
            // Data operations
            'reports/generate', 'backup/create', 
            'export/data/*', 'import/data/*',
            
            // User management
            'user/create', 'user/delete', 'user/modify'
          ]
        }
      };

      const result = await validationEngine.validate(enterpriseConfig);
      
      // Enterprise config should be valid and secure
      expect(result.isValid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
      expect(result.performance.validationTime).toBeLessThan(200);
      
      // Should have high security posture
      const criticalErrors = result.errors.filter(e => e.severity === 'critical');
      expect(criticalErrors).toHaveLength(0);
      
      // Performance should be good
      expect(result.performance.performanceTarget.achieved).toBe(true);
    });

    test('should maintain security while resolving conflicts', async () => {
      const conflictingConfig: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['dangerous/*', '*.exe', 'system'],
          allow: ['dangerous/safe.txt', 'app.exe', 'system'], // Last one conflicts
          ask: ['dangerous/maybe.exe'] // This also conflicts
        }
      };

      // Step 1: Validate and detect conflicts
      const result = await validationEngine.validate(conflictingConfig);
      expect(result.isValid).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);

      // Step 2: Apply automatic resolutions
      const autoFixSuggestions = result.suggestions.filter(s => s.autoFix);
      expect(autoFixSuggestions.length).toBeGreaterThan(0);

      // Step 3: Verify security is maintained after fixes
      // The auto-fix should remove conflicting allow/ask rules, not deny rules
      for (const suggestion of autoFixSuggestions) {
        if (suggestion.autoFix?.changes && 'category' in suggestion.autoFix.changes) {
          const changes = suggestion.autoFix.changes as any;
          if (changes.action === 'remove') {
            // Should not remove deny rules
            expect(changes.category).not.toBe('deny');
          }
        }
      }
    });
  });

  describe('Performance Integration Testing', () => {
    test('should handle concurrent validations efficiently', async () => {
      const configs = Array.from({ length: 10 }, (_, i) => ({
        permissions: {
          deny: [`pattern${i}/*`],
          allow: [`safe${i}/*`],
          ask: [`maybe${i}`]
        }
      } as ClaudeCodeConfiguration));

      const startTime = performance.now();
      
      // Run validations concurrently
      const promises = configs.map(config => validationEngine.validate(config));
      const results = await Promise.all(promises);
      
      const totalTime = performance.now() - startTime;

      // All should complete quickly
      expect(totalTime).toBeLessThan(1000); // 10 configs in under 1 second
      
      // All should be valid
      results.forEach(result => {
        expect(result.isValid).toBe(true);
        expect(result.performance.performanceTarget.achieved).toBe(true);
      });
    });

    test('should efficiently process large ruleset with conflicts', async () => {
      // Generate intentionally conflicting configuration
      const largeConflictingConfig = testDataGenerators.generateConflictingConfig(100);
      
      const { result, duration } = await PerformanceTestHelper.measureAsync(
        'large-conflicting-config',
        () => validationEngine.validate(largeConflictingConfig)
      );

      // Should complete within reasonable time despite conflicts
      expect(duration).toBeLessThan(2000); // 2 seconds for 200 total rules with conflicts
      expect(result.isValid).toBe(false);
      expect(result.conflicts.length).toBe(100); // Each pattern conflicts
      
      // Performance target may not be achieved for complex conflicts, but should not timeout
      expect(result.performance.validationTime).toBe(duration);
    });

    test('should demonstrate cache effectiveness across validation types', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['test1', 'test2'],
          allow: ['safe1', 'safe2']
        }
      };

      // First validation - cache miss
      const result1 = await validationEngine.validate(config);
      
      // Second validation - should hit cache  
      const { duration: cachedDuration } = await PerformanceTestHelper.measureAsync(
        'cached-validation',
        () => validationEngine.validate(config)
      );

      expect(cachedDuration).toBeLessThan(10); // Cache hit should be very fast
      expect(result1.configurationHash).toBeDefined();
      
      const cacheStats = validationEngine.getCacheStats();
      expect(cacheStats.hitRate).toBeGreaterThan(0);
    });
  });

  describe('Security Integration Testing', () => {
    test('should prevent sophisticated bypass attempts', async () => {
      const sophisticatedBypassConfig: ClaudeCodeConfiguration = {
        permissions: {
          deny: [
            'dangerous', '../config', '*.exe', '/etc/passwd'
          ],
          allow: [
            // Various bypass attempts
            'dangerous',                    // Direct bypass
            '%2e%2e%2fconfig',             // URL encoding
            '\u002e\u002e\u002fconfig',    // Unicode
            'safe.exe',                     // Pattern bypass
            '%2f%65%74%63%2f%70%61%73%73%77%64', // Encoded /etc/passwd
            'DANGEROUS',                    // Case variation
            './dangerous',                  // Relative path
            'dir/../dangerous',             // Path traversal
          ]
        }
      };

      const result = await validationEngine.validate(sophisticatedBypassConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(4);
      
      // Should detect multiple bypass attempts
      const bypassConflicts = result.conflicts.filter(c => 
        c.type === 'ALLOW_OVERRIDES_DENY' && c.securityImpact === 'critical'
      );
      expect(bypassConflicts.length).toBeGreaterThan(2);
    });

    test('should handle regex injection attempts', async () => {
      const regexInjectionConfig: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['^dangerous$'],
          allow: [
            'dangerous.*', // Could match more than intended
            '^dangerous',  // Missing end anchor
            'dangerous$',  // Missing start anchor  
            '.*dangerous.*', // Too broad
            'dangerous|safe', // Unexpected OR
          ]
        }
      };

      const result = await validationEngine.validate(regexInjectionConfig);
      
      expect(result.isValid).toBe(false);
      
      // Should detect pattern conflicts and security issues
      const hasSecurityWarnings = result.warnings.some(w =>
        w.message.includes('broad') || w.message.includes('dangerous')
      ) || result.errors.some(e =>
        e.type === 'SECURITY_VIOLATION'
      );
      
      expect(hasSecurityWarnings).toBe(true);
    });

    test('should validate real-world attack scenarios', async () => {
      const attackScenarios = SecurityTestHelper.generateAttackScenarios();
      
      for (const scenario of attackScenarios) {
        const config: ClaudeCodeConfiguration = {
          permissions: {
            deny: ['malicious'],
            allow: [scenario.pattern]
          }
        };
        
        const result = await validationEngine.validate(config);
        
        if (scenario.expectedDetection) {
          // Should detect security issue
          const hasSecurityDetection = 
            result.warnings.some(w => w.message.toLowerCase().includes('security')) ||
            result.errors.some(e => e.type === 'SECURITY_VIOLATION') ||
            result.conflicts.some(c => c.securityImpact !== 'low');
          
          expect(hasSecurityDetection).toBe(true);
        }
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should handle invalid regex patterns gracefully', async () => {
      const invalidRegexConfig: ClaudeCodeConfiguration = {
        permissions: {
          deny: [
            '[unclosed',
            '(?invalid)',
            '*{invalid}',
            '\\invalid',
            '((nested',
            '+invalid'
          ]
        }
      };

      const result = await validationEngine.validate(invalidRegexConfig);
      
      // Should not crash
      expect(result).toBeDefined();
      expect(result.performance.validationTime).toBeGreaterThan(0);
      
      // Should treat as literal patterns when regex fails
      expect(result.isValid).toBe(true);
      expect(result.performance.rulesProcessed).toBe(6);
    });

    test('should recover from memory pressure', async () => {
      // Create memory pressure with large configurations
      const memoryPressureConfigs = Array.from({ length: 20 }, () =>
        testDataGenerators.generateLargeConfig(100, 100, 100)
      );

      const results = [];
      
      for (const config of memoryPressureConfigs) {
        const result = await validationEngine.validate(config);
        results.push(result);
        
        // Force garbage collection periodically
        if (results.length % 5 === 0) {
          ResourceMonitor.forceGC();
        }
      }

      // All validations should complete successfully
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.performance.rulesProcessed).toBe(300);
      });

      // Memory usage should be reasonable
      ResourceMonitor.assertMemoryLimit(200); // 200MB limit for stress test
    });

    test('should handle circular reference patterns', async () => {
      const circularConfig = {
        permissions: {
          deny: ['test']
        }
      } as any;
      
      // Create circular reference
      circularConfig.permissions.self = circularConfig.permissions;
      circularConfig.circular = circularConfig;

      const result = await validationEngine.validate(circularConfig);
      
      expect(result).toBeDefined();
      expect(result.performance.validationTime).toBeGreaterThan(0);
      expect(result.performance.validationTime).toBeLessThan(1000); // Should not hang
    });
  });

  describe('Batch Processing Integration', () => {
    test('should efficiently validate multiple configurations', async () => {
      const batchConfigs = [
        // Valid configuration
        {
          permissions: {
            deny: ['dangerous'],
            allow: ['safe/*']
          }
        },
        // Invalid configuration with conflicts
        {
          permissions: {
            deny: ['exec'],
            allow: ['exec'] // Conflict
          }
        },
        // Enterprise configuration
        realWorldScenarios.enterprise[0].config,
        // Large configuration
        testDataGenerators.generateLargeConfig(50, 50, 50)
      ] as ClaudeCodeConfiguration[];

      const batchResult = await validationEngine.validateBatch({
        id: 'integration-test-batch',
        configurations: batchConfigs,
        options: {}
      });

      expect(batchResult.count).toBe(4);
      expect(batchResult.successCount).toBeGreaterThan(0);
      expect(batchResult.failureCount).toBeGreaterThan(0); // At least one should fail due to conflicts
      expect(batchResult.totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Verify individual results
      expect(batchResult.results[0].isValid).toBe(true); // Valid config
      expect(batchResult.results[1].isValid).toBe(false); // Conflicting config
      expect(batchResult.results[2].isValid).toBe(true); // Enterprise config
      expect(batchResult.results[3].performance.rulesProcessed).toBe(150); // Large config
    });
  });

  describe('Coverage Verification', () => {
    test('should achieve comprehensive test coverage', async () => {
      // Test all major code paths
      const coverageConfigs = [
        // Empty configuration
        {},
        // Minimal configuration
        { permissions: { deny: ['test'] } },
        // Full configuration
        {
          permissions: {
            deny: ['deny1', 'deny2'],
            allow: ['allow1', 'allow2'], 
            ask: ['ask1', 'ask2']
          }
        },
        // Conflicting configuration
        {
          permissions: {
            deny: ['conflict'],
            allow: ['conflict'],
            ask: ['conflict']
          }
        },
        // Complex patterns
        testDataGenerators.generateComplexRegexConfig(5)
      ] as ClaudeCodeConfiguration[];

      for (const config of coverageConfigs) {
        const result = await validationEngine.validate(config);
        
        // Basic validation
        expect(result).toBeDefined();
        expect(result.performance.validationTime).toBeGreaterThan(0);
        expect(result.performance.performanceTarget).toBeDefined();
        expect(result.suggestions).toBeDefined();
        
        // Statistics
        const stats = validationEngine.getRuleStatistics(config);
        expect(stats.totalRules).toBeGreaterThanOrEqual(0);
        expect(stats.byCategory).toBeDefined();
        expect(stats.complexity).toBeDefined();
        expect(stats.coverage).toBeDefined();
      }

      // Verify cache functionality
      const cacheStats = validationEngine.getCacheStats();
      expect(cacheStats).toBeDefined();
      expect(cacheStats.entries).toBeGreaterThanOrEqual(0);
      
      // Export/import cache
      const exportedCache = validationEngine.exportCache();
      expect(exportedCache).toBeDefined();
      
      validationEngine.importCache(exportedCache);
      const importedStats = validationEngine.getCacheStats();
      expect(importedStats).toBeDefined();
    });
  });
});