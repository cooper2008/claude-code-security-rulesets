# Validation Engine

High-performance security validation engine for Claude Code Security Rulesets with zero-bypass enforcement and <100ms performance guarantee.

## Features

### Zero-Bypass Security
- **Deny Rule Enforcement**: Deny rules cannot be overridden by allow or ask rules
- **Conflict Detection**: Automatically detects overlapping patterns and contradictory rules
- **Security Analysis**: Identifies weak patterns, bypass vectors, and security issues
- **Precedence Enforcement**: DENY > ASK > ALLOW rule precedence

### Performance Optimization
- **Sub-100ms Validation**: Optimized for <100ms validation time
- **Intelligent Caching**: Hash-based cache with LRU eviction
- **Worker Thread Support**: Parallel processing for batch validations
- **Performance Metrics**: Detailed timing breakdowns and monitoring

### Pattern Support
- **Glob Patterns**: `*.exe`, `**/*.js`, `path/*/file`
- **Regex Patterns**: Full regex support with validation
- **Literal Patterns**: Exact string matching
- **Pattern Analysis**: Automatic detection and normalization

## Usage

### Basic Validation

```typescript
import { ValidationEngine } from '@/validation/engine';
import { ClaudeCodeConfiguration } from '@/types';

const engine = new ValidationEngine();

const config: ClaudeCodeConfiguration = {
  permissions: {
    deny: ['exec', 'eval', '*.exe'],
    allow: ['read/*', 'write/*'],
    ask: ['delete/*']
  }
};

const result = await engine.validate(config);

if (result.isValid) {
  console.log('Configuration is secure!');
} else {
  console.log('Security issues found:', result.errors);
}
```

### Custom Configuration

```typescript
const engine = new ValidationEngine({
  maxWorkers: 4,
  cache: {
    enabled: true,
    maxEntries: 1000,
    maxMemoryMB: 50,
    ttlMs: 5 * 60 * 1000
  },
  performance: {
    targetMs: 100,
    strictTimeout: false
  },
  security: {
    enforceZeroBypass: true,
    detectWeakPatterns: true,
    requireDenyRules: false
  }
});
```

### Batch Validation

```typescript
const response = await engine.validateBatch({
  id: 'batch-1',
  configurations: [config1, config2, config3],
  options: { parallel: true }
});

console.log(`Validated ${response.count} configs in ${response.totalTime}ms`);
```

## Validation Results

### Result Structure

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  conflicts: RuleConflict[];
  performance: ValidationPerformance;
  suggestions: ResolutionSuggestion[];
  configurationHash?: string;
}
```

### Error Types

- **SECURITY_VIOLATION**: Zero-bypass violations and critical security issues
- **INVALID_PATTERN**: Malformed or invalid rule patterns
- **RULE_CONFLICT**: Conflicting or overlapping rules
- **MISSING_REQUIRED_FIELD**: Required configuration missing

### Conflict Types

- **ALLOW_OVERRIDES_DENY**: Allow/ask rule bypasses deny rule (critical)
- **OVERLAPPING_PATTERNS**: Rules with overlapping patterns
- **CONTRADICTORY_RULES**: Rules that contradict each other
- **PRECEDENCE_AMBIGUITY**: Unclear rule precedence

## Performance Optimization

### Caching Strategy

The engine uses a multi-level caching strategy:
1. **Hash-based Invalidation**: Configuration changes invalidate cache
2. **LRU Eviction**: Least recently used entries are evicted
3. **TTL Expiration**: Entries expire after configured time
4. **Memory Limits**: Cache respects memory boundaries

### Performance Metrics

```typescript
interface ValidationPerformance {
  validationTime: number;
  rulesProcessed: number;
  performanceTarget: {
    target: number;
    achieved: boolean;
  };
  breakdown?: {
    parsing: number;
    ruleValidation: number;
    conflictDetection: number;
    suggestionGeneration: number;
  };
}
```

## Security Features

### Zero-Bypass Enforcement

```typescript
// This configuration will fail validation
const insecure = {
  permissions: {
    deny: ['dangerous/*'],
    allow: ['*']  // Would bypass deny rule!
  }
};

// Error: ZERO-BYPASS VIOLATION
// Allow rule "*" could bypass deny rule "dangerous/*"
```

### Weak Pattern Detection

```typescript
// Weak patterns are detected
const weak = {
  permissions: {
    deny: ['..', '.']  // Too weak, easily bypassed
  }
};

// Warning: Weak deny pattern detected
// Can be bypassed with encoding or path manipulation
```

### Security Analysis

The engine performs comprehensive security analysis:
- Identifies bypass vectors
- Calculates security scores
- Provides mitigation recommendations
- Suggests pattern improvements

## Cache Management

### Export/Import Cache

```typescript
// Export cache for persistence
const cacheData = engine.exportCache();
fs.writeFileSync('cache.json', cacheData);

// Import cache on startup
const savedCache = fs.readFileSync('cache.json', 'utf-8');
engine.importCache(savedCache);
```

### Cache Statistics

```typescript
const stats = engine.getCacheStats();
console.log(`Cache hit rate: ${stats.hitRate}%`);
console.log(`Avg retrieval time: ${stats.avgCacheRetrievalTime}ms`);
```

## Advanced Features

### Rule Statistics

```typescript
const stats = engine.getRuleStatistics(config);
console.log(`Total rules: ${stats.totalRules}`);
console.log(`Complexity: ${stats.complexity.averagePatternLength}`);
console.log(`Coverage: ${stats.coverage.estimatedCoverage}%`);
```

### Custom Validation Options

```typescript
const options: ValidationOptions = {
  strictMode: true,
  skipConflictDetection: false,
  skipCache: false,
  timeout: 100,
  parallel: true,
  workerCount: 4,
  customPatterns: ['myapp/*']
};

const result = await engine.validate(config, options);
```

## Best Practices

1. **Always enforce zero-bypass**: Keep `enforceZeroBypass: true`
2. **Use specific patterns**: Avoid overly broad patterns like `*`
3. **Monitor performance**: Track validation times and cache hit rates
4. **Regular security audits**: Review conflict and security reports
5. **Cache warming**: Pre-cache common configurations on startup

## Architecture

```
┌─────────────────────────────────────────┐
│           Validation Engine              │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  │
│  │     Pattern Normalization         │  │
│  └───────────────────────────────────┘  │
│                   ↓                      │
│  ┌───────────────────────────────────┐  │
│  │      Rule Validation              │  │
│  └───────────────────────────────────┘  │
│                   ↓                      │
│  ┌───────────────────────────────────┐  │
│  │   Conflict Detection              │  │
│  │   (Zero-Bypass Enforcement)       │  │
│  └───────────────────────────────────┘  │
│                   ↓                      │
│  ┌───────────────────────────────────┐  │
│  │     Security Analysis             │  │
│  └───────────────────────────────────┘  │
│                   ↓                      │
│  ┌───────────────────────────────────┐  │
│  │   Suggestion Generation           │  │
│  └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│  Cache Layer    │    Worker Pool        │
└─────────────────────────────────────────┘
```

## Testing

Run the test suite:

```bash
npm test tests/validation/engine.test.ts
```

Run performance benchmarks:

```bash
npm run test:performance
```

## License

MIT