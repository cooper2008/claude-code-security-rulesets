# Getting Started with Claude Code Security Rulesets Generator

This guide will help you get started with the Claude Code Security Rulesets Generator, from installation to your first deployment.

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Basic Usage](#basic-usage)
5. [Configuration](#configuration)
6. [Your First Template](#your-first-template)
7. [Enterprise Deployment](#enterprise-deployment)
8. [Next Steps](#next-steps)

## 🖥️ System Requirements

### Minimum Requirements
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Operating System**: macOS, Linux, or Windows 10+
- **Memory**: 512MB available RAM
- **Storage**: 100MB free disk space

### Recommended Requirements
- **Node.js**: Version 20.0.0 or higher
- **npm**: Version 10.0.0 or higher
- **Memory**: 1GB available RAM
- **Storage**: 1GB free disk space (for enterprise features)

### For Enterprise Deployment
- **Network**: SSH access to target machines OR
- **Registry**: Access to private NPM registry OR
- **Git**: Access to organization's Git repositories
- **LDAP/AD**: For user directory integration (optional)

## 📦 Installation

### Option 1: NPM Installation (Recommended)

```bash
# Global installation (recommended for CLI usage)
npm install -g claude-code-security-rulesets

# Verify installation
claude-security --version

# Check available commands
claude-security --help
```

### Option 2: Local Project Installation

```bash
# Install in your project
npm install --save-dev claude-code-security-rulesets

# Use via npx
npx claude-security --help

# Add to package.json scripts
{
  "scripts": {
    "security": "claude-security",
    "security:generate": "claude-security generate",
    "security:validate": "claude-security validate"
  }
}
```

### Option 3: From Source

```bash
# Clone the repository
git clone https://github.com/your-org/claude-code-security-rulesets.git
cd claude-code-security-rulesets

# Install dependencies
npm install

# Build the project
npm run build

# Link globally for development
npm link
```

## 🚀 Quick Start

### 1. Generate Your First Security Configuration

```bash
# Create a basic development configuration
claude-security generate --template development --output .claude/settings.json

# View the generated configuration
cat .claude/settings.json
```

**Expected Output:**
```json
{
  "permissions": {
    "deny": [
      "**/.env*",
      "**/secret*/**",
      "**/credential*/**",
      "Execute(sudo)"
    ],
    "allow": [
      "Read(/project/**)",
      "Execute(npm)",
      "Execute(git)",
      "Network(npmjs.org)",
      "Network(github.com)"
    ],
    "ask": [
      "Execute(git push)",
      "Network(*)"
    ]
  },
  "metadata": {
    "version": "1.0.0",
    "templateId": "development",
    "timestamp": 1703097600000
  }
}
```

### 2. Validate the Configuration

```bash
# Validate the generated configuration
claude-security validate .claude/settings.json

# Check for rule conflicts
claude-security check-conflicts .claude/settings.json
```

### 3. Test with Claude Code

1. Open Claude Code in your project directory
2. The `.claude/settings.json` file will be automatically loaded
3. Try accessing a denied path to verify enforcement:
   ```bash
   # This should be blocked
   ls .env
   ```

## 📖 Basic Usage

### List Available Templates

```bash
# List all built-in templates
claude-security list-templates

# List with details
claude-security list-templates --verbose

# Filter by category
claude-security list-templates --category production
```

### Generate Configurations

```bash
# Generate with built-in template
claude-security generate --template production --output config.json

# Generate with custom parameters
claude-security generate \
  --template enterprise \
  --parameters "projectPath=/app,allowedCommands=npm,python" \
  --output enterprise-config.json

# Generate for specific environment
claude-security generate \
  --template production \
  --environment staging \
  --output staging-config.json
```

### Validate Configurations

```bash
# Basic validation
claude-security validate config.json

# Comprehensive validation with conflict detection
claude-security validate config.json --comprehensive

# Validate against specific compliance framework
claude-security validate config.json --compliance soc2

# Validate multiple files
claude-security validate *.json
```

### Compare Configurations

```bash
# Compare two configurations
claude-security compare base-config.json new-config.json

# Show differences in detail
claude-security compare base-config.json new-config.json --verbose

# Export comparison report
claude-security compare base-config.json new-config.json --output comparison.md
```

## ⚙️ Configuration

### Global Configuration

Create a global configuration file at `~/.claude-security/config.json`:

```json
{
  "defaults": {
    "template": "development",
    "outputFormat": "json",
    "validationLevel": "comprehensive"
  },
  "templates": {
    "customPath": "~/.claude-security/templates",
    "autoUpdate": true
  },
  "enterprise": {
    "ldapServer": "ldap://company.com",
    "defaultParallelism": 50,
    "healthCheckTimeout": 30000
  },
  "plugins": {
    "enabled": ["security-validator", "compliance-checker"],
    "sandboxTimeout": 10000
  }
}
```

### Project Configuration

Create a project-specific configuration file at `.claude-security.json`:

```json
{
  "projectName": "My Application",
  "defaultTemplate": "production",
  "customRules": {
    "deny": [
      "**/my-app/secrets/**"
    ],
    "allow": [
      "Execute(my-custom-tool)"
    ]
  },
  "compliance": ["SOC2", "HIPAA"],
  "deployment": {
    "targets": ["team:backend", "team:frontend"],
    "strategy": "canary"
  }
}
```

## 🎨 Your First Template

### Create a Custom Template Interactively

```bash
# Start the interactive template builder
claude-security create-template --interactive
```

**Interactive Session:**
```
? Template name: My Custom Template
? Template category: (Use arrow keys)
❯ development
  production
  compliance
  custom

? Base template to extend: (Use arrow keys)
❯ development
  production
  none (start from scratch)

? Additional deny patterns: (separate with commas)
**/my-secrets/**,**/config/production/**

? Additional allow patterns: (separate with commas)
Execute(my-tool),Network(api.mycompany.com)

? Template description: Custom security template for my application

✓ Template created successfully!
📁 Saved to: ~/.claude-security/templates/my-custom-template.json
```

### Create a Template from Configuration File

```bash
# Create template configuration
cat > custom-template.json << 'EOF'
{
  "name": "My Custom Template",
  "category": "custom",
  "description": "Custom security rules for my application",
  "baseTemplate": "production",
  "rules": {
    "deny": [
      "**/app-secrets/**",
      "**/production-config/**"
    ],
    "allow": [
      "Execute(custom-build-tool)",
      "Network(api.internal.company.com)"
    ],
    "ask": [
      "Write(**/logs/**)"
    ]
  },
  "parameters": [
    {
      "name": "appPath",
      "type": "string",
      "description": "Application root path",
      "required": true,
      "defaultValue": "/app"
    }
  ]
}
EOF

# Create the template
claude-security create-template --config custom-template.json

# Test the template
claude-security generate --template my-custom-template --parameters "appPath=/my-app"
```

## 🏢 Enterprise Deployment

### Quick Enterprise Setup

```bash
# Initialize enterprise configuration
claude-security enterprise-init

# Discover deployment targets
claude-security enterprise-targets discover --source ldap

# Deploy to a small group first (canary)
claude-security enterprise-deploy production-config.json \
  --filters "team=platform" \
  --strategy canary \
  --health-checks

# Monitor deployment progress
claude-security enterprise-deploy --status

# Deploy to all engineering after canary success
claude-security enterprise-deploy production-config.json \
  --filters "department=engineering" \
  --strategy rolling \
  --parallelism 50
```

### Enterprise Configuration File

Create `enterprise-config.json`:

```json
{
  "deployment": {
    "defaultStrategy": "canary",
    "parallelism": 25,
    "healthCheckTimeout": 30000,
    "rollbackOnFailure": true
  },
  "targets": {
    "discovery": {
      "ldap": {
        "server": "ldap://company.com",
        "baseDN": "ou=developers,dc=company,dc=com"
      },
      "kubernetes": {
        "context": "production",
        "namespaces": ["*-dev", "*-staging"]
      }
    },
    "filters": {
      "include": ["department=engineering", "role=developer"],
      "exclude": ["contractor", "intern"]
    }
  },
  "monitoring": {
    "metrics": true,
    "alerts": {
      "slack": "https://hooks.slack.com/webhook-url",
      "email": ["security-team@company.com"]
    }
  },
  "rollback": {
    "automatic": true,
    "failureThreshold": 0.95,
    "healthCheckFailureLimit": 3
  }
}
```

## 📚 Next Steps

### For Individual Developers
1. **[User Guide](USER_GUIDE.md)** - Comprehensive usage guide
2. **[Template Guide](TEMPLATE_GUIDE.md)** - Advanced template customization
3. **[Plugin Development](PLUGIN_DEVELOPMENT.md)** - Creating custom plugins

### For Team Leaders
1. **[Enterprise Guide](ENTERPRISE_GUIDE.md)** - Team and department deployment
2. **[CLI Reference](CLI_REFERENCE.md)** - Complete command reference
3. **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues and solutions

### For Security Teams
1. **[Security Best Practices](SECURITY.md)** - Security considerations
2. **[Compliance Guide](COMPLIANCE.md)** - Meeting compliance requirements
3. **[Deployment Guide](../DEPLOYMENT.md)** - Enterprise deployment strategies

### For Platform Teams
1. **[API Reference](../API.md)** - Programmatic usage
2. **[Architecture](../ARCHITECTURE.md)** - System architecture details
3. **[Performance Guide](PERFORMANCE.md)** - Performance tuning

## 🔍 Validation Checklist

Before using in production, ensure:

- [ ] ✅ Installation successful (`claude-security --version` works)
- [ ] ✅ Basic template generation works
- [ ] ✅ Configuration validation passes
- [ ] ✅ Claude Code loads the generated settings
- [ ] ✅ Deny rules are enforced (test with blocked paths)
- [ ] ✅ Allow rules work correctly
- [ ] ✅ Performance meets requirements (<200ms CLI response)
- [ ] ✅ Enterprise deployment configured (if applicable)

## ❓ Getting Help

### Documentation
- **Quick Reference**: [CLI_REFERENCE.md](CLI_REFERENCE.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **FAQ**: [FAQ.md](FAQ.md)

### Community Support
- **GitHub Issues**: [Report bugs and request features](https://github.com/your-org/claude-code-security-rulesets/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/your-org/claude-code-security-rulesets/discussions)

### Enterprise Support
- **Email**: enterprise-support@your-org.com
- **Slack**: #claude-security-support
- **Emergency**: +1-800-SECURITY (24/7)

---

**Ready to secure your Claude Code environment!** 🔒