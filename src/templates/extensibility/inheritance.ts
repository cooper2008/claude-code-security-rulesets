import {
  ExtendableTemplate,
  InheritanceMetadata,
  TemplateExtension,
  TemplateBuildContext,
  TemplateValidationResult,
  ExtensionType,
  InheritanceLevel,
  MergeStrategy,
  ConflictResolution
} from './types';
import { SecurityTemplate, ClaudeCodeConfiguration } from '../../types';
import { TemplateComposer } from './composition';
import { TemplateValidator } from './validation';

/**
 * Template inheritance engine that handles template hierarchies
 */
export class TemplateInheritanceEngine {
  private composer: TemplateComposer;
  private validator: TemplateValidator;
  private templates: Map<string, ExtendableTemplate> = new Map();
  private inheritanceCache: Map<string, ExtendableTemplate> = new Map();

  constructor() {
    this.composer = new TemplateComposer();
    this.validator = new TemplateValidator();
  }

  /**
   * Register a template in the inheritance system
   */
  public registerTemplate(template: ExtendableTemplate): void {
    this.templates.set(template.id, template);
    this.invalidateCache(template.id);
  }

  /**
   * Create an inheritance chain for a template
   */
  public async createInheritanceChain(
    templateId: string,
    context: TemplateBuildContext
  ): Promise<ExtendableTemplate[]> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const chain: ExtendableTemplate[] = [];
    const visited = new Set<string>();
    
    await this.buildChain(template, chain, visited, context);
    
    // Reverse to get root-to-leaf order
    return chain.reverse();
  }

  /**
   * Resolve a template with all its inheritance applied
   */
  public async resolveTemplate(
    templateId: string,
    context: TemplateBuildContext
  ): Promise<ExtendableTemplate> {
    // Check cache first
    const cacheKey = this.getCacheKey(templateId, context);
    const cached = this.inheritanceCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Build inheritance chain
    const chain = await this.createInheritanceChain(templateId, context);
    
    // Apply inheritance from root to leaf
    let resolved = await this.createBaseTemplate(chain[0]);
    
    for (let i = 1; i < chain.length; i++) {
      resolved = await this.applyInheritance(resolved, chain[i], context);
    }

    // Apply extensions
    resolved = await this.applyExtensions(resolved, context);

    // Validate final result
    const validationResult = await this.validator.validateTemplate(resolved, context);
    if (!validationResult.isValid) {
      throw new Error(`Template validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    // Cache result
    this.inheritanceCache.set(cacheKey, resolved);
    
    return resolved;
  }

  /**
   * Create a new template that inherits from a parent
   */
  public async createInheritedTemplate(
    parentId: string,
    templateData: Partial<ExtendableTemplate>,
    inheritanceType: ExtensionType = 'inherit'
  ): Promise<ExtendableTemplate> {
    const parent = this.templates.get(parentId);
    if (!parent) {
      throw new Error(`Parent template not found: ${parentId}`);
    }

    // Validate inheritance permissions
    await this.validateInheritancePermissions(parent, inheritanceType);

    // Create inheritance metadata
    const inheritance: InheritanceMetadata = {
      parentId,
      level: this.inferInheritanceLevel(parent.inheritance.level),
      extensionType: inheritanceType,
      chain: [...parent.inheritance.chain, parentId],
      compatibility: {
        minParentVersion: parent.version,
        maxParentVersion: this.getNextMajorVersion(parent.version)
      },
      permissions: {
        canOverrideRules: true,
        canAddRules: true,
        canRemoveRules: false,
        canModifyMetadata: true,
        ...templateData.inheritance?.permissions
      }
    };

    // Create the new template
    const newTemplate: ExtendableTemplate = {
      ...templateData,
      id: templateData.id || this.generateTemplateId(),
      name: templateData.name || `${parent.name} (Extended)`,
      category: templateData.category || parent.category,
      rules: templateData.rules || {},
      description: templateData.description || `Extended from ${parent.name}`,
      compliance: templateData.compliance || [],
      version: templateData.version || '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: templateData.tags || [],
      isBuiltIn: false,
      parameters: templateData.parameters || [],
      inheritance,
      scope: templateData.scope || {},
      extensions: templateData.extensions || []
    } as ExtendableTemplate;

    // Register the new template
    this.registerTemplate(newTemplate);

    return newTemplate;
  }

  /**
   * Update template inheritance
   */
  public async updateInheritance(
    templateId: string,
    updates: Partial<InheritanceMetadata>
  ): Promise<ExtendableTemplate> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate update permissions
    if (template.locked?.isLocked) {
      throw new Error(`Template is locked: ${template.locked.reason}`);
    }

    // Apply updates
    const updatedTemplate: ExtendableTemplate = {
      ...template,
      inheritance: {
        ...template.inheritance,
        ...updates
      },
      updatedAt: new Date()
    };

    // Validate the updated inheritance
    await this.validateInheritanceChain(updatedTemplate);

    // Update template
    this.registerTemplate(updatedTemplate);

    return updatedTemplate;
  }

  /**
   * Get inheritance tree for a template
   */
  public getInheritanceTree(templateId: string): InheritanceTree {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return this.buildInheritanceTree(template);
  }

  /**
   * Find templates that inherit from a given template
   */
  public findChildTemplates(parentId: string): ExtendableTemplate[] {
    return Array.from(this.templates.values())
      .filter(template => template.inheritance.parentId === parentId);
  }

  /**
   * Check if a template can be modified
   */
  public canModifyTemplate(templateId: string, userId: string): boolean {
    const template = this.templates.get(templateId);
    if (!template) {
      return false;
    }

    // Check if template is locked
    if (template.locked?.isLocked && template.locked.lockedBy !== userId) {
      return false;
    }

    // Check if it's a built-in template
    if (template.isBuiltIn) {
      return false;
    }

    return true;
  }

  /**
   * Lock a template to prevent modifications
   */
  public async lockTemplate(
    templateId: string,
    userId: string,
    reason: string
  ): Promise<ExtendableTemplate> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const lockedTemplate: ExtendableTemplate = {
      ...template,
      locked: {
        isLocked: true,
        lockedBy: userId,
        lockedAt: new Date(),
        reason
      },
      updatedAt: new Date()
    };

    this.registerTemplate(lockedTemplate);
    return lockedTemplate;
  }

  /**
   * Unlock a template
   */
  public async unlockTemplate(
    templateId: string,
    userId: string
  ): Promise<ExtendableTemplate> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    if (template.locked?.lockedBy !== userId) {
      throw new Error('Only the user who locked the template can unlock it');
    }

    const unlockedTemplate: ExtendableTemplate = {
      ...template,
      locked: {
        isLocked: false
      },
      updatedAt: new Date()
    };

    this.registerTemplate(unlockedTemplate);
    return unlockedTemplate;
  }

  /**
   * Build inheritance chain recursively
   */
  private async buildChain(
    template: ExtendableTemplate,
    chain: ExtendableTemplate[],
    visited: Set<string>,
    context: TemplateBuildContext
  ): Promise<void> {
    // Detect circular inheritance
    if (visited.has(template.id)) {
      throw new Error(`Circular inheritance detected: ${template.id}`);
    }

    visited.add(template.id);
    chain.push(template);

    // Continue with parent if it exists
    if (template.inheritance.parentId) {
      const parent = this.templates.get(template.inheritance.parentId);
      if (!parent) {
        throw new Error(`Parent template not found: ${template.inheritance.parentId}`);
      }

      // Validate compatibility
      await this.validateCompatibility(parent, template);

      await this.buildChain(parent, chain, visited, context);
    }

    visited.delete(template.id);
  }

  /**
   * Apply inheritance from parent to child
   */
  private async applyInheritance(
    parent: ExtendableTemplate,
    child: ExtendableTemplate,
    context: TemplateBuildContext
  ): Promise<ExtendableTemplate> {
    const mergeStrategy: MergeStrategy = {
      rules: 'deep_merge',
      arrays: 'unique_merge',
      objects: 'deep_merge',
      parameters: 'validate_merge'
    };

    const conflictResolution: ConflictResolution = {
      defaultStrategy: child.inheritance.extensionType === 'override' ? 'override' : 'merge',
      interactive: false,
      logConflicts: true
    };

    return this.composer.composeTemplates(
      [parent, child],
      mergeStrategy,
      conflictResolution,
      context
    );
  }

  /**
   * Apply extensions to a template
   */
  private async applyExtensions(
    template: ExtendableTemplate,
    context: TemplateBuildContext
  ): Promise<ExtendableTemplate> {
    if (!template.extensions || template.extensions.length === 0) {
      return template;
    }

    // Sort extensions by priority
    const sortedExtensions = [...template.extensions].sort((a, b) => a.priority - b.priority);

    let result = template;

    for (const extension of sortedExtensions) {
      // Check extension conditions
      if (extension.conditions && !this.evaluateExtensionConditions(extension.conditions, context)) {
        continue;
      }

      result = await this.applyExtension(result, extension, context);
    }

    return result;
  }

  /**
   * Apply a single extension
   */
  private async applyExtension(
    template: ExtendableTemplate,
    extension: TemplateExtension,
    context: TemplateBuildContext
  ): Promise<ExtendableTemplate> {
    let updatedRules = { ...template.rules };

    // Apply rule additions/modifications
    if (extension.rules) {
      updatedRules = this.composer.mergeConfigurations(
        updatedRules,
        extension.rules,
        { rules: 'deep_merge', arrays: 'unique_merge', objects: 'deep_merge', parameters: 'validate_merge' }
      );
    }

    // Apply rule removals
    if (extension.removeRules) {
      updatedRules = this.removeRules(updatedRules, extension.removeRules);
    }

    return {
      ...template,
      rules: updatedRules,
      updatedAt: new Date()
    };
  }

  /**
   * Create base template from the root of inheritance chain
   */
  private async createBaseTemplate(template: ExtendableTemplate): Promise<ExtendableTemplate> {
    return {
      ...template,
      inheritance: {
        ...template.inheritance,
        chain: []
      }
    };
  }

  /**
   * Validate inheritance permissions
   */
  private async validateInheritancePermissions(
    parent: ExtendableTemplate,
    inheritanceType: ExtensionType
  ): Promise<void> {
    if (parent.isBuiltIn && inheritanceType === 'override') {
      throw new Error('Cannot override built-in templates');
    }

    if (parent.locked?.isLocked) {
      throw new Error(`Parent template is locked: ${parent.locked.reason}`);
    }
  }

  /**
   * Validate version compatibility
   */
  private async validateCompatibility(
    parent: ExtendableTemplate,
    child: ExtendableTemplate
  ): Promise<void> {
    const compatibility = child.inheritance.compatibility;
    
    if (compatibility.minParentVersion && 
        this.compareVersions(parent.version, compatibility.minParentVersion) < 0) {
      throw new Error(`Parent version ${parent.version} is below minimum required ${compatibility.minParentVersion}`);
    }

    if (compatibility.maxParentVersion && 
        this.compareVersions(parent.version, compatibility.maxParentVersion) > 0) {
      throw new Error(`Parent version ${parent.version} is above maximum supported ${compatibility.maxParentVersion}`);
    }
  }

  /**
   * Validate inheritance chain
   */
  private async validateInheritanceChain(template: ExtendableTemplate): Promise<void> {
    const chain = await this.createInheritanceChain(template.id, {
      environment: 'development',
      parameters: {},
      availableTemplates: Array.from(this.templates.values()),
      metadata: {
        buildId: 'validation',
        timestamp: new Date(),
        version: '1.0.0'
      }
    });

    // Check for cycles and validate each step
    const visited = new Set<string>();
    for (const chainTemplate of chain) {
      if (visited.has(chainTemplate.id)) {
        throw new Error('Circular dependency detected in inheritance chain');
      }
      visited.add(chainTemplate.id);
    }
  }

  /**
   * Build inheritance tree structure
   */
  private buildInheritanceTree(template: ExtendableTemplate): InheritanceTree {
    const children = this.findChildTemplates(template.id);
    
    return {
      template,
      children: children.map(child => this.buildInheritanceTree(child))
    };
  }

  /**
   * Evaluate extension conditions
   */
  private evaluateExtensionConditions(
    conditions: Array<{ type: string; expression: string; value: unknown; operator: string }>,
    context: TemplateBuildContext
  ): boolean {
    return conditions.every(condition => {
      // Simple condition evaluation - in production, use a proper expression evaluator
      switch (condition.type) {
        case 'environment':
          return this.evaluateCondition(context.environment, condition.value, condition.operator);
        case 'parameter':
          const paramValue = context.parameters[condition.expression];
          return this.evaluateCondition(paramValue, condition.value, condition.operator);
        default:
          return true;
      }
    });
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(actual: unknown, expected: unknown, operator: string): boolean {
    switch (operator) {
      case '==': return actual === expected;
      case '!=': return actual !== expected;
      case '>': return (actual as number) > (expected as number);
      case '<': return (actual as number) < (expected as number);
      case '>=': return (actual as number) >= (expected as number);
      case '<=': return (actual as number) <= (expected as number);
      case 'in': return Array.isArray(expected) && (expected as unknown[]).includes(actual);
      case 'not_in': return Array.isArray(expected) && !(expected as unknown[]).includes(actual);
      default: return true;
    }
  }

  /**
   * Remove rules from configuration
   */
  private removeRules(
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
      delete target[last];
    }
  }

  /**
   * Generate cache key for template resolution
   */
  private getCacheKey(templateId: string, context: TemplateBuildContext): string {
    const contextHash = this.hashObject({
      environment: context.environment,
      parameters: context.parameters,
      user: context.user
    });
    return `${templateId}:${contextHash}`;
  }

  /**
   * Hash an object for caching
   */
  private hashObject(obj: unknown): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64').slice(0, 16);
  }

  /**
   * Invalidate cache entries for a template
   */
  private invalidateCache(templateId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.inheritanceCache.keys()) {
      if (key.startsWith(`${templateId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.inheritanceCache.delete(key);
    }
  }

  /**
   * Infer inheritance level based on parent level
   */
  private inferInheritanceLevel(parentLevel: InheritanceLevel): InheritanceLevel {
    const levelHierarchy: InheritanceLevel[] = ['base', 'organization', 'team', 'project', 'user'];
    const parentIndex = levelHierarchy.indexOf(parentLevel);
    const nextIndex = Math.min(parentIndex + 1, levelHierarchy.length - 1);
    return levelHierarchy[nextIndex];
  }

  /**
   * Get next major version
   */
  private getNextMajorVersion(version: string): string {
    const [major] = version.split('.');
    return `${parseInt(major) + 1}.0.0`;
  }

  /**
   * Compare version strings
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    
    return 0;
  }

  /**
   * Generate a unique template ID
   */
  private generateTemplateId(): string {
    return `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Inheritance tree structure
 */
interface InheritanceTree {
  template: ExtendableTemplate;
  children: InheritanceTree[];
}