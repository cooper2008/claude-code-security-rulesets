# Template Extensibility System

The Claude Code Security Rulesets Generator includes a comprehensive template extensibility system that enables users to create, extend, and manage security templates with advanced features like inheritance, composition, and custom plugins.

## Table of Contents

1. [Overview](#overview)
2. [Core Features](#core-features)
3. [Getting Started](#getting-started)
4. [Template Inheritance](#template-inheritance)
5. [Template Composition](#template-composition)
6. [Custom Plugins](#custom-plugins)
7. [Extension Management](#extension-management)
8. [CLI Commands](#cli-commands)
9. [API Reference](#api-reference)
10. [Best Practices](#best-practices)
11. [Examples](#examples)
12. [Troubleshooting](#troubleshooting)

## Overview

The extensibility system addresses the key user need: **"how to leave the place for users easy to build their own customize template for security rulesets or add additional ruleset to existed rules template we had"**.

### Key Benefits

- **Template Inheritance**: Build hierarchical template structures (base → organization → team → project)
- **Safe Extensibility**: Add custom rules without modifying original templates
- **Plugin System**: Create custom validation and generation logic with safe sandboxing
- **Template Composition**: Merge multiple templates with conflict resolution
- **Version Compatibility**: Ensure extensions work across template versions
- **Developer Experience**: Interactive wizards and CLI tools for easy template creation

## Core Features

### 1. Template Inheritance Chain
```
Base Template (SOC2 Compliance)
├── Organization Template (Company Security Policies)
    ├── Team Template (Frontend Team Rules)
        ├── Project Template (React App Specific)
```

### 2. Extension Types
- **Inherit**: Copy all rules from parent template
- **Extend**: Add new rules to existing template
- **Override**: Replace specific rules in parent template
- **Compose**: Merge multiple templates together

### 3. Safe Plugin Execution
- VM-based sandboxing using Node.js VM2
- Memory and execution time limits
- Restricted module access
- Comprehensive security validation

### 4. Lifecycle Management
- Draft → Testing → Approved → Deployed → Archived
- Approval workflows and rollback capabilities
- Metrics and health monitoring
- Marketplace for sharing extensions

## Getting Started

### Installation

The extensibility system is included with Claude Code. Initialize it with:

```bash
# Initialize extensibility system
claude-code init --enable-extensibility

# Create your first custom template
claude-code create-template --interactive
```

### Basic Usage

```typescript
import { createExtensibilitySystem } from '@claude-code/templates/extensibility';

// Initialize the system
const system = await createExtensibilitySystem({
  storageRoot: './templates',
  enableMarketplace: true,
  enablePlugins: true
});

// Create a new template
const builder = system.getTemplateBuilder();
const template = await builder.startInteractiveBuilder();

// Apply extensions to existing template
const extensionManager = system.getExtensionManager();
const extendedTemplate = await extensionManager.applyExtensions(
  template, 
  context
);
```

## Template Inheritance

### Creating an Inherited Template

```typescript
const inheritanceEngine = system.getInheritanceEngine();

// Create template that inherits from enterprise-base
const childTemplate = await inheritanceEngine.createInheritedTemplate(
  'enterprise-base',
  {
    name: 'My Team Security Template',
    description: 'Extended template for my team',
    rules: {
      deny: ['console.log('],  // Additional rules
      allow: ['process.env.NODE_ENV']
    }
  },
  'extend'
);
```

### Inheritance Permissions

Control what can be modified in inherited templates:

```typescript
const inheritance = {
  permissions: {
    canOverrideRules: true,    // Allow rule modifications
    canAddRules: true,         // Allow new rules
    canRemoveRules: false,     // Prevent rule removal
    canModifyMetadata: true    // Allow metadata changes
  }
}
```

### CLI Usage

```bash
# Create inherited template
claude-code extend-template --template enterprise-base --type inherit

# Interactive inheritance wizard
claude-code extend-template --interactive
```

## Template Composition

### Composing Multiple Templates

```typescript
const composer = system.getComposer();

const composedTemplate = await composer.composeTemplates(
  [baseTemplate, reactTemplate, nodeTemplate],
  {
    rules: 'deep_merge',       // How to merge rules
    arrays: 'unique_merge',    // How to merge arrays
    objects: 'deep_merge',     // How to merge objects
    parameters: 'validate_merge'
  },
  {
    defaultStrategy: 'merge',  // Conflict resolution
    logConflicts: true,
    interactive: false
  },
  context
);
```

### Merge Strategies

- **deep_merge**: Intelligently combine all rules
- **replace**: Last template wins
- **append**: Add all rules together
- **unique_merge**: Merge and remove duplicates

### Conflict Resolution

- **error**: Stop on conflicts
- **warn**: Log conflicts and continue
- **merge**: Attempt to merge conflicting rules
- **override**: Last template takes precedence

## Custom Plugins

### Creating a Validation Plugin

```javascript
// my-validator.js
async function main(context) {
  const { template, apis } = context;
  const { logger } = apis;
  
  const errors = [];
  const warnings = [];
  
  // Custom validation logic
  if (template.rules.deny && !template.rules.deny.includes('eval(')) {
    errors.push({
      type: 'security',
      severity: 'critical',
      message: 'Templates must deny eval() for security'
    });
  }
  
  return {
    success: true,
    data: {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  };
}

module.exports = { main };
```

### Plugin Manifest

```json
{
  "id": "my-validator",
  "name": "My Custom Validator",
  "version": "1.0.0",
  "description": "Custom security validation",
  "author": "Your Name",
  "categories": ["validation"],
  "capabilities": [
    {
      "type": "validate",
      "name": "Custom Validation",
      "inputs": ["template"],
      "outputs": ["validation-result"]
    }
  ],
  "permissions": ["template:read", "template:validate"]
}
```

### Installing Plugins

```bash
# Install plugin from file
claude-code plugins install my-validator.js --config my-config.json

# Create plugin with wizard
claude-code plugins create --type validation

# List installed plugins
claude-code plugins list --metrics
```

## Extension Management

### Extension Lifecycle

```typescript
const extensionManager = system.getExtensionManager();

// Create extension
const extension = await extensionManager.createExtension(
  'target-template-id',
  {
    name: 'My Extension',
    type: 'extend',
    rules: { deny: ['dangerous-pattern'] },
    priority: 100
  },
  context
);

// Manage lifecycle
await extensionManager.transitionExtensionState(
  extension.id,
  'testing',
  'Ready for testing'
);

// Deploy extension
await extensionManager.deployExtension(
  extension.id,
  {
    environment: 'production',
    rolloutStrategy: 'gradual',
    rolloutPercentage: 25
  }
);
```

### Extension States

1. **draft**: Under development
2. **testing**: Being validated
3. **approved**: Ready for deployment
4. **deployed**: Active in environment
5. **deprecated**: Being phased out
6. **archived**: No longer active

## CLI Commands

### Template Creation

```bash
# Interactive template creation
claude-code create-template --interactive

# Template from configuration
claude-code create-template --config template.json

# Quick template creation
claude-code create-template --name "My Template" --type new
```

### Template Extension

```bash
# List available templates
claude-code extend-template --list

# Extend specific template
claude-code extend-template --template react-webapp --type inherit

# Create extension
claude-code create-extended-template --target base-template
```

### Plugin Management

```bash
# List plugins
claude-code plugins list --category validation

# Install plugin
claude-code plugins install security-validator.js

# Create plugin
claude-code plugins create --name "My Plugin" --type generation

# Test plugin
claude-code plugins test my-plugin --template test-template.json

# Plugin information
claude-code plugins info security-validator
```

## API Reference

### TemplateExtensibilitySystem

Main orchestration class that coordinates all extensibility features.

```typescript
class TemplateExtensibilitySystem {
  // Initialize system
  async initialize(): Promise<void>
  
  // Get component managers
  getInheritanceEngine(): TemplateInheritanceEngine
  getComposer(): TemplateComposer
  getValidator(): TemplateValidator
  getPluginManager(): TemplatePluginManager
  getExtensionManager(): TemplateExtensionManager
  getTemplateBuilder(): CustomTemplateBuilder
  
  // System health and cleanup
  async getSystemHealth(): Promise<SystemHealth>
  async cleanup(): Promise<void>
}
```

### CustomTemplateBuilder

Interactive and programmatic template creation.

```typescript
class CustomTemplateBuilder {
  // Interactive wizard
  async startInteractiveBuilder(): Promise<ExtendableTemplate>
  
  // Build from configuration
  async buildFromConfig(config: TemplateBuilderConfig): Promise<ExtendableTemplate>
  
  // Build from project analysis
  async generateFromAnalysis(analysis: ProjectAnalysis): Promise<ExtendableTemplate>
  
  // Guided building
  async buildWithGuidance(
    context: TemplateBuildContext, 
    guidance: TemplateGuidance
  ): Promise<ExtendableTemplate>
}
```

### TemplatePluginManager

Plugin registration and execution.

```typescript
class TemplatePluginManager {
  // Plugin management
  async registerPlugin(
    manifest: TemplatePluginManifest, 
    code: string, 
    config?: Record<string, unknown>
  ): Promise<void>
  
  async unregisterPlugin(pluginId: string): Promise<boolean>
  
  // Plugin execution
  async executeValidationPlugins(
    template: ExtendableTemplate, 
    context: TemplateBuildContext, 
    pluginIds?: string[]
  ): Promise<TemplateValidationResult>
  
  async executeGenerationPlugins(
    template: ExtendableTemplate, 
    context: TemplateBuildContext, 
    pluginIds?: string[]
  ): Promise<ClaudeCodeConfiguration>
}
```

## Best Practices

### Template Design

1. **Start with Base Templates**: Build a solid foundation with base templates
2. **Use Clear Naming**: Follow consistent naming conventions
3. **Document Rules**: Provide clear descriptions for all rules
4. **Version Properly**: Use semantic versioning for compatibility

### Plugin Development

1. **Keep Plugins Focused**: Each plugin should have a single, clear purpose
2. **Handle Errors Gracefully**: Always include proper error handling
3. **Use Logging**: Log important events for debugging
4. **Test Thoroughly**: Test plugins with various template configurations

### Security Considerations

1. **Validate Input**: Always validate plugin inputs
2. **Limit Permissions**: Use minimal required permissions
3. **Sandbox Execution**: Leverage built-in sandboxing
4. **Review Custom Code**: Review all custom plugins before deployment

### Performance Optimization

1. **Cache Results**: Cache expensive validation results
2. **Lazy Loading**: Load plugins and templates on demand
3. **Batch Operations**: Process multiple templates together
4. **Monitor Resources**: Track memory and CPU usage

## Examples

### Complete Template Inheritance Example

```typescript
// 1. Create base enterprise template
const baseTemplate = {
  id: 'enterprise-base',
  name: 'Enterprise Security Base',
  rules: {
    deny: ['eval(', 'innerHTML ='],
    allow: ['console.log(']
  },
  inheritance: {
    level: 'base',
    permissions: { canAddRules: true, canOverrideRules: false }
  }
};

// 2. Create team-specific extension
const teamTemplate = await inheritanceEngine.createInheritedTemplate(
  'enterprise-base',
  {
    name: 'Frontend Team Template',
    rules: {
      deny: ['dangerouslySetInnerHTML'],  // Additional React-specific rules
      allow: ['React.', 'useState']       // React patterns
    }
  },
  'extend'
);

// 3. Create project-specific template
const projectTemplate = await inheritanceEngine.createInheritedTemplate(
  teamTemplate.id,
  {
    name: 'My React Project',
    rules: {
      deny: ['console.log(']  // No logging in this project
    }
  },
  'override'
);
```

### Plugin Development Example

```javascript
// advanced-security-plugin.js
async function main(context) {
  const { template, buildContext } = context;
  
  // Analyze template for security patterns
  const securityIssues = [];
  
  // Check for XSS vulnerabilities
  const hasXSSProtection = template.rules.deny?.some(rule => 
    rule.includes('innerHTML') || rule.includes('dangerouslySetInnerHTML')
  );
  
  if (!hasXSSProtection) {
    securityIssues.push({
      type: 'xss',
      severity: 'high',
      message: 'Template lacks XSS protection rules'
    });
  }
  
  // Generate additional security rules
  const additionalRules = {
    deny: [],
    allow: []
  };
  
  if (buildContext.environment === 'production') {
    additionalRules.deny.push('debugger', 'console.debug(');
  }
  
  return {
    success: true,
    data: {
      isValid: securityIssues.length === 0,
      errors: securityIssues,
      generatedRules: additionalRules
    }
  };
}

module.exports = { main };
```

### Template Composition Example

```typescript
// Compose multiple specialized templates
const webSecurityTemplate = await composer.composeTemplates(
  [
    enterpriseBaseTemplate,    // Base security rules
    reactWebappTemplate,       // React-specific rules
    apiSecurityTemplate,       // API security rules
    complianceTemplate         // SOC2/HIPAA rules
  ],
  {
    rules: 'deep_merge',
    arrays: 'unique_merge',
    objects: 'deep_merge'
  },
  {
    defaultStrategy: 'merge',
    logConflicts: true
  },
  buildContext
);
```

## Troubleshooting

### Common Issues

#### Plugin Execution Fails

**Symptoms**: Plugin throws errors during execution
**Solutions**:
- Check plugin syntax and module exports
- Verify plugin permissions match requirements
- Review sandbox restrictions
- Check memory and timeout limits

#### Template Inheritance Loops

**Symptoms**: Circular inheritance detected error
**Solutions**:
- Review inheritance chain for cycles
- Use inheritance tree visualization
- Implement proper dependency tracking

#### Rule Conflicts in Composition

**Symptoms**: Unexpected rule behavior after composition
**Solutions**:
- Use composition diff to identify conflicts
- Adjust merge strategy
- Implement custom conflict resolution
- Review rule priorities

#### Performance Issues

**Symptoms**: Slow template processing or plugin execution
**Solutions**:
- Enable caching for validation results
- Reduce plugin complexity
- Use batch processing for multiple templates
- Monitor memory usage

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Set debug environment
export DEBUG=claude-code:extensibility:*

# Run with verbose logging
claude-code create-template --interactive --verbose
```

### Health Monitoring

```typescript
// Check system health
const health = await system.getSystemHealth();

if (health.status !== 'healthy') {
  console.log('System issues detected:', health.components);
  
  // Check individual components
  const pluginHealth = await pluginManager.getAllPluginsHealth();
  const extensionStats = extensionManager.listExtensions();
}
```

## Support and Contributing

### Getting Help

- Check the [troubleshooting guide](#troubleshooting)
- Review [examples](#examples) for common patterns
- Join the community discussions
- File issues on GitHub

### Contributing

1. **Templates**: Share useful templates in the marketplace
2. **Plugins**: Contribute validation and generation plugins
3. **Documentation**: Improve guides and examples
4. **Testing**: Help test new features and report bugs

### Plugin Marketplace

Share your plugins with the community:

```bash
# Publish plugin to marketplace
claude-code plugins publish my-plugin.js \
  --name "Advanced Security Validator" \
  --description "Comprehensive security validation" \
  --license MIT
```

---

The template extensibility system provides a powerful foundation for customizing Claude Code security rulesets while maintaining safety, compatibility, and ease of use. Start with the basic inheritance and composition features, then explore plugins and advanced extensions as your needs grow.