# Claude Code Security Rulesets - Plugin Architecture

A secure, extensible plugin system for the Claude Code Security Rulesets Generator that enables custom validation rules, templates, and integrations while maintaining system security and performance.

## Architecture Overview

The plugin system consists of several key components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Plugin Manager │────│ Plugin Registry │────│ Plugin Loader   │
│  (Orchestrator) │    │  (Discovery)    │    │ (Execution)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                        │                        │
         │              ┌─────────────────┐               │
         └──────────────│ Plugin Sandbox  │───────────────┘
                        │ (Security)      │
                        └─────────────────┘
                                 │
                        ┌─────────────────┐
                        │   Plugin APIs   │
                        │ (Host Services) │
                        └─────────────────┘
```

## Key Features

### 🔒 **Secure Execution**
- Sandboxed plugin execution using Node.js VM module
- Resource limits (memory, CPU time, network access)
- Permission-based security model
- Code validation and signature verification

### ⚡ **High Performance**
- Timeout handling to prevent blocking
- Parallel plugin execution
- Caching and optimization
- Resource monitoring and cleanup

### 🔄 **Lifecycle Management**
- Hot loading/unloading of plugins
- Health monitoring and error recovery
- Dependency resolution
- Version compatibility checking

### 🎯 **Extensibility**
- Support for validation rules, templates, reporters, and integrations
- NPM package integration
- Event-driven architecture
- Standardized plugin API

## Plugin Types

### 1. Validation Plugins
Add custom validation rules for Claude Code configurations:

```javascript
class MyValidationPlugin {
  async validate(config, context) {
    // Custom validation logic
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }
}
```

### 2. Template Plugins
Provide additional security templates:

```javascript
class MyTemplatePlugin {
  async getTemplates() {
    return [{
      id: 'my-template',
      name: 'Custom Security Template',
      rules: { /* Claude Code configuration */ }
    }];
  }
}
```

### 3. Reporter Plugins
Generate custom reports from validation results:

```javascript
class MyReporterPlugin {
  async generateReport(result, options) {
    // Generate custom report format
    return {
      format: 'custom',
      content: reportContent
    };
  }
}
```

### 4. Integration Plugins
Connect with external systems:

```javascript
class MyIntegrationPlugin {
  async integrate(config, options) {
    // Integrate with external system
    return {
      success: true,
      data: integrationResult
    };
  }
}
```

## Quick Start

### 1. Basic Usage

```typescript
import { createPluginManager } from '@claude-security/plugins';

// Create plugin manager
const pluginManager = createPluginManager({
  pluginDirs: ['./plugins', './node_modules'],
  security: {
    enableSandbox: true,
    maxMemoryUsage: 128, // MB
    maxExecutionTime: 30000 // ms
  }
});

// Initialize and discover plugins
await pluginManager.initialize();

// Load a specific plugin
await pluginManager.loadPlugin('my-validation-plugin');

// Execute validation with plugins
const results = await pluginManager.executeValidation(config);
```

### 2. Creating a Plugin

#### Step 1: Create Plugin Manifest (package.json)

```json
{
  "name": "my-security-plugin",
  "version": "1.0.0",
  "description": "Custom security validation plugin",
  "main": "index.js",
  "keywords": ["claude-security-plugin"],
  "claudePlugin": {
    "category": "validation",
    "types": ["validation-rule"],
    "apiVersion": "1.0.0",
    "permissions": {
      "filesystem": {
        "read": ["./config"]
      },
      "network": {
        "domains": ["api.example.com"],
        "rateLimit": 100
      }
    },
    "entryPoints": {
      "main": "index.js"
    }
  }
}
```

#### Step 2: Implement Plugin Class

```javascript
class MySecurityPlugin {
  constructor() {
    this.manifest = require('./package.json').claudePlugin;
  }

  async initialize(context, apis) {
    this.context = context;
    this.apis = apis;
    this.apis.logger.info('Plugin initialized');
  }

  async activate() {
    this.apis.logger.info('Plugin activated');
  }

  async validate(config, context) {
    // Your validation logic here
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  async deactivate() {
    this.apis.logger.info('Plugin deactivated');
  }

  async cleanup() {
    // Cleanup resources
  }

  getHealth() {
    return {
      status: 'healthy',
      message: 'Plugin is operational',
      timestamp: new Date()
    };
  }
}

module.exports = MySecurityPlugin;
```

### 3. Plugin Directory Structure

```
my-security-plugin/
├── package.json          # Plugin manifest
├── index.js              # Main entry point
├── lib/                  # Plugin logic
│   ├── validators.js
│   └── utils.js
├── templates/            # Security templates (if template plugin)
├── tests/               # Plugin tests
└── README.md            # Plugin documentation
```

## Plugin APIs

Plugins have access to standardized APIs for interacting with the host system:

### Logger API
```javascript
this.apis.logger.info('Information message');
this.apis.logger.warn('Warning message');
this.apis.logger.error('Error message');
this.apis.logger.debug('Debug message');
```

### Configuration API
```javascript
// Get configuration value
const value = this.apis.config.get('setting.key');

// Set configuration value
this.apis.config.set('setting.key', value);

// Check if key exists
if (this.apis.config.has('setting.key')) { }
```

### Storage API
```javascript
// Store data persistently
await this.apis.storage.set('key', data);

// Retrieve data
const data = await this.apis.storage.get('key');

// Check if key exists
const exists = await this.apis.storage.has('key');

// Delete data
await this.apis.storage.delete('key');
```

### HTTP API (if network permissions granted)
```javascript
// Make HTTP requests
const response = await this.apis.http.get('https://api.example.com/data');
const result = await this.apis.http.post('https://api.example.com/webhook', data);
```

### Events API
```javascript
// Listen for events
this.apis.events.on('config-changed', (data) => {
  // Handle event
});

// Emit events
this.apis.events.emit('custom-event', eventData);
```

## Security Model

### Permissions System

Plugins must declare their required permissions:

```json
{
  "permissions": {
    "filesystem": {
      "read": ["./config", "./data"],
      "write": ["./output"]
    },
    "network": {
      "domains": ["api.example.com", "*.trusted.com"],
      "rateLimit": 100
    },
    "env": ["NODE_ENV", "API_KEY"],
    "exec": false,
    "native": false
  }
}
```

### Sandbox Execution

All plugins run in a secure VM context with:
- Limited access to Node.js APIs
- Memory and CPU time limits
- Network access restrictions
- Filesystem access controls

### Code Validation

Before execution, plugins undergo security scanning for:
- Dangerous function calls (`eval`, `exec`, etc.)
- Malicious patterns
- Oversized files
- Suspicious dependencies

## Configuration

### Plugin Manager Configuration

```typescript
const config: PluginManagerConfig = {
  // Plugin discovery directories
  pluginDirs: ['./plugins', './node_modules'],
  
  // NPM registry for plugin discovery (optional)
  npmRegistry: 'https://registry.npmjs.org',
  
  // Execution timeout (ms)
  timeout: 30000,
  
  // Maximum concurrent plugins
  maxConcurrentPlugins: 5,
  
  // Cache directory
  cacheDir: './.plugin-cache',
  
  // Security settings
  security: {
    enableSandbox: true,
    allowedPaths: ['./data'],
    allowedDomains: ['*.example.com'],
    verifySignatures: false,
    trustedAuthors: ['security-team'],
    maxMemoryUsage: 128, // MB
    maxExecutionTime: 30000 // ms
  },
  
  // Auto-update settings
  autoUpdate: {
    enabled: false,
    interval: 3600000, // 1 hour
    checkOnStart: true
  }
};
```

### Environment Variables

```bash
# Plugin system configuration
PLUGIN_CACHE_DIR=./.plugin-cache
PLUGIN_MAX_MEMORY=128
PLUGIN_TIMEOUT=30000
PLUGIN_SANDBOX_ENABLED=true

# Security settings
PLUGIN_VERIFY_SIGNATURES=false
PLUGIN_ALLOWED_DOMAINS=api.example.com,*.trusted.com
```

## Monitoring and Health Checks

### Plugin Health Monitoring

```typescript
// Check individual plugin health
const health = await pluginManager.getPluginHealth('plugin-id');

// Check all plugins health
const allHealth = await pluginManager.getAllPluginsHealth();

// Health status: 'healthy' | 'degraded' | 'unhealthy'
```

### Performance Metrics

```typescript
// Get plugin system statistics
const stats = pluginManager.getStats();

console.log('Loaded plugins:', stats.loader.totalLoaded);
console.log('Memory usage:', stats.loader.totalMemoryUsage, 'MB');
console.log('Execution time:', stats.loader.totalExecutionTime, 'ms');
```

### Event Monitoring

```typescript
pluginManager.on('plugin-loaded', (event) => {
  console.log('Plugin loaded:', event.pluginId);
});

pluginManager.on('plugin-error', (event) => {
  console.error('Plugin error:', event.pluginId, event.error);
});

pluginManager.on('validation-completed', (event) => {
  console.log('Validation completed:', event.duration, 'ms');
});
```

## Error Handling

### Plugin Loading Errors

```typescript
const result = await pluginManager.loadPlugin('plugin-id');

if (!result.success) {
  console.error('Plugin load failed:', result.error);
  console.log('Metrics:', result.metrics);
}
```

### Runtime Error Recovery

Plugins are isolated, so errors in one plugin don't affect others:

- **Timeout**: Plugin execution is terminated after timeout
- **Memory limit**: Plugin is stopped if memory limit exceeded
- **Security violation**: Plugin is immediately terminated
- **Runtime error**: Plugin is marked as unhealthy but system continues

## Testing Plugins

### Unit Testing

```javascript
const { createTestPluginManager, PluginDevUtils } = require('@claude-security/plugins');

describe('MyPlugin', () => {
  let pluginManager;
  
  beforeEach(async () => {
    pluginManager = createTestPluginManager(['./test-plugins']);
    await pluginManager.initialize();
  });
  
  afterEach(async () => {
    await pluginManager.cleanup();
  });
  
  it('should validate configuration', async () => {
    await pluginManager.loadPlugin('my-plugin');
    const results = await pluginManager.executeValidation(testConfig);
    expect(results[0].isValid).toBe(true);
  });
});
```

### Integration Testing

```javascript
const { createPluginManager } = require('@claude-security/plugins');

async function testPluginIntegration() {
  const manager = createPluginManager({
    pluginDirs: ['./dist/plugins']
  });
  
  await manager.initialize({ skipDiscovery: false });
  
  // Test plugin discovery
  const stats = manager.getStats();
  console.log('Discovered plugins:', stats.registry.totalPlugins);
  
  // Test plugin loading
  const loadResult = await manager.loadPlugin('my-plugin');
  console.log('Load result:', loadResult.success);
  
  await manager.cleanup();
}
```

## Best Practices

### Plugin Development

1. **Keep plugins focused**: Each plugin should have a single responsibility
2. **Handle errors gracefully**: Always catch and handle exceptions
3. **Validate inputs**: Check all parameters and configuration values
4. **Use semantic versioning**: Follow semver for plugin versions
5. **Document thoroughly**: Include clear documentation and examples

### Security Considerations

1. **Minimize permissions**: Request only necessary permissions
2. **Validate all inputs**: Never trust external data
3. **Use secure APIs**: Prefer plugin APIs over direct Node.js APIs
4. **Handle secrets properly**: Use secure storage for sensitive data
5. **Regular updates**: Keep plugins updated for security patches

### Performance Optimization

1. **Async operations**: Use async/await for I/O operations
2. **Resource cleanup**: Always clean up resources in cleanup method
3. **Efficient algorithms**: Use efficient algorithms for validation
4. **Cache results**: Cache expensive computations when possible
5. **Monitor memory**: Keep memory usage reasonable

## Troubleshooting

### Common Issues

#### Plugin Not Loading
```bash
# Check plugin manifest
cat plugin/package.json | jq .claudePlugin

# Check permissions
ls -la plugin/

# Enable debug logging
DEBUG=plugin:* npm start
```

#### Sandbox Errors
```javascript
// Check sandbox configuration
const config = pluginManager.getConfig();
console.log('Sandbox enabled:', config.security.enableSandbox);
console.log('Allowed modules:', config.security.allowedModules);
```

#### Memory Issues
```javascript
// Monitor memory usage
const stats = pluginManager.getStats();
console.log('Memory usage per plugin:', stats.loader.byState);

// Reduce memory limits if needed
const config = {
  security: { maxMemoryUsage: 64 } // Reduce from default 128MB
};
```

## Migration Guide

### From v0.x to v1.x

1. **Update manifest format**: Move plugin config to `claudePlugin` key in package.json
2. **Update API usage**: Replace direct Node.js API calls with plugin APIs
3. **Add security permissions**: Declare required permissions in manifest
4. **Update lifecycle methods**: Implement new `activate`/`deactivate` methods

### Plugin API Changes

```javascript
// Old (v0.x)
this.log('message');

// New (v1.x)
this.apis.logger.info('message');

// Old (v0.x)
const fs = require('fs');
fs.readFileSync('file.txt');

// New (v1.x)
const content = await this.apis.storage.get('file-content');
```

## Support and Community

- **Documentation**: [Plugin API Reference](./api-reference.md)
- **Examples**: [Plugin Examples](../examples/)
- **Issues**: [GitHub Issues](https://github.com/org/claude-security-plugins/issues)
- **Discussions**: [GitHub Discussions](https://github.com/org/claude-security-plugins/discussions)

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on contributing to the plugin system.

## License

This plugin system is licensed under the [MIT License](../LICENSE).