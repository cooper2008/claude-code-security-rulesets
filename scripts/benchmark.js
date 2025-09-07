#!/usr/bin/env node

/**
 * CLI script to run performance benchmarks
 * Usage: npm run benchmark [options]
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  scenarios: [],
  iterations: 100,
  concurrent: 10,
  verbose: false,
  outputFormat: 'all', // all, json, html, csv, markdown
  category: null,
  priority: null,
  warmup: 3
};

// Process arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--scenario':
    case '-s':
      options.scenarios.push(args[++i]);
      break;
    case '--iterations':
    case '-i':
      options.iterations = parseInt(args[++i]);
      break;
    case '--concurrent':
    case '-c':
      options.concurrent = parseInt(args[++i]);
      break;
    case '--verbose':
    case '-v':
      options.verbose = true;
      break;
    case '--format':
    case '-f':
      options.outputFormat = args[++i];
      break;
    case '--category':
      options.category = args[++i];
      break;
    case '--priority':
      options.priority = args[++i];
      break;
    case '--warmup':
    case '-w':
      options.warmup = parseInt(args[++i]);
      break;
    case '--help':
    case '-h':
      showHelp();
      process.exit(0);
  }
}

function showHelp() {
  console.log(`
Claude Code Security Rulesets - Performance Benchmark Suite

Usage: npm run benchmark [options]

Options:
  -s, --scenario <name>    Run specific scenario(s) (can be used multiple times)
  -i, --iterations <n>     Number of iterations per scenario (default: 100)
  -c, --concurrent <n>     Number of concurrent users for concurrency tests (default: 10)
  -v, --verbose           Enable verbose output
  -f, --format <type>     Output format: all, json, html, csv, markdown (default: all)
  --category <name>       Run all scenarios in category (validation, cli, cache, concurrency, scale, git)
  --priority <level>      Run scenarios by priority (critical, high, medium, low)
  -w, --warmup <n>        Number of warmup runs (default: 3)
  -h, --help             Show this help message

Examples:
  npm run benchmark                           # Run all benchmarks
  npm run benchmark -s validation-small       # Run specific scenario
  npm run benchmark --category validation     # Run all validation benchmarks
  npm run benchmark --priority critical       # Run only critical benchmarks
  npm run benchmark -i 1000 -c 50            # Custom iterations and concurrency
  npm run benchmark -v -f json               # Verbose mode with JSON output only

Performance Requirements:
  - Validation time: < 100ms (P95)
  - CLI response time: < 200ms (P95)
  - Cached response time: < 10ms (P95)
  - Concurrent operations: 1000+ developers
  - Memory usage: Optimized for large templates

Categories:
  - validation: Template validation performance
  - cli: CLI command response times
  - cache: Cache hit/miss performance
  - concurrency: Concurrent operation handling
  - scale: Large-scale deployment scenarios
  - git: Git integration performance

Report Output:
  Results are saved to benchmark/results/ directory
  - benchmark-<timestamp>.json: Machine-readable JSON
  - benchmark-<timestamp>.html: Interactive HTML report
  - benchmark-<timestamp>.csv: Spreadsheet-compatible CSV
  - benchmark-<timestamp>.md: Markdown report
  - latest.* symlinks point to most recent results
  `);
}

// Build TypeScript if needed
console.log('🔨 Building TypeScript...');
const buildProcess = spawn('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: true
});

buildProcess.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ Build failed');
    process.exit(1);
  }

  console.log('✅ Build complete\n');
  runBenchmarks();
});

function runBenchmarks() {
  // Create benchmark runner script
  const runnerScript = `
const { BenchmarkRunner } = require('../dist/benchmark/index');

async function run() {
  const config = ${JSON.stringify(options)};
  
  const runner = new BenchmarkRunner({
    warmupRuns: config.warmup,
    iterations: config.iterations,
    concurrentUsers: config.concurrent,
    verbose: config.verbose
  });

  try {
    if (config.scenarios.length > 0) {
      // Run specific scenarios
      for (const scenarioName of config.scenarios) {
        const { getScenarioByName } = require('../dist/benchmark/scenarios');
        const scenario = getScenarioByName(scenarioName);
        if (!scenario) {
          console.error(\`❌ Scenario '\${scenarioName}' not found\`);
          continue;
        }
        await runner.runScenario(scenario);
      }
    } else if (config.category) {
      // Run category
      const { getScenariosByCategory } = require('../dist/benchmark/scenarios');
      const scenarios = getScenariosByCategory(config.category);
      if (scenarios.length === 0) {
        console.error(\`❌ No scenarios found for category '\${config.category}'\`);
        process.exit(1);
      }
      for (const scenario of scenarios) {
        await runner.runScenario(scenario);
      }
    } else if (config.priority) {
      // Run by priority
      const { scenarios } = require('../dist/benchmark/scenarios');
      const priorityScenarios = scenarios.filter(s => s.priority === config.priority);
      if (priorityScenarios.length === 0) {
        console.error(\`❌ No scenarios found for priority '\${config.priority}'\`);
        process.exit(1);
      }
      for (const scenario of priorityScenarios) {
        await runner.runScenario(scenario);
      }
    } else {
      // Run all benchmarks
      await runner.runAll();
    }

    console.log('\\n✅ Benchmarks completed successfully');
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

run();
`;

  // Write and execute runner script
  const tempScript = path.join(__dirname, '.benchmark-runner.js');
  fs.writeFileSync(tempScript, runnerScript);

  const benchmarkProcess = spawn('node', [tempScript], {
    stdio: 'inherit',
    cwd: process.cwd()
  });

  benchmarkProcess.on('close', (code) => {
    // Clean up temp script
    try {
      fs.unlinkSync(tempScript);
    } catch (err) {
      // Ignore cleanup errors
    }

    if (code !== 0) {
      console.error('❌ Benchmark execution failed');
      process.exit(1);
    }

    console.log('🎉 All benchmarks completed successfully!');
    console.log('📊 View results in benchmark/results/latest.html');
  });
}

// Handle interruption
process.on('SIGINT', () => {
  console.log('\n⚠️  Benchmark interrupted by user');
  process.exit(130);
});