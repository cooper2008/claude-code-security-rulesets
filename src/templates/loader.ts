/**
 * Template Loader for Claude Code Security Rulesets
 * Handles loading templates from various sources: built-in, files, URLs, registry
 * Supports template discovery, caching, and validation during load
 */

import { promises as fs } from 'fs';
import { join, resolve, dirname } from 'path';
import {
  SecurityTemplate,
  TemplateCategory,
  ComplianceFramework,
  ClaudeCodeConfiguration
} from '../types/index';

/**
 * Template loading options
 */
export interface TemplateLoadOptions {
  /** Whether to validate template after loading */
  validate?: boolean;
  /** Cache loaded templates */
  cache?: boolean;
  /** Template source type */
  sourceType?: 'builtin' | 'file' | 'url' | 'custom';
  /** Custom loader for specific template types */
  customLoader?: (source: string) => Promise<SecurityTemplate>;
}

/**
 * Built-in template metadata
 */
interface BuiltInTemplateConfig {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  compliance: ComplianceFramework[];
  tags: string[];
  filename: string;
}

/**
 * Template loading result
 */
export interface TemplateLoadResult {
  template: SecurityTemplate;
  source: string;
  loadTime: number;
  cached: boolean;
}

/**
 * Template discovery result
 */
export interface TemplateDiscoveryResult {
  templates: SecurityTemplate[];
  builtInCount: number;
  customCount: number;
  totalCount: number;
  discoveryTime: number;
}

/**
 * Template loader class
 */
export class TemplateLoader {
  private templateCache = new Map<string, SecurityTemplate>();
  private builtInTemplates = new Map<string, SecurityTemplate>();
  private builtInPath: string;

  constructor() {
    // Set up built-in templates path using __dirname
    this.builtInPath = join(__dirname, 'builtin');
  }

  /**
   * Load all built-in templates
   */
  public async loadBuiltInTemplates(): Promise<SecurityTemplate[]> {
    const startTime = Date.now();
    const templates: SecurityTemplate[] = [];

    try {
      // Load built-in template configurations
      const configs = await this.getBuiltInConfigs();
      
      for (const config of configs) {
        try {
          const template = await this.loadBuiltInTemplate(config);
          templates.push(template);
          this.builtInTemplates.set(template.id, template);
        } catch (error) {
          console.error(`Failed to load built-in template ${config.id}:`, error);
        }
      }

      console.log(`Loaded ${templates.length} built-in templates in ${Date.now() - startTime}ms`);
      return templates;
    } catch (error) {
      console.error('Failed to load built-in templates:', error);
      return [];
    }
  }

  /**
   * Get built-in template configurations
   */
  private async getBuiltInConfigs(): Promise<BuiltInTemplateConfig[]> {
    return [
      {
        id: 'development',
        name: 'Development Environment',
        category: 'development',
        description: 'Permissive template for local development with essential security boundaries',
        compliance: [],
        tags: ['development', 'local', 'permissive'],
        filename: 'development.json'
      },
      {
        id: 'production',
        name: 'Production Environment',
        category: 'production',
        description: 'Strict security template for production environments',
        compliance: [],
        tags: ['production', 'strict', 'secure'],
        filename: 'production.json'
      },
      {
        id: 'enterprise',
        name: 'Enterprise Security',
        category: 'compliance',
        description: 'Comprehensive security template with RBAC and audit trails',
        compliance: [],
        tags: ['enterprise', 'rbac', 'comprehensive'],
        filename: 'enterprise.json'
      },
      {
        id: 'soc2',
        name: 'SOC 2 Compliance',
        category: 'compliance',
        description: 'SOC 2 Type II compliant security policies',
        compliance: ['SOC2'],
        tags: ['soc2', 'compliance', 'audit'],
        filename: 'soc2.json'
      },
      {
        id: 'hipaa',
        name: 'HIPAA Compliance',
        category: 'compliance',
        description: 'HIPAA compliant security policies for healthcare',
        compliance: ['HIPAA'],
        tags: ['hipaa', 'healthcare', 'compliance'],
        filename: 'hipaa.json'
      },
      {
        id: 'pci-dss',
        name: 'PCI DSS Compliance',
        category: 'compliance',
        description: 'PCI DSS compliant security policies for payment processing',
        compliance: ['PCI-DSS'],
        tags: ['pci-dss', 'payment', 'compliance'],
        filename: 'pci-dss.json'
      }
    ];
  }

  /**
   * Load a specific built-in template
   */
  private async loadBuiltInTemplate(config: BuiltInTemplateConfig): Promise<SecurityTemplate> {
    // For now, create template programmatically since we don't have the builtin directory yet
    const rules = await this.generateBuiltInRules(config.id);
    
    return {
      id: config.id,
      name: config.name,
      category: config.category,
      rules,
      description: config.description,
      compliance: config.compliance,
      version: '1.0.0',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date(),
      tags: config.tags,
      isBuiltIn: true,
      parameters: this.generateTemplateParameters(config.id)
    };
  }

  /**
   * Generate built-in rules based on template type
   */
  private async generateBuiltInRules(templateId: string): Promise<ClaudeCodeConfiguration> {
    const baseRules: ClaudeCodeConfiguration = {
      permissions: {},
      metadata: {
        version: '1.0.0',
        timestamp: Date.now()
      }
    };

    switch (templateId) {
      case 'development':
        baseRules.permissions = {
          deny: [
            'rm -rf',
            'format',
            'delete *',
            'drop database',
            'sudo *'
          ],
          ask: [
            'exec',
            'shell',
            'git push --force',
            'npm publish',
            'docker run --privileged'
          ],
          allow: [
            'read',
            'write',
            'test',
            'build',
            'lint',
            'git commit',
            'npm install'
          ]
        };
        break;

      case 'production':
        baseRules.permissions = {
          deny: [
            'exec',
            'shell',
            'eval',
            'rm -rf',
            'format',
            'delete *',
            'drop database',
            'sudo *',
            'chmod 777',
            'git push --force',
            'npm publish',
            'docker run --privileged',
            'curl *',
            'wget *',
            'ssh *',
            'scp *',
            'rsync *'
          ],
          ask: [
            'git push',
            'npm script',
            'docker run',
            'network request'
          ],
          allow: [
            'read',
            'write config',
            'test',
            'build',
            'lint'
          ]
        };
        break;

      case 'enterprise':
        baseRules.permissions = {
          deny: [
            'exec',
            'shell',
            'eval',
            'rm -rf',
            'format',
            'delete *',
            'drop database',
            'sudo *',
            'chmod 777',
            'git push --force',
            'npm publish',
            'docker run --privileged',
            'curl *',
            'wget *',
            'ssh *',
            'scp *',
            'rsync *',
            'env *',
            'printenv',
            'cat /etc/passwd',
            'cat /etc/shadow'
          ],
          ask: [
            'git push',
            'npm script',
            'docker run',
            'network request',
            'read secrets',
            'write logs',
            'access database'
          ],
          allow: [
            'read approved files',
            'write approved files',
            'test',
            'build',
            'lint',
            'audit'
          ]
        };
        break;

      case 'soc2':
        baseRules.permissions = {
          deny: [
            'exec',
            'shell',
            'eval',
            'rm -rf',
            'format',
            'delete *',
            'drop database',
            'sudo *',
            'chmod 777',
            'git push --force',
            'npm publish',
            'docker run --privileged',
            'curl *',
            'wget *',
            'ssh *',
            'scp *',
            'rsync *',
            'env *',
            'printenv',
            'cat /etc/passwd',
            'cat /etc/shadow',
            'access customer data',
            'modify audit logs'
          ],
          ask: [
            'git push',
            'npm script',
            'docker run',
            'network request',
            'read customer data',
            'access production data',
            'modify system config'
          ],
          allow: [
            'read approved files',
            'write approved files',
            'test',
            'build',
            'lint',
            'audit',
            'log actions',
            'read audit logs'
          ]
        };
        break;

      case 'hipaa':
        baseRules.permissions = {
          deny: [
            'exec',
            'shell',
            'eval',
            'rm -rf',
            'format',
            'delete *',
            'drop database',
            'sudo *',
            'chmod 777',
            'git push --force',
            'npm publish',
            'docker run --privileged',
            'curl *',
            'wget *',
            'ssh *',
            'scp *',
            'rsync *',
            'env *',
            'printenv',
            'cat /etc/passwd',
            'cat /etc/shadow',
            'access phi data',
            'export phi data',
            'print phi data',
            'email phi data'
          ],
          ask: [
            'git push',
            'npm script',
            'docker run',
            'network request',
            'read phi data',
            'write phi data',
            'access patient records',
            'modify system config',
            'backup data'
          ],
          allow: [
            'read approved files',
            'write approved files',
            'test',
            'build',
            'lint',
            'audit',
            'log actions',
            'read audit logs',
            'encrypt data',
            'decrypt approved data'
          ]
        };
        break;

      case 'pci-dss':
        baseRules.permissions = {
          deny: [
            'exec',
            'shell',
            'eval',
            'rm -rf',
            'format',
            'delete *',
            'drop database',
            'sudo *',
            'chmod 777',
            'git push --force',
            'npm publish',
            'docker run --privileged',
            'curl *',
            'wget *',
            'ssh *',
            'scp *',
            'rsync *',
            'env *',
            'printenv',
            'cat /etc/passwd',
            'cat /etc/shadow',
            'access cardholder data',
            'store card numbers',
            'log card data',
            'export payment data'
          ],
          ask: [
            'git push',
            'npm script',
            'docker run',
            'network request',
            'process payment',
            'access payment system',
            'modify cardholder data',
            'backup payment data'
          ],
          allow: [
            'read approved files',
            'write approved files',
            'test',
            'build',
            'lint',
            'audit',
            'log actions',
            'read audit logs',
            'encrypt payment data',
            'tokenize card data',
            'validate input'
          ]
        };
        break;

      default:
        // Default minimal configuration
        baseRules.permissions = {
          deny: ['rm -rf', 'format', 'delete *'],
          ask: ['exec', 'shell'],
          allow: ['read', 'write', 'test']
        };
    }

    return baseRules;
  }

  /**
   * Generate template parameters based on template type
   */
  private generateTemplateParameters(templateId: string) {
    const commonParameters = [
      {
        name: 'organization',
        type: 'string' as const,
        description: 'Organization name',
        required: false,
        defaultValue: 'Default Organization'
      },
      {
        name: 'environment',
        type: 'string' as const,
        description: 'Target environment',
        required: false,
        defaultValue: 'development',
        validation: {
          enum: ['development', 'staging', 'production']
        }
      }
    ];

    switch (templateId) {
      case 'development':
        return [
          ...commonParameters,
          {
            name: 'allowExperimental',
            type: 'boolean' as const,
            description: 'Allow experimental features',
            required: false,
            defaultValue: false
          },
          {
            name: 'testFrameworks',
            type: 'array' as const,
            description: 'Allowed testing frameworks',
            required: false,
            defaultValue: ['jest', 'mocha', 'vitest']
          }
        ];

      case 'production':
        return [
          ...commonParameters,
          {
            name: 'strictMode',
            type: 'boolean' as const,
            description: 'Enable strict security mode',
            required: false,
            defaultValue: true
          },
          {
            name: 'auditLevel',
            type: 'string' as const,
            description: 'Audit logging level',
            required: false,
            defaultValue: 'info',
            validation: {
              enum: ['error', 'warn', 'info', 'debug']
            }
          }
        ];

      case 'enterprise':
        return [
          ...commonParameters,
          {
            name: 'rbacEnabled',
            type: 'boolean' as const,
            description: 'Enable role-based access control',
            required: false,
            defaultValue: true
          },
          {
            name: 'approvalWorkflow',
            type: 'boolean' as const,
            description: 'Require approval workflow',
            required: false,
            defaultValue: true
          },
          {
            name: 'maxUsers',
            type: 'number' as const,
            description: 'Maximum number of users',
            required: false,
            defaultValue: 100,
            validation: {
              min: 1,
              max: 10000
            }
          }
        ];

      case 'soc2':
        return [
          ...commonParameters,
          {
            name: 'auditEnabled',
            type: 'boolean' as const,
            description: 'Enable audit logging',
            required: true,
            defaultValue: true
          },
          {
            name: 'retentionDays',
            type: 'number' as const,
            description: 'Audit log retention in days',
            required: false,
            defaultValue: 365,
            validation: {
              min: 90,
              max: 2555 // 7 years
            }
          }
        ];

      case 'hipaa':
        return [
          ...commonParameters,
          {
            name: 'encryptionRequired',
            type: 'boolean' as const,
            description: 'Require data encryption',
            required: true,
            defaultValue: true
          },
          {
            name: 'accessLogging',
            type: 'boolean' as const,
            description: 'Log all PHI access',
            required: true,
            defaultValue: true
          },
          {
            name: 'coveredEntity',
            type: 'string' as const,
            description: 'Type of covered entity',
            required: true,
            validation: {
              enum: ['healthcare_provider', 'health_plan', 'healthcare_clearinghouse', 'business_associate']
            }
          }
        ];

      case 'pci-dss':
        return [
          ...commonParameters,
          {
            name: 'merchantLevel',
            type: 'string' as const,
            description: 'PCI DSS merchant level',
            required: true,
            validation: {
              enum: ['level1', 'level2', 'level3', 'level4']
            }
          },
          {
            name: 'cardDataStorage',
            type: 'boolean' as const,
            description: 'Store cardholder data',
            required: false,
            defaultValue: false
          },
          {
            name: 'tokenizationEnabled',
            type: 'boolean' as const,
            description: 'Use tokenization',
            required: false,
            defaultValue: true
          }
        ];

      default:
        return commonParameters;
    }
  }

  /**
   * Load template from file
   */
  public async loadFromFile(filePath: string, options: TemplateLoadOptions = {}): Promise<SecurityTemplate> {
    const startTime = Date.now();
    const absolutePath = resolve(filePath);

    // Check cache first
    if (options.cache && this.templateCache.has(absolutePath)) {
      return this.templateCache.get(absolutePath)!;
    }

    try {
      const content = await fs.readFile(absolutePath, 'utf-8');
      const template = JSON.parse(content) as SecurityTemplate;
      
      // Validate template structure
      this.validateTemplateStructure(template);
      
      // Update metadata
      template.isBuiltIn = false;
      if (!template.createdAt) template.createdAt = new Date();
      template.updatedAt = new Date();

      // Cache if requested
      if (options.cache) {
        this.templateCache.set(absolutePath, template);
      }

      console.log(`Loaded template ${template.id} from file in ${Date.now() - startTime}ms`);
      return template;
    } catch (error) {
      throw new Error(`Failed to load template from file ${filePath}: ${error}`);
    }
  }

  /**
   * Load template from URL
   */
  public async loadFromUrl(url: string, options: TemplateLoadOptions = {}): Promise<SecurityTemplate> {
    const startTime = Date.now();

    // Check cache first
    if (options.cache && this.templateCache.has(url)) {
      return this.templateCache.get(url)!;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      const template = JSON.parse(content) as SecurityTemplate;
      
      // Validate template structure
      this.validateTemplateStructure(template);
      
      // Update metadata
      template.isBuiltIn = false;
      if (!template.createdAt) template.createdAt = new Date();
      template.updatedAt = new Date();

      // Cache if requested
      if (options.cache) {
        this.templateCache.set(url, template);
      }

      console.log(`Loaded template ${template.id} from URL in ${Date.now() - startTime}ms`);
      return template;
    } catch (error) {
      throw new Error(`Failed to load template from URL ${url}: ${error}`);
    }
  }

  /**
   * Validate template structure
   */
  private validateTemplateStructure(template: SecurityTemplate): void {
    const required = ['id', 'name', 'category', 'rules', 'description', 'version'];
    
    for (const field of required) {
      if (!(field in template)) {
        throw new Error(`Template missing required field: ${field}`);
      }
    }

    if (!template.rules.permissions) {
      throw new Error('Template rules must contain permissions');
    }

    if (typeof template.id !== 'string' || template.id.length === 0) {
      throw new Error('Template ID must be a non-empty string');
    }

    if (typeof template.name !== 'string' || template.name.length === 0) {
      throw new Error('Template name must be a non-empty string');
    }

    if (!['development', 'production', 'compliance', 'custom'].includes(template.category)) {
      throw new Error('Template category must be development, production, compliance, or custom');
    }
  }

  /**
   * Discover templates in directory
   */
  public async discoverTemplates(directory: string): Promise<TemplateDiscoveryResult> {
    const startTime = Date.now();
    const templates: SecurityTemplate[] = [];
    let builtInCount = 0;
    let customCount = 0;

    try {
      const files = await fs.readdir(directory, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isFile() && (file.name.endsWith('.json') || file.name.endsWith('.yaml'))) {
          try {
            const template = await this.loadFromFile(join(directory, file.name), { cache: true });
            templates.push(template);
            
            if (template.isBuiltIn) {
              builtInCount++;
            } else {
              customCount++;
            }
          } catch (error) {
            console.warn(`Failed to load template from ${file.name}:`, error);
          }
        }
      }

      return {
        templates,
        builtInCount,
        customCount,
        totalCount: templates.length,
        discoveryTime: Date.now() - startTime
      };
    } catch (error) {
      throw new Error(`Failed to discover templates in directory ${directory}: ${error}`);
    }
  }

  /**
   * Get all built-in templates
   */
  public getBuiltInTemplates(): SecurityTemplate[] {
    return Array.from(this.builtInTemplates.values());
  }

  /**
   * Get specific built-in template
   */
  public getBuiltInTemplate(id: string): SecurityTemplate | null {
    return this.builtInTemplates.get(id) || null;
  }

  /**
   * Clear template cache
   */
  public clearCache(): void {
    this.templateCache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.templateCache.size,
      keys: Array.from(this.templateCache.keys())
    };
  }

  /**
   * Preload templates from multiple sources
   */
  public async preloadTemplates(sources: { type: 'file' | 'url'; path: string }[]): Promise<SecurityTemplate[]> {
    const templates: SecurityTemplate[] = [];
    
    const promises = sources.map(async (source) => {
      try {
        let template: SecurityTemplate;
        if (source.type === 'file') {
          template = await this.loadFromFile(source.path, { cache: true });
        } else {
          template = await this.loadFromUrl(source.path, { cache: true });
        }
        return template;
      } catch (error) {
        console.error(`Failed to preload template from ${source.path}:`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    
    for (const template of results) {
      if (template) {
        templates.push(template);
      }
    }

    console.log(`Preloaded ${templates.length} templates`);
    return templates;
  }

  /**
   * Validate template file format
   */
  public async validateTemplateFile(filePath: string): Promise<{ valid: boolean; errors: string[] }> {
    const result = { valid: true, errors: [] as string[] };

    try {
      const template = await this.loadFromFile(filePath);
      this.validateTemplateStructure(template);
    } catch (error) {
      result.valid = false;
      result.errors.push(String(error));
    }

    return result;
  }

  /**
   * Get template metadata without loading full template
   */
  public async getTemplateMetadata(source: string, type: 'file' | 'url' = 'file'): Promise<Partial<SecurityTemplate>> {
    try {
      let content: string;
      
      if (type === 'file') {
        content = await fs.readFile(resolve(source), 'utf-8');
      } else {
        const response = await fetch(source);
        content = await response.text();
      }

      const template = JSON.parse(content) as SecurityTemplate;
      
      return {
        id: template.id,
        name: template.name,
        category: template.category,
        description: template.description,
        version: template.version,
        tags: template.tags,
        compliance: template.compliance,
        isBuiltIn: template.isBuiltIn,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt
      };
    } catch (error) {
      throw new Error(`Failed to get template metadata from ${source}: ${error}`);
    }
  }

  /**
   * Export template to file
   */
  public async exportTemplate(template: SecurityTemplate, filePath: string): Promise<void> {
    try {
      const content = JSON.stringify(template, null, 2);
      await fs.writeFile(resolve(filePath), content, 'utf-8');
      console.log(`Exported template ${template.id} to ${filePath}`);
    } catch (error) {
      throw new Error(`Failed to export template to ${filePath}: ${error}`);
    }
  }

  /**
   * Backup templates to directory
   */
  public async backupTemplates(templates: SecurityTemplate[], backupDir: string): Promise<string[]> {
    const backupPaths: string[] = [];

    try {
      // Ensure backup directory exists
      await fs.mkdir(resolve(backupDir), { recursive: true });

      for (const template of templates) {
        const filename = `${template.id}-${template.version}.json`;
        const filePath = join(backupDir, filename);
        
        await this.exportTemplate(template, filePath);
        backupPaths.push(filePath);
      }

      console.log(`Backed up ${templates.length} templates to ${backupDir}`);
      return backupPaths;
    } catch (error) {
      throw new Error(`Failed to backup templates: ${error}`);
    }
  }
}