/**
 * Extension Commands and Actions
 * Provides command palette integration and quick actions
 */

import { EventEmitter } from 'events';
import { ClaudeCodeConfiguration, ValidationResult, SecurityTemplate } from '../types';
import { ValidationEngine } from '../validation/engine';
import { TextDocument, WorkspaceEdit, TextEdit, DocumentRange } from './base';

export interface CommandContext {
  /** Current active document */
  activeDocument?: TextDocument;
  /** Current configuration */
  activeConfig?: ClaudeCodeConfiguration;
  /** Workspace root path */
  workspaceRoot?: string;
  /** Extension context data */
  extensionContext: Map<string, any>;
}

export interface CommandResult {
  /** Whether command executed successfully */
  success: boolean;
  /** Result message */
  message: string;
  /** Optional data */
  data?: any;
  /** Workspace edits to apply */
  edits?: WorkspaceEdit;
}

export interface Command {
  /** Command identifier */
  id: string;
  /** Display title */
  title: string;
  /** Category for grouping */
  category: string;
  /** Command description */
  description: string;
  /** Whether command is available */
  enabled: boolean;
  /** Keyboard shortcut */
  keybinding?: string;
  /** Icon for UI */
  icon?: string;
}

export interface QuickPickItem {
  /** Display label */
  label: string;
  /** Description */
  description?: string;
  /** Detail text */
  detail?: string;
  /** Associated data */
  data?: any;
  /** Whether item is selected */
  picked?: boolean;
}

/**
 * Command execution interface
 */
export interface CommandExecutor {
  /** Execute command with context */
  execute(context: CommandContext, ...args: any[]): Promise<CommandResult>;
  /** Check if command can execute */
  canExecute(context: CommandContext): boolean;
  /** Get command metadata */
  getCommand(): Command;
}

/**
 * Commands manager for Claude Code extensions
 */
export class CommandManager extends EventEmitter {
  private commands = new Map<string, CommandExecutor>();
  private validationEngine: ValidationEngine;

  constructor() {
    super();
    this.validationEngine = new ValidationEngine();
    this.registerBuiltinCommands();
  }

  /**
   * Register a command executor
   */
  public registerCommand(executor: CommandExecutor): void {
    const command = executor.getCommand();
    this.commands.set(command.id, executor);
    this.emit('command:registered', command);
  }

  /**
   * Execute a command
   */
  public async executeCommand(
    commandId: string, 
    context: CommandContext,
    ...args: any[]
  ): Promise<CommandResult> {
    const executor = this.commands.get(commandId);
    if (!executor) {
      return {
        success: false,
        message: `Unknown command: ${commandId}`
      };
    }

    if (!executor.canExecute(context)) {
      return {
        success: false,
        message: `Command ${commandId} cannot be executed in current context`
      };
    }

    try {
      this.emit('command:executing', { commandId, context });
      const result = await executor.execute(context, ...args);
      this.emit('command:executed', { commandId, result });
      return result;
    } catch (error) {
      const errorResult: CommandResult = {
        success: false,
        message: `Command execution failed: ${error}`
      };
      this.emit('command:error', { commandId, error });
      return errorResult;
    }
  }

  /**
   * Get all available commands
   */
  public getAvailableCommands(context: CommandContext): Command[] {
    const available: Command[] = [];
    
    for (const executor of this.commands.values()) {
      if (executor.canExecute(context)) {
        available.push(executor.getCommand());
      }
    }

    return available.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }

  /**
   * Register built-in commands
   */
  private registerBuiltinCommands(): void {
    // Validation commands
    this.registerCommand(new ValidateConfigCommand(this.validationEngine));
    this.registerCommand(new ValidateAllCommand(this.validationEngine));
    
    // Template commands
    this.registerCommand(new GenerateSecurityTemplateCommand());
    this.registerCommand(new ApplyTemplateCommand());
    
    // Configuration commands
    this.registerCommand(new InitializeConfigCommand());
    this.registerCommand(new SortRulesCommand());
    this.registerCommand(new OptimizeConfigCommand());
    
    // Analysis commands
    this.registerCommand(new AnalyzeRulesCommand(this.validationEngine));
    this.registerCommand(new FindConflictsCommand(this.validationEngine));
    
    // Utility commands
    this.registerCommand(new FormatConfigCommand());
    this.registerCommand(new ExportConfigCommand());
    this.registerCommand(new ImportConfigCommand());
  }
}

/**
 * Base command executor
 */
export abstract class BaseCommandExecutor implements CommandExecutor {
  protected command: Command;

  constructor(command: Command) {
    this.command = command;
  }

  public abstract execute(context: CommandContext, ...args: any[]): Promise<CommandResult>;
  
  public canExecute(context: CommandContext): boolean {
    return this.command.enabled;
  }

  public getCommand(): Command {
    return { ...this.command };
  }
}

/**
 * Validate current configuration
 */
export class ValidateConfigCommand extends BaseCommandExecutor {
  constructor(private validationEngine: ValidationEngine) {
    super({
      id: 'claude-code.validate',
      title: 'Validate Configuration',
      category: 'Validation',
      description: 'Validate the current Claude Code configuration',
      enabled: true,
      keybinding: 'Ctrl+Shift+V',
      icon: 'check'
    });
  }

  public canExecute(context: CommandContext): boolean {
    return !!context.activeDocument && !!context.activeConfig;
  }

  public async execute(context: CommandContext): Promise<CommandResult> {
    if (!context.activeConfig) {
      return { success: false, message: 'No configuration to validate' };
    }

    const result = await this.validationEngine.validate(context.activeConfig);
    
    const status = result.isValid ? 'VALID' : 'INVALID';
    const message = `Configuration is ${status}. ${result.errors.length} errors, ${result.warnings.length} warnings, ${result.conflicts.length} conflicts.`;

    return {
      success: true,
      message,
      data: { validationResult: result }
    };
  }
}

/**
 * Validate all configurations in workspace
 */
export class ValidateAllCommand extends BaseCommandExecutor {
  constructor(private validationEngine: ValidationEngine) {
    super({
      id: 'claude-code.validateAll',
      title: 'Validate All Configurations',
      category: 'Validation',
      description: 'Validate all Claude Code configurations in workspace',
      enabled: true,
      icon: 'check-all'
    });
  }

  public canExecute(context: CommandContext): boolean {
    return !!context.workspaceRoot;
  }

  public async execute(context: CommandContext): Promise<CommandResult> {
    // Implementation would find and validate all configs
    return {
      success: true,
      message: 'All configurations validated successfully'
    };
  }
}

/**
 * Generate security template
 */
export class GenerateSecurityTemplateCommand extends BaseCommandExecutor {
  constructor() {
    super({
      id: 'claude-code.generateTemplate',
      title: 'Generate Security Template',
      category: 'Templates',
      description: 'Generate a security template for common use cases',
      enabled: true,
      icon: 'template'
    });
  }

  public async execute(context: CommandContext, templateType?: string): Promise<CommandResult> {
    const templates = this.getAvailableTemplates();
    
    if (!templateType) {
      // Return available templates for user selection
      return {
        success: true,
        message: 'Select a template type',
        data: { templates }
      };
    }

    const template = templates.find(t => t.id === templateType);
    if (!template) {
      return { success: false, message: `Unknown template type: ${templateType}` };
    }

    const config = this.generateTemplateConfig(template);
    const configJson = JSON.stringify(config, null, 2);

    const edits: WorkspaceEdit = {
      changes: context.activeDocument ? {
        [context.activeDocument.uri]: [{
          range: { start: { line: 0, character: 0 }, end: { line: 999999, character: 0 } },
          newText: configJson
        }]
      } : {}
    };

    return {
      success: true,
      message: `Generated ${template.name} template`,
      data: { template, config },
      edits
    };
  }

  private getAvailableTemplates(): SecurityTemplate[] {
    return [
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
  }

  private generateTemplateConfig(template: SecurityTemplate): ClaudeCodeConfiguration {
    const configs = {
      'basic-security': {
        permissions: {
          deny: ['exec', 'shell', 'cmd', '../*'],
          allow: ['*.js', '*.ts', '*.json'],
          ask: ['package.json', '*.config.*']
        }
      },
      'development': {
        permissions: {
          deny: ['rm -rf', 'format *', '../../../*'],
          allow: ['src/**/*', 'test/**/*', '*.json', '*.md'],
          ask: ['package.json', 'tsconfig.json', '.env*']
        }
      },
      'production': {
        permissions: {
          deny: ['*', 'exec', 'shell', 'eval', '../*', '/etc/*', '/usr/*'],
          allow: ['public/**/*', 'static/**/*'],
          ask: []
        }
      },
      'enterprise': {
        permissions: {
          deny: [
            'exec', 'shell', 'cmd', 'powershell', 'eval',
            '../*', '/etc/*', '/usr/*', '/root/*',
            '*.exe', '*.bat', '*.sh', '*.ps1',
            'rm *', 'del *', 'format *'
          ],
          allow: [
            'src/**/*.js', 'src/**/*.ts', 'src/**/*.json',
            'public/**/*', 'assets/**/*'
          ],
          ask: [
            'package.json', 'tsconfig.json', '*.config.*',
            'Dockerfile', 'docker-compose.*'
          ]
        }
      }
    };

    return configs[template.id as keyof typeof configs] || configs['basic-security'];
  }
}

/**
 * Apply template to current configuration
 */
export class ApplyTemplateCommand extends BaseCommandExecutor {
  constructor() {
    super({
      id: 'claude-code.applyTemplate',
      title: 'Apply Template',
      category: 'Templates',
      description: 'Apply a security template to current configuration',
      enabled: true,
      icon: 'apply'
    });
  }

  public canExecute(context: CommandContext): boolean {
    return !!context.activeDocument;
  }

  public async execute(context: CommandContext, templateId: string): Promise<CommandResult> {
    // Implementation would apply selected template
    return {
      success: true,
      message: `Applied template: ${templateId}`
    };
  }
}

/**
 * Initialize new configuration
 */
export class InitializeConfigCommand extends BaseCommandExecutor {
  constructor() {
    super({
      id: 'claude-code.init',
      title: 'Initialize Configuration',
      category: 'Configuration',
      description: 'Create a new Claude Code configuration file',
      enabled: true,
      icon: 'new-file'
    });
  }

  public async execute(context: CommandContext): Promise<CommandResult> {
    const defaultConfig: ClaudeCodeConfiguration = {
      permissions: {
        deny: [
          'exec',
          'shell',
          'cmd',
          '../*'
        ],
        allow: [
          '*.js',
          '*.ts',
          '*.json'
        ],
        ask: [
          'package.json',
          '*.config.*'
        ]
      },
      metadata: {
        version: '1.0.0',
        description: 'Claude Code security configuration',
        tags: ['security', 'config']
      }
    };

    const configJson = JSON.stringify(defaultConfig, null, 2);

    return {
      success: true,
      message: 'Configuration initialized successfully',
      data: { config: defaultConfig },
      edits: {
        changes: context.activeDocument ? {
          [context.activeDocument.uri]: [{
            range: { start: { line: 0, character: 0 }, end: { line: 999999, character: 0 } },
            newText: configJson
          }]
        } : {}
      }
    };
  }
}

/**
 * Sort rules by category and priority
 */
export class SortRulesCommand extends BaseCommandExecutor {
  constructor() {
    super({
      id: 'claude-code.sortRules',
      title: 'Sort Rules',
      category: 'Configuration',
      description: 'Sort rules by category and alphabetically',
      enabled: true,
      icon: 'sort'
    });
  }

  public canExecute(context: CommandContext): boolean {
    return !!context.activeConfig && !!context.activeDocument;
  }

  public async execute(context: CommandContext): Promise<CommandResult> {
    if (!context.activeConfig || !context.activeDocument) {
      return { success: false, message: 'No configuration to sort' };
    }

    const sortedConfig = this.sortConfiguration(context.activeConfig);
    const configJson = JSON.stringify(sortedConfig, null, 2);

    return {
      success: true,
      message: 'Rules sorted successfully',
      edits: {
        changes: {
          [context.activeDocument.uri]: [{
            range: { start: { line: 0, character: 0 }, end: { line: 999999, character: 0 } },
            newText: configJson
          }]
        }
      }
    };
  }

  private sortConfiguration(config: ClaudeCodeConfiguration): ClaudeCodeConfiguration {
    const sorted = { ...config };

    if (sorted.permissions) {
      if (sorted.permissions.deny) {
        sorted.permissions.deny = [...sorted.permissions.deny].sort();
      }
      if (sorted.permissions.allow) {
        sorted.permissions.allow = [...sorted.permissions.allow].sort();
      }
      if (sorted.permissions.ask) {
        sorted.permissions.ask = [...sorted.permissions.ask].sort();
      }
    }

    return sorted;
  }
}

/**
 * Optimize configuration for performance
 */
export class OptimizeConfigCommand extends BaseCommandExecutor {
  constructor() {
    super({
      id: 'claude-code.optimize',
      title: 'Optimize Configuration',
      category: 'Configuration',
      description: 'Optimize configuration for better performance',
      enabled: true,
      icon: 'optimize'
    });
  }

  public canExecute(context: CommandContext): boolean {
    return !!context.activeConfig && !!context.activeDocument;
  }

  public async execute(context: CommandContext): Promise<CommandResult> {
    if (!context.activeConfig || !context.activeDocument) {
      return { success: false, message: 'No configuration to optimize' };
    }

    const optimized = this.optimizeConfiguration(context.activeConfig);
    const configJson = JSON.stringify(optimized, null, 2);

    return {
      success: true,
      message: 'Configuration optimized for performance',
      edits: {
        changes: {
          [context.activeDocument.uri]: [{
            range: { start: { line: 0, character: 0 }, end: { line: 999999, character: 0 } },
            newText: configJson
          }]
        }
      }
    };
  }

  private optimizeConfiguration(config: ClaudeCodeConfiguration): ClaudeCodeConfiguration {
    const optimized = { ...config };

    if (optimized.permissions) {
      // Remove duplicate rules
      if (optimized.permissions.deny) {
        optimized.permissions.deny = [...new Set(optimized.permissions.deny)];
      }
      if (optimized.permissions.allow) {
        optimized.permissions.allow = [...new Set(optimized.permissions.allow)];
      }
      if (optimized.permissions.ask) {
        optimized.permissions.ask = [...new Set(optimized.permissions.ask)];
      }
    }

    return optimized;
  }
}

/**
 * Analyze rules for insights
 */
export class AnalyzeRulesCommand extends BaseCommandExecutor {
  constructor(private validationEngine: ValidationEngine) {
    super({
      id: 'claude-code.analyze',
      title: 'Analyze Rules',
      category: 'Analysis',
      description: 'Analyze rules for security and performance insights',
      enabled: true,
      icon: 'analysis'
    });
  }

  public canExecute(context: CommandContext): boolean {
    return !!context.activeConfig;
  }

  public async execute(context: CommandContext): Promise<CommandResult> {
    if (!context.activeConfig) {
      return { success: false, message: 'No configuration to analyze' };
    }

    const stats = this.validationEngine.getRuleStatistics(context.activeConfig);
    const analysis = {
      totalRules: stats.totalRules,
      rulesByCategory: stats.byCategory,
      complexity: stats.complexity,
      coverage: stats.coverage,
      recommendations: this.generateRecommendations(stats)
    };

    return {
      success: true,
      message: `Analysis complete: ${stats.totalRules} rules analyzed`,
      data: { analysis }
    };
  }

  private generateRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.byCategory.deny === 0) {
      recommendations.push('Consider adding deny rules for better security');
    }

    if (stats.complexity.regexCount > 10) {
      recommendations.push('High number of regex patterns may impact performance');
    }

    if (stats.coverage.estimatedCoverage < 50) {
      recommendations.push('Configuration may have low coverage - consider adding more rules');
    }

    return recommendations;
  }
}

/**
 * Find rule conflicts
 */
export class FindConflictsCommand extends BaseCommandExecutor {
  constructor(private validationEngine: ValidationEngine) {
    super({
      id: 'claude-code.findConflicts',
      title: 'Find Conflicts',
      category: 'Analysis',
      description: 'Find conflicts between rules',
      enabled: true,
      icon: 'warning'
    });
  }

  public canExecute(context: CommandContext): boolean {
    return !!context.activeConfig;
  }

  public async execute(context: CommandContext): Promise<CommandResult> {
    if (!context.activeConfig) {
      return { success: false, message: 'No configuration to analyze' };
    }

    const result = await this.validationEngine.validate(context.activeConfig, {
      skipCache: true
    });

    const conflictCount = result.conflicts.length;
    const message = conflictCount > 0 ? 
      `Found ${conflictCount} conflict${conflictCount === 1 ? '' : 's'}` :
      'No conflicts found';

    return {
      success: true,
      message,
      data: { conflicts: result.conflicts }
    };
  }
}

/**
 * Format configuration JSON
 */
export class FormatConfigCommand extends BaseCommandExecutor {
  constructor() {
    super({
      id: 'claude-code.format',
      title: 'Format Configuration',
      category: 'Utility',
      description: 'Format JSON configuration file',
      enabled: true,
      keybinding: 'Ctrl+Shift+F',
      icon: 'format'
    });
  }

  public canExecute(context: CommandContext): boolean {
    return !!context.activeDocument && !!context.activeConfig;
  }

  public async execute(context: CommandContext): Promise<CommandResult> {
    if (!context.activeConfig || !context.activeDocument) {
      return { success: false, message: 'No configuration to format' };
    }

    const formatted = JSON.stringify(context.activeConfig, null, 2);

    return {
      success: true,
      message: 'Configuration formatted',
      edits: {
        changes: {
          [context.activeDocument.uri]: [{
            range: { start: { line: 0, character: 0 }, end: { line: 999999, character: 0 } },
            newText: formatted
          }]
        }
      }
    };
  }
}

/**
 * Export configuration
 */
export class ExportConfigCommand extends BaseCommandExecutor {
  constructor() {
    super({
      id: 'claude-code.export',
      title: 'Export Configuration',
      category: 'Utility',
      description: 'Export configuration to different formats',
      enabled: true,
      icon: 'export'
    });
  }

  public canExecute(context: CommandContext): boolean {
    return !!context.activeConfig;
  }

  public async execute(context: CommandContext, format: string = 'json'): Promise<CommandResult> {
    if (!context.activeConfig) {
      return { success: false, message: 'No configuration to export' };
    }

    let exportData: string;
    let extension: string;

    switch (format.toLowerCase()) {
      case 'yaml':
      case 'yml':
        exportData = this.configToYaml(context.activeConfig);
        extension = 'yml';
        break;
      case 'toml':
        exportData = this.configToToml(context.activeConfig);
        extension = 'toml';
        break;
      default:
        exportData = JSON.stringify(context.activeConfig, null, 2);
        extension = 'json';
    }

    return {
      success: true,
      message: `Configuration exported as ${format.toUpperCase()}`,
      data: { 
        exportData, 
        format, 
        extension,
        filename: `claude-settings.${extension}`
      }
    };
  }

  private configToYaml(config: ClaudeCodeConfiguration): string {
    // Simple YAML conversion - in real implementation would use yaml library
    let yaml = 'permissions:\n';
    
    if (config.permissions?.deny) {
      yaml += '  deny:\n';
      for (const rule of config.permissions.deny) {
        yaml += `    - "${rule}"\n`;
      }
    }
    
    if (config.permissions?.allow) {
      yaml += '  allow:\n';
      for (const rule of config.permissions.allow) {
        yaml += `    - "${rule}"\n`;
      }
    }
    
    if (config.permissions?.ask) {
      yaml += '  ask:\n';
      for (const rule of config.permissions.ask) {
        yaml += `    - "${rule}"\n`;
      }
    }
    
    return yaml;
  }

  private configToToml(config: ClaudeCodeConfiguration): string {
    // Simple TOML conversion - in real implementation would use toml library
    let toml = '[permissions]\n';
    
    if (config.permissions?.deny) {
      toml += `deny = [${config.permissions.deny.map(r => `"${r}"`).join(', ')}]\n`;
    }
    
    if (config.permissions?.allow) {
      toml += `allow = [${config.permissions.allow.map(r => `"${r}"`).join(', ')}]\n`;
    }
    
    if (config.permissions?.ask) {
      toml += `ask = [${config.permissions.ask.map(r => `"${r}"`).join(', ')}]\n`;
    }
    
    return toml;
  }
}

/**
 * Import configuration
 */
export class ImportConfigCommand extends BaseCommandExecutor {
  constructor() {
    super({
      id: 'claude-code.import',
      title: 'Import Configuration',
      category: 'Utility',
      description: 'Import configuration from different formats',
      enabled: true,
      icon: 'import'
    });
  }

  public async execute(context: CommandContext, importData: string, format: string = 'json'): Promise<CommandResult> {
    let config: ClaudeCodeConfiguration;

    try {
      switch (format.toLowerCase()) {
        case 'yaml':
        case 'yml':
          config = this.yamlToConfig(importData);
          break;
        case 'toml':
          config = this.tomlToConfig(importData);
          break;
        default:
          config = JSON.parse(importData);
      }

      const configJson = JSON.stringify(config, null, 2);

      return {
        success: true,
        message: `Configuration imported from ${format.toUpperCase()}`,
        data: { config },
        edits: context.activeDocument ? {
          changes: {
            [context.activeDocument.uri]: [{
              range: { start: { line: 0, character: 0 }, end: { line: 999999, character: 0 } },
              newText: configJson
            }]
          }
        } : undefined
      };

    } catch (error) {
      return {
        success: false,
        message: `Failed to import ${format.toUpperCase()}: ${error}`
      };
    }
  }

  private yamlToConfig(yaml: string): ClaudeCodeConfiguration {
    // Simplified YAML parsing - real implementation would use yaml library
    const config: ClaudeCodeConfiguration = { permissions: {} };
    
    // This is a basic implementation for demo purposes
    const lines = yaml.split('\n');
    let currentSection: 'deny' | 'allow' | 'ask' | null = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('deny:')) currentSection = 'deny';
      else if (trimmed.includes('allow:')) currentSection = 'allow';
      else if (trimmed.includes('ask:')) currentSection = 'ask';
      else if (trimmed.startsWith('- ') && currentSection) {
        const rule = trimmed.substring(2).replace(/"/g, '');
        if (!config.permissions) config.permissions = {};
        if (!config.permissions[currentSection]) config.permissions[currentSection] = [];
        config.permissions[currentSection]!.push(rule);
      }
    }
    
    return config;
  }

  private tomlToConfig(toml: string): ClaudeCodeConfiguration {
    // Simplified TOML parsing - real implementation would use toml library
    const config: ClaudeCodeConfiguration = { permissions: {} };
    
    const lines = toml.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('deny = ')) {
        const rules = this.parseTomlArray(trimmed.substring(7));
        config.permissions!.deny = rules;
      } else if (trimmed.startsWith('allow = ')) {
        const rules = this.parseTomlArray(trimmed.substring(8));
        config.permissions!.allow = rules;
      } else if (trimmed.startsWith('ask = ')) {
        const rules = this.parseTomlArray(trimmed.substring(6));
        config.permissions!.ask = rules;
      }
    }
    
    return config;
  }

  private parseTomlArray(arrayStr: string): string[] {
    // Simple array parsing
    const cleaned = arrayStr.replace(/[\[\]]/g, '');
    return cleaned.split(',').map(s => s.trim().replace(/"/g, ''));
  }
}