/**
 * Plugin System Tests
 * Tests for the plugin architecture functionality
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import {
  PluginManager,
  createTestPluginManager,
  PluginDevUtils,
  PluginRegistry,
  PluginLoader,
  PluginSandbox,
  createDefaultSandboxConfig
} from '../../src/plugins';
import { ClaudeCodeConfiguration } from '../../src/types';

describe('Plugin System', () => {
  let pluginManager: PluginManager;
  let testPluginDir: string;

  beforeEach(async () => {
    // Create temporary directory for test plugins
    testPluginDir = path.join(__dirname, 'temp-plugins');
    await fs.mkdir(testPluginDir, { recursive: true });

    // Create test plugin manager
    pluginManager = createTestPluginManager([testPluginDir]);
  });

  afterEach(async () => {
    // Cleanup
    if (pluginManager) {
      await pluginManager.cleanup();
    }

    // Remove temporary directory
    try {
      await fs.rm(testPluginDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Plugin Manager', () => {
    it('should initialize successfully', async () => {
      await pluginManager.initialize({
        skipDiscovery: true,
        skipDefaultPlugins: true
      });

      const stats = pluginManager.getStats();
      expect(stats.manager.initialized).toBe(true);
    });

    it('should discover plugins from filesystem', async () => {
      // Create a test plugin
      await createTestPlugin(testPluginDir, 'test-validation-plugin');

      await pluginManager.initialize({ skipDefaultPlugins: true });

      const stats = pluginManager.getStats();
      expect(stats.registry.totalPlugins).toBeGreaterThan(0);
    });

    it('should load and execute validation plugin', async () => {
      // Create test plugin
      await createTestValidationPlugin(testPluginDir);
      
      await pluginManager.initialize({ skipDefaultPlugins: true });

      // Load plugin
      const loadResult = await pluginManager.loadPlugin('test-validator');
      expect(loadResult.success).toBe(true);

      // Execute validation
      const testConfig: ClaudeCodeConfiguration = {
        permissions: {
          deny: ['rm -rf *'],
          allow: ['echo *', 'ls *'],
          ask: ['mkdir *']
        }
      };

      const results = await pluginManager.executeValidation(testConfig);
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle plugin errors gracefully', async () => {
      // Create faulty plugin
      await createFaultyPlugin(testPluginDir);
      
      await pluginManager.initialize({ skipDefaultPlugins: true });

      const loadResult = await pluginManager.loadPlugin('faulty-plugin');
      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toBeDefined();
    });

    it('should check plugin health', async () => {
      await createTestPlugin(testPluginDir, 'health-test-plugin');
      await pluginManager.initialize({ skipDefaultPlugins: true });

      const loadResult = await pluginManager.loadPlugin('health-test-plugin');
      expect(loadResult.success).toBe(true);

      const health = await pluginManager.getPluginHealth('health-test-plugin');
      expect(health).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });
  });

  describe('Plugin Registry', () => {
    it('should register and retrieve plugins', async () => {
      const registry = new PluginRegistry(
        {
          pluginDirs: [testPluginDir],
          timeout: 5000,
          maxConcurrentPlugins: 2,
          cacheDir: './test-cache',
          security: {
            enableSandbox: true,
            allowedPaths: [],
            allowedDomains: [],
            verifySignatures: false,
            trustedAuthors: [],
            maxMemoryUsage: 64,
            maxExecutionTime: 5000
          },
          autoUpdate: {
            enabled: false,
            interval: 60000,
            checkOnStart: false
          }
        },
        PluginDevUtils.createTestLogger('test-registry').logger
      );

      await registry.initialize();

      // Create test plugin
      await createTestPlugin(testPluginDir, 'registry-test');

      // Discover plugins
      const result = await registry.discoverFromFilesystem(testPluginDir);
      expect(result.plugins.length).toBeGreaterThan(0);

      // Register plugin
      if (result.plugins[0]) {
        await registry.registerPlugin(result.plugins[0]);
        
        const plugin = registry.getPlugin(result.plugins[0].manifest.id);
        expect(plugin).toBeDefined();
      }

      await registry.cleanup();
    });

    it('should search plugins by criteria', async () => {
      const registry = new PluginRegistry(
        {
          pluginDirs: [testPluginDir],
          timeout: 5000,
          maxConcurrentPlugins: 2,
          cacheDir: './test-cache',
          security: {
            enableSandbox: true,
            allowedPaths: [],
            allowedDomains: [],
            verifySignatures: false,
            trustedAuthors: [],
            maxMemoryUsage: 64,
            maxExecutionTime: 5000
          },
          autoUpdate: {
            enabled: false,
            interval: 60000,
            checkOnStart: false
          }
        },
        PluginDevUtils.createTestLogger('test-registry').logger
      );

      await registry.initialize();

      // Create different types of plugins
      await createTestPlugin(testPluginDir, 'validation-plugin', 'validation');
      await createTestPlugin(testPluginDir, 'template-plugin', 'templates');

      const result = await registry.discoverFromFilesystem(testPluginDir);
      for (const plugin of result.plugins) {
        if (plugin.isValid) {
          await registry.registerPlugin(plugin);
        }
      }

      // Search by category
      const validationPlugins = registry.searchPlugins({ category: 'validation' });
      const templatePlugins = registry.searchPlugins({ category: 'templates' });

      expect(validationPlugins.length).toBeGreaterThan(0);
      expect(templatePlugins.length).toBeGreaterThan(0);

      await registry.cleanup();
    });
  });

  describe('Plugin Sandbox', () => {
    it('should execute code securely', async () => {
      const { logger } = PluginDevUtils.createTestLogger('sandbox-test');
      const sandbox = new PluginSandbox(createDefaultSandboxConfig(), logger);

      const context = PluginDevUtils.createTestContext('sandbox-test');
      const apis = {
        logger,
        config: {} as any,
        storage: {} as any,
        events: {} as any
      };

      await sandbox.initialize(context, apis);

      const result = await sandbox.execute('const result = 2 + 2; result');
      
      expect(result.success).toBe(true);
      expect(result.result).toBe(4);
      expect(result.metrics.duration).toBeGreaterThan(0);

      await sandbox.cleanup();
    });

    it('should handle timeouts', async () => {
      const { logger } = PluginDevUtils.createTestLogger('timeout-test');
      const config = createDefaultSandboxConfig();
      config.timeout = 100; // Very short timeout
      
      const sandbox = new PluginSandbox(config, logger);

      const context = PluginDevUtils.createTestContext('timeout-test');
      const apis = {
        logger,
        config: {} as any,
        storage: {} as any,
        events: {} as any
      };

      await sandbox.initialize(context, apis);

      const result = await sandbox.execute(
        'while(true) { /* infinite loop */ }',
        { timeout: 100 }
      );
      
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('timeout');

      await sandbox.cleanup();
    });

    it('should restrict dangerous operations', async () => {
      const { logger } = PluginDevUtils.createTestLogger('security-test');
      const sandbox = new PluginSandbox(createDefaultSandboxConfig(), logger);

      const context = PluginDevUtils.createTestContext('security-test');
      const apis = {
        logger,
        config: {} as any,
        storage: {} as any,
        events: {} as any
      };

      await sandbox.initialize(context, apis);

      // Test that dangerous operations are blocked
      const dangerousCode = 'require("fs").readFileSync("/etc/passwd")';
      const result = await sandbox.execute(dangerousCode);
      
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('security');

      await sandbox.cleanup();
    });
  });

  describe('Plugin Development Utils', () => {
    it('should create development manifest', () => {
      const manifest = PluginDevUtils.createDevManifest('test-plugin', {
        description: 'Custom test plugin'
      });

      expect(manifest.id).toBe('test-plugin');
      expect(manifest.name).toBe('test-plugin');
      expect(manifest.description).toBe('Custom test plugin');
      expect(manifest.category).toBe('utility');
      expect(manifest.types).toContain('validation-rule');
    });

    it('should create test context', () => {
      const context = PluginDevUtils.createTestContext('test-context');

      expect(context.workdir).toContain('test-context');
      expect(context.datadir).toContain('test-context');
      expect(context.system.platform).toBeDefined();
      expect(context.apis).toContain('validation');
    });

    it('should create test logger', () => {
      const { logger, logs } = PluginDevUtils.createTestLogger('test-logger');

      logger.info('Test message');
      logger.warn('Warning message');
      logger.error('Error message');

      expect(logs.length).toBe(3);
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toBe('Test message');
      expect(logs[1].level).toBe('warn');
      expect(logs[2].level).toBe('error');
    });
  });
});

// Helper functions for creating test plugins

async function createTestPlugin(
  pluginDir: string, 
  pluginId: string, 
  category: string = 'validation'
): Promise<void> {
  const pluginPath = path.join(pluginDir, pluginId);
  await fs.mkdir(pluginPath, { recursive: true });

  // Create package.json
  const packageJson = {
    name: pluginId,
    version: '1.0.0',
    description: `Test plugin: ${pluginId}`,
    main: 'index.js',
    keywords: ['claude-security-plugin'],
    claudePlugin: {
      category,
      types: ['validation-rule'],
      apiVersion: '1.0.0',
      permissions: {},
      entryPoints: {
        main: 'index.js'
      }
    }
  };

  await fs.writeFile(
    path.join(pluginPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Create basic plugin implementation
  const pluginCode = `
class ${pluginId.replace(/-/g, '')}Plugin {
  constructor() {
    this.manifest = require('./package.json').claudePlugin;
  }

  async initialize(context, apis) {
    this.context = context;
    this.apis = apis;
  }

  async activate() {}
  async deactivate() {}
  async cleanup() {}

  getHealth() {
    return {
      status: 'healthy',
      message: 'Test plugin is operational',
      timestamp: new Date()
    };
  }
}

module.exports = ${pluginId.replace(/-/g, '')}Plugin;
`;

  await fs.writeFile(path.join(pluginPath, 'index.js'), pluginCode);
}

async function createTestValidationPlugin(pluginDir: string): Promise<void> {
  const pluginPath = path.join(pluginDir, 'test-validator');
  await fs.mkdir(pluginPath, { recursive: true });

  // Create package.json
  const packageJson = {
    name: 'test-validator',
    version: '1.0.0',
    description: 'Test validation plugin',
    main: 'index.js',
    keywords: ['claude-security-plugin'],
    claudePlugin: {
      category: 'validation',
      types: ['validation-rule'],
      apiVersion: '1.0.0',
      permissions: {},
      entryPoints: {
        main: 'index.js'
      }
    }
  };

  await fs.writeFile(
    path.join(pluginPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Create validation plugin implementation
  const pluginCode = `
class TestValidatorPlugin {
  constructor() {
    this.manifest = require('./package.json').claudePlugin;
  }

  async initialize(context, apis) {
    this.context = context;
    this.apis = apis;
  }

  async activate() {}
  async deactivate() {}
  async cleanup() {}

  async validate(config, context) {
    const errors = [];
    const warnings = [];

    // Simple validation: check for dangerous patterns
    if (config.permissions?.allow) {
      for (const rule of config.permissions.allow) {
        if (rule.includes('rm -rf')) {
          errors.push({
            code: 'DANGEROUS_COMMAND',
            message: 'Dangerous rm -rf command detected',
            severity: 'critical'
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      performance: {
        duration: 10,
        memoryUsed: 1
      }
    };
  }

  getSupportedRules() {
    return [{
      id: 'dangerous-commands',
      name: 'Dangerous Commands Check',
      description: 'Detects dangerous shell commands',
      category: 'security',
      defaultSeverity: 'critical'
    }];
  }

  getHealth() {
    return {
      status: 'healthy',
      message: 'Test validator is operational',
      timestamp: new Date()
    };
  }
}

module.exports = TestValidatorPlugin;
`;

  await fs.writeFile(path.join(pluginPath, 'index.js'), pluginCode);
}

async function createFaultyPlugin(pluginDir: string): Promise<void> {
  const pluginPath = path.join(pluginDir, 'faulty-plugin');
  await fs.mkdir(pluginPath, { recursive: true });

  // Create package.json
  const packageJson = {
    name: 'faulty-plugin',
    version: '1.0.0',
    description: 'Faulty test plugin',
    main: 'index.js',
    keywords: ['claude-security-plugin'],
    claudePlugin: {
      category: 'validation',
      types: ['validation-rule'],
      apiVersion: '1.0.0',
      permissions: {},
      entryPoints: {
        main: 'index.js'
      }
    }
  };

  await fs.writeFile(
    path.join(pluginPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Create faulty plugin that throws on initialize
  const pluginCode = `
class FaultyPlugin {
  constructor() {
    this.manifest = require('./package.json').claudePlugin;
  }

  async initialize(context, apis) {
    throw new Error('Simulated plugin initialization failure');
  }
}

module.exports = FaultyPlugin;
`;

  await fs.writeFile(path.join(pluginPath, 'index.js'), pluginCode);
}