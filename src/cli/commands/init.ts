/**
 * Init Command - Initialize new Claude Code security configuration
 * 
 * Creates a new Claude Code security configuration file with interactive prompts
 * or from a specified template. Follows UNIX conventions for CLI design.
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { 
  ClaudeCodeConfiguration, 
  Environment, 
  TemplateCategory 
} from '@/types';

/**
 * Options for the init command
 */
interface InitOptions {
  template?: string;
  output?: string;
  force?: boolean;
  interactive?: boolean;
  nonInteractive?: boolean;
}

/**
 * Template information for interactive selection
 */
interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
}

/**
 * Available built-in templates
 */
const BUILT_IN_TEMPLATES: TemplateInfo[] = [
  {
    id: 'development',
    name: 'Development',
    description: 'Permissive rules for development environments',
    category: 'development',
  },
  {
    id: 'production',
    name: 'Production',
    description: 'Strict security rules for production environments',
    category: 'production',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Comprehensive security rules for enterprise organizations',
    category: 'production',
  },
  {
    id: 'compliance-soc2',
    name: 'SOC 2 Compliance',
    description: 'Rules meeting SOC 2 compliance requirements',
    category: 'compliance',
  },
  {
    id: 'compliance-hipaa',
    name: 'HIPAA Compliance',
    description: 'Rules meeting HIPAA compliance requirements',
    category: 'compliance',
  },
];

/**
 * Default configuration templates
 */
const DEFAULT_CONFIGURATIONS: Record<string, ClaudeCodeConfiguration> = {
  development: {
    permissions: {
      deny: [
        'execute_dangerous_commands',
        'access_sensitive_files',
      ],
      allow: [
        'read_files',
        'write_files',
        'run_tests',
      ],
      ask: [
        'install_packages',
        'modify_system_settings',
      ],
    },
  },
  production: {
    permissions: {
      deny: [
        'execute_dangerous_commands',
        'access_sensitive_files',
        'modify_system_settings',
        'install_packages',
        'network_requests',
      ],
      allow: [
        'read_allowed_files',
      ],
      ask: [
        'write_files',
      ],
    },
  },
  enterprise: {
    permissions: {
      deny: [
        'execute_dangerous_commands',
        'access_sensitive_files',
        'modify_system_settings',
        'install_packages',
        'network_requests',
        'access_credentials',
        'modify_security_settings',
      ],
      allow: [
        'read_public_files',
      ],
      ask: [
        'write_files',
        'read_private_files',
      ],
    },
  },
  'compliance-soc2': {
    permissions: {
      deny: [
        'execute_dangerous_commands',
        'access_sensitive_files',
        'modify_system_settings',
        'install_packages',
        'network_requests',
        'access_credentials',
        'modify_security_settings',
        'access_audit_logs',
      ],
      allow: [
        'read_public_files',
      ],
      ask: [
        'write_files',
        'read_private_files',
        'generate_reports',
      ],
    },
  },
  'compliance-hipaa': {
    permissions: {
      deny: [
        'execute_dangerous_commands',
        'access_sensitive_files',
        'modify_system_settings',
        'install_packages',
        'network_requests',
        'access_credentials',
        'modify_security_settings',
        'access_audit_logs',
        'access_pii',
        'access_phi',
      ],
      allow: [
        'read_public_files',
      ],
      ask: [
        'write_files',
        'read_private_files',
        'generate_reports',
        'access_anonymized_data',
      ],
    },
  },
};

/**
 * Interactive prompts for configuration setup
 */
async function runInteractiveSetup(): Promise<{
  template: string;
  environment: Environment;
  organizationName: string;
  configName: string;
}> {
  console.log(chalk.blue.bold('\n🛡️  Claude Code Security Configuration Setup\n'));
  console.log(chalk.gray('This will create a new security configuration file for Claude Code.'));
  console.log(chalk.gray('Answer the following questions to customize your setup:\n'));

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'template',
      message: 'Which security template would you like to use?',
      choices: BUILT_IN_TEMPLATES.map(template => ({
        name: `${chalk.bold(template.name)} - ${chalk.gray(template.description)}`,
        value: template.id,
        short: template.name,
      })),
      default: 'development',
    },
    {
      type: 'list',
      name: 'environment',
      message: 'What environment is this configuration for?',
      choices: [
        { name: 'Development', value: 'development' },
        { name: 'Staging', value: 'staging' },
        { name: 'Production', value: 'production' },
        { name: 'Test', value: 'test' },
      ],
      default: 'development',
    },
    {
      type: 'input',
      name: 'organizationName',
      message: 'Organization name (optional):',
      validate: (input: string) => {
        if (input.length === 0) return true;
        return input.length >= 2 || 'Organization name must be at least 2 characters';
      },
    },
    {
      type: 'input',
      name: 'configName',
      message: 'Configuration name:',
      default: (answers: { template: string; environment: string }) => 
        `${answers.template}-${answers.environment}`,
      validate: (input: string) => 
        input.length >= 3 || 'Configuration name must be at least 3 characters',
    },
  ]);

  return answers;
}

/**
 * Create configuration metadata
 */
function createMetadata(
  template: string,
  environment: Environment,
  organizationName?: string,
  configName?: string
): object {
  const metadata: object = {
    version: '1.0.0',
    timestamp: Date.now(),
    templateId: template,
    name: configName || `${template}-${environment}`,
    environment,
  };
  
  if (organizationName) {
    metadata["organization"] = organizationName;
  }
  
  return metadata;
}

/**
 * Generate the final configuration
 */
function generateConfiguration(
  template: string,
  metadata: object
): ClaudeCodeConfiguration {
  const baseConfig = DEFAULT_CONFIGURATIONS[template];
  
  if (!baseConfig) {
    throw new Error(`Unknown template: ${template}`);
  }

  return {
    ...baseConfig,
    metadata,
  };
}

/**
 * Check if output file exists and handle overwrite logic
 */
function checkOutputFile(outputPath: string, force: boolean): void {
  if (existsSync(outputPath) && !force) {
    console.error(chalk.red.bold('Error:'), `File already exists: ${outputPath}`);
    console.error(chalk.gray('Use --force to overwrite existing file'));
    process.exit(1);
  }
}

/**
 * Write configuration to file with pretty formatting
 */
function writeConfiguration(config: ClaudeCodeConfiguration, outputPath: string): void {
  try {
    const jsonContent = JSON.stringify(config, null, 2);
    writeFileSync(outputPath, jsonContent, 'utf8');
    
    console.log(chalk.green.bold('\n✅ Configuration created successfully!'));
    console.log(chalk.gray(`   File: ${outputPath}`));
    console.log(chalk.gray(`   Template: ${config.metadata?.templateId || 'custom'}`));
    console.log(chalk.gray(`   Environment: ${config.metadata?.environment || 'unknown'}`));
    
    // Show next steps
    console.log(chalk.blue.bold('\n📋 Next steps:'));
    console.log(chalk.gray('   1. Review the generated configuration'));
    console.log(chalk.gray('   2. Validate: claude-security validate'));
    console.log(chalk.gray('   3. Deploy: claude-security deploy -e <environment>'));
    
  } catch (error) {
    console.error(chalk.red.bold('Error:'), 'Failed to write configuration file');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * Main handler for the init command
 */
export async function handleInit(options: InitOptions): Promise<void> {
  try {
    const outputPath = resolve(options.output || 'claude-security.json');
    
    // Check if file exists and handle force flag
    checkOutputFile(outputPath, options.force || false);
    
    let template = options.template;
    let environment: Environment = 'development';
    let organizationName: string | undefined;
    let configName: string | undefined;
    
    // Use interactive setup if no template specified or interactive flag is set
    const shouldUseInteractive = !options.nonInteractive && (!template || options.interactive);
    
    if (shouldUseInteractive) {
      const answers = await runInteractiveSetup();
      template = answers.template;
      environment = answers.environment;
      organizationName = answers.organizationName || undefined;
      configName = answers.configName;
    } else {
      // Non-interactive mode - use defaults or provided options
      template = template || 'development';
      
      if (!DEFAULT_CONFIGURATIONS[template]) {
        const availableTemplates = Object.keys(DEFAULT_CONFIGURATIONS).join(', ');
        throw new Error(`Unknown template: ${template}. Available: ${availableTemplates}`);
      }
      
      console.log(chalk.blue(`Creating configuration with template: ${template}`));
    }
    
    // Create metadata and configuration
    const metadata = createMetadata(template!, environment, organizationName, configName);
    const configuration = generateConfiguration(template!, metadata);
    
    // Write to file
    writeConfiguration(configuration, outputPath);
    
    // Success feedback
    if (process.env.CLI_VERBOSE === 'true') {
      console.log(chalk.gray('\nGenerated configuration:'));
      console.log(chalk.gray(JSON.stringify(configuration, null, 2)));
    }
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Init failed: ${error.message}`);
    }
    throw new Error(`Init failed: ${String(error)}`);
  }
}

/**
 * Export available templates for other commands
 */
export { BUILT_IN_TEMPLATES, DEFAULT_CONFIGURATIONS };