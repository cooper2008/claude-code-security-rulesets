/**
 * Health Checker for Enterprise Distribution System
 * Verifies deployment success and configuration validity
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import type { 
  HealthCheckConfig,
  HealthCheckResult,
  HealthCheckType,
  HealthCheckCriteria,
  DistributionTarget
} from './types';
import type { ClaudeCodeConfiguration } from '@/types';

/**
 * Health check execution context
 */
interface HealthCheckContext {
  target: DistributionTarget;
  timeout: number;
  retries: number;
  configuration?: ClaudeCodeConfiguration;
}

/**
 * Health checker for verifying deployments
 */
export class HealthChecker {
  private checkResults = new Map<string, HealthCheckResult>();

  /**
   * Perform health checks for a target
   */
  async performChecks(
    healthConfig: HealthCheckConfig,
    target: DistributionTarget,
    configuration?: ClaudeCodeConfiguration
  ): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    
    // If single health check config, wrap in array
    const checks = Array.isArray(healthConfig) ? healthConfig : [healthConfig];
    
    for (const check of checks) {
      const result = await this.performSingleCheck(check, target, configuration);
      results.push(result);
      
      // Cache result for monitoring
      this.checkResults.set(`${target.id}_${check.type}`, result);
    }

    return results;
  }

  /**
   * Perform a single health check
   */
  async performSingleCheck(
    check: HealthCheckConfig,
    target: DistributionTarget,
    configuration?: ClaudeCodeConfiguration
  ): Promise<HealthCheckResult> {
    const context: HealthCheckContext = {
      target,
      timeout: check.timeout * 1000, // Convert to milliseconds
      retries: check.retries,
      configuration
    };

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts <= check.retries) {
      try {
        const result = await this.executeHealthCheck(check, context);
        
        return {
          name: this.getCheckName(check),
          status: result.success ? 'healthy' : 'unhealthy',
          message: result.message,
          duration: result.duration,
          lastCheck: new Date()
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempts++;
        
        if (attempts <= check.retries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
          await this.sleep(delay);
        }
      }
    }

    // All attempts failed
    return {
      name: this.getCheckName(check),
      status: 'unhealthy',
      message: `Health check failed after ${attempts} attempts: ${lastError?.message || 'Unknown error'}`,
      duration: 0,
      lastCheck: new Date()
    };
  }

  /**
   * Get cached health check results
   */
  getCachedResults(targetId: string): HealthCheckResult[] {
    const results: HealthCheckResult[] = [];
    
    this.checkResults.forEach((result, key) => {
      if (key.startsWith(`${targetId}_`)) {
        results.push(result);
      }
    });
    
    return results;
  }

  /**
   * Clear cached results for a target
   */
  clearCache(targetId: string): void {
    const keysToDelete: string[] = [];
    
    this.checkResults.forEach((_, key) => {
      if (key.startsWith(`${targetId}_`)) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.checkResults.delete(key));
  }

  /**
   * Execute health check based on type
   */
  private async executeHealthCheck(
    check: HealthCheckConfig,
    context: HealthCheckContext
  ): Promise<{ success: boolean; message: string; duration: number }> {
    const startTime = Date.now();
    
    try {
      let success = false;
      let message = '';

      switch (check.type) {
        case 'http':
          ({ success, message } = await this.performHttpCheck(check, context));
          break;
        case 'tcp':
          ({ success, message } = await this.performTcpCheck(check, context));
          break;
        case 'command':
          ({ success, message } = await this.performCommandCheck(check, context));
          break;
        case 'file-exists':
          ({ success, message } = await this.performFileExistsCheck(check, context));
          break;
        case 'config-validation':
          ({ success, message } = await this.performConfigValidationCheck(check, context));
          break;
        default:
          throw new Error(`Unsupported health check type: ${check.type}`);
      }

      const duration = Date.now() - startTime;
      return { success, message, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      throw new Error(`Health check execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform HTTP health check
   */
  private async performHttpCheck(
    check: HealthCheckConfig,
    context: HealthCheckContext
  ): Promise<{ success: boolean; message: string }> {
    const url = this.resolveEndpoint(check.endpoint, context.target);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(context.timeout)
      });

      const success = this.evaluateHttpResponse(response, check.criteria);
      const message = success ? 
        `HTTP check passed: ${response.status} ${response.statusText}` :
        `HTTP check failed: ${response.status} ${response.statusText}`;

      return { success, message };

    } catch (error) {
      return {
        success: false,
        message: `HTTP request failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Perform TCP connection check
   */
  private async performTcpCheck(
    check: HealthCheckConfig,
    context: HealthCheckContext
  ): Promise<{ success: boolean; message: string }> {
    const [host, portStr] = check.endpoint.split(':');
    const port = parseInt(portStr, 10);

    if (!host || !port) {
      throw new Error('TCP endpoint must be in format "host:port"');
    }

    try {
      const socket = new Promise<boolean>((resolve, reject) => {
        const net = require('net');
        const connection = net.createConnection(port, host);
        
        connection.setTimeout(context.timeout);
        
        connection.on('connect', () => {
          connection.end();
          resolve(true);
        });
        
        connection.on('error', (error: Error) => {
          reject(error);
        });
        
        connection.on('timeout', () => {
          connection.end();
          reject(new Error('Connection timeout'));
        });
      });

      await socket;
      return { success: true, message: `TCP connection to ${host}:${port} successful` };

    } catch (error) {
      return {
        success: false,
        message: `TCP connection failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Perform command execution check
   */
  private async performCommandCheck(
    check: HealthCheckConfig,
    context: HealthCheckContext
  ): Promise<{ success: boolean; message: string }> {
    const command = this.resolveEndpoint(check.endpoint, context.target);
    
    try {
      const result = await this.executeCommand(command, context.timeout);
      const success = this.evaluateCommandResult(result, check.criteria);
      const message = success ?
        `Command executed successfully: ${result.stdout.substring(0, 100)}${result.stdout.length > 100 ? '...' : ''}` :
        `Command failed: exit code ${result.exitCode}`;

      return { success, message };

    } catch (error) {
      return {
        success: false,
        message: `Command execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Perform file existence check
   */
  private async performFileExistsCheck(
    check: HealthCheckConfig,
    context: HealthCheckContext
  ): Promise<{ success: boolean; message: string }> {
    const filePath = this.resolveEndpoint(check.endpoint, context.target);
    
    try {
      // For local files, check directly
      const config = context.target.connection.config;
      const isLocal = (config.type !== 'ssh') || (!('host' in config) || config.host === 'localhost');
      if (isLocal) {
        const fs = require('fs');
        const exists = fs.existsSync(filePath);
        
        return {
          success: exists,
          message: exists ? `File exists: ${filePath}` : `File not found: ${filePath}`
        };
      } else {
        // For remote files, use SSH to check
        const command = `test -f "${filePath}"`;
        const result = await this.executeRemoteCommand(command, context);
        
        return {
          success: result.exitCode === 0,
          message: result.exitCode === 0 ? `Remote file exists: ${filePath}` : `Remote file not found: ${filePath}`
        };
      }

    } catch (error) {
      return {
        success: false,
        message: `File check failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Perform configuration validation check
   */
  private async performConfigValidationCheck(
    check: HealthCheckConfig,
    context: HealthCheckContext
  ): Promise<{ success: boolean; message: string }> {
    const configPath = this.resolveEndpoint(check.endpoint, context.target);
    
    try {
      let configContent: string;

      // Read configuration file
      const config = context.target.connection.config;
      if (!('host' in config) || !config.host || config.host === 'localhost') {
        configContent = readFileSync(configPath, 'utf8');
      } else {
        const result = await this.executeRemoteCommand(`cat "${configPath}"`, context);
        if (result.exitCode !== 0) {
          throw new Error(`Failed to read remote config: ${result.stderr}`);
        }
        configContent = result.stdout;
      }

      // Validate JSON format
      let parsedConfig: ClaudeCodeConfiguration;
      try {
        parsedConfig = JSON.parse(configContent);
      } catch (parseError) {
        return {
          success: false,
          message: `Configuration is not valid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        };
      }

      // Validate configuration structure
      const validationResult = this.validateConfigStructure(parsedConfig, context.configuration);
      
      return {
        success: validationResult.isValid,
        message: validationResult.message
      };

    } catch (error) {
      return {
        success: false,
        message: `Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Helper methods
   */
  private getCheckName(check: HealthCheckConfig): string {
    return `${check.type}-check-${check.endpoint.replace(/[^a-zA-Z0-9]/g, '-')}`;
  }

  private resolveEndpoint(endpoint: string, target: DistributionTarget): string {
    // Replace template variables in endpoint
    return endpoint
      .replace('{{TARGET_HOST}}', (target.connection.config as any).host || 'localhost')
      .replace('{{TARGET_PORT}}', (target.connection.config as any).port?.toString() || '22')
      .replace('{{TARGET_PATH}}', (target.connection.config as any).targetPath || '/tmp');
  }

  private evaluateHttpResponse(response: Response, criteria: HealthCheckCriteria): boolean {
    // Check status codes
    if (criteria.httpStatusCodes && criteria.httpStatusCodes.length > 0) {
      if (!criteria.httpStatusCodes.includes(response.status)) {
        return false;
      }
    } else {
      // Default: accept 2xx status codes
      if (response.status < 200 || response.status >= 300) {
        return false;
      }
    }

    // Additional checks would go here (response body pattern matching, etc.)
    
    return true;
  }

  private evaluateCommandResult(
    result: { exitCode: number; stdout: string; stderr: string },
    criteria: HealthCheckCriteria
  ): boolean {
    // Check exit code
    const expectedExitCode = criteria.exitCode || 0;
    if (result.exitCode !== expectedExitCode) {
      return false;
    }

    // Check response pattern if specified
    if (criteria.responsePattern) {
      const regex = new RegExp(criteria.responsePattern);
      if (!regex.test(result.stdout)) {
        return false;
      }
    }

    return true;
  }

  private validateConfigStructure(
    config: ClaudeCodeConfiguration,
    expectedConfig?: ClaudeCodeConfiguration
  ): { isValid: boolean; message: string } {
    // Basic structure validation
    if (!config.permissions) {
      return {
        isValid: false,
        message: 'Configuration missing required "permissions" field'
      };
    }

    const { permissions } = config;
    
    // Validate permissions structure
    if (permissions.deny && !Array.isArray(permissions.deny)) {
      return {
        isValid: false,
        message: 'permissions.deny must be an array'
      };
    }

    if (permissions.allow && !Array.isArray(permissions.allow)) {
      return {
        isValid: false,
        message: 'permissions.allow must be an array'
      };
    }

    if (permissions.ask && !Array.isArray(permissions.ask)) {
      return {
        isValid: false,
        message: 'permissions.ask must be an array'
      };
    }

    // If expected configuration provided, validate against it
    if (expectedConfig) {
      const configHash = this.calculateConfigHash(config);
      const expectedHash = this.calculateConfigHash(expectedConfig);
      
      if (configHash !== expectedHash) {
        return {
          isValid: false,
          message: 'Deployed configuration does not match expected configuration'
        };
      }
    }

    return {
      isValid: true,
      message: 'Configuration is valid'
    };
  }

  private calculateConfigHash(config: ClaudeCodeConfiguration): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
  }

  private executeCommand(
    command: string,
    timeout: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('bash', ['-c', command], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  private executeRemoteCommand(
    command: string,
    context: HealthCheckContext
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const target = context.target;
    const config = target.connection.config as any;
    
    const sshCommand = `ssh -p ${config.port || 22} ${config.keyPath ? `-i ${config.keyPath}` : ''} -o StrictHostKeyChecking=no ${config.username}@${config.host} "${command}"`;
    
    return this.executeCommand(sshCommand, context.timeout);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}