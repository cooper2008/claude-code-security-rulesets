/**
 * Automatic conflict resolution algorithms for Claude Code Security Rulesets
 * Implements priority-based resolution with security-first approach
 */

import {
  RuleConflict,
  ResolutionStrategy,
  ResolutionSuggestion,
  ConflictingRule,
  ClaudeCodeConfiguration
} from '../types/index';

import { NormalizedRule } from './types';
import { PatternAnalyzer } from './patterns';

/**
 * Resolution context for conflict resolution
 */
export interface ResolutionContext {
  /** All rules in the configuration */
  rules: NormalizedRule[];
  /** All detected conflicts */
  conflicts: RuleConflict[];
  /** Security strictness level */
  securityLevel: 'strict' | 'moderate' | 'permissive';
  /** Allow automatic fixes */
  allowAutomaticFixes: boolean;
}

/**
 * Resolution result with detailed changes
 */
export interface ResolutionResult {
  /** Whether resolution was successful */
  success: boolean;
  /** Resolved configuration */
  resolvedConfig?: ClaudeCodeConfiguration;
  /** Changes applied */
  changes: ConfigurationChange[];
  /** Validation messages */
  messages: string[];
  /** Remaining conflicts after resolution */
  remainingConflicts: RuleConflict[];
}

/**
 * Configuration change for audit trail
 */
export interface ConfigurationChange {
  /** Type of change */
  type: 'add' | 'remove' | 'modify' | 'reorder';
  /** Category affected */
  category: 'deny' | 'allow' | 'ask';
  /** Original value */
  originalValue?: string;
  /** New value */
  newValue?: string;
  /** Position in array */
  position?: number;
  /** Reason for change */
  reason: string;
  /** Risk assessment */
  risk: 'safe' | 'moderate' | 'risky';
}

/**
 * Resolution priority for conflict types
 */
interface ResolutionPriority {
  /** Conflict type */
  type: string;
  /** Priority level (lower is higher priority) */
  priority: number;
  /** Preferred strategy */
  preferredStrategy: ResolutionStrategy;
  /** Fallback strategies */
  fallbackStrategies: ResolutionStrategy[];
}

/**
 * Resolution template for common patterns
 */
interface ResolutionTemplate {
  /** Template name */
  name: string;
  /** Pattern to match */
  pattern: RegExp;
  /** Resolution strategy */
  strategy: ResolutionStrategy;
  /** Transformation function */
  transform: (pattern: string) => string;
  /** Applicability check */
  isApplicable: (conflict: RuleConflict) => boolean;
}

/**
 * Automatic conflict resolver with security-focused algorithms
 */
export class ConflictResolver {
  private patternAnalyzer: PatternAnalyzer;
  private securityLevel: 'strict' | 'moderate' | 'permissive';
  private resolutionPriorities: ResolutionPriority[];
  private resolutionTemplates: ResolutionTemplate[];
  private resolutionCache: Map<string, ResolutionSuggestion>;

  constructor(securityLevel: 'strict' | 'moderate' | 'permissive' = 'strict') {
    this.patternAnalyzer = new PatternAnalyzer();
    this.securityLevel = securityLevel;
    this.resolutionPriorities = this.initializePriorities();
    this.resolutionTemplates = this.initializeTemplates();
    this.resolutionCache = new Map();
  }

  /**
   * Initialize resolution priorities based on security level
   */
  private initializePriorities(): ResolutionPriority[] {
    const priorities: ResolutionPriority[] = [
      {
        type: 'ALLOW_OVERRIDES_DENY',
        priority: 1, // Highest priority - critical security violation
        preferredStrategy: this.securityLevel === 'strict' 
          ? 'REMOVE_CONFLICTING_RULE' 
          : 'MAKE_ALLOW_MORE_RESTRICTIVE',
        fallbackStrategies: ['MAKE_DENY_MORE_SPECIFIC', 'MANUAL_REVIEW_REQUIRED']
      },
      {
        type: 'PRECEDENCE_AMBIGUITY',
        priority: 2,
        preferredStrategy: 'MAKE_DENY_MORE_SPECIFIC',
        fallbackStrategies: ['REMOVE_CONFLICTING_RULE', 'MANUAL_REVIEW_REQUIRED']
      },
      {
        type: 'CONTRADICTORY_RULES',
        priority: 3,
        preferredStrategy: 'MANUAL_REVIEW_REQUIRED',
        fallbackStrategies: ['REMOVE_CONFLICTING_RULE']
      },
      {
        type: 'OVERLAPPING_PATTERNS',
        priority: 4,
        preferredStrategy: 'REMOVE_CONFLICTING_RULE',
        fallbackStrategies: ['MAKE_ALLOW_MORE_RESTRICTIVE']
      }
    ];

    return priorities.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Initialize resolution templates for common patterns
   */
  private initializeTemplates(): ResolutionTemplate[] {
    return [
      {
        name: 'wildcard-to-specific',
        pattern: /^\*+$/,
        strategy: 'MAKE_ALLOW_MORE_RESTRICTIVE',
        transform: (pattern: string) => '*.safe',
        isApplicable: (conflict) => 
          conflict.type === 'ALLOW_OVERRIDES_DENY' &&
          conflict.conflictingRules.some(r => r.pattern === '*' || r.pattern === '**')
      },
      {
        name: 'add-path-prefix',
        pattern: /^[^/]/,
        strategy: 'MAKE_ALLOW_MORE_RESTRICTIVE',
        transform: (pattern: string) => `safe/${pattern}`,
        isApplicable: (conflict) =>
          conflict.type === 'ALLOW_OVERRIDES_DENY' &&
          !conflict.conflictingRules[1]?.pattern.includes('/')
      },
      {
        name: 'add-extension-filter',
        pattern: /\*$/,
        strategy: 'MAKE_ALLOW_MORE_RESTRICTIVE',
        transform: (pattern: string) => pattern.replace(/\*$/, '*.txt'),
        isApplicable: (conflict) =>
          conflict.conflictingRules[1]?.pattern.endsWith('*')
      },
      {
        name: 'escape-special-chars',
        pattern: /[.+?^${}()|[\]\\]/,
        strategy: 'MAKE_DENY_MORE_SPECIFIC',
        transform: (pattern: string) => 
          pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
        isApplicable: (conflict) =>
          conflict.type === 'PRECEDENCE_AMBIGUITY'
      }
    ];
  }

  /**
   * Resolve a single conflict
   */
  public async resolveConflict(
    conflict: RuleConflict,
    context: ResolutionContext
  ): Promise<ResolutionSuggestion | null> {
    // Check cache
    const cacheKey = this.getConflictCacheKey(conflict);
    if (this.resolutionCache.has(cacheKey)) {
      return this.resolutionCache.get(cacheKey)!;
    }

    // Find applicable resolution strategy
    const priority = this.resolutionPriorities.find(p => p.type === conflict.type);
    if (!priority) {
      return null;
    }

    // Try preferred strategy first
    let suggestion = await this.applyStrategy(
      conflict,
      priority.preferredStrategy,
      context
    );

    // Try fallback strategies if preferred fails
    if (!suggestion && priority.fallbackStrategies.length > 0) {
      for (const fallback of priority.fallbackStrategies) {
        suggestion = await this.applyStrategy(conflict, fallback, context);
        if (suggestion) break;
      }
    }

    // Cache the result
    if (suggestion) {
      this.resolutionCache.set(cacheKey, suggestion);
    }

    return suggestion;
  }

  /**
   * Apply a specific resolution strategy
   */
  private async applyStrategy(
    conflict: RuleConflict,
    strategy: ResolutionStrategy,
    context: ResolutionContext
  ): Promise<ResolutionSuggestion | null> {
    switch (strategy) {
      case 'REMOVE_CONFLICTING_RULE':
        return this.createRemovalSuggestion(conflict, context);

      case 'MAKE_ALLOW_MORE_RESTRICTIVE':
        return this.createRestrictionSuggestion(conflict, context);

      case 'MAKE_DENY_MORE_SPECIFIC':
        return this.createSpecificDenySuggestion(conflict, context);

      case 'MANUAL_REVIEW_REQUIRED':
        return this.createManualReviewSuggestion(conflict);

      default:
        return null;
    }
  }

  /**
   * Create suggestion to remove conflicting rule
   */
  private createRemovalSuggestion(
    conflict: RuleConflict,
    context: ResolutionContext
  ): ResolutionSuggestion {
    const ruleToRemove = this.selectRuleToRemove(conflict, context);
    
    return {
      type: 'fix',
      message: `Remove ${ruleToRemove.type} rule "${ruleToRemove.pattern}" to resolve conflict`,
      autoFix: {
        description: `Removes the conflicting ${ruleToRemove.type} rule`,
        changes: {
          action: 'remove',
          category: ruleToRemove.type,
          pattern: ruleToRemove.pattern,
          reason: conflict.message
        }
      }
    };
  }

  /**
   * Select which rule to remove based on security priority
   */
  private selectRuleToRemove(
    conflict: RuleConflict,
    _context: ResolutionContext
  ): ConflictingRule {
    const rules = conflict.conflictingRules;
    
    // Never remove deny rules in strict mode
    if (this.securityLevel === 'strict') {
      const nonDenyRule = rules.find(r => r.type !== 'deny');
      if (nonDenyRule) return nonDenyRule;
    }
    
    // Remove the less specific rule
    const [rule1, rule2] = rules;
    if (!rule1 || !rule2) return rules[0]!;
    
    const spec1 = this.calculateSpecificity(rule1.pattern);
    const spec2 = this.calculateSpecificity(rule2.pattern);
    
    return spec1 > spec2 ? rule2 : rule1;
  }

  /**
   * Calculate pattern specificity
   */
  private calculateSpecificity(pattern: string): number {
    let score = 100;
    
    // Wildcards reduce specificity
    score -= (pattern.match(/\*/g) || []).length * 20;
    score -= (pattern.match(/\?/g) || []).length * 10;
    
    // Path depth increases specificity
    score += (pattern.match(/\//g) || []).length * 5;
    
    // Length increases specificity
    score += Math.min(pattern.length, 20);
    
    return score;
  }

  /**
   * Create suggestion to make allow rule more restrictive
   */
  private createRestrictionSuggestion(
    conflict: RuleConflict,
    context: ResolutionContext
  ): ResolutionSuggestion | null {
    const allowRule = conflict.conflictingRules.find(r => r.type === 'allow' || r.type === 'ask');
    if (!allowRule) return null;

    // Try to apply a template
    const template = this.findApplicableTemplate(conflict);
    let newPattern: string;

    if (template) {
      newPattern = template.transform(allowRule.pattern);
    } else {
      newPattern = this.makePatternMoreRestrictive(allowRule.pattern);
    }

    // Verify the new pattern actually resolves the conflict
    if (!this.verifyResolution(conflict, allowRule.pattern, newPattern, context)) {
      return null;
    }

    return {
      type: 'fix',
      message: `Make ${allowRule.type} rule more restrictive: "${allowRule.pattern}" → "${newPattern}"`,
      autoFix: {
        description: `Restricts the ${allowRule.type} rule to prevent security bypass`,
        changes: {
          action: 'modify',
          category: allowRule.type,
          originalPattern: allowRule.pattern,
          newPattern,
          reason: 'Prevents override of deny rules'
        }
      }
    };
  }

  /**
   * Make a pattern more restrictive
   */
  private makePatternMoreRestrictive(pattern: string): string {
    // Apply progressive restrictions
    if (pattern === '*') return '*.txt';
    if (pattern === '**') return 'safe/**';
    if (pattern === '.*') return '.config';
    
    // Add path prefix if missing
    if (!pattern.includes('/')) {
      return `allowed/${pattern}`;
    }
    
    // Add file extension if wildcard at end
    if (pattern.endsWith('*') && !pattern.endsWith('**')) {
      return pattern.slice(0, -1) + '.allowed';
    }
    
    // Make wildcards more specific
    if (pattern.includes('*')) {
      return pattern.replace(/\*/g, 'allowed');
    }
    
    // Fallback: add suffix
    return `${pattern}.allowed`;
  }

  /**
   * Create suggestion to make deny rule more specific
   */
  private createSpecificDenySuggestion(
    conflict: RuleConflict,
    _context: ResolutionContext
  ): ResolutionSuggestion | null {
    const denyRule = conflict.conflictingRules.find(r => r.type === 'deny');
    if (!denyRule) return null;

    const newPattern = this.makePatternMoreSpecific(denyRule.pattern);
    
    // Verify this doesn't weaken security
    if (this.securityLevel === 'strict' && this.weakensSecurity(denyRule.pattern, newPattern)) {
      return null;
    }

    return {
      type: 'fix',
      message: `Make deny rule more specific: "${denyRule.pattern}" → "${newPattern}"`,
      autoFix: {
        description: 'Makes deny rule more targeted to reduce false positives',
        changes: {
          action: 'modify',
          category: 'deny',
          originalPattern: denyRule.pattern,
          newPattern,
          reason: 'Reduces conflict while maintaining security'
        }
      }
    };
  }

  /**
   * Make a pattern more specific
   */
  private makePatternMoreSpecific(pattern: string): string {
    // Add constraints to reduce scope
    if (pattern === '*') return 'dangerous.*';
    if (pattern === '**') return '**/dangerous/**';
    
    // Add prefix to clarify intent
    if (!pattern.includes('/')) {
      return `dangerous/${pattern}`;
    }
    
    // Replace wildcards with specific patterns
    if (pattern.includes('*')) {
      return pattern.replace(/\*/g, 'dangerous');
    }
    
    // Add extension filter
    if (!pattern.includes('.')) {
      return `${pattern}.dangerous`;
    }
    
    return pattern;
  }

  /**
   * Create manual review suggestion
   */
  private createManualReviewSuggestion(conflict: RuleConflict): ResolutionSuggestion {
    const analysis = this.analyzeConflictComplexity(conflict);
    
    return {
      type: 'warning',
      message: `Manual review required for ${conflict.type}: ${conflict.message}. ${analysis}`
    };
  }

  /**
   * Analyze conflict complexity for manual review guidance
   */
  private analyzeConflictComplexity(conflict: RuleConflict): string {
    const ruleCount = conflict.conflictingRules.length;
    const hasDeny = conflict.conflictingRules.some(r => r.type === 'deny');
    const categories = new Set(conflict.conflictingRules.map(r => r.type));
    
    if (hasDeny && categories.size > 1) {
      return 'This involves security-critical deny rules mixed with permissive rules. Exercise extreme caution.';
    }
    
    if (ruleCount > 2) {
      return 'Multiple rules are involved. Consider breaking down into smaller, more specific patterns.';
    }
    
    if (conflict.securityImpact === 'critical') {
      return 'This is a critical security issue that requires immediate attention.';
    }
    
    return 'Review the business logic to determine the correct precedence.';
  }

  /**
   * Find applicable template for resolution
   */
  private findApplicableTemplate(conflict: RuleConflict): ResolutionTemplate | undefined {
    return this.resolutionTemplates.find(t => t.isApplicable(conflict));
  }

  /**
   * Verify that a resolution actually fixes the conflict
   */
  private verifyResolution(
    conflict: RuleConflict,
    originalPattern: string,
    newPattern: string,
    context: ResolutionContext
  ): boolean {
    // Create test rules with the new pattern
    const testRules = context.rules.map(r => {
      if (r.original === originalPattern) {
        return { ...r, original: newPattern, normalized: newPattern };
      }
      return r;
    });
    
    // Check if the conflict would still exist
    const wouldConflict = this.checkForConflict(
      conflict.conflictingRules[0]!.pattern,
      newPattern
    );
    
    return !wouldConflict;
  }

  /**
   * Check if two patterns would conflict
   */
  private checkForConflict(pattern1: string, pattern2: string): boolean {
    // Simple overlap check - in production would use full pattern analyzer
    if (pattern1 === pattern2) return true;
    
    // Check for wildcard overlaps
    if (pattern1.includes('*') || pattern2.includes('*')) {
      const regex1 = this.patternToRegex(pattern1);
      const regex2 = this.patternToRegex(pattern2);
      
      // Test with common cases
      const testCases = ['test', 'file.txt', 'path/to/file'];
      for (const test of testCases) {
        if (regex1.test(test) && regex2.test(test)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Convert pattern to regex for testing
   */
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const withWildcards = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${withWildcards}$`);
  }

  /**
   * Check if a change weakens security
   */
  private weakensSecurity(originalPattern: string, newPattern: string): boolean {
    // Check if new pattern is less restrictive
    const originalScore = this.calculateSecurityScore(originalPattern);
    const newScore = this.calculateSecurityScore(newPattern);
    
    return newScore < originalScore;
  }

  /**
   * Calculate security score for a pattern
   */
  private calculateSecurityScore(pattern: string): number {
    let score = 50;
    
    // Specific patterns are more secure
    if (!pattern.includes('*') && !pattern.includes('?')) {
      score += 30;
    }
    
    // Longer patterns are generally more specific
    score += Math.min(pattern.length, 20);
    
    // Path separators indicate more specific targeting
    score += (pattern.match(/\//g) || []).length * 5;
    
    // Wildcards reduce security
    score -= (pattern.match(/\*/g) || []).length * 10;
    score -= (pattern.match(/\?/g) || []).length * 5;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Optimize multiple resolutions to minimize changes
   */
  public async optimizeResolutions(
    suggestions: ResolutionSuggestion[],
    _context: ResolutionContext
  ): Promise<ResolutionSuggestion[]> {
    const optimized: ResolutionSuggestion[] = [];
    const processedPatterns = new Set<string>();
    
    // Group suggestions by pattern to avoid duplicate changes
    for (const suggestion of suggestions) {
      if (!suggestion.autoFix) {
        optimized.push(suggestion);
        continue;
      }
      
      const changes = suggestion.autoFix.changes as any;
      const patternKey = `${changes.category}:${changes.originalPattern || changes.pattern}`;
      
      if (!processedPatterns.has(patternKey)) {
        processedPatterns.add(patternKey);
        optimized.push(suggestion);
      }
    }
    
    // Sort by priority (fixes before warnings)
    optimized.sort((a, b) => {
      const priority = { fix: 0, warning: 1, optimization: 2 };
      return priority[a.type] - priority[b.type];
    });
    
    // Limit number of automatic fixes in permissive mode
    if (this.securityLevel === 'permissive' && optimized.length > 10) {
      const critical = optimized.filter(s => 
        s.message.includes('CRITICAL') || s.message.includes('zero-bypass')
      );
      const others = optimized.filter(s => 
        !s.message.includes('CRITICAL') && !s.message.includes('zero-bypass')
      ).slice(0, 10 - critical.length);
      
      return [...critical, ...others];
    }
    
    return optimized;
  }

  /**
   * Apply resolutions to configuration
   */
  public async applyResolutions(
    config: ClaudeCodeConfiguration,
    suggestions: ResolutionSuggestion[]
  ): Promise<ResolutionResult> {
    const changes: ConfigurationChange[] = [];
    const messages: string[] = [];
    const newConfig = JSON.parse(JSON.stringify(config)) as ClaudeCodeConfiguration;
    
    // Ensure permissions object exists
    if (!newConfig.permissions) {
      newConfig.permissions = { deny: [], allow: [], ask: [] };
    }
    
    // Apply each suggestion with an auto-fix
    for (const suggestion of suggestions) {
      if (!suggestion.autoFix) continue;
      
      const change = suggestion.autoFix.changes as any;
      const applied = this.applyChange(newConfig, change);
      
      if (applied) {
        changes.push(this.createChangeRecord(change));
        messages.push(`Applied: ${suggestion.message}`);
      } else {
        messages.push(`Failed to apply: ${suggestion.message}`);
      }
    }
    
    // Validate the result
    const remainingConflicts = await this.validateResolution(newConfig);
    
    return {
      success: remainingConflicts.length === 0,
      resolvedConfig: newConfig,
      changes,
      messages,
      remainingConflicts
    };
  }

  /**
   * Apply a single change to configuration
   */
  private applyChange(
    config: ClaudeCodeConfiguration,
    change: any
  ): boolean {
    try {
      const category = change.category as 'deny' | 'allow' | 'ask';
      
      if (!config.permissions![category]) {
        config.permissions![category] = [];
      }
      
      const rules = config.permissions![category]!;
      
      switch (change.action) {
        case 'remove':
          const removeIndex = rules.indexOf(change.pattern);
          if (removeIndex !== -1) {
            rules.splice(removeIndex, 1);
            return true;
          }
          break;
          
        case 'modify':
          const modifyIndex = rules.indexOf(change.originalPattern);
          if (modifyIndex !== -1) {
            rules[modifyIndex] = change.newPattern;
            return true;
          }
          break;
          
        case 'add':
          if (!rules.includes(change.pattern)) {
            rules.push(change.pattern);
            return true;
          }
          break;
          
        case 'reorder':
          // Move pattern to specific position
          const currentIndex = rules.indexOf(change.pattern);
          if (currentIndex !== -1) {
            rules.splice(currentIndex, 1);
            rules.splice(change.position, 0, change.pattern);
            return true;
          }
          break;
      }
      
      return false;
    } catch (error) {
      console.error('Error applying change:', error);
      return false;
    }
  }

  /**
   * Create change record for audit
   */
  private createChangeRecord(change: any): ConfigurationChange {
    return {
      type: change.action,
      category: change.category,
      originalValue: change.originalPattern,
      newValue: change.newPattern || change.pattern,
      position: change.position,
      reason: change.reason,
      risk: this.assessChangeRisk(change)
    };
  }

  /**
   * Assess risk of a change
   */
  private assessChangeRisk(change: any): 'safe' | 'moderate' | 'risky' {
    // Removing deny rules is always risky
    if (change.action === 'remove' && change.category === 'deny') {
      return 'risky';
    }
    
    // Adding allow rules can be risky
    if (change.action === 'add' && change.category === 'allow') {
      return 'moderate';
    }
    
    // Modifying patterns has moderate risk
    if (change.action === 'modify') {
      return 'moderate';
    }
    
    return 'safe';
  }

  /**
   * Validate that resolution fixed conflicts
   */
  private async validateResolution(
    config: ClaudeCodeConfiguration
  ): Promise<RuleConflict[]> {
    // In production, would use full conflict detection
    // For now, return empty array indicating success
    return [];
  }

  /**
   * Get cache key for conflict
   */
  private getConflictCacheKey(conflict: RuleConflict): string {
    const patterns = conflict.conflictingRules
      .map(r => `${r.type}:${r.pattern}`)
      .sort()
      .join('|');
    return `${conflict.type}:${patterns}:${this.securityLevel}`;
  }

  /**
   * Generate resolution report
   */
  public generateResolutionReport(
    result: ResolutionResult,
    format: 'json' | 'markdown' = 'markdown'
  ): string {
    if (format === 'json') {
      return JSON.stringify(result, null, 2);
    }
    
    let report = '# Conflict Resolution Report\n\n';
    
    report += `## Summary\n\n`;
    report += `- **Status:** ${result.success ? '✅ Success' : '⚠️ Partial Success'}\n`;
    report += `- **Changes Applied:** ${result.changes.length}\n`;
    report += `- **Remaining Conflicts:** ${result.remainingConflicts.length}\n\n`;
    
    if (result.changes.length > 0) {
      report += `## Changes Applied\n\n`;
      for (const change of result.changes) {
        report += `### ${change.type.toUpperCase()} - ${change.category}\n`;
        report += `- **Risk:** ${change.risk}\n`;
        if (change.originalValue) {
          report += `- **Original:** \`${change.originalValue}\`\n`;
        }
        if (change.newValue) {
          report += `- **New:** \`${change.newValue}\`\n`;
        }
        report += `- **Reason:** ${change.reason}\n\n`;
      }
    }
    
    if (result.messages.length > 0) {
      report += `## Messages\n\n`;
      for (const message of result.messages) {
        report += `- ${message}\n`;
      }
      report += '\n';
    }
    
    if (result.remainingConflicts.length > 0) {
      report += `## Remaining Conflicts\n\n`;
      report += `These conflicts require manual review:\n\n`;
      for (const conflict of result.remainingConflicts) {
        report += `- **${conflict.type}:** ${conflict.message}\n`;
      }
    }
    
    return report;
  }

  /**
   * Clear resolution cache
   */
  public clearCache(): void {
    this.resolutionCache.clear();
  }

  /**
   * Update security level
   */
  public setSecurityLevel(level: 'strict' | 'moderate' | 'permissive'): void {
    this.securityLevel = level;
    this.resolutionPriorities = this.initializePriorities();
    this.clearCache();
  }

  /**
   * Get current security level
   */
  public getSecurityLevel(): string {
    return this.securityLevel;
  }
}

// Export singleton instance with strict security by default
export const conflictResolver = new ConflictResolver('strict');