/**
 * Enterprise Distribution System for Claude Code Security Configurations
 * Comprehensive system for deploying security configs to 1000+ developers automatically
 * 
 * This system provides:
 * - Multiple distribution strategies (NPM, Git, SSH, CI/CD, Config Management, Package Managers, Webhooks, Hybrid)
 * - Real-time monitoring and progress tracking
 * - Enterprise-grade rollback capabilities
 * - Health checking and validation
 * - Advanced targeting and filtering
 * - Notification and alerting system
 * - CLI management interface
 * - CI/CD integration templates
 * - Configuration management automation
 */

// Core distribution system
export { EnterpriseDeployer } from './deployer';
export { StrategyManager, type IDistributionStrategy } from './strategies/manager';

// Distribution strategies
export { NpmStrategy } from './strategies/npm-strategy';
export { GitStrategy } from './strategies/git-strategy';
export { SshStrategy } from './strategies/ssh-strategy';
export { CicdStrategy } from './strategies/cicd-strategy';
export { ConfigMgmtStrategy } from './strategies/config-mgmt-strategy';
export { PackageManagerStrategy } from './strategies/package-mgr-strategy';
export { WebhookStrategy } from './strategies/webhook-strategy';
export { HybridStrategy } from './strategies/hybrid-strategy';

// Monitoring and tracking
export { MonitoringService, type MetricDataPoint, type Alert, type DashboardData } from './monitoring';
export { ProgressTracker } from './progress-tracker';
export { HealthChecker } from './health-checker';

// Rollback and recovery
export { RollbackService, type RollbackSnapshot, type RollbackOperation } from './rollback';

// Notifications
export { NotificationService, type NotificationMessage } from './notification';

// Target management and filtering
export { TargetManager, type DiscoveryResult } from './target-manager';
export { FilterEngine, type FilterResult, type FilterStats } from './filter-engine';

// Type definitions
export * from './types';

/**
 * Enterprise Distribution System Factory
 * Simplified interface for creating and configuring the complete distribution system
 */
export class EnterpriseDistributionSystem {
  private deployer: EnterpriseDeployer;
  private targetManager: TargetManager;
  private filterEngine: FilterEngine;

  constructor() {
    this.deployer = new EnterpriseDeployer();
    this.targetManager = new TargetManager();
    this.filterEngine = new FilterEngine();
  }

  /**
   * Quick deployment with auto-discovery
   */
  async quickDeploy(
    config: any,
    options: {
      environment?: string;
      strategy?: string;
      filters?: string;
      dryRun?: boolean;
      parallelism?: number;
    } = {}
  ) {
    console.log('🚀 Starting quick enterprise deployment...');
    
    // Auto-discover targets
    const targets = await this.autoDiscoverTargets();
    console.log(`🎯 Discovered ${targets.length} targets`);
    
    // Apply filters if specified
    let filteredTargets = targets;
    if (options.filters) {
      const filters = this.parseFilterString(options.filters);
      filteredTargets = await this.filterEngine.applyFilters(targets, filters);
      console.log(`🔍 Filtered to ${filteredTargets.length} targets`);
    }
    
    // Create deployment configuration
    const deploymentConfig = {
      id: crypto.randomUUID(),
      configuration: config,
      targets: filteredTargets,
      strategy: {
        type: options.strategy || 'immediate',
        parameters: {
          maxConcurrency: options.parallelism || 10,
          timeout: 300000,
          continueOnError: true,
          failureThreshold: 0.1,
          autoRollback: true
        },
        healthChecks: [],
        validation: []
      },
      rollback: {
        enabled: true,
        triggers: [],
        strategy: { method: 'previous-version', parameters: {}, verification: [] },
        maxAttempts: 3,
        timeout: 60000
      },
      monitoring: {
        metrics: [],
        alerts: [],
        logging: { level: 'info', format: 'json', destinations: [], retention: { days: 30, maxSize: '100MB' } }
      },
      notifications: {
        channels: [],
        events: [],
        templates: []
      }
    };
    
    if (options.dryRun) {
      console.log('🔍 Dry run - would deploy to:', filteredTargets.map(t => t.name));
      return { success: true, message: 'Dry run completed', dryRun: true };
    }
    
    // Execute deployment
    return await this.deployer.deploy(deploymentConfig as any);
  }

  /**
   * Auto-discover all available targets
   */
  private async autoDiscoverTargets() {
    const allTargets: any[] = [];
    
    const discoveryMethods = [
      () => this.targetManager.discoverFromLDAP(),
      () => this.targetManager.discoverFromKubernetes(), 
      () => this.targetManager.discoverFromAWS(),
      () => this.targetManager.discoverFromSSHConfig(),
      () => this.targetManager.discoverFromGitRepositories(),
      () => this.targetManager.discoverLocal()
    ];

    for (const method of discoveryMethods) {
      try {
        const discovered = await method();
        allTargets.push(...discovered);
      } catch (error) {
        // Continue with next method
        console.warn(`Discovery method failed: ${error}`);
      }
    }

    // Remove duplicates
    const uniqueTargets = allTargets.filter((target, index, self) => 
      index === self.findIndex(t => t.id === target.id)
    );

    return uniqueTargets;
  }

  /**
   * Parse simple filter string
   */
  private parseFilterString(filterStr: string) {
    const filters: any[] = [];
    
    const orGroups = filterStr.split(';');
    
    orGroups.forEach(group => {
      const criteria = group.split(',').map(criterion => {
        const [field, value] = criterion.split('=');
        return {
          field: field as any,
          operator: 'equals' as const,
          value: value
        };
      });

      filters.push({
        criteria,
        logic: 'and',
        type: 'include'
      });
    });

    return filters;
  }

  /**
   * Get system status
   */
  async getStatus() {
    return {
      deployer: 'active',
      targetManager: 'active',
      filterEngine: 'active',
      activeDeployments: 0, // Would query actual deployments
      discoveredTargets: this.targetManager.getAllTargets().length
    };
  }
}

// Default export for convenience
export default EnterpriseDistributionSystem;

/**
 * Example Usage:
 * 
 * ```typescript
 * import { EnterpriseDistributionSystem } from '@/distribution';
 * 
 * const system = new EnterpriseDistributionSystem();
 * 
 * // Quick deployment
 * const result = await system.quickDeploy(config, {
 *   environment: 'staging',
 *   strategy: 'canary',
 *   filters: 'department=engineering,team=frontend',
 *   parallelism: 20
 * });
 * 
 * // Manual deployment with full control
 * import { EnterpriseDeployer } from '@/distribution';
 * 
 * const deployer = new EnterpriseDeployer();
 * const result = await deployer.deploy(deploymentConfig);
 * ```
 */