/**
 * Pattern matching and analysis utilities for conflict detection
 * Provides comprehensive pattern analysis with security-focused algorithms
 */

import { NormalizedRule, PatternType, RuleOverlap } from './types';

/**
 * Pattern analysis result
 */
export interface PatternAnalysis {
  /** Pattern complexity score (0-100) */
  complexity: number;
  /** Pattern specificity score (0-100) */
  specificity: number;
  /** Potential weaknesses detected */
  weaknesses: PatternWeakness[];
  /** Pattern signature for grouping */
  signature: string;
  /** Estimated match coverage */
  coverage: number;
  /** Performance impact assessment */
  performanceImpact: 'high' | 'medium' | 'low' | 'negligible';
}

/**
 * Pattern weakness detection
 */
export interface PatternWeakness {
  /** Type of weakness */
  type: 'too-broad' | 'too-vague' | 'escape-prone' | 'encoding-vulnerable' | 'traversal-risk';
  /** Severity of the weakness */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Description of the weakness */
  description: string;
  /** Examples of exploitation */
  exploitExamples: string[];
  /** Suggested resolution */
  resolution: string;
}

/**
 * Pattern overlap analysis result
 */
export interface PatternOverlapAnalysis extends RuleOverlap {
  /** Confidence in overlap detection (0-1) */
  confidence: number;
  /** Specific match points */
  matchPoints: MatchPoint[];
  /** Coverage percentage */
  coveragePercentage: number;
}

/**
 * Specific point where patterns match
 */
export interface MatchPoint {
  /** Example input that matches both patterns */
  input: string;
  /** Match score for first pattern */
  score1: number;
  /** Match score for second pattern */
  score2: number;
  /** Type of match */
  matchType: 'exact' | 'partial' | 'fuzzy';
}

/**
 * Advanced pattern matching engine
 */
export class PatternMatcher {
  private patternCache: Map<string, RegExp>;
  private matchCache: Map<string, boolean>;
  
  constructor() {
    this.patternCache = new Map();
    this.matchCache = new Map();
  }

  /**
   * Match a pattern against an input
   */
  public match(pattern: string, input: string, type: PatternType): boolean {
    const cacheKey = `${pattern}:${input}:${type}`;
    
    if (this.matchCache.has(cacheKey)) {
      return this.matchCache.get(cacheKey)!;
    }
    
    let result: boolean;
    
    switch (type) {
      case 'literal':
        result = this.matchLiteral(pattern, input);
        break;
      case 'glob':
        result = this.matchGlob(pattern, input);
        break;
      case 'regex':
        result = this.matchRegex(pattern, input);
        break;
      default:
        result = false;
    }
    
    this.matchCache.set(cacheKey, result);
    return result;
  }

  /**
   * Match literal pattern
   */
  private matchLiteral(pattern: string, input: string): boolean {
    return pattern === input;
  }

  /**
   * Match glob pattern
   */
  private matchGlob(pattern: string, input: string): boolean {
    const regex = this.globToRegex(pattern);
    return regex.test(input);
  }

  /**
   * Match regex pattern
   */
  private matchRegex(pattern: string, input: string): boolean {
    try {
      const regex = this.getOrCreateRegex(pattern);
      return regex.test(input);
    } catch {
      return false;
    }
  }

  /**
   * Convert glob to regex
   */
  public globToRegex(glob: string): RegExp {
    const cacheKey = `glob:${glob}`;
    
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey)!;
    }
    
    // Escape special regex characters except glob wildcards
    let regexStr = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    // Handle ** for recursive directory matching
    regexStr = regexStr.replace(/\.\*\.\*/g, '.*');
    
    const regex = new RegExp(`^${regexStr}$`);
    this.patternCache.set(cacheKey, regex);
    
    return regex;
  }

  /**
   * Get or create regex from pattern
   */
  private getOrCreateRegex(pattern: string): RegExp {
    const cacheKey = `regex:${pattern}`;
    
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey)!;
    }
    
    const regex = new RegExp(pattern);
    this.patternCache.set(cacheKey, regex);
    
    return regex;
  }

  /**
   * Check if two patterns can match the same input
   */
  public canOverlap(pattern1: string, pattern2: string): boolean {
    // Generate test cases based on both patterns
    const testCases = this.generateTestCases(pattern1, pattern2);
    
    for (const testCase of testCases) {
      const match1 = this.matchAnyType(pattern1, testCase);
      const match2 = this.matchAnyType(pattern2, testCase);
      
      if (match1 && match2) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Match against any pattern type
   */
  private matchAnyType(pattern: string, input: string): boolean {
    const type = this.detectPatternType(pattern);
    return this.match(pattern, input, type);
  }

  /**
   * Detect pattern type
   */
  private detectPatternType(pattern: string): PatternType {
    if (pattern.includes('*') || pattern.includes('?')) {
      return 'glob';
    }
    
    if (pattern.includes('\\') || pattern.includes('^') || 
        pattern.includes('$') || pattern.includes('(')) {
      return 'regex';
    }
    
    return 'literal';
  }

  /**
   * Generate comprehensive test cases
   */
  private generateTestCases(pattern1: string, pattern2: string): string[] {
    const cases: string[] = [];
    
    // Add the patterns themselves
    cases.push(pattern1, pattern2);
    
    // Generate variations
    const variations = [
      '',
      'test',
      'test.js',
      'index.html',
      'path/to/file',
      'path/to/file.js',
      '../../../etc/passwd',
      'cmd.exe',
      '/bin/bash',
      'script.sh',
      'config.json',
      '.env',
      'node_modules/package/index.js'
    ];
    
    // Add pattern-specific variations
    cases.push(...this.generatePatternVariations(pattern1));
    cases.push(...this.generatePatternVariations(pattern2));
    
    // Add all standard variations
    cases.push(...variations);
    
    // Add encoding variations for security testing
    cases.push(...this.generateEncodingVariations(pattern1));
    cases.push(...this.generateEncodingVariations(pattern2));
    
    return [...new Set(cases)];
  }

  /**
   * Generate variations based on pattern
   */
  private generatePatternVariations(pattern: string): string[] {
    const variations: string[] = [];
    
    if (pattern.includes('*')) {
      variations.push(
        pattern.replace(/\*/g, ''),
        pattern.replace(/\*/g, 'x'),
        pattern.replace(/\*/g, 'test'),
        pattern.replace(/\*/g, 'a/b/c')
      );
    }
    
    if (pattern.includes('?')) {
      variations.push(
        pattern.replace(/\?/g, 'a'),
        pattern.replace(/\?/g, '1'),
        pattern.replace(/\?/g, '_')
      );
    }
    
    if (pattern.includes('/')) {
      const parts = pattern.split('/');
      variations.push(
        parts[0] || '',
        parts[parts.length - 1] || '',
        parts.join('\\')
      );
    }
    
    return variations;
  }

  /**
   * Generate encoding variations for security testing
   */
  private generateEncodingVariations(pattern: string): string[] {
    const variations: string[] = [];
    
    // URL encoding
    variations.push(
      encodeURIComponent(pattern),
      pattern.replace(/\//g, '%2F'),
      pattern.replace(/\./g, '%2E')
    );
    
    // Unicode variations
    variations.push(
      pattern.replace(/\//g, '\u2215'),
      pattern.replace(/\./g, '\u002E')
    );
    
    // Double encoding
    variations.push(
      encodeURIComponent(encodeURIComponent(pattern))
    );
    
    return variations;
  }

  /**
   * Clear caches
   */
  public clearCache(): void {
    this.patternCache.clear();
    this.matchCache.clear();
  }
}

/**
 * Advanced pattern analysis engine
 */
export class PatternAnalyzer {
  private matcher: PatternMatcher;
  private analysisCache: Map<string, PatternAnalysis>;
  
  constructor() {
    this.matcher = new PatternMatcher();
    this.analysisCache = new Map();
  }

  /**
   * Analyze a pattern comprehensively
   */
  public analyzePattern(rule: NormalizedRule): PatternAnalysis {
    const cacheKey = `${rule.category}:${rule.original}`;
    
    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)!;
    }
    
    const analysis: PatternAnalysis = {
      complexity: this.calculateComplexity(rule),
      specificity: this.calculateSpecificity(rule),
      weaknesses: this.detectWeaknesses(rule),
      signature: this.getPatternSignature(rule),
      coverage: this.estimateCoverage(rule),
      performanceImpact: this.assessPerformanceImpact(rule)
    };
    
    this.analysisCache.set(cacheKey, analysis);
    return analysis;
  }

  /**
   * Calculate pattern complexity
   */
  private calculateComplexity(rule: NormalizedRule): number {
    let complexity = 0;
    const pattern = rule.original;
    
    // Length contributes to complexity
    complexity += Math.min(pattern.length / 2, 30);
    
    // Special characters add complexity
    const specialChars = pattern.match(/[*?[\]{}()|\\^$+.]/g);
    complexity += (specialChars?.length || 0) * 5;
    
    // Nesting depth
    const nestingDepth = (pattern.match(/\(/g) || []).length;
    complexity += nestingDepth * 10;
    
    // Pattern type complexity
    if (rule.patternType === 'regex') {
      complexity += 20;
    } else if (rule.patternType === 'glob') {
      complexity += 10;
    }
    
    return Math.min(100, complexity);
  }

  /**
   * Calculate pattern specificity
   */
  private calculateSpecificity(rule: NormalizedRule): number {
    let specificity = 100;
    const pattern = rule.original;
    
    // Wildcards reduce specificity
    const wildcards = pattern.match(/\*/g);
    specificity -= (wildcards?.length || 0) * 15;
    
    // Question marks reduce specificity
    const questions = pattern.match(/\?/g);
    specificity -= (questions?.length || 0) * 10;
    
    // Short patterns are less specific
    if (pattern.length < 5) {
      specificity -= 30;
    } else if (pattern.length < 10) {
      specificity -= 15;
    }
    
    // Literal patterns are most specific
    if (rule.patternType === 'literal') {
      specificity += 20;
    }
    
    return Math.max(0, Math.min(100, specificity));
  }

  /**
   * Detect pattern weaknesses
   */
  public detectWeaknesses(rule: NormalizedRule): PatternWeakness[] {
    const weaknesses: PatternWeakness[] = [];
    const pattern = rule.original;
    
    // Check for overly broad patterns
    if (pattern === '*' || pattern === '**' || pattern === '.*') {
      weaknesses.push({
        type: 'too-broad',
        severity: 'critical',
        description: 'Pattern matches everything, providing no security benefit',
        exploitExamples: ['any/path', 'malicious.exe', '../../etc/passwd'],
        resolution: 'Use more specific patterns that match only intended resources'
      });
    }
    
    // Check for path traversal vulnerability
    if (pattern.includes('..') || pattern.startsWith('.')) {
      weaknesses.push({
        type: 'traversal-risk',
        severity: 'high',
        description: 'Pattern may be vulnerable to path traversal attacks',
        exploitExamples: [
          '../../../etc/passwd',
          '..\\..\\..\\windows\\system32',
          '%2e%2e%2f%2e%2e%2f'
        ],
        resolution: 'Use absolute paths or validate against path traversal'
      });
    }
    
    // Check for encoding vulnerabilities
    if (!pattern.includes('/') && pattern.includes('*')) {
      weaknesses.push({
        type: 'encoding-vulnerable',
        severity: 'medium',
        description: 'Pattern may be bypassed with encoding techniques',
        exploitExamples: [
          encodeURIComponent(pattern),
          pattern.replace(/\//g, '%2F')
        ],
        resolution: 'Include path separators or use more specific patterns'
      });
    }
    
    // Check for vague patterns
    if (pattern.length < 3 || (pattern.match(/[a-zA-Z0-9]/g) || []).length < 2) {
      weaknesses.push({
        type: 'too-vague',
        severity: 'medium',
        description: 'Pattern is too vague and may match unintended inputs',
        exploitExamples: ['a', '1', '-'],
        resolution: 'Add more specific characters to the pattern'
      });
    }
    
    // Check for escape-prone patterns
    if (rule.category === 'deny' && rule.patternType === 'glob') {
      const hasAnchors = pattern.startsWith('/') || pattern.endsWith('$');
      if (!hasAnchors) {
        weaknesses.push({
          type: 'escape-prone',
          severity: 'high',
          description: 'Pattern lacks anchors and may be bypassed',
          exploitExamples: [
            `prefix${pattern}`,
            `${pattern}suffix`,
            `../bypass/${pattern}`
          ],
          resolution: 'Add path anchors or use regex with ^ and $ anchors'
        });
      }
    }
    
    return weaknesses;
  }

  /**
   * Generate pattern signature for grouping
   */
  public getPatternSignature(rule: NormalizedRule): string {
    const pattern = rule.normalized;
    
    // Create a signature that groups similar patterns
    let signature = rule.patternType + ':';
    
    // Extract key components
    if (pattern.includes('/')) {
      signature += 'path:';
    }
    
    if (pattern.includes('*')) {
      signature += 'wildcard:';
    }
    
    if (pattern.includes('.')) {
      const extension = pattern.split('.').pop();
      if (extension && extension.length <= 4) {
        signature += `ext:${extension}:`;
      }
    }
    
    // Add length category
    if (pattern.length < 5) {
      signature += 'short';
    } else if (pattern.length < 20) {
      signature += 'medium';
    } else {
      signature += 'long';
    }
    
    return signature;
  }

  /**
   * Estimate pattern coverage
   */
  private estimateCoverage(rule: NormalizedRule): number {
    const pattern = rule.original;
    
    // Literal patterns have minimal coverage
    if (rule.patternType === 'literal') {
      return 1;
    }
    
    // Estimate based on wildcards
    let coverage = 10;
    
    if (pattern === '*' || pattern === '**') {
      return 100;
    }
    
    const wildcards = (pattern.match(/\*/g) || []).length;
    coverage += wildcards * 20;
    
    const questions = (pattern.match(/\?/g) || []).length;
    coverage += questions * 5;
    
    return Math.min(100, coverage);
  }

  /**
   * Assess performance impact
   */
  private assessPerformanceImpact(rule: NormalizedRule): 'high' | 'medium' | 'low' | 'negligible' {
    const complexity = this.calculateComplexity(rule);
    
    if (complexity > 70) {
      return 'high';
    }
    
    if (complexity > 40) {
      return 'medium';
    }
    
    if (complexity > 20) {
      return 'low';
    }
    
    return 'negligible';
  }

  /**
   * Analyze overlap between two rules
   */
  public async analyzeOverlap(
    rule1: NormalizedRule,
    rule2: NormalizedRule
  ): Promise<PatternOverlapAnalysis> {
    const testCases = this.generateComprehensiveTestCases(rule1, rule2);
    const matchPoints: MatchPoint[] = [];
    
    let bothMatch = 0;
    let rule1Only = 0;
    let rule2Only = 0;
    
    for (const testCase of testCases) {
      const match1 = this.testPattern(rule1, testCase);
      const match2 = this.testPattern(rule2, testCase);
      
      if (match1 && match2) {
        bothMatch++;
        matchPoints.push({
          input: testCase,
          score1: 1,
          score2: 1,
          matchType: 'exact'
        });
      } else if (match1) {
        rule1Only++;
      } else if (match2) {
        rule2Only++;
      }
    }
    
    const overlapType = this.determineOverlapType(
      bothMatch,
      rule1Only,
      rule2Only,
      testCases.length
    );
    
    const confidence = this.calculateOverlapConfidence(
      bothMatch,
      testCases.length,
      rule1,
      rule2
    );
    
    const coveragePercentage = (bothMatch / testCases.length) * 100;
    
    return {
      rule1,
      rule2,
      overlapType,
      examples: matchPoints.slice(0, 5).map(mp => mp.input),
      securityImpact: this.assessOverlapImpact(rule1, rule2, overlapType),
      confidence,
      matchPoints: matchPoints.slice(0, 10),
      coveragePercentage
    };
  }

  /**
   * Test if a pattern matches an input
   */
  private testPattern(rule: NormalizedRule, input: string): boolean {
    if (rule.regex) {
      try {
        return rule.regex.test(input);
      } catch {
        return false;
      }
    }
    
    return this.matcher.match(rule.original, input, rule.patternType);
  }

  /**
   * Generate comprehensive test cases for overlap detection
   */
  private generateComprehensiveTestCases(
    rule1: NormalizedRule,
    rule2: NormalizedRule
  ): string[] {
    const cases: string[] = [];
    
    // Standard test cases
    const standard = [
      'file.txt',
      'script.js',
      'index.html',
      'style.css',
      'config.json',
      'package.json',
      '.env',
      '.gitignore',
      'README.md',
      'test.spec.js'
    ];
    
    // Path-based test cases
    const paths = [
      'src/index.js',
      'dist/bundle.js',
      'node_modules/package/index.js',
      '../parent/file.txt',
      '../../grandparent/file.txt',
      './current/file.txt',
      '/absolute/path/file.txt',
      'relative/path/file.txt'
    ];
    
    // Security-focused test cases
    const security = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\cmd.exe',
      'file.txt; rm -rf /',
      'file.txt && echo hacked',
      'file.txt | cat /etc/passwd',
      'file.txt\x00.jpg',
      'file.txt%00.jpg',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
    ];
    
    // Pattern-specific cases
    cases.push(...this.generatePatternSpecificCases(rule1));
    cases.push(...this.generatePatternSpecificCases(rule2));
    
    // Add all test case categories
    cases.push(...standard, ...paths, ...security);
    
    // Remove duplicates
    return [...new Set(cases)];
  }

  /**
   * Generate test cases specific to a pattern
   */
  private generatePatternSpecificCases(rule: NormalizedRule): string[] {
    const cases: string[] = [];
    const pattern = rule.original;
    
    // Add the pattern itself
    cases.push(pattern);
    
    // Generate variations based on pattern type
    if (rule.patternType === 'glob') {
      cases.push(
        pattern.replace(/\*/g, 'test'),
        pattern.replace(/\*/g, ''),
        pattern.replace(/\*/g, 'a/b/c'),
        pattern.replace(/\?/g, 'x')
      );
    }
    
    if (rule.patternType === 'literal') {
      cases.push(
        pattern,
        `${pattern}.txt`,
        `prefix-${pattern}`,
        `${pattern}-suffix`,
        pattern.toUpperCase(),
        pattern.toLowerCase()
      );
    }
    
    return cases;
  }

  /**
   * Determine type of overlap
   */
  private determineOverlapType(
    bothMatch: number,
    rule1Only: number,
    rule2Only: number,
    total: number
  ): 'exact' | 'subset' | 'superset' | 'partial' | 'none' {
    if (bothMatch === 0) {
      return 'none';
    }
    
    if (bothMatch === total && rule1Only === 0 && rule2Only === 0) {
      return 'exact';
    }
    
    if (rule1Only === 0 && bothMatch > 0) {
      return 'subset'; // rule1 is subset of rule2
    }
    
    if (rule2Only === 0 && bothMatch > 0) {
      return 'superset'; // rule1 is superset of rule2
    }
    
    return 'partial';
  }

  /**
   * Calculate confidence in overlap detection
   */
  private calculateOverlapConfidence(
    matches: number,
    total: number,
    rule1: NormalizedRule,
    rule2: NormalizedRule
  ): number {
    let confidence = (matches / total) * 100;
    
    // Adjust confidence based on pattern types
    if (rule1.patternType === 'literal' && rule2.patternType === 'literal') {
      confidence = rule1.original === rule2.original ? 100 : 0;
    }
    
    // Reduce confidence for complex patterns
    const complexity1 = this.calculateComplexity(rule1);
    const complexity2 = this.calculateComplexity(rule2);
    
    if (complexity1 > 50 || complexity2 > 50) {
      confidence *= 0.8;
    }
    
    return Math.min(100, Math.max(0, confidence));
  }

  /**
   * Assess security impact of overlap
   */
  private assessOverlapImpact(
    rule1: NormalizedRule,
    rule2: NormalizedRule,
    overlapType: string
  ): 'critical' | 'high' | 'medium' | 'low' {
    // Critical if deny rule is compromised
    if ((rule1.category === 'deny' && rule2.category !== 'deny') ||
        (rule2.category === 'deny' && rule1.category !== 'deny')) {
      return 'critical';
    }
    
    // High if different categories overlap significantly
    if (rule1.category !== rule2.category && overlapType !== 'partial') {
      return 'high';
    }
    
    // Medium for same-category significant overlaps
    if (overlapType === 'exact' || overlapType === 'subset' || overlapType === 'superset') {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Check if two rules are contradictory
   */
  public async areContradictory(
    rule1: NormalizedRule,
    rule2: NormalizedRule
  ): Promise<boolean> {
    // Rules in different categories with significant overlap are contradictory
    if (rule1.category === rule2.category) {
      return false;
    }
    
    const overlap = await this.analyzeOverlap(rule1, rule2);
    
    return overlap.overlapType !== 'none' && 
           overlap.overlapType !== 'partial' &&
           overlap.confidence > 70;
  }

  /**
   * Get potential attack vectors for a pattern
   */
  public async getAttackVectors(pattern: string): Promise<string[]> {
    const vectors: string[] = [];
    
    // Path traversal vectors
    if (!pattern.startsWith('/')) {
      vectors.push(`Path traversal: ../../../${pattern}`);
    }
    
    // Encoding bypass vectors
    vectors.push(`URL encoding: ${encodeURIComponent(pattern)}`);
    vectors.push(`Double encoding: ${encodeURIComponent(encodeURIComponent(pattern))}`);
    
    // Null byte injection
    vectors.push(`Null byte: ${pattern}%00.safe`);
    
    // Command injection if pattern includes executable extensions
    if (pattern.includes('.sh') || pattern.includes('.exe') || pattern.includes('.bat')) {
      vectors.push(`Command injection: ${pattern} && malicious-command`);
    }
    
    return vectors;
  }

  /**
   * Make a pattern more specific
   */
  public makeMoreSpecific(pattern: string): string {
    // Add constraints to reduce matches
    if (pattern === '*') {
      return '*.js';
    }
    
    if (pattern === '**') {
      return 'src/**';
    }
    
    if (pattern.startsWith('*')) {
      return `specific/${pattern}`;
    }
    
    if (pattern.endsWith('*')) {
      return `${pattern.slice(0, -1)}.js`;
    }
    
    // Add path prefix if no path
    if (!pattern.includes('/')) {
      return `src/${pattern}`;
    }
    
    return pattern;
  }

  /**
   * Make a pattern more general
   */
  public makeMoreGeneral(pattern: string): string {
    // Remove constraints to increase matches
    if (pattern.endsWith('.js')) {
      return pattern.slice(0, -3) + '.*';
    }
    
    if (pattern.startsWith('src/')) {
      return pattern.slice(4);
    }
    
    if (!pattern.includes('*')) {
      return `${pattern}*`;
    }
    
    return pattern;
  }

  /**
   * Clear analysis cache
   */
  public clearCache(): void {
    this.analysisCache.clear();
    this.matcher.clearCache();
  }
}

// Export singleton instances
export const patternMatcher = new PatternMatcher();
export const patternAnalyzer = new PatternAnalyzer();