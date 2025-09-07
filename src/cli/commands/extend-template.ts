import { Command } from 'commander';
import * as inquirer from 'inquirer';
import * as chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';

import { TemplateExtensionManager } from '../../templates/extensibility/extension-manager';
import { TemplateInheritanceEngine } from '../../templates/extensibility/inheritance';
import { CustomTemplateBuilder } from '../../templates/extensibility/custom-builder';
import { ExtendableTemplate, TemplateBuildContext, ExtensionType } from '../../templates/extensibility/types';

/**
 * Extend template command
 */
export function extendTemplateCommand(): Command {
  const command = new Command('extend-template');
  
  command
    .description('Extend existing templates with inheritance or composition')
    .option('-l, --list', 'List available templates to extend')
    .option('-t, --template <template-id>', 'Template ID to extend')
    .option('--type <type>', 'Extension type: inherit|compose|override', 'inherit')
    .option('-n, --name <name>', 'New template name')
    .option('-d, --description <description>', 'Template description')
    .option('-o, --output <directory>', 'Output directory for extended template', './templates')
    .option('--interactive', 'Interactive mode for template extension')
    .option('--preview', 'Preview the extended template without saving')
    .action(async (options) => {
      try {
        await handleExtendTemplate(options);
      } catch (error) {
        console.error(chalk.red('❌ Failed to extend template:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Handle extend template command
 */
async function handleExtendTemplate(options: any): Promise<void> {
  const extensionManager = new TemplateExtensionManager({
    storageRoot: path.join(process.cwd(), '.claude-code', 'extensions')
  });
  
  const inheritanceEngine = new TemplateInheritanceEngine();
  const templateBuilder = new CustomTemplateBuilder();

  await extensionManager.initialize();

  console.log(chalk.blue('🔧 Template Extension Tool'));
  console.log(chalk.gray('============================\n'));

  // List templates if requested
  if (options.list) {
    await listAvailableTemplates(extensionManager);
    return;
  }

  // Get target template
  let templateId = options.template;
  if (!templateId) {
    templateId = await selectTemplate(extensionManager);
  }

  // Get extension details
  const extensionDetails = await getExtensionDetails(options);

  // Build context
  const context: TemplateBuildContext = {
    environment: 'development',
    parameters: {},
    availableTemplates: extensionManager.listExtensions().map(e => e.extension) as ExtendableTemplate[],
    metadata: {
      buildId: generateBuildId(),
      timestamp: new Date(),
      version: '1.0.0'
    }
  };

  let extendedTemplate: ExtendableTemplate;

  // Handle different extension types
  switch (extensionDetails.type) {
    case 'inherit':
      extendedTemplate = await handleInheritance(
        templateId,
        extensionDetails,
        inheritanceEngine,
        context
      );
      break;
      
    case 'compose':
      extendedTemplate = await handleComposition(
        templateId,
        extensionDetails,
        templateBuilder,
        extensionManager,
        context
      );
      break;
      
    case 'override':
      extendedTemplate = await handleOverride(
        templateId,
        extensionDetails,
        extensionManager,
        context
      );
      break;
      
    default:
      throw new Error(`Unknown extension type: ${extensionDetails.type}`);
  }

  // Show preview
  await showExtendedTemplatePreview(extendedTemplate, templateId, extensionDetails.type);

  if (options.preview) {
    console.log(chalk.yellow('🔍 Preview mode - template not saved'));
    return;
  }

  // Confirm save
  const saveConfirm = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'save',
      message: 'Save the extended template?',
      default: true
    }
  ]);

  if (saveConfirm.save) {
    const outputPath = await saveExtendedTemplate(extendedTemplate, options.output);
    console.log(chalk.green('✅ Extended template saved successfully!'));
    console.log(chalk.gray(`📁 Saved to: ${outputPath}`));
  }

  // Cleanup
  await extensionManager.cleanup();
}

/**
 * List available templates
 */
async function listAvailableTemplates(extensionManager: TemplateExtensionManager): Promise<void> {
  console.log(chalk.blue('📋 Available Templates'));
  console.log(chalk.gray('========================\n'));

  const extensions = extensionManager.listExtensions();
  
  if (extensions.length === 0) {
    console.log(chalk.yellow('No templates available'));
    return;
  }

  const templates = new Map<string, ExtendableTemplate>();
  
  // Collect unique templates
  extensions.forEach(entry => {
    const template = entry.extension as ExtendableTemplate;
    if (!templates.has(template.targetTemplateId)) {
      templates.set(template.targetTemplateId, template);
    }
  });

  // Display templates
  Array.from(templates.values()).forEach((template, index) => {
    console.log(chalk.white(`${index + 1}. ${template.name || template.id}`));
    console.log(chalk.gray(`   ID: ${template.id}`));
    console.log(chalk.gray(`   Description: ${template.description}`));
    console.log(chalk.gray(`   Version: ${template.version}`));
    console.log(chalk.gray(`   Type: ${template.inheritance.extensionType}`));
    console.log(chalk.gray(`   Level: ${template.inheritance.level}`));
    
    if (template.tags && template.tags.length > 0) {
      console.log(chalk.gray(`   Tags: ${template.tags.join(', ')}`));
    }
    
    console.log('');
  });
}

/**
 * Select template interactively
 */
async function selectTemplate(extensionManager: TemplateExtensionManager): Promise<string> {
  const extensions = extensionManager.listExtensions();
  
  if (extensions.length === 0) {
    throw new Error('No templates available to extend');
  }

  const templates = new Map<string, ExtendableTemplate>();
  
  // Collect unique templates
  extensions.forEach(entry => {
    const template = entry.extension as ExtendableTemplate;
    if (!templates.has(template.targetTemplateId)) {
      templates.set(template.targetTemplateId, template);
    }
  });

  const templateArray = Array.from(templates.values());
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'templateId',
      message: 'Select template to extend:',
      choices: templateArray.map(template => ({
        name: `${template.name || template.id} - ${template.description}`,
        value: template.id
      }))
    }
  ]);

  return answer.templateId;
}

/**
 * Get extension details from options or prompts
 */
async function getExtensionDetails(options: any): Promise<ExtensionDetails> {
  const details: ExtensionDetails = {
    type: options.type as ExtensionType,
    name: options.name,
    description: options.description
  };

  // If interactive mode or missing details, prompt user
  if (options.interactive || !details.name) {
    const questions: inquirer.QuestionCollection = [];

    if (!details.name) {
      questions.push({
        type: 'input',
        name: 'name',
        message: 'Extended template name:',
        validate: (input) => input.trim().length > 0 || 'Name is required'
      });
    }

    if (!details.description) {
      questions.push({
        type: 'input',
        name: 'description',
        message: 'Template description:',
        default: 'Extended template'
      });
    }

    if (!options.type) {
      questions.push({
        type: 'list',
        name: 'type',
        message: 'Extension type:',
        choices: [
          { name: 'Inherit - Copy all rules from parent', value: 'inherit' },
          { name: 'Compose - Merge with multiple templates', value: 'compose' },
          { name: 'Override - Replace specific rules', value: 'override' }
        ]
      });
    }

    const answers = await inquirer.prompt(questions);
    Object.assign(details, answers);
  }

  return details;
}

/**
 * Handle template inheritance
 */
async function handleInheritance(
  templateId: string,
  details: ExtensionDetails,
  inheritanceEngine: TemplateInheritanceEngine,
  context: TemplateBuildContext
): Promise<ExtendableTemplate> {
  console.log(chalk.blue('\n🔗 Creating inherited template...'));

  // Get additional configuration for inheritance
  const inheritanceConfig = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'canOverrideRules',
      message: 'Allow rule overrides?',
      default: true
    },
    {
      type: 'confirm',
      name: 'canAddRules',
      message: 'Allow adding new rules?',
      default: true
    },
    {
      type: 'confirm',
      name: 'canRemoveRules',
      message: 'Allow removing rules?',
      default: false
    }
  ]);

  const templateData: Partial<ExtendableTemplate> = {
    name: details.name,
    description: details.description,
    inheritance: {
      permissions: inheritanceConfig
    }
  };

  // Add custom rules if desired
  const addCustomRules = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'add',
      message: 'Add custom rules to the inherited template?',
      default: false
    }
  ]);

  if (addCustomRules.add) {
    templateData.rules = await buildCustomRules();
  }

  return inheritanceEngine.createInheritedTemplate(
    templateId,
    templateData,
    'inherit'
  );
}

/**
 * Handle template composition
 */
async function handleComposition(
  baseTemplateId: string,
  details: ExtensionDetails,
  templateBuilder: CustomTemplateBuilder,
  extensionManager: TemplateExtensionManager,
  context: TemplateBuildContext
): Promise<ExtendableTemplate> {
  console.log(chalk.blue('\n🔀 Creating composed template...'));

  // Select additional templates to compose
  const availableTemplates = extensionManager.listExtensions()
    .map(e => e.extension as ExtendableTemplate)
    .filter(t => t.id !== baseTemplateId);

  if (availableTemplates.length === 0) {
    throw new Error('No additional templates available for composition');
  }

  const compositionTemplates = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'templates',
      message: 'Select templates to compose:',
      choices: availableTemplates.map(template => ({
        name: `${template.name || template.id} - ${template.description}`,
        value: template.id
      })),
      validate: (answer) => answer.length > 0 || 'Select at least one template'
    }
  ]);

  // Get merge strategy
  const mergeConfig = await inquirer.prompt([
    {
      type: 'list',
      name: 'rulesMerge',
      message: 'Rules merge strategy:',
      choices: [
        { name: 'Deep merge (combine all)', value: 'deep_merge' },
        { name: 'Replace (last wins)', value: 'replace' },
        { name: 'Append (add to existing)', value: 'append' }
      ]
    },
    {
      type: 'list',
      name: 'conflictResolution',
      message: 'Conflict resolution:',
      choices: [
        { name: 'Error (stop on conflicts)', value: 'error' },
        { name: 'Warn (log and continue)', value: 'warn' },
        { name: 'Merge (attempt to combine)', value: 'merge' },
        { name: 'Override (last template wins)', value: 'override' }
      ]
    }
  ]);

  // Build composition config
  const config = {
    type: 'compose',
    compositionConfig: {
      baseTemplateId,
      templates: compositionTemplates.templates.map((id: string, index: number) => ({
        templateId: id,
        priority: index + 1
      })),
      mergeStrategy: {
        rules: mergeConfig.rulesMerge,
        arrays: 'unique_merge',
        objects: 'deep_merge',
        parameters: 'validate_merge'
      },
      conflictResolution: {
        defaultStrategy: mergeConfig.conflictResolution,
        interactive: false,
        logConflicts: true
      },
      metadata: {
        name: details.name!,
        description: details.description!,
        version: '1.0.0',
        author: process.env.USER || 'Unknown'
      }
    }
  };

  return templateBuilder.buildFromConfig(config);
}

/**
 * Handle template override
 */
async function handleOverride(
  templateId: string,
  details: ExtensionDetails,
  extensionManager: TemplateExtensionManager,
  context: TemplateBuildContext
): Promise<ExtendableTemplate> {
  console.log(chalk.blue('\n✏️ Creating override template...'));

  // Get rules to override
  const overrideRules = await buildCustomRules();

  // Get rules to remove
  const removeRulesConfig = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'removeRules',
      message: 'Remove specific rules from parent template?',
      default: false
    }
  ]);

  let removeRules: string[] = [];
  if (removeRulesConfig.removeRules) {
    const removeRulesInput = await inquirer.prompt([
      {
        type: 'input',
        name: 'paths',
        message: 'Enter rule paths to remove (comma-separated):',
        filter: (input) => input.split(',').map((s: string) => s.trim()).filter((s: string) => s)
      }
    ]);
    removeRules = removeRulesInput.paths;
  }

  // Create extension
  const extension = await extensionManager.createExtension(
    templateId,
    {
      name: `${details.name} Override`,
      type: 'override',
      rules: overrideRules,
      removeRules,
      priority: 200,
      metadata: {
        description: details.description || 'Override extension',
        author: process.env.USER || 'Unknown',
        version: '1.0.0'
      }
    },
    context
  );

  // Create extended template with the override
  const baseTemplate = extensionManager.listExtensions()
    .find(e => e.extension.id === templateId)?.extension as ExtendableTemplate;

  if (!baseTemplate) {
    throw new Error(`Base template not found: ${templateId}`);
  }

  return {
    ...baseTemplate,
    id: generateTemplateId(),
    name: details.name!,
    description: details.description!,
    extensions: [extension],
    isBuiltIn: false,
    updatedAt: new Date()
  };
}

/**
 * Build custom rules interactively
 */
async function buildCustomRules(): Promise<any> {
  const rules: any = { deny: [], allow: [] };

  console.log(chalk.cyan('\n📋 Custom Rules Configuration'));

  // Add deny rules
  const addDenyRules = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'add',
      message: 'Add deny rules?',
      default: true
    }
  ]);

  if (addDenyRules.add) {
    console.log(chalk.red('Deny Rules (press Enter with empty input to finish):'));
    rules.deny = await collectRules();
  }

  // Add allow rules
  const addAllowRules = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'add',
      message: 'Add allow rules?',
      default: false
    }
  ]);

  if (addAllowRules.add) {
    console.log(chalk.green('Allow Rules (press Enter with empty input to finish):'));
    rules.allow = await collectRules();
  }

  return rules;
}

/**
 * Collect rules interactively
 */
async function collectRules(): Promise<string[]> {
  const rules: string[] = [];
  
  while (true) {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'rule',
        message: `Rule ${rules.length + 1}:`,
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
 * Show extended template preview
 */
async function showExtendedTemplatePreview(
  template: ExtendableTemplate,
  originalTemplateId: string,
  extensionType: ExtensionType
): Promise<void> {
  console.log(chalk.blue('\n📋 Extended Template Preview'));
  console.log(chalk.gray('===============================\n'));

  console.log(chalk.white(`Original Template: ${originalTemplateId}`));
  console.log(chalk.white(`Extension Type: ${extensionType}`));
  console.log(chalk.white(`New Name: ${template.name}`));
  console.log(chalk.white(`Description: ${template.description}`));
  console.log(chalk.white(`Version: ${template.version}`));

  // Show inheritance chain
  if (template.inheritance.chain.length > 0) {
    console.log(chalk.yellow(`\nInheritance Chain:`));
    template.inheritance.chain.forEach((id, index) => {
      console.log(chalk.yellow(`  ${index + 1}. ${id}`));
    });
  }

  // Show rules
  if (template.rules.deny && template.rules.deny.length > 0) {
    console.log(chalk.red(`\nDeny Rules (${template.rules.deny.length}):`));
    template.rules.deny.slice(0, 5).forEach((rule, index) => {
      console.log(chalk.red(`  ${index + 1}. ${rule}`));
    });
    if (template.rules.deny.length > 5) {
      console.log(chalk.red(`  ... and ${template.rules.deny.length - 5} more`));
    }
  }

  if (template.rules.allow && template.rules.allow.length > 0) {
    console.log(chalk.green(`\nAllow Rules (${template.rules.allow.length}):`));
    template.rules.allow.slice(0, 5).forEach((rule, index) => {
      console.log(chalk.green(`  ${index + 1}. ${rule}`));
    });
    if (template.rules.allow.length > 5) {
      console.log(chalk.green(`  ... and ${template.rules.allow.length - 5} more`));
    }
  }

  // Show extensions
  if (template.extensions && template.extensions.length > 0) {
    console.log(chalk.magenta(`\nExtensions (${template.extensions.length}):`));
    template.extensions.forEach((ext, index) => {
      console.log(chalk.magenta(`  ${index + 1}. ${ext.name} (${ext.type}, priority: ${ext.priority})`));
    });
  }

  console.log('');
}

/**
 * Save extended template
 */
async function saveExtendedTemplate(
  template: ExtendableTemplate,
  outputDir: string
): Promise<string> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Create filename
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

  return outputPath;
}

/**
 * Generate build ID
 */
function generateBuildId(): string {
  return `build-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate template ID
 */
function generateTemplateId(): string {
  return `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extension details interface
 */
interface ExtensionDetails {
  type: ExtensionType;
  name?: string;
  description?: string;
}