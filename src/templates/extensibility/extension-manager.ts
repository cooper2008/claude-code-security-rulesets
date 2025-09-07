import {
  ExtendableTemplate,
  TemplateExtension,
  TemplateBuildContext,
  CustomValidationRule,
  TemplateValidationResult,
  CompositionConfig
} from './types';
import { ClaudeCodeConfiguration } from '../../types';
import { TemplateInheritanceEngine } from './inheritance';
import { TemplateComposer } from './composition';
import { TemplateValidator } from './validation';
import { TemplatePluginManager } from './plugins';
import { CustomTemplateBuilder } from './custom-builder';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Extension lifecycle states
 */
export type ExtensionLifecycleState = 
  | 'draft'
  | 'testing'
  | 'approved' 
  | 'deployed'
  | 'deprecated'
  | 'archived';

/**
 * Extension registry entry
 */
export interface ExtensionRegistryEntry {
  /** Extension metadata */
  extension: TemplateExtension;
  /** Current lifecycle state */
  state: ExtensionLifecycleState;
  /** State history */
  stateHistory: StateTransition[];
  /** Dependencies */
  dependencies: string[];
  /** Dependents (extensions that depend on this one) */
  dependents: string[];
  /** Usage metrics */
  metrics: ExtensionMetrics;
  /** Storage location */
  storage: {
    path: string;
    checksum: string;
    size: number;
  };
}

/**
 * State transition record
 */
export interface StateTransition {
  from: ExtensionLifecycleState;
  to: ExtensionLifecycleState;
  timestamp: Date;
  reason: string;
  approvedBy?: string;
}

/**
 * Extension metrics
 */
export interface ExtensionMetrics {
  installations: number;
  activeUsage: number;
  lastUsed: Date;
  errorRate: number;
  performanceScore: number;
  userRating: number;
  downloadCount: number;
}

/**
 * Extension deployment configuration
 */
export interface ExtensionDeploymentConfig {
  /** Deployment target environment */
  environment: string;
  /** Rollout strategy */
  rolloutStrategy: 'immediate' | 'gradual' | 'canary';
  /** Rollout percentage (for gradual deployments) */
  rolloutPercentage?: number;
  /** Health check configuration */
  healthCheck: {
    enabled: boolean;
    endpoint?: string;
    timeout: number;
    retries: number;
  };
  /** Rollback configuration */
  rollback: {
    enabled: boolean;
    triggers: string[];
    timeout: number;
  };
}

/**
 * Extension marketplace entry
 */
export interface MarketplaceEntry {
  /** Extension ID */
  extensionId: string;
  /** Publisher information */
  publisher: {
    name: string;
    verified: boolean;
    contact: string;
  };
  /** Publication metadata */
  publication: {
    publishedAt: Date;
    version: string;
    changelog: string;
    license: string;
  };
  /** Marketplace metadata */
  marketplace: {
    category: string[];
    featured: boolean;
    rating: number;
    downloads: number;
    reviews: MarketplaceReview[];
  };
}

/**
 * Marketplace review
 */
export interface MarketplaceReview {
  userId: string;
  rating: number;
  comment: string;
  timestamp: Date;
  helpful: number;
}

/**
 * Template extension manager for lifecycle management
 */
export class TemplateExtensionManager extends EventEmitter {
  private inheritanceEngine: TemplateInheritanceEngine;
  private composer: TemplateComposer;
  private validator: TemplateValidator;
  private pluginManager: TemplatePluginManager;
  private templateBuilder: CustomTemplateBuilder;
  
  private registry: Map<string, ExtensionRegistryEntry> = new Map();
  private marketplace: Map<string, MarketplaceEntry> = new Map();
  private deployments: Map<string, ExtensionDeploymentConfig> = new Map();
  
  private config: ExtensionManagerConfig;
  private storageRoot: string;

  constructor(config: ExtensionManagerConfig) {
    super();
    this.config = {
      storageRoot: './extensions',
      enableMarketplace: false,
      autoApproval: false,
      maxExtensionsPerTemplate: 20,
      enableMetrics: true,
      enableVersioning: true,
      ...config
    };
    
    this.storageRoot = this.config.storageRoot;
    
    // Initialize components
    this.inheritanceEngine = new TemplateInheritanceEngine();
    this.composer = new TemplateComposer();
    this.validator = new TemplateValidator();
    this.pluginManager = new TemplatePluginManager();
    this.templateBuilder = new CustomTemplateBuilder();
  }

  /**
   * Initialize the extension manager
   */
  public async initialize(): Promise<void> {
    // Ensure storage directories exist
    await this.ensureStorageDirectories();
    
    // Load existing extensions
    await this.loadExtensionsFromStorage();
    
    // Initialize marketplace if enabled
    if (this.config.enableMarketplace) {
      await this.initializeMarketplace();
    }
    
    this.emit('initialized');
  }

  /**
   * Create a new template extension
   */
  public async createExtension(
    templateId: string,
    extensionData: Partial<TemplateExtension>,
    context: TemplateBuildContext
  ): Promise<TemplateExtension> {
    // Generate extension ID if not provided
    const extensionId = extensionData.id || this.generateExtensionId();
    
    // Create extension
    const extension: TemplateExtension = {
      id: extensionId,
      name: extensionData.name || `Extension for ${templateId}`,
      type: extensionData.type || 'extend',
      targetTemplateId: templateId,
      rules: extensionData.rules || { deny: [], allow: [] },
      removeRules: extensionData.removeRules || [],
      priority: extensionData.priority || 100,
      metadata: {
        description: extensionData.metadata?.description || '',
        author: extensionData.metadata?.author || 'Unknown',
        version: extensionData.metadata?.version || '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...extensionData.metadata
      },
      conditions: extensionData.conditions || []
    };

    // Validate extension
    const isValid = await this.validator.validateExtension(extension, context);
    if (!isValid) {
      throw new Error('Extension validation failed');
    }

    // Save extension to storage
    await this.saveExtensionToStorage(extension);

    // Create registry entry
    const registryEntry: ExtensionRegistryEntry = {
      extension,
      state: 'draft',
      stateHistory: [{
        from: 'draft' as ExtensionLifecycleState,
        to: 'draft' as ExtensionLifecycleState,
        timestamp: new Date(),
        reason: 'Extension created'
      }],
      dependencies: this.extractDependencies(extension),
      dependents: [],
      metrics: this.initializeMetrics(),
      storage: {
        path: this.getExtensionPath(extension.id),
        checksum: await this.calculateChecksum(extension),
        size: JSON.stringify(extension).length
      }
    };

    // Register extension
    this.registry.set(extension.id, registryEntry);

    this.emit('extension-created', { extensionId: extension.id, extension });
    return extension;
  }

  /**
   * Update an existing extension
   */
  public async updateExtension(
    extensionId: string,
    updates: Partial<TemplateExtension>,
    context: TemplateBuildContext
  ): Promise<TemplateExtension> {
    const entry = this.registry.get(extensionId);
    if (!entry) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    // Check if extension can be updated
    if (!this.canModifyExtension(entry)) {
      throw new Error(`Extension ${extensionId} cannot be modified in current state: ${entry.state}`);
    }

    // Apply updates
    const updatedExtension: TemplateExtension = {
      ...entry.extension,
      ...updates,
      metadata: {
        ...entry.extension.metadata,
        ...updates.metadata,
        updatedAt: new Date()
      }
    };

    // Validate updated extension
    const isValid = await this.validator.validateExtension(updatedExtension, context);
    if (!isValid) {
      throw new Error('Updated extension validation failed');
    }

    // Save updated extension
    await this.saveExtensionToStorage(updatedExtension);

    // Update registry entry
    entry.extension = updatedExtension;
    entry.storage.checksum = await this.calculateChecksum(updatedExtension);
    entry.storage.size = JSON.stringify(updatedExtension).length;

    this.emit('extension-updated', { extensionId, extension: updatedExtension });
    return updatedExtension;
  }

  /**
   * Delete an extension
   */
  public async deleteExtension(extensionId: string): Promise<boolean> {
    const entry = this.registry.get(extensionId);
    if (!entry) {
      return false;
    }

    // Check dependencies
    if (entry.dependents.length > 0) {
      throw new Error(`Cannot delete extension ${extensionId}: it has dependents`);
    }

    // Remove from storage
    await this.removeExtensionFromStorage(extensionId);

    // Remove from registry
    this.registry.delete(extensionId);

    // Remove from marketplace if published
    this.marketplace.delete(extensionId);

    this.emit('extension-deleted', { extensionId });
    return true;
  }

  /**
   * Transition extension lifecycle state
   */
  public async transitionExtensionState(
    extensionId: string,
    newState: ExtensionLifecycleState,
    reason: string,
    approvedBy?: string
  ): Promise<boolean> {
    const entry = this.registry.get(extensionId);
    if (!entry) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    const currentState = entry.state;
    
    // Validate state transition
    if (!this.isValidStateTransition(currentState, newState)) {
      throw new Error(`Invalid state transition: ${currentState} → ${newState}`);
    }

    // Check approval requirements
    if (this.requiresApproval(currentState, newState) && !approvedBy) {
      throw new Error(`State transition ${currentState} → ${newState} requires approval`);
    }

    // Record state transition
    const transition: StateTransition = {
      from: currentState,
      to: newState,
      timestamp: new Date(),
      reason,
      approvedBy
    };

    entry.state = newState;
    entry.stateHistory.push(transition);

    // Handle state-specific actions
    await this.handleStateTransition(extensionId, transition);

    this.emit('extension-state-changed', { extensionId, from: currentState, to: newState });
    return true;
  }

  /**
   * Deploy extension to environment
   */
  public async deployExtension(
    extensionId: string,
    deploymentConfig: ExtensionDeploymentConfig
  ): Promise<DeploymentResult> {
    const entry = this.registry.get(extensionId);
    if (!entry) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    // Check if extension is ready for deployment
    if (entry.state !== 'approved') {
      throw new Error(`Extension ${extensionId} must be approved before deployment`);
    }

    const deployment: ExtensionDeployment = {
      extensionId,
      config: deploymentConfig,
      startTime: new Date(),
      status: 'deploying'
    };

    try {
      // Execute deployment based on strategy
      const result = await this.executeDeployment(deployment);
      
      // Update extension state if deployment successful
      if (result.success) {
        await this.transitionExtensionState(
          extensionId, 
          'deployed', 
          `Deployed to ${deploymentConfig.environment}`
        );
      }

      return result;

    } catch (error) {
      // Handle deployment failure
      await this.handleDeploymentFailure(deployment, error as Error);
      throw error;
    }
  }

  /**
   * Rollback extension deployment
   */
  public async rollbackExtension(
    extensionId: string,
    reason: string
  ): Promise<boolean> {
    const deploymentConfig = this.deployments.get(extensionId);
    if (!deploymentConfig || !deploymentConfig.rollback.enabled) {
      throw new Error(`Rollback not available for extension: ${extensionId}`);
    }

    try {
      // Execute rollback
      await this.executeRollback(extensionId, deploymentConfig);

      // Update extension state
      await this.transitionExtensionState(
        extensionId,
        'approved',
        `Rolled back: ${reason}`
      );

      this.emit('extension-rolled-back', { extensionId, reason });
      return true;

    } catch (error) {
      this.emit('extension-rollback-failed', { extensionId, error });
      throw error;
    }
  }

  /**
   * Apply extensions to a template
   */
  public async applyExtensions(
    template: ExtendableTemplate,
    context: TemplateBuildContext,
    extensionIds?: string[]
  ): Promise<ExtendableTemplate> {
    // Get applicable extensions
    const extensions = this.getApplicableExtensions(template.id, extensionIds);
    
    // Sort by priority
    extensions.sort((a, b) => a.extension.priority - b.extension.priority);

    let result = { ...template };

    // Apply each extension
    for (const entry of extensions) {
      try {
        result = await this.applyExtension(result, entry.extension, context);
        
        // Update usage metrics
        this.updateExtensionMetrics(entry.extension.id, 'usage');
        
      } catch (error) {
        // Log error and continue with other extensions
        this.emit('extension-apply-error', {
          extensionId: entry.extension.id,
          error: (error as Error).message
        });
        
        // Update error metrics
        this.updateExtensionMetrics(entry.extension.id, 'error');
      }
    }

    return result;
  }

  /**
   * Publish extension to marketplace
   */
  public async publishExtension(
    extensionId: string,
    publisherInfo: {
      name: string;
      contact: string;
      license: string;
      changelog: string;
    }
  ): Promise<MarketplaceEntry> {
    if (!this.config.enableMarketplace) {
      throw new Error('Marketplace is not enabled');
    }

    const entry = this.registry.get(extensionId);
    if (!entry) {
      throw new Error(`Extension not found: ${extensionId}`);
    }

    if (entry.state !== 'approved') {
      throw new Error('Extension must be approved before publishing');
    }

    const marketplaceEntry: MarketplaceEntry = {
      extensionId,
      publisher: {
        name: publisherInfo.name,
        verified: false, // Would be set by marketplace admin
        contact: publisherInfo.contact
      },
      publication: {
        publishedAt: new Date(),
        version: entry.extension.metadata.version,
        changelog: publisherInfo.changelog,
        license: publisherInfo.license
      },
      marketplace: {
        category: [entry.extension.type],
        featured: false,
        rating: 0,
        downloads: 0,
        reviews: []
      }
    };

    this.marketplace.set(extensionId, marketplaceEntry);
    this.emit('extension-published', { extensionId, marketplaceEntry });

    return marketplaceEntry;
  }

  /**
   * Get extension metrics
   */
  public getExtensionMetrics(extensionId: string): ExtensionMetrics | undefined {
    const entry = this.registry.get(extensionId);
    return entry?.metrics;
  }

  /**
   * List extensions
   */
  public listExtensions(filter?: {
    state?: ExtensionLifecycleState;
    templateId?: string;
    author?: string;
  }): ExtensionRegistryEntry[] {
    let entries = Array.from(this.registry.values());

    if (filter) {
      if (filter.state) {
        entries = entries.filter(e => e.state === filter.state);
      }
      if (filter.templateId) {
        entries = entries.filter(e => e.extension.targetTemplateId === filter.templateId);
      }
      if (filter.author) {
        entries = entries.filter(e => e.extension.metadata.author === filter.author);
      }
    }

    return entries;
  }

  /**
   * Get extension dependency graph
   */
  public getDependencyGraph(extensionId: string): DependencyGraph {
    const visited = new Set<string>();
    
    const buildGraph = (id: string): DependencyNode => {
      if (visited.has(id)) {
        return { extensionId: id, dependencies: [], circular: true };
      }
      
      visited.add(id);
      const entry = this.registry.get(id);
      
      if (!entry) {
        return { extensionId: id, dependencies: [], missing: true };
      }
      
      const dependencies = entry.dependencies.map(depId => buildGraph(depId));
      visited.delete(id);
      
      return {
        extensionId: id,
        dependencies,
        extension: entry.extension
      };
    };

    return { root: buildGraph(extensionId) };
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    // Cleanup plugin manager
    await this.pluginManager.cleanup();
    
    // Clear registries
    this.registry.clear();
    this.marketplace.clear();
    this.deployments.clear();
    
    // Remove listeners
    this.removeAllListeners();
  }

  /**
   * Ensure storage directories exist
   */
  private async ensureStorageDirectories(): Promise<void> {
    const dirs = [
      this.storageRoot,
      path.join(this.storageRoot, 'extensions'),
      path.join(this.storageRoot, 'marketplace'),
      path.join(this.storageRoot, 'deployments')
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        // Directory might already exist
      }
    }
  }

  /**
   * Load extensions from storage
   */
  private async loadExtensionsFromStorage(): Promise<void> {
    const extensionsDir = path.join(this.storageRoot, 'extensions');
    
    try {
      const files = await fs.readdir(extensionsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(extensionsDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const entry: ExtensionRegistryEntry = JSON.parse(content);
            
            this.registry.set(entry.extension.id, entry);
          } catch (error) {
            console.warn(`Failed to load extension from ${file}:`, error);
          }
        }
      }
    } catch (error) {
      // Extensions directory might not exist yet
    }
  }

  /**
   * Save extension to storage
   */
  private async saveExtensionToStorage(extension: TemplateExtension): Promise<void> {
    const entry = this.registry.get(extension.id);
    if (!entry) return;

    const filePath = this.getExtensionPath(extension.id);
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
  }

  /**
   * Remove extension from storage
   */
  private async removeExtensionFromStorage(extensionId: string): Promise<void> {
    const filePath = this.getExtensionPath(extensionId);
    
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist
    }
  }

  /**
   * Get extension file path
   */
  private getExtensionPath(extensionId: string): string {
    return path.join(this.storageRoot, 'extensions', `${extensionId}.json`);
  }

  /**
   * Initialize marketplace
   */
  private async initializeMarketplace(): Promise<void> {
    // Load marketplace entries from storage
    const marketplaceDir = path.join(this.storageRoot, 'marketplace');
    
    try {
      const files = await fs.readdir(marketplaceDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(marketplaceDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const entry: MarketplaceEntry = JSON.parse(content);
            
            this.marketplace.set(entry.extensionId, entry);
          } catch (error) {
            console.warn(`Failed to load marketplace entry from ${file}:`, error);
          }
        }
      }
    } catch (error) {
      // Marketplace directory might not exist yet
    }
  }

  /**
   * Check if extension can be modified
   */
  private canModifyExtension(entry: ExtensionRegistryEntry): boolean {
    return ['draft', 'testing'].includes(entry.state);
  }

  /**
   * Check if state transition is valid
   */
  private isValidStateTransition(
    from: ExtensionLifecycleState,
    to: ExtensionLifecycleState
  ): boolean {
    const validTransitions: Record<ExtensionLifecycleState, ExtensionLifecycleState[]> = {
      'draft': ['testing', 'archived'],
      'testing': ['draft', 'approved', 'archived'],
      'approved': ['deployed', 'deprecated', 'archived'],
      'deployed': ['deprecated', 'approved'],
      'deprecated': ['archived'],
      'archived': []
    };

    return validTransitions[from].includes(to);
  }

  /**
   * Check if state transition requires approval
   */
  private requiresApproval(
    from: ExtensionLifecycleState,
    to: ExtensionLifecycleState
  ): boolean {
    if (this.config.autoApproval) return false;
    
    const requiresApprovalTransitions = [
      ['testing', 'approved'],
      ['approved', 'deployed']
    ];

    return requiresApprovalTransitions.some(
      ([f, t]) => f === from && t === to
    );
  }

  /**
   * Handle state transition actions
   */
  private async handleStateTransition(
    extensionId: string,
    transition: StateTransition
  ): Promise<void> {
    switch (transition.to) {
      case 'testing':
        await this.runExtensionTests(extensionId);
        break;
      case 'deployed':
        await this.activateExtension(extensionId);
        break;
      case 'deprecated':
        await this.deprecateExtension(extensionId);
        break;
      case 'archived':
        await this.archiveExtension(extensionId);
        break;
    }
  }

  /**
   * Execute deployment
   */
  private async executeDeployment(deployment: ExtensionDeployment): Promise<DeploymentResult> {
    const startTime = Date.now();
    
    try {
      // Store deployment config
      this.deployments.set(deployment.extensionId, deployment.config);
      
      // Execute based on strategy
      switch (deployment.config.rolloutStrategy) {
        case 'immediate':
          await this.executeImmediateDeployment(deployment);
          break;
        case 'gradual':
          await this.executeGradualDeployment(deployment);
          break;
        case 'canary':
          await this.executeCanaryDeployment(deployment);
          break;
      }

      return {
        success: true,
        deploymentTime: Date.now() - startTime,
        environment: deployment.config.environment
      };
      
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        deploymentTime: Date.now() - startTime,
        environment: deployment.config.environment
      };
    }
  }

  /**
   * Get applicable extensions for a template
   */
  private getApplicableExtensions(
    templateId: string,
    extensionIds?: string[]
  ): ExtensionRegistryEntry[] {
    return Array.from(this.registry.values())
      .filter(entry => {
        // Check if extension targets this template
        if (entry.extension.targetTemplateId !== templateId) return false;
        
        // Check if extension is in deployed state
        if (entry.state !== 'deployed') return false;
        
        // Check if specific extension IDs are requested
        if (extensionIds && !extensionIds.includes(entry.extension.id)) return false;
        
        return true;
      });
  }

  /**
   * Apply single extension to template
   */
  private async applyExtension(
    template: ExtendableTemplate,
    extension: TemplateExtension,
    context: TemplateBuildContext
  ): Promise<ExtendableTemplate> {
    let result = { ...template };

    // Apply rule additions/modifications
    if (extension.rules) {
      result.rules = this.composer.mergeConfigurations(
        result.rules,
        extension.rules,
        { rules: 'deep_merge', arrays: 'unique_merge', objects: 'deep_merge', parameters: 'validate_merge' }
      );
    }

    // Apply rule removals
    if (extension.removeRules && extension.removeRules.length > 0) {
      result.rules = this.removeRulesFromConfiguration(result.rules, extension.removeRules);
    }

    return result;
  }

  /**
   * Remove rules from configuration by path
   */
  private removeRulesFromConfiguration(
    config: ClaudeCodeConfiguration,
    rulePaths: string[]
  ): ClaudeCodeConfiguration {
    const result = { ...config };
    
    for (const path of rulePaths) {
      this.deleteByPath(result, path);
    }
    
    return result;
  }

  /**
   * Delete property by path
   */
  private deleteByPath(obj: any, path: string): void {
    const parts = path.split('.');
    const last = parts.pop();
    
    if (!last) return;
    
    const target = parts.reduce((current, part) => {
      return current && typeof current === 'object' ? current[part] : undefined;
    }, obj);
    
    if (target && typeof target === 'object') {
      if (Array.isArray(target) && !isNaN(parseInt(last))) {
        target.splice(parseInt(last), 1);
      } else {
        delete target[last];
      }
    }
  }

  /**
   * Extract dependencies from extension
   */
  private extractDependencies(extension: TemplateExtension): string[] {
    // Simple implementation - in practice, you'd parse the extension
    // content to find actual dependencies
    return [];
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): ExtensionMetrics {
    return {
      installations: 0,
      activeUsage: 0,
      lastUsed: new Date(),
      errorRate: 0,
      performanceScore: 100,
      userRating: 0,
      downloadCount: 0
    };
  }

  /**
   * Update extension metrics
   */
  private updateExtensionMetrics(extensionId: string, type: 'usage' | 'error' | 'install'): void {
    const entry = this.registry.get(extensionId);
    if (!entry) return;

    switch (type) {
      case 'usage':
        entry.metrics.activeUsage++;
        entry.metrics.lastUsed = new Date();
        break;
      case 'error':
        entry.metrics.errorRate = (entry.metrics.errorRate + 1) / 2; // Simple moving average
        break;
      case 'install':
        entry.metrics.installations++;
        break;
    }
  }

  /**
   * Calculate checksum for extension
   */
  private async calculateChecksum(extension: TemplateExtension): Promise<string> {
    const content = JSON.stringify(extension, Object.keys(extension).sort());
    return Buffer.from(content).toString('base64').slice(0, 16);
  }

  /**
   * Generate extension ID
   */
  private generateExtensionId(): string {
    return `ext-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Placeholder methods for deployment strategies
  private async executeImmediateDeployment(deployment: ExtensionDeployment): Promise<void> {
    // Implementation for immediate deployment
  }

  private async executeGradualDeployment(deployment: ExtensionDeployment): Promise<void> {
    // Implementation for gradual deployment
  }

  private async executeCanaryDeployment(deployment: ExtensionDeployment): Promise<void> {
    // Implementation for canary deployment
  }

  private async executeRollback(extensionId: string, config: ExtensionDeploymentConfig): Promise<void> {
    // Implementation for rollback
  }

  private async handleDeploymentFailure(deployment: ExtensionDeployment, error: Error): Promise<void> {
    // Implementation for deployment failure handling
  }

  private async runExtensionTests(extensionId: string): Promise<void> {
    // Implementation for running extension tests
  }

  private async activateExtension(extensionId: string): Promise<void> {
    // Implementation for activating extension
  }

  private async deprecateExtension(extensionId: string): Promise<void> {
    // Implementation for deprecating extension
  }

  private async archiveExtension(extensionId: string): Promise<void> {
    // Implementation for archiving extension
  }
}

/**
 * Extension manager configuration
 */
export interface ExtensionManagerConfig {
  storageRoot?: string;
  enableMarketplace?: boolean;
  autoApproval?: boolean;
  maxExtensionsPerTemplate?: number;
  enableMetrics?: boolean;
  enableVersioning?: boolean;
}

/**
 * Extension deployment
 */
export interface ExtensionDeployment {
  extensionId: string;
  config: ExtensionDeploymentConfig;
  startTime: Date;
  status: 'deploying' | 'deployed' | 'failed' | 'rolling-back';
}

/**
 * Deployment result
 */
export interface DeploymentResult {
  success: boolean;
  error?: string;
  deploymentTime: number;
  environment: string;
}

/**
 * Dependency graph
 */
export interface DependencyGraph {
  root: DependencyNode;
}

/**
 * Dependency node
 */
export interface DependencyNode {
  extensionId: string;
  dependencies: DependencyNode[];
  extension?: TemplateExtension;
  circular?: boolean;
  missing?: boolean;
}