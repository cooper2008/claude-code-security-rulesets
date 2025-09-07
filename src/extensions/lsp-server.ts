/**
 * Language Server Protocol (LSP) Server
 * Provides multi-IDE support through standardized LSP communication
 * Supports IntelliJ, Sublime Text, Vim/Neovim, Emacs, and other LSP clients
 */

import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  HoverParams,
  Hover,
  CodeActionParams,
  CodeAction,
  CodeActionKind,
  WorkspaceEdit,
  TextEdit,
  Range,
  Position
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClaudeCodeConfiguration, ValidationResult } from '../types';
import { ValidationEngine } from '../validation/engine';
import { DiagnosticsManager } from './diagnostics';

export interface LSPServerConfig {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Enable real-time validation */
  realTimeValidation: boolean;
  /** Validation debounce delay */
  validationDelay: number;
  /** Maximum number of completion items */
  maxCompletionItems: number;
  /** Enable hover support */
  enableHover: boolean;
  /** Enable code actions */
  enableCodeActions: boolean;
}

export interface ServerCapabilities {
  /** Text document sync mode */
  textDocumentSync: TextDocumentSyncKind;
  /** Completion provider */
  completionProvider?: {
    resolveProvider?: boolean;
    triggerCharacters?: string[];
  };
  /** Hover provider */
  hoverProvider?: boolean;
  /** Code action provider */
  codeActionProvider?: boolean | {
    codeActionKinds?: CodeActionKind[];
  };
  /** Diagnostic provider */
  diagnosticProvider?: {
    interFileDependencies: boolean;
    workspaceDiagnostics: boolean;
  };
}

/**
 * Language Server for Claude Code Security Rulesets
 */
export class ClaudeCodeLanguageServer {
  private connection = createConnection(ProposedFeatures.all);
  private documents = new TextDocuments(TextDocument);
  private validationEngine: ValidationEngine;
  private diagnosticsManager: DiagnosticsManager;
  private config: LSPServerConfig;
  private validationTimers = new Map<string, NodeJS.Timeout>();
  private documentConfigs = new Map<string, ClaudeCodeConfiguration>();

  constructor(config?: Partial<LSPServerConfig>) {
    this.config = {
      name: 'Claude Code Security Language Server',
      version: '1.0.0',
      realTimeValidation: true,
      validationDelay: 500,
      maxCompletionItems: 50,
      enableHover: true,
      enableCodeActions: true,
      ...config
    };

    this.validationEngine = new ValidationEngine();
    this.diagnosticsManager = new DiagnosticsManager({
      updateDiagnostics: async (uri: string, diagnostics: Diagnostic[]) => {
        await this.updateDiagnostics(uri, diagnostics);
      },
      clearDiagnostics: async (uri: string) => {
        await this.clearDiagnostics(uri);
      },
      clearAllDiagnostics: async () => {
        await this.clearAllDiagnostics();
      }
    });

    this.setupEventHandlers();
  }

  /**
   * Start the language server
   */
  public async start(): Promise<void> {
    // Initialize connection handlers
    this.connection.onInitialize(this.onInitialize.bind(this));
    this.connection.onInitialized(this.onInitialized.bind(this));
    this.connection.onDidChangeConfiguration(this.onDidChangeConfiguration.bind(this));

    // Document handlers
    this.documents.onDidChangeContent(this.onDocumentChangeContent.bind(this));
    this.documents.onDidClose(this.onDocumentClose.bind(this));

    // Language feature handlers
    this.connection.onCompletion(this.onCompletion.bind(this));
    this.connection.onCompletionResolve(this.onCompletionResolve.bind(this));
    this.connection.onHover(this.onHover.bind(this));
    this.connection.onCodeAction(this.onCodeAction.bind(this));

    // Make the text document manager listen on the connection
    this.documents.listen(this.connection);

    // Start listening
    this.connection.listen();
    
    this.connection.console.log('Claude Code Language Server started');
  }

  /**
   * Initialize server capabilities
   */
  private onInitialize(params: InitializeParams): InitializeResult {
    this.connection.console.log(`Initializing Claude Code Language Server v${this.config.version}`);
    
    const capabilities: ServerCapabilities = {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    };

    // Add completion support
    capabilities.completionProvider = {
      resolveProvider: true,
      triggerCharacters: ['"', '[', '{', '*', '.', '/']
    };

    // Add hover support
    if (this.config.enableHover) {
      capabilities.hoverProvider = true;
    }

    // Add code actions support
    if (this.config.enableCodeActions) {
      capabilities.codeActionProvider = {
        codeActionKinds: [
          CodeActionKind.QuickFix,
          CodeActionKind.Refactor,
          CodeActionKind.Source
        ]
      };
    }

    return {
      capabilities,
      serverInfo: {
        name: this.config.name,
        version: this.config.version
      }
    };
  }

  /**
   * Server initialized
   */
  private async onInitialized(): Promise<void> {
    // Register for configuration changes
    await this.connection.client.register(DidChangeConfigurationNotification.type);
    this.connection.console.log('Claude Code Language Server initialized');
  }

  /**
   * Configuration changed
   */
  private async onDidChangeConfiguration(): Promise<void> {
    // Refresh all document validations
    for (const document of this.documents.all()) {
      await this.validateDocument(document);
    }
  }

  /**
   * Document content changed
   */
  private async onDocumentChangeContent(change: { document: TextDocument }): Promise<void> {
    const document = change.document;
    
    if (!this.isClaudeCodeDocument(document)) {
      return;
    }

    // Parse and cache configuration
    try {
      const config = JSON.parse(document.getText()) as ClaudeCodeConfiguration;
      this.documentConfigs.set(document.uri, config);
    } catch (error) {
      // Invalid JSON - will be caught by validation
      this.documentConfigs.delete(document.uri);
    }

    if (!this.config.realTimeValidation) {
      return;
    }

    // Debounce validation
    const existingTimer = this.validationTimers.get(document.uri);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      try {
        await this.validateDocument(document);
      } catch (error) {
        this.connection.console.error(`Validation failed for ${document.uri}: ${error}`);
      }
    }, this.config.validationDelay);

    this.validationTimers.set(document.uri, timer);
  }

  /**
   * Document closed
   */
  private async onDocumentClose(event: { document: TextDocument }): Promise<void> {
    const uri = event.document.uri;
    
    // Clear validation timer
    const timer = this.validationTimers.get(uri);
    if (timer) {
      clearTimeout(timer);
      this.validationTimers.delete(uri);
    }

    // Clear cached config
    this.documentConfigs.delete(uri);

    // Clear diagnostics
    await this.clearDiagnostics(uri);
  }

  /**
   * Provide completion items
   */
  private async onCompletion(params: TextDocumentPositionParams): Promise<CompletionItem[]> {
    const document = this.documents.get(params.textDocument.uri);
    if (!document || !this.isClaudeCodeDocument(document)) {
      return [];
    }

    const position = params.position;
    const context = this.getCompletionContext(document, position);
    
    return this.generateCompletionItems(context);
  }

  /**
   * Resolve completion item
   */
  private async onCompletionResolve(item: CompletionItem): Promise<CompletionItem> {
    // Add detailed documentation
    if (item.data?.type === 'rule-pattern') {
      item.documentation = this.getRulePatternDocumentation(item.label);
    } else if (item.data?.type === 'security-template') {
      item.documentation = this.getSecurityTemplateDocumentation(item.label);
    }

    return item;
  }

  /**
   * Provide hover information
   */
  private async onHover(params: HoverParams): Promise<Hover | null> {
    const document = this.documents.get(params.textDocument.uri);
    if (!document || !this.isClaudeCodeDocument(document)) {
      return null;
    }

    const position = params.position;
    const context = this.getHoverContext(document, position);
    
    if (context.type === 'rule') {
      return this.generateRuleHover(context);
    } else if (context.type === 'section') {
      return this.generateSectionHover(context);
    }

    return null;
  }

  /**
   * Provide code actions
   */
  private async onCodeAction(params: CodeActionParams): Promise<CodeAction[]> {
    const document = this.documents.get(params.textDocument.uri);
    if (!document || !this.isClaudeCodeDocument(document)) {
      return [];
    }

    const actions: CodeAction[] = [];
    const config = this.documentConfigs.get(document.uri);

    // Quick fixes for diagnostics
    for (const diagnostic of params.context.diagnostics) {
      const quickFixes = await this.generateQuickFixes(document, diagnostic, config);
      actions.push(...quickFixes);
    }

    // Source actions
    actions.push(...this.generateSourceActions(document, config));

    return actions;
  }

  /**
   * Check if document is a Claude Code configuration
   */
  private isClaudeCodeDocument(document: TextDocument): boolean {
    return document.languageId === 'json' && (
      document.uri.includes('.claude/settings') ||
      document.uri.includes('claude-settings') ||
      document.uri.endsWith('.claude.json')
    );
  }

  /**
   * Validate document and update diagnostics
   */
  private async validateDocument(document: TextDocument): Promise<void> {
    try {
      const content = document.getText();
      
      // Try to parse JSON
      let config: ClaudeCodeConfiguration;
      try {
        config = JSON.parse(content);
      } catch (parseError) {
        // JSON parse error
        const diagnostic: Diagnostic = {
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: content.length }
          },
          message: `JSON Parse Error: ${parseError}`,
          source: 'claude-code-lsp'
        };
        
        await this.updateDiagnostics(document.uri, [diagnostic]);
        return;
      }

      // Validate with engine
      const result = await this.validationEngine.validate(config);
      
      // Convert to LSP diagnostics
      const diagnostics = await this.convertValidationResultToDiagnostics(document, result);
      
      // Update diagnostics
      await this.updateDiagnostics(document.uri, diagnostics);
      
    } catch (error) {
      this.connection.console.error(`Validation error: ${error}`);
    }
  }

  /**
   * Convert validation result to LSP diagnostics
   */
  private async convertValidationResultToDiagnostics(
    document: TextDocument, 
    result: ValidationResult
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    // Convert errors
    for (const error of result.errors) {
      const range = this.findRuleRange(document, error.location?.rule || '');
      diagnostics.push({
        severity: error.severity === 'critical' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
        range,
        message: error.message,
        source: 'claude-code-validation',
        code: error.type
      });
    }

    // Convert warnings
    for (const warning of result.warnings) {
      const range = this.findRuleRange(document, warning.context?.rule as string || '');
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range,
        message: warning.message,
        source: 'claude-code-validation',
        code: warning.type
      });
    }

    // Convert conflicts
    for (const conflict of result.conflicts) {
      if (conflict.conflictingRules[0]) {
        const range = this.findRuleRange(document, conflict.conflictingRules[0].pattern);
        diagnostics.push({
          severity: conflict.securityImpact === 'critical' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
          range,
          message: conflict.message,
          source: 'claude-code-conflicts',
          code: conflict.type
        });
      }
    }

    return diagnostics;
  }

  /**
   * Get completion context
   */
  private getCompletionContext(document: TextDocument, position: Position): any {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const lineText = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line, character: position.character }
    });

    // Determine context
    if (lineText.includes('"deny"') || lineText.includes('"allow"') || lineText.includes('"ask"')) {
      return { type: 'rule-array', category: this.extractCategory(lineText) };
    }

    if (lineText.includes('"') && !lineText.endsWith('"')) {
      return { type: 'rule-pattern' };
    }

    if (text.substring(0, offset).includes('permissions')) {
      return { type: 'permissions-section' };
    }

    return { type: 'general' };
  }

  /**
   * Generate completion items based on context
   */
  private generateCompletionItems(context: any): CompletionItem[] {
    const items: CompletionItem[] = [];

    if (context.type === 'rule-pattern') {
      // Common security patterns
      items.push(
        {
          label: 'exec',
          kind: CompletionItemKind.Snippet,
          insertText: 'exec',
          detail: 'Shell execution commands',
          data: { type: 'rule-pattern' }
        },
        {
          label: 'shell',
          kind: CompletionItemKind.Snippet,
          insertText: 'shell',
          detail: 'Shell access patterns',
          data: { type: 'rule-pattern' }
        },
        {
          label: '*.js',
          kind: CompletionItemKind.Snippet,
          insertText: '*.js',
          detail: 'JavaScript files',
          data: { type: 'rule-pattern' }
        },
        {
          label: '../*',
          kind: CompletionItemKind.Snippet,
          insertText: '../*',
          detail: 'Parent directory access',
          data: { type: 'rule-pattern' }
        },
        {
          label: '/etc/*',
          kind: CompletionItemKind.Snippet,
          insertText: '/etc/*',
          detail: 'System configuration files',
          data: { type: 'rule-pattern' }
        }
      );
    } else if (context.type === 'permissions-section') {
      // Permission categories
      items.push(
        {
          label: 'deny',
          kind: CompletionItemKind.Field,
          insertText: '"deny": []',
          detail: 'Rules that are completely blocked'
        },
        {
          label: 'allow',
          kind: CompletionItemKind.Field,
          insertText: '"allow": []',
          detail: 'Rules that are explicitly permitted'
        },
        {
          label: 'ask',
          kind: CompletionItemKind.Field,
          insertText: '"ask": []',
          detail: 'Rules that require user confirmation'
        }
      );
    }

    return items.slice(0, this.config.maxCompletionItems);
  }

  /**
   * Get hover context
   */
  private getHoverContext(document: TextDocument, position: Position): any {
    const lineText = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line + 1, character: 0 }
    });

    if (lineText.includes('"deny"') || lineText.includes('"allow"') || lineText.includes('"ask"')) {
      return { type: 'section', section: this.extractCategory(lineText) };
    }

    const wordRange = this.getWordRangeAtPosition(document, position);
    if (wordRange) {
      const word = document.getText(wordRange);
      return { type: 'rule', rule: word };
    }

    return { type: 'unknown' };
  }

  /**
   * Generate hover for rules
   */
  private generateRuleHover(context: any): Hover {
    const rule = context.rule;
    const contents = [`**Claude Code Rule**: \`${rule}\``];

    // Add pattern analysis
    if (rule.includes('*')) {
      contents.push('This is a glob pattern that matches multiple files/paths.');
    }

    if (rule.includes('..')) {
      contents.push('⚠️ **Warning**: Contains path traversal pattern');
    }

    return { contents };
  }

  /**
   * Generate hover for sections
   */
  private generateSectionHover(context: any): Hover {
    const section = context.section;
    const descriptions = {
      deny: '**Deny Rules**: Completely block these actions without user confirmation',
      allow: '**Allow Rules**: Explicitly permit these actions',
      ask: '**Ask Rules**: Require user confirmation for these actions'
    };

    return {
      contents: [descriptions[section as keyof typeof descriptions] || 'Claude Code permissions section']
    };
  }

  /**
   * Generate quick fixes for diagnostics
   */
  private async generateQuickFixes(
    document: TextDocument, 
    diagnostic: Diagnostic,
    config?: ClaudeCodeConfiguration
  ): Promise<CodeAction[]> {
    const actions: CodeAction[] = [];

    if (diagnostic.code === 'rule-conflict' && config) {
      // Suggest removing conflicting rule
      const action: CodeAction = {
        title: 'Remove conflicting rule',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: this.createRemoveRuleEdit(document, diagnostic.range)
      };
      actions.push(action);
    }

    if (diagnostic.code === 'broad-pattern') {
      // Suggest making pattern more specific
      const action: CodeAction = {
        title: 'Make pattern more specific',
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic]
        // Edit would be generated based on context
      };
      actions.push(action);
    }

    return actions;
  }

  /**
   * Generate source actions
   */
  private generateSourceActions(document: TextDocument, config?: ClaudeCodeConfiguration): CodeAction[] {
    const actions: CodeAction[] = [];

    // Add security template
    actions.push({
      title: 'Add security template',
      kind: CodeActionKind.Source,
      edit: this.createAddSecurityTemplateEdit(document)
    });

    // Sort rules
    actions.push({
      title: 'Sort rules by category',
      kind: CodeActionKind.Source,
      edit: this.createSortRulesEdit(document, config)
    });

    return actions;
  }

  /**
   * Utility methods
   */
  private findRuleRange(document: TextDocument, rule: string): Range {
    const content = document.getText();
    const index = content.indexOf(`"${rule}"`);
    
    if (index === -1) {
      return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    }

    const start = document.positionAt(index);
    const end = document.positionAt(index + rule.length + 2);
    
    return { start, end };
  }

  private extractCategory(lineText: string): string {
    if (lineText.includes('"deny"')) return 'deny';
    if (lineText.includes('"allow"')) return 'allow';
    if (lineText.includes('"ask"')) return 'ask';
    return 'unknown';
  }

  private getWordRangeAtPosition(document: TextDocument, position: Position): Range | null {
    const line = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line + 1, character: 0 }
    });

    const wordMatch = line.match(/\b\w+\b/g);
    if (!wordMatch) return null;

    // Simple word boundary detection
    const char = position.character;
    let start = char;
    let end = char;

    while (start > 0 && /\w/.test(line[start - 1])) {
      start--;
    }

    while (end < line.length && /\w/.test(line[end])) {
      end++;
    }

    return {
      start: { line: position.line, character: start },
      end: { line: position.line, character: end }
    };
  }

  private createRemoveRuleEdit(document: TextDocument, range: Range): WorkspaceEdit {
    return {
      changes: {
        [document.uri]: [{
          range,
          newText: ''
        }]
      }
    };
  }

  private createAddSecurityTemplateEdit(document: TextDocument): WorkspaceEdit {
    const securityTemplate = `
  "permissions": {
    "deny": [
      "exec",
      "shell",
      "cmd",
      "../*",
      "/etc/*"
    ],
    "allow": [
      "*.js",
      "*.ts",
      "*.json"
    ],
    "ask": [
      "package.json",
      "*.config.*"
    ]
  }`;

    return {
      changes: {
        [document.uri]: [{
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
          newText: securityTemplate
        }]
      }
    };
  }

  private createSortRulesEdit(document: TextDocument, config?: ClaudeCodeConfiguration): WorkspaceEdit {
    // This would implement rule sorting logic
    return { changes: {} };
  }

  private getRulePatternDocumentation(label: string): string {
    const docs = {
      'exec': 'Matches shell execution commands. Use in deny rules for security.',
      'shell': 'Matches shell access patterns. Often used in security policies.',
      '*.js': 'Matches all JavaScript files using glob pattern.',
      '../*': 'Path traversal pattern - matches parent directory access.',
      '/etc/*': 'Matches system configuration files in /etc directory.'
    };
    return docs[label as keyof typeof docs] || `Rule pattern: ${label}`;
  }

  private getSecurityTemplateDocumentation(label: string): string {
    return `Security template: ${label}`;
  }

  /**
   * LSP diagnostic methods
   */
  private async updateDiagnostics(uri: string, diagnostics: Diagnostic[]): Promise<void> {
    await this.connection.sendDiagnostics({ uri, diagnostics });
  }

  private async clearDiagnostics(uri: string): Promise<void> {
    await this.connection.sendDiagnostics({ uri, diagnostics: [] });
  }

  private async clearAllDiagnostics(): Promise<void> {
    for (const document of this.documents.all()) {
      await this.clearDiagnostics(document.uri);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.connection.onExit(() => {
      this.validationEngine.shutdown().catch(console.error);
    });
  }

  /**
   * Get server statistics
   */
  public getStats(): any {
    return {
      documentsOpen: this.documents.all().length,
      validationTimersActive: this.validationTimers.size,
      configsCached: this.documentConfigs.size
    };
  }
}

/**
 * Start the LSP server
 */
export function startLanguageServer(config?: Partial<LSPServerConfig>): ClaudeCodeLanguageServer {
  const server = new ClaudeCodeLanguageServer(config);
  server.start().catch(console.error);
  return server;
}