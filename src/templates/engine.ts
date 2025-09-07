/**
 * Template Engine for Claude Code Security Rulesets Generator
 * Enables rapid deployment of security policies across different organization types
 * Supports template loading, validation, merging, and versioning
 */

import { performance } from 'perf_hooks';
import {
  SecurityTemplate,
  TemplateParameter,
  ClaudeCodeConfiguration,
  ValidationResult,
  Environment,
  TemplateCategory,
  ComplianceFramework
} from '../types';
import { validationEngine } from '../validation/engine';
import { mergeConfigurations, MergeContext } from '../config/merger';
import { TemplateLoader } from './loader';
import { TemplateMerger } from './merger';
import { TemplateValidator } from './validator';
import { TemplateRegistry } from './registry';

/**
 * Template application options
 */
export interface TemplateApplyOptions {
  /** Parameters to customize template */
  parameters?: Record<string, unknown>;
  /** Base configuration to merge with template */
  baseConfig?: ClaudeCodeConfiguration;
  /** Environment to apply template for */
  environment?: Environment;
  /** Whether to validate result after application */
  validateResult?: boolean;
  /** Custom merge strategy */
  mergeStrategy?: 'override' | 'merge' | 'combine';
  /** Skip template validation */
  skipValidation?: boolean;
  /** Dry run - don't apply changes */
  dryRun?: boolean;
}

/**
 * Template application result
 */
export interface TemplateApplyResult {
  /** Applied configuration */
  config: ClaudeCodeConfiguration;
  /** Template that was applied */
  template: SecurityTemplate;
  /** Parameters used */
  parameters: Record<string, unknown>;
  /** Applied parameters after defaults and validation */
  appliedParameters: Record<string, unknown>;
  /** Validation result if requested */
  validation?: ValidationResult;
  /** Merge details */
  mergeDetails: {
    /** Number of rules added by template */
    rulesAdded: number;
    /** Number of rules overridden */
    rulesOverridden: number;
    /** Merge strategy used */
    strategy: string;
  };
  /** Performance metrics */
  performance: {
    applicationTime: number;
    validationTime?: number;
    totalTime: number;
  };
  /** Warnings generated during application */
  warnings: string[];
}

/**
 * Template discovery options
 */
export interface TemplateDiscoveryOptions {
  /** Filter by category */
  category?: TemplateCategory;
  /** Filter by compliance framework */
  compliance?: ComplianceFramework[];
  /** Filter by environment */
  environment?: Environment;
  /** Search by tags */
  tags?: string[];
  /** Include custom templates */
  includeCustom?: boolean;
  /** Include built-in templates */
  includeBuiltIn?: boolean;
}

/**
 * Template compatibility result
 */
export interface TemplateCompatibility {
  /** Whether template is compatible */
  compatible: boolean;
  /** Template version */
  templateVersion: string;
  /** System version */
  systemVersion: string;
  /** Compatibility issues */
  issues: string[];
  /** Required upgrades */
  requiredUpgrades: string[];
}

/**
 * Main template engine class
 */
export class TemplateEngine {
  private loader: TemplateLoader;
  private merger: TemplateMerger;
  private validator: TemplateValidator;
  private registry: TemplateRegistry;
  private cache: Map<string, TemplateApplyResult> = new Map();

  constructor() {
    this.loader = new TemplateLoader();
    this.merger = new TemplateMerger();
    this.validator = new TemplateValidator();
    this.registry = new TemplateRegistry();
    
    // Initialize built-in templates
    this.initializeBuiltInTemplates();
  }

  /**
   * Initialize built-in templates
   */
  private async initializeBuiltInTemplates(): Promise<void> {
    try {
      await this.loader.loadBuiltInTemplates();
      const builtInTemplates = this.loader.getBuiltInTemplates();
      
      for (const template of builtInTemplates) {
        await this.registry.register(template);
      }
    } catch (error) {
      console.error('Failed to initialize built-in templates:', error);
    }
  }

  /**
   * Discover available templates based on criteria
   */
  public async discoverTemplates(
    options: TemplateDiscoveryOptions = {}
  ): Promise<SecurityTemplate[]> {
    const {
      category,
      compliance = [],
      environment,
      tags = [],
      includeCustom = true,
      includeBuiltIn = true
    } = options;

    let templates: SecurityTemplate[] = [];

    // Get templates from registry
    if (includeBuiltIn) {
      templates.push(...this.registry.getBuiltInTemplates());
    }
    
    if (includeCustom) {
      templates.push(...this.registry.getCustomTemplates());
    }

    // Apply filters
    return templates.filter(template => {
      if (category && template.category !== category) return false;
      
      if (compliance.length > 0 && 
          !compliance.some(c => template.compliance.includes(c))) return false;
      
      if (tags.length > 0 && 
          !tags.some(tag => template.tags.includes(tag))) return false;
      
      return true;
    }).sort((a, b) => {
      // Sort by relevance: built-in first, then by update date
      if (a.isBuiltIn !== b.isBuiltIn) {
        return a.isBuiltIn ? -1 : 1;
      }
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }

  /**
   * Get a specific template by ID
   */
  public async getTemplate(templateId: string): Promise<SecurityTemplate | null> {
    return this.registry.getTemplate(templateId);
  }

  /**
   * Load a template from file or URL
   */
  public async loadTemplate(
    source: string,
    type: 'file' | 'url' | 'registry' = 'file'
  ): Promise<SecurityTemplate> {
    switch (type) {
      case 'file':
        return this.loader.loadFromFile(source);
      case 'url':
        return this.loader.loadFromUrl(source);
      case 'registry':
        const template = await this.registry.getTemplate(source);
        if (!template) {
          throw new Error(`Template not found in registry: ${source}`);
        }
        return template;
      default:
        throw new Error(`Unsupported template source type: ${type}`);
    }
  }

  /**
   * Validate a template
   */
  public async validateTemplate(template: SecurityTemplate): Promise<ValidationResult> {
    return this.validator.validate(template);
  }

  /**
   * Check template compatibility with current system
   */
  public checkCompatibility(template: SecurityTemplate): TemplateCompatibility {
    const systemVersion = '1.0.0'; // Would be dynamic in real implementation
    const templateVersion = template.version;

    const result: TemplateCompatibility = {
      compatible: true,
      templateVersion,
      systemVersion,
      issues: [],
      requiredUpgrades: []
    };

    // Simple semantic version compatibility check
    const [sysMajor, sysMinor] = systemVersion.split('.').map(Number);
    const [tmpMajor, tmpMinor] = templateVersion.split('.').map(Number);

    if (tmpMajor > sysMinor) {
      result.compatible = false;
      result.issues.push('Template requires newer major version');
      result.requiredUpgrades.push(`System version ${tmpMajor}.0.0 or higher`);
    } else if (tmpMajor === sysMinor && tmpMinor > sysMinor) {
      result.issues.push('Template may use newer features');
    }

    // Check for required parameters
    if (template.parameters) {
      const requiredParams = template.parameters.filter(p => p.required);
      if (requiredParams.length > 0) {
        result.issues.push(`Template requires ${requiredParams.length} parameters`);
      }
    }

    return result;
  }

  /**
   * Apply a template to create a configuration
   */
  public async applyTemplate(
    templateId: string,
    options: TemplateApplyOptions = {}
  ): Promise<TemplateApplyResult> {
    const startTime = performance.now();
    const {
      parameters = {},
      baseConfig,
      environment = 'development',
      validateResult = true,
      mergeStrategy = 'merge',
      skipValidation = false,
      dryRun = false
    } = options;

    // Generate cache key
    const cacheKey = this.generateCacheKey(templateId, parameters, baseConfig, mergeStrategy);
    
    // Check cache
    if (this.cache.has(cacheKey) && !dryRun) {
      return this.cache.get(cacheKey)!;
    }

    // Get template
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate template if requested
    if (!skipValidation) {
      const templateValidation = await this.validateTemplate(template);
      if (!templateValidation.isValid) {
        throw new Error(`Template validation failed: ${templateValidation.errors.map(e => e.message).join(', ')}`);
      }
    }

    // Check compatibility
    const compatibility = this.checkCompatibility(template);
    if (!compatibility.compatible) {
      throw new Error(`Template not compatible: ${compatibility.issues.join(', ')}`);
    }

    // Process parameters
    const processedParams = await this.processParameters(template, parameters);
    
    // Apply parameters to template configuration
    const parameterizedConfig = await this.applyParameters(template.rules, processedParams);
    
    // Merge with base configuration if provided
    let finalConfig: ClaudeCodeConfiguration;
    let mergeDetails = {
      rulesAdded: 0,
      rulesOverridden: 0,
      strategy: mergeStrategy
    };

    if (baseConfig) {
      const mergeResult = await this.merger.merge(
        baseConfig,
        parameterizedConfig,
        { strategy: mergeStrategy, environment }
      );
      finalConfig = mergeResult.config;
      mergeDetails.rulesAdded = mergeResult.rulesAdded;
      mergeDetails.rulesOverridden = mergeResult.rulesOverridden;
    } else {
      finalConfig = parameterizedConfig;
      mergeDetails.rulesAdded = this.countRules(parameterizedConfig);
    }

    // Update metadata
    finalConfig.metadata = {
      ...finalConfig.metadata,
      version: template.version,
      templateId: template.id,
      environment,
      timestamp: Date.now(),
      name: template.name
    };

    // Validate result if requested
    let validation: ValidationResult | undefined;
    let validationTime = 0;

    if (validateResult && !dryRun) {
      const validationStart = performance.now();
      validation = await validationEngine.validate(finalConfig);
      validationTime = performance.now() - validationStart;
      
      if (!validation.isValid) {
        console.warn('Template application resulted in invalid configuration:', validation.errors);
      }
    }

    const totalTime = performance.now() - startTime;
    const applicationTime = totalTime - validationTime;

    const result: TemplateApplyResult = {
      config: finalConfig,
      template,
      parameters,
      appliedParameters: processedParams,
      validation,
      mergeDetails,
      performance: {
        applicationTime,
        validationTime: validationTime > 0 ? validationTime : undefined,
        totalTime
      },
      warnings: []
    };

    // Add warnings
    if (compatibility.issues.length > 0) {
      result.warnings.push(...compatibility.issues);
    }

    // Cache result
    if (!dryRun) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Process template parameters with validation and defaults
   */
  private async processParameters(
    template: SecurityTemplate,
    parameters: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const processed: Record<string, unknown> = {};
    const templateParams = template.parameters || [];

    // Process each template parameter
    for (const param of templateParams) {
      let value = parameters[param.name];

      // Use default if not provided
      if (value === undefined || value === null) {
        if (param.required) {
          throw new Error(`Required parameter missing: ${param.name}`);
        }
        value = param.defaultValue;
      }

      // Validate parameter if validation rules exist
      if (param.validation && value !== undefined) {
        await this.validateParameter(param, value);
      }

      processed[param.name] = value;
    }

    // Check for unknown parameters
    const unknownParams = Object.keys(parameters).filter(
      key => !templateParams.some(p => p.name === key)
    );
    
    if (unknownParams.length > 0) {
      console.warn(`Unknown parameters provided: ${unknownParams.join(', ')}`);
    }

    return processed;
  }

  /**
   * Validate a single parameter
   */
  private async validateParameter(
    param: TemplateParameter,
    value: unknown
  ): Promise<void> {
    const validation = param.validation;
    if (!validation) return;

    // Type validation
    const expectedType = param.type;
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (expectedType !== actualType && !(expectedType === 'object' && value !== null && actualType === 'object')) {
      throw new Error(`Parameter ${param.name} expected ${expectedType}, got ${actualType}`);
    }

    // String validations
    if (param.type === 'string' && typeof value === 'string') {
      if (validation.minLength !== undefined && value.length < validation.minLength) {
        throw new Error(`Parameter ${param.name} too short (min: ${validation.minLength})`);
      }
      if (validation.maxLength !== undefined && value.length > validation.maxLength) {
        throw new Error(`Parameter ${param.name} too long (max: ${validation.maxLength})`);
      }
      if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
        throw new Error(`Parameter ${param.name} doesn't match pattern: ${validation.pattern}`);
      }
      if (validation.enum && !validation.enum.includes(value)) {
        throw new Error(`Parameter ${param.name} must be one of: ${validation.enum.join(', ')}`);
      }
    }

    // Number validations
    if (param.type === 'number' && typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        throw new Error(`Parameter ${param.name} too small (min: ${validation.min})`);
      }
      if (validation.max !== undefined && value > validation.max) {
        throw new Error(`Parameter ${param.name} too large (max: ${validation.max})`);
      }
    }

    // Array validations
    if (param.type === 'array' && Array.isArray(value)) {
      if (validation.minLength !== undefined && value.length < validation.minLength) {
        throw new Error(`Parameter ${param.name} array too short (min: ${validation.minLength})`);
      }
      if (validation.maxLength !== undefined && value.length > validation.maxLength) {
        throw new Error(`Parameter ${param.name} array too long (max: ${validation.maxLength})`);
      }
    }
  }

  /**
   * Apply parameters to template configuration
   */
  private async applyParameters(
    templateConfig: ClaudeCodeConfiguration,
    parameters: Record<string, unknown>
  ): Promise<ClaudeCodeConfiguration> {
    // Deep clone the configuration
    const config = JSON.parse(JSON.stringify(templateConfig));

    // Simple parameter substitution
    const configStr = JSON.stringify(config);
    const substituted = configStr.replace(
      /\{\{([^}]+)\}\}/g,
      (match, paramName) => {
        const trimmed = paramName.trim();
        const value = parameters[trimmed];
        return value !== undefined ? String(value) : match;
      }
    );

    return JSON.parse(substituted);
  }

  /**
   * Register a custom template
   */
  public async registerTemplate(template: SecurityTemplate): Promise<void> {
    // Validate template before registration
    const validation = await this.validateTemplate(template);
    if (!validation.isValid) {
      throw new Error(`Cannot register invalid template: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    await this.registry.register(template);
    
    // Clear cache since new template might affect results
    this.cache.clear();
  }

  /**
   * Unregister a template
   */
  public async unregisterTemplate(templateId: string): Promise<boolean> {
    const result = await this.registry.unregister(templateId);
    
    if (result) {
      // Clear cache
      this.cache.clear();
    }
    
    return result;
  }

  /**
   * Update an existing template
   */
  public async updateTemplate(
    templateId: string,
    updates: Partial<SecurityTemplate>
  ): Promise<SecurityTemplate> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const updatedTemplate: SecurityTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date()
    };

    // Validate updated template
    const validation = await this.validateTemplate(updatedTemplate);
    if (!validation.isValid) {
      throw new Error(`Updated template is invalid: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    await this.registry.update(templateId, updatedTemplate);
    
    // Clear cache
    this.cache.clear();

    return updatedTemplate;
  }

  /**
   * Generate cache key for template application
   */
  private generateCacheKey(
    templateId: string,
    parameters: Record<string, unknown>,
    baseConfig?: ClaudeCodeConfiguration,
    mergeStrategy?: string
  ): string {
    const paramStr = JSON.stringify(parameters);
    const configStr = baseConfig ? JSON.stringify(baseConfig) : '';
    return `${templateId}:${paramStr}:${configStr}:${mergeStrategy}`;
  }

  /**
   * Count rules in configuration
   */
  private countRules(config: ClaudeCodeConfiguration): number {
    const permissions = config.permissions;
    if (!permissions) return 0;
    
    return (permissions.deny?.length || 0) + 
           (permissions.allow?.length || 0) + 
           (permissions.ask?.length || 0);
  }

  /**
   * Clear template application cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: 1000 // Would be configurable
    };
  }

  /**
   * Export templates as JSON
   */
  public async exportTemplates(templateIds?: string[]): Promise<string> {
    const templates = templateIds 
      ? await Promise.all(templateIds.map(id => this.getTemplate(id)))
      : [...this.registry.getBuiltInTemplates(), ...this.registry.getCustomTemplates()];

    return JSON.stringify(templates.filter(t => t !== null), null, 2);
  }

  /**
   * Import templates from JSON
   */
  public async importTemplates(json: string): Promise<SecurityTemplate[]> {
    const templates = JSON.parse(json) as SecurityTemplate[];
    const imported: SecurityTemplate[] = [];

    for (const template of templates) {
      try {
        await this.registerTemplate(template);
        imported.push(template);
      } catch (error) {
        console.error(`Failed to import template ${template.id}:`, error);
      }
    }

    return imported;
  }

  /**
   * Get template usage statistics
   */
  public getTemplateStats(): Record<string, { usageCount: number; lastUsed?: Date }> {
    // This would track actual usage in a real implementation
    const templates = [...this.registry.getBuiltInTemplates(), ...this.registry.getCustomTemplates()];
    const stats: Record<string, { usageCount: number; lastUsed?: Date }> = {};

    for (const template of templates) {
      stats[template.id] = {
        usageCount: 0, // Would be tracked in real implementation
        lastUsed: undefined
      };
    }

    return stats;
  }

  /**
   * Cleanup and shutdown
   */
  public async shutdown(): Promise<void> {
    this.cache.clear();
    await this.registry.shutdown();
  }
}

// Export singleton instance
export const templateEngine = new TemplateEngine();