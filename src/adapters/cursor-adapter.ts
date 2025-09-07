/**
 * Cursor IDE Adapter
 * Manages security configuration for Cursor IDE using .cursorignore files
 */

import { BaseAdapter, AIToolInfo, AdapterCapabilities, SecurityConfiguration } from './base-adapter';
import { ScanResult, SetupResult } from '../setup/wizard';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export class CursorAdapter extends BaseAdapter {
  private cursorConfigDir: string;
  private cursorSettingsPath: string;
  private globalCursorIgnorePath: string;
  private localCursorIgnorePath: string;

  constructor() {
    super('cursor');
    this.cursorConfigDir = join(homedir(), '.cursor');
    this.cursorSettingsPath = join(this.cursorConfigDir, 'settings.json');
    this.globalCursorIgnorePath = join(homedir(), '.cursorignore');
    this.localCursorIgnorePath = join(process.cwd(), '.cursorignore');
  }

  async getToolInfo(): Promise<AIToolInfo> {
    const isInstalled = await this.isToolInstalled();
    
    return {
      name: 'cursor',
      displayName: 'Cursor IDE',
      description: 'AI-powered code editor with intelligent autocomplete and chat',
      configFiles: [
        this.cursorSettingsPath,
        this.globalCursorIgnorePath,
        this.localCursorIgnorePath
      ].filter(existsSync),
      isInstalled,
      version: await this.getCursorVersion()
    };
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsIgnoreFiles: true,
      supportsSettingsConfig: true,
      supportsRepositoryConfig: true,
      supportsOrganizationConfig: false,
      supportsLocalProcessing: true
    };
  }

  async isToolInstalled(): Promise<boolean> {
    try {
      // Check for Cursor application on macOS
      if (process.platform === 'darwin') {
        return existsSync('/Applications/Cursor.app');
      }
      
      // Check for cursor command in PATH
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const process = spawn('which', ['cursor'], { stdio: 'pipe' });
        process.on('close', (code: number) => {
          resolve(code === 0);
        });
        process.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  async applySecurityConfig(scanResult: ScanResult, config: SecurityConfiguration): Promise<SetupResult> {
    const result: SetupResult = {
      projectRulesApplied: 0,
      globalRulesApplied: 0,
      backupCreated: false,
      protectedFiles: []
    };

    const securityConfig = this.generateSecurityConfig(scanResult);
    
    // Apply global .cursorignore for personal files
    const personalFiles = scanResult.files.filter(f => f.scope === 'personal' && f.risk === 'CRITICAL');
    if (personalFiles.length > 0) {
      await this.createGlobalCursorIgnore(personalFiles);
      result.globalRulesApplied = personalFiles.length;
      result.backupCreated = true;
    }

    // Apply local .cursorignore for project files
    const projectFiles = scanResult.files.filter(f => f.scope === 'project' && f.risk === 'CRITICAL');
    if (projectFiles.length > 0) {
      await this.createLocalCursorIgnore(projectFiles);
      result.projectRulesApplied = projectFiles.length;
    }

    // Configure privacy settings if possible
    await this.configurePrivacySettings();

    // Track all protected files
    result.protectedFiles = scanResult.files
      .filter(f => f.risk === 'CRITICAL')
      .map(f => f.relativePath);

    return result;
  }

  async getSecurityStatus(): Promise<{
    isConfigured: boolean;
    configuredRules: number;
    configurationFiles: string[];
    lastUpdated?: Date;
  }> {
    const configFiles = [];
    let configuredRules = 0;
    let lastUpdated: Date | undefined;

    // Check global .cursorignore
    if (existsSync(this.globalCursorIgnorePath)) {
      configFiles.push(this.globalCursorIgnorePath);
      const content = readFileSync(this.globalCursorIgnorePath, 'utf8');
      configuredRules += content.split('\n').filter(line => line.trim() && !line.startsWith('#')).length;
      
      const fs = require('fs');
      const stats = fs.statSync(this.globalCursorIgnorePath);
      lastUpdated = stats.mtime;
    }

    // Check local .cursorignore
    if (existsSync(this.localCursorIgnorePath)) {
      configFiles.push(this.localCursorIgnorePath);
      const content = readFileSync(this.localCursorIgnorePath, 'utf8');
      configuredRules += content.split('\n').filter(line => line.trim() && !line.startsWith('#')).length;
    }

    // Check settings file
    if (existsSync(this.cursorSettingsPath)) {
      configFiles.push(this.cursorSettingsPath);
    }

    return {
      isConfigured: configuredRules > 0,
      configuredRules,
      configurationFiles: configFiles,
      lastUpdated
    };
  }

  protected generateSecurityConfig(scanResult: ScanResult): SecurityConfiguration {
    const criticalFiles = this.filterFilesByRisk(scanResult, ['CRITICAL']);
    const highFiles = this.filterFilesByRisk(scanResult, ['HIGH']);
    
    const ignorePatterns = this.generateIgnorePatterns(criticalFiles);
    
    return {
      blockedPatterns: ignorePatterns,
      askPatterns: [],
      allowedPatterns: [],
      toolSpecificConfig: {
        privacyMode: true,
        localProcessing: true
      }
    };
  }

  async validateConfiguration(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if settings file is valid JSON
    if (existsSync(this.cursorSettingsPath)) {
      try {
        const content = readFileSync(this.cursorSettingsPath, 'utf8');
        JSON.parse(content);
      } catch (error) {
        errors.push(`Invalid JSON in ${this.cursorSettingsPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Check ignore files syntax
    for (const ignorePath of [this.globalCursorIgnorePath, this.localCursorIgnorePath]) {
      if (existsSync(ignorePath)) {
        try {
          const content = readFileSync(ignorePath, 'utf8');
          const lines = content.split('\n');
          
          // Basic validation for ignore patterns
          lines.forEach((line, index) => {
            if (line.trim() && !line.startsWith('#')) {
              // Check for potentially problematic patterns
              if (line.includes('**') && line.length < 5) {
                warnings.push(`Line ${index + 1} in ${ignorePath}: Very broad ignore pattern '${line.trim()}' might be too permissive`);
              }
            }
          });
        } catch (error) {
          errors.push(`Cannot read ${ignorePath}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Warn if Cursor is not installed
    if (!(await this.isToolInstalled())) {
      warnings.push('Cursor IDE does not appear to be installed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async resetConfiguration(): Promise<void> {
    // Remove or backup .cursorignore files
    for (const ignorePath of [this.globalCursorIgnorePath, this.localCursorIgnorePath]) {
      if (existsSync(ignorePath)) {
        await this.createConfigBackup(ignorePath);
        
        // Remove security-related entries (keep user entries)
        const content = readFileSync(ignorePath, 'utf8');
        const lines = content.split('\n');
        const securityMarker = '# Security rules added by claude-security';
        
        let markerIndex = lines.indexOf(securityMarker);
        if (markerIndex !== -1) {
          // Remove everything from the marker onwards
          const cleanedContent = lines.slice(0, markerIndex).join('\n');
          writeFileSync(ignorePath, cleanedContent, 'utf8');
        }
      }
    }
  }

  getHelpInfo(): {
    documentationUrl?: string;
    configurationHelp: string;
    troubleshooting: string[];
  } {
    return {
      documentationUrl: 'https://docs.cursor.so',
      configurationHelp: `Cursor IDE security configuration:

1. .cursorignore files (similar to .gitignore):
   - Global: ${this.globalCursorIgnorePath}
   - Per-project: .cursorignore in project root

2. Privacy settings in Cursor settings:
   - Disable telemetry
   - Enable local processing mode
   - Configure data retention

3. File patterns to ignore:
   .env*
   **/.ssh/**
   **/.aws/**
   **/secrets/**
   *.key
   *.pem`,
      troubleshooting: [
        'Ensure Cursor IDE is installed and up to date',
        'Check .cursorignore file syntax (similar to .gitignore)',
        'Verify privacy settings in Cursor preferences',
        'Test ignore patterns with sample sensitive files',
        'Check file permissions on configuration files'
      ]
    };
  }

  /**
   * Create global .cursorignore file for personal files
   */
  private async createGlobalCursorIgnore(personalFiles: any[]): Promise<void> {
    const patterns = this.generateIgnorePatterns(personalFiles);
    
    // Common patterns for personal sensitive files
    const commonPatterns = [
      '# Security rules added by claude-security',
      '# Personal sensitive files',
      '**/.ssh/**',
      '**/.aws/**',
      '**/.gcloud/**',
      '**/.docker/**',
      '**/.kube/**',
      '**/.gnupg/**',
      '**/credentials',
      '**/*.key',
      '**/*.pem',
      '**/*.p12',
      '**/*.pfx',
      '**/id_rsa*',
      '**/id_ed25519*',
      '**/*_history',
      ''
    ];

    let content = commonPatterns.join('\n');
    
    // Add specific patterns from scan results
    if (patterns.length > 0) {
      content += '# Project-specific patterns\n';
      content += patterns.join('\n') + '\n';
    }

    // Backup existing file
    if (existsSync(this.globalCursorIgnorePath)) {
      await this.createConfigBackup(this.globalCursorIgnorePath);
      
      // Merge with existing content
      const existingContent = readFileSync(this.globalCursorIgnorePath, 'utf8');
      if (!existingContent.includes('# Security rules added by claude-security')) {
        content = existingContent + '\n\n' + content;
      } else {
        // Replace security section
        content = existingContent.split('# Security rules added by claude-security')[0] + content;
      }
    }

    writeFileSync(this.globalCursorIgnorePath, content, 'utf8');
  }

  /**
   * Create local .cursorignore file for project files
   */
  private async createLocalCursorIgnore(projectFiles: any[]): Promise<void> {
    const patterns = this.generateIgnorePatterns(projectFiles);
    
    const securityPatterns = [
      '# Security rules added by claude-security',
      '# Project sensitive files',
      '.env*',
      'secrets/',
      '*.key',
      '*.pem',
      'config/database*',
      'config/secrets*',
      '**/*.tfstate',
      '**/*.log',
      ''
    ];

    let content = securityPatterns.join('\n');
    
    // Add specific patterns from scan
    if (patterns.length > 0) {
      content += '# Detected sensitive files\n';
      content += patterns.join('\n') + '\n';
    }

    // Backup existing file
    if (existsSync(this.localCursorIgnorePath)) {
      await this.createConfigBackup(this.localCursorIgnorePath);
      
      // Merge with existing content
      const existingContent = readFileSync(this.localCursorIgnorePath, 'utf8');
      if (!existingContent.includes('# Security rules added by claude-security')) {
        content = existingContent + '\n\n' + content;
      } else {
        // Replace security section
        content = existingContent.split('# Security rules added by claude-security')[0] + content;
      }
    }

    writeFileSync(this.localCursorIgnorePath, content, 'utf8');
  }

  /**
   * Configure privacy settings in Cursor if possible
   */
  private async configurePrivacySettings(): Promise<void> {
    // Note: Cursor settings are usually managed through the GUI
    // This is a placeholder for potential future API access
    console.log('Note: Configure privacy settings manually in Cursor IDE preferences:');
    console.log('  - Enable "Privacy Mode" if available');
    console.log('  - Disable telemetry and data collection');
    console.log('  - Enable local processing mode');
  }

  /**
   * Get Cursor version if available
   */
  private async getCursorVersion(): Promise<string | undefined> {
    try {
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const process = spawn('cursor', ['--version'], { stdio: 'pipe' });
        let output = '';
        
        process.stdout.on('data', (data: any) => {
          output += data.toString();
        });
        
        process.on('close', (code: number) => {
          if (code === 0 && output.trim()) {
            resolve(output.trim());
          } else {
            resolve(undefined);
          }
        });
        
        process.on('error', () => {
          resolve(undefined);
        });
      });
    } catch (error) {
      return undefined;
    }
  }
}