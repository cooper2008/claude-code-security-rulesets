import { SecurityTemplate, ClaudeCodeConfiguration } from '../../types/index';

/**
 * Template inheritance chain levels
 */
export type InheritanceLevel = 'base' | 'organization' | 'team' | 'project' | 'user';

/**
 * Template extension types
 */
export type ExtensionType = 'inherit' | 'extend' | 'override' | 'compose';

/**
 * Template inheritance metadata
 */
export interface InheritanceMetadata {
  /** Parent template ID */
  parentId?: string;
  /** Inheritance level */
  level: InheritanceLevel;
  /** Extension type */
  extensionType: ExtensionType;
  /** Inheritance chain (from root to current) */
  chain: string[];
  /** Version compatibility requirements */
  compatibility: {
    minParentVersion?: string;
    maxParentVersion?: string;
    compatibilityMatrix?: Record<string, string[]>;
  };
  /** Override permissions */
  permissions: {
    canOverrideRules: boolean;
    canAddRules: boolean;
    canRemoveRules: boolean;
    canModifyMetadata: boolean;
  };
}

/**
 * Extended template with inheritance support
 */
export interface ExtendableTemplate extends SecurityTemplate {
  /** Inheritance metadata */
  inheritance: InheritanceMetadata;
  /** Template extensions */
  extensions?: TemplateExtension[];
  /** Custom validation rules */
  customValidation?: CustomValidationRule[];
  /** Template scope */
  scope: {
    organizationId?: string;
    teamId?: string;
    projectId?: string;
    userId?: string;
  };
  /** Template locking */
  locked?: {
    isLocked: boolean;
    lockedBy?: string;
    lockedAt?: Date;
    reason?: string;
  };
}

/**
 * Template extension definition
 */
export interface TemplateExtension {
  /** Extension ID */
  id: string;
  /** Extension name */
  name: string;
  /** Extension type */
  type: ExtensionType;
  /** Target template ID */
  targetTemplateId: string;
  /** Rules to add/modify */
  rules: Partial<ClaudeCodeConfiguration>;
  /** Rules to remove (by path) */
  removeRules?: string[];
  /** Extension priority (higher = applied later) */
  priority: number;
  /** Extension metadata */
  metadata: {
    description: string;
    author: string;
    version: string;
    createdAt: Date;
    updatedAt: Date;
  };
  /** Conditional application */
  conditions?: ExtensionCondition[];
}

/**
 * Extension application condition
 */
export interface ExtensionCondition {
  /** Condition type */
  type: 'environment' | 'parameter' | 'context' | 'custom';
  /** Condition expression */
  expression: string;
  /** Expected value */
  value: unknown;
  /** Comparison operator */
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not_in' | 'regex' | 'custom';
}

/**
 * Custom validation rule
 */
export interface CustomValidationRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Rule description */
  description: string;
  /** Rule severity */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Rule category */
  category: string;
  /** Validation function */
  validator: string; // JS code as string for VM execution
  /** Rule parameters */
  parameters?: Record<string, unknown>;
  /** Rule conditions */
  conditions?: ExtensionCondition[];
}

/**
 * Template composition configuration
 */
export interface CompositionConfig {
  /** Base template ID */
  baseTemplateId: string;
  /** Templates to compose */
  templates: CompositionTemplate[];
  /** Merge strategy */
  mergeStrategy: MergeStrategy;
  /** Conflict resolution strategy */
  conflictResolution: ConflictResolution;
  /** Composition metadata */
  metadata: {
    name: string;
    description: string;
    version: string;
    author: string;
  };
}

/**
 * Template in composition
 */
export interface CompositionTemplate {
  /** Template ID */
  templateId: string;
  /** Application priority */
  priority: number;
  /** Override permissions */
  overrides?: {
    allowRuleOverride: boolean;
    allowMetadataOverride: boolean;
    allowParameterOverride: boolean;
  };
  /** Template-specific conditions */
  conditions?: ExtensionCondition[];
}

/**
 * Merge strategy options
 */
export interface MergeStrategy {
  /** Rule merging strategy */
  rules: 'merge' | 'replace' | 'append' | 'deep_merge';
  /** Array merging strategy */
  arrays: 'merge' | 'replace' | 'append' | 'unique_merge';
  /** Object merging strategy */
  objects: 'merge' | 'replace' | 'deep_merge';
  /** Parameter merging strategy */
  parameters: 'merge' | 'replace' | 'validate_merge';
}

/**
 * Conflict resolution configuration
 */
export interface ConflictResolution {
  /** Default resolution strategy */
  defaultStrategy: 'error' | 'warn' | 'merge' | 'override' | 'ignore';
  /** Rule-specific resolutions */
  ruleSpecific?: Record<string, 'error' | 'warn' | 'merge' | 'override' | 'ignore'>;
  /** Interactive resolution */
  interactive: boolean;
  /** Logging conflicts */
  logConflicts: boolean;
}

/**
 * Template build context
 */
export interface TemplateBuildContext {
  /** Build environment */
  environment: string;
  /** Build parameters */
  parameters: Record<string, unknown>;
  /** Available templates */
  availableTemplates: ExtendableTemplate[];
  /** User context */
  user?: {
    id: string;
    organizationId?: string;
    teamId?: string;
    permissions: string[];
  };
  /** Build metadata */
  metadata: {
    buildId: string;
    timestamp: Date;
    version: string;
  };
}

/**
 * Template validation result
 */
export interface TemplateValidationResult {
  /** Validation success */
  isValid: boolean;
  /** Validation errors */
  errors: TemplateValidationError[];
  /** Validation warnings */
  warnings: TemplateValidationWarning[];
  /** Performance metrics */
  performance: {
    validationTime: number;
    rulesValidated: number;
    customRulesValidated: number;
  };
}

/**
 * Template validation error
 */
export interface TemplateValidationError {
  /** Error type */
  type: 'inheritance' | 'composition' | 'validation' | 'compatibility' | 'permission';
  /** Error message */
  message: string;
  /** Error location */
  location?: {
    templateId: string;
    path?: string;
    line?: number;
    column?: number;
  };
  /** Error severity */
  severity: 'error' | 'critical';
  /** Suggested fixes */
  suggestions?: string[];
}

/**
 * Template validation warning
 */
export interface TemplateValidationWarning {
  /** Warning type */
  type: 'performance' | 'compatibility' | 'best_practice' | 'deprecated';
  /** Warning message */
  message: string;
  /** Warning location */
  location?: {
    templateId: string;
    path?: string;
    line?: number;
    column?: number;
  };
  /** Suggested improvements */
  suggestions?: string[];
}

/**
 * Plugin execution context for templates
 */
export interface TemplatePluginContext {
  /** Current template being processed */
  template: ExtendableTemplate;
  /** Build context */
  buildContext: TemplateBuildContext;
  /** Available APIs */
  apis: {
    logger: TemplateLogger;
    validator: TemplateValidator;
    storage: TemplateStorage;
    utils: TemplateUtils;
  };
  /** Security context */
  security: {
    sandboxed: boolean;
    permissions: string[];
    restrictions: string[];
  };
}

/**
 * Template logger interface
 */
export interface TemplateLogger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error): void;
}

/**
 * Template validator interface
 */
export interface TemplateValidator {
  validateRule(rule: unknown): Promise<boolean>;
  validateConfiguration(config: ClaudeCodeConfiguration): Promise<TemplateValidationResult>;
  validateExtension(extension: TemplateExtension): Promise<boolean>;
}

/**
 * Template storage interface
 */
export interface TemplateStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}

/**
 * Template utilities interface
 */
export interface TemplateUtils {
  deepMerge(target: unknown, source: unknown): unknown;
  evaluateCondition(condition: ExtensionCondition, context: unknown): boolean;
  generateId(): string;
  hashObject(obj: unknown): string;
  validateVersion(version: string): boolean;
  compareVersions(v1: string, v2: string): number;
}