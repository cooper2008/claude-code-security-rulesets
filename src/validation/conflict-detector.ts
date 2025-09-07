import { RuleConflict, ClaudeCodeConfiguration } from '../types';
import { ConflictDetector } from './conflicts';

/**
 * Main conflict detector for rule conflicts
 */
export class RuleConflictDetector {
  private detector: ConflictDetector;

  constructor() {
    this.detector = new ConflictDetector();
  }

  /**
   * Detect conflicts in a configuration
   */
  async detectConflicts(config: ClaudeCodeConfiguration): Promise<RuleConflict[]> {
    return await this.detector.detectConflicts(config);
  }

  /**
   * Quick conflict check for benchmarking
   */
  async hasConflicts(config: ClaudeCodeConfiguration): Promise<boolean> {
    const conflicts = await this.detectConflicts(config);
    return conflicts.length > 0;
  }
}

// Default instance for convenience
export const conflictDetector = new RuleConflictDetector();
export default conflictDetector;