/**
 * Plugin registry for discovery, registration, and management
 * Handles plugin discovery from filesystem and npm packages
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import {
  PluginManifest,
  PluginDiscoveryResult,
  DiscoveredPlugin,
  PluginDiscoveryError,
  PluginCategory,
  PluginType,
  PluginManagerConfig,
  PluginLogger
} from './types';

/**
 * Plugin registry entry
 */
export interface RegistryEntry {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Plugin source path */
  sourcePath: string;
  /** Plugin source type */
  sourceType: 'filesystem' | 'npm' | 'git';
  /** Registration timestamp */
  registeredAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Plugin hash for integrity checking */
  hash: string;
  /** Plugin status */
  status: 'available' | 'installed' | 'error' | 'deprecated';
  /** Installation path (if installed) */
  installPath?: string;
}

/**
 * Plugin search criteria
 */
export interface PluginSearchCriteria {
  /** Plugin category filter */
  category?: PluginCategory;
  /** Plugin type filter */
  type?: PluginType;
  /** Search query for name/description */
  query?: string;
  /** Author filter */
  author?: string;
  /** Tag filter */
  tags?: string[];
  /** Version range */
  version?: string;
}

/**
 * Plugin registry implementation
 */
export class PluginRegistry extends EventEmitter {
  private registry: Map<string, RegistryEntry> = new Map();
  private config: PluginManagerConfig;
  private logger: PluginLogger;
  private initialized = false;

  constructor(config: PluginManagerConfig, logger: PluginLogger) {
    super();
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initialize the plugin registry
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info('Initializing plugin registry...');
      
      // Load existing registry cache
      await this.loadRegistryCache();
      
      // Discover plugins from configured directories
      if (this.config.autoUpdate.checkOnStart) {
        await this.discoverAllPlugins();
      }
      
      this.initialized = true;
      this.logger.info(`Plugin registry initialized with ${this.registry.size} plugins`);
      
      // Start auto-update timer if enabled
      if (this.config.autoUpdate.enabled) {
        this.startAutoUpdateTimer();
      }
      
    } catch (error) {
      this.logger.error('Failed to initialize plugin registry', error);
      throw error;
    }
  }

  /**
   * Discover plugins from all configured sources
   */
  public async discoverAllPlugins(): Promise<PluginDiscoveryResult> {
    const startTime = Date.now();
    const allPlugins: DiscoveredPlugin[] = [];
    const allErrors: PluginDiscoveryError[] = [];

    try {
      // Discover from filesystem
      for (const pluginDir of this.config.pluginDirs) {
        try {
          const result = await this.discoverFromFilesystem(pluginDir);
          allPlugins.push(...result.plugins);
          allErrors.push(...result.errors);
        } catch (error) {
          allErrors.push({
            path: pluginDir,
            message: `Failed to scan directory: ${(error as Error).message}`,
            type: 'read_error'
          });
        }
      }

      // Discover from npm (if registry configured)
      if (this.config.npmRegistry) {
        try {
          const result = await this.discoverFromNpm();
          allPlugins.push(...result.plugins);
          allErrors.push(...result.errors);
        } catch (error) {
          allErrors.push({
            path: 'npm',
            message: `Failed to scan npm registry: ${(error as Error).message}`,
            type: 'read_error'
          });
        }
      }

      // Update registry with discovered plugins
      for (const plugin of allPlugins) {
        if (plugin.isValid) {
          await this.registerPlugin(plugin);
        }
      }

      const scanDuration = Date.now() - startTime;
      this.emit('discovery-completed', { 
        pluginCount: allPlugins.length, 
        errorCount: allErrors.length,
        duration: scanDuration
      });

      return {
        plugins: allPlugins,
        scanDuration,
        errors: allErrors
      };

    } catch (error) {
      this.logger.error('Plugin discovery failed', error);
      throw error;
    }
  }

  /**
   * Discover plugins from filesystem directory
   */
  public async discoverFromFilesystem(pluginDir: string): Promise<PluginDiscoveryResult> {
    const startTime = Date.now();
    const plugins: DiscoveredPlugin[] = [];
    const errors: PluginDiscoveryError[] = [];

    try {
      // Check if directory exists
      await fs.access(pluginDir);
      
      // Scan directory for plugin manifests
      const entries = await fs.readdir(pluginDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(pluginDir, entry.name);
          try {
            const plugin = await this.loadPluginFromDirectory(pluginPath);
            if (plugin) {
              plugins.push(plugin);
            }
          } catch (error) {
            errors.push({
              path: pluginPath,
              message: (error as Error).message,
              type: 'parse_error'
            });
          }
        }
      }

    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        errors.push({
          path: pluginDir,
          message: (error as Error).message,
          type: 'read_error'
        });
      }
    }

    return {
      plugins,
      scanDuration: Date.now() - startTime,
      errors
    };
  }

  /**
   * Discover plugins from npm registry
   */
  public async discoverFromNpm(): Promise<PluginDiscoveryResult> {
    const startTime = Date.now();
    const plugins: DiscoveredPlugin[] = [];
    const errors: PluginDiscoveryError[] = [];

    try {
      // Search for plugins with specific naming convention
      const searchQuery = 'claude-security-plugin';
      const searchResult = await this.searchNpmPackages(searchQuery);

      for (const packageInfo of searchResult) {
        try {
          const plugin = await this.loadPluginFromNpm(packageInfo);
          if (plugin) {
            plugins.push(plugin);
          }
        } catch (error) {
          errors.push({
            path: packageInfo.name,
            message: (error as Error).message,
            type: 'parse_error'
          });
        }
      }

    } catch (error) {
      errors.push({
        path: 'npm-search',
        message: (error as Error).message,
        type: 'read_error'
      });
    }

    return {
      plugins,
      scanDuration: Date.now() - startTime,
      errors
    };
  }

  /**
   * Register a discovered plugin
   */
  public async registerPlugin(discoveredPlugin: DiscoveredPlugin): Promise<void> {
    const { manifest, sourcePath, sourceType } = discoveredPlugin;
    
    try {
      // Generate plugin hash for integrity checking
      const hash = await this.generatePluginHash(sourcePath);
      
      const entry: RegistryEntry = {
        manifest,
        sourcePath,
        sourceType,
        registeredAt: this.registry.has(manifest.id) ? 
          this.registry.get(manifest.id)!.registeredAt : 
          new Date(),
        updatedAt: new Date(),
        hash,
        status: 'available'
      };

      this.registry.set(manifest.id, entry);
      
      this.logger.info(`Registered plugin: ${manifest.id} v${manifest.version}`);
      this.emit('plugin-registered', entry);
      
    } catch (error) {
      this.logger.error(`Failed to register plugin ${manifest.id}`, error);
      throw error;
    }
  }

  /**
   * Unregister a plugin
   */
  public async unregisterPlugin(pluginId: string): Promise<boolean> {
    if (!this.registry.has(pluginId)) {
      return false;
    }

    const entry = this.registry.get(pluginId)!;
    this.registry.delete(pluginId);
    
    this.logger.info(`Unregistered plugin: ${pluginId}`);
    this.emit('plugin-unregistered', entry);
    
    return true;
  }

  /**
   * Get plugin by ID
   */
  public getPlugin(pluginId: string): RegistryEntry | undefined {
    return this.registry.get(pluginId);
  }

  /**
   * Get all registered plugins
   */
  public getAllPlugins(): RegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * Search plugins by criteria
   */
  public searchPlugins(criteria: PluginSearchCriteria): RegistryEntry[] {
    return Array.from(this.registry.values()).filter(entry => {
      const { manifest } = entry;

      // Filter by category
      if (criteria.category && manifest.category !== criteria.category) {
        return false;
      }

      // Filter by type
      if (criteria.type && !manifest.types.includes(criteria.type)) {
        return false;
      }

      // Filter by author
      if (criteria.author && !manifest.author.name.toLowerCase().includes(criteria.author.toLowerCase())) {
        return false;
      }

      // Filter by tags
      if (criteria.tags && criteria.tags.length > 0) {
        const pluginTags = manifest.tags || [];
        if (!criteria.tags.some(tag => pluginTags.includes(tag))) {
          return false;
        }
      }

      // Filter by query (name/description)
      if (criteria.query) {
        const query = criteria.query.toLowerCase();
        const searchText = `${manifest.name} ${manifest.description}`.toLowerCase();
        if (!searchText.includes(query)) {
          return false;
        }
      }

      // Filter by version (simplified - just check if version matches pattern)
      if (criteria.version && !this.matchesVersionRange(manifest.version, criteria.version)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get plugins by category
   */
  public getPluginsByCategory(category: PluginCategory): RegistryEntry[] {
    return this.searchPlugins({ category });
  }

  /**
   * Get plugins by type
   */
  public getPluginsByType(type: PluginType): RegistryEntry[] {
    return this.searchPlugins({ type });
  }

  /**
   * Check if plugin is registered
   */
  public isPluginRegistered(pluginId: string): boolean {
    return this.registry.has(pluginId);
  }

  /**
   * Update plugin status
   */
  public updatePluginStatus(
    pluginId: string, 
    status: RegistryEntry['status'],
    installPath?: string
  ): boolean {
    const entry = this.registry.get(pluginId);
    if (!entry) {
      return false;
    }

    entry.status = status;
    entry.updatedAt = new Date();
    if (installPath) {
      entry.installPath = installPath;
    }

    this.emit('plugin-status-updated', { pluginId, status, installPath });
    return true;
  }

  /**
   * Export registry to JSON
   */
  public exportRegistry(): string {
    const registryData = Array.from(this.registry.entries()).map(([id, entry]) => ({
      id,
      ...entry,
      registeredAt: entry.registeredAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString()
    }));

    return JSON.stringify(registryData, null, 2);
  }

  /**
   * Import registry from JSON
   */
  public async importRegistry(data: string): Promise<void> {
    try {
      const registryData = JSON.parse(data);
      
      for (const item of registryData) {
        const entry: RegistryEntry = {
          ...item,
          registeredAt: new Date(item.registeredAt),
          updatedAt: new Date(item.updatedAt)
        };
        
        this.registry.set(item.id, entry);
      }
      
      this.logger.info(`Imported ${registryData.length} plugins to registry`);
      
    } catch (error) {
      this.logger.error('Failed to import registry', error);
      throw error;
    }
  }

  /**
   * Clear the registry
   */
  public clear(): void {
    this.registry.clear();
    this.emit('registry-cleared');
  }

  /**
   * Get registry statistics
   */
  public getStats(): {
    totalPlugins: number;
    byCategory: Record<string, number>;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    const entries = this.getAllPlugins();
    const stats = {
      totalPlugins: entries.length,
      byCategory: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byStatus: {} as Record<string, number>
    };

    for (const entry of entries) {
      // Count by category
      stats.byCategory[entry.manifest.category] = 
        (stats.byCategory[entry.manifest.category] || 0) + 1;

      // Count by types
      for (const type of entry.manifest.types) {
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      }

      // Count by status
      stats.byStatus[entry.status] = (stats.byStatus[entry.status] || 0) + 1;
    }

    return stats;
  }

  /**
   * Load plugin from directory
   */
  private async loadPluginFromDirectory(pluginPath: string): Promise<DiscoveredPlugin | null> {
    const manifestPath = path.join(pluginPath, 'package.json');
    
    try {
      const manifestData = await fs.readFile(manifestPath, 'utf-8');
      const packageJson = JSON.parse(manifestData);
      
      // Check if this is a Claude security plugin
      if (!this.isClaudeSecurityPlugin(packageJson)) {
        return null;
      }

      const manifest = this.extractManifestFromPackageJson(packageJson, pluginPath);
      const validationErrors = this.validateManifest(manifest);

      return {
        manifest,
        sourcePath: pluginPath,
        sourceType: 'filesystem',
        isValid: validationErrors.length === 0,
        validationErrors
      };

    } catch (error) {
      throw new Error(`Failed to load plugin from ${pluginPath}: ${(error as Error).message}`);
    }
  }

  /**
   * Load plugin from npm package info
   */
  private async loadPluginFromNpm(packageInfo: any): Promise<DiscoveredPlugin | null> {
    try {
      // Get package.json from npm
      const packageData = await this.fetchPackageData(packageInfo.name);
      
      if (!this.isClaudeSecurityPlugin(packageData)) {
        return null;
      }

      const manifest = this.extractManifestFromPackageJson(packageData, packageInfo.name);
      const validationErrors = this.validateManifest(manifest);

      return {
        manifest,
        sourcePath: packageInfo.name,
        sourceType: 'npm',
        isValid: validationErrors.length === 0,
        validationErrors
      };

    } catch (error) {
      throw new Error(`Failed to load npm plugin ${packageInfo.name}: ${(error as Error).message}`);
    }
  }

  /**
   * Check if package is a Claude security plugin
   */
  private isClaudeSecurityPlugin(packageJson: any): boolean {
    const keywords = packageJson.keywords || [];
    const name = packageJson.name || '';
    
    return keywords.includes('claude-security-plugin') || 
           name.startsWith('claude-security-plugin-');
  }

  /**
   * Extract plugin manifest from package.json
   */
  private extractManifestFromPackageJson(packageJson: any, sourcePath: string): PluginManifest {
    const claudePlugin = packageJson.claudePlugin || {};
    
    return {
      id: packageJson.name,
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description || '',
      author: {
        name: typeof packageJson.author === 'string' ? packageJson.author : packageJson.author?.name || 'Unknown',
        email: typeof packageJson.author === 'object' ? packageJson.author?.email : undefined,
        url: typeof packageJson.author === 'object' ? packageJson.author?.url : undefined
      },
      category: claudePlugin.category || 'utility',
      types: claudePlugin.types || ['utility'],
      apiVersion: claudePlugin.apiVersion || '1.0.0',
      dependencies: claudePlugin.dependencies || [],
      configSchema: claudePlugin.configSchema,
      permissions: claudePlugin.permissions || {},
      entryPoints: claudePlugin.entryPoints || { main: packageJson.main },
      tags: packageJson.keywords || [],
      engines: packageJson.engines,
      license: packageJson.license,
      repository: typeof packageJson.repository === 'string' ? 
        packageJson.repository : packageJson.repository?.url,
      homepage: packageJson.homepage
    };
  }

  /**
   * Validate plugin manifest
   */
  private validateManifest(manifest: PluginManifest): string[] {
    const errors: string[] = [];

    // Required fields
    if (!manifest.id) errors.push('Missing plugin ID');
    if (!manifest.name) errors.push('Missing plugin name');
    if (!manifest.version) errors.push('Missing plugin version');
    if (!manifest.apiVersion) errors.push('Missing API version');
    
    // Validate version format (simplified semver check)
    if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
      errors.push('Invalid version format');
    }

    // Validate category
    const validCategories = ['validation', 'templates', 'reporting', 'integration', 'utility', 'security'];
    if (!validCategories.includes(manifest.category)) {
      errors.push(`Invalid category: ${manifest.category}`);
    }

    // Validate types
    const validTypes = ['validation-rule', 'template-provider', 'reporter', 'integration', 'transformer', 'analyzer'];
    for (const type of manifest.types) {
      if (!validTypes.includes(type)) {
        errors.push(`Invalid type: ${type}`);
      }
    }

    return errors;
  }

  /**
   * Search npm packages
   */
  private async searchNpmPackages(query: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['search', '--json', query], { 
        stdio: ['pipe', 'pipe', 'pipe'] 
      });

      let stdout = '';
      let stderr = '';

      npm.stdout.on('data', (data) => {
        stdout += data;
      });

      npm.stderr.on('data', (data) => {
        stderr += data;
      });

      npm.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`npm search failed: ${stderr}`));
          return;
        }

        try {
          const results = JSON.parse(stdout);
          resolve(Array.isArray(results) ? results : []);
        } catch (error) {
          reject(new Error(`Failed to parse npm search results: ${(error as Error).message}`));
        }
      });

      npm.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Fetch package data from npm
   */
  private async fetchPackageData(packageName: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['view', packageName, '--json'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      npm.stdout.on('data', (data) => {
        stdout += data;
      });

      npm.stderr.on('data', (data) => {
        stderr += data;
      });

      npm.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to fetch package data: ${stderr}`));
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(new Error(`Failed to parse package data: ${(error as Error).message}`));
        }
      });

      npm.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Generate plugin hash for integrity checking
   */
  private async generatePluginHash(sourcePath: string): Promise<string> {
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256');
    
    if (await this.isDirectory(sourcePath)) {
      // Hash directory contents
      const files = await this.getAllFiles(sourcePath);
      for (const file of files.sort()) {
        const content = await fs.readFile(file);
        hash.update(file);
        hash.update(content);
      }
    } else {
      // Hash package name for npm packages
      hash.update(sourcePath);
    }
    
    return hash.digest('hex');
  }

  /**
   * Check if path is directory
   */
  private async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await fs.stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get all files in directory recursively
   */
  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Check if version matches range (simplified)
   */
  private matchesVersionRange(version: string, range: string): boolean {
    // Simplified version matching - in production, use semver library
    return version === range || range === '*';
  }

  /**
   * Load registry cache
   */
  private async loadRegistryCache(): Promise<void> {
    const cachePath = path.join(this.config.cacheDir, 'registry.json');
    
    try {
      const cacheData = await fs.readFile(cachePath, 'utf-8');
      await this.importRegistry(cacheData);
      this.logger.debug('Loaded plugin registry cache');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('Failed to load registry cache', error);
      }
    }
  }

  /**
   * Save registry cache
   */
  public async saveRegistryCache(): Promise<void> {
    const cachePath = path.join(this.config.cacheDir, 'registry.json');
    
    try {
      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, this.exportRegistry());
      this.logger.debug('Saved plugin registry cache');
    } catch (error) {
      this.logger.warn('Failed to save registry cache', error);
    }
  }

  /**
   * Start auto-update timer
   */
  private startAutoUpdateTimer(): void {
    setInterval(async () => {
      try {
        this.logger.debug('Running scheduled plugin discovery...');
        await this.discoverAllPlugins();
        await this.saveRegistryCache();
      } catch (error) {
        this.logger.error('Scheduled plugin discovery failed', error);
      }
    }, this.config.autoUpdate.interval);
  }

  /**
   * Cleanup registry resources
   */
  public async cleanup(): Promise<void> {
    await this.saveRegistryCache();
    this.removeAllListeners();
    this.logger.info('Plugin registry cleaned up');
  }
}