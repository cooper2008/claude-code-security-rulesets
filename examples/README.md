# Examples Directory

This directory contains practical examples for using the Claude Code Security Rulesets Generator in various scenarios.

## 📁 Directory Structure

```
examples/
├── README.md                    # This file
├── basic/                       # Basic usage examples
│   ├── development-config.json  # Simple development configuration
│   ├── production-config.json   # Production-ready configuration  
│   └── custom-template.json     # Custom template example
├── enterprise/                  # Enterprise deployment examples
│   ├── canary-deployment.sh     # Canary deployment script
│   ├── rollback-procedure.sh    # Rollback procedure
│   └── monitoring-setup.yml     # Monitoring configuration
├── compliance/                  # Compliance-specific examples
│   ├── soc2-template.json       # SOC2 compliance template
│   ├── hipaa-template.json      # HIPAA compliance template
│   └── pci-dss-template.json    # PCI DSS compliance template
├── integrations/               # CI/CD and integration examples
│   ├── github-actions.yml       # GitHub Actions workflow
│   ├── gitlab-ci.yml           # GitLab CI pipeline
│   └── jenkins-pipeline.groovy  # Jenkins pipeline
└── plugins/                    # Plugin examples
    ├── custom-validator.js      # Custom validation plugin
    └── rule-generator.js        # Rule generation plugin
```

## 🚀 Quick Start Examples

### Generate Basic Development Configuration
```bash
# Navigate to basic examples
cd examples/basic

# Generate development configuration
claude-security generate --template development --output dev-config.json

# Validate the configuration
claude-security validate dev-config.json
```

### Create Custom Template
```bash
# Use the example custom template
claude-security create-template --config examples/basic/custom-template.json

# Generate configuration from custom template
claude-security generate --template my-custom-template
```

### Enterprise Deployment
```bash
# Run canary deployment example
./examples/enterprise/canary-deployment.sh config.json

# Monitor deployment progress
claude-security enterprise-deploy --status
```

## 📋 Example Categories

### Basic Examples (`basic/`)
Perfect for getting started and understanding core concepts:
- Simple configuration generation
- Template customization
- Basic validation workflows

### Enterprise Examples (`enterprise/`)
Production-ready deployment and management:
- Large-scale deployment strategies  
- Monitoring and alerting setup
- Rollback and disaster recovery procedures

### Compliance Examples (`compliance/`)
Industry-specific compliance templates:
- SOC 2 Type II compliance
- HIPAA healthcare compliance
- PCI DSS payment processing compliance

### Integration Examples (`integrations/`)
CI/CD pipeline and automation integration:
- GitHub Actions workflows
- GitLab CI/CD pipelines
- Jenkins automation
- Custom webhook integrations

### Plugin Examples (`plugins/`)
Extensibility and customization:
- Custom validation logic
- Rule generation plugins
- Configuration transformation plugins

## 🎯 Use Case Examples

### Scenario 1: Small Team Development
**Goal**: Secure development environment for 5-person team

```bash
# Generate team development configuration
claude-security generate --template development \
  --parameters "projectPath=/workspace,team=frontend" \
  --output team-dev-config.json

# Customize for specific project needs
claude-security extend-template --template development \
  --add-rules team-specific-rules.json \
  --name "Frontend Team Template"
```

### Scenario 2: Enterprise Production Deployment
**Goal**: Deploy to 500+ developers across multiple teams

```bash
# Generate enterprise production configuration
claude-security generate --template enterprise \
  --parameters "environment=production,compliance=soc2" \
  --output enterprise-prod-config.json

# Deploy with canary strategy
claude-security enterprise-deploy enterprise-prod-config.json \
  --filters "department=engineering" \
  --strategy canary \
  --parallelism 25
```

### Scenario 3: Compliance Implementation  
**Goal**: Implement HIPAA compliance for healthcare application

```bash
# Generate HIPAA-compliant configuration
claude-security generate --template hipaa \
  --parameters "applicationName=HealthApp,environment=production" \
  --output hipaa-config.json

# Validate against HIPAA requirements
claude-security validate hipaa-config.json --compliance hipaa
```

### Scenario 4: Multi-Environment Deployment
**Goal**: Different configurations for dev/staging/production

```bash
# Development environment
claude-security generate --template development \
  --environment development \
  --output configs/dev-config.json

# Staging environment  
claude-security generate --template production \
  --environment staging \
  --parameters "debugMode=true" \
  --output configs/staging-config.json

# Production environment
claude-security generate --template production \
  --environment production \
  --compliance soc2 \
  --output configs/prod-config.json
```

## 🛠️ Integration Examples

### GitHub Actions CI/CD
```yaml
# .github/workflows/security-deployment.yml
name: Deploy Security Configuration

on:
  push:
    branches: [main]
    paths: ['security-configs/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Claude Security CLI
        run: npm install -g claude-code-security-rulesets
        
      - name: Validate Configuration
        run: claude-security validate security-configs/production.json --comprehensive
        
      - name: Deploy to Production
        run: claude-security enterprise-deploy security-configs/production.json --filters "environment=production"
```

### Docker Integration
```dockerfile
# Dockerfile for security configuration deployment
FROM node:18-alpine

# Install Claude Security CLI
RUN npm install -g claude-code-security-rulesets

# Copy configuration files
COPY security-configs/ /configs/

# Validation and deployment script
COPY deploy.sh /deploy.sh
RUN chmod +x /deploy.sh

ENTRYPOINT ["/deploy.sh"]
```

### Ansible Playbook
```yaml
# deploy-security-config.yml
---
- name: Deploy Claude Code Security Configuration
  hosts: developers
  tasks:
    - name: Install Claude Security CLI
      npm:
        name: claude-code-security-rulesets
        global: yes
        
    - name: Generate configuration
      command: >
        claude-security generate 
        --template production 
        --output ~/.claude/settings.json
        
    - name: Validate configuration
      command: claude-security validate ~/.claude/settings.json
```

## 📊 Testing Examples

### Configuration Testing
```bash
# Test configuration with custom scenarios
claude-security test config.json --scenarios test-scenarios.json

# Performance testing
claude-security test config.json --performance --iterations 1000

# Integration testing
claude-security test config.json --integration
```

### Example Test Scenarios (`test-scenarios.json`)
```json
{
  "scenarios": [
    {
      "name": "Environment File Protection",
      "action": "Read",
      "target": ".env",
      "expectedResult": "denied",
      "description": "Ensure .env files are protected"
    },
    {
      "name": "Package Manager Access",
      "action": "Execute", 
      "target": "npm install",
      "expectedResult": "allowed",
      "description": "Ensure package managers work"
    }
  ]
}
```

## 🔌 Plugin Examples

### Custom Validation Plugin
```javascript
// examples/plugins/custom-validator.js
module.exports = {
  name: 'Team Security Validator',
  type: 'validation',
  version: '1.0.0',
  
  validate(config, context) {
    const violations = [];
    
    // Check for team-specific requirements
    if (context.team === 'security' && config.permissions.deny.length < 10) {
      violations.push({
        severity: 'error',
        message: 'Security team configurations must have at least 10 deny rules',
        location: 'permissions.deny'
      });
    }
    
    return {
      isValid: violations.filter(v => v.severity === 'error').length === 0,
      violations
    };
  }
};
```

### Installation and Usage
```bash
# Install custom plugin
claude-security plugins install examples/plugins/custom-validator.js

# Test plugin
claude-security plugins test custom-validator --config test-config.json

# Use plugin in validation
claude-security validate config.json --comprehensive
```

## 📈 Monitoring Examples

### Dashboard Configuration
```yaml
# monitoring-dashboard.yml
apiVersion: v1
kind: ConfigMap
metadata:
  name: claude-security-dashboard
data:
  dashboard.json: |
    {
      "dashboard": {
        "title": "Claude Code Security Metrics",
        "panels": [
          {
            "title": "Deployment Success Rate",
            "type": "stat",
            "targets": ["claude_security_deployment_success_rate"]
          },
          {
            "title": "Validation Performance", 
            "type": "graph",
            "targets": ["claude_security_validation_duration"]
          }
        ]
      }
    }
```

### Alert Configuration
```json
{
  "alerts": [
    {
      "name": "Security Deployment Failure",
      "condition": "deployment_success_rate < 0.95",
      "severity": "high",
      "channels": ["slack", "email"],
      "message": "Security configuration deployment is failing for {{.percentage}}% of targets"
    },
    {
      "name": "Configuration Validation Slow",
      "condition": "validation_duration_p95 > 100",
      "severity": "medium", 
      "channels": ["slack"],
      "message": "Security configuration validation is taking {{.duration}}ms (target: <100ms)"
    }
  ]
}
```

## 🏃‍♂️ Running Examples

### Prerequisites
1. Install Claude Code Security CLI:
   ```bash
   npm install -g claude-code-security-rulesets
   ```

2. Navigate to examples directory:
   ```bash
   cd examples
   ```

### Running Basic Examples
```bash
# Generate basic development config
claude-security generate --template development --output basic/generated-dev.json

# Validate the configuration  
claude-security validate basic/generated-dev.json --comprehensive

# Test the configuration
claude-security test basic/generated-dev.json
```

### Running Enterprise Examples
```bash
# Make deployment script executable
chmod +x enterprise/canary-deployment.sh

# Run canary deployment
./enterprise/canary-deployment.sh basic/generated-dev.json
```

### Running Compliance Examples
```bash
# Generate SOC2 compliant configuration
claude-security generate --template soc2 --output compliance/generated-soc2.json

# Validate against SOC2 requirements
claude-security validate compliance/generated-soc2.json --compliance soc2
```

## 🔗 Additional Resources

- **[Getting Started Guide](../docs/GETTING_STARTED.md)**: Basic setup and usage
- **[User Guide](../docs/USER_GUIDE.md)**: Comprehensive feature documentation
- **[CLI Reference](../docs/CLI_REFERENCE.md)**: Complete command reference
- **[Enterprise Guide](../docs/ENTERPRISE_GUIDE.md)**: Enterprise deployment strategies
- **[Plugin Development](../docs/PLUGIN_DEVELOPMENT.md)**: Creating custom plugins

## 💡 Contributing Examples

We welcome contributions of new examples! To contribute:

1. **Fork the repository**
2. **Create example files** in the appropriate category directory
3. **Add documentation** explaining the example's purpose and usage
4. **Test the example** to ensure it works correctly
5. **Submit a pull request** with a clear description

### Example Contribution Template
```markdown
## Example Name: [Brief Description]

**Purpose**: [What this example demonstrates]
**Use Case**: [When to use this example]  
**Prerequisites**: [Required setup or dependencies]

### Files
- `example-file.json`: [Description of file]
- `setup-script.sh`: [Description of script]

### Usage
[Step-by-step instructions]

### Expected Output
[What users should expect to see]
```

---

**Happy securing!** 🔒 These examples should help you get started with the Claude Code Security Rulesets Generator and implement security best practices in your organization.