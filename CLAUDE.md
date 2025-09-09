# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Commands
- `npm run build` - Compile TypeScript to JavaScript (dist/)
- `npm run dev` - Run CLI in development mode with ts-node
- `npm test` - Run complete test suite with Jest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report
- `npm run lint` - Check code style with ESLint
- `npm run lint:fix` - Auto-fix linting issues
- `npm run format` - Format code with Prettier

### Testing & Quality
- `npm run test:performance` - Run performance benchmarks
- `npm run validate` - Build validation (used in CI)
- `npm run clean` - Remove build artifacts

### Single Test Execution
- `jest --testNamePattern="specific test name"` - Run specific test
- `jest tests/path/to/test.ts` - Run specific test file
- `npm run test -- --testPathPattern=performance` - Run performance tests only

## Architecture Overview

This is a CLI tool for generating and deploying Claude Code security configurations. The system enforces zero-bypass deny rules to protect sensitive files from AI access.

### Core Components

**CLI Layer** (`src/cli/`)
- Main entry point with Commander.js-based interface
- Provides `setup`, `validate`, `deploy`, `status`, `scan` commands
- Supports multiple AI tools: claude-code, cursor, copilot, windsurf

**Setup System** (`src/setup/`)
- `wizard.ts` - Main setup workflow with educational guidance
- `scanner.ts` - File system scanning for sensitive files
- `applier.ts` - Applies security rules to AI tool configurations

**Adapters** (`src/adapters/`)
- Abstract base adapter for multi-AI-tool support
- Tool-specific adapters for different AI coding tools
- Handles tool detection, configuration, and rule application

**Key Features**
- Dual-scope protection: project-level and global (personal files)
- Educational modes: simple, detailed, expert, custom
- Dry-run capability for preview before applying changes
- Backup creation for safe configuration updates

### Project Structure
```
src/
├── cli/           # Command-line interface and commands
├── setup/         # Core scanning and setup logic
├── adapters/      # Multi-AI-tool support system
├── types/         # TypeScript type definitions
└── benchmark/     # Performance testing infrastructure
```

### Security Model
- **Zero-Bypass Enforcement** - Deny rules cannot be circumvented
- **Risk-Based Classification** - Files categorized as CRITICAL, HIGH, MEDIUM, LOW
- **Dual Configuration** - Global rules (~/.claude/) + Local rules (./.claude/)
- **Template System** - Pre-built security configurations for different environments

## Important Patterns

### CLI Command Structure
Commands follow a consistent pattern with options for dry-run, verbose output, and different AI tools. Always use the `handleCommandError` function for error handling.

### Scanner Integration
The `Scanner` class performs dual scans (project + global) and returns `ScanResult` objects. Use the `SecurityWizard` for complete setup workflows.

### Configuration Management
Configuration files use a permissions model with `deny`, `allow`, and `ask` arrays. Template inheritance allows extending base configurations.

### TypeScript Configuration
- Target: ES2020, CommonJS modules
- Path aliases configured (@/* → src/*)
- Strict mode disabled for flexibility
- Type definitions in src/types/

### Performance Considerations
- Benchmark system tracks validation performance (target <100ms)
- Multi-tier caching planned for enterprise deployments
- Parallel processing for large-scale scans