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

// Import command handlers
import { handleInit, BUILT_IN_TEMPLATES } from './commands/init';
import { handleGenerate } from './commands/generate';
import { handleValidate } from './commands/validate';
import { handleDeploy } from './commands/deploy';

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
    .description('CLI tool for managing Claude Code security configurations with zero-bypass deny enforcement')
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
        await handleValidate(file, options);
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
  ${chalk.gray('Initialize new configuration:')}
  $ claude-security init --template enterprise

  ${chalk.gray('Generate from template:')}
  $ claude-security generate -t production -e production

  ${chalk.gray('Validate configuration:')}
  $ claude-security validate claude-security.json

  ${chalk.gray('Deploy to environment:')}
  $ claude-security deploy -e staging --dry-run

${chalk.bold('Environment Variables:')}
  ${chalk.cyan('NODE_ENV')}                   Environment mode (development/production)
  ${chalk.gray('CLAUDE_SECURITY_API_URL')}    ${chalk.gray('[Future] API endpoint for enterprise features')}
  ${chalk.gray('CLAUDE_SECURITY_API_KEY')}    ${chalk.gray('[Future] API authentication key')}

${chalk.bold('Configuration Files:')}
  ${chalk.cyan('claude-security.json')}       Default configuration file
  ${chalk.cyan('.claude-security.config.js')} Advanced configuration options

${chalk.bold('For more information:')}
  Visit ${chalk.blue.underline('https://github.com/org/claude-code-security-rulesets')}
`);
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