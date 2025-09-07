# Claude Code Security Rulesets Generator - Project Overview

## Purpose
A comprehensive CLI tool and enterprise platform for generating, validating, and deploying Claude Code security configurations with zero-bypass deny enforcement. The system prevents users from bypassing security rules and provides enterprise-grade management capabilities.

## Key Features
- **Zero-Bypass Security**: Deny rules that cannot be overridden by users
- **Enterprise Management**: Centralized web console with RBAC and audit trails  
- **Template System**: Pre-built security configurations for different organization types
- **Developer Integration**: Git hooks, CI/CD, and IDE extensions
- **Performance Optimized**: <100ms validation, <200ms CLI response times
- **Compliance Ready**: SOC 2, GDPR, HIPAA reporting capabilities

## Tech Stack
- **Runtime**: Node.js 18.0.0+
- **Language**: TypeScript 5.3.2 with strict mode enabled
- **CLI Framework**: Commander.js 11.1.0
- **UI/Styling**: Chalk 4.1.2 for colored output
- **Validation**: Joi 17.11.0 + custom validation engine
- **Testing**: Jest 29.7.0 with ts-jest
- **Build**: TypeScript compiler with path mapping support
- **Linting**: ESLint with TypeScript and Prettier integration
- **Package Management**: npm

## Main CLI Commands (to be implemented)
- `claude-security init` - Initialize new configuration
- `claude-security generate --template=<template>` - Generate from template
- `claude-security validate` - Validate configuration
- `claude-security deploy --environment=<env>` - Deploy to environment

## Project Structure
```
src/
├── cli/           # Command-line interface (CURRENT TASK)
├── validation/    # Core validation engine  
├── templates/     # Security policy templates
├── config/        # Configuration management
├── types/         # TypeScript type definitions (COMPLETE)
├── utils/         # Utility functions
├── auth/          # Authentication system
├── api/           # REST API server
├── models/        # Data models
├── rbac/          # Role-based access control
├── audit/         # Audit logging system
└── monitoring/    # Performance monitoring
```