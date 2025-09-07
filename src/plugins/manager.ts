/**
 * Plugin Manager - Central orchestration of the plugin system
 * Manages plugin lifecycle, discovery, loading, and execution
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  PluginManagerConfig,
  PluginInstance,
  PluginContext,
  PluginApis,
  PluginEvent,
  PluginEventHandler,
  PluginEventType,
  PluginLogger,
  ValidationPlugin,
  TemplatePlugin,
  ReporterPlugin,
  IntegrationPlugin,
  PluginHealth,
  PluginSecurityConfig
} from './types';
import { ClaudeCodeConfiguration, ValidationResult, SecurityTemplate } from '../types';
import { PluginRegistry } from './registry';
import { PluginLoader, PluginLoadOptions } from './loader';
import { PluginApiFactory, PluginLoggerImpl } from './api';
import { SandboxFactory } from './sandbox';

/**
 * Plugin execution context
 */
export interface PluginExecutionContext {
  /** Plugin ID */
  pluginId: string;
  /** Operation being performed */
  operation: string;
  /** Operation parameters */
  parameters: Record<string, unknown>;
  /** Request timeout */
  timeout?: number;
}

/**
 * Plugin execution result
 */
export interface PluginExecutionResult<T = unknown> {
  /** Execution success status */
  success: boolean;
  /** Result data */
  result?: T;
  /** Execution error */
  error?: string;
  /** Execution metrics */
  metrics: {
    duration: number;
    memoryUsed: number;
  };
  /** Plugin health after execution */
  health: PluginHealth;
}

/**
 * Plugin manager initialization options
 */
export interface PluginManagerInitOptions {
  /** Skip plugin discovery on init */
  skipDiscovery?: boolean;
  /** Skip loading default plugins */
  skipDefaultPlugins?: boolean;
  /** Custom plugin directories */
  pluginDirs?: string[];
  /** Custom security config */
  security?: Partial<PluginSecurityConfig>;
}

/**
 * Main plugin manager class
 */
export class PluginManager extends EventEmitter {
  private config: PluginManagerConfig;
  private registry: PluginRegistry;
  private loader: PluginLoader;
  private apiFactory: PluginApiFactory;
  private sandboxFactory: SandboxFactory;
  private logger: PluginLogger;
  private initialized = false;
  private eventHandlers: Map<PluginEventType, Set<PluginEventHandler>> = new Map();

  constructor(config: PluginManagerConfig) {
    super();
    this.config = this.validateAndNormalizeConfig(config);
    
    // Initialize logger
    this.logger = new PluginLoggerImpl('PluginManager');
    
    // Initialize components
    this.apiFactory = new PluginApiFactory(
      path.join(this.config.cacheDir, 'storage'),
      this
    );
    
    this.sandboxFactory = new SandboxFactory({
      timeout: this.config.timeout,
      maxMemoryUsage: this.config.security.maxMemoryUsage,
      allowedModules: ['util', 'crypto', 'path'],
      restrictedModules: ['fs', 'child_process', 'net', 'http'],
      allowedEnvVars: ['NODE_ENV'],
      filesystem: {
        allowedRead: this.config.security.allowedPaths,
        allowedWrite: this.config.security.allowedPaths
      }
    });

    this.registry = new PluginRegistry(this.config, this.logger);
    this.loader = new PluginLoader(
      this.config.security,
      this.sandboxFactory,
      this.logger
    );

    // Set up event forwarding
    this.setupEventForwarding();
  }

  /**
   * Initialize the plugin manager
   */
  public async initialize(options: PluginManagerInitOptions = {}): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info('Initializing plugin manager...');

      // Merge initialization options
      if (options.pluginDirs) {
        this.config.pluginDirs.push(...options.pluginDirs);
      }

      if (options.security) {
        Object.assign(this.config.security, options.security);
      }

      // Ensure cache directory exists
      await fs.mkdir(this.config.cacheDir, { recursive: true });

      // Initialize registry
      await this.registry.initialize();

      // Discover plugins if not skipped
      if (!options.skipDiscovery) {
        this.logger.info('Discovering plugins...');
        const discoveryResult = await this.registry.discoverAllPlugins();
        this.logger.info(
          `Found ${discoveryResult.plugins.length} plugins ` +
          `(${discoveryResult.errors.length} errors)`
        );
      }

      // Load default plugins if not skipped
      if (!options.skipDefaultPlugins) {
        await this.loadDefaultPlugins();
      }

      this.initialized = true;
      this.logger.info('Plugin manager initialized successfully');
      this.emit('initialized');

    } catch (error) {
      this.logger.error('Failed to initialize plugin manager', error);
      throw error;
    }
  }

  /**
   * Load a plugin by ID
   */
  public async loadPlugin(
    pluginId: string,
    options: PluginLoadOptions = {}
  ): Promise<PluginExecutionResult<PluginInstance>> {
    const startTime = Date.now();
    let memoryStart = 0;

    try {
      this.ensureInitialized();
      memoryStart = process.memoryUsage().heapUsed;

      this.logger.info(`Loading plugin: ${pluginId}`);

      // Get plugin from registry
      const registryEntry = this.registry.getPlugin(pluginId);
      if (!registryEntry) {
        throw new Error(`Plugin not found in registry: ${pluginId}`);
      }

      // Check if plugin is already loaded
      if (this.loader.isPluginLoaded(pluginId)) {
        const instance = this.loader.getLoadedPlugin(pluginId)!;
        return {
          success: true,
          result: instance,
          metrics: {
            duration: Date.now() - startTime,
            memoryUsed: (process.memoryUsage().heapUsed - memoryStart) / (1024 * 1024)
          },
          health: await this.getPluginHealth(pluginId)
        };
      }

      // Create plugin context
      const context = await this.createPluginContext(pluginId);
      
      // Create plugin APIs
      const apis = this.createPluginApis(pluginId, registryEntry.manifest.permissions);

      // Load the plugin
      const loadResult = await this.loader.loadPlugin(
        registryEntry,
        context,
        apis,
        options
      );

      if (!loadResult.success) {
        throw new Error(`Plugin loading failed: ${loadResult.errors.join(', ')}`);
      }

      const instance = loadResult.instance!;
      
      // Activate the plugin
      await this.activatePlugin(instance);

      const duration = Date.now() - startTime;
      const memoryUsed = (process.memoryUsage().heapUsed - memoryStart) / (1024 * 1024);

      this.logger.info(`Plugin loaded: ${pluginId} (${duration}ms, ${memoryUsed.toFixed(2)}MB)`);

      return {
        success: true,
        result: instance,
        metrics: { duration, memoryUsed },
        health: await this.getPluginHealth(pluginId)
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const memoryUsed = (process.memoryUsage().heapUsed - memoryStart) / (1024 * 1024);
      
      this.logger.error(`Failed to load plugin ${pluginId}`, error);
      
      return {
        success: false,
        error: (error as Error).message,
        metrics: { duration, memoryUsed },
        health: { status: 'unhealthy', message: (error as Error).message, timestamp: new Date() }
      };
    }
  }

  /**
   * Unload a plugin by ID
   */
  public async unloadPlugin(pluginId: string): Promise<boolean> {
    try {
      this.ensureInitialized();
      
      const success = await this.loader.unloadPlugin(pluginId);
      if (success) {
        this.logger.info(`Plugin unloaded: ${pluginId}`);
        this.emit('plugin-unloaded', { pluginId });
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Failed to unload plugin ${pluginId}`, error);
      return false;
    }
  }

  /**
   * Execute validation using validation plugins
   */
  public async executeValidation(
    config: ClaudeCodeConfiguration,
    pluginIds?: string[]
  ): Promise<ValidationResult[]> {
    this.ensureInitialized();

    const validationPlugins = this.getPluginsByType<ValidationPlugin>('validation-rule', pluginIds);
    const results: ValidationResult[] = [];

    for (const plugin of validationPlugins) {
      try {
        this.logger.debug(`Running validation with plugin: ${plugin.manifest.id}`);
        
        const context = {
          filePath: undefined,
          options: {},
          data: {}
        };

        const pluginResult = await plugin.validate(config, context);
        
        // Convert plugin result to ValidationResult format
        const validationResult: ValidationResult = {
          isValid: pluginResult.isValid,
          errors: pluginResult.errors.map(error => ({
            type: 'SECURITY_VIOLATION' as const,
            message: error.message,
            severity: error.severity,
            location: error.location ? {
              path: error.location.path,
              line: error.location.line,
              column: error.location.column
            } : undefined
          })),
          warnings: pluginResult.warnings.map(warning => ({
            type: 'BEST_PRACTICE_VIOLATION' as const,
            message: warning.message,
            location: warning.location ? {
              path: warning.location.path,
              line: warning.location.line,
              column: warning.location.column
            } : undefined
          })),
          conflicts: [],
          performance: {
            validationTime: pluginResult.performance.duration,
            rulesProcessed: 0,
            performanceTarget: { target: 100, achieved: pluginResult.performance.duration < 100 }
          },
          suggestions: []
        };

        results.push(validationResult);

      } catch (error) {
        this.logger.error(`Validation plugin ${plugin.manifest.id} failed`, error);
        
        // Create error result
        results.push({
          isValid: false,
          errors: [{
            type: 'SECURITY_VIOLATION',
            message: `Plugin ${plugin.manifest.id} failed: ${(error as Error).message}`,
            severity: 'critical'
          }],
          warnings: [],
          conflicts: [],
          performance: {
            validationTime: 0,
            rulesProcessed: 0,
            performanceTarget: { target: 100, achieved: false }
          },
          suggestions: []
        });
      }
    }

    return results;
  }

  /**
   * Get templates from template plugins
   */
  public async getTemplates(pluginIds?: string[]): Promise<SecurityTemplate[]> {
    this.ensureInitialized();

    const templatePlugins = this.getPluginsByType<TemplatePlugin>('template-provider', pluginIds);
    const templates: SecurityTemplate[] = [];

    for (const plugin of templatePlugins) {
      try {
        this.logger.debug(`Getting templates from plugin: ${plugin.manifest.id}`);
        const pluginTemplates = await plugin.getTemplates();
        templates.push(...pluginTemplates);
      } catch (error) {
        this.logger.error(`Template plugin ${plugin.manifest.id} failed`, error);
      }
    }

    return templates;
  }

  /**
   * Generate reports using reporter plugins
   */
  public async generateReports(
    validationResult: ValidationResult,
    formats: string[] = ['json'],
    pluginIds?: string[]
  ): Promise<Array<{ format: string; content: string | Buffer; pluginId: string }>> {
    this.ensureInitialized();

    const reporterPlugins = this.getPluginsByType<ReporterPlugin>('reporter', pluginIds);
    const reports: Array<{ format: string; content: string | Buffer; pluginId: string }> = [];

    for (const plugin of reporterPlugins) {
      try {
        const supportedFormats = plugin.getSupportedFormats();
        
        for (const format of formats) {
          if (supportedFormats.includes(format as any)) {
            this.logger.debug(`Generating ${format} report with plugin: ${plugin.manifest.id}`);
            
            const reportOutput = await plugin.generateReport(validationResult, {
              format: format as any,
              options: {}
            });

            reports.push({
              format,
              content: reportOutput.content,
              pluginId: plugin.manifest.id
            });
          }
        }
      } catch (error) {
        this.logger.error(`Reporter plugin ${plugin.manifest.id} failed`, error);
      }
    }

    return reports;
  }

  /**
   * Execute integration with external systems
   */
  public async executeIntegration(
    config: ClaudeCodeConfiguration,
    target: string,
    parameters: Record<string, unknown> = {},
    pluginIds?: string[]
  ): Promise<any[]> {
    this.ensureInitialized();

    const integrationPlugins = this.getPluginsByType<IntegrationPlugin>('integration', pluginIds);
    const results: any[] = [];

    for (const plugin of integrationPlugins) {
      try {
        const capabilities = plugin.getCapabilities();
        const hasTarget = capabilities.some(cap => cap.id === target);
        
        if (hasTarget) {
          this.logger.debug(`Executing integration ${target} with plugin: ${plugin.manifest.id}`);
          
          const result = await plugin.integrate(config, {
            target,
            parameters,
            credentials: parameters.credentials as Record<string, unknown>
          });

          results.push({
            pluginId: plugin.manifest.id,
            result
          });
        }
      } catch (error) {
        this.logger.error(`Integration plugin ${plugin.manifest.id} failed`, error);
      }
    }

    return results;
  }

  /**
   * Get plugin health status
   */
  public async getPluginHealth(pluginId: string): Promise<PluginHealth> {
    const instance = this.loader.getLoadedPlugin(pluginId);
    if (!instance) {
      return {
        status: 'unhealthy',
        message: 'Plugin not loaded',
        timestamp: new Date()
      };
    }

    try {
      // Call plugin's getHealth method if it exists
      if (typeof (instance.apis as any).getHealth === 'function') {
        return await (instance.apis as any).getHealth();
      }

      // Default health check based on plugin state
      return {
        status: instance.state === 'active' ? 'healthy' : 
               instance.state === 'error' ? 'unhealthy' : 'degraded',
        message: `Plugin state: ${instance.state}`,
        details: {
          state: instance.state,
          loadedAt: instance.loadedAt,
          lastActivityAt: instance.lastActivityAt,
          metrics: instance.metrics
        },
        timestamp: new Date()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Health check failed: ${(error as Error).message}`,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get all loaded plugins health
   */
  public async getAllPluginsHealth(): Promise<Record<string, PluginHealth>> {
    const health: Record<string, PluginHealth> = {};
    const loadedPlugins = this.loader.getAllLoadedPlugins();

    for (const instance of loadedPlugins) {
      health[instance.manifest.id] = await this.getPluginHealth(instance.manifest.id);
    }

    return health;
  }

  /**
   * Register event handler
   */
  public on(eventType: PluginEventType, handler: PluginEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
    super.on(eventType, handler);
  }

  /**
   * Unregister event handler
   */
  public off(eventType: PluginEventType, handler: PluginEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
    super.off(eventType, handler);
  }

  /**
   * Get plugin manager statistics
   */
  public getStats(): {
    registry: ReturnType<PluginRegistry['getStats']>;
    loader: ReturnType<PluginLoader['getStats']>;
    manager: {
      initialized: boolean;
      totalEventHandlers: number;
      configuredPluginDirs: number;
      cacheDir: string;
    };
  } {
    return {
      registry: this.registry.getStats(),
      loader: this.loader.getStats(),
      manager: {
        initialized: this.initialized,
        totalEventHandlers: Array.from(this.eventHandlers.values())
          .reduce((sum, handlers) => sum + handlers.size, 0),
        configuredPluginDirs: this.config.pluginDirs.length,
        cacheDir: this.config.cacheDir
      }
    };
  }

  /**
   * Cleanup plugin manager resources
   */
  public async cleanup(): Promise<void> {
    try {
      this.logger.info('Cleaning up plugin manager...');

      // Cleanup loader (which will unload all plugins)
      await this.loader.cleanup();

      // Cleanup registry
      await this.registry.cleanup();

      // Clear event handlers
      this.eventHandlers.clear();
      this.removeAllListeners();

      this.initialized = false;
      this.logger.info('Plugin manager cleanup completed');

    } catch (error) {
      this.logger.error('Error during plugin manager cleanup', error);
      throw error;
    }
  }

  /**
   * Ensure plugin manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Plugin manager not initialized. Call initialize() first.');
    }
  }

  /**
   * Validate and normalize configuration
   */
  private validateAndNormalizeConfig(config: PluginManagerConfig): PluginManagerConfig {
    // Set defaults
    const normalized = {
      pluginDirs: config.pluginDirs || [],
      npmRegistry: config.npmRegistry,
      timeout: config.timeout || 30000,
      maxConcurrentPlugins: config.maxConcurrentPlugins || 10,
      cacheDir: config.cacheDir || path.join(process.cwd(), '.plugin-cache'),
      security: {
        enableSandbox: true,
        allowedPaths: [],
        allowedDomains: [],
        verifySignatures: false,
        trustedAuthors: [],
        maxMemoryUsage: 128,
        maxExecutionTime: 30000,
        ...config.security
      },
      autoUpdate: {
        enabled: false,
        interval: 3600000, // 1 hour
        checkOnStart: true,
        ...config.autoUpdate
      }
    };

    // Validate required fields
    if (!normalized.pluginDirs.length && !normalized.npmRegistry) {
      throw new Error('At least one plugin directory or npm registry must be configured');
    }

    if (normalized.timeout < 1000) {
      throw new Error('Timeout must be at least 1000ms');
    }

    if (normalized.maxConcurrentPlugins < 1) {
      throw new Error('Max concurrent plugins must be at least 1');
    }

    return normalized;
  }

  /**
   * Create plugin context
   */
  private async createPluginContext(pluginId: string): Promise<PluginContext> {
    const baseDir = path.join(this.config.cacheDir, 'plugins', pluginId);
    
    // Ensure directories exist
    await fs.mkdir(path.join(baseDir, 'data'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'cache'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'temp'), { recursive: true });

    return {
      workdir: baseDir,
      datadir: path.join(baseDir, 'data'),
      cachedir: path.join(baseDir, 'cache'),
      tempdir: path.join(baseDir, 'temp'),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      },
      apis: ['validation', 'templates'] // Available host APIs
    };
  }

  /**
   * Create plugin APIs
   */
  private createPluginApis(pluginId: string, permissions: any): PluginApis {
    return this.apiFactory.createPluginApis(pluginId, permissions);
  }

  /**
   * Activate plugin
   */
  private async activatePlugin(instance: PluginInstance): Promise<void> {
    try {
      instance.state = 'initializing';
      
      // Call plugin activate method if it exists
      if (typeof (instance.apis as any).activate === 'function') {
        await (instance.apis as any).activate();
      }
      
      instance.state = 'active';
      instance.lastActivityAt = new Date();
      
      this.emit('plugin-activated', { pluginId: instance.manifest.id });
      
    } catch (error) {
      instance.state = 'error';
      throw error;
    }
  }

  /**
   * Get plugins by type
   */
  private getPluginsByType<T extends object>(
    type: string,
    pluginIds?: string[]
  ): T[] {
    const loadedPlugins = this.loader.getAllLoadedPlugins();
    
    return loadedPlugins
      .filter(instance => {
        // Filter by type
        if (!instance.manifest.types.includes(type as any)) {
          return false;
        }
        
        // Filter by plugin IDs if specified
        if (pluginIds && !pluginIds.includes(instance.manifest.id)) {
          return false;
        }
        
        // Only include active plugins
        return instance.state === 'active';
      })
      .map(instance => instance.apis as T);
  }

  /**
   * Load default plugins
   */
  private async loadDefaultPlugins(): Promise<void> {
    // This would load any built-in or default plugins
    // For now, just log that we would load defaults
    this.logger.debug('Loading default plugins (none configured)');
  }

  /**
   * Set up event forwarding between components
   */
  private setupEventForwarding(): void {
    // Forward registry events
    this.registry.on('plugin-registered', (entry) => {
      this.emit('plugin-registered', { pluginId: entry.manifest.id, entry });
    });

    this.registry.on('plugin-unregistered', (entry) => {
      this.emit('plugin-unregistered', { pluginId: entry.manifest.id, entry });
    });

    // Forward loader events
    this.loader.on('plugin-loaded', (data) => {
      this.emit('plugin-loaded', data);
    });

    this.loader.on('plugin-unloaded', (data) => {
      this.emit('plugin-unloaded', data);
    });
  }
}

/**
 * Create default plugin manager configuration
 */
export function createDefaultPluginManagerConfig(): PluginManagerConfig {
  return {
    pluginDirs: [
      path.join(process.cwd(), 'plugins'),
      path.join(process.cwd(), 'node_modules')
    ],
    timeout: 30000,
    maxConcurrentPlugins: 5,
    cacheDir: path.join(process.cwd(), '.plugin-cache'),
    security: {
      enableSandbox: true,
      allowedPaths: [
        path.join(process.cwd(), 'data'),
        path.join(process.cwd(), 'temp')
      ],
      allowedDomains: [],
      verifySignatures: false,
      trustedAuthors: [],
      maxMemoryUsage: 128,
      maxExecutionTime: 30000
    },
    autoUpdate: {
      enabled: false,
      interval: 3600000,
      checkOnStart: true
    }
  };
}