/**
 * Validation module exports
 * Core validation engine with zero-bypass security and <100ms performance
 */

// Main validation engine
export { ValidationEngine, validationEngine } from './engine';

// Cache system for performance optimization
export { ValidationCache } from './cache';

// Validation-specific types
export * from './types';

// Re-export relevant types from main types
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  RuleConflict,
  ValidationPerformance,
  ResolutionSuggestion,
  ConflictingRule,
  SecurityImpact,
  ConflictType,
  ResolutionStrategy
} from '../types';

/**
 * Quick validation helper for simple use cases
 */
import { ClaudeCodeConfiguration, ValidationResult } from '../types';
import { validationEngine } from './engine';

export async function validateConfiguration(
  config: ClaudeCodeConfiguration
): Promise<ValidationResult> {
  return validationEngine.validate(config);
}

/**
 * Validate with custom options
 */
import { ValidationOptions } from './types';

export async function validateWithOptions(
  config: ClaudeCodeConfiguration,
  options: ValidationOptions
): Promise<ValidationResult> {
  return validationEngine.validate(config, options);
}

/**
 * Get validation statistics without full validation
 */
import { RuleStatistics } from './types';

export function getConfigurationStatistics(
  config: ClaudeCodeConfiguration
): RuleStatistics {
  return validationEngine.getRuleStatistics(config);
}