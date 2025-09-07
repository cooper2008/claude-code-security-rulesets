# Contributing to Claude Code Security Rulesets Generator

Thank you for your interest in contributing to the Claude Code Security Rulesets Generator! This document provides guidelines and information for contributors.

## 📋 Table of Contents

1. [Getting Started](#getting-started)
2. [Development Environment](#development-environment)
3. [Contributing Guidelines](#contributing-guidelines)
4. [Code Standards](#code-standards)
5. [Testing](#testing)
6. [Documentation](#documentation)
7. [Submitting Changes](#submitting-changes)
8. [Community and Support](#community-and-support)

## 🚀 Getting Started

### Ways to Contribute

We welcome contributions in many forms:

- **🐛 Bug Reports**: Found a bug? Let us know!
- **✨ Feature Requests**: Have an idea for improvement?
- **📝 Documentation**: Help improve our docs
- **🔧 Code Contributions**: Fix bugs or add features
- **🎨 Templates**: Contribute new security templates
- **🔌 Plugins**: Create plugins for extended functionality
- **📊 Examples**: Share practical usage examples
- **🧪 Testing**: Help improve test coverage
- **🌐 Translations**: Help internationalize the tool

### Prerequisites

Before contributing, ensure you have:

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Git**: For version control
- **TypeScript**: Familiarity with TypeScript development
- **Jest**: Understanding of Jest testing framework (for code contributions)

## 🛠️ Development Environment

### Initial Setup

1. **Fork the Repository**
   ```bash
   # Fork the repo on GitHub, then clone your fork
   git clone https://github.com/YOUR-USERNAME/claude-code-security-rulesets.git
   cd claude-code-security-rulesets
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Project**
   ```bash
   npm run build
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

5. **Link for Development**
   ```bash
   npm link
   # Now you can use 'claude-security' command with your local changes
   ```

### Development Workflow

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make Your Changes**
   - Write code following our [coding standards](#code-standards)
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**
   ```bash
   # Run all tests
   npm test
   
   # Run specific test file
   npm test -- src/path/to/test.test.ts
   
   # Run tests in watch mode during development
   npm run test:watch
   
   # Run performance benchmarks
   npm run benchmark
   ```

4. **Validate Code Quality**
   ```bash
   # Lint your code
   npm run lint
   
   # Fix linting issues automatically
   npm run lint:fix
   
   # Format code
   npm run format
   
   # Build to check for TypeScript errors
   npm run build
   ```

### Project Structure

```
src/
├── cli/                 # CLI command implementations
├── templates/           # Template system
│   ├── engine.ts        # Template engine
│   ├── loader.ts        # Template loading
│   ├── merger.ts        # Configuration merging
│   └── presets/         # Built-in templates
├── validation/          # Configuration validation
├── plugins/             # Plugin system
├── distribution/        # Enterprise distribution
├── types/              # TypeScript type definitions
└── utils/              # Utility functions

tests/
├── unit/               # Unit tests
├── integration/        # Integration tests
├── performance/        # Performance tests
└── fixtures/           # Test data and fixtures

docs/                   # Documentation
examples/               # Usage examples
scripts/                # Build and utility scripts
```

## 📏 Contributing Guidelines

### Issue Guidelines

#### Reporting Bugs

When reporting bugs, please include:

- **Clear Title**: Descriptive title summarizing the issue
- **Environment**: OS, Node.js version, CLI version
- **Steps to Reproduce**: Exact steps that cause the issue
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Error Messages**: Full error messages and stack traces
- **Configuration**: Relevant configuration files (sanitized)

**Bug Report Template:**
```markdown
## Bug Description
Brief description of the issue

## Environment
- OS: [e.g., macOS 14.0, Ubuntu 22.04]
- Node.js: [e.g., 18.19.0]
- CLI Version: [e.g., 1.0.0]

## Steps to Reproduce
1. Run command: `claude-security ...`
2. Expected: ...
3. Actual: ...

## Error Output
```
[paste error output here]
```

## Additional Context
Any other relevant information
```

#### Feature Requests

For feature requests, please provide:

- **Problem Statement**: What problem does this solve?
- **Proposed Solution**: How should it work?
- **Use Cases**: Who would benefit and how?
- **Alternatives**: Other solutions you've considered
- **Examples**: Mock-ups, code examples, or similar features

### Pull Request Guidelines

#### Before Submitting

- [ ] Fork the repository and create a feature branch
- [ ] Write clear, self-documenting code
- [ ] Add tests for new functionality
- [ ] Update documentation for user-facing changes
- [ ] Ensure all tests pass
- [ ] Run linting and formatting tools
- [ ] Verify TypeScript compilation succeeds
- [ ] Test CLI commands manually if applicable

#### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed
- [ ] Performance benchmarks run (if applicable)

## Documentation
- [ ] README updated
- [ ] API documentation updated
- [ ] Examples updated/added
- [ ] CHANGELOG updated

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Tests pass locally
- [ ] No console warnings/errors
- [ ] Commit messages are clear and descriptive
```

## 🎨 Code Standards

### TypeScript Guidelines

- **Strict Types**: Use strict TypeScript configuration
- **Interfaces over Types**: Prefer interfaces for object shapes
- **Explicit Return Types**: Declare return types for public functions
- **No `any`**: Avoid `any` type; use proper types or `unknown`

```typescript
// Good
interface SecurityRule {
  pattern: string;
  action: 'deny' | 'allow' | 'ask';
}

function validateRule(rule: SecurityRule): ValidationResult {
  // Implementation
}

// Avoid
function validateRule(rule: any): any {
  // Implementation
}
```

### Naming Conventions

- **Files**: kebab-case (`template-engine.ts`)
- **Classes**: PascalCase (`TemplateEngine`)
- **Functions/Variables**: camelCase (`validateConfiguration`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRY_ATTEMPTS`)
- **Interfaces**: PascalCase (`SecurityTemplate`)
- **Enums**: PascalCase (`DeploymentStrategy`)

### Code Organization

- **Single Responsibility**: Each function/class has one clear purpose
- **Small Functions**: Keep functions focused and concise
- **Error Handling**: Use proper error types and handling
- **Comments**: Document complex logic and public APIs
- **Imports**: Group and order imports logically

```typescript
// External dependencies first
import { Command } from 'commander';
import * as fs from 'fs-extra';

// Internal imports grouped by domain
import { SecurityTemplate } from '../types';
import { TemplateEngine } from '../templates/engine';
import { validateConfiguration } from '../validation';
```

### Error Handling

- **Custom Error Types**: Create specific error classes
- **Error Context**: Provide meaningful error messages
- **Error Codes**: Use consistent error codes for CLI

```typescript
export class TemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Template not found: ${templateId}`);
    this.name = 'TemplateNotFoundError';
  }
}

// Usage
try {
  const template = await templateEngine.getTemplate(id);
} catch (error) {
  if (error instanceof TemplateNotFoundError) {
    process.exit(1);
  }
  throw error;
}
```

## 🧪 Testing

### Testing Requirements

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test component interactions
- **Performance Tests**: Verify performance requirements
- **CLI Tests**: Test command-line interfaces

### Writing Tests

```typescript
// Unit test example
describe('TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  describe('applyTemplate', () => {
    it('should apply template successfully', async () => {
      // Arrange
      const templateId = 'development';
      const expected = { /* expected config */ };

      // Act
      const result = await engine.applyTemplate(templateId);

      // Assert
      expect(result.config).toEqual(expected);
    });

    it('should throw error for non-existent template', async () => {
      // Arrange
      const templateId = 'non-existent';

      // Act & Assert
      await expect(engine.applyTemplate(templateId))
        .rejects.toThrow(TemplateNotFoundError);
    });
  });
});
```

### Test Categories

#### Unit Tests (`tests/unit/`)
- Test individual functions and classes in isolation
- Mock external dependencies
- Fast execution (<1s total)

#### Integration Tests (`tests/integration/`)
- Test component interactions
- Test CLI commands end-to-end
- Use temporary directories for file operations

#### Performance Tests (`tests/performance/`)
- Verify performance requirements are met
- Benchmark critical operations
- Test scalability limits

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- src/templates/engine.test.ts

# Tests matching pattern
npm test -- --testNamePattern="applyTemplate"

# Coverage report
npm run test:coverage

# Performance tests
npm run test:performance

# Watch mode for development
npm run test:watch
```

## 📚 Documentation

### Documentation Requirements

All user-facing changes require documentation updates:

- **CLI Commands**: Update CLI reference
- **APIs**: Update API documentation
- **Templates**: Document new templates
- **Examples**: Provide usage examples
- **Breaking Changes**: Update migration guides

### Documentation Standards

- **Clear Language**: Write for your target audience
- **Code Examples**: Include working code examples
- **Step-by-Step**: Provide clear instructions
- **Screenshots**: Use screenshots for UI guidance
- **Cross-References**: Link to related documentation

### Documentation Types

#### API Documentation
```typescript
/**
 * Applies a security template to generate configuration.
 * 
 * @param templateId - ID of the template to apply
 * @param options - Template application options
 * @returns Promise resolving to the generated configuration
 * @throws TemplateNotFoundError when template doesn't exist
 * 
 * @example
 * ```typescript
 * const config = await engine.applyTemplate('production', {
 *   parameters: { projectPath: '/app' }
 * });
 * ```
 */
async applyTemplate(
  templateId: string, 
  options?: TemplateOptions
): Promise<TemplateResult> {
  // Implementation
}
```

#### CLI Documentation
```markdown
### `generate`

Generate security configuration from templates.

**Usage:**
```bash
claude-security generate --template production --output config.json
```

**Options:**
- `--template, -t <name>`: Template to use (required)
- `--output, -o <path>`: Output file path (default: .claude/settings.json)
- `--parameters, -p <params>`: Template parameters

**Examples:**
```bash
# Basic generation
claude-security generate --template development

# With parameters
claude-security generate -t enterprise -p "projectPath=/app"
```
```

## 📤 Submitting Changes

### Commit Guidelines

#### Commit Message Format

```
type(scope): brief description

Longer description explaining the change, its motivation,
and any breaking changes or migration notes.

Fixes #123
```

#### Commit Types
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Formatting, missing semicolons, etc.
- **refactor**: Code restructuring without behavior change
- **perf**: Performance improvements
- **test**: Adding or modifying tests
- **chore**: Build process, auxiliary tools, etc.

#### Examples
```bash
feat(templates): add HIPAA compliance template

Add comprehensive HIPAA compliance template with PHI protection
rules and healthcare-specific security patterns.

Fixes #45

---

fix(validation): resolve rule conflict detection bug

Rule conflict detection was not properly handling wildcard patterns
in deny rules. This fix ensures proper pattern matching and
conflict resolution.

Fixes #67

---

docs(cli): update generate command documentation

Add examples for new parameter syntax and clarify template
parameter usage patterns.
```

### Pull Request Process

1. **Push to Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create Pull Request**
   - Use the GitHub web interface
   - Fill out the pull request template completely
   - Link to related issues
   - Add screenshots for UI changes

3. **Code Review Process**
   - Maintainers will review your changes
   - Address feedback promptly
   - Make requested changes in additional commits
   - Discussion happens in the pull request comments

4. **Merge Requirements**
   - [ ] All checks pass (tests, linting, build)
   - [ ] At least one approving review from maintainer
   - [ ] All conversations resolved
   - [ ] Branch is up to date with main

### Release Process

Releases are handled by maintainers:

1. **Version Bump**: Semantic versioning (semver)
2. **Changelog**: Update CHANGELOG.md
3. **Tag**: Create git tag for version
4. **Publish**: Publish to npm registry
5. **GitHub Release**: Create release notes

## 🤝 Community and Support

### Getting Help

- **GitHub Discussions**: Ask questions and share ideas
- **GitHub Issues**: Report bugs and request features
- **Documentation**: Check our comprehensive docs
- **Examples**: Look at practical examples

### Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) code of conduct. In summary:

- **Be Respectful**: Treat everyone with respect
- **Be Inclusive**: Welcome all contributors
- **Be Professional**: Focus on technical discussions
- **Be Collaborative**: Work together constructively

### Recognition

Contributors are recognized in several ways:

- **Contributors List**: Listed in README.md
- **Release Notes**: Major contributions mentioned
- **Special Thanks**: Significant contributors highlighted

### Maintainer Responsibilities

Maintainers commit to:

- **Timely Reviews**: Review pull requests within 1 week
- **Clear Communication**: Provide constructive feedback
- **Consistent Standards**: Apply standards fairly
- **Community Support**: Help contributors succeed

## 🎉 Thank You

Thank you for contributing to the Claude Code Security Rulesets Generator! Your contributions help make Claude Code more secure for everyone.

### Quick Links

- **[Development Setup](#development-environment)**
- **[Coding Standards](#code-standards)**
- **[Testing Guide](#testing)**
- **[Documentation Standards](#documentation)**
- **[Issue Templates](https://github.com/your-org/claude-code-security-rulesets/issues/new/choose)**
- **[Pull Request Template](https://github.com/your-org/claude-code-security-rulesets/compare)**

---

**Happy Contributing!** 🚀