/**
 * Strategy Manager - Manages different distribution strategies
 */

import type { 
  DistributionStrategy, 
  DistributionTarget,
  TargetResult,
  DeploymentError
} from '../types';
import type { ClaudeCodeConfiguration } from '@/types';
import { NpmStrategy } from './npm-strategy';
import { GitStrategy } from './git-strategy';
import { SshStrategy } from './ssh-strategy';
import { CicdStrategy } from './cicd-strategy';
import { ConfigMgmtStrategy } from './config-mgmt-strategy';
import { PackageManagerStrategy } from './package-mgr-strategy';
import { WebhookStrategy } from './webhook-strategy';
import { HybridStrategy } from './hybrid-strategy';

/**
 * Deployment context for strategy execution
 */
export interface DeploymentContext {
  timeout: number;
  retryConfig?: {
    maxAttempts: number;
    initialDelay: number;
    backoffMultiplier: number;
  };
  onProgress?: (progress: number) => void;
  onLog?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
}

/**
 * Strategy deployment result
 */
export interface StrategyResult {
  success: boolean;
  message: string;
  error?: DeploymentError;
  metadata?: Record<string, any>;
}

/**
 * Base interface for all distribution strategies
 */
export interface IDistributionStrategy {
  /**
   * Deploy configuration to target
   */
  deploy(
    target: DistributionTarget, 
    config: ClaudeCodeConfiguration,
    context: DeploymentContext
  ): Promise<StrategyResult>;

  /**
   * Validate target connectivity
   */
  validateConnectivity(target: DistributionTarget): Promise<void>;

  /**
   * Rollback deployment
   */
  rollback(
    target: DistributionTarget,
    deploymentId: string,
    context: DeploymentContext
  ): Promise<StrategyResult>;

  /**
   * Get deployment status
   */
  getStatus(target: DistributionTarget, deploymentId: string): Promise<{
    status: 'pending' | 'deploying' | 'completed' | 'failed';
    progress: number;
    message: string;
  }>;
}

/**
 * Manages different distribution strategies
 */
export class StrategyManager {
  private strategies = new Map<DistributionStrategy, IDistributionStrategy>();

  constructor() {
    this.initializeStrategies();
  }

  /**
   * Initialize all available strategies
   */
  private initializeStrategies(): void {
    this.strategies.set('npm', new NpmStrategy());
    this.strategies.set('git', new GitStrategy());
    this.strategies.set('ssh', new SshStrategy());
    this.strategies.set('ci-cd', new CicdStrategy());
    this.strategies.set('config-mgmt', new ConfigMgmtStrategy());
    this.strategies.set('package-mgr', new PackageManagerStrategy());
    this.strategies.set('webhook', new WebhookStrategy());
    this.strategies.set('hybrid', new HybridStrategy());
  }

  /**
   * Get strategy implementation
   */
  getStrategy(strategy: DistributionStrategy): IDistributionStrategy {
    const implementation = this.strategies.get(strategy);
    if (!implementation) {
      throw new Error(`Unknown distribution strategy: ${strategy}`);
    }
    return implementation;
  }

  /**
   * Get all available strategies
   */
  getAvailableStrategies(): DistributionStrategy[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Register custom strategy
   */
  registerStrategy(name: DistributionStrategy, strategy: IDistributionStrategy): void {
    this.strategies.set(name, strategy);
  }

  /**
   * Validate strategy configuration
   */
  async validateStrategy(target: DistributionTarget): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const strategy = this.getStrategy(target.strategy);
      await strategy.validateConnectivity(target);
    } catch (error) {
      errors.push(`Strategy validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Recommend optimal strategy based on target characteristics
   */
  recommendStrategy(targets: DistributionTarget[]): {
    strategy: DistributionStrategy;
    confidence: number;
    reasoning: string[];
  } {
    const reasoning: string[] = [];
    
    // Analyze target characteristics
    const strategyCount = new Map<DistributionStrategy, number>();
    targets.forEach(target => {
      strategyCount.set(target.strategy, (strategyCount.get(target.strategy) || 0) + 1);
    });

    // Find most common strategy
    let recommendedStrategy: DistributionStrategy = 'ssh';
    let maxCount = 0;
    
    strategyCount.forEach((count, strategy) => {
      if (count > maxCount) {
        maxCount = count;
        recommendedStrategy = strategy;
      }
    });

    // Calculate confidence based on uniformity
    const confidence = (maxCount / targets.length) * 100;

    reasoning.push(`${maxCount} out of ${targets.length} targets use ${recommendedStrategy} strategy`);
    
    if (confidence < 50) {
      reasoning.push('Consider using hybrid strategy due to mixed target types');
      recommendedStrategy = 'hybrid';
    }

    // Additional recommendations based on scale
    if (targets.length > 100) {
      reasoning.push('Large scale deployment detected - consider CI/CD or package manager strategy');
    }

    if (targets.length > 500) {
      reasoning.push('Very large scale deployment - hybrid strategy recommended for resilience');
      recommendedStrategy = 'hybrid';
    }

    return {
      strategy: recommendedStrategy,
      confidence,
      reasoning
    };
  }

  /**
   * Get strategy performance characteristics
   */
  getStrategyPerformance(strategy: DistributionStrategy): {
    scalability: 'low' | 'medium' | 'high';
    reliability: 'low' | 'medium' | 'high';
    complexity: 'low' | 'medium' | 'high';
    supportedPlatforms: string[];
    estimatedSpeed: string;
  } {
    const characteristics = {
      npm: {
        scalability: 'high' as const,
        reliability: 'high' as const,
        complexity: 'medium' as const,
        supportedPlatforms: ['Node.js', 'JavaScript', 'TypeScript'],
        estimatedSpeed: 'Fast (package registry)'
      },
      git: {
        scalability: 'medium' as const,
        reliability: 'medium' as const,
        complexity: 'low' as const,
        supportedPlatforms: ['All platforms with Git'],
        estimatedSpeed: 'Medium (Git operations)'
      },
      ssh: {
        scalability: 'medium' as const,
        reliability: 'medium' as const,
        complexity: 'low' as const,
        supportedPlatforms: ['Linux', 'macOS', 'Windows (with SSH)'],
        estimatedSpeed: 'Fast (direct connection)'
      },
      'ci-cd': {
        scalability: 'high' as const,
        reliability: 'high' as const,
        complexity: 'high' as const,
        supportedPlatforms: ['All platforms via CI/CD'],
        estimatedSpeed: 'Medium (pipeline execution)'
      },
      'config-mgmt': {
        scalability: 'high' as const,
        reliability: 'high' as const,
        complexity: 'high' as const,
        supportedPlatforms: ['Enterprise environments'],
        estimatedSpeed: 'Slow (orchestration overhead)'
      },
      'package-mgr': {
        scalability: 'high' as const,
        reliability: 'high' as const,
        complexity: 'medium' as const,
        supportedPlatforms: ['Platform specific'],
        estimatedSpeed: 'Fast (package manager)'
      },
      webhook: {
        scalability: 'high' as const,
        reliability: 'medium' as const,
        complexity: 'low' as const,
        supportedPlatforms: ['HTTP-enabled platforms'],
        estimatedSpeed: 'Very fast (HTTP)'
      },
      hybrid: {
        scalability: 'high' as const,
        reliability: 'high' as const,
        complexity: 'high' as const,
        supportedPlatforms: ['All platforms'],
        estimatedSpeed: 'Variable (mixed strategies)'
      }
    };

    return characteristics[strategy] || {
      scalability: 'low' as const,
      reliability: 'low' as const,
      complexity: 'high' as const,
      supportedPlatforms: [],
      estimatedSpeed: 'Unknown'
    };
  }
}