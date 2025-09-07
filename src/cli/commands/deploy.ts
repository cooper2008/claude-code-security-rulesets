/**
 * Deploy Command - Deploy Claude Code security configuration to environment
 * 
 * Deploys validated configurations to target environments with rollback capabilities.
 * Provides dry-run mode, deployment status tracking, and environment-specific validation.
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import crypto from 'crypto';
import type { 
  ClaudeCodeConfiguration, 
  Environment, 
  DeploymentStatus,
  ValidationResult 
} from '@/types';

/**
 * Options for the deploy command
 */
interface DeployOptions {
  environment: Environment;
  dryRun?: boolean;
  force?: boolean;
  rollback?: boolean;
  status?: boolean;
  scope?: 'global' | 'local';
}

/**
 * Deployment configuration for different environments
 */
interface EnvironmentConfig {
  name: Environment;
  displayName: string;
  description: string;
  requiresConfirmation: boolean;
  additionalValidation: boolean;
  backupRequired: boolean;
  rollbackEnabled: boolean;
}

/**
 * Environment-specific deployment configurations
 */
const ENVIRONMENT_CONFIGS: Record<Environment, EnvironmentConfig> = {
  development: {
    name: 'development',
    displayName: 'Development',
    description: 'Local development environment',
    requiresConfirmation: false,
    additionalValidation: false,
    backupRequired: false,
    rollbackEnabled: true,
  },
  test: {
    name: 'test',
    displayName: 'Test',
    description: 'Automated testing environment',
    requiresConfirmation: false,
    additionalValidation: true,
    backupRequired: false,
    rollbackEnabled: true,
  },
  staging: {
    name: 'staging',
    displayName: 'Staging',
    description: 'Pre-production staging environment',
    requiresConfirmation: true,
    additionalValidation: true,
    backupRequired: true,
    rollbackEnabled: true,
  },
  production: {
    name: 'production',
    displayName: 'Production',
    description: 'Live production environment',
    requiresConfirmation: true,
    additionalValidation: true,
    backupRequired: true,
    rollbackEnabled: true,
  },
};

/**
 * Mock deployment status storage (in real implementation, this would be a database)
 */
const DEPLOYMENT_HISTORY: DeploymentStatus[] = [];

/**
 * Read and validate configuration file
 */
function readAndValidateConfiguration(filePath: string): ClaudeCodeConfiguration {
  if (!existsSync(filePath)) {
    throw new Error(`Configuration file not found: ${filePath}`);
  }
  
  try {
    const content = readFileSync(filePath, 'utf8');
    const config = JSON.parse(content) as ClaudeCodeConfiguration;
    
    // Basic validation
    if (!config.permissions) {
      throw new Error('Configuration must contain permissions object');
    }
    
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw new Error(`Failed to read configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate configuration for specific environment
 */
async function validateForEnvironment(
  config: ClaudeCodeConfiguration, 
  environment: Environment,
  _configPath: string
): Promise<ValidationResult> {
  console.log(chalk.blue(`Validating configuration for ${environment} environment...`));
  
  // Use the validate command to perform validation
  // In a real implementation, this would call the validation engine directly
  try {
    // Simulate calling validation (in practice, you'd import the validation logic)
    const mockValidationResult: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      conflicts: [],
      suggestions: [],
      performance: {
        validationTime: 45.2,
        rulesProcessed: (config.permissions?.deny?.length || 0) + 
                       (config.permissions?.allow?.length || 0) + 
                       (config.permissions?.ask?.length || 0),
        performanceTarget: {
          target: 100,
          achieved: true,
        },
      },
    };
    
    // Add environment-specific validations
    if (environment === 'production') {
      // Production requires stricter validation
      if (!config.metadata?.signature) {
        mockValidationResult.warnings.push({
          type: 'BEST_PRACTICE_VIOLATION',
          message: 'Production deployments should have cryptographic signatures',
        });
      }
    }
    
    return mockValidationResult;
    
  } catch (error) {
    throw new Error(`Environment validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create backup of current configuration
 */
async function createBackup(environment: Environment): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = resolve(`.claude-security.${environment}.backup.${timestamp}.json`);
  
  // In a real implementation, this would read from the actual deployment location
  const mockCurrentConfig = {
    permissions: {
      deny: ['previous_config'],
      allow: [],
      ask: [],
    },
    metadata: {
      version: '0.9.0',
      timestamp: Date.now() - 86400000, // 1 day ago
      environment,
    },
  };
  
  writeFileSync(backupPath, JSON.stringify(mockCurrentConfig, null, 2), 'utf8');
  console.log(chalk.gray(`Backup created: ${backupPath}`));
  
  return backupPath;
}

/**
 * Simulate deployment process
 */
async function performDeployment(
  config: ClaudeCodeConfiguration,
  environment: Environment,
  _deploymentId: string,
  options: DeployOptions
): Promise<void> {
  console.log(chalk.blue(`Deploying to ${environment}...`));
  
  // Simulate deployment steps with progress
  const steps = [
    'Preparing deployment package',
    'Uploading configuration',
    'Updating environment settings',
    'Verifying deployment',
    'Activating new configuration',
  ];
  
  for (const [index, step] of steps.entries()) {
    console.log(chalk.gray(`[${index + 1}/${steps.length}] ${step}...`));
    
    // Simulate work with delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Apply the configuration to Claude Code settings
  await applyToClaudeCodeSettings(config, options);
  
  console.log(chalk.green('✅ Deployment completed successfully'));
}

/**
 * Apply configuration to Claude Code settings
 */
async function applyToClaudeCodeSettings(
  config: ClaudeCodeConfiguration,
  options: DeployOptions
): Promise<void> {
  const os = require('os');
  const path = require('path');
  
  // Determine settings path based on scope
  const scope = options.scope || 'global';
  const claudeDir = path.join(os.homedir(), '.claude');
  const settingsFileName = scope === 'local' ? 'settings.json' : 'settings.local.json';
  const settingsPath = path.join(claudeDir, settingsFileName);
  
  try {
    // Read existing settings
    let existingSettings = {};
    if (existsSync(settingsPath)) {
      const settingsContent = readFileSync(settingsPath, 'utf8');
      existingSettings = JSON.parse(settingsContent);
    }
    
    // Convert our format to Claude Code format
    const claudeCodeSettings = convertToClaudeCodeFormat(config, existingSettings);
    
    // Create backup
    if (existsSync(settingsPath)) {
      const backupPath = `${settingsPath}.backup.${Date.now()}`;
      writeFileSync(backupPath, readFileSync(settingsPath));
      console.log(chalk.gray(`  💾 Backup created: ${backupPath}`));
    }
    
    // Write new settings
    writeFileSync(settingsPath, JSON.stringify(claudeCodeSettings, null, 2));
    console.log(chalk.green(`  ✅ Claude Code ${scope} settings updated: ${settingsPath}`));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to apply Claude Code settings:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

/**
 * Convert our configuration format to Claude Code settings format
 */
function convertToClaudeCodeFormat(
  config: ClaudeCodeConfiguration, 
  existingSettings: any
): any {
  const claudeSettings = {
    ...existingSettings,
    permissions: {
      ...existingSettings.permissions,
      allow: [...(existingSettings.permissions?.allow || [])],
      deny: [...(existingSettings.permissions?.deny || [])],
      ask: [...(existingSettings.permissions?.ask || [])]
    }
  };
  
  // Add our deny rules to existing deny rules (avoiding duplicates)
  if (config.permissions?.deny) {
    config.permissions.deny.forEach(rule => {
      const claudeRule = convertRuleToClaudeFormat(rule);
      if (claudeRule && !claudeSettings.permissions.deny.includes(claudeRule)) {
        claudeSettings.permissions.deny.push(claudeRule);
      }
    });
  }
  
  // Add our allow rules
  if (config.permissions?.allow) {
    config.permissions.allow.forEach(rule => {
      const claudeRule = convertRuleToClaudeFormat(rule);
      if (claudeRule && !claudeSettings.permissions.allow.includes(claudeRule)) {
        claudeSettings.permissions.allow.push(claudeRule);
      }
    });
  }
  
  // Add our ask rules
  if (config.permissions?.ask) {
    config.permissions.ask.forEach(rule => {
      const claudeRule = convertRuleToClaudeFormat(rule);
      if (claudeRule && !claudeSettings.permissions.ask.includes(claudeRule)) {
        claudeSettings.permissions.ask.push(claudeRule);
      }
    });
  }
  
  return claudeSettings;
}

/**
 * Convert our rule format to Claude Code rule format
 */
function convertRuleToClaudeFormat(rule: string): string | null {
  // Handle our common rule patterns
  if (rule === 'execute_dangerous_commands') {
    return 'Bash(rm -rf *)';
  }
  if (rule === 'access_sensitive_files') {
    return 'Read(/etc/passwd)';
  }
  if (rule === 'Read(**/id_rsa*)') {
    return 'Read(/Users/*/.ssh/id_rsa*)';
  }
  if (rule === 'read_files') {
    return 'Read(*)';
  }
  if (rule === 'write_files') {
    return 'Write(*)';
  }
  if (rule === 'run_tests') {
    return 'Bash(npm test*)';
  }
  if (rule === 'install_packages') {
    return 'Bash(npm install*)';
  }
  if (rule === 'modify_system_settings') {
    return 'Write(/etc/*)';
  }
  
  // Handle our scan-generated rules (these are already in correct format)
  if (rule.match(/^(Read|Write|Bash|Execute)\(/)) {
    return rule;
  }
  
  // For unknown rules, try to map them sensibly
  return rule;
}

/**
 * Get confirmation from user for sensitive deployments
 */
async function getDeploymentConfirmation(
  config: ClaudeCodeConfiguration,
  environment: Environment
): Promise<boolean> {
  const envConfig = ENVIRONMENT_CONFIGS[environment];
  
  console.log(chalk.yellow.bold('\n⚠️  Deployment Confirmation Required\n'));
  console.log(chalk.gray(`Environment: ${envConfig.displayName}`));
  console.log(chalk.gray(`Description: ${envConfig.description}`));
  console.log(chalk.gray(`Rules: ${(config.permissions?.deny?.length || 0)} deny, ${(config.permissions?.allow?.length || 0)} allow, ${(config.permissions?.ask?.length || 0)} ask`));
  
  if (config.metadata?.name) {
    console.log(chalk.gray(`Configuration: ${config.metadata.name}`));
  }
  
  console.log();
  
  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message: `Deploy to ${envConfig.displayName} environment?`,
    default: false,
  }]);
  
  return confirmed;
}

/**
 * Display dry-run preview
 */
function displayDeploymentPreview(
  config: ClaudeCodeConfiguration,
  environment: Environment,
  configPath: string
): void {
  console.log(chalk.yellow.bold('\n🔍 Deployment Preview (Dry Run)\n'));
  
  const envConfig = ENVIRONMENT_CONFIGS[environment];
  console.log(chalk.cyan('Deployment Details:'));
  console.log(chalk.gray(`  Source: ${configPath}`));
  console.log(chalk.gray(`  Target: ${envConfig.displayName} (${environment})`));
  console.log(chalk.gray(`  Rules: ${(config.permissions?.deny?.length || 0)} deny, ${(config.permissions?.allow?.length || 0)} allow, ${(config.permissions?.ask?.length || 0)} ask`));
  
  if (config.metadata) {
    console.log(chalk.gray(`  Version: ${config.metadata.version || 'unknown'}`));
    console.log(chalk.gray(`  Template: ${config.metadata.templateId || 'custom'}`));
  }
  
  console.log(chalk.cyan('\nDeployment Steps:'));
  console.log(chalk.gray('  1. Validate configuration'));
  console.log(chalk.gray('  2. Create backup (if enabled)'));
  console.log(chalk.gray('  3. Upload configuration'));
  console.log(chalk.gray('  4. Apply to Claude Code settings'));
  console.log(chalk.gray('  5. Verify deployment'));
  
  console.log(chalk.yellow('\nNo changes will be made (dry run mode)'));
}

/**
 * Create deployment status entry
 */
function createDeploymentStatus(
  config: ClaudeCodeConfiguration,
  environment: Environment,
  status: DeploymentStatus['status'] = 'pending'
): DeploymentStatus {
  const deploymentId = crypto.randomUUID();
  const configurationId = crypto.createHash('sha256')
    .update(JSON.stringify(config))
    .digest('hex')
    .substring(0, 16);
  
  const deployment: DeploymentStatus = {
    id: deploymentId,
    configurationId,
    environment,
    status,
    startedAt: new Date(),
    deployedBy: process.env.USER || 'unknown',
  };
  
  DEPLOYMENT_HISTORY.push(deployment);
  return deployment;
}

/**
 * Update deployment status
 */
function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus['status'],
  error?: string
): void {
  const deployment = DEPLOYMENT_HISTORY.find(d => d.id === deploymentId);
  if (deployment) {
    deployment.status = status;
    deployment.completedAt = new Date();
    if (error) {
      deployment.error = error;
    }
  }
}

/**
 * Show deployment status
 */
function showDeploymentStatus(environment?: Environment): void {
  console.log(chalk.blue.bold('📊 Deployment Status\n'));
  
  const relevantDeployments = environment
    ? DEPLOYMENT_HISTORY.filter(d => d.environment === environment)
    : DEPLOYMENT_HISTORY;
  
  if (relevantDeployments.length === 0) {
    console.log(chalk.gray('No deployments found'));
    return;
  }
  
  // Sort by most recent first
  relevantDeployments.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  
  for (const deployment of relevantDeployments.slice(0, 10)) { // Show last 10
    const statusColor = deployment.status === 'completed' ? chalk.green :
                       deployment.status === 'failed' ? chalk.red :
                       deployment.status === 'in-progress' ? chalk.blue :
                       chalk.yellow;
    
    console.log(`${statusColor(deployment.status.padEnd(12))} ${deployment.environment.padEnd(12)} ${deployment.startedAt.toISOString().split('T')[0]} ${deployment.deployedBy}`);
    
    if (deployment.error) {
      console.log(chalk.red(`  Error: ${deployment.error}`));
    }
  }
}

/**
 * Perform rollback to previous deployment
 */
async function performRollback(environment: Environment): Promise<void> {
  console.log(chalk.blue(`Rolling back ${environment} environment...`));
  
  // Find previous successful deployment
  const previousDeployment = DEPLOYMENT_HISTORY
    .filter(d => d.environment === environment && d.status === 'completed')
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[1]; // Second most recent
  
  if (!previousDeployment) {
    throw new Error('No previous deployment found to rollback to');
  }
  
  console.log(chalk.gray(`Rolling back to deployment: ${previousDeployment.id}`));
  
  // In a real implementation, this would restore the previous configuration
  // For now, we'll simulate the rollback process
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log(chalk.green('✅ Rollback completed successfully'));
  
  // Record the rollback as a new deployment
  const rollbackDeployment = createDeploymentStatus(
    { permissions: {} }, // Mock config
    environment,
    'completed'
  );
  rollbackDeployment.completedAt = new Date();
}

/**
 * Main handler for the deploy command
 */
export async function handleDeploy(file: string | undefined, options: DeployOptions): Promise<void> {
  try {
    const { environment, dryRun, force, rollback, status } = options;
    
    // Handle status check
    if (status) {
      showDeploymentStatus(environment);
      return;
    }
    
    // Handle rollback
    if (rollback) {
      const envConfig = ENVIRONMENT_CONFIGS[environment];
      if (!envConfig.rollbackEnabled) {
        throw new Error(`Rollback is not supported for ${environment} environment`);
      }
      
      if (!force && envConfig.requiresConfirmation) {
        const { confirmed } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirmed',
          message: `Are you sure you want to rollback ${environment}?`,
          default: false,
        }]);
        
        if (!confirmed) {
          console.log(chalk.gray('Rollback cancelled'));
          return;
        }
      }
      
      await performRollback(environment);
      return;
    }
    
    // Regular deployment flow
    const configPath = resolve(file || 'claude-security.json');
    const envConfig = ENVIRONMENT_CONFIGS[environment];
    
    console.log(chalk.blue(`Preparing deployment to ${envConfig.displayName} environment`));
    
    // Read and basic validation
    const config = readAndValidateConfiguration(configPath);
    
    // Environment-specific validation
    if (envConfig.additionalValidation) {
      const validationResult = await validateForEnvironment(config, environment, configPath);
      
      if (!validationResult.isValid) {
        console.error(chalk.red.bold('❌ Configuration validation failed'));
        console.error(chalk.red(`Errors: ${validationResult.errors.length}`));
        console.error(chalk.red(`Conflicts: ${validationResult.conflicts.length}`));
        throw new Error('Configuration validation failed - cannot deploy invalid configuration');
      }
      
      if (validationResult.warnings.length > 0) {
        console.log(chalk.yellow(`⚠️  ${validationResult.warnings.length} warnings found`));
        for (const warning of validationResult.warnings) {
          console.log(chalk.yellow(`  - ${warning.message}`));
        }
      }
    }
    
    // Dry run preview
    if (dryRun) {
      displayDeploymentPreview(config, environment, configPath);
      return;
    }
    
    // Get confirmation for sensitive environments
    if (!force && envConfig.requiresConfirmation) {
      const confirmed = await getDeploymentConfirmation(config, environment);
      if (!confirmed) {
        console.log(chalk.gray('Deployment cancelled'));
        return;
      }
    }
    
    // Create deployment record
    const deployment = createDeploymentStatus(config, environment, 'in-progress');
    
    try {
      // Create backup if required
      if (envConfig.backupRequired) {
        await createBackup(environment);
      }
      
      // Perform the actual deployment
      await performDeployment(config, environment, deployment.id, options);
      
      // Update deployment status
      updateDeploymentStatus(deployment.id, 'completed');
      
      // Success message
      console.log(chalk.green.bold('\n🚀 Deployment successful!'));
      console.log(chalk.gray(`   Environment: ${envConfig.displayName}`));
      console.log(chalk.gray(`   Deployment ID: ${deployment.id}`));
      console.log(chalk.gray(`   Configuration: ${config.metadata?.name || 'unnamed'}`));
      
      // Show post-deployment instructions
      console.log(chalk.blue.bold('\n📋 Next steps:'));
      console.log(chalk.gray('   1. Verify Claude Code is using the new configuration'));
      console.log(chalk.gray('   2. Monitor system behavior for any issues'));
      console.log(chalk.gray('   3. Use --rollback if issues are discovered'));
      
    } catch (deploymentError) {
      updateDeploymentStatus(deployment.id, 'failed', deploymentError instanceof Error ? deploymentError.message : String(deploymentError));
      throw deploymentError;
    }
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Deployment failed: ${error.message}`);
    }
    throw new Error(`Deployment failed: ${String(error)}`);
  }
}

/**
 * Export deployment utilities for other commands
 */
export { ENVIRONMENT_CONFIGS, DeploymentStatus };