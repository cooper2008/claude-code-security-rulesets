/**
 * CLI Testing Helpers
 * 
 * Utilities for testing CLI commands with child_process, performance timing,
 * and cross-platform compatibility
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  command: string;
  args: string[];
}

export interface CLITestOptions {
  timeout?: number;
  input?: string;
  cwd?: string;
  env?: Record<string, string>;
  silent?: boolean;
}

export class CLITestRunner {
  private cliPath: string;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.cliPath = join(projectRoot, 'dist', 'cli', 'index.js');
  }

  /**
   * Execute CLI command and return results with timing
   */
  async runCommand(
    command: string,
    args: string[] = [],
    options: CLITestOptions = {}
  ): Promise<CLIResult> {
    const startTime = process.hrtime.bigint();
    
    const {
      timeout = 5000,
      input,
      cwd = this.projectRoot,
      env = {},
      silent = false
    } = options;

    const fullArgs = [this.cliPath, command, ...args];
    
    return new Promise((resolve, reject) => {
      const child = spawn('node', fullArgs, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout | null = null;

      // Set up timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);
      }

      // Collect stdout
      child.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        if (!silent) {
          process.stdout.write(`[CLI OUT] ${output}`);
        }
      });

      // Collect stderr
      child.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        if (!silent) {
          process.stderr.write(`[CLI ERR] ${output}`);
        }
      });

      // Send input if provided
      if (input) {
        child.stdin?.write(input);
        child.stdin?.end();
      }

      // Handle completion
      child.on('close', (exitCode) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        const endTime = process.hrtime.bigint();
        const executionTime = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode || 0,
          executionTime,
          command,
          args
        });
      });

      child.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      });
    });
  }

  /**
   * Execute CLI command using ts-node for development testing
   */
  async runCommandDev(
    command: string,
    args: string[] = [],
    options: CLITestOptions = {}
  ): Promise<CLIResult> {
    const startTime = process.hrtime.bigint();
    
    const {
      timeout = 5000,
      input,
      cwd = this.projectRoot,
      env = {},
      silent = false
    } = options;

    const tsNodePath = join(this.projectRoot, 'src', 'cli', 'index.ts');
    const fullArgs = ['-r', 'tsconfig-paths/register', tsNodePath, command, ...args];
    
    return new Promise((resolve, reject) => {
      const child = spawn('npx', ['ts-node', ...fullArgs], {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout | null = null;

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);
      }

      child.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        if (!silent) {
          process.stdout.write(`[DEV OUT] ${output}`);
        }
      });

      child.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        if (!silent) {
          process.stderr.write(`[DEV ERR] ${output}`);
        }
      });

      if (input) {
        child.stdin?.write(input);
        child.stdin?.end();
      }

      child.on('close', (exitCode) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        const endTime = process.hrtime.bigint();
        const executionTime = Number(endTime - startTime) / 1_000_000;

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode || 0,
          executionTime,
          command,
          args
        });
      });

      child.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(error);
      });
    });
  }

  /**
   * Test command performance against <200ms requirement
   */
  async testPerformance(
    command: string,
    args: string[] = [],
    options: CLITestOptions = {},
    iterations: number = 5
  ): Promise<{ average: number; min: number; max: number; results: CLIResult[] }> {
    const results: CLIResult[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const result = await this.runCommand(command, args, { ...options, silent: true });
      results.push(result);
    }

    const times = results.map(r => r.executionTime);
    const average = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    return { average, min, max, results };
  }
}

/**
 * Create a temporary test directory with cleanup
 */
export class TempDirectory {
  public path: string;
  
  constructor(prefix: string = 'cli-test-') {
    this.path = join(tmpdir(), `${prefix}${Date.now()}-${Math.random().toString(36).substring(7)}`);
    mkdirSync(this.path, { recursive: true });
  }

  writeFile(filename: string, content: string): string {
    const filepath = join(this.path, filename);
    const dir = join(filepath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filepath, content, 'utf8');
    return filepath;
  }

  readFile(filename: string): string {
    return readFileSync(join(this.path, filename), 'utf8');
  }

  exists(filename: string): boolean {
    return existsSync(join(this.path, filename));
  }

  cleanup(): void {
    if (existsSync(this.path)) {
      rmSync(this.path, { recursive: true, force: true });
    }
  }
}

/**
 * Mock inquirer prompts for testing interactive commands
 */
export function mockInquirerPrompts(responses: Record<string, any>): jest.Mock {
  const inquirer = require('inquirer');
  const originalPrompt = inquirer.prompt;
  
  const mockPrompt = jest.fn().mockImplementation((questions) => {
    const answers: Record<string, any> = {};
    
    if (Array.isArray(questions)) {
      questions.forEach((q) => {
        if (responses.hasOwnProperty(q.name)) {
          answers[q.name] = responses[q.name];
        } else if (q.default !== undefined) {
          answers[q.name] = q.default;
        }
      });
    }
    
    return Promise.resolve(answers);
  });
  
  inquirer.prompt = mockPrompt;
  
  // Return function to restore original
  return jest.fn(() => {
    inquirer.prompt = originalPrompt;
  });
}

/**
 * Utility to strip ANSI color codes from output for testing
 */
export function stripAnsiColors(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Cross-platform path normalization for tests
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Performance assertion helper
 */
export function expectPerformance(executionTime: number, maxTime: number = 200): void {
  expect(executionTime).toBeLessThan(maxTime);
}

/**
 * Build CLI binary for testing (if not already built)
 */
export async function ensureCLIBuilt(projectRoot: string): Promise<void> {
  const distPath = join(projectRoot, 'dist', 'cli', 'index.js');
  
  if (!existsSync(distPath)) {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
      const build = spawn('npm', ['run', 'build'], {
        cwd: projectRoot,
        stdio: 'inherit'
      });
      
      build.on('close', (code: number) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed with exit code ${code}`));
        }
      });
      
      build.on('error', reject);
    });
  }
}

/**
 * Utility to create test configuration files
 */
export interface TestConfigOptions {
  permissions?: {
    deny?: string[];
    allow?: string[];
    ask?: string[];
  };
  metadata?: Record<string, any>;
  invalid?: boolean;
}

export function createTestConfig(options: TestConfigOptions = {}): any {
  const {
    invalid = false
  } = options;

  const config = {
    permissions: {
      deny: [
        "hardcoded-secrets",
        "sql-injection"
      ],
      allow: [
        "debug-logging"
      ],
      ask: [
        "external-api-calls"
      ]
    },
    metadata: {
      version: "1.0.0",
      timestamp: Date.now(),
      organization: "test-org",
      name: "Test Configuration",
      environment: "development"
    }
  };

  if (invalid) {
    // Make config invalid by setting invalid field types
    config.permissions.deny = "" as any;
    config.metadata.timestamp = "invalid" as any;
  }

  return config;
}