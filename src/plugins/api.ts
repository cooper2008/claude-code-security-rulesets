/**
 * Plugin API interface definitions and implementations
 * Provides standardized APIs for plugins to interact with the host system
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  PluginLogger,
  PluginConfigApi,
  PluginStorageApi,
  PluginHttpApi,
  PluginEventsApi,
  HttpOptions,
  HttpResponse,
  PluginApis,
  PluginPermissions
} from './types';

// =============================================================================
// Logger Implementation
// =============================================================================

/**
 * Plugin logger implementation with structured logging
 */
export class PluginLoggerImpl implements PluginLogger {
  private pluginId: string;
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(pluginId: string, logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.pluginId = pluginId;
    this.logLevel = logLevel;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      this.writeLog('DEBUG', message, args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      this.writeLog('INFO', message, args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      this.writeLog('WARN', message, args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      this.writeLog('ERROR', message, args);
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private writeLog(level: string, message: string, args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ` | ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ')}` : '';
    
    const logMessage = `[${timestamp}] [${level}] [Plugin:${this.pluginId}] ${message}${formattedArgs}`;
    
    // Write to appropriate stream
    if (level === 'ERROR' || level === 'WARN') {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logLevel = level;
  }
}

// =============================================================================
// Configuration API Implementation
// =============================================================================

/**
 * Plugin configuration API implementation
 */
export class PluginConfigApiImpl implements PluginConfigApi {
  private config: Record<string, unknown>;
  private schema?: Record<string, unknown>;

  constructor(initialConfig: Record<string, unknown> = {}, schema?: Record<string, unknown>) {
    this.config = { ...initialConfig };
    this.schema = schema;
  }

  get<T = unknown>(key: string): T | undefined {
    const value = this.getNestedValue(this.config, key);
    return value as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.setNestedValue(this.config, key, value);
  }

  has(key: string): boolean {
    return this.getNestedValue(this.config, key) !== undefined;
  }

  delete(key: string): void {
    this.deleteNestedValue(this.config, key);
  }

  getAll(): Record<string, unknown> {
    return { ...this.config };
  }

  validate(schema: Record<string, unknown>): boolean {
    this.schema = schema;
    // Simplified validation - in production, use a proper schema validator like Ajv
    return this.validateAgainstSchema(this.config, schema);
  }

  private getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    const keys = key.split('.');
    let current: any = obj;
    
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  private setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
    const keys = key.split('.');
    let current: any = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  private deleteNestedValue(obj: Record<string, unknown>, key: string): void {
    const keys = key.split('.');
    let current: any = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        return; // Path doesn't exist
      }
      current = current[k];
    }
    
    delete current[keys[keys.length - 1]];
  }

  private validateAgainstSchema(data: Record<string, unknown>, schema: Record<string, unknown>): boolean {
    // Simplified validation - implement proper JSON schema validation
    for (const [key, schemaValue] of Object.entries(schema)) {
      if (typeof schemaValue === 'object' && schemaValue !== null) {
        const required = (schemaValue as any).required;
        if (required && !(key in data)) {
          return false;
        }
      }
    }
    return true;
  }
}

// =============================================================================
// Storage API Implementation
// =============================================================================

/**
 * Plugin storage API implementation with file-based persistence
 */
export class PluginStorageApiImpl implements PluginStorageApi {
  private pluginId: string;
  private storageDir: string;
  private cache: Map<string, unknown> = new Map();

  constructor(pluginId: string, storageDir: string) {
    this.pluginId = pluginId;
    this.storageDir = path.join(storageDir, pluginId);
    this.ensureStorageDir();
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    try {
      // Check cache first
      if (this.cache.has(key)) {
        return this.cache.get(key) as T;
      }

      // Read from file
      const filePath = this.getKeyPath(key);
      const data = await fs.readFile(filePath, 'utf-8');
      const value = JSON.parse(data);
      
      // Cache the value
      this.cache.set(key, value);
      
      return value as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      const filePath = this.getKeyPath(key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(value, null, 2));
      
      // Update cache
      this.cache.set(key, value);
    } catch (error) {
      throw new Error(`Failed to store value for key '${key}': ${(error as Error).message}`);
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      if (this.cache.has(key)) {
        return true;
      }

      const filePath = this.getKeyPath(key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getKeyPath(key);
      await fs.unlink(filePath);
      this.cache.delete(key);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async clear(): Promise<void> {
    try {
      await fs.rm(this.storageDir, { recursive: true, force: true });
      await this.ensureStorageDir();
      this.cache.clear();
    } catch (error) {
      throw new Error(`Failed to clear storage: ${(error as Error).message}`);
    }
  }

  async keys(): Promise<string[]> {
    try {
      const files = await this.getAllFiles(this.storageDir);
      return files.map(file => 
        path.relative(this.storageDir, file).replace(/\.json$/, '')
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create storage directory: ${(error as Error).message}`);
    }
  }

  private getKeyPath(key: string): string {
    // Sanitize key to prevent path traversal
    const sanitizedKey = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.storageDir, `${sanitizedKey}.json`);
  }

  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.getAllFiles(fullPath));
      } else if (entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }

    return files;
  }
}

// =============================================================================
// HTTP API Implementation
// =============================================================================

/**
 * Plugin HTTP API implementation with security restrictions
 */
export class PluginHttpApiImpl implements PluginHttpApi {
  private allowedDomains: string[];
  private rateLimit: number;
  private requests: { timestamp: number }[] = [];

  constructor(allowedDomains: string[] = [], rateLimit: number = 100) {
    this.allowedDomains = allowedDomains;
    this.rateLimit = rateLimit; // requests per minute
  }

  async get(url: string, options: HttpOptions = {}): Promise<HttpResponse> {
    return this.makeRequest('GET', url, undefined, options);
  }

  async post(url: string, data?: unknown, options: HttpOptions = {}): Promise<HttpResponse> {
    return this.makeRequest('POST', url, data, options);
  }

  async put(url: string, data?: unknown, options: HttpOptions = {}): Promise<HttpResponse> {
    return this.makeRequest('PUT', url, data, options);
  }

  async delete(url: string, options: HttpOptions = {}): Promise<HttpResponse> {
    return this.makeRequest('DELETE', url, undefined, options);
  }

  private async makeRequest(
    method: string,
    url: string,
    data?: unknown,
    options: HttpOptions = {}
  ): Promise<HttpResponse> {
    // Check rate limit
    this.enforceRateLimit();

    // Validate URL
    this.validateUrl(url);

    // Record request
    this.requests.push({ timestamp: Date.now() });

    try {
      // Use native fetch if available (Node.js 18+), otherwise use a library
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'User-Agent': 'Claude-Security-Plugin/1.0',
          'Content-Type': 'application/json',
          ...options.headers
        },
        signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        fetchOptions.body = JSON.stringify(data);
      }

      const response = await fetch(url, fetchOptions);

      // Parse response
      let responseData: unknown;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      // Convert Headers to plain object
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        data: responseData
      };

    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${options.timeout}ms`);
        }
        throw new Error(`HTTP request failed: ${error.message}`);
      }
      throw error;
    }
  }

  private enforceRateLimit(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old requests
    this.requests = this.requests.filter(req => req.timestamp > oneMinuteAgo);

    if (this.requests.length >= this.rateLimit) {
      throw new Error(`Rate limit exceeded: ${this.rateLimit} requests per minute`);
    }
  }

  private validateUrl(url: string): void {
    let parsedUrl: URL;
    
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    // Check protocol
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
    }

    // Check domain whitelist
    if (this.allowedDomains.length > 0) {
      const hostname = parsedUrl.hostname;
      const isAllowed = this.allowedDomains.some(domain => {
        return hostname === domain || hostname.endsWith(`.${domain}`);
      });

      if (!isAllowed) {
        throw new Error(`Domain not allowed: ${hostname}`);
      }
    }

    // Block private IP ranges
    if (this.isPrivateIP(parsedUrl.hostname)) {
      throw new Error(`Access to private IP addresses is not allowed: ${parsedUrl.hostname}`);
    }
  }

  private isPrivateIP(hostname: string): boolean {
    // Simple check for private IP ranges
    const privateRanges = [
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i
    ];

    return privateRanges.some(range => range.test(hostname));
  }
}

// =============================================================================
// Events API Implementation
// =============================================================================

/**
 * Plugin events API implementation
 */
export class PluginEventsApiImpl extends EventEmitter implements PluginEventsApi {
  private pluginId: string;
  private globalEmitter: EventEmitter;

  constructor(pluginId: string, globalEmitter: EventEmitter) {
    super();
    this.pluginId = pluginId;
    this.globalEmitter = globalEmitter;
  }

  emit(event: string, data?: unknown): void {
    // Emit to plugin-specific listeners
    super.emit(event, data);
    
    // Emit to global event bus with plugin context
    this.globalEmitter.emit('plugin-event', {
      pluginId: this.pluginId,
      event,
      data,
      timestamp: new Date()
    });
  }

  on(event: string, handler: (data?: unknown) => void): void {
    super.on(event, handler);
  }

  off(event: string, handler: (data?: unknown) => void): void {
    super.off(event, handler);
  }

  once(event: string, handler: (data?: unknown) => void): void {
    super.once(event, handler);
  }
}

// =============================================================================
// API Factory
// =============================================================================

/**
 * Plugin APIs factory for creating API instances
 */
export class PluginApiFactory {
  private globalEventEmitter: EventEmitter;
  private storageBaseDir: string;

  constructor(storageBaseDir: string, globalEventEmitter?: EventEmitter) {
    this.storageBaseDir = storageBaseDir;
    this.globalEventEmitter = globalEventEmitter || new EventEmitter();
  }

  /**
   * Create plugin APIs for a specific plugin
   */
  createPluginApis(
    pluginId: string,
    permissions: PluginPermissions,
    config: Record<string, unknown> = {},
    configSchema?: Record<string, unknown>
  ): PluginApis {
    // Create logger
    const logger = new PluginLoggerImpl(pluginId);

    // Create configuration API
    const configApi = new PluginConfigApiImpl(config, configSchema);

    // Create storage API
    const storageApi = new PluginStorageApiImpl(pluginId, this.storageBaseDir);

    // Create HTTP API (if network permissions allow)
    const httpApi = permissions.network ? new PluginHttpApiImpl(
      permissions.network.domains || [],
      permissions.network.rateLimit || 100
    ) : undefined;

    // Create events API
    const eventsApi = new PluginEventsApiImpl(pluginId, this.globalEventEmitter);

    return {
      logger,
      config: configApi,
      storage: storageApi,
      http: httpApi,
      events: eventsApi
    };
  }

  /**
   * Get global event emitter for cross-plugin communication
   */
  getGlobalEventEmitter(): EventEmitter {
    return this.globalEventEmitter;
  }
}

// =============================================================================
// Export Default Instance
// =============================================================================

export const defaultApiFactory = new PluginApiFactory(
  path.join(process.cwd(), 'data', 'plugin-storage')
);