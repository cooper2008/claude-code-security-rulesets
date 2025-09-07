/**
 * Template Registry for Claude Code Security Rulesets
 * Manages template discovery, registration, and storage
 * Provides centralized access to built-in and custom templates
 */

import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import {
  SecurityTemplate,
  TemplateCategory,
  ComplianceFramework,
  Environment
} from '../types';

/**
 * Template registry options
 */
export interface TemplateRegistryOptions {
  /** Custom templates storage directory */
  customTemplatesDir?: string;
  /** Enable persistent storage */
  persistentStorage?: boolean;
  /** Template cache TTL in milliseconds */
  cacheTTL?: number;
  /** Maximum number of cached templates */
  maxCacheSize?: number;
  /** Enable template versioning */
  enableVersioning?: boolean;
}

/**
 * Template registration result
 */
export interface TemplateRegistrationResult {
  /** Registration successful */
  success: boolean;
  /** Template ID */
  templateId: string;
  /** Previous version if this is an update */
  previousVersion?: string;
  /** Registration timestamp */
  timestamp: Date;
  /** Any warnings during registration */
  warnings: string[];
}

/**
 * Template search criteria
 */
export interface TemplateSearchCriteria {
  /** Search by ID pattern */
  idPattern?: string;
  /** Search by name pattern */
  namePattern?: string;
  /** Filter by category */
  category?: TemplateCategory;
  /** Filter by compliance frameworks */
  compliance?: ComplianceFramework[];
  /** Filter by tags */
  tags?: string[];
  /** Filter by version */
  version?: string;
  /** Include built-in templates */
  includeBuiltIn?: boolean;
  /** Include custom templates */
  includeCustom?: boolean;
  /** Minimum version */
  minVersion?: string;
  /** Maximum version */
  maxVersion?: string;
}

/**
 * Template search result
 */
export interface TemplateSearchResult {
  /** Found templates */
  templates: SecurityTemplate[];
  /** Total number of templates searched */
  totalSearched: number;
  /** Number of templates matched */
  totalMatched: number;
  /** Search time in milliseconds */
  searchTime: number;
}

/**
 * Template cache entry
 */
interface TemplateCacheEntry {
  template: SecurityTemplate;
  timestamp: Date;
  accessCount: number;
  lastAccessed: Date;
}

/**
 * Template metadata for efficient searching
 */
interface TemplateMetadata {
  id: string;
  name: string;
  category: TemplateCategory;
  version: string;
  tags: string[];
  compliance: ComplianceFramework[];
  isBuiltIn: boolean;
  filePath?: string;
  lastModified: Date;
}

/**
 * Template registry class
 */
export class TemplateRegistry {
  private builtInTemplates = new Map<string, SecurityTemplate>();
  private customTemplates = new Map<string, SecurityTemplate>();
  private templateCache = new Map<string, TemplateCacheEntry>();
  private templateMetadata = new Map<string, TemplateMetadata>();
  private options: TemplateRegistryOptions;

  constructor(options: TemplateRegistryOptions = {}) {
    this.options = {
      customTemplatesDir: options.customTemplatesDir || './templates/custom',
      persistentStorage: options.persistentStorage ?? true,
      cacheTTL: options.cacheTTL || 5 * 60 * 1000, // 5 minutes
      maxCacheSize: options.maxCacheSize || 1000,
      enableVersioning: options.enableVersioning ?? true,
      ...options
    };

    // Initialize storage directory
    this.initializeStorage();
  }

  /**
   * Initialize storage directory
   */
  private async initializeStorage(): Promise<void> {
    if (this.options.persistentStorage && this.options.customTemplatesDir) {
      try {
        await fs.mkdir(resolve(this.options.customTemplatesDir), { recursive: true });
      } catch (error) {
        console.error('Failed to initialize template storage:', error);
      }
    }
  }

  /**
   * Register a template
   */
  public async register(template: SecurityTemplate): Promise<TemplateRegistrationResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    let previousVersion: string | undefined;

    try {
      // Check if template already exists
      const existingTemplate = await this.getTemplate(template.id);
      if (existingTemplate) {
        previousVersion = existingTemplate.version;
        
        if (this.options.enableVersioning && this.compareVersions(template.version, existingTemplate.version) <= 0) {
          warnings.push(`Template version ${template.version} is not newer than existing version ${existingTemplate.version}`);
        }
      }

      // Store template
      if (template.isBuiltIn) {
        this.builtInTemplates.set(template.id, template);
      } else {
        this.customTemplates.set(template.id, template);
        
        // Persist to storage if enabled
        if (this.options.persistentStorage) {
          await this.persistTemplate(template);
        }
      }

      // Update metadata
      this.updateTemplateMetadata(template);

      // Invalidate cache for this template
      this.invalidateTemplateCache(template.id);

      console.log(`Registered template ${template.id} v${template.version} in ${Date.now() - startTime}ms`);

      return {
        success: true,
        templateId: template.id,
        previousVersion,
        timestamp: new Date(),
        warnings
      };

    } catch (error) {
      console.error(`Failed to register template ${template.id}:`, error);
      return {
        success: false,
        templateId: template.id,
        timestamp: new Date(),
        warnings: [String(error)]
      };
    }
  }

  /**
   * Unregister a template
   */
  public async unregister(templateId: string): Promise<boolean> {
    try {
      let removed = false;

      // Remove from built-in templates
      if (this.builtInTemplates.has(templateId)) {
        this.builtInTemplates.delete(templateId);
        removed = true;
      }

      // Remove from custom templates
      if (this.customTemplates.has(templateId)) {
        this.customTemplates.delete(templateId);
        removed = true;

        // Remove from persistent storage
        if (this.options.persistentStorage) {
          await this.removePersistedTemplate(templateId);
        }
      }

      if (removed) {
        // Remove metadata
        this.templateMetadata.delete(templateId);
        
        // Invalidate cache
        this.invalidateTemplateCache(templateId);
        
        console.log(`Unregistered template ${templateId}`);
      }

      return removed;

    } catch (error) {
      console.error(`Failed to unregister template ${templateId}:`, error);
      return false;
    }
  }

  /**
   * Get a template by ID
   */
  public async getTemplate(templateId: string): Promise<SecurityTemplate | null> {
    // Check cache first
    const cached = this.getFromCache(templateId);
    if (cached) {
      return cached;
    }

    // Look in built-in templates
    if (this.builtInTemplates.has(templateId)) {
      const template = this.builtInTemplates.get(templateId)!;
      this.addToCache(templateId, template);
      return template;
    }

    // Look in custom templates
    if (this.customTemplates.has(templateId)) {
      const template = this.customTemplates.get(templateId)!;
      this.addToCache(templateId, template);
      return template;
    }

    // Try loading from persistent storage
    if (this.options.persistentStorage) {
      const template = await this.loadPersistedTemplate(templateId);
      if (template) {
        this.customTemplates.set(templateId, template);
        this.updateTemplateMetadata(template);
        this.addToCache(templateId, template);
        return template;
      }
    }

    return null;
  }

  /**
   * Update an existing template
   */
  public async update(templateId: string, updatedTemplate: SecurityTemplate): Promise<boolean> {
    const existingTemplate = await this.getTemplate(templateId);
    if (!existingTemplate) {
      return false;
    }

    // Ensure the ID matches
    if (updatedTemplate.id !== templateId) {
      updatedTemplate.id = templateId;
    }

    // Update timestamp
    updatedTemplate.updatedAt = new Date();

    // Register the updated template
    const result = await this.register(updatedTemplate);
    return result.success;
  }

  /**
   * Search templates
   */
  public async search(criteria: TemplateSearchCriteria = {}): Promise<TemplateSearchResult> {
    const startTime = Date.now();
    let templates: SecurityTemplate[] = [];

    // Collect templates to search
    if (criteria.includeBuiltIn !== false) {
      templates.push(...this.builtInTemplates.values());
    }
    
    if (criteria.includeCustom !== false) {
      templates.push(...this.customTemplates.values());
    }

    const totalSearched = templates.length;

    // Apply filters
    let filteredTemplates = templates.filter(template => {
      // ID pattern filter
      if (criteria.idPattern && !template.id.match(new RegExp(criteria.idPattern, 'i'))) {
        return false;
      }

      // Name pattern filter
      if (criteria.namePattern && !template.name.match(new RegExp(criteria.namePattern, 'i'))) {
        return false;
      }

      // Category filter
      if (criteria.category && template.category !== criteria.category) {
        return false;
      }

      // Compliance filter
      if (criteria.compliance && criteria.compliance.length > 0) {
        const hasCompliance = criteria.compliance.some(c => template.compliance.includes(c));
        if (!hasCompliance) {
          return false;
        }
      }

      // Tags filter
      if (criteria.tags && criteria.tags.length > 0) {
        const hasTags = criteria.tags.some(tag => template.tags.includes(tag));
        if (!hasTags) {
          return false;
        }
      }

      // Version filters
      if (criteria.version && template.version !== criteria.version) {
        return false;
      }

      if (criteria.minVersion && this.compareVersions(template.version, criteria.minVersion) < 0) {
        return false;
      }

      if (criteria.maxVersion && this.compareVersions(template.version, criteria.maxVersion) > 0) {
        return false;
      }

      return true;
    });

    // Sort results by relevance
    filteredTemplates = this.sortTemplatesByRelevance(filteredTemplates, criteria);

    return {
      templates: filteredTemplates,
      totalSearched,
      totalMatched: filteredTemplates.length,
      searchTime: Date.now() - startTime
    };
  }

  /**
   * Get all built-in templates
   */
  public getBuiltInTemplates(): SecurityTemplate[] {
    return Array.from(this.builtInTemplates.values());
  }

  /**
   * Get all custom templates
   */
  public getCustomTemplates(): SecurityTemplate[] {
    return Array.from(this.customTemplates.values());
  }

  /**
   * Get all templates
   */
  public getAllTemplates(): SecurityTemplate[] {
    return [
      ...this.getBuiltInTemplates(),
      ...this.getCustomTemplates()
    ];
  }

  /**
   * Get template categories
   */
  public getCategories(): TemplateCategory[] {
    const categories = new Set<TemplateCategory>();
    
    for (const template of this.getAllTemplates()) {
      categories.add(template.category);
    }
    
    return Array.from(categories);
  }

  /**
   * Get compliance frameworks
   */
  public getComplianceFrameworks(): ComplianceFramework[] {
    const frameworks = new Set<ComplianceFramework>();
    
    for (const template of this.getAllTemplates()) {
      template.compliance.forEach(framework => frameworks.add(framework));
    }
    
    return Array.from(frameworks);
  }

  /**
   * Get all tags
   */
  public getAllTags(): string[] {
    const tags = new Set<string>();
    
    for (const template of this.getAllTemplates()) {
      template.tags.forEach(tag => tags.add(tag));
    }
    
    return Array.from(tags).sort();
  }

  /**
   * Load templates from directory
   */
  public async loadFromDirectory(directory: string): Promise<SecurityTemplate[]> {
    const loadedTemplates: SecurityTemplate[] = [];

    try {
      const files = await fs.readdir(directory, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile() && (file.name.endsWith('.json') || file.name.endsWith('.yaml'))) {
          try {
            const filePath = join(directory, file.name);
            const template = await this.loadTemplateFromFile(filePath);
            
            if (template) {
              await this.register(template);
              loadedTemplates.push(template);
            }
          } catch (error) {
            console.error(`Failed to load template from ${file.name}:`, error);
          }
        }
      }

      console.log(`Loaded ${loadedTemplates.length} templates from ${directory}`);
      return loadedTemplates;
    } catch (error) {
      console.error(`Failed to load templates from directory ${directory}:`, error);
      return [];
    }
  }

  /**
   * Export templates to directory
   */
  public async exportToDirectory(
    directory: string, 
    templateIds?: string[],
    options: { format?: 'json' | 'yaml'; includeBuiltIn?: boolean } = {}
  ): Promise<string[]> {
    const { format = 'json', includeBuiltIn = false } = options;
    const exportedPaths: string[] = [];

    try {
      await fs.mkdir(resolve(directory), { recursive: true });

      let templatesToExport: SecurityTemplate[];
      if (templateIds) {
        templatesToExport = (await Promise.all(
          templateIds.map(id => this.getTemplate(id))
        )).filter((template): template is SecurityTemplate => template !== null);
      } else {
        templatesToExport = includeBuiltIn ? 
          this.getAllTemplates() : 
          this.getCustomTemplates();
      }

      for (const template of templatesToExport) {
        const filename = `${template.id}.${format}`;
        const filePath = join(directory, filename);
        
        let content: string;
        if (format === 'json') {
          content = JSON.stringify(template, null, 2);
        } else {
          // YAML export would go here
          content = JSON.stringify(template, null, 2); // Fallback to JSON
        }

        await fs.writeFile(filePath, content, 'utf-8');
        exportedPaths.push(filePath);
      }

      console.log(`Exported ${templatesToExport.length} templates to ${directory}`);
      return exportedPaths;
    } catch (error) {
      console.error(`Failed to export templates to directory ${directory}:`, error);
      return [];
    }
  }

  /**
   * Get registry statistics
   */
  public getStatistics(): {
    totalTemplates: number;
    builtInCount: number;
    customCount: number;
    cacheSize: number;
    cacheHitRate: number;
    categoryCounts: Record<TemplateCategory, number>;
    complianceCounts: Record<ComplianceFramework, number>;
  } {
    const allTemplates = this.getAllTemplates();
    const categoryCounts = {} as Record<TemplateCategory, number>;
    const complianceCounts = {} as Record<ComplianceFramework, number>;

    // Initialize counts
    const categories: TemplateCategory[] = ['development', 'production', 'compliance', 'custom'];
    const frameworks: ComplianceFramework[] = ['SOC2', 'GDPR', 'HIPAA', 'PCI-DSS', 'ISO27001'];
    
    categories.forEach(cat => categoryCounts[cat] = 0);
    frameworks.forEach(fw => complianceCounts[fw] = 0);

    // Count categories and compliance frameworks
    for (const template of allTemplates) {
      categoryCounts[template.category]++;
      template.compliance.forEach(framework => complianceCounts[framework]++);
    }

    // Calculate cache statistics
    let totalAccesses = 0;
    let cacheHits = 0;
    
    for (const entry of this.templateCache.values()) {
      totalAccesses += entry.accessCount;
      if (entry.accessCount > 1) {
        cacheHits += entry.accessCount - 1;
      }
    }

    const cacheHitRate = totalAccesses > 0 ? (cacheHits / totalAccesses) * 100 : 0;

    return {
      totalTemplates: allTemplates.length,
      builtInCount: this.builtInTemplates.size,
      customCount: this.customTemplates.size,
      cacheSize: this.templateCache.size,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      categoryCounts,
      complianceCounts
    };
  }

  /**
   * Clear expired cache entries
   */
  public cleanupCache(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.templateCache.entries()) {
      const age = now.getTime() - entry.timestamp.getTime();
      if (age > this.options.cacheTTL!) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.templateCache.delete(key);
    }

    // Enforce max cache size
    if (this.templateCache.size > this.options.maxCacheSize!) {
      const entries = Array.from(this.templateCache.entries())
        .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime());
      
      const toRemove = entries.slice(0, this.templateCache.size - this.options.maxCacheSize!);
      for (const [key] of toRemove) {
        this.templateCache.delete(key);
      }
    }

    console.log(`Cleaned up ${expiredKeys.length} expired cache entries`);
  }

  /**
   * Shutdown registry and cleanup resources
   */
  public async shutdown(): Promise<void> {
    // Clear all caches
    this.templateCache.clear();
    this.templateMetadata.clear();
    
    console.log('Template registry shut down');
  }

  // Private helper methods

  private getFromCache(templateId: string): SecurityTemplate | null {
    const entry = this.templateCache.get(templateId);
    if (!entry) {
      return null;
    }

    // Check if expired
    const age = Date.now() - entry.timestamp.getTime();
    if (age > this.options.cacheTTL!) {
      this.templateCache.delete(templateId);
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = new Date();

    return entry.template;
  }

  private addToCache(templateId: string, template: SecurityTemplate): void {
    // Enforce cache size limit
    if (this.templateCache.size >= this.options.maxCacheSize!) {
      this.cleanupCache();
    }

    this.templateCache.set(templateId, {
      template,
      timestamp: new Date(),
      accessCount: 1,
      lastAccessed: new Date()
    });
  }

  private invalidateTemplateCache(templateId: string): void {
    this.templateCache.delete(templateId);
  }

  private updateTemplateMetadata(template: SecurityTemplate): void {
    this.templateMetadata.set(template.id, {
      id: template.id,
      name: template.name,
      category: template.category,
      version: template.version,
      tags: template.tags,
      compliance: template.compliance,
      isBuiltIn: template.isBuiltIn,
      lastModified: template.updatedAt
    });
  }

  private async persistTemplate(template: SecurityTemplate): Promise<void> {
    if (!this.options.customTemplatesDir) return;

    const filename = `${template.id}.json`;
    const filePath = join(this.options.customTemplatesDir, filename);
    const content = JSON.stringify(template, null, 2);
    
    await fs.writeFile(filePath, content, 'utf-8');
  }

  private async removePersistedTemplate(templateId: string): Promise<void> {
    if (!this.options.customTemplatesDir) return;

    const filename = `${templateId}.json`;
    const filePath = join(this.options.customTemplatesDir, filename);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File may not exist, ignore error
    }
  }

  private async loadPersistedTemplate(templateId: string): Promise<SecurityTemplate | null> {
    if (!this.options.customTemplatesDir) return null;

    const filename = `${templateId}.json`;
    const filePath = join(this.options.customTemplatesDir, filename);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as SecurityTemplate;
    } catch (error) {
      return null;
    }
  }

  private async loadTemplateFromFile(filePath: string): Promise<SecurityTemplate | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const template = JSON.parse(content) as SecurityTemplate;
      
      // Basic validation
      if (!template.id || !template.name || !template.rules) {
        console.error(`Invalid template structure in ${filePath}`);
        return null;
      }

      return template;
    } catch (error) {
      console.error(`Failed to load template from ${filePath}:`, error);
      return null;
    }
  }

  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    
    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  }

  private sortTemplatesByRelevance(
    templates: SecurityTemplate[], 
    criteria: TemplateSearchCriteria
  ): SecurityTemplate[] {
    return templates.sort((a, b) => {
      // Built-in templates get higher priority
      if (a.isBuiltIn && !b.isBuiltIn) return -1;
      if (!a.isBuiltIn && b.isBuiltIn) return 1;
      
      // More recent updates get higher priority
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }
}