/**
 * Core type definitions for Claude Code Security Rulesets Generator
 * Based on existing Claude Code settings.json schema with security enhancements
 */

// =============================================================================
// Claude Code Configuration Types
// =============================================================================

/**
 * Main Claude Code configuration structure
 * Matches the existing Claude Code settings.json format exactly
 */
export interface ClaudeCodeConfiguration {
  permissions?: {
    /** Actions that are completely blocked without user confirmation */
    deny?: string[];
    /** Actions that are explicitly permitted */
    allow?: string[];
    /** Actions that require user confirmation */
    ask?: string[];
  };
  /** Additional metadata for our security management */
  metadata?: ConfigurationMetadata;
  /** Any other Claude Code settings that should be preserved */
  [key: string]: unknown;
}

/**
 * Extended metadata for security rule management
 * Added by our generator for tracking and validation
 */
export interface ConfigurationMetadata {
  /** Version of the configuration */
  version: string;
  /** Cryptographic signature for integrity verification */
  signature?: string;
  /** Timestamp when configuration was created */
  timestamp: number;
  /** Organization that owns this configuration */
  organization?: string;
  /** Template used to generate this configuration */
  templateId?: string;
  /** Name/description of this configuration */
  name?: string;
  /** Environment this configuration is for (dev, staging, prod) */
  environment?: Environment;
}

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Result of validating a Claude Code configuration
 * Includes performance metrics to ensure <100ms requirement
 */
export interface ValidationResult {
  /** Whether the configuration passed all validations */
  isValid: boolean;
  /** Critical errors that prevent configuration use */
  errors: ValidationError[];
  /** Non-critical warnings for user awareness */
  warnings: ValidationWarning[];
  /** Rule conflicts detected (critical for security) */
  conflicts: RuleConflict[];
  /** Performance metrics for monitoring */
  performance: ValidationPerformance;
  /** Suggested fixes for detected issues */
  suggestions: ResolutionSuggestion[];
  /** Hash of the validated configuration for caching */
  configurationHash?: string;
}

// Git Integration Types
export interface GitHookConfig {
  /** Name of the Git hook (e.g., 'pre-commit', 'pre-push') */
  hookName: string;
  /** Whether the hook is enabled */
  enabled: boolean;
  /** Script content for the hook */
  scriptContent: string;
  /** Whether to allow bypassing the hook in emergencies */
  allowBypass: boolean;
  /** Bypass command/flag for emergencies */
  bypassFlag?: string;
}

export interface GitIntegrationOptions {
  /** Path to the Git repository */
  repoPath: string;
  /** Hooks to install/manage */
  hooks: GitHookConfig[];
  /** Whether to backup existing hooks before installing */
  backupExisting: boolean;
  /** Custom validation command to run in hooks */
  validationCommand?: string;
  /** Whether to run validation in quiet mode */
  quietMode: boolean;
}

export interface GitHookInstallResult {
  /** Name of the hook that was processed */
  hookName: string;
  /** Whether the installation was successful */
  success: boolean;
  /** Error message if installation failed */
  error?: string;
  /** Path to backup file if existing hook was backed up */
  backupPath?: string;
  /** Whether an existing hook was overwritten */
  overwritten: boolean;
}

export interface GitIntegrationResult {
  /** Overall success status */
  success: boolean;
  /** Results for each hook processed */
  hooks: GitHookInstallResult[];
  /** General errors not specific to a hook */
  errors: string[];
  /** Warning messages */
  warnings: string[];
  /** Summary message */
  summary: string;
}

// CI/CD Integration Types
export type CIPlatform = 'github' | 'gitlab' | 'jenkins' | 'azure' | 'circleci' | 'generic';

export interface CITemplate {
  /** Platform this template is for */
  platform: CIPlatform;
  /** Template name/identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** Template file content */
  content: string;
  /** Recommended file path for the template */
  filePath: string;
  /** Template variables that can be substituted */
  variables: TemplateVariable[];
}

export interface TemplateVariable {
  /** Variable name */
  name: string;
  /** Variable description */
  description: string;
  /** Default value */
  defaultValue?: string;
  /** Whether the variable is required */
  required: boolean;
  /** Validation pattern for the variable value */
  pattern?: string;
}

export interface CIIntegrationConfig {
  /** Target CI/CD platform */
  platform: CIPlatform;
  /** Project/repository path */
  projectPath: string;
  /** Template to use */
  template: string;
  /** Variable values for template substitution */
  variables: Record<string, string>;
  /** Whether to overwrite existing CI configuration */
  overwriteExisting: boolean;
  /** Additional validation commands to include */
  customValidationSteps?: string[];
}

export interface CIIntegrationResult {
  /** Whether the integration was successful */
  success: boolean;
  /** Platform that was configured */
  platform: CIPlatform;
  /** Path where the configuration was written */
  configPath?: string;
  /** Generated configuration content */
  generatedContent?: string;
  /** Any errors that occurred */
  errors: string[];
  /** Warning messages */
  warnings: string[];
  /** Next steps for the user */
  nextSteps: string[];
}

export interface HookValidationOptions {
  /** Skip validation for faster commits during development */
  skipValidation?: boolean;
  /** Run validation in fast mode (reduced checks) */
  fastMode?: boolean;
  /** Configuration file path to validate against */
  configPath?: string;
  /** Exit code to return on validation failure */
  failureExitCode?: number;
  /** Whether to output validation results in JSON format */
  jsonOutput?: boolean;
}

export interface HookExecutionContext {
  /** Type of hook being executed */
  hookType: 'pre-commit' | 'pre-push' | 'post-merge' | 'post-checkout';
  /** Git repository root path */
  repoRoot: string;
  /** Current branch name */
  currentBranch?: string;
  /** Files changed in this operation */
  changedFiles?: string[];
  /** Whether this is a merge operation */
  isMerge?: boolean;
  /** Environment variables available to the hook */
  environment: Record<string, string>;
}

// Developer Workflow Integration Types
export interface DeveloperWorkflowConfig {
  /** Whether to enable automatic hook installation on project initialization */
  autoInstallHooks: boolean;
  /** Whether to validate on every commit */
  validateOnCommit: boolean;
  /** Whether to validate before push */
  validateOnPush: boolean;
  /** Whether to show validation progress */
  showProgress: boolean;
  /** Custom validation rules for development workflow */
  developmentRules?: ClaudeCodeConfiguration;
  /** Notification preferences */
  notifications: {
    onSuccess: boolean;
    onFailure: boolean;
    onWarnings: boolean;
  };
}

export interface WorkflowIntegrationStatus {
  /** Whether Git hooks are installed and active */
  hooksInstalled: boolean;
  /** CI/CD integration status */
  cicdConfigured: boolean;
  /** Last validation result */
  lastValidation?: {
    timestamp: Date;
    success: boolean;
    summary: string;
  };
  /** Configuration health status */
  configHealth: 'healthy' | 'warnings' | 'errors' | 'unknown';
}

/**
 * Critical validation error that must be fixed
 */
export interface ValidationError {
  /** Unique error type for programmatic handling */
  type: ValidationErrorType;
  /** Human-readable error message */
  message: string;
  /** Location of the error in the configuration */
  location?: ErrorLocation;
  /** Additional context for debugging */
  context?: Record<string, unknown>;
  /** Severity level of the error */
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Non-critical warning for user awareness
 */
export interface ValidationWarning {
  /** Warning type */
  type: ValidationWarningType;
  /** Human-readable warning message */
  message: string;
  /** Location where warning applies */
  location?: ErrorLocation;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Severity level */
  severity?: 'high' | 'medium' | 'low';
}

/**
 * Rule conflict between deny/allow/ask patterns
 * Critical for preventing security bypasses
 */
export interface RuleConflict {
  /** Type of conflict detected */
  type: ConflictType;
  /** Description of the conflict */
  message: string;
  /** Rules involved in the conflict */
  conflictingRules: ConflictingRule[];
  /** Recommended resolution strategy */
  resolution: ResolutionStrategy;
  /** Severity of the security impact */
  securityImpact: SecurityImpact;
}

/**
 * Performance metrics for validation process
 * Must meet <100ms requirement for validation
 */
export interface ValidationPerformance {
  /** Total validation time in milliseconds */
  validationTime: number;
  /** Number of rules processed */
  rulesProcessed: number;
  /** Whether performance targets were met */
  performanceTarget: {
    target: number; // Target time in ms
    achieved: boolean;
  };
  /** Breakdown of time spent in different validation phases */
  breakdown?: {
    parsing: number;
    ruleValidation: number;
    conflictDetection: number;
    suggestionGeneration: number;
  };
}

// =============================================================================
// Template System Types
// =============================================================================

/**
 * Security policy template for different organization types
 */
export interface SecurityTemplate {
  /** Unique template identifier */
  id: string;
  /** Human-readable template name */
  name: string;
  /** Template category for organization */
  category: TemplateCategory;
  /** The actual Claude Code configuration rules */
  rules: ClaudeCodeConfiguration;
  /** Description of what this template provides */
  description: string;
  /** Compliance frameworks this template addresses */
  compliance: ComplianceFramework[];
  /** Template version for compatibility tracking */
  version: string;
  /** When this template was created */
  createdAt: Date;
  /** When this template was last updated */
  updatedAt: Date;
  /** Tags for template discovery */
  tags: string[];
  /** Whether this is a built-in or custom template */
  isBuiltIn: boolean;
  /** Required parameters for template customization */
  parameters?: TemplateParameter[];
}

/**
 * Parameter for template customization
 */
export interface TemplateParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Human-readable description */
  description: string;
  /** Whether this parameter is required */
  required: boolean;
  /** Default value if not provided */
  defaultValue?: unknown;
  /** Validation rules for the parameter */
  validation?: ParameterValidation;
}

// =============================================================================
// Audit and Enterprise Types
// =============================================================================

/**
 * Audit log entry for tracking all system changes
 * Implements immutable audit trail with hash chaining
 */
export interface AuditLogEntry {
  /** Unique log entry ID */
  id: string;
  /** User who performed the action */
  userId: string;
  /** Type of action performed */
  action: AuditAction;
  /** Type of resource affected */
  resourceType: ResourceType;
  /** ID of the specific resource */
  resourceId: string;
  /** Changes made (before/after) */
  changes: Record<string, unknown>;
  /** When the action occurred */
  timestamp: Date;
  /** IP address of the user */
  ipAddress: string;
  /** User agent string */
  userAgent: string;
  /** Hash for audit trail integrity */
  hash: string;
  /** Hash of the previous log entry for chain integrity */
  previousHash: string;
  /** Additional context for the action */
  context?: Record<string, unknown>;
}

/**
 * User in the enterprise system
 */
export interface User {
  /** Unique user ID */
  id: string;
  /** User email address */
  email: string;
  /** User's assigned role */
  role: UserRole;
  /** Organization the user belongs to */
  organizationId: string;
  /** When the user account was created */
  createdAt: Date;
  /** When the user last logged in */
  lastLoginAt?: Date;
  /** Whether the user account is active */
  isActive: boolean;
}

/**
 * Organization in the enterprise system
 */
export interface Organization {
  /** Unique organization ID */
  id: string;
  /** Organization name */
  name: string;
  /** Organization-wide settings */
  settings: Record<string, unknown>;
  /** When the organization was created */
  createdAt: Date;
  /** When the organization was last updated */
  updatedAt: Date;
  /** Subscription tier for enterprise features */
  tier: 'free' | 'professional' | 'enterprise';
}

// =============================================================================
// Union Types and Enums
// =============================================================================

/** Environment types for configurations */
export type Environment = 'development' | 'staging' | 'production' | 'test';

/** Template categories for different organization types */
export type TemplateCategory = 'development' | 'production' | 'compliance' | 'custom';

/** Compliance frameworks supported by templates */
export type ComplianceFramework = 'SOC2' | 'GDPR' | 'HIPAA' | 'PCI-DSS' | 'ISO27001';

/** Validation error types for programmatic handling */
export type ValidationErrorType = 
  | 'INVALID_SYNTAX'
  | 'RULE_CONFLICT'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_PATTERN'
  | 'SECURITY_VIOLATION'
  | 'PERFORMANCE_VIOLATION'
  | 'TEMPLATE_ERROR';

/** Validation warning types */
export type ValidationWarningType = 
  | 'DEPRECATED_PATTERN'
  | 'PERFORMANCE_WARNING'
  | 'BEST_PRACTICE_VIOLATION'
  | 'COMPATIBILITY_WARNING';

/** Types of rule conflicts */
export type ConflictType = 
  | 'ALLOW_OVERRIDES_DENY'
  | 'OVERLAPPING_PATTERNS'
  | 'CONTRADICTORY_RULES'
  | 'PRECEDENCE_AMBIGUITY';

/** Security impact levels for conflicts */
export type SecurityImpact = 'critical' | 'high' | 'medium' | 'low';

/** Resolution strategies for conflicts */
export type ResolutionStrategy = 
  | 'MAKE_DENY_MORE_SPECIFIC'
  | 'MAKE_ALLOW_MORE_RESTRICTIVE'
  | 'REMOVE_CONFLICTING_RULE'
  | 'MANUAL_REVIEW_REQUIRED';

/** User roles in RBAC system */
export type UserRole = 'viewer' | 'editor' | 'admin' | 'super_admin';

/** Audit actions for tracking */
export type AuditAction = 
  | 'CREATE'
  | 'UPDATE' 
  | 'DELETE'
  | 'DEPLOY'
  | 'LOGIN'
  | 'LOGOUT'
  | 'VALIDATE'
  | 'EXPORT';

/** Resource types for audit tracking */
export type ResourceType = 
  | 'CONFIGURATION'
  | 'TEMPLATE'
  | 'USER'
  | 'ORGANIZATION'
  | 'AUDIT_LOG';

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Location information for errors and warnings
 */
export interface ErrorLocation {
  /** Line number if applicable */
  line?: number;
  /** Column number if applicable */
  column?: number;
  /** JSON path to the problematic field */
  path?: string;
  /** Rule pattern that caused the issue */
  rule?: string;
}

/**
 * Rules involved in a conflict
 */
export interface ConflictingRule {
  /** Type of rule (deny, allow, ask) */
  type: 'deny' | 'allow' | 'ask';
  /** The actual rule pattern */
  pattern: string;
  /** Location in the configuration */
  location: ErrorLocation;
}

/**
 * Suggested resolution for validation issues
 */
export interface ResolutionSuggestion {
  /** Type of suggestion */
  type: 'fix' | 'warning' | 'optimization';
  /** Description of the suggestion */
  message: string;
  /** Automated fix if available */
  autoFix?: {
    description: string;
    changes: Record<string, unknown>;
  };
}

/**
 * Parameter validation rules
 */
export interface ParameterValidation {
  /** Minimum value for numbers */
  min?: number;
  /** Maximum value for numbers */
  max?: number;
  /** Regular expression pattern for strings */
  pattern?: string;
  /** Allowed values for enums */
  enum?: string[];
  /** Minimum length for strings/arrays */
  minLength?: number;
  /** Maximum length for strings/arrays */
  maxLength?: number;
}

// =============================================================================
// API Types
// =============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error message if unsuccessful */
  error?: string;
  /** Additional metadata */
  meta?: {
    /** Request timestamp */
    timestamp: Date;
    /** Request ID for tracking */
    requestId: string;
    /** API version */
    version: string;
  };
}

/**
 * Pagination information for list endpoints
 */
export interface PaginationInfo {
  /** Current page number */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items */
  total: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there are more pages */
  hasNext: boolean;
  /** Whether there are previous pages */
  hasPrevious: boolean;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  /** Pagination information */
  pagination: PaginationInfo;
}

// =============================================================================
// Configuration Management Types
// =============================================================================

/**
 * Configuration deployment status
 */
export interface DeploymentStatus {
  /** Deployment ID */
  id: string;
  /** Configuration being deployed */
  configurationId: string;
  /** Target environment */
  environment: Environment;
  /** Current deployment status */
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
  /** When deployment started */
  startedAt: Date;
  /** When deployment completed (if applicable) */
  completedAt?: Date;
  /** Error message if deployment failed */
  error?: string;
  /** User who initiated the deployment */
  deployedBy: string;
}

/**
 * Configuration history entry
 */
export interface ConfigurationHistory {
  /** Unique history entry ID */
  id: string;
  /** Configuration ID this history belongs to */
  configurationId: string;
  /** Version number */
  version: number;
  /** Configuration content at this version */
  configuration: ClaudeCodeConfiguration;
  /** Changes made in this version */
  changes: string;
  /** User who made the changes */
  changedBy: string;
  /** When changes were made */
  changedAt: Date;
}

// =============================================================================
// Plugin System Types (Task 11)
// =============================================================================

/**
 * Plugin execution context for integrating with validation system
 */
export interface PluginIntegration {
  /** Execute validation plugins */
  executeValidationPlugins?: (config: ClaudeCodeConfiguration) => Promise<ValidationResult[]>;
  /** Get templates from template plugins */
  getPluginTemplates?: () => Promise<SecurityTemplate[]>;
  /** Generate reports using reporter plugins */
  generatePluginReports?: (result: ValidationResult, formats: string[]) => Promise<any[]>;
}

// =============================================================================
// Template Extensibility Types
// =============================================================================

/**
 * Template inheritance chain levels
 */
export type InheritanceLevel = 'base' | 'organization' | 'team' | 'project' | 'user';

/**
 * Template extension types
 */
export type ExtensionType = 'inherit' | 'extend' | 'override' | 'compose';

/**
 * Extended template with inheritance support
 */
export interface ExtendableTemplate extends SecurityTemplate {
  /** Inheritance metadata */
  inheritance: {
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
  };
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

// =============================================================================
// Template Engine Types
// =============================================================================

/**
 * Template inheritance engine interface
 */
export interface TemplateInheritanceEngine {
  resolveInheritanceChain(templateId: string, context: TemplateBuildContext): Promise<ExtendableTemplate[]>;
  applyInheritance(base: ExtendableTemplate, child: ExtendableTemplate, context: TemplateBuildContext): Promise<ExtendableTemplate>;
}

/**
 * Template composer interface
 */
export interface TemplateComposer {
  compose(config: CompositionConfig, context: TemplateBuildContext): Promise<ExtendableTemplate>;
  mergeTemplates(templates: ExtendableTemplate[], strategy: MergeStrategy): Promise<ExtendableTemplate>;
}

/**
 * Template validator interface
 */
export interface TemplateValidator {
  validateRule(rule: unknown): Promise<boolean>;
  validateConfiguration(config: ClaudeCodeConfiguration): Promise<TemplateValidationResult>;
  validateExtension(extension: TemplateExtension): Promise<boolean>;
  validateTemplate(template: SecurityTemplate): Promise<TemplateValidationResult>;
}

/**
 * Template plugin manager interface
 */
export interface TemplatePluginManager {
  loadPlugin(pluginPath: string): Promise<void>;
  executePlugin(pluginId: string, context: TemplatePluginContext): Promise<unknown>;
  listPlugins(): Promise<string[]>;
}

/**
 * Template extension manager interface
 */
export interface TemplateExtensionManager {
  registerExtension(extension: TemplateExtension): Promise<void>;
  applyExtensions(template: ExtendableTemplate, context: TemplateBuildContext): Promise<ExtendableTemplate>;
  listExtensions(templateId: string): Promise<TemplateExtension[]>;
}

/**
 * Custom template builder interface
 */
export interface CustomTemplateBuilder {
  createTemplate(config: Partial<SecurityTemplate>): SecurityTemplate;
  extendTemplate(baseId: string, extensions: Partial<SecurityTemplate>): Promise<ExtendableTemplate>;
  validateTemplate(template: SecurityTemplate): Promise<TemplateValidationResult>;
}

/**
 * Extension registry entry
 */
export interface ExtensionRegistryEntry {
  id: string;
  extension: TemplateExtension;
  state: 'active' | 'inactive' | 'error';
  lastApplied?: Date;
  error?: string;
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

// =============================================================================
// Validation System Types
// =============================================================================

/**
 * Pattern type for validation
 */
export type PatternType = 'file' | 'execute' | 'network' | 'read' | 'write' | 'delete';

/**
 * Security analysis result
 */
export interface SecurityAnalysis {
  risks: SecurityIssue[];
  bypasses: BypassVector[];
  score: number;
}

/**
 * Security issue
 */
export interface SecurityIssue {
  type: string;
  severity: SecurityImpact;
  message: string;
}

/**
 * Bypass vector
 */
export interface BypassVector {
  vector: string;
  method: string;
  impact: SecurityImpact;
}

/**
 * Normalized rule for validation
 */
export interface NormalizedRule {
  type: 'deny' | 'allow' | 'ask';
  pattern: string;
  original: string;
  metadata?: Record<string, unknown>;
}

/**
 * Pattern overlap analysis
 */
export interface PatternOverlapAnalysis {
  overlapType: 'exact' | 'subset' | 'superset' | 'partial' | 'none';
  overlapPercentage: number;
  conflictingPatterns: string[];
  suggestions: string[];
}

/**
 * Sandbox result for plugin execution
 */
export interface SandboxResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  timeout: boolean;
  memory?: number;
}

// =============================================================================
// Export all types for easy importing
// =============================================================================

// Types are already exported via their interface/type declarations above

// Note: Additional type modules will be added as they are implemented
// export * from './validation';
// export * from './templates';  
// export * from './audit';
// Plugin system types are exported from ./plugins/types