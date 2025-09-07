/**
 * Template Merger for Claude Code Security Rulesets
 * Implements intelligent merging strategies for combining templates with existing configurations
 * Ensures security precedence and proper rule conflict resolution
 */

import {
  ClaudeCodeConfiguration,
  Environment
} from '../types';
import { mergeConfigurations, MergeContext, MergeResult } from '../config/merger';

/**
 * Template merge strategies
 */
export type TemplateMergeStrategy = 
  | 'override'    // Template completely replaces base config
  | 'merge'       // Intelligent merge with security precedence
  | 'combine'     // Combine all rules (may create conflicts)
  | 'selective'   // Merge only specified sections
  | 'layered';    // Apply template as a layer on top

/**
 * Template merge options
 */
export interface TemplateMergeOptions {
  /** Merge strategy to use */
  strategy: TemplateMergeStrategy;
  /** Target environment */
  environment?: Environment;
  /** Preserve original metadata */
  preserveMetadata?: boolean;
  /** Sections to merge (for selective strategy) */
  sections?: ('permissions' | 'metadata' | 'custom')[];
  /** Custom merge rules */
  customRules?: Record<string, MergeRule>;
  /** Whether to validate merged result */
  validateResult?: boolean;
  /** Conflict resolution strategy */
  conflictResolution?: 'template-wins' | 'base-wins' | 'strict-deny' | 'ask-user';
}

/**
 * Custom merge rule for specific fields
 */
export interface MergeRule {
  /** How to handle conflicts */
  onConflict: 'use-template' | 'use-base' | 'combine' | 'fail';
  /** Custom merge function */
  customMerge?: (baseValue: unknown, templateValue: unknown) => unknown;
  /** Validation after merge */
  validate?: (mergedValue: unknown) => boolean;
}

/**
 * Template merge result
 */
export interface TemplateMergeResult {
  /** Merged configuration */
  config: ClaudeCodeConfiguration;
  /** Rules added by template */
  rulesAdded: number;
  /** Rules overridden by template */
  rulesOverridden: number;
  /** Rules that had conflicts */
  conflictingRules: string[];
  /** Merge strategy used */
  strategy: TemplateMergeStrategy;
  /** Merge warnings */
  warnings: string[];
  /** Merge performance metrics */
  performance: {
    mergeTime: number;
    rulesProcessed: number;
  };
}

/**
 * Rule merge statistics
 */
interface RuleMergeStats {
  baseRules: number;
  templateRules: number;
  finalRules: number;
  added: number;
  overridden: number;
  conflicts: number;
}

/**
 * Template merger class
 */
export class TemplateMerger {
  private defaultOptions: TemplateMergeOptions = {
    strategy: 'merge',
    preserveMetadata: true,
    validateResult: false,
    conflictResolution: 'strict-deny'
  };

  /**
   * Merge template with base configuration
   */
  public async merge(
    baseConfig: ClaudeCodeConfiguration,
    templateConfig: ClaudeCodeConfiguration,
    options: Partial<TemplateMergeOptions> = {}
  ): Promise<TemplateMergeResult> {
    const startTime = Date.now();
    const mergeOptions = { ...this.defaultOptions, ...options };

    let result: TemplateMergeResult;

    switch (mergeOptions.strategy) {
      case 'override':
        result = await this.overrideMerge(baseConfig, templateConfig, mergeOptions);
        break;
      case 'merge':
        result = await this.intelligentMerge(baseConfig, templateConfig, mergeOptions);
        break;
      case 'combine':
        result = await this.combineMerge(baseConfig, templateConfig, mergeOptions);
        break;
      case 'selective':
        result = await this.selectiveMerge(baseConfig, templateConfig, mergeOptions);
        break;
      case 'layered':
        result = await this.layeredMerge(baseConfig, templateConfig, mergeOptions);
        break;
      default:
        throw new Error(`Unsupported merge strategy: ${mergeOptions.strategy}`);
    }

    result.performance.mergeTime = Date.now() - startTime;
    return result;
  }

  /**
   * Override merge - template completely replaces base
   */
  private async overrideMerge(
    baseConfig: ClaudeCodeConfiguration,
    templateConfig: ClaudeCodeConfiguration,
    options: TemplateMergeOptions
  ): Promise<TemplateMergeResult> {
    const merged = { ...templateConfig };
    
    // Preserve metadata if requested
    if (options.preserveMetadata && baseConfig.metadata) {
      merged.metadata = {
        ...baseConfig.metadata,
        ...templateConfig.metadata,
        timestamp: Date.now()
      };
    }

    const stats = this.calculateRuleStats(baseConfig, templateConfig, merged);

    return {
      config: merged,
      rulesAdded: stats.templateRules,
      rulesOverridden: stats.baseRules,
      conflictingRules: [],
      strategy: 'override',
      warnings: [`Override strategy replaced ${stats.baseRules} existing rules`],
      performance: {
        mergeTime: 0,
        rulesProcessed: stats.baseRules + stats.templateRules
      }
    };
  }

  /**
   * Intelligent merge with security precedence
   */
  private async intelligentMerge(
    baseConfig: ClaudeCodeConfiguration,
    templateConfig: ClaudeCodeConfiguration,
    options: TemplateMergeOptions
  ): Promise<TemplateMergeResult> {
    // Use existing config merger with security precedence
    const contexts: MergeContext[] = [
      {
        config: baseConfig,
        level: 'user',
        sourcePath: 'base-config'
      },
      {
        config: templateConfig,
        level: 'enterprise',
        sourcePath: 'template'
      }
    ];

    const mergeResult = await mergeConfigurations(contexts, {
      preserveMetadata: options.preserveMetadata,
      trackRuleSources: true,
      validateResult: options.validateResult,
      allowCliOverrides: false
    });

    const stats = this.calculateRuleStats(baseConfig, templateConfig, mergeResult.config);
    const conflictingRules = this.findConflictingRules(baseConfig, templateConfig);

    return {
      config: mergeResult.config,
      rulesAdded: stats.added,
      rulesOverridden: stats.overridden,
      conflictingRules,
      strategy: 'merge',
      warnings: mergeResult.warnings.map(w => w.message),
      performance: {
        mergeTime: mergeResult.performance.mergeTime,
        rulesProcessed: mergeResult.performance.rulesProcessed
      }
    };
  }

  /**
   * Combine merge - all rules are combined
   */
  private async combineMerge(
    baseConfig: ClaudeCodeConfiguration,
    templateConfig: ClaudeCodeConfiguration,
    options: TemplateMergeOptions
  ): Promise<TemplateMergeResult> {
    const merged: ClaudeCodeConfiguration = {
      permissions: {
        deny: [
          ...(baseConfig.permissions?.deny || []),
          ...(templateConfig.permissions?.deny || [])
        ],
        allow: [
          ...(baseConfig.permissions?.allow || []),
          ...(templateConfig.permissions?.allow || [])
        ],
        ask: [
          ...(baseConfig.permissions?.ask || []),
          ...(templateConfig.permissions?.ask || [])
        ]
      }
    };

    // Remove duplicates
    if (merged.permissions) {
      merged.permissions.deny = [...new Set(merged.permissions.deny)];
      merged.permissions.allow = [...new Set(merged.permissions.allow)];
      merged.permissions.ask = [...new Set(merged.permissions.ask)];
    }

    // Merge metadata
    merged.metadata = {
      ...baseConfig.metadata,
      ...templateConfig.metadata,
      timestamp: Date.now()
    };

    // Merge other properties
    Object.keys(baseConfig).forEach(key => {
      if (key !== 'permissions' && key !== 'metadata') {
        (merged as any)[key] = baseConfig[key];
      }
    });

    Object.keys(templateConfig).forEach(key => {
      if (key !== 'permissions' && key !== 'metadata') {
        (merged as any)[key] = templateConfig[key];
      }
    });

    const stats = this.calculateRuleStats(baseConfig, templateConfig, merged);
    const conflictingRules = this.findConflictingRules(baseConfig, templateConfig);

    return {
      config: merged,
      rulesAdded: stats.templateRules,
      rulesOverridden: 0,
      conflictingRules,
      strategy: 'combine',
      warnings: conflictingRules.length > 0 ? 
        [`Combined merge created ${conflictingRules.length} potential conflicts`] : [],
      performance: {
        mergeTime: 0,
        rulesProcessed: stats.baseRules + stats.templateRules
      }
    };
  }

  /**
   * Selective merge - merge only specified sections
   */
  private async selectiveMerge(
    baseConfig: ClaudeCodeConfiguration,
    templateConfig: ClaudeCodeConfiguration,
    options: TemplateMergeOptions
  ): Promise<TemplateMergeResult> {
    const sections = options.sections || ['permissions'];
    const merged = { ...baseConfig };
    let rulesAdded = 0;
    let rulesOverridden = 0;
    const warnings: string[] = [];

    for (const section of sections) {
      switch (section) {
        case 'permissions':
          if (templateConfig.permissions) {
            const oldCount = this.countPermissionRules(merged.permissions);
            merged.permissions = await this.mergePermissions(
              merged.permissions || {},
              templateConfig.permissions,
              options.conflictResolution
            );
            const newCount = this.countPermissionRules(merged.permissions);
            rulesAdded += Math.max(0, newCount - oldCount);
            rulesOverridden += Math.max(0, oldCount + this.countPermissionRules(templateConfig.permissions) - newCount);
          }
          break;
        
        case 'metadata':
          if (templateConfig.metadata) {
            merged.metadata = {
              ...merged.metadata,
              ...templateConfig.metadata,
              timestamp: Date.now()
            };
          }
          break;
        
        case 'custom':
          // Merge custom properties
          Object.keys(templateConfig).forEach(key => {
            if (key !== 'permissions' && key !== 'metadata') {
              (merged as any)[key] = templateConfig[key];
            }
          });
          break;
      }
    }

    if (sections.length < 3) {
      warnings.push(`Selective merge applied to ${sections.join(', ')} only`);
    }

    const stats = this.calculateRuleStats(baseConfig, templateConfig, merged);

    return {
      config: merged,
      rulesAdded,
      rulesOverridden,
      conflictingRules: this.findConflictingRules(baseConfig, templateConfig),
      strategy: 'selective',
      warnings,
      performance: {
        mergeTime: 0,
        rulesProcessed: stats.baseRules + stats.templateRules
      }
    };
  }

  /**
   * Layered merge - apply template as a layer on top
   */
  private async layeredMerge(
    baseConfig: ClaudeCodeConfiguration,
    templateConfig: ClaudeCodeConfiguration,
    options: TemplateMergeOptions
  ): Promise<TemplateMergeResult> {
    // Start with base config
    const merged = JSON.parse(JSON.stringify(baseConfig));

    // Apply template rules as overlay
    if (templateConfig.permissions) {
      if (!merged.permissions) {
        merged.permissions = {};
      }

      // Layer deny rules (highest priority)
      if (templateConfig.permissions.deny) {
        merged.permissions.deny = [
          ...(merged.permissions.deny || []),
          ...templateConfig.permissions.deny
        ];
        merged.permissions.deny = [...new Set(merged.permissions.deny)];
      }

      // Layer ask rules
      if (templateConfig.permissions.ask) {
        merged.permissions.ask = [
          ...(merged.permissions.ask || []),
          ...templateConfig.permissions.ask
        ];
        merged.permissions.ask = [...new Set(merged.permissions.ask)];
      }

      // Layer allow rules (lowest priority)
      if (templateConfig.permissions.allow) {
        // Remove any allow rules that conflict with deny rules
        const denyRules = merged.permissions.deny || [];
        const filteredAllow = templateConfig.permissions.allow.filter(
          allowRule => !denyRules.some(denyRule => this.rulesConflict(allowRule, denyRule))
        );

        merged.permissions.allow = [
          ...(merged.permissions.allow || []),
          ...filteredAllow
        ];
        merged.permissions.allow = [...new Set(merged.permissions.allow)];
      }
    }

    // Layer metadata
    if (templateConfig.metadata) {
      merged.metadata = {
        ...merged.metadata,
        ...templateConfig.metadata,
        timestamp: Date.now()
      };
    }

    const stats = this.calculateRuleStats(baseConfig, templateConfig, merged);
    const conflictingRules = this.findConflictingRules(baseConfig, templateConfig);

    return {
      config: merged,
      rulesAdded: stats.added,
      rulesOverridden: stats.overridden,
      conflictingRules,
      strategy: 'layered',
      warnings: [`Layered ${stats.templateRules} template rules over ${stats.baseRules} base rules`],
      performance: {
        mergeTime: 0,
        rulesProcessed: stats.baseRules + stats.templateRules
      }
    };
  }

  /**
   * Merge permissions with conflict resolution
   */
  private async mergePermissions(
    basePermissions: NonNullable<ClaudeCodeConfiguration['permissions']>,
    templatePermissions: NonNullable<ClaudeCodeConfiguration['permissions']>,
    conflictResolution: TemplateMergeOptions['conflictResolution'] = 'strict-deny'
  ): Promise<NonNullable<ClaudeCodeConfiguration['permissions']>> {
    const result = { ...basePermissions };

    // Merge deny rules (always prioritized)
    if (templatePermissions.deny) {
      result.deny = [...new Set([
        ...(result.deny || []),
        ...templatePermissions.deny
      ])];
    }

    // Merge ask rules
    if (templatePermissions.ask) {
      result.ask = [...new Set([
        ...(result.ask || []),
        ...templatePermissions.ask
      ])];
    }

    // Merge allow rules with conflict checking
    if (templatePermissions.allow) {
      const newAllowRules = templatePermissions.allow;
      const existingDenyRules = result.deny || [];
      
      let filteredAllow: string[] = [];

      for (const allowRule of newAllowRules) {
        const conflicts = existingDenyRules.filter(denyRule => 
          this.rulesConflict(allowRule, denyRule)
        );

        if (conflicts.length > 0) {
          switch (conflictResolution) {
            case 'strict-deny':
              // Skip conflicting allow rule
              console.warn(`Skipping allow rule "${allowRule}" due to conflict with deny rule(s): ${conflicts.join(', ')}`);
              break;
            case 'template-wins':
              // Keep allow rule, remove conflicting deny rules
              result.deny = result.deny?.filter(denyRule => !this.rulesConflict(allowRule, denyRule));
              filteredAllow.push(allowRule);
              break;
            case 'base-wins':
              // Skip allow rule if it conflicts
              break;
            case 'ask-user':
              // For now, default to strict-deny
              console.warn(`Conflict detected: allow "${allowRule}" vs deny "${conflicts.join(', ')}" - defaulting to deny`);
              break;
          }
        } else {
          filteredAllow.push(allowRule);
        }
      }

      result.allow = [...new Set([
        ...(result.allow || []),
        ...filteredAllow
      ])];
    }

    return result;
  }

  /**
   * Check if two rules conflict
   */
  private rulesConflict(rule1: string, rule2: string): boolean {
    // Simple conflict detection - can be enhanced
    if (rule1 === rule2) return true;
    
    // Check wildcard conflicts
    if (rule1.includes('*') || rule2.includes('*')) {
      const pattern1 = rule1.replace(/\*/g, '.*');
      const pattern2 = rule2.replace(/\*/g, '.*');
      
      try {
        const regex1 = new RegExp(`^${pattern1}$`);
        const regex2 = new RegExp(`^${pattern2}$`);
        
        return regex1.test(rule2) || regex2.test(rule1);
      } catch (e) {
        // If regex fails, fall back to string comparison
        return false;
      }
    }
    
    return false;
  }

  /**
   * Calculate rule merge statistics
   */
  private calculateRuleStats(
    baseConfig: ClaudeCodeConfiguration,
    templateConfig: ClaudeCodeConfiguration,
    mergedConfig: ClaudeCodeConfiguration
  ): RuleMergeStats {
    const baseRules = this.countPermissionRules(baseConfig.permissions);
    const templateRules = this.countPermissionRules(templateConfig.permissions);
    const finalRules = this.countPermissionRules(mergedConfig.permissions);
    
    return {
      baseRules,
      templateRules,
      finalRules,
      added: Math.max(0, finalRules - baseRules),
      overridden: Math.max(0, baseRules + templateRules - finalRules),
      conflicts: 0 // Would be calculated by conflict detection
    };
  }

  /**
   * Count permission rules in configuration
   */
  private countPermissionRules(permissions?: ClaudeCodeConfiguration['permissions']): number {
    if (!permissions) return 0;
    
    return (permissions.deny?.length || 0) + 
           (permissions.allow?.length || 0) + 
           (permissions.ask?.length || 0);
  }

  /**
   * Find conflicting rules between base and template
   */
  private findConflictingRules(
    baseConfig: ClaudeCodeConfiguration,
    templateConfig: ClaudeCodeConfiguration
  ): string[] {
    const conflicts: string[] = [];
    const baseDeny = baseConfig.permissions?.deny || [];
    const templateAllow = templateConfig.permissions?.allow || [];
    const templateAsk = templateConfig.permissions?.ask || [];

    // Check for allow rules that conflict with base deny rules
    for (const allowRule of templateAllow) {
      for (const denyRule of baseDeny) {
        if (this.rulesConflict(allowRule, denyRule)) {
          conflicts.push(`allow "${allowRule}" conflicts with existing deny "${denyRule}"`);
        }
      }
    }

    // Check for ask rules that conflict with base deny rules
    for (const askRule of templateAsk) {
      for (const denyRule of baseDeny) {
        if (this.rulesConflict(askRule, denyRule)) {
          conflicts.push(`ask "${askRule}" conflicts with existing deny "${denyRule}"`);
        }
      }
    }

    return conflicts;
  }

  /**
   * Merge multiple templates in sequence
   */
  public async mergeMultiple(
    baseConfig: ClaudeCodeConfiguration,
    templateConfigs: ClaudeCodeConfiguration[],
    options: Partial<TemplateMergeOptions> = {}
  ): Promise<TemplateMergeResult> {
    let currentConfig = baseConfig;
    let totalRulesAdded = 0;
    let totalRulesOverridden = 0;
    let allConflicts: string[] = [];
    let allWarnings: string[] = [];

    for (let i = 0; i < templateConfigs.length; i++) {
      const templateConfig = templateConfigs[i];
      const result = await this.merge(currentConfig, templateConfig, options);
      
      currentConfig = result.config;
      totalRulesAdded += result.rulesAdded;
      totalRulesOverridden += result.rulesOverridden;
      allConflicts.push(...result.conflictingRules);
      allWarnings.push(...result.warnings);
    }

    return {
      config: currentConfig,
      rulesAdded: totalRulesAdded,
      rulesOverridden: totalRulesOverridden,
      conflictingRules: allConflicts,
      strategy: options.strategy || 'merge',
      warnings: allWarnings,
      performance: {
        mergeTime: 0, // Would accumulate from individual merges
        rulesProcessed: this.countPermissionRules(currentConfig.permissions)
      }
    };
  }

  /**
   * Preview merge without applying changes
   */
  public async previewMerge(
    baseConfig: ClaudeCodeConfiguration,
    templateConfig: ClaudeCodeConfiguration,
    options: Partial<TemplateMergeOptions> = {}
  ): Promise<{
    preview: ClaudeCodeConfiguration;
    changes: {
      rulesAdded: string[];
      rulesRemoved: string[];
      rulesModified: string[];
    };
    conflicts: string[];
  }> {
    const mergeResult = await this.merge(baseConfig, templateConfig, { 
      ...options, 
      validateResult: false 
    });

    const changes = {
      rulesAdded: this.getRulesAdded(baseConfig, mergeResult.config),
      rulesRemoved: this.getRulesRemoved(baseConfig, mergeResult.config),
      rulesModified: this.getRulesModified(baseConfig, mergeResult.config)
    };

    return {
      preview: mergeResult.config,
      changes,
      conflicts: mergeResult.conflictingRules
    };
  }

  /**
   * Get rules added during merge
   */
  private getRulesAdded(baseConfig: ClaudeCodeConfiguration, mergedConfig: ClaudeCodeConfiguration): string[] {
    const baseRules = this.getAllRules(baseConfig);
    const mergedRules = this.getAllRules(mergedConfig);
    
    return mergedRules.filter(rule => !baseRules.includes(rule));
  }

  /**
   * Get rules removed during merge
   */
  private getRulesRemoved(baseConfig: ClaudeCodeConfiguration, mergedConfig: ClaudeCodeConfiguration): string[] {
    const baseRules = this.getAllRules(baseConfig);
    const mergedRules = this.getAllRules(mergedConfig);
    
    return baseRules.filter(rule => !mergedRules.includes(rule));
  }

  /**
   * Get rules modified during merge
   */
  private getRulesModified(baseConfig: ClaudeCodeConfiguration, mergedConfig: ClaudeCodeConfiguration): string[] {
    // For now, return empty array as we don't track modifications
    // In a full implementation, this would track rule changes
    return [];
  }

  /**
   * Get all rules from configuration
   */
  private getAllRules(config: ClaudeCodeConfiguration): string[] {
    const permissions = config.permissions;
    if (!permissions) return [];
    
    return [
      ...(permissions.deny || []).map(r => `deny:${r}`),
      ...(permissions.allow || []).map(r => `allow:${r}`),
      ...(permissions.ask || []).map(r => `ask:${r}`)
    ];
  }

  /**
   * Create merge report
   */
  public createMergeReport(result: TemplateMergeResult): string {
    const report = [
      'Template Merge Report',
      '====================',
      `Strategy: ${result.strategy}`,
      `Rules Added: ${result.rulesAdded}`,
      `Rules Overridden: ${result.rulesOverridden}`,
      `Total Rules Processed: ${result.performance.rulesProcessed}`,
      `Merge Time: ${result.performance.mergeTime}ms`,
      '',
      'Conflicts:',
      ...result.conflictingRules.map(conflict => `  - ${conflict}`),
      '',
      'Warnings:',
      ...result.warnings.map(warning => `  - ${warning}`)
    ];

    return report.join('\n');
  }
}