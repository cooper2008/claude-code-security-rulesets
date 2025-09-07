/**
 * Progress Tracker for Enterprise Distribution System
 * Tracks and manages deployment progress across multiple targets
 */

import { EventEmitter } from 'events';
import type { 
  DeploymentProgress,
  TargetProgress,
  DeploymentPhase,
  DeploymentStatus,
  TargetDeploymentStatus
} from './types';

/**
 * Progress calculation weights for different phases
 */
const PHASE_WEIGHTS: Record<DeploymentPhase, number> = {
  preparation: 5,
  validation: 10,
  deployment: 70,
  'health-check': 10,
  verification: 4,
  cleanup: 1,
  rollback: 0 // Rollback doesn't contribute to forward progress
};

/**
 * Progress tracker for deployment monitoring
 */
export class ProgressTracker extends EventEmitter {
  private deploymentProgresses = new Map<string, DeploymentProgress>();
  private phaseStartTimes = new Map<string, Map<DeploymentPhase, Date>>();
  private targetPhaseProgress = new Map<string, Map<string, number>>();

  /**
   * Initialize tracking for a deployment
   */
  initialize(deploymentId: string, initialProgress: DeploymentProgress): void {
    this.deploymentProgresses.set(deploymentId, initialProgress);
    this.phaseStartTimes.set(deploymentId, new Map([[initialProgress.currentPhase, new Date()]]));
    this.targetPhaseProgress.set(deploymentId, new Map());

    this.emit('tracking-initialized', { deploymentId, progress: initialProgress });
  }

  /**
   * Update overall deployment progress
   */
  updateProgress(deploymentId: string, progress: DeploymentProgress): void {
    const previousProgress = this.deploymentProgresses.get(deploymentId);
    
    // Update stored progress
    this.deploymentProgresses.set(deploymentId, progress);

    // Track phase changes
    if (previousProgress && previousProgress.currentPhase !== progress.currentPhase) {
      this.handlePhaseChange(deploymentId, previousProgress.currentPhase, progress.currentPhase);
    }

    // Calculate and update progress percentage
    const calculatedProgress = this.calculateOverallProgress(deploymentId, progress);
    if (calculatedProgress !== progress.progress) {
      progress.progress = calculatedProgress;
      this.deploymentProgresses.set(deploymentId, progress);
    }

    // Update estimated completion time
    progress.estimatedCompletionAt = this.estimateCompletionTime(deploymentId, progress);

    this.emit('progress-updated', { 
      deploymentId, 
      progress, 
      previousProgress,
      progressDelta: previousProgress ? progress.progress - previousProgress.progress : 0
    });
  }

  /**
   * Update target-specific progress
   */
  updateTargetProgress(
    deploymentId: string,
    targetId: string,
    targetProgress: Partial<TargetProgress>
  ): void {
    const deployment = this.deploymentProgresses.get(deploymentId);
    if (!deployment) return;

    // Find and update target progress
    const existingTargetProgress = deployment.targetProgress.find(tp => tp.targetId === targetId);
    if (existingTargetProgress) {
      Object.assign(existingTargetProgress, targetProgress);
      
      // Update completion time if status changed to completed
      if (targetProgress.status === 'completed' && !existingTargetProgress.completedAt) {
        existingTargetProgress.completedAt = new Date();
      }
      
      // Update start time if status changed to active state
      if (targetProgress.status && this.isActiveStatus(targetProgress.status) && !existingTargetProgress.startedAt) {
        existingTargetProgress.startedAt = new Date();
      }
    }

    // Recalculate deployment-wide statistics
    this.recalculateDeploymentStats(deploymentId);

    this.emit('target-progress-updated', { 
      deploymentId, 
      targetId, 
      targetProgress: existingTargetProgress,
      deploymentProgress: deployment
    });
  }

  /**
   * Mark target as started
   */
  startTarget(deploymentId: string, targetId: string, operation?: string): void {
    this.updateTargetProgress(deploymentId, targetId, {
      status: 'connecting',
      startedAt: new Date(),
      currentOperation: operation,
      progress: 0
    });
  }

  /**
   * Mark target as completed
   */
  completeTarget(deploymentId: string, targetId: string, success: boolean, error?: string): void {
    this.updateTargetProgress(deploymentId, targetId, {
      status: success ? 'completed' : 'failed',
      completedAt: new Date(),
      progress: 100,
      error: error
    });
  }

  /**
   * Update target operation
   */
  updateTargetOperation(deploymentId: string, targetId: string, operation: string, progress?: number): void {
    this.updateTargetProgress(deploymentId, targetId, {
      currentOperation: operation,
      progress: progress !== undefined ? progress : undefined
    });
  }

  /**
   * Get current progress for deployment
   */
  getProgress(deploymentId: string): DeploymentProgress | null {
    return this.deploymentProgresses.get(deploymentId) || null;
  }

  /**
   * Get progress summary for all active deployments
   */
  getAllProgress(): Map<string, DeploymentProgress> {
    return new Map(this.deploymentProgresses);
  }

  /**
   * Get deployment statistics
   */
  getDeploymentStats(deploymentId: string): {
    totalDuration: number;
    averageTargetDuration: number;
    fastestTarget: { targetId: string; duration: number } | null;
    slowestTarget: { targetId: string; duration: number } | null;
    phaseBreakdown: Record<DeploymentPhase, number>;
    targetStatusBreakdown: Record<TargetDeploymentStatus, number>;
  } | null {
    const deployment = this.deploymentProgresses.get(deploymentId);
    if (!deployment) return null;

    const now = new Date();
    const totalDuration = now.getTime() - deployment.startedAt.getTime();

    // Calculate target durations
    const targetDurations: Array<{ targetId: string; duration: number }> = [];
    let totalTargetDuration = 0;
    let completedTargetCount = 0;

    deployment.targetProgress.forEach(target => {
      if (target.startedAt) {
        const endTime = target.completedAt || now;
        const duration = endTime.getTime() - target.startedAt.getTime();
        targetDurations.push({ targetId: target.targetId, duration });
        
        if (target.completedAt) {
          totalTargetDuration += duration;
          completedTargetCount++;
        }
      }
    });

    // Find fastest and slowest targets
    const completedDurations = targetDurations.filter(td => 
      deployment.targetProgress.find(tp => tp.targetId === td.targetId)?.completedAt
    );

    const fastestTarget = completedDurations.length > 0 ? 
      completedDurations.reduce((fastest, current) => 
        current.duration < fastest.duration ? current : fastest
      ) : null;

    const slowestTarget = completedDurations.length > 0 ?
      completedDurations.reduce((slowest, current) =>
        current.duration > slowest.duration ? current : slowest
      ) : null;

    // Calculate phase breakdown
    const phases = this.phaseStartTimes.get(deploymentId) || new Map();
    const phaseBreakdown: Record<DeploymentPhase, number> = {
      preparation: 0,
      validation: 0,
      deployment: 0,
      'health-check': 0,
      verification: 0,
      cleanup: 0,
      rollback: 0
    };

    const phaseEntries = Array.from(phases.entries());
    for (let i = 0; i < phaseEntries.length; i++) {
      const [phase, startTime] = phaseEntries[i];
      const endTime = i < phaseEntries.length - 1 ? 
        phaseEntries[i + 1][1] : 
        now;
      
      phaseBreakdown[phase] = endTime.getTime() - startTime.getTime();
    }

    // Calculate target status breakdown
    const targetStatusBreakdown: Record<TargetDeploymentStatus, number> = {
      pending: 0,
      connecting: 0,
      uploading: 0,
      installing: 0,
      configuring: 0,
      verifying: 0,
      completed: 0,
      failed: 0,
      skipped: 0
    };

    deployment.targetProgress.forEach(target => {
      targetStatusBreakdown[target.status]++;
    });

    return {
      totalDuration,
      averageTargetDuration: completedTargetCount > 0 ? totalTargetDuration / completedTargetCount : 0,
      fastestTarget,
      slowestTarget,
      phaseBreakdown,
      targetStatusBreakdown
    };
  }

  /**
   * Clean up completed deployments
   */
  cleanup(deploymentId: string): void {
    this.deploymentProgresses.delete(deploymentId);
    this.phaseStartTimes.delete(deploymentId);
    this.targetPhaseProgress.delete(deploymentId);

    this.emit('tracking-cleaned-up', { deploymentId });
  }

  /**
   * Private helper methods
   */
  private handlePhaseChange(
    deploymentId: string,
    previousPhase: DeploymentPhase,
    currentPhase: DeploymentPhase
  ): void {
    const phaseMap = this.phaseStartTimes.get(deploymentId) || new Map();
    phaseMap.set(currentPhase, new Date());
    this.phaseStartTimes.set(deploymentId, phaseMap);

    this.emit('phase-changed', { 
      deploymentId, 
      previousPhase, 
      currentPhase,
      timestamp: new Date()
    });
  }

  private calculateOverallProgress(deploymentId: string, deployment: DeploymentProgress): number {
    // Base progress on current phase and target completion
    const phaseProgress = this.calculatePhaseProgress(deployment.currentPhase);
    const targetProgress = this.calculateTargetProgress(deployment);
    
    // Weighted combination of phase and target progress
    const combinedProgress = (phaseProgress * 0.3) + (targetProgress * 0.7);
    
    return Math.min(100, Math.max(0, Math.round(combinedProgress)));
  }

  private calculatePhaseProgress(currentPhase: DeploymentPhase): number {
    const phaseOrder: DeploymentPhase[] = [
      'preparation',
      'validation', 
      'deployment',
      'health-check',
      'verification',
      'cleanup'
    ];

    const currentIndex = phaseOrder.indexOf(currentPhase);
    if (currentIndex === -1) return 0;

    // Calculate cumulative weight of completed phases
    let completedWeight = 0;
    for (let i = 0; i < currentIndex; i++) {
      completedWeight += PHASE_WEIGHTS[phaseOrder[i]];
    }

    // Add partial progress for current phase (assume 50% complete)
    const currentPhaseWeight = PHASE_WEIGHTS[currentPhase] * 0.5;
    
    const totalWeight = Object.values(PHASE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    
    return ((completedWeight + currentPhaseWeight) / totalWeight) * 100;
  }

  private calculateTargetProgress(deployment: DeploymentProgress): number {
    if (deployment.totalTargets === 0) return 100;

    let totalProgress = 0;
    deployment.targetProgress.forEach(target => {
      totalProgress += target.progress;
    });

    return totalProgress / deployment.totalTargets;
  }

  private recalculateDeploymentStats(deploymentId: string): void {
    const deployment = this.deploymentProgresses.get(deploymentId);
    if (!deployment) return;

    // Recalculate counts based on current target statuses
    deployment.successfulTargets = deployment.targetProgress.filter(tp => tp.status === 'completed').length;
    deployment.failedTargets = deployment.targetProgress.filter(tp => tp.status === 'failed').length;
    deployment.inProgressTargets = deployment.targetProgress.filter(tp => 
      this.isActiveStatus(tp.status)
    ).length;
    deployment.pendingTargets = deployment.targetProgress.filter(tp => tp.status === 'pending').length;

    // Update overall deployment status based on target states
    if (deployment.successfulTargets + deployment.failedTargets === deployment.totalTargets) {
      // All targets completed
      deployment.status = deployment.failedTargets > 0 ? 'failed' : 'completed';
    } else if (deployment.inProgressTargets > 0) {
      deployment.status = 'deploying';
    }
  }

  private estimateCompletionTime(deploymentId: string, deployment: DeploymentProgress): Date | undefined {
    if (deployment.progress >= 100 || deployment.status === 'completed') {
      return new Date(); // Already completed
    }

    // Calculate average completion rate
    const elapsedTime = Date.now() - deployment.startedAt.getTime();
    const progressRate = deployment.progress / elapsedTime; // progress per millisecond

    if (progressRate <= 0) return undefined;

    const remainingProgress = 100 - deployment.progress;
    const estimatedRemainingTime = remainingProgress / progressRate;
    
    return new Date(Date.now() + estimatedRemainingTime);
  }

  private isActiveStatus(status: TargetDeploymentStatus): boolean {
    return ['connecting', 'uploading', 'installing', 'configuring', 'verifying'].includes(status);
  }
}