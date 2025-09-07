/**
 * Main configuration parser for Claude Code Security Rulesets Generator
 * Handles Claude Code's native settings.json configuration format
 * Implements hierarchical configuration merging with security precedence
 */

// import * as fs from 'fs/promises';
// import * as path from 'path';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import {
  ClaudeCodeConfiguration,
  ValidationResult,
  ValidationErrorType
} from '../types/index';
import {
  discoverConfigurations,
  loadConfigurationFromSource,
  ConfigurationSource
} from './discovery';
import {
  mergeConfigurations,
  applyCliOverrides,
  substituteEnvironmentVariables,
  MergeContext,
  MergeResult,
  MergeOptions,
  defaultMergeOptions
} from './merger';
import {
  validationSchemas,
  SchemaValidationOptions,
  defaultValidationOptions
} from './schema';

/**
 * Configuration parser options
 */
export interface ParserOptions {
  /** Starting directory for configuration discovery */
  startDir?: string;
  /** Merge options for combining configurations */
  mergeOptions?: MergeOptions;
  /** Schema validation options */
  validationOptions?: SchemaValidationOptions;
  /** CLI argument overrides */
  cliOverrides?: Record<string, unknown>;
  /** Environment variables for substitution */
  envVars?: Record<string, string | undefined>;
  /** Whether to use caching for performance */
  useCache?: boolean;
  /** Maximum parse time in milliseconds */
  maxParseTime?: number;
}

/**
 * Configuration parse result
 */
export interface ParseResult {
  /** Final merged and validated configuration */
  config: ClaudeCodeConfiguration;
  /** Validation result */
  validation: ValidationResult;
  /** Merge result with source information */
  merge: MergeResult;
  /** Sources that contributed to the configuration */
  sources: ConfigurationSource[];
  /** Performance metrics */
  performance: ConfigurationPerformance;
}

/**
 * Configuration parsing performance metrics
 */
export interface ConfigurationPerformance {
  /** Total parsing time */
  totalTime: number;
  /** Discovery time */
  discoveryTime: number;
  /** Loading time */
  loadingTime: number;
  /** Merge time */
  mergeTime: number;
  /** Validation time */
  validationTime: number;
  /** Number of configurations processed */
  configurationsProcessed: number;
  /** Memory usage peak */
  memoryPeak?: number;
}

/**
 * Configuration parser class
 */
export class ConfigurationParser {
  private readonly ajv: Ajv;
  private readonly validators: Map<string, ValidateFunction> = new Map();
  private readonly cache: Map<string, { result: ParseResult; timestamp: number }> = new Map();
  private readonly cacheTTL = 30000; // 30 seconds

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      addUsedSchema: false
    });
    
    addFormats(this.ajv);
    this.initializeValidators();
  }

  /**
   * Parses configuration from discovered sources
   * 
   * @param options Parser options
   * @returns Promise resolving to parse result
   */
  async parseConfiguration(options: ParserOptions = {}): Promise<ParseResult> {
    const startTime = Date.now();
    const maxParseTime = options.maxParseTime || 5000; // 5 second default
    
    // Check cache first
    if (options.useCache !== false) {
      const cached = this.getCachedResult(options);
      if (cached) {
        return cached;
      }
    }

    const performance: ConfigurationPerformance = {
      totalTime: 0,
      discoveryTime: 0,
      loadingTime: 0,
      mergeTime: 0,
      validationTime: 0,
      configurationsProcessed: 0
    };

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Configuration parsing timed out after ${maxParseTime}ms`)), maxParseTime);
      });

      const parsePromise = this.parseConfigurationInternal(options, performance);
      const result = await Promise.race([parsePromise, timeoutPromise]);

      // Cache successful result
      if (options.useCache !== false) {
        this.cacheResult(options, result);
      }

      performance.totalTime = Date.now() - startTime;
      result.performance = performance;

      return result;
    } catch (error) {
      performance.totalTime = Date.now() - startTime;
      
      // Return error result
      return {
        config: this.createEmptyConfiguration(),
        validation: {
          isValid: false,
          errors: [{
            type: 'INVALID_SYNTAX' as ValidationErrorType,
            message: error instanceof Error ? error.message : 'Unknown parsing error',
            severity: 'critical' as const,
            context: { parseTime: performance.totalTime }
          }],
          warnings: [],
          conflicts: [],
          performance: {
            validationTime: performance.totalTime,
            rulesProcessed: 0,
            performanceTarget: { target: 100, achieved: false }
          },
          suggestions: []
        },
        merge: {
          config: this.createEmptyConfiguration(),
          sources: [],
          warnings: [],
          performance: {
            mergeTime: 0,
            configsProcessed: 0,
            rulesProcessed: 0
          }
        },
        sources: [],
        performance
      };
    }
  }

  /**
   * Internal parsing implementation
   */
  private async parseConfigurationInternal(
    options: ParserOptions,
    performance: ConfigurationPerformance
  ): Promise<ParseResult> {
    // Discovery phase
    const discoveryStart = Date.now();
    const sources = await discoverConfigurations({
      startDir: options.startDir || process.cwd(),
      useCache: options.useCache !== false
    });
    performance.discoveryTime = Date.now() - discoveryStart;

    // Loading phase
    const loadingStart = Date.now();
    const mergeContexts: MergeContext[] = [];
    
    for (const source of sources) {
      if (source.exists) {
        try {
          const config = await loadConfigurationFromSource(source);
          if (config) {
            // Apply environment variable substitution
            const processedConfig = options.envVars 
              ? substituteEnvironmentVariables(config, options.envVars)
              : config;

            mergeContexts.push({
              config: processedConfig,
              level: source.level,
              sourcePath: source.path
            });
            performance.configurationsProcessed++;
          }
        } catch (error) {
          // Log loading error but continue with other sources
          console.warn(`Failed to load configuration from ${source.path}:`, error);
        }
      }
    }
    performance.loadingTime = Date.now() - loadingStart;

    // Merge phase
    const mergeStart = Date.now();
    const mergeOptions = { ...defaultMergeOptions.production, ...options.mergeOptions };
    const mergeResult = await mergeConfigurations(mergeContexts, mergeOptions);
    performance.mergeTime = Date.now() - mergeStart;

    // Apply CLI overrides
    let finalConfig = mergeResult.config;
    if (options.cliOverrides && Object.keys(options.cliOverrides).length > 0) {
      finalConfig = applyCliOverrides(finalConfig, options.cliOverrides);
    }

    // Validation phase
    const validationStart = Date.now();
    const validation = await this.validateConfiguration(
      finalConfig,
      options.validationOptions
    );
    performance.validationTime = Date.now() - validationStart;

    return {
      config: finalConfig,
      validation,
      merge: mergeResult,
      sources,
      performance
    };
  }

  /**
   * Validates a configuration against schema and business rules
   */
  async validateConfiguration(
    config: ClaudeCodeConfiguration,
    options: SchemaValidationOptions = {}
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const validationOptions = { ...defaultValidationOptions.production, ...options };
    
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      conflicts: [],
      performance: {
        validationTime: 0,
        rulesProcessed: 0,
        performanceTarget: { target: 100, achieved: false }
      },
      suggestions: []
    };

    try {
      // Skip validation if requested (for performance in trusted contexts)
      if (validationOptions.skipValidation) {
        result.performance.validationTime = Date.now() - startTime;
        result.performance.performanceTarget.achieved = true;
        return result;
      }

      // Schema validation
      await this.validateSchema(config, result);
      
      // Business rules validation
      await this.validateBusinessRules(config, result);
      
      // Conflict detection
      await this.detectRuleConflicts(config, result);
      
      // Performance validation
      const validationTime = Date.now() - startTime;
      result.performance.validationTime = validationTime;
      result.performance.performanceTarget.achieved = validationTime < result.performance.performanceTarget.target;
      
      // Count processed rules
      result.performance.rulesProcessed = this.countRules(config);
      
      // Set overall validity
      result.isValid = result.errors.length === 0;
      
    } catch (error) {
      result.isValid = false;
      result.errors.push({
        type: 'INVALID_SYNTAX' as ValidationErrorType,
        message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'critical' as const
      });
    }

    return result;
  }

  /**
   * Validates configuration against JSON schema
   */
  private async validateSchema(
    config: ClaudeCodeConfiguration,
    result: ValidationResult
  ): Promise<void> {
    const validator = this.validators.get('base');
    if (!validator) {
      throw new Error('Base validator not initialized');
    }

    const isValid = validator(config);
    if (!isValid && validator.errors) {
      for (const error of validator.errors) {
        result.errors.push({
          type: 'INVALID_SYNTAX' as ValidationErrorType,
          message: `Schema validation failed: ${error.message}`,
          location: {
            path: error.instancePath,
            rule: error.schemaPath
          },
          severity: 'high' as const,
          context: { 
            keyword: error.keyword,
            params: error.params
          }
        });
      }
    }
  }

  /**
   * Validates business rules specific to Claude Code
   */
  private async validateBusinessRules(
    config: ClaudeCodeConfiguration,
    result: ValidationResult
  ): Promise<void> {
    const permissions = config.permissions;
    if (!permissions) {
      result.warnings.push({
        type: 'BEST_PRACTICE_VIOLATION' as const,
        message: 'Configuration has no permissions defined',
        context: { recommendation: 'Consider adding at least deny rules for security' }
      });
      return;
    }

    // Validate rule patterns
    for (const ruleType of ['deny', 'allow', 'ask'] as const) {
      const rules = permissions[ruleType];
      if (rules) {
        for (const rule of rules) {
          if (!this.isValidRulePattern(rule)) {
            result.errors.push({
              type: 'INVALID_PATTERN' as ValidationErrorType,
              message: `Invalid rule pattern: ${rule}`,
              location: { rule },
              severity: 'medium' as const
            });
          }
        }
      }
    }

    // Security best practices
    if (!permissions.deny || permissions.deny.length === 0) {
      result.warnings.push({
        type: 'BEST_PRACTICE_VIOLATION' as const,
        message: 'No deny rules specified - consider adding security restrictions',
        context: { securityImpact: 'Configuration may be too permissive' }
      });
    }
  }

  /**
   * Detects conflicts between rule types
   */
  private async detectRuleConflicts(
    config: ClaudeCodeConfiguration,
    result: ValidationResult
  ): Promise<void> {
    const permissions = config.permissions;
    if (!permissions) return;

    const denyRules = permissions.deny || [];
    const allowRules = permissions.allow || [];
    const askRules = permissions.ask || [];

    // Check for allow rules overridden by deny rules
    for (const allowRule of allowRules) {
      for (const denyRule of denyRules) {
        if (this.rulesConflict(allowRule, denyRule)) {
          result.conflicts.push({
            type: 'ALLOW_OVERRIDES_DENY' as const,
            message: `Allow rule "${allowRule}" conflicts with deny rule "${denyRule}"`,
            conflictingRules: [
              { type: 'allow', pattern: allowRule, location: { rule: allowRule } },
              { type: 'deny', pattern: denyRule, location: { rule: denyRule } }
            ],
            resolution: 'MAKE_DENY_MORE_SPECIFIC' as const,
            securityImpact: 'high' as const
          });
        }
      }
    }

    // Check for overlapping patterns
    this.checkOverlappingPatterns(denyRules, 'deny', result);
    this.checkOverlappingPatterns(allowRules, 'allow', result);
    this.checkOverlappingPatterns(askRules, 'ask', result);
  }

  /**
   * Checks for overlapping patterns in rule arrays
   */
  private checkOverlappingPatterns(
    rules: string[],
    ruleType: 'deny' | 'allow' | 'ask',
    result: ValidationResult
  ): void {
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const rule1 = rules[i];
        const rule2 = rules[j];
        if (rule1 && rule2 && this.rulesOverlap(rule1, rule2)) {
          result.conflicts.push({
            type: 'OVERLAPPING_PATTERNS' as const,
            message: `Overlapping ${ruleType} patterns: "${rule1}" and "${rule2}"`,
            conflictingRules: [
              { type: ruleType, pattern: rule1, location: { rule: rule1 } },
              { type: ruleType, pattern: rule2, location: { rule: rule2 } }
            ],
            resolution: 'MANUAL_REVIEW_REQUIRED' as const,
            securityImpact: 'medium' as const
          });
        }
      }
    }
  }

  /**
   * Validates if a rule pattern is valid
   */
  private isValidRulePattern(pattern: string): boolean {
    // Basic validation - can be enhanced with more sophisticated pattern checking
    if (!pattern || pattern.trim() !== pattern) {
      return false;
    }
    
    // Check for basic Claude Code action patterns
    const validPatterns = [
      /^[A-Za-z]+\(.*\)$/,  // Function call pattern like Read(path)
      /^[A-Za-z_]+$/,       // Simple action name
      /^[A-Za-z_]+\*$/      // Wildcard pattern
    ];
    
    return validPatterns.some(pattern_regex => pattern_regex.test(pattern));
  }

  /**
   * Checks if two rules conflict
   */
  private rulesConflict(rule1: string, rule2: string): boolean {
    return rule1 === rule2 || this.ruleMatches(rule1, rule2) || this.ruleMatches(rule2, rule1);
  }

  /**
   * Checks if two rules overlap
   */
  private rulesOverlap(rule1: string, rule2: string): boolean {
    return this.ruleMatches(rule1, rule2) && this.ruleMatches(rule2, rule1);
  }

  /**
   * Checks if one rule matches another (with wildcard support)
   */
  private ruleMatches(rule: string, pattern: string): boolean {
    if (rule === pattern) return true;
    
    // Simple wildcard matching
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`).test(rule);
    }
    
    return false;
  }

  /**
   * Counts total rules in configuration
   */
  private countRules(config: ClaudeCodeConfiguration): number {
    const permissions = config.permissions;
    if (!permissions) return 0;
    
    return (permissions.deny?.length || 0) + 
           (permissions.allow?.length || 0) + 
           (permissions.ask?.length || 0);
  }

  /**
   * Initializes JSON schema validators
   */
  private initializeValidators(): void {
    Object.entries(validationSchemas).forEach(([name, schema]) => {
      this.validators.set(name, this.ajv.compile(schema as any));
    });
  }

  /**
   * Creates an empty configuration
   */
  private createEmptyConfiguration(): ClaudeCodeConfiguration {
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
   * Gets cached parse result
   */
  private getCachedResult(options: ParserOptions): ParseResult | null {
    const cacheKey = this.getCacheKey(options);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result;
    }
    
    return null;
  }

  /**
   * Caches parse result
   */
  private cacheResult(options: ParserOptions, result: ParseResult): void {
    const cacheKey = this.getCacheKey(options);
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Generates cache key from options
   */
  private getCacheKey(options: ParserOptions): string {
    return JSON.stringify({
      startDir: options.startDir || process.cwd(),
      cliOverrides: options.cliOverrides || {},
      envVars: options.envVars || {}
    });
  }

  /**
   * Clears the parser cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0 // TODO: Implement hit rate tracking
    };
  }
}

/**
 * Default configuration parser instance
 */
export const configurationParser = new ConfigurationParser();

/**
 * Convenience function for parsing configuration
 */
export async function parseConfiguration(options: ParserOptions = {}): Promise<ParseResult> {
  return configurationParser.parseConfiguration(options);
}