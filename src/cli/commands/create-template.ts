import { Command } from 'commander';
import * as inquirer from 'inquirer';
import * as chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';

import { CustomTemplateBuilder, TemplateBuilderConfig } from '../../templates/extensibility/custom-builder';
import { TemplateExtensionManager } from '../../templates/extensibility/extension-manager';
import { ExtendableTemplate, TemplateBuildContext } from '../../templates/extensibility/types';
import { SecurityTemplate, ClaudeCodeConfiguration } from '../../types';

/**
 * Create template command
 */
export function createTemplateCommand(): Command {
  const command = new Command('create-template');
  
  command
    .description('Create a new security template with guided wizard or configuration')
    .option('-i, --interactive', 'Launch interactive template builder wizard')
    .option('-c, --config <file>', 'Create template from configuration file')
    .option('-o, --output <directory>', 'Output directory for generated template', './templates')
    .option('--type <type>', 'Template type: new|inherit|compose|extend', 'new')
    .option('--parent <template-id>', 'Parent template ID for inheritance')
    .option('--name <name>', 'Template name')
    .option('--description <description>', 'Template description')
    .option('--dry-run', 'Preview template without saving')
    .action(async (options) => {
      try {
        await handleCreateTemplate(options);
      } catch (error) {
        console.error(chalk.red('❌ Failed to create template:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Handle create template command
 */
async function handleCreateTemplate(options: any): Promise<void> {
  const builder = new CustomTemplateBuilder();
  const extensionManager = new TemplateExtensionManager({
    storageRoot: path.join(process.cwd(), '.claude-code', 'extensions')
  });

  await extensionManager.initialize();

  console.log(chalk.blue('🚀 Claude Code Template Creator'));
  console.log(chalk.gray('=====================================\n'));

  let template: ExtendableTemplate;

  if (options.interactive) {
    // Interactive mode
    template = await builder.startInteractiveBuilder();
  } else if (options.config) {
    // Configuration file mode
    const configPath = path.resolve(options.config);
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: TemplateBuilderConfig = JSON.parse(configContent);
    
    template = await builder.buildFromConfig(config);
  } else {
    // CLI options mode
    template = await buildFromCliOptions(options, builder);
  }

  // Build context
  const context: TemplateBuildContext = {
    environment: 'development',
    parameters: {},
    availableTemplates: [],
    metadata: {
      buildId: generateBuildId(),
      timestamp: new Date(),
      version: '1.0.0'
    }
  };

  // Finalize template
  const finalizedTemplate = await builder.finalizeTemplate(template, context);

  // Show template preview
  await showTemplatePreview(finalizedTemplate);

  if (options.dryRun) {
    console.log(chalk.yellow('🔍 Dry run mode - template not saved'));
    return;
  }

  // Save template
  const outputPath = await saveTemplate(finalizedTemplate, options.output);
  
  console.log(chalk.green('✅ Template created successfully!'));
  console.log(chalk.gray(`📁 Saved to: ${outputPath}`));

  // Cleanup
  await extensionManager.cleanup();
}

/**
 * Build template from CLI options
 */
async function buildFromCliOptions(
  options: any,
  builder: CustomTemplateBuilder
): Promise<ExtendableTemplate> {
  const config: TemplateBuilderConfig = {
    type: options.type || 'new',
    metadata: {
      name: options.name,
      description: options.description
    }
  };

  if (options.parent) {
    config.parentTemplateId = options.parent;
    config.extensionType = 'inherit';
  }

  // If no name provided, prompt for essential information
  if (!options.name) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Template name:',
        validate: (input) => input.trim().length > 0 || 'Template name is required'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Template description:',
        default: 'Custom security template'
      },
      {
        type: 'list',
        name: 'category',
        message: 'Template category:',
        choices: [
          { name: 'Security', value: 'security' },
          { name: 'Performance', value: 'performance' },
          { name: 'Best Practices', value: 'best-practices' },
          { name: 'Custom', value: 'custom' }
        ]
      }
    ]);

    config.metadata = {
      ...config.metadata,
      ...answers
    };
  }

  // Build rules interactively if not in quiet mode
  if (config.type === 'new') {
    config.rules = await buildRulesFromPrompt();
  }

  return builder.buildFromConfig(config);
}

/**
 * Build rules from user prompts
 */
async function buildRulesFromPrompt(): Promise<ClaudeCodeConfiguration> {
  console.log(chalk.blue('\n📋 Configure Security Rules'));
  console.log(chalk.gray('Add rules to define what should be allowed or denied\n'));

  const rules: ClaudeCodeConfiguration = { deny: [], allow: [] };

  // Add deny rules
  const addDenyRules = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addDeny',
      message: 'Add deny rules (things to prohibit)?',
      default: true
    }
  ]);

  if (addDenyRules.addDeny) {
    rules.deny = await collectRules('deny', 'What patterns should be denied?');
  }

  // Add allow rules
  const addAllowRules = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addAllow',
      message: 'Add allow rules (things to permit)?',
      default: false
    }
  ]);

  if (addAllowRules.addAllow) {
    rules.allow = await collectRules('allow', 'What patterns should be allowed?');
  }

  return rules;
}

/**
 * Collect rules from user input
 */
async function collectRules(type: 'deny' | 'allow', message: string): Promise<string[]> {
  const rules: string[] = [];
  
  console.log(chalk.cyan(`\n${type.toUpperCase()} Rules:`));
  console.log(chalk.gray('Enter rules one by one (press Enter with empty input to finish)\n'));

  // Show some examples
  if (type === 'deny') {
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  - eval('));
    console.log(chalk.gray('  - innerHTML ='));
    console.log(chalk.gray('  - document.write('));
    console.log(chalk.gray('  - process.env.PASSWORD\n'));
  } else {
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  - process.env.NODE_ENV'));
    console.log(chalk.gray('  - console.log('));
    console.log(chalk.gray('  - require(\'fs\').readFile\n'));
  }

  while (true) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'rule',
        message: `${type} rule ${rules.length + 1}:`,
        when: () => true
      }
    ]);

    if (!answer.rule.trim()) {
      break;
    }

    rules.push(answer.rule.trim());
    console.log(chalk.green(`✓ Added: ${answer.rule}`));
  }

  return rules;
}

/**
 * Show template preview
 */
async function showTemplatePreview(template: ExtendableTemplate): Promise<void> {
  console.log(chalk.blue('\n📋 Template Preview'));
  console.log(chalk.gray('===================================\n'));

  console.log(chalk.white(`Name: ${template.name}`));
  console.log(chalk.white(`Description: ${template.description}`));
  console.log(chalk.white(`Version: ${template.version}`));
  console.log(chalk.white(`Category: ${template.category}`));
  console.log(chalk.white(`Type: ${template.inheritance.extensionType}`));

  if (template.tags && template.tags.length > 0) {
    console.log(chalk.white(`Tags: ${template.tags.join(', ')}`));
  }

  // Show rules
  if (template.rules.deny && template.rules.deny.length > 0) {
    console.log(chalk.red(`\nDeny Rules (${template.rules.deny.length}):`));
    template.rules.deny.forEach((rule, index) => {
      console.log(chalk.red(`  ${index + 1}. ${rule}`));
    });
  }

  if (template.rules.allow && template.rules.allow.length > 0) {
    console.log(chalk.green(`\nAllow Rules (${template.rules.allow.length}):`));
    template.rules.allow.forEach((rule, index) => {
      console.log(chalk.green(`  ${index + 1}. ${rule}`));
    });
  }

  // Show parameters
  if (template.parameters && template.parameters.length > 0) {
    console.log(chalk.cyan(`\nParameters (${template.parameters.length}):`));
    template.parameters.forEach((param, index) => {
      const required = param.required ? chalk.red('*') : '';
      console.log(chalk.cyan(`  ${index + 1}. ${param.name}${required} (${param.type}) - ${param.description}`));
    });
  }

  // Show inheritance info
  if (template.inheritance.parentId) {
    console.log(chalk.yellow(`\nInheritance:`));
    console.log(chalk.yellow(`  Parent: ${template.inheritance.parentId}`));
    console.log(chalk.yellow(`  Type: ${template.inheritance.extensionType}`));
    console.log(chalk.yellow(`  Level: ${template.inheritance.level}`));
  }

  // Show extensions
  if (template.extensions && template.extensions.length > 0) {
    console.log(chalk.magenta(`\nExtensions (${template.extensions.length}):`));
    template.extensions.forEach((ext, index) => {
      console.log(chalk.magenta(`  ${index + 1}. ${ext.name} (priority: ${ext.priority})`));
    });
  }

  console.log('');
}

/**
 * Save template to file system
 */
async function saveTemplate(
  template: ExtendableTemplate,
  outputDir: string
): Promise<string> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Create filename from template name
  const filename = `${template.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.json`;
  const outputPath = path.join(outputDir, filename);

  // Save template
  const templateData = {
    ...template,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };

  await fs.writeFile(
    outputPath,
    JSON.stringify(templateData, null, 2),
    'utf-8'
  );

  // Also save as .js file for easier import
  const jsPath = outputPath.replace('.json', '.js');
  const jsContent = `module.exports = ${JSON.stringify(templateData, null, 2)};`;
  await fs.writeFile(jsPath, jsContent, 'utf-8');

  return outputPath;
}

/**
 * Generate build ID
 */
function generateBuildId(): string {
  return `build-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extended create template command with more options
 */
export function createExtendedTemplateCommand(): Command {
  const command = new Command('create-extended-template');
  
  command
    .description('Create a template that extends an existing template')
    .requiredOption('-t, --target <template-id>', 'Target template to extend')
    .option('-n, --name <name>', 'Extension name')
    .option('-d, --description <description>', 'Extension description')
    .option('-p, --priority <number>', 'Extension priority', '100')
    .option('-o, --output <directory>', 'Output directory', './extensions')
    .option('--add-rules', 'Add additional rules interactively')
    .option('--remove-rules <rules>', 'Comma-separated list of rule paths to remove')
    .action(async (options) => {
      try {
        await handleCreateExtendedTemplate(options);
      } catch (error) {
        console.error(chalk.red('❌ Failed to create extended template:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Handle create extended template command
 */
async function handleCreateExtendedTemplate(options: any): Promise<void> {
  const extensionManager = new TemplateExtensionManager({
    storageRoot: path.join(process.cwd(), '.claude-code', 'extensions')
  });

  await extensionManager.initialize();

  console.log(chalk.blue('🔧 Create Template Extension'));
  console.log(chalk.gray('===============================\n'));

  // Get extension details
  let extensionName = options.name;
  let description = options.description;

  if (!extensionName) {
    const nameAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Extension name:',
        validate: (input) => input.trim().length > 0 || 'Extension name is required'
      }
    ]);
    extensionName = nameAnswer.name;
  }

  if (!description) {
    const descAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Extension description:',
        default: `Extension for ${options.target}`
      }
    ]);
    description = descAnswer.description;
  }

  // Build extension rules
  let additionalRules: ClaudeCodeConfiguration = { deny: [], allow: [] };
  
  if (options.addRules) {
    additionalRules = await buildRulesFromPrompt();
  }

  // Parse remove rules
  let removeRules: string[] = [];
  if (options.removeRules) {
    removeRules = options.removeRules.split(',').map((r: string) => r.trim());
  }

  // Build context
  const context: TemplateBuildContext = {
    environment: 'development',
    parameters: {},
    availableTemplates: [],
    metadata: {
      buildId: generateBuildId(),
      timestamp: new Date(),
      version: '1.0.0'
    }
  };

  // Create extension
  const extension = await extensionManager.createExtension(
    options.target,
    {
      name: extensionName,
      type: 'extend',
      rules: additionalRules,
      removeRules,
      priority: parseInt(options.priority),
      metadata: {
        description,
        author: process.env.USER || 'Unknown',
        version: '1.0.0'
      }
    },
    context
  );

  console.log(chalk.green('✅ Extension created successfully!'));
  console.log(chalk.gray(`📋 Extension ID: ${extension.id}`));

  // Show extension preview
  console.log(chalk.blue('\n📋 Extension Preview'));
  console.log(chalk.gray('========================\n'));

  console.log(chalk.white(`Name: ${extension.name}`));
  console.log(chalk.white(`Target: ${extension.targetTemplateId}`));
  console.log(chalk.white(`Type: ${extension.type}`));
  console.log(chalk.white(`Priority: ${extension.priority}`));
  console.log(chalk.white(`Version: ${extension.metadata.version}`));

  if (additionalRules.deny && additionalRules.deny.length > 0) {
    console.log(chalk.red(`\nAdditional Deny Rules:`));
    additionalRules.deny.forEach(rule => console.log(chalk.red(`  - ${rule}`)));
  }

  if (additionalRules.allow && additionalRules.allow.length > 0) {
    console.log(chalk.green(`\nAdditional Allow Rules:`));
    additionalRules.allow.forEach(rule => console.log(chalk.green(`  - ${rule}`)));
  }

  if (removeRules.length > 0) {
    console.log(chalk.yellow(`\nRules to Remove:`));
    removeRules.forEach(rule => console.log(chalk.yellow(`  - ${rule}`)));
  }

  // Cleanup
  await extensionManager.cleanup();
}