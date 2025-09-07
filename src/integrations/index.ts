/**
 * Claude Code Security Rulesets Generator - Integration Module
 * 
 * This module provides comprehensive integration capabilities for Git workflows
 * and CI/CD platforms, enabling seamless security validation in developer workflows.
 * 
 * Key Features:
 * - Git hook management (pre-commit, pre-push, post-merge, post-checkout)
 * - CI/CD platform integrations (GitHub Actions, GitLab CI, Jenkins, Azure DevOps, CircleCI)
 * - Developer workflow automation
 * - Security validation automation
 * - Emergency bypass mechanisms
 * - Multi-platform support
 */

// Core Integration Classes
export { GitIntegration, createGitIntegration } from './git';
export { CICDIntegration, createCICDIntegration } from './ci-cd';

// Utility Functions
export { 
  checkGitAvailability,
  getGitUserInfo,
  validateTemplateVariables,
  substituteTemplateVariables
} from './git';

// Type Exports
export type {
  // Git Integration Types
  GitHookConfig,
  GitIntegrationOptions,
  GitHookInstallResult,
  GitIntegrationResult,
  HookValidationOptions,
  HookExecutionContext,
  
  // CI/CD Integration Types
  CIPlatform,
  CITemplate,
  CIIntegrationConfig,
  CIIntegrationResult,
  TemplateVariable,
  
  // Developer Workflow Types
  DeveloperWorkflowConfig,
  WorkflowIntegrationStatus
} from '../types';

// Re-export validation engine for convenience
export { ValidationEngine } from '../validation/engine';

/**
 * Integration Manager - Main orchestrator for all integrations
 * Provides a unified interface for managing Git hooks and CI/CD integrations
 */
export class IntegrationManager {
  private gitIntegration: GitIntegration;
  private cicdIntegration: CICDIntegration;

  constructor(validationEngine?: import('../validation/engine').ValidationEngine) {
    this.gitIntegration = createGitIntegration(validationEngine);
    this.cicdIntegration = createCICDIntegration();
  }

  /**
   * Get Git integration instance
   */
  get git(): GitIntegration {
    return this.gitIntegration;
  }

  /**
   * Get CI/CD integration instance
   */
  get cicd(): CICDIntegration {
    return this.cicdIntegration;
  }

  /**
   * Quick setup for a repository - installs basic Git hooks and detects CI/CD
   */
  async quickSetup(options: {
    repoPath: string;
    installGitHooks?: boolean;
    detectCI?: boolean;
    generateCIConfig?: boolean;
    platform?: import('../types').CIPlatform;
  }): Promise<{
    gitSetup: import('../types').GitIntegrationResult | null;
    ciDetection: {
      platform: import('../types').CIPlatform | null;
      configFile: string | null;
      isClaudeCodeEnabled: boolean;
    } | null;
    ciSetup: import('../types').CIIntegrationResult | null;
    recommendations: string[];
  }> {
    const result = {
      gitSetup: null as import('../types').GitIntegrationResult | null,
      ciDetection: null as { platform: import('../types').CIPlatform | null; configFile: string | null; isClaudeCodeEnabled: boolean; } | null,
      ciSetup: null as import('../types').CIIntegrationResult | null,
      recommendations: [] as string[]
    };

    // Install Git hooks if requested
    if (options.installGitHooks !== false) {
      try {
        result.gitSetup = await this.gitIntegration.quickSetup(options.repoPath);
        
        if (result.gitSetup.success) {
          result.recommendations.push('✅ Git hooks installed successfully');
          result.recommendations.push('Commits and pushes will now be validated for security compliance');
        } else {
          result.recommendations.push('⚠️ Git hook installation had issues - review the errors');
        }
      } catch (error) {
        result.recommendations.push(`❌ Failed to install Git hooks: ${error}`);
      }
    }

    // Detect existing CI/CD setup
    if (options.detectCI !== false) {
      try {
        result.ciDetection = await this.cicdIntegration.detectExistingCI(options.repoPath);
        
        if (result.ciDetection.platform) {
          if (result.ciDetection.isClaudeCodeEnabled) {
            result.recommendations.push(`✅ ${result.ciDetection.platform} CI/CD detected with Claude Code already configured`);
          } else {
            result.recommendations.push(`🔧 ${result.ciDetection.platform} CI/CD detected but Claude Code not configured`);
            result.recommendations.push('Consider updating your CI/CD configuration to include security validation');
          }
        } else {
          result.recommendations.push('No existing CI/CD configuration detected');
          if (options.generateCIConfig && options.platform) {
            result.recommendations.push(`Consider setting up ${options.platform} CI/CD for automated validation`);
          }
        }
      } catch (error) {
        result.recommendations.push(`⚠️ Failed to detect CI/CD configuration: ${error}`);
      }
    }

    // Generate CI/CD configuration if requested
    if (options.generateCIConfig && options.platform && (!result.ciDetection?.platform || !result.ciDetection.isClaudeCodeEnabled)) {
      try {
        const template = this.cicdIntegration.getTemplatesForPlatform(options.platform)[0];
        
        if (template) {
          const ciConfig: import('../types').CIIntegrationConfig = {
            platform: options.platform,
            projectPath: options.repoPath,
            template: template.name,
            variables: {},
            overwriteExisting: false
          };

          result.ciSetup = await this.cicdIntegration.integrateCI(ciConfig);
          
          if (result.ciSetup.success) {
            result.recommendations.push(`✅ ${options.platform} CI/CD configuration generated`);
            result.recommendations.push(`Configuration saved to: ${result.ciSetup.configPath}`);
            result.recommendations.push(...result.ciSetup.nextSteps);
          } else {
            result.recommendations.push(`❌ Failed to generate ${options.platform} CI/CD configuration`);
            result.recommendations.push(...result.ciSetup.errors);
          }
        } else {
          result.recommendations.push(`❌ No template available for platform: ${options.platform}`);
        }
      } catch (error) {
        result.recommendations.push(`❌ Failed to generate CI/CD configuration: ${error}`);
      }
    }

    // Add general recommendations
    if (result.recommendations.length === 0) {
      result.recommendations.push('No actions were performed - consider enabling Git hooks or CI/CD integration');
    }

    result.recommendations.push('');
    result.recommendations.push('📚 Next Steps:');
    result.recommendations.push('1. Test the setup by making a commit');
    result.recommendations.push('2. Review and customize .claude-code.json configuration');
    result.recommendations.push('3. Set up team notification channels');
    result.recommendations.push('4. Consider compliance framework integration');

    return result;
  }

  /**
   * Check overall integration status for a repository
   */
  async getIntegrationStatus(repoPath: string): Promise<import('../types').WorkflowIntegrationStatus> {
    const [gitStatus, ciDetection] = await Promise.all([
      this.gitIntegration.checkHookStatus(repoPath),
      this.cicdIntegration.detectExistingCI(repoPath)
    ]);

    // Determine configuration health
    let configHealth: 'healthy' | 'warnings' | 'errors' | 'unknown' = 'unknown';
    
    try {
      // This would typically run a quick validation to determine health
      configHealth = 'healthy'; // Simplified for now
    } catch (error) {
      configHealth = 'errors';
    }

    return {
      hooksInstalled: gitStatus.installed,
      cicdConfigured: ciDetection.platform !== null && ciDetection.isClaudeCodeEnabled,
      configHealth,
      lastValidation: undefined // Would be populated from cache/logs in real implementation
    };
  }

  /**
   * Remove all integrations from a repository
   */
  async removeIntegrations(repoPath: string): Promise<{
    gitRemoval: import('../types').GitIntegrationResult;
    recommendations: string[];
  }> {
    const gitRemoval = await this.gitIntegration.removeHooks(repoPath);
    
    const recommendations = [
      gitRemoval.success ? '✅ Git hooks removed successfully' : '❌ Failed to remove some Git hooks',
      '⚠️ CI/CD configurations must be removed manually',
      '💡 Consider keeping .claude-code.json for future use'
    ];

    return { gitRemoval, recommendations };
  }

  /**
   * Update integrations to the latest version
   */
  async updateIntegrations(repoPath: string): Promise<{
    updated: boolean;
    changes: string[];
    errors: string[];
  }> {
    const result = {
      updated: false,
      changes: [] as string[],
      errors: [] as string[]
    };

    try {
      // Check current hook status
      const hookStatus = await this.gitIntegration.checkHookStatus(repoPath);
      
      if (hookStatus.installed) {
        // Re-install hooks to update them
        const reinstallResult = await this.gitIntegration.quickSetup(repoPath);
        
        if (reinstallResult.success) {
          result.updated = true;
          result.changes.push('Git hooks updated to latest version');
        } else {
          result.errors.push(...reinstallResult.errors);
        }
      }

      // Check for CI/CD updates
      const ciDetection = await this.cicdIntegration.detectExistingCI(repoPath);
      if (ciDetection.platform && ciDetection.isClaudeCodeEnabled) {
        result.changes.push('CI/CD configuration detected - manual update may be needed');
      }

    } catch (error) {
      result.errors.push(`Update failed: ${error}`);
    }

    return result;
  }
}

/**
 * Create a new Integration Manager instance
 */
export function createIntegrationManager(
  validationEngine?: import('../validation/engine').ValidationEngine
): IntegrationManager {
  return new IntegrationManager(validationEngine);
}

/**
 * Utility function to get available CI/CD platforms
 */
export function getAvailablePlatforms(): import('../types').CIPlatform[] {
  return ['github', 'gitlab', 'jenkins', 'azure', 'circleci'];
}

/**
 * Utility function to validate integration requirements
 */
export async function validateIntegrationRequirements(): Promise<{
  gitAvailable: boolean;
  nodeAvailable: boolean;
  npmAvailable: boolean;
  recommendations: string[];
}> {
  const result = {
    gitAvailable: false,
    nodeAvailable: false,
    npmAvailable: false,
    recommendations: [] as string[]
  };

  // Check Git availability
  try {
    result.gitAvailable = checkGitAvailability();
    if (result.gitAvailable) {
      result.recommendations.push('✅ Git is available');
    }
  } catch (error) {
    result.recommendations.push('❌ Git not found - install Git to use hook integration');
  }

  // Check Node.js availability
  try {
    const { execSync } = await import('child_process');
    execSync('node --version', { stdio: 'ignore' });
    result.nodeAvailable = true;
    result.recommendations.push('✅ Node.js is available');
  } catch (error) {
    result.recommendations.push('❌ Node.js not found - install Node.js for full functionality');
  }

  // Check npm availability
  try {
    const { execSync } = await import('child_process');
    execSync('npm --version', { stdio: 'ignore' });
    result.npmAvailable = true;
    result.recommendations.push('✅ npm is available');
  } catch (error) {
    result.recommendations.push('❌ npm not found - required for Claude Code installation');
  }

  return result;
}

// Default export for convenience
export default IntegrationManager;