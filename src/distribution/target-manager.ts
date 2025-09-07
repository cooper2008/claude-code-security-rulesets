/**
 * Target Manager for Enterprise Distribution
 * Auto-discovers and manages deployment targets across enterprise infrastructure
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { 
  DistributionTarget,
  DistributionTargetType,
  DistributionStrategy,
  DistributionMetadata
} from './types';

/**
 * Target discovery result
 */
export interface DiscoveryResult {
  targets: DistributionTarget[];
  method: string;
  confidence: number;
  metadata: Record<string, any>;
}

/**
 * Target manager for enterprise deployment discovery
 */
export class TargetManager {
  private discoveredTargets = new Map<string, DistributionTarget>();

  /**
   * Auto-discover targets from LDAP/Active Directory
   */
  async discoverFromLDAP(): Promise<DistributionTarget[]> {
    // Mock LDAP discovery - in real implementation would use LDAP client
    console.log('🔍 Discovering targets from LDAP/Active Directory...');
    
    // Simulate LDAP query for developer machines
    const mockLdapResults = [
      { cn: 'john.doe', mail: 'john.doe@company.com', department: 'Engineering', team: 'Frontend' },
      { cn: 'jane.smith', mail: 'jane.smith@company.com', department: 'Engineering', team: 'Backend' },
      { cn: 'mike.johnson', mail: 'mike.johnson@company.com', department: 'DevOps', team: 'Infrastructure' }
    ];

    const targets: DistributionTarget[] = mockLdapResults.map(user => ({
      id: `ldap-${user.cn}`,
      name: `${user.cn} Workstation`,
      type: 'developer-machine',
      strategy: 'ssh', // Default strategy for LDAP-discovered machines
      connection: {
        strategy: 'ssh',
        config: {
          type: 'ssh',
          host: `${user.cn}.company.local`,
          port: 22,
          username: user.cn,
          targetPath: '/etc/claude',
          method: 'scp'
        },
        timeout: { connection: 10000, operation: 30000, total: 60000 }
      },
      metadata: {
        organization: { id: 'company', name: 'Company Inc' },
        environment: { type: 'development', region: 'us-west-1' },
        developer: {
          id: user.cn,
          email: user.mail,
          department: user.department,
          team: user.team,
          role: 'developer'
        },
        machine: {
          type: 'workstation',
          os: 'linux',
          architecture: 'x86_64'
        },
        tags: {
          discovered_via: 'ldap',
          department: user.department.toLowerCase(),
          team: user.team.toLowerCase()
        }
      },
      healthCheck: {
        type: 'ssh',
        interval: 60,
        timeout: 10,
        retries: 2,
        endpoint: `${user.cn}.company.local:22`,
        criteria: { exitCode: 0 }
      }
    }));

    targets.forEach(target => this.discoveredTargets.set(target.id, target));
    
    return targets;
  }

  /**
   * Discover targets from Kubernetes clusters
   */
  async discoverFromKubernetes(): Promise<DistributionTarget[]> {
    console.log('🔍 Discovering targets from Kubernetes...');
    
    try {
      // Check if kubectl is available
      const namespaces = await this.executeCommand('kubectl', ['get', 'namespaces', '-o', 'name']);
      const namespaceList = namespaces.split('\n').filter(n => n.includes('namespace/'));

      const targets: DistributionTarget[] = [];

      for (const ns of namespaceList.slice(0, 5)) { // Limit to first 5 namespaces
        const namespace = ns.replace('namespace/', '');
        
        // Get pods in namespace
        try {
          const pods = await this.executeCommand('kubectl', [
            'get', 'pods', '-n', namespace,
            '-o', 'jsonpath={range .items[*]}{.metadata.name},{.spec.nodeName},{.status.podIP}{"\n"}{end}'
          ]);

          pods.split('\n').filter(line => line.trim()).forEach(podInfo => {
            const [podName, nodeName, podIP] = podInfo.split(',');
            
            if (podIP && podName.includes('claude') || podName.includes('dev')) {
              targets.push({
                id: `k8s-${namespace}-${podName}`,
                name: `${namespace}/${podName}`,
                type: 'development-cluster',
                strategy: 'webhook', // Use webhook for K8s pods
                connection: {
                  strategy: 'webhook',
                  config: {
                    type: 'webhook',
                    url: `http://${podIP}:8080/api/config/deploy`,
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-Source': 'claude-enterprise-deploy'
                    },
                    payloadTemplate: '{"configuration": {{config}}, "metadata": {{metadata}}}'
                  }
                },
                metadata: {
                  organization: { id: 'company', name: 'Company Inc' },
                  environment: { type: 'development', region: 'kubernetes' },
                  machine: {
                    type: 'container',
                    os: 'linux',
                    architecture: 'x86_64',
                    hostname: podName
                  },
                  tags: {
                    discovered_via: 'kubernetes',
                    namespace: namespace,
                    node: nodeName,
                    pod_ip: podIP
                  }
                },
                healthCheck: {
                  type: 'http',
                  interval: 30,
                  timeout: 5,
                  retries: 3,
                  endpoint: `http://${podIP}:8080/health`,
                  criteria: { httpStatusCodes: [200] }
                }
              });
            }
          });
        } catch (error) {
          // Skip this namespace if we can't get pods
          continue;
        }
      }

      targets.forEach(target => this.discoveredTargets.set(target.id, target));
      
      return targets;

    } catch (error) {
      throw new Error(`Kubernetes discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Discover targets from AWS infrastructure
   */
  async discoverFromAWS(): Promise<DistributionTarget[]> {
    console.log('🔍 Discovering targets from AWS...');
    
    try {
      // Check if AWS CLI is available
      const instances = await this.executeCommand('aws', [
        'ec2', 'describe-instances',
        '--query', 'Reservations[*].Instances[*].[InstanceId,PrivateIpAddress,Tags[?Key==`Name`].Value|[0],State.Name]',
        '--output', 'text'
      ]);

      const targets: DistributionTarget[] = [];
      const instanceLines = instances.split('\n').filter(line => line.trim());

      instanceLines.forEach(line => {
        const [instanceId, privateIp, name, state] = line.split('\t');
        
        if (state === 'running' && privateIp) {
          targets.push({
            id: `aws-${instanceId}`,
            name: name || instanceId,
            type: 'developer-machine',
            strategy: 'ssh',
            connection: {
              strategy: 'ssh',
              config: {
                type: 'ssh',
                host: privateIp,
                port: 22,
                username: 'ec2-user', // Default for Amazon Linux
                targetPath: '/opt/claude',
                method: 'scp'
              }
            },
            metadata: {
              organization: { id: 'company', name: 'Company Inc' },
              environment: { type: 'production', region: 'aws' },
              machine: {
                type: 'vm',
                os: 'linux',
                architecture: 'x86_64',
                hostname: instanceId
              },
              tags: {
                discovered_via: 'aws',
                instance_id: instanceId,
                private_ip: privateIp
              }
            },
            healthCheck: {
              type: 'tcp',
              interval: 60,
              timeout: 10,
              retries: 2,
              endpoint: `${privateIp}:22`,
              criteria: {}
            }
          });
        }
      });

      targets.forEach(target => this.discoveredTargets.set(target.id, target));
      
      return targets;

    } catch (error) {
      throw new Error(`AWS discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Discover targets from SSH configuration
   */
  async discoverFromSSHConfig(): Promise<DistributionTarget[]> {
    console.log('🔍 Discovering targets from SSH configuration...');
    
    const sshConfigPath = join(homedir(), '.ssh', 'config');
    
    if (!existsSync(sshConfigPath)) {
      return [];
    }

    try {
      const sshConfig = readFileSync(sshConfigPath, 'utf8');
      const targets: DistributionTarget[] = [];
      const hosts = this.parseSSHConfig(sshConfig);

      hosts.forEach(host => {
        // Skip wildcard hosts and localhost
        if (host.host.includes('*') || host.host === 'localhost') return;

        targets.push({
          id: `ssh-${host.host}`,
          name: `SSH Host: ${host.host}`,
          type: 'developer-machine',
          strategy: 'ssh',
          connection: {
            strategy: 'ssh',
            config: {
              type: 'ssh',
              host: host.hostname || host.host,
              port: host.port || 22,
              username: host.user || 'root',
              targetPath: '/etc/claude',
              method: 'scp',
              keyPath: host.identityFile
            }
          },
          metadata: {
            organization: { id: 'company', name: 'Company Inc' },
            environment: { type: 'development', region: 'ssh' },
            machine: {
              type: 'server',
              os: 'linux',
              architecture: 'x86_64',
              hostname: host.hostname || host.host
            },
            tags: {
              discovered_via: 'ssh-config',
              ssh_host: host.host
            }
          },
          healthCheck: {
            type: 'tcp',
            interval: 120,
            timeout: 10,
            retries: 2,
            endpoint: `${host.hostname || host.host}:${host.port || 22}`,
            criteria: {}
          }
        });
      });

      targets.forEach(target => this.discoveredTargets.set(target.id, target));
      
      return targets;

    } catch (error) {
      throw new Error(`SSH config discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Discover targets from Git repositories
   */
  async discoverFromGitRepositories(): Promise<DistributionTarget[]> {
    console.log('🔍 Discovering targets from Git repositories...');
    
    try {
      // Get list of Git remotes
      const remotes = await this.executeCommand('git', ['remote', '-v']);
      const targets: DistributionTarget[] = [];
      const uniqueRepos = new Set<string>();

      remotes.split('\n').forEach(line => {
        const match = line.match(/^(\w+)\s+(.+?)\s+\(push\)$/);
        if (match) {
          const [, remoteName, remoteUrl] = match;
          
          if (!uniqueRepos.has(remoteUrl)) {
            uniqueRepos.add(remoteUrl);
            
            targets.push({
              id: `git-${this.hashString(remoteUrl)}`,
              name: `Git Repository: ${remoteName}`,
              type: 'git-repository',
              strategy: 'git',
              connection: {
                strategy: 'git',
                config: {
                  type: 'git',
                  repositoryUrl: remoteUrl,
                  branch: 'main',
                  method: 'direct-push',
                  targetPath: '.claude/settings.json'
                }
              },
              metadata: {
                organization: { id: 'company', name: 'Company Inc' },
                environment: { type: 'development', region: 'git' },
                tags: {
                  discovered_via: 'git',
                  remote_name: remoteName,
                  repository_url: remoteUrl
                }
              },
              healthCheck: {
                type: 'command',
                interval: 300,
                timeout: 30,
                retries: 1,
                endpoint: `git ls-remote ${remoteUrl}`,
                criteria: { exitCode: 0 }
              }
            });
          }
        }
      });

      targets.forEach(target => this.discoveredTargets.set(target.id, target));
      
      return targets;

    } catch (error) {
      // Git command might fail if not in a repository
      return [];
    }
  }

  /**
   * Discover local development environment
   */
  async discoverLocal(): Promise<DistributionTarget[]> {
    console.log('🔍 Discovering local development environment...');
    
    const targets: DistributionTarget[] = [{
      id: 'local-dev',
      name: 'Local Development Environment',
      type: 'developer-machine',
      strategy: 'ssh',
      connection: {
        strategy: 'ssh',
        config: {
          type: 'ssh',
          host: 'localhost',
          port: 22,
          username: process.env.USER || 'developer',
          targetPath: join(homedir(), '.claude'),
          method: 'scp'
        }
      },
      metadata: {
        organization: { id: 'local', name: 'Local Development' },
        environment: { type: 'development', region: 'local' },
        developer: {
          id: process.env.USER || 'developer',
          email: `${process.env.USER}@localhost`,
          department: 'Development',
          team: 'Local',
          role: 'developer'
        },
        machine: {
          type: 'workstation',
          os: process.platform,
          architecture: process.arch,
          hostname: 'localhost'
        },
        tags: {
          discovered_via: 'local',
          user: process.env.USER || 'developer'
        }
      },
      healthCheck: {
        type: 'file-exists',
        interval: 60,
        timeout: 5,
        retries: 1,
        endpoint: homedir(),
        criteria: { fileExists: [homedir()] }
      }
    }];

    targets.forEach(target => this.discoveredTargets.set(target.id, target));
    
    return targets;
  }

  /**
   * Get all discovered targets
   */
  getAllTargets(): DistributionTarget[] {
    return Array.from(this.discoveredTargets.values());
  }

  /**
   * Get targets by strategy
   */
  getTargetsByStrategy(strategy: DistributionStrategy): DistributionTarget[] {
    return this.getAllTargets().filter(target => target.strategy === strategy);
  }

  /**
   * Get targets by type
   */
  getTargetsByType(type: DistributionTargetType): DistributionTarget[] {
    return this.getAllTargets().filter(target => target.type === type);
  }

  /**
   * Validate target connectivity
   */
  async validateTarget(target: DistributionTarget): Promise<{
    valid: boolean;
    error?: string;
    latency?: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Basic connectivity test based on strategy
      switch (target.strategy) {
        case 'ssh':
          await this.testSSHConnectivity(target);
          break;
        case 'http':
        case 'webhook':
          await this.testHTTPConnectivity(target);
          break;
        default:
          // For other strategies, assume valid
          break;
      }
      
      return {
        valid: true,
        latency: Date.now() - startTime
      };

    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * Private helper methods
   */
  private parseSSHConfig(config: string): Array<{
    host: string;
    hostname?: string;
    port?: number;
    user?: string;
    identityFile?: string;
  }> {
    const hosts: Array<any> = [];
    const lines = config.split('\n');
    let currentHost: any = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const [key, ...valueParts] = trimmed.split(/\s+/);
      const value = valueParts.join(' ');

      if (key.toLowerCase() === 'host') {
        if (currentHost) {
          hosts.push(currentHost);
        }
        currentHost = { host: value };
      } else if (currentHost) {
        switch (key.toLowerCase()) {
          case 'hostname':
            currentHost.hostname = value;
            break;
          case 'port':
            currentHost.port = parseInt(value, 10);
            break;
          case 'user':
            currentHost.user = value;
            break;
          case 'identityfile':
            currentHost.identityFile = value.replace('~', homedir());
            break;
        }
      }
    });

    if (currentHost) {
      hosts.push(currentHost);
    }

    return hosts;
  }

  private async testSSHConnectivity(target: DistributionTarget): Promise<void> {
    const config = target.connection.config as any;
    const command = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${config.username}@${config.host} echo "test"`;
    await this.executeCommand('bash', ['-c', command]);
  }

  private async testHTTPConnectivity(target: DistributionTarget): Promise<void> {
    const config = target.connection.config as any;
    const response = await fetch(config.url || config.endpoint, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  private executeCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `Command exited with code ${code}`));
        }
      });
      
      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  private hashString(str: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 8);
  }
}