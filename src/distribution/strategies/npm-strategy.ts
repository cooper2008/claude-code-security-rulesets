/**
 * NPM Distribution Strategy
 * Distributes security configs via private NPM registry
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import crypto from 'crypto';
import type { 
  DistributionTarget, 
  NpmConnectionConfig,
  DeploymentError 
} from '../types';
import type { ClaudeCodeConfiguration } from '@/types';
import { IDistributionStrategy, DeploymentContext, StrategyResult } from './manager';

/**
 * NPM-based distribution strategy for enterprise package distribution
 */
export class NpmStrategy implements IDistributionStrategy {
  private deploymentCache = new Map<string, PackageDeployment>();

  async deploy(
    target: DistributionTarget,
    config: ClaudeCodeConfiguration,
    context: DeploymentContext
  ): Promise<StrategyResult> {
    context.onLog?.('info', `Starting NPM deployment to ${target.name}`);
    
    try {
      const npmConfig = target.connection.config as NpmConnectionConfig;
      const deploymentId = crypto.randomUUID();
      
      // Create package structure
      const packageInfo = await this.createPackage(config, npmConfig, deploymentId);
      
      // Publish package to registry
      context.onProgress?.(25);
      await this.publishPackage(packageInfo, npmConfig, target, context);
      
      // Install package on target
      context.onProgress?.(75);
      await this.installPackageOnTarget(packageInfo, target, context);
      
      // Verify installation
      context.onProgress?.(90);
      await this.verifyInstallation(packageInfo, target, context);
      
      context.onProgress?.(100);
      context.onLog?.('info', `NPM deployment completed successfully`);
      
      // Cache deployment info
      this.deploymentCache.set(deploymentId, {
        deploymentId,
        target,
        packageInfo,
        status: 'completed',
        timestamp: new Date()
      });

      return {
        success: true,
        message: `Package ${packageInfo.name}@${packageInfo.version} deployed successfully`,
        metadata: {
          packageName: packageInfo.name,
          packageVersion: packageInfo.version,
          registryUrl: npmConfig.registryUrl
        }
      };

    } catch (error) {
      const deploymentError: DeploymentError = {
        code: 'NPM_DEPLOYMENT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown NPM deployment error',
        details: {
          strategy: 'npm',
          target: target.name,
          registry: (target.connection.config as NpmConnectionConfig).registryUrl
        },
        suggestions: [
          'Verify NPM registry access and authentication',
          'Check network connectivity to registry',
          'Ensure package name is available and valid',
          'Verify NPM credentials and permissions'
        ]
      };

      context.onLog?.('error', `NPM deployment failed: ${deploymentError.message}`);

      return {
        success: false,
        message: deploymentError.message,
        error: deploymentError
      };
    }
  }

  async validateConnectivity(target: DistributionTarget): Promise<void> {
    const npmConfig = target.connection.config as NpmConnectionConfig;
    
    // Test registry connectivity
    try {
      await this.executeCommand('npm', ['ping', '--registry', npmConfig.registryUrl], {
        timeout: 10000
      });
    } catch (error) {
      throw new Error(`Cannot connect to NPM registry ${npmConfig.registryUrl}: ${error}`);
    }

    // Test authentication if credentials are provided
    if (target.connection.auth) {
      try {
        await this.executeCommand('npm', ['whoami', '--registry', npmConfig.registryUrl], {
          timeout: 5000,
          env: this.getAuthEnvironment(target)
        });
      } catch (error) {
        throw new Error(`NPM authentication failed: ${error}`);
      }
    }
  }

  async rollback(
    target: DistributionTarget,
    deploymentId: string,
    context: DeploymentContext
  ): Promise<StrategyResult> {
    context.onLog?.('info', `Starting NPM rollback for deployment ${deploymentId}`);

    try {
      const deployment = this.deploymentCache.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found in cache`);
      }

      const npmConfig = target.connection.config as NpmConnectionConfig;
      
      // Find previous version
      const previousVersion = await this.getPreviousVersion(deployment.packageInfo.name, npmConfig);
      
      if (previousVersion) {
        // Install previous version
        await this.installSpecificVersion(
          deployment.packageInfo.name,
          previousVersion,
          target,
          context
        );
        
        context.onLog?.('info', `Rolled back to version ${previousVersion}`);
      } else {
        // Uninstall current version
        await this.uninstallPackage(deployment.packageInfo.name, target, context);
        context.onLog?.('info', 'Uninstalled current version (no previous version found)');
      }

      return {
        success: true,
        message: `Rollback completed ${previousVersion ? `to ${previousVersion}` : '(uninstalled)'}`,
        metadata: { previousVersion }
      };

    } catch (error) {
      return {
        success: false,
        message: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
        error: {
          code: 'ROLLBACK_FAILED',
          message: error instanceof Error ? error.message : String(error),
          details: { deploymentId },
          suggestions: ['Check package availability', 'Verify registry access']
        }
      };
    }
  }

  async getStatus(target: DistributionTarget, deploymentId: string): Promise<{
    status: 'pending' | 'deploying' | 'completed' | 'failed';
    progress: number;
    message: string;
  }> {
    const deployment = this.deploymentCache.get(deploymentId);
    
    if (!deployment) {
      return {
        status: 'failed',
        progress: 0,
        message: 'Deployment not found'
      };
    }

    return {
      status: deployment.status,
      progress: deployment.status === 'completed' ? 100 : 0,
      message: `Package ${deployment.packageInfo.name}@${deployment.packageInfo.version}`
    };
  }

  /**
   * Create NPM package structure
   */
  private async createPackage(
    config: ClaudeCodeConfiguration,
    npmConfig: NpmConnectionConfig,
    deploymentId: string
  ): Promise<PackageInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const version = `1.0.${Date.now()}`;
    const packageName = npmConfig.scope ? 
      `@${npmConfig.scope}/${npmConfig.packageName}` : 
      npmConfig.packageName;

    const packageInfo: PackageInfo = {
      name: packageName,
      version,
      deploymentId,
      buildPath: join(process.cwd(), '.npm-build', deploymentId)
    };

    // Create build directory
    mkdirSync(packageInfo.buildPath, { recursive: true });

    // Create package.json
    const packageJson = {
      name: packageInfo.name,
      version: packageInfo.version,
      description: 'Claude Code Security Configuration',
      main: 'index.js',
      files: npmConfig.publishSettings.files || ['*.json', '*.js', 'config/**'],
      keywords: ['claude-code', 'security', 'configuration'],
      publishConfig: {
        registry: npmConfig.registryUrl,
        access: npmConfig.publishSettings.public ? 'public' : 'restricted'
      },
      tags: npmConfig.publishSettings.tags,
      metadata: {
        deploymentId,
        timestamp,
        strategy: 'npm'
      }
    };

    writeFileSync(
      join(packageInfo.buildPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create configuration file
    writeFileSync(
      join(packageInfo.buildPath, 'claude-security.json'),
      JSON.stringify(config, null, 2)
    );

    // Create installation script
    const installScript = this.generateInstallScript();
    writeFileSync(
      join(packageInfo.buildPath, 'install.js'),
      installScript
    );

    // Create README
    const readme = this.generateReadme(packageInfo, config);
    writeFileSync(
      join(packageInfo.buildPath, 'README.md'),
      readme
    );

    return packageInfo;
  }

  /**
   * Publish package to NPM registry
   */
  private async publishPackage(
    packageInfo: PackageInfo,
    npmConfig: NpmConnectionConfig,
    target: DistributionTarget,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', `Publishing package ${packageInfo.name}@${packageInfo.version}`);

    const publishArgs = ['publish', '--registry', npmConfig.registryUrl];
    
    // Add tags
    if (npmConfig.publishSettings.tags.length > 0) {
      publishArgs.push('--tag', npmConfig.publishSettings.tags[0]);
    }

    await this.executeCommand('npm', publishArgs, {
      cwd: packageInfo.buildPath,
      timeout: context.timeout,
      env: this.getAuthEnvironment(target)
    });

    context.onLog?.('info', `Package published successfully`);
  }

  /**
   * Install package on target machine
   */
  private async installPackageOnTarget(
    packageInfo: PackageInfo,
    target: DistributionTarget,
    context: DeploymentContext
  ): Promise<void> {
    const npmConfig = target.connection.config as NpmConnectionConfig;
    
    context.onLog?.('info', `Installing package on target: ${target.name}`);

    // For remote installation, we would use SSH or other remote execution
    // For now, simulate local installation
    const installArgs = [
      'install',
      `${packageInfo.name}@${packageInfo.version}`,
      '--registry', npmConfig.registryUrl,
      '--global' // Install globally for system-wide access
    ];

    await this.executeCommand('npm', installArgs, {
      timeout: context.timeout,
      env: this.getAuthEnvironment(target)
    });

    context.onLog?.('info', `Package installed successfully`);
  }

  /**
   * Verify installation
   */
  private async verifyInstallation(
    packageInfo: PackageInfo,
    target: DistributionTarget,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', 'Verifying installation');

    try {
      // Check if package is installed
      await this.executeCommand('npm', ['list', packageInfo.name, '--global'], {
        timeout: 10000
      });

      // Verify configuration file exists and is valid
      const configPath = await this.getGlobalPackagePath(packageInfo.name);
      if (!existsSync(join(configPath, 'claude-security.json'))) {
        throw new Error('Configuration file not found after installation');
      }

      context.onLog?.('info', 'Installation verified successfully');

    } catch (error) {
      throw new Error(`Installation verification failed: ${error}`);
    }
  }

  /**
   * Get previous package version
   */
  private async getPreviousVersion(packageName: string, npmConfig: NpmConnectionConfig): Promise<string | null> {
    try {
      const result = await this.executeCommand('npm', [
        'view', packageName, 'versions',
        '--registry', npmConfig.registryUrl,
        '--json'
      ]);

      const versions: string[] = JSON.parse(result);
      // Return second-to-last version (previous version)
      return versions.length > 1 ? versions[versions.length - 2] : null;

    } catch (error) {
      return null;
    }
  }

  /**
   * Install specific version
   */
  private async installSpecificVersion(
    packageName: string,
    version: string,
    target: DistributionTarget,
    context: DeploymentContext
  ): Promise<void> {
    const npmConfig = target.connection.config as NpmConnectionConfig;
    
    await this.executeCommand('npm', [
      'install', `${packageName}@${version}`,
      '--registry', npmConfig.registryUrl,
      '--global'
    ], {
      timeout: context.timeout,
      env: this.getAuthEnvironment(target)
    });
  }

  /**
   * Uninstall package
   */
  private async uninstallPackage(
    packageName: string,
    target: DistributionTarget,
    context: DeploymentContext
  ): Promise<void> {
    await this.executeCommand('npm', ['uninstall', packageName, '--global'], {
      timeout: context.timeout
    });
  }

  /**
   * Get authentication environment variables
   */
  private getAuthEnvironment(target: DistributionTarget): Record<string, string> {
    const env: Record<string, string> = { ...process.env };
    
    if (target.connection.auth) {
      const { auth } = target.connection;
      const npmConfig = target.connection.config as NpmConnectionConfig;
      
      if (auth.method === 'api-key') {
        const registryUrl = new URL(npmConfig.registryUrl);
        env[`NPM_TOKEN`] = auth.credentials.key;
        // Set registry-specific auth token
        env[`NPM_CONFIG_${registryUrl.hostname.replace(/\./g, '_').toUpperCase()}_AUTH_TOKEN`] = auth.credentials.key;
      }
    }
    
    return env;
  }

  /**
   * Generate installation script
   */
  private generateInstallScript(): string {
    return `#!/usr/bin/env node
/**
 * Claude Code Security Configuration Installer
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function install() {
  console.log('Installing Claude Code security configuration...');
  
  // Get configuration
  const configPath = path.join(__dirname, 'claude-security.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Determine Claude Code config location
  const claudeConfigDir = process.env.CLAUDE_CONFIG_DIR || 
    path.join(os.homedir(), '.claude');
  
  // Ensure directory exists
  if (!fs.existsSync(claudeConfigDir)) {
    fs.mkdirSync(claudeConfigDir, { recursive: true });
  }
  
  // Install configuration
  const targetPath = path.join(claudeConfigDir, 'settings.json');
  fs.writeFileSync(targetPath, JSON.stringify(config, null, 2));
  
  console.log(\`Configuration installed to: \${targetPath}\`);
  console.log('Claude Code security configuration is now active.');
}

if (require.main === module) {
  install();
}

module.exports = { install };
`;
  }

  /**
   * Generate README
   */
  private generateReadme(packageInfo: PackageInfo, config: ClaudeCodeConfiguration): string {
    return `# Claude Code Security Configuration

This package contains enterprise security configuration for Claude Code.

## Package Information

- **Name**: ${packageInfo.name}
- **Version**: ${packageInfo.version}
- **Deployment ID**: ${packageInfo.deploymentId}

## Configuration

This package configures Claude Code with the following security rules:

- **Deny Rules**: ${config.permissions?.deny?.length || 0} patterns
- **Allow Rules**: ${config.permissions?.allow?.length || 0} patterns
- **Ask Rules**: ${config.permissions?.ask?.length || 0} patterns

## Installation

This package is automatically installed and configured. The configuration is applied to:

- \`~/.claude/settings.json\` (User configuration)
- \`/etc/claude/settings.json\` (System configuration, if applicable)

## Management

This configuration is managed by your organization's security team. Do not modify manually.

For support, contact your IT administrator.

## Verification

To verify the configuration is active:

\`\`\`bash
claude --version
claude --check-config
\`\`\`

## Metadata

- Generated: ${new Date().toISOString()}
- Strategy: NPM Distribution
- Environment: ${config.metadata?.environment || 'unknown'}
`;
  }

  /**
   * Execute command with timeout and error handling
   */
  private executeCommand(
    command: string, 
    args: string[], 
    options: {
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
    } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        env: options.env || process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout || 30000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Get global package installation path
   */
  private async getGlobalPackagePath(packageName: string): Promise<string> {
    const result = await this.executeCommand('npm', ['root', '--global']);
    return join(result, packageName);
  }
}

interface PackageInfo {
  name: string;
  version: string;
  deploymentId: string;
  buildPath: string;
}

interface PackageDeployment {
  deploymentId: string;
  target: DistributionTarget;
  packageInfo: PackageInfo;
  status: 'pending' | 'deploying' | 'completed' | 'failed';
  timestamp: Date;
}