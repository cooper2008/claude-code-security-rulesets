/**
 * Cache key generation and management
 * Provides consistent and collision-free key generation
 */

import { createHash } from 'crypto';
import { ClaudeCodeConfiguration, ValidationResult, SecurityTemplate } from '../types';

/**
 * Cache key generator with namespace support
 */
export class CacheKeyGenerator {
  private readonly prefix: string;
  private readonly version: string;
  private readonly separator: string = ':';

  constructor(prefix: string = 'claude-code', version: string = 'v1') {
    this.prefix = prefix;
    this.version = version;
  }

  /**
   * Generate a cache key for validation results
   */
  validationKey(config: ClaudeCodeConfiguration): string {
    const hash = this.hashConfig(config);
    return this.buildKey('validation', hash);
  }

  /**
   * Generate a cache key for template data
   */
  templateKey(templateId: string, params?: Record<string, any>): string {
    if (params && Object.keys(params).length > 0) {
      const paramsHash = this.hashObject(params);
      return this.buildKey('template', templateId, paramsHash);
    }
    return this.buildKey('template', templateId);
  }

  /**
   * Generate a cache key for parsed configuration
   */
  configKey(configPath: string, content?: string): string {
    const pathHash = this.hashString(configPath);
    if (content) {
      const contentHash = this.hashString(content);
      return this.buildKey('config', pathHash, contentHash);
    }
    return this.buildKey('config', pathHash);
  }

  /**
   * Generate a cache key for conflict detection results
   */
  conflictKey(rules: any[]): string {
    const rulesHash = this.hashObject(rules);
    return this.buildKey('conflict', rulesHash);
  }

  /**
   * Generate a cache key for pattern matching results
   */
  patternKey(pattern: string, target: string): string {
    const patternHash = this.hashString(pattern);
    const targetHash = this.hashString(target);
    return this.buildKey('pattern', patternHash, targetHash);
  }

  /**
   * Generate a cache key for compiled regex patterns
   */
  regexKey(pattern: string, flags?: string): string {
    const combined = flags ? `${pattern}:${flags}` : pattern;
    const hash = this.hashString(combined);
    return this.buildKey('regex', hash);
  }

  /**
   * Generate a cache key for resolution suggestions
   */
  resolutionKey(errorType: string, context: Record<string, any>): string {
    const typeHash = this.hashString(errorType);
    const contextHash = this.hashObject(context);
    return this.buildKey('resolution', typeHash, contextHash);
  }

  /**
   * Generate a cache key for audit log queries
   */
  auditKey(query: Record<string, any>): string {
    const queryHash = this.hashObject(query);
    return this.buildKey('audit', queryHash);
  }

  /**
   * Generate a cache key for user permissions
   */
  permissionKey(userId: string, resource: string): string {
    return this.buildKey('permission', userId, resource);
  }

  /**
   * Generate a cache key with tags for invalidation
   */
  taggedKey(namespace: string, identifier: string, tags: string[]): string {
    const key = this.buildKey(namespace, identifier);
    const tagString = tags.sort().join(',');
    return `${key}${this.separator}tags${this.separator}${this.hashString(tagString)}`;
  }

  /**
   * Extract namespace from a cache key
   */
  getNamespace(key: string): string | null {
    const parts = this.parseKey(key);
    return parts.length > 2 ? parts[2] : null;
  }

  /**
   * Extract tags from a tagged cache key
   */
  getTags(key: string): string[] {
    const tagMatch = key.match(/tags:([^:]+)$/);
    if (tagMatch) {
      // In a real implementation, we'd store tag mappings separately
      return [];
    }
    return [];
  }

  /**
   * Parse a cache key into its components
   */
  parseKey(key: string): string[] {
    return key.split(this.separator);
  }

  /**
   * Build a cache key from components
   */
  private buildKey(...components: string[]): string {
    return [this.prefix, this.version, ...components]
      .filter(Boolean)
      .join(this.separator);
  }

  /**
   * Generate a stable hash for a configuration object
   */
  private hashConfig(config: ClaudeCodeConfiguration): string {
    const normalized = this.normalizeConfig(config);
    return this.hashObject(normalized);
  }

  /**
   * Normalize configuration for consistent hashing
   */
  private normalizeConfig(config: any): any {
    if (config === null || config === undefined) {
      return config;
    }

    if (Array.isArray(config)) {
      return config
        .slice()
        .sort((a, b) => {
          const aStr = JSON.stringify(this.normalizeConfig(a));
          const bStr = JSON.stringify(this.normalizeConfig(b));
          return aStr.localeCompare(bStr);
        })
        .map(item => this.normalizeConfig(item));
    }

    if (typeof config === 'object') {
      const normalized: any = {};
      const keys = Object.keys(config).sort();

      for (const key of keys) {
        // Skip volatile fields
        if (this.isVolatileField(key)) {
          continue;
        }
        normalized[key] = this.normalizeConfig(config[key]);
      }

      return normalized;
    }

    return config;
  }

  /**
   * Check if a field is volatile and should be excluded from hashing
   */
  private isVolatileField(field: string): boolean {
    const volatileFields = [
      'timestamp',
      'createdAt',
      'updatedAt',
      'lastModified',
      'signature',
      'hash',
      '_id',
      'id'
    ];
    return volatileFields.includes(field);
  }

  /**
   * Hash an object deterministically
   */
  private hashObject(obj: any): string {
    const normalized = typeof obj === 'object' ? this.normalizeConfig(obj) : obj;
    const json = JSON.stringify(normalized);
    return this.hashString(json);
  }

  /**
   * Hash a string using SHA-256
   */
  private hashString(str: string): string {
    return createHash('sha256')
      .update(str, 'utf8')
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for shorter keys
  }

  /**
   * Generate a pattern for cache key matching
   */
  pattern(namespace?: string, identifier?: string): string {
    const components = [this.prefix, this.version];
    
    if (namespace) {
      components.push(namespace);
      if (identifier) {
        components.push(identifier);
      } else {
        components.push('*');
      }
    } else {
      components.push('*');
    }

    return components.join(this.separator);
  }

  /**
   * Generate a regex for cache key matching
   */
  regex(namespace?: string): RegExp {
    const escaped = this.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = namespace 
      ? `^${escaped}${this.separator}${this.version}${this.separator}${namespace}${this.separator}`
      : `^${escaped}${this.separator}`;
    return new RegExp(pattern);
  }
}

/**
 * Cache key manager for tracking and invalidation
 */
export class CacheKeyManager {
  private readonly generator: CacheKeyGenerator;
  private readonly keyToTags: Map<string, Set<string>>;
  private readonly tagToKeys: Map<string, Set<string>>;

  constructor(prefix?: string, version?: string) {
    this.generator = new CacheKeyGenerator(prefix, version);
    this.keyToTags = new Map();
    this.tagToKeys = new Map();
  }

  /**
   * Register a key with tags
   */
  registerKey(key: string, tags: string[]): void {
    // Store key-to-tags mapping
    if (!this.keyToTags.has(key)) {
      this.keyToTags.set(key, new Set());
    }
    const keyTags = this.keyToTags.get(key)!;
    tags.forEach(tag => keyTags.add(tag));

    // Store tag-to-keys mapping
    for (const tag of tags) {
      if (!this.tagToKeys.has(tag)) {
        this.tagToKeys.set(tag, new Set());
      }
      this.tagToKeys.get(tag)!.add(key);
    }
  }

  /**
   * Unregister a key
   */
  unregisterKey(key: string): void {
    const tags = this.keyToTags.get(key);
    
    if (tags) {
      // Remove from tag-to-keys mapping
      for (const tag of tags) {
        const keys = this.tagToKeys.get(tag);
        if (keys) {
          keys.delete(key);
          if (keys.size === 0) {
            this.tagToKeys.delete(tag);
          }
        }
      }
    }

    // Remove from key-to-tags mapping
    this.keyToTags.delete(key);
  }

  /**
   * Get all keys with a specific tag
   */
  getKeysByTag(tag: string): string[] {
    const keys = this.tagToKeys.get(tag);
    return keys ? Array.from(keys) : [];
  }

  /**
   * Get all keys with any of the specified tags
   */
  getKeysByTags(tags: string[]): string[] {
    const keySet = new Set<string>();
    
    for (const tag of tags) {
      const keys = this.tagToKeys.get(tag);
      if (keys) {
        keys.forEach(key => keySet.add(key));
      }
    }

    return Array.from(keySet);
  }

  /**
   * Get all tags for a key
   */
  getTagsForKey(key: string): string[] {
    const tags = this.keyToTags.get(key);
    return tags ? Array.from(tags) : [];
  }

  /**
   * Get keys matching a pattern
   */
  getKeysByPattern(pattern: string | RegExp): string[] {
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern.replace(/\*/g, '.*'))
      : pattern;

    return Array.from(this.keyToTags.keys()).filter(key => regex.test(key));
  }

  /**
   * Clear all key-tag mappings
   */
  clear(): void {
    this.keyToTags.clear();
    this.tagToKeys.clear();
  }

  /**
   * Get the key generator
   */
  getGenerator(): CacheKeyGenerator {
    return this.generator;
  }

  /**
   * Get statistics about key-tag mappings
   */
  getStats(): { keys: number; tags: number; avgTagsPerKey: number } {
    const totalTags = Array.from(this.keyToTags.values())
      .reduce((sum, tags) => sum + tags.size, 0);

    return {
      keys: this.keyToTags.size,
      tags: this.tagToKeys.size,
      avgTagsPerKey: this.keyToTags.size > 0 
        ? totalTags / this.keyToTags.size 
        : 0
    };
  }
}

// Export singleton instances for convenience
export const defaultKeyGenerator = new CacheKeyGenerator();
export const defaultKeyManager = new CacheKeyManager();