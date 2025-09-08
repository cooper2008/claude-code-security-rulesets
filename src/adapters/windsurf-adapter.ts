/**
 * Windsurf IDE Adapter
 * Manages security configuration for Windsurf IDE using .codeiumignore files and settings
 */

import { BaseAdapter, AIToolInfo, AdapterCapabilities, SecurityConfiguration } from './base-adapter';
import { ScanResult } from '../setup/scanner';
import type { SetupResult } from '../setup/wizard';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export class WindsurfAdapter extends BaseAdapter {
  private windsurfConfigDir: string;
  private windsurfSettingsPath: string;
  private globalCodeiumIgnorePath: string;
  private localCodeiumIgnorePath: string;

  constructor() {
    super('windsurf');
    
    // Windsurf configuration directory
    this.windsurfConfigDir = process.platform === 'darwin'
      ? join(homedir(), 'Library/Application Support/Windsurf')
      : process.platform === 'win32'
      ? join(homedir(), 'AppData/Roaming/Windsurf')
      : join(homedir(), '.config/windsurf');
    
    this.windsurfSettingsPath = join(this.windsurfConfigDir, 'settings.json');
    this.globalCodeiumIgnorePath = join(homedir(), '.codeiumignore');
    this.localCodeiumIgnorePath = join(process.cwd(), '.codeiumignore');
  }

  async getToolInfo(): Promise<AIToolInfo> {
    const isInstalled = await this.isToolInstalled();
    
    return {
      name: 'windsurf',
      displayName: 'Windsurf IDE',
      description: 'AI-powered development environment with advanced code intelligence',
      configFiles: [
        this.windsurfSettingsPath,
        this.globalCodeiumIgnorePath,
        this.localCodeiumIgnorePath
      ].filter(existsSync),
      isInstalled,
      version: await this.getWindsurfVersion()
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
      // Check for Windsurf application on different platforms
      const windsurfPaths = [
        '/Applications/Windsurf.app',                    // macOS
        '/usr/local/bin/windsurf',                       // Linux system-wide
        join(homedir(), '.local/bin/windsurf'),          // Linux user
        'C:\\Program Files\\Windsurf\\windsurf.exe',     // Windows
        'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Windsurf\\windsurf.exe' // Windows user
      ];

      for (const path of windsurfPaths) {
        if (existsSync(path)) {
          return true;
        }
      }

      // Check if windsurf command is in PATH
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const command: string = process.platform === 'win32' ? 'where' : 'which';
        const childProcess = spawn(command, ['windsurf'], { stdio: 'pipe' });
        childProcess.on('close', (code: number) => {
          resolve(code === 0);
        });
        childProcess.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  async applySecurityConfig(scanResult: ScanResult, _config: SecurityConfiguration): Promise<SetupResult> {
    const result: SetupResult = {
      projectRulesApplied: 0,
      globalRulesApplied: 0,
      backupCreated: false,
      protectedFiles: []
    };

    const securityConfig = this.generateSecurityConfig(scanResult);
    
    // Apply global .codeiumignore for personal files
    const personalFiles = scanResult.files.filter((f: any) => f.scope === 'personal' && f.risk === 'CRITICAL');
    if (personalFiles.length > 0) {
      await this.createGlobalCodeiumIgnore(personalFiles);
      result.globalRulesApplied = personalFiles.length;
      result.backupCreated = true;
    }

    // Apply local .codeiumignore for project files
    const projectFiles = scanResult.files.filter((f: any) => f.scope === 'project' && f.risk === 'CRITICAL');
    if (projectFiles.length > 0) {
      await this.createLocalCodeiumIgnore(projectFiles);
      result.projectRulesApplied = projectFiles.length;
    }

    // Configure Windsurf settings
    await this.configureWindsurfSettings(securityConfig);

    // Track all protected files
    result.protectedFiles = scanResult.files
      .filter((f: any) => f.risk === 'CRITICAL')
      .map((f: any) => f.relativePath);

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

    // Check global .codeiumignore
    if (existsSync(this.globalCodeiumIgnorePath)) {
      configFiles.push(this.globalCodeiumIgnorePath);
      const content = readFileSync(this.globalCodeiumIgnorePath, 'utf8');
      configuredRules += content.split('\n').filter(line => line.trim() && !line.startsWith('#')).length;
      
      const fs = require('fs');
      const stats = fs.statSync(this.globalCodeiumIgnorePath);
      lastUpdated = stats.mtime;
    }

    // Check local .codeiumignore
    if (existsSync(this.localCodeiumIgnorePath)) {
      configFiles.push(this.localCodeiumIgnorePath);
      const content = readFileSync(this.localCodeiumIgnorePath, 'utf8');
      configuredRules += content.split('\n').filter(line => line.trim() && !line.startsWith('#')).length;
    }

    // Check Windsurf settings
    if (existsSync(this.windsurfSettingsPath)) {
      configFiles.push(this.windsurfSettingsPath);
      try {
        const content = readFileSync(this.windsurfSettingsPath, 'utf8');
        const settings = JSON.parse(content);
        
        // Count security-related settings
        const securitySettings = [
          'codeium.enableIndexing',
          'codeium.enableCodeLens',
          'codeium.enableSearch',
          'codeium.excludeLanguages',
          'terminal.integrated.enableFileLinks'
        ];
        
        configuredRules += securitySettings.filter(setting => settings[setting] !== undefined).length;
      } catch (error) {
        // Ignore JSON parsing errors
      }
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
    const _highFiles = this.filterFilesByRisk(scanResult, ['HIGH']);
    
    const ignorePatterns = this.generateIgnorePatterns(criticalFiles);
    
    return {
      blockedPatterns: ignorePatterns,
      askPatterns: [],
      allowedPatterns: [],
      toolSpecificConfig: {
        disableIndexing: true,
        restrictTerminalAccess: true,
        localProcessingMode: true
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

    // Check Windsurf settings file
    if (existsSync(this.windsurfSettingsPath)) {
      try {
        const content = readFileSync(this.windsurfSettingsPath, 'utf8');
        JSON.parse(content);
      } catch (error) {
        errors.push(`Invalid JSON in ${this.windsurfSettingsPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Check ignore files syntax
    for (const ignorePath of [this.globalCodeiumIgnorePath, this.localCodeiumIgnorePath]) {
      if (existsSync(ignorePath)) {
        try {
          const content = readFileSync(ignorePath, 'utf8');
          const lines = content.split('\n');
          
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

    // Warn if Windsurf is not installed
    if (!(await this.isToolInstalled())) {
      warnings.push('Windsurf IDE does not appear to be installed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async resetConfiguration(): Promise<void> {
    // Reset .codeiumignore files
    for (const ignorePath of [this.globalCodeiumIgnorePath, this.localCodeiumIgnorePath]) {
      if (existsSync(ignorePath)) {
        await this.createConfigBackup(ignorePath);
        
        const content = readFileSync(ignorePath, 'utf8');
        const lines = content.split('\n');
        const securityMarker = '# Security rules added by claude-security';
        
        let markerIndex = lines.indexOf(securityMarker);
        if (markerIndex !== -1) {
          const cleanedContent = lines.slice(0, markerIndex).join('\n');
          writeFileSync(ignorePath, cleanedContent, 'utf8');
        }
      }
    }

    // Reset Windsurf settings
    if (existsSync(this.windsurfSettingsPath)) {
      await this.createConfigBackup(this.windsurfSettingsPath);
      
      try {
        const content = readFileSync(this.windsurfSettingsPath, 'utf8');
        const settings = JSON.parse(content);
        
        // Remove security-related settings
        const securitySettings = [
          'codeium.enableIndexing',
          'codeium.enableCodeLens',
          'codeium.enableSearch',
          'codeium.excludeLanguages',
          'terminal.integrated.enableFileLinks'
        ];
        
        securitySettings.forEach(setting => {
          delete settings[setting];
        });
        
        writeFileSync(this.windsurfSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
      } catch (error) {
        // Ignore errors
      }
    }
  }

  getHelpInfo(): {
    documentationUrl?: string;
    configurationHelp: string;
    troubleshooting: string[];
  } {
    return {
      documentationUrl: 'https://codeium.com/windsurf',
      configurationHelp: `Windsurf IDE security configuration:

1. .codeiumignore files (similar to .gitignore):
   - Global: ${this.globalCodeiumIgnorePath}
   - Per-project: .codeiumignore in project root

2. Windsurf settings (${this.windsurfSettingsPath}):
   {
     "codeium.enableIndexing": false,
     "codeium.enableCodeLens": false,
     "codeium.excludeLanguages": ["secrets", "env"],
     "terminal.integrated.enableFileLinks": false
   }

3. File patterns to ignore:
   .env*
   **/.ssh/**
   **/.aws/**
   **/secrets/**
   *.key
   *.pem

4. Security features:
   - Local processing mode
   - Terminal access restrictions
   - File indexing controls`,
      troubleshooting: [
        'Ensure Windsurf IDE is installed and up to date',
        'Check .codeiumignore file syntax (similar to .gitignore)',
        'Verify settings.json syntax in Windsurf configuration',
        'Test ignore patterns with sample sensitive files',
        'Restart Windsurf after configuration changes',
        'Check file permissions on configuration files',
        'Enable local processing mode for enhanced privacy'
      ]
    };
  }

  /**
   * Create global .codeiumignore file for personal files
   */
  private async createGlobalCodeiumIgnore(personalFiles: any[]): Promise<void> {
    const patterns = this.generateIgnorePatterns(personalFiles);
    
    const commonPatterns = [
      '# Security rules added by claude-security',
      '# Personal sensitive files - global exclusions',
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
      '**/.*_history',
      '**/.bash_history',
      '**/.zsh_history',
      ''
    ];

    let content = commonPatterns.join('\n');
    
    // Add specific patterns from scan results
    if (patterns.length > 0) {
      content += '# Detected sensitive patterns\n';
      content += patterns.join('\n') + '\n';
    }

    // Backup and merge with existing file
    if (existsSync(this.globalCodeiumIgnorePath)) {
      await this.createConfigBackup(this.globalCodeiumIgnorePath);
      
      const existingContent = readFileSync(this.globalCodeiumIgnorePath, 'utf8');
      if (!existingContent.includes('# Security rules added by claude-security')) {
        content = existingContent + '\n\n' + content;
      } else {
        content = existingContent.split('# Security rules added by claude-security')[0] + content;
      }
    }

    writeFileSync(this.globalCodeiumIgnorePath, content, 'utf8');
  }

  /**
   * Create local .codeiumignore file for project files
   */
  private async createLocalCodeiumIgnore(projectFiles: any[]): Promise<void> {
    const patterns = this.generateIgnorePatterns(projectFiles);
    
    const securityPatterns = [
      '# Security rules added by claude-security',
      '# Project sensitive files - local exclusions',
      '.env*',
      'secrets/',
      'private/',
      'config/database*',
      'config/secrets*',
      '*.key',
      '*.pem',
      '*.p12',
      '*.pfx',
      '**/*.tfstate',
      '**/*.backup',
      '**/dump.sql',
      '**/backup.sql',
      '**/*.log',
      'logs/',
      ''
    ];

    let content = securityPatterns.join('\n');
    
    // Add specific patterns from scan
    if (patterns.length > 0) {
      content += '# Detected project-specific patterns\n';
      content += patterns.join('\n') + '\n';
    }

    // Backup and merge with existing file
    if (existsSync(this.localCodeiumIgnorePath)) {
      await this.createConfigBackup(this.localCodeiumIgnorePath);
      
      const existingContent = readFileSync(this.localCodeiumIgnorePath, 'utf8');
      if (!existingContent.includes('# Security rules added by claude-security')) {
        content = existingContent + '\n\n' + content;
      } else {
        content = existingContent.split('# Security rules added by claude-security')[0] + content;
      }
    }

    writeFileSync(this.localCodeiumIgnorePath, content, 'utf8');
  }

  /**
   * Configure Windsurf IDE settings for enhanced security
   */
  private async configureWindsurfSettings(securityConfig: SecurityConfiguration): Promise<void> {
    // Create config directory if it doesn't exist
    if (!existsSync(this.windsurfConfigDir)) {
      const fs = require('fs');
      fs.mkdirSync(this.windsurfConfigDir, { recursive: true });
    }

    let settings: any = {};

    // Read existing settings
    if (existsSync(this.windsurfSettingsPath)) {
      await this.createConfigBackup(this.windsurfSettingsPath);
      
      try {
        const content = readFileSync(this.windsurfSettingsPath, 'utf8');
        settings = JSON.parse(content);
      } catch (error) {
        settings = {};
      }
    }

    // Apply security settings
    settings['codeium.enableIndexing'] = false; // Disable code indexing for privacy
    settings['codeium.enableCodeLens'] = false; // Disable code suggestions overlay
    settings['codeium.enableSearch'] = false;   // Disable search in code
    settings['codeium.excludeLanguages'] = ['secrets', 'env', 'key', 'pem'];
    settings['terminal.integrated.enableFileLinks'] = false; // Restrict terminal file access
    settings['terminal.integrated.allowChords'] = false;     // Restrict terminal chord commands
    
    // Add exclude paths if supported
    if (securityConfig.blockedPatterns.length > 0) {
      settings['codeium.excludePaths'] = securityConfig.blockedPatterns;
    }

    // Enable local processing mode if available
    settings['codeium.localMode'] = true;
    settings['codeium.telemetry.enable'] = false;

    writeFileSync(this.windsurfSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }

  /**
   * Get Windsurf version if available
   */
  private async getWindsurfVersion(): Promise<string | undefined> {
    try {
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const process = spawn('windsurf', ['--version'], { stdio: 'pipe' });
        let output = '';
        
        process.stdout.on('data', (data: any) => {
          output += data.toString();
        });
        
        process.on('close', (code: number) => {
          if (code === 0 && output.trim()) {
            // Extract version number from output
            const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
            resolve(versionMatch ? versionMatch[1] : output.trim());
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