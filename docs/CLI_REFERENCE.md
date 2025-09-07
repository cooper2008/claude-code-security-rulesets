# CLI Reference

Complete reference for all Claude Code Security CLI commands, options, and usage patterns.

## 📋 Table of Contents

1. [Global Options](#global-options)
2. [Core Commands](#core-commands)
3. [Template Commands](#template-commands)
4. [Validation Commands](#validation-commands)
5. [Plugin Commands](#plugin-commands)
6. [Enterprise Commands](#enterprise-commands)
7. [Utility Commands](#utility-commands)
8. [Configuration](#configuration)
9. [Exit Codes](#exit-codes)
10. [Examples](#examples)

## 🌐 Global Options

These options are available for all commands:

```bash
claude-security [command] [options]
```

### Global Flags
- `--version, -V`: Show version number
- `--help, -h`: Show help information
- `--verbose, -v`: Enable verbose output
- `--quiet, -q`: Suppress non-error output
- `--config <path>`: Use custom configuration file
- `--no-color`: Disable colored output
- `--format <format>`: Output format (json, yaml, table, text)
- `--output <path>`: Output file path

### Configuration Options
- `--config-path <path>`: Path to configuration directory (default: `~/.claude-security`)
- `--cache-path <path>`: Path to cache directory (default: `~/.claude-security/cache`)
- `--templates-path <path>`: Path to custom templates (default: `~/.claude-security/templates`)

## 🔧 Core Commands

### `generate`
Generate security configuration from templates.

```bash
claude-security generate [options]
```

#### Options
| Option | Alias | Type | Description | Default |
|--------|-------|------|-------------|---------|
| `--template` | `-t` | string | Template name or path | `development` |
| `--output` | `-o` | string | Output file path | `.claude/settings.json` |
| `--parameters` | `-p` | string | Template parameters (key=value,key=value) | - |
| `--environment` | `-e` | string | Target environment | `development` |
| `--base-config` | `-b` | string | Base configuration to merge with | - |
| `--merge-strategy` | `-m` | string | Merge strategy (override, merge, combine) | `merge` |
| `--dry-run` | - | boolean | Preview without saving | `false` |
| `--force` | `-f` | boolean | Overwrite existing files | `false` |

#### Examples
```bash
# Basic generation
claude-security generate --template production

# With parameters
claude-security generate -t enterprise -p "projectPath=/app,team=backend"

# Merge with existing configuration
claude-security generate -t production -b existing.json -m combine

# Preview changes
claude-security generate -t production --dry-run
```

#### Exit Codes
- `0`: Success
- `1`: Template not found
- `2`: Invalid parameters
- `3`: File system error
- `4`: Validation failed

---

### `validate`
Validate security configurations.

```bash
claude-security validate <config-file> [options]
```

#### Options
| Option | Alias | Type | Description | Default |
|--------|-------|------|-------------|---------|
| `--comprehensive` | `-c` | boolean | Full validation with conflict detection | `false` |
| `--compliance` | - | string | Validate against compliance framework | - |
| `--performance` | `-p` | boolean | Include performance analysis | `false` |
| `--rules` | `-r` | string | Additional validation rules file | - |
| `--strict` | `-s` | boolean | Fail on warnings | `false` |
| `--report` | - | string | Generate validation report | - |

#### Compliance Frameworks
- `soc2`: SOC 2 Type II compliance
- `hipaa`: HIPAA compliance
- `pci-dss`: PCI DSS compliance
- `gdpr`: GDPR compliance
- `iso27001`: ISO 27001 compliance

#### Examples
```bash
# Basic validation
claude-security validate config.json

# Comprehensive validation
claude-security validate config.json --comprehensive

# SOC2 compliance check
claude-security validate config.json --compliance soc2

# Generate validation report
claude-security validate config.json --report validation-report.md
```

#### Exit Codes
- `0`: Valid configuration
- `1`: Invalid configuration
- `2`: Compliance violation
- `3`: Performance issues
- `4`: File not found

---

### `list-templates`
List available templates.

```bash
claude-security list-templates [options]
```

#### Options
| Option | Alias | Type | Description | Default |
|--------|-------|------|-------------|---------|
| `--verbose` | `-v` | boolean | Show detailed information | `false` |
| `--category` | `-c` | string | Filter by category | - |
| `--compliance` | - | string | Filter by compliance framework | - |
| `--search` | `-s` | string | Search term | - |
| `--built-in` | - | boolean | Show only built-in templates | `false` |
| `--custom` | - | boolean | Show only custom templates | `false` |

#### Template Categories
- `development`: Development environment templates
- `production`: Production environment templates
- `compliance`: Compliance-specific templates
- `custom`: User-created templates

#### Examples
```bash
# List all templates
claude-security list-templates

# List production templates
claude-security list-templates --category production

# Search templates
claude-security list-templates --search "enterprise"

# Detailed listing
claude-security list-templates --verbose
```

---

## 🎨 Template Commands

### `create-template`
Create custom security templates.

```bash
claude-security create-template [options]
```

#### Options
| Option | Alias | Type | Description | Default |
|--------|-------|------|-------------|---------|
| `--interactive` | `-i` | boolean | Launch interactive builder | `false` |
| `--config` | `-c` | string | Template configuration file | - |
| `--extend` | `-e` | string | Extend existing template | - |
| `--name` | `-n` | string | Template name | - |
| `--category` | - | string | Template category | `custom` |
| `--description` | `-d` | string | Template description | - |

#### Interactive Mode
The interactive mode guides you through template creation:
1. Template metadata (name, category, description)
2. Base template selection
3. Rule definitions (deny, allow, ask)
4. Parameter configuration
5. Testing and validation

#### Configuration File Format
```json
{
  "name": "My Custom Template",
  "category": "custom",
  "description": "Custom template description",
  "baseTemplate": "production",
  "rules": {
    "deny": ["**/custom-secrets/**"],
    "allow": ["Execute(custom-tool)"],
    "ask": ["Network(custom-api.com)"]
  },
  "parameters": [
    {
      "name": "customPath",
      "type": "string",
      "required": true,
      "defaultValue": "/app"
    }
  ]
}
```

#### Examples
```bash
# Interactive creation
claude-security create-template --interactive

# From configuration file
claude-security create-template --config template.json

# Extend existing template
claude-security create-template --extend production --name "Enhanced Production"
```

---

### `extend-template`
Extend existing templates with additional rules.

```bash
claude-security extend-template [options]
```

#### Options
| Option | Alias | Type | Description | Default |
|--------|-------|------|-------------|---------|
| `--template` | `-t` | string | Base template to extend | - |
| `--type` | - | string | Extension type (inherit, compose, override) | `inherit` |
| `--name` | `-n` | string | New template name | - |
| `--add-rules` | `-a` | string | Additional rules file | - |
| `--override-rules` | `-o` | string | Rules to override | - |
| `--remove-rules` | `-r` | string | Rule patterns to remove | - |

#### Extension Types
- `inherit`: Inherit rules and add new ones
- `compose`: Merge with multiple templates
- `override`: Override specific rules

#### Examples
```bash
# Inherit and add rules
claude-security extend-template --template production --type inherit --add-rules additional.json

# Override specific rules
claude-security extend-template --template development --type override --override-rules overrides.json
```

---

## ✅ Validation Commands

### `check-conflicts`
Detect and resolve rule conflicts.

```bash
claude-security check-conflicts <config-file> [options]
```

#### Options
| Option | Alias | Type | Description | Default |
|--------|-------|------|-------------|---------|
| `--detailed` | `-d` | boolean | Show detailed conflict analysis | `false` |
| `--resolve` | `-r` | boolean | Attempt automatic resolution | `false` |
| `--strategy` | `-s` | string | Resolution strategy | `strict-deny` |
| `--interactive` | `-i` | boolean | Interactive conflict resolution | `false` |
| `--report` | - | string | Generate conflict report | - |

#### Resolution Strategies
- `strict-deny`: Deny rules take precedence
- `template-wins`: Template rules override base rules
- `base-wins`: Base rules take precedence
- `manual`: Manual resolution for each conflict

#### Examples
```bash
# Detect conflicts
claude-security check-conflicts config.json

# Auto-resolve with strict-deny
claude-security check-conflicts config.json --resolve --strategy strict-deny

# Interactive resolution
claude-security check-conflicts config.json --resolve --interactive
```

---

### `compare`
Compare security configurations.

```bash
claude-security compare <config1> <config2> [options]
```

#### Options
| Option | Alias | Type | Description | Default |
|--------|-------|------|-------------|---------|
| `--verbose` | `-v` | boolean | Show detailed differences | `false` |
| `--diff-only` | `-d` | boolean | Show only differences | `false` |
| `--include-metadata` | `-m` | boolean | Include metadata in comparison | `false` |
| `--report` | `-r` | string | Generate comparison report | - |

#### Examples
```bash
# Basic comparison
claude-security compare old.json new.json

# Detailed differences
claude-security compare old.json new.json --verbose

# Generate report
claude-security compare old.json new.json --report comparison.md
```

---

### `test`
Test security configurations.

```bash
claude-security test <config-file> [options]
```

#### Options
| Option | Alias | Type | Description | Default |
|--------|-------|------|-------------|---------|
| `--scenarios` | `-s` | string | Test scenarios file | - |
| `--performance` | `-p` | boolean | Include performance tests | `false` |
| `--integration` | `-i` | boolean | Test Claude Code integration | `false` |
| `--coverage` | `-c` | boolean | Generate coverage report | `false` |

#### Examples
```bash
# Basic testing
claude-security test config.json

# With custom scenarios
claude-security test config.json --scenarios test-scenarios.json

# Performance testing
claude-security test config.json --performance
```

---

## 🔌 Plugin Commands

### `plugins`
Manage plugins and extensions.

```bash
claude-security plugins <subcommand> [options]
```

#### Subcommands

#### `list`
List installed plugins.

```bash
claude-security plugins list [options]
```

Options:
- `--enabled`: Show only enabled plugins
- `--disabled`: Show only disabled plugins
- `--verbose`: Show detailed plugin information

#### `install`
Install a plugin.

```bash
claude-security plugins install <plugin-source> [options]
```

Sources:
- Local file: `./plugin.js`
- URL: `https://example.com/plugin.js`
- NPM package: `@company/claude-plugin`

Options:
- `--force`: Force installation over existing plugin
- `--no-verify`: Skip plugin verification

#### `uninstall`
Remove a plugin.

```bash
claude-security plugins uninstall <plugin-name>
```

#### `enable`/`disable`
Enable or disable plugins.

```bash
claude-security plugins enable <plugin-name>
claude-security plugins disable <plugin-name>
```

#### `create`
Create a new plugin.

```bash
claude-security plugins create [options]
```

Options:
- `--type`: Plugin type (validation, generation, transformation)
- `--name`: Plugin name
- `--interactive`: Interactive plugin builder

#### `test`
Test a plugin.

```bash
claude-security plugins test <plugin-file> [options]
```

Options:
- `--config`: Test configuration file
- `--scenarios`: Test scenarios

#### Examples
```bash
# List plugins
claude-security plugins list --verbose

# Install plugin
claude-security plugins install ./custom-validator.js

# Create new plugin
claude-security plugins create --type validation --name "My Validator"
```

---

## 🏢 Enterprise Commands

### `enterprise-deploy`
Deploy configurations to multiple targets.

```bash
claude-security enterprise-deploy <config-file> [options]
```

#### Options
| Option | Alias | Type | Description | Default |
|--------|-------|------|-------------|---------|
| `--filters` | `-f` | string | Target filter expression | - |
| `--strategy` | `-s` | string | Deployment strategy | `rolling` |
| `--parallelism` | `-p` | number | Concurrent deployment limit | `10` |
| `--health-checks` | - | boolean | Enable health checking | `true` |
| `--rollback-on-failure` | - | boolean | Auto-rollback on failure | `true` |
| `--dry-run` | - | boolean | Preview deployment | `false` |
| `--timeout` | `-t` | number | Deployment timeout (ms) | `300000` |

#### Deployment Strategies
- `immediate`: Deploy to all targets immediately
- `canary`: Deploy to small group first, then expand
- `rolling`: Deploy in batches with delays
- `blue-green`: Maintain two environments
- `hybrid`: Use multiple strategies

#### Filter Expressions
```bash
# Department filtering
--filters "department=engineering"

# Complex filtering
--filters "department=engineering AND role=developer"

# Wildcards
--filters "team=frontend-*"

# Exclusions
--filters "department=engineering" --exclude "contractor,intern"
```

#### Examples
```bash
# Deploy to engineering team
claude-security enterprise-deploy config.json --filters "department=engineering"

# Canary deployment
claude-security enterprise-deploy config.json --strategy canary --parallelism 5

# Dry run deployment
claude-security enterprise-deploy config.json --dry-run
```

---

### `enterprise-rollback`
Rollback enterprise deployments.

```bash
claude-security enterprise-rollback [options]
```

#### Options
| Option | Alias | Type | Description | Default |
|--------|-------|------|-------------|---------|
| `--deployment-id` | `-d` | string | Specific deployment to rollback | - |
| `--emergency` | `-e` | boolean | Emergency rollback with high priority | `false` |
| `--targets` | `-t` | string | Specific targets to rollback | - |
| `--strategy` | `-s` | string | Rollback strategy | `previous-version` |
| `--list-snapshots` | - | boolean | Show available rollback points | `false` |

#### Rollback Strategies
- `previous-version`: Rollback to previous configuration version
- `snapshot`: Rollback to specific snapshot
- `git-revert`: Use Git to revert changes

#### Examples
```bash
# Rollback latest deployment
claude-security enterprise-rollback

# Emergency rollback
claude-security enterprise-rollback --emergency --deployment-id abc123

# List rollback options
claude-security enterprise-rollback --list-snapshots
```

---

### `enterprise-targets`
Manage deployment targets.

```bash
claude-security enterprise-targets <subcommand> [options]
```

#### Subcommands

#### `discover`
Discover deployment targets.

```bash
claude-security enterprise-targets discover [options]
```

Options:
- `--source`: Discovery source (ldap, kubernetes, aws, ssh)
- `--ldap-server`: LDAP server URL
- `--base-dn`: LDAP base DN
- `--save`: Save discovered targets

#### `list`
List configured targets.

```bash
claude-security enterprise-targets list [options]
```

#### `test`
Test connectivity to targets.

```bash
claude-security enterprise-targets test [options]
```

#### Examples
```bash
# Discover from LDAP
claude-security enterprise-targets discover --source ldap --save

# List targets
claude-security enterprise-targets list --verbose

# Test connectivity
claude-security enterprise-targets test --parallelism 10
```

---

## 🛠️ Utility Commands

### `init`
Initialize configuration and setup.

```bash
claude-security init [options]
```

#### Options
| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `--enterprise` | boolean | Initialize enterprise features | `false` |
| `--template` | string | Default template to use | `development` |
| `--global` | boolean | Initialize global configuration | `false` |

#### Examples
```bash
# Basic initialization
claude-security init

# Enterprise initialization
claude-security init --enterprise

# Global configuration
claude-security init --global
```

---

### `info`
Show system and configuration information.

```bash
claude-security info [options]
```

#### Options
| Option | Type | Description |
|--------|------|-------------|
| `--config` | boolean | Show configuration details |
| `--performance` | boolean | Show performance metrics |
| `--plugins` | boolean | Show plugin information |
| `--enterprise` | boolean | Show enterprise status |

#### Examples
```bash
# Basic system info
claude-security info

# Configuration details
claude-security info --config --plugins
```

---

### `completion`
Generate shell completion scripts.

```bash
claude-security completion <shell> [options]
```

#### Supported Shells
- `bash`
- `zsh`
- `fish`
- `powershell`

#### Examples
```bash
# Generate bash completion
claude-security completion bash

# Install completion for current shell
claude-security completion bash > /etc/bash_completion.d/claude-security
```

---

### `doctor`
Diagnose system and configuration issues.

```bash
claude-security doctor [options]
```

#### Options
| Option | Type | Description |
|--------|------|-------------|
| `--fix` | boolean | Attempt to fix issues automatically |
| `--verbose` | boolean | Show detailed diagnostic information |

#### Checks Performed
- Node.js version compatibility
- Dependencies installation
- Configuration file validity
- Template availability
- Plugin functionality
- Enterprise connectivity

#### Examples
```bash
# Basic health check
claude-security doctor

# Fix issues automatically
claude-security doctor --fix
```

---

## ⚙️ Configuration

### Configuration File Locations

#### Global Configuration
- **Location**: `~/.claude-security/config.json`
- **Purpose**: User-wide default settings

#### Project Configuration
- **Location**: `./.claude-security.json`
- **Purpose**: Project-specific settings

#### Environment Variables
- `CLAUDE_SECURITY_CONFIG`: Custom configuration file path
- `CLAUDE_SECURITY_CACHE`: Custom cache directory
- `CLAUDE_SECURITY_TEMPLATES`: Custom templates directory
- `CLAUDE_SECURITY_LOG_LEVEL`: Logging level (error, warn, info, debug)

### Configuration Schema
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
    "enabled": false,
    "ldapServer": "",
    "defaultParallelism": 10,
    "healthCheckTimeout": 30000
  },
  "plugins": {
    "enabled": [],
    "sandboxTimeout": 10000,
    "allowRemotePlugins": false
  },
  "performance": {
    "cacheEnabled": true,
    "cacheType": "memory",
    "maxCacheSize": "100MB"
  }
}
```

## 🚨 Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments |
| `3` | File system error |
| `4` | Validation failed |
| `5` | Network error |
| `6` | Authentication failed |
| `7` | Permission denied |
| `8` | Timeout |
| `9` | Plugin error |
| `10` | Enterprise feature error |

## 📚 Examples

### Common Workflows

#### Basic Development Setup
```bash
# Initialize project
claude-security init

# Generate development configuration
claude-security generate --template development --output .claude/settings.json

# Validate configuration
claude-security validate .claude/settings.json

# Test with scenarios
claude-security test .claude/settings.json --scenarios dev-scenarios.json
```

#### Production Deployment
```bash
# Generate production configuration
claude-security generate --template production --environment production

# Comprehensive validation
claude-security validate .claude/settings.json --comprehensive --compliance soc2

# Deploy to staging first
claude-security enterprise-deploy .claude/settings.json --filters "environment=staging"

# Deploy to production with canary strategy
claude-security enterprise-deploy .claude/settings.json --strategy canary --filters "environment=production"
```

#### Custom Template Creation
```bash
# Create custom template interactively
claude-security create-template --interactive

# Test custom template
claude-security generate --template my-custom-template --dry-run

# Deploy custom template
claude-security enterprise-deploy custom-config.json --filters "team=my-team"
```

#### Troubleshooting
```bash
# Check system health
claude-security doctor

# Validate configuration with detailed output
claude-security validate config.json --verbose --comprehensive

# Check for conflicts
claude-security check-conflicts config.json --detailed

# Compare configurations
claude-security compare old-config.json new-config.json --verbose
```

---

For more detailed information about specific features, see:
- [User Guide](USER_GUIDE.md) for comprehensive usage
- [Getting Started](GETTING_STARTED.md) for initial setup
- [Troubleshooting](TROUBLESHOOTING.md) for common issues