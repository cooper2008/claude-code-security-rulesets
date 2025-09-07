/**
 * Claude Code Adapter
 * Wraps existing Claude Code functionality to fit the adapter pattern
 */

import { BaseAdapter, AIToolInfo, AdapterCapabilities, SecurityConfiguration } from './base-adapter';
import { ScanResult, SetupResult } from '../setup/wizard';
import { RuleApplier } from '../setup/applier';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export class ClaudeCodeAdapter extends BaseAdapter {
  private ruleApplier: RuleApplier;
  private claudeDir: string;
  private globalSettingsPath: string;
  private localSettingsPath: string;

  constructor() {
    super('claude-code');
    this.ruleApplier = new RuleApplier();
    this.claudeDir = join(homedir(), '.claude');
    this.globalSettingsPath = join(this.claudeDir, 'settings.local.json');
    this.localSettingsPath = join(this.claudeDir, 'settings.json');
  }

  async getToolInfo(): Promise<AIToolInfo> {
    const isInstalled = await this.isToolInstalled();
    
    return {
      name: 'claude-code',
      displayName: 'Claude Code',
      description: 'AI coding assistant by Anthropic with advanced security controls',
      configFiles: [
        this.globalSettingsPath,
        this.localSettingsPath
      ],
      isInstalled,
      version: await this.getClaudeVersion()
    };
  }

  getCapabilities(): AdapterCapabilities {
    return {
      supportsIgnoreFiles: false,
      supportsSettingsConfig: true,
      supportsRepositoryConfig: true,
      supportsOrganizationConfig: false,
      supportsLocalProcessing: true
    };
  }

  async isToolInstalled(): Promise<boolean> {
    try {
      // Check if Claude Code CLI is available
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const process = spawn('which', ['claude'], { stdio: 'pipe' });
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
    // Use existing RuleApplier functionality
    return await this.ruleApplier.applyRules(scanResult);
  }

  async getSecurityStatus(): Promise<{
    isConfigured: boolean;
    configuredRules: number;
    configurationFiles: string[];
    lastUpdated?: Date;
  }> {
    const status = await this.ruleApplier.getProtectionStatus();
    
    const configFiles = [];
    if (existsSync(this.globalSettingsPath)) configFiles.push(this.globalSettingsPath);
    if (existsSync(this.localSettingsPath)) configFiles.push(this.localSettingsPath);
    
    return {
      isConfigured: status.globalRules > 0 || status.localRules > 0,
      configuredRules: status.globalRules + status.localRules,
      configurationFiles: configFiles,
      lastUpdated: status.lastUpdated
    };
  }

  protected generateSecurityConfig(scanResult: ScanResult): SecurityConfiguration {
    const criticalFiles = this.filterFilesByRisk(scanResult, ['CRITICAL']);
    const highFiles = this.filterFilesByRisk(scanResult, ['HIGH']);
    
    return {
      blockedPatterns: criticalFiles.map(f => f.suggestedRule || f.relativePath),
      askPatterns: highFiles.map(f => f.suggestedRule || f.relativePath),
      allowedPatterns: [],
      toolSpecificConfig: {
        globalRules: criticalFiles.filter(f => f.scope === 'personal').length,
        localRules: criticalFiles.filter(f => f.scope === 'project').length
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

    // Check if settings files are readable and valid JSON
    for (const configFile of [this.globalSettingsPath, this.localSettingsPath]) {
      if (existsSync(configFile)) {
        try {
          const fs = require('fs');
          const content = fs.readFileSync(configFile, 'utf8');
          JSON.parse(content);
        } catch (error) {
          errors.push(`Invalid JSON in ${configFile}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Check if Claude directory exists
    if (!existsSync(this.claudeDir)) {
      warnings.push('Claude Code configuration directory not found. Run Claude Code at least once to initialize.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async resetConfiguration(): Promise<void> {
    await this.ruleApplier.resetSettings('both');
  }

  getHelpInfo(): {
    documentationUrl?: string;
    configurationHelp: string;
    troubleshooting: string[];
  } {
    return {
      documentationUrl: 'https://docs.anthropic.com/claude-code',
      configurationHelp: `Claude Code uses JSON configuration files:
- Global settings: ${this.globalSettingsPath}
- Local project settings: ${this.localSettingsPath}

Configuration format:
{
  "permissions": {
    "deny": ["Read(.env*)", "Read(**/.ssh/**)", ...],
    "ask": ["Read(**/*.log)", ...],
    "allow": ["Read(**/*.js)", ...]
  }
}`,
      troubleshooting: [
        'Run Claude Code at least once to initialize configuration directory',
        'Check file permissions on configuration files',
        'Validate JSON syntax in configuration files',
        'Ensure ~/.claude directory exists',
        'Check for backup files if configuration was accidentally modified'
      ]
    };
  }

  /**
   * Get Claude Code version if available
   */
  private async getClaudeVersion(): Promise<string | undefined> {
    try {
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const process = spawn('claude', ['--version'], { stdio: 'pipe' });
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