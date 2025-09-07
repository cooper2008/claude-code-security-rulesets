import {
  ExtendableTemplate,
  TemplateBuildContext,
  TemplateValidationResult,
  TemplateValidationError,
  TemplateValidationWarning,
  CustomValidationRule,
  TemplateExtension
} from './types';
import { ClaudeCodeConfiguration } from '../../types';
import { createSandbox } from './sandbox';

/**
 * Template validation engine with custom rule support
 */
export class TemplateValidator {
  private customValidators: Map<string, CustomValidationRule> = new Map();
  private validationCache: Map<string, TemplateValidationResult> = new Map();

  /**
   * Register a custom validation rule
   */
  public registerCustomRule(rule: CustomValidationRule): void {
    this.customValidators.set(rule.id, rule);
  }

  /**
   * Unregister a custom validation rule
   */
  public unregisterCustomRule(ruleId: string): void {
    this.customValidators.delete(ruleId);
  }

  /**
   * Validate a complete template
   */
  public async validateTemplate(
    template: ExtendableTemplate,
    context: TemplateBuildContext
  ): Promise<TemplateValidationResult> {
    const startTime = Date.now();
    const errors: TemplateValidationError[] = [];
    const warnings: TemplateValidationWarning[] = [];

    // Check cache first
    const cacheKey = this.getCacheKey(template, context);
    const cached = this.validationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Validate basic template structure
      await this.validateTemplateStructure(template, errors, warnings);

      // Validate inheritance
      await this.validateInheritance(template, context, errors, warnings);

      // Validate template configuration
      await this.validateConfiguration(template.rules, errors, warnings);

      // Validate extensions
      await this.validateExtensions(template, context, errors, warnings);

      // Run custom validation rules
      await this.runCustomValidations(template, context, errors, warnings);

      // Validate permissions and scope
      await this.validatePermissions(template, context, errors, warnings);

    } catch (error) {
      errors.push({
        type: 'validation',
        message: `Validation failed: ${(error as Error).message}`,
        severity: 'critical',
        location: {
          templateId: template.id
        }
      });
    }

    const result: TemplateValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
      performance: {
        validationTime: Date.now() - startTime,
        rulesValidated: this.countRules(template.rules),
        customRulesValidated: template.customValidation?.length || 0
      }
    };

    // Cache result
    this.validationCache.set(cacheKey, result);

    return result;
  }

  /**
   * Validate template configuration
   */
  public async validateConfiguration(
    config: ClaudeCodeConfiguration,
    errors?: TemplateValidationError[],
    warnings?: TemplateValidationWarning[]
  ): Promise<TemplateValidationResult> {
    const startTime = Date.now();
    const validationErrors: TemplateValidationError[] = errors || [];
    const validationWarnings: TemplateValidationWarning[] = warnings || [];

    // Validate configuration structure
    if (!config || typeof config !== 'object') {
      validationErrors.push({
        type: 'validation',
        message: 'Configuration must be a valid object',
        severity: 'critical'
      });
    }

    // Validate required fields based on Claude Code schema
    await this.validateConfigurationSchema(config, validationErrors, validationWarnings);

    // Check for deprecated configurations
    await this.checkDeprecatedConfigurations(config, validationWarnings);

    // Validate security implications
    await this.validateSecurityConfiguration(config, validationErrors, validationWarnings);

    return {
      isValid: validationErrors.length === 0,
      errors: validationErrors,
      warnings: validationWarnings,
      performance: {
        validationTime: Date.now() - startTime,
        rulesValidated: this.countRules(config),
        customRulesValidated: 0
      }
    };
  }

  /**
   * Validate template extension
   */
  public async validateExtension(
    extension: TemplateExtension,
    context: TemplateBuildContext
  ): Promise<boolean> {
    try {
      // Validate extension structure
      if (!extension.id || !extension.name) {
        return false;
      }

      // Validate target template exists
      const targetExists = context.availableTemplates.some(t => t.id === extension.targetTemplateId);
      if (!targetExists) {
        return false;
      }

      // Validate conditions if present
      if (extension.conditions) {
        for (const condition of extension.conditions) {
          if (!this.validateCondition(condition)) {
            return false;
          }
        }
      }

      // Validate rules structure
      if (extension.rules) {
        const configValidation = await this.validateConfiguration(extension.rules);
        if (!configValidation.isValid) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear validation cache
   */
  public clearCache(): void {
    this.validationCache.clear();
  }

  /**
   * Get validation statistics
   */
  public getStats(): ValidationStats {
    return {
      customValidators: this.customValidators.size,
      cacheSize: this.validationCache.size,
      registeredRules: Array.from(this.customValidators.values()).map(rule => ({
        id: rule.id,
        name: rule.name,
        category: rule.category,
        severity: rule.severity
      }))
    };
  }

  /**
   * Validate basic template structure
   */
  private async validateTemplateStructure(
    template: ExtendableTemplate,
    errors: TemplateValidationError[],
    warnings: TemplateValidationWarning[]
  ): Promise<void> {
    // Required fields
    if (!template.id) {
      errors.push({
        type: 'validation',
        message: 'Template ID is required',
        severity: 'critical',
        location: { templateId: template.id }
      });
    }

    if (!template.name) {
      errors.push({
        type: 'validation',
        message: 'Template name is required',
        severity: 'critical',
        location: { templateId: template.id }
      });
    }

    if (!template.version) {
      errors.push({
        type: 'validation',
        message: 'Template version is required',
        severity: 'critical',
        location: { templateId: template.id }
      });
    }

    // Version format validation
    if (template.version && !this.isValidVersion(template.version)) {
      errors.push({
        type: 'validation',
        message: 'Template version must follow semantic versioning (e.g., 1.0.0)',
        severity: 'error',
        location: { templateId: template.id }
      });
    }

    // Inheritance validation
    if (!template.inheritance) {
      errors.push({
        type: 'inheritance',
        message: 'Template must have inheritance metadata',
        severity: 'critical',
        location: { templateId: template.id }
      });
    }

    // Template size warning
    const templateSize = JSON.stringify(template).length;
    if (templateSize > 1024 * 1024) { // 1MB
      warnings.push({
        type: 'performance',
        message: 'Template size is very large and may impact performance',
        location: { templateId: template.id },
        suggestions: ['Consider splitting into smaller templates', 'Use template composition']
      });
    }
  }

  /**
   * Validate template inheritance
   */
  private async validateInheritance(
    template: ExtendableTemplate,
    context: TemplateBuildContext,
    errors: TemplateValidationError[],
    warnings: TemplateValidationWarning[]
  ): Promise<void> {
    const inheritance = template.inheritance;

    // Validate parent exists if specified
    if (inheritance.parentId) {
      const parentExists = context.availableTemplates.some(t => t.id === inheritance.parentId);
      if (!parentExists) {
        errors.push({
          type: 'inheritance',
          message: `Parent template not found: ${inheritance.parentId}`,
          severity: 'critical',
          location: { templateId: template.id }
        });
      }
    }

    // Validate inheritance chain
    if (inheritance.chain.length > 10) {
      warnings.push({
        type: 'performance',
        message: 'Inheritance chain is very deep and may impact performance',
        location: { templateId: template.id },
        suggestions: ['Consider flattening the inheritance hierarchy']
      });
    }

    // Check for circular references in chain
    const uniqueChain = new Set(inheritance.chain);
    if (uniqueChain.size !== inheritance.chain.length) {
      errors.push({
        type: 'inheritance',
        message: 'Circular reference detected in inheritance chain',
        severity: 'critical',
        location: { templateId: template.id }
      });
    }
  }

  /**
   * Validate configuration schema
   */
  private async validateConfigurationSchema(
    config: ClaudeCodeConfiguration,
    errors: TemplateValidationError[],
    warnings: TemplateValidationWarning[]
  ): Promise<void> {
    // This is a simplified validation - in production you'd use JSON Schema or similar
    
    // Check for common Claude Code configuration patterns
    if (config.deny && !Array.isArray(config.deny)) {
      errors.push({
        type: 'validation',
        message: 'deny configuration must be an array',
        severity: 'error'
      });
    }

    if (config.allow && !Array.isArray(config.allow)) {
      errors.push({
        type: 'validation',
        message: 'allow configuration must be an array',
        severity: 'error'
      });
    }

    // Validate rule structures
    this.validateRuleStructures(config, errors, warnings);
  }

  /**
   * Validate rule structures
   */
  private validateRuleStructures(
    config: ClaudeCodeConfiguration,
    errors: TemplateValidationError[],
    warnings: TemplateValidationWarning[]
  ): void {
    // Validate deny rules
    if (config.permissions?.deny) {
      config.permissions.deny.forEach((rule, index) => {
        if (typeof rule === 'string' && rule.length === 0) {
          errors.push({
            type: 'validation',
            message: `Empty deny rule at index ${index}`,
            severity: 'error',
            location: { templateId: 'validation', path: `deny[${index}]` }
          });
        }
      });
    }

    // Validate allow rules
    if (config.permissions?.allow) {
      config.permissions.allow.forEach((rule, index) => {
        if (typeof rule === 'string' && rule.length === 0) {
          errors.push({
            type: 'validation',
            message: `Empty allow rule at index ${index}`,
            severity: 'error',
            location: { templateId: 'validation', path: `allow[${index}]` }
          });
        }
      });
    }
  }

  /**
   * Check for deprecated configurations
   */
  private async checkDeprecatedConfigurations(
    config: ClaudeCodeConfiguration,
    warnings: TemplateValidationWarning[]
  ): Promise<void> {
    // Check for deprecated patterns (example)
    if ((config as any).deprecated_field) {
      warnings.push({
        type: 'deprecated',
        message: 'deprecated_field is no longer supported',
        suggestions: ['Use new_field instead']
      });
    }
  }

  /**
   * Validate security configuration
   */
  private async validateSecurityConfiguration(
    config: ClaudeCodeConfiguration,
    errors: TemplateValidationError[],
    warnings: TemplateValidationWarning[]
  ): Promise<void> {
    // Check for overly permissive configurations
    if (config.permissions?.allow && config.permissions.allow.includes('*')) {
      warnings.push({
        type: 'best_practice',
        message: 'Wildcard allow rules may be too permissive',
        suggestions: ['Be more specific with allow rules']
      });
    }

    // Check for conflicting allow/deny rules
    if (config.permissions?.allow && config.permissions?.deny) {
      for (const allowRule of config.permissions.allow) {
        if (typeof allowRule === 'string' && config.permissions.deny.includes(allowRule)) {
          warnings.push({
            type: 'best_practice',
            message: `Rule "${allowRule}" appears in both allow and deny lists`,
            suggestions: ['Remove conflicting rules']
          });
        }
      }
    }
  }

  /**
   * Validate template extensions
   */
  private async validateExtensions(
    template: ExtendableTemplate,
    context: TemplateBuildContext,
    errors: TemplateValidationError[],
    warnings: TemplateValidationWarning[]
  ): Promise<void> {
    if (!template.extensions) return;

    for (const extension of template.extensions) {
      const isValid = await this.validateExtension(extension, context);
      if (!isValid) {
        errors.push({
          type: 'validation',
          message: `Invalid extension: ${extension.id}`,
          severity: 'error',
          location: { templateId: template.id }
        });
      }
    }
  }

  /**
   * Run custom validation rules
   */
  private async runCustomValidations(
    template: ExtendableTemplate,
    context: TemplateBuildContext,
    errors: TemplateValidationError[],
    warnings: TemplateValidationWarning[]
  ): Promise<void> {
    if (!template.customValidation) return;

    for (const customRule of template.customValidation) {
      try {
        const validator = this.customValidators.get(customRule.id);
        if (!validator) {
          warnings.push({
            type: 'best_practice',
            message: `Custom validation rule not found: ${customRule.id}`,
            location: { templateId: template.id }
          });
          continue;
        }

        // Execute custom validation in sandbox
        const result = await this.executeCustomValidation(validator, template, context);
        if (!result.isValid) {
          if (validator.severity === 'error' || validator.severity === 'critical') {
            errors.push({
              type: 'validation',
              message: result.message || `Custom validation failed: ${validator.name}`,
              severity: validator.severity,
              location: { templateId: template.id }
            });
          } else {
            warnings.push({
              type: 'best_practice',
              message: result.message || `Custom validation warning: ${validator.name}`,
              location: { templateId: template.id }
            });
          }
        }
      } catch (error) {
        errors.push({
          type: 'validation',
          message: `Custom validation error: ${(error as Error).message}`,
          severity: 'error',
          location: { templateId: template.id }
        });
      }
    }
  }

  /**
   * Validate permissions and scope
   */
  private async validatePermissions(
    template: ExtendableTemplate,
    context: TemplateBuildContext,
    errors: TemplateValidationError[],
    warnings: TemplateValidationWarning[]
  ): Promise<void> {
    // Check user permissions
    if (context.user) {
      // Validate organization scope
      if (template.scope.organizationId && 
          template.scope.organizationId !== context.user.organizationId) {
        errors.push({
          type: 'permission',
          message: 'User does not have access to this organization template',
          severity: 'critical',
          location: { templateId: template.id }
        });
      }

      // Check specific permissions
      if (template.inheritance.permissions.canOverrideRules && 
          !context.user.permissions.includes('template:override')) {
        warnings.push({
          type: 'best_practice',
          message: 'Template allows rule overrides but user lacks permission',
          location: { templateId: template.id }
        });
      }
    }
  }

  /**
   * Execute custom validation in sandbox
   */
  private async executeCustomValidation(
    validator: CustomValidationRule,
    template: ExtendableTemplate,
    context: TemplateBuildContext
  ): Promise<{ isValid: boolean; message?: string }> {
    const sandbox = createSandbox({
      timeout: 5000,
      allowedModules: ['util'],
      restrictedModules: ['fs', 'child_process', 'net']
    });

    try {
      // Prepare validation context
      const validationContext = {
        template: {
          id: template.id,
          name: template.name,
          rules: template.rules,
          parameters: template.parameters
        },
        parameters: validator.parameters || {},
        utils: {
          deepEqual: this.deepEqual.bind(this),
          hasProperty: this.hasProperty.bind(this)
        }
      };

      // Execute validation function
      const result = await sandbox.execute(validator.validator, validationContext);
      
      if (typeof result === 'boolean') {
        return { isValid: result };
      }
      
      if (result.success && typeof result.result === 'boolean') {
        return { isValid: result.result };
      }
      
      if (result.success && result.result && typeof result.result === 'object') {
        const resultObj = result.result as any;
        return { isValid: resultObj.isValid || false, message: resultObj.message };
      }
      
      return { isValid: false, message: result.error || 'Validation failed' };
        
    } finally {
      sandbox.cleanup();
    }
  }

  /**
   * Validate condition structure
   */
  private validateCondition(condition: any): boolean {
    return condition &&
           typeof condition.type === 'string' &&
           typeof condition.expression === 'string' &&
           typeof condition.operator === 'string';
  }

  /**
   * Check if version is valid semantic version
   */
  private isValidVersion(version: string): boolean {
    const semverRegex = /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
    return semverRegex.test(version);
  }

  /**
   * Count rules in configuration
   */
  private countRules(config: ClaudeCodeConfiguration): number {
    let count = 0;
    if (config.permissions?.deny) count += config.permissions.deny.length;
    if (config.permissions?.allow) count += config.permissions.allow.length;
    return count;
  }

  /**
   * Generate cache key for validation result
   */
  private getCacheKey(template: ExtendableTemplate, context: TemplateBuildContext): string {
    const templateHash = this.hashObject(template);
    const contextHash = this.hashObject({
      environment: context.environment,
      parameters: context.parameters,
      user: context.user?.id
    });
    return `${templateHash}:${contextHash}`;
  }

  /**
   * Hash object for caching
   */
  private hashObject(obj: unknown): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64').slice(0, 16);
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    
    if (a === null || b === null || a === undefined || b === undefined) {
      return a === b;
    }
    
    if (typeof a !== typeof b) return false;
    
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqual(item, b[index]));
    }
    
    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a as object);
      const keysB = Object.keys(b as object);
      
      if (keysA.length !== keysB.length) return false;
      
      return keysA.every(key => 
        keysB.includes(key) && 
        this.deepEqual((a as any)[key], (b as any)[key])
      );
    }
    
    return false;
  }

  /**
   * Check if object has property
   */
  private hasProperty(obj: unknown, property: string): boolean {
    return obj !== null && 
           obj !== undefined && 
           typeof obj === 'object' && 
           property in (obj as object);
  }
}

/**
 * Validation statistics
 */
export interface ValidationStats {
  customValidators: number;
  cacheSize: number;
  registeredRules: Array<{
    id: string;
    name: string;
    category: string;
    severity: string;
  }>;
}