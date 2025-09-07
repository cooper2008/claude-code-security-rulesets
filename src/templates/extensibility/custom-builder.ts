import {
  ExtendableTemplate,
  InheritanceLevel,
  ExtensionType,
  TemplateBuildContext,
  TemplateExtension,
  CustomValidationRule,
  MergeStrategy,
  ConflictResolution,
  CompositionConfig
} from './types';
import { SecurityTemplate, ClaudeCodeConfiguration, TemplateParameter, ComplianceFramework } from '../../types';
import { TemplateInheritanceEngine } from './inheritance';
import { TemplateComposer } from './composition';
import { TemplateValidator } from './validation';
import * as readline from 'readline';

/**
 * Interactive custom template builder
 */
export class CustomTemplateBuilder {
  private inheritanceEngine: TemplateInheritanceEngine;
  private composer: TemplateComposer;
  private validator: TemplateValidator;
  private templates: Map<string, ExtendableTemplate> = new Map();
  private rl?: readline.Interface;

  constructor() {
    this.inheritanceEngine = new TemplateInheritanceEngine();
    this.composer = new TemplateComposer();
    this.validator = new TemplateValidator();
  }

  /**
   * Start interactive template building wizard
   */
  public async startInteractiveBuilder(): Promise<ExtendableTemplate> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      console.log('🚀 Claude Code Security Template Builder');
      console.log('=====================================\n');

      // Choose template type
      const templateType = await this.chooseTemplateType();

      switch (templateType) {
        case 'new':
          return await this.buildNewTemplate();
        case 'inherit':
          return await this.buildInheritedTemplate();
        case 'compose':
          return await this.buildComposedTemplate();
        case 'extend':
          return await this.buildExtendedTemplate();
        default:
          throw new Error('Invalid template type');
      }
    } finally {
      this.rl?.close();
    }
  }

  /**
   * Build template from configuration
   */
  public async buildFromConfig(config: TemplateBuilderConfig): Promise<ExtendableTemplate> {
    // Validate configuration
    this.validateBuilderConfig(config);

    // Build template based on type
    switch (config.type) {
      case 'new':
        return this.buildNewTemplateFromConfig(config);
      case 'inherit':
        return this.buildInheritedTemplateFromConfig(config);
      case 'compose':
        return this.buildComposedTemplateFromConfig(config);
      case 'extend':
        return this.buildExtendedTemplateFromConfig(config);
      default:
        throw new Error(`Unknown template type: ${config.type}`);
    }
  }

  /**
   * Generate template from analysis
   */
  public async generateFromAnalysis(analysis: ProjectAnalysis): Promise<ExtendableTemplate> {
    const template = this.createBaseTemplateFromAnalysis(analysis);
    
    // Add rules based on analysis
    template.rules = this.generateRulesFromAnalysis(analysis);
    
    // Add compliance frameworks based on detected patterns
    template.compliance = this.detectComplianceFrameworks(analysis);
    
    // Add parameters for customization
    template.parameters = this.generateParametersFromAnalysis(analysis);
    
    return template;
  }

  /**
   * Build template with guided prompts
   */
  public async buildWithGuidance(
    context: TemplateBuildContext,
    guidance: TemplateGuidance
  ): Promise<ExtendableTemplate> {
    const template = this.createBaseTemplate();
    
    // Apply guidance rules
    for (const rule of guidance.rules) {
      await this.applyGuidanceRule(template, rule, context);
    }
    
    // Apply recommendations
    for (const recommendation of guidance.recommendations) {
      await this.applyRecommendation(template, recommendation, context);
    }
    
    return template;
  }

  /**
   * Validate and finalize template
   */
  public async finalizeTemplate(
    template: ExtendableTemplate,
    context: TemplateBuildContext
  ): Promise<ExtendableTemplate> {
    // Validate template
    const validation = await this.validator.validateTemplate(template, context);
    if (!validation.isValid) {
      throw new Error(`Template validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Optimize template
    const optimized = await this.optimizeTemplate(template);

    // Add metadata
    optimized.updatedAt = new Date();
    optimized.tags = [...optimized.tags, 'custom-built'];

    return optimized;
  }

  /**
   * Choose template type interactively
   */
  private async chooseTemplateType(): Promise<string> {
    console.log('What type of template would you like to create?\n');
    console.log('1. New template from scratch');
    console.log('2. Inherit from existing template');
    console.log('3. Compose multiple templates');
    console.log('4. Extend existing template\n');

    const choice = await this.prompt('Enter your choice (1-4): ');
    
    switch (choice.trim()) {
      case '1': return 'new';
      case '2': return 'inherit';
      case '3': return 'compose';
      case '4': return 'extend';
      default:
        console.log('Invalid choice. Please try again.\n');
        return this.chooseTemplateType();
    }
  }

  /**
   * Build new template from scratch
   */
  private async buildNewTemplate(): Promise<ExtendableTemplate> {
    const template = this.createBaseTemplate();

    // Basic information
    template.name = await this.prompt('Template name: ');
    template.description = await this.prompt('Template description: ');
    template.version = await this.prompt('Version (default: 1.0.0): ') || '1.0.0';

    // Choose category
    template.category = await this.chooseCategory();

    // Add rules
    console.log('\n📋 Let\'s add security rules to your template...');
    template.rules = await this.buildRulesInteractively();

    // Add parameters
    console.log('\n⚙️ Adding customization parameters...');
    template.parameters = await this.buildParametersInteractively();

    // Add tags
    template.tags = await this.buildTagsInteractively();

    return template;
  }

  /**
   * Build inherited template
   */
  private async buildInheritedTemplate(): Promise<ExtendableTemplate> {
    // List available templates
    const availableTemplates = this.listAvailableTemplates();
    if (availableTemplates.length === 0) {
      throw new Error('No templates available for inheritance');
    }

    console.log('\nAvailable templates for inheritance:');
    availableTemplates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.name} (${template.version})`);
    });

    const parentIndex = parseInt(await this.prompt('\nSelect parent template: ')) - 1;
    if (parentIndex < 0 || parentIndex >= availableTemplates.length) {
      throw new Error('Invalid template selection');
    }

    const parentTemplate = availableTemplates[parentIndex];
    const extensionType = await this.chooseExtensionType();

    const templateData: Partial<ExtendableTemplate> = {
      name: await this.prompt('New template name: '),
      description: await this.prompt('Description: '),
      version: '1.0.0'
    };

    return this.inheritanceEngine.createInheritedTemplate(
      parentTemplate.id,
      templateData,
      extensionType
    );
  }

  /**
   * Build composed template
   */
  private async buildComposedTemplate(): Promise<ExtendableTemplate> {
    const availableTemplates = this.listAvailableTemplates();
    if (availableTemplates.length < 2) {
      throw new Error('At least 2 templates are required for composition');
    }

    // Select base template
    console.log('\nSelect base template:');
    availableTemplates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.name} (${template.version})`);
    });

    const baseIndex = parseInt(await this.prompt('\nBase template: ')) - 1;
    const baseTemplate = availableTemplates[baseIndex];

    // Select additional templates
    const selectedTemplates: ExtendableTemplate[] = [baseTemplate];
    
    while (true) {
      const addMore = await this.prompt('\nAdd another template? (y/n): ');
      if (addMore.toLowerCase() !== 'y') break;

      const otherTemplates = availableTemplates.filter(t => 
        !selectedTemplates.some(s => s.id === t.id)
      );

      if (otherTemplates.length === 0) {
        console.log('No more templates available.');
        break;
      }

      console.log('\nAvailable templates:');
      otherTemplates.forEach((template, index) => {
        console.log(`${index + 1}. ${template.name} (${template.version})`);
      });

      const additionalIndex = parseInt(await this.prompt('\nSelect template: ')) - 1;
      if (additionalIndex >= 0 && additionalIndex < otherTemplates.length) {
        selectedTemplates.push(otherTemplates[additionalIndex]);
      }
    }

    // Create composition configuration
    const mergeStrategy = await this.chooseMergeStrategy();
    const conflictResolution = await this.chooseConflictResolution();

    const context: TemplateBuildContext = {
      environment: 'development',
      parameters: {},
      availableTemplates: selectedTemplates,
      metadata: {
        buildId: this.generateId(),
        timestamp: new Date(),
        version: '1.0.0'
      }
    };

    return this.composer.composeTemplates(
      selectedTemplates,
      mergeStrategy,
      conflictResolution,
      context
    );
  }

  /**
   * Build extended template
   */
  private async buildExtendedTemplate(): Promise<ExtendableTemplate> {
    const availableTemplates = this.listAvailableTemplates();
    if (availableTemplates.length === 0) {
      throw new Error('No templates available for extension');
    }

    // Select target template
    console.log('\nSelect template to extend:');
    availableTemplates.forEach((template, index) => {
      console.log(`${index + 1}. ${template.name} (${template.version})`);
    });

    const targetIndex = parseInt(await this.prompt('\nTarget template: ')) - 1;
    const targetTemplate = availableTemplates[targetIndex];

    // Create extension
    const extension: TemplateExtension = {
      id: this.generateId(),
      name: await this.prompt('Extension name: '),
      type: 'extend',
      targetTemplateId: targetTemplate.id,
      rules: await this.buildRulesInteractively(),
      priority: parseInt(await this.prompt('Priority (default: 100): ') || '100'),
      metadata: {
        description: await this.prompt('Extension description: '),
        author: await this.prompt('Author: '),
        version: '1.0.0',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };

    // Apply extension to template
    const extendedTemplate: ExtendableTemplate = {
      ...targetTemplate,
      id: this.generateId(),
      name: `${targetTemplate.name} (Extended)`,
      extensions: [...(targetTemplate.extensions || []), extension],
      isBuiltIn: false,
      updatedAt: new Date()
    };

    return extendedTemplate;
  }

  /**
   * Build rules interactively
   */
  private async buildRulesInteractively(): Promise<ClaudeCodeConfiguration> {
    const rules: ClaudeCodeConfiguration = { deny: [], allow: [] };

    console.log('\n🚫 Adding DENY rules (what to prohibit):');
    while (true) {
      const rule = await this.prompt('Enter deny rule (or press Enter to finish): ');
      if (!rule.trim()) break;
      
      rules.deny = rules.deny || [];
      rules.deny.push(rule);
    }

    console.log('\n✅ Adding ALLOW rules (what to permit):');
    while (true) {
      const rule = await this.prompt('Enter allow rule (or press Enter to finish): ');
      if (!rule.trim()) break;
      
      rules.allow = rules.allow || [];
      rules.allow.push(rule);
    }

    return rules;
  }

  /**
   * Build parameters interactively
   */
  private async buildParametersInteractively(): Promise<TemplateParameter[]> {
    const parameters: TemplateParameter[] = [];

    while (true) {
      const addParam = await this.prompt('Add a parameter? (y/n): ');
      if (addParam.toLowerCase() !== 'y') break;

      const parameter: TemplateParameter = {
        name: await this.prompt('Parameter name: '),
        type: await this.chooseParameterType(),
        description: await this.prompt('Description: '),
        required: (await this.prompt('Required? (y/n): ')).toLowerCase() === 'y'
      };

      if (!parameter.required) {
        parameter.defaultValue = await this.prompt('Default value (optional): ');
      }

      parameters.push(parameter);
    }

    return parameters;
  }

  /**
   * Build tags interactively
   */
  private async buildTagsInteractively(): Promise<string[]> {
    const tags: string[] = [];
    const tagInput = await this.prompt('Enter tags (comma-separated): ');
    
    if (tagInput.trim()) {
      tags.push(...tagInput.split(',').map(tag => tag.trim()));
    }

    return tags;
  }

  /**
   * Choose category interactively
   */
  private async chooseCategory(): Promise<any> {
    console.log('\nTemplate categories:');
    console.log('1. Security');
    console.log('2. Performance');
    console.log('3. Best Practices');
    console.log('4. Custom');

    const choice = await this.prompt('\nSelect category (1-4): ');
    
    switch (choice.trim()) {
      case '1': return 'security';
      case '2': return 'performance';
      case '3': return 'best-practices';
      case '4': return 'custom';
      default:
        console.log('Invalid choice, defaulting to security.');
        return 'security';
    }
  }

  /**
   * Choose extension type
   */
  private async chooseExtensionType(): Promise<ExtensionType> {
    console.log('\nExtension types:');
    console.log('1. Inherit (copy all rules)');
    console.log('2. Extend (add new rules)');
    console.log('3. Override (replace specific rules)');

    const choice = await this.prompt('\nSelect type (1-3): ');
    
    switch (choice.trim()) {
      case '1': return 'inherit';
      case '2': return 'extend';
      case '3': return 'override';
      default: return 'extend';
    }
  }

  /**
   * Choose parameter type
   */
  private async chooseParameterType(): Promise<'string' | 'number' | 'boolean' | 'array' | 'object'> {
    console.log('\nParameter types:');
    console.log('1. String');
    console.log('2. Number');
    console.log('3. Boolean');
    console.log('4. Array');
    console.log('5. Object');

    const choice = await this.prompt('\nSelect type (1-5): ');
    
    switch (choice.trim()) {
      case '1': return 'string';
      case '2': return 'number';
      case '3': return 'boolean';
      case '4': return 'array';
      case '5': return 'object';
      default: return 'string';
    }
  }

  /**
   * Choose merge strategy
   */
  private async chooseMergeStrategy(): Promise<MergeStrategy> {
    console.log('\nMerge strategy for rules:');
    console.log('1. Deep merge (combine all rules)');
    console.log('2. Replace (last template wins)');
    console.log('3. Append (add to existing)');

    const choice = await this.prompt('\nSelect strategy (1-3): ');
    
    const rulesStrategy = choice === '2' ? 'replace' : 
                         choice === '3' ? 'append' : 'deep_merge';

    return {
      rules: rulesStrategy as any,
      arrays: 'unique_merge',
      objects: 'deep_merge',
      parameters: 'validate_merge'
    };
  }

  /**
   * Choose conflict resolution
   */
  private async chooseConflictResolution(): Promise<ConflictResolution> {
    console.log('\nConflict resolution strategy:');
    console.log('1. Error (stop on conflicts)');
    console.log('2. Warn (log and continue)');
    console.log('3. Merge (attempt to merge)');
    console.log('4. Override (last template wins)');

    const choice = await this.prompt('\nSelect strategy (1-4): ');
    
    const strategy = choice === '1' ? 'error' :
                    choice === '2' ? 'warn' :
                    choice === '3' ? 'merge' : 'override';

    return {
      defaultStrategy: strategy as any,
      interactive: false,
      logConflicts: true
    };
  }

  /**
   * Build template from configuration
   */
  private buildNewTemplateFromConfig(config: TemplateBuilderConfig): ExtendableTemplate {
    const template = this.createBaseTemplate();
    
    if (config.metadata) {
      Object.assign(template, config.metadata);
    }
    
    if (config.rules) {
      template.rules = config.rules;
    }
    
    if (config.parameters) {
      template.parameters = config.parameters;
    }
    
    return template;
  }

  /**
   * Build inherited template from configuration
   */
  private async buildInheritedTemplateFromConfig(config: TemplateBuilderConfig): Promise<ExtendableTemplate> {
    if (!config.parentTemplateId) {
      throw new Error('Parent template ID is required for inheritance');
    }

    return this.inheritanceEngine.createInheritedTemplate(
      config.parentTemplateId,
      config.metadata || {},
      config.extensionType || 'extend'
    );
  }

  /**
   * Build composed template from configuration
   */
  private async buildComposedTemplateFromConfig(config: TemplateBuilderConfig): Promise<ExtendableTemplate> {
    if (!config.compositionConfig) {
      throw new Error('Composition configuration is required');
    }

    const context: TemplateBuildContext = {
      environment: 'production',
      parameters: config.parameters || {},
      availableTemplates: Array.from(this.templates.values()),
      metadata: {
        buildId: this.generateId(),
        timestamp: new Date(),
        version: '1.0.0'
      }
    };

    return this.composer.composeFromConfig(config.compositionConfig, this.templates, context);
  }

  /**
   * Build extended template from configuration
   */
  private buildExtendedTemplateFromConfig(config: TemplateBuilderConfig): ExtendableTemplate {
    if (!config.targetTemplateId || !config.extension) {
      throw new Error('Target template ID and extension are required');
    }

    const targetTemplate = this.templates.get(config.targetTemplateId);
    if (!targetTemplate) {
      throw new Error(`Target template not found: ${config.targetTemplateId}`);
    }

    return {
      ...targetTemplate,
      id: this.generateId(),
      name: `${targetTemplate.name} (Extended)`,
      extensions: [...(targetTemplate.extensions || []), config.extension],
      isBuiltIn: false,
      updatedAt: new Date()
    };
  }

  /**
   * Create base template structure
   */
  private createBaseTemplate(): ExtendableTemplate {
    return {
      id: this.generateId(),
      name: '',
      category: 'security',
      rules: { deny: [], allow: [] },
      description: '',
      compliance: [],
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
      isBuiltIn: false,
      parameters: [],
      inheritance: {
        level: 'user',
        extensionType: 'inherit',
        chain: [],
        compatibility: {},
        permissions: {
          canOverrideRules: true,
          canAddRules: true,
          canRemoveRules: false,
          canModifyMetadata: true
        }
      },
      scope: {},
      extensions: []
    };
  }

  /**
   * Create base template from analysis
   */
  private createBaseTemplateFromAnalysis(analysis: ProjectAnalysis): ExtendableTemplate {
    const template = this.createBaseTemplate();
    
    template.name = `${analysis.projectName} Security Template`;
    template.description = `Generated security template for ${analysis.projectName}`;
    template.tags = ['auto-generated', analysis.projectType];
    
    return template;
  }

  /**
   * Generate rules from project analysis
   */
  private generateRulesFromAnalysis(analysis: ProjectAnalysis): ClaudeCodeConfiguration {
    const rules: ClaudeCodeConfiguration = { deny: [], allow: [] };
    
    // Add rules based on detected technologies
    for (const tech of analysis.technologies) {
      const techRules = this.getTechnologyRules(tech);
      rules.deny = [...(rules.deny || []), ...(techRules.deny || [])];
      rules.allow = [...(rules.allow || []), ...(techRules.allow || [])];
    }
    
    // Add rules based on security findings
    for (const finding of analysis.securityFindings) {
      const securityRules = this.getSecurityRules(finding);
      rules.deny = [...(rules.deny || []), ...(securityRules.deny || [])];
    }
    
    return rules;
  }

  /**
   * Detect compliance frameworks from analysis
   */
  private detectComplianceFrameworks(analysis: ProjectAnalysis): ComplianceFramework[] {
    const frameworks: ComplianceFramework[] = [];
    
    if (analysis.hasPaymentProcessing) {
      frameworks.push('PCI_DSS');
    }
    
    if (analysis.hasHealthData) {
      frameworks.push('HIPAA');
    }
    
    if (analysis.hasGDPRRequirements) {
      frameworks.push('SOC2');
    }
    
    return frameworks;
  }

  /**
   * Generate parameters from analysis
   */
  private generateParametersFromAnalysis(analysis: ProjectAnalysis): TemplateParameter[] {
    const parameters: TemplateParameter[] = [];
    
    if (analysis.hasEnvironmentVariables) {
      parameters.push({
        name: 'environment',
        type: 'string',
        description: 'Deployment environment',
        required: true,
        defaultValue: 'production'
      });
    }
    
    if (analysis.hasApiKeys) {
      parameters.push({
        name: 'api_key_pattern',
        type: 'string',
        description: 'Pattern for API key validation',
        required: false
      });
    }
    
    return parameters;
  }

  /**
   * Get technology-specific rules
   */
  private getTechnologyRules(technology: string): ClaudeCodeConfiguration {
    const rules: Record<string, ClaudeCodeConfiguration> = {
      'react': {
        deny: ['dangerouslySetInnerHTML', 'eval('],
        allow: ['useState', 'useEffect']
      },
      'node.js': {
        deny: ['child_process.exec', 'eval('],
        allow: ['process.env']
      },
      'python': {
        deny: ['exec(', 'eval('],
        allow: ['os.environ']
      }
    };
    
    return rules[technology] || { deny: [], allow: [] };
  }

  /**
   * Get security-specific rules
   */
  private getSecurityRules(finding: SecurityFinding): ClaudeCodeConfiguration {
    const rules: Record<string, ClaudeCodeConfiguration> = {
      'sql-injection': {
        deny: ['SELECT * FROM', 'DROP TABLE'],
        allow: []
      },
      'xss': {
        deny: ['innerHTML =', 'document.write('],
        allow: []
      },
      'command-injection': {
        deny: ['os.system(', 'subprocess.call('],
        allow: []
      }
    };
    
    return rules[finding.type] || { deny: [], allow: [] };
  }

  /**
   * Apply guidance rule to template
   */
  private async applyGuidanceRule(
    template: ExtendableTemplate,
    rule: GuidanceRule,
    context: TemplateBuildContext
  ): Promise<void> {
    switch (rule.type) {
      case 'add-rule':
        if (rule.ruleType === 'deny') {
          template.rules.deny = template.rules.deny || [];
          template.rules.deny.push(rule.pattern);
        } else {
          template.rules.allow = template.rules.allow || [];
          template.rules.allow.push(rule.pattern);
        }
        break;
      
      case 'add-parameter':
        template.parameters = template.parameters || [];
        template.parameters.push(rule.parameter);
        break;
        
      case 'set-compliance':
        template.compliance.push(rule.framework);
        break;
    }
  }

  /**
   * Apply recommendation to template
   */
  private async applyRecommendation(
    template: ExtendableTemplate,
    recommendation: Recommendation,
    context: TemplateBuildContext
  ): Promise<void> {
    if (recommendation.confidence > 0.8) {
      // Auto-apply high confidence recommendations
      await this.applyGuidanceRule(template, recommendation.rule, context);
    } else {
      // Add as suggestion in template metadata
      template.tags.push(`suggestion:${recommendation.rule.pattern}`);
    }
  }

  /**
   * Optimize template structure
   */
  private async optimizeTemplate(template: ExtendableTemplate): Promise<ExtendableTemplate> {
    const optimized = { ...template };
    
    // Remove duplicate rules
    if (optimized.rules.deny) {
      optimized.rules.deny = [...new Set(optimized.rules.deny)];
    }
    
    if (optimized.rules.allow) {
      optimized.rules.allow = [...new Set(optimized.rules.allow)];
    }
    
    // Sort rules for consistency
    if (optimized.rules.deny) {
      optimized.rules.deny.sort();
    }
    
    if (optimized.rules.allow) {
      optimized.rules.allow.sort();
    }
    
    // Remove duplicate tags
    optimized.tags = [...new Set(optimized.tags)];
    
    return optimized;
  }

  /**
   * List available templates
   */
  private listAvailableTemplates(): ExtendableTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Validate builder configuration
   */
  private validateBuilderConfig(config: TemplateBuilderConfig): void {
    if (!config.type) {
      throw new Error('Template type is required');
    }

    if (config.type === 'inherit' && !config.parentTemplateId) {
      throw new Error('Parent template ID is required for inheritance');
    }

    if (config.type === 'compose' && !config.compositionConfig) {
      throw new Error('Composition configuration is required');
    }

    if (config.type === 'extend' && (!config.targetTemplateId || !config.extension)) {
      throw new Error('Target template ID and extension are required');
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Prompt user for input
   */
  private prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl!.question(question, resolve);
    });
  }
}

/**
 * Template builder configuration
 */
export interface TemplateBuilderConfig {
  type: 'new' | 'inherit' | 'compose' | 'extend';
  metadata?: Partial<ExtendableTemplate>;
  rules?: ClaudeCodeConfiguration;
  parameters?: TemplateParameter[];
  parentTemplateId?: string;
  extensionType?: ExtensionType;
  targetTemplateId?: string;
  extension?: TemplateExtension;
  compositionConfig?: CompositionConfig;
}

/**
 * Project analysis for template generation
 */
export interface ProjectAnalysis {
  projectName: string;
  projectType: string;
  technologies: string[];
  securityFindings: SecurityFinding[];
  hasPaymentProcessing: boolean;
  hasHealthData: boolean;
  hasGDPRRequirements: boolean;
  hasEnvironmentVariables: boolean;
  hasApiKeys: boolean;
}

/**
 * Security finding
 */
export interface SecurityFinding {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location?: string;
}

/**
 * Template guidance configuration
 */
export interface TemplateGuidance {
  rules: GuidanceRule[];
  recommendations: Recommendation[];
}

/**
 * Guidance rule
 */
export interface GuidanceRule {
  type: 'add-rule' | 'add-parameter' | 'set-compliance';
  pattern: string;
  ruleType?: 'deny' | 'allow';
  parameter?: TemplateParameter;
  framework?: ComplianceFramework;
}

/**
 * Recommendation
 */
export interface Recommendation {
  rule: GuidanceRule;
  confidence: number;
  reason: string;
}