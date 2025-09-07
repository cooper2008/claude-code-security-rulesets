# Performance Benchmark Suite

Comprehensive performance benchmarking suite for Claude Code Security Rulesets Generator, designed to ensure enterprise-scale performance with 1000+ developers.

## Performance Requirements

| Metric | Target | Priority |
|--------|--------|----------|
| Template Validation | < 100ms (P95) | Critical |
| CLI Response Time | < 200ms (P95) | Critical |
| Cached Response | < 10ms (P95) | Critical |
| Memory Usage | Optimized | High |
| Concurrent Users | 1000+ | Critical |
| Large Templates | 1000+ rules | High |

## Quick Start

```bash
# Run all benchmarks
npm run benchmark

# Quick test (10 iterations, 1 warmup)
npm run benchmark:quick

# Run critical benchmarks only
npm run benchmark:critical

# Run specific category
npm run benchmark:validation
npm run benchmark:cli
npm run benchmark:cache
npm run benchmark:concurrent
npm run benchmark:scale

# View latest report
npm run benchmark:report
```

## Benchmark Categories

### 1. Validation Performance (`validation`)
Tests template validation performance across different sizes:
- Small templates (10 rules)
- Medium templates (100 rules)
- Large templates (1000 rules)
- Extra large templates (5000+ rules)
- Conflict detection
- Nested rule structures
- Schema compliance

### 2. CLI Response Times (`cli`)
Measures CLI command performance:
- `init` command response
- `validate` command response
- `apply` template command
- `list` templates command
- `generate` ruleset command
- `audit` command response

### 3. Cache Performance (`cache`)
Tests caching system efficiency:
- Cache hit performance
- Cache miss and populate
- LRU eviction
- Bulk operations
- TTL expiry handling
- Multi-level cache

### 4. Concurrent Operations (`concurrency`)
Simulates multi-user scenarios:
- 100 concurrent validations
- 1000 concurrent validations
- 50 concurrent CLI commands
- 500 concurrent cache operations
- Concurrent conflict detection

### 5. Scale Testing (`scale`)
Enterprise-scale scenarios:
- 1000+ developer simulation
- Enterprise template library
- Complex inheritance chains
- Large organization workflows

### 6. Git Integration (`git`)
Git hook and integration performance:
- Pre-commit hook execution
- Diff analysis
- Merge conflict detection

## CLI Options

```bash
npm run benchmark [options]

Options:
  -s, --scenario <name>    Run specific scenario(s)
  -i, --iterations <n>     Number of iterations (default: 100)
  -c, --concurrent <n>     Concurrent users (default: 10)
  -v, --verbose           Verbose output
  -f, --format <type>     Output format (all|json|html|csv|markdown)
  --category <name>       Run category benchmarks
  --priority <level>      Run by priority (critical|high|medium|low)
  -w, --warmup <n>        Warmup runs (default: 3)
  -h, --help             Show help
```

## Examples

```bash
# Run specific scenario with custom iterations
npm run benchmark -s validation-large-template -i 1000

# Run validation benchmarks with verbose output
npm run benchmark --category validation -v

# High concurrency test
npm run benchmark -s concurrent-validations-1000 -c 100

# Generate JSON report only
npm run benchmark -f json

# Run multiple specific scenarios
npm run benchmark -s validation-small -s cli-response-init
```

## Output Reports

Results are saved to `benchmark/results/` with timestamps:

### Files Generated
- `benchmark-<timestamp>.json` - Machine-readable JSON
- `benchmark-<timestamp>.html` - Interactive HTML report
- `benchmark-<timestamp>.csv` - Spreadsheet-compatible
- `benchmark-<timestamp>.md` - Markdown report
- `latest.*` - Symlinks to most recent results

### Report Contents
- Performance metrics (min, max, mean, median, P50, P90, P95, P99)
- Memory usage statistics
- Success rates and error counts
- Throughput measurements
- System information
- Visual charts and graphs

## Performance Monitoring

The benchmark suite includes production monitoring utilities:

### PerformanceMonitor
```typescript
import { PerformanceMonitor } from './src/benchmark/monitor';

const monitor = new PerformanceMonitor();
monitor.start();
// ... your code ...
const metrics = monitor.stop();
```

### ProductionMonitor
```typescript
import { ProductionMonitor } from './src/benchmark/monitor';

const monitor = new ProductionMonitor({
  cpuUsage: 80,      // Alert if > 80%
  memoryUsage: 1e9,  // Alert if > 1GB
  eventLoopLag: 100, // Alert if > 100ms
  responseTime: 500  // Alert if > 500ms
});

monitor.on('alert', (alert) => {
  console.warn('Performance alert:', alert);
});
```

### MetricsCollector
```typescript
import { MetricsCollector } from './src/benchmark/metrics';

const metrics = new MetricsCollector();
metrics.record('validation', 'time', 45.2);
metrics.record('cache', 'hits', 1);

const stats = metrics.getStats('validation', 'time');
console.log('Validation P95:', stats.p95);
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Run Performance Benchmarks
  run: |
    npm run benchmark:critical -f json
    node -e "
      const results = require('./benchmark/results/latest.json');
      const failed = results.results.filter(r => 
        r.scenario.includes('validation') && r.metrics.p95 > 100 ||
        r.scenario.includes('cli-response') && r.metrics.p95 > 200 ||
        r.scenario.includes('cache') && r.metrics.p95 > 10
      );
      if (failed.length > 0) {
        console.error('Performance requirements not met:', failed);
        process.exit(1);
      }
    "
```

### Jenkins Pipeline
```groovy
stage('Performance Benchmarks') {
  steps {
    sh 'npm run benchmark:critical'
    publishHTML([
      reportDir: 'benchmark/results',
      reportFiles: 'latest.html',
      reportName: 'Performance Report'
    ])
  }
}
```

## Realistic Test Data

The benchmark suite uses realistic data generators:

- **Templates**: Small (10), Medium (100), Large (1000), XLarge (5000+) rules
- **Projects**: Full project structures with TypeScript, React, tests
- **Conflicts**: Intentional rule conflicts for detection testing
- **Git Diffs**: Realistic change sets for hook testing
- **Organizations**: Simulated 1000+ developer environments

## Performance Tips

1. **Run benchmarks on dedicated hardware** for consistent results
2. **Close other applications** to reduce noise
3. **Use warmup runs** to stabilize JIT compilation
4. **Monitor system resources** during benchmarks
5. **Compare results** across versions for regression detection
6. **Set up alerts** for performance degradation in CI/CD

## Troubleshooting

### Out of Memory
Increase Node.js heap size:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run benchmark
```

### Slow Benchmarks
Reduce iterations for quick tests:
```bash
npm run benchmark:quick
```

### Permission Errors
Ensure write access to benchmark/results directory:
```bash
mkdir -p benchmark/results
chmod 755 benchmark/results
```

## Contributing

When adding new features, include corresponding benchmarks:

1. Add scenario to `src/benchmark/scenarios.ts`
2. Set appropriate category and priority
3. Include in relevant test suites
4. Document expected performance
5. Update this README

## License

MIT - See LICENSE file for details