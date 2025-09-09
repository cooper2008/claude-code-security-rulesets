/**
 * Plugin loader with validation and security checks
 * Handles secure loading, validation, and instantiation of plugins
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import {
  PluginManifest,
  Plugin,
  PluginInstance,
  PluginContext,
  PluginApis,
  PluginState,
  PluginMetrics,
  PluginSecurityConfig,
  PluginLogger
} from './types';
import { PluginSandbox, SandboxFactory } from './sandbox';
import { RegistryEntry } from './registry';

/**
 * Plugin loading options
 */
export interface PluginLoadOptions {
  /** Skip security validation */
  skipSecurity?: boolean;
  /** Skip dependency checking */
  skipDependencies?: boolean;
  /** Plugin configuration overrides */
  config?: Record<string, unknown>;
  /** Custom timeout for loading */
  timeout?: number;
  /** Enable debug mode */
  debug?: boolean;
}

/**
 * Plugin loading result
 */
export interface PluginLoadResult {
  /** Loading success status */
  success: boolean;
  /** Loaded plugin instance */
  instance?: PluginInstance;
  /** Loading errors */
  errors: string[];
  /** Loading warnings */
  warnings: string[];
  /** Loading metrics */
  metrics: {
    loadingTime: number;
    validationTime: number;
    initializationTime: number;
  };
}

/**
 * Plugin signature verification result
 */
export interface PluginSignatureResult {
  /** Signature is valid */
  isValid: boolean;
  /** Signer information */
  signer?: string;
  /** Trust level */
  trustLevel: 'trusted' | 'untrusted' | 'unknown';
  /** Verification errors */
  errors: string[];
}

/**
 * Plugin loader with security and validation
 */
export class PluginLoader extends EventEmitter {
  private securityConfig: PluginSecurityConfig;
  private sandboxFactory: SandboxFactory;
  private logger: PluginLogger;
  private loadedPlugins: Map<string, PluginInstance> = new Map();

  constructor(
    securityConfig: PluginSecurityConfig,
    sandboxFactory: SandboxFactory,
    logger: PluginLogger
  ) {
    super();
    this.securityConfig = securityConfig;
    this.sandboxFactory = sandboxFactory;
    this.logger = logger;
  }

  /**
   * Load plugin from registry entry
   */
  public async loadPlugin(
    registryEntry: RegistryEntry,
    context: PluginContext,
    apis: PluginApis,
    options: PluginLoadOptions = {}
  ): Promise<PluginLoadResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.logger.info(`Loading plugin: ${registryEntry.manifest.id}`);
      
      // Step 1: Security validation
      let validationTime = 0;
      if (!options.skipSecurity) {
        const validationStart = Date.now();
        const securityResult = await this.validatePluginSecurity(registryEntry, options);
        validationTime = Date.now() - validationStart;
        
        if (!securityResult.isValid) {
          errors.push(...securityResult.errors);
          return {
            success: false,
            errors,
            warnings,
            metrics: {
              loadingTime: Date.now() - startTime,
              validationTime,
              initializationTime: 0
            }
          };
        }
        warnings.push(...securityResult.warnings);
      }

      // Step 2: Dependency checking
      if (!options.skipDependencies) {
        const depResult = await this.checkDependencies(registryEntry.manifest);
        if (!depResult.satisfied) {
          errors.push(`Missing dependencies: ${depResult.missing.join(', ')}`);
          return {
            success: false,
            errors,
            warnings,
            metrics: {
              loadingTime: Date.now() - startTime,
              validationTime,
              initializationTime: 0
            }
          };
        }
      }

      // Step 3: Load and instantiate plugin
      const initStart = Date.now();
      const instance = await this.instantiatePlugin(
        registryEntry,
        context,
        apis,
        options
      );
      const initializationTime = Date.now() - initStart;

      // Step 4: Register loaded plugin
      this.loadedPlugins.set(registryEntry.manifest.id, instance);

      const totalLoadingTime = Date.now() - startTime;
      
      this.logger.info(
        `Plugin loaded successfully: ${registryEntry.manifest.id} ` +
        `(${totalLoadingTime}ms)`
      );

      this.emit('plugin-loaded', {
        pluginId: registryEntry.manifest.id,
        loadingTime: totalLoadingTime
      });

      return {
        success: true,
        instance,
        errors,
        warnings,
        metrics: {
          loadingTime: totalLoadingTime,
          validationTime,
          initializationTime
        }
      };

    } catch (error) {
      const errorMessage = `Failed to load plugin ${registryEntry.manifest.id}: ${(error as Error).message}`;
      this.logger.error(errorMessage, error);
      errors.push(errorMessage);

      return {
        success: false,
        errors,
        warnings,
        metrics: {
          loadingTime: Date.now() - startTime,
          validationTime: 0,
          initializationTime: 0
        }
      };
    }
  }

  /**
   * Unload plugin
   */
  public async unloadPlugin(pluginId: string): Promise<boolean> {
    const instance = this.loadedPlugins.get(pluginId);
    if (!instance) {
      return false;
    }

    try {
      this.logger.info(`Unloading plugin: ${pluginId}`);

      // Update plugin state
      instance.state = 'unloading';

      // Deactivate plugin if active
      if (instance.state === 'active') {
        if ('deactivate' in instance.apis) {
          await (instance.apis as any).deactivate();
        }
      }

      // Cleanup plugin resources
      if ('cleanup' in instance.apis) {
        await (instance.apis as any).cleanup();
      }

      // Remove from loaded plugins
      this.loadedPlugins.delete(pluginId);
      instance.state = 'unloaded';

      this.logger.info(`Plugin unloaded: ${pluginId}`);
      this.emit('plugin-unloaded', { pluginId });

      return true;

    } catch (error) {
      this.logger.error(`Failed to unload plugin ${pluginId}`, error);
      instance.state = 'error';
      return false;
    }
  }

  /**
   * Get loaded plugin instance
   */
  public getLoadedPlugin(pluginId: string): PluginInstance | undefined {
    return this.loadedPlugins.get(pluginId);
  }

  /**
   * Get all loaded plugins
   */
  public getAllLoadedPlugins(): PluginInstance[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Check if plugin is loaded
   */
  public isPluginLoaded(pluginId: string): boolean {
    return this.loadedPlugins.has(pluginId);
  }

  /**
   * Reload plugin
   */
  public async reloadPlugin(
    pluginId: string,
    registryEntry: RegistryEntry,
    context: PluginContext,
    apis: PluginApis,
    options: PluginLoadOptions = {}
  ): Promise<PluginLoadResult> {
    // Unload existing plugin
    await this.unloadPlugin(pluginId);
    
    // Load plugin again
    return this.loadPlugin(registryEntry, context, apis, options);
  }

  /**
   * Validate plugin security
   */
  private async validatePluginSecurity(
    registryEntry: RegistryEntry,
    options: PluginLoadOptions
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check signature verification if enabled
      if (this.securityConfig.verifySignatures) {
        const signatureResult = await this.verifyPluginSignature(registryEntry);
        if (!signatureResult.isValid) {
          errors.push('Plugin signature verification failed');
          return { isValid: false, errors, warnings };
        }
        
        if (signatureResult.trustLevel === 'untrusted') {
          warnings.push('Plugin signature is from untrusted author');
        }
      }

      // Check trusted authors
      if (this.securityConfig.trustedAuthors.length > 0) {
        const authorName = registryEntry.manifest.author.name;
        if (!this.securityConfig.trustedAuthors.includes(authorName)) {
          warnings.push(`Plugin author '${authorName}' is not in trusted authors list`);
        }
      }

      // Validate permissions
      const permissionResult = await this.validatePluginPermissions(
        registryEntry.manifest,
        registryEntry.sourcePath
      );
      if (!permissionResult.isValid) {
        errors.push(...permissionResult.errors);
        return { isValid: false, errors, warnings };
      }
      warnings.push(...permissionResult.warnings);

      // Check plugin code if it's a filesystem plugin
      if (registryEntry.sourceType === 'filesystem') {
        const codeResult = await this.validatePluginCode(registryEntry.sourcePath);
        if (!codeResult.isValid) {
          errors.push(...codeResult.errors);
          return { isValid: false, errors, warnings };
        }
        warnings.push(...codeResult.warnings);
      }

      return { isValid: true, errors, warnings };

    } catch (error) {
      errors.push(`Security validation failed: ${(error as Error).message}`);
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Verify plugin signature
   */
  private async verifyPluginSignature(
    registryEntry: RegistryEntry
  ): Promise<PluginSignatureResult> {
    // Placeholder implementation - in production, implement proper code signing
    const result: PluginSignatureResult = {
      isValid: true, // For now, assume valid
      trustLevel: 'unknown',
      errors: []
    };

    // Check if author is in trusted list
    const authorName = registryEntry.manifest.author.name;
    if (this.securityConfig.trustedAuthors.includes(authorName)) {
      result.trustLevel = 'trusted';
      result.signer = authorName;
    }

    return result;
  }

  /**
   * Validate plugin permissions
   */
  private async validatePluginPermissions(
    manifest: PluginManifest,
    sourcePath: string
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const permissions = manifest.permissions;

      // Check filesystem permissions
      if (permissions.filesystem) {
        for (const readPath of permissions.filesystem.read || []) {
          if (!this.isPathAllowed(readPath, this.securityConfig.allowedPaths)) {
            errors.push(`Filesystem read access not allowed for path: ${readPath}`);
          }
        }

        for (const writePath of permissions.filesystem.write || []) {
          if (!this.isPathAllowed(writePath, this.securityConfig.allowedPaths)) {
            errors.push(`Filesystem write access not allowed for path: ${writePath}`);
          }
        }
      }

      // Check network permissions
      if (permissions.network) {
        for (const domain of permissions.network.domains || []) {
          if (!this.isDomainAllowed(domain, this.securityConfig.allowedDomains)) {
            errors.push(`Network access not allowed for domain: ${domain}`);
          }
        }

        const rateLimit = permissions.network.rateLimit || 100;
        if (rateLimit > 1000) {
          warnings.push(`High network rate limit requested: ${rateLimit} requests/min`);
        }
      }

      // Check dangerous permissions
      if (permissions.exec) {
        if (!this.securityConfig.allowedPaths.includes('exec')) {
          errors.push('Plugin requests dangerous exec permission');
        } else {
          warnings.push('Plugin has exec permission - use with caution');
        }
      }

      if (permissions.native) {
        warnings.push('Plugin uses native modules - additional security risk');
      }

      return { isValid: errors.length === 0, errors, warnings };

    } catch (error) {
      errors.push(`Permission validation failed: ${(error as Error).message}`);
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Validate plugin code
   */
  private async validatePluginCode(
    sourcePath: string
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Find all JavaScript/TypeScript files
      const codeFiles = await this.findCodeFiles(sourcePath);
      
      for (const filePath of codeFiles) {
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Check for dangerous patterns
        const dangerousPatterns = [
          { pattern: /eval\s*\(/, message: 'Use of eval() detected' },
          { pattern: /Function\s*\(/, message: 'Dynamic function creation detected' },
          { pattern: /require\s*\(\s*['"`]child_process['"`]\s*\)/, message: 'Child process access detected' },
          { pattern: /process\.exit/, message: 'Process exit call detected' },
          { pattern: /process\.kill/, message: 'Process kill call detected' },
          { pattern: /__dirname/, message: 'Direct __dirname access detected' },
          { pattern: /__filename/, message: 'Direct __filename access detected' },
          { pattern: /global\s*\./, message: 'Global object access detected' }
        ];

        for (const { pattern, message } of dangerousPatterns) {
          if (pattern.test(content)) {
            if (message.includes('eval') || message.includes('Function')) {
              errors.push(`${message} in ${path.relative(sourcePath, filePath)}`);
            } else {
              warnings.push(`${message} in ${path.relative(sourcePath, filePath)}`);
            }
          }
        }

        // Check file size
        if (content.length > 1024 * 1024) { // 1MB
          warnings.push(`Large file detected: ${path.relative(sourcePath, filePath)} (${(content.length / 1024).toFixed(1)}KB)`);
        }
      }

      // Check for package.json vulnerabilities
      const packageJsonPath = path.join(sourcePath, 'package.json');
      try {
        const packageData = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
        
        // Check dependencies for known vulnerable packages
        const vulnerablePackages = ['eval']; // Example list - vm2 removed from our dependencies
        const dependencies = { ...packageData.dependencies, ...packageData.devDependencies };
        
        for (const pkg of vulnerablePackages) {
          if (dependencies[pkg]) {
            warnings.push(`Potentially vulnerable dependency detected: ${pkg}`);
          }
        }
      } catch {
        // Ignore if package.json is not readable
      }

      return { isValid: errors.length === 0, errors, warnings };

    } catch (error) {
      errors.push(`Code validation failed: ${(error as Error).message}`);
      return { isValid: false, errors, warnings };
    }
  }

  /**
   * Check plugin dependencies
   */
  private async checkDependencies(
    manifest: PluginManifest
  ): Promise<{ satisfied: boolean; missing: string[] }> {
    const missing: string[] = [];

    if (!manifest.dependencies) {
      return { satisfied: true, missing };
    }

    for (const dependency of manifest.dependencies) {
      const isLoaded = this.isPluginLoaded(dependency.pluginId);
      const isAvailable = this.isPluginAvailable(dependency.pluginId, dependency.version);

      if (!dependency.optional && !isLoaded && !isAvailable) {
        missing.push(`${dependency.pluginId}@${dependency.version}`);
      }
    }

    return { satisfied: missing.length === 0, missing };
  }

  /**
   * Instantiate plugin
   */
  private async instantiatePlugin(
    registryEntry: RegistryEntry,
    context: PluginContext,
    apis: PluginApis,
    options: PluginLoadOptions
  ): Promise<PluginInstance> {
    const { manifest, sourcePath, sourceType } = registryEntry;

    try {
      // Create plugin sandbox if enabled
      let sandbox: PluginSandbox | undefined;
      if (this.securityConfig.enableSandbox) {
        sandbox = this.sandboxFactory.createSandbox(apis.logger);
        await sandbox.initialize(context, apis);
      }

      // Load plugin code
      let pluginCode: string;
      if (sourceType === 'filesystem') {
        const entryPoint = path.resolve(sourcePath, manifest.entryPoints.main || 'index.js');
        pluginCode = await fs.readFile(entryPoint, 'utf-8');
      } else {
        // For npm packages, we would install and require them
        pluginCode = `module.exports = require('${sourcePath}');`;
      }

      // Create plugin instance
      const instance: PluginInstance = {
        manifest,
        state: 'loading',
        config: options.config || {},
        context,
        apis: apis, // This will be replaced with the actual plugin implementation
        loadedAt: new Date(),
        metrics: {
          executionTime: 0,
          memoryUsage: 0,
          operationCount: 0,
          errorCount: 0,
          warningCount: 0
        }
      };

      // Execute plugin initialization
      if (sandbox) {
        const result = await sandbox.execute(pluginCode, {
          timeout: options.timeout || this.securityConfig.maxExecutionTime,
          context: { pluginContext: context, pluginApis: apis }
        });

        if (!result.success) {
          throw new Error(`Plugin execution failed: ${result.error?.message}`);
        }

        // Update metrics
        if (result.metrics) {
          instance.metrics.executionTime = result.metrics.duration;
          instance.metrics.memoryUsage = result.metrics.memoryUsage;
        }
      }

      // Initialize plugin
      instance.state = 'initializing';
      
      // Plugin should implement initialize method
      if (typeof (instance.apis as any).initialize === 'function') {
        await (instance.apis as any).initialize(context, apis);
      }

      instance.state = 'loaded';
      return instance;

    } catch (error) {
      throw new Error(`Plugin instantiation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Find code files in directory
   */
  private async findCodeFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...await this.findCodeFiles(fullPath));
      } else if (entry.isFile() && /\.(js|ts|mjs)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Check if path is allowed
   */
  private isPathAllowed(requestedPath: string, allowedPaths: string[]): boolean {
    const normalizedPath = path.resolve(requestedPath);
    
    return allowedPaths.some(allowedPath => {
      const normalizedAllowed = path.resolve(allowedPath);
      return normalizedPath.startsWith(normalizedAllowed);
    });
  }

  /**
   * Check if domain is allowed
   */
  private isDomainAllowed(requestedDomain: string, allowedDomains: string[]): boolean {
    if (allowedDomains.length === 0) {
      return true; // No restrictions
    }

    return allowedDomains.some(allowedDomain => {
      return requestedDomain === allowedDomain || 
             requestedDomain.endsWith(`.${allowedDomain}`);
    });
  }

  /**
   * Check if plugin is available (placeholder)
   */
  private isPluginAvailable(pluginId: string, version: string): boolean {
    // This would check against the registry
    return false; // Simplified implementation
  }

  /**
   * Get loader statistics
   */
  public getStats(): {
    totalLoaded: number;
    byCategory: Record<string, number>;
    byState: Record<string, number>;
    totalMemoryUsage: number;
    totalExecutionTime: number;
  } {
    const instances = this.getAllLoadedPlugins();
    
    const stats = {
      totalLoaded: instances.length,
      byCategory: {} as Record<string, number>,
      byState: {} as Record<string, number>,
      totalMemoryUsage: 0,
      totalExecutionTime: 0
    };

    for (const instance of instances) {
      // Count by category
      const category = instance.manifest.category;
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

      // Count by state
      stats.byState[instance.state] = (stats.byState[instance.state] || 0) + 1;

      // Sum metrics
      stats.totalMemoryUsage += instance.metrics.memoryUsage;
      stats.totalExecutionTime += instance.metrics.executionTime;
    }

    return stats;
  }

  /**
   * Cleanup loader resources
   */
  public async cleanup(): Promise<void> {
    // Unload all plugins
    const pluginIds = Array.from(this.loadedPlugins.keys());
    
    for (const pluginId of pluginIds) {
      try {
        await this.unloadPlugin(pluginId);
      } catch (error) {
        this.logger.error(`Failed to unload plugin ${pluginId} during cleanup`, error);
      }
    }

    this.removeAllListeners();
    this.logger.info('Plugin loader cleaned up');
  }
}