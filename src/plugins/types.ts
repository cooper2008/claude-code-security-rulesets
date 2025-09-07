/**
 * Plugin system type definitions for Claude Code Security Rulesets Generator
 * Provides secure, extensible plugin architecture with sandboxed execution
 */

import { ClaudeCodeConfiguration, ValidationResult, SecurityTemplate } from '../types';

// =============================================================================
// Core Plugin Types
// =============================================================================

/**
 * Plugin metadata and configuration
 */
export interface PluginManifest {
  /** Plugin unique identifier */
  id: string;
  /** Plugin display name */
  name: string;
  /** Plugin version (semver) */
  version: string;
  /** Plugin description */
  description: string;
  /** Plugin author information */
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  /** Plugin category */
  category: PluginCategory;
  /** Supported plugin types */
  types: PluginType[];
  /** Required plugin API version */
  apiVersion: string;
  /** Plugin dependencies */
  dependencies?: PluginDependency[];
  /** Plugin configuration schema */
  configSchema?: Record<string, unknown>;
  /** Security permissions required */
  permissions: PluginPermissions;
  /** Plugin entry points */
  entryPoints: PluginEntryPoints;
  /** Plugin tags for discovery */
  tags?: string[];
  /** Minimum Node.js version required */
  engines?: {
    node: string;
  };
  /** Plugin license */
  license?: string;
  /** Plugin repository URL */
  repository?: string;
  /** Plugin homepage URL */
  homepage?: string;
}

/**
 * Plugin entry points for different functionality
 */
export interface PluginEntryPoints {
  /** Main plugin entry point */
  main?: string;
  /** Validation rules entry point */
  validation?: string;
  /** Template provider entry point */
  templates?: string;
  /** Reporter entry point */
  reporter?: string;
  /** Integration entry point */
  integration?: string;
}

/**
 * Plugin dependency specification
 */
export interface PluginDependency {
  /** Dependency plugin ID */
  pluginId: string;
  /** Required version range */
  version: string;
  /** Whether dependency is optional */
  optional?: boolean;
}

/**
 * Plugin security permissions
 */
export interface PluginPermissions {
  /** File system access */
  filesystem?: {
    /** Read access to directories */
    read?: string[];
    /** Write access to directories */
    write?: string[];
  };
  /** Network access */
  network?: {
    /** Allowed domains for outbound requests */
    domains?: string[];
    /** Maximum requests per minute */
    rateLimit?: number;
  };
  /** Environment variables access */
  env?: string[];
  /** System commands access */
  exec?: boolean;
  /** Native modules access */
  native?: boolean;
}

/**
 * Plugin categories for organization
 */
export type PluginCategory = 
  | 'validation'
  | 'templates'
  | 'reporting'
  | 'integration'
  | 'utility'
  | 'security';

/**
 * Plugin types for functionality
 */
export type PluginType = 
  | 'validation-rule'
  | 'template-provider'
  | 'reporter'
  | 'integration'
  | 'transformer'
  | 'analyzer';

// =============================================================================
// Plugin Lifecycle Types
// =============================================================================

/**
 * Plugin instance with lifecycle management
 */
export interface PluginInstance {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Plugin state */
  state: PluginState;
  /** Plugin configuration */
  config?: PluginConfig;
  /** Plugin context */
  context: PluginContext;
  /** Plugin APIs */
  apis: PluginApis;
  /** Load timestamp */
  loadedAt: Date;
  /** Last activity timestamp */
  lastActivityAt?: Date;
  /** Plugin metrics */
  metrics: PluginMetrics;
}

/**
 * Plugin state enumeration
 */
export type PluginState = 
  | 'unloaded'
  | 'loading'
  | 'loaded'
  | 'initializing'
  | 'active'
  | 'error'
  | 'disabled'
  | 'unloading';

/**
 * Plugin configuration
 */
export interface PluginConfig {
  /** Plugin-specific configuration */
  [key: string]: unknown;
}

/**
 * Plugin execution context
 */
export interface PluginContext {
  /** Plugin working directory */
  workdir: string;
  /** Plugin data directory */
  datadir: string;
  /** Plugin cache directory */
  cachedir: string;
  /** Plugin temporary directory */
  tempdir: string;
  /** Host system information */
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  /** Available host APIs */
  apis: HostApi[];
}

/**
 * Plugin APIs available to plugins
 */
export interface PluginApis {
  /** Logging API */
  logger: PluginLogger;
  /** Configuration API */
  config: PluginConfigApi;
  /** Storage API */
  storage: PluginStorageApi;
  /** HTTP client API */
  http?: PluginHttpApi;
  /** Events API */
  events: PluginEventsApi;
}

/**
 * Plugin performance metrics
 */
export interface PluginMetrics {
  /** Total execution time (ms) */
  executionTime: number;
  /** Memory usage (MB) */
  memoryUsage: number;
  /** Number of operations performed */
  operationCount: number;
  /** Error count */
  errorCount: number;
  /** Warning count */
  warningCount: number;
  /** Last execution time */
  lastExecutionTime?: number;
}

// =============================================================================
// Plugin API Interfaces
// =============================================================================

/**
 * Plugin logger interface
 */
export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Plugin configuration API
 */
export interface PluginConfigApi {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  delete(key: string): void;
  getAll(): Record<string, unknown>;
  validate(schema: Record<string, unknown>): boolean;
}

/**
 * Plugin storage API
 */
export interface PluginStorageApi {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

/**
 * Plugin HTTP client API
 */
export interface PluginHttpApi {
  get(url: string, options?: HttpOptions): Promise<HttpResponse>;
  post(url: string, data?: unknown, options?: HttpOptions): Promise<HttpResponse>;
  put(url: string, data?: unknown, options?: HttpOptions): Promise<HttpResponse>;
  delete(url: string, options?: HttpOptions): Promise<HttpResponse>;
}

/**
 * Plugin events API
 */
export interface PluginEventsApi {
  emit(event: string, data?: unknown): void;
  on(event: string, handler: (data?: unknown) => void): void;
  off(event: string, handler: (data?: unknown) => void): void;
  once(event: string, handler: (data?: unknown) => void): void;
}

/**
 * HTTP request options
 */
export interface HttpOptions {
  headers?: Record<string, string>;
  timeout?: number;
  maxRedirects?: number;
}

/**
 * HTTP response interface
 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
}

/**
 * Host API enumeration
 */
export type HostApi = 
  | 'filesystem'
  | 'network'
  | 'process'
  | 'crypto'
  | 'validation'
  | 'templates';

// =============================================================================
// Plugin Implementation Interfaces
// =============================================================================

/**
 * Base plugin interface that all plugins must implement
 */
export interface Plugin {
  /** Plugin manifest */
  readonly manifest: PluginManifest;
  
  /** Initialize plugin */
  initialize(context: PluginContext, apis: PluginApis): Promise<void>;
  
  /** Activate plugin */
  activate(): Promise<void>;
  
  /** Deactivate plugin */
  deactivate(): Promise<void>;
  
  /** Cleanup plugin resources */
  cleanup(): Promise<void>;
  
  /** Get plugin health status */
  getHealth(): PluginHealth;
}

/**
 * Plugin health status
 */
export interface PluginHealth {
  /** Health status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Health message */
  message?: string;
  /** Detailed health information */
  details?: Record<string, unknown>;
  /** Last health check timestamp */
  timestamp: Date;
}

/**
 * Validation plugin interface
 */
export interface ValidationPlugin extends Plugin {
  /** Validate configuration */
  validate(
    config: ClaudeCodeConfiguration,
    context: ValidationContext
  ): Promise<ValidationPluginResult>;
  
  /** Get supported validation rules */
  getSupportedRules(): ValidationRuleInfo[];
}

/**
 * Template provider plugin interface
 */
export interface TemplatePlugin extends Plugin {
  /** Get available templates */
  getTemplates(): Promise<SecurityTemplate[]>;
  
  /** Get specific template by ID */
  getTemplate(id: string): Promise<SecurityTemplate | undefined>;
  
  /** Generate template with parameters */
  generateTemplate(
    templateId: string, 
    parameters: Record<string, unknown>
  ): Promise<SecurityTemplate>;
}

/**
 * Reporter plugin interface
 */
export interface ReporterPlugin extends Plugin {
  /** Generate report */
  generateReport(
    result: ValidationResult,
    options: ReportOptions
  ): Promise<ReportOutput>;
  
  /** Get supported report formats */
  getSupportedFormats(): ReportFormat[];
}

/**
 * Integration plugin interface
 */
export interface IntegrationPlugin extends Plugin {
  /** Integrate with external system */
  integrate(
    config: ClaudeCodeConfiguration,
    options: IntegrationOptions
  ): Promise<IntegrationResult>;
  
  /** Get integration capabilities */
  getCapabilities(): IntegrationCapability[];
}

// =============================================================================
// Plugin Result Types
// =============================================================================

/**
 * Validation plugin result
 */
export interface ValidationPluginResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validation errors */
  errors: ValidationPluginError[];
  /** Validation warnings */
  warnings: ValidationPluginWarning[];
  /** Performance metrics */
  performance: {
    duration: number;
    memoryUsed: number;
  };
}

/**
 * Validation plugin error
 */
export interface ValidationPluginError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Error severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Error location */
  location?: {
    path: string;
    line?: number;
    column?: number;
  };
}

/**
 * Validation plugin warning
 */
export interface ValidationPluginWarning {
  /** Warning code */
  code: string;
  /** Warning message */
  message: string;
  /** Warning location */
  location?: {
    path: string;
    line?: number;
    column?: number;
  };
}

/**
 * Validation rule information
 */
export interface ValidationRuleInfo {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Rule description */
  description: string;
  /** Rule category */
  category: string;
  /** Rule severity */
  defaultSeverity: 'critical' | 'high' | 'medium' | 'low';
  /** Rule configuration schema */
  configSchema?: Record<string, unknown>;
}

/**
 * Validation context
 */
export interface ValidationContext {
  /** Configuration file path */
  filePath?: string;
  /** Validation options */
  options: Record<string, unknown>;
  /** Additional context data */
  data?: Record<string, unknown>;
}

/**
 * Report output
 */
export interface ReportOutput {
  /** Report format */
  format: ReportFormat;
  /** Report content */
  content: string | Buffer;
  /** Report metadata */
  metadata: {
    generatedAt: Date;
    generator: string;
    version: string;
  };
}

/**
 * Report format enumeration
 */
export type ReportFormat = 
  | 'json'
  | 'html'
  | 'pdf'
  | 'csv'
  | 'xml'
  | 'markdown';

/**
 * Report options
 */
export interface ReportOptions {
  /** Output format */
  format: ReportFormat;
  /** Report template */
  template?: string;
  /** Custom options */
  options?: Record<string, unknown>;
}

/**
 * Integration result
 */
export interface IntegrationResult {
  /** Integration success status */
  success: boolean;
  /** Result message */
  message: string;
  /** Result data */
  data?: unknown;
  /** Integration metadata */
  metadata: {
    integratedAt: Date;
    integrator: string;
    version: string;
  };
}

/**
 * Integration options
 */
export interface IntegrationOptions {
  /** Target system */
  target: string;
  /** Integration parameters */
  parameters: Record<string, unknown>;
  /** Authentication credentials */
  credentials?: Record<string, unknown>;
}

/**
 * Integration capability
 */
export interface IntegrationCapability {
  /** Capability identifier */
  id: string;
  /** Capability name */
  name: string;
  /** Capability description */
  description: string;
  /** Supported operations */
  operations: string[];
}

// =============================================================================
// Plugin Manager Types
// =============================================================================

/**
 * Plugin manager configuration
 */
export interface PluginManagerConfig {
  /** Plugin directories to scan */
  pluginDirs: string[];
  /** NPM registry URL for plugin discovery */
  npmRegistry?: string;
  /** Plugin timeout (ms) */
  timeout: number;
  /** Maximum concurrent plugins */
  maxConcurrentPlugins: number;
  /** Plugin cache directory */
  cacheDir: string;
  /** Security settings */
  security: PluginSecurityConfig;
  /** Auto-update settings */
  autoUpdate: {
    enabled: boolean;
    interval: number; // ms
    checkOnStart: boolean;
  };
}

/**
 * Plugin security configuration
 */
export interface PluginSecurityConfig {
  /** Enable sandboxed execution */
  enableSandbox: boolean;
  /** Allowed filesystem paths */
  allowedPaths: string[];
  /** Allowed network domains */
  allowedDomains: string[];
  /** Enable signature verification */
  verifySignatures: boolean;
  /** Trusted plugin authors */
  trustedAuthors: string[];
  /** Maximum memory usage per plugin (MB) */
  maxMemoryUsage: number;
  /** Maximum execution time per operation (ms) */
  maxExecutionTime: number;
}

/**
 * Plugin discovery result
 */
export interface PluginDiscoveryResult {
  /** Found plugins */
  plugins: DiscoveredPlugin[];
  /** Scan duration */
  scanDuration: number;
  /** Scan errors */
  errors: PluginDiscoveryError[];
}

/**
 * Discovered plugin information
 */
export interface DiscoveredPlugin {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Plugin source path */
  sourcePath: string;
  /** Plugin source type */
  sourceType: 'filesystem' | 'npm' | 'git';
  /** Plugin validity */
  isValid: boolean;
  /** Validation errors */
  validationErrors: string[];
}

/**
 * Plugin discovery error
 */
export interface PluginDiscoveryError {
  /** Error path */
  path: string;
  /** Error message */
  message: string;
  /** Error type */
  type: 'read_error' | 'parse_error' | 'validation_error';
}

/**
 * Plugin execution sandbox configuration
 */
export interface SandboxConfig {
  /** VM context timeout (ms) */
  timeout: number;
  /** Maximum memory usage (MB) */
  maxMemoryUsage: number;
  /** Allowed Node.js modules */
  allowedModules: string[];
  /** Restricted Node.js modules */
  restrictedModules: string[];
  /** Environment variables to expose */
  allowedEnvVars: string[];
  /** Filesystem access restrictions */
  filesystem: {
    allowedRead: string[];
    allowedWrite: string[];
  };
}

// =============================================================================
// Plugin Events
// =============================================================================

/**
 * Plugin event types
 */
export type PluginEventType = 
  | 'plugin-loading'
  | 'plugin-loaded'
  | 'plugin-unloading'
  | 'plugin-unloaded'
  | 'plugin-error'
  | 'plugin-activated'
  | 'plugin-deactivated'
  | 'validation-started'
  | 'validation-completed'
  | 'template-requested'
  | 'report-generated';

/**
 * Plugin event data
 */
export interface PluginEvent {
  /** Event type */
  type: PluginEventType;
  /** Event timestamp */
  timestamp: Date;
  /** Plugin ID */
  pluginId: string;
  /** Event data */
  data?: unknown;
  /** Error information (if applicable) */
  error?: Error;
}

/**
 * Plugin event handler
 */
export type PluginEventHandler = (event: PluginEvent) => void;

// =============================================================================
// Export Types
// =============================================================================

export {
  // Core interfaces
  Plugin,
  ValidationPlugin,
  TemplatePlugin,
  ReporterPlugin,
  IntegrationPlugin
};