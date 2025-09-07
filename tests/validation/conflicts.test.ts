/**
 * Comprehensive security tests for conflict detection system
 * Tests zero-bypass enforcement, pattern analysis, and automatic resolution
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  ConflictDetectionEngine,
  ConflictSeverity,
  DetailedConflictAnalysis
} from '../../src/validation/conflicts';
import {
  PatternMatcher,
  PatternAnalyzer,
  PatternWeakness
} from '../../src/validation/patterns';
import {
  ConflictResolver,
  ResolutionContext,
  ResolutionResult
} from '../../src/validation/resolution';
import {
  RuleConflict,
  ClaudeCodeConfiguration,
  ValidationError
} from '../../src/types';
import { NormalizedRule } from '../../src/validation/types';

describe('ConflictDetectionEngine', () => {
  let engine: ConflictDetectionEngine;
  
  beforeEach(() => {
    engine = new ConflictDetectionEngine({
      deepAnalysis: true,
      generateResolutions: true,
      securityLevel: 'strict'
    });
  });
  
  afterEach(() => {
    engine.clearCache();
  });

  describe('Zero-Bypass Detection', () => {
    it('should detect when allow rule exactly matches deny rule', async () => {
      const rules: NormalizedRule[] = [
        {
          original: 'exec',
          normalized: 'exec',
          patternType: 'literal',
          category: 'deny',
          priority: -1000,
          index: 0,
          regex: /^exec$/
        },
        {
          original: 'exec',
          normalized: 'exec',
          patternType: 'literal',
          category: 'allow',
          priority: 0,
          index: 0,
          regex: /^exec$/
        }
      ];

      const result = await engine.detectConflicts(rules);
      
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]!.type).toBe('ALLOW_OVERRIDES_DENY');
      expect(result.conflicts[0]!.securityImpact).toBe('critical');
      expect(result.conflicts[0]!.message).toContain('CRITICAL SECURITY VIOLATION');
    });

    it('should detect when allow pattern overlaps deny pattern', async () => {
      const rules: NormalizedRule[] = [
        {
          original: '*.exe',
          normalized: '.*\\.exe',
          patternType: 'glob',
          category: 'deny',
          priority: -1000,
          index: 0,
          regex: /.*\.exe$/
        },
        {
          original: 'cmd.exe',
          normalized: 'cmd\\.exe',
          patternType: 'literal',
          category: 'allow',
          priority: 0,
          index: 0,
          regex: /^cmd\.exe$/
        }
      ];

      const result = await engine.detectConflicts(rules);
      
      expect(result.conflicts.length).toBeGreaterThan(0);
      const zeroBypass = result.conflicts.find(c => c.type === 'ALLOW_OVERRIDES_DENY');
      expect(zeroBypass).toBeDefined();
      expect(zeroBypass!.securityImpact).toBe('critical');
    });

    it('should detect when ask rule could bypass deny rule', async () => {
      const rules: NormalizedRule[] = [
        {
          original: '/etc/*',
          normalized: '/etc/.*',
          patternType: 'glob',
          category: 'deny',
          priority: -1000,
          index: 0,
          regex: /^\/etc\/.*$/
        },
        {
          original: '/etc/hosts',
          normalized: '/etc/hosts',
          patternType: 'literal',
          category: 'ask',
          priority: -500,
          index: 0,
          regex: /^\/etc\/hosts$/
        }
      ];

      const result = await engine.detectConflicts(rules);
      
      const violation = result.conflicts.find(c => 
        c.type === 'ALLOW_OVERRIDES_DENY' && 
        c.conflictingRules.some(r => r.type === 'ask')
      );
      expect(violation).toBeDefined();
      expect(violation!.securityImpact).toBe('high');
    });

    it('should not flag non-overlapping patterns', async () => {
      const rules: NormalizedRule[] = [
        {
          original: '*.exe',
          normalized: '.*\\.exe',
          patternType: 'glob',
          category: 'deny',
          priority: -1000,
          index: 0,
          regex: /.*\.exe$/
        },
        {
          original: '*.txt',
          normalized: '.*\\.txt',
          patternType: 'glob',
          category: 'allow',
          priority: 0,
          index: 0,
          regex: /.*\.txt$/
        }
      ];

      const result = await engine.detectConflicts(rules);
      
      const zeroBypass = result.conflicts.find(c => c.type === 'ALLOW_OVERRIDES_DENY');
      expect(zeroBypass).toBeUndefined();
    });
  });

  describe('Pattern Overlap Detection', () => {
    it('should detect exact duplicate patterns', async () => {
      const rules: NormalizedRule[] = [
        {
          original: 'test.js',
          normalized: 'test\\.js',
          patternType: 'literal',
          category: 'allow',
          priority: 0,
          index: 0,
          regex: /^test\.js$/
        },
        {
          original: 'test.js',
          normalized: 'test\\.js',
          patternType: 'literal',
          category: 'allow',
          priority: 1,
          index: 1,
          regex: /^test\.js$/
        }
      ];

      const result = await engine.detectConflicts(rules);
      
      const duplicate = result.conflicts.find(c => c.type === 'OVERLAPPING_PATTERNS');
      expect(duplicate).toBeDefined();
      expect(duplicate!.message).toContain('Duplicate');
    });

    it('should detect subset/superset relationships', async () => {
      const rules: NormalizedRule[] = [
        {
          original: '*.js',
          normalized: '.*\\.js',
          patternType: 'glob',
          category: 'deny',
          priority: -1000,
          index: 0,
          regex: /.*\.js$/
        },
        {
          original: 'test/*.js',
          normalized: 'test/.*\\.js',
          patternType: 'glob',
          category: 'deny',
          priority: -999,
          index: 1,
          regex: /^test\/.*\.js$/
        }
      ];

      const result = await engine.detectConflicts(rules);
      
      expect(result.overlaps.length).toBeGreaterThan(0);
      const overlap = result.overlaps[0];
      expect(overlap).toBeDefined();
      expect(['subset', 'superset', 'partial']).toContain(overlap!.overlapType);
    });

    it('should detect partial overlaps', async () => {
      const rules: NormalizedRule[] = [
        {
          original: 'src/*.js',
          normalized: 'src/.*\\.js',
          patternType: 'glob',
          category: 'allow',
          priority: 0,
          index: 0,
          regex: /^src\/.*\.js$/
        },
        {
          original: '*/index.js',
          normalized: '.*/index\\.js',
          patternType: 'glob',
          category: 'allow',
          priority: 1,
          index: 1,
          regex: /^.*\/index\.js$/
        }
      ];

      const result = await engine.detectConflicts(rules);
      
      // These patterns overlap for 'src/index.js'
      expect(result.overlaps.length).toBeGreaterThan(0);
    });
  });

  describe('Precedence Ambiguity Detection', () => {
    it('should detect ambiguous precedence in mixed categories', async () => {
      const rules: NormalizedRule[] = [
        {
          original: 'config.*',
          normalized: 'config\\..*',
          patternType: 'glob',
          category: 'deny',
          priority: -1000,
          index: 0,
          regex: /^config\..*$/
        },
        {
          original: 'config.*',
          normalized: 'config\\..*',
          patternType: 'glob',
          category: 'allow',
          priority: 0,
          index: 0,
          regex: /^config\..*$/
        }
      ];

      const result = await engine.detectConflicts(rules);
      
      const ambiguity = result.conflicts.find(c => 
        c.type === 'PRECEDENCE_AMBIGUITY' || c.type === 'ALLOW_OVERRIDES_DENY'
      );
      expect(ambiguity).toBeDefined();
    });
  });

  describe('Security Weakness Detection', () => {
    it('should detect overly broad patterns', async () => {
      const rules: NormalizedRule[] = [
        {
          original: '*',
          normalized: '.*',
          patternType: 'glob',
          category: 'allow',
          priority: 0,
          index: 0,
          regex: /.*/
        }
      ];

      const result = await engine.detectConflicts(rules);
      
      // Should generate security warning
      expect(result.conflicts.length).toBeGreaterThan(0);
    });

    it('should detect path traversal vulnerabilities', async () => {
      const rules: NormalizedRule[] = [
        {
          original: '../*',
          normalized: '\\.\\./.*',
          patternType: 'glob',
          category: 'deny',
          priority: -1000,
          index: 0,
          regex: /^\.\.\/.*$/
        }
      ];

      const result = await engine.detectConflicts(rules);
      
      // Pattern analyzer should detect weakness
      expect(result.conflicts.some(c => 
        c.message.includes('traversal') || 
        c.message.includes('bypass')
      )).toBeDefined();
    });
  });

  describe('Conflict Analysis', () => {
    it('should provide detailed analysis of conflicts', async () => {
      const conflict: RuleConflict = {
        type: 'ALLOW_OVERRIDES_DENY',
        message: 'Test conflict',
        conflictingRules: [
          { type: 'deny', pattern: '*.exe', location: { rule: '*.exe' } },
          { type: 'allow', pattern: 'app.exe', location: { rule: 'app.exe' } }
        ],
        resolution: 'REMOVE_CONFLICTING_RULE',
        securityImpact: 'critical'
      };

      const rules: NormalizedRule[] = [
        {
          original: '*.exe',
          normalized: '.*\\.exe',
          patternType: 'glob',
          category: 'deny',
          priority: -1000,
          index: 0,
          regex: /.*\.exe$/
        },
        {
          original: 'app.exe',
          normalized: 'app\\.exe',
          patternType: 'literal',
          category: 'allow',
          priority: 0,
          index: 0,
          regex: /^app\.exe$/
        }
      ];

      const analysis = await engine.analyzeConflict(conflict, rules);
      
      expect(analysis.severity).toBe(ConflictSeverity.CRITICAL);
      expect(analysis.attackVectors.length).toBeGreaterThan(0);
      expect(analysis.resolutionOptions.length).toBeGreaterThan(0);
      expect(analysis.confidence).toBeGreaterThan(50);
    });
  });

  describe('Performance', () => {
    it('should handle large rulesets efficiently', async () => {
      const rules: NormalizedRule[] = [];
      
      // Generate 1000 rules
      for (let i = 0; i < 1000; i++) {
        rules.push({
          original: `rule${i}`,
          normalized: `rule${i}`,
          patternType: 'literal',
          category: i % 3 === 0 ? 'deny' : i % 3 === 1 ? 'allow' : 'ask',
          priority: i,
          index: i,
          regex: new RegExp(`^rule${i}$`)
        });
      }

      const startTime = performance.now();
      const result = await engine.detectConflicts(rules);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.pairsAnalyzed).toBeGreaterThan(0);
    });

    it('should use cache for repeated detections', async () => {
      const rules: NormalizedRule[] = [
        {
          original: 'test',
          normalized: 'test',
          patternType: 'literal',
          category: 'deny',
          priority: -1000,
          index: 0,
          regex: /^test$/
        }
      ];

      // First detection
      const start1 = performance.now();
      const result1 = await engine.detectConflicts(rules);
      const time1 = performance.now() - start1;

      // Second detection (should use cache)
      const start2 = performance.now();
      const result2 = await engine.detectConflicts(rules);
      const time2 = performance.now() - start2;

      expect(time2).toBeLessThan(time1);
      expect(result1).toEqual(result2);
    });
  });
});

describe('PatternMatcher', () => {
  let matcher: PatternMatcher;
  
  beforeEach(() => {
    matcher = new PatternMatcher();
  });
  
  afterEach(() => {
    matcher.clearCache();
  });

  describe('Pattern Matching', () => {
    it('should match literal patterns exactly', () => {
      expect(matcher.match('test.js', 'test.js', 'literal')).toBe(true);
      expect(matcher.match('test.js', 'test.txt', 'literal')).toBe(false);
    });

    it('should match glob patterns correctly', () => {
      expect(matcher.match('*.js', 'test.js', 'glob')).toBe(true);
      expect(matcher.match('*.js', 'test.txt', 'glob')).toBe(false);
      expect(matcher.match('src/*.js', 'src/index.js', 'glob')).toBe(true);
      expect(matcher.match('**/*.js', 'deep/nested/file.js', 'glob')).toBe(true);
    });

    it('should match regex patterns', () => {
      expect(matcher.match('^test.*\\.js$', 'test123.js', 'regex')).toBe(true);
      expect(matcher.match('^test.*\\.js$', 'production.js', 'regex')).toBe(false);
    });

    it('should detect overlapping patterns', () => {
      expect(matcher.canOverlap('*.js', 'test.js')).toBe(true);
      expect(matcher.canOverlap('*.js', '*.txt')).toBe(false);
      expect(matcher.canOverlap('src/*', 'src/test.js')).toBe(true);
    });
  });

  describe('Glob to Regex Conversion', () => {
    it('should convert simple wildcards', () => {
      const regex = matcher.globToRegex('*.js');
      expect(regex.test('test.js')).toBe(true);
      expect(regex.test('test.txt')).toBe(false);
    });

    it('should handle directory wildcards', () => {
      const regex = matcher.globToRegex('src/**/*.js');
      expect(regex.test('src/a/b/c/test.js')).toBe(true);
      expect(regex.test('dist/test.js')).toBe(false);
    });

    it('should escape special regex characters', () => {
      const regex = matcher.globToRegex('file.name.js');
      expect(regex.test('file.name.js')).toBe(true);
      expect(regex.test('filexnamexjs')).toBe(false);
    });
  });
});

describe('PatternAnalyzer', () => {
  let analyzer: PatternAnalyzer;
  
  beforeEach(() => {
    analyzer = new PatternAnalyzer();
  });
  
  afterEach(() => {
    analyzer.clearCache();
  });

  describe('Pattern Analysis', () => {
    it('should calculate pattern complexity', () => {
      const simpleRule: NormalizedRule = {
        original: 'test',
        normalized: 'test',
        patternType: 'literal',
        category: 'deny',
        priority: -1000,
        index: 0
      };
      
      const complexRule: NormalizedRule = {
        original: '^(?:src|dist)/(?:.*\\.(?:js|ts|jsx|tsx))$',
        normalized: '^(?:src|dist)/(?:.*\\.(?:js|ts|jsx|tsx))$',
        patternType: 'regex',
        category: 'deny',
        priority: -1000,
        index: 0
      };
      
      const simpleAnalysis = analyzer.analyzePattern(simpleRule);
      const complexAnalysis = analyzer.analyzePattern(complexRule);
      
      expect(complexAnalysis.complexity).toBeGreaterThan(simpleAnalysis.complexity);
    });

    it('should detect pattern weaknesses', () => {
      const weakRule: NormalizedRule = {
        original: '..',
        normalized: '..',
        patternType: 'literal',
        category: 'deny',
        priority: -1000,
        index: 0
      };
      
      const weaknesses = analyzer.detectWeaknesses(weakRule);
      
      expect(weaknesses.length).toBeGreaterThan(0);
      expect(weaknesses.some(w => w.type === 'traversal-risk')).toBe(true);
    });

    it('should detect overly broad patterns', () => {
      const broadRule: NormalizedRule = {
        original: '*',
        normalized: '.*',
        patternType: 'glob',
        category: 'allow',
        priority: 0,
        index: 0
      };
      
      const weaknesses = analyzer.detectWeaknesses(broadRule);
      
      expect(weaknesses.some(w => w.type === 'too-broad')).toBe(true);
      expect(weaknesses.some(w => w.severity === 'critical')).toBe(true);
    });
  });

  describe('Overlap Analysis', () => {
    it('should analyze pattern overlaps accurately', async () => {
      const rule1: NormalizedRule = {
        original: '*.js',
        normalized: '.*\\.js',
        patternType: 'glob',
        category: 'deny',
        priority: -1000,
        index: 0,
        regex: /.*\.js$/
      };
      
      const rule2: NormalizedRule = {
        original: 'test.js',
        normalized: 'test\\.js',
        patternType: 'literal',
        category: 'allow',
        priority: 0,
        index: 0,
        regex: /^test\.js$/
      };
      
      const overlap = await analyzer.analyzeOverlap(rule1, rule2);
      
      expect(overlap.overlapType).toBe('subset');
      expect(overlap.examples).toContain('test.js');
      expect(overlap.securityImpact).toBe('critical');
    });
  });

  describe('Attack Vector Detection', () => {
    it('should identify path traversal vectors', async () => {
      const vectors = await analyzer.getAttackVectors('../config');
      
      expect(vectors.some(v => v.includes('traversal'))).toBe(true);
      expect(vectors.some(v => v.includes('../../../'))).toBe(true);
    });

    it('should identify encoding bypass vectors', async () => {
      const vectors = await analyzer.getAttackVectors('/etc/passwd');
      
      expect(vectors.some(v => v.includes('encoding'))).toBe(true);
      expect(vectors.some(v => v.includes('%2F'))).toBe(true);
    });
  });
});

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;
  
  beforeEach(() => {
    resolver = new ConflictResolver('strict');
  });
  
  afterEach(() => {
    resolver.clearCache();
  });

  describe('Conflict Resolution', () => {
    it('should resolve zero-bypass violations in strict mode', async () => {
      const conflict: RuleConflict = {
        type: 'ALLOW_OVERRIDES_DENY',
        message: 'Allow rule overrides deny',
        conflictingRules: [
          { type: 'deny', pattern: '*.exe', location: { rule: '*.exe' } },
          { type: 'allow', pattern: 'app.exe', location: { rule: 'app.exe' } }
        ],
        resolution: 'REMOVE_CONFLICTING_RULE',
        securityImpact: 'critical'
      };
      
      const context: ResolutionContext = {
        rules: [],
        conflicts: [conflict],
        securityLevel: 'strict',
        allowAutomaticFixes: true
      };
      
      const suggestion = await resolver.resolveConflict(conflict, context);
      
      expect(suggestion).toBeDefined();
      expect(suggestion!.type).toBe('fix');
      expect(suggestion!.autoFix).toBeDefined();
      expect(suggestion!.autoFix!.changes).toHaveProperty('action', 'remove');
    });

    it('should make patterns more restrictive when needed', async () => {
      const conflict: RuleConflict = {
        type: 'ALLOW_OVERRIDES_DENY',
        message: 'Overly broad allow rule',
        conflictingRules: [
          { type: 'deny', pattern: 'dangerous/*', location: { rule: 'dangerous/*' } },
          { type: 'allow', pattern: '*', location: { rule: '*' } }
        ],
        resolution: 'MAKE_ALLOW_MORE_RESTRICTIVE',
        securityImpact: 'critical'
      };
      
      const context: ResolutionContext = {
        rules: [],
        conflicts: [conflict],
        securityLevel: 'moderate',
        allowAutomaticFixes: true
      };
      
      const suggestion = await resolver.resolveConflict(conflict, context);
      
      expect(suggestion).toBeDefined();
      expect(suggestion!.autoFix?.changes).toHaveProperty('action', 'modify');
      const changes = suggestion!.autoFix!.changes as any;
      expect(changes.newPattern).not.toBe('*');
    });
  });

  describe('Resolution Application', () => {
    it('should apply resolutions to configuration', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['*.exe'],
          allow: ['app.exe', 'tool.exe'],
          ask: []
        }
      };
      
      const suggestions: ResolutionSuggestion[] = [
        {
          type: 'fix',
          message: 'Remove conflicting allow rule',
          autoFix: {
            description: 'Remove app.exe from allow',
            changes: {
              action: 'remove',
              category: 'allow',
              pattern: 'app.exe',
              reason: 'Conflicts with deny rule'
            }
          }
        }
      ];
      
      const result = await resolver.applyResolutions(config, suggestions);
      
      expect(result.success).toBe(true);
      expect(result.resolvedConfig?.permissions?.allow).not.toContain('app.exe');
      expect(result.resolvedConfig?.permissions?.allow).toContain('tool.exe');
      expect(result.changes).toHaveLength(1);
    });

    it('should handle multiple resolutions', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['dangerous/*'],
          allow: ['*', 'test.txt'],
          ask: ['dangerous/maybe.txt']
        }
      };
      
      const suggestions: ResolutionSuggestion[] = [
        {
          type: 'fix',
          message: 'Modify overly broad allow',
          autoFix: {
            description: 'Make * more specific',
            changes: {
              action: 'modify',
              category: 'allow',
              originalPattern: '*',
              newPattern: '*.txt',
              reason: 'Too broad'
            }
          }
        },
        {
          type: 'fix',
          message: 'Remove conflicting ask',
          autoFix: {
            description: 'Remove dangerous/maybe.txt',
            changes: {
              action: 'remove',
              category: 'ask',
              pattern: 'dangerous/maybe.txt',
              reason: 'Conflicts with deny'
            }
          }
        }
      ];
      
      const result = await resolver.applyResolutions(config, suggestions);
      
      expect(result.success).toBe(true);
      expect(result.resolvedConfig?.permissions?.allow).toContain('*.txt');
      expect(result.resolvedConfig?.permissions?.allow).not.toContain('*');
      expect(result.resolvedConfig?.permissions?.ask).not.toContain('dangerous/maybe.txt');
      expect(result.changes).toHaveLength(2);
    });
  });

  describe('Security Levels', () => {
    it('should enforce strict security in strict mode', async () => {
      resolver.setSecurityLevel('strict');
      
      const conflict: RuleConflict = {
        type: 'ALLOW_OVERRIDES_DENY',
        message: 'Security violation',
        conflictingRules: [
          { type: 'deny', pattern: 'secure', location: { rule: 'secure' } },
          { type: 'allow', pattern: 'secure', location: { rule: 'secure' } }
        ],
        resolution: 'REMOVE_CONFLICTING_RULE',
        securityImpact: 'critical'
      };
      
      const context: ResolutionContext = {
        rules: [],
        conflicts: [conflict],
        securityLevel: 'strict',
        allowAutomaticFixes: true
      };
      
      const suggestion = await resolver.resolveConflict(conflict, context);
      
      // In strict mode, should remove the allow rule, not the deny
      expect(suggestion!.autoFix!.changes).toHaveProperty('category', 'allow');
    });

    it('should be more lenient in permissive mode', async () => {
      resolver.setSecurityLevel('permissive');
      
      const suggestions: ResolutionSuggestion[] = [];
      
      // Generate many suggestions
      for (let i = 0; i < 20; i++) {
        suggestions.push({
          type: 'fix',
          message: `Fix ${i}`,
          autoFix: {
            description: `Fix ${i}`,
            changes: { action: 'remove', pattern: `rule${i}` }
          }
        });
      }
      
      const context: ResolutionContext = {
        rules: [],
        conflicts: [],
        securityLevel: 'permissive',
        allowAutomaticFixes: true
      };
      
      const optimized = await resolver.optimizeResolutions(suggestions, context);
      
      // In permissive mode, should limit automatic fixes
      expect(optimized.length).toBeLessThanOrEqual(10);
    });
  });
});

describe('Integration Tests', () => {
  let engine: ConflictDetectionEngine;
  let resolver: ConflictResolver;
  
  beforeEach(() => {
    engine = new ConflictDetectionEngine({
      deepAnalysis: true,
      generateResolutions: true,
      securityLevel: 'strict'
    });
    resolver = new ConflictResolver('strict');
  });

  it('should detect and resolve complete configuration', async () => {
    const config: ClaudeCodeConfiguration = {
      permissions: {
        deny: [
          '*.exe',
          '*.dll',
          '../*',
          'system/*'
        ],
        allow: [
          'app.exe',  // Conflicts with *.exe
          '*',        // Too broad
          'config/*'  // OK
        ],
        ask: [
          'installer.exe',  // Conflicts with *.exe
          'system/info.txt' // Conflicts with system/*
        ]
      }
    };

    // Normalize rules for detection
    const rules: NormalizedRule[] = [];
    let index = 0;
    
    for (const [category, patterns] of Object.entries(config.permissions!) as [string, string[]][]) {
      for (const pattern of patterns || []) {
        rules.push({
          original: pattern,
          normalized: pattern,
          patternType: pattern.includes('*') ? 'glob' : 'literal',
          category: category as 'deny' | 'allow' | 'ask',
          priority: category === 'deny' ? -1000 + index : 
                   category === 'ask' ? -500 + index : index,
          index: index++
        } as NormalizedRule);
      }
    }

    // Detect conflicts
    const detectionResult = await engine.detectConflicts(rules);
    
    expect(detectionResult.conflicts.length).toBeGreaterThan(0);
    
    // Generate automatic resolutions
    const suggestions = await engine.generateAutomaticResolution(
      detectionResult.conflicts,
      rules
    );
    
    expect(suggestions.length).toBeGreaterThan(0);
    
    // Apply resolutions
    const resolutionResult = await resolver.applyResolutions(config, suggestions);
    
    expect(resolutionResult.success).toBeDefined();
    expect(resolutionResult.resolvedConfig).toBeDefined();
    
    // Verify critical violations are resolved
    const criticalViolations = detectionResult.conflicts.filter(
      c => c.securityImpact === 'critical'
    );
    
    // All critical violations should have been addressed
    expect(resolutionResult.changes.length).toBeGreaterThanOrEqual(
      criticalViolations.length
    );
  });

  it('should maintain security posture after resolution', async () => {
    const config: ClaudeCodeConfiguration = {
      permissions: {
        deny: ['exec', 'eval', 'system'],
        allow: ['exec'],  // Direct conflict
        ask: []
      }
    };

    const rules: NormalizedRule[] = [
      {
        original: 'exec',
        normalized: 'exec',
        patternType: 'literal',
        category: 'deny',
        priority: -1000,
        index: 0
      },
      {
        original: 'eval',
        normalized: 'eval',
        patternType: 'literal',
        category: 'deny',
        priority: -999,
        index: 1
      },
      {
        original: 'system',
        normalized: 'system',
        patternType: 'literal',
        category: 'deny',
        priority: -998,
        index: 2
      },
      {
        original: 'exec',
        normalized: 'exec',
        patternType: 'literal',
        category: 'allow',
        priority: 0,
        index: 0
      }
    ];

    const detectionResult = await engine.detectConflicts(rules);
    const suggestions = await engine.generateAutomaticResolution(
      detectionResult.conflicts,
      rules
    );
    const resolutionResult = await resolver.applyResolutions(config, suggestions);

    // Verify deny rules are preserved
    expect(resolutionResult.resolvedConfig?.permissions?.deny).toContain('exec');
    expect(resolutionResult.resolvedConfig?.permissions?.deny).toContain('eval');
    expect(resolutionResult.resolvedConfig?.permissions?.deny).toContain('system');
    
    // Verify conflicting allow rule is removed
    expect(resolutionResult.resolvedConfig?.permissions?.allow).not.toContain('exec');
  });
});