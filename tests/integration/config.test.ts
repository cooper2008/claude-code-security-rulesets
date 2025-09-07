/**
 * Integration tests for the complete configuration system
 * Tests the full workflow: discovery → loading → merging → validation
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  parseConfiguration,
  discoverConfigurations,
  mergeConfigurations,
  configUtils,
  type ConfigurationLevel
} from '../../src/config/index.js';
import { ClaudeCodeConfiguration } from '../../src/types/index.js';

describe('Configuration System Integration', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-config-integration-'));
    projectDir = path.join(tempDir, 'project');
    await fs.mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Complete Configuration Workflow', () => {
    test('should handle full enterprise to user hierarchy', async () => {
      // Create enterprise configuration (most restrictive)
      const enterpriseDir = path.join(tempDir, 'enterprise');
      await fs.mkdir(enterpriseDir, { recursive: true });
      const enterpriseConfig: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['Write(*)', 'Execute(*)', 'Network(*.external.com)'],
          allow: ['Read(/approved/**)'],
          ask: []
        },
        metadata: {
          version: '1.0.0',
          timestamp: Date.now(),
          organization: 'Enterprise Corp',
          environment: 'production'
        }
      };
      await fs.writeFile(
        path.join(enterpriseDir, 'settings.json'),
        JSON.stringify(enterpriseConfig, null, 2)
      );

      // Create project configuration
      const projectConfig: ClaudeCodeConfiguration = {
        permissions: {
          allow: ['Read(**)', 'Write(/tmp/**)'], // More permissive, but enterprise deny rules still apply
          ask: ['Network(api.company.com)']
        },
        metadata: {
          version: '1.1.0',
          timestamp: Date.now(),
          environment: 'development'
        }
      };
      await fs.writeFile(
        path.join(projectDir, 'settings.json'),
        JSON.stringify(projectConfig, null, 2)
      );

      // Create user configuration
      const userDir = path.join(projectDir, '.claude');
      await fs.mkdir(userDir, { recursive: true });
      const userConfig: ClaudeCodeConfiguration = {
        permissions: {
          ask: ['Write(/home/user/documents/**)'] // User wants confirmation for personal files
        },
        metadata: {
          version: '1.0.0',
          timestamp: Date.now()
        }
      };
      await fs.writeFile(
        path.join(userDir, 'settings.json'),
        JSON.stringify(userConfig, null, 2)
      );

      // Mock discovery to include enterprise config
      const originalDiscover = discoverConfigurations;
      jest.spyOn(require('../../src/config/discovery.js'), 'discoverConfigurations')
        .mockImplementation(async (options) => {
          const normalSources = await originalDiscover(options);
          normalSources.unshift({
            path: path.join(enterpriseDir, 'settings.json'),
            level: 'enterprise' as ConfigurationLevel,
            exists: true,
            modifiedTime: new Date(),
            size: JSON.stringify(enterpriseConfig).length
          });
          return normalSources;
        });

      const result = await parseConfiguration({
        startDir: projectDir
      });

      // Verify the merge result
      expect(result.validation.isValid).toBe(true);
      
      // Enterprise deny rules should be preserved
      expect(result.config.permissions?.deny).toContain('Write(*)');
      expect(result.config.permissions?.deny).toContain('Execute(*)');
      expect(result.config.permissions?.deny).toContain('Network(*.external.com)');
      
      // Project allow rules should be included (where not overridden)
      expect(result.config.permissions?.allow).toContain('Read(**)');
      // Write to /tmp should be filtered out because of enterprise deny rule Write(*)
      
      // Ask rules should be combined
      expect(result.config.permissions?.ask).toContain('Network(api.company.com)');
      expect(result.config.permissions?.ask).toContain('Write(/home/user/documents/**)');
      
      // Metadata should use highest version
      expect(result.config.metadata?.version).toBe('1.1.0');
      expect(result.config.metadata?.organization).toBe('Enterprise Corp');

      // Should detect conflicts
      expect(result.validation.conflicts.length).toBeGreaterThan(0);
      
      // Should have multiple sources
      expect(result.sources.length).toBeGreaterThanOrEqual(3);
    });

    test('should handle CLI overrides with security precedence', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          allow: ['Read(*)', 'Write(/tmp/**)'],
          ask: ['Network(*)']
        },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      await fs.writeFile(
        path.join(projectDir, 'settings.json'),
        JSON.stringify(config, null, 2)
      );

      const result = await parseConfiguration({
        startDir: projectDir,
        cliOverrides: {
          'permissions.deny': ['Write(*)', 'Execute(*)'],
          'permissions.allow': ['Read(*.json)', 'Read(*.txt)'],
          'metadata.environment': 'testing'
        }
      });

      expect(result.validation.isValid).toBe(true);
      
      // CLI deny rules should be applied
      expect(result.config.permissions?.deny).toContain('Write(*)');
      expect(result.config.permissions?.deny).toContain('Execute(*)');
      
      // CLI allow rules should replace original allow rules
      expect(result.config.permissions?.allow).toContain('Read(*.json)');
      expect(result.config.permissions?.allow).toContain('Read(*.txt)');
      
      // Original ask rules should remain
      expect(result.config.permissions?.ask).toContain('Network(*)');
      
      // Metadata should be updated
      expect(result.config.metadata?.environment).toBe('testing');
    });

    test('should handle environment variable substitution', async () => {
      const config = {
        permissions: {
          deny: ['Write(${PROTECTED_PATH}/**)'],
          allow: ['Read(${PROJECT_ROOT}/**)'],
          ask: ['Network(${API_HOST}:${API_PORT})']
        },
        metadata: {
          version: '1.0.0',
          timestamp: Date.now(),
          name: '${PROJECT_NAME} Configuration'
        }
      };

      await fs.writeFile(
        path.join(projectDir, 'settings.json'),
        JSON.stringify(config, null, 2)
      );

      const result = await parseConfiguration({
        startDir: projectDir,
        envVars: {
          PROTECTED_PATH: '/etc/secrets',
          PROJECT_ROOT: '/home/user/myproject',
          API_HOST: 'api.example.com',
          API_PORT: '443',
          PROJECT_NAME: 'MyApp'
        }
      });

      expect(result.validation.isValid).toBe(true);
      expect(result.config.permissions?.deny).toContain('Write(/etc/secrets/**)');
      expect(result.config.permissions?.allow).toContain('Read(/home/user/myproject/**)');
      expect(result.config.permissions?.ask).toContain('Network(api.example.com:443)');
      expect(result.config.metadata?.name).toBe('MyApp Configuration');
    });
  });

  describe('Real-world Scenarios', () => {
    test('should handle complex development workflow', async () => {
      // Simulate a development team setup
      const configs = [
        {
          file: 'settings.json',
          config: {
            permissions: {
              allow: ['Read(**)', 'Write(/src/**)', 'Write(/tests/**)'],
              ask: ['Execute(npm)', 'Execute(node)', 'Network(localhost:*)'],
              deny: ['Write(/node_modules/**)', 'Execute(rm)', 'Execute(sudo)']
            },
            metadata: {
              version: '1.0.0',
              timestamp: Date.now(),
              name: 'Development Base Configuration'
            }
          }
        },
        {
          file: '.claude/settings.json',
          config: {
            permissions: {
              ask: ['Write(/docs/**)'], // Developer wants to confirm doc changes
              allow: ['Read(/home/user/.npmrc)'] // Access to personal npm config
            },
            metadata: {
              version: '1.0.1',
              timestamp: Date.now(),
              name: 'Personal Development Overrides'
            }
          }
        }
      ];

      // Create configuration files
      for (const { file, config } of configs) {
        const filePath = path.join(projectDir, file);
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(config, null, 2));
      }

      const result = await parseConfiguration({
        startDir: projectDir,
        cliOverrides: {
          'permissions.ask': ['Write(/README.md)', 'Write(/CHANGELOG.md)']
        }
      });

      expect(result.validation.isValid).toBe(true);
      
      // Should combine all ask rules
      const askRules = result.config.permissions?.ask || [];
      expect(askRules).toContain('Execute(npm)');
      expect(askRules).toContain('Execute(node)');
      expect(askRules).toContain('Write(/docs/**)');
      expect(askRules).toContain('Write(/README.md)');
      expect(askRules).toContain('Write(/CHANGELOG.md)');
      
      // Should preserve security deny rules
      expect(result.config.permissions?.deny).toContain('Execute(rm)');
      expect(result.config.permissions?.deny).toContain('Execute(sudo)');
      
      // Should show good performance for typical development config
      expect(result.performance.totalTime).toBeLessThan(500); // Should be very fast
    });

    test('should handle production security lockdown', async () => {
      const productionConfig: ClaudeCodeConfiguration = {
        permissions: {
          deny: [
            'Write(**)',        // No writes in production
            'Execute(**)',      // No arbitrary execution
            'Network(**)',      // No network access
            'Read(/etc/**)',    // No system file access
            'Read(/proc/**)',   // No process information
            'Read(/home/**)'    // No user directory access
          ],
          allow: [
            'Read(/app/public/**)',  // Only read allowed public files
            'Read(/app/config/production.json)' // Production config only
          ],
          ask: [] // No interactive prompts in production
        },
        metadata: {
          version: '2.0.0',
          timestamp: Date.now(),
          organization: 'Production Security Team',
          environment: 'production',
          name: 'Production Security Lockdown'
        }
      };

      await fs.writeFile(
        path.join(projectDir, 'settings.json'),
        JSON.stringify(productionConfig, null, 2)
      );

      const result = await parseConfiguration({
        startDir: projectDir,
        validationOptions: {
          allowAdditionalProperties: false,
          validateEnvironmentVars: true,
          maxDepth: 5,
          skipValidation: false
        }
      });

      expect(result.validation.isValid).toBe(true);
      
      // Verify strict security
      expect(result.config.permissions?.deny).toContain('Write(**)');
      expect(result.config.permissions?.deny).toContain('Execute(**)');
      expect(result.config.permissions?.deny).toContain('Network(**)');
      
      // Verify limited allow rules
      expect(result.config.permissions?.allow).toHaveLength(2);
      expect(result.config.permissions?.allow).toContain('Read(/app/public/**)');
      
      // Verify no ask rules (production shouldn't prompt)
      expect(result.config.permissions?.ask).toHaveLength(0);
      
      // Should have production metadata
      expect(result.config.metadata?.environment).toBe('production');
      expect(result.config.metadata?.organization).toBe('Production Security Team');
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle partial configuration failures gracefully', async () => {
      // Create a good config
      const goodConfig: ClaudeCodeConfiguration = {
        permissions: { allow: ['Read(*)'] },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };
      await fs.writeFile(
        path.join(projectDir, 'settings.json'),
        JSON.stringify(goodConfig, null, 2)
      );

      // Create a bad config in subdirectory
      const subDir = path.join(projectDir, 'sub');
      await fs.mkdir(subDir);
      await fs.writeFile(
        path.join(subDir, 'settings.json'),
        '{ invalid json }'
      );

      const result = await parseConfiguration({
        startDir: projectDir
      });

      // Should still succeed with the good config
      expect(result.validation.isValid).toBe(true);
      expect(result.config.permissions?.allow).toContain('Read(*)');
      
      // Should have at least one source (the good one)
      expect(result.sources.length).toBeGreaterThan(0);
    });

    test('should provide helpful error messages', async () => {
      const invalidConfig = {
        permissions: {
          deny: [''], // Empty string is invalid
          allow: ['   '], // Whitespace only is invalid
          ask: ['Invalid!!!Pattern'] // Invalid pattern
        },
        metadata: {
          version: 'not-semver', // Invalid version format
          timestamp: -1 // Invalid timestamp
        }
      };

      await fs.writeFile(
        path.join(projectDir, 'settings.json'),
        JSON.stringify(invalidConfig, null, 2)
      );

      const result = await parseConfiguration({
        startDir: projectDir
      });

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors.length).toBeGreaterThan(0);
      
      // Should have specific error messages
      const errorMessages = result.validation.errors.map(e => e.message);
      expect(errorMessages.some(msg => msg.includes('pattern'))).toBe(true);
    });
  });

  describe('Utilities Integration', () => {
    test('should work with configuration utilities', async () => {
      const config = configUtils.createMinimalConfig();
      
      await fs.writeFile(
        path.join(projectDir, 'settings.json'),
        JSON.stringify(config, null, 2)
      );

      const result = await parseConfiguration({
        startDir: projectDir
      });

      expect(result.validation.isValid).toBe(true);
      
      const summary = configUtils.generateSummary(result.config);
      expect(summary.hasPermissions).toBe(true);
      expect(summary.ruleCount).toBe(0); // Minimal config has no rules
      expect(summary.hasMetadata).toBe(true);
      expect(summary.version).toBe('1.0.0');
    });

    test('should estimate complexity correctly', async () => {
      const complexConfig: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['Write(*)', 'Execute(*)', 'Network(**)'],
          allow: Array(50).fill(0).map((_, i) => `Read(file${i}.txt)`),
          ask: ['Write(*.log)', 'Network(api.*)']
        },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      await fs.writeFile(
        path.join(projectDir, 'settings.json'),
        JSON.stringify(complexConfig, null, 2)
      );

      const result = await parseConfiguration({
        startDir: projectDir
      });

      const complexity = configUtils.estimateComplexity(result.config);
      expect(complexity.ruleCount).toBe(55); // 3 + 50 + 2
      expect(complexity.wildcardCount).toBe(5); // Patterns with *
      expect(complexity.complexityScore).toBeGreaterThan(60);
    });
  });
});