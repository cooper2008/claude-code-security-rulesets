import { ClaudeCodeConfiguration, ValidationResult } from '../types';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Schema validator for Claude Code configurations
 */
export class SchemaValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
    
    // Add Claude Code configuration schema
    this.ajv.addSchema(this.getClaudeCodeSchema(), 'claude-code-config');
  }

  /**
   * Validate configuration against schema
   */
  async validateSchema(config: ClaudeCodeConfiguration): Promise<ValidationResult> {
    const startTime = Date.now();
    
    const isValid = this.ajv.validate('claude-code-config', config);
    const errors = this.ajv.errors || [];
    
    return {
      isValid: !!isValid,
      errors: errors.map(error => ({
        type: 'INVALID_SYNTAX',
        message: error.message || 'Schema validation error',
        location: {
          path: error.instancePath,
          line: 0,
          column: 0
        },
        context: { schema: error.schemaPath },
        severity: 'warning' as const
      })),
      warnings: [],
      conflicts: [],
      performance: {
        validationTime: Date.now() - startTime,
        rulesProcessed: this.countRules(config),
        performanceTarget: {
          target: 100,
          achieved: (Date.now() - startTime) < 100
        }
      },
      suggestions: []
    };
  }

  private getClaudeCodeSchema() {
    return {
      type: 'object',
      properties: {
        permissions: {
          type: 'object',
          properties: {
            deny: {
              type: 'array',
              items: { type: 'string' }
            },
            allow: {
              type: 'array',
              items: { type: 'string' }
            },
            ask: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          additionalProperties: false
        },
        metadata: {
          type: 'object',
          additionalProperties: true
        }
      },
      additionalProperties: true
    };
  }

  private countRules(config: ClaudeCodeConfiguration): number {
    return (config.permissions?.deny?.length || 0) +
           (config.permissions?.allow?.length || 0) +
           (config.permissions?.ask?.length || 0);
  }
}

// Default instance for convenience
export const schemaValidator = new SchemaValidator();
export default schemaValidator;