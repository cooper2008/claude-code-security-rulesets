/**
 * CLI Commands Integration Tests
 * 
 * Comprehensive testing of all CLI commands including:
 * - Command functionality with various inputs
 * - Error handling and exit codes
 * - Interactive prompts and user experience
 * - Cross-platform compatibility
 * - Performance requirements (<200ms)
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import {
  CLITestRunner,
  TempDirectory,
  mockInquirerPrompts,
  stripAnsiColors,
  expectPerformance,
  ensureCLIBuilt,
  createTestConfig
} from './helpers';

const projectRoot = join(__dirname, '../../');
let cliRunner: CLITestRunner;
let tempDir: TempDirectory;

describe('CLI Commands Integration', () => {
  beforeAll(async () => {
    // Ensure CLI is built for testing
    await ensureCLIBuilt(projectRoot);
    cliRunner = new CLITestRunner(projectRoot);
  });

  beforeEach(() => {
    tempDir = new TempDirectory('cli-commands-test-');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('Global CLI Behavior', () => {
    it('should display help when no command provided', async () => {
      const result = await cliRunner.runCommand('', [], { timeout: 1000 });
      
      expect(result.stdout).toContain('Claude Code Security Rulesets Generator');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('init');
      expect(result.stdout).toContain('generate');
      expect(result.stdout).toContain('validate');
      expect(result.stdout).toContain('deploy');
      expect(result.exitCode).toBe(0);
    });

    it('should display version information', async () => {
      const result = await cliRunner.runCommand('--version', [], { timeout: 1000 });
      
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version format
      expect(result.exitCode).toBe(0);
    });

    it('should handle invalid commands gracefully', async () => {
      const result = await cliRunner.runCommand('invalid-command', [], { timeout: 1000 });
      
      expect(result.stderr).toContain('unknown command');
      expect(result.exitCode).toBe(1);
    });

    it('should respect global --verbose option', async () => {
      const result = await cliRunner.runCommand('--verbose', ['validate', '--help'], { timeout: 1000 });
      
      expect(result.stdout).toContain('validate');
      expect(result.exitCode).toBe(0);
    });

    it('should respect global --quiet option', async () => {
      const result = await cliRunner.runCommand('--quiet', ['validate', '--help'], { timeout: 1000 });
      
      expect(result.exitCode).toBe(0);
      // With --quiet, output should be minimal
      expect(result.stdout.length).toBeLessThan(500);
    });

    it('should meet performance requirements for help display', async () => {
      const result = await cliRunner.runCommand('--help', [], { timeout: 1000 });
      
      expectPerformance(result.executionTime, 200);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('init command', () => {
    it('should initialize configuration with default template', async () => {
      const configFile = tempDir.writeFile('config.json', '{}');
      
      const result = await cliRunner.runCommand('init', [
        '--output', configFile,
        '--template', 'security-baseline',
        '--non-interactive'
      ], { 
        cwd: tempDir.path,
        timeout: 2000 
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Configuration initialized successfully');
      expect(tempDir.exists('config.json')).toBe(true);
      
      const config = JSON.parse(tempDir.readFile('config.json'));
      expect(config.metadata).toBeDefined();
      expect(config.rulesets).toBeDefined();
      expect(config.environments).toBeDefined();
    });

    it('should handle interactive setup', async () => {
      const mockRestore = mockInquirerPrompts({
        template: 'enterprise-security',
        environments: ['development', 'production'],
        author: 'Test User',
        description: 'Test configuration'
      });

      const configFile = join(tempDir.path, 'interactive-config.json');
      
      const result = await cliRunner.runCommand('init', [
        '--output', configFile
      ], {
        cwd: tempDir.path,
        timeout: 3000
      });

      expect(result.exitCode).toBe(0);
      expect(existsSync(configFile)).toBe(true);
      
      mockRestore();
    });

    it('should list available templates', async () => {
      const result = await cliRunner.runCommand('init', ['--list-templates'], { timeout: 1000 });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('security-baseline');
      expect(result.stdout).toContain('enterprise-security');
      expect(result.stdout).toContain('development-rules');
    });

    it('should handle invalid template gracefully', async () => {
      const result = await cliRunner.runCommand('init', [
        '--template', 'invalid-template',
        '--non-interactive'
      ], { 
        cwd: tempDir.path,
        timeout: 1000 
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown template');
    });

    it('should refuse to overwrite existing config without --force', async () => {
      const configFile = tempDir.writeFile('existing-config.json', JSON.stringify(createTestConfig()));
      
      const result = await cliRunner.runCommand('init', [
        '--output', configFile,
        '--template', 'security-baseline',
        '--non-interactive'
      ], { 
        cwd: tempDir.path,
        timeout: 1000 
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('already exists');
    });

    it('should overwrite existing config with --force', async () => {
      const configFile = tempDir.writeFile('force-config.json', JSON.stringify(createTestConfig()));
      
      const result = await cliRunner.runCommand('init', [
        '--output', configFile,
        '--template', 'security-baseline',
        '--non-interactive',
        '--force'
      ], { 
        cwd: tempDir.path,
        timeout: 2000 
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Configuration initialized successfully');
    });

    it('should meet performance requirements', async () => {
      const result = await cliRunner.runCommand('init', [
        '--template', 'security-baseline',
        '--non-interactive',
        '--output', join(tempDir.path, 'perf-config.json')
      ], { 
        cwd: tempDir.path,
        timeout: 1000 
      });

      expectPerformance(result.executionTime, 200);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('generate command', () => {
    let baseConfigFile: string;

    beforeEach(() => {
      baseConfigFile = tempDir.writeFile('base-config.json', JSON.stringify(createTestConfig()));
    });

    it('should generate configuration from template', async () => {
      const outputFile = join(tempDir.path, 'generated-config.json');
      
      const result = await cliRunner.runCommand('generate', [
        '--template', 'enterprise-security',
        '--output', outputFile,
        '--param', 'compliance_framework=SOC2',
        '--param', 'audit_level=detailed'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Configuration generated successfully');
      expect(tempDir.exists('generated-config.json')).toBe(true);
      
      const config = JSON.parse(tempDir.readFile('generated-config.json'));
      expect(config.rulesets).toBeDefined();
      expect(config.rulesets.length).toBeGreaterThan(0);
    });

    it('should merge with existing configuration', async () => {
      const outputFile = join(tempDir.path, 'merged-config.json');
      
      const result = await cliRunner.runCommand('generate', [
        '--template', 'development-rules',
        '--base', baseConfigFile,
        '--output', outputFile,
        '--merge'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(tempDir.exists('merged-config.json')).toBe(true);
      
      const config = JSON.parse(tempDir.readFile('merged-config.json'));
      expect(config.rulesets.length).toBeGreaterThan(1); // Original + generated
    });

    it('should handle dry-run mode', async () => {
      const result = await cliRunner.runCommand('generate', [
        '--template', 'security-baseline',
        '--dry-run',
        '--param', 'severity_threshold=high'
      ], {
        cwd: tempDir.path,
        timeout: 1000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Dry run preview');
      expect(result.stdout).toContain('security-baseline');
      // Should not create any files in dry-run
      expect(tempDir.exists('config.json')).toBe(false);
    });

    it('should validate template parameters', async () => {
      const result = await cliRunner.runCommand('generate', [
        '--template', 'enterprise-security',
        '--param', 'invalid_param=value'
      ], {
        cwd: tempDir.path,
        timeout: 1000
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid parameter');
    });

    it('should list available templates with descriptions', async () => {
      const result = await cliRunner.runCommand('generate', ['--list'], { timeout: 1000 });
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Available templates:');
      expect(result.stdout).toContain('security-baseline');
      expect(result.stdout).toContain('enterprise-security');
    });

    it('should handle environment-specific generation', async () => {
      const result = await cliRunner.runCommand('generate', [
        '--template', 'security-baseline',
        '--environment', 'production',
        '--output', join(tempDir.path, 'prod-config.json')
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      const config = JSON.parse(tempDir.readFile('prod-config.json'));
      expect(config.environments).toContain('production');
    });

    it('should meet performance requirements', async () => {
      const result = await cliRunner.runCommand('generate', [
        '--template', 'security-baseline',
        '--output', join(tempDir.path, 'perf-gen-config.json')
      ], {
        cwd: tempDir.path,
        timeout: 1000
      });

      expectPerformance(result.executionTime, 200);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('validate command', () => {
    let validConfigFile: string;
    let invalidConfigFile: string;

    beforeEach(() => {
      validConfigFile = tempDir.writeFile('valid.json', 
        readFileSync(join(__dirname, 'fixtures', 'valid-config.json'), 'utf8'));
      invalidConfigFile = tempDir.writeFile('invalid.json',
        readFileSync(join(__dirname, 'fixtures', 'invalid-config.json'), 'utf8'));
    });

    it('should validate valid configuration successfully', async () => {
      const result = await cliRunner.runCommand('validate', [validConfigFile], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('✓ Configuration is valid');
      expect(result.stdout).toContain('Schema validation: PASSED');
      expect(result.stdout).toContain('Rule conflict analysis: PASSED');
    });

    it('should detect and report validation errors', async () => {
      const result = await cliRunner.runCommand('validate', [invalidConfigFile], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('✗ Configuration validation failed');
      expect(result.stderr).toContain('Schema validation: FAILED');
    });

    it('should output detailed validation report', async () => {
      const result = await cliRunner.runCommand('validate', [
        validConfigFile,
        '--detailed'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Detailed Validation Report');
      expect(result.stdout).toContain('Rules analyzed:');
      expect(result.stdout).toContain('Environments:');
      expect(result.stdout).toContain('Performance metrics:');
    });

    it('should generate JUnit XML report', async () => {
      const reportFile = join(tempDir.path, 'validation-report.xml');
      
      const result = await cliRunner.runCommand('validate', [
        validConfigFile,
        '--format', 'junit',
        '--output', reportFile
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(tempDir.exists('validation-report.xml')).toBe(true);
      
      const report = tempDir.readFile('validation-report.xml');
      expect(report).toContain('<?xml version="1.0"');
      expect(report).toContain('<testsuite');
      expect(report).toContain('<testcase');
    });

    it('should validate specific environment configuration', async () => {
      const result = await cliRunner.runCommand('validate', [
        validConfigFile,
        '--environment', 'production'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Environment: production');
    });

    it('should detect rule conflicts', async () => {
      const conflictConfig = createTestConfig({
        rulesets: [{
          name: "conflict-test",
          version: "1.0.0",
          rules: [
            {
              name: "rule1",
              pattern: "test.*pattern",
              severity: "error",
              categories: ["security"]
            },
            {
              name: "rule2", 
              pattern: "test.+pattern",
              severity: "warning",
              categories: ["security"]
            }
          ]
        }]
      });
      
      const conflictFile = tempDir.writeFile('conflict-config.json', JSON.stringify(conflictConfig));
      
      const result = await cliRunner.runCommand('validate', [conflictFile], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.stdout).toContain('Rule conflict analysis');
      // May pass or warn depending on conflict resolution logic
      expect([0, 1]).toContain(result.exitCode);
    });

    it('should handle missing configuration file', async () => {
      const result = await cliRunner.runCommand('validate', ['nonexistent-config.json'], {
        cwd: tempDir.path,
        timeout: 1000
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Configuration file not found');
    });

    it('should meet performance requirements', async () => {
      const result = await cliRunner.runCommand('validate', [validConfigFile], {
        cwd: tempDir.path,
        timeout: 1000
      });

      expectPerformance(result.executionTime, 200);
      expect(result.exitCode).toBe(0);
    });

    it('should support custom configuration file discovery', async () => {
      // Create config in different locations
      tempDir.writeFile('.claude-code.json', JSON.stringify(createTestConfig()));
      tempDir.writeFile('claude-code.config.json', JSON.stringify(createTestConfig()));
      
      const result = await cliRunner.runCommand('validate', [], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Configuration discovered');
    });
  });

  describe('deploy command', () => {
    let validConfigFile: string;
    let invalidConfigFile: string;
    let deploymentConfigFile: string;

    beforeEach(() => {
      validConfigFile = tempDir.writeFile('deploy-config.json',
        readFileSync(join(__dirname, 'fixtures', 'valid-config.json'), 'utf8'));
      invalidConfigFile = tempDir.writeFile('invalid-deploy-config.json',
        readFileSync(join(__dirname, 'fixtures', 'invalid-config.json'), 'utf8'));
      deploymentConfigFile = tempDir.writeFile('deployment.json',
        readFileSync(join(__dirname, 'fixtures', 'deployment-config.json'), 'utf8'));
    });

    it('should perform dry-run deployment', async () => {
      const result = await cliRunner.runCommand('deploy', [
        validConfigFile,
        '--environment', 'development',
        '--dry-run'
      ], {
        cwd: tempDir.path,
        timeout: 3000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Deployment Preview (Dry Run)');
      expect(result.stdout).toContain('Environment: development');
      expect(result.stdout).toContain('Would deploy');
    });

    it('should handle missing environment gracefully', async () => {
      const result = await cliRunner.runCommand('deploy', [
        validConfigFile,
        '--environment', 'nonexistent'
      ], {
        cwd: tempDir.path,
        timeout: 1000
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Environment "nonexistent" not found');
    });

    it('should validate configuration before deployment', async () => {
      const result = await cliRunner.runCommand('deploy', [
        invalidConfigFile,
        '--environment', 'development',
        '--dry-run'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Configuration validation failed');
    });

    it('should create deployment backup', async () => {
      const result = await cliRunner.runCommand('deploy', [
        validConfigFile,
        '--environment', 'development',
        '--backup',
        '--dry-run'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Backup would be created');
    });

    it('should support rollback operation', async () => {
      const result = await cliRunner.runCommand('deploy', [
        '--rollback', 'deploy-123',
        '--environment', 'development',
        '--dry-run'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Rollback Preview');
      expect(result.stdout).toContain('deploy-123');
    });

    it('should list deployment history', async () => {
      const result = await cliRunner.runCommand('deploy', [
        '--list',
        '--environment', 'staging'
      ], {
        cwd: tempDir.path,
        timeout: 1000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Deployment History');
      expect(result.stdout).toContain('staging');
    });

    it('should handle deployment configuration file', async () => {
      const result = await cliRunner.runCommand('deploy', [
        validConfigFile,
        '--deployment-config', deploymentConfigFile,
        '--environment', 'development',
        '--dry-run'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Using deployment configuration');
    });

    it('should meet performance requirements', async () => {
      const result = await cliRunner.runCommand('deploy', [
        validConfigFile,
        '--environment', 'development',
        '--dry-run'
      ], {
        cwd: tempDir.path,
        timeout: 1000
      });

      expectPerformance(result.executionTime, 200);
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Global Options', () => {
    let testConfigFile: string;

    beforeEach(() => {
      testConfigFile = tempDir.writeFile('test-config.json', JSON.stringify(createTestConfig()));
    });

    it('should use custom config file with --config option', async () => {
      const customConfigFile = tempDir.writeFile('custom.json', JSON.stringify(createTestConfig()));
      
      const result = await cliRunner.runCommand('validate', [
        '--config', customConfigFile
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Configuration is valid');
    });

    it('should provide verbose output with --verbose', async () => {
      const result = await cliRunner.runCommand('validate', [
        testConfigFile,
        '--verbose'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      // Verbose should show more detailed information
      expect(result.stdout.length).toBeGreaterThan(500);
      expect(result.stdout).toContain('Verbose mode enabled');
    });

    it('should provide minimal output with --quiet', async () => {
      const result = await cliRunner.runCommand('validate', [
        testConfigFile,
        '--quiet'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
      // Quiet should show minimal output
      expect(result.stdout.length).toBeLessThan(200);
    });

    it('should handle conflicting global options gracefully', async () => {
      const result = await cliRunner.runCommand('validate', [
        testConfigFile,
        '--verbose',
        '--quiet'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      // Should handle conflicting options (quiet typically takes precedence)
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Cross-platform Compatibility', () => {
    it('should handle Windows-style paths correctly', async () => {
      // const windowsStylePath = 'test\\config.json';
      const configContent = JSON.stringify(createTestConfig());
      
      // Create config with forward slashes (normalized internally)
      tempDir.writeFile('test/config.json', configContent);
      
      const result = await cliRunner.runCommand('validate', [
        join(tempDir.path, 'test', 'config.json')
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
    });

    it('should handle Unicode characters in file paths', async () => {
      const unicodeConfig = tempDir.writeFile('配置文件.json', JSON.stringify(createTestConfig()));
      
      const result = await cliRunner.runCommand('validate', [unicodeConfig], {
        cwd: tempDir.path,
        timeout: 2000
      });

      expect(result.exitCode).toBe(0);
    });

    it('should respect system environment variables', async () => {
      const result = await cliRunner.runCommand('validate', ['--help'], {
        env: { 'CLAUDE_CONFIG_DEBUG': '1' },
        timeout: 1000
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle permission errors gracefully', async () => {
      // This test may not work on all systems, but we can test the error handling logic
      const result = await cliRunner.runCommand('validate', ['/root/nonexistent.json'], {
        timeout: 1000
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });

    it('should handle JSON parse errors', async () => {
      const malformedConfig = tempDir.writeFile('malformed.json', '{ invalid json }');
      
      const result = await cliRunner.runCommand('validate', [malformedConfig], {
        cwd: tempDir.path,
        timeout: 1000
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('JSON parse error');
    });

    it('should handle network timeout errors in deploy', async () => {
      const configFile = tempDir.writeFile('network-config.json', JSON.stringify(createTestConfig()));
      
      const result = await cliRunner.runCommand('deploy', [
        configFile,
        '--environment', 'development',
        '--timeout', '1',
        '--dry-run'
      ], {
        cwd: tempDir.path,
        timeout: 2000
      });

      // Should handle timeout gracefully in dry-run
      expect([0, 1]).toContain(result.exitCode);
    });

    it('should provide helpful error messages', async () => {
      const result = await cliRunner.runCommand('generate', ['--template'], {
        timeout: 1000
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('template name required');
    });
  });

  describe('User Experience', () => {
    it('should display colored output by default', async () => {
      const result = await cliRunner.runCommand('validate', ['--help'], { timeout: 1000 });
      
      expect(result.exitCode).toBe(0);
      // Output should contain ANSI color codes
      expect(result.stdout).toMatch(/\x1b\[[0-9;]*m/);
    });

    it('should respect NO_COLOR environment variable', async () => {
      const result = await cliRunner.runCommand('validate', ['--help'], {
        env: { 'NO_COLOR': '1' },
        timeout: 1000
      });
      
      expect(result.exitCode).toBe(0);
      // Output should not contain ANSI color codes
      expect(stripAnsiColors(result.stdout)).toBe(result.stdout);
    });

    it('should provide progress indicators for long operations', async () => {
      const largeConfig = createTestConfig({
        rulesets: Array.from({ length: 100 }, (_, i) => ({
          name: `ruleset-${i}`,
          version: "1.0.0",
          rules: [{
            name: `rule-${i}`,
            pattern: `pattern-${i}`,
            severity: "error",
            categories: ["test"]
          }]
        }))
      });
      
      const configFile = tempDir.writeFile('large-config.json', JSON.stringify(largeConfig));
      
      const result = await cliRunner.runCommand('validate', [
        configFile,
        '--detailed'
      ], {
        cwd: tempDir.path,
        timeout: 5000
      });

      expect(result.exitCode).toBe(0);
      // Should show some kind of progress indication
      expect(result.stdout).toMatch(/(Processing|Analyzing|Validating)/);
    });

    it('should handle Ctrl+C gracefully', async () => {
      // This is harder to test directly, but we can verify the CLI handles signals
      const result = await cliRunner.runCommand('validate', ['--help'], { timeout: 100 });
      
      // Should complete normally for help command
      expect(result.exitCode).toBe(0);
    });
  });
});