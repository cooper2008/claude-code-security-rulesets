/**
 * SSH Distribution Strategy
 * Distributes security configs via SSH/SCP/SFTP to developer machines
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';
import type { 
  DistributionTarget, 
  SshConnectionConfig,
  DeploymentError 
} from '../types';
import type { ClaudeCodeConfiguration } from '@/types';
import { IDistributionStrategy, DeploymentContext, StrategyResult } from './manager';

/**
 * SSH-based distribution strategy for direct machine deployment
 */
export class SshStrategy implements IDistributionStrategy {
  private deploymentCache = new Map<string, SshDeployment>();

  async deploy(
    target: DistributionTarget,
    config: ClaudeCodeConfiguration,
    context: DeploymentContext
  ): Promise<StrategyResult> {
    context.onLog?.('info', `Starting SSH deployment to ${target.name}`);
    
    try {
      const sshConfig = target.connection.config as SshConnectionConfig;
      const deploymentId = crypto.randomUUID();
      
      // Create deployment package
      const packagePath = await this.createDeploymentPackage(config, deploymentId);
      
      // Test SSH connectivity
      context.onProgress?.(10);
      await this.testConnectivity(sshConfig, context);
      
      // Upload configuration files
      context.onProgress?.(30);
      await this.uploadFiles(packagePath, sshConfig, target, context);
      
      // Execute installation script
      context.onProgress?.(70);
      await this.executeInstallation(sshConfig, target, context);
      
      // Verify installation
      context.onProgress?.(90);
      await this.verifyInstallation(sshConfig, target, context);
      
      context.onProgress?.(100);
      context.onLog?.('info', `SSH deployment completed successfully`);
      
      // Cache deployment info
      this.deploymentCache.set(deploymentId, {
        deploymentId,
        target,
        packagePath,
        status: 'completed',
        timestamp: new Date(),
        remoteConfigPath: join(sshConfig.targetPath, 'claude-security.json')
      });

      return {
        success: true,
        message: `Configuration deployed to ${sshConfig.host}:${sshConfig.targetPath}`,
        metadata: {
          host: sshConfig.host,
          targetPath: sshConfig.targetPath,
          method: sshConfig.method
        }
      };

    } catch (error) {
      const deploymentError: DeploymentError = {
        code: 'SSH_DEPLOYMENT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown SSH deployment error',
        details: {
          strategy: 'ssh',
          target: target.name,
          host: (target.connection.config as SshConnectionConfig).host
        },
        suggestions: [
          'Verify SSH connectivity and credentials',
          'Check target directory permissions',
          'Ensure SSH key is properly configured',
          'Verify network connectivity to target host'
        ]
      };

      context.onLog?.('error', `SSH deployment failed: ${deploymentError.message}`);

      return {
        success: false,
        message: deploymentError.message,
        error: deploymentError
      };
    }
  }

  async validateConnectivity(target: DistributionTarget): Promise<void> {
    const sshConfig = target.connection.config as SshConnectionConfig;
    
    try {
      // Test basic SSH connectivity
      await this.executeSshCommand(
        sshConfig,
        'echo "SSH connection test"',
        { timeout: 10000 }
      );
      
      // Test target directory access
      await this.executeSshCommand(
        sshConfig,
        `test -d "${dirname(sshConfig.targetPath)}" || mkdir -p "${dirname(sshConfig.targetPath)}"`,
        { timeout: 5000 }
      );

      // Test write permissions
      const testFile = join(sshConfig.targetPath, '.write-test');
      await this.executeSshCommand(
        sshConfig,
        `echo "test" > "${testFile}" && rm "${testFile}"`,
        { timeout: 5000 }
      );

    } catch (error) {
      throw new Error(`SSH connectivity validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async rollback(
    target: DistributionTarget,
    deploymentId: string,
    context: DeploymentContext
  ): Promise<StrategyResult> {
    context.onLog?.('info', `Starting SSH rollback for deployment ${deploymentId}`);

    try {
      const deployment = this.deploymentCache.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found in cache`);
      }

      const sshConfig = target.connection.config as SshConnectionConfig;
      
      // Check for backup file
      const backupPath = `${deployment.remoteConfigPath}.backup`;
      const backupExists = await this.checkFileExists(sshConfig, backupPath);
      
      if (backupExists) {
        // Restore from backup
        await this.executeSshCommand(
          sshConfig,
          `cp "${backupPath}" "${deployment.remoteConfigPath}"`,
          { timeout: 10000 }
        );
        
        context.onLog?.('info', 'Configuration restored from backup');
      } else {
        // Remove current configuration
        await this.executeSshCommand(
          sshConfig,
          `rm -f "${deployment.remoteConfigPath}"`,
          { timeout: 10000 }
        );
        
        context.onLog?.('info', 'Configuration removed (no backup available)');
      }

      return {
        success: true,
        message: `Rollback completed ${backupExists ? '(restored from backup)' : '(configuration removed)'}`,
        metadata: { backupRestored: backupExists }
      };

    } catch (error) {
      return {
        success: false,
        message: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
        error: {
          code: 'ROLLBACK_FAILED',
          message: error instanceof Error ? error.message : String(error),
          details: { deploymentId },
          suggestions: ['Check SSH connectivity', 'Verify file permissions']
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

    // Check if configuration is still active on target
    try {
      const sshConfig = target.connection.config as SshConnectionConfig;
      const configExists = await this.checkFileExists(sshConfig, deployment.remoteConfigPath);
      
      return {
        status: configExists ? deployment.status : 'failed',
        progress: deployment.status === 'completed' ? 100 : 0,
        message: configExists ? 'Configuration active' : 'Configuration missing on target'
      };
    } catch {
      return {
        status: 'failed',
        progress: 0,
        message: 'Cannot verify deployment status'
      };
    }
  }

  /**
   * Create deployment package
   */
  private async createDeploymentPackage(
    config: ClaudeCodeConfiguration,
    deploymentId: string
  ): Promise<string> {
    const packageDir = join(tmpdir(), 'claude-deploy', deploymentId);
    mkdirSync(packageDir, { recursive: true });

    // Create configuration file
    const configPath = join(packageDir, 'claude-security.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Create installation script
    const installScript = this.generateInstallScript();
    const scriptPath = join(packageDir, 'install.sh');
    writeFileSync(scriptPath, installScript);

    // Create uninstall script
    const uninstallScript = this.generateUninstallScript();
    const uninstallPath = join(packageDir, 'uninstall.sh');
    writeFileSync(uninstallPath, uninstallScript);

    // Create deployment manifest
    const manifest = {
      deploymentId,
      timestamp: new Date().toISOString(),
      strategy: 'ssh',
      files: ['claude-security.json', 'install.sh', 'uninstall.sh'],
      configHash: crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex')
    };
    
    writeFileSync(
      join(packageDir, 'deployment-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    return packageDir;
  }

  /**
   * Test SSH connectivity
   */
  private async testConnectivity(
    sshConfig: SshConnectionConfig,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', `Testing SSH connectivity to ${sshConfig.host}`);
    
    try {
      const result = await this.executeSshCommand(
        sshConfig,
        'echo "Connection successful"',
        { timeout: 10000 }
      );
      
      if (result.trim() !== 'Connection successful') {
        throw new Error('Unexpected response from SSH test');
      }
      
      context.onLog?.('info', 'SSH connectivity verified');
    } catch (error) {
      throw new Error(`SSH connectivity test failed: ${error}`);
    }
  }

  /**
   * Upload files to target
   */
  private async uploadFiles(
    packagePath: string,
    sshConfig: SshConnectionConfig,
    target: DistributionTarget,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', 'Uploading deployment package');

    // Create target directory
    await this.executeSshCommand(
      sshConfig,
      `mkdir -p "${sshConfig.targetPath}"`,
      { timeout: 10000 }
    );

    // Upload files based on configured method
    switch (sshConfig.method) {
      case 'scp':
        await this.uploadWithScp(packagePath, sshConfig);
        break;
      case 'sftp':
        await this.uploadWithSftp(packagePath, sshConfig);
        break;
      case 'rsync':
        await this.uploadWithRsync(packagePath, sshConfig);
        break;
      default:
        await this.uploadWithScp(packagePath, sshConfig);
    }

    context.onLog?.('info', 'Files uploaded successfully');
  }

  /**
   * Execute installation on target
   */
  private async executeInstallation(
    sshConfig: SshConnectionConfig,
    target: DistributionTarget,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', 'Executing installation script');

    // Create backup of existing configuration
    const configPath = join(sshConfig.targetPath, 'claude-security.json');
    const backupPath = `${configPath}.backup.${Date.now()}`;
    
    await this.executeSshCommand(
      sshConfig,
      `if [ -f "${configPath}" ]; then cp "${configPath}" "${backupPath}"; fi`,
      { timeout: 10000 }
    );

    // Make installation script executable and run it
    const scriptPath = join(sshConfig.targetPath, 'install.sh');
    await this.executeSshCommand(
      sshConfig,
      `chmod +x "${scriptPath}" && cd "${sshConfig.targetPath}" && ./install.sh`,
      { timeout: 30000 }
    );

    context.onLog?.('info', 'Installation completed');
  }

  /**
   * Verify installation
   */
  private async verifyInstallation(
    sshConfig: SshConnectionConfig,
    target: DistributionTarget,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', 'Verifying installation');

    // Check if configuration file exists
    const configPath = join(sshConfig.targetPath, 'claude-security.json');
    const configExists = await this.checkFileExists(sshConfig, configPath);
    
    if (!configExists) {
      throw new Error('Configuration file not found after installation');
    }

    // Verify configuration file is valid JSON
    try {
      const configContent = await this.executeSshCommand(
        sshConfig,
        `cat "${configPath}"`,
        { timeout: 10000 }
      );
      
      JSON.parse(configContent);
    } catch (error) {
      throw new Error('Configuration file is not valid JSON');
    }

    context.onLog?.('info', 'Installation verified successfully');
  }

  /**
   * Upload files using SCP
   */
  private async uploadWithScp(packagePath: string, sshConfig: SshConnectionConfig): Promise<void> {
    const scpArgs = [
      '-r',
      '-P', sshConfig.port.toString(),
      `${packagePath}/*`,
      `${sshConfig.username}@${sshConfig.host}:${sshConfig.targetPath}/`
    ];

    if (sshConfig.keyPath) {
      scpArgs.unshift('-i', sshConfig.keyPath);
    }

    await this.executeCommand('scp', scpArgs, { timeout: 60000 });
  }

  /**
   * Upload files using RSYNC
   */
  private async uploadWithRsync(packagePath: string, sshConfig: SshConnectionConfig): Promise<void> {
    const rsyncArgs = [
      '-avz',
      '-e', `ssh -p ${sshConfig.port}${sshConfig.keyPath ? ` -i ${sshConfig.keyPath}` : ''}`,
      `${packagePath}/`,
      `${sshConfig.username}@${sshConfig.host}:${sshConfig.targetPath}/`
    ];

    await this.executeCommand('rsync', rsyncArgs, { timeout: 60000 });
  }

  /**
   * Upload files using SFTP (simplified implementation)
   */
  private async uploadWithSftp(packagePath: string, sshConfig: SshConnectionConfig): Promise<void> {
    // For simplicity, fall back to SCP for now
    // In a real implementation, you would use SFTP protocol
    await this.uploadWithScp(packagePath, sshConfig);
  }

  /**
   * Check if file exists on remote host
   */
  private async checkFileExists(sshConfig: SshConnectionConfig, filePath: string): Promise<boolean> {
    try {
      await this.executeSshCommand(
        sshConfig,
        `test -f "${filePath}"`,
        { timeout: 5000 }
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute SSH command
   */
  private async executeSshCommand(
    sshConfig: SshConnectionConfig,
    command: string,
    options: { timeout?: number } = {}
  ): Promise<string> {
    const sshArgs = [
      '-p', sshConfig.port.toString(),
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null'
    ];

    if (sshConfig.keyPath) {
      sshArgs.push('-i', sshConfig.keyPath);
    }

    sshArgs.push(`${sshConfig.username}@${sshConfig.host}`, command);

    return this.executeCommand('ssh', sshArgs, options);
  }

  /**
   * Generate installation script
   */
  private generateInstallScript(): string {
    return `#!/bin/bash
# Claude Code Security Configuration Installer

set -e

echo "Installing Claude Code security configuration..."

# Get current directory
INSTALL_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$INSTALL_DIR/claude-security.json"

# Determine Claude Code config directory
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
    CLAUDE_DIR="$CLAUDE_CONFIG_DIR"
elif [ -d "$HOME/.claude" ]; then
    CLAUDE_DIR="$HOME/.claude"
else
    CLAUDE_DIR="/etc/claude"
    # Create system-wide directory if needed
    if [ ! -d "$CLAUDE_DIR" ]; then
        if [ "$EUID" -eq 0 ]; then
            mkdir -p "$CLAUDE_DIR"
        else
            echo "Warning: Cannot create system directory $CLAUDE_DIR without root access"
            CLAUDE_DIR="$HOME/.claude"
            mkdir -p "$CLAUDE_DIR"
        fi
    fi
fi

# Create config directory if it doesn't exist
mkdir -p "$CLAUDE_DIR"

# Install configuration
TARGET_CONFIG="$CLAUDE_DIR/settings.json"

# Backup existing configuration
if [ -f "$TARGET_CONFIG" ]; then
    cp "$TARGET_CONFIG" "$TARGET_CONFIG.backup.$(date +%s)"
    echo "Existing configuration backed up"
fi

# Install new configuration
cp "$CONFIG_FILE" "$TARGET_CONFIG"

echo "Configuration installed to: $TARGET_CONFIG"
echo "Claude Code security configuration is now active."

# Set appropriate permissions
chmod 600 "$TARGET_CONFIG"

# Verify installation
if [ -f "$TARGET_CONFIG" ]; then
    echo "Installation successful!"
else
    echo "Installation failed: Configuration file not found"
    exit 1
fi
`;
  }

  /**
   * Generate uninstall script
   */
  private generateUninstallScript(): string {
    return `#!/bin/bash
# Claude Code Security Configuration Uninstaller

set -e

echo "Uninstalling Claude Code security configuration..."

# Determine Claude Code config directory
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
    CLAUDE_DIR="$CLAUDE_CONFIG_DIR"
elif [ -d "$HOME/.claude" ]; then
    CLAUDE_DIR="$HOME/.claude"
else
    CLAUDE_DIR="/etc/claude"
fi

TARGET_CONFIG="$CLAUDE_DIR/settings.json"

if [ -f "$TARGET_CONFIG" ]; then
    # Look for most recent backup
    BACKUP_FILE=$(ls -t "$TARGET_CONFIG.backup."* 2>/dev/null | head -n1 || echo "")
    
    if [ -n "$BACKUP_FILE" ]; then
        echo "Restoring from backup: $BACKUP_FILE"
        cp "$BACKUP_FILE" "$TARGET_CONFIG"
    else
        echo "No backup found, removing configuration"
        rm "$TARGET_CONFIG"
    fi
    
    echo "Uninstallation completed"
else
    echo "No configuration found to uninstall"
fi
`;
  }

  /**
   * Execute command with timeout and error handling
   */
  private executeCommand(
    command: string,
    args: string[],
    options: { timeout?: number; cwd?: string } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
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
}

interface SshDeployment {
  deploymentId: string;
  target: DistributionTarget;
  packagePath: string;
  status: 'pending' | 'deploying' | 'completed' | 'failed';
  timestamp: Date;
  remoteConfigPath: string;
}