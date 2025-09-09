/**
 * Additional types specific to the validation engine
 * Extends core types with implementation-specific interfaces
 */

import { 
  ClaudeCodeConfiguration, 
  ValidationResult,
  RuleConflict,
  ValidationError,
  ValidationWarning 
} from '../types/index';

/**
 * Rule pattern types for matching
 */
export type PatternType = 'glob' | 'regex' | 'literal';

/**
 * Normalized rule for internal processing
 */
export interface NormalizedRule {
  /** Original rule string */
  original: string;
  /** Normalized pattern for comparison */
  normalized: string;
  /** Type of pattern */
  patternType: PatternType;
  /** Compiled regex if applicable */
  regex?: RegExp;
  /** Rule category (deny/allow/ask) */
  category: 'deny' | 'allow' | 'ask';
  /** Priority for conflict resolution */
  priority: number;
  /** Index in original array */
  index: number;
}

/**
 * Rule overlap detection result
 */
export interface RuleOverlap {
  /** First rule in overlap */
  rule1: NormalizedRule;
  /** Second rule in overlap */
  rule2: NormalizedRule;
  /** Type of overlap detected */
  overlapType: 'exact' | 'subset' | 'superset' | 'partial' | 'none';
  /** Examples of overlapping patterns */
  examples: string[];
  /** Security impact of this overlap */
  securityImpact: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Worker thread message types
 */
export interface WorkerMessage {
  type: 'validate' | 'detectConflicts' | 'normalizeRules' | 'shutdown';
  id: string;
  payload: any;
}

/**
 * Worker thread response
 */
export interface WorkerResponse {
  type: 'result' | 'error' | 'progress';
  id: string;
  payload: any;
  error?: string;
}

/**
 * Validation context for passing to workers
 */
export interface ValidationContext {
  /** Configuration to validate */
  config: ClaudeCodeConfiguration;
  /** Hash of the configuration */
  configHash: string;
  /** Validation options */
  options: ValidationOptions;
  /** Start timestamp for performance tracking */
  startTime: number;
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Enable strict mode (more thorough but slower) */
  strictMode?: boolean;
  /** Skip conflict detection for performance */
  skipConflictDetection?: boolean;
  /** Skip cache for fresh validation */
  skipCache?: boolean;
  /** Maximum time allowed for validation in ms */
  timeout?: number;
  /** Enable parallel processing */
  parallel?: boolean;
  /** Number of worker threads to use */
  workerCount?: number;
  /** Custom patterns to check against */
  customPatterns?: string[];
}

/**
 * Pattern matching result
 */
export interface PatternMatch {
  /** The pattern that matched */
  pattern: string;
  /** The input that was matched */
  input: string;
  /** Match confidence score (0-1) */
  confidence: number;
  /** Match type */
  matchType: 'exact' | 'glob' | 'regex';
}

/**
 * Rule evaluation result
 */
export interface RuleEvaluation {
  /** The rule being evaluated */
  rule: NormalizedRule;
  /** Whether the rule is valid */
  isValid: boolean;
  /** Errors found in the rule */
  errors: ValidationError[];
  /** Warnings for the rule */
  warnings: ValidationWarning[];
  /** Performance impact of this rule */
  performanceImpact: 'high' | 'medium' | 'low' | 'negligible';
}

/**
 * Conflict detection result
 */
export interface ConflictDetectionResult {
  /** All conflicts detected */
  conflicts: RuleConflict[];
  /** Overlapping rules */
  overlaps: RuleOverlap[];
  /** Time taken for detection in ms */
  detectionTime: number;
  /** Number of rule pairs analyzed */
  pairsAnalyzed: number;
}

/**
 * Performance metrics for detailed tracking
 */
export interface DetailedPerformanceMetrics {
  /** Total validation time */
  totalTime: number;
  /** Time spent parsing configuration */
  parsingTime: number;
  /** Time spent normalizing rules */
  normalizationTime: number;
  /** Time spent validating individual rules */
  ruleValidationTime: number;
  /** Time spent detecting conflicts */
  conflictDetectionTime: number;
  /** Time spent generating suggestions */
  suggestionTime: number;
  /** Time spent in cache operations */
  cacheTime: number;
  /** Time spent in worker communication */
  workerOverhead?: number;
  /** Memory used during validation (bytes) */
  memoryUsed: number;
  /** CPU usage percentage */
  cpuUsage?: number;
}

/**
 * Security analysis result
 */
export interface SecurityAnalysis {
  /** Overall security score (0-100) */
  securityScore: number;
  /** Critical security issues found */
  criticalIssues: SecurityIssue[];
  /** Potential bypass vectors identified */
  bypassVectors: BypassVector[];
  /** Recommendations for improvement */
  recommendations: string[];
}

/**
 * Security issue detected during validation
 */
export interface SecurityIssue {
  /** Issue type */
  type: 'zero-bypass-violation' | 'weak-pattern' | 'overly-permissive' | 'missing-deny';
  /** Severity of the issue */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Description of the issue */
  description: string;
  /** Affected rules */
  affectedRules: string[];
  /** Suggested fix */
  suggestedFix: string;
}

/**
 * Potential bypass vector
 */
export interface BypassVector {
  /** Vector type */
  type: 'pattern-escape' | 'precedence-exploit' | 'timing-attack';
  /** Description of how bypass could occur */
  description: string;
  /** Example exploit */
  example: string;
  /** Mitigation strategy */
  mitigation: string;
}

/**
 * Batch validation request
 */
export interface BatchValidationRequest {
  /** Unique request ID */
  id: string;
  /** Configurations to validate */
  configurations: ClaudeCodeConfiguration[];
  /** Options for all validations */
  options: ValidationOptions;
}

/**
 * Batch validation response
 */
export interface BatchValidationResponse {
  /** Request ID */
  id: string;
  /** Results for each configuration */
  results: ValidationResult[];
  /** Total time for batch validation */
  totalTime: number;
  /** Number of configurations validated */
  count: number;
  /** Number of successful validations */
  successCount: number;
  /** Number of failed validations */
  failureCount: number;
}

/**
 * Rule precedence information
 */
export interface RulePrecedence {
  /** Rule pattern */
  pattern: string;
  /** Rule category */
  category: 'deny' | 'allow' | 'ask';
  /** Calculated precedence value */
  precedence: number;
  /** Factors affecting precedence */
  factors: {
    specificity: number;
    position: number;
    category: number;
  };
}

/**
 * Validation state for tracking progress
 */
export interface ValidationState {
  /** Current phase of validation */
  phase: 'initializing' | 'parsing' | 'normalizing' | 'validating' | 'detecting-conflicts' | 'generating-suggestions' | 'complete';
  /** Progress percentage (0-100) */
  progress: number;
  /** Current operation description */
  currentOperation: string;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining?: number;
}

/**
 * Cache warming configuration
 */
export interface CacheWarmingConfig {
  /** Common configurations to pre-cache */
  commonConfigs: ClaudeCodeConfiguration[];
  /** Whether to warm cache on startup */
  warmOnStartup: boolean;
  /** Maximum configurations to warm */
  maxWarmupConfigs: number;
  /** Warm cache in background */
  backgroundWarmup: boolean;
}

/**
 * Validation engine configuration
 */
export interface ValidationEngineConfig {
  /** Maximum worker threads */
  maxWorkers: number;
  /** Cache configuration */
  cache: {
    enabled: boolean;
    maxEntries: number;
    maxMemoryMB: number;
    ttlMs: number;
  };
  /** Performance targets */
  performance: {
    targetMs: number;
    strictTimeout: boolean;
  };
  /** Security settings */
  security: {
    enforceZeroBypass: boolean;
    detectWeakPatterns: boolean;
    requireDenyRules: boolean;
  };
}

/**
 * Rule statistics for analysis
 */
export interface RuleStatistics {
  /** Total number of rules */
  totalRules: number;
  /** Breakdown by category */
  byCategory: {
    deny: number;
    allow: number;
    ask: number;
  };
  /** Complexity metrics */
  complexity: {
    averagePatternLength: number;
    maxPatternLength: number;
    regexCount: number;
    globCount: number;
    literalCount: number;
  };
  /** Coverage analysis */
  coverage: {
    estimatedCoverage: number;
    uncoveredPatterns: string[];
    redundantRules: string[];
  };
}