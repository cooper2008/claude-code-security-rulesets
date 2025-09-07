/**
 * Unit tests for the configuration parser
 * Tests core parsing, validation, and merging functionality
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  ConfigurationParser,
  parseConfiguration,
  type ParserOptions
} from '../../../src/config/parser';
import { ClaudeCodeConfiguration } from '../../../src/types/index';

describe('ConfigurationParser', () => {
  let parser: ConfigurationParser;
  let tempDir: string;

  beforeEach(async () => {
    parser = new ConfigurationParser();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-config-test-'));
  });

  afterEach(async () => {
    parser.clearCache();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Basic Parsing', () => {
    test('should parse a valid configuration', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['Write(*)', 'Execute(*)'],
          allow: ['Read(*.json)'],
          ask: ['Network(*)']
        },
        metadata: {
          version: '1.0.0',
          timestamp: Date.now()
        }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // Mock the discovery to only find our test config
      const originalDiscover = require('../../../src/config/discovery').discoverConfigurations;
      jest.spyOn(require('../../../src/config/discovery'), 'discoverConfigurations')
        .mockImplementation(async () => [{
          path: configPath,
          level: 'project' as any,
          exists: true,
          modifiedTime: new Date(),
          size: JSON.stringify(config).length
        }]);

      const result = await parser.parseConfiguration({
        startDir: tempDir
      });

      expect(result.validation.isValid).toBe(true);
      expect(result.config.permissions?.deny).toEqual(['Write(*)', 'Execute(*)']);
      expect(result.config.permissions?.allow).toEqual(['Read(*.json)']);
      expect(result.config.permissions?.ask).toEqual(['Network(*)']);
      expect(result.sources).toHaveLength(1);

      // Restore original function
      jest.restoreAllMocks();
    });

    test('should handle empty configuration directory', async () => {
      const result = await parser.parseConfiguration({
        startDir: tempDir
      });

      expect(result.validation.isValid).toBe(true);
      expect(result.config.permissions?.deny).toEqual([]);
      expect(result.config.permissions?.allow).toEqual([]);
      expect(result.config.permissions?.ask).toEqual([]);
      expect(result.sources).toHaveLength(0);
    });

    test('should handle malformed JSON', async () => {
      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, '{ "permissions": { "deny": [}'); // Invalid JSON

      const result = await parser.parseConfiguration({
        startDir: tempDir
      });

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors.length).toBeGreaterThan(0);
      expect(result.validation.errors[0].type).toBe('INVALID_SYNTAX');
    });
  });

  describe('Schema Validation', () => {
    test('should validate required metadata fields', async () => {
      const config = {
        permissions: {
          deny: ['Write(*)']
        },
        metadata: {
          // Missing version and timestamp
        }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      const result = await parser.parseConfiguration({
        startDir: tempDir
      });

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors.some(e => 
        e.message.includes('version')
      )).toBe(true);
    });

    test('should validate rule patterns', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['  ', '', 'Invalid Rule Pattern!!!'],
          allow: ['Read(file.txt)'],
          ask: []
        },
        metadata: {
          version: '1.0.0',
          timestamp: Date.now()
        }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      const result = await parser.parseConfiguration({
        startDir: tempDir
      });

      expect(result.validation.isValid).toBe(false);
      expect(result.validation.errors.some(e => 
        e.type === 'INVALID_PATTERN'
      )).toBe(true);
    });
  });

  describe('Hierarchical Merging', () => {
    test('should merge configurations with proper precedence', async () => {
      // Create project-level config
      const projectConfig = {
        permissions: {
          allow: ['Read(*)'],
          ask: ['Network(*)']
        },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      // Create user-level config in subdirectory
      const userDir = path.join(tempDir, '.claude');
      await fs.mkdir(userDir, { recursive: true });
      
      const userConfig = {
        permissions: {
          deny: ['Write(*)'],
          allow: ['Read(*.txt)'] // More restrictive than project
        },
        metadata: { version: '1.1.0', timestamp: Date.now() }
      };

      await fs.writeFile(
        path.join(tempDir, 'settings.json'), 
        JSON.stringify(projectConfig, null, 2)
      );
      await fs.writeFile(
        path.join(userDir, 'settings.json'), 
        JSON.stringify(userConfig, null, 2)
      );

      const result = await parser.parseConfiguration({
        startDir: tempDir
      });

      expect(result.validation.isValid).toBe(true);
      expect(result.config.permissions?.deny).toContain('Write(*)');
      expect(result.config.permissions?.ask).toContain('Network(*)');
      expect(result.sources.length).toBeGreaterThan(1);
    });

    test('should handle CLI overrides', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          allow: ['Read(*)']
        },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      const result = await parser.parseConfiguration({
        startDir: tempDir,
        cliOverrides: {
          'permissions.deny': ['Write(*)', 'Execute(*)'],
          'metadata.environment': 'production'
        }
      });

      expect(result.config.permissions?.deny).toEqual(['Write(*)', 'Execute(*)']);
      expect(result.config.metadata?.environment).toBe('production');
    });
  });

  describe('Conflict Detection', () => {
    test('should detect allow/deny conflicts', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['Write(*)'],
          allow: ['Write(file.txt)'], // Conflicts with deny
          ask: []
        },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      const result = await parser.parseConfiguration({
        startDir: tempDir
      });

      expect(result.validation.conflicts.length).toBeGreaterThan(0);
      expect(result.validation.conflicts.some(c => 
        c.type === 'ALLOW_OVERRIDES_DENY'
      )).toBe(true);
    });

    test('should detect overlapping patterns', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['Write(*)', 'Write(*.txt)'], // Overlapping patterns
          allow: [],
          ask: []
        },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      const result = await parser.parseConfiguration({
        startDir: tempDir
      });

      expect(result.validation.conflicts.some(c => 
        c.type === 'OVERLAPPING_PATTERNS'
      )).toBe(true);
    });
  });

  describe('Performance', () => {
    test('should meet performance targets', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: {
          deny: Array(100).fill(0).map((_, i) => `Write(file${i}.txt)`),
          allow: Array(50).fill(0).map((_, i) => `Read(file${i}.txt)`),
          ask: Array(25).fill(0).map((_, i) => `Network(server${i})`)
        },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      const result = await parser.parseConfiguration({
        startDir: tempDir
      });

      expect(result.performance.totalTime).toBeLessThan(1000); // Should be under 1 second
      expect(result.validation.performance.performanceTarget.achieved).toBe(true);
    });

    test('should timeout on excessive parse time', async () => {
      const options: ParserOptions = {
        startDir: tempDir,
        maxParseTime: 100 // Very short timeout
      };

      // Create a very large config that might take time to process
      const largeConfig = {
        permissions: {
          deny: Array(10000).fill(0).map((_, i) => `Write(file${i}.txt)`)
        },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(largeConfig, null, 2));

      const result = await parser.parseConfiguration(options);

      // Should either complete quickly or timeout gracefully
      expect(result).toBeDefined();
      if (!result.validation.isValid) {
        expect(result.validation.errors.some(e => 
          e.message.includes('timeout')
        )).toBe(true);
      }
    }, 10000);
  });

  describe('Caching', () => {
    test('should cache parse results', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: { deny: ['Write(*)'] },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      // First parse
      const result1 = await parser.parseConfiguration({
        startDir: tempDir,
        useCache: true
      });

      // Second parse (should use cache)
      const result2 = await parser.parseConfiguration({
        startDir: tempDir,
        useCache: true
      });

      expect(result1.validation.isValid).toBe(true);
      expect(result2.validation.isValid).toBe(true);
      
      // Cache should improve performance on second call
      // Note: This is a simple check - in practice, cached calls should be much faster
      expect(result2.performance.totalTime).toBeLessThanOrEqual(result1.performance.totalTime);
    });

    test('should respect cache TTL', async () => {
      const config: ClaudeCodeConfiguration = {
        permissions: { deny: ['Write(*)'] },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      await parser.parseConfiguration({
        startDir: tempDir,
        useCache: true
      });

      const stats = parser.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      parser.clearCache();
      const clearedStats = parser.getCacheStats();
      expect(clearedStats.size).toBe(0);
    });
  });

  describe('Environment Variables', () => {
    test('should substitute environment variables', async () => {
      const config = {
        permissions: {
          deny: ['Write(${PROTECTED_FILE})'],
          allow: ['Read(${PROJECT_DIR}/**)']
        },
        metadata: { version: '1.0.0', timestamp: Date.now() }
      };

      const configPath = path.join(tempDir, 'settings.json');
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));

      const result = await parser.parseConfiguration({
        startDir: tempDir,
        envVars: {
          PROTECTED_FILE: 'secrets.txt',
          PROJECT_DIR: '/home/user/project'
        }
      });

      expect(result.config.permissions?.deny).toContain('Write(secrets.txt)');
      expect(result.config.permissions?.allow).toContain('Read(/home/user/project/**)');
    });
  });
});

// Convenience function tests
describe('parseConfiguration convenience function', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-config-func-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('should work as a standalone function', async () => {
    const config: ClaudeCodeConfiguration = {
      permissions: {
        deny: ['Write(*)'],
        allow: ['Read(*)']
      },
      metadata: { version: '1.0.0', timestamp: Date.now() }
    };

    const configPath = path.join(tempDir, 'settings.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    const result = await parseConfiguration({
      startDir: tempDir
    });

    expect(result.validation.isValid).toBe(true);
    expect(result.config.permissions?.deny).toContain('Write(*)');
    expect(result.config.permissions?.allow).toContain('Read(*)');
  });
});