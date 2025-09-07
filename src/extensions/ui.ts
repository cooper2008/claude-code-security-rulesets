/**
 * User Interface Components
 * Provides UI components for extension interfaces and settings
 */

import { EventEmitter } from 'events';
import { ClaudeCodeConfiguration, ValidationResult, SecurityTemplate } from '../types';
import { CommandResult, QuickPickItem } from './commands';

export interface UIProvider {
  /** Show information message */
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
  /** Show warning message */
  showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;
  /** Show error message */
  showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
  /** Show quick pick dialog */
  showQuickPick(items: QuickPickItem[], options?: QuickPickOptions): Promise<QuickPickItem | undefined>;
  /** Show input box */
  showInputBox(options?: InputBoxOptions): Promise<string | undefined>;
  /** Show progress indicator */
  withProgress<T>(options: ProgressOptions, task: (progress: ProgressReporter) => Promise<T>): Promise<T>;
}

export interface QuickPickOptions {
  /** Placeholder text */
  placeHolder?: string;
  /** Whether multiple selection is enabled */
  canPickMany?: boolean;
  /** Whether to ignore focus out */
  ignoreFocusOut?: boolean;
  /** Match on description */
  matchOnDescription?: boolean;
  /** Match on detail */
  matchOnDetail?: boolean;
}

export interface InputBoxOptions {
  /** Current value */
  value?: string;
  /** Placeholder text */
  placeHolder?: string;
  /** Password input */
  password?: boolean;
  /** Ignore focus out */
  ignoreFocusOut?: boolean;
  /** Validation function */
  validateInput?: (value: string) => string | undefined;
}

export interface ProgressOptions {
  /** Progress location */
  location: ProgressLocation;
  /** Title */
  title?: string;
  /** Whether progress is cancellable */
  cancellable?: boolean;
}

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15
}

export interface ProgressReporter {
  /** Report progress */
  report(value: { message?: string; increment?: number }): void;
}

export interface StatusBarItem {
  /** Status bar alignment */
  alignment: StatusBarAlignment;
  /** Priority */
  priority?: number;
  /** Text to display */
  text: string;
  /** Tooltip */
  tooltip?: string;
  /** Command to execute when clicked */
  command?: string;
  /** Color */
  color?: string;
  /** Show the item */
  show(): void;
  /** Hide the item */
  hide(): void;
  /** Dispose the item */
  dispose(): void;
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2
}

/**
 * UI Manager for extension interfaces
 */
export class UIManager extends EventEmitter {
  private provider: UIProvider;
  private statusBarItem?: StatusBarItem;
  private currentValidationResult?: ValidationResult;

  constructor(provider: UIProvider) {
    super();
    this.provider = provider;
  }

  /**
   * Initialize UI components
   */
  public async initialize(): Promise<void> {
    // Setup status bar
    await this.setupStatusBar();
    this.emit('ui:initialized');
  }

  /**
   * Setup status bar indicator
   */
  private async setupStatusBar(): Promise<void> {
    if (this.statusBarItem) {
      return;
    }

    // This would be implemented by the platform-specific extension
    this.updateStatusBarDefault();
  }

  /**
   * Update status bar with validation results
   */
  public updateStatusBar(result: ValidationResult): void {
    this.currentValidationResult = result;
    
    if (!this.statusBarItem) {
      this.updateStatusBarDefault();
      return;
    }

    const status = result.isValid ? '✅' : '❌';
    const text = `Claude Code ${status}`;
    const tooltip = this.generateStatusTooltip(result);

    this.statusBarItem.text = text;
    this.statusBarItem.tooltip = tooltip;
    this.statusBarItem.color = result.isValid ? undefined : '#ff6b35';
    this.statusBarItem.show();

    this.emit('statusbar:updated', { result, text, tooltip });
  }

  /**
   * Update status bar to default state
   */
  private updateStatusBarDefault(): void {
    if (this.statusBarItem) {
      this.statusBarItem.text = 'Claude Code';
      this.statusBarItem.tooltip = 'Claude Code Security Extensions';
      this.statusBarItem.color = undefined;
      this.statusBarItem.show();
    }
  }

  /**
   * Generate tooltip for status bar
   */
  private generateStatusTooltip(result: ValidationResult): string {
    const lines = [
      `Status: ${result.isValid ? 'Valid' : 'Invalid'}`,
      `Errors: ${result.errors.length}`,
      `Warnings: ${result.warnings.length}`,
      `Conflicts: ${result.conflicts.length}`
    ];

    if (result.performance) {
      lines.push(`Validation Time: ${result.performance.validationTime.toFixed(2)}ms`);
    }

    return lines.join('\n');
  }

  /**
   * Show validation results dialog
   */
  public async showValidationResults(result: ValidationResult): Promise<void> {
    const status = result.isValid ? 'Valid ✅' : 'Invalid ❌';
    const summary = `${result.errors.length} errors, ${result.warnings.length} warnings, ${result.conflicts.length} conflicts`;
    
    const message = `Configuration ${status}\n${summary}`;
    
    const actions = ['View Details', 'Fix Issues'];
    if (result.isValid) {
      actions.push('Close');
    }

    const choice = await this.provider.showInformationMessage(message, ...actions);
    
    switch (choice) {
      case 'View Details':
        await this.showValidationDetails(result);
        break;
      case 'Fix Issues':
        await this.showQuickFixes(result);
        break;
    }

    this.emit('validation-results:shown', { result, choice });
  }

  /**
   * Show detailed validation results
   */
  public async showValidationDetails(result: ValidationResult): Promise<void> {
    const items: QuickPickItem[] = [];

    // Add errors
    for (const error of result.errors) {
      items.push({
        label: `❌ ${error.message}`,
        description: 'Error',
        detail: `Type: ${error.type}, Severity: ${error.severity}`,
        data: { type: 'error', error }
      });
    }

    // Add warnings
    for (const warning of result.warnings) {
      items.push({
        label: `⚠️ ${warning.message}`,
        description: 'Warning',
        detail: `Type: ${warning.type}`,
        data: { type: 'warning', warning }
      });
    }

    // Add conflicts
    for (const conflict of result.conflicts) {
      items.push({
        label: `⚡ ${conflict.message}`,
        description: 'Conflict',
        detail: `Impact: ${conflict.securityImpact}, Type: ${conflict.type}`,
        data: { type: 'conflict', conflict }
      });
    }

    if (items.length === 0) {
      await this.provider.showInformationMessage('No issues found in configuration ✅');
      return;
    }

    const selected = await this.provider.showQuickPick(items, {
      placeHolder: 'Select an issue to view details',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected) {
      await this.showIssueDetails(selected);
    }
  }

  /**
   * Show quick fixes for validation issues
   */
  public async showQuickFixes(result: ValidationResult): Promise<void> {
    const fixes: QuickPickItem[] = [];

    // Add fixes from suggestions
    for (const suggestion of result.suggestions) {
      fixes.push({
        label: suggestion.message,
        description: suggestion.type,
        detail: suggestion.autoFix ? 'Auto-fixable' : 'Manual fix required',
        data: { type: 'suggestion', suggestion }
      });
    }

    // Add common fixes
    if (result.conflicts.length > 0) {
      fixes.push({
        label: 'Resolve all conflicts',
        description: 'Auto-fix',
        detail: 'Automatically resolve rule conflicts',
        data: { type: 'auto-fix', action: 'resolve-conflicts' }
      });
    }

    if (result.errors.some(e => e.type === 'INVALID_PATTERN')) {
      fixes.push({
        label: 'Fix invalid patterns',
        description: 'Auto-fix',
        detail: 'Fix syntax errors in rule patterns',
        data: { type: 'auto-fix', action: 'fix-patterns' }
      });
    }

    if (fixes.length === 0) {
      await this.provider.showInformationMessage('No automatic fixes available');
      return;
    }

    const selected = await this.provider.showQuickPick(fixes, {
      placeHolder: 'Select a fix to apply',
      matchOnDescription: true
    });

    if (selected) {
      await this.applyFix(selected, result);
    }
  }

  /**
   * Show issue details
   */
  private async showIssueDetails(item: QuickPickItem): Promise<void> {
    const data = item.data;
    let details = '';

    if (data.type === 'error') {
      const error = data.error;
      details = `Error: ${error.message}\n\nType: ${error.type}\nSeverity: ${error.severity}`;
      
      if (error.context) {
        details += `\nContext: ${JSON.stringify(error.context, null, 2)}`;
      }
    } else if (data.type === 'warning') {
      const warning = data.warning;
      details = `Warning: ${warning.message}\n\nType: ${warning.type}`;
      
      if (warning.context) {
        details += `\nContext: ${JSON.stringify(warning.context, null, 2)}`;
      }
    } else if (data.type === 'conflict') {
      const conflict = data.conflict;
      details = `Conflict: ${conflict.message}\n\nType: ${conflict.type}\nSecurity Impact: ${conflict.securityImpact}`;
      
      if (conflict.conflictingRules.length > 0) {
        details += '\n\nConflicting Rules:\n';
        for (const rule of conflict.conflictingRules) {
          details += `- ${rule.type}: "${rule.pattern}"\n`;
        }
      }
    }

    await this.provider.showInformationMessage(details, 'OK');
  }

  /**
   * Apply selected fix
   */
  private async applyFix(item: QuickPickItem, result: ValidationResult): Promise<void> {
    const data = item.data;
    
    if (data.type === 'suggestion' && data.suggestion.autoFix) {
      this.emit('fix:apply', { suggestion: data.suggestion });
      await this.provider.showInformationMessage('Fix applied successfully');
    } else if (data.type === 'auto-fix') {
      this.emit('fix:auto', { action: data.action, result });
      await this.provider.showInformationMessage(`Auto-fix "${data.action}" applied`);
    } else {
      await this.provider.showInformationMessage('Manual fix required - please review the issue and make changes manually');
    }
  }

  /**
   * Show template selection dialog
   */
  public async showTemplateSelection(): Promise<SecurityTemplate | undefined> {
    const templates: SecurityTemplate[] = [
      {
        id: 'basic-security',
        name: 'Basic Security',
        description: 'Basic security rules for general use',
        category: 'security'
      },
      {
        id: 'development',
        name: 'Development Environment', 
        description: 'Suitable for development environments',
        category: 'development'
      },
      {
        id: 'production',
        name: 'Production Environment',
        description: 'Strict rules for production environments', 
        category: 'production'
      },
      {
        id: 'enterprise',
        name: 'Enterprise Security',
        description: 'Enterprise-grade security policies',
        category: 'enterprise'
      }
    ];

    const items: QuickPickItem[] = templates.map(template => ({
      label: template.name,
      description: template.category,
      detail: template.description,
      data: template
    }));

    const selected = await this.provider.showQuickPick(items, {
      placeHolder: 'Select a security template to apply',
      matchOnDescription: true,
      matchOnDetail: true
    });

    return selected?.data as SecurityTemplate;
  }

  /**
   * Show configuration wizard
   */
  public async showConfigurationWizard(): Promise<ClaudeCodeConfiguration | undefined> {
    const steps = [
      'Select environment type',
      'Configure deny rules',
      'Configure allow rules', 
      'Configure ask rules',
      'Review configuration'
    ];

    let currentStep = 0;
    const config: ClaudeCodeConfiguration = { permissions: {} };

    try {
      const progressResult = await this.provider.withProgress(
        {
          location: ProgressLocation.Notification,
          title: 'Configuration Wizard',
          cancellable: true
        },
        async (progress) => {
          // Step 1: Environment type
          progress.report({ message: steps[currentStep++] });
          const environment = await this.selectEnvironmentType();
          if (!environment) throw new Error('Cancelled');

          // Step 2: Deny rules
          progress.report({ message: steps[currentStep++], increment: 25 });
          const denyRules = await this.configureDenyRules(environment);
          config.permissions!.deny = denyRules;

          // Step 3: Allow rules
          progress.report({ message: steps[currentStep++], increment: 25 });
          const allowRules = await this.configureAllowRules(environment);
          config.permissions!.allow = allowRules;

          // Step 4: Ask rules
          progress.report({ message: steps[currentStep++], increment: 25 });
          const askRules = await this.configureAskRules(environment);
          config.permissions!.ask = askRules;

          // Step 5: Review
          progress.report({ message: steps[currentStep++], increment: 25 });
          const confirmed = await this.reviewConfiguration(config);
          if (!confirmed) throw new Error('Cancelled');

          return config;
        }
      );

      this.emit('wizard:completed', { config: progressResult });
      return progressResult;

    } catch (error) {
      if (error.message !== 'Cancelled') {
        await this.provider.showErrorMessage(`Wizard failed: ${error}`);
      }
      this.emit('wizard:cancelled');
      return undefined;
    }
  }

  /**
   * Select environment type for wizard
   */
  private async selectEnvironmentType(): Promise<string | undefined> {
    const environments: QuickPickItem[] = [
      {
        label: 'Development',
        description: 'Development environment',
        detail: 'Permissive rules for development work'
      },
      {
        label: 'Production',
        description: 'Production environment',
        detail: 'Strict security rules for production'
      },
      {
        label: 'Enterprise',
        description: 'Enterprise environment',
        detail: 'Maximum security for enterprise use'
      },
      {
        label: 'Custom',
        description: 'Custom configuration',
        detail: 'Configure rules manually'
      }
    ];

    const selected = await this.provider.showQuickPick(environments, {
      placeHolder: 'Select your environment type'
    });

    return selected?.label.toLowerCase();
  }

  /**
   * Configure deny rules in wizard
   */
  private async configureDenyRules(environment: string): Promise<string[]> {
    const presets = this.getDenyRulesPreset(environment);
    const customRules: string[] = [];

    // Show preset rules and allow customization
    const usePreset = await this.provider.showInformationMessage(
      `Use preset deny rules for ${environment}?\n\nPreset includes: ${presets.join(', ')}`,
      'Use Preset',
      'Customize',
      'Skip'
    );

    if (usePreset === 'Use Preset') {
      return presets;
    } else if (usePreset === 'Customize') {
      // Allow user to add custom rules
      let addMore = true;
      while (addMore) {
        const rule = await this.provider.showInputBox({
          placeHolder: 'Enter a deny rule pattern (e.g., exec, shell, ../*, etc.)',
          validateInput: (value) => {
            if (!value.trim()) return 'Rule cannot be empty';
            if (customRules.includes(value)) return 'Rule already exists';
            return undefined;
          }
        });

        if (rule) {
          customRules.push(rule);
          const continueAdding = await this.provider.showInformationMessage(
            `Added rule: "${rule}"\n\nAdd another rule?`,
            'Yes',
            'No'
          );
          addMore = continueAdding === 'Yes';
        } else {
          addMore = false;
        }
      }
      return [...presets, ...customRules];
    }

    return [];
  }

  /**
   * Configure allow rules in wizard
   */
  private async configureAllowRules(environment: string): Promise<string[]> {
    const presets = this.getAllowRulesPreset(environment);
    // Similar implementation to configureDenyRules
    return presets;
  }

  /**
   * Configure ask rules in wizard
   */
  private async configureAskRules(environment: string): Promise<string[]> {
    const presets = this.getAskRulesPreset(environment);
    // Similar implementation to configureDenyRules
    return presets;
  }

  /**
   * Review configuration in wizard
   */
  private async reviewConfiguration(config: ClaudeCodeConfiguration): Promise<boolean> {
    const summary = this.generateConfigurationSummary(config);
    
    const choice = await this.provider.showInformationMessage(
      `Configuration Summary:\n\n${summary}\n\nApply this configuration?`,
      'Apply',
      'Back',
      'Cancel'
    );

    return choice === 'Apply';
  }

  /**
   * Generate configuration summary
   */
  private generateConfigurationSummary(config: ClaudeCodeConfiguration): string {
    const summary: string[] = [];

    if (config.permissions?.deny?.length) {
      summary.push(`Deny rules: ${config.permissions.deny.length}`);
    }
    if (config.permissions?.allow?.length) {
      summary.push(`Allow rules: ${config.permissions.allow.length}`);
    }
    if (config.permissions?.ask?.length) {
      summary.push(`Ask rules: ${config.permissions.ask.length}`);
    }

    return summary.join('\n');
  }

  /**
   * Get preset deny rules for environment
   */
  private getDenyRulesPreset(environment: string): string[] {
    const presets = {
      development: ['exec', 'shell', '../../../*'],
      production: ['*', 'exec', 'shell', 'eval', '../*', '/etc/*'],
      enterprise: ['exec', 'shell', 'cmd', 'powershell', 'eval', '../*', '/etc/*', '*.exe', '*.bat'],
      custom: []
    };

    return presets[environment as keyof typeof presets] || [];
  }

  /**
   * Get preset allow rules for environment
   */
  private getAllowRulesPreset(environment: string): string[] {
    const presets = {
      development: ['src/**/*', 'test/**/*', '*.json', '*.md'],
      production: ['public/**/*', 'static/**/*'],
      enterprise: ['src/**/*.js', 'src/**/*.ts', 'public/**/*'],
      custom: []
    };

    return presets[environment as keyof typeof presets] || [];
  }

  /**
   * Get preset ask rules for environment
   */
  private getAskRulesPreset(environment: string): string[] {
    const presets = {
      development: ['package.json', 'tsconfig.json', '.env*'],
      production: [],
      enterprise: ['package.json', '*.config.*', 'Dockerfile'],
      custom: []
    };

    return presets[environment as keyof typeof presets] || [];
  }

  /**
   * Show command execution progress
   */
  public async showCommandProgress<T>(
    command: string,
    task: (progress: ProgressReporter) => Promise<T>
  ): Promise<T> {
    return this.provider.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `Executing: ${command}`,
        cancellable: false
      },
      task
    );
  }

  /**
   * Show command result
   */
  public async showCommandResult(command: string, result: CommandResult): Promise<void> {
    if (result.success) {
      await this.provider.showInformationMessage(`✅ ${command}: ${result.message}`);
    } else {
      await this.provider.showErrorMessage(`❌ ${command}: ${result.message}`);
    }

    this.emit('command-result:shown', { command, result });
  }

  /**
   * Dispose UI resources
   */
  public dispose(): void {
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
      this.statusBarItem = undefined;
    }
    this.emit('ui:disposed');
  }

  /**
   * Set status bar item (called by platform implementations)
   */
  public setStatusBarItem(item: StatusBarItem): void {
    this.statusBarItem = item;
    this.updateStatusBarDefault();
  }
}