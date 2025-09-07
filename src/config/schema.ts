/**
 * JSON Schema definitions for Claude Code configuration validation
 * Ensures configurations meet Claude Code requirements while adding security enhancements
 */

import { JSONSchema7 } from 'json-schema';

/**
 * JSON Schema for Claude Code configuration validation
 * Matches Claude Code's native settings.json format exactly
 */
export const claudeCodeConfigurationSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://claude-code/schemas/configuration.json',
  title: 'Claude Code Configuration Schema',
  description: 'Schema for validating Claude Code settings.json configuration files',
  type: 'object',
  properties: {
    permissions: {
      type: 'object',
      description: 'Permission rules for Claude Code actions',
      properties: {
        deny: {
          type: 'array',
          description: 'Actions that are completely blocked without user confirmation',
          items: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\s].+[^\\s]$' // No leading/trailing whitespace
          },
          uniqueItems: true
        },
        allow: {
          type: 'array',
          description: 'Actions that are explicitly permitted',
          items: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\s].+[^\\s]$'
          },
          uniqueItems: true
        },
        ask: {
          type: 'array',
          description: 'Actions that require user confirmation',
          items: {
            type: 'string',
            minLength: 1,
            pattern: '^[^\\s].+[^\\s]$'
          },
          uniqueItems: true
        }
      },
      additionalProperties: false
    },
    metadata: {
      type: 'object',
      description: 'Additional metadata for security rule management',
      properties: {
        version: {
          type: 'string',
          pattern: '^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9-]+)?$',
          description: 'Semantic version of the configuration'
        },
        signature: {
          type: 'string',
          description: 'Cryptographic signature for integrity verification'
        },
        timestamp: {
          type: 'integer',
          minimum: 0,
          description: 'Unix timestamp when configuration was created'
        },
        organization: {
          type: 'string',
          minLength: 1,
          description: 'Organization that owns this configuration'
        },
        templateId: {
          type: 'string',
          pattern: '^[a-zA-Z0-9-_]+$',
          description: 'Template used to generate this configuration'
        },
        name: {
          type: 'string',
          minLength: 1,
          description: 'Name/description of this configuration'
        },
        environment: {
          type: 'string',
          enum: ['development', 'staging', 'production', 'test'],
          description: 'Environment this configuration is for'
        }
      },
      required: ['version', 'timestamp'],
      additionalProperties: false
    }
  },
  additionalProperties: true, // Allow other Claude Code settings
  minProperties: 1
};

/**
 * Schema for configuration hierarchy levels
 * Used to validate configurations at different precedence levels
 */
export const configurationHierarchySchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://claude-code/schemas/hierarchy.json',
  title: 'Configuration Hierarchy Schema',
  description: 'Schema for validating hierarchical configuration structures',
  type: 'object',
  properties: {
    enterprise: {
      type: 'object',
      description: 'Enterprise-level configuration (highest precedence for deny rules)',
      properties: claudeCodeConfigurationSchema.properties,
      additionalProperties: claudeCodeConfigurationSchema.additionalProperties,
      minProperties: claudeCodeConfigurationSchema.minProperties
    },
    project: {
      type: 'object',
      description: 'Project-level configuration',
      properties: claudeCodeConfigurationSchema.properties,
      additionalProperties: claudeCodeConfigurationSchema.additionalProperties,
      minProperties: claudeCodeConfigurationSchema.minProperties
    },
    user: {
      type: 'object',
      description: 'User-level configuration (lowest precedence)',
      properties: claudeCodeConfigurationSchema.properties,
      additionalProperties: claudeCodeConfigurationSchema.additionalProperties,
      minProperties: claudeCodeConfigurationSchema.minProperties
    }
  },
  additionalProperties: false,
  minProperties: 1
};

/**
 * Schema for environment variable configuration
 * Supports environment variable substitution in configurations
 */
export const environmentVariableSchema: JSONSchema7 = {
  type: 'string',
  pattern: '^\\$\\{[A-Z_][A-Z0-9_]*\\}$|^[^$]*$',
  description: 'Environment variable reference or literal value'
};

/**
 * Schema for CLI argument overrides
 * Validates command-line configuration overrides
 */
export const cliOverrideSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://claude-code/schemas/cli-override.json',
  title: 'CLI Override Schema',
  description: 'Schema for validating CLI configuration overrides',
  type: 'object',
  properties: {
    'permissions.deny': {
      type: 'array',
      items: { type: 'string' }
    },
    'permissions.allow': {
      type: 'array',
      items: { type: 'string' }
    },
    'permissions.ask': {
      type: 'array',
      items: { type: 'string' }
    },
    'metadata.environment': {
      type: 'string',
      enum: ['development', 'staging', 'production', 'test']
    }
  },
  additionalProperties: false
};

/**
 * Validation schemas for different configuration contexts
 */
export const validationSchemas = {
  base: claudeCodeConfigurationSchema,
  hierarchy: configurationHierarchySchema,
  cliOverride: cliOverrideSchema,
  environmentVariable: environmentVariableSchema
} as const;

/**
 * Schema validation error codes for standardized error handling
 */
export enum SchemaValidationError {
  INVALID_JSON = 'INVALID_JSON',
  SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED',
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  INVALID_PATTERN = 'INVALID_PATTERN',
  DUPLICATE_VALUES = 'DUPLICATE_VALUES',
  ENVIRONMENT_VARIABLE_INVALID = 'ENVIRONMENT_VARIABLE_INVALID'
}

/**
 * Configuration validation options
 */
export interface SchemaValidationOptions {
  /** Allow additional properties beyond schema */
  allowAdditionalProperties?: boolean;
  /** Validate environment variable references */
  validateEnvironmentVars?: boolean;
  /** Maximum recursion depth for nested validation */
  maxDepth?: number;
  /** Skip validation for performance in trusted contexts */
  skipValidation?: boolean;
}

/**
 * Default validation options for different contexts
 */
export const defaultValidationOptions: Record<string, SchemaValidationOptions> = {
  strict: {
    allowAdditionalProperties: false,
    validateEnvironmentVars: true,
    maxDepth: 10,
    skipValidation: false
  },
  production: {
    allowAdditionalProperties: true,
    validateEnvironmentVars: true,
    maxDepth: 5,
    skipValidation: false
  },
  development: {
    allowAdditionalProperties: true,
    validateEnvironmentVars: false,
    maxDepth: 10,
    skipValidation: false
  }
};