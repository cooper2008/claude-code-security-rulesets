/**
 * Smart cache invalidation strategies
 * Handles automatic invalidation on configuration and template changes
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { InvalidationStrategy } from './types';

/**
 * File watcher for automatic cache invalidation
 */
export class FileWatcher extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher>;
  private fileHashes: Map<string, string>;
  private checkInterval: NodeJS.Timer | null;

  constructor() {
    super();
    this.watchers = new Map();
    this.fileHashes = new Map();
    this.checkInterval = null;
  }

  /**
   * Watch a file or directory for changes
   */
  watch(filePath: string, options: { recursive?: boolean } = {}): void {
    if (this.watchers.has(filePath)) {
      return; // Already watching
    }

    try {
      const watcher = fs.watch(filePath, { recursive: options.recursive }, (eventType, filename) => {
        this.handleFileChange(filePath, eventType, filename);
      });

      this.watchers.set(filePath, watcher);

      // Store initial hash if it's a file
      if (fs.statSync(filePath).isFile()) {
        this.updateFileHash(filePath);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Stop watching a file or directory
   */
  unwatch(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
      this.fileHashes.delete(filePath);
    }
  }

  /**
   * Stop watching all files
   */
  unwatchAll(): void {
    for (const [filePath, watcher] of this.watchers) {
      watcher.close();
    }
    
    this.watchers.clear();
    this.fileHashes.clear();
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Start periodic hash checking for change detection
   */
  startHashChecking(interval: number = 5000): void {
    if (this.checkInterval) {
      return; // Already checking
    }

    this.checkInterval = setInterval(() => {
      this.checkFileHashes();
    }, interval);

    this.checkInterval.unref();
  }

  /**
   * Handle file change events
   */
  private handleFileChange(watchPath: string, eventType: string, filename?: string | null): void {
    const fullPath = filename ? path.join(watchPath, filename) : watchPath;

    // Debounce rapid changes
    setTimeout(() => {
      if (eventType === 'rename') {
        // File was added or removed
        this.emit('invalidate', {
          type: 'file',
          path: fullPath,
          event: 'rename'
        });
      } else if (eventType === 'change') {
        // File content changed
        if (this.hasFileChanged(fullPath)) {
          this.emit('invalidate', {
            type: 'file',
            path: fullPath,
            event: 'change'
          });
        }
      }
    }, 100);
  }

  /**
   * Check if file content has actually changed
   */
  private hasFileChanged(filePath: string): boolean {
    try {
      const newHash = this.calculateFileHash(filePath);
      const oldHash = this.fileHashes.get(filePath);

      if (newHash !== oldHash) {
        this.fileHashes.set(filePath, newHash);
        return true;
      }

      return false;
    } catch {
      // File might have been deleted
      return true;
    }
  }

  /**
   * Calculate hash of file content
   */
  private calculateFileHash(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath);
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return '';
    }
  }

  /**
   * Update stored hash for a file
   */
  private updateFileHash(filePath: string): void {
    const hash = this.calculateFileHash(filePath);
    if (hash) {
      this.fileHashes.set(filePath, hash);
    }
  }

  /**
   * Check all watched files for hash changes
   */
  private checkFileHashes(): void {
    for (const filePath of this.fileHashes.keys()) {
      if (this.hasFileChanged(filePath)) {
        this.emit('invalidate', {
          type: 'file',
          path: filePath,
          event: 'change'
        });
      }
    }
  }
}

/**
 * Dependency tracker for intelligent invalidation
 */
export class DependencyTracker {
  private dependencies: Map<string, Set<string>>;
  private dependents: Map<string, Set<string>>;

  constructor() {
    this.dependencies = new Map();
    this.dependents = new Map();
  }

  /**
   * Add a dependency relationship
   */
  addDependency(item: string, dependsOn: string): void {
    // Track what this item depends on
    if (!this.dependencies.has(item)) {
      this.dependencies.set(item, new Set());
    }
    this.dependencies.get(item)!.add(dependsOn);

    // Track what depends on the dependency
    if (!this.dependents.has(dependsOn)) {
      this.dependents.set(dependsOn, new Set());
    }
    this.dependents.get(dependsOn)!.add(item);
  }

  /**
   * Remove a dependency relationship
   */
  removeDependency(item: string, dependsOn: string): void {
    const deps = this.dependencies.get(item);
    if (deps) {
      deps.delete(dependsOn);
      if (deps.size === 0) {
        this.dependencies.delete(item);
      }
    }

    const depts = this.dependents.get(dependsOn);
    if (depts) {
      depts.delete(item);
      if (depts.size === 0) {
        this.dependents.delete(dependsOn);
      }
    }
  }

  /**
   * Get all items that should be invalidated when a dependency changes
   */
  getAffectedItems(changedItem: string): string[] {
    const affected = new Set<string>();
    const queue = [changedItem];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (visited.has(current)) {
        continue;
      }
      
      visited.add(current);
      affected.add(current);

      // Add all items that depend on the current item
      const depts = this.dependents.get(current);
      if (depts) {
        for (const dept of depts) {
          if (!visited.has(dept)) {
            queue.push(dept);
          }
        }
      }
    }

    return Array.from(affected);
  }

  /**
   * Clear all dependencies
   */
  clear(): void {
    this.dependencies.clear();
    this.dependents.clear();
  }

  /**
   * Get dependency graph for visualization
   */
  getGraph(): { nodes: string[]; edges: Array<{ from: string; to: string }> } {
    const nodes = new Set<string>();
    const edges: Array<{ from: string; to: string }> = [];

    for (const [item, deps] of this.dependencies) {
      nodes.add(item);
      for (const dep of deps) {
        nodes.add(dep);
        edges.push({ from: item, to: dep });
      }
    }

    return {
      nodes: Array.from(nodes),
      edges
    };
  }
}

/**
 * Invalidation manager that coordinates different strategies
 */
export class InvalidationManager extends EventEmitter {
  private fileWatcher: FileWatcher;
  private dependencyTracker: DependencyTracker;
  private strategies: Map<string, InvalidationStrategy>;
  private invalidationQueue: Set<string>;
  private processInterval: NodeJS.Timer | null;

  constructor() {
    super();
    
    this.fileWatcher = new FileWatcher();
    this.dependencyTracker = new DependencyTracker();
    this.strategies = new Map();
    this.invalidationQueue = new Set();
    this.processInterval = null;

    // Forward file watcher events
    this.fileWatcher.on('invalidate', (data) => {
      this.handleFileInvalidation(data);
    });

    this.fileWatcher.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * Register an invalidation strategy
   */
  registerStrategy(name: string, strategy: InvalidationStrategy): void {
    this.strategies.set(name, strategy);
  }

  /**
   * Watch configuration files for changes
   */
  watchConfigFiles(configPaths: string[]): void {
    for (const configPath of configPaths) {
      this.fileWatcher.watch(configPath);
      
      // Track as configuration dependency
      this.dependencyTracker.addDependency('config:*', configPath);
    }
  }

  /**
   * Watch template files for changes
   */
  watchTemplateFiles(templateDir: string): void {
    this.fileWatcher.watch(templateDir, { recursive: true });
    
    // Track as template dependency
    this.dependencyTracker.addDependency('template:*', templateDir);
  }

  /**
   * Add a dependency relationship
   */
  addDependency(cacheKey: string, dependsOn: string): void {
    this.dependencyTracker.addDependency(cacheKey, dependsOn);
  }

  /**
   * Invalidate cache entries based on a pattern
   */
  invalidate(pattern: string | RegExp): string[] {
    const affected = this.findMatchingKeys(pattern);
    
    for (const key of affected) {
      this.invalidationQueue.add(key);
    }

    this.processInvalidationQueue();
    
    return affected;
  }

  /**
   * Invalidate cache entries by tags
   */
  invalidateByTags(tags: string[]): string[] {
    const affected: string[] = [];
    
    // This would integrate with the cache key manager
    // to find all keys with the specified tags
    
    for (const key of affected) {
      this.invalidationQueue.add(key);
    }

    this.processInvalidationQueue();
    
    return affected;
  }

  /**
   * Start batch invalidation processing
   */
  startBatchProcessing(interval: number = 1000): void {
    if (this.processInterval) {
      return;
    }

    this.processInterval = setInterval(() => {
      this.processInvalidationQueue();
    }, interval);

    this.processInterval.unref();
  }

  /**
   * Stop batch invalidation processing
   */
  stopBatchProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.fileWatcher.unwatchAll();
    this.dependencyTracker.clear();
    this.strategies.clear();
    this.invalidationQueue.clear();
    this.stopBatchProcessing();
  }

  // Private methods

  private handleFileInvalidation(data: any): void {
    // Find all cache keys affected by this file change
    const affected = this.dependencyTracker.getAffectedItems(data.path);
    
    // Also check for pattern-based dependencies
    if (data.path.includes('config')) {
      affected.push(...this.dependencyTracker.getAffectedItems('config:*'));
    }
    
    if (data.path.includes('template')) {
      affected.push(...this.dependencyTracker.getAffectedItems('template:*'));
    }

    for (const key of affected) {
      this.invalidationQueue.add(key);
    }

    this.emit('fileChanged', {
      file: data.path,
      affected: affected.length
    });

    // Process immediately for file changes
    this.processInvalidationQueue();
  }

  private findMatchingKeys(pattern: string | RegExp): string[] {
    // This would integrate with the cache implementation
    // to find all keys matching the pattern
    const keys: string[] = [];
    
    // Convert string pattern to regex if needed
    const regex = typeof pattern === 'string'
      ? new RegExp(pattern.replace(/\*/g, '.*'))
      : pattern;

    // Would iterate through all cache keys and test against regex
    // For now, return empty array as placeholder
    
    return keys;
  }

  private processInvalidationQueue(): void {
    if (this.invalidationQueue.size === 0) {
      return;
    }

    const keys = Array.from(this.invalidationQueue);
    this.invalidationQueue.clear();

    this.emit('invalidate', {
      keys,
      count: keys.length,
      timestamp: Date.now()
    });
  }
}

/**
 * TTL-based invalidation strategy
 */
export class TTLInvalidation {
  private timers: Map<string, NodeJS.Timeout>;

  constructor() {
    this.timers = new Map();
  }

  /**
   * Schedule invalidation after TTL expires
   */
  schedule(key: string, ttlMs: number, callback: () => void): void {
    // Clear existing timer if any
    this.cancel(key);

    const timer = setTimeout(() => {
      this.timers.delete(key);
      callback();
    }, ttlMs);

    timer.unref();
    this.timers.set(key, timer);
  }

  /**
   * Cancel scheduled invalidation
   */
  cancel(key: string): void {
    const timer = this.timers.get(key);
    
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  /**
   * Clear all scheduled invalidations
   */
  clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    
    this.timers.clear();
  }
}

// Export factory functions
export const createInvalidationManager = (): InvalidationManager => {
  return new InvalidationManager();
};

export const createFileWatcher = (): FileWatcher => {
  return new FileWatcher();
};

export const createDependencyTracker = (): DependencyTracker => {
  return new DependencyTracker();
};