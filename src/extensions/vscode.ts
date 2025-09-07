/**
 * VS Code Specific Implementation
 * Provides VS Code extension functionality with full IDE integration
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { 
  BaseExtension, 
  ExtensionContext as BaseExtensionContext, 
  ExtensionConfig,
  TextDocument as BaseTextDocument,
  DocumentPosition,
  DocumentRange,
  Diagnostic as BaseDiagnostic,
  DiagnosticSeverity as BaseDiagnosticSeverity,
  CodeAction as BaseCodeAction,
  CompletionItem as BaseCompletionItem,
  HoverContent,
  DEFAULT_CAPABILITIES
} from './base';
import { DiagnosticsManager, DiagnosticsProvider } from './diagnostics';
import { CommandManager, CommandContext, CommandResult } from './commands';
import { UIManager, UIProvider, QuickPickItem, QuickPickOptions, InputBoxOptions, ProgressOptions, ProgressReporter, StatusBarItem, StatusBarAlignment } from './ui';
import { ClaudeCodeConfiguration, ValidationResult } from '../types';

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

/**
 * VS Code Text Document adapter
 */
class VSCodeTextDocument implements BaseTextDocument {
  constructor(private document: vscode.TextDocument) {}

  get uri(): string {
    return this.document.uri.toString();
  }

  get languageId(): string {
    return this.document.languageId;
  }

  get version(): number {
    return this.document.version;
  }

  getText(range?: DocumentRange): string {
    if (range) {
      const vsRange = new vscode.Range(
        range.start.line,
        range.start.character,
        range.end.line,
        range.end.character
      );
      return this.document.getText(vsRange);
    }
    return this.document.getText();
  }

  lineAt(line: number): { text: string; range: DocumentRange } {
    const textLine = this.document.lineAt(line);
    return {
      text: textLine.text,
      range: {
        start: { line: textLine.range.start.line, character: textLine.range.start.character },
        end: { line: textLine.range.end.line, character: textLine.range.end.character }
      }
    };
  }

  positionAt(offset: number): DocumentPosition {
    const pos = this.document.positionAt(offset);
    return { line: pos.line, character: pos.character };
  }

  offsetAt(position: DocumentPosition): number {
    return this.document.offsetAt(new vscode.Position(position.line, position.character));
  }
}

/**
 * VS Code UI Provider implementation
 */
class VSCodeUIProvider implements UIProvider {
  async showInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showInformationMessage(message, ...items);
  }

  async showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showWarningMessage(message, ...items);
  }

  async showErrorMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showErrorMessage(message, ...items);
  }

  async showQuickPick(items: QuickPickItem[], options?: QuickPickOptions): Promise<QuickPickItem | undefined> {
    const vsItems = items.map(item => ({
      ...item,
      picked: item.picked
    }));

    const selected = await vscode.window.showQuickPick(vsItems, {
      placeHolder: options?.placeHolder,
      canPickMany: options?.canPickMany,
      ignoreFocusOut: options?.ignoreFocusOut,
      matchOnDescription: options?.matchOnDescription,
      matchOnDetail: options?.matchOnDetail
    });

    return selected as QuickPickItem | undefined;
  }

  async showInputBox(options?: InputBoxOptions): Promise<string | undefined> {
    return vscode.window.showInputBox({
      value: options?.value,
      placeHolder: options?.placeHolder,
      password: options?.password,
      ignoreFocusOut: options?.ignoreFocusOut,
      validateInput: options?.validateInput
    });
  }

  async withProgress<T>(options: ProgressOptions, task: (progress: ProgressReporter) => Promise<T>): Promise<T> {
    const location = this.convertProgressLocation(options.location);
    
    return vscode.window.withProgress(
      {
        location,
        title: options.title,
        cancellable: options.cancellable
      },
      async (progress, token) => {
        const reporter: ProgressReporter = {
          report: (value) => progress.report(value)
        };
        
        return task(reporter);
      }
    );
  }

  private convertProgressLocation(location: any): vscode.ProgressLocation {
    switch (location) {
      case 1: return vscode.ProgressLocation.SourceControl;
      case 10: return vscode.ProgressLocation.Window;
      case 15: return vscode.ProgressLocation.Notification;
      default: return vscode.ProgressLocation.Notification;
    }
  }
}

/**
 * VS Code Diagnostics Provider implementation
 */
class VSCodeDiagnosticsProvider implements DiagnosticsProvider {
  private diagnosticsCollection: vscode.DiagnosticCollection;

  constructor(diagnosticsCollection: vscode.DiagnosticCollection) {
    this.diagnosticsCollection = diagnosticsCollection;
  }

  async updateDiagnostics(uri: string, diagnostics: BaseDiagnostic[]): Promise<void> {
    const vscodeUri = vscode.Uri.parse(uri);
    const vscodeDiagnostics = diagnostics.map(this.convertDiagnostic);
    this.diagnosticsCollection.set(vscodeUri, vscodeDiagnostics);
  }

  async clearDiagnostics(uri: string): Promise<void> {
    const vscodeUri = vscode.Uri.parse(uri);
    this.diagnosticsCollection.delete(vscodeUri);
  }

  async clearAllDiagnostics(): Promise<void> {
    this.diagnosticsCollection.clear();
  }

  private convertDiagnostic(diagnostic: BaseDiagnostic): vscode.Diagnostic {
    const range = new vscode.Range(
      diagnostic.range.start.line,
      diagnostic.range.start.character,
      diagnostic.range.end.line,
      diagnostic.range.end.character
    );

    const severity = this.convertSeverity(diagnostic.severity);
    
    const vsDiagnostic = new vscode.Diagnostic(range, diagnostic.message, severity);
    vsDiagnostic.source = diagnostic.source;
    vsDiagnostic.code = diagnostic.code;

    if (diagnostic.relatedInformation) {
      vsDiagnostic.relatedInformation = diagnostic.relatedInformation.map(info => 
        new vscode.DiagnosticRelatedInformation(
          new vscode.Location(
            vscode.Uri.parse(info.location.uri),
            new vscode.Range(
              info.location.range.start.line,
              info.location.range.start.character,
              info.location.range.end.line,
              info.location.range.end.character
            )
          ),
          info.message
        )
      );
    }

    return vsDiagnostic;
  }

  private convertSeverity(severity: BaseDiagnosticSeverity): vscode.DiagnosticSeverity {
    switch (severity) {
      case BaseDiagnosticSeverity.Error:
        return vscode.DiagnosticSeverity.Error;
      case BaseDiagnosticSeverity.Warning:
        return vscode.DiagnosticSeverity.Warning;
      case BaseDiagnosticSeverity.Information:
        return vscode.DiagnosticSeverity.Information;
      case BaseDiagnosticSeverity.Hint:
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Error;
    }
  }
}

/**
 * VS Code Status Bar Item implementation
 */
class VSCodeStatusBarItem implements StatusBarItem {
  private item: vscode.StatusBarItem;

  constructor(alignment: StatusBarAlignment, priority?: number) {
    const vsAlignment = alignment === StatusBarAlignment.Left ? 
      vscode.StatusBarAlignment.Left : 
      vscode.StatusBarAlignment.Right;
    
    this.item = vscode.window.createStatusBarItem(vsAlignment, priority);
  }

  get alignment(): StatusBarAlignment {
    return this.item.alignment === vscode.StatusBarAlignment.Left ? 
      StatusBarAlignment.Left : 
      StatusBarAlignment.Right;
  }

  get priority(): number | undefined {
    return this.item.priority;
  }

  get text(): string {
    return this.item.text;
  }

  set text(value: string) {
    this.item.text = value;
  }

  get tooltip(): string | undefined {
    return this.item.tooltip as string;
  }

  set tooltip(value: string | undefined) {
    this.item.tooltip = value;
  }

  get command(): string | undefined {
    return typeof this.item.command === 'string' ? this.item.command : this.item.command?.command;
  }

  set command(value: string | undefined) {
    this.item.command = value;
  }

  get color(): string | undefined {
    return this.item.color as string;
  }

  set color(value: string | undefined) {
    this.item.color = value;
  }

  show(): void {
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}

/**
 * Main VS Code Extension class
 */
export class VSCodeExtension extends BaseExtension {
  private vscodeContext: vscode.ExtensionContext;
  private diagnosticsCollection: vscode.DiagnosticCollection;
  private commandManager: CommandManager;
  private uiManager: UIManager;
  private statusBarItem: VSCodeStatusBarItem;
  private subscriptions: vscode.Disposable[] = [];

  constructor(vscodeContext: vscode.ExtensionContext) {
    const extensionConfig: ExtensionConfig = {
      id: 'claude-code-security',
      name: 'Claude Code Security',
      version: vscodeContext.extension.packageJSON.version || '1.0.0',
      platform: 'vscode',
      realTimeValidation: vscode.workspace.getConfiguration('claude-code').get('realTimeValidation', true),
      validationDelay: vscode.workspace.getConfiguration('claude-code').get('validationDelay', 500),
      showDecorations: vscode.workspace.getConfiguration('claude-code').get('showDecorations', true),
      syntaxHighlighting: vscode.workspace.getConfiguration('claude-code').get('syntaxHighlighting', true),
      quickFixes: vscode.workspace.getConfiguration('claude-code').get('quickFixes', true),
      statusBar: vscode.workspace.getConfiguration('claude-code').get('statusBar', true)
    };

    const baseContext: BaseExtensionContext = {
      config: extensionConfig,
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      storagePath: vscodeContext.globalStorageUri.fsPath,
      globalState: new Map(),
      workspaceState: new Map()
    };

    super(baseContext);
    
    this.vscodeContext = vscodeContext;
    this.diagnosticsCollection = vscode.languages.createDiagnosticCollection('claude-code-security');
    this.commandManager = new CommandManager();
    this.uiManager = new UIManager(new VSCodeUIProvider());
    this.statusBarItem = new VSCodeStatusBarItem(StatusBarAlignment.Right, 100);
    
    // Setup diagnostics manager
    this.diagnosticsManager = new DiagnosticsManager(
      new VSCodeDiagnosticsProvider(this.diagnosticsCollection)
    );

    this.setupVSCodeSpecificFeatures();
  }

  /**
   * Setup VS Code specific features
   */
  private setupVSCodeSpecificFeatures(): void {
    // Setup status bar
    this.uiManager.setStatusBarItem(this.statusBarItem);
    this.statusBarItem.text = 'Claude Code';
    this.statusBarItem.command = 'claude-code.showStatus';
    
    // Listen to validation results
    this.on('document:validated', ({ result }) => {
      this.uiManager.updateStatusBar(result);
    });

    // Listen to command execution
    this.commandManager.on('command:executed', ({ commandId, result }) => {
      this.uiManager.showCommandResult(commandId, result);
    });

    // Configuration change listener
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('claude-code')) {
        this.updateConfigurationFromSettings();
      }
    });
  }

  /**
   * Platform-specific initialization
   */
  protected async initializePlatform(): Promise<void> {
    // Initialize UI
    await this.uiManager.initialize();
    
    // Register VS Code commands
    this.registerVSCodeCommands();
    
    // Register language providers
    await this.registerLanguageProviders();
    
    // Setup document watchers
    this.setupDocumentWatchers();
    
    this.vscodeContext.subscriptions.push(
      this.diagnosticsCollection,
      ...this.subscriptions
    );
  }

  /**
   * Platform-specific cleanup
   */
  protected async cleanupPlatform(): Promise<void> {
    // Dispose all subscriptions
    this.subscriptions.forEach(subscription => subscription.dispose());
    this.subscriptions = [];
    
    // Dispose UI components
    this.uiManager.dispose();
    this.statusBarItem.dispose();
  }

  /**
   * Register language providers
   */
  protected async registerProviders(): Promise<void> {
    const documentSelector: vscode.DocumentSelector = [
      { scheme: 'file', language: 'json', pattern: '**/.claude/settings*.json' },
      { scheme: 'file', language: 'json', pattern: '**/claude-settings*.json' },
      { scheme: 'file', language: 'json', pattern: '**/*.claude.json' }
    ];

    // Completion provider
    this.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        documentSelector,
        new ClaudeCodeCompletionProvider(this),
        '"', '[', '{', '*', '.', '/'
      )
    );

    // Hover provider
    this.subscriptions.push(
      vscode.languages.registerHoverProvider(
        documentSelector,
        new ClaudeCodeHoverProvider(this)
      )
    );

    // Code action provider
    this.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        documentSelector,
        new ClaudeCodeActionProvider(this),
        {
          providedCodeActionKinds: [
            vscode.CodeActionKind.QuickFix,
            vscode.CodeActionKind.Refactor,
            vscode.CodeActionKind.Source
          ]
        }
      )
    );

    // Document formatter
    this.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(
        documentSelector,
        new ClaudeCodeFormattingProvider()
      )
    );
  }

  /**
   * Register VS Code commands
   */
  private registerVSCodeCommands(): void {
    const commands = [
      { id: 'claude-code.validate', handler: this.handleValidateCommand.bind(this) },
      { id: 'claude-code.validateAll', handler: this.handleValidateAllCommand.bind(this) },
      { id: 'claude-code.generateTemplate', handler: this.handleGenerateTemplateCommand.bind(this) },
      { id: 'claude-code.init', handler: this.handleInitCommand.bind(this) },
      { id: 'claude-code.analyze', handler: this.handleAnalyzeCommand.bind(this) },
      { id: 'claude-code.showStatus', handler: this.handleShowStatusCommand.bind(this) },
      { id: 'claude-code.openWizard', handler: this.handleOpenWizardCommand.bind(this) }
    ];

    for (const command of commands) {
      this.subscriptions.push(
        vscode.commands.registerCommand(command.id, command.handler)
      );
    }
  }

  /**
   * Setup document watchers
   */
  private setupDocumentWatchers(): void {
    // Document change events
    this.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const document = new VSCodeTextDocument(event.document);
        this.onDocumentChange(document);
      })
    );

    // Document open events
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (this.isClaudeCodeFile(new VSCodeTextDocument(document))) {
          const wrappedDoc = new VSCodeTextDocument(document);
          this.onDocumentChange(wrappedDoc);
        }
      })
    );
  }

  /**
   * Command handlers
   */
  private async handleValidateCommand(): Promise<void> {
    const context = this.createCommandContext();
    const result = await this.commandManager.executeCommand('claude-code.validate', context);
    
    if (result.success && result.data?.validationResult) {
      await this.uiManager.showValidationResults(result.data.validationResult);
    }
  }

  private async handleValidateAllCommand(): Promise<void> {
    const context = this.createCommandContext();
    await this.commandManager.executeCommand('claude-code.validateAll', context);
  }

  private async handleGenerateTemplateCommand(): Promise<void> {
    const template = await this.uiManager.showTemplateSelection();
    if (template) {
      const context = this.createCommandContext();
      const result = await this.commandManager.executeCommand('claude-code.generateTemplate', context, template.id);
      
      if (result.success && result.edits) {
        await this.applyWorkspaceEdits(result.edits);
      }
    }
  }

  private async handleInitCommand(): Promise<void> {
    const context = this.createCommandContext();
    const result = await this.commandManager.executeCommand('claude-code.init', context);
    
    if (result.success && result.edits) {
      await this.applyWorkspaceEdits(result.edits);
    }
  }

  private async handleAnalyzeCommand(): Promise<void> {
    const context = this.createCommandContext();
    const result = await this.commandManager.executeCommand('claude-code.analyze', context);
    
    if (result.success && result.data?.analysis) {
      const analysis = result.data.analysis;
      const summary = `Configuration Analysis:\n\n` +
        `Total Rules: ${analysis.totalRules}\n` +
        `Deny: ${analysis.rulesByCategory.deny}\n` +
        `Allow: ${analysis.rulesByCategory.allow}\n` +
        `Ask: ${analysis.rulesByCategory.ask}\n\n` +
        `Recommendations:\n${analysis.recommendations.join('\n')}`;
      
      await vscode.window.showInformationMessage(summary);
    }
  }

  private async handleShowStatusCommand(): Promise<void> {
    const context = this.createCommandContext();
    if (context.activeConfig) {
      const result = await this.validationEngine.validate(context.activeConfig);
      await this.uiManager.showValidationResults(result);
    } else {
      await vscode.window.showInformationMessage('No Claude Code configuration found in current file');
    }
  }

  private async handleOpenWizardCommand(): Promise<void> {
    const config = await this.uiManager.showConfigurationWizard();
    if (config) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const configJson = JSON.stringify(config, null, 2);
        await editor.edit(editBuilder => {
          const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
          editBuilder.replace(fullRange, configJson);
        });
      }
    }
  }

  /**
   * Create command context from current VS Code state
   */
  private createCommandContext(): CommandContext {
    const activeEditor = vscode.window.activeTextEditor;
    let activeDocument: BaseTextDocument | undefined;
    let activeConfig: ClaudeCodeConfiguration | undefined;

    if (activeEditor) {
      activeDocument = new VSCodeTextDocument(activeEditor.document);
      activeConfig = this.getDocumentConfig(activeDocument.uri);
    }

    return {
      activeDocument,
      activeConfig,
      workspaceRoot: this.context.workspaceRoot,
      extensionContext: new Map()
    };
  }

  /**
   * Apply workspace edits
   */
  private async applyWorkspaceEdits(edits: any): Promise<void> {
    const workspaceEdit = new vscode.WorkspaceEdit();
    
    for (const [uri, textEdits] of Object.entries(edits.changes || {})) {
      const vscodeUri = vscode.Uri.parse(uri);
      for (const edit of textEdits as any[]) {
        const range = new vscode.Range(
          edit.range.start.line,
          edit.range.start.character,
          edit.range.end.line,
          edit.range.end.character
        );
        workspaceEdit.replace(vscodeUri, range, edit.newText);
      }
    }
    
    await vscode.workspace.applyEdit(workspaceEdit);
  }

  /**
   * Update configuration from VS Code settings
   */
  private updateConfigurationFromSettings(): void {
    const config = vscode.workspace.getConfiguration('claude-code');
    
    this.context.config.realTimeValidation = config.get('realTimeValidation', true);
    this.context.config.validationDelay = config.get('validationDelay', 500);
    this.context.config.showDecorations = config.get('showDecorations', true);
    this.context.config.syntaxHighlighting = config.get('syntaxHighlighting', true);
    this.context.config.quickFixes = config.get('quickFixes', true);
    this.context.config.statusBar = config.get('statusBar', true);
  }

  /**
   * File system operations
   */
  protected async fileExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  protected async readFile(path: string): Promise<string> {
    return readFile(path, 'utf8');
  }

  protected resolvePath(...segments: string[]): string {
    return path.resolve(...segments);
  }

  protected async updateDiagnostics(uri: string, diagnostics: BaseDiagnostic[]): Promise<void> {
    await this.diagnosticsManager.updateDocumentDiagnostics(
      { uri } as any,
      this.getDocumentConfig(uri) || {},
      undefined
    );
  }

  protected async updateStatusBar(result: ValidationResult): Promise<void> {
    this.uiManager.updateStatusBar(result);
  }
}

/**
 * VS Code Language Providers
 */
class ClaudeCodeCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private extension: VSCodeExtension) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    const items: vscode.CompletionItem[] = [];
    
    // Security pattern completions
    const securityPatterns = [
      { label: 'exec', detail: 'Shell execution pattern' },
      { label: 'shell', detail: 'Shell access pattern' },
      { label: 'cmd', detail: 'Command execution pattern' },
      { label: '../*', detail: 'Path traversal pattern' },
      { label: '*.js', detail: 'JavaScript files pattern' },
      { label: '*.exe', detail: 'Executable files pattern' }
    ];

    for (const pattern of securityPatterns) {
      const item = new vscode.CompletionItem(pattern.label, vscode.CompletionItemKind.Snippet);
      item.detail = pattern.detail;
      item.insertText = pattern.label;
      items.push(item);
    }

    return items;
  }
}

class ClaudeCodeHoverProvider implements vscode.HoverProvider {
  constructor(private extension: VSCodeExtension) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const range = document.getWordRangeAtPosition(position);
    if (!range) return undefined;

    const word = document.getText(range);
    const content = this.getHoverContent(word);
    
    if (content) {
      return new vscode.Hover(content, range);
    }

    return undefined;
  }

  private getHoverContent(word: string): vscode.MarkdownString | undefined {
    const patterns: { [key: string]: string } = {
      'exec': 'Shell execution command pattern. **Security Risk**: Can execute arbitrary system commands.',
      'shell': 'Shell access pattern. **Security Risk**: Provides shell access.',
      'deny': 'Rules that are completely blocked without user confirmation.',
      'allow': 'Rules that are explicitly permitted.',
      'ask': 'Rules that require user confirmation before execution.'
    };

    const description = patterns[word];
    if (description) {
      const markdown = new vscode.MarkdownString(description);
      markdown.supportHtml = true;
      return markdown;
    }

    return undefined;
  }
}

class ClaudeCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private extension: VSCodeExtension) {}

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): Promise<vscode.CodeAction[]> {
    const actions: vscode.CodeAction[] = [];

    // Quick fixes for diagnostics
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source === 'claude-code-security') {
        const quickFix = this.createQuickFix(document, diagnostic);
        if (quickFix) {
          actions.push(quickFix);
        }
      }
    }

    // Source actions
    actions.push(...this.createSourceActions(document));

    return actions;
  }

  private createQuickFix(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction | undefined {
    if (diagnostic.code === 'broad-pattern') {
      const action = new vscode.CodeAction('Make pattern more specific', vscode.CodeActionKind.QuickFix);
      action.diagnostics = [diagnostic];
      // Edit would be implemented based on specific pattern
      return action;
    }

    return undefined;
  }

  private createSourceActions(document: vscode.TextDocument): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    // Add security template action
    const addTemplate = new vscode.CodeAction('Add security template', vscode.CodeActionKind.Source);
    addTemplate.command = {
      command: 'claude-code.generateTemplate',
      title: 'Add security template'
    };
    actions.push(addTemplate);

    // Format action
    const format = new vscode.CodeAction('Format configuration', vscode.CodeActionKind.Source);
    format.command = {
      command: 'claude-code.format',
      title: 'Format configuration'
    };
    actions.push(format);

    return actions;
  }
}

class ClaudeCodeFormattingProvider implements vscode.DocumentFormattingEditProvider {
  async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    try {
      const content = document.getText();
      const parsed = JSON.parse(content);
      const formatted = JSON.stringify(parsed, null, 2);
      
      const fullRange = new vscode.Range(0, 0, document.lineCount, 0);
      return [new vscode.TextEdit(fullRange, formatted)];
    } catch {
      return [];
    }
  }
}

/**
 * Extension activation function
 */
export async function activate(context: vscode.ExtensionContext): Promise<VSCodeExtension> {
  const extension = new VSCodeExtension(context);
  await extension.activate();
  return extension;
}

/**
 * Extension deactivation function
 */
export async function deactivate(): Promise<void> {
  // Cleanup handled by extension instance
}