import { ClaudeCodeConfiguration, ValidationResult, SecurityTemplate } from '../types/index';
import { ValidationEngine } from './engine';

/**
 * Main validator class for Claude Code configurations
 */
export class Validator {
  private engine: ValidationEngine;

  constructor() {
    this.engine = new ValidationEngine();
  }

  /**
   * Validate a Claude Code configuration
   */
  async validateConfiguration(config: ClaudeCodeConfiguration): Promise<ValidationResult> {
    return await this.engine.validate(config);
  }

  /**
   * Validate a security template
   */
  async validateTemplate(template: SecurityTemplate): Promise<ValidationResult> {
    return await this.engine.validate(template.rules);
  }

  /**
   * Quick validation for benchmarking
   */
  async quickValidate(config: ClaudeCodeConfiguration): Promise<boolean> {
    const result = await this.validateConfiguration(config);
    return result.isValid;
  }

  /**
   * Quick template validation for benchmarking
   */
  async quickValidateTemplate(template: SecurityTemplate): Promise<boolean> {
    const result = await this.validateTemplate(template);
    return result.isValid;
  }
}

// Default validator instance for convenience
export const validator = new Validator();

// Export validation functions for benchmarking
export async function validateTemplate(template: SecurityTemplate): Promise<boolean> {
  return await validator.quickValidateTemplate(template);
}

export async function validateConfiguration(config: ClaudeCodeConfiguration): Promise<ValidationResult> {
  return await validator.validateConfiguration(config);
}

// Export class and instance
export { ValidationEngine };
export default validator;