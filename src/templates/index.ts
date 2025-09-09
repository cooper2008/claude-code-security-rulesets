/**
 * Template System Module Exports
 * Claude Code Security Rulesets Generator - Template Engine
 * 
 * This module provides a comprehensive template system for rapid deployment
 * of security policies across different organization types and environments.
 */

// Core template engine
export { 
  TemplateEngine, 
  templateEngine,
  type TemplateApplyOptions,
  type TemplateApplyResult,
  type TemplateDiscoveryOptions,
  type TemplateCompatibility
} from './engine';

// Template loader for built-in and custom templates
export {
  TemplateLoader,
  type TemplateLoadOptions,
  type TemplateLoadResult,
  type TemplateDiscoveryResult
} from './loader';

// Template merger with intelligent merge strategies  
export {
  TemplateMerger,
  type TemplateMergeOptions,
  type TemplateMergeResult,
  type TemplateMergeStrategy
} from './merger';

// Template validator for validation before application
export {
  TemplateValidator,
  type TemplateValidationOptions,
  type TemplateValidationResult,
  type TemplateValidationWarning,
  type ValidationCoverage
} from './validator';

// Template registry for discovery and registration
export {
  TemplateRegistry,
  type TemplateRegistryOptions,
  type TemplateRegistrationResult,
  type TemplateSearchCriteria,
  type TemplateSearchResult
} from './registry';

// Import and re-export core types from main types module for convenience
import type {
  SecurityTemplate,
  TemplateParameter,
  TemplateCategory,
  ComplianceFramework,
  Environment,
  ClaudeCodeConfiguration
} from '../types/index';

// Import templateEngine for default export
import { templateEngine } from './engine';

export type {
  SecurityTemplate,
  TemplateParameter,
  TemplateCategory,
  ComplianceFramework,
  Environment,
  ClaudeCodeConfiguration
};

/**
 * Template system utilities and helpers
 */

/**
 * Quick template application function
 * Applies a template with minimal configuration
 */
export async function applyTemplate(
  templateId: string, 
  parameters?: Record<string, unknown>,
  baseConfig?: ClaudeCodeConfiguration
) {
  const { templateEngine } = await import('./engine');
  return templateEngine.applyTemplate(templateId, {
    parameters,
    baseConfig,
    validateResult: true
  });
}

/**
 * Quick template discovery function
 * Discovers templates matching basic criteria
 */
export async function discoverTemplates(
  category?: TemplateCategory,
  tags?: string[]
) {
  const { templateEngine } = await import('./engine');
  return templateEngine.discoverTemplates({
    category,
    tags,
    includeBuiltIn: true,
    includeCustom: true
  });
}

/**
 * Quick template validation function
 * Validates a template with standard options
 */
export async function validateTemplate(template: SecurityTemplate) {
  const validatorModule = await import('./validator');
  const validator = new validatorModule.TemplateValidator();
  return validator.validate(template);
}

/**
 * Template system constants
 */
export const TEMPLATE_CONSTANTS = {
  /** Built-in template IDs */
  BUILTIN_TEMPLATES: {
    DEVELOPMENT: 'development',
    PRODUCTION: 'production', 
    ENTERPRISE: 'enterprise',
    SOC2: 'soc2',
    HIPAA: 'hipaa',
    PCI_DSS: 'pci-dss'
  },

  /** Template categories */
  CATEGORIES: {
    DEVELOPMENT: 'development' as const,
    PRODUCTION: 'production' as const,
    COMPLIANCE: 'compliance' as const,
    CUSTOM: 'custom' as const
  },

  /** Compliance frameworks */
  COMPLIANCE_FRAMEWORKS: {
    SOC2: 'SOC2' as const,
    GDPR: 'GDPR' as const,
    HIPAA: 'HIPAA' as const,
    PCI_DSS: 'PCI-DSS' as const,
    ISO27001: 'ISO27001' as const
  },

  /** Environment types */
  ENVIRONMENTS: {
    DEVELOPMENT: 'development' as const,
    STAGING: 'staging' as const,
    PRODUCTION: 'production' as const,
    TEST: 'test' as const
  },

  /** Template merge strategies */
  MERGE_STRATEGIES: {
    OVERRIDE: 'override' as const,
    MERGE: 'merge' as const,
    COMBINE: 'combine' as const,
    SELECTIVE: 'selective' as const,
    LAYERED: 'layered' as const
  },

  /** Template parameter types */
  PARAMETER_TYPES: {
    STRING: 'string' as const,
    NUMBER: 'number' as const,
    BOOLEAN: 'boolean' as const,
    ARRAY: 'array' as const,
    OBJECT: 'object' as const
  }
};

/**
 * Template system version
 */
export const TEMPLATE_SYSTEM_VERSION = '1.0.0';

/**
 * Default template engine configuration
 */
export const DEFAULT_TEMPLATE_CONFIG = {
  validateTemplatesOnLoad: true,
  cacheTemplates: true,
  enableVersioning: true,
  persistCustomTemplates: true,
  maxCacheSize: 1000,
  cacheTTL: 5 * 60 * 1000 // 5 minutes
};

/**
 * Template system health check
 */
export async function getTemplateSystemHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  templateCounts: {
    builtin: number;
    custom: number;
    total: number;
  };
  cacheStats: {
    size: number;
    hitRate: number;
  };
  lastUpdated: Date;
}> {
  try {
    const { templateEngine } = await import('./engine');
    const builtinTemplates = await templateEngine.discoverTemplates({
      includeBuiltIn: true,
      includeCustom: false
    });
    const customTemplates = await templateEngine.discoverTemplates({
      includeBuiltIn: false,
      includeCustom: true
    });
    const cacheStats = templateEngine.getCacheStats();

    return {
      status: 'healthy',
      version: TEMPLATE_SYSTEM_VERSION,
      templateCounts: {
        builtin: builtinTemplates.length,
        custom: customTemplates.length,
        total: builtinTemplates.length + customTemplates.length
      },
      cacheStats: {
        size: cacheStats.size,
        hitRate: 0 // Would be calculated from actual usage metrics
      },
      lastUpdated: new Date()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      version: TEMPLATE_SYSTEM_VERSION,
      templateCounts: { builtin: 0, custom: 0, total: 0 },
      cacheStats: { size: 0, hitRate: 0 },
      lastUpdated: new Date()
    };
  }
}

/**
 * Initialize template system
 * Call this function to ensure the template system is ready
 */
export async function initializeTemplateSystem(): Promise<{
  success: boolean;
  templatesLoaded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let templatesLoaded = 0;

  try {
    const { templateEngine } = await import('./engine');
    
    // Initialize template engine (loads built-in templates)
    const templates = await templateEngine.discoverTemplates();
    templatesLoaded = templates.length;

    if (templatesLoaded === 0) {
      errors.push('No templates were loaded during initialization');
    }

    console.log(`Template system initialized successfully with ${templatesLoaded} templates`);
    
    return {
      success: errors.length === 0,
      templatesLoaded,
      errors
    };
  } catch (error) {
    errors.push(`Failed to initialize template system: ${error}`);
    return {
      success: false,
      templatesLoaded: 0,
      errors
    };
  }
}

/**
 * Create a custom template builder
 * Helper function to create templates programmatically
 */
export function createTemplateBuilder(): any {
  return {
    id: (id: string) => ({ ...templateBuilder, _id: id }),
    name: (name: string) => ({ ...templateBuilder, _name: name }),
    category: (category: TemplateCategory) => ({ ...templateBuilder, _category: category }),
    description: (description: string) => ({ ...templateBuilder, _description: description }),
    version: (version: string) => ({ ...templateBuilder, _version: version }),
    tags: (...tags: string[]) => ({ ...templateBuilder, _tags: tags }),
    compliance: (...frameworks: ComplianceFramework[]) => ({ 
      ...templateBuilder, 
      _compliance: frameworks 
    }),
    rules: (rules: ClaudeCodeConfiguration) => ({ ...templateBuilder, _rules: rules }),
    parameters: (...parameters: TemplateParameter[]) => ({ 
      ...templateBuilder, 
      _parameters: parameters 
    }),
    build(): SecurityTemplate {
      if (!this._id || !this._name || !this._category || !this._rules || !this._description) {
        throw new Error('Template builder missing required fields');
      }
      
      return {
        id: this._id,
        name: this._name,
        category: this._category,
        rules: this._rules,
        description: this._description,
        compliance: this._compliance || [],
        version: this._version || '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: this._tags || [],
        isBuiltIn: false,
        parameters: this._parameters
      };
    }
  } as const;
}

const templateBuilder = {
  _id: undefined as string | undefined,
  _name: undefined as string | undefined,
  _category: undefined as TemplateCategory | undefined,
  _description: undefined as string | undefined,
  _version: undefined as string | undefined,
  _tags: undefined as string[] | undefined,
  _compliance: undefined as ComplianceFramework[] | undefined,
  _rules: undefined as ClaudeCodeConfiguration | undefined,
  _parameters: undefined as TemplateParameter[] | undefined,
  
  id: function(id: string) { return { ...this, _id: id }; },
  name: function(name: string) { return { ...this, _name: name }; },
  category: function(category: TemplateCategory) { return { ...this, _category: category }; },
  description: function(description: string) { return { ...this, _description: description }; },
  version: function(version: string) { return { ...this, _version: version }; },
  tags: function(...tags: string[]) { return { ...this, _tags: tags }; },
  compliance: function(...frameworks: ComplianceFramework[]) { 
    return { ...this, _compliance: frameworks }; 
  },
  rules: function(rules: ClaudeCodeConfiguration) { return { ...this, _rules: rules }; },
  parameters: function(...parameters: TemplateParameter[]) { 
    return { ...this, _parameters: parameters }; 
  },
  build: function(): SecurityTemplate {
    if (!this._id || !this._name || !this._category || !this._rules || !this._description) {
      throw new Error('Template builder missing required fields: id, name, category, rules, description');
    }
    
    return {
      id: this._id,
      name: this._name,
      category: this._category,
      rules: this._rules,
      description: this._description,
      compliance: this._compliance || [],
      version: this._version || '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: this._tags || [],
      isBuiltIn: false,
      parameters: this._parameters
    };
  }
};

/**
 * Template system metadata
 */
export const TEMPLATE_SYSTEM_METADATA = {
  name: 'Claude Code Security Rulesets Template Engine',
  version: TEMPLATE_SYSTEM_VERSION,
  description: 'Comprehensive template system for rapid deployment of security policies',
  author: 'Claude Code Security Team',
  license: 'MIT',
  repository: 'https://github.com/anthropic/claude-code-security-rulesets',
  keywords: ['security', 'templates', 'policies', 'compliance', 'governance'],
  engines: {
    node: '>=16.0.0'
  },
  features: [
    'Built-in templates for common organization types',
    'Custom template support',
    'Intelligent template merging',
    'Comprehensive validation',
    'Compliance framework support',
    'Template versioning and registry',
    'Parameter-based customization',
    'Performance optimizations'
  ]
};

// Default export for convenient access to the main template engine
export default templateEngine;