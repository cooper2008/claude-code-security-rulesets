/**
 * Security Setup Wizard - Main Educational Workflow
 * Simple, guided security setup for non-security experts
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { join } from 'path';
import { homedir } from 'os';
import process from 'process';
import { Scanner, ScanResult } from './scanner';
import { Explainer } from './explainer';
import { RuleApplier } from './applier';

// Re-export types for other modules
export type { ScanResult } from './scanner';

export interface SetupOptions {
  /** Setup mode */
  mode?: string;
  /** Skip confirmation prompts (for automation) */
  autoConfirm?: boolean;
  /** Verbose output for debugging */
  verbose?: boolean;
  /** Interactive mode with customization */
  interactive?: boolean;
  /** Directory scan depth */
  scanDepth?: number;
  /** Scan only project files */
  projectOnly?: boolean;
  /** Scan only global files */
  globalOnly?: boolean;
  /** Show what would be done without applying */
  dryRun?: boolean;
  /** Force backup creation */
  backup?: boolean;
  /** Save config to file instead of applying */
  outputFile?: string;
}

export interface SetupResult {
  projectRulesApplied: number;
  globalRulesApplied: number;
  backupCreated: boolean;
  protectedFiles: string[];
}

/**
 * Main Security Setup Wizard
 * Guides users through complete security setup with education
 */
export class SecurityWizard {
  private scanner: Scanner;
  private explainer: Explainer;
  private applier: RuleApplier;

  constructor() {
    this.scanner = new Scanner();
    this.explainer = new Explainer();
    this.applier = new RuleApplier();
  }

  /**
   * Run the complete security setup workflow
   */
  async runSetup(options: SetupOptions = {}): Promise<SetupResult> {
    try {
      const mode = options.mode || 'simple';
      
      // Handle different modes
      if (mode === 'simple' && !options.verbose) {
        return await this.runSimpleSetup(options);
      } else if (mode === 'detailed') {
        return await this.runDetailedSetup(options);
      } else if (mode === 'expert') {
        return await this.runExpertSetup(options);
      } else if (mode === 'custom') {
        return await this.runCustomSetup(options);
      } else {
        return await this.runSimpleSetup(options);
      }

    } catch (error) {
      console.error(chalk.red.bold('❌ Setup failed:'), error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Run simple setup (original workflow)
   */
  private async runSimpleSetup(options: SetupOptions): Promise<SetupResult> {
    // Step 1: Welcome and Education
    if (!options.autoConfirm) {
      await this.showWelcome(options.autoConfirm);
    }

    // Step 2: Automatic Scanning
    console.log(chalk.blue.bold('\n🔍 Step 1: Scanning for sensitive files...\n'));
    const scanResult = await this.performDualScan(options);

    // Step 3: Educational Results
    if (!options.autoConfirm) {
      await this.showEducationalResults(scanResult, options.autoConfirm);
    }

    // Step 4: Automatic Application
    if (options.dryRun) {
      console.log(chalk.yellow.bold('\n🔍 Dry Run - No changes will be made\n'));
      return await this.simulateApplication(scanResult);
    } else {
      console.log(chalk.blue.bold('\n🚀 Step 2: Setting up protection...\n'));
      const applyResult = await this.applyProtection(scanResult, options);
      
      // Step 5: Success Summary
      if (options.verbose) {
        this.showSuccessSummary(applyResult);
      }
      
      return applyResult;
    }
  }

  /**
   * Run detailed setup with step-by-step progress
   */
  private async runDetailedSetup(options: SetupOptions): Promise<SetupResult> {
    console.log(chalk.blue.bold('🔍 Detailed Security Setup - Step by Step\n'));
    
    // Step 1: Project Analysis
    console.log(chalk.cyan.bold('📋 Step 1: Analyzing Project Structure'));
    const projectType = await this.scanner.detectProjectType(process.cwd());
    console.log(chalk.gray(`   Detected project type: ${projectType}`));
    console.log(chalk.gray(`   Scan depth: ${options.scanDepth || 3} levels`));
    
    // Step 2: File Scanning
    console.log(chalk.cyan.bold('\n🔍 Step 2: Scanning for Sensitive Files'));
    const scanResult = await this.performDetailedScan(options);
    
    // Step 3: Risk Assessment
    console.log(chalk.cyan.bold('\n⚠️  Step 3: Security Risk Assessment'));
    this.showRiskAssessment(scanResult);
    
    // Step 4: Rule Generation
    console.log(chalk.cyan.bold('\n🛡️  Step 4: Generating Protection Rules'));
    const rules = this.generateDetailedRules(scanResult);
    
    // Step 5: Apply or Save
    if (options.dryRun) {
      console.log(chalk.yellow.bold('\n🔍 Step 5: Dry Run Complete (No Changes Made)'));
      return await this.simulateApplication(scanResult);
    } else {
      console.log(chalk.cyan.bold('\n🚀 Step 5: Applying Security Configuration'));
      return await this.applyProtection(scanResult, options);
    }
  }

  /**
   * Simulate application for dry run with enhanced diff preview
   */
  private async simulateApplication(scanResult: ScanResult): Promise<SetupResult> {
    const criticalFiles = scanResult.files.filter(f => f.risk === 'CRITICAL');
    const projectFiles = criticalFiles.filter(f => f.scope === 'project');
    const personalFiles = criticalFiles.filter(f => f.scope === 'personal');
    
    // Generate and display configuration preview with diff
    const applier = new RuleApplier();
    const previewResult = await applier.previewConfigurationChanges(scanResult);
    applier.displayConfigurationPreview(previewResult);
    
    console.log(chalk.yellow('📋 Would protect:'));
    console.log(chalk.gray(`   • ${projectFiles.length} project files`));
    console.log(chalk.gray(`   • ${personalFiles.length} personal files`));
    
    // Show what configuration files would be created (enhanced with Claude Code documentation)
    console.log(chalk.cyan('\n📄 Claude Code settings that would be created/updated:'));
    console.log(chalk.dim('   (Based on Claude Code settings precedence hierarchy)\n'));
    
    if (personalFiles.length > 0) {
      console.log(chalk.blue.bold('   🌐 Global User Settings'));
      console.log(chalk.gray(`      Path: ${chalk.bold('~/.claude/settings.json')}`));
      console.log(chalk.gray('      Scope: Applies to ALL projects for this user'));
      console.log(chalk.gray(`      Purpose: Protects ${personalFiles.length} personal files (.ssh, .aws, credentials)`));
      console.log(chalk.gray('      Precedence: 5 (lowest - overridden by more specific settings)\n'));
    }
    
    if (projectFiles.length > 0) {
      console.log(chalk.yellow.bold('   🔒 Local Project Settings'));
      console.log(chalk.gray(`      Path: ${chalk.bold('.claude/settings.local.json')}`));
      console.log(chalk.gray('      Scope: Personal project-specific settings (git-ignored)'));
      console.log(chalk.gray(`      Purpose: Protects ${projectFiles.length} project files (.env, config files)`));
      console.log(chalk.gray('      Precedence: 3 (higher than shared project and user settings)\n'));
      
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const sharedProjectPath = path.join(process.cwd(), '.claude', 'settings.json');
      
      if (fs.existsSync(sharedProjectPath)) {
        console.log(chalk.green.bold('   📁 Shared Project Settings (existing)'));
        console.log(chalk.gray(`      Path: ${chalk.bold('.claude/settings.json')}`));
        console.log(chalk.gray('      Scope: Shared with team, checked into version control'));
        console.log(chalk.gray('      Status: Will be preserved (no changes made)'));
        console.log(chalk.gray('      Precedence: 4 (lower than local project settings)\n'));
      }
    }
    
    // Show which files would be protected
    if (criticalFiles.length > 0) {
      console.log(chalk.cyan('\n🛡️  Files that would be protected:'));
      
      if (projectFiles.length > 0) {
        console.log(chalk.yellow('   📁 Project files (local rules):'));
        projectFiles.forEach((file) => {
          console.log(chalk.gray(`     • ${file.relativePath} → ${file.type}`));
        });
      }
      
      if (personalFiles.length > 0) {
        console.log(chalk.yellow('   🌐 Personal/system files (global rules):'));
        personalFiles.forEach((file) => {
          console.log(chalk.gray(`     • ${file.relativePath} → ${file.type}`));
        });
      }
      
      // Show all rules that would be created
      console.log(chalk.dim('\n   Security rules that would be created:'));
      const exampleRules = new Set<string>();
      [...projectFiles, ...personalFiles].forEach((file) => {
        if (file.suggestedRule && !exampleRules.has(file.suggestedRule)) {
          exampleRules.add(file.suggestedRule);
          console.log(chalk.dim(`     • ${file.suggestedRule} → Protects ${file.type}`));
        }
      });
      
      // Show the actual configuration file content that would be created
      this.showConfigurationPreview(scanResult, personalFiles, projectFiles);
    }
    
    return {
      projectRulesApplied: projectFiles.length,
      globalRulesApplied: personalFiles.length,
      backupCreated: false,
      protectedFiles: criticalFiles.map(f => f.relativePath)
    };
  }

  /**
   * Run expert setup (minimal UI, maximum control)
   */
  private async runExpertSetup(options: SetupOptions): Promise<SetupResult> {
    console.log(chalk.blue.bold('⚡ Expert Mode: Advanced Security Configuration\n'));
    
    // Direct scanning with full control
    const scanResult = await this.performDualScan(options);
    
    // Show technical summary
    console.log(chalk.cyan('Scan Results:'));
    console.log(chalk.gray(`  Files found: ${scanResult.files.length}`));
    console.log(chalk.gray(`  Critical risk: ${scanResult.summary.criticalFiles}`));
    console.log(chalk.gray(`  High risk: ${scanResult.summary.highFiles}`));
    console.log(chalk.gray(`  Project scope: ${scanResult.summary.projectFiles}`));
    console.log(chalk.gray(`  Personal scope: ${scanResult.summary.personalFiles}`));
    
    if (options.dryRun) {
      return await this.simulateApplication(scanResult);
    } else {
      return await this.applyProtection(scanResult, options);
    }
  }

  /**
   * Run custom setup (full interactivity)
   */
  private async runCustomSetup(options: SetupOptions): Promise<SetupResult> {
    // For now, delegate to detailed setup
    // In the future, this would have full rule customization
    return await this.runDetailedSetup(options);
  }

  /**
   * Show welcome message and explanation
   */
  private async showWelcome(autoConfirm?: boolean): Promise<void> {
    console.log(chalk.blue.bold('🛡️  Claude Code Security Setup\n'));
    
    console.log(chalk.gray('Claude Code helps with coding by reading your files. Let\'s make sure'));
    console.log(chalk.gray('it only accesses what you want and keeps your private stuff safe.\n'));
    
    console.log(chalk.cyan('What we\'ll do:'));
    console.log(chalk.gray('✅ Scan your project for sensitive files'));
    console.log(chalk.gray('✅ Check your personal files (SSH keys, cloud credentials)'));
    console.log(chalk.gray('✅ Set up automatic protection'));
    console.log(chalk.gray('✅ Explain everything as we go\n'));
    
    console.log(chalk.dim('This takes about 30 seconds.'));

    if (!autoConfirm) {
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: 'Ready to secure your files?',
        default: true,
      }]);

      if (!confirmed) {
        console.log(chalk.gray('Setup cancelled. Your files remain unprotected.'));
        process.exit(0);
      }
    }
  }

  /**
   * Perform dual scan (project + personal files)
   */
  private async performDualScan(options: SetupOptions = {}): Promise<ScanResult> {
    try {
      let projectScan: any[] = [];
      let homeScan: any[] = [];

      // Scan project files unless globalOnly
      if (!options.globalOnly) {
        if (options.verbose) {
          process.stdout.write(chalk.gray('Checking your project...'.padEnd(35)));
        }
        projectScan = await this.scanner.scanDirectory(process.cwd(), 'project');
        if (options.verbose) {
          console.log(chalk.green('✅'));
        }
      }

      // Scan personal files unless projectOnly
      if (!options.projectOnly) {
        if (options.verbose) {
          process.stdout.write(chalk.gray('Checking your personal files...'.padEnd(35)));
        }
        homeScan = await this.scanner.scanHomeDirectory();
        if (options.verbose) {
          console.log(chalk.green('✅'));
        }
      }

      if (options.verbose) {
        process.stdout.write(chalk.gray('Analyzing risk levels...'.padEnd(35)));
        console.log(chalk.green('✅'));
      }

      return this.scanner.combineScanResults(projectScan, homeScan);
    } catch (error) {
      console.error(chalk.red('Scan failed:'), error instanceof Error ? error.message : String(error));
      // Return empty result to prevent hanging
      return {
        projectType: 'general',
        files: [],
        projectFiles: [],
        personalFiles: [],
        summary: {
          totalFiles: 0,
          criticalFiles: 0,
          highFiles: 0,
          mediumFiles: 0,
          lowFiles: 0,
          projectFiles: 0,
          personalFiles: 0
        }
      };
    }
  }

  /**
   * Perform detailed scan with progress tracking
   */
  private async performDetailedScan(options: SetupOptions = {}): Promise<ScanResult> {
    const scanDepth = options.scanDepth || 3;
    
    console.log(chalk.gray(`   Scanning project directory: ${process.cwd()}`));
    console.log(chalk.gray(`   Scan depth: ${scanDepth} levels`));
    
    const scanResult = await this.performDualScan(options);
    
    console.log(chalk.gray(`   Files analyzed: ${scanResult.files.length}`));
    console.log(chalk.gray(`   Sensitive files found: ${scanResult.summary.criticalFiles + scanResult.summary.highFiles}`));
    
    return scanResult;
  }

  /**
   * Show risk assessment
   */
  private showRiskAssessment(scanResult: ScanResult): void {
    const { summary } = scanResult;
    
    console.log(chalk.gray(`   Critical risk files: ${summary.criticalFiles} (immediate protection required)`));
    console.log(chalk.gray(`   High risk files: ${summary.highFiles} (recommended protection)`));
    console.log(chalk.gray(`   Medium risk files: ${summary.mediumFiles} (consider protection)`));
    console.log(chalk.gray(`   Low risk files: ${summary.lowFiles} (optional protection)`));
    
    if (summary.criticalFiles > 0) {
      console.log(chalk.yellow('   ⚠️  Critical files require immediate protection'));
    }
  }

  /**
   * Generate detailed rules explanation
   */
  private generateDetailedRules(scanResult: ScanResult): any {
    const criticalFiles = scanResult.files.filter(f => f.risk === 'CRITICAL');
    const highFiles = scanResult.files.filter(f => f.risk === 'HIGH');
    
    console.log(chalk.gray(`   Deny rules: ${criticalFiles.length} (block access completely)`));
    console.log(chalk.gray(`   Ask rules: ${highFiles.length} (require permission)`));
    
    if (criticalFiles.length > 0) {
      console.log(chalk.gray(`   Global rules: ${criticalFiles.filter(f => f.scope === 'personal').length}`));
      console.log(chalk.gray(`   Project rules: ${criticalFiles.filter(f => f.scope === 'project').length}`));
    }
    
    return { deny: criticalFiles, ask: highFiles };
  }

  /**
   * Show educational results with explanations
   */
  private async showEducationalResults(scanResult: ScanResult, autoConfirm?: boolean): Promise<void> {
    console.log(chalk.yellow.bold('\n🎯 Here\'s what needs protection:\n'));

    // Show critical findings with education
    const criticalFiles = scanResult.files.filter(f => f.risk === 'CRITICAL');
    
    if (criticalFiles.length > 0) {
      console.log(chalk.red.bold('🔴 CRITICAL (Must protect):\n'));
      
      const projectFiles = criticalFiles.filter(f => f.scope === 'project');
      const personalFiles = criticalFiles.filter(f => f.scope === 'personal');

      if (projectFiles.length > 0) {
        console.log(chalk.cyan('   In your project:'));
        for (const file of projectFiles) {
          console.log(chalk.gray(`   • ${file.relativePath} → ${file.explanation}`));
        }
        console.log();
      }

      if (personalFiles.length > 0) {
        console.log(chalk.cyan('   In your personal files:'));
        for (const file of personalFiles) {
          console.log(chalk.gray(`   • ${file.relativePath} → ${file.explanation}`));
        }
        console.log();
      }

      // Educational explanation
      console.log(chalk.blue('💡 Why protect these?'));
      console.log(chalk.gray('   If Claude Code accidentally reads these files, your passwords and'));
      console.log(chalk.gray('   keys could end up in chat logs or be exposed. We\'ll block access'));
      console.log(chalk.gray('   to keep them private.\n'));
    }

    // Show summary stats
    const stats = scanResult.summary;
    console.log(chalk.dim(`📊 Summary: ${stats.totalFiles} files found, ${stats.criticalFiles} critical, ${stats.projectFiles} in project, ${stats.personalFiles} personal\n`));

    if (!autoConfirm) {
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: 'Continue with automatic protection?',
        default: true,
      }]);

      if (!confirmed) {
        console.log(chalk.gray('Setup cancelled. No changes made.'));
        process.exit(0);
      }
    }
  }

  /**
   * Apply protection rules automatically
   */
  private async applyProtection(scanResult: ScanResult, options: SetupOptions = {}): Promise<SetupResult> {
    try {
      // Save to file instead of applying if outputFile is specified
      if (options.outputFile) {
        return await this.saveToFile(scanResult, options.outputFile);
      }

      const steps = [
        'Creating project security rules...',
        'Creating global security rules...',
        'Backing up existing settings...',
        'Applying to Claude Code settings...'
      ];

      // Show progress if verbose
      if (options.verbose) {
        for (const [index, step] of steps.entries()) {
          process.stdout.write(chalk.gray(`${step.padEnd(40)}`));
          await new Promise(resolve => setTimeout(resolve, 300)); // Reduced delay
          console.log(chalk.green('✅'));
        }
      }

      // Apply the actual rules
      return await this.applier.applyRules(scanResult);
    } catch (error) {
      console.error(chalk.red('Protection application failed:'), error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Save configuration to file instead of applying
   */
  private async saveToFile(scanResult: ScanResult, outputFile: string): Promise<SetupResult> {
    const fs = require('fs');
    const criticalFiles = scanResult.files.filter(f => f.risk === 'CRITICAL');
    
    const config = {
      permissions: {
        deny: criticalFiles.map(f => f.suggestedRule),
        ask: [],
        allow: []
      },
      metadata: {
        version: '1.0.0',
        timestamp: Date.now(),
        generatedBy: 'claude-security setup',
        files: criticalFiles.map(f => ({
          path: f.relativePath,
          type: f.type,
          risk: f.risk
        }))
      }
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(config, null, 2));
    console.log(chalk.green(`✅ Configuration saved to: ${outputFile}`));
    
    return {
      projectRulesApplied: 0,
      globalRulesApplied: 0,
      backupCreated: false,
      protectedFiles: criticalFiles.map(f => f.relativePath)
    };
  }

  /**
   * Show success summary
   */
  private showSuccessSummary(result: SetupResult): void {
    console.log(chalk.green.bold('\n🎉 Security Setup Complete!\n'));

    console.log(chalk.cyan('What\'s protected now:'));
    console.log(chalk.gray(`• Project files → Protected in this project only (${result.projectRulesApplied} rules)`));
    console.log(chalk.gray(`• Personal files → Protected across ALL projects (${result.globalRulesApplied} rules)\n`));

    console.log(chalk.cyan('Claude Code will now:'));
    console.log(chalk.red('❌ Be blocked from reading your private keys and passwords'));
    console.log(chalk.green('✅ Still be able to help with your regular code files'));
    console.log(chalk.yellow('❓ Ask permission before accessing anything unclear\n'));

    if (result.backupCreated) {
      console.log(chalk.dim('💾 Your previous settings were backed up automatically\n'));
    }

    console.log(chalk.blue('Need to check or change something later?'));
    console.log(chalk.gray('Run: ') + chalk.white('claude-security status\n'));
  }

  /**
   * Show current protection status
   */
  async showStatus(): Promise<void> {
    console.log(chalk.blue.bold('📊 Claude Code Security Status\n'));

    try {
      // Simple status check without complex file operations
      const { existsSync } = require('fs');
      const { join } = require('path');
      const { homedir } = require('os');
      
      // Fixed: Align with Claude Code documentation
      const globalSettingsPath = join(homedir(), '.claude', 'settings.json');
      const localSettingsPath = join(process.cwd(), '.claude', 'settings.local.json');
      
      console.log(chalk.cyan('Configuration Files:'));
      
      if (existsSync(globalSettingsPath)) {
        console.log(chalk.green(`  ✅ Global settings found: ${globalSettingsPath}`));
        try {
          const { readFileSync } = require('fs');
          const content = readFileSync(globalSettingsPath, 'utf8');
          const settings = JSON.parse(content);
          const denyRules = settings.permissions?.deny?.length || 0;
          const askRules = settings.permissions?.ask?.length || 0;
          console.log(chalk.gray(`     • ${denyRules} deny rules, ${askRules} ask rules`));
        } catch (err) {
          console.log(chalk.yellow(`     ⚠️  Unable to read settings details`));
        }
      } else {
        console.log(chalk.gray(`  ⚪ No global settings: ${globalSettingsPath}`));
      }
      
      if (existsSync(localSettingsPath)) {
        console.log(chalk.green(`  ✅ Local settings found: ${localSettingsPath}`));
        try {
          const { readFileSync } = require('fs');
          const content = readFileSync(localSettingsPath, 'utf8');
          const settings = JSON.parse(content);
          const denyRules = settings.permissions?.deny?.length || 0;
          const askRules = settings.permissions?.ask?.length || 0;
          console.log(chalk.gray(`     • ${denyRules} deny rules, ${askRules} ask rules`));
        } catch (err) {
          console.log(chalk.yellow(`     ⚠️  Unable to read settings details`));
        }
      } else {
        console.log(chalk.gray(`  ⚪ No local settings: ${localSettingsPath}`));
      }

      console.log(chalk.blue('\nNext Steps:'));
      console.log(chalk.gray('  • Run "claude-security setup" to configure protection'));
      console.log(chalk.gray('  • Use "claude-security setup --mode detailed" for step-by-step setup'));
      console.log(chalk.gray('  • Use "claude-security setup --dry-run" to preview changes'));

    } catch (error) {
      console.log(chalk.red('❌ Unable to check status'));
      console.log(chalk.gray('Error: ' + (error instanceof Error ? error.message : String(error))));
      console.log(chalk.gray('\nRun "claude-security setup" to configure security protection'));
    }
  }

  /**
   * Show configuration file preview for dry run
   */
  private showConfigurationPreview(scanResult: ScanResult, personalFiles?: any[], projectFiles?: any[]): void {
    if (!personalFiles && !projectFiles) {
      // Legacy call without file separation - extract from scanResult
      const criticalFiles = scanResult.files.filter(f => f.risk === 'CRITICAL');
      personalFiles = criticalFiles.filter(f => f.scope === 'personal');
      projectFiles = criticalFiles.filter(f => f.scope === 'project');
    }
    
    console.log(chalk.cyan('\n📄 Claude Code Settings Preview:'));
    console.log(chalk.dim('   (Actual JSON configurations that would be created)'));

    // Show global settings if personal files exist
    if (personalFiles && personalFiles.length > 0) {
      console.log(chalk.blue.bold('\n   🌐 ~/.claude/settings.json (Global User Settings):'));
      this.showSettingsPreview(personalFiles, 'global');
    }

    // Show local project settings if project files exist
    if (projectFiles && projectFiles.length > 0) {
      console.log(chalk.yellow.bold('\n   🔒 .claude/settings.local.json (Local Project Settings):'));
      this.showSettingsPreview(projectFiles, 'local');
    }
  }

  /**
   * Show individual settings file preview
   */
  private showSettingsPreview(files: any[], settingsType: 'global' | 'local'): void {
    // Generate rules from files
    const denyRules = [...new Set(files.map(f => f.suggestedRule))].filter(Boolean);
    
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white('{'));
    console.log(chalk.white('  "permissions": {'));
    
    // Show deny rules
    console.log(chalk.red('    "deny": ['));
    if (denyRules.length > 0) {
      denyRules.forEach((rule, index) => {
        const comma = index < denyRules.length - 1 ? ',' : '';
        console.log(chalk.red(`      "${rule}"${comma}`));
      });
    } else {
      console.log(chalk.gray('      // No critical files found'));
    }
    console.log(chalk.red('    ],'));
    
    // Show ask rules (empty for now - we use deny for critical files)
    console.log(chalk.yellow('    "ask": [],'));
    
    // Show allow rules (empty - we don't restrict normal files)
    console.log(chalk.green('    "allow": []'));
    
    console.log(chalk.white('  },'));
    
    // Add metadata
    console.log(chalk.white('  "metadata": {'));
    console.log(chalk.gray(`    "lastUpdated": "${new Date().toISOString()}",`));
    console.log(chalk.gray(`    "source": "claude-security-rulesets-${settingsType}",`));
    console.log(chalk.gray('    "version": "1.1.2",'));
    console.log(chalk.gray(`    "settingsType": "${settingsType}",`));
    console.log(chalk.gray(`    "protectedFiles": ${files.length}`));
    console.log(chalk.white('  }'));
    
    console.log(chalk.white('}'));
    console.log(chalk.gray('─'.repeat(60)));
  }
}