/**
 * Distribution System Types for pushing security configs to 1000+ developers
 * Enterprise-grade distribution with multiple strategies and monitoring
 */

import type { ClaudeCodeConfiguration, Environment, ValidationResult } from '@/types';

// =============================================================================
// Distribution Strategy Types
// =============================================================================

/**
 * Available distribution strategies for deploying configurations
 */
export type DistributionStrategy = 
  | 'npm'
  | 'git'
  | 'ssh'
  | 'ci-cd'
  | 'config-mgmt'
  | 'package-mgr'
  | 'webhook'
  | 'hybrid';

/**
 * Distribution target specification
 */
export interface DistributionTarget {
  /** Unique target identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Target type */
  type: DistributionTargetType;
  /** Distribution strategy to use */
  strategy: DistributionStrategy;
  /** Connection configuration */
  connection: DistributionConnection;
  /** Target-specific metadata */
  metadata: DistributionMetadata;
  /** Health check configuration */
  healthCheck: HealthCheckConfig;
}

export type DistributionTargetType = 
  | 'developer-machine'
  | 'team-environment'
  | 'department'
  | 'ci-cd-pipeline'
  | 'development-cluster'
  | 'git-repository';

// =============================================================================
// Connection Configuration Types
// =============================================================================

export interface DistributionConnection {
  /** Strategy-specific connection details */
  strategy: DistributionStrategy;
  /** Connection parameters */
  config: ConnectionConfig;
  /** Authentication details */
  auth?: AuthenticationConfig;
  /** Connection timeout settings */
  timeout?: TimeoutConfig;
  /** Retry configuration */
  retry?: RetryConfig;
}

export type ConnectionConfig = 
  | NpmConnectionConfig
  | GitConnectionConfig  
  | SshConnectionConfig
  | CicdConnectionConfig
  | ConfigMgmtConnectionConfig
  | PackageManagerConnectionConfig
  | WebhookConnectionConfig;

export interface NpmConnectionConfig {
  type: 'npm';
  /** NPM registry URL */
  registryUrl: string;
  /** Package name pattern */
  packageName: string;
  /** Package scope */
  scope?: string;
  /** Publish settings */
  publishSettings: {
    /** Whether to make package public */
    public: boolean;
    /** Package tags to apply */
    tags: string[];
    /** Distribution files */
    files: string[];
  };
}

export interface GitConnectionConfig {
  type: 'git';
  /** Git repository URL */
  repositoryUrl: string;
  /** Target branch */
  branch: string;
  /** Deployment method */
  method: 'submodule' | 'subtree' | 'direct-push' | 'pull-request';
  /** Path within repository */
  targetPath: string;
  /** Git hooks to install */
  hooks?: string[];
}

export interface SshConnectionConfig {
  type: 'ssh';
  /** SSH host */
  host: string;
  /** SSH port */
  port: number;
  /** SSH username */
  username: string;
  /** Target path on remote system */
  targetPath: string;
  /** SSH key path or content */
  keyPath?: string;
  /** Deployment method */
  method: 'scp' | 'sftp' | 'rsync';
}

export interface CicdConnectionConfig {
  type: 'ci-cd';
  /** CI/CD platform */
  platform: 'github' | 'gitlab' | 'jenkins' | 'azure' | 'circleci';
  /** Repository/project identifier */
  projectId: string;
  /** Pipeline/workflow configuration */
  pipeline: {
    /** Trigger conditions */
    triggers: string[];
    /** Deployment stages */
    stages: string[];
    /** Environment variables */
    environment: Record<string, string>;
  };
}

export interface ConfigMgmtConnectionConfig {
  type: 'config-mgmt';
  /** Configuration management tool */
  tool: 'ansible' | 'puppet' | 'chef' | 'saltstack';
  /** Connection details specific to tool */
  toolConfig: Record<string, any>;
  /** Playbook/manifest/recipe details */
  automation: {
    /** Path to automation files */
    path: string;
    /** Execution parameters */
    parameters: Record<string, any>;
  };
}

export interface PackageManagerConnectionConfig {
  type: 'package-mgr';
  /** Package manager type */
  manager: 'homebrew' | 'chocolatey' | 'snap' | 'yum' | 'apt';
  /** Package details */
  package: {
    /** Package name */
    name: string;
    /** Repository URL */
    repository?: string;
    /** Installation parameters */
    installParams: string[];
  };
}

export interface WebhookConnectionConfig {
  type: 'webhook';
  /** Webhook URL */
  url: string;
  /** HTTP method */
  method: 'POST' | 'PUT' | 'PATCH';
  /** Request headers */
  headers: Record<string, string>;
  /** Payload template */
  payloadTemplate: string;
}

// =============================================================================
// Authentication and Security
// =============================================================================

export interface AuthenticationConfig {
  /** Authentication method */
  method: AuthMethod;
  /** Method-specific credentials */
  credentials: AuthCredentials;
  /** Token refresh configuration */
  refresh?: TokenRefreshConfig;
}

export type AuthMethod = 
  | 'api-key'
  | 'oauth2'
  | 'basic'
  | 'bearer-token'
  | 'ssh-key'
  | 'certificate';

export type AuthCredentials = 
  | ApiKeyCredentials
  | OAuth2Credentials
  | BasicAuthCredentials
  | BearerTokenCredentials
  | SshKeyCredentials
  | CertificateCredentials;

export interface ApiKeyCredentials {
  type: 'api-key';
  /** API key value */
  key: string;
  /** Key header name */
  header?: string;
}

export interface OAuth2Credentials {
  type: 'oauth2';
  /** Client ID */
  clientId: string;
  /** Client secret */
  clientSecret: string;
  /** OAuth2 scopes */
  scopes: string[];
  /** Token endpoint */
  tokenEndpoint: string;
  /** Current access token */
  accessToken?: string;
  /** Current refresh token */
  refreshToken?: string;
}

export interface BasicAuthCredentials {
  type: 'basic';
  /** Username */
  username: string;
  /** Password */
  password: string;
}

export interface BearerTokenCredentials {
  type: 'bearer-token';
  /** Bearer token */
  token: string;
}

export interface SshKeyCredentials {
  type: 'ssh-key';
  /** Private key content or path */
  privateKey: string;
  /** Public key content or path */
  publicKey?: string;
  /** Key passphrase */
  passphrase?: string;
}

export interface CertificateCredentials {
  type: 'certificate';
  /** Certificate content or path */
  certificate: string;
  /** Private key content or path */
  privateKey: string;
  /** Certificate chain */
  chain?: string[];
}

// =============================================================================
// Deployment Configuration
// =============================================================================

export interface DeploymentConfig {
  /** Deployment identifier */
  id: string;
  /** Configuration to deploy */
  configuration: ClaudeCodeConfiguration;
  /** Target environments */
  targets: DistributionTarget[];
  /** Deployment strategy */
  strategy: DeploymentStrategy;
  /** Rollback configuration */
  rollback: RollbackConfig;
  /** Monitoring configuration */
  monitoring: MonitoringConfig;
  /** Notification settings */
  notifications: NotificationConfig;
}

export interface DeploymentStrategy {
  /** Deployment type */
  type: DeploymentType;
  /** Deployment parameters */
  parameters: DeploymentParameters;
  /** Health checks to perform */
  healthChecks: HealthCheckConfig[];
  /** Validation requirements */
  validation: ValidationRequirement[];
}

export type DeploymentType = 
  | 'immediate'
  | 'blue-green'
  | 'canary'
  | 'rolling'
  | 'staged';

export interface DeploymentParameters {
  /** Maximum concurrent deployments */
  maxConcurrency: number;
  /** Deployment timeout per target */
  timeout: number;
  /** Whether to continue on failures */
  continueOnError: boolean;
  /** Failure threshold before stopping */
  failureThreshold: number;
  /** Rollback on failure */
  autoRollback: boolean;
}

// =============================================================================
// Monitoring and Health Checks
// =============================================================================

export interface HealthCheckConfig {
  /** Health check type */
  type: HealthCheckType;
  /** Check interval in seconds */
  interval: number;
  /** Check timeout in seconds */
  timeout: number;
  /** Number of retries before marking unhealthy */
  retries: number;
  /** Health check endpoint or command */
  endpoint: string;
  /** Expected response criteria */
  criteria: HealthCheckCriteria;
}

export type HealthCheckType = 
  | 'http'
  | 'tcp'
  | 'command'
  | 'file-exists'
  | 'config-validation';

export interface HealthCheckCriteria {
  /** HTTP status codes that indicate health */
  httpStatusCodes?: number[];
  /** Response body pattern to match */
  responsePattern?: string;
  /** Command exit code for success */
  exitCode?: number;
  /** File existence requirements */
  fileExists?: string[];
}

export interface MonitoringConfig {
  /** Metrics to collect */
  metrics: MetricConfig[];
  /** Alerting configuration */
  alerts: AlertConfig[];
  /** Logging configuration */
  logging: LoggingConfig;
  /** Dashboard configuration */
  dashboard?: DashboardConfig;
}

export interface MetricConfig {
  /** Metric name */
  name: string;
  /** Metric type */
  type: 'counter' | 'gauge' | 'histogram';
  /** Collection interval */
  interval: number;
  /** Metric source */
  source: string;
  /** Labels to apply */
  labels: Record<string, string>;
}

export interface AlertConfig {
  /** Alert name */
  name: string;
  /** Alert condition */
  condition: string;
  /** Alert severity */
  severity: 'critical' | 'warning' | 'info';
  /** Notification channels */
  channels: string[];
  /** Cooldown period */
  cooldown: number;
}

// =============================================================================
// Progress Tracking and Reporting
// =============================================================================

export interface DeploymentProgress {
  /** Deployment ID */
  deploymentId: string;
  /** Overall deployment status */
  status: DeploymentStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Total targets */
  totalTargets: number;
  /** Successfully deployed targets */
  successfulTargets: number;
  /** Failed targets */
  failedTargets: number;
  /** Currently deploying targets */
  inProgressTargets: number;
  /** Pending targets */
  pendingTargets: number;
  /** Target-specific progress */
  targetProgress: TargetProgress[];
  /** Deployment start time */
  startedAt: Date;
  /** Estimated completion time */
  estimatedCompletionAt?: Date;
  /** Current deployment phase */
  currentPhase: DeploymentPhase;
}

export type DeploymentStatus = 
  | 'pending'
  | 'validating'
  | 'deploying'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rolling-back';

export type DeploymentPhase = 
  | 'preparation'
  | 'validation'
  | 'deployment'
  | 'health-check'
  | 'verification'
  | 'cleanup'
  | 'rollback';

export interface TargetProgress {
  /** Target ID */
  targetId: string;
  /** Target deployment status */
  status: TargetDeploymentStatus;
  /** Progress percentage for this target */
  progress: number;
  /** Current operation */
  currentOperation?: string;
  /** Error message if failed */
  error?: string;
  /** Start time for this target */
  startedAt?: Date;
  /** Completion time for this target */
  completedAt?: Date;
  /** Deployment logs for this target */
  logs: DeploymentLog[];
}

export type TargetDeploymentStatus = 
  | 'pending'
  | 'connecting'
  | 'uploading'
  | 'installing'
  | 'configuring'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface DeploymentLog {
  /** Log timestamp */
  timestamp: Date;
  /** Log level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Additional context */
  context?: Record<string, any>;
  /** Target ID that generated this log */
  targetId?: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// =============================================================================
// Rollback and Version Management
// =============================================================================

export interface RollbackConfig {
  /** Whether automatic rollback is enabled */
  enabled: boolean;
  /** Rollback triggers */
  triggers: RollbackTrigger[];
  /** Rollback strategy */
  strategy: RollbackStrategy;
  /** Maximum rollback attempts */
  maxAttempts: number;
  /** Rollback timeout */
  timeout: number;
}

export interface RollbackTrigger {
  /** Trigger type */
  type: 'health-check-failure' | 'deployment-failure' | 'manual' | 'timeout';
  /** Trigger parameters */
  parameters: Record<string, any>;
  /** Whether this trigger should initiate rollback */
  enabled: boolean;
}

export interface RollbackStrategy {
  /** Rollback method */
  method: 'previous-version' | 'snapshot' | 'git-revert' | 'backup-restore';
  /** Strategy-specific parameters */
  parameters: Record<string, any>;
  /** Verification steps after rollback */
  verification: string[];
}

// =============================================================================
// Developer Filtering and Targeting
// =============================================================================

export interface DeveloperFilter {
  /** Filter criteria */
  criteria: FilterCriteria[];
  /** Filter logic (AND/OR) */
  logic: 'and' | 'or';
  /** Include/exclude filter */
  type: 'include' | 'exclude';
}

export interface FilterCriteria {
  /** Filter field */
  field: DeveloperField;
  /** Filter operator */
  operator: FilterOperator;
  /** Filter value(s) */
  value: string | string[] | number | boolean;
}

export type DeveloperField = 
  | 'department'
  | 'team'
  | 'role'
  | 'location'
  | 'machine-type'
  | 'environment'
  | 'project'
  | 'skill-level'
  | 'access-level';

export type FilterOperator = 
  | 'equals'
  | 'not-equals'
  | 'contains'
  | 'not-contains'
  | 'starts-with'
  | 'ends-with'
  | 'in'
  | 'not-in'
  | 'greater-than'
  | 'less-than';

// =============================================================================
// Configuration Management
// =============================================================================

export interface DistributionMetadata {
  /** Organization information */
  organization: {
    id: string;
    name: string;
    domain?: string;
  };
  /** Target environment details */
  environment: {
    type: Environment;
    version?: string;
    region?: string;
  };
  /** Developer information */
  developer?: {
    id: string;
    email: string;
    department: string;
    team: string;
    role: string;
  };
  /** Machine information */
  machine?: {
    type: 'workstation' | 'laptop' | 'server' | 'container' | 'vm';
    os: string;
    architecture: string;
    hostname?: string;
  };
  /** Tags for organization and filtering */
  tags: Record<string, string>;
}

export interface TimeoutConfig {
  /** Connection timeout in milliseconds */
  connection: number;
  /** Operation timeout in milliseconds */
  operation: number;
  /** Total timeout in milliseconds */
  total: number;
}

export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial retry delay in milliseconds */
  initialDelay: number;
  /** Retry delay multiplier */
  backoffMultiplier: number;
  /** Maximum retry delay in milliseconds */
  maxDelay: number;
  /** Retry on specific error types */
  retryOnErrors: string[];
}

export interface TokenRefreshConfig {
  /** Whether to auto-refresh tokens */
  enabled: boolean;
  /** Refresh threshold (seconds before expiry) */
  threshold: number;
  /** Refresh retry configuration */
  retry: RetryConfig;
}

export interface ValidationRequirement {
  /** Validation type */
  type: 'syntax' | 'security' | 'performance' | 'compliance';
  /** Whether validation is required */
  required: boolean;
  /** Validation parameters */
  parameters: Record<string, any>;
  /** Validation timeout */
  timeout: number;
}

export interface NotificationConfig {
  /** Notification channels */
  channels: NotificationChannel[];
  /** Events to notify on */
  events: NotificationEvent[];
  /** Notification templates */
  templates: NotificationTemplate[];
}

export interface NotificationChannel {
  /** Channel type */
  type: 'email' | 'slack' | 'teams' | 'webhook' | 'sms';
  /** Channel configuration */
  config: Record<string, any>;
  /** Whether channel is enabled */
  enabled: boolean;
}

export type NotificationEvent = 
  | 'deployment-started'
  | 'deployment-completed'
  | 'deployment-failed'
  | 'rollback-started'
  | 'rollback-completed'
  | 'health-check-failed';

export interface NotificationTemplate {
  /** Template name */
  name: string;
  /** Template content */
  content: string;
  /** Template variables */
  variables: string[];
}

export interface LoggingConfig {
  /** Log level */
  level: LogLevel;
  /** Log format */
  format: 'json' | 'text';
  /** Log destinations */
  destinations: string[];
  /** Log retention policy */
  retention: {
    days: number;
    maxSize: string;
  };
}

export interface DashboardConfig {
  /** Dashboard provider */
  provider: 'grafana' | 'datadog' | 'custom';
  /** Dashboard URL */
  url: string;
  /** Dashboard configuration */
  config: Record<string, any>;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface DistributionResult {
  /** Deployment ID */
  deploymentId: string;
  /** Overall success status */
  success: boolean;
  /** Summary message */
  message: string;
  /** Deployment progress */
  progress: DeploymentProgress;
  /** Individual target results */
  results: TargetResult[];
  /** Deployment metrics */
  metrics: DeploymentMetrics;
}

export interface TargetResult {
  /** Target ID */
  targetId: string;
  /** Target name */
  targetName: string;
  /** Success status */
  success: boolean;
  /** Result message */
  message: string;
  /** Deployment duration */
  duration: number;
  /** Error details if failed */
  error?: DeploymentError;
  /** Configuration hash */
  configurationHash?: string;
  /** Health check results */
  healthChecks: HealthCheckResult[];
}

export interface DeploymentError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Error details */
  details: Record<string, any>;
  /** Error stack trace */
  stack?: string;
  /** Recovery suggestions */
  suggestions: string[];
}

export interface HealthCheckResult {
  /** Health check name */
  name: string;
  /** Check status */
  status: 'healthy' | 'unhealthy' | 'unknown';
  /** Check message */
  message: string;
  /** Check duration */
  duration: number;
  /** Last check time */
  lastCheck: Date;
}

export interface DeploymentMetrics {
  /** Total deployment time */
  totalDuration: number;
  /** Average deployment time per target */
  averageTargetDuration: number;
  /** Success rate percentage */
  successRate: number;
  /** Total data transferred */
  bytesTransferred: number;
  /** Network statistics */
  networkStats: {
    totalConnections: number;
    failedConnections: number;
    averageLatency: number;
  };
}