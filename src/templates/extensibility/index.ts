/**
 * Claude Code Security Rulesets Generator - Template Extensibility System
 * 
 * This module provides a comprehensive extensibility system for creating, extending,
 * and managing security templates with inheritance, composition, and plugin support.
 * 
 * Core Features:
 * - Template inheritance chain (base → organization → team → project)
 * - Custom rule addition without template modification
 * - Plugin system for custom validation and generation logic
 * - Template composition and merging
 * - Version compatibility checking
 * - Safe sandboxing for custom code execution
 */

// Core types
export * from './types';

// Template inheritance system
export { TemplateInheritanceEngine } from './inheritance';

// Template composition and merging
export { TemplateComposer, CompositionError } from './composition';

// Template validation
export { TemplateValidator } from './validation';

// Safe plugin execution
export { 
  PluginSandbox, 
  createSandbox, 
  createSecureSandbox,
  type SandboxConfig,
  type SandboxResult,
  type CodeValidationResult
} from './sandbox';

// Plugin system
export {
  TemplatePluginManager,
  type TemplatePluginManifest,
  type TemplatePluginInstance,
  type TemplatePluginCategory,
  type PluginResult
} from './plugins';

// Custom template builder
export {
  CustomTemplateBuilder,
  type TemplateBuilderConfig,
  type ProjectAnalysis,
  type TemplateGuidance
} from './custom-builder';

// Extension manager
export {
  TemplateExtensionManager,
  type ExtensionRegistryEntry,
  type ExtensionLifecycleState,
  type ExtensionDeploymentConfig,
  type MarketplaceEntry
} from './extension-manager';

/**
 * Main extensibility system class that orchestrates all components
 */
export class TemplateExtensibilitySystem {
  private inheritanceEngine: TemplateInheritanceEngine;
  private composer: TemplateComposer;
  private validator: TemplateValidator;
  private pluginManager: TemplatePluginManager;
  private extensionManager: TemplateExtensionManager;
  private templateBuilder: CustomTemplateBuilder;
  
  private initialized = false;

  constructor(config: ExtensibilitySystemConfig = {}) {
    const defaultConfig: Required<ExtensibilitySystemConfig> = {
      storageRoot: './templates-extensibility',
      enableMarketplace: false,
      enablePlugins: true,
      sandboxTimeout: 10000,
      maxMemoryUsage: 128,
      autoApproval: false,
      enableMetrics: true,
      ...config
    };

    // Initialize core components
    this.inheritanceEngine = new TemplateInheritanceEngine();
    this.composer = new TemplateComposer();
    this.validator = new TemplateValidator();
    
    this.pluginManager = new TemplatePluginManager({
      sandboxTimeout: defaultConfig.sandboxTimeout,
      maxMemoryUsage: defaultConfig.maxMemoryUsage,
      enableMetrics: defaultConfig.enableMetrics
    });
    
    this.extensionManager = new TemplateExtensionManager({
      storageRoot: defaultConfig.storageRoot,
      enableMarketplace: defaultConfig.enableMarketplace,
      autoApproval: defaultConfig.autoApproval,
      enableMetrics: defaultConfig.enableMetrics
    });
    
    this.templateBuilder = new CustomTemplateBuilder();
  }

  /**
   * Initialize the extensibility system
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize extension manager
    await this.extensionManager.initialize();
    
    this.initialized = true;
  }

  /**
   * Get the inheritance engine
   */
  public getInheritanceEngine(): TemplateInheritanceEngine {
    this.ensureInitialized();
    return this.inheritanceEngine;
  }

  /**
   * Get the template composer
   */
  public getComposer(): TemplateComposer {
    this.ensureInitialized();
    return this.composer;
  }

  /**
   * Get the template validator
   */
  public getValidator(): TemplateValidator {
    this.ensureInitialized();
    return this.validator;
  }

  /**
   * Get the plugin manager
   */
  public getPluginManager(): TemplatePluginManager {
    this.ensureInitialized();
    return this.pluginManager;
  }

  /**
   * Get the extension manager
   */
  public getExtensionManager(): TemplateExtensionManager {
    this.ensureInitialized();
    return this.extensionManager;
  }

  /**
   * Get the template builder
   */
  public getTemplateBuilder(): CustomTemplateBuilder {
    this.ensureInitialized();
    return this.templateBuilder;
  }

  /**
   * Get system health status
   */
  public async getSystemHealth(): Promise<SystemHealth> {
    this.ensureInitialized();
    
    const pluginHealth = await this.pluginManager.getAllMetrics();
    const extensionStats = this.extensionManager.listExtensions();
    const validatorStats = this.validator.getStats();

    return {
      status: 'healthy',
      components: {
        plugins: {
          status: 'healthy',
          count: Object.keys(pluginHealth).length,
          metrics: pluginHealth
        },
        extensions: {
          status: 'healthy',
          count: extensionStats.length,
          byState: this.groupExtensionsByState(extensionStats)
        },
        validator: {
          status: 'healthy',
          stats: validatorStats
        }
      },
      timestamp: new Date()
    };
  }

  /**
   * Cleanup system resources
   */
  public async cleanup(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    await Promise.all([
      this.pluginManager.cleanup(),
      this.extensionManager.cleanup()
    ]);

    this.validator.clearCache();
    this.initialized = false;
  }

  /**
   * Ensure system is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ExtensibilitySystem not initialized. Call initialize() first.');
    }
  }

  /**
   * Group extensions by state for health reporting
   */
  private groupExtensionsByState(extensions: ExtensionRegistryEntry[]): Record<string, number> {
    const grouping: Record<string, number> = {};
    
    for (const extension of extensions) {
      grouping[extension.state] = (grouping[extension.state] || 0) + 1;
    }
    
    return grouping;
  }
}

/**
 * Extensibility system configuration
 */
export interface ExtensibilitySystemConfig {
  /** Storage root directory */
  storageRoot?: string;
  /** Enable marketplace features */
  enableMarketplace?: boolean;
  /** Enable plugin system */
  enablePlugins?: boolean;
  /** Sandbox timeout for plugin execution */
  sandboxTimeout?: number;
  /** Maximum memory usage for plugins */
  maxMemoryUsage?: number;
  /** Auto-approve extension state transitions */
  autoApproval?: boolean;
  /** Enable metrics collection */
  enableMetrics?: boolean;
}

/**
 * System health status
 */
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    plugins: ComponentHealth;
    extensions: ComponentHealth;
    validator: ComponentHealth;
  };
  timestamp: Date;
}

/**
 * Component health status
 */
export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  [key: string]: unknown;
}

/**
 * Create and initialize a new extensibility system
 */
export async function createExtensibilitySystem(
  config?: ExtensibilitySystemConfig
): Promise<TemplateExtensibilitySystem> {
  const system = new TemplateExtensibilitySystem(config);
  await system.initialize();
  return system;
}

/**
 * Default export - the main extensibility system class
 */
export default TemplateExtensibilitySystem;