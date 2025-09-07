/**
 * GitHub Copilot Adapter
 * Manages security configuration for GitHub Copilot through repository exclusions and settings
 */

import { BaseAdapter, AIToolInfo, AdapterCapabilities, SecurityConfiguration } from './base-adapter';
import { ScanResult, SetupResult } from '../setup/wizard';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export class CopilotAdapter extends BaseAdapter {
  private vscodeConfigDir: string;
  private vscodeSettingsPath: string;
  private gitConfigPath: string;
  private copilotConfigPath: string;

  constructor() {
    super('copilot');
    
    // VS Code is the primary host for Copilot
    this.vscodeConfigDir = process.platform === 'darwin' 
      ? join(homedir(), 'Library/Application Support/Code/User')
      : join(homedir(), '.config/Code/User');
    
    this.vscodeSettingsPath = join(this.vscodeConfigDir, 'settings.json');
    this.gitConfigPath = join(homedir(), '.gitconfig');
    this.copilotConfigPath = join(homedir(), '.copilot', 'config.json');
  }

  async getToolInfo(): Promise<AIToolInfo> {
    const isInstalled = await this.isToolInstalled();
    
    return {
      name: 'copilot',
      displayName: 'GitHub Copilot',
      description: 'AI pair programmer by GitHub, integrated with VS Code and other editors',
      configFiles: [
        this.vscodeSettingsPath,
        this.gitConfigPath,
        this.copilotConfigPath
      ].filter(existsSync),
      isInstalled,
      version: await this.getCopilotVersion()
    };
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsIgnoreFiles: false,
      supportsSettingsConfig: true,
      supportsRepositoryConfig: true,
      supportsOrganizationConfig: true,
      supportsLocalProcessing: false // Copilot requires cloud processing
    };
  }

  async isToolInstalled(): Promise<boolean> {
    try {
      // Check if GitHub Copilot extension is installed in VS Code
      const extensionsDir = process.platform === 'darwin'
        ? join(homedir(), '.vscode/extensions')
        : join(homedir(), '.vscode/extensions');
      
      if (existsSync(extensionsDir)) {
        const fs = require('fs');
        const extensions = fs.readdirSync(extensionsDir);
        const hasCopilot = extensions.some((ext: string) => ext.includes('github.copilot'));
        if (hasCopilot) return true;
      }

      // Check for gh CLI tool
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const process = spawn('which', ['gh'], { stdio: 'pipe' });
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
    
    // Configure VS Code settings for Copilot
    const vsCodeResult = await this.configureVSCodeSettings(securityConfig);
    result.globalRulesApplied += vsCodeResult.rulesApplied;
    result.backupCreated = vsCodeResult.backupCreated;

    // Create .gitattributes file for repository-level exclusions
    const gitResult = await this.createGitAttributes(scanResult);
    result.projectRulesApplied += gitResult.rulesApplied;

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

    // Check VS Code settings
    if (existsSync(this.vscodeSettingsPath)) {
      configFiles.push(this.vscodeSettingsPath);
      try {
        const content = readFileSync(this.vscodeSettingsPath, 'utf8');
        const settings = JSON.parse(content);
        
        // Count Copilot-related security settings
        const copilotSettings = [
          'github.copilot.enable',
          'github.copilot.advanced.restrictTelemetry',
          'github.copilot.advanced.excludePaths',
          'github.copilot.advanced.inlineSuggestEnable'
        ];
        
        configuredRules += copilotSettings.filter(setting => settings[setting] !== undefined).length;
        
        const fs = require('fs');
        const stats = fs.statSync(this.vscodeSettingsPath);
        lastUpdated = stats.mtime;
      } catch (error) {
        // Ignore JSON parsing errors
      }
    }

    // Check .gitattributes
    const gitAttributesPath = join(process.cwd(), '.gitattributes');
    if (existsSync(gitAttributesPath)) {
      configFiles.push(gitAttributesPath);
      const content = readFileSync(gitAttributesPath, 'utf8');
      const copilotRules = content.split('\n').filter(line => 
        line.includes('copilot') || line.includes('linguist-generated')
      );
      configuredRules += copilotRules.length;
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
    
    const excludePaths = this.generateExcludePaths(criticalFiles);
    
    return {
      blockedPatterns: excludePaths,
      askPatterns: this.generateExcludePaths(highFiles),
      allowedPatterns: [],
      toolSpecificConfig: {
        restrictTelemetry: true,
        disablePublicCodeMatching: true,
        enableOrganizationPolicies: true
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

    // Check VS Code settings file
    if (existsSync(this.vscodeSettingsPath)) {
      try {
        const content = readFileSync(this.vscodeSettingsPath, 'utf8');
        JSON.parse(content);
      } catch (error) {
        errors.push(`Invalid JSON in ${this.vscodeSettingsPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      warnings.push('VS Code settings file not found. Copilot settings may not be configured.');
    }

    // Check .gitattributes syntax
    const gitAttributesPath = join(process.cwd(), '.gitattributes');
    if (existsSync(gitAttributesPath)) {
      try {
        const content = readFileSync(gitAttributesPath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (line.trim() && !line.startsWith('#')) {
            // Basic validation for gitattributes format
            const parts = line.trim().split(/\s+/);
            if (parts.length < 2) {
              warnings.push(`Line ${index + 1} in .gitattributes: Malformed attribute '${line.trim()}'`);
            }
          }
        });
      } catch (error) {
        errors.push(`Cannot read .gitattributes: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Check if Copilot is installed
    if (!(await this.isToolInstalled())) {
      warnings.push('GitHub Copilot does not appear to be installed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async resetConfiguration(): Promise<void> {
    // Reset VS Code settings
    if (existsSync(this.vscodeSettingsPath)) {
      await this.createConfigBackup(this.vscodeSettingsPath);
      
      try {
        const content = readFileSync(this.vscodeSettingsPath, 'utf8');
        const settings = JSON.parse(content);
        
        // Remove Copilot security settings
        const copilotSettings = [
          'github.copilot.advanced.restrictTelemetry',
          'github.copilot.advanced.excludePaths',
          'github.copilot.advanced.inlineSuggestEnable'
        ];
        
        copilotSettings.forEach(setting => {
          delete settings[setting];
        });
        
        writeFileSync(this.vscodeSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
      } catch (error) {
        // Ignore errors
      }
    }

    // Reset .gitattributes
    const gitAttributesPath = join(process.cwd(), '.gitattributes');
    if (existsSync(gitAttributesPath)) {
      await this.createConfigBackup(gitAttributesPath);
      
      const content = readFileSync(gitAttributesPath, 'utf8');
      const lines = content.split('\n');
      const securityMarker = '# Copilot security rules added by claude-security';
      
      let markerIndex = lines.indexOf(securityMarker);
      if (markerIndex !== -1) {
        const cleanedContent = lines.slice(0, markerIndex).join('\n');
        writeFileSync(gitAttributesPath, cleanedContent, 'utf8');
      }
    }
  }

  getHelpInfo(): {
    documentationUrl?: string;
    configurationHelp: string;
    troubleshooting: string[];
  } {
    return {
      documentationUrl: 'https://docs.github.com/en/copilot',
      configurationHelp: `GitHub Copilot security configuration:

1. VS Code settings (${this.vscodeSettingsPath}):
   {
     "github.copilot.advanced.restrictTelemetry": true,
     "github.copilot.advanced.excludePaths": ["**/.env*", "**/secrets/**"],
     "github.copilot.enable": {
       "*": true,
       "secrets": false,
       "env": false
     }
   }

2. Repository-level exclusions (.gitattributes):
   .env* linguist-generated=true
   secrets/** linguist-generated=true
   *.key linguist-generated=true

3. Organization-level policies (GitHub Enterprise):
   - Configure through GitHub organization settings
   - Set content exclusion policies
   - Enable audit logging`,
      troubleshooting: [
        'Ensure GitHub Copilot extension is installed in VS Code',
        'Check VS Code settings.json syntax',
        'Verify .gitattributes file format',
        'Test exclusions with sample files',
        'Check organization policies if using GitHub Enterprise',
        'Restart VS Code after configuration changes'
      ]
    };
  }

  /**
   * Configure VS Code settings for Copilot security
   */
  private async configureVSCodeSettings(securityConfig: SecurityConfiguration): Promise<{
    rulesApplied: number;
    backupCreated: boolean;
  }> {
    if (!existsSync(this.vscodeConfigDir)) {
      const fs = require('fs');
      fs.mkdirSync(this.vscodeConfigDir, { recursive: true });
    }

    let settings: any = {};
    let backupCreated = false;

    // Read existing settings
    if (existsSync(this.vscodeSettingsPath)) {
      await this.createConfigBackup(this.vscodeSettingsPath);
      backupCreated = true;
      
      try {
        const content = readFileSync(this.vscodeSettingsPath, 'utf8');
        settings = JSON.parse(content);
      } catch (error) {
        // Start with empty settings if file is corrupted
        settings = {};
      }
    }

    // Apply security settings
    settings['github.copilot.advanced.restrictTelemetry'] = true;
    settings['github.copilot.advanced.excludePaths'] = securityConfig.blockedPatterns;
    
    // Disable Copilot for sensitive file types
    if (!settings['github.copilot.enable']) {
      settings['github.copilot.enable'] = {};
    }
    
    settings['github.copilot.enable']['secrets'] = false;
    settings['github.copilot.enable']['env'] = false;
    settings['github.copilot.enable']['key'] = false;
    settings['github.copilot.enable']['pem'] = false;

    writeFileSync(this.vscodeSettingsPath, JSON.stringify(settings, null, 2), 'utf8');
    
    return {
      rulesApplied: 4, // restrictTelemetry + excludePaths + 2 file type disables
      backupCreated
    };
  }

  /**
   * Create .gitattributes file for repository-level exclusions
   */
  private async createGitAttributes(scanResult: ScanResult): Promise<{
    rulesApplied: number;
  }> {
    const gitAttributesPath = join(process.cwd(), '.gitattributes');
    const criticalFiles = this.filterFilesByRisk(scanResult, ['CRITICAL']);
    
    const attributeRules = [
      '# Copilot security rules added by claude-security',
      '# Mark sensitive files as generated to exclude from Copilot',
      '.env* linguist-generated=true',
      'secrets/** linguist-generated=true',
      '**/.ssh/** linguist-generated=true',
      '**/.aws/** linguist-generated=true',
      '*.key linguist-generated=true',
      '*.pem linguist-generated=true',
      '*.p12 linguist-generated=true',
      '*.pfx linguist-generated=true',
      'id_rsa* linguist-generated=true',
      'id_ed25519* linguist-generated=true',
      ''
    ];

    // Add specific patterns from scan results
    const specificPatterns = this.generateIgnorePatterns(criticalFiles);
    specificPatterns.forEach(pattern => {
      attributeRules.push(`${pattern} linguist-generated=true`);
    });

    let content = attributeRules.join('\n');

    // Merge with existing .gitattributes
    if (existsSync(gitAttributesPath)) {
      await this.createConfigBackup(gitAttributesPath);
      
      const existingContent = readFileSync(gitAttributesPath, 'utf8');
      if (!existingContent.includes('# Copilot security rules added by claude-security')) {
        content = existingContent + '\n\n' + content;
      } else {
        // Replace security section
        content = existingContent.split('# Copilot security rules added by claude-security')[0] + content;
      }
    }

    writeFileSync(gitAttributesPath, content, 'utf8');
    
    return {
      rulesApplied: attributeRules.length - 3 // Exclude comments and empty lines
    };
  }

  /**
   * Generate exclude paths for Copilot configuration
   */
  private generateExcludePaths(files: any[]): string[] {
    const paths: string[] = [];
    
    for (const file of files) {
      if (file.relativePath) {
        // Add the specific file
        paths.push(file.relativePath);
        
        // Add directory patterns
        const dir = file.relativePath.split('/').slice(0, -1).join('/');
        if (dir && !paths.includes(`${dir}/**`)) {
          paths.push(`${dir}/**`);
        }
      }
    }
    
    // Add common sensitive patterns
    const commonPatterns = [
      '**/.env*',
      '**/secrets/**',
      '**/.ssh/**',
      '**/.aws/**',
      '**/*.key',
      '**/*.pem'
    ];
    
    commonPatterns.forEach(pattern => {
      if (!paths.includes(pattern)) {
        paths.push(pattern);
      }
    });
    
    return paths;
  }

  /**
   * Get Copilot version if available
   */
  private async getCopilotVersion(): Promise<string | undefined> {
    try {
      // Try to get version through GitHub CLI
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const process = spawn('gh', ['extension', 'list'], { stdio: 'pipe' });
        let output = '';
        
        process.stdout.on('data', (data: any) => {
          output += data.toString();
        });
        
        process.on('close', (code: number) => {
          if (code === 0 && output.includes('copilot')) {
            const lines = output.split('\n');
            const copilotLine = lines.find(line => line.includes('copilot'));
            if (copilotLine) {
              const version = copilotLine.match(/v?(\d+\.\d+\.\d+)/);
              resolve(version ? version[1] : undefined);
            }
          }
          resolve(undefined);
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