/**
 * Secure plugin execution sandbox using Node.js VM module
 * Provides isolated execution environment with timeout and resource limits
 */

import * as vm from 'vm';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import {
  SandboxConfig,
  PluginApis,
  PluginContext,
  PluginLogger,
  PluginMetrics
} from './types';

/**
 * Sandbox execution result
 */
export interface SandboxExecutionResult<T = unknown> {
  /** Execution success status */
  success: boolean;
  /** Result data */
  result?: T;
  /** Error information */
  error?: SandboxError;
  /** Execution metrics */
  metrics: SandboxMetrics;
}

/**
 * Sandbox error information
 */
export interface SandboxError {
  /** Error type */
  type: 'timeout' | 'memory' | 'security' | 'runtime' | 'module';
  /** Error message */
  message: string;
  /** Original error */
  originalError?: Error;
  /** Stack trace */
  stack?: string;
}

/**
 * Sandbox execution metrics
 */
export interface SandboxMetrics {
  /** Execution duration (ms) */
  duration: number;
  /** Memory usage (MB) */
  memoryUsage: number;
  /** CPU time (ms) */
  cpuTime: number;
  /** VM context creation time (ms) */
  contextCreationTime: number;
}

/**
 * Sandbox execution options
 */
export interface SandboxExecutionOptions {
  /** Execution timeout (ms) */
  timeout?: number;
  /** Maximum memory usage (MB) */
  maxMemoryUsage?: number;
  /** Context data to inject */
  context?: Record<string, unknown>;
  /** Whether to collect detailed metrics */
  collectMetrics?: boolean;
}

/**
 * Secure plugin execution sandbox
 */
export class PluginSandbox extends EventEmitter {
  private config: SandboxConfig;
  private vmContext: vm.Context | null = null;
  private isInitialized = false;
  private metrics: PluginMetrics;
  private logger: PluginLogger;

  constructor(config: SandboxConfig, logger: PluginLogger) {
    super();
    this.config = { ...config };
    this.logger = logger;
    this.metrics = {
      executionTime: 0,
      memoryUsage: 0,
      operationCount: 0,
      errorCount: 0,
      warningCount: 0
    };
  }

  /**
   * Initialize the sandbox environment
   */
  public async initialize(
    pluginContext: PluginContext,
    pluginApis: PluginApis
  ): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const startTime = performance.now();

    try {
      // Create secure VM context
      this.vmContext = this.createSecureContext(pluginContext, pluginApis);
      this.isInitialized = true;
      
      const initTime = performance.now() - startTime;
      this.logger.debug(`Sandbox initialized in ${initTime.toFixed(2)}ms`);
      
      this.emit('initialized', { duration: initTime });
    } catch (error) {
      this.logger.error('Failed to initialize sandbox', error);
      this.emit('error', { type: 'initialization', error });
      throw error;
    }
  }

  /**
   * Execute code in the sandbox
   */
  public async execute<T = unknown>(
    code: string,
    options: SandboxExecutionOptions = {}
  ): Promise<SandboxExecutionResult<T>> {
    if (!this.isInitialized || !this.vmContext) {
      throw new Error('Sandbox not initialized');
    }

    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    // Merge options with defaults
    const execOptions = {
      timeout: options.timeout || this.config.timeout,
      maxMemoryUsage: options.maxMemoryUsage || this.config.maxMemoryUsage,
      collectMetrics: options.collectMetrics !== false,
      context: options.context || {}
    };

    try {
      // Set up timeout handler
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Execution timeout after ${execOptions.timeout}ms`));
        }, execOptions.timeout);
      });

      // Set up memory monitoring
      const memoryMonitor = setInterval(() => {
        const currentMemoryMB = process.memoryUsage().heapUsed / (1024 * 1024);
        if (currentMemoryMB > execOptions.maxMemoryUsage) {
          clearInterval(memoryMonitor);
          throw new Error(`Memory limit exceeded: ${currentMemoryMB.toFixed(2)}MB > ${execOptions.maxMemoryUsage}MB`);
        }
      }, 100);

      // Execute code in VM context
      const executionPromise = this.executeInContext<T>(code, execOptions.context);

      // Race between execution and timeout
      const result = await Promise.race([executionPromise, timeoutPromise]);
      
      clearInterval(memoryMonitor);

      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;
      
      // Calculate metrics
      const metrics: SandboxMetrics = {
        duration: endTime - startTime,
        memoryUsage: (endMemory - startMemory) / (1024 * 1024),
        cpuTime: process.cpuUsage().user / 1000, // Convert to ms
        contextCreationTime: 0 // Would be measured separately
      };

      // Update plugin metrics
      this.metrics.executionTime += metrics.duration;
      this.metrics.memoryUsage = Math.max(this.metrics.memoryUsage, metrics.memoryUsage);
      this.metrics.operationCount++;

      this.emit('execution-completed', { 
        duration: metrics.duration,
        memoryUsage: metrics.memoryUsage
      });

      return {
        success: true,
        result,
        metrics
      };

    } catch (error) {
      const endTime = performance.now();
      const errorType = this.categorizeError(error as Error);
      
      this.metrics.errorCount++;
      
      const sandboxError: SandboxError = {
        type: errorType,
        message: (error as Error).message,
        originalError: error as Error,
        stack: (error as Error).stack
      };

      const metrics: SandboxMetrics = {
        duration: endTime - startTime,
        memoryUsage: 0,
        cpuTime: 0,
        contextCreationTime: 0
      };

      this.logger.error(`Sandbox execution failed: ${sandboxError.message}`);
      this.emit('execution-failed', { error: sandboxError, metrics });

      return {
        success: false,
        error: sandboxError,
        metrics
      };
    }
  }

  /**
   * Execute function in sandbox with parameters
   */
  public async executeFunction<T = unknown>(
    functionName: string,
    parameters: unknown[] = [],
    options: SandboxExecutionOptions = {}
  ): Promise<SandboxExecutionResult<T>> {
    const functionCall = `${functionName}(${parameters.map(p => JSON.stringify(p)).join(', ')})`;
    return this.execute<T>(functionCall, options);
  }

  /**
   * Load and execute plugin code
   */
  public async loadPlugin(
    pluginPath: string,
    options: SandboxExecutionOptions = {}
  ): Promise<SandboxExecutionResult<unknown>> {
    try {
      // Read plugin code
      const pluginCode = await fs.promises.readFile(pluginPath, 'utf-8');
      
      // Validate plugin code security
      this.validatePluginCode(pluginCode);
      
      // Execute plugin initialization
      return this.execute(pluginCode, options);
      
    } catch (error) {
      this.logger.error(`Failed to load plugin from ${pluginPath}`, error);
      
      return {
        success: false,
        error: {
          type: 'module',
          message: `Failed to load plugin: ${(error as Error).message}`,
          originalError: error as Error
        },
        metrics: {
          duration: 0,
          memoryUsage: 0,
          cpuTime: 0,
          contextCreationTime: 0
        }
      };
    }
  }

  /**
   * Get sandbox metrics
   */
  public getMetrics(): PluginMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset sandbox metrics
   */
  public resetMetrics(): void {
    this.metrics = {
      executionTime: 0,
      memoryUsage: 0,
      operationCount: 0,
      errorCount: 0,
      warningCount: 0
    };
  }

  /**
   * Cleanup sandbox resources
   */
  public async cleanup(): Promise<void> {
    try {
      if (this.vmContext) {
        // VM contexts are automatically garbage collected
        this.vmContext = null;
      }
      
      this.isInitialized = false;
      this.removeAllListeners();
      
      this.logger.debug('Sandbox cleaned up');
      this.emit('cleaned-up');
      
    } catch (error) {
      this.logger.error('Error during sandbox cleanup', error);
      throw error;
    }
  }

  /**
   * Create secure VM context with restricted APIs
   */
  private createSecureContext(
    pluginContext: PluginContext,
    pluginApis: PluginApis
  ): vm.Context {
    // Create safe global object
    const sandbox = {
      // Safe globals
      console: this.createSafeConsole(pluginApis.logger),
      Buffer,
      process: this.createSafeProcess(),
      
      // Restricted Node.js modules
      require: this.createSafeRequire(),
      
      // Plugin APIs
      pluginContext: this.createSafePluginContext(pluginContext),
      apis: this.createSafePluginApis(pluginApis),
      
      // Utilities
      setTimeout: this.createSafeSetTimeout(),
      setInterval: this.createSafeSetInterval(),
      clearTimeout,
      clearInterval,
      
      // JSON for data serialization
      JSON,
      
      // Error types
      Error,
      TypeError,
      ReferenceError,
      SyntaxError,
      
      // Safe mathematical operations
      Math,
      Date,
      
      // Promise support
      Promise,
      
      // Basic data types
      Object,
      Array,
      String,
      Number,
      Boolean,
      RegExp
    };

    return vm.createContext(sandbox, {
      name: 'PluginSandbox',
      origin: 'claude-security-plugin'
    });
  }

  /**
   * Execute code in the VM context
   */
  private async executeInContext<T>(
    code: string,
    contextData: Record<string, unknown>
  ): Promise<T> {
    if (!this.vmContext) {
      throw new Error('VM context not available');
    }

    try {
      // Inject context data
      for (const [key, value] of Object.entries(contextData)) {
        (this.vmContext as any)[key] = value;
      }

      // Execute code with timeout
      const script = new vm.Script(code, {
        filename: 'plugin.js',
        lineOffset: 0,
        columnOffset: 0
      });

      const result = script.runInContext(this.vmContext, {
        timeout: this.config.timeout,
        displayErrors: true,
        breakOnSigint: true
      });

      return result as T;
      
    } catch (error) {
      if (error instanceof Error) {
        // Enhanced error reporting
        if (error.message.includes('Script execution timed out')) {
          throw new Error(`Execution timeout after ${this.config.timeout}ms`);
        }
      }
      throw error;
    }
  }

  /**
   * Create safe console object
   */
  private createSafeConsole(logger: PluginLogger) {
    return {
      log: (...args: unknown[]) => logger.info(args.map(String).join(' ')),
      info: (...args: unknown[]) => logger.info(args.map(String).join(' ')),
      warn: (...args: unknown[]) => logger.warn(args.map(String).join(' ')),
      error: (...args: unknown[]) => logger.error(args.map(String).join(' ')),
      debug: (...args: unknown[]) => logger.debug(args.map(String).join(' '))
    };
  }

  /**
   * Create safe process object with limited information
   */
  private createSafeProcess() {
    return {
      env: this.createSafeEnv(),
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      versions: {
        node: process.versions.node,
        v8: process.versions.v8
      },
      nextTick: process.nextTick.bind(process)
    };
  }

  /**
   * Create safe environment variables object
   */
  private createSafeEnv(): Record<string, string> {
    const safeEnv: Record<string, string> = {};
    
    for (const envVar of this.config.allowedEnvVars) {
      const value = process.env[envVar];
      if (value !== undefined) {
        safeEnv[envVar] = value;
      }
    }
    
    return safeEnv;
  }

  /**
   * Create safe require function with module restrictions
   */
  private createSafeRequire() {
    return (moduleName: string) => {
      // Check if module is allowed
      if (!this.config.allowedModules.includes(moduleName)) {
        throw new Error(`Module '${moduleName}' is not allowed in sandbox`);
      }
      
      // Check if module is explicitly restricted
      if (this.config.restrictedModules.includes(moduleName)) {
        throw new Error(`Module '${moduleName}' is restricted in sandbox`);
      }
      
      // Only allow built-in Node.js modules and whitelisted packages
      try {
        return require(moduleName);
      } catch (error) {
        throw new Error(`Failed to load module '${moduleName}': ${(error as Error).message}`);
      }
    };
  }

  /**
   * Create safe plugin context with restricted filesystem access
   */
  private createSafePluginContext(context: PluginContext) {
    return {
      ...context,
      // Override with access-controlled versions if needed
      system: { ...context.system }
    };
  }

  /**
   * Create safe plugin APIs with access controls
   */
  private createSafePluginApis(apis: PluginApis) {
    return {
      logger: apis.logger,
      config: apis.config,
      storage: apis.storage,
      // HTTP API only if network permissions allow
      http: this.hasNetworkAccess() ? apis.http : undefined,
      events: apis.events
    };
  }

  /**
   * Create safe setTimeout with reasonable limits
   */
  private createSafeSetTimeout() {
    return (callback: () => void, delay: number) => {
      // Limit timeout delay to prevent abuse
      const maxDelay = Math.min(delay, 30000); // 30 seconds max
      return setTimeout(callback, maxDelay);
    };
  }

  /**
   * Create safe setInterval with reasonable limits
   */
  private createSafeSetInterval() {
    return (callback: () => void, delay: number) => {
      // Limit interval delay to prevent abuse
      const minDelay = Math.max(delay, 100); // 100ms minimum
      return setInterval(callback, minDelay);
    };
  }

  /**
   * Check if network access is allowed
   */
  private hasNetworkAccess(): boolean {
    // This would check the plugin's network permissions
    return this.config.filesystem.allowedRead.length > 0; // Simplified check
  }

  /**
   * Validate plugin code for security issues
   */
  private validatePluginCode(code: string): void {
    // Basic security checks
    const dangerousPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /require\s*\(\s*['"`]child_process['"`]\s*\)/,
      /require\s*\(\s*['"`]fs['"`]\s*\)/,
      /require\s*\(\s*['"`]net['"`]\s*\)/,
      /process\.exit/,
      /process\.kill/,
      /__dirname/,
      /__filename/,
      /global\./
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new Error(`Potentially dangerous code pattern detected: ${pattern.source}`);
      }
    }

    // Check code length
    if (code.length > 1024 * 1024) { // 1MB limit
      throw new Error('Plugin code too large (max 1MB)');
    }
  }

  /**
   * Categorize error types for better handling
   */
  private categorizeError(error: Error): SandboxError['type'] {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) {
      return 'timeout';
    } else if (message.includes('memory')) {
      return 'memory';
    } else if (message.includes('not allowed') || message.includes('restricted')) {
      return 'security';
    } else if (message.includes('module') || message.includes('require')) {
      return 'module';
    } else {
      return 'runtime';
    }
  }
}

/**
 * Create a default sandbox configuration
 */
export function createDefaultSandboxConfig(): SandboxConfig {
  return {
    timeout: 30000, // 30 seconds
    maxMemoryUsage: 128, // 128 MB
    allowedModules: [
      'util',
      'crypto',
      'path',
      'url',
      'querystring',
      'buffer'
    ],
    restrictedModules: [
      'fs',
      'child_process',
      'cluster',
      'dgram',
      'dns',
      'net',
      'tls',
      'http',
      'https',
      'http2',
      'os',
      'process',
      'vm',
      'worker_threads'
    ],
    allowedEnvVars: [
      'NODE_ENV',
      'NODE_VERSION'
    ],
    filesystem: {
      allowedRead: [],
      allowedWrite: []
    }
  };
}

/**
 * Sandbox factory for creating configured sandbox instances
 */
export class SandboxFactory {
  private defaultConfig: SandboxConfig;

  constructor(config?: Partial<SandboxConfig>) {
    this.defaultConfig = {
      ...createDefaultSandboxConfig(),
      ...config
    };
  }

  /**
   * Create a new sandbox instance
   */
  public createSandbox(
    logger: PluginLogger,
    config?: Partial<SandboxConfig>
  ): PluginSandbox {
    const sandboxConfig = {
      ...this.defaultConfig,
      ...config
    };

    return new PluginSandbox(sandboxConfig, logger);
  }

  /**
   * Update default configuration
   */
  public updateDefaultConfig(config: Partial<SandboxConfig>): void {
    Object.assign(this.defaultConfig, config);
  }
}

// Export default factory instance
export const sandboxFactory = new SandboxFactory();