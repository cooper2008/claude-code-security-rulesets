import {
  ExtendableTemplate,
  TemplateBuildContext,
  TemplatePluginContext,
  CustomValidationRule,
  TemplateValidationResult,
  TemplateLogger,
  TemplateValidator,
  TemplateStorage,
  TemplateUtils
} from './types';
import { ClaudeCodeConfiguration } from '../../types/index';
import { PluginSandbox, createSecureSandbox } from './sandbox';
import { EventEmitter } from 'events';

/**
 * Template plugin manifest
 */
export interface TemplatePluginManifest {
  /** Plugin unique identifier */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Plugin description */
  description: string;
  /** Plugin author */
  author: string;
  /** Plugin categories */
  categories: TemplatePluginCategory[];
  /** Plugin capabilities */
  capabilities: TemplatePluginCapability[];
  /** Required permissions */
  permissions: string[];
  /** Plugin dependencies */
  dependencies?: string[];
  /** Plugin configuration schema */
  configSchema?: Record<string, unknown>;
  /** Plugin metadata */
  metadata: {
    homepage?: string;
    repository?: string;
    license: string;
    keywords: string[];
  };
}

/**
 * Plugin categories
 */
export type TemplatePluginCategory = 
  | 'validation'
  | 'generation' 
  | 'transformation'
  | 'analysis'
  | 'reporting'
  | 'integration';

/**
 * Plugin capabilities
 */
export interface TemplatePluginCapability {
  /** Capability type */
  type: 'validate' | 'generate' | 'transform' | 'analyze' | 'report' | 'integrate';
  /** Capability name */
  name: string;
  /** Input types supported */
  inputs: string[];
  /** Output types produced */
  outputs: string[];
  /** Configuration options */
  options?: Record<string, unknown>;
}

/**
 * Template plugin instance
 */
export interface TemplatePluginInstance {
  /** Plugin manifest */
  manifest: TemplatePluginManifest;
  /** Plugin main function */
  main: TemplatePluginFunction;
  /** Plugin state */
  state: 'loading' | 'ready' | 'active' | 'error' | 'disabled';
  /** Plugin configuration */
  config: Record<string, unknown>;
  /** Plugin sandbox */
  sandbox: PluginSandbox;
  /** Plugin metrics */
  metrics: PluginMetrics;
  /** Last activity timestamp */
  lastActivity: Date;
}

/**
 * Plugin main function interface
 */
export interface TemplatePluginFunction {
  (context: TemplatePluginContext): Promise<PluginResult>;
}

/**
 * Plugin execution result
 */
export interface PluginResult {
  /** Execution success */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution metrics */
  metrics: {
    duration: number;
    memoryUsed: number;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Plugin metrics
 */
export interface PluginMetrics {
  /** Total executions */
  executions: number;
  /** Successful executions */
  successes: number;
  /** Failed executions */
  failures: number;
  /** Average execution time */
  avgExecutionTime: number;
  /** Total execution time */
  totalExecutionTime: number;
  /** Peak memory usage */
  peakMemoryUsage: number;
  /** Last execution time */
  lastExecutionTime?: Date;
}

/**
 * Plugin manager for template extensions
 */
export class TemplatePluginManager extends EventEmitter {
  private plugins: Map<string, TemplatePluginInstance> = new Map();
  private pluginOrder: Map<TemplatePluginCategory, string[]> = new Map();
  private pluginStorage: Map<string, TemplatePluginStorage> = new Map();
  private globalConfig: TemplatePluginManagerConfig;

  constructor(config: TemplatePluginManagerConfig = {}) {
    super();
    this.globalConfig = {
      sandboxTimeout: 10000,
      maxMemoryUsage: 128,
      allowParallelExecution: true,
      enableMetrics: true,
      maxPluginsPerCategory: 10,
      ...config
    };
  }

  /**
   * Register a template plugin
   */
  public async registerPlugin(
    manifest: TemplatePluginManifest,
    pluginCode: string,
    config: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      // Validate plugin manifest
      this.validateManifest(manifest);

      // Check if plugin already exists
      if (this.plugins.has(manifest.id)) {
        throw new Error(`Plugin already registered: ${manifest.id}`);
      }

      // Create sandbox for plugin
      const sandbox = createSecureSandbox(this.globalConfig.sandboxTimeout);

      // Validate plugin code
      const codeValidation = sandbox.validateCode(pluginCode);
      if (!codeValidation.isValid) {
        throw new Error(`Plugin code validation failed: ${codeValidation.issues.map(i => i.message).join(', ')}`);
      }

      // Create plugin instance
      const instance: TemplatePluginInstance = {
        manifest,
        main: await this.compilePluginFunction(pluginCode, sandbox),
        state: 'loading',
        config,
        sandbox,
        metrics: this.initializeMetrics(),
        lastActivity: new Date()
      };

      // Initialize plugin storage
      this.pluginStorage.set(manifest.id, new TemplatePluginStorage(manifest.id));

      // Test plugin initialization
      await this.testPluginInitialization(instance);

      // Register plugin
      this.plugins.set(manifest.id, instance);
      
      // Update category ordering
      this.updatePluginOrdering(manifest);

      instance.state = 'ready';
      this.emit('plugin-registered', { pluginId: manifest.id, manifest });

    } catch (error) {
      throw new Error(`Failed to register plugin ${manifest.id}: ${(error as Error).message}`);
    }
  }

  /**
   * Unregister a plugin
   */
  public async unregisterPlugin(pluginId: string): Promise<boolean> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      return false;
    }

    try {
      // Cleanup plugin resources
      instance.sandbox.cleanup();
      this.pluginStorage.delete(pluginId);

      // Remove from ordering
      for (const category of instance.manifest.categories) {
        const order = this.pluginOrder.get(category) || [];
        this.pluginOrder.set(category, order.filter(id => id !== pluginId));
      }

      // Remove plugin
      this.plugins.delete(pluginId);

      this.emit('plugin-unregistered', { pluginId });
      return true;

    } catch (error) {
      this.emit('plugin-error', { pluginId, error: (error as Error).message });
      return false;
    }
  }

  /**
   * Execute validation plugins
   */
  public async executeValidationPlugins(
    template: ExtendableTemplate,
    context: TemplateBuildContext,
    pluginIds?: string[]
  ): Promise<TemplateValidationResult> {
    const validationPlugins = this.getPluginsByCategory('validation', pluginIds);
    const errors: any[] = [];
    const warnings: any[] = [];
    const startTime = Date.now();

    for (const plugin of validationPlugins) {
      try {
        const result = await this.executePlugin(plugin, template, context);
        
        if (result.success && result.data) {
          const validationData = result.data as any;
          if (validationData.errors) {
            errors.push(...validationData.errors);
          }
          if (validationData.warnings) {
            warnings.push(...validationData.warnings);
          }
        }
      } catch (error) {
        errors.push({
          type: 'validation',
          message: `Plugin ${plugin.manifest.id} failed: ${(error as Error).message}`,
          severity: 'error'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      performance: {
        validationTime: Date.now() - startTime,
        rulesValidated: this.countRules(template.rules),
        customRulesValidated: validationPlugins.length
      }
    };
  }

  /**
   * Execute generation plugins
   */
  public async executeGenerationPlugins(
    template: ExtendableTemplate,
    context: TemplateBuildContext,
    pluginIds?: string[]
  ): Promise<ClaudeCodeConfiguration> {
    const generationPlugins = this.getPluginsByCategory('generation', pluginIds);
    let result = template.rules;

    for (const plugin of generationPlugins) {
      try {
        const pluginResult = await this.executePlugin(plugin, template, context);
        
        if (pluginResult.success && pluginResult.data) {
          const generatedConfig = pluginResult.data as ClaudeCodeConfiguration;
          result = this.mergeConfigurations(result, generatedConfig);
        }
      } catch (error) {
        this.emit('plugin-error', { 
          pluginId: plugin.manifest.id, 
          error: (error as Error).message 
        });
      }
    }

    return result;
  }

  /**
   * Execute transformation plugins
   */
  public async executeTransformationPlugins(
    template: ExtendableTemplate,
    context: TemplateBuildContext,
    pluginIds?: string[]
  ): Promise<ExtendableTemplate> {
    const transformationPlugins = this.getPluginsByCategory('transformation', pluginIds);
    let result = template;

    for (const plugin of transformationPlugins) {
      try {
        const pluginResult = await this.executePlugin(plugin, result, context);
        
        if (pluginResult.success && pluginResult.data) {
          result = pluginResult.data as ExtendableTemplate;
        }
      } catch (error) {
        this.emit('plugin-error', { 
          pluginId: plugin.manifest.id, 
          error: (error as Error).message 
        });
      }
    }

    return result;
  }

  /**
   * Get plugin by ID
   */
  public getPlugin(pluginId: string): TemplatePluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * List all plugins
   */
  public listPlugins(category?: TemplatePluginCategory): TemplatePluginInstance[] {
    const allPlugins = Array.from(this.plugins.values());
    
    if (category) {
      return allPlugins.filter(plugin => plugin.manifest.categories.includes(category));
    }
    
    return allPlugins;
  }

  /**
   * Get plugin metrics
   */
  public getPluginMetrics(pluginId: string): PluginMetrics | undefined {
    const plugin = this.plugins.get(pluginId);
    return plugin?.metrics;
  }

  /**
   * Get all plugin metrics
   */
  public getAllMetrics(): Record<string, PluginMetrics> {
    const metrics: Record<string, PluginMetrics> = {};
    
    for (const [id, plugin] of this.plugins.entries()) {
      metrics[id] = plugin.metrics;
    }
    
    return metrics;
  }

  /**
   * Enable/disable plugin
   */
  public setPluginState(pluginId: string, enabled: boolean): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    plugin.state = enabled ? 'ready' : 'disabled';
    this.emit('plugin-state-changed', { pluginId, enabled });
    return true;
  }

  /**
   * Update plugin configuration
   */
  public updatePluginConfig(
    pluginId: string, 
    config: Record<string, unknown>
  ): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    plugin.config = { ...plugin.config, ...config };
    this.emit('plugin-config-updated', { pluginId, config });
    return true;
  }

  /**
   * Cleanup all plugins
   */
  public async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.plugins.keys()).map(id => 
      this.unregisterPlugin(id)
    );

    await Promise.all(cleanupPromises);
    this.removeAllListeners();
  }

  /**
   * Execute a single plugin
   */
  private async executePlugin(
    plugin: TemplatePluginInstance,
    template: ExtendableTemplate,
    context: TemplateBuildContext
  ): Promise<PluginResult> {
    if (plugin.state !== 'ready' && plugin.state !== 'active') {
      throw new Error(`Plugin ${plugin.manifest.id} is not ready for execution`);
    }

    const startTime = Date.now();
    plugin.state = 'active';
    plugin.lastActivity = new Date();

    try {
      // Create plugin context
      const pluginContext: TemplatePluginContext = {
        template,
        buildContext: context,
        apis: {
          logger: new TemplateLoggerImpl(plugin.manifest.id),
          validator: new TemplateValidatorImpl(),
          storage: this.pluginStorage.get(plugin.manifest.id)!,
          utils: new TemplateUtilsImpl()
        },
        security: {
          sandboxed: true,
          permissions: plugin.manifest.permissions,
          restrictions: ['fs', 'net', 'child_process']
        }
      };

      // Execute plugin
      const result = await plugin.main(pluginContext);

      // Update metrics
      this.updatePluginMetrics(plugin, Date.now() - startTime, true);

      plugin.state = 'ready';
      return result;

    } catch (error) {
      this.updatePluginMetrics(plugin, Date.now() - startTime, false);
      plugin.state = 'error';
      
      throw error;
    }
  }

  /**
   * Validate plugin manifest
   */
  private validateManifest(manifest: TemplatePluginManifest): void {
    const required = ['id', 'name', 'version', 'description', 'author'];
    
    for (const field of required) {
      if (!(field in manifest) || !manifest[field as keyof TemplatePluginManifest]) {
        throw new Error(`Required field missing: ${field}`);
      }
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      throw new Error('Invalid version format, use semantic versioning');
    }

    // Validate categories
    if (!manifest.categories || manifest.categories.length === 0) {
      throw new Error('At least one category is required');
    }

    // Validate capabilities
    if (!manifest.capabilities || manifest.capabilities.length === 0) {
      throw new Error('At least one capability is required');
    }
  }

  /**
   * Compile plugin function from code
   */
  private async compilePluginFunction(
    code: string,
    sandbox: PluginSandbox
  ): Promise<TemplatePluginFunction> {
    const wrappedCode = `
      (function(context) {
        ${code}
        
        // Ensure the plugin returns a proper result
        if (typeof main === 'function') {
          return main(context);
        } else {
          throw new Error('Plugin must export a main function');
        }
      })
    `;

    const compiledFunction = await sandbox.execute<Function>(wrappedCode);
    
    if (!compiledFunction.success || typeof compiledFunction.result !== 'function') {
      throw new Error('Failed to compile plugin function');
    }

    return async (context: TemplatePluginContext) => {
      const result = await sandbox.execute<PluginResult>(
        `(${compiledFunction.result.toString()})(${JSON.stringify(context)})`
      );
      
      if (!result.success) {
        throw new Error(`Plugin execution failed: ${result.error}`);
      }
      
      return result.result!;
    };
  }

  /**
   * Test plugin initialization
   */
  private async testPluginInitialization(instance: TemplatePluginInstance): Promise<void> {
    // Create minimal test context
    const testTemplate: ExtendableTemplate = {
      id: 'test',
      name: 'Test Template',
      category: 'custom',
      rules: { deny: [], allow: [] },
      description: 'Test template',
      compliance: [],
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
      isBuiltIn: false,
      inheritance: {
        level: 'base',
        extensionType: 'inherit',
        chain: [],
        compatibility: {},
        permissions: {
          canOverrideRules: true,
          canAddRules: true,
          canRemoveRules: false,
          canModifyMetadata: true
        }
      },
      scope: {}
    };

    const testContext: TemplateBuildContext = {
      environment: 'test',
      parameters: {},
      availableTemplates: [testTemplate],
      metadata: {
        buildId: 'test',
        timestamp: new Date(),
        version: '1.0.0'
      }
    };

    // Test plugin execution
    const result = await this.executePlugin(instance, testTemplate, testContext);
    
    if (!result.success) {
      throw new Error(`Plugin initialization test failed: ${result.error}`);
    }
  }

  /**
   * Get plugins by category
   */
  private getPluginsByCategory(
    category: TemplatePluginCategory,
    pluginIds?: string[]
  ): TemplatePluginInstance[] {
    const orderedIds = this.pluginOrder.get(category) || [];
    const plugins: TemplatePluginInstance[] = [];

    for (const id of orderedIds) {
      const plugin = this.plugins.get(id);
      if (plugin && 
          (plugin.state === 'ready' || plugin.state === 'active') &&
          (!pluginIds || pluginIds.includes(id))) {
        plugins.push(plugin);
      }
    }

    return plugins;
  }

  /**
   * Update plugin ordering within categories
   */
  private updatePluginOrdering(manifest: TemplatePluginManifest): void {
    for (const category of manifest.categories) {
      const current = this.pluginOrder.get(category) || [];
      if (!current.includes(manifest.id)) {
        current.push(manifest.id);
        this.pluginOrder.set(category, current);
      }
    }
  }

  /**
   * Initialize plugin metrics
   */
  private initializeMetrics(): PluginMetrics {
    return {
      executions: 0,
      successes: 0,
      failures: 0,
      avgExecutionTime: 0,
      totalExecutionTime: 0,
      peakMemoryUsage: 0
    };
  }

  /**
   * Update plugin metrics
   */
  private updatePluginMetrics(
    plugin: TemplatePluginInstance,
    executionTime: number,
    success: boolean
  ): void {
    const metrics = plugin.metrics;
    
    metrics.executions++;
    metrics.totalExecutionTime += executionTime;
    metrics.avgExecutionTime = metrics.totalExecutionTime / metrics.executions;
    metrics.lastExecutionTime = new Date();
    
    if (success) {
      metrics.successes++;
    } else {
      metrics.failures++;
    }
    
    // Update peak memory usage from sandbox stats
    const sandboxStats = plugin.sandbox.getStats();
    metrics.peakMemoryUsage = Math.max(
      metrics.peakMemoryUsage, 
      sandboxStats.memoryStats.peakUsage
    );
  }

  /**
   * Merge two configurations
   */
  private mergeConfigurations(
    base: ClaudeCodeConfiguration,
    overlay: ClaudeCodeConfiguration
  ): ClaudeCodeConfiguration {
    return {
      ...base,
      permissions: {
        deny: [...(base.permissions?.deny || []), ...(overlay.permissions?.deny || [])],
        allow: [...(base.permissions?.allow || []), ...(overlay.permissions?.allow || [])],
        ask: [...(base.permissions?.ask || []), ...(overlay.permissions?.ask || [])]
      }
    };
  }

  /**
   * Count rules in configuration
   */
  private countRules(config: ClaudeCodeConfiguration): number {
    return (config.permissions?.deny?.length || 0) + (config.permissions?.allow?.length || 0);
  }
}

/**
 * Template plugin manager configuration
 */
export interface TemplatePluginManagerConfig {
  sandboxTimeout?: number;
  maxMemoryUsage?: number;
  allowParallelExecution?: boolean;
  enableMetrics?: boolean;
  maxPluginsPerCategory?: number;
}

/**
 * Template plugin storage implementation
 */
class TemplatePluginStorage implements TemplateStorage {
  private data: Map<string, unknown> = new Map();
  private pluginId: string;

  constructor(pluginId: string) {
    this.pluginId = pluginId;
  }

  async get(key: string): Promise<unknown> {
    return this.data.get(`${this.pluginId}:${key}`);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(`${this.pluginId}:${key}`, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(`${this.pluginId}:${key}`);
  }

  async list(prefix?: string): Promise<string[]> {
    const pluginPrefix = `${this.pluginId}:${prefix || ''}`;
    return Array.from(this.data.keys())
      .filter(key => key.startsWith(pluginPrefix))
      .map(key => key.replace(`${this.pluginId}:`, ''));
  }
}

/**
 * Template logger implementation
 */
class TemplateLoggerImpl implements TemplateLogger {
  private pluginId: string;

  constructor(pluginId: string) {
    this.pluginId = pluginId;
  }

  debug(message: string, data?: unknown): void {
    console.debug(`[${this.pluginId}] ${message}`, data);
  }

  info(message: string, data?: unknown): void {
    console.info(`[${this.pluginId}] ${message}`, data);
  }

  warn(message: string, data?: unknown): void {
    console.warn(`[${this.pluginId}] ${message}`, data);
  }

  error(message: string, error?: Error): void {
    console.error(`[${this.pluginId}] ${message}`, error);
  }
}

/**
 * Template validator implementation
 */
class TemplateValidatorImpl implements TemplateValidator {
  async validateRule(rule: unknown): Promise<boolean> {
    // Basic rule validation
    return typeof rule === 'string' || typeof rule === 'object';
  }

  async validateConfiguration(config: ClaudeCodeConfiguration): Promise<TemplateValidationResult> {
    // Simplified validation
    return {
      isValid: true,
      errors: [],
      warnings: [],
      performance: {
        validationTime: 0,
        rulesValidated: 0,
        customRulesValidated: 0
      }
    };
  }

  async validateExtension(): Promise<boolean> {
    return true;
  }
}

/**
 * Template utils implementation
 */
class TemplateUtilsImpl implements TemplateUtils {
  deepMerge(target: unknown, source: unknown): unknown {
    // Simplified deep merge
    if (typeof target === 'object' && typeof source === 'object') {
      return { ...target as object, ...source as object };
    }
    return source;
  }

  evaluateCondition(): boolean {
    return true;
  }

  generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  hashObject(obj: unknown): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64').slice(0, 16);
  }

  validateVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+/.test(version);
  }

  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    
    return 0;
  }
}