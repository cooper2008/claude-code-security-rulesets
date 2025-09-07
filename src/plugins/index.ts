/**
 * Plugin System Entry Point
 * Exports all components of the Claude Code Security Rulesets Plugin Architecture
 */

// =============================================================================
// Core Plugin Manager
// =============================================================================
export { 
  PluginManager, 
  createDefaultPluginManagerConfig,
  type PluginExecutionContext,
  type PluginExecutionResult,
  type PluginManagerInitOptions
} from './manager';

// =============================================================================
// Plugin Types and Interfaces
// =============================================================================
export {
  // Core interfaces
  type Plugin,
  type ValidationPlugin,
  type TemplatePlugin,
  type ReporterPlugin,
  type IntegrationPlugin,
  
  // Plugin lifecycle types
  type PluginManifest,
  type PluginInstance,
  type PluginContext,
  type PluginApis,
  type PluginState,
  type PluginMetrics,
  type PluginHealth,
  
  // Plugin API interfaces
  type PluginLogger,
  type PluginConfigApi,
  type PluginStorageApi,
  type PluginHttpApi,
  type PluginEventsApi,
  
  // Plugin result types
  type ValidationPluginResult,
  type ValidationPluginError,
  type ValidationPluginWarning,
  type ReportOutput,
  type IntegrationResult,
  
  // Plugin configuration types
  type PluginPermissions,
  type PluginManagerConfig,
  type PluginSecurityConfig,
  type SandboxConfig,
  
  // Plugin discovery types
  type PluginDiscoveryResult,
  type DiscoveredPlugin,
  type PluginSearchCriteria,
  
  // Plugin events
  type PluginEvent,
  type PluginEventType,
  type PluginEventHandler,
  
  // Enums
  type PluginCategory,
  type PluginType,
  type ReportFormat
} from './types';

// =============================================================================
// Plugin Registry
// =============================================================================
export {
  PluginRegistry,
  type RegistryEntry
} from './registry';

// =============================================================================
// Plugin Loader
// =============================================================================
export {
  PluginLoader,
  type PluginLoadOptions,
  type PluginLoadResult,
  type PluginSignatureResult
} from './loader';

// =============================================================================
// Plugin APIs
// =============================================================================
export {
  PluginApiFactory,
  PluginLoggerImpl,
  PluginConfigApiImpl,
  PluginStorageApiImpl,
  PluginHttpApiImpl,
  PluginEventsApiImpl,
  defaultApiFactory
} from './api';

// =============================================================================
// Plugin Sandbox
// =============================================================================
export {
  PluginSandbox,
  SandboxFactory,
  sandboxFactory,
  createDefaultSandboxConfig,
  type SandboxExecutionResult,
  type SandboxError,
  type SandboxMetrics,
  type SandboxExecutionOptions
} from './sandbox';

// =============================================================================
// Utility Functions
// =============================================================================

import { PluginManager, createDefaultPluginManagerConfig } from './manager';
import { PluginLoggerImpl } from './api';
import type { PluginManagerConfig, PluginManagerInitOptions } from './types';

/**
 * Create a new plugin manager instance with default configuration
 */
export function createPluginManager(
  config?: Partial<PluginManagerConfig>,
  initOptions?: PluginManagerInitOptions
): PluginManager {
  const defaultConfig = createDefaultPluginManagerConfig();
  const finalConfig = { ...defaultConfig, ...config };
  
  const manager = new PluginManager(finalConfig);
  
  // Auto-initialize if not explicitly disabled
  if (initOptions?.skipDiscovery !== false) {
    // Initialize in next tick to allow for event handlers to be set up
    process.nextTick(async () => {
      try {
        await manager.initialize(initOptions);
      } catch (error) {
        console.error('Failed to auto-initialize plugin manager:', error);
      }
    });
  }
  
  return manager;
}

/**
 * Create a plugin manager with minimal configuration for development/testing
 */
export function createTestPluginManager(
  pluginDirs: string[] = [],
  options: Partial<PluginManagerConfig> = {}
): PluginManager {
  const config: PluginManagerConfig = {
    pluginDirs,
    timeout: 5000, // Shorter timeout for tests
    maxConcurrentPlugins: 2,
    cacheDir: './test-plugin-cache',
    security: {
      enableSandbox: true,
      allowedPaths: ['./test-data'],
      allowedDomains: ['localhost', '127.0.0.1'],
      verifySignatures: false,
      trustedAuthors: [],
      maxMemoryUsage: 64, // Lower memory limit for tests
      maxExecutionTime: 5000
    },
    autoUpdate: {
      enabled: false,
      interval: 60000, // 1 minute for tests
      checkOnStart: false
    },
    ...options
  };

  return new PluginManager(config);
}

/**
 * Plugin development utilities
 */
export const PluginDevUtils = {
  /**
   * Create a minimal plugin manifest for development
   */
  createDevManifest: (id: string, overrides?: Partial<any>) => ({
    id,
    name: id,
    version: '0.1.0',
    description: `Development plugin: ${id}`,
    author: {
      name: 'Developer',
      email: 'dev@example.com'
    },
    category: 'utility' as const,
    types: ['validation-rule'] as const,
    apiVersion: '1.0.0',
    permissions: {
      filesystem: {
        read: ['./test-data'],
        write: ['./test-output']
      }
    },
    entryPoints: {
      main: 'index.js'
    },
    ...overrides
  }),

  /**
   * Create a test plugin context
   */
  createTestContext: (pluginId: string): any => ({
    workdir: `./test-plugins/${pluginId}`,
    datadir: `./test-plugins/${pluginId}/data`,
    cachedir: `./test-plugins/${pluginId}/cache`,
    tempdir: `./test-plugins/${pluginId}/temp`,
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version
    },
    apis: ['validation', 'templates']
  }),

  /**
   * Create a test logger that captures logs
   */
  createTestLogger: (pluginId: string) => {
    const logs: Array<{ level: string; message: string; args: unknown[] }> = [];
    
    const logger = new PluginLoggerImpl(pluginId, 'debug');
    
    // Override log methods to capture logs
    const originalMethods = ['debug', 'info', 'warn', 'error'] as const;
    originalMethods.forEach(level => {
      const original = logger[level].bind(logger);
      (logger as any)[level] = (message: string, ...args: unknown[]) => {
        logs.push({ level, message, args });
        original(message, ...args);
      };
    });

    return { logger, logs };
  }
};

// =============================================================================
// Plugin System Constants
// =============================================================================

export const PLUGIN_SYSTEM_VERSION = '1.0.0';

export const DEFAULT_PLUGIN_TIMEOUT = 30000; // 30 seconds

export const DEFAULT_MEMORY_LIMIT = 128; // 128 MB

export const SUPPORTED_PLUGIN_CATEGORIES = [
  'validation',
  'templates', 
  'reporting',
  'integration',
  'utility',
  'security'
] as const;

export const SUPPORTED_PLUGIN_TYPES = [
  'validation-rule',
  'template-provider',
  'reporter',
  'integration',
  'transformer',
  'analyzer'
] as const;

export const SUPPORTED_REPORT_FORMATS = [
  'json',
  'html',
  'pdf',
  'csv',
  'xml',
  'markdown'
] as const;

// =============================================================================
// Plugin System Events
// =============================================================================

export const PLUGIN_EVENTS = {
  // Manager events
  MANAGER_INITIALIZED: 'initialized',
  
  // Plugin lifecycle events
  PLUGIN_REGISTERED: 'plugin-registered',
  PLUGIN_UNREGISTERED: 'plugin-unregistered',
  PLUGIN_LOADED: 'plugin-loaded',
  PLUGIN_UNLOADED: 'plugin-unloaded',
  PLUGIN_ACTIVATED: 'plugin-activated',
  PLUGIN_DEACTIVATED: 'plugin-deactivated',
  PLUGIN_ERROR: 'plugin-error',
  
  // Discovery events
  DISCOVERY_STARTED: 'discovery-started',
  DISCOVERY_COMPLETED: 'discovery-completed',
  
  // Execution events
  VALIDATION_STARTED: 'validation-started',
  VALIDATION_COMPLETED: 'validation-completed',
  TEMPLATE_REQUESTED: 'template-requested',
  REPORT_GENERATED: 'report-generated',
  
  // Health events
  HEALTH_CHECK: 'health-check'
} as const;

// =============================================================================
// Default Export
// =============================================================================

/**
 * Default plugin manager instance (singleton pattern)
 * Can be used for simple scenarios where only one plugin manager is needed
 */
let defaultManager: PluginManager | null = null;

export function getDefaultPluginManager(
  config?: Partial<PluginManagerConfig>
): PluginManager {
  if (!defaultManager) {
    defaultManager = createPluginManager(config);
  }
  return defaultManager;
}

/**
 * Reset the default plugin manager (useful for testing)
 */
export async function resetDefaultPluginManager(): Promise<void> {
  if (defaultManager) {
    await defaultManager.cleanup();
    defaultManager = null;
  }
}

// Export everything as default object for convenience
export default {
  PluginManager,
  createPluginManager,
  createTestPluginManager,
  getDefaultPluginManager,
  resetDefaultPluginManager,
  PluginDevUtils,
  PLUGIN_SYSTEM_VERSION,
  DEFAULT_PLUGIN_TIMEOUT,
  DEFAULT_MEMORY_LIMIT,
  SUPPORTED_PLUGIN_CATEGORIES,
  SUPPORTED_PLUGIN_TYPES,
  SUPPORTED_REPORT_FORMATS,
  PLUGIN_EVENTS
};