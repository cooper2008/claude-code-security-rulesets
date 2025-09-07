# Template Extensibility Quick Reference

This guide provides quick examples and commands for the Claude Code Template Extensibility System.

## Quick Start

### Initialize Extensibility System
```bash
claude-code init --enable-extensibility
```

### Create Your First Custom Template
```bash
claude-code create-template --interactive
```

## CLI Commands Cheat Sheet

### Template Creation
```bash
# Interactive wizard
claude-code create-template --interactive

# From configuration file
claude-code create-template --config template.json

# Quick template with basic options
claude-code create-template --name "My Template" --description "Custom rules"
```

### Template Extension
```bash
# List available templates
claude-code extend-template --list

# Inherit from existing template
claude-code extend-template --template enterprise-base --type inherit

# Create extension for existing template
claude-code create-extended-template --target react-webapp --name "My Extension"
```

### Plugin Management
```bash
# List all plugins
claude-code plugins list

# Install plugin
claude-code plugins install security-validator.js

# Create new plugin
claude-code plugins create --name "My Validator" --type validation

# Test plugin
claude-code plugins test my-plugin

# Get plugin details
claude-code plugins info security-validator

# Enable/disable plugins
claude-code plugins enable my-plugin
claude-code plugins disable my-plugin
```

## API Quick Examples

### Basic System Setup
```typescript
import { createExtensibilitySystem } from '@claude-code/templates/extensibility';

const system = await createExtensibilitySystem({
  storageRoot: './my-templates',
  enableMarketplace: true,
  enablePlugins: true
});
```

### Create Template with Inheritance
```typescript
const inheritanceEngine = system.getInheritanceEngine();

const childTemplate = await inheritanceEngine.createInheritedTemplate(
  'parent-template-id',
  {
    name: 'My Custom Template',
    rules: {
      deny: ['eval(', 'innerHTML ='],
      allow: ['console.log(']
    }
  },
  'extend'
);
```

### Compose Multiple Templates
```typescript
const composer = system.getComposer();

const composedTemplate = await composer.composeTemplates(
  [baseTemplate, frameworkTemplate, complianceTemplate],
  { rules: 'deep_merge', arrays: 'unique_merge' },
  { defaultStrategy: 'merge', logConflicts: true },
  context
);
```

### Register and Execute Plugins
```typescript
const pluginManager = system.getPluginManager();

// Register plugin
await pluginManager.registerPlugin(manifest, pluginCode, config);

// Execute validation plugins
const results = await pluginManager.executeValidationPlugins(
  template, 
  context, 
  ['my-validator']
);
```

## Template Structure Examples

### Basic Template
```json
{
  "id": "my-template",
  "name": "My Security Template",
  "category": "security",
  "rules": {
    "deny": ["eval(", "innerHTML ="],
    "allow": ["console.log("]
  },
  "description": "Custom security rules",
  "version": "1.0.0",
  "inheritance": {
    "level": "user",
    "extensionType": "inherit",
    "permissions": {
      "canAddRules": true,
      "canOverrideRules": false
    }
  }
}
```

### Template with Parameters
```json
{
  "id": "configurable-template",
  "name": "Configurable Template",
  "parameters": [
    {
      "name": "environment",
      "type": "string",
      "description": "Target environment",
      "required": true,
      "defaultValue": "production"
    },
    {
      "name": "strict_mode",
      "type": "boolean", 
      "description": "Enable strict validation",
      "required": false,
      "defaultValue": true
    }
  ],
  "rules": {
    "deny": ["eval("],
    "allow": ["process.env.NODE_ENV"]
  }
}
```

## Plugin Examples

### Simple Validation Plugin
```javascript
// manifest.json
{
  "id": "simple-validator",
  "name": "Simple Validator",
  "version": "1.0.0",
  "categories": ["validation"],
  "capabilities": [
    {
      "type": "validate",
      "name": "Basic Validation",
      "inputs": ["template"],
      "outputs": ["validation-result"]
    }
  ]
}

// plugin.js
async function main(context) {
  const { template, apis } = context;
  const { logger } = apis;
  
  const errors = [];
  
  if (!template.rules.deny?.includes('eval(')) {
    errors.push({
      type: 'security',
      severity: 'critical',
      message: 'Template must deny eval()'
    });
  }
  
  return {
    success: true,
    data: {
      isValid: errors.length === 0,
      errors
    }
  };
}

module.exports = { main };
```

### Rule Generation Plugin
```javascript
// Generation plugin example
async function main(context) {
  const { template, buildContext } = context;
  
  const additionalRules = {
    deny: [],
    allow: []
  };
  
  // Environment-specific rules
  if (buildContext.environment === 'production') {
    additionalRules.deny.push('console.log(', 'debugger');
  }
  
  // Framework-specific rules
  if (template.tags?.includes('react')) {
    additionalRules.deny.push('dangerouslySetInnerHTML');
    additionalRules.allow.push('useState', 'useEffect');
  }
  
  return {
    success: true,
    data: additionalRules
  };
}
```

## Common Patterns

### Template Inheritance Chain
```typescript
// Base → Organization → Team → Project
const baseTemplate = 'enterprise-base';
const orgTemplate = await inheritanceEngine.createInheritedTemplate(
  baseTemplate, 
  { name: 'Acme Corp Security' }
);
const teamTemplate = await inheritanceEngine.createInheritedTemplate(
  orgTemplate.id,
  { name: 'Frontend Team Rules' }
);
const projectTemplate = await inheritanceEngine.createInheritedTemplate(
  teamTemplate.id,
  { name: 'React App Security' }
);
```

### Multi-Framework Composition
```typescript
const webAppTemplate = await composer.composeTemplates([
  templates.get('enterprise-base'),    // Base security
  templates.get('react-webapp'),       // React rules
  templates.get('nodejs-api'),         // Node.js rules
  templates.get('database-security')   // DB security
]);
```

### Custom Extension with Conditions
```typescript
const extension = await extensionManager.createExtension(
  'target-template',
  {
    name: 'Conditional Extension',
    rules: { deny: ['unsafe-pattern'] },
    conditions: [
      {
        type: 'environment',
        expression: 'environment',
        value: 'production',
        operator: '=='
      }
    ]
  }
);
```

## Configuration Examples

### System Configuration
```typescript
const system = await createExtensibilitySystem({
  storageRoot: './templates-extensibility',
  enableMarketplace: true,
  enablePlugins: true,
  sandboxTimeout: 30000,
  maxMemoryUsage: 256,
  autoApproval: false,
  enableMetrics: true
});
```

### Plugin Configuration
```json
{
  "strictMode": true,
  "checkDeprecated": true,
  "customPatterns": [
    {
      "pattern": "dangerous-function\\(",
      "severity": "error",
      "message": "Dangerous function usage detected"
    }
  ],
  "complianceFrameworks": ["OWASP", "SOC2"],
  "riskTolerance": "low"
}
```

### Merge Strategy Configuration
```typescript
const mergeStrategy = {
  rules: 'deep_merge',      // Combine all rules intelligently
  arrays: 'unique_merge',   // Merge arrays and remove duplicates
  objects: 'deep_merge',    // Deep merge object properties
  parameters: 'validate_merge' // Merge and validate parameters
};

const conflictResolution = {
  defaultStrategy: 'merge', // How to handle conflicts
  interactive: false,       // Don't prompt user
  logConflicts: true        // Log conflicts for review
};
```

## Debugging Tips

### Enable Debug Logging
```bash
export DEBUG=claude-code:extensibility:*
claude-code create-template --verbose
```

### Check System Health
```typescript
const health = await system.getSystemHealth();
console.log('System status:', health.status);
console.log('Component details:', health.components);
```

### Plugin Debugging
```javascript
// Add logging to plugins
async function main(context) {
  const { apis } = context;
  const { logger } = apis;
  
  logger.debug('Plugin starting with context:', context);
  
  try {
    // Plugin logic here
    const result = performValidation(context);
    logger.info('Plugin completed successfully');
    return result;
  } catch (error) {
    logger.error('Plugin failed:', error);
    throw error;
  }
}
```

### Template Validation
```typescript
const validator = system.getValidator();
const result = await validator.validateTemplate(template, context);

if (!result.isValid) {
  console.log('Validation errors:', result.errors);
  console.log('Validation warnings:', result.warnings);
}
```

## Performance Optimization

### Caching
```typescript
// Templates are cached automatically, but you can clear cache
validator.clearCache();

// Plugin results can be cached at application level
const cache = new Map();
const cacheKey = `${template.id}-${context.environment}`;
if (cache.has(cacheKey)) {
  return cache.get(cacheKey);
}
```

### Batch Processing
```typescript
// Process multiple templates together
const templates = [template1, template2, template3];
const results = await Promise.all(
  templates.map(template => 
    pluginManager.executeValidationPlugins(template, context)
  )
);
```

### Resource Monitoring
```typescript
const metrics = pluginManager.getAllMetrics();
Object.entries(metrics).forEach(([pluginId, metric]) => {
  if (metric.avgExecutionTime > 5000) {
    console.warn(`Plugin ${pluginId} is slow: ${metric.avgExecutionTime}ms`);
  }
});
```

## Error Handling

### Common Error Patterns
```typescript
try {
  const template = await builder.buildFromConfig(config);
} catch (error) {
  if (error.name === 'ValidationError') {
    console.log('Template validation failed:', error.message);
  } else if (error.name === 'InheritanceError') {
    console.log('Inheritance issue:', error.message);
  } else {
    console.log('Unexpected error:', error);
  }
}
```

### Plugin Error Handling
```javascript
async function main(context) {
  try {
    // Plugin logic
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      metrics: { duration: Date.now() - startTime }
    };
  }
}
```

This quick reference covers the most common use cases and patterns for the Claude Code Template Extensibility System. For detailed information, see the full [Template Extensibility Documentation](./TEMPLATE_EXTENSIBILITY.md).