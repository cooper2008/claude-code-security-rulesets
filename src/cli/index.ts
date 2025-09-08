#!/usr/bin/env node

/**
 * Claude Code Security Rulesets Generator - CLI Entry Point
 * 
 * A comprehensive CLI tool for generating, validating, and deploying 
 * Claude Code security configurations with zero-bypass deny enforcement.
 * 
 * @author Organization Security Team
 * @version 1.0.0
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join } from 'path';
// Import types as needed
import type { SetupOptions, SetupResult } from '../setup/wizard';

// Import command handlers
import { handleInit, BUILT_IN_TEMPLATES, DEFAULT_CONFIGURATIONS } from './commands/init';
import { handleGenerate } from './commands/generate';
import { validateCommand } from './commands/validate';
import { handleDeploy } from './commands/deploy';
import { SecurityWizard } from '../setup/wizard';
import { createAdapter, getSupportedTools, detectInstalledTools, AIToolType } from '../adapters/base-adapter';

/**
 * Global CLI options interface
 */
interface GlobalOptions {
  config?: string;
  verbose?: boolean;
  quiet?: boolean;
  version?: boolean;
}

/**
 * CLI error handling with colored output
 */
class CLIError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

/**
 * Get package version from package.json
 */
function getVersion(): string {
  try {
    const packagePath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    return packageJson.version as string;
  } catch {
    return '1.0.0'; // Fallback version
  }
}

/**
 * Setup error handling for the CLI
 */
function setupErrorHandling(): void {
  process.on('uncaughtException', (error: Error) => {
    console.error(chalk.red.bold('Fatal Error:'), error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error(chalk.red.bold('Unhandled Promise Rejection:'), message);
    if (process.env.NODE_ENV === 'development' && reason instanceof Error) {
      console.error(chalk.gray(reason.stack));
    }
    process.exit(1);
  });
}

/**
 * Create and configure the main CLI program
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name('claude-security')
    .description('Simple, automated Claude Code security setup. Run "claude-security setup" to get started.')
    .version(getVersion(), '-v, --version', 'display version number')
    .helpOption('-h, --help', 'display help for command');

  // Global options
  program
    .option('-c, --config <path>', 'path to configuration file')
    .option('--verbose', 'enable verbose logging')
    .option('--quiet', 'suppress non-error output')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts() as GlobalOptions;
      
      // Set up global verbose/quiet logging
      if (opts.verbose && opts.quiet) {
        throw new CLIError('Cannot use both --verbose and --quiet options together');
      }
      
      // Store global options for commands to access
      process.env.CLI_VERBOSE = opts.verbose ? 'true' : 'false';
      process.env.CLI_QUIET = opts.quiet ? 'true' : 'false';
      process.env.CLI_CONFIG = opts.config || '';
    });

  return program;
}

/**
 * Add all commands to the program
 */
function addCommands(program: Command): void {
  // Setup command - Simple automated security setup (main entry point)
  program
    .command('setup')
    .description('Automated security setup for AI coding tools (recommended)')
    .option('--ai-tool <tool>', 'AI tool to configure: claude-code, cursor, copilot, windsurf (default: claude-code)', 'claude-code')
    .option('--mode <type>', 'setup mode: simple, detailed, expert, custom (default: simple)', 'simple')
    .option('--auto-confirm', 'automatically confirm all prompts (for scripting)')
    .option('--verbose', 'show detailed output and explanations')
    .option('--interactive', 'interactive mode with step-by-step customization')
    .option('--scan-depth <number>', 'directory scan depth (default: 3)', '3')
    .option('--project-only', 'scan only current project (skip personal files)')
    .option('--global-only', 'scan only personal files (skip current project)')
    .option('--dry-run', 'show what would be protected without applying changes')
    .option('--backup', 'create backup even if not required (default: auto)')
    .option('--output <file>', 'save configuration to file instead of applying directly')
    .action(async (options) => {
      try {
        await handleSetup(options);
      } catch (error) {
        handleCommandError(error, 'setup');
      }
    });

  // Status command - Check current security status
  program
    .command('status')
    .description('Check current AI tool security protection status')
    .option('--ai-tool <tool>', 'AI tool to check: claude-code, cursor, copilot, windsurf (default: claude-code)', 'claude-code')
    .action(async (options) => {
      try {
        await handleStatus(options);
      } catch (error) {
        handleCommandError(error, 'status');
      }
    });

  // Init command - Initialize new configuration
  program
    .command('init')
    .description('Initialize a new Claude Code security configuration')
    .option('-t, --template <name>', 'template to use for initialization')
    .option('-o, --output <path>', 'output file path (default: claude-security.json)')
    .option('-f, --force', 'overwrite existing configuration file')
    .option('--interactive', 'use interactive prompts (default)')
    .option('--non-interactive', 'skip interactive prompts')
    .action(async (options) => {
      try {
        await handleInit(options);
      } catch (error) {
        handleCommandError(error, 'init');
      }
    });

  // Generate command - Generate configuration from template
  program
    .command('generate')
    .description('Generate Claude Code security configuration from template')
    .requiredOption('-t, --template <name>', 'security template to use')
    .option('-o, --output <path>', 'output file path (default: claude-security.json)')
    .option('-e, --environment <env>', 'target environment (development, staging, production)')
    .option('--params <json>', 'template parameters as JSON string')
    .option('--dry-run', 'show what would be generated without writing file')
    .action(async (options) => {
      try {
        await handleGenerate(options);
      } catch (error) {
        handleCommandError(error, 'generate');
      }
    });

  // Validate command - Validate configuration
  program
    .command('validate')
    .description('Validate Claude Code security configuration')
    .argument('[file]', 'configuration file to validate (default: claude-security.json)')
    .option('--schema', 'validate against JSON schema only')
    .option('--conflicts', 'check for rule conflicts only')
    .option('--performance', 'run performance validation')
    .option('--format <type>', 'output format (text, json, junit)', 'text')
    .option('--exit-code', 'exit with non-zero code on validation errors')
    .action(async (file, options) => {
      try {
        await validateCommand(file);
      } catch (error) {
        handleCommandError(error, 'validate');
      }
    });

  // Deploy command - Deploy configuration
  program
    .command('deploy')
    .description('Deploy Claude Code security configuration to environment')
    .argument('[file]', 'configuration file to deploy (default: claude-security.json)')
    .requiredOption('-e, --environment <env>', 'target environment (development, staging, production)')
    .option('--dry-run', 'show what would be deployed without actually deploying')
    .option('--force', 'skip confirmation prompts')
    .option('--rollback', 'rollback to previous deployment')
    .option('--status', 'check deployment status')
    .option('--scope <scope>', 'deployment scope: global (settings.local.json) or local (settings.json)', 'global')
    .action(async (file, options) => {
      try {
        await handleDeploy(file, options);
      } catch (error) {
        handleCommandError(error, 'deploy');
      }
    });

  // List templates command
  program
    .command('list-templates')
    .description('List available security templates')
    .option('--category <type>', 'filter by template category')
    .option('--format <type>', 'output format (table, json)', 'table')
    .action(async (options) => {
      try {
        await handleListTemplates(options);
      } catch (error) {
        handleCommandError(error, 'list-templates');
      }
    });

  // Scan command - Scan for sensitive files and suggest custom rules
  program
    .command('scan')
    .description('Scan current directory for sensitive files and suggest custom security rules')
    .option('-d, --directory <path>', 'directory to scan (default: current directory)', '.')
    .option('--format <type>', 'output format (table, json)', 'table')
    .option('--depth <number>', 'scan depth (default: 3)', '3')
    .option('--generate-config [template]', 'auto-generate configuration file based on scan results (optional: base template)', false)
    .option('-o, --output <path>', 'output file for generated config (default: claude-security-custom.json)', 'claude-security-custom.json')
    .action(async (options) => {
      try {
        await handleScan(options);
      } catch (error) {
        handleCommandError(error, 'scan');
      }
    });
}

/**
 * Handle list-templates command
 */
async function handleListTemplates(options: { category?: string; format?: string }): Promise<void> {
  let templates = [...BUILT_IN_TEMPLATES];
  
  // Filter by category if specified
  if (options.category) {
    templates = templates.filter(t => t.category === options.category);
  }
  
  if (templates.length === 0) {
    console.log(chalk.yellow('No templates found matching the criteria.'));
    return;
  }
  
  if (options.format === 'json') {
    console.log(JSON.stringify(templates, null, 2));
  } else {
    // Table format (default)
    console.log(chalk.bold('\nAvailable Security Templates:'));
    console.log(chalk.gray('─'.repeat(80)));
    
    templates.forEach((template, index) => {
      const categoryColor = template.category === 'production' ? chalk.red : 
                           template.category === 'compliance' ? chalk.blue : 
                           chalk.green;
      
      console.log(`${chalk.bold.cyan((index + 1).toString().padStart(2))}. ${chalk.bold(template.name)} ${chalk.gray(`(${template.id})`)}`);
      console.log(`    ${categoryColor(`[${template.category.toUpperCase()}]`)} ${template.description}`);
      console.log('');
    });
    
    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.dim(`Total: ${templates.length} template${templates.length !== 1 ? 's' : ''}`));
    console.log(chalk.dim('\nUsage: claude-security init --template <template-id>'));
    console.log(chalk.dim('       claude-security generate --template <template-id>'));
  }
}

/**
 * Handle setup command - Run automated security setup wizard
 */
async function handleSetup(options: { 
  aiTool?: string;
  mode?: string; 
  autoConfirm?: boolean; 
  verbose?: boolean;
  interactive?: boolean;
  scanDepth?: string;
  projectOnly?: boolean;
  globalOnly?: boolean;
  dryRun?: boolean;
  backup?: boolean;
  output?: string;
}): Promise<void> {
  // Validate AI tool
  const aiTool = options.aiTool || 'claude-code';
  const supportedTools = getSupportedTools();
  if (!supportedTools.includes(aiTool as AIToolType)) {
    throw new Error(`Invalid AI tool: ${aiTool}. Supported tools: ${supportedTools.join(', ')}`);
  }

  // Validate mode
  const validModes = ['simple', 'detailed', 'expert', 'custom'];
  const mode = options.mode || 'simple';
  if (!validModes.includes(mode)) {
    throw new Error(`Invalid mode: ${mode}. Valid modes: ${validModes.join(', ')}`);
  }

  try {
    // Show tool-specific introduction
    await showToolIntroduction(aiTool as AIToolType, mode, options.verbose);

    // For claude-code, use existing wizard
    if (aiTool === 'claude-code') {
      console.log(chalk.blue('🔍 Starting Claude Code setup...'));
      
      const wizard = new SecurityWizard();
      const setupOptions = {
        mode,
        autoConfirm: options.autoConfirm || options.dryRun, // Auto-confirm for dry-run to avoid hanging
        verbose: options.verbose,
        interactive: options.interactive && !options.dryRun, // Force non-interactive for dry-run
        scanDepth: parseInt(options.scanDepth || '3'),
        projectOnly: options.projectOnly,
        globalOnly: options.globalOnly,
        dryRun: options.dryRun,
        backup: options.backup,
        outputFile: options.output
      };

      console.log(chalk.gray('Running wizard setup...'));
      const result = await wizard.runSetup(setupOptions);
      console.log(chalk.green('✅ Wizard setup completed'));
      
      await showSetupResults(result, mode, options.verbose);
    } else {
      // For other AI tools, use adapter-based setup
      const adapter = await createAdapter(aiTool as AIToolType);
      const result = await runAdapterSetup(adapter, options);
      await showAdapterResults(result, aiTool as AIToolType, mode, options.verbose);
    }

  } catch (error) {
    throw error;
  }
}

/**
 * Show mode-specific introduction
 */
async function showModeIntroduction(mode: string, verbose?: boolean): Promise<void> {
  switch (mode) {
    case 'simple':
      if (verbose) {
        console.log(chalk.blue.bold('🛡️  Simple Security Setup'));
        console.log(chalk.gray('Automatic setup with sensible defaults and educational explanations.\n'));
      }
      break;
      
    case 'detailed':
      console.log(chalk.blue.bold('🔍 Detailed Security Setup'));
      console.log(chalk.gray('Step-by-step setup with detailed explanations and progress tracking.'));
      console.log(chalk.gray('You\'ll see exactly what files are found and why they need protection.\n'));
      break;
      
    case 'expert':
      console.log(chalk.blue.bold('⚡ Expert Security Setup'));
      console.log(chalk.gray('Advanced setup with full control over scan parameters and rule application.'));
      console.log(chalk.gray('Recommended for security professionals and advanced users.\n'));
      break;
      
    case 'custom':
      console.log(chalk.blue.bold('🎛️  Custom Security Setup'));
      console.log(chalk.gray('Interactive setup with full customization of rules and protection levels.'));
      console.log(chalk.gray('You can review and modify every rule before applying.\n'));
      break;
  }
}

/**
 * Show setup results based on mode
 */
async function showSetupResults(result: any, mode: string, verbose?: boolean): Promise<void> {
  if (mode === 'simple' && !verbose) {
    // Simple mode shows minimal output
    return;
  }

  console.log(chalk.green.bold('\n📊 Setup Results Summary\n'));
  
  if (mode === 'detailed' || mode === 'expert' || verbose) {
    console.log(chalk.cyan('Protection Applied:'));
    console.log(chalk.gray(`  • Project-level rules: ${result.projectRulesApplied}`));
    console.log(chalk.gray(`  • Global-level rules: ${result.globalRulesApplied}`));
    console.log(chalk.gray(`  • Total files protected: ${result.protectedFiles.length}`));
    console.log(chalk.gray(`  • Backup created: ${result.backupCreated ? 'Yes' : 'No'}\n`));
    
    if (result.protectedFiles.length > 0 && (mode === 'expert' || verbose)) {
      console.log(chalk.cyan('Protected Files:'));
      result.protectedFiles.slice(0, 10).forEach((file: string) => {
        console.log(chalk.dim(`  • ${file}`));
      });
      if (result.protectedFiles.length > 10) {
        console.log(chalk.dim(`  • ... and ${result.protectedFiles.length - 10} more files`));
      }
      console.log();
    }
  }
  
  if (mode === 'custom') {
    console.log(chalk.blue('Next Steps:'));
    console.log(chalk.gray('  • Review applied rules with: claude-security status'));
    console.log(chalk.gray('  • Modify rules if needed with: claude-security setup --mode custom'));
    console.log(chalk.gray('  • Test Claude Code behavior with your protected files\n'));
  }
}

/**
 * Handle status command - Show current security status
 */
async function handleStatus(options: { aiTool?: string } = {}): Promise<void> {
  const aiTool = options.aiTool || 'claude-code';
  const supportedTools = getSupportedTools();
  
  if (!supportedTools.includes(aiTool as AIToolType)) {
    throw new Error(`Invalid AI tool: ${aiTool}. Supported tools: ${supportedTools.join(', ')}`);
  }

  if (aiTool === 'claude-code') {
    // Use existing wizard for Claude Code
    const wizard = new SecurityWizard();
    await wizard.showStatus();
  } else {
    // Use adapter for other AI tools
    const adapter = await createAdapter(aiTool as AIToolType);
    await showAdapterStatus(adapter, aiTool as AIToolType);
  }
}

/**
 * Handle scan command - Scan for sensitive files and suggest rules
 */
async function handleScan(options: { 
  directory: string; 
  format: string; 
  depth: string; 
  generateConfig: string | boolean;
  output: string;
}): Promise<void> {
  const fs = require('fs');
  const path = require('path');
  
  const scanDir = path.resolve(options.directory);
  const maxDepth = parseInt(options.depth);
  
  console.log(chalk.blue.bold('🔍 Scanning for sensitive files and security risks...\n'));
  console.log(chalk.gray(`Directory: ${scanDir}`));
  console.log(chalk.gray(`Max depth: ${maxDepth}\n`));
  
  const sensitivePatterns = [
    // Secrets and credentials
    { pattern: /\.env(\.|$)/, type: 'Environment Variables', risk: 'HIGH', rule: 'Read(.env*)' },
    { pattern: /^\.?secrets?($|\/)/, type: 'Secrets Directory', risk: 'HIGH', rule: 'Read(**/secrets/**)'  },
    { pattern: /id_rsa|id_ed25519|\.pem$/, type: 'SSH/SSL Keys', risk: 'CRITICAL', rule: 'Read(**/id_rsa*)'  },
    { pattern: /\.p12$|\.pfx$|\.key$/, type: 'Certificate Keys', risk: 'CRITICAL', rule: 'Read(**/*.key)'  },
    
    // Configuration files
    { pattern: /^\.aws\//, type: 'AWS Config', risk: 'HIGH', rule: 'Read(**/.aws/**)'  },
    { pattern: /^\.docker\//, type: 'Docker Config', risk: 'MEDIUM', rule: 'Read(**/.docker/**)'  },
    { pattern: /^\.kube\//, type: 'Kubernetes Config', risk: 'HIGH', rule: 'Read(**/.kube/**)'  },
    
    // Database and cache
    { pattern: /\.db$|\.sqlite/, type: 'Database Files', risk: 'MEDIUM', rule: 'Read(**/*.db)' },
    { pattern: /dump\.sql$|backup\.sql$/, type: 'Database Dumps', risk: 'HIGH', rule: 'Read(**/*dump*.sql)' },
    
    // Development artifacts
    { pattern: /\.(log|logs)$/, type: 'Log Files', risk: 'LOW', rule: 'Read(**/*.log)' },
    { pattern: /\._history$|\.bash_history$/, type: 'Shell History', risk: 'MEDIUM', rule: 'Read(**/.*_history)' },
    { pattern: /node_modules\//, type: 'Dependencies', risk: 'LOW', rule: 'Write(**/node_modules/**)' },
    
    // Git and version control
    { pattern: /\.git\/config$/, type: 'Git Config', risk: 'MEDIUM', rule: 'Read(**/.git/config)' },
  ];
  
  const foundFiles: Array<{path: string, type: string, risk: string, rule: string}> = [];
  
  function scanDirectory(dir: string, currentDepth: number = 0) {
    if (currentDepth > maxDepth) return;
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.relative(scanDir, fullPath);
        
        let stat;
        try {
          stat = fs.statSync(fullPath);
        } catch (e) {
          continue; // Skip if can't read
        }
        
        // Check against patterns
        for (const pattern of sensitivePatterns) {
          if (pattern.pattern.test(relativePath) || pattern.pattern.test(item)) {
            foundFiles.push({
              path: relativePath,
              type: pattern.type,
              risk: pattern.risk,
              rule: pattern.rule
            });
          }
        }
        
        // Recurse into directories
        if (stat.isDirectory() && currentDepth < maxDepth) {
          // Skip common directories that are usually safe
          if (!['node_modules', '.git', 'dist', 'build', 'coverage'].includes(item)) {
            scanDirectory(fullPath, currentDepth + 1);
          }
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }
  
  scanDirectory(scanDir);
  
  if (options.format === 'json') {
    console.log(JSON.stringify(foundFiles, null, 2));
    return;
  }
  
  if (foundFiles.length === 0) {
    console.log(chalk.green('✅ No obvious sensitive files detected in the scan!'));
    console.log(chalk.gray('Consider running with greater --depth or checking hidden directories manually.'));
    return;
  }
  
  // Group by risk level
  const byRisk = foundFiles.reduce((acc, file) => {
    if (!acc[file.risk]) acc[file.risk] = [];
    acc[file.risk].push(file);
    return acc;
  }, {} as Record<string, typeof foundFiles>);
  
  console.log(chalk.red.bold('⚠️  Found potentially sensitive files:\n'));
  
  for (const [risk, files] of Object.entries(byRisk).sort(([a], [b]) => 
    { const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']; return order.indexOf(a) - order.indexOf(b); })) {
    
    const riskColor = risk === 'CRITICAL' ? chalk.red.bold : 
                     risk === 'HIGH' ? chalk.red : 
                     risk === 'MEDIUM' ? chalk.yellow : chalk.gray;
    
    console.log(riskColor(`${risk} RISK FILES:`));
    
    files.forEach(file => {
      console.log(`  ${riskColor('•')} ${chalk.cyan(file.path)} ${chalk.gray(`(${file.type})`)}`);
    });
    console.log('');
  }
  
  console.log(chalk.blue.bold('📋 Suggested Security Rules:\n'));
  console.log(chalk.gray('Add these to your claude-security.json "deny" section:\n'));
  
  const uniqueRules = [...new Set(foundFiles.map(f => f.rule))];
  uniqueRules.forEach((rule, i) => {
    console.log(`  ${chalk.cyan((i + 1).toString())}. "${rule}"`);
  });
  
  console.log(chalk.gray('\n💡 Quick setup:'));
  console.log(chalk.gray('1. claude-security init --template development'));
  console.log(chalk.gray('2. Edit claude-security.json to add the suggested rules'));
  console.log(chalk.gray('3. claude-security validate'));
  console.log(chalk.gray('4. claude-security deploy -e development'));
  
  // Auto-generate configuration if requested
  if (options.generateConfig !== false) {
    await generateConfigFromScan(foundFiles, options, scanDir);
  }
}

/**
 * Generate configuration file based on scan results
 */
async function generateConfigFromScan(
  foundFiles: Array<{path: string, type: string, risk: string, rule: string}>, 
  options: { generateConfig: string | boolean; output: string; directory: string },
  scanDir: string
): Promise<void> {
  const fs = require('fs');
  const path = require('path');
  
  console.log(chalk.blue.bold('\n🔧 Auto-generating security configuration...\n'));
  
  // Determine base template
  const baseTemplate = typeof options.generateConfig === 'string' ? 
    options.generateConfig : 'development';
  
  // Get base configuration from template
  let baseConfig = { ...DEFAULT_CONFIGURATIONS[baseTemplate] };
  if (!baseConfig) {
    console.log(chalk.yellow(`Template '${baseTemplate}' not found, using development template`));
    baseConfig = { ...DEFAULT_CONFIGURATIONS.development };
  }
  
  // Extract unique rules from scan
  const scannedRules = [...new Set(foundFiles.map(f => f.rule))];
  
  // Create comprehensive configuration
  const customConfig = {
    permissions: {
      deny: [
        // Base template deny rules
        ...(baseConfig.permissions?.deny || []),
        // Add scanned security rules
        ...scannedRules
      ],
      allow: baseConfig.permissions?.allow || [],
      ask: baseConfig.permissions?.ask || []
    },
    metadata: {
      version: '1.0.0',
      timestamp: Date.now(),
      name: `Custom Security Policy (${path.basename(scanDir)})`,
      environment: baseTemplate === 'production' ? 'production' as const : 'development' as const,
      templateId: baseTemplate,
      scanResults: {
        scannedDirectory: scanDir,
        scanDate: new Date().toISOString(),
        filesFound: foundFiles.length,
        riskLevels: foundFiles.reduce((acc, f) => {
          acc[f.risk] = (acc[f.risk] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        detectedFiles: foundFiles.map(f => ({
          path: f.path,
          type: f.type,
          risk: f.risk
        }))
      }
    }
  };
  
  // Write configuration file
  const outputPath = path.resolve(options.output);
  
  try {
    fs.writeFileSync(outputPath, JSON.stringify(customConfig, null, 2));
    
    console.log(chalk.green.bold('✅ Configuration generated successfully!'));
    console.log(chalk.gray(`File: ${outputPath}`));
    console.log(chalk.gray(`Base template: ${baseTemplate}`));
    console.log(chalk.gray(`Scan-based rules: ${scannedRules.length}`));
    console.log(chalk.gray(`Total files detected: ${foundFiles.length}`));
    
    // Show risk breakdown
    const riskCounts = foundFiles.reduce((acc, f) => {
      acc[f.risk] = (acc[f.risk] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(chalk.gray('\nRisk breakdown:'));
    Object.entries(riskCounts).forEach(([risk, count]) => {
      const color = risk === 'CRITICAL' ? chalk.red : 
                   risk === 'HIGH' ? chalk.red : 
                   risk === 'MEDIUM' ? chalk.yellow : chalk.gray;
      console.log(chalk.gray(`  ${color(risk)}: ${count} files`));
    });
    
    console.log(chalk.blue.bold('\n📋 Next steps:'));
    console.log(chalk.gray(`1. Review generated config: ${chalk.cyan(outputPath)}`));
    console.log(chalk.gray(`2. Validate: ${chalk.cyan(`claude-security validate ${outputPath}`)}`));
    console.log(chalk.gray(`3. Deploy: ${chalk.cyan(`claude-security deploy ${outputPath} -e ${baseTemplate}`)}`));
    
  } catch (error) {
    console.error(chalk.red.bold('❌ Failed to generate configuration:'));
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    throw error;
  }
}

/**
 * Handle command-specific errors with appropriate formatting
 */
function handleCommandError(error: unknown, command: string): never {
  if (error instanceof CLIError) {
    console.error(chalk.red.bold(`${command} error:`), error.message);
    process.exit(error.exitCode);
  }
  
  if (error instanceof Error) {
    console.error(chalk.red.bold(`${command} error:`), error.message);
    
    if (process.env.CLI_VERBOSE === 'true') {
      console.error(chalk.gray('Stack trace:'));
      console.error(chalk.gray(error.stack));
    } else {
      console.error(chalk.gray('Use --verbose for full error details'));
    }
  } else {
    console.error(chalk.red.bold(`${command} error:`), String(error));
  }
  
  process.exit(1);
}

/**
 * Enhanced help display with examples
 */
function enhanceHelpDisplay(program: Command): void {
  // Custom help text with examples
  program.addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.gray('Setup security for Claude Code (default):')}
  $ claude-security setup
  $ claude-security setup --ai-tool claude-code --mode detailed

  ${chalk.gray('Setup security for other AI tools:')}
  $ claude-security setup --ai-tool cursor
  $ claude-security setup --ai-tool copilot --dry-run
  $ claude-security setup --ai-tool windsurf --verbose

  ${chalk.gray('Check security status:')}
  $ claude-security status
  $ claude-security status --ai-tool cursor

  ${chalk.gray('Initialize new configuration:')}
  $ claude-security init --template enterprise

  ${chalk.gray('Validate configuration:')}
  $ claude-security validate claude-security.json

  ${chalk.gray('Scan for sensitive files:')}
  $ claude-security scan

${chalk.bold('Environment Variables:')}
  ${chalk.cyan('NODE_ENV')}                   Environment mode (development/production)
  ${chalk.gray('CLAUDE_SECURITY_API_URL')}    ${chalk.gray('[Future] API endpoint for enterprise features')}
  ${chalk.gray('CLAUDE_SECURITY_API_KEY')}    ${chalk.gray('[Future] API authentication key')}

${chalk.bold('Configuration Files:')}
  ${chalk.cyan('claude-security.json')}       Default configuration file
  ${chalk.cyan('.claude-security.config.js')} Advanced configuration options

${chalk.bold('Creating Custom Security Rules:')}
  ${chalk.gray('1. Start with a template:')}     claude-security init --template development
  ${chalk.gray('2. Edit claude-security.json:')} Add custom deny/allow/ask patterns
  ${chalk.gray('3. Validate your rules:')}       claude-security validate
  ${chalk.gray('4. Deploy configuration:')}      claude-security deploy -e development

${chalk.bold('Common Custom Rule Patterns:')}
  ${chalk.cyan('File Access:')}
  • ${chalk.gray('"Read(/path/to/sensitive/*)"')}          Block sensitive directories
  • ${chalk.gray('"Write(.env*)"')}                       Prevent env file modification
  • ${chalk.gray('"Bash(rm -rf *)"')}                     Block destructive commands

  ${chalk.cyan('Sensitive Data Protection:')}
  • ${chalk.gray('"Read(**/secrets/**)"')}                Block secrets directories  
  • ${chalk.gray('"Read(**/.git/config)"')}               Block git credentials
  • ${chalk.gray('"Read(**/id_rsa*)"')}                   Block SSH keys
  • ${chalk.gray('"Read(**/.*_history)"')}                Block shell history

  ${chalk.cyan('Development Safety:')}
  • ${chalk.gray('"Bash(sudo *)"')}                       Require approval for sudo
  • ${chalk.gray('"Bash(curl * | sh)"')}                  Block pipe-to-shell
  • ${chalk.gray('"Write(/etc/**)"')}                     Protect system files

${chalk.bold('Pro Tips:')}
  • Use ${chalk.cyan('--dry-run')} to preview changes before deployment
  • Validate rules with ${chalk.cyan('claude-security validate --conflicts')} 
  • Start permissive and gradually tighten security
  • Test rules in development before production deployment

${chalk.bold('For more information:')}
  Visit ${chalk.blue.underline('https://github.com/org/claude-code-security-rulesets')}
`);
}

/**
 * Show tool-specific introduction
 */
async function showToolIntroduction(aiTool: AIToolType, mode: string, verbose?: boolean): Promise<void> {
  const adapter = await createAdapter(aiTool);
  const toolInfo = await adapter.getToolInfo();
  
  console.log(chalk.blue.bold(`🛡️  ${toolInfo.displayName} Security Setup`));
  console.log(chalk.gray(`${toolInfo.description}\n`));
  
  if (verbose) {
    console.log(chalk.cyan('Tool Information:'));
    console.log(chalk.gray(`  Version: ${toolInfo.version || 'unknown'}`));
    console.log(chalk.gray(`  Installed: ${toolInfo.isInstalled ? 'Yes' : 'No'}`));
    console.log(chalk.gray(`  Config files: ${toolInfo.configFiles.length} found\n`));
  }
  
  // Show mode-specific info
  switch (mode) {
    case 'simple':
      if (verbose) {
        console.log(chalk.gray('Automatic setup with sensible defaults and educational explanations.\n'));
      }
      break;
    case 'detailed':
      console.log(chalk.gray('Step-by-step setup with detailed explanations and progress tracking.'));
      console.log(chalk.gray('You\'ll see exactly what files are found and why they need protection.\n'));
      break;
    case 'expert':
      console.log(chalk.gray('Advanced setup with full control over scan parameters and rule application.'));
      console.log(chalk.gray('Recommended for security professionals and advanced users.\n'));
      break;
    case 'custom':
      console.log(chalk.gray('Interactive setup with full customization of rules and protection levels.'));
      console.log(chalk.gray('You can review and modify every rule before applying.\n'));
      break;
  }
}

/**
 * Run adapter-based setup for non-Claude Code tools
 */
async function runAdapterSetup(adapter: any, options: any): Promise<SetupResult> {
  try {
    console.log(chalk.blue('🔍 Starting adapter setup...'));
    
    // Check if tool is installed
    console.log(chalk.gray('Checking tool installation...'));
    const toolInfo = await adapter.getToolInfo();
    console.log(chalk.green('✅ Tool info retrieved'));
    
    if (!toolInfo.isInstalled) {
      console.log(chalk.yellow(`⚠️  ${toolInfo.displayName} is not installed or not found in PATH.`));
      console.log(chalk.gray('Configuration files will be created but may not take effect until the tool is installed.'));
    }

    // Use the same scanning logic as Claude Code
    console.log(chalk.gray('Creating security wizard...'));
    const wizard = new SecurityWizard();
    console.log(chalk.green('✅ Wizard created'));
    
    const setupOptions = {
      mode: options.mode || 'simple',
      autoConfirm: options.autoConfirm || true, // Force auto-confirm to avoid hanging on prompts
      verbose: options.verbose,
      interactive: false, // Force non-interactive mode
      scanDepth: parseInt(options.scanDepth || '3'),
      projectOnly: options.projectOnly,
      globalOnly: options.globalOnly,
      dryRun: options.dryRun,
      backup: options.backup,
      outputFile: options.output
    };

    // Get scan results
    console.log(chalk.blue.bold('\n🔍 Scanning for sensitive files...\n'));
    console.log(chalk.gray('Starting dual scan...'));
    const scanResult = await (wizard as any).performDualScan(setupOptions);
    console.log(chalk.green('✅ Scan completed'));

    if (options.dryRun) {
      console.log(chalk.yellow.bold('\n🔍 Dry Run - No changes will be made\n'));
      const criticalFiles = scanResult.files.filter((f: any) => f.risk === 'CRITICAL');
      const projectFiles = criticalFiles.filter((f: any) => f.scope === 'project');
      const personalFiles = criticalFiles.filter((f: any) => f.scope === 'personal');
      
      console.log(chalk.cyan('📋 Would protect:'));
      console.log(chalk.gray(`   • ${projectFiles.length} project files`));
      console.log(chalk.gray(`   • ${personalFiles.length} personal files`));
      
      // Show what configuration files would be created
      console.log(chalk.cyan('\n📄 Configuration files that would be created/updated:'));
      const aiToolType = (adapter.constructor.name.includes('Claude') ? 'claude-code' :
                         adapter.constructor.name.includes('Cursor') ? 'cursor' :
                         adapter.constructor.name.includes('Copilot') ? 'copilot' :
                         adapter.constructor.name.includes('Windsurf') ? 'windsurf' : 'claude-code') as AIToolType;
      await showDryRunConfigFiles(adapter, aiToolType, projectFiles, personalFiles);
      
      // Show which files would be protected
      if (criticalFiles.length > 0) {
        console.log(chalk.cyan('\n🛡️  Files that would be protected:'));
        
        if (projectFiles.length > 0) {
          console.log(chalk.yellow('   Project files:'));
          projectFiles.slice(0, 10).forEach((file: any) => {
            console.log(chalk.gray(`     • ${file.relativePath} → ${file.type}`));
          });
          if (projectFiles.length > 10) {
            console.log(chalk.gray(`     • ... and ${projectFiles.length - 10} more project files`));
          }
        }
        
        if (personalFiles.length > 0) {
          console.log(chalk.yellow('   Personal files:'));
          personalFiles.slice(0, 10).forEach((file: any) => {
            console.log(chalk.gray(`     • ${file.relativePath} → ${file.type}`));
          });
          if (personalFiles.length > 10) {
            console.log(chalk.gray(`     • ... and ${personalFiles.length - 10} more personal files`));
          }
        }
      }
      
      return {
        projectRulesApplied: projectFiles.length,
        globalRulesApplied: personalFiles.length,
        backupCreated: false,
        protectedFiles: criticalFiles.map((f: any) => f.relativePath)
      };
    }

    // Apply security configuration
    console.log(chalk.blue.bold('\n🚀 Applying security configuration...\n'));
    console.log(chalk.gray('Generating security config...'));
    const securityConfig = (adapter as any).generateSecurityConfig(scanResult);
    console.log(chalk.green('✅ Security config generated'));
    
    console.log(chalk.gray('Applying security config...'));
    const result = await adapter.applySecurityConfig(scanResult, securityConfig);
    console.log(chalk.green('✅ Security config applied'));
    
    return result;
  } catch (error) {
    console.error(chalk.red('❌ Adapter setup failed:'), error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(chalk.gray('Stack trace:'), error.stack);
    }
    throw error;
  }
}

/**
 * Show what configuration files would be created in dry run mode
 */
async function showDryRunConfigFiles(adapter: any, aiTool: AIToolType, projectFiles: any[], personalFiles: any[]): Promise<void> {
  const toolInfo = await adapter.getToolInfo();
  const homedir = require('os').homedir();
  const currentDir = process.cwd();
  
  switch (aiTool) {
    case 'claude-code':
      console.log(chalk.gray('   Claude Code settings:'));
      if (personalFiles.length > 0) {
        console.log(chalk.gray(`     • ~/.claude/settings.local.json → Global rules (${personalFiles.length} files)`));
      }
      if (projectFiles.length > 0) {
        console.log(chalk.gray(`     • ~/.claude/settings.json → Local project rules (${projectFiles.length} files)`));
      }
      break;
      
    case 'cursor':
      console.log(chalk.gray('   Cursor IDE ignore files:'));
      if (personalFiles.length > 0) {
        console.log(chalk.gray(`     • ~/.cursorignore → Global ignore patterns (${personalFiles.length} files)`));
      }
      if (projectFiles.length > 0) {
        console.log(chalk.gray(`     • ${currentDir}/.cursorignore → Project ignore patterns (${projectFiles.length} files)`));
      }
      console.log(chalk.gray('     • Privacy settings recommendations'));
      break;
      
    case 'copilot':
      console.log(chalk.gray('   GitHub Copilot configuration:'));
      const vscodeSettingsPath = process.platform === 'darwin' 
        ? '~/Library/Application Support/Code/User/settings.json'
        : '~/.config/Code/User/settings.json';
      console.log(chalk.gray(`     • ${vscodeSettingsPath} → VS Code Copilot settings`));
      if (projectFiles.length > 0) {
        console.log(chalk.gray(`     • ${currentDir}/.gitattributes → Repository exclusions (${projectFiles.length} files)`));
      }
      break;
      
    case 'windsurf':
      console.log(chalk.gray('   Windsurf IDE configuration:'));
      if (personalFiles.length > 0) {
        console.log(chalk.gray(`     • ~/.codeiumignore → Global ignore patterns (${personalFiles.length} files)`));
      }
      if (projectFiles.length > 0) {
        console.log(chalk.gray(`     • ${currentDir}/.codeiumignore → Project ignore patterns (${projectFiles.length} files)`));
      }
      const windsurfSettingsPath = process.platform === 'darwin'
        ? '~/Library/Application Support/Windsurf/settings.json'
        : process.platform === 'win32'
        ? '~/AppData/Roaming/Windsurf/settings.json'  
        : '~/.config/windsurf/settings.json';
      console.log(chalk.gray(`     • ${windsurfSettingsPath} → Windsurf security settings`));
      break;
  }
  
  // Show rule examples
  if (projectFiles.length > 0 || personalFiles.length > 0) {
    console.log(chalk.dim('\n   Example rules that would be created:'));
    const exampleRules = new Set<string>();
    [...projectFiles, ...personalFiles].slice(0, 5).forEach((file: any) => {
      if (file.suggestedRule && !exampleRules.has(file.suggestedRule)) {
        exampleRules.add(file.suggestedRule);
        console.log(chalk.dim(`     • ${file.suggestedRule} → Protects ${file.type}`));
      }
    });
    if (projectFiles.length + personalFiles.length > 5) {
      console.log(chalk.dim(`     • ... and ${projectFiles.length + personalFiles.length - 5} more rules`));
    }
  }
}

/**
 * Show adapter setup results
 */
async function showAdapterResults(result: SetupResult, aiTool: AIToolType, mode: string, verbose?: boolean): Promise<void> {
  const adapter = await createAdapter(aiTool);
  const toolInfo = await adapter.getToolInfo();
  
  console.log(chalk.green.bold(`\n🎉 ${toolInfo.displayName} Security Setup Complete!\n`));

  if (verbose || mode !== 'simple') {
    console.log(chalk.cyan('Protection Applied:'));
    console.log(chalk.gray(`  • Project-level rules: ${result.projectRulesApplied}`));
    console.log(chalk.gray(`  • Global-level rules: ${result.globalRulesApplied}`));
    console.log(chalk.gray(`  • Total files protected: ${result.protectedFiles.length}`));
    console.log(chalk.gray(`  • Backup created: ${result.backupCreated ? 'Yes' : 'No'}\n`));
  }

  console.log(chalk.cyan(`${toolInfo.displayName} will now:`));
  console.log(chalk.red('❌ Skip or ignore your sensitive files during code analysis'));
  console.log(chalk.green('✅ Continue helping with your regular code files'));
  console.log(chalk.blue('ℹ️  Refer to tool-specific documentation for advanced settings\n'));

  const helpInfo = adapter.getHelpInfo();
  console.log(chalk.blue('Need to check or change settings later?'));
  console.log(chalk.gray('Run: ') + chalk.white(`claude-security status --ai-tool ${aiTool}`));
  if (helpInfo.documentationUrl) {
    console.log(chalk.gray('Docs: ') + chalk.blue.underline(helpInfo.documentationUrl));
  }
  console.log();
}

/**
 * Show adapter status
 */
async function showAdapterStatus(adapter: any, aiTool: AIToolType): Promise<void> {
  const toolInfo = await adapter.getToolInfo();
  
  console.log(chalk.blue.bold(`📊 ${toolInfo.displayName} Security Status\n`));
  
  console.log(chalk.cyan('Tool Information:'));
  console.log(chalk.gray(`  Name: ${toolInfo.displayName}`));
  console.log(chalk.gray(`  Installed: ${toolInfo.isInstalled ? 'Yes' : 'No'}`));
  if (toolInfo.version) {
    console.log(chalk.gray(`  Version: ${toolInfo.version}`));
  }
  
  const status = await adapter.getSecurityStatus();
  console.log(chalk.cyan('\nSecurity Configuration:'));
  console.log(chalk.gray(`  Configured: ${status.isConfigured ? 'Yes' : 'No'}`));
  console.log(chalk.gray(`  Active rules: ${status.configuredRules}`));
  
  if (status.configurationFiles.length > 0) {
    console.log(chalk.cyan('\nConfiguration Files:'));
    status.configurationFiles.forEach((file: string) => {
      console.log(chalk.gray(`  • ${file}`));
    });
  }
  
  if (status.lastUpdated) {
    console.log(chalk.gray(`\nLast updated: ${status.lastUpdated.toLocaleString()}`));
  }

  const helpInfo = adapter.getHelpInfo();
  console.log(chalk.blue('\nManagement Commands:'));
  console.log(chalk.gray(`  • Setup: ${chalk.white(`claude-security setup --ai-tool ${aiTool}`)}`));
  console.log(chalk.gray(`  • Validate: ${chalk.white(`claude-security validate --ai-tool ${aiTool}`)}`));
  if (helpInfo.documentationUrl) {
    console.log(chalk.gray(`  • Documentation: ${chalk.blue.underline(helpInfo.documentationUrl)}`));
  }
}

/**
 * Main CLI execution function
 */
async function main(): Promise<void> {
  // Setup error handling
  setupErrorHandling();

  try {
    // Create and configure program
    const program = createProgram();
    
    // Add all commands
    addCommands(program);
    
    // Enhance help display
    enhanceHelpDisplay(program);
    
    // Parse command line arguments
    await program.parseAsync(process.argv);
    
  } catch (error) {
    if (error instanceof CLIError) {
      console.error(chalk.red.bold('CLI Error:'), error.message);
      process.exit(error.exitCode);
    }
    
    console.error(chalk.red.bold('Unexpected error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Handle direct execution vs module import
if (require.main === module) {
  void main();
}

export { main, CLIError, type GlobalOptions };