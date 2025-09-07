/**
 * Base Adapter Interface for AI Tools
 * Provides a consistent interface for applying security rules across different AI coding tools
 */

import { ScanResult } from '../setup/scanner';
import { SetupResult } from '../setup/wizard';

export type AIToolType = 'claude-code' | 'cursor' | 'copilot' | 'windsurf';

export interface AIToolInfo {
  name: string;
  displayName: string;
  description: string;
  configFiles: string[];
  isInstalled: boolean;
  version?: string;
}

export interface AdapterCapabilities {
  /** Can create ignore files (like .cursorignore) */
  supportsIgnoreFiles: boolean;
  /** Can modify tool settings/preferences */
  supportsSettingsConfig: boolean;
  /** Can configure repository-level exclusions */
  supportsRepositoryConfig: boolean;
  /** Can configure organization-level policies */
  supportsOrganizationConfig: boolean;
  /** Supports local-only processing modes */
  supportsLocalProcessing: boolean;
}

export interface SecurityConfiguration {
  /** Files and patterns to completely block */
  blockedPatterns: string[];
  /** Files and patterns to ask permission for */
  askPatterns: string[];
  /** Files and patterns to explicitly allow */
  allowedPatterns: string[];
  /** Additional tool-specific configurations */
  toolSpecificConfig?: Record<string, any>;
}

/**
 * Abstract base class for AI tool security adapters
 */
export abstract class BaseAdapter {
  protected toolType: AIToolType;
  
  constructor(toolType: AIToolType) {
    this.toolType = toolType;
  }

  /**
   * Get information about this AI tool
   */
  abstract getToolInfo(): Promise<AIToolInfo>;

  /**
   * Get the capabilities of this adapter
   */
  abstract getCapabilities(): AdapterCapabilities;

  /**
   * Check if the AI tool is installed and accessible
   */
  abstract isToolInstalled(): Promise<boolean>;

  /**
   * Apply security configuration to the AI tool
   */
  abstract applySecurityConfig(scanResult: ScanResult, config: SecurityConfiguration): Promise<SetupResult>;

  /**
   * Get current security status for the AI tool
   */
  abstract getSecurityStatus(): Promise<{
    isConfigured: boolean;
    configuredRules: number;
    configurationFiles: string[];
    lastUpdated?: Date;
  }>;

  /**
   * Generate tool-specific security configuration from scan results
   */
  protected abstract generateSecurityConfig(scanResult: ScanResult): SecurityConfiguration;

  /**
   * Validate that the security configuration is properly applied
   */
  abstract validateConfiguration(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }>;

  /**
   * Reset/remove security configuration
   */
  abstract resetConfiguration(): Promise<void>;

  /**
   * Get tool-specific help and documentation links
   */
  abstract getHelpInfo(): {
    documentationUrl?: string;
    configurationHelp: string;
    troubleshooting: string[];
  };

  /**
   * Common method to filter scan results by risk level
   */
  protected filterFilesByRisk(scanResult: ScanResult, riskLevels: string[]): any[] {
    return scanResult.files.filter((file: any) => riskLevels.includes(file.risk));
  }

  /**
   * Common method to generate ignore patterns from file paths
   */
  protected generateIgnorePatterns(files: any[]): string[] {
    const patterns: string[] = [];
    
    for (const file of files) {
      // Add specific file patterns
      if (file.relativePath) {
        patterns.push(file.relativePath);
      }
      
      // Add directory patterns for directories
      if (file.relativePath && file.relativePath.includes('/')) {
        const dirPath = file.relativePath.split('/').slice(0, -1).join('/');
        const dirPattern = `${dirPath}/**`;
        if (!patterns.includes(dirPattern)) {
          patterns.push(dirPattern);
        }
      }
    }
    
    return [...new Set(patterns)]; // Remove duplicates
  }

  /**
   * Common method to backup configuration files
   */
  protected async createConfigBackup(configPath: string): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(configPath)) return;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${configPath}.backup.${timestamp}`;
    
    try {
      fs.copyFileSync(configPath, backupPath);
    } catch (error) {
      console.warn(`Warning: Could not create backup of ${configPath}`);
    }
  }
}

/**
 * Factory function to create the appropriate adapter for an AI tool
 */
export async function createAdapter(toolType: AIToolType): Promise<BaseAdapter> {
  switch (toolType) {
    case 'claude-code':
      const { ClaudeCodeAdapter } = await import('./claude-code-adapter');
      return new ClaudeCodeAdapter();
    
    case 'cursor':
      const { CursorAdapter } = await import('./cursor-adapter');
      return new CursorAdapter();
      
    case 'copilot':
      const { CopilotAdapter } = await import('./copilot-adapter');
      return new CopilotAdapter();
      
    case 'windsurf':
      const { WindsurfAdapter } = await import('./windsurf-adapter');
      return new WindsurfAdapter();
      
    default:
      throw new Error(`Unsupported AI tool: ${toolType}`);
  }
}

/**
 * Get list of all supported AI tools
 */
export function getSupportedTools(): AIToolType[] {
  return ['claude-code', 'cursor', 'copilot', 'windsurf'];
}

/**
 * Detect which AI tools are currently installed on the system
 */
export async function detectInstalledTools(): Promise<AIToolType[]> {
  const supportedTools = getSupportedTools();
  const installedTools: AIToolType[] = [];
  
  for (const toolType of supportedTools) {
    try {
      const adapter = await createAdapter(toolType);
      if (await adapter.isToolInstalled()) {
        installedTools.push(toolType);
      }
    } catch (error) {
      // Tool not available, skip
      continue;
    }
  }
  
  return installedTools;
}