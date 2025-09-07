# Development Commands and Workflows

## Essential npm Scripts

### Development
- `npm run dev` - Run CLI in development mode with ts-node
- `npm run build` - Compile TypeScript to dist/ folder
- `npm run build:watch` - Watch mode compilation
- `npm start` - Run compiled CLI from dist/

### Testing
- `npm test` - Run all tests with Jest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage reports
- `npm run test:performance` - Run performance-specific tests

### Code Quality
- `npm run lint` - ESLint check for src/ and tests/
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run validate` - Complete validation (lint + test + build)

### Build & Release
- `npm run clean` - Remove dist/ and coverage/ folders
- `npm run prepare` - Pre-installation build hook
- `npm run prepack` - Pre-packaging validation

## CLI Binary
- **Binary Name**: `claude-security`
- **Entry Point**: `dist/cli/index.js`
- **Development**: Use `npm run dev` to test CLI commands

## System Commands (macOS/Darwin)
- `ls -la` - List files with details
- `find . -name "*.ts" -type f` - Find TypeScript files
- `grep -r "pattern" src/` - Search in source code
- `git status` - Check git status
- `cd /path/to/project` - Change directory

## Testing Strategy
- **Unit Tests**: Individual function/class testing
- **Integration Tests**: Cross-module functionality
- **Performance Tests**: <100ms validation requirement
- **Fixtures**: Reusable test data in tests/fixtures/

## Performance Requirements
- **Validation**: Must complete in <100ms
- **CLI Response**: Must complete in <200ms
- **Build Time**: Optimized for incremental compilation