/**
 * Template Validator for Claude Code Security Rulesets
 * Validates templates before application to ensure security and correctness
 * Performs structural, semantic, and security validation
 */

import {
  SecurityTemplate,
  TemplateParameter,
  ClaudeCodeConfiguration,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  TemplateCategory,
  ComplianceFramework
} from '../types';
import { validationEngine } from '../validation/engine';

/**
 * Template validation options
 */
export interface TemplateValidationOptions {
  /** Validate template configuration rules */
  validateRules?: boolean;
  /** Validate template parameters */
  validateParameters?: boolean;
  /** Validate template metadata */
  validateMetadata?: boolean;
  /** Check compliance framework requirements */
  validateCompliance?: boolean;
  /** Validate template structure */
  validateStructure?: boolean;
  /** Check for security issues */
  validateSecurity?: boolean;
  /** Skip expensive validations */
  quick?: boolean;
  /** Custom validation rules */
  customValidators?: TemplateValidator[];
}

/**
 * Template validation result
 */
export interface TemplateValidationResult extends ValidationResult {
  /** Template that was validated */
  templateId: string;
  /** Template validation specific warnings */
  templateWarnings: TemplateValidationWarning[];
  /** Validation coverage report */
  coverage: ValidationCoverage;
}

/**
 * Template-specific validation warning
 */
export interface TemplateValidationWarning {
  /** Warning category */
  category: 'structure' | 'parameters' | 'rules' | 'metadata' | 'compliance' | 'security';
  /** Warning message */
  message: string;
  /** Affected field or section */
  field?: string;
  /** Suggested fix */
  suggestion?: string;
  /** Warning severity */
  severity: 'low' | 'medium' | 'high';
}

/**
 * Validation coverage report
 */
export interface ValidationCoverage {
  /** Checks performed */
  checksPerformed: string[];
  /** Checks skipped */
  checksSkipped: string[];
  /** Coverage percentage */
  coveragePercent: number;
  /** Validation completeness */
  complete: boolean;
}

/**
 * Custom template validator function
 */
export type TemplateValidatorFunction = (template: SecurityTemplate) => Promise<{
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}>;

/**
 * Template validation context
 */
interface ValidationContext {
  template: SecurityTemplate;
  options: TemplateValidationOptions;
  errors: ValidationError[];
  warnings: TemplateValidationWarning[];
  checksPerformed: string[];
}

/**
 * Template validator class
 */
export class TemplateValidator {
  private defaultOptions: TemplateValidationOptions = {
    validateRules: true,
    validateParameters: true,
    validateMetadata: true,
    validateCompliance: true,
    validateStructure: true,
    validateSecurity: true,
    quick: false
  };

  /**
   * Validate a security template
   */
  public async validate(
    template: SecurityTemplate,
    options: Partial<TemplateValidationOptions> = {}
  ): Promise<TemplateValidationResult> {
    const validationOptions = { ...this.defaultOptions, ...options };
    
    const context: ValidationContext = {
      template,
      options: validationOptions,
      errors: [],
      warnings: [],
      checksPerformed: []
    };

    // Perform validation checks
    if (validationOptions.validateStructure) {
      await this.validateStructure(context);
    }

    if (validationOptions.validateMetadata) {
      await this.validateMetadata(context);
    }

    if (validationOptions.validateParameters) {
      await this.validateParameters(context);
    }

    if (validationOptions.validateRules) {
      await this.validateRules(context);
    }

    if (validationOptions.validateCompliance) {
      await this.validateCompliance(context);
    }

    if (validationOptions.validateSecurity) {
      await this.validateSecurity(context);
    }

    // Run custom validators
    if (validationOptions.customValidators) {
      await this.runCustomValidators(context, validationOptions.customValidators);
    }

    // Calculate coverage
    const coverage = this.calculateCoverage(context);

    return {
      isValid: context.errors.length === 0,
      errors: context.errors,
      warnings: context.warnings.map(tw => ({
        type: 'BEST_PRACTICE_VIOLATION',
        message: tw.message,
        context: { category: tw.category, field: tw.field }
      })),
      conflicts: [], // Template validation doesn't check rule conflicts
      performance: {
        validationTime: 0, // Would be measured in real implementation
        rulesProcessed: this.countTemplateRules(template),
        performanceTarget: { target: 100, achieved: true }
      },
      suggestions: context.warnings.map(tw => ({
        type: 'warning',
        message: tw.suggestion || tw.message
      })),
      templateId: template.id,
      templateWarnings: context.warnings,
      coverage
    };
  }

  /**
   * Validate template structure
   */
  private async validateStructure(context: ValidationContext): Promise<void> {
    context.checksPerformed.push('structure');
    const { template } = context;

    // Required fields
    const requiredFields = ['id', 'name', 'category', 'rules', 'description', 'version'];
    for (const field of requiredFields) {
      if (!(field in template) || template[field as keyof SecurityTemplate] === null || template[field as keyof SecurityTemplate] === undefined) {
        context.errors.push({
          type: 'MISSING_REQUIRED_FIELD',
          message: `Template missing required field: ${field}`,
          severity: 'critical',
          location: { path: field }
        });
      }
    }

    // ID validation
    if (template.id) {
      if (typeof template.id !== 'string' || template.id.length === 0) {
        context.errors.push({
          type: 'INVALID_SYNTAX',
          message: 'Template ID must be a non-empty string',
          severity: 'high',
          location: { path: 'id' }
        });
      } else if (!/^[a-z0-9_-]+$/.test(template.id)) {
        context.warnings.push({
          category: 'structure',
          message: 'Template ID should only contain lowercase letters, numbers, underscores, and hyphens',
          field: 'id',
          severity: 'medium'
        });
      }
    }

    // Name validation
    if (template.name) {
      if (typeof template.name !== 'string' || template.name.length === 0) {
        context.errors.push({
          type: 'INVALID_SYNTAX',
          message: 'Template name must be a non-empty string',
          severity: 'high',
          location: { path: 'name' }
        });
      } else if (template.name.length > 100) {
        context.warnings.push({
          category: 'structure',
          message: 'Template name should be under 100 characters',
          field: 'name',
          severity: 'low'
        });
      }
    }

    // Category validation
    if (template.category) {
      const validCategories: TemplateCategory[] = ['development', 'production', 'compliance', 'custom'];
      if (!validCategories.includes(template.category)) {
        context.errors.push({
          type: 'INVALID_SYNTAX',
          message: `Invalid template category: ${template.category}`,
          severity: 'high',
          location: { path: 'category' }
        });
      }
    }

    // Version validation
    if (template.version) {
      if (typeof template.version !== 'string') {
        context.errors.push({
          type: 'INVALID_SYNTAX',
          message: 'Template version must be a string',
          severity: 'high',
          location: { path: 'version' }
        });
      } else if (!/^\d+\.\d+\.\d+/.test(template.version)) {
        context.warnings.push({
          category: 'structure',
          message: 'Template version should follow semantic versioning (x.y.z)',
          field: 'version',
          severity: 'medium'
        });
      }
    }

    // Tags validation
    if (template.tags) {
      if (!Array.isArray(template.tags)) {
        context.errors.push({
          type: 'INVALID_SYNTAX',
          message: 'Template tags must be an array',
          severity: 'medium',
          location: { path: 'tags' }
        });
      } else {
        for (const tag of template.tags) {
          if (typeof tag !== 'string') {
            context.errors.push({
              type: 'INVALID_SYNTAX',
              message: 'All template tags must be strings',
              severity: 'medium',
              location: { path: 'tags' }
            });
            break;
          }
        }
      }
    }

    // Compliance validation
    if (template.compliance) {
      if (!Array.isArray(template.compliance)) {
        context.errors.push({
          type: 'INVALID_SYNTAX',
          message: 'Template compliance must be an array',
          severity: 'medium',
          location: { path: 'compliance' }
        });
      } else {
        const validCompliance: ComplianceFramework[] = ['SOC2', 'GDPR', 'HIPAA', 'PCI-DSS', 'ISO27001'];
        for (const comp of template.compliance) {
          if (!validCompliance.includes(comp)) {
            context.warnings.push({
              category: 'structure',
              message: `Unknown compliance framework: ${comp}`,
              field: 'compliance',
              severity: 'low'
            });
          }
        }
      }
    }
  }

  /**
   * Validate template metadata
   */
  private async validateMetadata(context: ValidationContext): Promise<void> {
    context.checksPerformed.push('metadata');
    const { template } = context;

    // Date validation
    if (template.createdAt && !(template.createdAt instanceof Date)) {
      context.errors.push({
        type: 'INVALID_SYNTAX',
        message: 'Template createdAt must be a Date object',
        severity: 'medium',
        location: { path: 'createdAt' }
      });
    }

    if (template.updatedAt && !(template.updatedAt instanceof Date)) {
      context.errors.push({
        type: 'INVALID_SYNTAX',
        message: 'Template updatedAt must be a Date object',
        severity: 'medium',
        location: { path: 'updatedAt' }
      });
    }

    // Check if updatedAt is after createdAt
    if (template.createdAt && template.updatedAt && 
        template.updatedAt < template.createdAt) {
      context.errors.push({
        type: 'INVALID_SYNTAX',
        message: 'Template updatedAt cannot be before createdAt',
        severity: 'medium',
        location: { path: 'updatedAt' }
      });
    }

    // Check if template is too old (over 1 year without updates)
    if (template.updatedAt) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      if (template.updatedAt < oneYearAgo) {
        context.warnings.push({
          category: 'metadata',
          message: 'Template hasn\'t been updated in over a year',
          field: 'updatedAt',
          suggestion: 'Consider reviewing and updating the template',
          severity: 'medium'
        });
      }
    }

    // Description length check
    if (template.description && template.description.length < 20) {
      context.warnings.push({
        category: 'metadata',
        message: 'Template description should be more detailed (at least 20 characters)',
        field: 'description',
        severity: 'low'
      });
    }

    if (template.description && template.description.length > 500) {
      context.warnings.push({
        category: 'metadata',
        message: 'Template description is very long (over 500 characters)',
        field: 'description',
        severity: 'low'
      });
    }
  }

  /**
   * Validate template parameters
   */
  private async validateParameters(context: ValidationContext): Promise<void> {
    context.checksPerformed.push('parameters');
    const { template } = context;

    if (!template.parameters || template.parameters.length === 0) {
      return;
    }

    if (!Array.isArray(template.parameters)) {
      context.errors.push({
        type: 'INVALID_SYNTAX',
        message: 'Template parameters must be an array',
        severity: 'high',
        location: { path: 'parameters' }
      });
      return;
    }

    const paramNames = new Set<string>();

    for (let i = 0; i < template.parameters.length; i++) {
      const param = template.parameters[i];
      const paramPath = `parameters[${i}]`;

      // Required fields
      const requiredParamFields = ['name', 'type', 'description', 'required'];
      for (const field of requiredParamFields) {
        if (!(field in param)) {
          context.errors.push({
            type: 'MISSING_REQUIRED_FIELD',
            message: `Parameter missing required field: ${field}`,
            severity: 'high',
            location: { path: `${paramPath}.${field}` }
          });
        }
      }

      // Name validation
      if (param.name) {
        if (typeof param.name !== 'string' || param.name.length === 0) {
          context.errors.push({
            type: 'INVALID_SYNTAX',
            message: 'Parameter name must be a non-empty string',
            severity: 'high',
            location: { path: `${paramPath}.name` }
          });
        } else {
          if (paramNames.has(param.name)) {
            context.errors.push({
              type: 'INVALID_SYNTAX',
              message: `Duplicate parameter name: ${param.name}`,
              severity: 'high',
              location: { path: `${paramPath}.name` }
            });
          }
          paramNames.add(param.name);

          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(param.name)) {
            context.errors.push({
              type: 'INVALID_SYNTAX',
              message: 'Parameter name must be a valid identifier',
              severity: 'high',
              location: { path: `${paramPath}.name` }
            });
          }
        }
      }

      // Type validation
      if (param.type) {
        const validTypes = ['string', 'number', 'boolean', 'array', 'object'];
        if (!validTypes.includes(param.type)) {
          context.errors.push({
            type: 'INVALID_SYNTAX',
            message: `Invalid parameter type: ${param.type}`,
            severity: 'high',
            location: { path: `${paramPath}.type` }
          });
        }
      }

      // Default value validation
      if (param.defaultValue !== undefined && param.type) {
        const defaultType = Array.isArray(param.defaultValue) ? 'array' : 
                           param.defaultValue === null ? 'object' : 
                           typeof param.defaultValue;
        
        if (param.type !== defaultType && !(param.type === 'object' && defaultType === 'object')) {
          context.errors.push({
            type: 'INVALID_SYNTAX',
            message: `Parameter default value type (${defaultType}) doesn't match parameter type (${param.type})`,
            severity: 'high',
            location: { path: `${paramPath}.defaultValue` }
          });
        }
      }

      // Validation rules
      if (param.validation) {
        await this.validateParameterValidation(param, paramPath, context);
      }

      // Required parameter without default
      if (param.required && param.defaultValue === undefined) {
        context.warnings.push({
          category: 'parameters',
          message: `Required parameter ${param.name} has no default value`,
          field: `${paramPath}.defaultValue`,
          suggestion: 'Consider providing a default value or making the parameter optional',
          severity: 'medium'
        });
      }

      // Description validation
      if (param.description && param.description.length < 10) {
        context.warnings.push({
          category: 'parameters',
          message: `Parameter ${param.name} description is too brief`,
          field: `${paramPath}.description`,
          suggestion: 'Provide a more detailed description',
          severity: 'low'
        });
      }
    }
  }

  /**
   * Validate parameter validation rules
   */
  private async validateParameterValidation(
    param: TemplateParameter,
    paramPath: string,
    context: ValidationContext
  ): Promise<void> {
    const validation = param.validation!;

    // Min/max validation
    if (validation.min !== undefined && validation.max !== undefined) {
      if (validation.min > validation.max) {
        context.errors.push({
          type: 'INVALID_SYNTAX',
          message: `Parameter ${param.name} min value is greater than max value`,
          severity: 'high',
          location: { path: `${paramPath}.validation` }
        });
      }
    }

    // MinLength/maxLength validation
    if (validation.minLength !== undefined && validation.maxLength !== undefined) {
      if (validation.minLength > validation.maxLength) {
        context.errors.push({
          type: 'INVALID_SYNTAX',
          message: `Parameter ${param.name} minLength is greater than maxLength`,
          severity: 'high',
          location: { path: `${paramPath}.validation` }
        });
      }
    }

    // Pattern validation
    if (validation.pattern) {
      try {
        new RegExp(validation.pattern);
      } catch (e) {
        context.errors.push({
          type: 'INVALID_SYNTAX',
          message: `Parameter ${param.name} has invalid regex pattern`,
          severity: 'high',
          location: { path: `${paramPath}.validation.pattern` }
        });
      }
    }

    // Enum validation
    if (validation.enum && validation.enum.length === 0) {
      context.errors.push({
        type: 'INVALID_SYNTAX',
        message: `Parameter ${param.name} enum cannot be empty`,
        severity: 'high',
        location: { path: `${paramPath}.validation.enum` }
      });
    }

    // Type-specific validation checks
    if (param.type === 'string') {
      if (validation.min !== undefined || validation.max !== undefined) {
        context.warnings.push({
          category: 'parameters',
          message: `String parameter ${param.name} should use minLength/maxLength instead of min/max`,
          field: `${paramPath}.validation`,
          severity: 'low'
        });
      }
    }

    if (param.type === 'number') {
      if (validation.minLength !== undefined || validation.maxLength !== undefined) {
        context.warnings.push({
          category: 'parameters',
          message: `Number parameter ${param.name} should use min/max instead of minLength/maxLength`,
          field: `${paramPath}.validation`,
          severity: 'low'
        });
      }
    }
  }

  /**
   * Validate template rules using the main validation engine
   */
  private async validateRules(context: ValidationContext): Promise<void> {
    context.checksPerformed.push('rules');
    const { template } = context;

    if (!template.rules) {
      context.errors.push({
        type: 'MISSING_REQUIRED_FIELD',
        message: 'Template must contain rules configuration',
        severity: 'critical',
        location: { path: 'rules' }
      });
      return;
    }

    try {
      // Use the main validation engine to validate the template's rules
      const validationResult = await validationEngine.validate(template.rules);
      
      // Add validation errors and warnings to the template validation
      context.errors.push(...validationResult.errors.map(error => ({
        ...error,
        location: { ...error.location, path: `rules.${error.location?.path || ''}` }
      })));

      // Convert validation warnings to template warnings
      for (const warning of validationResult.warnings) {
        context.warnings.push({
          category: 'rules',
          message: warning.message,
          field: `rules.${warning.location?.path || ''}`,
          severity: 'medium'
        });
      }

      // Check for rule conflicts in template
      if (validationResult.conflicts.length > 0) {
        for (const conflict of validationResult.conflicts) {
          context.errors.push({
            type: 'RULE_CONFLICT',
            message: `Template rule conflict: ${conflict.message}`,
            severity: 'high',
            location: { path: 'rules' }
          });
        }
      }

    } catch (error) {
      context.errors.push({
        type: 'INVALID_SYNTAX',
        message: `Failed to validate template rules: ${error}`,
        severity: 'critical',
        location: { path: 'rules' }
      });
    }

    // Additional template-specific rule checks
    this.validateTemplateSpecificRules(context);
  }

  /**
   * Validate template-specific rule requirements
   */
  private validateTemplateSpecificRules(context: ValidationContext): void {
    const { template } = context;
    const permissions = template.rules.permissions;

    if (!permissions) {
      context.errors.push({
        type: 'MISSING_REQUIRED_FIELD',
        message: 'Template rules must contain permissions',
        severity: 'critical',
        location: { path: 'rules.permissions' }
      });
      return;
    }

    // Category-specific rule requirements
    switch (template.category) {
      case 'production':
        this.validateProductionRules(context);
        break;
      case 'compliance':
        this.validateComplianceRules(context);
        break;
      case 'development':
        this.validateDevelopmentRules(context);
        break;
    }

    // General rule quality checks
    const totalRules = this.countTemplateRules(template);
    if (totalRules === 0) {
      context.errors.push({
        type: 'INVALID_SYNTAX',
        message: 'Template must contain at least one rule',
        severity: 'high',
        location: { path: 'rules.permissions' }
      });
    }

    if (totalRules > 1000) {
      context.warnings.push({
        category: 'rules',
        message: 'Template contains a very large number of rules (over 1000)',
        field: 'rules',
        suggestion: 'Consider splitting into multiple templates',
        severity: 'medium'
      });
    }
  }

  /**
   * Validate production template rules
   */
  private validateProductionRules(context: ValidationContext): void {
    const permissions = context.template.rules.permissions!;

    if (!permissions.deny || permissions.deny.length === 0) {
      context.errors.push({
        type: 'SECURITY_VIOLATION',
        message: 'Production templates must contain deny rules',
        severity: 'high',
        location: { path: 'rules.permissions.deny' }
      });
    }

    // Check for dangerous patterns in allow rules
    if (permissions.allow) {
      const dangerousPatterns = ['exec', 'shell', 'eval', 'sudo', 'rm -rf'];
      for (const pattern of dangerousPatterns) {
        if (permissions.allow.some(rule => rule.includes(pattern))) {
          context.errors.push({
            type: 'SECURITY_VIOLATION',
            message: `Production template contains dangerous allow pattern: ${pattern}`,
            severity: 'critical',
            location: { path: 'rules.permissions.allow' }
          });
        }
      }
    }
  }

  /**
   * Validate compliance template rules
   */
  private validateComplianceRules(context: ValidationContext): void {
    const permissions = context.template.rules.permissions!;

    if (!permissions.deny || permissions.deny.length === 0) {
      context.errors.push({
        type: 'SECURITY_VIOLATION',
        message: 'Compliance templates must contain comprehensive deny rules',
        severity: 'critical',
        location: { path: 'rules.permissions.deny' }
      });
    }

    // Compliance templates should have extensive deny rules
    if (permissions.deny && permissions.deny.length < 5) {
      context.warnings.push({
        category: 'rules',
        message: 'Compliance templates should have comprehensive security rules',
        field: 'rules.permissions.deny',
        suggestion: 'Add more deny rules to meet compliance requirements',
        severity: 'high'
      });
    }

    // Check for audit-related rules
    const hasAuditRules = permissions.deny?.some(rule => 
      rule.includes('audit') || rule.includes('log')
    ) || permissions.ask?.some(rule => 
      rule.includes('audit') || rule.includes('log')
    );

    if (!hasAuditRules) {
      context.warnings.push({
        category: 'compliance',
        message: 'Compliance templates should include audit/logging rules',
        field: 'rules.permissions',
        suggestion: 'Add rules for audit log access and modification',
        severity: 'medium'
      });
    }
  }

  /**
   * Validate development template rules
   */
  private validateDevelopmentRules(context: ValidationContext): void {
    const permissions = context.template.rules.permissions!;

    // Development templates should still have basic security
    if (!permissions.deny || permissions.deny.length === 0) {
      context.warnings.push({
        category: 'security',
        message: 'Development templates should include basic security deny rules',
        field: 'rules.permissions.deny',
        suggestion: 'Add deny rules for dangerous operations like rm -rf, format',
        severity: 'medium'
      });
    }

    // Development templates should be more permissive
    if (!permissions.allow || permissions.allow.length === 0) {
      context.warnings.push({
        category: 'rules',
        message: 'Development templates should include allow rules for common development tasks',
        field: 'rules.permissions.allow',
        suggestion: 'Add allow rules for common development operations',
        severity: 'low'
      });
    }
  }

  /**
   * Validate compliance framework requirements
   */
  private async validateCompliance(context: ValidationContext): Promise<void> {
    context.checksPerformed.push('compliance');
    const { template } = context;

    if (!template.compliance || template.compliance.length === 0) {
      if (template.category === 'compliance') {
        context.errors.push({
          type: 'MISSING_REQUIRED_FIELD',
          message: 'Compliance templates must specify compliance frameworks',
          severity: 'high',
          location: { path: 'compliance' }
        });
      }
      return;
    }

    for (const framework of template.compliance) {
      switch (framework) {
        case 'SOC2':
          this.validateSOC2Requirements(context);
          break;
        case 'HIPAA':
          this.validateHIPAARequirements(context);
          break;
        case 'PCI-DSS':
          this.validatePCIDSSRequirements(context);
          break;
        case 'GDPR':
          this.validateGDPRRequirements(context);
          break;
        case 'ISO27001':
          this.validateISO27001Requirements(context);
          break;
      }
    }
  }

  /**
   * Validate SOC 2 compliance requirements
   */
  private validateSOC2Requirements(context: ValidationContext): void {
    const permissions = context.template.rules.permissions;
    
    if (!permissions?.deny?.some(rule => rule.includes('audit'))) {
      context.warnings.push({
        category: 'compliance',
        message: 'SOC 2 compliance requires audit trail protection',
        field: 'rules.permissions.deny',
        suggestion: 'Add deny rules for audit log modification',
        severity: 'high'
      });
    }
  }

  /**
   * Validate HIPAA compliance requirements
   */
  private validateHIPAARequirements(context: ValidationContext): void {
    const permissions = context.template.rules.permissions;
    
    if (!permissions?.deny?.some(rule => rule.toLowerCase().includes('phi'))) {
      context.warnings.push({
        category: 'compliance',
        message: 'HIPAA compliance requires PHI data protection rules',
        field: 'rules.permissions.deny',
        suggestion: 'Add deny rules for PHI data access and export',
        severity: 'high'
      });
    }
  }

  /**
   * Validate PCI DSS compliance requirements
   */
  private validatePCIDSSRequirements(context: ValidationContext): void {
    const permissions = context.template.rules.permissions;
    
    if (!permissions?.deny?.some(rule => rule.toLowerCase().includes('card'))) {
      context.warnings.push({
        category: 'compliance',
        message: 'PCI DSS compliance requires cardholder data protection rules',
        field: 'rules.permissions.deny',
        suggestion: 'Add deny rules for cardholder data access',
        severity: 'high'
      });
    }
  }

  /**
   * Validate GDPR compliance requirements
   */
  private validateGDPRRequirements(context: ValidationContext): void {
    const permissions = context.template.rules.permissions;
    
    if (!permissions?.deny?.some(rule => rule.toLowerCase().includes('personal'))) {
      context.warnings.push({
        category: 'compliance',
        message: 'GDPR compliance requires personal data protection rules',
        field: 'rules.permissions.deny',
        suggestion: 'Add deny rules for personal data processing',
        severity: 'high'
      });
    }
  }

  /**
   * Validate ISO 27001 compliance requirements
   */
  private validateISO27001Requirements(context: ValidationContext): void {
    const permissions = context.template.rules.permissions;
    
    if (!permissions?.deny || permissions.deny.length < 10) {
      context.warnings.push({
        category: 'compliance',
        message: 'ISO 27001 compliance requires comprehensive security controls',
        field: 'rules.permissions.deny',
        suggestion: 'Add comprehensive security deny rules',
        severity: 'medium'
      });
    }
  }

  /**
   * Validate security aspects of template
   */
  private async validateSecurity(context: ValidationContext): Promise<void> {
    context.checksPerformed.push('security');
    const { template } = context;

    // Check for security anti-patterns
    this.checkSecurityAntiPatterns(context);
    
    // Check for missing security rules
    this.checkMissingSecurityRules(context);
    
    // Check for overly permissive rules
    this.checkOverlyPermissiveRules(context);
    
    // Validate template parameters don't introduce security risks
    this.validateParameterSecurity(context);
  }

  /**
   * Check for security anti-patterns
   */
  private checkSecurityAntiPatterns(context: ValidationContext): void {
    const permissions = context.template.rules.permissions;
    
    if (!permissions) return;

    // Check for overly broad allow rules
    if (permissions.allow) {
      const broadPatterns = ['*', '**', '.*', '**/*'];
      for (const pattern of broadPatterns) {
        if (permissions.allow.includes(pattern)) {
          context.errors.push({
            type: 'SECURITY_VIOLATION',
            message: `Overly broad allow pattern detected: ${pattern}`,
            severity: 'critical',
            location: { path: 'rules.permissions.allow' }
          });
        }
      }
    }

    // Check for weak deny rules
    if (permissions.deny) {
      for (const rule of permissions.deny) {
        if (rule.length < 3) {
          context.warnings.push({
            category: 'security',
            message: `Very short deny rule may be ineffective: ${rule}`,
            field: 'rules.permissions.deny',
            severity: 'medium'
          });
        }
      }
    }
  }

  /**
   * Check for missing essential security rules
   */
  private checkMissingSecurityRules(context: ValidationContext): void {
    const permissions = context.template.rules.permissions;
    
    if (!permissions?.deny) return;

    const essentialDenyPatterns = ['rm -rf', 'format', 'sudo'];
    const missingPatterns = essentialDenyPatterns.filter(pattern => 
      !permissions.deny!.some(rule => rule.includes(pattern))
    );

    if (missingPatterns.length > 0) {
      context.warnings.push({
        category: 'security',
        message: `Missing essential security deny rules: ${missingPatterns.join(', ')}`,
        field: 'rules.permissions.deny',
        suggestion: `Consider adding deny rules for: ${missingPatterns.join(', ')}`,
        severity: 'medium'
      });
    }
  }

  /**
   * Check for overly permissive rules
   */
  private checkOverlyPermissiveRules(context: ValidationContext): void {
    const permissions = context.template.rules.permissions;
    
    if (!permissions) return;

    // Check ratio of allow to deny rules
    const allowCount = permissions.allow?.length || 0;
    const denyCount = permissions.deny?.length || 0;

    if (allowCount > 0 && denyCount === 0) {
      context.warnings.push({
        category: 'security',
        message: 'Template has allow rules but no deny rules',
        field: 'rules.permissions',
        suggestion: 'Add deny rules to provide security boundaries',
        severity: 'high'
      });
    }

    if (allowCount > denyCount * 3) {
      context.warnings.push({
        category: 'security',
        message: 'Template may be overly permissive (many more allow than deny rules)',
        field: 'rules.permissions',
        suggestion: 'Review if all allow rules are necessary',
        severity: 'medium'
      });
    }
  }

  /**
   * Validate template parameters don't introduce security risks
   */
  private validateParameterSecurity(context: ValidationContext): void {
    const parameters = context.template.parameters;
    
    if (!parameters) return;

    for (const param of parameters) {
      // Check for sensitive parameter names
      const sensitiveName = /password|secret|key|token|credential/i.test(param.name);
      if (sensitiveName && param.defaultValue) {
        context.warnings.push({
          category: 'security',
          message: `Sensitive parameter ${param.name} has a default value`,
          field: `parameters.${param.name}`,
          suggestion: 'Remove default value for sensitive parameters',
          severity: 'high'
        });
      }

      // Check for parameters that could be used for injection
      if (param.type === 'string' && !param.validation?.pattern) {
        context.warnings.push({
          category: 'security',
          message: `String parameter ${param.name} has no validation pattern`,
          field: `parameters.${param.name}`,
          suggestion: 'Add regex validation to prevent injection attacks',
          severity: 'low'
        });
      }
    }
  }

  /**
   * Run custom validators
   */
  private async runCustomValidators(
    context: ValidationContext,
    validators: TemplateValidator[]
  ): Promise<void> {
    context.checksPerformed.push('custom');

    for (const validator of validators) {
      try {
        const result = await validator(context.template);
        context.errors.push(...result.errors);
        
        // Convert validation warnings to template warnings
        for (const warning of result.warnings) {
          context.warnings.push({
            category: 'rules', // Default category for custom validators
            message: warning.message,
            severity: 'medium'
          });
        }
      } catch (error) {
        context.errors.push({
          type: 'TEMPLATE_ERROR',
          message: `Custom validator failed: ${error}`,
          severity: 'medium'
        });
      }
    }
  }

  /**
   * Calculate validation coverage
   */
  private calculateCoverage(context: ValidationContext): ValidationCoverage {
    const allChecks = ['structure', 'metadata', 'parameters', 'rules', 'compliance', 'security', 'custom'];
    const performed = context.checksPerformed;
    const skipped = allChecks.filter(check => !performed.includes(check));

    return {
      checksPerformed: performed,
      checksSkipped: skipped,
      coveragePercent: Math.round((performed.length / allChecks.length) * 100),
      complete: skipped.length === 0
    };
  }

  /**
   * Count total rules in template
   */
  private countTemplateRules(template: SecurityTemplate): number {
    const permissions = template.rules.permissions;
    if (!permissions) return 0;
    
    return (permissions.deny?.length || 0) + 
           (permissions.allow?.length || 0) + 
           (permissions.ask?.length || 0);
  }

  /**
   * Quick validation for performance-critical scenarios
   */
  public async quickValidate(template: SecurityTemplate): Promise<boolean> {
    try {
      const result = await this.validate(template, { quick: true });
      return result.isValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate multiple templates in batch
   */
  public async validateBatch(
    templates: SecurityTemplate[],
    options: Partial<TemplateValidationOptions> = {}
  ): Promise<TemplateValidationResult[]> {
    const results: TemplateValidationResult[] = [];

    // Process in parallel for better performance
    const validationPromises = templates.map(template => 
      this.validate(template, options)
    );

    const validationResults = await Promise.all(validationPromises);
    results.push(...validationResults);

    return results;
  }
}