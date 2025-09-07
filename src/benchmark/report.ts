/**
 * Benchmark report generator
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { BenchmarkReport, BenchmarkResult } from './types';

export class ReportGenerator {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  /**
   * Generate HTML report
   */
  async generateHTML(report: BenchmarkReport, outputPath: string): Promise<void> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Code Security Rulesets - Performance Benchmark Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        
        h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .subtitle {
            opacity: 0.9;
            font-size: 1.1rem;
        }
        
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .summary-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .summary-label {
            font-size: 0.9rem;
            color: #666;
            margin-bottom: 5px;
        }
        
        .summary-value {
            font-size: 1.8rem;
            font-weight: bold;
            color: #333;
        }
        
        .summary-value.success {
            color: #4caf50;
        }
        
        .summary-value.warning {
            color: #ff9800;
        }
        
        .summary-value.error {
            color: #f44336;
        }
        
        .requirements {
            padding: 30px;
            background: white;
        }
        
        h2 {
            font-size: 1.8rem;
            margin-bottom: 20px;
            color: #333;
        }
        
        .requirement-grid {
            display: grid;
            gap: 15px;
        }
        
        .requirement {
            display: flex;
            align-items: center;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #ccc;
        }
        
        .requirement.pass {
            border-left-color: #4caf50;
            background: #e8f5e9;
        }
        
        .requirement.fail {
            border-left-color: #f44336;
            background: #ffebee;
        }
        
        .requirement-icon {
            font-size: 1.5rem;
            margin-right: 15px;
        }
        
        .requirement-details {
            flex: 1;
        }
        
        .requirement-name {
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        .requirement-metrics {
            display: flex;
            gap: 20px;
            font-size: 0.9rem;
            color: #666;
        }
        
        .results {
            padding: 30px;
        }
        
        .scenario-grid {
            display: grid;
            gap: 20px;
        }
        
        .scenario {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
        }
        
        .scenario-header {
            background: #f8f9fa;
            padding: 15px 20px;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .scenario-name {
            font-weight: bold;
            font-size: 1.1rem;
            margin-bottom: 5px;
        }
        
        .scenario-description {
            color: #666;
            font-size: 0.9rem;
        }
        
        .scenario-body {
            padding: 20px;
        }
        
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .metric {
            text-align: center;
        }
        
        .metric-label {
            font-size: 0.8rem;
            color: #666;
            margin-bottom: 5px;
        }
        
        .metric-value {
            font-size: 1.2rem;
            font-weight: bold;
            color: #333;
        }
        
        .chart-container {
            margin-top: 20px;
            height: 200px;
            position: relative;
        }
        
        .chart {
            width: 100%;
            height: 100%;
        }
        
        .percentile-bar {
            display: flex;
            align-items: center;
            margin-top: 20px;
            background: #f8f9fa;
            border-radius: 4px;
            overflow: hidden;
            height: 30px;
        }
        
        .percentile-segment {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.8rem;
            color: white;
            position: relative;
        }
        
        .p50 { background: #4caf50; }
        .p90 { background: #ff9800; }
        .p95 { background: #ff5722; }
        .p99 { background: #f44336; }
        
        .system-info {
            padding: 30px;
            background: #f8f9fa;
            border-top: 1px solid #e0e0e0;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        
        .info-item {
            display: flex;
            align-items: center;
        }
        
        .info-label {
            font-weight: bold;
            margin-right: 10px;
        }
        
        .info-value {
            color: #666;
        }
        
        footer {
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 0.9rem;
            background: #f8f9fa;
        }
        
        @media (max-width: 768px) {
            .summary {
                grid-template-columns: 1fr;
            }
            
            .metrics-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🚀 Performance Benchmark Report</h1>
            <div class="subtitle">Claude Code Security Rulesets Generator v${report.version}</div>
            <div class="subtitle">${new Date(report.timestamp).toLocaleString()}</div>
        </header>
        
        <div class="summary">
            ${this.generateSummaryCards(report)}
        </div>
        
        <div class="requirements">
            <h2>📋 Performance Requirements</h2>
            <div class="requirement-grid">
                ${this.generateRequirementChecks(report)}
            </div>
        </div>
        
        <div class="results">
            <h2>📊 Scenario Results</h2>
            <div class="scenario-grid">
                ${report.results.map(result => this.generateScenarioCard(result)).join('')}
            </div>
        </div>
        
        <div class="system-info">
            <h2>💻 System Information</h2>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Platform:</span>
                    <span class="info-value">${report.system.platform}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Release:</span>
                    <span class="info-value">${report.system.release}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">CPUs:</span>
                    <span class="info-value">${report.system.cpus}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Memory:</span>
                    <span class="info-value">${(report.system.memory / 1024 / 1024 / 1024).toFixed(2)} GB</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Node Version:</span>
                    <span class="info-value">${report.system.nodeVersion}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Iterations:</span>
                    <span class="info-value">${report.config.iterations}</span>
                </div>
            </div>
        </div>
        
        <footer>
            <p>Generated by Claude Code Security Rulesets Benchmark Suite</p>
            <p>${new Date().toLocaleString()}</p>
        </footer>
    </div>
    
    <script>
        // Add interactive features here if needed
        console.log('Benchmark Report Loaded', ${JSON.stringify(report.summary)});
    </script>
</body>
</html>
    `;

    await fs.writeFile(outputPath, html);
  }

  /**
   * Generate summary cards HTML
   */
  private generateSummaryCards(report: BenchmarkReport): string {
    const successRateClass = report.summary.averageSuccessRate >= 95 ? 'success' : 
                             report.summary.averageSuccessRate >= 80 ? 'warning' : 'error';

    return `
        <div class="summary-card">
            <div class="summary-label">Total Scenarios</div>
            <div class="summary-value">${report.summary.totalScenarios}</div>
        </div>
        <div class="summary-card">
            <div class="summary-label">Total Iterations</div>
            <div class="summary-value">${report.summary.totalIterations.toLocaleString()}</div>
        </div>
        <div class="summary-card">
            <div class="summary-label">Total Duration</div>
            <div class="summary-value">${(report.summary.totalDuration / 1000).toFixed(1)}s</div>
        </div>
        <div class="summary-card">
            <div class="summary-label">Success Rate</div>
            <div class="summary-value ${successRateClass}">${report.summary.averageSuccessRate.toFixed(1)}%</div>
        </div>
    `;
  }

  /**
   * Generate requirement checks HTML
   */
  private generateRequirementChecks(report: BenchmarkReport): string {
    const requirements = [
      { name: 'Validation Time', target: '< 100ms', key: 'validation', limit: 100 },
      { name: 'CLI Response Time', target: '< 200ms', key: 'cli-response', limit: 200 },
      { name: 'Cached Response Time', target: '< 10ms', key: 'cache', limit: 10 },
      { name: 'Concurrent Operations', target: '1000+ developers', key: 'concurrent-validations-1000', limit: 1000 }
    ];

    return requirements.map(req => {
      const result = report.results.find(r => r.scenario.includes(req.key));
      if (!result) return '';

      const value = req.key.includes('concurrent') ? result.successRate : result.metrics.p95;
      const pass = req.key.includes('concurrent') ? value === 100 : value < req.limit;
      
      return `
        <div class="requirement ${pass ? 'pass' : 'fail'}">
            <div class="requirement-icon">${pass ? '✅' : '❌'}</div>
            <div class="requirement-details">
                <div class="requirement-name">${req.name}</div>
                <div class="requirement-metrics">
                    <span>Target: ${req.target}</span>
                    <span>Actual: ${req.key.includes('concurrent') ? value + '%' : value.toFixed(2) + 'ms'}</span>
                </div>
            </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Generate scenario card HTML
   */
  private generateScenarioCard(result: BenchmarkResult): string {
    return `
        <div class="scenario">
            <div class="scenario-header">
                <div class="scenario-name">${result.scenario}</div>
                <div class="scenario-description">${result.description}</div>
            </div>
            <div class="scenario-body">
                <div class="metrics-grid">
                    <div class="metric">
                        <div class="metric-label">Min</div>
                        <div class="metric-value">${result.metrics.min.toFixed(2)}ms</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">Mean</div>
                        <div class="metric-value">${result.metrics.mean.toFixed(2)}ms</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">P95</div>
                        <div class="metric-value">${result.metrics.p95.toFixed(2)}ms</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">P99</div>
                        <div class="metric-value">${result.metrics.p99.toFixed(2)}ms</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">Max</div>
                        <div class="metric-value">${result.metrics.max.toFixed(2)}ms</div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">Success</div>
                        <div class="metric-value">${result.successRate.toFixed(1)}%</div>
                    </div>
                </div>
                
                ${this.generatePercentileBar(result)}
                
                ${result.memory.avgHeapUsed > 0 ? `
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                        <div style="font-weight: bold; margin-bottom: 10px;">Memory Usage</div>
                        <div style="display: flex; gap: 20px;">
                            <span>Avg Heap: ${(result.memory.avgHeapUsed / 1024 / 1024).toFixed(2)}MB</span>
                            <span>Max Heap: ${(result.memory.maxHeapUsed / 1024 / 1024).toFixed(2)}MB</span>
                        </div>
                    </div>
                ` : ''}
                
                ${result.throughput ? `
                    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
                        <div style="font-weight: bold; margin-bottom: 10px;">Throughput</div>
                        <div>${result.throughput.toFixed(2)} req/s</div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
  }

  /**
   * Generate percentile bar visualization
   */
  private generatePercentileBar(result: BenchmarkResult): string {
    const max = result.metrics.max;
    const p50Width = (result.metrics.p50 / max) * 100;
    const p90Width = ((result.metrics.p90 - result.metrics.p50) / max) * 100;
    const p95Width = ((result.metrics.p95 - result.metrics.p90) / max) * 100;
    const p99Width = ((result.metrics.p99 - result.metrics.p95) / max) * 100;
    const remainingWidth = ((max - result.metrics.p99) / max) * 100;

    return `
        <div class="percentile-bar">
            <div class="percentile-segment p50" style="width: ${p50Width}%">
                <span style="font-size: 0.7rem;">P50</span>
            </div>
            <div class="percentile-segment p90" style="width: ${p90Width}%">
                <span style="font-size: 0.7rem;">P90</span>
            </div>
            <div class="percentile-segment p95" style="width: ${p95Width}%">
                <span style="font-size: 0.7rem;">P95</span>
            </div>
            <div class="percentile-segment p99" style="width: ${p99Width}%">
                <span style="font-size: 0.7rem;">P99</span>
            </div>
            <div style="width: ${remainingWidth}%; background: #e0e0e0;"></div>
        </div>
    `;
  }

  /**
   * Generate JSON report for CI/CD
   */
  async generateJSON(report: BenchmarkReport, outputPath: string): Promise<void> {
    await fs.writeJson(outputPath, report, { spaces: 2 });
  }

  /**
   * Generate CSV report
   */
  async generateCSV(report: BenchmarkReport, outputPath: string): Promise<void> {
    const headers = [
      'Scenario',
      'Description',
      'Iterations',
      'Success Rate',
      'Min (ms)',
      'Mean (ms)',
      'Median (ms)',
      'P90 (ms)',
      'P95 (ms)',
      'P99 (ms)',
      'Max (ms)',
      'Std Dev',
      'Avg Heap (MB)',
      'Max Heap (MB)'
    ];

    const rows = report.results.map(r => [
      r.scenario,
      r.description,
      r.iterations,
      r.successRate.toFixed(2),
      r.metrics.min.toFixed(2),
      r.metrics.mean.toFixed(2),
      r.metrics.median.toFixed(2),
      r.metrics.p90.toFixed(2),
      r.metrics.p95.toFixed(2),
      r.metrics.p99.toFixed(2),
      r.metrics.max.toFixed(2),
      r.metrics.stdDev.toFixed(2),
      (r.memory.avgHeapUsed / 1024 / 1024).toFixed(2),
      (r.memory.maxHeapUsed / 1024 / 1024).toFixed(2)
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    await fs.writeFile(outputPath, csv);
  }

  /**
   * Generate Markdown report
   */
  async generateMarkdown(report: BenchmarkReport, outputPath: string): Promise<void> {
    const md = `# Performance Benchmark Report

## Summary
- **Date:** ${new Date(report.timestamp).toLocaleString()}
- **Version:** ${report.version}
- **Total Scenarios:** ${report.summary.totalScenarios}
- **Total Iterations:** ${report.summary.totalIterations}
- **Total Duration:** ${(report.summary.totalDuration / 1000).toFixed(2)}s
- **Average Success Rate:** ${report.summary.averageSuccessRate.toFixed(2)}%

## Performance Requirements

| Requirement | Target | Result | Status |
|-------------|--------|--------|--------|
| Validation Time | < 100ms | ${this.getRequirementValue(report, 'validation')} | ${this.getRequirementStatus(report, 'validation', 100)} |
| CLI Response Time | < 200ms | ${this.getRequirementValue(report, 'cli-response')} | ${this.getRequirementStatus(report, 'cli-response', 200)} |
| Cached Response Time | < 10ms | ${this.getRequirementValue(report, 'cache')} | ${this.getRequirementStatus(report, 'cache', 10)} |

## Scenario Results

| Scenario | Success Rate | P50 | P95 | P99 | Max |
|----------|--------------|-----|-----|-----|-----|
${report.results.map(r => `| ${r.scenario} | ${r.successRate.toFixed(1)}% | ${r.metrics.p50.toFixed(2)}ms | ${r.metrics.p95.toFixed(2)}ms | ${r.metrics.p99.toFixed(2)}ms | ${r.metrics.max.toFixed(2)}ms |`).join('\n')}

## System Information
- **Platform:** ${report.system.platform}
- **CPUs:** ${report.system.cpus}
- **Memory:** ${(report.system.memory / 1024 / 1024 / 1024).toFixed(2)} GB
- **Node Version:** ${report.system.nodeVersion}
`;

    await fs.writeFile(outputPath, md);
  }

  /**
   * Helper to get requirement value
   */
  private getRequirementValue(report: BenchmarkReport, key: string): string {
    const result = report.results.find(r => r.scenario.includes(key));
    return result ? `${result.metrics.p95.toFixed(2)}ms` : 'N/A';
  }

  /**
   * Helper to get requirement status
   */
  private getRequirementStatus(report: BenchmarkReport, key: string, limit: number): string {
    const result = report.results.find(r => r.scenario.includes(key));
    if (!result) return '❓';
    return result.metrics.p95 < limit ? '✅ PASS' : '❌ FAIL';
  }
}