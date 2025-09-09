import { RuleConflict, ClaudeCodeConfiguration } from '../types/index';
import { ConflictDetectionEngine } from './conflicts';

/**
 * Main conflict detector for rule conflicts
 */
export class RuleConflictDetector {
  private detector: ConflictDetectionEngine;

  constructor() {
    this.detector = new ConflictDetectionEngine();
  }

  /**
   * Detect conflicts in a configuration
   */
  async detectConflicts(config: ClaudeCodeConfiguration): Promise<RuleConflict[]> {
    const rules = await this.normalizeRules(config);
    const result = await this.detector.detectConflicts(rules);
    return result.conflicts;
  }

  /**
   * Quick conflict check for benchmarking
   */
  async hasConflicts(config: ClaudeCodeConfiguration): Promise<boolean> {
    const conflicts = await this.detectConflicts(config);
    return conflicts.length > 0;
  }

  /**
   * Normalize rules from configuration
   */
  private async normalizeRules(config: ClaudeCodeConfiguration): Promise<any[]> {
    const normalized: any[] = [];
    let priority = 0;

    // Process deny rules
    if (config.permissions?.deny) {
      for (let i = 0; i < config.permissions.deny.length; i++) {
        const rule = config.permissions.deny[i];
        if (rule) {
          normalized.push({
            original: rule,
            normalized: rule,
            patternType: 'literal',
            category: 'deny',
            priority: priority++,
            index: i
          });
        }
      }
    }

    // Process ask rules  
    if (config.permissions?.ask) {
      for (let i = 0; i < config.permissions.ask.length; i++) {
        const rule = config.permissions.ask[i];
        if (rule) {
          normalized.push({
            original: rule,
            normalized: rule,
            patternType: 'literal',
            category: 'ask',
            priority: priority++,
            index: i
          });
        }
      }
    }

    // Process allow rules
    if (config.permissions?.allow) {
      for (let i = 0; i < config.permissions.allow.length; i++) {
        const rule = config.permissions.allow[i];
        if (rule) {
          normalized.push({
            original: rule,
            normalized: rule,
            patternType: 'literal',
            category: 'allow',
            priority: priority++,
            index: i
          });
        }
      }
    }

    return normalized;
  }
}

// Default instance for convenience
export const ruleConflictDetector = new RuleConflictDetector();
export default ruleConflictDetector;