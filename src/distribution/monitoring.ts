/**
 * Monitoring Service for Enterprise Distribution System
 * Real-time monitoring, metrics collection, and alerting
 */

import { EventEmitter } from 'events';
import type { 
  DeploymentProgress,
  MetricConfig,
  AlertConfig,
  LoggingConfig,
  DashboardConfig,
  DeploymentLog,
  DeploymentMetrics,
  LogLevel
} from './types';

/**
 * Metric data point
 */
export interface MetricDataPoint {
  name: string;
  value: number;
  timestamp: Date;
  labels: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram';
}

/**
 * Alert state
 */
export interface Alert {
  id: string;
  name: string;
  condition: string;
  severity: 'critical' | 'warning' | 'info';
  status: 'active' | 'resolved' | 'acknowledged';
  triggeredAt: Date;
  resolvedAt?: Date;
  message: string;
  metadata: Record<string, any>;
}

/**
 * Monitoring dashboard data
 */
export interface DashboardData {
  deployments: {
    active: number;
    completed: number;
    failed: number;
    totalToday: number;
  };
  performance: {
    averageDeploymentTime: number;
    successRate: number;
    currentThroughput: number;
  };
  health: {
    systemHealth: 'healthy' | 'degraded' | 'critical';
    activeAlerts: number;
    servicesUp: number;
    totalServices: number;
  };
  metrics: MetricDataPoint[];
  alerts: Alert[];
}

/**
 * Real-time monitoring service for deployment tracking
 */
export class MonitoringService extends EventEmitter {
  private metrics = new Map<string, MetricDataPoint[]>();
  private alerts = new Map<string, Alert>();
  private deploymentStates = new Map<string, DeploymentProgress>();
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;
  private metricsRetention = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    super();
    this.setupDefaultMetrics();
  }

  /**
   * Start monitoring for a deployment
   */
  startMonitoring(deploymentId: string, initialProgress: DeploymentProgress): void {
    this.deploymentStates.set(deploymentId, initialProgress);
    
    if (!this.isMonitoring) {
      this.beginMonitoring();
    }

    this.recordMetric({
      name: 'deployment_started',
      value: 1,
      timestamp: new Date(),
      labels: {
        deployment_id: deploymentId,
        status: initialProgress.status
      },
      type: 'counter'
    });

    this.emit('deployment-monitoring-started', { deploymentId, progress: initialProgress });
  }

  /**
   * Stop monitoring for a deployment
   */
  stopMonitoring(deploymentId: string): void {
    const deployment = this.deploymentStates.get(deploymentId);
    if (deployment) {
      this.recordMetric({
        name: 'deployment_completed',
        value: 1,
        timestamp: new Date(),
        labels: {
          deployment_id: deploymentId,
          status: deployment.status,
          success: deployment.status === 'completed' ? 'true' : 'false'
        },
        type: 'counter'
      });

      this.deploymentStates.delete(deploymentId);
      this.emit('deployment-monitoring-stopped', { deploymentId, finalStatus: deployment.status });
    }

    if (this.deploymentStates.size === 0) {
      this.stopMonitoring();
    }
  }

  /**
   * Update deployment progress
   */
  updateProgress(deploymentId: string, progress: DeploymentProgress): void {
    const previousProgress = this.deploymentStates.get(deploymentId);
    this.deploymentStates.set(deploymentId, progress);

    // Record progress metrics
    this.recordMetric({
      name: 'deployment_progress',
      value: progress.progress,
      timestamp: new Date(),
      labels: {
        deployment_id: deploymentId,
        status: progress.status,
        phase: progress.currentPhase
      },
      type: 'gauge'
    });

    // Check for status changes
    if (previousProgress && previousProgress.status !== progress.status) {
      this.handleStatusChange(deploymentId, previousProgress.status, progress.status);
    }

    // Check for alerts
    this.checkAlerts(deploymentId, progress);

    this.emit('progress-updated', { deploymentId, progress, previousProgress });
  }

  /**
   * Record deployment log
   */
  recordLog(deploymentId: string, log: DeploymentLog): void {
    // Store log (in real implementation, this would go to a log storage system)
    this.emit('log-recorded', { deploymentId, log });

    // Record log level metrics
    this.recordMetric({
      name: 'logs_total',
      value: 1,
      timestamp: new Date(),
      labels: {
        deployment_id: deploymentId,
        level: log.level,
        target_id: log.targetId || 'unknown'
      },
      type: 'counter'
    });

    // Generate alerts for error logs
    if (log.level === 'error') {
      this.generateAlert({
        name: 'deployment_error',
        condition: `log.level == "error"`,
        severity: 'warning',
        message: `Deployment error: ${log.message}`,
        metadata: {
          deploymentId,
          targetId: log.targetId,
          logMessage: log.message
        }
      });
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(metricName?: string, timeRange?: { start: Date; end: Date }): MetricDataPoint[] {
    if (metricName) {
      const metricData = this.metrics.get(metricName) || [];
      return this.filterMetricsByTime(metricData, timeRange);
    }

    // Return all metrics
    const allMetrics: MetricDataPoint[] = [];
    this.metrics.forEach(metricData => {
      allMetrics.push(...this.filterMetricsByTime(metricData, timeRange));
    });

    return allMetrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get active alerts
   */
  getAlerts(severity?: 'critical' | 'warning' | 'info'): Alert[] {
    const alerts = Array.from(this.alerts.values());
    return severity ? alerts.filter(a => a.severity === severity) : alerts;
  }

  /**
   * Get dashboard data
   */
  getDashboardData(): DashboardData {
    const deployments = Array.from(this.deploymentStates.values());
    const alerts = this.getAlerts();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate deployment statistics
    const active = deployments.filter(d => 
      ['pending', 'validating', 'deploying', 'verifying'].includes(d.status)
    ).length;
    
    const completed = deployments.filter(d => d.status === 'completed').length;
    const failed = deployments.filter(d => d.status === 'failed').length;

    // Get today's deployments from metrics
    const todayDeployments = this.getMetrics('deployment_started', { 
      start: today, 
      end: now 
    }).length;

    // Calculate performance metrics
    const recentMetrics = this.getMetrics('deployment_progress', {
      start: new Date(now.getTime() - 60 * 60 * 1000), // Last hour
      end: now
    });

    const averageDeploymentTime = this.calculateAverageDeploymentTime();
    const successRate = this.calculateSuccessRate();
    const currentThroughput = this.calculateThroughput();

    return {
      deployments: {
        active,
        completed,
        failed,
        totalToday: todayDeployments
      },
      performance: {
        averageDeploymentTime,
        successRate,
        currentThroughput
      },
      health: {
        systemHealth: this.getSystemHealth(),
        activeAlerts: alerts.filter(a => a.status === 'active').length,
        servicesUp: 5, // Mock data - would be real service health checks
        totalServices: 5
      },
      metrics: recentMetrics.slice(0, 100), // Last 100 data points
      alerts: alerts.slice(0, 50) // Most recent 50 alerts
    };
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && alert.status === 'active') {
      alert.status = 'acknowledged';
      alert.metadata.acknowledgedBy = acknowledgedBy;
      alert.metadata.acknowledgedAt = new Date().toISOString();
      
      this.emit('alert-acknowledged', { alertId, acknowledgedBy });
      return true;
    }
    return false;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string, resolvedBy: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedAt = new Date();
      alert.metadata.resolvedBy = resolvedBy;
      
      this.emit('alert-resolved', { alertId, resolvedBy });
      return true;
    }
    return false;
  }

  /**
   * Private methods
   */
  private beginMonitoring(): void {
    this.isMonitoring = true;
    
    // Start monitoring interval
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.cleanupOldMetrics();
      this.evaluateAlerts();
    }, 10000); // Every 10 seconds

    this.emit('monitoring-started');
  }

  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    this.isMonitoring = false;
    this.emit('monitoring-stopped');
  }

  private setupDefaultMetrics(): void {
    const defaultMetrics = [
      'deployment_started',
      'deployment_completed',
      'deployment_progress',
      'deployment_duration',
      'target_success_rate',
      'logs_total',
      'system_cpu_usage',
      'system_memory_usage',
      'network_latency'
    ];

    defaultMetrics.forEach(name => {
      this.metrics.set(name, []);
    });
  }

  private recordMetric(metric: MetricDataPoint): void {
    const metricData = this.metrics.get(metric.name) || [];
    metricData.push(metric);
    
    // Keep only recent data to prevent memory issues
    const cutoff = new Date(Date.now() - this.metricsRetention);
    const filteredData = metricData.filter(m => m.timestamp >= cutoff);
    
    this.metrics.set(metric.name, filteredData);
    this.emit('metric-recorded', metric);
  }

  private generateAlert(alertConfig: {
    name: string;
    condition: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    metadata: Record<string, any>;
  }): void {
    const alertId = `${alertConfig.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: Alert = {
      id: alertId,
      name: alertConfig.name,
      condition: alertConfig.condition,
      severity: alertConfig.severity,
      status: 'active',
      triggeredAt: new Date(),
      message: alertConfig.message,
      metadata: alertConfig.metadata
    };

    this.alerts.set(alertId, alert);
    this.emit('alert-generated', alert);
  }

  private handleStatusChange(
    deploymentId: string,
    previousStatus: string,
    currentStatus: string
  ): void {
    this.recordMetric({
      name: 'deployment_status_change',
      value: 1,
      timestamp: new Date(),
      labels: {
        deployment_id: deploymentId,
        previous_status: previousStatus,
        current_status: currentStatus
      },
      type: 'counter'
    });

    // Generate alerts for failures
    if (currentStatus === 'failed') {
      this.generateAlert({
        name: 'deployment_failed',
        condition: `status == "failed"`,
        severity: 'critical',
        message: `Deployment ${deploymentId} has failed`,
        metadata: { deploymentId, previousStatus }
      });
    }
  }

  private checkAlerts(deploymentId: string, progress: DeploymentProgress): void {
    // Check for stuck deployments
    const startTime = progress.startedAt.getTime();
    const now = Date.now();
    const duration = now - startTime;
    const maxDuration = 30 * 60 * 1000; // 30 minutes

    if (duration > maxDuration && ['pending', 'deploying'].includes(progress.status)) {
      this.generateAlert({
        name: 'deployment_stuck',
        condition: `duration > ${maxDuration}`,
        severity: 'warning',
        message: `Deployment ${deploymentId} has been running for over 30 minutes`,
        metadata: { deploymentId, duration, status: progress.status }
      });
    }

    // Check failure threshold
    const failureRate = progress.totalTargets > 0 ? 
      progress.failedTargets / progress.totalTargets : 0;
    
    if (failureRate > 0.1) { // 10% failure rate
      this.generateAlert({
        name: 'high_failure_rate',
        condition: `failure_rate > 0.1`,
        severity: 'critical',
        message: `Deployment ${deploymentId} has high failure rate: ${Math.round(failureRate * 100)}%`,
        metadata: { deploymentId, failureRate, failedTargets: progress.failedTargets }
      });
    }
  }

  private collectSystemMetrics(): void {
    // Collect system-level metrics
    const now = new Date();
    
    // CPU usage (mock - would use real system monitoring)
    this.recordMetric({
      name: 'system_cpu_usage',
      value: Math.random() * 100,
      timestamp: now,
      labels: { host: 'localhost' },
      type: 'gauge'
    });

    // Memory usage (mock)
    this.recordMetric({
      name: 'system_memory_usage',
      value: Math.random() * 8192,
      timestamp: now,
      labels: { host: 'localhost', unit: 'MB' },
      type: 'gauge'
    });

    // Active deployments gauge
    this.recordMetric({
      name: 'active_deployments',
      value: this.deploymentStates.size,
      timestamp: now,
      labels: {},
      type: 'gauge'
    });
  }

  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - this.metricsRetention);
    
    this.metrics.forEach((metricData, name) => {
      const filtered = metricData.filter(m => m.timestamp >= cutoff);
      this.metrics.set(name, filtered);
    });

    // Cleanup old alerts (keep for 7 days)
    const alertCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const alertsToDelete: string[] = [];
    
    this.alerts.forEach((alert, id) => {
      if (alert.status === 'resolved' && alert.resolvedAt && alert.resolvedAt < alertCutoff) {
        alertsToDelete.push(id);
      }
    });
    
    alertsToDelete.forEach(id => this.alerts.delete(id));
  }

  private evaluateAlerts(): void {
    // Evaluate dynamic alert conditions based on metrics
    const recentMetrics = this.getMetrics(undefined, {
      start: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
      end: new Date()
    });

    // Check for high error rate
    const errorLogs = recentMetrics.filter(m => 
      m.name === 'logs_total' && m.labels.level === 'error'
    );

    if (errorLogs.length > 10) {
      this.generateAlert({
        name: 'high_error_rate',
        condition: 'error_logs > 10 in 5min',
        severity: 'warning',
        message: `High error rate detected: ${errorLogs.length} errors in last 5 minutes`,
        metadata: { errorCount: errorLogs.length }
      });
    }
  }

  private filterMetricsByTime(
    metrics: MetricDataPoint[],
    timeRange?: { start: Date; end: Date }
  ): MetricDataPoint[] {
    if (!timeRange) return metrics;
    
    return metrics.filter(m => 
      m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
    );
  }

  private calculateAverageDeploymentTime(): number {
    const deployments = Array.from(this.deploymentStates.values());
    const completedDeployments = deployments.filter(d => d.status === 'completed');
    
    if (completedDeployments.length === 0) return 0;
    
    const totalTime = completedDeployments.reduce((sum, d) => {
      const duration = d.estimatedCompletionAt ? 
        d.estimatedCompletionAt.getTime() - d.startedAt.getTime() : 0;
      return sum + duration;
    }, 0);
    
    return totalTime / completedDeployments.length / 1000; // Convert to seconds
  }

  private calculateSuccessRate(): number {
    const deployments = Array.from(this.deploymentStates.values());
    const finishedDeployments = deployments.filter(d => 
      ['completed', 'failed'].includes(d.status)
    );
    
    if (finishedDeployments.length === 0) return 100;
    
    const successful = finishedDeployments.filter(d => d.status === 'completed').length;
    return (successful / finishedDeployments.length) * 100;
  }

  private calculateThroughput(): number {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const recentCompletions = this.getMetrics('deployment_completed', {
      start: hourAgo,
      end: now
    });
    
    return recentCompletions.length; // Deployments per hour
  }

  private getSystemHealth(): 'healthy' | 'degraded' | 'critical' {
    const activeAlerts = this.getAlerts().filter(a => a.status === 'active');
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length;
    const warningAlerts = activeAlerts.filter(a => a.severity === 'warning').length;
    
    if (criticalAlerts > 0) return 'critical';
    if (warningAlerts > 2) return 'degraded';
    return 'healthy';
  }
}