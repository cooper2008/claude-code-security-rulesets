/**
 * Validate Command - Validate Claude Code security configuration
 * 
 * Validates configuration files for syntax errors, rule conflicts, and performance issues.
 * Provides detailed feedback with suggestions for fixing issues. Meets <100ms requirement.
 */

import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import Joi from 'joi';
import type { 
  ClaudeCodeConfiguration, 
  ValidationResult,
  ValidationError,
  ValidationWarning,
  RuleConflict,
  ResolutionSuggestion,
  ConflictType,
  SecurityImpact,
  ValidationErrorType,
  ValidationWarningType
} from '@/types';

/**
 * Options for the validate command
 */
interface ValidateOptions {
  schema?: boolean;
  conflicts?: boolean;
  performance?: boolean;
  format?: 'text' | 'json' | 'junit';
  exitCode?: boolean;
}

/**
 * JSON Schema for Claude Code configuration validation
 */
const CLAUDE_CODE_SCHEMA = Joi.object({
  permissions: Joi.object({
    deny: Joi.array().items(Joi.string().min(1)).optional(),
    allow: Joi.array().items(Joi.string().min(1)).optional(),
    ask: Joi.array().items(Joi.string().min(1)).optional(),
  }).optional(),
  metadata: Joi.object({
    version: Joi.string().required(),
    signature: Joi.string().optional(),
    timestamp: Joi.number().integer().positive().required(),
    organization: Joi.string().optional(),
    templateId: Joi.string().optional(),
    name: Joi.string().optional(),
    environment: Joi.string().valid('development', 'staging', 'production', 'test').optional(),
  }).optional(),
}).unknown(true); // Allow additional Claude Code settings

/**
 * Performance timing utility
 */
class PerformanceTimer {
  private startTime: number;
  private phases: Record<string, number> = {};
  
  constructor() {
    this.startTime = performance.now();
  }
  
  markPhase(phase: string): void {
    this.phases[phase] = performance.now() - this.startTime;
  }
  
  getTotal(): number {
    return performance.now() - this.startTime;
  }
  
  getPhases(): Record<string, number> {
    return { ...this.phases };
  }
}

/**
 * Read and parse configuration file
 */
function readConfiguration(filePath: string): ClaudeCodeConfiguration {
  if (!existsSync(filePath)) {
    throw new Error(`Configuration file not found: ${filePath}`);
  }
  
  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as ClaudeCodeConfiguration;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw new Error(`Failed to read configuration file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate against JSON schema
 */
function validateSchema(config: ClaudeCodeConfiguration): ValidationError[] {
  const { error } = CLAUDE_CODE_SCHEMA.validate(config, { 
    abortEarly: false,
    allowUnknown: true 
  });
  
  if (!error) {
    return [];
  }
  
  return error.details.map(detail => ({
    type: 'INVALID_SYNTAX' as ValidationErrorType,
    message: detail.message,
    location: {
      path: detail.path.join('.'),
    },
    context: { value: detail.context?.value },
    severity: 'high' as const,
  }));
}

/**
 * Check for rule pattern conflicts
 */
function detectRuleConflicts(config: ClaudeCodeConfiguration): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  const permissions = config.permissions;
  
  if (!permissions) {
    return conflicts;
  }
  
  const deny = permissions.deny || [];
  const allow = permissions.allow || [];
  const ask = permissions.ask || [];
  
  // Check for allow rules that override deny rules (critical security issue)
  for (const allowRule of allow) {
    for (const denyRule of deny) {
      if (isPatternOverlap(allowRule, denyRule)) {
        conflicts.push({
          type: 'ALLOW_OVERRIDES_DENY' as ConflictType,
          message: `Allow rule '${allowRule}' may override deny rule '${denyRule}'`,
          conflictingRules: [
            { type: 'deny', pattern: denyRule, location: { rule: denyRule } },
            { type: 'allow', pattern: allowRule, location: { rule: allowRule } },
          ],
          resolution: 'MAKE_DENY_MORE_SPECIFIC',
          securityImpact: 'critical' as SecurityImpact,
        });
      }
    }
  }
  
  // Check for overlapping patterns within same category
  const allRules = [...deny, ...allow, ...ask];
  for (let i = 0; i < allRules.length; i++) {
    for (let j = i + 1; j < allRules.length; j++) {
      const rule1 = allRules[i];
      const rule2 = allRules[j];
      if (rule1 && rule2 && isPatternOverlap(rule1, rule2)) {
        const category1 = getRuleCategory(rule1, permissions);
        const category2 = getRuleCategory(rule2, permissions);
        
        if (category1 === category2) {
          conflicts.push({
            type: 'OVERLAPPING_PATTERNS' as ConflictType,
            message: `Overlapping patterns in ${category1}: '${rule1}' and '${rule2}'`,
            conflictingRules: [
              { type: category1, pattern: rule1, location: { rule: rule1 } },
              { type: category2, pattern: rule2, location: { rule: rule2 } },
            ],
            resolution: 'MAKE_ALLOW_MORE_RESTRICTIVE',
            securityImpact: 'medium' as SecurityImpact,
          });
        }
      }
    }
  }
  
  return conflicts;
}

/**
 * Check if two rule patterns overlap
 */
function isPatternOverlap(pattern1: string, pattern2: string): boolean {
  // Simple pattern matching - in a real implementation, this would be more sophisticated
  // Check for wildcard overlaps, regex patterns, etc.
  
  // Exact match
  if (pattern1 === pattern2) {
    return true;
  }
  
  // Wildcard patterns
  if (pattern1.includes('*') || pattern2.includes('*')) {
    const regex1 = patternToRegex(pattern1);
    const regex2 = patternToRegex(pattern2);
    
    // Check if either pattern matches the other
    return regex1.test(pattern2) || regex2.test(pattern1);
  }
  
  // Prefix/suffix patterns
  return pattern1.startsWith(pattern2) || pattern2.startsWith(pattern1);
}

/**
 * Convert pattern to regex for matching
 */
function patternToRegex(pattern: string): RegExp {
  // Escape special regex characters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Convert * to .*
  const regexPattern = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${regexPattern}$`);
}

/**
 * Get rule category (deny, allow, ask)
 */
function getRuleCategory(rule: string, permissions: NonNullable<ClaudeCodeConfiguration['permissions']>): 'deny' | 'allow' | 'ask' {
  if (permissions.deny?.includes(rule)) return 'deny';
  if (permissions.allow?.includes(rule)) return 'allow';
  return 'ask';
}

/**
 * Generate validation warnings
 */
function generateWarnings(config: ClaudeCodeConfiguration): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  
  // Check for deprecated patterns (example)
  const permissions = config.permissions;
  if (permissions) {
    const allRules = [...(permissions.deny || []), ...(permissions.allow || []), ...(permissions.ask || [])];
    
    for (const rule of allRules) {
      if (rule.includes('deprecated_')) {
        warnings.push({
          type: 'DEPRECATED_PATTERN' as ValidationWarningType,
          message: `Rule uses deprecated pattern: ${rule}`,
          location: { rule },
        });
      }
    }
    
    // Performance warning for too many rules
    if (allRules.length > 100) {
      warnings.push({
        type: 'PERFORMANCE_WARNING' as ValidationWarningType,
        message: `Large number of rules (${allRules.length}) may impact performance`,
        context: { ruleCount: allRules.length },
      });
    }
  }
  
  return warnings;
}

/**
 * Generate resolution suggestions
 */
function generateSuggestions(errors: ValidationError[], conflicts: RuleConflict[]): ResolutionSuggestion[] {
  const suggestions: ResolutionSuggestion[] = [];
  
  // Suggestions for conflicts
  for (const conflict of conflicts) {
    if (conflict.type === 'ALLOW_OVERRIDES_DENY') {
      suggestions.push({
        type: 'fix',
        message: `Make deny rule more specific to avoid being overridden by allow rule`,
        autoFix: {
          description: 'Add prefix to deny rule to make it more specific',
          changes: {}, // Would contain actual changes in real implementation
        },
      });
    }
  }
  
  // Suggestions for errors
  for (const error of errors) {
    if (error.type === 'INVALID_PATTERN') {
      suggestions.push({
        type: 'fix',
        message: 'Fix invalid pattern syntax',
      });
    }
  }
  
  return suggestions;
}

/**
 * Validate configuration performance
 */
function validatePerformance(_config: ClaudeCodeConfiguration, timer: PerformanceTimer): ValidationError[] {
  const errors: ValidationError[] = [];
  const totalTime = timer.getTotal();
  
  // Check if validation exceeds performance target
  if (totalTime > 100) { // 100ms target
    errors.push({
      type: 'PERFORMANCE_VIOLATION' as ValidationErrorType,
      message: `Validation took ${totalTime.toFixed(2)}ms, exceeding 100ms target`,
      severity: 'medium' as const,
      context: { validationTime: totalTime, target: 100 },
    });
  }
  
  return errors;
}

/**
 * Format validation results based on output format
 */
function formatResults(result: ValidationResult, format: string): string {
  switch (format) {
    case 'json':
      return JSON.stringify(result, null, 2);
      
    case 'junit':
      return formatJUnitXML(result);
      
    default: // text
      return formatTextOutput(result);
  }
}

/**
 * Format results as text (default)
 */
function formatTextOutput(result: ValidationResult): string {
  const lines: string[] = [];
  
  // Header
  if (result.isValid) {
    lines.push(chalk.green.bold('✅ Configuration is valid'));
  } else {
    lines.push(chalk.red.bold('❌ Configuration has issues'));
  }
  
  lines.push('');
  
  // Performance info
  lines.push(chalk.blue('Performance:'));
  lines.push(chalk.gray(`  Validation time: ${result.performance.validationTime.toFixed(2)}ms`));
  lines.push(chalk.gray(`  Rules processed: ${result.performance.rulesProcessed}`));
  lines.push(chalk.gray(`  Target met: ${result.performance.performanceTarget.achieved ? '✅' : '❌'}`));
  lines.push('');
  
  // Errors
  if (result.errors.length > 0) {
    lines.push(chalk.red.bold(`Errors (${result.errors.length}):`));
    for (const error of result.errors) {
      lines.push(chalk.red(`  ❌ ${error.message}`));
      if (error.location?.path) {
        lines.push(chalk.gray(`     at ${error.location.path}`));
      }
    }
    lines.push('');
  }
  
  // Conflicts
  if (result.conflicts.length > 0) {
    lines.push(chalk.red.bold(`Conflicts (${result.conflicts.length}):`));
    for (const conflict of result.conflicts) {
      lines.push(chalk.red(`  ⚠️  ${conflict.message}`));
      lines.push(chalk.gray(`     Impact: ${conflict.securityImpact}`));
      lines.push(chalk.gray(`     Resolution: ${conflict.resolution}`));
    }
    lines.push('');
  }
  
  // Warnings
  if (result.warnings.length > 0) {
    lines.push(chalk.yellow.bold(`Warnings (${result.warnings.length}):`));
    for (const warning of result.warnings) {
      lines.push(chalk.yellow(`  ⚠️  ${warning.message}`));
    }
    lines.push('');
  }
  
  // Suggestions
  if (result.suggestions.length > 0) {
    lines.push(chalk.blue.bold(`Suggestions (${result.suggestions.length}):`));
    for (const suggestion of result.suggestions) {
      lines.push(chalk.blue(`  💡 ${suggestion.message}`));
    }
  }
  
  return lines.join('\n');
}

/**
 * Format results as JUnit XML for CI/CD integration
 */
function formatJUnitXML(result: ValidationResult): string {
  const testCases: string[] = [];
  
  // Add test cases for each validation aspect
  if (result.errors.length === 0) {
    testCases.push('<testcase classname="Validation" name="Schema" />');
  } else {
    for (const error of result.errors) {
      testCases.push(
        `<testcase classname="Validation" name="Schema">` +
        `<failure message="${escapeXML(error.message)}" />` +
        `</testcase>`
      );
    }
  }
  
  if (result.conflicts.length === 0) {
    testCases.push('<testcase classname="Validation" name="Conflicts" />');
  } else {
    for (const conflict of result.conflicts) {
      testCases.push(
        `<testcase classname="Validation" name="Conflicts">` +
        `<failure message="${escapeXML(conflict.message)}" />` +
        `</testcase>`
      );
    }
  }
  
  const totalTests = Math.max(result.errors.length + result.conflicts.length, 2);
  const failures = result.errors.length + result.conflicts.length;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="Claude Security Validation" tests="${totalTests}" failures="${failures}" time="${result.performance.validationTime / 1000}">
${testCases.join('\n')}
</testsuite>`;
}

/**
 * Escape XML characters
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Main handler for the validate command
 */
export async function handleValidate(file: string | undefined, options: ValidateOptions): Promise<void> {
  const timer = new PerformanceTimer();
  
  try {
    const filePath = resolve(file || 'claude-security.json');
    
    console.log(chalk.blue(`Validating configuration: ${filePath}`));
    
    // Read and parse configuration
    const config = readConfiguration(filePath);
    timer.markPhase('parsing');
    
    // Initialize validation result
    let errors: ValidationError[] = [];
    let warnings: ValidationWarning[] = [];
    let conflicts: RuleConflict[] = [];
    
    // Schema validation (unless disabled)
    if (!options.conflicts && !options.performance) {
      errors = errors.concat(validateSchema(config));
      timer.markPhase('ruleValidation');
    }
    
    // Conflict detection (unless disabled)
    if (!options.schema && !options.performance) {
      conflicts = detectRuleConflicts(config);
      timer.markPhase('conflictDetection');
    }
    
    // Performance validation
    const performanceErrors = validatePerformance(config, timer);
    if (options.performance || (!options.schema && !options.conflicts)) {
      errors = errors.concat(performanceErrors);
    }
    
    // Generate warnings and suggestions
    warnings = generateWarnings(config);
    const suggestions = generateSuggestions(errors, conflicts);
    timer.markPhase('suggestionGeneration');
    
    // Calculate total rules processed
    const permissions = config.permissions || {};
    const rulesProcessed = (permissions.deny?.length || 0) + 
                          (permissions.allow?.length || 0) + 
                          (permissions.ask?.length || 0);
    
    // Create validation result
    const result: ValidationResult = {
      isValid: errors.length === 0 && conflicts.length === 0,
      errors,
      warnings,
      conflicts,
      suggestions,
      performance: {
        validationTime: timer.getTotal(),
        rulesProcessed,
        performanceTarget: {
          target: 100,
          achieved: timer.getTotal() <= 100,
        },
        breakdown: {
          parsing: timer.getPhases().parsing || 0,
          ruleValidation: timer.getPhases().ruleValidation || 0,
          conflictDetection: timer.getPhases().conflictDetection || 0,
          suggestionGeneration: timer.getPhases().suggestionGeneration || 0,
        },
      },
    };
    
    // Output results
    const output = formatResults(result, options.format || 'text');
    console.log(output);
    
    // Exit with appropriate code
    if (options.exitCode && !result.isValid) {
      process.exit(1);
    }
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
    throw new Error(`Validation failed: ${String(error)}`);
  }
}