/**
 * Generate Command - Generate Claude Code security configuration from template
 * 
 * Creates a new security configuration by processing templates with custom parameters
 * and environment-specific settings. Supports dry-run mode for preview.
 */

import chalk from 'chalk';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { 
  ClaudeCodeConfiguration, 
  Environment, 
  ConfigurationMetadata,
  TemplateParameter 
} from '@/types';
import { BUILT_IN_TEMPLATES, DEFAULT_CONFIGURATIONS } from './init';

/**
 * Options for the generate command
 */
interface GenerateOptions {
  template: string;
  output?: string;
  environment?: Environment;
  params?: string;
  dryRun?: boolean;
}

/**
 * Template parameters for different templates
 */
const TEMPLATE_PARAMETERS: Record<string, TemplateParameter[]> = {
  enterprise: [
    {
      name: 'allowedFileExtensions',
      type: 'array',
      description: 'File extensions that are allowed to be read',
      required: false,
      defaultValue: ['.md', '.txt', '.json', '.yaml', '.yml'],
    },
    {
      name: 'maxFileSize',
      type: 'number',
      description: 'Maximum file size in bytes for operations',
      required: false,
      defaultValue: 1048576, // 1MB
    },
    {
      name: 'enableAuditLogging',
      type: 'boolean',
      description: 'Enable detailed audit logging',
      required: false,
      defaultValue: true,
    },
    {
      name: 'restrictedDirectories',
      type: 'array',
      description: 'Directories that should be completely blocked',
      required: false,
      defaultValue: ['/etc', '/root', '/home/*/.ssh'],
    },
  ],
  production: [
    {
      name: 'allowedCommands',
      type: 'array',
      description: 'Commands that are explicitly allowed',
      required: false,
      defaultValue: ['git status', 'git log', 'npm test'],
    },
    {
      name: 'emergencyBypass',
      type: 'boolean',
      description: 'Enable emergency bypass mechanism',
      required: false,
      defaultValue: false,
    },
  ],
  'compliance-soc2': [
    {
      name: 'dataClassification',
      type: 'string',
      description: 'Data classification level (public, internal, confidential, restricted)',
      required: true,
    },
    {
      name: 'retentionPeriod',
      type: 'number',
      description: 'Audit log retention period in days',
      required: false,
      defaultValue: 2555, // 7 years
    },
  ],
  'compliance-hipaa': [
    {
      name: 'dataClassification',
      type: 'string',
      description: 'Data classification level (public, internal, confidential, restricted)',
      required: true,
    },
    {
      name: 'encryptionRequired',
      type: 'boolean',
      description: 'Require encryption for all data operations',
      required: false,
      defaultValue: true,
    },
    {
      name: 'accessLogging',
      type: 'boolean',
      description: 'Log all data access attempts',
      required: false,
      defaultValue: true,
    },
  ],
};

/**
 * Environment-specific rule modifications
 */
const ENVIRONMENT_MODIFIERS: Record<Environment, (config: ClaudeCodeConfiguration) => ClaudeCodeConfiguration> = {
  development: (config) => ({
    ...config,
    permissions: {
      ...config.permissions,
      // More permissive in development
      allow: [
        ...(config.permissions?.allow || []),
        'run_dev_tools',
        'access_dev_files',
      ],
    },
  }),
  
  staging: (config) => ({
    ...config,
    permissions: {
      ...config.permissions,
      // Moderate restrictions for staging
      deny: [
        ...(config.permissions?.deny || []),
        'access_production_data',
      ],
      ask: [
        ...(config.permissions?.ask || []),
        'deploy_to_staging',
      ],
    },
  }),
  
  production: (config) => ({
    ...config,
    permissions: {
      ...config.permissions,
      // Strictest rules for production
      deny: [
        ...(config.permissions?.deny || []),
        'access_production_data',
        'modify_production_config',
        'bypass_security_checks',
      ],
    },
  }),
  
  test: (config) => ({
    ...config,
    permissions: {
      ...config.permissions,
      // Test-specific permissions
      allow: [
        ...(config.permissions?.allow || []),
        'run_tests',
        'access_test_data',
        'mock_external_services',
      ],
    },
  }),
};

/**
 * Parse template parameters from JSON string
 */
function parseTemplateParameters(paramsJson?: string): Record<string, unknown> {
  if (!paramsJson) {
    return {};
  }
  
  try {
    const parsed = JSON.parse(paramsJson);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Parameters must be a JSON object');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON parameters: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate template parameters against schema
 */
function validateParameters(templateId: string, params: Record<string, unknown>): void {
  const parameterSchema = TEMPLATE_PARAMETERS[templateId];
  if (!parameterSchema) {
    return; // No validation needed for templates without parameters
  }
  
  // Check required parameters
  for (const param of parameterSchema) {
    if (param.required && !(param.name in params)) {
      throw new Error(`Missing required parameter: ${param.name} (${param.description})`);
    }
    
    // Type validation
    if (param.name in params) {
      const value = params[param.name];
      const expectedType = param.type;
      
      if (expectedType === 'array' && !Array.isArray(value)) {
        throw new Error(`Parameter ${param.name} must be an array`);
      } else if (expectedType === 'number' && typeof value !== 'number') {
        throw new Error(`Parameter ${param.name} must be a number`);
      } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
        throw new Error(`Parameter ${param.name} must be a boolean`);
      } else if (expectedType === 'string' && typeof value !== 'string') {
        throw new Error(`Parameter ${param.name} must be a string`);
      }
    }
  }
}

/**
 * Apply template parameters to configuration
 */
function applyTemplateParameters(
  config: ClaudeCodeConfiguration,
  templateId: string,
  params: Record<string, unknown>
): ClaudeCodeConfiguration {
  const parameterSchema = TEMPLATE_PARAMETERS[templateId];
  if (!parameterSchema) {
    return config; // No parameters to apply
  }
  
  // Clone the configuration to avoid mutations
  const result = JSON.parse(JSON.stringify(config)) as ClaudeCodeConfiguration;
  
  // Apply template-specific parameter logic
  switch (templateId) {
    case 'enterprise':
      if (params.restrictedDirectories && Array.isArray(params.restrictedDirectories)) {
        const restrictions = params.restrictedDirectories as string[];
        result.permissions = {
          ...result.permissions,
          deny: [
            ...(result.permissions?.deny || []),
            ...restrictions.map(dir => `access_directory:${dir}`),
          ],
        };
      }
      break;
      
    case 'production':
      if (params.allowedCommands && Array.isArray(params.allowedCommands)) {
        const commands = params.allowedCommands as string[];
        result.permissions = {
          ...result.permissions,
          allow: [
            ...(result.permissions?.allow || []),
            ...commands.map(cmd => `execute_command:${cmd}`),
          ],
        };
      }
      break;
      
    case 'compliance-soc2':
    case 'compliance-hipaa':
      if (params.dataClassification) {
        result.permissions = {
          ...result.permissions,
          deny: [
            ...(result.permissions?.deny || []),
            `access_data_above:${params.dataClassification}`,
          ],
        };
      }
      break;
  }
  
  return result;
}

/**
 * Apply environment-specific modifications
 */
function applyEnvironmentModifiers(
  config: ClaudeCodeConfiguration,
  environment?: Environment
): ClaudeCodeConfiguration {
  if (!environment) {
    return config;
  }
  
  const modifier = ENVIRONMENT_MODIFIERS[environment];
  return modifier ? modifier(config) : config;
}

/**
 * Create metadata for generated configuration
 */
function createGeneratedMetadata(
  templateId: string,
  environment?: Environment,
  params?: Record<string, unknown>
): ConfigurationMetadata {
  const metadata: ConfigurationMetadata = {
    version: '1.0.0',
    timestamp: Date.now(),
    templateId,
    name: `generated-${templateId}-${environment || 'default'}`,
  };
  
  if (environment) {
    metadata.environment = environment;
  }
  
  // Store parameters in metadata for audit trail
  if (params && Object.keys(params).length > 0) {
    // Note: In a real implementation, we might want to sanitize sensitive parameters
    (metadata as any).templateParameters = params;
  }
  
  return metadata;
}

/**
 * Display dry-run preview
 */
function displayDryRunPreview(config: ClaudeCodeConfiguration, outputPath: string): void {
  console.log(chalk.yellow.bold('\n🔍 Dry Run Preview\n'));
  console.log(chalk.gray(`Would create: ${outputPath}\n`));
  
  console.log(chalk.cyan('Configuration summary:'));
  console.log(chalk.gray(`  Template: ${config.metadata?.templateId || 'custom'}`));
  console.log(chalk.gray(`  Environment: ${config.metadata?.environment || 'default'}`));
  console.log(chalk.gray(`  Deny rules: ${config.permissions?.deny?.length || 0}`));
  console.log(chalk.gray(`  Allow rules: ${config.permissions?.allow?.length || 0}`));
  console.log(chalk.gray(`  Ask rules: ${config.permissions?.ask?.length || 0}`));
  
  if (process.env.CLI_VERBOSE === 'true') {
    console.log(chalk.cyan('\nFull configuration:'));
    console.log(JSON.stringify(config, null, 2));
  } else {
    console.log(chalk.gray('\nUse --verbose to see full configuration'));
  }
  
  console.log(chalk.yellow('\nNo files were modified (dry run mode)'));
}

/**
 * List available templates with their parameters
 */
function listAvailableTemplates(): void {
  console.log(chalk.blue.bold('\n📋 Available Templates:\n'));
  
  for (const template of BUILT_IN_TEMPLATES) {
    console.log(chalk.bold(`${template.name} (${template.id})`));
    console.log(chalk.gray(`  ${template.description}`));
    console.log(chalk.gray(`  Category: ${template.category}`));
    
    const params = TEMPLATE_PARAMETERS[template.id];
    if (params && params.length > 0) {
      console.log(chalk.cyan('  Parameters:'));
      for (const param of params) {
        const required = param.required ? chalk.red('*') : '';
        console.log(chalk.gray(`    ${param.name}${required} (${param.type}): ${param.description}`));
      }
    }
    console.log();
  }
}

/**
 * Main handler for the generate command
 */
export async function handleGenerate(options: GenerateOptions): Promise<void> {
  try {
    const { template, environment, params: paramsJson, dryRun } = options;
    const outputPath = resolve(options.output || 'claude-security.json');
    
    // Check if template exists
    if (!DEFAULT_CONFIGURATIONS[template]) {
      console.error(chalk.red.bold('Error:'), `Unknown template: ${template}\n`);
      listAvailableTemplates();
      process.exit(1);
    }
    
    // Parse and validate parameters
    const params = parseTemplateParameters(paramsJson);
    validateParameters(template, params);
    
    console.log(chalk.blue(`Generating configuration from template: ${template}`));
    if (environment) {
      console.log(chalk.gray(`Target environment: ${environment}`));
    }
    
    // Get base configuration from template
    let config = { ...DEFAULT_CONFIGURATIONS[template] };
    
    // Apply template parameters
    config = applyTemplateParameters(config, template, params);
    
    // Apply environment modifications
    config = applyEnvironmentModifiers(config, environment);
    
    // Add metadata
    const metadata = createGeneratedMetadata(template, environment, params);
    config.metadata = metadata;
    
    // Handle dry run
    if (dryRun) {
      displayDryRunPreview(config, outputPath);
      return;
    }
    
    // Check if file exists (no force option for generate - use init for that)
    if (existsSync(outputPath)) {
      console.error(chalk.red.bold('Error:'), `File already exists: ${outputPath}`);
      console.error(chalk.gray('Use a different output path or remove the existing file'));
      process.exit(1);
    }
    
    // Write configuration
    const jsonContent = JSON.stringify(config, null, 2);
    writeFileSync(outputPath, jsonContent, 'utf8');
    
    // Success message
    console.log(chalk.green.bold('\n✅ Configuration generated successfully!'));
    console.log(chalk.gray(`   File: ${outputPath}`));
    console.log(chalk.gray(`   Template: ${template}`));
    if (environment) {
      console.log(chalk.gray(`   Environment: ${environment}`));
    }
    if (Object.keys(params).length > 0) {
      console.log(chalk.gray(`   Parameters: ${Object.keys(params).join(', ')}`));
    }
    
    // Show next steps
    console.log(chalk.blue.bold('\n📋 Next steps:'));
    console.log(chalk.gray('   1. Review the generated configuration'));
    console.log(chalk.gray('   2. Validate: claude-security validate'));
    console.log(chalk.gray('   3. Deploy: claude-security deploy -e <environment>'));
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Generate failed: ${error.message}`);
    }
    throw new Error(`Generate failed: ${String(error)}`);
  }
}

/**
 * Export template information for other commands
 */
export { TEMPLATE_PARAMETERS };