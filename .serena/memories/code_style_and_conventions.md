# Code Style and Conventions

## TypeScript Configuration
- **Target**: ES2020
- **Module**: CommonJS with ESModuleInterop
- **Strict Mode**: Enabled with all strict checks
- **Path Mapping**: Extensive use of `@/*` aliases for clean imports
- **Declaration Generation**: Source maps and declarations enabled

## Code Style (Prettier)
- **Semi**: true (semicolons required)
- **Quotes**: Single quotes preferred
- **Print Width**: 100 characters (80 for markdown)
- **Tab Width**: 2 spaces, no tabs
- **Trailing Commas**: ES5 style
- **Arrow Functions**: Avoid parentheses when possible

## ESLint Rules (Strict)
- **Type Safety**: Explicit return types and module boundaries required
- **No Any**: Strict TypeScript safety rules enforced
- **Security**: eval, implied-eval, new Function prohibited
- **Performance**: await-in-loop warnings, prefer nullish coalescing
- **Code Quality**: No unused vars (except `_` prefix), prefer const, no var

## Naming Conventions
- **Files**: kebab-case for files and directories
- **Types**: PascalCase for interfaces and types
- **Functions**: camelCase
- **Constants**: SCREAMING_SNAKE_CASE for module-level constants
- **Private Members**: Leading underscore convention

## Import Organization
- Use path mapping extensively (`@/types/*`, `@/cli/*`, etc.)
- Group imports: Node.js built-ins, external packages, internal modules
- Prefer named exports over default exports for consistency

## Error Handling
- Explicit error types and structured error responses
- Use Result-style patterns for validation functions
- Comprehensive error context with location information
- Security-first approach to error messages (no sensitive data leakage)

## Documentation
- TSDoc comments for all public APIs
- Inline comments for complex business logic
- README files at package level, not file level
- Type definitions serve as primary API documentation