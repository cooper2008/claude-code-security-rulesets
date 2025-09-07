/**
 * Real-time Error/Warning Diagnostics System
 * Provides immediate feedback for Claude Code configuration issues
 */

import { EventEmitter } from 'events';
import { 
  Diagnostic, 
  DiagnosticSeverity, 
  DocumentRange, 
  DocumentPosition, 
  TextDocument,
  DiagnosticRelatedInformation 
} from './base';
import { 
  ValidationResult, 
  ValidationError, 
  ValidationWarning, 
  RuleConflict, 
  ClaudeCodeConfiguration 
} from '../types';

export interface DiagnosticsProvider {
  /** Update diagnostics for a document */
  updateDiagnostics(uri: string, diagnostics: Diagnostic[]): Promise<void>;
  /** Clear diagnostics for a document */
  clearDiagnostics(uri: string): Promise<void>;
  /** Clear all diagnostics */
  clearAllDiagnostics(): Promise<void>;
}

export interface DiagnosticAnalyzer {
  /** Analyze document and generate diagnostics */
  analyzeDiagnostics(document: TextDocument, config: ClaudeCodeConfiguration): Promise<Diagnostic[]>;
  /** Analyze validation result and generate diagnostics */
  analyzeValidationResult(document: TextDocument, result: ValidationResult): Promise<Diagnostic[]>;
}

export interface DiagnosticContext {
  /** Source document */
  document: TextDocument;
  /** Configuration being validated */
  config: ClaudeCodeConfiguration;
  /** Validation result */
  validationResult?: ValidationResult;
  /** Additional context information */
  context: Map<string, any>;
}

/**
 * Comprehensive diagnostics manager
 * Handles real-time validation and error reporting
 */
export class DiagnosticsManager extends EventEmitter implements DiagnosticAnalyzer {
  private provider: DiagnosticsProvider;
  private analysisCache = new Map<string, { hash: string; diagnostics: Diagnostic[] }>();
  private enabled = true;

  constructor(provider: DiagnosticsProvider) {
    super();
    this.provider = provider;
  }

  /**
   * Enable or disable diagnostics
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.provider.clearAllDiagnostics().catch(console.error);
    }
  }

  /**
   * Analyze document and generate comprehensive diagnostics
   */
  public async analyzeDiagnostics(
    document: TextDocument, 
    config: ClaudeCodeConfiguration
  ): Promise<Diagnostic[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const context: DiagnosticContext = {
        document,
        config,
        context: new Map()
      };

      const diagnostics: Diagnostic[] = [
        ...await this.analyzeSyntax(context),
        ...await this.analyzeStructure(context),
        ...await this.analyzeRules(context),
        ...await this.analyzePerformance(context),
        ...await this.analyzeBestPractices(context)
      ];

      this.emit('diagnostics:analyzed', { document, diagnostics: diagnostics.length });
      return diagnostics;
      
    } catch (error) {
      this.emit('diagnostics:error', error);
      return [{
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: `Diagnostic analysis failed: ${error}`,
        severity: DiagnosticSeverity.Error,
        source: 'claude-code-diagnostics'
      }];
    }
  }

  /**
   * Analyze validation result and generate diagnostics
   */
  public async analyzeValidationResult(
    document: TextDocument, 
    result: ValidationResult
  ): Promise<Diagnostic[]> {
    if (!this.enabled) {
      return [];
    }

    const diagnostics: Diagnostic[] = [];

    // Process validation errors
    for (const error of result.errors) {
      const diagnostic = await this.createDiagnosticFromError(document, error);
      if (diagnostic) {
        diagnostics.push(diagnostic);
      }
    }

    // Process validation warnings
    for (const warning of result.warnings) {
      const diagnostic = await this.createDiagnosticFromWarning(document, warning);
      if (diagnostic) {
        diagnostics.push(diagnostic);
      }
    }

    // Process rule conflicts
    for (const conflict of result.conflicts) {
      const diagnostic = await this.createDiagnosticFromConflict(document, conflict);
      if (diagnostic) {
        diagnostics.push(diagnostic);
      }
    }

    // Performance warnings
    if (result.performance) {
      const perfDiagnostics = await this.analyzePerformanceMetrics(document, result.performance);
      diagnostics.push(...perfDiagnostics);
    }

    this.emit('validation:analyzed', { document, result, diagnostics: diagnostics.length });
    return diagnostics;
  }

  /**
   * Update diagnostics for a document with caching
   */
  public async updateDocumentDiagnostics(
    document: TextDocument,
    config: ClaudeCodeConfiguration,
    validationResult?: ValidationResult
  ): Promise<void> {
    try {
      const hash = this.generateDiagnosticHash(document, config);
      const cached = this.analysisCache.get(document.uri);
      
      // Check cache
      if (cached && cached.hash === hash) {
        await this.provider.updateDiagnostics(document.uri, cached.diagnostics);
        return;
      }

      // Analyze diagnostics
      let diagnostics: Diagnostic[] = [];
      
      if (validationResult) {
        diagnostics = await this.analyzeValidationResult(document, validationResult);
      } else {
        diagnostics = await this.analyzeDiagnostics(document, config);
      }

      // Cache results
      this.analysisCache.set(document.uri, { hash, diagnostics });

      // Update provider
      await this.provider.updateDiagnostics(document.uri, diagnostics);
      
      this.emit('diagnostics:updated', { 
        uri: document.uri, 
        count: diagnostics.length,
        errors: diagnostics.filter(d => d.severity === DiagnosticSeverity.Error).length,
        warnings: diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).length
      });
      
    } catch (error) {
      this.emit('diagnostics:update-error', { uri: document.uri, error });
      throw error;
    }
  }

  /**
   * Analyze JSON syntax issues
   */
  private async analyzeSyntax(context: DiagnosticContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const content = context.document.getText();

    try {
      JSON.parse(content);
    } catch (error) {
      const syntaxError = error as SyntaxError;
      const position = this.parseJsonErrorPosition(syntaxError.message);
      
      diagnostics.push({
        range: position ? 
          { start: position, end: { line: position.line, character: position.character + 1 } } :
          { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: `JSON Syntax Error: ${syntaxError.message}`,
        severity: DiagnosticSeverity.Error,
        source: 'claude-code-syntax',
        code: 'json-parse-error'
      });
    }

    return diagnostics;
  }

  /**
   * Analyze document structure issues
   */
  private async analyzeStructure(context: DiagnosticContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const config = context.config;

    // Check for required structure
    if (!config.permissions) {
      diagnostics.push({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: 'Missing "permissions" section in Claude Code configuration',
        severity: DiagnosticSeverity.Warning,
        source: 'claude-code-structure',
        code: 'missing-permissions'
      });
    }

    // Check for empty permissions
    if (config.permissions) {
      const { deny = [], allow = [], ask = [] } = config.permissions;
      
      if (deny.length === 0 && allow.length === 0 && ask.length === 0) {
        diagnostics.push({
          range: this.findPermissionsRange(context.document),
          message: 'Empty permissions configuration - no security rules defined',
          severity: DiagnosticSeverity.Warning,
          source: 'claude-code-structure',
          code: 'empty-permissions'
        });
      }
    }

    return diagnostics;
  }

  /**
   * Analyze individual rules
   */
  private async analyzeRules(context: DiagnosticContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const config = context.config;

    if (!config.permissions) {
      return diagnostics;
    }

    const { deny = [], allow = [], ask = [] } = config.permissions;

    // Analyze deny rules
    for (let i = 0; i < deny.length; i++) {
      const rule = deny[i];
      if (rule) {
        const ruleDiagnostics = await this.analyzeRule(context.document, rule, 'deny', i);
        diagnostics.push(...ruleDiagnostics);
      }
    }

    // Analyze allow rules
    for (let i = 0; i < allow.length; i++) {
      const rule = allow[i];
      if (rule) {
        const ruleDiagnostics = await this.analyzeRule(context.document, rule, 'allow', i);
        diagnostics.push(...ruleDiagnostics);
      }
    }

    // Analyze ask rules
    for (let i = 0; i < ask.length; i++) {
      const rule = ask[i];
      if (rule) {
        const ruleDiagnostics = await this.analyzeRule(context.document, rule, 'ask', i);
        diagnostics.push(...ruleDiagnostics);
      }
    }

    return diagnostics;
  }

  /**
   * Analyze individual rule
   */
  private async analyzeRule(
    document: TextDocument, 
    rule: string, 
    category: 'deny' | 'allow' | 'ask', 
    index: number
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const range = this.findRuleRange(document, rule, category, index);

    // Empty rule
    if (!rule.trim()) {
      diagnostics.push({
        range,
        message: `Empty ${category} rule at position ${index}`,
        severity: DiagnosticSeverity.Error,
        source: 'claude-code-rules',
        code: 'empty-rule'
      });
      return diagnostics;
    }

    // Overly broad patterns
    if (rule === '*' || rule === '**' || rule === '.*') {
      diagnostics.push({
        range,
        message: `Overly broad pattern "${rule}" in ${category} rules - consider being more specific`,
        severity: DiagnosticSeverity.Warning,
        source: 'claude-code-rules',
        code: 'broad-pattern'
      });
    }

    // Dangerous patterns in allow rules
    if (category === 'allow' && this.isDangerousPattern(rule)) {
      diagnostics.push({
        range,
        message: `Potentially dangerous pattern in allow rule: "${rule}"`,
        severity: DiagnosticSeverity.Warning,
        source: 'claude-code-security',
        code: 'dangerous-allow-pattern'
      });
    }

    // Invalid regex patterns
    if (this.looksLikeRegex(rule)) {
      try {
        new RegExp(rule);
      } catch (error) {
        diagnostics.push({
          range,
          message: `Invalid regex pattern: ${error}`,
          severity: DiagnosticSeverity.Error,
          source: 'claude-code-rules',
          code: 'invalid-regex'
        });
      }
    }

    // Path traversal risks
    if (rule.includes('..') && category === 'allow') {
      diagnostics.push({
        range,
        message: `Path traversal pattern in allow rule may pose security risk: "${rule}"`,
        severity: DiagnosticSeverity.Warning,
        source: 'claude-code-security',
        code: 'path-traversal-risk'
      });
    }

    return diagnostics;
  }

  /**
   * Analyze performance implications
   */
  private async analyzePerformance(context: DiagnosticContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const config = context.config;

    if (!config.permissions) {
      return diagnostics;
    }

    const allRules = [
      ...(config.permissions.deny || []),
      ...(config.permissions.allow || []),
      ...(config.permissions.ask || [])
    ];

    // Too many rules
    if (allRules.length > 100) {
      diagnostics.push({
        range: this.findPermissionsRange(context.document),
        message: `Large number of rules (${allRules.length}) may impact performance`,
        severity: DiagnosticSeverity.Information,
        source: 'claude-code-performance',
        code: 'many-rules'
      });
    }

    // Complex regex patterns
    const complexPatterns = allRules.filter(rule => 
      rule && this.looksLikeRegex(rule) && rule.length > 50
    );

    if (complexPatterns.length > 0) {
      diagnostics.push({
        range: this.findPermissionsRange(context.document),
        message: `${complexPatterns.length} complex regex patterns detected - may impact performance`,
        severity: DiagnosticSeverity.Information,
        source: 'claude-code-performance',
        code: 'complex-patterns'
      });
    }

    return diagnostics;
  }

  /**
   * Analyze best practices
   */
  private async analyzeBestPractices(context: DiagnosticContext): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    const config = context.config;

    if (!config.permissions) {
      return diagnostics;
    }

    const { deny = [], allow = [], ask = [] } = config.permissions;

    // Recommend deny rules for security
    if (deny.length === 0) {
      diagnostics.push({
        range: this.findPermissionsRange(context.document),
        message: 'Consider adding deny rules for better security posture',
        severity: DiagnosticSeverity.Information,
        source: 'claude-code-best-practices',
        code: 'no-deny-rules'
      });
    }

    // Check for common security patterns
    const hasShellDeny = deny.some(rule => 
      rule && (rule.includes('exec') || rule.includes('shell') || rule.includes('cmd'))
    );

    if (!hasShellDeny && allow.some(rule => rule && rule.includes('*'))) {
      diagnostics.push({
        range: this.findPermissionsRange(context.document),
        message: 'Consider adding explicit deny rules for shell commands when using broad allow patterns',
        severity: DiagnosticSeverity.Information,
        source: 'claude-code-best-practices',
        code: 'missing-shell-deny'
      });
    }

    return diagnostics;
  }

  /**
   * Create diagnostic from validation error
   */
  private async createDiagnosticFromError(
    document: TextDocument, 
    error: ValidationError
  ): Promise<Diagnostic | null> {
    const range = this.findErrorRange(document, error);
    
    const diagnostic: Diagnostic = {
      range,
      message: error.message,
      severity: error.severity === 'critical' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
      source: 'claude-code-validation',
      code: error.type
    };

    // Add related information if available
    if (error.context) {
      diagnostic.relatedInformation = await this.createRelatedInformation(document, error.context);
    }

    return diagnostic;
  }

  /**
   * Create diagnostic from validation warning
   */
  private async createDiagnosticFromWarning(
    document: TextDocument, 
    warning: ValidationWarning
  ): Promise<Diagnostic | null> {
    const range = this.findWarningRange(document, warning);
    
    const diagnostic: Diagnostic = {
      range,
      message: warning.message,
      severity: DiagnosticSeverity.Warning,
      source: 'claude-code-validation',
      code: warning.type
    };

    // Add related information if available
    if (warning.context) {
      diagnostic.relatedInformation = await this.createRelatedInformation(document, warning.context);
    }

    return diagnostic;
  }

  /**
   * Create diagnostic from rule conflict
   */
  private async createDiagnosticFromConflict(
    document: TextDocument, 
    conflict: RuleConflict
  ): Promise<Diagnostic | null> {
    if (!conflict.conflictingRules[0]) {
      return null;
    }

    const range = this.findRuleRange(
      document, 
      conflict.conflictingRules[0].pattern,
      conflict.conflictingRules[0].type as 'deny' | 'allow' | 'ask'
    );
    
    const severity = conflict.securityImpact === 'critical' ? 
      DiagnosticSeverity.Error : 
      DiagnosticSeverity.Warning;

    const diagnostic: Diagnostic = {
      range,
      message: `Rule Conflict: ${conflict.message}`,
      severity,
      source: 'claude-code-conflicts',
      code: conflict.type
    };

    // Add related information for conflicting rules
    if (conflict.conflictingRules.length > 1) {
      diagnostic.relatedInformation = conflict.conflictingRules.slice(1).map(rule => ({
        location: {
          uri: document.uri,
          range: this.findRuleRange(document, rule.pattern, rule.type as 'deny' | 'allow' | 'ask')
        },
        message: `Conflicts with ${rule.type} rule: "${rule.pattern}"`
      }));
    }

    return diagnostic;
  }

  /**
   * Analyze performance metrics and create diagnostics
   */
  private async analyzePerformanceMetrics(
    document: TextDocument, 
    performance: any
  ): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    if (performance.performanceTarget && !performance.performanceTarget.achieved) {
      diagnostics.push({
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        message: `Validation exceeded target time: ${performance.validationTime.toFixed(2)}ms > ${performance.performanceTarget.target}ms`,
        severity: DiagnosticSeverity.Information,
        source: 'claude-code-performance',
        code: 'slow-validation'
      });
    }

    return diagnostics;
  }

  /**
   * Helper methods for finding ranges
   */
  private findPermissionsRange(document: TextDocument): DocumentRange {
    const content = document.getText();
    const permissionsIndex = content.indexOf('"permissions"');
    
    if (permissionsIndex === -1) {
      return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    }

    const start = document.positionAt(permissionsIndex);
    const end = document.positionAt(permissionsIndex + 13); // "permissions".length
    
    return { start, end };
  }

  private findRuleRange(
    document: TextDocument, 
    rule: string, 
    category?: 'deny' | 'allow' | 'ask',
    index?: number
  ): DocumentRange {
    const content = document.getText();
    let searchPattern = `"${rule}"`;
    
    // If we have category context, be more specific
    if (category) {
      const categoryIndex = content.indexOf(`"${category}"`);
      if (categoryIndex !== -1) {
        const categorySection = content.substring(categoryIndex);
        const ruleIndex = categorySection.indexOf(searchPattern);
        if (ruleIndex !== -1) {
          const actualIndex = categoryIndex + ruleIndex;
          const start = document.positionAt(actualIndex);
          const end = document.positionAt(actualIndex + searchPattern.length);
          return { start, end };
        }
      }
    }
    
    // Fallback to simple search
    const ruleIndex = content.indexOf(searchPattern);
    if (ruleIndex === -1) {
      return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    }

    const start = document.positionAt(ruleIndex);
    const end = document.positionAt(ruleIndex + searchPattern.length);
    
    return { start, end };
  }

  private findErrorRange(document: TextDocument, error: ValidationError): DocumentRange {
    if (error.location?.rule) {
      return this.findRuleRange(document, error.location.rule);
    }
    return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  }

  private findWarningRange(document: TextDocument, warning: ValidationWarning): DocumentRange {
    if (warning.context?.rule) {
      return this.findRuleRange(document, warning.context.rule as string);
    }
    return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
  }

  /**
   * Utility methods
   */
  private parseJsonErrorPosition(message: string): DocumentPosition | null {
    const lineMatch = message.match(/line (\d+)/);
    const columnMatch = message.match(/column (\d+)/);
    
    if (lineMatch && columnMatch) {
      return {
        line: parseInt(lineMatch[1]) - 1, // 0-based
        character: parseInt(columnMatch[1]) - 1 // 0-based
      };
    }
    
    return null;
  }

  private isDangerousPattern(pattern: string): boolean {
    const dangerous = ['exec', 'eval', 'shell', 'cmd', 'powershell', 'system', 'spawn', 'fork'];
    const lower = pattern.toLowerCase();
    return dangerous.some(d => lower.includes(d));
  }

  private looksLikeRegex(pattern: string): boolean {
    return pattern.includes('\\') || pattern.includes('^') || pattern.includes('$') ||
           pattern.includes('(') || pattern.includes('|') || pattern.includes('[');
  }

  private generateDiagnosticHash(document: TextDocument, config: ClaudeCodeConfiguration): string {
    const content = document.getText();
    const configStr = JSON.stringify(config);
    return Buffer.from(content + configStr).toString('base64').substring(0, 20);
  }

  private async createRelatedInformation(
    document: TextDocument, 
    context: any
  ): Promise<DiagnosticRelatedInformation[]> {
    const info: DiagnosticRelatedInformation[] = [];
    
    if (context.rule) {
      const range = this.findRuleRange(document, context.rule);
      info.push({
        location: { uri: document.uri, range },
        message: `Related to rule: "${context.rule}"`
      });
    }
    
    return info;
  }

  /**
   * Clear cache and diagnostics
   */
  public async clearCache(): Promise<void> {
    this.analysisCache.clear();
    await this.provider.clearAllDiagnostics();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.analysisCache.size,
      entries: Array.from(this.analysisCache.keys())
    };
  }
}