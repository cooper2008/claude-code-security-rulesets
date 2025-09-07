/**
 * Rollback Service for Enterprise Distribution System
 * Handles version control and instant rollback capabilities
 */

import { EventEmitter } from 'events';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import crypto from 'crypto';
import type { 
  RollbackConfig,
  RollbackTrigger,
  RollbackStrategy,
  DistributionTarget,
  DeploymentProgress,
  TargetResult,
  DeploymentError
} from './types';
import type { ClaudeCodeConfiguration } from '@/types';
import { StrategyManager } from './strategies/manager';

/**
 * Rollback snapshot for version management
 */
export interface RollbackSnapshot {
  snapshotId: string;
  deploymentId: string;
  targetId: string;
  timestamp: Date;
  configuration: ClaudeCodeConfiguration;
  previousConfiguration?: ClaudeCodeConfiguration;
  metadata: {
    strategy: string;
    version: string;
    environment: string;
    backupPath?: string;
  };
  checksum: string;
}

/**
 * Rollback operation record
 */
export interface RollbackOperation {
  operationId: string;
  deploymentId: string;
  triggeredBy: 'manual' | 'automatic';
  trigger?: RollbackTrigger;
  startedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  targetsProcessed: number;
  targetsFailed: number;
  snapshots: RollbackSnapshot[];
  error?: DeploymentError;
}

/**
 * Deployment execution context for rollback operations
 */
interface DeploymentExecution {
  deploymentId: string;
  progress: DeploymentProgress;
  targetExecutions: Map<string, any>;
  config: any;
  rollbackStack: RollbackOperation[];
}

/**
 * Rollback service for enterprise deployment recovery
 */
export class RollbackService extends EventEmitter {
  private snapshots = new Map<string, RollbackSnapshot>();
  private operations = new Map<string, RollbackOperation>();
  private strategyManager: StrategyManager;
  private snapshotStorage: string;

  constructor(snapshotStoragePath?: string) {
    super();
    this.strategyManager = new StrategyManager();
    this.snapshotStorage = snapshotStoragePath || join(process.cwd(), '.claude-rollback-snapshots');
    this.ensureStorageDirectory();
  }

  /**
   * Create rollback snapshot before deployment
   */
  async createSnapshot(
    deploymentId: string,
    target: DistributionTarget,
    currentConfiguration?: ClaudeCodeConfiguration,
    newConfiguration?: ClaudeCodeConfiguration
  ): Promise<RollbackSnapshot> {
    const snapshotId = crypto.randomUUID();
    const timestamp = new Date();

    // Try to get current configuration from target
    let existingConfig: ClaudeCodeConfiguration | undefined;
    try {
      existingConfig = await this.getCurrentConfiguration(target);
    } catch (error) {
      // Configuration may not exist yet, which is fine for first deployments
      existingConfig = currentConfiguration;
    }

    const snapshot: RollbackSnapshot = {
      snapshotId,
      deploymentId,
      targetId: target.id,
      timestamp,
      configuration: newConfiguration || {} as ClaudeCodeConfiguration,
      previousConfiguration: existingConfig,
      metadata: {
        strategy: target.strategy,
        version: newConfiguration?.metadata?.version || '1.0.0',
        environment: newConfiguration?.metadata?.environment || 'unknown',
      },
      checksum: this.calculateChecksum(newConfiguration || {})
    };

    // Create backup of existing configuration
    if (existingConfig) {
      const backupPath = await this.createConfigBackup(target, existingConfig, snapshotId);
      snapshot.metadata.backupPath = backupPath;
    }

    // Store snapshot
    this.snapshots.set(snapshotId, snapshot);
    await this.persistSnapshot(snapshot);

    this.emit('snapshot-created', { snapshot, target });

    return snapshot;
  }

  /**
   * Execute rollback for a deployment
   */
  async rollback(execution: DeploymentExecution): Promise<RollbackOperation> {
    const operationId = crypto.randomUUID();
    const rollbackConfig = execution.config.rollback as RollbackConfig;

    const operation: RollbackOperation = {
      operationId,
      deploymentId: execution.deploymentId,
      triggeredBy: 'automatic',
      startedAt: new Date(),
      status: 'pending',
      targetsProcessed: 0,
      targetsFailed: 0,
      snapshots: []
    };

    this.operations.set(operationId, operation);

    try {
      operation.status = 'in-progress';
      this.emit('rollback-started', { operation, deploymentId: execution.deploymentId });

      // Find snapshots for this deployment
      const deploymentSnapshots = this.getDeploymentSnapshots(execution.deploymentId);
      operation.snapshots = deploymentSnapshots;

      if (deploymentSnapshots.length === 0) {
        throw new Error(`No rollback snapshots found for deployment ${execution.deploymentId}`);
      }

      // Group snapshots by target
      const targetSnapshots = new Map<string, RollbackSnapshot>();
      deploymentSnapshots.forEach(snapshot => {
        targetSnapshots.set(snapshot.targetId, snapshot);
      });

      // Execute rollback for each target
      const rollbackPromises: Promise<void>[] = [];
      const maxConcurrency = rollbackConfig.maxAttempts || 5;
      
      // Process targets in batches
      const targets = Array.from(execution.targetExecutions.keys());
      const batches = this.createBatches(targets, maxConcurrency);

      for (const batch of batches) {
        const batchPromises = batch.map(async (targetId) => {
          const snapshot = targetSnapshots.get(targetId);
          if (snapshot) {
            await this.rollbackTarget(snapshot, rollbackConfig, operation);
          }
        });

        const results = await Promise.allSettled(batchPromises);
        
        // Count successes and failures
        results.forEach(result => {
          operation.targetsProcessed++;
          if (result.status === 'rejected') {
            operation.targetsFailed++;
          }
        });

        // Check failure threshold
        const failureRate = operation.targetsFailed / operation.targetsProcessed;
        if (failureRate > 0.5 && operation.targetsProcessed >= 3) {
          throw new Error(`Rollback failure rate too high: ${Math.round(failureRate * 100)}%`);
        }
      }

      // Complete operation
      operation.status = 'completed';
      operation.completedAt = new Date();

      this.emit('rollback-completed', { 
        operation, 
        deploymentId: execution.deploymentId,
        targetsProcessed: operation.targetsProcessed,
        targetsFailed: operation.targetsFailed
      });

    } catch (error) {
      operation.status = 'failed';
      operation.completedAt = new Date();
      operation.error = {
        code: 'ROLLBACK_FAILED',
        message: error instanceof Error ? error.message : 'Unknown rollback error',
        details: { 
          deploymentId: execution.deploymentId,
          operationId: operationId
        },
        suggestions: [
          'Check rollback snapshots integrity',
          'Verify target connectivity',
          'Review rollback logs for specific failures'
        ]
      };

      this.emit('rollback-failed', { operation, error: operation.error });
      throw error;
    }

    return operation;
  }

  /**
   * Manual rollback trigger
   */
  async triggerRollback(
    deploymentId: string,
    triggeredBy: string,
    targetIds?: string[]
  ): Promise<RollbackOperation> {
    const operationId = crypto.randomUUID();

    const operation: RollbackOperation = {
      operationId,
      deploymentId,
      triggeredBy: 'manual',
      startedAt: new Date(),
      status: 'pending',
      targetsProcessed: 0,
      targetsFailed: 0,
      snapshots: []
    };

    this.operations.set(operationId, operation);

    try {
      operation.status = 'in-progress';

      // Get deployment snapshots
      let snapshots = this.getDeploymentSnapshots(deploymentId);
      
      // Filter by target IDs if specified
      if (targetIds) {
        snapshots = snapshots.filter(s => targetIds.includes(s.targetId));
      }

      operation.snapshots = snapshots;

      if (snapshots.length === 0) {
        throw new Error('No snapshots found for rollback operation');
      }

      // Execute rollback for each snapshot
      for (const snapshot of snapshots) {
        try {
          await this.rollbackTarget(snapshot, { enabled: true, triggers: [], strategy: { method: 'previous-version', parameters: {}, verification: [] }, maxAttempts: 3, timeout: 30000 }, operation);
          operation.targetsProcessed++;
        } catch (error) {
          operation.targetsFailed++;
          this.emit('target-rollback-failed', { 
            snapshot, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }

      operation.status = operation.targetsFailed > 0 ? 'completed' : 'completed';
      operation.completedAt = new Date();

      this.emit('manual-rollback-completed', { 
        operation, 
        triggeredBy,
        targetsProcessed: operation.targetsProcessed,
        targetsFailed: operation.targetsFailed
      });

    } catch (error) {
      operation.status = 'failed';
      operation.completedAt = new Date();
      operation.error = {
        code: 'MANUAL_ROLLBACK_FAILED',
        message: error instanceof Error ? error.message : 'Unknown manual rollback error',
        details: { deploymentId, triggeredBy },
        suggestions: ['Check snapshots availability', 'Verify manual rollback permissions']
      };

      throw error;
    }

    return operation;
  }

  /**
   * Get rollback history for deployment
   */
  getRollbackHistory(deploymentId: string): RollbackOperation[] {
    const operations: RollbackOperation[] = [];
    
    this.operations.forEach(operation => {
      if (operation.deploymentId === deploymentId) {
        operations.push(operation);
      }
    });

    return operations.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  /**
   * Get available snapshots for deployment
   */
  getAvailableSnapshots(deploymentId: string): RollbackSnapshot[] {
    return this.getDeploymentSnapshots(deploymentId);
  }

  /**
   * Validate rollback capability
   */
  async validateRollbackCapability(
    deploymentId: string,
    targetIds?: string[]
  ): Promise<{
    canRollback: boolean;
    reasons: string[];
    availableSnapshots: number;
    missingSnapshots: string[];
  }> {
    const reasons: string[] = [];
    const missingSnapshots: string[] = [];
    
    // Get snapshots for deployment
    const snapshots = this.getDeploymentSnapshots(deploymentId);
    
    if (snapshots.length === 0) {
      reasons.push('No rollback snapshots found for deployment');
      return {
        canRollback: false,
        reasons,
        availableSnapshots: 0,
        missingSnapshots: []
      };
    }

    // Check specific targets if requested
    if (targetIds) {
      const availableTargets = new Set(snapshots.map(s => s.targetId));
      
      targetIds.forEach(targetId => {
        if (!availableTargets.has(targetId)) {
          missingSnapshots.push(targetId);
        }
      });

      if (missingSnapshots.length > 0) {
        reasons.push(`Missing snapshots for targets: ${missingSnapshots.join(', ')}`);
      }
    }

    // Validate snapshot integrity
    for (const snapshot of snapshots) {
      const isValid = await this.validateSnapshotIntegrity(snapshot);
      if (!isValid) {
        reasons.push(`Snapshot ${snapshot.snapshotId} failed integrity check`);
      }
    }

    return {
      canRollback: reasons.length === 0,
      reasons,
      availableSnapshots: snapshots.length,
      missingSnapshots
    };
  }

  /**
   * Clean up old snapshots
   */
  async cleanupSnapshots(retentionDays: number = 30): Promise<{
    deletedSnapshots: number;
    freedSpace: number;
  }> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const deletedSnapshots: string[] = [];
    let freedSpace = 0;

    this.snapshots.forEach((snapshot, snapshotId) => {
      if (snapshot.timestamp < cutoffDate) {
        deletedSnapshots.push(snapshotId);
        
        // Clean up backup files
        if (snapshot.metadata.backupPath && existsSync(snapshot.metadata.backupPath)) {
          try {
            const stats = require('fs').statSync(snapshot.metadata.backupPath);
            freedSpace += stats.size;
            require('fs').unlinkSync(snapshot.metadata.backupPath);
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      }
    });

    // Remove from memory
    deletedSnapshots.forEach(id => this.snapshots.delete(id));

    this.emit('snapshots-cleaned', { 
      deletedCount: deletedSnapshots.length, 
      freedSpace 
    });

    return {
      deletedSnapshots: deletedSnapshots.length,
      freedSpace
    };
  }

  /**
   * Private helper methods
   */
  private async rollbackTarget(
    snapshot: RollbackSnapshot,
    rollbackConfig: RollbackConfig,
    operation: RollbackOperation
  ): Promise<void> {
    this.emit('target-rollback-started', { snapshot, operation });

    try {
      // Get target information (would need to be passed or stored)
      // For now, create a mock target based on snapshot metadata
      const target: DistributionTarget = {
        id: snapshot.targetId,
        name: `Target-${snapshot.targetId}`,
        type: 'developer-machine',
        strategy: snapshot.metadata.strategy as any,
        connection: {} as any, // Would need actual connection info
        metadata: {} as any,
        healthCheck: {} as any
      };

      // Use strategy to perform rollback
      const strategy = this.strategyManager.getStrategy(target.strategy);
      
      const result = await strategy.rollback(target, snapshot.deploymentId, {
        timeout: rollbackConfig.timeout,
        onLog: (level, message) => {
          this.emit('rollback-log', { level, message, snapshot, operation });
        }
      });

      if (!result.success) {
        throw new Error(result.message);
      }

      // Verify rollback if configured
      if (rollbackConfig.strategy.verification.length > 0) {
        await this.verifyRollback(snapshot, rollbackConfig);
      }

      this.emit('target-rollback-completed', { snapshot, operation });

    } catch (error) {
      this.emit('target-rollback-failed', { 
        snapshot, 
        operation, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  private async getCurrentConfiguration(target: DistributionTarget): Promise<ClaudeCodeConfiguration | undefined> {
    // This would use the appropriate strategy to get current config
    // For now, return undefined (no existing config)
    return undefined;
  }

  private async createConfigBackup(
    target: DistributionTarget,
    config: ClaudeCodeConfiguration,
    snapshotId: string
  ): Promise<string> {
    const backupDir = join(this.snapshotStorage, 'backups');
    mkdirSync(backupDir, { recursive: true });
    
    const backupFile = join(backupDir, `${target.id}-${snapshotId}.json`);
    writeFileSync(backupFile, JSON.stringify(config, null, 2));
    
    return backupFile;
  }

  private getDeploymentSnapshots(deploymentId: string): RollbackSnapshot[] {
    const snapshots: RollbackSnapshot[] = [];
    
    this.snapshots.forEach(snapshot => {
      if (snapshot.deploymentId === deploymentId) {
        snapshots.push(snapshot);
      }
    });

    return snapshots.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private async validateSnapshotIntegrity(snapshot: RollbackSnapshot): Promise<boolean> {
    try {
      // Verify checksum
      const calculatedChecksum = this.calculateChecksum(snapshot.configuration);
      if (calculatedChecksum !== snapshot.checksum) {
        return false;
      }

      // Check backup file exists if specified
      if (snapshot.metadata.backupPath && !existsSync(snapshot.metadata.backupPath)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private async verifyRollback(snapshot: RollbackSnapshot, rollbackConfig: RollbackConfig): Promise<void> {
    // Execute verification steps
    for (const verification of rollbackConfig.strategy.verification) {
      // This would run specific verification commands/checks
      // Implementation depends on verification step format
    }
  }

  private calculateChecksum(config: ClaudeCodeConfiguration): string {
    return crypto.createHash('sha256')
      .update(JSON.stringify(config))
      .digest('hex');
  }

  private async persistSnapshot(snapshot: RollbackSnapshot): Promise<void> {
    const snapshotFile = join(this.snapshotStorage, `${snapshot.snapshotId}.json`);
    writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
  }

  private ensureStorageDirectory(): void {
    if (!existsSync(this.snapshotStorage)) {
      mkdirSync(this.snapshotStorage, { recursive: true });
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}