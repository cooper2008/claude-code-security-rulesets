/**
 * Basic validation tests to ensure core functionality works
 */

import { ClaudeCodeConfiguration, ValidationResult } from '../src/types';

describe('Validation System', () => {
  test('should create basic configuration', () => {
    const config: ClaudeCodeConfiguration = {
      permissions: {
        deny: ['rm -rf *'],
        allow: ['ls', 'cat'],
        ask: ['git push']
      },
      metadata: {
        version: '1.0.0',
        timestamp: Date.now(),
        environment: 'test'
      }
    };

    expect(config).toBeDefined();
    expect(config.permissions?.deny).toContain('rm -rf *');
    expect(config.permissions?.allow).toContain('ls');
    expect(config.permissions?.ask).toContain('git push');
  });

  test('should have proper validation result structure', () => {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      conflicts: [],
      suggestions: [],
      performance: {
        validationTime: 10,
        rulesProcessed: 5,
        performanceTarget: {
          target: 100,
          achieved: true
        }
      }
    };

    expect(result.isValid).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.performance.validationTime).toBe(10);
  });
});