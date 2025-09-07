/**
 * Base Extension Architecture
 * Provides foundation for IDE extensions with real-time validation
 * Support for VS Code, IntelliJ, Sublime Text, Vim/Neovim, Emacs through LSP
 */

import { EventEmitter } from 'events';
import { ClaudeCodeConfiguration, ValidationResult, ValidationError, ValidationWarning } from '../types';
import { ValidationEngine } from '../validation/engine';

export interface ExtensionConfig {
  /** Extension identifier */
  id: string;
  /** Display name */
  name: string;
  /** Version */
  version: string;
  /** IDE platform (vscode, intellij, sublime, vim, emacs, lsp) */
  platform: ExtensionPlatform;
  /** Enable real-time validation */
  realTimeValidation: boolean;
  /** Validation debounce delay in ms */
  validationDelay: number;
  /** Show decorations for errors/warnings */
  showDecorations: boolean;
  /** Enable syntax highlighting */
  syntaxHighlighting: boolean;
  /** Enable quick fixes */
  quickFixes: boolean;
  /** Enable status bar indicator */
  statusBar: boolean;
}

export type ExtensionPlatform = 'vscode' | 'intellij' | 'sublime' | 'vim' | 'emacs' | 'lsp';

export interface ExtensionContext {
  /** Extension configuration */
  config: ExtensionConfig;
  /** Current workspace root path */
  workspaceRoot?: string;
  /** Extension storage path */
  storagePath: string;
  /** Extension global state */
  globalState: Map<string, any>;
  /** Extension workspace state */
  workspaceState: Map<string, any>;
}

export interface DocumentPosition {
  line: number;
  character: number;
}

export interface DocumentRange {
  start: DocumentPosition;
  end: DocumentPosition;
}

export interface TextDocument {
  uri: string;
  languageId: string;
  version: number;
  getText(range?: DocumentRange): string;
  lineAt(line: number): { text: string; range: DocumentRange };
  positionAt(offset: number): DocumentPosition;
  offsetAt(position: DocumentPosition): number;
}

export interface Diagnostic {
  range: DocumentRange;
  message: string;
  severity: DiagnosticSeverity;
  source: string;
  code?: string | number;
  relatedInformation?: DiagnosticRelatedInformation[];
}

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4
}

export interface DiagnosticRelatedInformation {
  location: {
    uri: string;
    range: DocumentRange;
  };
  message: string;
}

export interface CodeAction {
  title: string;
  kind?: CodeActionKind;
  diagnostics?: Diagnostic[];
  edit?: WorkspaceEdit;
  command?: Command;
  isPreferred?: boolean;
}

export enum CodeActionKind {
  QuickFix = 'quickfix',
  Refactor = 'refactor',
  Source = 'source'
}

export interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] };
}

export interface TextEdit {
  range: DocumentRange;
  newText: string;
}

export interface Command {
  title: string;
  command: string;
  arguments?: any[];
}

export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
  filterText?: string;
  sortText?: string;
}

export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18
}

export interface HoverContent {
  contents: string[];
  range?: DocumentRange;
}

/**
 * Base IDE Extension class
 * Provides common functionality for all IDE extensions
 */
export abstract class BaseExtension extends EventEmitter {
  protected context: ExtensionContext;
  protected validationEngine: ValidationEngine;
  private validationTimer?: NodeJS.Timeout;
  private documentCache = new Map<string, { document: TextDocument; config?: ClaudeCodeConfiguration }>();

  constructor(context: ExtensionContext) {
    super();
    this.context = context;
    this.validationEngine = new ValidationEngine();
    this.setupEventHandlers();
  }

  /**
   * Initialize the extension
   */
  public async activate(): Promise<void> {
    this.emit('extension:activating');
    
    try {
      await this.initializePlatform();
      await this.setupWorkspace();
      await this.registerProviders();
      
      this.emit('extension:activated');
      this.log('Extension activated successfully');
    } catch (error) {
      this.emit('extension:error', error);
      this.logError('Failed to activate extension', error);
      throw error;
    }
  }

  /**
   * Deactivate the extension
   */
  public async deactivate(): Promise<void> {
    this.emit('extension:deactivating');
    
    try {
      if (this.validationTimer) {
        clearTimeout(this.validationTimer);
      }
      
      await this.validationEngine.shutdown();
      await this.cleanupPlatform();
      
      this.emit('extension:deactivated');
      this.log('Extension deactivated successfully');
    } catch (error) {
      this.logError('Error during deactivation', error);
    }
  }

  /**
   * Platform-specific initialization
   */
  protected abstract initializePlatform(): Promise<void>;

  /**
   * Platform-specific cleanup
   */
  protected abstract cleanupPlatform(): Promise<void>;

  /**
   * Register language providers (completion, hover, diagnostics, etc.)
   */
  protected abstract registerProviders(): Promise<void>;

  /**
   * Setup workspace and discover Claude Code configurations
   */
  protected async setupWorkspace(): Promise<void> {
    if (!this.context.workspaceRoot) {
      return;
    }

    // Discover existing Claude Code configurations
    const configFiles = await this.findConfigurationFiles();
    
    for (const configFile of configFiles) {
      await this.loadConfigurationFile(configFile);
    }

    this.emit('workspace:setup-complete', { configFiles: configFiles.length });
  }

  /**
   * Find Claude Code configuration files in workspace
   */
  protected async findConfigurationFiles(): Promise<string[]> {
    const patterns = [
      '.claude/settings.json',
      '.claude/settings.local.json',
      'claude-settings.json'
    ];

    const files: string[] = [];
    
    if (!this.context.workspaceRoot) {
      return files;
    }

    // Platform-specific file search would be implemented by subclasses
    for (const pattern of patterns) {
      const fullPath = this.resolvePath(this.context.workspaceRoot, pattern);
      if (await this.fileExists(fullPath)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Load and parse a configuration file
   */
  protected async loadConfigurationFile(filePath: string): Promise<ClaudeCodeConfiguration | null> {
    try {
      const content = await this.readFile(filePath);
      const config = JSON.parse(content) as ClaudeCodeConfiguration;
      
      this.emit('config:loaded', { filePath, config });
      return config;
    } catch (error) {
      this.logError(`Failed to load configuration from ${filePath}`, error);
      return null;
    }
  }

  /**
   * Handle document change events for real-time validation
   */
  public onDocumentChange(document: TextDocument): void {
    if (!this.isClaudeCodeFile(document)) {
      return;
    }

    // Cache the document
    this.documentCache.set(document.uri, { document });

    if (!this.context.config.realTimeValidation) {
      return;
    }

    // Debounce validation
    if (this.validationTimer) {
      clearTimeout(this.validationTimer);
    }

    this.validationTimer = setTimeout(() => {
      this.validateDocument(document).catch(error => {
        this.logError('Document validation failed', error);
      });
    }, this.context.config.validationDelay);
  }

  /**
   * Check if document is a Claude Code configuration file
   */
  protected isClaudeCodeFile(document: TextDocument): boolean {
    return document.languageId === 'json' && (
      document.uri.includes('.claude/settings') ||
      document.uri.includes('claude-settings') ||
      document.uri.endsWith('.claude.json')
    );
  }

  /**
   * Validate a document and update diagnostics
   */
  protected async validateDocument(document: TextDocument): Promise<ValidationResult | null> {
    try {
      const content = document.getText();
      const config = JSON.parse(content) as ClaudeCodeConfiguration;
      
      // Update cached config
      const cached = this.documentCache.get(document.uri);
      if (cached) {
        cached.config = config;
      }

      const result = await this.validationEngine.validate(config);
      
      // Convert validation result to diagnostics
      const diagnostics = this.createDiagnostics(document, result);
      
      // Update diagnostics in IDE
      await this.updateDiagnostics(document.uri, diagnostics);
      
      // Update status bar
      if (this.context.config.statusBar) {
        await this.updateStatusBar(result);
      }

      this.emit('document:validated', { document, result });
      return result;
      
    } catch (error) {
      // Parse error - create syntax diagnostic
      const diagnostic: Diagnostic = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: `JSON Parse Error: ${error}`,
        severity: DiagnosticSeverity.Error,
        source: 'claude-code-security'
      };

      await this.updateDiagnostics(document.uri, [diagnostic]);
      this.emit('document:parse-error', { document, error });
      return null;
    }
  }

  /**
   * Convert validation result to IDE diagnostics
   */
  protected createDiagnostics(document: TextDocument, result: ValidationResult): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Add errors
    for (const error of result.errors) {
      const diagnostic = this.createDiagnosticFromError(document, error);
      if (diagnostic) {
        diagnostics.push(diagnostic);
      }
    }

    // Add warnings
    for (const warning of result.warnings) {
      const diagnostic = this.createDiagnosticFromWarning(document, warning);
      if (diagnostic) {
        diagnostics.push(diagnostic);
      }
    }

    // Add conflict information
    for (const conflict of result.conflicts) {
      const diagnostic: Diagnostic = {
        range: this.findRuleRange(document, conflict.conflictingRules[0]?.pattern || ''),
        message: `Rule Conflict: ${conflict.message}`,
        severity: conflict.securityImpact === 'critical' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
        source: 'claude-code-security',
        code: 'rule-conflict'
      };
      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  /**
   * Create diagnostic from validation error
   */
  protected createDiagnosticFromError(document: TextDocument, error: ValidationError): Diagnostic | null {
    const range = this.findErrorRange(document, error);
    if (!range) return null;

    return {
      range,
      message: error.message,
      severity: error.severity === 'critical' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      source: 'claude-code-security',
      code: error.type
    };
  }

  /**
   * Create diagnostic from validation warning
   */
  protected createDiagnosticFromWarning(document: TextDocument, warning: ValidationWarning): Diagnostic | null {
    const range = this.findWarningRange(document, warning);
    if (!range) return null;

    return {
      range,
      message: warning.message,
      severity: DiagnosticSeverity.Warning,
      source: 'claude-code-security',
      code: warning.type
    };
  }

  /**
   * Find range for error in document
   */
  protected findErrorRange(document: TextDocument, error: ValidationError): DocumentRange | null {
    if (error.location?.rule) {
      return this.findRuleRange(document, error.location.rule);
    }
    return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  }

  /**
   * Find range for warning in document
   */
  protected findWarningRange(document: TextDocument, warning: ValidationWarning): DocumentRange | null {
    if (warning.context?.rule) {
      return this.findRuleRange(document, warning.context.rule);
    }
    return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  }

  /**
   * Find the range of a specific rule in the document
   */
  protected findRuleRange(document: TextDocument, rule: string): DocumentRange {
    const content = document.getText();
    const ruleIndex = content.indexOf(`"${rule}"`);
    
    if (ruleIndex === -1) {
      return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    }

    const start = document.positionAt(ruleIndex);
    const end = document.positionAt(ruleIndex + rule.length + 2); // +2 for quotes
    
    return { start, end };
  }

  /**
   * Abstract methods for platform-specific implementations
   */
  protected abstract updateDiagnostics(uri: string, diagnostics: Diagnostic[]): Promise<void>;
  protected abstract updateStatusBar(result: ValidationResult): Promise<void>;
  protected abstract fileExists(path: string): Promise<boolean>;
  protected abstract readFile(path: string): Promise<string>;
  protected abstract resolvePath(...segments: string[]): string;

  /**
   * Setup event handlers
   */
  protected setupEventHandlers(): void {
    this.on('extension:error', (error) => {
      this.logError('Extension error', error);
    });

    this.on('document:validated', ({ result }) => {
      this.log(`Validation completed: ${result.isValid ? 'VALID' : 'INVALID'} (${result.errors.length} errors, ${result.warnings.length} warnings)`);
    });
  }

  /**
   * Logging methods
   */
  protected log(message: string): void {
    console.log(`[${this.context.config.name}] ${message}`);
  }

  protected logError(message: string, error?: any): void {
    console.error(`[${this.context.config.name}] ERROR: ${message}`, error);
  }

  /**
   * Get cached document configuration
   */
  public getDocumentConfig(uri: string): ClaudeCodeConfiguration | undefined {
    return this.documentCache.get(uri)?.config;
  }

  /**
   * Get all cached documents
   */
  public getCachedDocuments(): Map<string, { document: TextDocument; config?: ClaudeCodeConfiguration }> {
    return new Map(this.documentCache);
  }

  /**
   * Clear document cache
   */
  public clearCache(): void {
    this.documentCache.clear();
  }
}

/**
 * Extension capabilities interface
 * Defines what features an extension supports
 */
export interface ExtensionCapabilities {
  /** Real-time validation support */
  realTimeValidation: boolean;
  /** Syntax highlighting for Claude Code settings */
  syntaxHighlighting: boolean;
  /** Error decorations and squiggles */
  diagnostics: boolean;
  /** Quick fixes and code actions */
  codeActions: boolean;
  /** Auto-completion for rules */
  completion: boolean;
  /** Hover information */
  hover: boolean;
  /** Status bar integration */
  statusBar: boolean;
  /** Command palette integration */
  commands: boolean;
  /** Settings UI */
  settingsUI: boolean;
}

/**
 * Default capabilities for most IDE extensions
 */
export const DEFAULT_CAPABILITIES: ExtensionCapabilities = {
  realTimeValidation: true,
  syntaxHighlighting: true,
  diagnostics: true,
  codeActions: true,
  completion: true,
  hover: true,
  statusBar: true,
  commands: true,
  settingsUI: false // Platform dependent
};