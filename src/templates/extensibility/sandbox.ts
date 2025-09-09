// NOTE: vm2 removed due to security vulnerability (GHSA-cchq-frgv-rjh5, GHSA-g644-9gfx-q4q4)
// Sandbox functionality temporarily disabled until secure alternative is implemented
import { performance } from 'perf_hooks';

// Temporary stub to replace vm2 functionality
class DisabledVM {
  constructor(config: any) {
    // VM disabled due to security vulnerability
  }
  
  run(code: string): never {
    throw new Error('Sandbox functionality disabled due to vm2 security vulnerability. Use alternative execution environment.');
  }
  
  freeze(value: any, key: string): void {
    // No-op implementation
  }
}

const VM = DisabledVM;

/**
 * Sandbox configuration for safe plugin execution
 */
export interface SandboxConfig {
  /** Execution timeout in milliseconds */
  timeout: number;
  /** Maximum memory usage in MB */
  maxMemoryUsage?: number;
  /** Allowed Node.js modules */
  allowedModules: string[];
  /** Restricted Node.js modules */
  restrictedModules: string[];
  /** Allowed environment variables */
  allowedEnvVars?: string[];
  /** Filesystem restrictions */
  filesystem?: {
    allowedRead?: string[];
    allowedWrite?: string[];
  };
}

/**
 * Sandbox execution result
 */
export interface SandboxResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  metrics: {
    executionTime: number;
    memoryUsed: number;
    peakMemory: number;
  };
}

/**
 * Safe plugin execution sandbox using VM2
 */
export class PluginSandbox {
  private vm: VM;
  private config: SandboxConfig;
  private memoryTracker: MemoryTracker;
  private startTime: number = 0;

  constructor(config: SandboxConfig) {
    this.config = config;
    this.memoryTracker = new MemoryTracker(config.maxMemoryUsage || 128);
    
    // Create VM with security restrictions
    this.vm = new VM({
      timeout: config.timeout,
      sandbox: this.createSandboxContext(),
      require: {
        external: {
          modules: config.allowedModules,
          transitive: false
        },
        builtin: this.filterBuiltinModules(config.allowedModules, config.restrictedModules),
        root: './',
        mock: this.createModuleMocks()
      },
      wasm: false,
      eval: false,
      fixAsync: true
    });
  }

  /**
   * Execute code in sandbox
   */
  public async execute<T = unknown>(code: string, context: Record<string, unknown> = {}): Promise<SandboxResult<T>> {
    this.startTime = performance.now();
    const initialMemory = process.memoryUsage().heapUsed;

    try {
      // Start memory tracking
      this.memoryTracker.start();

      // Inject context into sandbox
      this.injectContext(context);

      // Execute the code
      const result = await this.vm.run(code);

      // Stop memory tracking
      const memoryStats = this.memoryTracker.stop();

      const executionTime = performance.now() - this.startTime;
      const memoryUsed = (process.memoryUsage().heapUsed - initialMemory) / (1024 * 1024);

      return {
        success: true,
        result,
        metrics: {
          executionTime,
          memoryUsed,
          peakMemory: memoryStats.peakUsage
        }
      };

    } catch (error) {
      this.memoryTracker.stop();
      const executionTime = performance.now() - this.startTime;
      const memoryUsed = (process.memoryUsage().heapUsed - initialMemory) / (1024 * 1024);

      return {
        success: false,
        error: (error as Error).message,
        metrics: {
          executionTime,
          memoryUsed,
          peakMemory: this.memoryTracker.getPeakUsage()
        }
      };
    }
  }

  /**
   * Execute function with arguments
   */
  public async executeFunction<T = unknown>(
    functionCode: string,
    args: unknown[] = [],
    context: Record<string, unknown> = {}
  ): Promise<SandboxResult<T>> {
    const wrappedCode = `
      (function() {
        const fn = ${functionCode};
        const args = ${JSON.stringify(args)};
        return fn.apply(null, args);
      })();
    `;

    return this.execute<T>(wrappedCode, context);
  }

  /**
   * Validate code before execution
   */
  public validateCode(code: string): CodeValidationResult {
    const issues: CodeValidationIssue[] = [];

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /require\s*\(\s*['"][^'"]*process['"]/, message: 'Direct process access not allowed' },
      { pattern: /require\s*\(\s*['"][^'"]*fs['"]/, message: 'Filesystem access not allowed' },
      { pattern: /require\s*\(\s*['"][^'"]*child_process['"]/, message: 'Child process access not allowed' },
      { pattern: /require\s*\(\s*['"][^'"]*net['"]/, message: 'Network access not allowed' },
      { pattern: /require\s*\(\s*['"][^'"]*http['"]/, message: 'HTTP access not allowed' },
      { pattern: /eval\s*\(/, message: 'eval() is not allowed' },
      { pattern: /Function\s*\(/, message: 'Function constructor is not allowed' },
      { pattern: /global\s*\./, message: 'Global object access is restricted' },
      { pattern: /process\s*\./, message: 'Process object access is restricted' },
      { pattern: /__filename/, message: '__filename is not available' },
      { pattern: /__dirname/, message: '__dirname is not available' }
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(code)) {
        issues.push({
          type: 'security',
          severity: 'high',
          message,
          pattern: pattern.toString()
        });
      }
    }

    // Check for performance concerns
    if (code.includes('while(true)') || code.includes('for(;;)')) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: 'Potential infinite loop detected',
        pattern: 'infinite_loop'
      });
    }

    // Check for large objects/arrays
    if (code.includes('Array(') && /Array\(\s*\d{6,}\s*\)/.test(code)) {
      issues.push({
        type: 'performance',
        severity: 'high',
        message: 'Large array allocation detected',
        pattern: 'large_allocation'
      });
    }

    return {
      isValid: !issues.some(issue => issue.severity === 'high'),
      issues,
      hasSecurityIssues: issues.some(issue => issue.type === 'security'),
      hasPerformanceIssues: issues.some(issue => issue.type === 'performance')
    };
  }

  /**
   * Get sandbox statistics
   */
  public getStats(): SandboxStats {
    return {
      config: { ...this.config },
      memoryStats: this.memoryTracker.getStats(),
      isActive: this.memoryTracker.isActive()
    };
  }

  /**
   * Cleanup sandbox resources
   */
  public cleanup(): void {
    this.memoryTracker.cleanup();
    // VM2 cleanup is automatic
  }

  /**
   * Create sandbox context with safe APIs
   */
  private createSandboxContext(): Record<string, unknown> {
    const safeConsole = {
      log: (...args: unknown[]) => console.log('[SANDBOX]', ...args),
      warn: (...args: unknown[]) => console.warn('[SANDBOX]', ...args),
      error: (...args: unknown[]) => console.error('[SANDBOX]', ...args),
      info: (...args: unknown[]) => console.info('[SANDBOX]', ...args),
      debug: (...args: unknown[]) => console.debug('[SANDBOX]', ...args)
    };

    const safeUtils = {
      deepClone: (obj: unknown) => JSON.parse(JSON.stringify(obj)),
      typeOf: (value: unknown) => typeof value,
      isArray: Array.isArray,
      hasProperty: (obj: unknown, prop: string) => 
        obj !== null && obj !== undefined && typeof obj === 'object' && prop in (obj as object)
    };

    const safeMath = {
      ...Math,
      // Override potentially dangerous methods
      random: () => 0.5 // Deterministic for testing
    };

    return {
      console: safeConsole,
      Math: safeMath,
      JSON,
      Date,
      RegExp,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Error,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      utils: safeUtils,
      Buffer: undefined, // Disable Buffer
      global: undefined,
      process: undefined,
      require: undefined
    };
  }

  /**
   * Inject context variables into sandbox
   */
  private injectContext(context: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(context)) {
      if (this.isSafeValue(value)) {
        this.vm.freeze(this.deepClone(value), key);
      }
    }
  }

  /**
   * Filter builtin modules based on allowed/restricted lists
   */
  private filterBuiltinModules(allowed: string[], restricted: string[]): string[] {
    const defaultBuiltins = ['util', 'crypto', 'path'];
    const safeBuiltins = defaultBuiltins.filter(module => 
      allowed.includes(module) && !restricted.includes(module)
    );
    
    return safeBuiltins;
  }

  /**
   * Create mocks for dangerous modules
   */
  private createModuleMocks(): Record<string, unknown> {
    return {
      fs: {
        readFileSync: () => { throw new Error('Filesystem access not allowed'); },
        writeFileSync: () => { throw new Error('Filesystem access not allowed'); },
        existsSync: () => false
      },
      child_process: {
        exec: () => { throw new Error('Child process execution not allowed'); },
        spawn: () => { throw new Error('Child process execution not allowed'); }
      },
      net: {
        createServer: () => { throw new Error('Network operations not allowed'); },
        connect: () => { throw new Error('Network operations not allowed'); }
      },
      http: {
        request: () => { throw new Error('HTTP requests not allowed'); },
        get: () => { throw new Error('HTTP requests not allowed'); }
      }
    };
  }

  /**
   * Check if value is safe to inject
   */
  private isSafeValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return true;
    
    if (Array.isArray(value)) {
      return value.every(item => this.isSafeValue(item));
    }
    
    if (typeof value === 'object') {
      // Check for dangerous properties
      const obj = value as Record<string, unknown>;
      const dangerousKeys = ['constructor', 'prototype', '__proto__'];
      
      if (dangerousKeys.some(key => key in obj)) {
        return false;
      }
      
      return Object.values(obj).every(val => this.isSafeValue(val));
    }
    
    if (typeof value === 'function') {
      return false; // Functions are not allowed in context
    }
    
    return false;
  }

  /**
   * Deep clone object safely
   */
  private deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
    if (obj instanceof Array) return obj.map(item => this.deepClone(item)) as unknown as T;
    if (typeof obj === 'object') {
      const cloned = {} as T;
      for (const [key, value] of Object.entries(obj)) {
        (cloned as any)[key] = this.deepClone(value);
      }
      return cloned;
    }
    return obj;
  }
}

/**
 * Memory usage tracker for sandbox execution
 */
class MemoryTracker {
  private maxMemoryMB: number;
  private active: boolean = false;
  private peakUsage: number = 0;
  private intervalId?: NodeJS.Timeout;

  constructor(maxMemoryMB: number) {
    this.maxMemoryMB = maxMemoryMB;
  }

  public start(): void {
    this.active = true;
    this.peakUsage = 0;
    
    // Monitor memory usage every 100ms
    this.intervalId = setInterval(() => {
      const memoryUsage = process.memoryUsage().heapUsed / (1024 * 1024);
      this.peakUsage = Math.max(this.peakUsage, memoryUsage);
      
      if (memoryUsage > this.maxMemoryMB) {
        throw new Error(`Memory limit exceeded: ${memoryUsage.toFixed(2)}MB > ${this.maxMemoryMB}MB`);
      }
    }, 100);
  }

  public stop(): { peakUsage: number } {
    this.active = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    
    return { peakUsage: this.peakUsage };
  }

  public getPeakUsage(): number {
    return this.peakUsage;
  }

  public isActive(): boolean {
    return this.active;
  }

  public getStats(): MemoryStats {
    return {
      maxMemoryMB: this.maxMemoryMB,
      peakUsage: this.peakUsage,
      currentUsage: process.memoryUsage().heapUsed / (1024 * 1024),
      isActive: this.active
    };
  }

  public cleanup(): void {
    this.stop();
  }
}

/**
 * Create a sandbox instance
 */
export function createSandbox(config: SandboxConfig): PluginSandbox {
  return new PluginSandbox(config);
}

/**
 * Create a sandbox with default security configuration
 */
export function createSecureSandbox(timeout: number = 5000): PluginSandbox {
  return new PluginSandbox({
    timeout,
    maxMemoryUsage: 64,
    allowedModules: ['util'],
    restrictedModules: ['fs', 'child_process', 'net', 'http', 'https', 'dgram', 'dns'],
    allowedEnvVars: []
  });
}

/**
 * Code validation result
 */
export interface CodeValidationResult {
  isValid: boolean;
  issues: CodeValidationIssue[];
  hasSecurityIssues: boolean;
  hasPerformanceIssues: boolean;
}

/**
 * Code validation issue
 */
export interface CodeValidationIssue {
  type: 'security' | 'performance' | 'syntax';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  pattern: string;
  line?: number;
  column?: number;
}

/**
 * Sandbox statistics
 */
export interface SandboxStats {
  config: SandboxConfig;
  memoryStats: MemoryStats;
  isActive: boolean;
}

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  maxMemoryMB: number;
  peakUsage: number;
  currentUsage: number;
  isActive: boolean;
}