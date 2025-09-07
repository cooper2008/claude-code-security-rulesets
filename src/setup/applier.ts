/**
 * Rule Applier - Automated Claude Code Settings Application
 * Applies security rules to Claude Code settings with backups
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ScanResult, ScanFile } from './scanner';
import { ClaudeCodeConfiguration } from '../types';
import { formatDuration, formatConfigLevel } from '../utils/formatters';

export interface ProtectionStatus {
  globalRules: number;
  localRules: number;
  lastUpdated?: Date;
  hasBackup: boolean;
}

export interface RuleApplicationResult {
  projectRulesApplied: number;
  globalRulesApplied: number;
  backupCreated: boolean;
  protectedFiles: string[];
}

export interface ConfigurationDiff {
  level: 'global' | 'local';
  exists: boolean;
  newRules: string[];
  existingRules: string[];
  removedRules: string[];
  unchangedRules: string[];
  filePath: string;
}

export interface PreviewResult {
  globalDiff?: ConfigurationDiff;
  localDiff?: ConfigurationDiff;
  willCreateBackup: boolean;
  totalNewRules: number;
}

/**
 * Rule Applier Class
 * Handles automatic application of security rules to Claude Code settings
 */
export class RuleApplier {
  private claudeDir: string;
  private globalSettingsPath: string;
  private localSettingsPath: string;

  constructor() {
    this.claudeDir = join(homedir(), '.claude');
    this.globalSettingsPath = join(this.claudeDir, 'settings.local.json');
    this.localSettingsPath = join(this.claudeDir, 'settings.json');
  }

  /**
   * Apply security rules based on scan results
   */
  async applyRules(scanResult: ScanResult): Promise<RuleApplicationResult> {
    const result: RuleApplicationResult = {
      projectRulesApplied: 0,
      globalRulesApplied: 0,
      backupCreated: false,
      protectedFiles: []
    };

    // Separate project and personal files
    const projectFiles = scanResult.files.filter(f => f.scope === 'project' && f.risk === 'CRITICAL');
    const personalFiles = scanResult.files.filter(f => f.scope === 'personal' && f.risk === 'CRITICAL');

    // Apply global rules for personal files
    if (personalFiles.length > 0) {
      result.globalRulesApplied = await this.applyGlobalRules(personalFiles);
      result.backupCreated = true;
    }

    // Apply local rules for project files  
    if (projectFiles.length > 0) {
      result.projectRulesApplied = await this.applyLocalRules(projectFiles);
    }

    // Track all protected files
    result.protectedFiles = scanResult.files
      .filter(f => f.risk === 'CRITICAL')
      .map(f => f.relativePath);

    return result;
  }

  /**
   * Apply global rules to Claude Code global settings
   */
  private async applyGlobalRules(personalFiles: ScanFile[]): Promise<number> {
    // Create backup first
    this.createBackup(this.globalSettingsPath);

    // Read existing global settings
    let globalSettings = this.readClaudeSettings(this.globalSettingsPath);

    // Generate rules from personal files
    const newRules = this.generateRulesFromFiles(personalFiles);
    
    // Merge with existing settings
    globalSettings = this.mergeRules(globalSettings, newRules);

    // Write updated settings
    this.writeClaudeSettings(this.globalSettingsPath, globalSettings);

    return newRules.deny.length + newRules.ask.length;
  }

  /**
   * Apply local rules to Claude Code local settings  
   */
  private async applyLocalRules(projectFiles: ScanFile[]): Promise<number> {
    // Create backup if local settings exist
    if (existsSync(this.localSettingsPath)) {
      this.createBackup(this.localSettingsPath);
    }

    // Read existing local settings
    let localSettings = this.readClaudeSettings(this.localSettingsPath);

    // Generate rules from project files
    const newRules = this.generateRulesFromFiles(projectFiles);
    
    // Merge with existing settings
    localSettings = this.mergeRules(localSettings, newRules);

    // Write updated settings
    this.writeClaudeSettings(this.localSettingsPath, localSettings);

    return newRules.deny.length + newRules.ask.length;
  }

  /**
   * Generate Claude Code rules from scanned files
   */
  private generateRulesFromFiles(files: ScanFile[]): { deny: string[]; ask: string[]; allow: string[] } {
    const rules = {
      deny: [] as string[],
      ask: [] as string[],
      allow: [] as string[]
    };

    for (const file of files) {
      const claudeRule = this.convertToClaudeFormat(file.suggestedRule);
      
      if (file.risk === 'CRITICAL') {
        if (claudeRule && !rules.deny.includes(claudeRule)) {
          rules.deny.push(claudeRule);
        }
      } else if (file.risk === 'HIGH' || file.risk === 'MEDIUM') {
        if (claudeRule && !rules.ask.includes(claudeRule)) {
          rules.ask.push(claudeRule);
        }
      }
    }

    return rules;
  }

  /**
   * Convert our rule format to Claude Code format
   */
  private convertToClaudeFormat(rule: string): string | null {
    // Handle our common rule patterns and convert to Claude Code format
    const conversions: Record<string, string> = {
      'Read(.env*)': 'Read(.env*)',
      'Read(**/secrets/**)': 'Read(**/secrets/**)',
      'Read(**/id_rsa*)': 'Read(/Users/*/.ssh/id_rsa*)',
      'Read(**/.ssh/**)': 'Read(/Users/*/.ssh/**)',
      'Read(**/.aws/credentials)': 'Read(/Users/*/.aws/credentials)',
      'Read(**/.aws/**)': 'Read(/Users/*/.aws/**)',
      'Read(**/.gcloud/**)': 'Read(/Users/*/.gcloud/**)',
      'Read(**/.docker/**)': 'Read(/Users/*/.docker/**)',
      'Read(**/.kube/**)': 'Read(/Users/*/.kube/**)',
      'Read(**/*.key)': 'Read(**/*.key)',
      'Read(**/*.db)': 'Read(**/*.db)',
      'Read(**/*dump*.sql)': 'Read(**/*dump*.sql)',
      'Read(**/config/database*)': 'Read(**/config/database*)',
      'Read(**/*.tfstate)': 'Read(**/*.tfstate)',
      'Ask(**/*.log)': 'Read(**/*.log)', // Convert ask to read for simplicity
      'Ask(**/*Dockerfile*)': 'Read(**/*Dockerfile*)',
    };

    // Direct conversion if we have a mapping
    if (conversions[rule]) {
      return conversions[rule];
    }

    // Handle patterns that already look like Claude Code format
    if (rule.match(/^(Read|Write|Bash)\(/)) {
      return rule;
    }

    // Default conversion for unknown patterns
    return rule;
  }

  /**
   * Read Claude Code settings file
   */
  private readClaudeSettings(settingsPath: string): any {
    if (!existsSync(settingsPath)) {
      return {
        permissions: {
          allow: [],
          deny: [],
          ask: []
        }
      };
    }

    try {
      const content = readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(content);
      
      // Ensure permissions structure exists
      if (!settings.permissions) {
        settings.permissions = { allow: [], deny: [], ask: [] };
      }
      if (!settings.permissions.allow) settings.permissions.allow = [];
      if (!settings.permissions.deny) settings.permissions.deny = [];  
      if (!settings.permissions.ask) settings.permissions.ask = [];

      return settings;
    } catch (error) {
      // If file is corrupted, return default structure
      return {
        permissions: {
          allow: [],
          deny: [],
          ask: []
        }
      };
    }
  }

  /**
   * Write Claude Code settings file
   */
  private writeClaudeSettings(settingsPath: string, settings: any): void {
    try {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (error) {
      throw new Error(`Failed to write Claude Code settings to ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Merge new rules with existing settings
   */
  private mergeRules(existingSettings: any, newRules: { deny: string[]; ask: string[]; allow: string[] }): any {
    const merged = { ...existingSettings };

    // Add new deny rules (avoid duplicates)
    newRules.deny.forEach(rule => {
      if (!merged.permissions.deny.includes(rule)) {
        merged.permissions.deny.push(rule);
      }
    });

    // Add new ask rules (avoid duplicates)  
    newRules.ask.forEach(rule => {
      if (!merged.permissions.ask.includes(rule)) {
        merged.permissions.ask.push(rule);
      }
    });

    // Add new allow rules (avoid duplicates)
    newRules.allow.forEach(rule => {
      if (!merged.permissions.allow.includes(rule)) {
        merged.permissions.allow.push(rule);
      }
    });

    return merged;
  }

  /**
   * Create backup of settings file
   */
  private createBackup(settingsPath: string): void {
    if (!existsSync(settingsPath)) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${settingsPath}.backup.${timestamp}`;

    try {
      copyFileSync(settingsPath, backupPath);
    } catch (error) {
      console.warn(`Warning: Could not create backup of ${settingsPath}`);
    }
  }

  /**
   * Get current protection status
   */
  async getProtectionStatus(): Promise<ProtectionStatus> {
    const status: ProtectionStatus = {
      globalRules: 0,
      localRules: 0,
      hasBackup: false
    };

    // Check global settings
    if (existsSync(this.globalSettingsPath)) {
      const globalSettings = this.readClaudeSettings(this.globalSettingsPath);
      status.globalRules = (globalSettings.permissions?.deny?.length || 0) + 
                          (globalSettings.permissions?.ask?.length || 0);
      
      // Check for backup files
      status.hasBackup = this.hasBackupFiles(this.globalSettingsPath);
    }

    // Check local settings
    if (existsSync(this.localSettingsPath)) {
      const localSettings = this.readClaudeSettings(this.localSettingsPath);  
      status.localRules = (localSettings.permissions?.deny?.length || 0) +
                         (localSettings.permissions?.ask?.length || 0);
    }

    // Get last modified time
    if (existsSync(this.globalSettingsPath)) {
      const fs = require('fs');
      const stats = fs.statSync(this.globalSettingsPath);
      status.lastUpdated = stats.mtime;
    }

    return status;
  }

  /**
   * Check if backup files exist
   */
  private hasBackupFiles(settingsPath: string): boolean {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const dir = path.dirname(settingsPath);
      const filename = path.basename(settingsPath);
      const files = fs.readdirSync(dir);
      
      return files.some((file: string) => file.startsWith(`${filename}.backup.`));
    } catch (error) {
      return false;
    }
  }

  /**
   * Preview configuration changes without applying them
   */
  async previewConfigurationChanges(scanResult: ScanResult): Promise<PreviewResult> {
    const result: PreviewResult = {
      willCreateBackup: false,
      totalNewRules: 0
    };

    // Separate project and personal files
    const projectFiles = scanResult.files.filter(f => f.scope === 'project' && f.risk === 'CRITICAL');
    const personalFiles = scanResult.files.filter(f => f.scope === 'personal' && f.risk === 'CRITICAL');

    // Preview global changes for personal files
    if (personalFiles.length > 0) {
      result.globalDiff = await this.generateConfigDiff('global', personalFiles);
      result.willCreateBackup = result.globalDiff.exists;
      result.totalNewRules += result.globalDiff.newRules.length;
    }

    // Preview local changes for project files
    if (projectFiles.length > 0) {
      result.localDiff = await this.generateConfigDiff('local', projectFiles);
      if (result.localDiff.exists && !result.willCreateBackup) {
        result.willCreateBackup = true;
      }
      result.totalNewRules += result.localDiff.newRules.length;
    }

    return result;
  }

  /**
   * Generate configuration diff for a specific level
   */
  private async generateConfigDiff(level: 'global' | 'local', files: ScanFile[]): Promise<ConfigurationDiff> {
    const settingsPath = level === 'global' ? this.globalSettingsPath : this.localSettingsPath;
    const exists = existsSync(settingsPath);
    
    // Generate new rules from files
    const newRulesObj = this.generateRulesFromFiles(files);
    const newRules = [...newRulesObj.deny, ...newRulesObj.ask];

    let existingRules: string[] = [];
    let unchangedRules: string[] = [];
    let removedRules: string[] = [];

    if (exists) {
      const currentSettings = this.readClaudeSettings(settingsPath);
      existingRules = [
        ...(currentSettings.permissions?.deny || []),
        ...(currentSettings.permissions?.ask || [])
      ];

      // Find unchanged rules (rules that exist in both old and new)
      unchangedRules = existingRules.filter(rule => newRules.includes(rule));
      
      // Find removed rules (rules that exist in old but not in new)
      removedRules = existingRules.filter(rule => !newRules.includes(rule));
    }

    // Find truly new rules (rules that don't exist in current config)
    const actuallyNewRules = newRules.filter(rule => !existingRules.includes(rule));

    return {
      level,
      exists,
      newRules: actuallyNewRules,
      existingRules,
      removedRules,
      unchangedRules,
      filePath: settingsPath
    };
  }

  /**
   * Display configuration preview with diff information
   */
  displayConfigurationPreview(previewResult: PreviewResult): void {
    console.log('\n📋 Configuration Preview\n');

    if (previewResult.globalDiff) {
      this.displayDiff(previewResult.globalDiff);
    }

    if (previewResult.localDiff) {
      this.displayDiff(previewResult.localDiff);
    }

    if (previewResult.totalNewRules === 0) {
      console.log('✅ No new rules needed - your configuration is already up to date!');
    } else {
      console.log(`\n📊 Summary:`);
      console.log(`   • ${previewResult.totalNewRules} new rules will be added`);
      console.log(`   • Backup will be created: ${previewResult.willCreateBackup ? 'Yes' : 'No'}`);
    }
    console.log('');
  }

  /**
   * Display individual configuration diff
   */
  private displayDiff(diff: ConfigurationDiff): void {
    const levelDisplay = formatConfigLevel(diff.level);
    
    console.log(`\n${levelDisplay}`);
    console.log(`   Path: ${diff.filePath}`);
    console.log(`   Status: ${diff.exists ? 'EXISTS (will update)' : 'NEW (will create)'}`);
    
    if (diff.newRules.length > 0) {
      console.log(`   ✅ Adding ${diff.newRules.length} new rules:`);
      diff.newRules.forEach(rule => console.log(`      + ${rule}`));
    }
    
    if (diff.unchangedRules.length > 0) {
      console.log(`   ↔️  Keeping ${diff.unchangedRules.length} existing rules unchanged`);
    }
    
    if (diff.removedRules.length > 0) {
      console.log(`   ❌ Removing ${diff.removedRules.length} obsolete rules:`);
      diff.removedRules.forEach(rule => console.log(`      - ${rule}`));
    }

    if (diff.newRules.length === 0 && diff.removedRules.length === 0) {
      console.log('   ✅ No changes needed');
    }
  }

  /**
   * Reset Claude Code settings to original state
   */
  async resetSettings(scope: 'global' | 'local' | 'both' = 'both'): Promise<void> {
    const resetPaths = [];
    
    if (scope === 'global' || scope === 'both') {
      resetPaths.push(this.globalSettingsPath);
    }
    
    if (scope === 'local' || scope === 'both') {
      resetPaths.push(this.localSettingsPath);
    }

    for (const settingsPath of resetPaths) {
      if (existsSync(settingsPath)) {
        // Try to find the most recent backup
        const backupPath = this.findMostRecentBackup(settingsPath);
        
        if (backupPath && existsSync(backupPath)) {
          copyFileSync(backupPath, settingsPath);
        } else {
          // No backup found, create minimal settings
          const minimalSettings = {
            permissions: {
              allow: [],
              deny: [],
              ask: []
            }
          };
          this.writeClaudeSettings(settingsPath, minimalSettings);
        }
      }
    }
  }

  /**
   * Find the most recent backup file
   */
  private findMostRecentBackup(settingsPath: string): string | null {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const dir = path.dirname(settingsPath);
      const filename = path.basename(settingsPath);
      const files = fs.readdirSync(dir);
      
      const backups = files
        .filter((file: string) => file.startsWith(`${filename}.backup.`))
        .map((file: string) => ({
          name: file,
          path: path.join(dir, file),
          time: file.split('.backup.')[1] // Extract timestamp
        }))
        .sort((a, b) => b.time.localeCompare(a.time)); // Sort by timestamp desc

      return backups.length > 0 ? backups[0].path : null;
    } catch (error) {
      return null;
    }
  }
}