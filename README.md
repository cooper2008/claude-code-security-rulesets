# Claude Code Security Rulesets Generator

🛡️ **Automated security configuration for Claude Code** - Scan your projects and personal files to generate comprehensive security rules that protect sensitive data from AI access.

## ✨ Features

- 🔍 **Smart File Detection**: Automatically scans for 50+ types of sensitive files (.env, SSH keys, credentials, etc.)
- 🌐 **Two-Level Protection**: Global rules for personal files (SSH, AWS credentials) + local rules for project files
- 🚀 **One-Command Setup**: Get protected in 30 seconds with `claude-security setup`
- 📋 **Detailed Dry-Run**: Preview exactly what files will be protected before applying changes
- 🔒 **Binary Security Coverage**: Detects unanalyzable binary files (.dll, .so, .wasm, .jar) that AI tools can't inspect
- 🎯 **Language-Specific**: Tailored patterns for 15+ programming languages and frameworks
- ⚡ **High Performance**: Optimized scanning with timeout protection (completes in ~4 seconds)

## 🚀 Quick Start

### Installation

```bash
# Install globally via npm
npm install -g claude-code-security-rulesets

# Or run directly with npx (no installation needed)
npx claude-code-security-rulesets setup
```

### Basic Usage

```bash
# Simple setup - automatically protect all sensitive files
claude-security setup

# Preview what will be protected (no changes made)
claude-security setup --dry-run

# Project files only (skip personal files like SSH keys)
claude-security setup --project-only

# Detailed step-by-step setup
claude-security setup --mode detailed

# Check current protection status
claude-security status
```

## 📖 How It Works

1. **Scans your files**: Looks for sensitive files in your project and personal directories
2. **Generates security rules**: Creates Claude Code permission rules (deny/ask/allow)
3. **Applies protection**: Updates Claude Code settings to block access to sensitive files
4. **Two-level configuration**:
   - **Global rules** (`~/.claude/settings.local.json`): Protects personal files across ALL projects
   - **Local rules** (`~/.claude/settings.json`): Protects project-specific files

### What Gets Protected

#### 🔴 Critical Files (Automatically Blocked)
- **Environment Variables**: `.env`, `.env.local`, `.env.production`
- **SSH Keys**: `~/.ssh/id_rsa`, `~/.ssh/id_ed25519`
- **Cloud Credentials**: `~/.aws/credentials`, `~/.gcloud/`, `~/.azure/`
- **Database Files**: `*.db`, `*.sqlite`, database dumps
- **Certificates**: `*.pem`, `*.key`, `*.p12`, SSL certificates
- **Language-Specific**: `wp-config.php`, `appsettings.json`, `secrets.yml`

#### 🟡 Binary Files (Security Analysis Limited)
- **Compiled Code**: `.dll`, `.so`, `.dylib`, `.wasm`, `.exe`
- **Archives**: `.jar`, `.war`, `.whl`, mobile apps (`.apk`, `.ipa`)
- **Native Extensions**: Python C extensions, Node.js addons

## 🛠️ Advanced Usage

### Command Options

```bash
# Setup modes
claude-security setup --mode simple     # Default: quick automated setup
claude-security setup --mode detailed   # Step-by-step with explanations  
claude-security setup --mode expert     # Minimal UI, maximum control

# Scope options
claude-security setup --project-only    # Only scan current project
claude-security setup --global-only     # Only scan personal/home files

# Preview and testing
claude-security setup --dry-run         # Show what would be protected
claude-security setup --verbose         # Detailed progress output

# Output options
claude-security setup --output config.json  # Save to file instead of applying
```

### Configuration Examples

#### Generated Global Rules (Personal Files)
```json
{
  "permissions": {
    "deny": [
      "Read(/Users/*/.ssh/**)",
      "Read(/Users/*/.aws/credentials)", 
      "Read(/Users/*/.gcloud/**)",
      "Read(**/*.key)",
      "Read(**/.env*)"
    ]
  }
}
```

#### Generated Local Rules (Project Files)
```json
{
  "permissions": {
    "deny": [
      "Read(.env*)",
      "Read(**/config/database*)",
      "Read(**/wp-config.php)"
    ],
    "ask": [
      "Read(**/*.log)",
      "Read(**/*Dockerfile*)"
    ]
  }
}
```

## 🔧 Development

### Prerequisites

- Node.js 18+ 
- TypeScript 5+

### Setup

```bash
# Clone repository
git clone https://github.com/cooper2008/claude-code-security-rulesets.git
cd claude-code-security-rulesets

# Install dependencies
npm install

# Build project
npm run build

# Run locally
npm run dev setup --dry-run
```

### Project Structure

```
src/
├── cli/           # Command-line interface
├── setup/         # Core scanning and rule generation
│   ├── scanner.ts    # File detection and security analysis
│   ├── wizard.ts     # Interactive setup workflow  
│   └── applier.ts    # Rule application and config management
├── adapters/      # Multi-AI tool support (future)
├── utils/         # Formatting and helper utilities
└── types/         # TypeScript type definitions

dist/              # Compiled JavaScript output
tests/             # Test suites
```

## 🌟 Supported Languages & Frameworks

### Web Development
- **JavaScript/TypeScript**: `.env`, `node_modules/`, native `.node` modules
- **React/Vue/Angular**: Build configs, environment variables
- **Node.js**: Native addons, package configurations

### Backend Languages
- **Python**: `.env`, Django settings, `.whl` wheels, C extensions
- **Java**: `application.properties`, keystores, `.jar` files, JNI libraries
- **C#/.NET**: `appsettings.json`, connection strings, `.dll` assemblies
- **Go**: Config files, CGO dependencies, compiled binaries
- **Rust**: `Cargo.toml` credentials, compiled `.rlib` files
- **Ruby**: Rails secrets, `database.yml`, native gem extensions
- **PHP**: `wp-config.php`, `.htaccess`, Laravel `.env`

### Mobile Development
- **iOS/Swift**: Provisioning profiles, certificates, Firebase configs
- **Android/Kotlin**: Keystores, `google-services.json`, `.apk` files

### DevOps & Infrastructure
- **Docker**: Compose files, registry credentials
- **Kubernetes**: Cluster configs, certificates  
- **Terraform**: State files, variable files
- **Cloud Providers**: AWS, GCP, Azure credential files

## 📊 Security Coverage

### Risk Levels
- **🔴 CRITICAL**: Immediate protection required (credentials, keys, secrets)
- **🟡 HIGH**: Recommended protection (config files, logs)
- **🟠 MEDIUM**: Consider protection (build artifacts, caches)
- **⚪ LOW**: Optional protection (documentation, metadata)

### Binary Security Analysis
This tool identifies binary files that AI source code analysis cannot inspect:
- **Native Libraries**: `.so`, `.dll`, `.dylib` files
- **Compiled Applications**: `.exe`, `.bin`, mobile apps
- **WebAssembly**: `.wasm` modules compiled from C/C++/Rust
- **Language Archives**: `.jar`, `.whl`, `.gem` with native code

**Recommendation**: Supplement AI code analysis with dedicated binary security scanners (BinSkim, CVE Binary Tool, etc.)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make changes and test: `npm test`
4. Commit changes: `git commit -m 'Add amazing feature'`
5. Push to branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/cooper2008/claude-code-security-rulesets/issues)
- **Documentation**: This README and inline help (`claude-security --help`)
- **Status Check**: `claude-security status` shows current protection

## 🎯 Roadmap

- [ ] Multi-AI tool support (Cursor, GitHub Copilot, Windsurf)
- [ ] Enterprise policy management
- [ ] CI/CD integration hooks
- [ ] Advanced rule customization UI
- [ ] Integration with security scanners
- [ ] Cloud deployment templates

---

**Made with ❤️ for secure AI-assisted development**