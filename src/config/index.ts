/**
 * Configuration parser module for Claude Code Security Rulesets Generator
 * 
 * This module provides comprehensive configuration parsing, merging, and validation
 * capabilities for Claude Code's native settings.json format with security enhancements.
 * 
 * Key Features:
 * - Hierarchical configuration discovery (Enterprise → System → Project → User)
 * - Security-first merging with deny rule precedence
 * - Schema validation against Claude Code requirements
 * - Environment variable substitution
 * - CLI argument overrides
 * - Performance monitoring and caching
 * - Conflict detection and resolution suggestions
 * 
 * @example Basic usage:
 * ```typescript
 * import { parseConfiguration } from './config';
 * 
 * const result = await parseConfiguration({
 *   startDir: './my-project',
 *   cliOverrides: {
 *     'permissions.deny': ['Write(*)', 'Execute(*)']
 *   }
 * });
 * 
 * if (result.validation.isValid) {
 *   console.log('Configuration is valid:', result.config);
 * } else {
 *   console.error('Validation errors:', result.validation.errors);
 * }
 * ```
 * 
 * @example Advanced usage with custom options:
 * ```typescript
 * import { 
 *   ConfigurationParser, 
 *   defaultMergeOptions, 
 *   defaultValidationOptions 
 * } from './config';
 * 
 * const parser = new ConfigurationParser();
 * const result = await parser.parseConfiguration({
 *   mergeOptions: {
 *     ...defaultMergeOptions.strict,
 *     trackRuleSources: true
 *   },
 *   validationOptions: {
 *     ...defaultValidationOptions.strict,
 *     validateEnvironmentVars: true
 *   }
 * });
 * ```
 */

// Main parser functionality
export {
  ConfigurationParser,
  parseConfiguration,
  type ParserOptions,
  type ParseResult,
  type ConfigurationPerformance
} from './parser';

// Configuration discovery
export {
  discoverConfigurations,
  loadConfigurationFromSource,
  isConfigurationPathSafe,
  clearDiscoveryCache,
  getDiscoveryCacheStats,
  type ConfigurationSource,
  type ConfigurationLevel,
  type DiscoveryOptions
} from './discovery';

// Hierarchical merging
export {
  mergeConfigurations,
  applyCliOverrides,
  substituteEnvironmentVariables,
  defaultMergeOptions,
  type MergeContext,
  type MergeResult,
  type MergeSource,
  type MergeWarning,
  type MergePerformance,
  type MergeOptions,
  type MergeStrategy
} from './merger';

// Schema validation
export {
  claudeCodeConfigurationSchema,
  configurationHierarchySchema,
  environmentVariableSchema,
  cliOverrideSchema,
  validationSchemas,
  defaultValidationOptions,
  SchemaValidationError,
  type SchemaValidationOptions
} from './schema';

// Re-export relevant types from the main types module for convenience
export type {
  ClaudeCodeConfiguration,
  ConfigurationMetadata,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationPerformance,
  RuleConflict,
  ResolutionSuggestion,
  Environment
} from '../types/index';

/**
 * Configuration utilities and helpers
 */
export const configUtils = {
  /**
   * Creates a minimal valid configuration
   */
  createMinimalConfig() {
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
  },

  /**
   * Validates if a rule pattern follows Claude Code conventions
   */
  isValidRulePattern(pattern: string): boolean {
    if (!pattern || pattern.trim() !== pattern) {
      return false;
    }
    
    const validPatterns = [
      /^[A-Za-z]+\(.*\)$/,    // Function call pattern like Read(path)
      /^[A-Za-z_]+$/,         // Simple action name
      /^[A-Za-z_]+\*$/,       // Wildcard pattern
      /^[A-Za-z]+\([^)]*\)$/ // Function with parameters
    ];
    
    return validPatterns.some(regex => regex.test(pattern));
  },

  /**
   * Extracts all unique rule patterns from a configuration
   */
  extractRulePatterns(config: any): {
    deny: string[];
    allow: string[];
    ask: string[];
    all: string[];
  } {
    const permissions = config.permissions || {};
    const deny = (permissions.deny || []) as string[];
    const allow = (permissions.allow || []) as string[];
    const ask = (permissions.ask || []) as string[];
    
    return {
      deny: [...new Set(deny)],
      allow: [...new Set(allow)],
      ask: [...new Set(ask)],
      all: [...new Set([...deny, ...allow, ...ask])]
    };
  },

  /**
   * Estimates configuration complexity for performance planning
   */
  estimateComplexity(config: any): {
    ruleCount: number;
    wildcardCount: number;
    complexityScore: number;
  } {
    const patterns = this.extractRulePatterns(config);
    const ruleCount = patterns.all.length;
    const wildcardCount = patterns.all.filter(rule => rule.includes('*')).length;
    
    // Simple complexity scoring
    const complexityScore = ruleCount + (wildcardCount * 2);
    
    return {
      ruleCount,
      wildcardCount,
      complexityScore
    };
  },

  /**
   * Generates configuration summary for debugging
   */
  generateSummary(config: any): {
    hasPermissions: boolean;
    ruleCount: number;
    hasMetadata: boolean;
    version: string;
    created: Date | null;
  } {
    const patterns = this.extractRulePatterns(config);
    
    return {
      hasPermissions: !!config.permissions,
      ruleCount: patterns.all.length,
      hasMetadata: !!config.metadata,
      version: config.metadata?.version || 'unknown',
      created: config.metadata?.timestamp ? new Date(config.metadata.timestamp) : null
    };
  }
};

/**
 * Version information
 */
export const version = '1.0.0';

/**
 * Module metadata
 */
export const metadata = {
  name: 'Claude Code Security Rulesets Configuration Parser',
  version,
  description: 'Production-ready configuration parser for Claude Code security management',
  author: 'Claude Code Security Team',
  license: 'MIT',
  keywords: ['claude-code', 'security', 'configuration', 'parser', 'validation']
} as const;