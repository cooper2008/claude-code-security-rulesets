/**
 * Enterprise Distribution System - Main Deployment Orchestrator
 * Handles pushing security configs to 1000+ developers automatically
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import type { 
  DeploymentConfig,
  DistributionTarget, 
  DeploymentProgress,
  DistributionResult,
  TargetResult,
  DeploymentError,
  HealthCheckResult,
  DeploymentMetrics,
  DeploymentStatus,
  TargetProgress,
  DeploymentLog,
  LogLevel
} from './types';
import type { ClaudeCodeConfiguration, ValidationResult } from '@/types';
import { StrategyManager } from './strategies/manager';
import { MonitoringService } from './monitoring';
import { RollbackService } from './rollback';
import { ProgressTracker } from './progress-tracker';
import { HealthChecker } from './health-checker';
import { NotificationService } from './notification';

/**
 * Main deployment orchestrator for enterprise distribution
 */
export class EnterpriseDeployer extends EventEmitter {
  private readonly strategyManager: StrategyManager;
  private readonly monitoringService: MonitoringService;
  private readonly rollbackService: RollbackService;
  private readonly progressTracker: ProgressTracker;
  private readonly healthChecker: HealthChecker;
  private readonly notificationService: NotificationService;
  
  private activeDeployments = new Map<string, DeploymentExecution>();

  constructor() {
    super();
    this.strategyManager = new StrategyManager();
    this.monitoringService = new MonitoringService();
    this.rollbackService = new RollbackService();
    this.progressTracker = new ProgressTracker();
    this.healthChecker = new HealthChecker();
    this.notificationService = new NotificationService();

    this.setupEventHandlers();
  }

  /**
   * Deploy configuration to multiple targets
   */
  async deploy(config: DeploymentConfig): Promise<DistributionResult> {
    const deploymentId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Initialize deployment execution
      const execution = await this.initializeDeployment(deploymentId, config);
      this.activeDeployments.set(deploymentId, execution);

      // Emit deployment started event
      this.emit('deployment-started', { deploymentId, config });
      await this.notificationService.notify('deployment-started', { 
        deploymentId, 
        targetCount: config.targets.length 
      });

      // Validate configuration before deployment
      const validationResult = await this.validateDeployment(config);
      if (!validationResult.isValid) {
        throw new Error(`Deployment validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
      }

      // Execute deployment strategy
      const result = await this.executeDeployment(execution);

      // Post-deployment verification
      await this.verifyDeployment(execution);

      // Update final status
      execution.progress.status = result.success ? 'completed' : 'failed';
      execution.progress.progress = 100;

      // Emit completion event
      this.emit('deployment-completed', { deploymentId, result });
      await this.notificationService.notify('deployment-completed', { 
        deploymentId, 
        success: result.success,
        successRate: result.metrics.successRate
      });

      return result;

    } catch (error) {
      const deploymentError: DeploymentError = {
        code: 'DEPLOYMENT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown deployment error',
        details: { deploymentId, timestamp: new Date().toISOString() },
        stack: error instanceof Error ? error.stack : undefined,
        suggestions: [
          'Check network connectivity to targets',
          'Verify authentication credentials',
          'Review deployment logs for details'
        ]
      };

      // Handle deployment failure
      await this.handleDeploymentFailure(deploymentId, deploymentError);
      
      throw error;
    } finally {
      this.activeDeployments.delete(deploymentId);
    }
  }

  /**
   * Initialize deployment execution context
   */
  private async initializeDeployment(
    deploymentId: string, 
    config: DeploymentConfig
  ): Promise<DeploymentExecution> {
    const execution: DeploymentExecution = {
      deploymentId,
      config,
      startTime: new Date(),
      progress: {
        deploymentId,
        status: 'pending',
        progress: 0,
        totalTargets: config.targets.length,
        successfulTargets: 0,
        failedTargets: 0,
        inProgressTargets: 0,
        pendingTargets: config.targets.length,
        targetProgress: config.targets.map(target => ({
          targetId: target.id,
          status: 'pending',
          progress: 0,
          logs: []
        })),
        startedAt: new Date(),
        currentPhase: 'preparation'
      },
      targetExecutions: new Map(),
      rollbackStack: []
    };

    // Initialize target executions
    for (const target of config.targets) {
      const targetExecution: TargetExecution = {
        target,
        status: 'pending',
        startTime: null,
        endTime: null,
        error: null,
        logs: [],
        healthCheckResults: []
      };
      execution.targetExecutions.set(target.id, targetExecution);
    }

    // Start monitoring
    this.monitoringService.startMonitoring(deploymentId, execution.progress);
    this.progressTracker.initialize(deploymentId, execution.progress);

    return execution;
  }

  /**
   * Validate deployment configuration and targets
   */
  private async validateDeployment(config: DeploymentConfig): Promise<ValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];

    // Validate configuration
    if (!config.configuration.permissions) {
      errors.push({
        type: 'MISSING_REQUIRED_FIELD',
        message: 'Configuration must contain permissions',
        severity: 'critical'
      });
    }

    // Validate targets
    if (config.targets.length === 0) {
      errors.push({
        type: 'NO_TARGETS',
        message: 'At least one deployment target is required',
        severity: 'critical'
      });
    }

    // Validate target connectivity
    const connectivityChecks = await Promise.allSettled(
      config.targets.map(target => this.validateTargetConnectivity(target))
    );

    for (let i = 0; i < connectivityChecks.length; i++) {
      const check = connectivityChecks[i];
      if (check.status === 'rejected') {
        warnings.push({
          type: 'CONNECTIVITY_WARNING',
          message: `Target ${config.targets[i].name} may be unreachable: ${check.reason}`,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      conflicts: [],
      suggestions: [],
      performance: {
        validationTime: 0,
        rulesProcessed: 0,
        performanceTarget: { target: 100, achieved: true }
      }
    };
  }

  /**
   * Execute deployment using configured strategy
   */
  private async executeDeployment(execution: DeploymentExecution): Promise<DistributionResult> {
    const { config, deploymentId } = execution;
    const results: TargetResult[] = [];
    const startTime = Date.now();

    // Update progress to deploying phase
    execution.progress.status = 'deploying';
    execution.progress.currentPhase = 'deployment';
    this.progressTracker.updateProgress(deploymentId, execution.progress);

    // Determine deployment strategy
    const strategy = await this.determineOptimalStrategy(config);
    
    // Execute based on deployment type
    switch (config.strategy.type) {
      case 'immediate':
        await this.executeImmediateDeployment(execution, results);
        break;
      case 'canary':
        await this.executeCanaryDeployment(execution, results);
        break;
      case 'blue-green':
        await this.executeBlueGreenDeployment(execution, results);
        break;
      case 'rolling':
        await this.executeRollingDeployment(execution, results);
        break;
      case 'staged':
        await this.executeStagedDeployment(execution, results);
        break;
      default:
        await this.executeImmediateDeployment(execution, results);
    }

    // Calculate metrics
    const endTime = Date.now();
    const metrics = this.calculateDeploymentMetrics(results, startTime, endTime);

    return {
      deploymentId,
      success: results.every(r => r.success),
      message: this.generateSummaryMessage(results),
      progress: execution.progress,
      results,
      metrics
    };
  }

  /**
   * Execute immediate deployment (all targets simultaneously)
   */
  private async executeImmediateDeployment(
    execution: DeploymentExecution,
    results: TargetResult[]
  ): Promise<void> {
    const { config } = execution;
    const maxConcurrency = config.strategy.parameters.maxConcurrency || 10;
    
    // Group targets into batches for controlled concurrency
    const batches = this.createBatches(config.targets, maxConcurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(target => 
        this.deployToTarget(execution, target)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process batch results
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const target = batch[i];
        
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push(this.createFailedResult(target, result.reason));
        }
        
        this.updateTargetProgress(execution, target.id, result);
      }

      // Check failure threshold
      const failureRate = results.filter(r => !r.success).length / results.length;
      if (failureRate > config.strategy.parameters.failureThreshold) {
        if (config.strategy.parameters.autoRollback) {
          await this.initiateRollback(execution);
        }
        throw new Error(`Failure threshold exceeded: ${failureRate * 100}% failures`);
      }
    }
  }

  /**
   * Execute canary deployment (small subset first, then full rollout)
   */
  private async executeCanaryDeployment(
    execution: DeploymentExecution,
    results: TargetResult[]
  ): Promise<void> {
    const { config } = execution;
    const canarySize = Math.max(1, Math.floor(config.targets.length * 0.1)); // 10% canary
    
    // Select canary targets
    const canaryTargets = config.targets.slice(0, canarySize);
    const remainingTargets = config.targets.slice(canarySize);

    this.log(execution, 'info', `Starting canary deployment to ${canaryTargets.length} targets`);

    // Deploy to canary targets
    for (const target of canaryTargets) {
      const result = await this.deployToTarget(execution, target);
      results.push(result);
      this.updateTargetProgress(execution, target.id, { status: 'fulfilled', value: result });

      if (!result.success) {
        throw new Error(`Canary deployment failed for target ${target.name}: ${result.message}`);
      }
    }

    // Health check canary deployments
    await this.performHealthChecks(execution, canaryTargets);

    // Wait for canary observation period
    await this.sleep(30000); // 30 seconds observation

    this.log(execution, 'info', 'Canary deployment successful, proceeding with full rollout');

    // Deploy to remaining targets
    await this.executeImmediateDeployment({
      ...execution,
      config: { ...config, targets: remainingTargets }
    }, results);
  }

  /**
   * Deploy to a single target
   */
  private async deployToTarget(
    execution: DeploymentExecution,
    target: DistributionTarget
  ): Promise<TargetResult> {
    const { config, deploymentId } = execution;
    const targetExecution = execution.targetExecutions.get(target.id)!;
    
    targetExecution.status = 'deploying';
    targetExecution.startTime = new Date();

    this.log(execution, 'info', `Starting deployment to target: ${target.name}`, target.id);

    try {
      // Get strategy implementation
      const strategy = this.strategyManager.getStrategy(target.strategy);
      
      // Execute deployment
      const result = await strategy.deploy(
        target,
        config.configuration,
        {
          timeout: config.strategy.parameters.timeout,
          retryConfig: target.connection.retry,
          onProgress: (progress) => {
            this.updateTargetProgressPercent(execution, target.id, progress);
          },
          onLog: (level, message) => {
            this.log(execution, level, message, target.id);
          }
        }
      );

      // Perform health checks
      const healthChecks = await this.performTargetHealthChecks(target);
      targetExecution.healthCheckResults = healthChecks;

      // Update target execution
      targetExecution.status = result.success ? 'completed' : 'failed';
      targetExecution.endTime = new Date();
      
      if (!result.success && result.error) {
        targetExecution.error = result.error;
      }

      this.log(execution, result.success ? 'info' : 'error', 
        `Deployment to ${target.name} ${result.success ? 'completed' : 'failed'}`, target.id);

      return {
        targetId: target.id,
        targetName: target.name,
        success: result.success,
        message: result.message,
        duration: targetExecution.endTime.getTime() - targetExecution.startTime!.getTime(),
        error: result.error,
        configurationHash: this.calculateConfigHash(config.configuration),
        healthChecks
      };

    } catch (error) {
      targetExecution.status = 'failed';
      targetExecution.endTime = new Date();
      targetExecution.error = error instanceof Error ? error.message : String(error);

      this.log(execution, 'error', `Deployment failed: ${targetExecution.error}`, target.id);

      return this.createFailedResult(target, error);
    }
  }

  /**
   * Perform health checks after deployment
   */
  private async verifyDeployment(execution: DeploymentExecution): Promise<void> {
    execution.progress.currentPhase = 'verification';
    execution.progress.status = 'verifying';

    this.log(execution, 'info', 'Starting post-deployment verification');

    // Verify each successfully deployed target
    const successfulTargets = Array.from(execution.targetExecutions.values())
      .filter(te => te.status === 'completed')
      .map(te => te.target);

    await this.performHealthChecks(execution, successfulTargets);

    this.log(execution, 'info', 'Post-deployment verification completed');
  }

  /**
   * Perform health checks on targets
   */
  private async performHealthChecks(
    execution: DeploymentExecution,
    targets: DistributionTarget[]
  ): Promise<void> {
    execution.progress.currentPhase = 'health-check';

    const healthCheckPromises = targets.map(target => 
      this.performTargetHealthChecks(target)
    );

    const results = await Promise.allSettled(healthCheckPromises);
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const target = targets[i];
      const targetExecution = execution.targetExecutions.get(target.id)!;

      if (result.status === 'fulfilled') {
        targetExecution.healthCheckResults = result.value;
      } else {
        this.log(execution, 'error', `Health check failed for ${target.name}: ${result.reason}`, target.id);
      }
    }
  }

  /**
   * Perform health checks for a single target
   */
  private async performTargetHealthChecks(target: DistributionTarget): Promise<HealthCheckResult[]> {
    return this.healthChecker.performChecks(target.healthCheck, target);
  }

  /**
   * Handle deployment failure
   */
  private async handleDeploymentFailure(
    deploymentId: string,
    error: DeploymentError
  ): Promise<void> {
    const execution = this.activeDeployments.get(deploymentId);
    
    if (execution) {
      execution.progress.status = 'failed';
      this.progressTracker.updateProgress(deploymentId, execution.progress);

      // Check if rollback should be initiated
      if (execution.config.rollback.enabled && execution.config.strategy.parameters.autoRollback) {
        await this.initiateRollback(execution);
      }
    }

    this.emit('deployment-failed', { deploymentId, error });
    await this.notificationService.notify('deployment-failed', { deploymentId, error: error.message });
  }

  /**
   * Initiate rollback process
   */
  private async initiateRollback(execution: DeploymentExecution): Promise<void> {
    this.log(execution, 'info', 'Initiating rollback process');
    execution.progress.status = 'rolling-back';
    execution.progress.currentPhase = 'rollback';

    try {
      await this.rollbackService.rollback(execution);
      execution.progress.status = 'rolled-back' as any;
      this.log(execution, 'info', 'Rollback completed successfully');
    } catch (error) {
      this.log(execution, 'error', `Rollback failed: ${error instanceof Error ? error.message : String(error)}`);
      execution.progress.status = 'failed';
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId: string): Promise<DeploymentProgress | null> {
    const execution = this.activeDeployments.get(deploymentId);
    return execution?.progress || null;
  }

  /**
   * Cancel deployment
   */
  async cancelDeployment(deploymentId: string): Promise<void> {
    const execution = this.activeDeployments.get(deploymentId);
    if (execution) {
      execution.progress.status = 'cancelled';
      this.emit('deployment-cancelled', { deploymentId });
      await this.notificationService.notify('deployment-cancelled', { deploymentId });
    }
  }

  /**
   * Helper methods
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private createFailedResult(target: DistributionTarget, error: any): TargetResult {
    return {
      targetId: target.id,
      targetName: target.name,
      success: false,
      message: error instanceof Error ? error.message : String(error),
      duration: 0,
      error: {
        code: 'DEPLOYMENT_FAILED',
        message: error instanceof Error ? error.message : String(error),
        details: { targetId: target.id },
        suggestions: ['Check network connectivity', 'Verify credentials']
      },
      healthChecks: []
    };
  }

  private updateTargetProgress(
    execution: DeploymentExecution,
    targetId: string,
    result: PromiseSettledResult<TargetResult>
  ): void {
    const targetProgress = execution.progress.targetProgress.find(tp => tp.targetId === targetId);
    if (targetProgress) {
      targetProgress.status = result.status === 'fulfilled' && result.value.success ? 'completed' : 'failed';
      targetProgress.progress = 100;
      targetProgress.completedAt = new Date();
      
      if (result.status === 'rejected' || !result.value.success) {
        targetProgress.error = result.status === 'rejected' ? 
          String(result.reason) : 
          result.value.error?.message;
      }
    }

    // Update overall progress
    this.updateOverallProgress(execution);
  }

  private updateTargetProgressPercent(
    execution: DeploymentExecution,
    targetId: string,
    progress: number
  ): void {
    const targetProgress = execution.progress.targetProgress.find(tp => tp.targetId === targetId);
    if (targetProgress) {
      targetProgress.progress = Math.min(100, Math.max(0, progress));
    }
    this.updateOverallProgress(execution);
  }

  private updateOverallProgress(execution: DeploymentExecution): void {
    const { targetProgress } = execution.progress;
    
    execution.progress.successfulTargets = targetProgress.filter(tp => tp.status === 'completed').length;
    execution.progress.failedTargets = targetProgress.filter(tp => tp.status === 'failed').length;
    execution.progress.inProgressTargets = targetProgress.filter(tp => 
      tp.status !== 'completed' && tp.status !== 'failed' && tp.status !== 'pending'
    ).length;
    execution.progress.pendingTargets = targetProgress.filter(tp => tp.status === 'pending').length;
    
    execution.progress.progress = Math.floor(
      targetProgress.reduce((sum, tp) => sum + tp.progress, 0) / targetProgress.length
    );

    this.progressTracker.updateProgress(execution.deploymentId, execution.progress);
  }

  private log(execution: DeploymentExecution, level: LogLevel, message: string, targetId?: string): void {
    const logEntry: DeploymentLog = {
      timestamp: new Date(),
      level,
      message,
      targetId
    };

    if (targetId) {
      const targetExecution = execution.targetExecutions.get(targetId);
      if (targetExecution) {
        targetExecution.logs.push(logEntry);
      }
      
      const targetProgress = execution.progress.targetProgress.find(tp => tp.targetId === targetId);
      if (targetProgress) {
        targetProgress.logs.push(logEntry);
      }
    }

    this.emit('log', logEntry);
  }

  private calculateConfigHash(config: ClaudeCodeConfiguration): string {
    return crypto.createHash('sha256')
      .update(JSON.stringify(config))
      .digest('hex')
      .substring(0, 16);
  }

  private calculateDeploymentMetrics(
    results: TargetResult[],
    startTime: number,
    endTime: number
  ): DeploymentMetrics {
    const successfulResults = results.filter(r => r.success);
    const totalDuration = endTime - startTime;
    const averageTargetDuration = results.length > 0 ? 
      results.reduce((sum, r) => sum + r.duration, 0) / results.length : 0;

    return {
      totalDuration,
      averageTargetDuration,
      successRate: results.length > 0 ? (successfulResults.length / results.length) * 100 : 0,
      bytesTransferred: 0, // Would be calculated based on actual deployment data
      networkStats: {
        totalConnections: results.length,
        failedConnections: results.filter(r => !r.success).length,
        averageLatency: 0 // Would be measured during deployment
      }
    };
  }

  private generateSummaryMessage(results: TargetResult[]): string {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const failed = total - successful;

    if (failed === 0) {
      return `Deployment completed successfully to all ${total} targets`;
    } else if (successful === 0) {
      return `Deployment failed to all ${total} targets`;
    } else {
      return `Deployment completed with ${successful}/${total} targets successful, ${failed} failed`;
    }
  }

  private async validateTargetConnectivity(target: DistributionTarget): Promise<void> {
    const strategy = this.strategyManager.getStrategy(target.strategy);
    return strategy.validateConnectivity(target);
  }

  private async determineOptimalStrategy(config: DeploymentConfig): Promise<string> {
    // Logic to determine optimal deployment strategy based on target characteristics
    return 'default';
  }

  private async executeBlueGreenDeployment(execution: DeploymentExecution, results: TargetResult[]): Promise<void> {
    // Implementation for blue-green deployment
    await this.executeImmediateDeployment(execution, results);
  }

  private async executeRollingDeployment(execution: DeploymentExecution, results: TargetResult[]): Promise<void> {
    // Implementation for rolling deployment
    await this.executeImmediateDeployment(execution, results);
  }

  private async executeStagedDeployment(execution: DeploymentExecution, results: TargetResult[]): Promise<void> {
    // Implementation for staged deployment
    await this.executeImmediateDeployment(execution, results);
  }

  private setupEventHandlers(): void {
    this.on('log', (log: DeploymentLog) => {
      console.log(`[${log.timestamp.toISOString()}] ${log.level.toUpperCase()}: ${log.message}`);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Internal deployment execution context
 */
interface DeploymentExecution {
  deploymentId: string;
  config: DeploymentConfig;
  startTime: Date;
  progress: DeploymentProgress;
  targetExecutions: Map<string, TargetExecution>;
  rollbackStack: RollbackOperation[];
}

interface TargetExecution {
  target: DistributionTarget;
  status: 'pending' | 'deploying' | 'completed' | 'failed';
  startTime: Date | null;
  endTime: Date | null;
  error: string | null;
  logs: DeploymentLog[];
  healthCheckResults: HealthCheckResult[];
}

interface RollbackOperation {
  targetId: string;
  operation: string;
  timestamp: Date;
  data: any;
}

export { EnterpriseDeployer };