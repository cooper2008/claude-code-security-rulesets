/**
 * Git Distribution Strategy
 * Distributes security configs via Git repositories, submodules, and automated PRs
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';
import type { 
  DistributionTarget, 
  GitConnectionConfig,
  DeploymentError 
} from '../types';
import type { ClaudeCodeConfiguration } from '@/types';
import { IDistributionStrategy, DeploymentContext, StrategyResult } from './manager';

/**
 * Git-based distribution strategy for repository-based deployment
 */
export class GitStrategy implements IDistributionStrategy {
  private deploymentCache = new Map<string, GitDeployment>();

  async deploy(
    target: DistributionTarget,
    config: ClaudeCodeConfiguration,
    context: DeploymentContext
  ): Promise<StrategyResult> {
    context.onLog?.('info', `Starting Git deployment to ${target.name}`);
    
    try {
      const gitConfig = target.connection.config as GitConnectionConfig;
      const deploymentId = crypto.randomUUID();
      
      // Clone or prepare repository
      context.onProgress?.(10);
      const repoPath = await this.prepareRepository(gitConfig, deploymentId, context);
      
      // Create deployment branch
      context.onProgress?.(25);
      const branchName = await this.createDeploymentBranch(repoPath, deploymentId, gitConfig);
      
      // Apply configuration changes
      context.onProgress?.(50);
      await this.applyConfiguration(repoPath, config, gitConfig, context);
      
      // Commit changes
      context.onProgress?.(70);
      await this.commitChanges(repoPath, config, deploymentId, context);
      
      // Deploy based on method
      context.onProgress?.(85);
      const deployResult = await this.deployChanges(repoPath, gitConfig, branchName, context);
      
      context.onProgress?.(100);
      context.onLog?.('info', `Git deployment completed successfully`);
      
      // Cache deployment info
      this.deploymentCache.set(deploymentId, {
        deploymentId,
        target,
        repoPath,
        branchName,
        commitHash: deployResult.commitHash,
        status: 'completed',
        timestamp: new Date()
      });

      return {
        success: true,
        message: `Configuration deployed via ${gitConfig.method} to ${gitConfig.repositoryUrl}`,
        metadata: {
          repository: gitConfig.repositoryUrl,
          branch: branchName,
          commit: deployResult.commitHash,
          method: gitConfig.method
        }
      };

    } catch (error) {
      const deploymentError: DeploymentError = {
        code: 'GIT_DEPLOYMENT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown Git deployment error',
        details: {
          strategy: 'git',
          target: target.name,
          repository: (target.connection.config as GitConnectionConfig).repositoryUrl
        },
        suggestions: [
          'Verify Git repository access and permissions',
          'Check authentication credentials (SSH key, token)',
          'Ensure target branch exists and is writable',
          'Verify Git configuration and network connectivity'
        ]
      };

      context.onLog?.('error', `Git deployment failed: ${deploymentError.message}`);

      return {
        success: false,
        message: deploymentError.message,
        error: deploymentError
      };
    }
  }

  async validateConnectivity(target: DistributionTarget): Promise<void> {
    const gitConfig = target.connection.config as GitConnectionConfig;
    
    try {
      // Test repository access
      const testDir = join(tmpdir(), 'git-test', crypto.randomUUID());
      mkdirSync(testDir, { recursive: true });
      
      await this.executeGitCommand(['clone', '--depth', '1', gitConfig.repositoryUrl, testDir], {
        timeout: 30000
      });
      
      // Test branch access if specified
      if (gitConfig.branch !== 'main' && gitConfig.branch !== 'master') {
        await this.executeGitCommand(['checkout', gitConfig.branch], {
          cwd: testDir,
          timeout: 10000
        });
      }
      
      // Clean up
      await this.executeCommand('rm', ['-rf', testDir]);
      
    } catch (error) {
      throw new Error(`Git connectivity validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async rollback(
    target: DistributionTarget,
    deploymentId: string,
    context: DeploymentContext
  ): Promise<StrategyResult> {
    context.onLog?.('info', `Starting Git rollback for deployment ${deploymentId}`);

    try {
      const deployment = this.deploymentCache.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found in cache`);
      }

      const gitConfig = target.connection.config as GitConnectionConfig;
      
      // Get previous commit
      const previousCommit = await this.getPreviousCommit(deployment.repoPath, deployment.commitHash);
      
      if (previousCommit) {
        // Create rollback branch
        const rollbackBranch = `rollback-${deploymentId}`;
        await this.executeGitCommand(['checkout', '-b', rollbackBranch, previousCommit], {
          cwd: deployment.repoPath
        });
        
        // Deploy rollback
        await this.deployChanges(deployment.repoPath, gitConfig, rollbackBranch, context);
        
        context.onLog?.('info', `Rolled back to commit ${previousCommit}`);
      } else {
        // Revert the deployment commit
        await this.executeGitCommand(['revert', deployment.commitHash], {
          cwd: deployment.repoPath
        });
        
        // Push revert commit
        await this.executeGitCommand(['push', 'origin', gitConfig.branch], {
          cwd: deployment.repoPath
        });
        
        context.onLog?.('info', 'Deployment reverted');
      }

      return {
        success: true,
        message: `Rollback completed ${previousCommit ? `to ${previousCommit}` : '(reverted)'}`,
        metadata: { previousCommit }
      };

    } catch (error) {
      return {
        success: false,
        message: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
        error: {
          code: 'ROLLBACK_FAILED',
          message: error instanceof Error ? error.message : String(error),
          details: { deploymentId },
          suggestions: ['Check Git repository state', 'Verify branch permissions']
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

    // Check if commit still exists in repository
    try {
      await this.executeGitCommand(['cat-file', '-e', deployment.commitHash], {
        cwd: deployment.repoPath,
        timeout: 5000
      });
      
      return {
        status: deployment.status,
        progress: deployment.status === 'completed' ? 100 : 0,
        message: `Commit ${deployment.commitHash} on branch ${deployment.branchName}`
      };
    } catch {
      return {
        status: 'failed',
        progress: 0,
        message: 'Deployment commit not found in repository'
      };
    }
  }

  /**
   * Prepare Git repository for deployment
   */
  private async prepareRepository(
    gitConfig: GitConnectionConfig,
    deploymentId: string,
    context: DeploymentContext
  ): Promise<string> {
    const repoPath = join(tmpdir(), 'claude-git-deploy', deploymentId);
    mkdirSync(dirname(repoPath), { recursive: true });

    context.onLog?.('info', `Cloning repository: ${gitConfig.repositoryUrl}`);

    // Clone repository
    await this.executeGitCommand([
      'clone',
      '--branch', gitConfig.branch,
      gitConfig.repositoryUrl,
      repoPath
    ], { timeout: 60000 });

    // Configure Git user (required for commits)
    await this.executeGitCommand(['config', 'user.email', 'claude-deploy@example.com'], {
      cwd: repoPath
    });
    await this.executeGitCommand(['config', 'user.name', 'Claude Deploy'], {
      cwd: repoPath
    });

    return repoPath;
  }

  /**
   * Create deployment branch
   */
  private async createDeploymentBranch(
    repoPath: string,
    deploymentId: string,
    gitConfig: GitConnectionConfig
  ): Promise<string> {
    const branchName = gitConfig.method === 'pull-request' 
      ? `claude-deploy-${deploymentId}`
      : gitConfig.branch;

    if (gitConfig.method === 'pull-request') {
      // Create new branch for PR
      await this.executeGitCommand(['checkout', '-b', branchName], {
        cwd: repoPath
      });
    }

    return branchName;
  }

  /**
   * Apply configuration to repository
   */
  private async applyConfiguration(
    repoPath: string,
    config: ClaudeCodeConfiguration,
    gitConfig: GitConnectionConfig,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', 'Applying configuration changes');

    const targetPath = join(repoPath, gitConfig.targetPath);
    const targetDir = dirname(targetPath);

    // Ensure target directory exists
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // Write configuration file
    writeFileSync(targetPath, JSON.stringify(config, null, 2));

    // Create deployment metadata
    const metadataPath = join(dirname(targetPath), '.claude-deploy-metadata.json');
    const metadata = {
      deploymentId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      strategy: 'git',
      method: gitConfig.method,
      configHash: crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex')
    };

    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Install Git hooks if specified
    if (gitConfig.hooks && gitConfig.hooks.length > 0) {
      await this.installGitHooks(repoPath, gitConfig.hooks, context);
    }
  }

  /**
   * Commit changes to repository
   */
  private async commitChanges(
    repoPath: string,
    config: ClaudeCodeConfiguration,
    deploymentId: string,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', 'Committing configuration changes');

    // Add all changes
    await this.executeGitCommand(['add', '.'], { cwd: repoPath });

    // Check if there are changes to commit
    try {
      await this.executeGitCommand(['diff', '--cached', '--quiet'], { cwd: repoPath });
      context.onLog?.('info', 'No changes to commit');
      return;
    } catch {
      // Changes exist, continue with commit
    }

    // Create commit message
    const ruleCount = (config.permissions?.deny?.length || 0) + 
                     (config.permissions?.allow?.length || 0) + 
                     (config.permissions?.ask?.length || 0);
    
    const commitMessage = `Deploy Claude Code security configuration

- Deployment ID: ${deploymentId}
- Rules: ${ruleCount} total
- Environment: ${config.metadata?.environment || 'unknown'}
- Generated: ${new Date().toISOString()}

[claude-deploy]`;

    // Commit changes
    await this.executeGitCommand(['commit', '-m', commitMessage], {
      cwd: repoPath
    });

    context.onLog?.('info', 'Changes committed successfully');
  }

  /**
   * Deploy changes based on configured method
   */
  private async deployChanges(
    repoPath: string,
    gitConfig: GitConnectionConfig,
    branchName: string,
    context: DeploymentContext
  ): Promise<{ commitHash: string }> {
    const commitHash = await this.executeGitCommand(['rev-parse', 'HEAD'], {
      cwd: repoPath
    });

    switch (gitConfig.method) {
      case 'direct-push':
        await this.deployDirectPush(repoPath, gitConfig, branchName, context);
        break;
      case 'pull-request':
        await this.deployPullRequest(repoPath, gitConfig, branchName, context);
        break;
      case 'submodule':
        await this.deploySubmodule(repoPath, gitConfig, context);
        break;
      case 'subtree':
        await this.deploySubtree(repoPath, gitConfig, context);
        break;
      default:
        throw new Error(`Unsupported Git deployment method: ${gitConfig.method}`);
    }

    return { commitHash: commitHash.trim() };
  }

  /**
   * Deploy via direct push
   */
  private async deployDirectPush(
    repoPath: string,
    gitConfig: GitConnectionConfig,
    branchName: string,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', `Pushing directly to ${branchName}`);

    await this.executeGitCommand(['push', 'origin', branchName], {
      cwd: repoPath,
      timeout: 60000
    });

    context.onLog?.('info', 'Direct push completed');
  }

  /**
   * Deploy via pull request
   */
  private async deployPullRequest(
    repoPath: string,
    gitConfig: GitConnectionConfig,
    branchName: string,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', `Creating pull request from ${branchName}`);

    // Push branch
    await this.executeGitCommand(['push', 'origin', branchName], {
      cwd: repoPath,
      timeout: 60000
    });

    // Note: In a real implementation, you would use GitHub/GitLab/etc. API to create PR
    // This is a simplified implementation
    context.onLog?.('info', `Branch ${branchName} pushed - create PR manually or via API`);
  }

  /**
   * Deploy via Git submodule
   */
  private async deploySubmodule(
    repoPath: string,
    gitConfig: GitConnectionConfig,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', 'Deploying as Git submodule');
    
    // Push current repository
    await this.executeGitCommand(['push', 'origin', gitConfig.branch], {
      cwd: repoPath,
      timeout: 60000
    });

    context.onLog?.('info', 'Submodule deployment completed');
  }

  /**
   * Deploy via Git subtree
   */
  private async deploySubtree(
    repoPath: string,
    gitConfig: GitConnectionConfig,
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', 'Deploying as Git subtree');
    
    // Push current repository
    await this.executeGitCommand(['push', 'origin', gitConfig.branch], {
      cwd: repoPath,
      timeout: 60000
    });

    context.onLog?.('info', 'Subtree deployment completed');
  }

  /**
   * Install Git hooks
   */
  private async installGitHooks(
    repoPath: string,
    hooks: string[],
    context: DeploymentContext
  ): Promise<void> {
    context.onLog?.('info', `Installing Git hooks: ${hooks.join(', ')}`);

    const hooksDir = join(repoPath, '.git', 'hooks');

    for (const hookName of hooks) {
      const hookPath = join(hooksDir, hookName);
      const hookContent = this.generateHookScript(hookName);
      
      writeFileSync(hookPath, hookContent, { mode: 0o755 });
    }

    context.onLog?.('info', 'Git hooks installed successfully');
  }

  /**
   * Generate Git hook script
   */
  private generateHookScript(hookName: string): string {
    const baseScript = `#!/bin/bash
# Claude Code Security Configuration Git Hook: ${hookName}

echo "Claude Code: Validating security configuration..."

# Find configuration files
CONFIG_FILES=$(find . -name "claude-security.json" -o -name "settings.json" | grep -v node_modules | grep -v .git)

if [ -n "$CONFIG_FILES" ]; then
    echo "Found configuration files:"
    echo "$CONFIG_FILES"
    
    # Validate each configuration file
    for config_file in $CONFIG_FILES; do
        echo "Validating $config_file..."
        
        # Check if file is valid JSON
        if ! jq empty "$config_file" 2>/dev/null; then
            echo "ERROR: $config_file is not valid JSON"
            exit 1
        fi
        
        # Check for required fields
        if ! jq -e '.permissions' "$config_file" >/dev/null; then
            echo "ERROR: $config_file missing required 'permissions' field"
            exit 1
        fi
        
        echo "$config_file is valid"
    done
    
    echo "All configuration files validated successfully"
else
    echo "No Claude Code configuration files found"
fi

exit 0
`;

    return baseScript;
  }

  /**
   * Get previous commit hash
   */
  private async getPreviousCommit(repoPath: string, currentCommit: string): Promise<string | null> {
    try {
      const result = await this.executeGitCommand(['rev-parse', `${currentCommit}^`], {
        cwd: repoPath,
        timeout: 5000
      });
      return result.trim();
    } catch {
      return null;
    }
  }

  /**
   * Execute Git command
   */
  private async executeGitCommand(
    args: string[],
    options: { cwd?: string; timeout?: number } = {}
  ): Promise<string> {
    return this.executeCommand('git', args, options);
  }

  /**
   * Execute command with timeout and error handling
   */
  private executeCommand(
    command: string,
    args: string[],
    options: { cwd?: string; timeout?: number } = {}
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
          reject(new Error(`Git command failed with code ${code}: ${stderr || stdout}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
}

interface GitDeployment {
  deploymentId: string;
  target: DistributionTarget;
  repoPath: string;
  branchName: string;
  commitHash: string;
  status: 'pending' | 'deploying' | 'completed' | 'failed';
  timestamp: Date;
}