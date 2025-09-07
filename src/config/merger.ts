/**
 * Hierarchical configuration merging logic
 * Implements secure configuration precedence: Enterprise → CLI → Project → User
 * Ensures deny rules always take precedence for security
 */

import { ClaudeCodeConfiguration } from '../types/index';
import { ConfigurationLevel } from './discovery';

/**
 * Configuration merge context with source tracking
 */
export interface MergeContext {
  /** Configuration with its source level */
  config: ClaudeCodeConfiguration;
  /** Source level for precedence */
  level: ConfigurationLevel;
  /** Source path for debugging */
  sourcePath?: string;
  /** Priority within the same level */
  priority?: number;
}

/**
 * Configuration merge result with detailed tracking
 */
export interface MergeResult {
  /** Final merged configuration */
  config: ClaudeCodeConfiguration;
  /** Sources that contributed to the final config */
  sources: MergeSource[];
  /** Any warnings generated during merge */
  warnings: MergeWarning[];
  /** Performance metrics */
  performance: MergePerformance;
}

/**
 * Information about a configuration source in the merge
 */
export interface MergeSource {
  /** Configuration level */
  level: ConfigurationLevel;
  /** Source path */
  path: string;
  /** Rules contributed by this source */
  contributedRules: {
    deny: string[];
    allow: string[];
    ask: string[];
  };
  /** Whether any rules were overridden */
  overriddenRules: string[];
}

/**
 * Merge warning for potential issues
 */
export interface MergeWarning {
  /** Warning type */
  type: 'RULE_OVERRIDE' | 'CONFLICTING_METADATA' | 'EMPTY_CONFIG' | 'DUPLICATE_RULES';
  /** Warning message */
  message: string;
  /** Source that caused the warning */
  source?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Merge performance metrics
 */
export interface MergePerformance {
  /** Total merge time in milliseconds */
  mergeTime: number;
  /** Number of configurations processed */
  configsProcessed: number;
  /** Number of rules processed */
  rulesProcessed: number;
  /** Memory usage during merge */
  memoryUsage?: number;
}

/**
 * Merge options for customizing behavior
 */
export interface MergeOptions {
  /** Whether to preserve all metadata from sources */
  preserveMetadata?: boolean;
  /** Whether to track rule sources for debugging */
  trackRuleSources?: boolean;
  /** Whether to validate merged result */
  validateResult?: boolean;
  /** Custom merge strategies for specific fields */
  customStrategies?: Record<string, MergeStrategy>;
  /** Whether to allow CLI overrides */
  allowCliOverrides?: boolean;
  /** Environment variable substitution */
  envVarSubstitution?: boolean;
}

/**
 * Custom merge strategy function
 */
export type MergeStrategy = (
  target: unknown,
  source: unknown,
  context: MergeContext
) => unknown;

/**
 * Default merge options for different contexts
 */
export const defaultMergeOptions: Record<string, MergeOptions> = {
  production: {
    preserveMetadata: true,
    trackRuleSources: false,
    validateResult: true,
    allowCliOverrides: false,
    envVarSubstitution: true
  },
  development: {
    preserveMetadata: true,
    trackRuleSources: true,
    validateResult: true,
    allowCliOverrides: true,
    envVarSubstitution: false
  },
  strict: {
    preserveMetadata: true,
    trackRuleSources: true,
    validateResult: true,
    allowCliOverrides: false,
    envVarSubstitution: false
  }
};

/**
 * Merges multiple configurations with proper hierarchy precedence
 * 
 * @param contexts Configuration contexts to merge
 * @param options Merge options
 * @returns Promise resolving to merge result
 */
export async function mergeConfigurations(
  contexts: MergeContext[],
  options: MergeOptions = {}
): Promise<MergeResult> {
  const startTime = Date.now();
  const mergeOptions = { ...defaultMergeOptions.production, ...options };
  
  // Sort contexts by precedence level
  const sortedContexts = sortContextsByPrecedence(contexts);
  
  const result: MergeResult = {
    config: createEmptyConfiguration(),
    sources: [],
    warnings: [],
    performance: {
      mergeTime: 0,
      configsProcessed: contexts.length,
      rulesProcessed: 0
    }
  };

  // Track rule sources for debugging
  const ruleSourceMap = new Map<string, { level: ConfigurationLevel; path: string }>();

  for (const context of sortedContexts) {
    const source: MergeSource = {
      level: context.level,
      path: context.sourcePath || 'unknown',
      contributedRules: { deny: [], allow: [], ask: [] },
      overriddenRules: []
    };

    // Merge permissions with security precedence
    await mergePermissions(result.config, context, source, ruleSourceMap, mergeOptions);
    
    // Merge metadata
    mergeMetadata(result.config, context, mergeOptions);
    
    // Merge other properties
    mergeOtherProperties(result.config, context, mergeOptions);
    
    result.sources.push(source);
  }

  // Calculate performance metrics
  result.performance.mergeTime = Date.now() - startTime;
  result.performance.rulesProcessed = calculateTotalRules(result.config);

  // Add memory usage if available
  if (process.memoryUsage) {
    result.performance.memoryUsage = process.memoryUsage().heapUsed;
  }

  return result;
}

/**
 * Sorts configuration contexts by precedence
 * Order: Enterprise → System → CLI → Project → User
 */
function sortContextsByPrecedence(contexts: MergeContext[]): MergeContext[] {
  const precedenceOrder: ConfigurationLevel[] = ['enterprise', 'system', 'project', 'user'];
  
  return contexts.sort((a, b) => {
    const aIndex = precedenceOrder.indexOf(a.level);
    const bIndex = precedenceOrder.indexOf(b.level);
    
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    
    // If same level, sort by priority
    return (a.priority || 0) - (b.priority || 0);
  });
}

/**
 * Merges permissions with security-first approach
 * Deny rules from higher precedence levels always take precedence
 */
async function mergePermissions(
  target: ClaudeCodeConfiguration,
  context: MergeContext,
  source: MergeSource,
  ruleSourceMap: Map<string, { level: ConfigurationLevel; path: string }>,
  _options: MergeOptions
): Promise<void> {
  const sourcePermissions = context.config.permissions;
  if (!sourcePermissions) {
    return;
  }

  if (!target.permissions) {
    target.permissions = {};
  }

  // Merge deny rules (security-critical, higher precedence wins)
  if (sourcePermissions.deny) {
    target.permissions.deny = mergeRuleArray(
      target.permissions.deny || [],
      sourcePermissions.deny,
      'deny',
      context,
      source,
      ruleSourceMap,
      true // Deny rules always override
    );
  }

  // Merge allow rules (can be overridden by deny)
  if (sourcePermissions.allow) {
    target.permissions.allow = mergeRuleArray(
      target.permissions.allow || [],
      sourcePermissions.allow,
      'allow',
      context,
      source,
      ruleSourceMap,
      false
    );
  }

  // Merge ask rules
  if (sourcePermissions.ask) {
    target.permissions.ask = mergeRuleArray(
      target.permissions.ask || [],
      sourcePermissions.ask,
      'ask',
      context,
      source,
      ruleSourceMap,
      false
    );
  }

  // Remove allow/ask rules that are overridden by deny rules
  if (target.permissions.deny && target.permissions.deny.length > 0) {
    filterOverriddenRules(target, source);
  }
}

/**
 * Merges rule arrays with proper precedence and deduplication
 */
function mergeRuleArray(
  target: string[],
  source: string[],
  ruleType: 'deny' | 'allow' | 'ask',
  context: MergeContext,
  mergeSource: MergeSource,
  ruleSourceMap: Map<string, { level: ConfigurationLevel; path: string }>,
  overrideExisting: boolean
): string[] {
  const result = [...target];
  
  for (const rule of source) {
    const existingIndex = result.findIndex(r => r === rule);
    
    if (existingIndex >= 0) {
      if (overrideExisting) {
        // Replace existing rule (for deny rules from higher precedence)
        result[existingIndex] = rule;
        ruleSourceMap.set(rule, { level: context.level, path: context.sourcePath || 'unknown' });
        mergeSource.contributedRules[ruleType].push(rule);
      }
      // If not overriding, keep existing rule (lower precedence)
    } else {
      // Add new rule
      result.push(rule);
      ruleSourceMap.set(rule, { level: context.level, path: context.sourcePath || 'unknown' });
      mergeSource.contributedRules[ruleType].push(rule);
    }
  }
  
  return [...new Set(result)]; // Remove duplicates
}

/**
 * Filters allow/ask rules that are overridden by deny rules
 */
function filterOverriddenRules(
  config: ClaudeCodeConfiguration,
  source: MergeSource
): void {
  if (!config.permissions) return;
  
  const denyPatterns = config.permissions.deny || [];
  
  // Filter allow rules
  if (config.permissions.allow) {
    // const originalAllowCount = config.permissions.allow.length;
    config.permissions.allow = config.permissions.allow.filter(allowRule => {
      const isOverridden = denyPatterns.some(denyRule => 
        isRuleOverridden(allowRule, denyRule)
      );
      if (isOverridden) {
        source.overriddenRules.push(allowRule);
      }
      return !isOverridden;
    });
  }
  
  // Filter ask rules
  if (config.permissions.ask) {
    config.permissions.ask = config.permissions.ask.filter(askRule => {
      const isOverridden = denyPatterns.some(denyRule => 
        isRuleOverridden(askRule, denyRule)
      );
      if (isOverridden) {
        source.overriddenRules.push(askRule);
      }
      return !isOverridden;
    });
  }
}

/**
 * Determines if one rule is overridden by another
 * Uses simple pattern matching for now, can be enhanced with regex
 */
function isRuleOverridden(rule: string, overridingRule: string): boolean {
  // Exact match
  if (rule === overridingRule) {
    return true;
  }
  
  // Wildcard patterns (basic implementation)
  if (overridingRule.includes('*')) {
    const pattern = overridingRule.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(rule);
  }
  
  return false;
}

/**
 * Merges metadata from configurations
 */
function mergeMetadata(
  target: ClaudeCodeConfiguration,
  context: MergeContext,
  _options: MergeOptions
): void {
  if (!context.config.metadata) {
    return;
  }
  
  if (!target.metadata) {
    target.metadata = {
      version: '1.0.0',
      timestamp: Date.now()
    };
  }
  
  const sourceMetadata = context.config.metadata;
  const targetMetadata = target.metadata;
  
  // Merge version (keep highest semantic version)
  if (sourceMetadata.version && isHigherVersion(sourceMetadata.version, targetMetadata.version)) {
    targetMetadata.version = sourceMetadata.version;
  }
  
  // Update timestamp to most recent
  if (sourceMetadata.timestamp > targetMetadata.timestamp) {
    targetMetadata.timestamp = sourceMetadata.timestamp;
  }
  
  // Merge other metadata properties
  if (sourceMetadata.organization && !targetMetadata.organization) {
    targetMetadata.organization = sourceMetadata.organization;
  }
  
  if (sourceMetadata.environment && !targetMetadata.environment) {
    targetMetadata.environment = sourceMetadata.environment;
  }
  
  if (sourceMetadata.name && !targetMetadata.name) {
    targetMetadata.name = sourceMetadata.name;
  }
}

/**
 * Merges other properties not handled by specific merge functions
 */
function mergeOtherProperties(
  target: ClaudeCodeConfiguration,
  context: MergeContext,
  _options: MergeOptions
): void {
  const sourceConfig = context.config;
  
  // Merge any additional Claude Code properties
  Object.keys(sourceConfig).forEach(key => {
    if (key !== 'permissions' && key !== 'metadata' && sourceConfig[key] !== undefined) {
      if (target[key] === undefined) {
        target[key] = sourceConfig[key];
      }
    }
  });
}

/**
 * Creates an empty configuration
 */
function createEmptyConfiguration(): ClaudeCodeConfiguration {
  return {
    permissions: {
      deny: [],
      allow: [],
      ask: []
    },
    metadata: {
      version: '1.0.0',
      timestamp: Date.now()
    }
  };
}

/**
 * Calculates total number of rules in configuration
 */
function calculateTotalRules(config: ClaudeCodeConfiguration): number {
  const permissions = config.permissions;
  if (!permissions) return 0;
  
  return (permissions.deny?.length || 0) + 
         (permissions.allow?.length || 0) + 
         (permissions.ask?.length || 0);
}

/**
 * Compares semantic versions
 */
function isHigherVersion(version1: string, version2: string): boolean {
  const v1Parts = version1.split('.').map(n => parseInt(n, 10));
  const v2Parts = version2.split('.').map(n => parseInt(n, 10));
  
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return true;
    if (v1Part < v2Part) return false;
  }
  
  return false;
}

/**
 * Applies CLI argument overrides to configuration
 * 
 * @param config Configuration to modify
 * @param overrides CLI overrides to apply
 * @returns Modified configuration
 */
export function applyCliOverrides(
  config: ClaudeCodeConfiguration,
  overrides: Record<string, unknown>
): ClaudeCodeConfiguration {
  const result = { ...config };
  
  Object.entries(overrides).forEach(([key, value]) => {
    if (key.startsWith('permissions.')) {
      const permissionType = key.split('.')[1] as 'deny' | 'allow' | 'ask';
      if (!result.permissions) {
        result.permissions = {};
      }
      if (Array.isArray(value)) {
        result.permissions[permissionType] = value as string[];
      }
    } else if (key.startsWith('metadata.')) {
      const metadataKey = key.split('.')[1];
      if (metadataKey && !result.metadata) {
        result.metadata = { version: '1.0.0', timestamp: Date.now() };
      }
      if (metadataKey) {
        (result.metadata as unknown as Record<string, unknown>)[metadataKey] = value;
      }
    }
  });
  
  return result;
}

/**
 * Substitutes environment variables in configuration strings
 * 
 * @param config Configuration to process
 * @param envVars Environment variables
 * @returns Configuration with substituted values
 */
export function substituteEnvironmentVariables(
  config: ClaudeCodeConfiguration,
  envVars: Record<string, string | undefined> = process.env
): ClaudeCodeConfiguration {
  return JSON.parse(
    JSON.stringify(config).replace(
      /\$\{([A-Z_][A-Z0-9_]*)\}/g,
      (match, varName) => envVars[varName] || match
    )
  );
}