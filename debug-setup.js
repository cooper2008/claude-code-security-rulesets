#!/usr/bin/env node

// Debug script to test the setup command without hanging
const chalk = require('chalk');

async function debugSetup() {
  console.log(chalk.blue('🔍 Starting debug setup...'));
  
  try {
    // Test if we can require the wizard
    console.log(chalk.gray('Importing SecurityWizard...'));
    const { SecurityWizard } = require('./dist/setup/wizard');
    console.log(chalk.green('✅ SecurityWizard imported'));
    
    // Test wizard creation
    console.log(chalk.gray('Creating wizard instance...'));
    const wizard = new SecurityWizard();
    console.log(chalk.green('✅ Wizard created'));
    
    // Test scanner directly
    console.log(chalk.gray('Testing scanner...'));
    const result = await wizard.performDualScan({
      autoConfirm: true,
      dryRun: true,
      verbose: false,
      scanDepth: 2,
      globalOnly: false,
      projectOnly: false
    });
    console.log(chalk.green('✅ Scan completed'));
    console.log(`Found ${result.files.length} files`);
    
  } catch (error) {
    console.error(chalk.red('❌ Debug failed:'), error.message);
    if (error.stack) {
      console.error(chalk.gray('Stack:'), error.stack);
    }
  }
}

// Set timeout to prevent hanging
setTimeout(() => {
  console.log(chalk.yellow('⚠️ Debug timed out after 30 seconds'));
  process.exit(1);
}, 30000);

debugSetup()
  .then(() => {
    console.log(chalk.green('🎉 Debug completed successfully'));
    process.exit(0);
  })
  .catch((error) => {
    console.error(chalk.red('💥 Debug failed:'), error.message);
    process.exit(1);
  });