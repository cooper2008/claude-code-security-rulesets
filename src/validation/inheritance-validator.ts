import { ExtendableTemplate, TemplateValidationResult } from '../types/index';

/**
 * Validator for template inheritance chains
 */
export class InheritanceValidator {
  
  /**
   * Validate template inheritance
   */
  async validateInheritance(template: ExtendableTemplate): Promise<TemplateValidationResult> {
    const startTime = Date.now();
    const errors: any[] = [];
    const warnings: any[] = [];

    // Basic inheritance validation
    if (template.inheritance.parentId && !template.inheritance.chain.includes(template.inheritance.parentId)) {
      errors.push({
        type: 'inheritance',
        message: `Parent template ${template.inheritance.parentId} not found in inheritance chain`,
        severity: 'error'
      });
    }

    // Check for circular inheritance
    const chainSet = new Set(template.inheritance.chain);
    if (chainSet.size !== template.inheritance.chain.length) {
      errors.push({
        type: 'inheritance',
        message: 'Circular inheritance detected in template chain',
        severity: 'critical'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      performance: {
        validationTime: Date.now() - startTime,
        rulesValidated: 1,
        customRulesValidated: template.customValidation?.length || 0
      }
    };
  }

  /**
   * Quick inheritance check for benchmarking
   */
  async quickCheck(template: ExtendableTemplate): Promise<boolean> {
    const result = await this.validateInheritance(template);
    return result.isValid;
  }
}

// Default instance for convenience
export const inheritanceValidator = new InheritanceValidator();
export default inheritanceValidator;