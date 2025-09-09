import { Command } from 'commander';
import * as inquirer from 'inquirer';
import * as chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs/promises';

import { TemplatePluginManager, TemplatePluginManifest } from '../../templates/extensibility/plugins';
import { TemplateExtensionManager } from '../../templates/extensibility/extension-manager';
import { CustomValidationRule } from '../../templates/extensibility/types';

/**
 * Manage plugins command
 */
export function managePluginsCommand(): Command {
  const command = new Command('plugins');
  
  command.description('Manage template plugins and custom validation rules');

  // List plugins subcommand
  command
    .command('list')
    .description('List installed plugins')
    .option('-c, --category <category>', 'Filter by category')
    .option('-s, --state <state>', 'Filter by state (ready|active|error|disabled)')
    .option('--metrics', 'Show plugin metrics')
    .action(async (options) => {
      try {
        await handleListPlugins(options);
      } catch (error) {
        console.error(chalk.red('❌ Failed to list plugins:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Install plugin subcommand
  command
    .command('install <plugin-file>')
    .description('Install a plugin from file')
    .option('-c, --config <config-file>', 'Plugin configuration file')
    .option('--enable', 'Enable plugin after installation')
    .action(async (pluginFile, options) => {
      try {
        await handleInstallPlugin(pluginFile, options);
      } catch (error) {
        console.error(chalk.red('❌ Failed to install plugin:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Create plugin subcommand
  command
    .command('create')
    .description('Create a new plugin with wizard')
    .option('-t, --type <type>', 'Plugin type (validation|generation|transformation)', 'validation')
    .option('-n, --name <name>', 'Plugin name')
    .option('-o, --output <directory>', 'Output directory', './plugins')
    .action(async (options) => {
      try {
        await handleCreatePlugin(options);
      } catch (error) {
        console.error(chalk.red('❌ Failed to create plugin:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Enable/disable plugin subcommands
  command
    .command('enable <plugin-id>')
    .description('Enable a plugin')
    .action(async (pluginId) => {
      try {
        await handleTogglePlugin(pluginId, true);
      } catch (error) {
        console.error(chalk.red('❌ Failed to enable plugin:'), (error as Error).message);
        process.exit(1);
      }
    });

  command
    .command('disable <plugin-id>')
    .description('Disable a plugin')
    .action(async (pluginId) => {
      try {
        await handleTogglePlugin(pluginId, false);
      } catch (error) {
        console.error(chalk.red('❌ Failed to disable plugin:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Uninstall plugin subcommand
  command
    .command('uninstall <plugin-id>')
    .description('Uninstall a plugin')
    .option('-f, --force', 'Force uninstall without confirmation')
    .action(async (pluginId, options) => {
      try {
        await handleUninstallPlugin(pluginId, options);
      } catch (error) {
        console.error(chalk.red('❌ Failed to uninstall plugin:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Test plugin subcommand
  command
    .command('test <plugin-id>')
    .description('Test a plugin')
    .option('-t, --template <template-file>', 'Test with specific template')
    .action(async (pluginId, options) => {
      try {
        await handleTestPlugin(pluginId, options);
      } catch (error) {
        console.error(chalk.red('❌ Plugin test failed:'), (error as Error).message);
        process.exit(1);
      }
    });

  // Plugin info subcommand
  command
    .command('info <plugin-id>')
    .description('Show detailed plugin information')
    .action(async (pluginId) => {
      try {
        await handlePluginInfo(pluginId);
      } catch (error) {
        console.error(chalk.red('❌ Failed to get plugin info:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}

/**
 * Handle list plugins command
 */
async function handleListPlugins(options: any): Promise<void> {
  const pluginManager = new TemplatePluginManager();

  console.log(chalk.blue('🔌 Installed Plugins'));
  console.log(chalk.gray('=====================\n'));

  const plugins = pluginManager.listPlugins(options.category);

  if (plugins.length === 0) {
    console.log(chalk.yellow('No plugins installed'));
    return;
  }

  // Filter by state if specified
  const filteredPlugins = options.state 
    ? plugins.filter(plugin => plugin.state === options.state)
    : plugins;

  for (const plugin of filteredPlugins) {
    const stateColor = getStateColor(plugin.state);
    const stateIcon = getStateIcon(plugin.state);
    
    console.log(chalk.white(`${stateIcon} ${plugin.manifest.name}`));
    console.log(chalk.gray(`   ID: ${plugin.manifest.id}`));
    console.log(chalk.gray(`   Version: ${plugin.manifest.version}`));
    console.log(chalk.gray(`   Author: ${plugin.manifest.author}`));
    console.log(stateColor(`   State: ${plugin.state}`));
    console.log(chalk.gray(`   Categories: ${plugin.manifest.categories.join(', ')}`));
    console.log(chalk.gray(`   Description: ${plugin.manifest.description}`));
    
    if (options.metrics) {
      console.log(chalk.cyan('   Metrics:'));
      console.log(chalk.cyan(`     Executions: ${plugin.metrics.executions}`));
      console.log(chalk.cyan(`     Success Rate: ${((plugin.metrics.successes / plugin.metrics.executions) * 100).toFixed(1)}%`));
      console.log(chalk.cyan(`     Avg Execution Time: ${plugin.metrics.avgExecutionTime.toFixed(2)}ms`));
      if (plugin.metrics.lastExecutionTime) {
        console.log(chalk.cyan(`     Last Used: ${plugin.metrics.lastExecutionTime.toLocaleString()}`));
      }
    }
    
    console.log('');
  }

  // Show summary
  const summary = getSummary(filteredPlugins);
  console.log(chalk.blue('📊 Summary'));
  console.log(chalk.gray('---------'));
  Object.entries(summary).forEach(([state, count]) => {
    if (count > 0) {
      const color = getStateColor(state as any);
      console.log(color(`${state}: ${count}`));
    }
  });

  await pluginManager.cleanup();
}

/**
 * Handle install plugin command
 */
async function handleInstallPlugin(pluginFile: string, options: any): Promise<void> {
  const pluginManager = new TemplatePluginManager();

  console.log(chalk.blue('📦 Installing Plugin'));
  console.log(chalk.gray('====================\n'));

  // Read plugin file
  const pluginPath = path.resolve(pluginFile);
  const pluginContent = await fs.readFile(pluginPath, 'utf-8');

  let manifest: TemplatePluginManifest;
  let pluginCode: string;

  // Try to parse as JavaScript module or JSON manifest
  if (pluginFile.endsWith('.js')) {
    // Extract manifest and code from JavaScript file
    const result = extractPluginFromJS(pluginContent);
    manifest = result.manifest;
    pluginCode = result.code;
  } else if (pluginFile.endsWith('.json')) {
    // JSON manifest file - look for corresponding .js file
    manifest = JSON.parse(pluginContent);
    const codeFile = pluginFile.replace('.json', '.js');
    pluginCode = await fs.readFile(codeFile, 'utf-8');
  } else {
    throw new Error('Plugin file must be .js or .json');
  }

  // Read configuration if provided
  let config: Record<string, unknown> = {};
  if (options.config) {
    const configContent = await fs.readFile(options.config, 'utf-8');
    config = JSON.parse(configContent);
  }

  // Show plugin info
  console.log(chalk.white(`Plugin: ${manifest.name}`));
  console.log(chalk.gray(`ID: ${manifest.id}`));
  console.log(chalk.gray(`Version: ${manifest.version}`));
  console.log(chalk.gray(`Author: ${manifest.author}`));
  console.log(chalk.gray(`Description: ${manifest.description}`));
  console.log(chalk.gray(`Categories: ${manifest.categories.join(', ')}`));

  // Confirm installation
  const confirm = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'install',
      message: 'Install this plugin?',
      default: true
    }
  ]);

  if (!confirm.install) {
    console.log(chalk.yellow('Installation cancelled'));
    return;
  }

  // Install plugin
  await pluginManager.registerPlugin(manifest, pluginCode, config);

  console.log(chalk.green('✅ Plugin installed successfully!'));

  // Enable if requested
  if (options.enable) {
    pluginManager.setPluginState(manifest.id, true);
    console.log(chalk.green('✅ Plugin enabled'));
  }

  await pluginManager.cleanup();
}

/**
 * Handle create plugin command
 */
async function handleCreatePlugin(options: any): Promise<void> {
  console.log(chalk.blue('🛠️  Create New Plugin'));
  console.log(chalk.gray('====================\n'));

  // Get plugin details
  const pluginDetails = await getPluginDetails(options);

  // Generate plugin code based on type
  const pluginCode = generatePluginCode(pluginDetails);
  const manifest = generatePluginManifest(pluginDetails);

  // Show preview
  console.log(chalk.blue('\n📋 Plugin Preview'));
  console.log(chalk.gray('==================\n'));

  console.log(chalk.white(`Name: ${manifest.name}`));
  console.log(chalk.white(`Type: ${pluginDetails.type}`));
  console.log(chalk.white(`Category: ${manifest.categories.join(', ')}`));
  console.log(chalk.white(`Description: ${manifest.description}`));

  // Show generated code snippet
  console.log(chalk.cyan('\nGenerated Code (snippet):'));
  console.log(chalk.gray('```javascript'));
  console.log(chalk.gray(pluginCode.split('\n').slice(0, 10).join('\n')));
  console.log(chalk.gray('...'));
  console.log(chalk.gray('```\n'));

  // Confirm creation
  const confirm = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'create',
      message: 'Create this plugin?',
      default: true
    }
  ]);

  if (!confirm.create) {
    console.log(chalk.yellow('Plugin creation cancelled'));
    return;
  }

  // Save plugin files
  await savePluginFiles(manifest, pluginCode, options.output);

  console.log(chalk.green('✅ Plugin created successfully!'));
  console.log(chalk.gray(`📁 Files saved to: ${options.output}`));
  console.log(chalk.gray(`📄 Manifest: ${manifest.id}.json`));
  console.log(chalk.gray(`💻 Code: ${manifest.id}.js`));
}

/**
 * Handle toggle plugin command
 */
async function handleTogglePlugin(pluginId: string, enable: boolean): Promise<void> {
  const pluginManager = new TemplatePluginManager();

  const action = enable ? 'enable' : 'disable';
  console.log(chalk.blue(`⚙️  ${action.charAt(0).toUpperCase() + action.slice(1)} Plugin`));

  const success = pluginManager.setPluginState(pluginId, enable);

  if (success) {
    const icon = enable ? '✅' : '⏸️';
    console.log(chalk.green(`${icon} Plugin ${pluginId} ${action}d successfully`));
  } else {
    console.log(chalk.red(`❌ Plugin ${pluginId} not found`));
  }

  await pluginManager.cleanup();
}

/**
 * Handle uninstall plugin command
 */
async function handleUninstallPlugin(pluginId: string, options: any): Promise<void> {
  const pluginManager = new TemplatePluginManager();

  console.log(chalk.blue('🗑️  Uninstall Plugin'));
  console.log(chalk.gray('==================\n'));

  const plugin = pluginManager.getPlugin(pluginId);
  if (!plugin) {
    console.log(chalk.red('❌ Plugin not found'));
    return;
  }

  console.log(chalk.white(`Plugin: ${plugin.manifest.name}`));
  console.log(chalk.gray(`ID: ${plugin.manifest.id}`));
  console.log(chalk.gray(`Version: ${plugin.manifest.version}`));

  // Confirm unless forced
  if (!options.force) {
    const confirm = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'uninstall',
        message: 'Are you sure you want to uninstall this plugin?',
        default: false
      }
    ]);

    if (!confirm.uninstall) {
      console.log(chalk.yellow('Uninstall cancelled'));
      return;
    }
  }

  // Unregister plugin
  const success = await pluginManager.unregisterPlugin(pluginId);

  if (success) {
    console.log(chalk.green('✅ Plugin uninstalled successfully'));
  } else {
    console.log(chalk.red('❌ Failed to uninstall plugin'));
  }

  await pluginManager.cleanup();
}

/**
 * Handle test plugin command
 */
async function handleTestPlugin(pluginId: string, options: any): Promise<void> {
  const pluginManager = new TemplatePluginManager();
  const extensionManager = new TemplateExtensionManager({
    storageRoot: path.join(process.cwd(), '.claude-code', 'extensions')
  });

  await extensionManager.initialize();

  console.log(chalk.blue('🧪 Test Plugin'));
  console.log(chalk.gray('==============\n'));

  const plugin = pluginManager.getPlugin(pluginId);
  if (!plugin) {
    console.log(chalk.red('❌ Plugin not found'));
    return;
  }

  console.log(chalk.white(`Testing plugin: ${plugin.manifest.name}`));

  // Create test template
  let testTemplate: any;
  
  if (options.template) {
    const templateContent = await fs.readFile(options.template, 'utf-8');
    testTemplate = JSON.parse(templateContent);
  } else {
    testTemplate = createTestTemplate();
  }

  // Build context
  const context = {
    environment: 'test',
    parameters: {},
    availableTemplates: [testTemplate],
    metadata: {
      buildId: `test-${Date.now()}`,
      timestamp: new Date(),
      version: '1.0.0'
    }
  };

  // Test based on plugin categories
  const startTime = Date.now();
  
  try {
    for (const category of plugin.manifest.categories) {
      console.log(chalk.cyan(`\nTesting ${category} functionality...`));
      
      switch (category) {
        case 'validation':
          const validationResults = await pluginManager.executeValidationPlugins(
            testTemplate,
            context,
            [pluginId]
          );
          
          console.log(chalk.green(`✅ Validation completed`));
          console.log(chalk.gray(`   Valid: ${validationResults.isValid}`));
          console.log(chalk.gray(`   Errors: ${validationResults.errors.length}`));
          console.log(chalk.gray(`   Warnings: ${validationResults.warnings.length}`));
          break;
          
        case 'generation':
          const generatedConfig = await pluginManager.executeGenerationPlugins(
            testTemplate,
            context,
            [pluginId]
          );
          
          console.log(chalk.green(`✅ Generation completed`));
          console.log(chalk.gray(`   Rules added: ${(generatedConfig.permissions?.deny?.length || 0) + (generatedConfig.permissions?.allow?.length || 0)}`));
          break;
          
        case 'transformation':
          const transformedTemplate = await pluginManager.executeTransformationPlugins(
            testTemplate,
            context,
            [pluginId]
          );
          
          console.log(chalk.green(`✅ Transformation completed`));
          console.log(chalk.gray(`   Template modified: ${transformedTemplate.id !== testTemplate.id}`));
          break;
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(chalk.green(`\n✅ All tests passed! (${executionTime}ms)`));

  } catch (error) {
    console.log(chalk.red(`\n❌ Test failed: ${(error as Error).message}`));
  }

  await extensionManager.cleanup();
  await pluginManager.cleanup();
}

/**
 * Handle plugin info command
 */
async function handlePluginInfo(pluginId: string): Promise<void> {
  const pluginManager = new TemplatePluginManager();

  console.log(chalk.blue('ℹ️  Plugin Information'));
  console.log(chalk.gray('====================\n'));

  const plugin = pluginManager.getPlugin(pluginId);
  if (!plugin) {
    console.log(chalk.red('❌ Plugin not found'));
    return;
  }

  const manifest = plugin.manifest;

  // Basic information
  console.log(chalk.white(`Name: ${manifest.name}`));
  console.log(chalk.white(`ID: ${manifest.id}`));
  console.log(chalk.white(`Version: ${manifest.version}`));
  console.log(chalk.white(`Author: ${manifest.author}`));
  console.log(chalk.white(`Description: ${manifest.description}`));

  // State and metrics
  const stateColor = getStateColor(plugin.state);
  console.log(stateColor(`State: ${plugin.state}`));
  console.log(chalk.white(`Last Activity: ${plugin.lastActivity.toLocaleString()}`));

  // Categories and capabilities
  console.log(chalk.cyan(`\nCategories: ${manifest.categories.join(', ')}`));
  
  console.log(chalk.cyan('\nCapabilities:'));
  manifest.capabilities.forEach((cap, index) => {
    console.log(chalk.cyan(`  ${index + 1}. ${cap.name} (${cap.type})`));
    console.log(chalk.gray(`     Inputs: ${cap.inputs.join(', ')}`));
    console.log(chalk.gray(`     Outputs: ${cap.outputs.join(', ')}`));
  });

  // Permissions
  if (manifest.permissions && manifest.permissions.length > 0) {
    console.log(chalk.yellow(`\nPermissions: ${manifest.permissions.join(', ')}`));
  }

  // Dependencies
  if (manifest.dependencies && manifest.dependencies.length > 0) {
    console.log(chalk.magenta(`\nDependencies: ${manifest.dependencies.join(', ')}`));
  }

  // Metrics
  console.log(chalk.blue('\nMetrics:'));
  console.log(chalk.blue(`  Executions: ${plugin.metrics.executions}`));
  console.log(chalk.blue(`  Successes: ${plugin.metrics.successes}`));
  console.log(chalk.blue(`  Failures: ${plugin.metrics.failures}`));
  console.log(chalk.blue(`  Success Rate: ${((plugin.metrics.successes / (plugin.metrics.executions || 1)) * 100).toFixed(1)}%`));
  console.log(chalk.blue(`  Avg Execution Time: ${plugin.metrics.avgExecutionTime.toFixed(2)}ms`));
  console.log(chalk.blue(`  Peak Memory Usage: ${plugin.metrics.peakMemoryUsage.toFixed(2)}MB`));

  // Metadata
  if (manifest.metadata) {
    console.log(chalk.gray('\nMetadata:'));
    if (manifest.metadata.homepage) {
      console.log(chalk.gray(`  Homepage: ${manifest.metadata.homepage}`));
    }
    if (manifest.metadata.repository) {
      console.log(chalk.gray(`  Repository: ${manifest.metadata.repository}`));
    }
    console.log(chalk.gray(`  License: ${manifest.metadata.license}`));
    if (manifest.metadata.keywords.length > 0) {
      console.log(chalk.gray(`  Keywords: ${manifest.metadata.keywords.join(', ')}`));
    }
  }

  await pluginManager.cleanup();
}

/**
 * Get plugin details from user input
 */
async function getPluginDetails(options: any): Promise<PluginDetails> {
  const questions: inquirer.DistinctQuestion[] = [];

  if (!options.name) {
    questions.push({
      type: 'input',
      name: 'name',
      message: 'Plugin name:',
      validate: (input) => input.trim().length > 0 || 'Name is required'
    });
  }

  if (!options.type) {
    questions.push({
      type: 'list',
      name: 'type',
      message: 'Plugin type:',
      choices: [
        { name: 'Validation - Validate template rules', value: 'validation' },
        { name: 'Generation - Generate additional rules', value: 'generation' },
        { name: 'Transformation - Transform templates', value: 'transformation' }
      ]
    });
  }

  questions.push(
    {
      type: 'input',
      name: 'description',
      message: 'Plugin description:',
      default: 'Custom template plugin'
    },
    {
      type: 'input',
      name: 'author',
      message: 'Author:',
      default: process.env.USER || 'Unknown'
    },
    {
      type: 'input',
      name: 'version',
      message: 'Version:',
      default: '1.0.0',
      validate: (input) => /^\d+\.\d+\.\d+/.test(input) || 'Use semantic versioning (e.g., 1.0.0)'
    }
  );

  const answers = await inquirer.prompt(questions);

  return {
    name: options.name || answers.name,
    type: options.type || answers.type,
    description: answers.description,
    author: answers.author,
    version: answers.version
  };
}

/**
 * Generate plugin code based on type
 */
function generatePluginCode(details: PluginDetails): string {
  const templates = {
    validation: `
// ${details.name} - Validation Plugin
// Generated by Claude Code Template System

/**
 * Main plugin function
 * @param {Object} context - Plugin execution context
 * @returns {Promise<Object>} Validation result
 */
async function main(context) {
  const { template, apis } = context;
  const { logger, validator } = apis;
  
  logger.info('Starting validation for template: ' + template.id);
  
  const errors = [];
  const warnings = [];
  
  try {
    // Add your validation logic here
    // Example: Check for dangerous patterns
    if (template.rules.deny) {
      for (const rule of template.rules.deny) {
        if (rule.includes('eval(')) {
          // This is good - eval is denied
        } else if (rule.includes('*')) {
          warnings.push({
            message: 'Wildcard rules may be too broad: ' + rule,
            location: { path: 'deny' }
          });
        }
      }
    }
    
    // Example: Ensure minimum security rules
    const hasSecurityRules = template.rules.deny && 
      template.rules.deny.some(rule => 
        rule.includes('eval(') || 
        rule.includes('innerHTML') ||
        rule.includes('document.write')
      );
      
    if (!hasSecurityRules) {
      errors.push({
        message: 'Template should include basic security rules',
        severity: 'error',
        location: { path: 'deny' }
      });
    }
    
    logger.info('Validation completed successfully');
    
    return {
      success: true,
      data: {
        isValid: errors.length === 0,
        errors,
        warnings
      },
      metrics: {
        duration: Date.now() - startTime,
        memoryUsed: 0
      }
    };
    
  } catch (error) {
    logger.error('Validation failed', error);
    return {
      success: false,
      error: error.message,
      metrics: {
        duration: Date.now() - startTime,
        memoryUsed: 0
      }
    };
  }
}

// Export the main function
module.exports = { main };
`,

    generation: `
// ${details.name} - Generation Plugin
// Generated by Claude Code Template System

/**
 * Main plugin function
 * @param {Object} context - Plugin execution context
 * @returns {Promise<Object>} Generated rules
 */
async function main(context) {
  const { template, buildContext, apis } = context;
  const { logger, utils } = apis;
  
  logger.info('Generating additional rules for template: ' + template.id);
  
  try {
    const additionalRules = {
      deny: [],
      allow: []
    };
    
    // Add your generation logic here
    // Example: Add environment-specific rules
    if (buildContext.environment === 'production') {
      additionalRules.deny.push(
        'console.log(',
        'debugger',
        'alert('
      );
    }
    
    // Example: Add framework-specific rules
    const hasReact = template.tags && template.tags.includes('react');
    if (hasReact) {
      additionalRules.deny.push(
        'dangerouslySetInnerHTML',
        'innerHTML ='
      );
      
      additionalRules.allow.push(
        'useState',
        'useEffect',
        'React.'
      );
    }
    
    logger.info('Generated ' + 
      (additionalRules.deny.length + additionalRules.allow.length) + 
      ' additional rules'
    );
    
    return {
      success: true,
      data: additionalRules,
      metrics: {
        duration: Date.now() - startTime,
        memoryUsed: 0
      }
    };
    
  } catch (error) {
    logger.error('Generation failed', error);
    return {
      success: false,
      error: error.message,
      metrics: {
        duration: Date.now() - startTime,
        memoryUsed: 0
      }
    };
  }
}

// Export the main function
module.exports = { main };
`,

    transformation: `
// ${details.name} - Transformation Plugin
// Generated by Claude Code Template System

/**
 * Main plugin function
 * @param {Object} context - Plugin execution context
 * @returns {Promise<Object>} Transformed template
 */
async function main(context) {
  const { template, buildContext, apis } = context;
  const { logger, utils } = apis;
  
  logger.info('Transforming template: ' + template.id);
  
  try {
    const transformedTemplate = utils.deepClone(template);
    
    // Add your transformation logic here
    // Example: Optimize rule ordering
    if (transformedTemplate.rules.deny) {
      transformedTemplate.rules.deny.sort();
    }
    
    if (transformedTemplate.rules.allow) {
      transformedTemplate.rules.allow.sort();
    }
    
    // Example: Add metadata
    transformedTemplate.tags = transformedTemplate.tags || [];
    if (!transformedTemplate.tags.includes('optimized')) {
      transformedTemplate.tags.push('optimized');
    }
    
    transformedTemplate.updatedAt = new Date();
    
    logger.info('Template transformation completed');
    
    return {
      success: true,
      data: transformedTemplate,
      metrics: {
        duration: Date.now() - startTime,
        memoryUsed: 0
      }
    };
    
  } catch (error) {
    logger.error('Transformation failed', error);
    return {
      success: false,
      error: error.message,
      metrics: {
        duration: Date.now() - startTime,
        memoryUsed: 0
      }
    };
  }
}

// Export the main function
module.exports = { main };
`
  };

  return templates[details.type as keyof typeof templates] || templates.validation;
}

/**
 * Generate plugin manifest
 */
function generatePluginManifest(details: PluginDetails): TemplatePluginManifest {
  const capabilityMap = {
    validation: {
      type: 'validate' as const,
      name: 'Template Validation',
      inputs: ['template'],
      outputs: ['validation-result']
    },
    generation: {
      type: 'generate' as const,
      name: 'Rule Generation',
      inputs: ['template', 'context'],
      outputs: ['rules']
    },
    transformation: {
      type: 'transform' as const,
      name: 'Template Transformation',
      inputs: ['template'],
      outputs: ['template']
    }
  };

  return {
    id: details.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    name: details.name,
    version: details.version,
    description: details.description,
    author: details.author,
    categories: [details.type as any],
    capabilities: [capabilityMap[details.type as keyof typeof capabilityMap]],
    permissions: ['template:read', 'template:validate'],
    metadata: {
      license: 'MIT',
      keywords: [details.type, 'template', 'security']
    }
  };
}

/**
 * Save plugin files
 */
async function savePluginFiles(
  manifest: TemplatePluginManifest,
  code: string,
  outputDir: string
): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  const manifestPath = path.join(outputDir, `${manifest.id}.json`);
  const codePath = path.join(outputDir, `${manifest.id}.js`);

  await fs.writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  await fs.writeFile(codePath, code, 'utf-8');
}

/**
 * Extract plugin from JavaScript file
 */
function extractPluginFromJS(content: string): { manifest: TemplatePluginManifest; code: string } {
  // Simple extraction - look for manifest in comments or module.exports
  // In practice, you'd want a more sophisticated parser
  
  const manifestMatch = content.match(/\/\*\s*MANIFEST\s*([\s\S]*?)\s*\*\//);
  if (manifestMatch) {
    const manifest = JSON.parse(manifestMatch[1]);
    return { manifest, code: content };
  }
  
  throw new Error('No manifest found in JavaScript file');
}

/**
 * Create test template
 */
function createTestTemplate(): any {
  return {
    id: 'test-template',
    name: 'Test Template',
    category: 'security',
    rules: {
      deny: ['eval(', 'innerHTML ='],
      allow: ['console.log(']
    },
    description: 'Test template for plugin validation',
    compliance: [],
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    isBuiltIn: false,
    inheritance: {
      level: 'base',
      extensionType: 'inherit',
      chain: [],
      compatibility: {},
      permissions: {
        canOverrideRules: true,
        canAddRules: true,
        canRemoveRules: false,
        canModifyMetadata: true
      }
    },
    scope: {}
  };
}

/**
 * Get state color for display
 */
function getStateColor(state: string): (text: string) => string {
  const colors = {
    ready: chalk.green,
    active: chalk.blue,
    error: chalk.red,
    disabled: chalk.yellow,
    loading: chalk.gray
  };
  
  return colors[state as keyof typeof colors] || chalk.gray;
}

/**
 * Get state icon for display
 */
function getStateIcon(state: string): string {
  const icons = {
    ready: '✅',
    active: '🔄',
    error: '❌',
    disabled: '⏸️',
    loading: '⏳'
  };
  
  return icons[state as keyof typeof icons] || '❓';
}

/**
 * Get plugins summary by state
 */
function getSummary(plugins: any[]): Record<string, number> {
  const summary: Record<string, number> = {};
  
  for (const plugin of plugins) {
    summary[plugin.state] = (summary[plugin.state] || 0) + 1;
  }
  
  return summary;
}

/**
 * Plugin details interface
 */
interface PluginDetails {
  name: string;
  type: string;
  description: string;
  author: string;
  version: string;
}