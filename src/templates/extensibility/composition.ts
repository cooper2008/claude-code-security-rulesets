import {
  ExtendableTemplate,
  CompositionConfig,
  CompositionTemplate,
  MergeStrategy,
  ConflictResolution,
  TemplateBuildContext,
  TemplateValidationResult
} from './types';
import { ClaudeCodeConfiguration } from '../../types';

/**
 * Template composition engine for merging multiple templates
 */
export class TemplateComposer {
  private conflictLog: CompositionConflict[] = [];
  
  /**
   * Compose multiple templates according to configuration
   */
  public async composeTemplates(
    templates: ExtendableTemplate[],
    mergeStrategy: MergeStrategy,
    conflictResolution: ConflictResolution,
    context: TemplateBuildContext
  ): Promise<ExtendableTemplate> {
    if (templates.length === 0) {
      throw new Error('At least one template is required for composition');
    }

    if (templates.length === 1) {
      return templates[0];
    }

    // Clear conflict log
    this.conflictLog = [];

    // Sort templates by priority (if available) or use provided order
    const sortedTemplates = this.sortTemplatesByPriority(templates);

    // Start with the base template
    let result = { ...sortedTemplates[0] };

    // Apply each subsequent template
    for (let i = 1; i < sortedTemplates.length; i++) {
      result = await this.mergeTemplates(
        result,
        sortedTemplates[i],
        mergeStrategy,
        conflictResolution,
        context
      );
    }

    // Log conflicts if requested
    if (conflictResolution.logConflicts && this.conflictLog.length > 0) {
      this.logConflicts();
    }

    // Handle conflicts based on resolution strategy
    if (this.conflictLog.length > 0 && conflictResolution.defaultStrategy === 'error') {
      throw new CompositionError('Template composition failed due to conflicts', this.conflictLog);
    }

    return result;
  }

  /**
   * Compose templates using a composition configuration
   */
  public async composeFromConfig(
    config: CompositionConfig,
    templates: Map<string, ExtendableTemplate>,
    context: TemplateBuildContext
  ): Promise<ExtendableTemplate> {
    // Get base template
    const baseTemplate = templates.get(config.baseTemplateId);
    if (!baseTemplate) {
      throw new Error(`Base template not found: ${config.baseTemplateId}`);
    }

    // Collect composition templates
    const compositionTemplates: ExtendableTemplate[] = [baseTemplate];

    for (const compTemplate of config.templates) {
      const template = templates.get(compTemplate.templateId);
      if (!template) {
        throw new Error(`Template not found: ${compTemplate.templateId}`);
      }

      // Check conditions if specified
      if (compTemplate.conditions && !this.evaluateConditions(compTemplate.conditions, context)) {
        continue;
      }

      compositionTemplates.push(template);
    }

    // Create merged template
    const result = await this.composeTemplates(
      compositionTemplates,
      config.mergeStrategy,
      config.conflictResolution,
      context
    );

    // Update metadata
    return {
      ...result,
      name: config.metadata.name,
      description: config.metadata.description,
      version: config.metadata.version,
      updatedAt: new Date(),
      tags: [...result.tags, 'composed']
    };
  }

  /**
   * Merge two configurations with specified strategy
   */
  public mergeConfigurations(
    base: ClaudeCodeConfiguration,
    overlay: Partial<ClaudeCodeConfiguration>,
    strategy: MergeStrategy
  ): ClaudeCodeConfiguration {
    const result: ClaudeCodeConfiguration = { ...base };

    for (const [key, value] of Object.entries(overlay)) {
      if (value === undefined) continue;

      const baseValue = (result as any)[key];
      (result as any)[key] = this.mergeValue(baseValue, value, key, strategy);
    }

    return result;
  }

  /**
   * Deep merge two objects
   */
  public deepMerge(target: any, source: any): any {
    if (source === null || source === undefined) {
      return target;
    }

    if (target === null || target === undefined) {
      return source;
    }

    if (Array.isArray(target) && Array.isArray(source)) {
      return this.mergeArrays(target, source, 'unique_merge');
    }

    if (typeof target === 'object' && typeof source === 'object') {
      const result = { ...target };
      
      for (const [key, value] of Object.entries(source)) {
        if (value !== undefined) {
          result[key] = this.deepMerge(result[key], value);
        }
      }
      
      return result;
    }

    return source;
  }

  /**
   * Merge template arrays (parameters, tags, compliance)
   */
  public mergeTemplateArrays<T>(
    base: T[],
    overlay: T[],
    keyExtractor: (item: T) => string
  ): T[] {
    const result = [...base];
    const existingKeys = new Set(base.map(keyExtractor));

    for (const item of overlay) {
      const key = keyExtractor(item);
      if (!existingKeys.has(key)) {
        result.push(item);
        existingKeys.add(key);
      } else {
        // Replace existing item
        const index = result.findIndex(r => keyExtractor(r) === key);
        if (index >= 0) {
          result[index] = item;
        }
      }
    }

    return result;
  }

  /**
   * Create composition diff showing what changed
   */
  public createCompositionDiff(
    original: ExtendableTemplate,
    composed: ExtendableTemplate
  ): CompositionDiff {
    return {
      added: this.findAddedProperties(original, composed),
      modified: this.findModifiedProperties(original, composed),
      removed: this.findRemovedProperties(original, composed),
      conflicts: [...this.conflictLog]
    };
  }

  /**
   * Validate composition compatibility
   */
  public validateComposition(
    templates: ExtendableTemplate[],
    config: CompositionConfig
  ): CompositionValidation {
    const issues: CompositionIssue[] = [];
    const warnings: CompositionWarning[] = [];

    // Check template availability
    for (const template of config.templates) {
      const found = templates.find(t => t.id === template.templateId);
      if (!found) {
        issues.push({
          type: 'missing_template',
          templateId: template.templateId,
          message: `Template not found: ${template.templateId}`
        });
      }
    }

    // Check for version compatibility
    for (const template of templates) {
      if (template.inheritance.compatibility.minParentVersion) {
        // Check compatibility with other templates
        const incompatible = templates.find(t => 
          t.id !== template.id &&
          this.compareVersions(t.version, template.inheritance.compatibility.minParentVersion!) < 0
        );
        
        if (incompatible) {
          warnings.push({
            type: 'version_compatibility',
            templateId: template.id,
            message: `Potential version compatibility issue with ${incompatible.id}`
          });
        }
      }
    }

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(templates);
    if (circularDeps.length > 0) {
      issues.push({
        type: 'circular_dependency',
        templateId: circularDeps.join(' -> '),
        message: 'Circular dependency detected in template composition'
      });
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Merge two templates
   */
  private async mergeTemplates(
    base: ExtendableTemplate,
    overlay: ExtendableTemplate,
    mergeStrategy: MergeStrategy,
    conflictResolution: ConflictResolution,
    context: TemplateBuildContext
  ): Promise<ExtendableTemplate> {
    // Merge basic properties
    const result: ExtendableTemplate = {
      ...base,
      name: overlay.name || base.name,
      description: overlay.description || base.description,
      tags: this.mergeArrays(base.tags, overlay.tags, mergeStrategy.arrays),
      compliance: this.mergeTemplateArrays(
        base.compliance,
        overlay.compliance,
        (item) => item.toString()
      ),
      parameters: this.mergeTemplateArrays(
        base.parameters || [],
        overlay.parameters || [],
        (item) => item.name
      ),
      updatedAt: new Date()
    };

    // Merge rules configuration
    result.rules = this.mergeConfigurations(base.rules, overlay.rules, mergeStrategy);

    // Merge extensions
    result.extensions = this.mergeTemplateArrays(
      base.extensions || [],
      overlay.extensions || [],
      (item) => item.id
    );

    // Handle scope merging
    result.scope = this.deepMerge(base.scope, overlay.scope);

    // Update inheritance metadata
    result.inheritance = {
      ...overlay.inheritance,
      chain: [...base.inheritance.chain, overlay.id]
    };

    return result;
  }

  /**
   * Merge a single value based on strategy
   */
  private mergeValue(baseValue: any, overlayValue: any, key: string, strategy: MergeStrategy): any {
    if (overlayValue === undefined) {
      return baseValue;
    }

    if (baseValue === undefined) {
      return overlayValue;
    }

    // Array merging
    if (Array.isArray(baseValue) && Array.isArray(overlayValue)) {
      return this.mergeArrays(baseValue, overlayValue, strategy.arrays);
    }

    // Object merging
    if (this.isPlainObject(baseValue) && this.isPlainObject(overlayValue)) {
      if (strategy.objects === 'replace') {
        return overlayValue;
      }
      return this.deepMerge(baseValue, overlayValue);
    }

    // Check for conflicts
    if (baseValue !== overlayValue) {
      this.conflictLog.push({
        path: key,
        baseValue,
        overlayValue,
        resolution: 'overlay_wins',
        type: 'value_conflict'
      });
    }

    // Primitive value merging (overlay wins by default)
    return overlayValue;
  }

  /**
   * Merge arrays based on strategy
   */
  private mergeArrays<T>(base: T[], overlay: T[], strategy: string): T[] {
    switch (strategy) {
      case 'replace':
        return [...overlay];
      case 'append':
        return [...base, ...overlay];
      case 'unique_merge':
        const result = [...base];
        for (const item of overlay) {
          if (!result.some(r => this.deepEqual(r, item))) {
            result.push(item);
          }
        }
        return result;
      case 'merge':
      default:
        return [...base, ...overlay];
    }
  }

  /**
   * Sort templates by priority
   */
  private sortTemplatesByPriority(templates: ExtendableTemplate[]): ExtendableTemplate[] {
    return [...templates].sort((a, b) => {
      // Base templates first
      if (a.inheritance.level === 'base' && b.inheritance.level !== 'base') return -1;
      if (b.inheritance.level === 'base' && a.inheritance.level !== 'base') return 1;
      
      // Then by inheritance level
      const levels = ['base', 'organization', 'team', 'project', 'user'];
      const aLevel = levels.indexOf(a.inheritance.level);
      const bLevel = levels.indexOf(b.inheritance.level);
      
      if (aLevel !== bLevel) {
        return aLevel - bLevel;
      }
      
      // Finally by creation date
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  /**
   * Evaluate composition conditions
   */
  private evaluateConditions(
    conditions: Array<{ type: string; expression: string; value: unknown; operator: string }>,
    context: TemplateBuildContext
  ): boolean {
    return conditions.every(condition => {
      switch (condition.type) {
        case 'environment':
          return this.evaluateCondition(context.environment, condition.value, condition.operator);
        case 'parameter':
          const paramValue = context.parameters[condition.expression];
          return this.evaluateCondition(paramValue, condition.value, condition.operator);
        case 'context':
          const contextValue = this.getNestedValue(context, condition.expression);
          return this.evaluateCondition(contextValue, condition.value, condition.operator);
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
      case 'regex': return new RegExp(expected as string).test(actual as string);
      default: return true;
    }
  }

  /**
   * Log composition conflicts
   */
  private logConflicts(): void {
    console.warn('Template composition conflicts detected:');
    for (const conflict of this.conflictLog) {
      console.warn(`  - ${conflict.path}: ${conflict.type} (${conflict.resolution})`);
      console.warn(`    Base: ${JSON.stringify(conflict.baseValue)}`);
      console.warn(`    Overlay: ${JSON.stringify(conflict.overlayValue)}`);
    }
  }

  /**
   * Find added properties in composition
   */
  private findAddedProperties(original: ExtendableTemplate, composed: ExtendableTemplate): string[] {
    return this.findPropertyDifferences(original, composed, 'added');
  }

  /**
   * Find modified properties in composition
   */
  private findModifiedProperties(original: ExtendableTemplate, composed: ExtendableTemplate): string[] {
    return this.findPropertyDifferences(original, composed, 'modified');
  }

  /**
   * Find removed properties in composition
   */
  private findRemovedProperties(original: ExtendableTemplate, composed: ExtendableTemplate): string[] {
    return this.findPropertyDifferences(original, composed, 'removed');
  }

  /**
   * Find property differences between templates
   */
  private findPropertyDifferences(
    original: ExtendableTemplate, 
    composed: ExtendableTemplate, 
    type: 'added' | 'modified' | 'removed'
  ): string[] {
    const differences: string[] = [];
    
    // This is a simplified implementation
    // In production, you'd want a more sophisticated diff algorithm
    
    if (type === 'modified' && original.name !== composed.name) {
      differences.push('name');
    }
    
    if (type === 'modified' && original.description !== composed.description) {
      differences.push('description');
    }
    
    if (type === 'modified' && !this.deepEqual(original.rules, composed.rules)) {
      differences.push('rules');
    }
    
    return differences;
  }

  /**
   * Detect circular dependencies in templates
   */
  private detectCircularDependencies(templates: ExtendableTemplate[]): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const templateMap = new Map(templates.map(t => [t.id, t]));

    for (const template of templates) {
      if (this.hasCycle(template, templateMap, visited, recursionStack)) {
        return Array.from(recursionStack);
      }
    }

    return [];
  }

  /**
   * Check if template has circular dependency
   */
  private hasCycle(
    template: ExtendableTemplate,
    templateMap: Map<string, ExtendableTemplate>,
    visited: Set<string>,
    recursionStack: Set<string>
  ): boolean {
    if (recursionStack.has(template.id)) {
      return true;
    }

    if (visited.has(template.id)) {
      return false;
    }

    visited.add(template.id);
    recursionStack.add(template.id);

    // Check parent dependency
    if (template.inheritance.parentId) {
      const parent = templateMap.get(template.inheritance.parentId);
      if (parent && this.hasCycle(parent, templateMap, visited, recursionStack)) {
        return true;
      }
    }

    // Check extension dependencies
    if (template.extensions) {
      for (const extension of template.extensions) {
        const target = templateMap.get(extension.targetTemplateId);
        if (target && this.hasCycle(target, templateMap, visited, recursionStack)) {
          return true;
        }
      }
    }

    recursionStack.delete(template.id);
    return false;
  }

  /**
   * Get nested value from object by path
   */
  private getNestedValue(obj: any, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? current[key] : undefined;
    }, obj);
  }

  /**
   * Check if value is a plain object
   */
  private isPlainObject(value: unknown): boolean {
    return value !== null && 
           typeof value === 'object' && 
           value.constructor === Object;
  }

  /**
   * Deep equality check
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    
    if (a === null || b === null || a === undefined || b === undefined) {
      return a === b;
    }
    
    if (typeof a !== typeof b) return false;
    
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.deepEqual(item, b[index]));
    }
    
    if (typeof a === 'object' && typeof b === 'object') {
      const keysA = Object.keys(a as object);
      const keysB = Object.keys(b as object);
      
      if (keysA.length !== keysB.length) return false;
      
      return keysA.every(key => 
        keysB.includes(key) && 
        this.deepEqual((a as any)[key], (b as any)[key])
      );
    }
    
    return false;
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
}

/**
 * Composition conflict information
 */
export interface CompositionConflict {
  path: string;
  baseValue: unknown;
  overlayValue: unknown;
  resolution: 'base_wins' | 'overlay_wins' | 'merged' | 'error';
  type: 'value_conflict' | 'type_conflict' | 'array_conflict' | 'object_conflict';
}

/**
 * Composition error
 */
export class CompositionError extends Error {
  constructor(message: string, public conflicts: CompositionConflict[]) {
    super(message);
    this.name = 'CompositionError';
  }
}

/**
 * Composition diff result
 */
export interface CompositionDiff {
  added: string[];
  modified: string[];
  removed: string[];
  conflicts: CompositionConflict[];
}

/**
 * Composition validation result
 */
export interface CompositionValidation {
  isValid: boolean;
  issues: CompositionIssue[];
  warnings: CompositionWarning[];
}

/**
 * Composition validation issue
 */
export interface CompositionIssue {
  type: 'missing_template' | 'circular_dependency' | 'version_conflict' | 'permission_denied';
  templateId: string;
  message: string;
}

/**
 * Composition validation warning
 */
export interface CompositionWarning {
  type: 'version_compatibility' | 'performance' | 'best_practice';
  templateId: string;
  message: string;
}