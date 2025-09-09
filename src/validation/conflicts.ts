/**
 * Advanced conflict detection engine for Claude Code Security Rulesets
 * Implements comprehensive pattern analysis with zero-bypass enforcement
 * Provides automatic resolution suggestions with security-first approach
 */

import {
  RuleConflict,
  ConflictType,
  SecurityImpact,
  ResolutionStrategy,
  ConflictingRule,
  ResolutionSuggestion,
  ValidationError
} from '../types/index';

import {
  NormalizedRule,
  PatternType,
  RuleOverlap,
  ConflictDetectionResult,
  SecurityAnalysis,
  SecurityIssue,
  BypassVector
} from './types';

import { PatternMatcher, PatternAnalyzer } from './patterns';
import { ConflictResolver, ResolutionContext } from './resolution';

/**
 * Configuration for conflict detection engine
 */
export interface ConflictDetectionConfig {
  /** Enable deep pattern analysis */
  deepAnalysis: boolean;
  /** Maximum patterns to analyze (for performance) */
  maxPatternsToAnalyze: number;
  /** Enable automatic resolution generation */
  generateResolutions: boolean;
  /** Security strictness level */
  securityLevel: 'strict' | 'moderate' | 'permissive';
  /** Enable parallel analysis for large rulesets */
  parallelAnalysis: boolean;
  /** Timeout for analysis in milliseconds */
  analysisTimeout: number;
}

/**
 * Conflict severity levels for prioritization
 */
export enum ConflictSeverity {
  CRITICAL = 'critical',   // Zero-bypass violations
  HIGH = 'high',           // Security policy conflicts
  MEDIUM = 'medium',       // Precedence ambiguities
  LOW = 'low',             // Redundancies or optimizations
  INFO = 'info'            // Informational overlaps
}

/**
 * Detailed conflict analysis result
 */
export interface DetailedConflictAnalysis {
  /** Primary conflict information */
  conflict: RuleConflict;
  /** Severity of the conflict */
  severity: ConflictSeverity;
  /** Potential attack vectors */
  attackVectors: string[];
  /** Resolution options */
  resolutionOptions: ResolutionOption[];
  /** Confidence score (0-100) */
  confidence: number;
  /** Performance impact if unresolved */
  performanceImpact: 'high' | 'medium' | 'low' | 'negligible';
  /** Related conflicts that should be resolved together */
  relatedConflicts: string[];
}

/**
 * Resolution option with risk assessment
 */
export interface ResolutionOption {
  /** Resolution strategy */
  strategy: ResolutionStrategy;
  /** Description of the resolution */
  description: string;
  /** Risk level of applying this resolution */
  riskLevel: 'safe' | 'moderate' | 'risky';
  /** Automated fix available */
  automatedFix: boolean;
  /** Code changes required */
  changes: ResolutionChange[];
  /** Expected outcome */
  expectedOutcome: string;
  /** Side effects of this resolution */
  sideEffects: string[];
}

/**
 * Specific change required for resolution
 */
export interface ResolutionChange {
  /** Type of change */
  type: 'add' | 'remove' | 'modify' | 'reorder';
  /** Target rule category */
  category: 'deny' | 'allow' | 'ask';
  /** Original pattern (if modifying/removing) */
  originalPattern?: string;
  /** New pattern (if adding/modifying) */
  newPattern?: string;
  /** Index position (if reordering) */
  position?: number;
  /** Reason for this change */
  reason: string;
}

/**
 * Pattern conflict matrix for quick lookups
 */
interface ConflictMatrix {
  /** Map of pattern pairs to conflict types */
  conflicts: Map<string, ConflictInfo>;
  /** Patterns grouped by potential conflicts */
  conflictGroups: Map<string, Set<string>>;
  /** Critical security violations */
  criticalViolations: Set<string>;
}

/**
 * Information about a specific conflict
 */
interface ConflictInfo {
  /** Type of conflict */
  type: ConflictType;
  /** Security impact level */
  impact: SecurityImpact;
  /** Example inputs that trigger conflict */
  triggerExamples: string[];
  /** Detection confidence (0-1) */
  confidence: number;
}

/**
 * Advanced conflict detection engine with zero-bypass enforcement
 */
export class ConflictDetectionEngine {
  private config: ConflictDetectionConfig;
  private patternMatcher: PatternMatcher;
  private patternAnalyzer: PatternAnalyzer;
  private conflictResolver: ConflictResolver;
  private conflictMatrix: ConflictMatrix;
  private detectionCache: Map<string, ConflictDetectionResult>;

  constructor(config?: Partial<ConflictDetectionConfig>) {
    this.config = this.mergeConfig(config);
    this.patternMatcher = new PatternMatcher();
    this.patternAnalyzer = new PatternAnalyzer();
    this.conflictResolver = new ConflictResolver(this.config.securityLevel);
    this.conflictMatrix = {
      conflicts: new Map(),
      conflictGroups: new Map(),
      criticalViolations: new Set()
    };
    this.detectionCache = new Map();
  }

  /**
   * Merge user configuration with defaults
   */
  private mergeConfig(userConfig?: Partial<ConflictDetectionConfig>): ConflictDetectionConfig {
    return {
      deepAnalysis: userConfig?.deepAnalysis ?? true,
      maxPatternsToAnalyze: userConfig?.maxPatternsToAnalyze ?? 10000,
      generateResolutions: userConfig?.generateResolutions ?? true,
      securityLevel: userConfig?.securityLevel ?? 'strict',
      parallelAnalysis: userConfig?.parallelAnalysis ?? true,
      analysisTimeout: userConfig?.analysisTimeout ?? 5000
    };
  }

  /**
   * Detect all conflicts in a ruleset with comprehensive analysis
   */
  public async detectConflicts(
    rules: NormalizedRule[],
    options?: { skipCache?: boolean }
  ): Promise<ConflictDetectionResult> {
    const startTime = performance.now();
    
    // Generate cache key
    const cacheKey = this.generateCacheKey(rules);
    
    // Check cache if enabled
    if (!options?.skipCache && this.detectionCache.has(cacheKey)) {
      const cached = this.detectionCache.get(cacheKey)!;
      console.log(`Conflict detection cache hit - ${cached.conflicts.length} conflicts`);
      return cached;
    }

    const conflicts: RuleConflict[] = [];
    const overlaps: RuleOverlap[] = [];
    let pairsAnalyzed = 0;

    // Build conflict matrix for efficient detection
    await this.buildConflictMatrix(rules);

    // Group rules by category for systematic analysis
    const ruleGroups = this.groupRulesByCategory(rules);

    // Phase 1: Zero-bypass detection (CRITICAL)
    const zeroBypassConflicts = await this.detectZeroBypassViolations(
      ruleGroups.deny,
      [...ruleGroups.allow, ...ruleGroups.ask]
    );
    conflicts.push(...zeroBypassConflicts);
    pairsAnalyzed += ruleGroups.deny.length * (ruleGroups.allow.length + ruleGroups.ask.length);

    // Phase 2: Precedence ambiguity detection (HIGH)
    const precedenceConflicts = await this.detectPrecedenceAmbiguities(rules);
    conflicts.push(...precedenceConflicts);
    pairsAnalyzed += rules.length * (rules.length - 1) / 2;

    // Phase 3: Overlapping pattern detection (MEDIUM)
    const overlapResults = await this.detectOverlappingPatterns(rules);
    overlaps.push(...overlapResults.overlaps);
    conflicts.push(...overlapResults.conflicts);
    pairsAnalyzed += overlapResults.pairsAnalyzed;

    // Phase 4: Contradictory rule detection (MEDIUM-HIGH)
    const contradictions = await this.detectContradictoryRules(rules);
    conflicts.push(...contradictions);

    // Phase 5: Security weakness detection (HIGH-CRITICAL)
    if (this.config.deepAnalysis) {
      const securityWeaknesses = await this.detectSecurityWeaknesses(rules);
      conflicts.push(...securityWeaknesses);
    }

    // Remove duplicate conflicts
    const uniqueConflicts = this.deduplicateConflicts(conflicts);

    // Sort conflicts by severity
    const sortedConflicts = this.sortConflictsBySeverity(uniqueConflicts);

    const detectionTime = performance.now() - startTime;
    
    const result: ConflictDetectionResult = {
      conflicts: sortedConflicts,
      overlaps,
      detectionTime,
      pairsAnalyzed
    };

    // Cache the result
    this.detectionCache.set(cacheKey, result);

    // Log summary
    this.logDetectionSummary(result);

    return result;
  }

  /**
   * Detect zero-bypass violations where allow/ask rules could override deny rules
   */
  private async detectZeroBypassViolations(
    denyRules: NormalizedRule[],
    allowAskRules: NormalizedRule[]
  ): Promise<RuleConflict[]> {
    const conflicts: RuleConflict[] = [];

    for (const denyRule of denyRules) {
      for (const allowAskRule of allowAskRules) {
        const overlap = await this.patternAnalyzer.analyzeOverlap(denyRule, allowAskRule);
        
        if (overlap && overlap.overlapType !== 'none') {
          // This is a critical zero-bypass violation
          const conflict: RuleConflict = {
            type: 'ALLOW_OVERRIDES_DENY',
            message: this.generateZeroBypassMessage(denyRule, allowAskRule, overlap),
            conflictingRules: [
              this.createConflictingRule(denyRule),
              this.createConflictingRule(allowAskRule)
            ],
            resolution: this.determineZeroBypassResolution(denyRule, allowAskRule, overlap),
            securityImpact: 'critical'
          };

          // Add to critical violations set
          this.conflictMatrix.criticalViolations.add(
            `${denyRule.original}-${allowAskRule.original}`
          );

          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect precedence ambiguities in rule evaluation order
   */
  private async detectPrecedenceAmbiguities(
    rules: NormalizedRule[]
  ): Promise<RuleConflict[]> {
    const conflicts: RuleConflict[] = [];
    const precedenceMap = new Map<string, NormalizedRule[]>();

    // Group rules by similar patterns
    for (const rule of rules) {
      const patternKey = this.patternAnalyzer.getPatternSignature(rule);
      if (!precedenceMap.has(patternKey)) {
        precedenceMap.set(patternKey, []);
      }
      precedenceMap.get(patternKey)!.push(rule);
    }

    // Check each group for precedence issues
    for (const [patternKey, groupRules] of precedenceMap.entries()) {
      if (groupRules.length > 1) {
        const ambiguities = this.analyzePrecedenceAmbiguity(groupRules);
        if (ambiguities.length > 0) {
          conflicts.push(...ambiguities);
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect overlapping patterns within and across rule categories
   */
  private async detectOverlappingPatterns(
    rules: NormalizedRule[]
  ): Promise<{ conflicts: RuleConflict[], overlaps: RuleOverlap[], pairsAnalyzed: number }> {
    const conflicts: RuleConflict[] = [];
    const overlaps: RuleOverlap[] = [];
    let pairsAnalyzed = 0;

    // Use parallel analysis for large rulesets
    if (this.config.parallelAnalysis && rules.length > 100) {
      return await this.detectOverlappingPatternsParallel(rules);
    }

    // Sequential analysis for smaller rulesets
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        pairsAnalyzed++;
        
        const rule1 = rules[i];
        const rule2 = rules[j];
        
        const overlap = await this.patternAnalyzer.analyzeOverlap(rule1, rule2);
        
        if (overlap && overlap.overlapType !== 'none') {
          overlaps.push(overlap);
          
          // Create conflict if overlap is significant
          if (this.isSignificantOverlap(overlap, rule1, rule2)) {
            const conflict = this.createOverlapConflict(rule1, rule2, overlap);
            conflicts.push(conflict);
          }
        }
      }
    }

    return { conflicts, overlaps, pairsAnalyzed };
  }

  /**
   * Parallel pattern overlap detection for performance
   */
  private async detectOverlappingPatternsParallel(
    rules: NormalizedRule[]
  ): Promise<{ conflicts: RuleConflict[], overlaps: RuleOverlap[], pairsAnalyzed: number }> {
    // Implementation would use worker threads for parallel processing
    // For now, fallback to sequential
    return this.detectOverlappingPatterns(rules);
  }

  /**
   * Detect contradictory rules that conflict in intent
   */
  private async detectContradictoryRules(
    rules: NormalizedRule[]
  ): Promise<RuleConflict[]> {
    const conflicts: RuleConflict[] = [];
    
    // Find rules that contradict each other semantically
    for (const rule of rules) {
      const contradictions = await this.findContradictions(rule, rules);
      
      for (const contradiction of contradictions) {
        const conflict: RuleConflict = {
          type: 'CONTRADICTORY_RULES',
          message: `Rules "${rule.original}" and "${contradiction.original}" have contradictory intents`,
          conflictingRules: [
            this.createConflictingRule(rule),
            this.createConflictingRule(contradiction)
          ],
          resolution: 'MANUAL_REVIEW_REQUIRED',
          securityImpact: this.assessContradictionImpact(rule, contradiction)
        };
        
        conflicts.push(conflict);
      }
    }
    
    return conflicts;
  }

  /**
   * Detect security weaknesses in rule patterns
   */
  private async detectSecurityWeaknesses(
    rules: NormalizedRule[]
  ): Promise<RuleConflict[]> {
    const conflicts: RuleConflict[] = [];
    
    for (const rule of rules) {
      const weaknesses = await this.patternAnalyzer.detectWeaknesses(rule);
      
      for (const weakness of weaknesses) {
        const conflict: RuleConflict = {
          type: 'SECURITY_VIOLATION' as ConflictType,
          message: weakness.description,
          conflictingRules: [this.createConflictingRule(rule)],
          resolution: weakness.resolution as ResolutionStrategy,
          securityImpact: weakness.severity as SecurityImpact
        };
        
        conflicts.push(conflict);
      }
    }
    
    return conflicts;
  }

  /**
   * Analyze a specific conflict in detail
   */
  public async analyzeConflict(
    conflict: RuleConflict,
    rules: NormalizedRule[]
  ): Promise<DetailedConflictAnalysis> {
    const severity = this.determineConflictSeverity(conflict);
    const attackVectors = await this.identifyAttackVectors(conflict, rules);
    const resolutionOptions = await this.generateResolutionOptions(conflict, rules);
    const relatedConflicts = this.findRelatedConflicts(conflict, rules);
    
    const analysis: DetailedConflictAnalysis = {
      conflict,
      severity,
      attackVectors,
      resolutionOptions,
      confidence: this.calculateConfidence(conflict, rules),
      performanceImpact: this.assessPerformanceImpact(conflict),
      relatedConflicts
    };
    
    return analysis;
  }

  /**
   * Generate automatic resolution for conflicts
   */
  public async generateAutomaticResolution(
    conflicts: RuleConflict[],
    rules: NormalizedRule[]
  ): Promise<ResolutionSuggestion[]> {
    const suggestions: ResolutionSuggestion[] = [];
    
    // Create resolution context
    const context: ResolutionContext = {
      rules,
      conflicts,
      securityLevel: this.config.securityLevel,
      allowAutomaticFixes: true
    };
    
    for (const conflict of conflicts) {
      const resolution = await this.conflictResolver.resolveConflict(conflict, context);
      
      if (resolution) {
        suggestions.push(resolution);
      }
    }
    
    // Optimize resolutions to minimize changes
    const optimizedSuggestions = await this.conflictResolver.optimizeResolutions(
      suggestions,
      context
    );
    
    return optimizedSuggestions;
  }

  /**
   * Build conflict matrix for efficient lookups
   */
  private async buildConflictMatrix(rules: NormalizedRule[]): Promise<void> {
    this.conflictMatrix.conflicts.clear();
    this.conflictMatrix.conflictGroups.clear();
    this.conflictMatrix.criticalViolations.clear();
    
    // Pre-compute pattern signatures for grouping
    for (const rule of rules) {
      const signature = this.patternAnalyzer.getPatternSignature(rule);
      
      if (!this.conflictMatrix.conflictGroups.has(signature)) {
        this.conflictMatrix.conflictGroups.set(signature, new Set());
      }
      
      this.conflictMatrix.conflictGroups.get(signature)!.add(rule.original);
    }
  }

  /**
   * Group rules by category
   */
  private groupRulesByCategory(rules: NormalizedRule[]): {
    deny: NormalizedRule[],
    allow: NormalizedRule[],
    ask: NormalizedRule[]
  } {
    return {
      deny: rules.filter(r => r.category === 'deny'),
      allow: rules.filter(r => r.category === 'allow'),
      ask: rules.filter(r => r.category === 'ask')
    };
  }

  /**
   * Generate descriptive message for zero-bypass violation
   */
  private generateZeroBypassMessage(
    denyRule: NormalizedRule,
    allowAskRule: NormalizedRule,
    overlap: RuleOverlap
  ): string {
    const ruleType = allowAskRule.category;
    const overlapDescription = this.describeOverlap(overlap);
    
    return `CRITICAL SECURITY VIOLATION: ${ruleType} rule "${allowAskRule.original}" ` +
           `${overlapDescription} deny rule "${denyRule.original}". ` +
           `This creates a potential bypass vector where denied operations could be permitted. ` +
           `Examples of affected patterns: ${overlap.examples.slice(0, 3).join(', ')}`;
  }

  /**
   * Describe overlap relationship
   */
  private describeOverlap(overlap: RuleOverlap): string {
    switch (overlap.overlapType) {
      case 'exact':
        return 'exactly matches';
      case 'subset':
        return 'is a subset of';
      case 'superset':
        return 'is a superset of';
      case 'partial':
        return 'partially overlaps with';
      default:
        return 'overlaps with';
    }
  }

  /**
   * Determine resolution strategy for zero-bypass violation
   */
  private determineZeroBypassResolution(
    denyRule: NormalizedRule,
    allowAskRule: NormalizedRule,
    overlap: RuleOverlap
  ): ResolutionStrategy {
    if (overlap.overlapType === 'exact') {
      return 'REMOVE_CONFLICTING_RULE';
    }
    
    if (overlap.overlapType === 'superset') {
      return 'MAKE_ALLOW_MORE_RESTRICTIVE';
    }
    
    if (overlap.overlapType === 'subset') {
      return 'MAKE_DENY_MORE_SPECIFIC';
    }
    
    return 'MANUAL_REVIEW_REQUIRED';
  }

  /**
   * Create ConflictingRule from NormalizedRule
   */
  private createConflictingRule(rule: NormalizedRule): ConflictingRule {
    return {
      type: rule.category,
      pattern: rule.original,
      location: {
        rule: rule.original,
        path: `permissions.${rule.category}[${rule.index}]`
      }
    };
  }

  /**
   * Analyze precedence ambiguity within a group
   */
  private analyzePrecedenceAmbiguity(rules: NormalizedRule[]): RuleConflict[] {
    const conflicts: RuleConflict[] = [];
    
    // Check if different categories have similar patterns
    const categories = new Set(rules.map(r => r.category));
    
    if (categories.size > 1) {
      // Mixed categories with similar patterns is ambiguous
      const conflict: RuleConflict = {
        type: 'PRECEDENCE_AMBIGUITY',
        message: `Ambiguous precedence for pattern group: ${rules.map(r => r.original).join(', ')}`,
        conflictingRules: rules.map(r => this.createConflictingRule(r)),
        resolution: 'MAKE_DENY_MORE_SPECIFIC',
        securityImpact: this.hasDenyRule(rules) ? 'high' : 'medium'
      };
      
      conflicts.push(conflict);
    }
    
    return conflicts;
  }

  /**
   * Check if rule set contains deny rules
   */
  private hasDenyRule(rules: NormalizedRule[]): boolean {
    return rules.some(r => r.category === 'deny');
  }

  /**
   * Check if overlap is significant enough to report
   */
  private isSignificantOverlap(
    overlap: RuleOverlap,
    rule1: NormalizedRule,
    rule2: NormalizedRule
  ): boolean {
    // Always significant if different categories
    if (rule1.category !== rule2.category) {
      return true;
    }
    
    // Exact duplicates are always significant
    if (overlap.overlapType === 'exact') {
      return true;
    }
    
    // Subset/superset in same category might be intentional
    if (overlap.overlapType === 'subset' || overlap.overlapType === 'superset') {
      return rule1.category === 'deny'; // Only significant for deny rules
    }
    
    return false;
  }

  /**
   * Create conflict from overlap
   */
  private createOverlapConflict(
    rule1: NormalizedRule,
    rule2: NormalizedRule,
    overlap: RuleOverlap
  ): RuleConflict {
    const type = this.determineConflictType(rule1, rule2, overlap);
    const impact = this.calculateSecurityImpact(rule1, rule2, overlap);
    
    return {
      type,
      message: this.generateOverlapMessage(rule1, rule2, overlap),
      conflictingRules: [
        this.createConflictingRule(rule1),
        this.createConflictingRule(rule2)
      ],
      resolution: this.determineOverlapResolution(rule1, rule2, overlap),
      securityImpact: impact
    };
  }

  /**
   * Determine conflict type from overlap
   */
  private determineConflictType(
    rule1: NormalizedRule,
    rule2: NormalizedRule,
    overlap: RuleOverlap
  ): ConflictType {
    if (rule1.category !== rule2.category) {
      if (rule1.category === 'deny' || rule2.category === 'deny') {
        return 'ALLOW_OVERRIDES_DENY';
      }
      return 'CONTRADICTORY_RULES';
    }
    
    if (overlap.overlapType === 'exact') {
      return 'OVERLAPPING_PATTERNS';
    }
    
    return 'PRECEDENCE_AMBIGUITY';
  }

  /**
   * Calculate security impact of overlap
   */
  private calculateSecurityImpact(
    rule1: NormalizedRule,
    rule2: NormalizedRule,
    overlap: RuleOverlap
  ): SecurityImpact {
    // Critical if deny rule is compromised
    if ((rule1.category === 'deny' && rule2.category !== 'deny') ||
        (rule2.category === 'deny' && rule1.category !== 'deny')) {
      return 'critical';
    }
    
    // High if mixed categories
    if (rule1.category !== rule2.category) {
      return 'high';
    }
    
    // Medium for same-category overlaps
    if (overlap.overlapType !== 'partial') {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Generate descriptive message for overlap
   */
  private generateOverlapMessage(
    rule1: NormalizedRule,
    rule2: NormalizedRule,
    overlap: RuleOverlap
  ): string {
    const relationship = this.describeOverlap(overlap);
    
    if (rule1.category === rule2.category) {
      return `${rule1.category} rule "${rule1.original}" ${relationship} ` +
             `${rule2.category} rule "${rule2.original}". ` +
             `This creates redundancy or ambiguity in rule evaluation.`;
    }
    
    return `${rule1.category} rule "${rule1.original}" ${relationship} ` +
           `${rule2.category} rule "${rule2.original}". ` +
           `This creates conflicting security policies.`;
  }

  /**
   * Determine resolution for overlap
   */
  private determineOverlapResolution(
    rule1: NormalizedRule,
    rule2: NormalizedRule,
    overlap: RuleOverlap
  ): ResolutionStrategy {
    if (overlap.overlapType === 'exact' && rule1.category === rule2.category) {
      return 'REMOVE_CONFLICTING_RULE';
    }
    
    if (rule1.category === 'deny' || rule2.category === 'deny') {
      return 'MAKE_ALLOW_MORE_RESTRICTIVE';
    }
    
    return 'MANUAL_REVIEW_REQUIRED';
  }

  /**
   * Find contradictory rules
   */
  private async findContradictions(
    rule: NormalizedRule,
    allRules: NormalizedRule[]
  ): Promise<NormalizedRule[]> {
    const contradictions: NormalizedRule[] = [];
    
    for (const otherRule of allRules) {
      if (rule === otherRule) continue;
      
      if (await this.patternAnalyzer.areContradictory(rule, otherRule)) {
        contradictions.push(otherRule);
      }
    }
    
    return contradictions;
  }

  /**
   * Assess impact of contradiction
   */
  private assessContradictionImpact(
    rule1: NormalizedRule,
    rule2: NormalizedRule
  ): SecurityImpact {
    if (rule1.category === 'deny' || rule2.category === 'deny') {
      return 'high';
    }
    
    if (rule1.category !== rule2.category) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Determine severity of conflict
   */
  private determineConflictSeverity(conflict: RuleConflict): ConflictSeverity {
    if (conflict.securityImpact === 'critical') {
      return ConflictSeverity.CRITICAL;
    }
    
    if (conflict.type === 'ALLOW_OVERRIDES_DENY') {
      return ConflictSeverity.CRITICAL;
    }
    
    if (conflict.securityImpact === 'high') {
      return ConflictSeverity.HIGH;
    }
    
    if (conflict.type === 'PRECEDENCE_AMBIGUITY') {
      return ConflictSeverity.MEDIUM;
    }
    
    if (conflict.type === 'OVERLAPPING_PATTERNS') {
      return ConflictSeverity.LOW;
    }
    
    return ConflictSeverity.INFO;
  }

  /**
   * Identify potential attack vectors
   */
  private async identifyAttackVectors(
    conflict: RuleConflict,
    rules: NormalizedRule[]
  ): Promise<string[]> {
    const vectors: string[] = [];
    
    if (conflict.type === 'ALLOW_OVERRIDES_DENY') {
      vectors.push('Direct bypass of security policy through permissive rules');
      vectors.push('Privilege escalation through rule precedence exploitation');
      vectors.push('Path traversal attacks using pattern weaknesses');
    }
    
    if (conflict.type === 'PRECEDENCE_AMBIGUITY') {
      vectors.push('Race condition exploitation in rule evaluation');
      vectors.push('Context manipulation to trigger favorable rule');
    }
    
    // Add pattern-specific attack vectors
    for (const rule of conflict.conflictingRules) {
      const patternVectors = await this.patternAnalyzer.getAttackVectors(rule.pattern);
      vectors.push(...patternVectors);
    }
    
    return [...new Set(vectors)]; // Remove duplicates
  }

  /**
   * Generate resolution options
   */
  private async generateResolutionOptions(
    conflict: RuleConflict,
    rules: NormalizedRule[]
  ): Promise<ResolutionOption[]> {
    const options: ResolutionOption[] = [];
    
    // Always provide manual review option
    options.push({
      strategy: 'MANUAL_REVIEW_REQUIRED',
      description: 'Manually review and resolve the conflict',
      riskLevel: 'safe',
      automatedFix: false,
      changes: [],
      expectedOutcome: 'Conflict resolved through human expertise',
      sideEffects: ['Requires manual intervention']
    });
    
    // Generate automated options based on conflict type
    if (conflict.type === 'ALLOW_OVERRIDES_DENY') {
      options.push(...this.generateZeroBypassResolutions(conflict, rules));
    }
    
    if (conflict.type === 'OVERLAPPING_PATTERNS') {
      options.push(...this.generateOverlapResolutions(conflict, rules));
    }
    
    if (conflict.type === 'PRECEDENCE_AMBIGUITY') {
      options.push(...this.generatePrecedenceResolutions(conflict, rules));
    }
    
    return options;
  }

  /**
   * Generate resolutions for zero-bypass violations
   */
  private generateZeroBypassResolutions(
    conflict: RuleConflict,
    _rules: NormalizedRule[]
  ): ResolutionOption[] {
    const options: ResolutionOption[] = [];
    
    // Option 1: Remove the conflicting allow/ask rule
    options.push({
      strategy: 'REMOVE_CONFLICTING_RULE',
      description: `Remove the ${conflict.conflictingRules[1]?.type} rule that conflicts with deny`,
      riskLevel: 'safe',
      automatedFix: true,
      changes: [{
        type: 'remove',
        category: conflict.conflictingRules[1]?.type as 'allow' | 'ask',
        originalPattern: conflict.conflictingRules[1]?.pattern,
        reason: 'Eliminates zero-bypass security violation'
      }],
      expectedOutcome: 'Deny rule will be strictly enforced without bypass',
      sideEffects: ['Some legitimate operations may be blocked']
    });
    
    // Option 2: Make allow/ask rule more specific
    if (conflict.conflictingRules[1]) {
      const moreSpecific = this.patternAnalyzer.makeMoreSpecific(
        conflict.conflictingRules[1].pattern
      );
      
      options.push({
        strategy: 'MAKE_ALLOW_MORE_RESTRICTIVE',
        description: 'Modify the allow/ask rule to be more specific',
        riskLevel: 'moderate',
        automatedFix: true,
        changes: [{
          type: 'modify',
          category: conflict.conflictingRules[1].type as 'allow' | 'ask',
          originalPattern: conflict.conflictingRules[1].pattern,
          newPattern: moreSpecific,
          reason: 'Reduces overlap with deny rule while preserving some functionality'
        }],
        expectedOutcome: 'Partial functionality preserved with improved security',
        sideEffects: ['Some previously allowed operations may require review']
      });
    }
    
    return options;
  }

  /**
   * Generate resolutions for overlapping patterns
   */
  private generateOverlapResolutions(
    conflict: RuleConflict,
    _rules: NormalizedRule[]
  ): ResolutionOption[] {
    const options: ResolutionOption[] = [];
    
    // Option: Remove duplicate
    if (conflict.conflictingRules[0]?.pattern === conflict.conflictingRules[1]?.pattern) {
      options.push({
        strategy: 'REMOVE_CONFLICTING_RULE',
        description: 'Remove duplicate rule',
        riskLevel: 'safe',
        automatedFix: true,
        changes: [{
          type: 'remove',
          category: conflict.conflictingRules[1]?.type as 'deny' | 'allow' | 'ask',
          originalPattern: conflict.conflictingRules[1]?.pattern,
          reason: 'Eliminates redundancy'
        }],
        expectedOutcome: 'Simplified ruleset with same security posture',
        sideEffects: []
      });
    }
    
    return options;
  }

  /**
   * Generate resolutions for precedence issues
   */
  private generatePrecedenceResolutions(
    conflict: RuleConflict,
    _rules: NormalizedRule[]
  ): ResolutionOption[] {
    const options: ResolutionOption[] = [];
    
    // Option: Reorder rules for clarity
    options.push({
      strategy: 'MAKE_DENY_MORE_SPECIFIC',
      description: 'Reorder rules to clarify precedence',
      riskLevel: 'safe',
      automatedFix: true,
      changes: conflict.conflictingRules.map((rule, index) => ({
        type: 'reorder' as const,
        category: rule.type,
        originalPattern: rule.pattern,
        position: index,
        reason: 'Clarifies rule evaluation order'
      })),
      expectedOutcome: 'Clear and predictable rule precedence',
      sideEffects: []
    });
    
    return options;
  }

  /**
   * Find related conflicts
   */
  private findRelatedConflicts(
    conflict: RuleConflict,
    _rules: NormalizedRule[]
  ): string[] {
    const related: string[] = [];
    
    // Find conflicts involving the same patterns
    for (const rule of conflict.conflictingRules) {
      const key = `related:${rule.pattern}`;
      if (this.conflictMatrix.conflictGroups.has(key)) {
        const group = this.conflictMatrix.conflictGroups.get(key)!;
        related.push(...Array.from(group));
      }
    }
    
    return [...new Set(related)];
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    conflict: RuleConflict,
    _rules: NormalizedRule[]
  ): number {
    let confidence = 100;
    
    // Reduce confidence for complex patterns
    for (const rule of conflict.conflictingRules) {
      if (rule.pattern.length > 50) confidence -= 10;
      if (rule.pattern.includes('*')) confidence -= 5;
      if (rule.pattern.includes('?')) confidence -= 5;
    }
    
    // Increase confidence for exact matches
    if (conflict.type === 'OVERLAPPING_PATTERNS' && 
        conflict.conflictingRules[0]?.pattern === conflict.conflictingRules[1]?.pattern) {
      confidence = 100;
    }
    
    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Assess performance impact
   */
  private assessPerformanceImpact(conflict: RuleConflict): 'high' | 'medium' | 'low' | 'negligible' {
    if (conflict.type === 'OVERLAPPING_PATTERNS') {
      return 'low';
    }
    
    if (conflict.type === 'PRECEDENCE_AMBIGUITY') {
      return 'medium';
    }
    
    if (conflict.securityImpact === 'critical') {
      return 'high'; // Security checks add overhead
    }
    
    return 'negligible';
  }

  /**
   * Deduplicate conflicts
   */
  private deduplicateConflicts(conflicts: RuleConflict[]): RuleConflict[] {
    const seen = new Set<string>();
    const unique: RuleConflict[] = [];
    
    for (const conflict of conflicts) {
      const key = this.getConflictKey(conflict);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(conflict);
      }
    }
    
    return unique;
  }

  /**
   * Get unique key for conflict
   */
  private getConflictKey(conflict: RuleConflict): string {
    const patterns = conflict.conflictingRules
      .map(r => r.pattern)
      .sort()
      .join('|');
    return `${conflict.type}:${patterns}`;
  }

  /**
   * Sort conflicts by severity
   */
  private sortConflictsBySeverity(conflicts: RuleConflict[]): RuleConflict[] {
    const severityOrder: Record<SecurityImpact, number> = {
      'critical': 0,
      'high': 1,
      'medium': 2,
      'low': 3
    };
    
    return conflicts.sort((a, b) => {
      return severityOrder[a.securityImpact] - severityOrder[b.securityImpact];
    });
  }

  /**
   * Generate cache key for rules
   */
  private generateCacheKey(rules: NormalizedRule[]): string {
    const ruleStrings = rules.map(r => `${r.category}:${r.original}`).sort();
    return `conflicts:${ruleStrings.join(',')}`;
  }

  /**
   * Log detection summary
   */
  private logDetectionSummary(result: ConflictDetectionResult): void {
    const criticalCount = result.conflicts.filter(c => c.securityImpact === 'critical').length;
    const highCount = result.conflicts.filter(c => c.securityImpact === 'high').length;
    
    console.log(`Conflict Detection Summary:`);
    console.log(`- Total conflicts: ${result.conflicts.length}`);
    console.log(`- Critical: ${criticalCount}`);
    console.log(`- High: ${highCount}`);
    console.log(`- Overlaps detected: ${result.overlaps.length}`);
    console.log(`- Pairs analyzed: ${result.pairsAnalyzed}`);
    console.log(`- Detection time: ${result.detectionTime.toFixed(2)}ms`);
    
    if (criticalCount > 0) {
      console.error(`⚠️  CRITICAL SECURITY VIOLATIONS DETECTED!`);
    }
  }

  /**
   * Export conflict report
   */
  public exportConflictReport(
    result: ConflictDetectionResult,
    format: 'json' | 'markdown' = 'json'
  ): string {
    if (format === 'json') {
      return JSON.stringify(result, null, 2);
    }
    
    // Generate markdown report
    let report = '# Conflict Detection Report\n\n';
    report += `## Summary\n\n`;
    report += `- **Total Conflicts:** ${result.conflicts.length}\n`;
    report += `- **Detection Time:** ${result.detectionTime.toFixed(2)}ms\n`;
    report += `- **Pairs Analyzed:** ${result.pairsAnalyzed}\n\n`;
    
    report += `## Critical Violations\n\n`;
    const critical = result.conflicts.filter(c => c.securityImpact === 'critical');
    
    if (critical.length === 0) {
      report += '_No critical violations detected._\n\n';
    } else {
      for (const conflict of critical) {
        report += `### ${conflict.type}\n\n`;
        report += `**Message:** ${conflict.message}\n\n`;
        report += `**Resolution:** ${conflict.resolution}\n\n`;
        report += `**Affected Rules:**\n`;
        for (const rule of conflict.conflictingRules) {
          report += `- ${rule.type}: \`${rule.pattern}\`\n`;
        }
        report += '\n';
      }
    }
    
    return report;
  }

  /**
   * Clear detection cache
   */
  public clearCache(): void {
    this.detectionCache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.detectionCache.size,
      keys: Array.from(this.detectionCache.keys())
    };
  }
}

// Export singleton instance
export const conflictDetector = new ConflictDetectionEngine();

// Re-export types
export * from './patterns';
export * from './resolution';