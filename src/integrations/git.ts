import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import {
  GitHookConfig,
  GitIntegrationOptions,
  GitHookInstallResult,
  GitIntegrationResult,
  HookValidationOptions,
  HookExecutionContext,
  ClaudeCodeConfiguration,
  ValidationResult
} from '../types';
import { ValidationEngine } from '../validation/engine';

/**
 * Git Integration Manager
 * Provides seamless integration with Git workflows through hooks and validation
 */
export class GitIntegration {
  private validationEngine: ValidationEngine;
  private defaultHooks: GitHookConfig[];

  constructor(validationEngine?: ValidationEngine) {
    this.validationEngine = validationEngine || new ValidationEngine();
    this.defaultHooks = this.getDefaultHooks();
  }

  /**
   * Get default Git hooks configuration
   */
  private getDefaultHooks(): GitHookConfig[] {
    return [
      {
        hookName: 'pre-commit',
        enabled: true,
        allowBypass: true,
        bypassFlag: '--no-verify',
        scriptContent: this.generateHookScript('pre-commit')
      },
      {
        hookName: 'pre-push',
        enabled: true,
        allowBypass: true,
        bypassFlag: '--no-verify',
        scriptContent: this.generateHookScript('pre-push')
      },
      {
        hookName: 'post-merge',
        enabled: false,
        allowBypass: false,
        scriptContent: this.generateHookScript('post-merge')
      },
      {
        hookName: 'post-checkout',
        enabled: false,
        allowBypass: false,
        scriptContent: this.generateHookScript('post-checkout')
      }
    ];
  }

  /**
   * Install Git hooks in a repository
   */
  async installHooks(options: GitIntegrationOptions): Promise<GitIntegrationResult> {
    const result: GitIntegrationResult = {
      success: true,
      hooks: [],
      errors: [],
      warnings: [],
      summary: ''
    };

    try {
      // Verify Git repository
      const isGitRepo = await this.verifyGitRepository(options.repoPath);
      if (!isGitRepo) {
        result.success = false;
        result.errors.push(`Path ${options.repoPath} is not a valid Git repository`);
        return result;
      }

      const hooksDir = join(options.repoPath, '.git', 'hooks');
      
      // Ensure hooks directory exists
      await fs.mkdir(hooksDir, { recursive: true });

      // Process each hook
      for (const hookConfig of options.hooks) {
        if (!hookConfig.enabled) {
          result.warnings.push(`Hook ${hookConfig.hookName} is disabled, skipping`);
          continue;
        }

        const hookResult = await this.installSingleHook(
          hooksDir,
          hookConfig,
          options
        );
        result.hooks.push(hookResult);

        if (!hookResult.success) {
          result.success = false;
        }
      }

      // Generate summary
      const successCount = result.hooks.filter(h => h.success).length;
      const failureCount = result.hooks.filter(h => !h.success).length;
      
      result.summary = `Processed ${result.hooks.length} hooks: ${successCount} successful, ${failureCount} failed`;
      
      if (result.success) {
        result.summary += '. Git integration is now active.';
      }

    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to install Git hooks: ${error}`);
    }

    return result;
  }

  /**
   * Install a single Git hook
   */
  private async installSingleHook(
    hooksDir: string,
    hookConfig: GitHookConfig,
    options: GitIntegrationOptions
  ): Promise<GitHookInstallResult> {
    const result: GitHookInstallResult = {
      hookName: hookConfig.hookName,
      success: false,
      overwritten: false
    };

    try {
      const hookPath = join(hooksDir, hookConfig.hookName);
      const exists = await fs.access(hookPath).then(() => true).catch(() => false);

      // Backup existing hook if requested
      if (exists && options.backupExisting) {
        const backupPath = `${hookPath}.backup.${Date.now()}`;
        await fs.copyFile(hookPath, backupPath);
        result.backupPath = backupPath;
        result.overwritten = true;
      } else if (exists) {
        result.overwritten = true;
      }

      // Generate hook script with custom validation command
      let scriptContent = hookConfig.scriptContent;
      if (options.validationCommand) {
        scriptContent = scriptContent.replace(
          /claude-code-validator/g,
          options.validationCommand
        );
      }

      // Add quiet mode if requested
      if (options.quietMode) {
        scriptContent = scriptContent.replace(
          /claude-code-validator\s/g,
          'claude-code-validator --quiet '
        );
      }

      // Write hook script
      await fs.writeFile(hookPath, scriptContent, { mode: 0o755 });
      result.success = true;

    } catch (error) {
      result.error = `Failed to install ${hookConfig.hookName}: ${error}`;
    }

    return result;
  }

  /**
   * Remove Git hooks from a repository
   */
  async removeHooks(repoPath: string, hookNames?: string[]): Promise<GitIntegrationResult> {
    const result: GitIntegrationResult = {
      success: true,
      hooks: [],
      errors: [],
      warnings: [],
      summary: ''
    };

    try {
      const isGitRepo = await this.verifyGitRepository(repoPath);
      if (!isGitRepo) {
        result.success = false;
        result.errors.push(`Path ${repoPath} is not a valid Git repository`);
        return result;
      }

      const hooksDir = join(repoPath, '.git', 'hooks');
      const hooksToRemove = hookNames || this.defaultHooks.map(h => h.hookName);

      for (const hookName of hooksToRemove) {
        const hookPath = join(hooksDir, hookName);
        const hookResult: GitHookInstallResult = {
          hookName,
          success: false,
          overwritten: false
        };

        try {
          await fs.access(hookPath);
          await fs.unlink(hookPath);
          hookResult.success = true;
        } catch (error) {
          // Hook doesn't exist, which is fine
          hookResult.success = true;
          result.warnings.push(`Hook ${hookName} was not present`);
        }

        result.hooks.push(hookResult);
      }

      const removedCount = result.hooks.filter(h => h.success).length;
      result.summary = `Removed ${removedCount} Git hooks`;

    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to remove Git hooks: ${error}`);
    }

    return result;
  }

  /**
   * Check status of Git hooks in a repository
   */
  async checkHookStatus(repoPath: string): Promise<{
    installed: boolean;
    hooks: Array<{
      name: string;
      exists: boolean;
      executable: boolean;
      isOurs: boolean;
      lastModified?: Date;
    }>;
  }> {
    const isGitRepo = await this.verifyGitRepository(repoPath);
    if (!isGitRepo) {
      return { installed: false, hooks: [] };
    }

    const hooksDir = join(repoPath, '.git', 'hooks');
    const hooks = [];
    let installedCount = 0;

    for (const hookConfig of this.defaultHooks) {
      const hookPath = join(hooksDir, hookConfig.hookName);
      const hookInfo = {
        name: hookConfig.hookName,
        exists: false,
        executable: false,
        isOurs: false,
        lastModified: undefined as Date | undefined
      };

      try {
        const stats = await fs.stat(hookPath);
        hookInfo.exists = true;
        hookInfo.executable = !!(stats.mode & 0o111);
        hookInfo.lastModified = stats.mtime;

        // Check if it's our hook by looking for signature
        const content = await fs.readFile(hookPath, 'utf-8');
        hookInfo.isOurs = content.includes('Claude Code Security Validation');

        if (hookInfo.isOurs && hookInfo.executable) {
          installedCount++;
        }
      } catch (error) {
        // Hook doesn't exist
      }

      hooks.push(hookInfo);
    }

    return {
      installed: installedCount > 0,
      hooks
    };
  }

  /**
   * Execute validation within a Git hook context
   */
  async executeValidation(
    context: HookExecutionContext,
    options: HookValidationOptions = {}
  ): Promise<ValidationResult> {
    try {
      // Skip validation if requested
      if (options.skipValidation) {
        return {
          isValid: true,
          errors: [],
          warnings: [],
          conflicts: [],
          performance: {
            validationTime: 0,
            rulesProcessed: 0,
            performanceTarget: { target: 100, achieved: true }
          },
          suggestions: []
        };
      }

      // Load configuration
      const configPath = options.configPath || join(context.repoRoot, '.claude-code.json');
      let config: ClaudeCodeConfiguration;

      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        config = JSON.parse(configContent);
      } catch (error) {
        // Use default configuration if none found
        config = {
          permissions: {
            deny: ['exec', 'shell', 'eval', 'spawn', 'system'],
            ask: ['fs', 'network', 'process'],
            allow: ['read', 'console']
          }
        };
      }

      // Apply context-specific rules based on hook type
      config = this.applyContextualRules(config, context);

      // Run validation
      const validationOptions = {
        skipCache: options.fastMode ? false : true,
        skipConflictDetection: options.fastMode
      };

      const result = await this.validationEngine.validate(config, validationOptions);

      // Add hook-specific warnings
      if (context.hookType === 'pre-commit' && context.changedFiles) {
        const sensitiveFiles = context.changedFiles.filter(file =>
          file.includes('.env') || file.includes('secret') || file.includes('key')
        );

        if (sensitiveFiles.length > 0) {
          result.warnings.push({
            type: 'BEST_PRACTICE_VIOLATION',
            message: `Sensitive files detected in commit: ${sensitiveFiles.join(', ')}`,
            context: { files: sensitiveFiles }
          });
        }
      }

      return result;

    } catch (error) {
      return {
        isValid: false,
        errors: [{
          type: 'INVALID_SYNTAX',
          message: `Hook validation failed: ${error}`,
          severity: 'critical'
        }],
        warnings: [],
        conflicts: [],
        performance: {
          validationTime: 0,
          rulesProcessed: 0,
          performanceTarget: { target: 100, achieved: false }
        },
        suggestions: []
      };
    }
  }

  /**
   * Apply contextual rules based on Git hook type and context
   */
  private applyContextualRules(
    config: ClaudeCodeConfiguration,
    context: HookExecutionContext
  ): ClaudeCodeConfiguration {
    const contextualConfig = JSON.parse(JSON.stringify(config));

    // Add stricter rules for certain contexts
    if (context.hookType === 'pre-push') {
      // Stricter rules before pushing to remote
      if (!contextualConfig.permissions) {
        contextualConfig.permissions = {};
      }
      if (!contextualConfig.permissions.deny) {
        contextualConfig.permissions.deny = [];
      }

      // Add additional deny rules for pre-push
      contextualConfig.permissions.deny.push(
        'rm -rf',
        'format',
        'delete_all',
        'drop_database'
      );
    }

    if (context.currentBranch === 'main' || context.currentBranch === 'master') {
      // Extra strict rules for main branch
      if (!contextualConfig.permissions?.ask) {
        if (!contextualConfig.permissions) contextualConfig.permissions = {};
        contextualConfig.permissions.ask = [];
      }

      // Move some allow rules to ask for main branch
      if (contextualConfig.permissions?.allow) {
        const sensitivePatterns = ['modify', 'update', 'change'];
        const toMove = contextualConfig.permissions.allow.filter(rule =>
          sensitivePatterns.some(pattern => rule.includes(pattern))
        );

        contextualConfig.permissions.allow = contextualConfig.permissions.allow.filter(rule =>
          !toMove.includes(rule)
        );
        contextualConfig.permissions.ask.push(...toMove);
      }
    }

    return contextualConfig;
  }

  /**
   * Generate auto-update mechanism for hooks
   */
  async setupAutoUpdate(repoPath: string, updateInterval: string = 'weekly'): Promise<void> {
    const hooksDir = join(repoPath, '.git', 'hooks');
    const updateScriptPath = join(hooksDir, 'claude-code-update');

    const updateScript = `#!/bin/bash
# Claude Code Hook Auto-Update Script
# This script updates Claude Code hooks to the latest version

set -e

echo "Updating Claude Code Git hooks..."

# Check if Claude Code is available
if ! command -v claude-code &> /dev/null; then
    echo "Claude Code not found. Please install it first."
    exit 1
fi

# Update hooks
claude-code integrate git --update-hooks --repo-path="${repoPath}"

echo "Hooks updated successfully!"
`;

    await fs.writeFile(updateScriptPath, updateScript, { mode: 0o755 });

    // Setup cron job or scheduler based on platform
    // This would typically be done through the CLI or system scheduler
  }

  /**
   * Verify if a path is a Git repository
   */
  private async verifyGitRepository(repoPath: string): Promise<boolean> {
    try {
      const gitDir = join(repoPath, '.git');
      const stats = await fs.stat(gitDir);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get Git repository information
   */
  async getRepoInfo(repoPath: string): Promise<{
    isRepo: boolean;
    branch?: string;
    remotes?: string[];
    hasUncommittedChanges?: boolean;
  }> {
    const info = {
      isRepo: false,
      branch: undefined as string | undefined,
      remotes: undefined as string[] | undefined,
      hasUncommittedChanges: undefined as boolean | undefined
    };

    try {
      info.isRepo = await this.verifyGitRepository(repoPath);
      
      if (info.isRepo) {
        const originalCwd = process.cwd();
        process.chdir(repoPath);

        try {
          // Get current branch
          info.branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();

          // Get remotes
          const remotesOutput = execSync('git remote', { encoding: 'utf-8' }).trim();
          info.remotes = remotesOutput ? remotesOutput.split('\n') : [];

          // Check for uncommitted changes
          const statusOutput = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
          info.hasUncommittedChanges = statusOutput.length > 0;

        } finally {
          process.chdir(originalCwd);
        }
      }
    } catch (error) {
      // Repository info gathering failed, but isRepo status is already set
    }

    return info;
  }

  /**
   * Generate Git hook script content
   */
  private generateHookScript(hookType: string): string {
    const baseScript = `#!/bin/bash
# Claude Code Security Validation Hook - ${hookType}
# Generated by Claude Code Security Rulesets Generator
# This hook performs security validation before Git operations

set -e

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

# Configuration
CLAUDE_CODE_CMD="claude-code-validator"
CONFIG_FILE=".claude-code.json"
FAST_MODE=false
QUIET_MODE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --fast)
      FAST_MODE=true
      shift
      ;;
    --quiet)
      QUIET_MODE=true
      shift
      ;;
    --config)
      CONFIG_FILE="$2"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

# Function to print colored output
print_status() {
    if [ "$QUIET_MODE" != "true" ]; then
        echo -e "$1"
    fi
}

print_error() {
    echo -e "${RED}$1${NC}" >&2
}

print_success() {
    if [ "$QUIET_MODE" != "true" ]; then
        echo -e "${GREEN}$1${NC}"
    fi
}

print_warning() {
    if [ "$QUIET_MODE" != "true" ]; then
        echo -e "${YELLOW}$1${NC}"
    fi
}

# Check if Claude Code validator is available
if ! command -v $CLAUDE_CODE_CMD &> /dev/null; then
    print_error "Claude Code validator not found. Please install Claude Code first."
    print_error "Or set CLAUDE_CODE_CMD environment variable to the correct path."
    exit 1
fi

# Check for bypass flag
if echo "$@" | grep -q "\\--no-verify\\|\\--bypass-validation"; then
    print_warning "⚠️  Security validation bypassed!"
    print_warning "This should only be used in emergencies."
    exit 0
fi

# Find repository root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ $? -ne 0 ]; then
    print_error "Not in a Git repository"
    exit 1
fi

cd "$REPO_ROOT"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    print_warning "No Claude Code configuration found ($CONFIG_FILE)"
    print_warning "Using default security rules..."
fi

# Prepare validation command
VALIDATION_CMD="$CLAUDE_CODE_CMD validate"

if [ -f "$CONFIG_FILE" ]; then
    VALIDATION_CMD="$VALIDATION_CMD --config $CONFIG_FILE"
fi

if [ "$FAST_MODE" = "true" ]; then
    VALIDATION_CMD="$VALIDATION_CMD --fast"
fi

if [ "$QUIET_MODE" = "true" ]; then
    VALIDATION_CMD="$VALIDATION_CMD --quiet"
fi

# Add hook-specific flags
VALIDATION_CMD="$VALIDATION_CMD --hook-type ${hookType}"
`;

    // Add hook-specific logic
    let hookSpecificLogic = '';

    switch (hookType) {
      case 'pre-commit':
        hookSpecificLogic = `
# Get list of files being committed
STAGED_FILES=$(git diff --cached --name-only)

if [ -n "$STAGED_FILES" ]; then
    print_status "🔍 Validating security rules for staged files..."
    VALIDATION_CMD="$VALIDATION_CMD --staged-files"
    
    # Check for sensitive files
    SENSITIVE_FILES=$(echo "$STAGED_FILES" | grep -E "\\.(env|key|pem|p12|pfx)$|\\.secret|\\.private" || true)
    if [ -n "$SENSITIVE_FILES" ]; then
        print_warning "⚠️  Sensitive files detected in commit:"
        echo "$SENSITIVE_FILES" | while read file; do
            print_warning "    - $file"
        done
        print_warning ""
        print_warning "Please ensure these files should be committed."
        print_warning "Consider using .gitignore or git-secret for sensitive data."
        print_warning ""
    fi
else
    print_status "No staged files to validate."
    exit 0
fi`;
        break;

      case 'pre-push':
        hookSpecificLogic = `
# Get information about what's being pushed
while read local_ref local_sha remote_ref remote_sha; do
    if [ "$local_sha" != "0000000000000000000000000000000000000000" ]; then
        CURRENT_BRANCH=$(echo "$local_ref" | sed 's|refs/heads/||')
        print_status "🔍 Validating security rules for push to $CURRENT_BRANCH..."
        
        # Extra validation for main/master branch
        if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
            print_status "🛡️  Enhanced validation for protected branch: $CURRENT_BRANCH"
            VALIDATION_CMD="$VALIDATION_CMD --strict --branch $CURRENT_BRANCH"
        else
            VALIDATION_CMD="$VALIDATION_CMD --branch $CURRENT_BRANCH"
        fi
        
        break
    fi
done`;
        break;

      case 'post-merge':
        hookSpecificLogic = `
print_status "🔄 Post-merge validation..."
VALIDATION_CMD="$VALIDATION_CMD --post-merge"

# Check if this was a merge commit
if git log -1 --merges HEAD >/dev/null 2>&1; then
    print_status "Merge commit detected, running enhanced validation..."
    VALIDATION_CMD="$VALIDATION_CMD --merge-validation"
fi`;
        break;

      case 'post-checkout':
        hookSpecificLogic = `
# Arguments: previous_head, new_head, branch_flag
PREV_HEAD=$1
NEW_HEAD=$2
BRANCH_FLAG=$3

if [ "$BRANCH_FLAG" = "1" ]; then
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    print_status "🔄 Branch switched to: $CURRENT_BRANCH"
    VALIDATION_CMD="$VALIDATION_CMD --branch-switch --branch $CURRENT_BRANCH"
else
    print_status "🔄 Files checked out, running validation..."
fi`;
        break;
    }

    const endScript = `
print_status "Running security validation..."

# Execute validation
if eval "$VALIDATION_CMD"; then
    print_success "✅ Security validation passed!"
    exit 0
else
    VALIDATION_EXIT_CODE=$?
    print_error ""
    print_error "❌ Security validation failed!"
    print_error ""
    print_error "The ${hookType} operation has been blocked due to security policy violations."
    print_error "Please review the errors above and fix them before continuing."
    print_error ""
    print_error "Emergency bypass (use with caution):"
    print_error "  git ${hookType === 'pre-commit' ? 'commit' : hookType === 'pre-push' ? 'push' : 'operation'} --no-verify"
    print_error ""
    exit $VALIDATION_EXIT_CODE
fi
`;

    return baseScript + hookSpecificLogic + endScript;
  }

  /**
   * Create quick setup for common Git workflow
   */
  async quickSetup(repoPath: string): Promise<GitIntegrationResult> {
    const options: GitIntegrationOptions = {
      repoPath,
      hooks: [
        {
          hookName: 'pre-commit',
          enabled: true,
          allowBypass: true,
          bypassFlag: '--no-verify',
          scriptContent: this.generateHookScript('pre-commit')
        },
        {
          hookName: 'pre-push',
          enabled: true,
          allowBypass: true,
          bypassFlag: '--no-verify',
          scriptContent: this.generateHookScript('pre-push')
        }
      ],
      backupExisting: true,
      quietMode: false
    };

    return this.installHooks(options);
  }
}

/**
 * Factory function to create GitIntegration instance
 */
export function createGitIntegration(validationEngine?: ValidationEngine): GitIntegration {
  return new GitIntegration(validationEngine);
}

/**
 * Utility function to check if Git is available in the system
 */
export function checkGitAvailability(): boolean {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Utility function to get current Git user configuration
 */
export function getGitUserInfo(): { name?: string; email?: string } {
  try {
    const name = execSync('git config user.name', { encoding: 'utf-8' }).trim();
    const email = execSync('git config user.email', { encoding: 'utf-8' }).trim();
    return { name, email };
  } catch (error) {
    return {};
  }
}