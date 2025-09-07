# Frequently Asked Questions (FAQ)

Common questions and answers about the Claude Code Security Rulesets Generator.

## 📋 Table of Contents

1. [General Questions](#general-questions)
2. [Installation and Setup](#installation-and-setup)
3. [Templates and Configuration](#templates-and-configuration)
4. [Security and Permissions](#security-and-permissions)
5. [Enterprise Deployment](#enterprise-deployment)
6. [Performance and Optimization](#performance-and-optimization)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Usage](#advanced-usage)

## 🤔 General Questions

### What is the Claude Code Security Rulesets Generator?
The Claude Code Security Rulesets Generator is a comprehensive CLI tool and enterprise platform for generating, validating, and deploying Claude Code security configurations. It provides centralized rule management, template extensibility, and automated deployment to 1000+ developers.

### How does it work with Claude Code?
The tool generates standard Claude Code `settings.json` files that Claude Code reads automatically. It leverages Claude Code's native deny enforcement system for zero-bypass security.

### Is this an official Anthropic tool?
This is a community-built tool that works with Claude Code's existing configuration system. It does not require any modifications to Claude Code itself.

### What's the difference between deny, allow, and ask rules?
- **Deny rules**: Block actions without user confirmation (zero-bypass enforcement)
- **Allow rules**: Permit actions without user confirmation  
- **Ask rules**: Require user approval before proceeding

### Can I use this for personal projects?
Yes! While designed for enterprise use, it works perfectly for individual developers and small teams. Start with the `development` template and customize as needed.

## 💾 Installation and Setup

### What are the system requirements?
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Operating System**: macOS, Linux, or Windows 10+
- **Memory**: 512MB available RAM (1GB recommended)
- **Storage**: 100MB free disk space (1GB for enterprise)

### How do I install the tool?
```bash
# Global installation (recommended)
npm install -g claude-code-security-rulesets

# Verify installation
claude-security --version
```

### The installation failed. What should I do?
1. Check Node.js version: `node --version` (must be 18.0.0+)
2. Clear npm cache: `npm cache clean --force`
3. Try with sudo (if on macOS/Linux): `sudo npm install -g claude-code-security-rulesets`
4. Check our [troubleshooting guide](TROUBLESHOOTING.md)

### How do I update to the latest version?
```bash
# Update globally
npm update -g claude-code-security-rulesets

# Check version
claude-security --version
```

### Can I install it locally in my project?
Yes! You can install it as a dev dependency:
```bash
npm install --save-dev claude-code-security-rulesets

# Use via npx
npx claude-security --help

# Add to package.json scripts
{
  "scripts": {
    "security": "claude-security"
  }
}
```

## 🎨 Templates and Configuration

### What templates are available out of the box?
- **development**: Balanced security for local development
- **production**: Enterprise-grade security for production
- **soc2**: SOC 2 Type II compliance
- **hipaa**: Healthcare compliance with PHI protection  
- **pci-dss**: Payment card industry compliance
- **maximum-security**: Strictest possible security
- **enterprise**: Customizable enterprise template

### How do I create a custom template?
```bash
# Interactive template builder (recommended)
claude-security create-template --interactive

# From configuration file
claude-security create-template --config my-template.json

# Extend existing template
claude-security extend-template --template production --name "Custom Production"
```

### Can I modify built-in templates?
You cannot modify built-in templates directly, but you can:
1. Extend them with additional rules
2. Create custom templates based on them
3. Override specific rules in project configurations

### How do I add custom rules to an existing template?
```bash
# Extend a template with additional rules
claude-security extend-template --template production \
  --add-rules additional-rules.json \
  --name "Enhanced Production"
```

### What's the difference between template parameters and configuration?
- **Template parameters**: Variables used during template generation (e.g., project path, allowed tools)
- **Configuration**: The final generated settings that Claude Code uses

### How do I use template parameters?
```bash
# Pass parameters during generation
claude-security generate --template enterprise \
  --parameters "projectPath=/app,team=backend,environment=production"
```

## 🔒 Security and Permissions

### Are deny rules really zero-bypass?
Yes! The tool leverages Claude Code's native deny enforcement system. When Claude Code loads a configuration with deny rules, those actions are blocked without any user override option.

### How do I test if my security rules work?
1. Generate a configuration: `claude-security generate --template production`
2. Validate it: `claude-security validate .claude/settings.json`
3. Test with scenarios: `claude-security test .claude/settings.json`
4. Try accessing blocked resources in Claude Code to verify enforcement

### What's the priority order when rules conflict?
1. **Deny rules** always take precedence (most restrictive)
2. **Allow rules** override ask rules for the same pattern
3. **Ask rules** are the default for unspecified patterns

The tool automatically detects conflicts and can resolve them:
```bash
claude-security check-conflicts config.json --resolve --strategy strict-deny
```

### How do I protect environment variables and secrets?
Built-in templates include comprehensive secret protection:
```json
"deny": [
  "**/.env*",           // Environment files
  "**/secret*/**",      // Secret directories  
  "**/credential*/**",  // Credential files
  "**/*password*",      // Password files
  "**/*key*",           // Key files
  "**/private*/**"      // Private directories
]
```

### Can I allow access to specific secret files?
Yes, but use carefully. More specific allow rules can override broader deny rules:
```json
"deny": ["**/secret*/**"],
"allow": ["Read(**/secret*/public/***)"]  // Allow public secrets only
```

### How do I handle different environments (dev/staging/prod)?
Use environment-specific templates or parameters:
```bash
# Generate for specific environment
claude-security generate --template production --environment staging

# Use different templates per environment
claude-security generate --template development  # for dev
claude-security generate --template production   # for prod
```

## 🏢 Enterprise Deployment

### How do I deploy to 1000+ developers?
The enterprise deployment system supports multiple strategies:
```bash
# Deploy to engineering department
claude-security enterprise-deploy config.json \
  --filters "department=engineering" \
  --strategy rolling \
  --parallelism 50
```

### What deployment strategies are available?
- **Immediate**: Deploy to all targets at once
- **Canary**: Deploy to small group first, then expand
- **Rolling**: Deploy in batches with delays
- **Blue-Green**: Maintain two environments and switch
- **Hybrid**: Combine multiple strategies

### How do I target specific developers or teams?
Use filter expressions:
```bash
# Target by department and role
--filters "department=engineering AND role=developer"

# Target specific teams
--filters "team=frontend OR team=backend"

# Exclude contractors
--filters "department=engineering" --exclude "contractor"
```

### What if my organization doesn't have enterprise APIs?
The tool supports multiple distribution methods that don't require Claude Code enterprise APIs:
- **NPM packages**: Distribute via private npm registry
- **Git repositories**: Deploy via Git hooks and submodules  
- **SSH deployment**: Direct deployment to developer machines
- **CI/CD integration**: Deploy through existing pipelines
- **Configuration management**: Use Ansible, Puppet, Chef

### How do I integrate with LDAP/Active Directory?
Configure enterprise directory integration:
```json
{
  "enterprise": {
    "directory": {
      "type": "ldap",
      "server": "ldap://company.com",
      "baseDN": "dc=company,dc=com",
      "userDN": "ou=users,dc=company,dc=com"
    }
  }
}
```

### How do I monitor enterprise deployments?
```bash
# Monitor active deployment
claude-security enterprise-deploy --monitor --deployment-id abc123

# Generate deployment report
claude-security enterprise-deploy --report --format json

# Check deployment health
claude-security enterprise-health-check
```

### Can I rollback deployments?
Yes, the system automatically creates snapshots before deployments:
```bash
# Rollback latest deployment
claude-security enterprise-rollback

# Emergency rollback with high priority
claude-security enterprise-rollback --emergency --deployment-id abc123
```

## ⚡ Performance and Optimization

### What are the performance targets?
- **Validation time**: <100ms for security rule processing
- **CLI response time**: <200ms for command execution  
- **Cache hit rate**: >90% for repeated operations
- **Memory usage**: <512MB for typical operations
- **Deployment time**: <2 minutes for 1000 targets

### How do I improve performance?
1. **Enable caching**: Significantly speeds up repeated operations
2. **Optimize rule patterns**: Use specific patterns instead of broad wildcards
3. **Adjust parallelism**: Fine-tune for your system capabilities
4. **Use built-in templates**: Pre-optimized and cached

### Why are my CLI commands slow?
1. Check if you're running comprehensive validation (use basic validation for speed)
2. Verify caching is enabled in your configuration
3. Consider if you have many custom plugins enabled
4. Run performance analysis: `claude-security validate config.json --performance`

### How do I benchmark my configuration?
```bash
# Run comprehensive benchmarks
claude-security benchmark

# Test specific categories
claude-security benchmark --category validation
claude-security benchmark --category cli
```

### Can I use this with large template libraries?
Yes! The system is designed to handle hundreds of templates efficiently through:
- Smart caching strategies
- Lazy loading of templates
- Optimized search and indexing
- Performance monitoring and optimization

## 🔧 Troubleshooting

### Claude Code isn't loading my configuration
1. Check file location: Configuration should be at `.claude/settings.json`
2. Validate JSON syntax: `claude-security validate .claude/settings.json`
3. Restart Claude Code after making changes
4. Check Claude Code's configuration hierarchy (enterprise settings may override)

### I'm getting "Template not found" errors
1. List available templates: `claude-security list-templates`
2. Check template name spelling and case sensitivity
3. For custom templates, verify they're in the correct directory
4. Try absolute path: `claude-security generate --template /full/path/to/template.json`

### Validation is failing but I don't see errors
Use verbose mode for detailed output:
```bash
claude-security validate config.json --verbose --comprehensive
```

### My custom template isn't working
1. Validate template syntax: `claude-security validate template.json`
2. Check parameter definitions and usage
3. Test template generation: `claude-security generate --template my-template --dry-run`
4. Review the [template creation guide](docs/TEMPLATE_GUIDE.md)

### Enterprise deployment is failing
1. Check connectivity: `claude-security enterprise-targets test`
2. Verify permissions for target systems
3. Check filter expressions: `claude-security enterprise-targets list --filters "your-filter"`
4. Try with smaller parallelism: `--parallelism 5`
5. Use dry-run first: `--dry-run`

### Performance is poor
1. Enable caching in configuration
2. Reduce validation level for development
3. Check system resources (memory, CPU)
4. Run performance diagnostics: `claude-security doctor --performance`

### Plugin installation failed
1. Check plugin file permissions
2. Verify plugin syntax and structure  
3. Test plugin before installation: `claude-security plugins test plugin.js`
4. Check plugin dependencies and compatibility

## 🚀 Advanced Usage

### Can I use this programmatically?
Yes! The tool provides a Node.js API:
```javascript
const { ClaudeSecurityGenerator } = require('claude-code-security-rulesets');

const generator = new ClaudeSecurityGenerator();
const config = await generator.generate({ template: 'production' });
```

### How do I integrate with CI/CD pipelines?
Add validation and deployment steps to your pipeline:
```yaml
# GitHub Actions example
- name: Validate Security Configuration  
  run: claude-security validate .claude/settings.json --comprehensive
  
- name: Deploy Security Configuration
  run: claude-security enterprise-deploy .claude/settings.json --filters "team=${{ github.repository.name }}"
```

### Can I create custom plugins?
Yes! The plugin system supports:
- **Validation plugins**: Custom validation logic
- **Generation plugins**: Custom rule generation  
- **Transformation plugins**: Post-generation modifications

```bash
# Create plugin from template
claude-security plugins create --type validation --name "My Validator"
```

### How do I handle multiple projects with different requirements?
1. **Project-specific configurations**: Use `.claude-security.json` in each project
2. **Template inheritance**: Create base templates and extend for each project
3. **Environment variables**: Use environment-specific parameters
4. **Custom templates**: Create templates for each project type

### Can I export/import configurations?
```bash
# Export templates
claude-security list-templates --format json --output templates.json

# Import from another system
claude-security create-template --config imported-template.json
```

### How do I handle compliance requirements?
1. Use compliance-specific templates (`soc2`, `hipaa`, `pci-dss`)
2. Validate against frameworks: `claude-security validate config.json --compliance soc2`
3. Generate compliance reports: `claude-security enterprise-report --compliance soc2`
4. Implement approval workflows for compliance changes

### Is there a REST API available?
The tool focuses on CLI and programmatic APIs. For REST API needs, consider:
1. Using the Node.js API to build your own REST endpoints
2. Integrating with existing configuration management systems
3. Using webhook-based deployment strategies

## 📞 Getting More Help

### Where can I find more documentation?
- **[Getting Started](GETTING_STARTED.md)**: Initial setup and basic usage
- **[User Guide](USER_GUIDE.md)**: Comprehensive feature documentation  
- **[CLI Reference](CLI_REFERENCE.md)**: Complete command reference
- **[Enterprise Guide](ENTERPRISE_GUIDE.md)**: Enterprise deployment strategies
- **[Architecture](../ARCHITECTURE.md)**: Technical architecture details

### How do I report bugs or request features?
- **GitHub Issues**: [Report bugs and request features](https://github.com/your-org/claude-code-security-rulesets/issues)
- **GitHub Discussions**: [Ask questions and share ideas](https://github.com/your-org/claude-code-security-rulesets/discussions)

### Where can I get support?
- **Community Support**: GitHub Discussions and Issues
- **Enterprise Support**: enterprise-support@your-org.com
- **Emergency Support**: +1-800-SECURITY (24/7 for enterprise customers)
- **Slack Channel**: #claude-security-support

### How do I contribute to the project?
See our [Contributing Guide](../CONTRIBUTING.md) for information on:
- Code contributions
- Documentation improvements
- Bug reports and feature requests
- Community support

---

**Still have questions?** Check our [troubleshooting guide](TROUBLESHOOTING.md) or reach out to the community on [GitHub Discussions](https://github.com/your-org/claude-code-security-rulesets/discussions).