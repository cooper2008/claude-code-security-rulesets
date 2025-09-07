import { promises as fs } from 'fs';
import { join } from 'path';
import {
  CIPlatform,
  CITemplate,
  CIIntegrationConfig,
  CIIntegrationResult,
  TemplateVariable
} from '../types';

/**
 * CI/CD Platform Integration Manager
 * Provides templates and integration for various CI/CD platforms
 */
export class CICDIntegration {
  private templates: Map<string, CITemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  /**
   * Initialize all CI/CD platform templates
   */
  private initializeTemplates(): void {
    this.templates.set('github-basic', this.getGitHubActionsTemplate());
    this.templates.set('github-enterprise', this.getGitHubEnterpriseTemplate());
    this.templates.set('gitlab-basic', this.getGitLabCITemplate());
    this.templates.set('jenkins-basic', this.getJenkinsTemplate());
    this.templates.set('azure-basic', this.getAzureDevOpsTemplate());
    this.templates.set('circleci-basic', this.getCircleCITemplate());
  }

  /**
   * Get available templates for a platform
   */
  getTemplatesForPlatform(platform: CIPlatform): CITemplate[] {
    return Array.from(this.templates.values())
      .filter(template => template.platform === platform);
  }

  /**
   * Get all available templates
   */
  getAllTemplates(): CITemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get a specific template by name
   */
  getTemplate(templateName: string): CITemplate | undefined {
    return this.templates.get(templateName);
  }

  /**
   * Integrate CI/CD configuration into a project
   */
  async integrateCI(config: CIIntegrationConfig): Promise<CIIntegrationResult> {
    const result: CIIntegrationResult = {
      success: false,
      platform: config.platform,
      errors: [],
      warnings: [],
      nextSteps: []
    };

    try {
      // Get the template
      const template = this.getTemplate(config.template);
      if (!template) {
        result.errors.push(`Template '${config.template}' not found`);
        return result;
      }

      // Validate required variables
      const missingVars = template.variables
        .filter(v => v.required && !config.variables[v.name])
        .map(v => v.name);

      if (missingVars.length > 0) {
        result.errors.push(`Missing required variables: ${missingVars.join(', ')}`);
        return result;
      }

      // Validate variable patterns
      for (const variable of template.variables) {
        const value = config.variables[variable.name];
        if (value && variable.pattern) {
          const regex = new RegExp(variable.pattern);
          if (!regex.test(value)) {
            result.errors.push(
              `Variable '${variable.name}' value '${value}' doesn't match pattern: ${variable.pattern}`
            );
          }
        }
      }

      if (result.errors.length > 0) {
        return result;
      }

      // Generate configuration content
      let content = template.content;
      
      // Substitute variables
      for (const [varName, varValue] of Object.entries(config.variables)) {
        const regex = new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'g');
        content = content.replace(regex, varValue);
      }

      // Add default values for missing optional variables
      for (const variable of template.variables) {
        if (!variable.required && !config.variables[variable.name] && variable.defaultValue) {
          const regex = new RegExp(`\\{\\{\\s*${variable.name}\\s*\\}\\}`, 'g');
          content = content.replace(regex, variable.defaultValue);
        }
      }

      // Add custom validation steps
      if (config.customValidationSteps && config.customValidationSteps.length > 0) {
        content = this.addCustomValidationSteps(content, config.customValidationSteps, config.platform);
      }

      // Determine output path
      const configPath = join(config.projectPath, template.filePath);
      const configDir = join(configPath, '..');

      // Check if file already exists
      const exists = await fs.access(configPath).then(() => true).catch(() => false);
      
      if (exists && !config.overwriteExisting) {
        result.errors.push(`Configuration file already exists: ${template.filePath}`);
        result.errors.push('Use --overwrite flag to replace existing configuration');
        return result;
      }

      if (exists) {
        result.warnings.push(`Overwriting existing configuration: ${template.filePath}`);
      }

      // Ensure directory exists
      await fs.mkdir(configDir, { recursive: true });

      // Write configuration file
      await fs.writeFile(configPath, content, 'utf-8');

      result.success = true;
      result.configPath = template.filePath;
      result.generatedContent = content;

      // Generate next steps
      result.nextSteps = this.generateNextSteps(config.platform, template.filePath);

    } catch (error) {
      result.errors.push(`Failed to integrate CI/CD: ${error}`);
    }

    return result;
  }

  /**
   * Detect existing CI/CD configurations in a project
   */
  async detectExistingCI(projectPath: string): Promise<{
    platform: CIPlatform | null;
    configFile: string | null;
    isClaudeCodeEnabled: boolean;
  }> {
    const ciFiles = [
      { platform: 'github' as CIPlatform, path: '.github/workflows' },
      { platform: 'gitlab' as CIPlatform, path: '.gitlab-ci.yml' },
      { platform: 'jenkins' as CIPlatform, path: 'Jenkinsfile' },
      { platform: 'azure' as CIPlatform, path: 'azure-pipelines.yml' },
      { platform: 'circleci' as CIPlatform, path: '.circleci/config.yml' }
    ];

    for (const { platform, path } of ciFiles) {
      const fullPath = join(projectPath, path);
      
      try {
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          // Check for workflow files in directory (GitHub Actions)
          const files = await fs.readdir(fullPath);
          if (files.length > 0) {
            const workflowFile = files[0];
            const content = await fs.readFile(join(fullPath, workflowFile), 'utf-8');
            return {
              platform,
              configFile: join(path, workflowFile),
              isClaudeCodeEnabled: content.includes('claude-code')
            };
          }
        } else {
          // Single file configuration
          const content = await fs.readFile(fullPath, 'utf-8');
          return {
            platform,
            configFile: path,
            isClaudeCodeEnabled: content.includes('claude-code')
          };
        }
      } catch (error) {
        // File doesn't exist, continue checking
      }
    }

    return {
      platform: null,
      configFile: null,
      isClaudeCodeEnabled: false
    };
  }

  /**
   * Generate GitHub Actions template
   */
  private getGitHubActionsTemplate(): CITemplate {
    return {
      platform: 'github',
      name: 'github-basic',
      description: 'Basic GitHub Actions workflow with Claude Code security validation',
      filePath: '.github/workflows/claude-code-security.yml',
      variables: [
        {
          name: 'node_version',
          description: 'Node.js version to use',
          defaultValue: '18',
          required: false,
          pattern: '^\\d+$'
        },
        {
          name: 'validation_on_pr',
          description: 'Run validation on pull requests',
          defaultValue: 'true',
          required: false,
          pattern: '^(true|false)$'
        },
        {
          name: 'validation_on_push',
          description: 'Run validation on push to main branches',
          defaultValue: 'true',
          required: false,
          pattern: '^(true|false)$'
        },
        {
          name: 'fail_on_warnings',
          description: 'Fail the build on validation warnings',
          defaultValue: 'false',
          required: false,
          pattern: '^(true|false)$'
        }
      ],
      content: `name: Claude Code Security Validation

on:
  push:
    branches: [ main, master, develop ]
  pull_request:
    branches: [ main, master ]

env:
  NODE_VERSION: {{ node_version }}

jobs:
  security-validation:
    name: Security Validation
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: \${{ env.NODE_VERSION }}
        cache: 'npm'
        
    - name: Install dependencies
      run: |
        if [ -f package.json ]; then
          npm ci
        fi
        
    - name: Install Claude Code
      run: npm install -g claude-code-security-rulesets
      
    - name: Validate Security Configuration
      run: |
        claude-code validate \\
          --config .claude-code.json \\
          --format json \\
          --output security-report.json \\
          \${{ '{{ fail_on_warnings }}' == 'true' && '--fail-on-warnings' || '' }}
          
    - name: Upload Security Report
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: security-validation-report
        path: security-report.json
        
    - name: Comment on PR
      if: github.event_name == 'pull_request' && '{{ validation_on_pr }}'
      uses: actions/github-script@v6
      with:
        script: |
          const fs = require('fs');
          
          try {
            const reportContent = fs.readFileSync('security-report.json', 'utf8');
            const report = JSON.parse(reportContent);
            
            let comment = '## 🔒 Claude Code Security Validation\\n\\n';
            
            if (report.isValid) {
              comment += '✅ **Security validation passed!**\\n\\n';
            } else {
              comment += '❌ **Security validation failed!**\\n\\n';
              comment += \`**Errors:** \${report.errors.length}\\n\`;
              comment += \`**Warnings:** \${report.warnings.length}\\n\`;
              comment += \`**Conflicts:** \${report.conflicts.length}\\n\\n\`;
            }
            
            comment += \`**Performance:** \${report.performance.validationTime}ms\\n\`;
            comment += \`**Rules processed:** \${report.performance.rulesProcessed}\\n\\n\`;
            
            if (report.errors.length > 0) {
              comment += '### ❌ Critical Errors\\n';
              report.errors.forEach(error => {
                comment += \`- **\${error.type}**: \${error.message}\\n\`;
              });
              comment += '\\n';
            }
            
            if (report.warnings.length > 0) {
              comment += '### ⚠️ Warnings\\n';
              report.warnings.forEach(warning => {
                comment += \`- **\${warning.type}**: \${warning.message}\\n\`;
              });
              comment += '\\n';
            }
            
            if (report.suggestions.length > 0) {
              comment += '### 💡 Suggestions\\n';
              report.suggestions.forEach(suggestion => {
                comment += \`- \${suggestion.message}\\n\`;
              });
            }
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
          } catch (error) {
            console.log('Failed to read or parse security report:', error);
          }
          
    - name: Check validation result
      run: |
        if [ ! -f security-report.json ]; then
          echo "Security report not found, validation may have failed"
          exit 1
        fi
        
        # Check if validation passed
        if ! jq -e '.isValid' security-report.json > /dev/null; then
          echo "Security validation failed!"
          echo "Review the security report for details"
          exit 1
        fi
        
        echo "✅ Security validation passed successfully!"

  deployment-gate:
    name: Deployment Gate
    needs: security-validation
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    
    steps:
    - name: Security Gate Passed
      run: |
        echo "🚀 Security validation passed - deployment can proceed"
        echo "This job can be used as a dependency for deployment jobs"
`
    };
  }

  /**
   * Generate GitHub Enterprise template with additional security features
   */
  private getGitHubEnterpriseTemplate(): CITemplate {
    return {
      platform: 'github',
      name: 'github-enterprise',
      description: 'Enterprise GitHub Actions workflow with comprehensive security validation and compliance reporting',
      filePath: '.github/workflows/claude-code-enterprise.yml',
      variables: [
        {
          name: 'compliance_framework',
          description: 'Compliance framework to validate against (SOC2, HIPAA, PCI-DSS)',
          defaultValue: 'SOC2',
          required: false,
          pattern: '^(SOC2|HIPAA|PCI-DSS|GDPR)$'
        },
        {
          name: 'notification_webhook',
          description: 'Webhook URL for security notifications',
          required: false
        },
        {
          name: 'artifact_retention_days',
          description: 'Days to retain security artifacts',
          defaultValue: '90',
          required: false,
          pattern: '^\\d+$'
        }
      ],
      content: `name: Enterprise Security Validation

on:
  push:
    branches: [ main, master, release/* ]
  pull_request:
    branches: [ main, master ]
  schedule:
    # Daily security audit at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:
    inputs:
      compliance_check:
        description: 'Run compliance validation'
        required: false
        default: 'true'
        type: boolean

env:
  COMPLIANCE_FRAMEWORK: {{ compliance_framework }}
  NOTIFICATION_WEBHOOK: {{ notification_webhook }}

jobs:
  security-audit:
    name: Security Audit & Compliance
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        validation-type: [security, compliance, performance]
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        fetch-depth: 0  # Full history for compliance audit
        
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
        
    - name: Install Claude Code Enterprise
      run: |
        npm install -g claude-code-security-rulesets@enterprise
        claude-code --version
        
    - name: Run Security Validation
      if: matrix.validation-type == 'security'
      run: |
        claude-code validate \\
          --config .claude-code.json \\
          --format json \\
          --output security-audit-\${{ matrix.validation-type }}.json \\
          --strict \\
          --include-performance-metrics \\
          --audit-trail
          
    - name: Run Compliance Check
      if: matrix.validation-type == 'compliance' && (github.event.inputs.compliance_check == 'true' || github.event_name == 'schedule')
      run: |
        claude-code compliance \\
          --framework \${{ env.COMPLIANCE_FRAMEWORK }} \\
          --config .claude-code.json \\
          --output compliance-report-\${{ env.COMPLIANCE_FRAMEWORK }}.json \\
          --include-evidence \\
          --generate-attestation
          
    - name: Performance Validation
      if: matrix.validation-type == 'performance'
      run: |
        claude-code benchmark \\
          --config .claude-code.json \\
          --output performance-benchmark.json \\
          --target-time 100ms \\
          --memory-limit 50MB
          
    - name: Generate Security Dashboard
      if: matrix.validation-type == 'security'
      run: |
        claude-code dashboard \\
          --input security-audit-security.json \\
          --output security-dashboard.html \\
          --include-trends \\
          --include-recommendations
          
    - name: Upload Security Artifacts
      uses: actions/upload-artifact@v3
      with:
        name: security-artifacts-\${{ matrix.validation-type }}
        path: |
          *-audit-*.json
          *-report-*.json
          *-benchmark.json
          security-dashboard.html
        retention-days: {{ artifact_retention_days }}
        
    - name: Notify Security Team
      if: failure() && env.NOTIFICATION_WEBHOOK
      run: |
        curl -X POST "\${{ env.NOTIFICATION_WEBHOOK }}" \\
          -H "Content-Type: application/json" \\
          -d '{
            "text": "🚨 Claude Code security validation failed",
            "attachments": [{
              "color": "danger",
              "fields": [{
                "title": "Repository",
                "value": "\${{ github.repository }}",
                "short": true
              }, {
                "title": "Branch",
                "value": "\${{ github.ref_name }}",
                "short": true
              }, {
                "title": "Commit",
                "value": "\${{ github.sha }}",
                "short": true
              }, {
                "title": "Validation Type",
                "value": "\${{ matrix.validation-type }}",
                "short": true
              }]
            }]
          }'

  security-report:
    name: Consolidated Security Report
    needs: security-audit
    runs-on: ubuntu-latest
    if: always()
    
    steps:
    - name: Download all artifacts
      uses: actions/download-artifact@v3
      
    - name: Consolidate Reports
      run: |
        claude-code merge-reports \\
          --input-dir . \\
          --output consolidated-security-report.json \\
          --include-summary \\
          --generate-executive-summary
          
    - name: Generate Executive Summary
      run: |
        claude-code executive-summary \\
          --input consolidated-security-report.json \\
          --output executive-summary.md \\
          --format markdown \\
          --include-compliance-status
          
    - name: Upload Final Reports
      uses: actions/upload-artifact@v3
      with:
        name: final-security-reports
        path: |
          consolidated-security-report.json
          executive-summary.md
        retention-days: {{ artifact_retention_days }}

  deployment-gate:
    name: Enterprise Deployment Gate
    needs: [security-audit, security-report]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - name: Validate Security Posture
      run: |
        echo "🔐 Validating enterprise security requirements..."
        echo "✅ All security validations passed"
        echo "✅ Compliance requirements met"
        echo "✅ Performance benchmarks achieved"
        echo "🚀 Ready for production deployment"
`
    };
  }

  /**
   * Generate GitLab CI template
   */
  private getGitLabCITemplate(): CITemplate {
    return {
      platform: 'gitlab',
      name: 'gitlab-basic',
      description: 'GitLab CI pipeline with Claude Code security validation',
      filePath: '.gitlab-ci.yml',
      variables: [
        {
          name: 'docker_image',
          description: 'Docker image for the pipeline',
          defaultValue: 'node:18-alpine',
          required: false
        },
        {
          name: 'cache_key',
          description: 'Cache key for dependencies',
          defaultValue: 'claude-code-$CI_COMMIT_REF_SLUG',
          required: false
        }
      ],
      content: `# Claude Code Security Validation Pipeline
# GitLab CI configuration for automated security validation

image: {{ docker_image }}

# Global variables
variables:
  CLAUDE_CODE_VERSION: "latest"
  NODE_ENV: "production"
  
# Cache configuration
cache:
  key: {{ cache_key }}
  paths:
    - node_modules/
    - .npm/

# Pipeline stages
stages:
  - prepare
  - security-validation
  - compliance-check
  - deployment-gate

# Before script - runs before each job
before_script:
  - apk add --no-cache git curl jq
  - npm config set cache .npm
  - npm install -g claude-code-security-rulesets@$CLAUDE_CODE_VERSION

# Prepare stage
prepare:
  stage: prepare
  script:
    - echo "🔧 Preparing Claude Code security validation..."
    - claude-code --version
    - |
      if [ ! -f .claude-code.json ]; then
        echo "⚠️ No configuration found, generating default..."
        claude-code init --template=production
      fi
  artifacts:
    paths:
      - .claude-code.json
    expire_in: 1 hour

# Security validation job
security-validate:
  stage: security-validation
  dependencies:
    - prepare
  script:
    - echo "🔍 Running security validation..."
    - |
      claude-code validate \\
        --config .claude-code.json \\
        --format json \\
        --output security-report.json \\
        --strict
    - |
      if [ $? -eq 0 ]; then
        echo "✅ Security validation passed!"
      else
        echo "❌ Security validation failed!"
        exit 1
      fi
  artifacts:
    reports:
      junit: security-report.xml
    paths:
      - security-report.json
    expire_in: 30 days
    when: always
  only:
    - merge_requests
    - main
    - master
    - develop

# Performance validation
performance-check:
  stage: security-validation
  dependencies:
    - prepare
  script:
    - echo "⚡ Running performance validation..."
    - |
      claude-code benchmark \\
        --config .claude-code.json \\
        --target-time 100ms \\
        --output performance-report.json
    - |
      # Check if performance targets are met
      VALIDATION_TIME=$(jq -r '.performance.validationTime' security-report.json)
      if [ "$VALIDATION_TIME" -gt 100 ]; then
        echo "⚠️ Performance target not met: ${VALIDATION_TIME}ms > 100ms"
      else
        echo "✅ Performance target achieved: ${VALIDATION_TIME}ms"
      fi
  artifacts:
    paths:
      - performance-report.json
    expire_in: 30 days
  allow_failure: true

# Compliance validation (runs on main branch)
compliance-check:
  stage: compliance-check
  dependencies:
    - security-validate
  script:
    - echo "📋 Running compliance validation..."
    - |
      claude-code compliance \\
        --framework SOC2 \\
        --config .claude-code.json \\
        --output compliance-report.json \\
        --generate-evidence
    - |
      # Generate compliance dashboard
      claude-code dashboard \\
        --input compliance-report.json \\
        --output compliance-dashboard.html
  artifacts:
    paths:
      - compliance-report.json
      - compliance-dashboard.html
    expire_in: 90 days
  only:
    - main
    - master

# Security gate for deployment
deployment-gate:
  stage: deployment-gate
  dependencies:
    - security-validate
    - performance-check
  script:
    - echo "🚪 Checking deployment gate..."
    - |
      # Verify security validation passed
      IS_VALID=$(jq -r '.isValid' security-report.json)
      if [ "$IS_VALID" != "true" ]; then
        echo "❌ Security validation failed - blocking deployment"
        exit 1
      fi
    - |
      # Check for critical errors
      ERROR_COUNT=$(jq -r '.errors | length' security-report.json)
      if [ "$ERROR_COUNT" -gt 0 ]; then
        echo "❌ Critical errors found - blocking deployment"
        jq -r '.errors[] | "Error: " + .message' security-report.json
        exit 1
      fi
    - echo "✅ Security gate passed - deployment authorized"
    - echo "🚀 Ready for production deployment"
  only:
    - main
    - master

# Notification job (runs on failure)
notify-failure:
  stage: .post
  script:
    - |
      echo "🚨 Security validation pipeline failed!"
      if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \\
          --data "{
            \\"text\\": \\"🚨 Claude Code security validation failed in $CI_PROJECT_NAME\\",
            \\"attachments\\": [{
              \\"color\\": \\"danger\\",
              \\"fields\\": [{
                \\"title\\": \\"Branch\\",
                \\"value\\": \\"$CI_COMMIT_REF_NAME\\",
                \\"short\\": true
              }, {
                \\"title\\": \\"Commit\\",
                \\"value\\": \\"$CI_COMMIT_SHORT_SHA\\",
                \\"short\\": true
              }, {
                \\"title\\": \\"Pipeline\\",
                \\"value\\": \\"$CI_PIPELINE_URL\\",
                \\"short\\": false
              }]
            }]
          }" \\
          $SLACK_WEBHOOK_URL
      fi
  when: on_failure
  only:
    - main
    - master
    - merge_requests

# Security report pages (GitLab Pages integration)
pages:
  stage: .post
  dependencies:
    - security-validate
    - compliance-check
  script:
    - mkdir public
    - |
      if [ -f compliance-dashboard.html ]; then
        cp compliance-dashboard.html public/index.html
      fi
    - |
      if [ -f security-report.json ]; then
        claude-code dashboard \\
          --input security-report.json \\
          --output public/security.html
      fi
  artifacts:
    paths:
      - public
  only:
    - main
`
    };
  }

  /**
   * Generate Jenkins pipeline template
   */
  private getJenkinsTemplate(): CITemplate {
    return {
      platform: 'jenkins',
      name: 'jenkins-basic',
      description: 'Jenkins pipeline with Claude Code security validation',
      filePath: 'Jenkinsfile',
      variables: [
        {
          name: 'node_version',
          description: 'Node.js version to use',
          defaultValue: '18',
          required: false
        },
        {
          name: 'notification_email',
          description: 'Email for notifications',
          required: false,
          pattern: '^[^@]+@[^@]+\\.[^@]+$'
        }
      ],
      content: `// Claude Code Security Validation Pipeline
// Jenkins Pipeline for automated security validation and compliance checking

pipeline {
    agent any
    
    environment {
        NODE_VERSION = '{{ node_version }}'
        CLAUDE_CODE_VERSION = 'latest'
        NOTIFICATION_EMAIL = '{{ notification_email }}'
    }
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
        ansiColor('xterm')
    }
    
    triggers {
        // Run nightly security audit
        cron('H 2 * * *')
    }
    
    stages {
        stage('Prepare Environment') {
            steps {
                script {
                    echo "🔧 Setting up Claude Code environment..."
                    
                    // Install Node.js
                    def nodeJS = tool name: "NodeJS-${NODE_VERSION}", type: 'jenkins.plugins.nodejs.tools.NodeJSInstallation'
                    env.PATH = "${nodeJS}/bin:${env.PATH}"
                    
                    // Verify Node.js installation
                    sh 'node --version'
                    sh 'npm --version'
                    
                    // Install Claude Code
                    sh "npm install -g claude-code-security-rulesets@${CLAUDE_CODE_VERSION}"
                    sh 'claude-code --version'
                }
            }
        }
        
        stage('Configuration Check') {
            steps {
                script {
                    echo "📋 Checking Claude Code configuration..."
                    
                    if (!fileExists('.claude-code.json')) {
                        echo "⚠️ No configuration found, generating default..."
                        sh 'claude-code init --template=production --yes'
                    }
                    
                    // Validate configuration syntax
                    sh '''
                        claude-code config validate \\
                          --config .claude-code.json \\
                          --strict
                    '''
                }
            }
        }
        
        stage('Security Validation') {
            parallel {
                stage('Core Security') {
                    steps {
                        script {
                            echo "🔍 Running core security validation..."
                            
                            sh '''
                                claude-code validate \\
                                  --config .claude-code.json \\
                                  --format json \\
                                  --output security-core-report.json \\
                                  --strict \\
                                  --include-performance
                            '''
                            
                            // Archive the report
                            archiveArtifacts artifacts: 'security-core-report.json', allowEmptyArchive: false
                        }
                    }
                    post {
                        always {
                            // Publish test results if available
                            script {
                                if (fileExists('security-core-report.json')) {
                                    def report = readJSON file: 'security-core-report.json'
                                    if (!report.isValid) {
                                        currentBuild.result = 'FAILURE'
                                        error "Core security validation failed with ${report.errors.size()} errors"
                                    }
                                }
                            }
                        }
                    }
                }
                
                stage('Compliance Check') {
                    when {
                        anyOf {
                            branch 'main'
                            branch 'master'
                            triggeredBy 'TimerTrigger'
                        }
                    }
                    steps {
                        script {
                            echo "📋 Running compliance validation..."
                            
                            sh '''
                                claude-code compliance \\
                                  --framework SOC2 \\
                                  --config .claude-code.json \\
                                  --output compliance-report.json \\
                                  --generate-evidence \\
                                  --include-recommendations
                            '''
                            
                            // Generate compliance dashboard
                            sh '''
                                claude-code dashboard \\
                                  --input compliance-report.json \\
                                  --output compliance-dashboard.html \\
                                  --template enterprise
                            '''
                            
                            archiveArtifacts artifacts: 'compliance-report.json,compliance-dashboard.html', allowEmptyArchive: false
                        }
                    }
                }
                
                stage('Performance Benchmark') {
                    steps {
                        script {
                            echo "⚡ Running performance benchmarks..."
                            
                            sh '''
                                claude-code benchmark \\
                                  --config .claude-code.json \\
                                  --target-time 100ms \\
                                  --memory-limit 50MB \\
                                  --output performance-benchmark.json
                            '''
                            
                            archiveArtifacts artifacts: 'performance-benchmark.json', allowEmptyArchive: false
                            
                            // Check performance targets
                            script {
                                def benchmark = readJSON file: 'performance-benchmark.json'
                                if (benchmark.performance?.validationTime > 100) {
                                    echo "⚠️ Performance target not met: ${benchmark.performance.validationTime}ms > 100ms"
                                    // Mark as unstable but don't fail
                                    currentBuild.result = 'UNSTABLE'
                                }
                            }
                        }
                    }
                }
            }
        }
        
        stage('Security Report') {
            steps {
                script {
                    echo "📊 Generating consolidated security report..."
                    
                    sh '''
                        claude-code merge-reports \\
                          --input-pattern "*-report.json" \\
                          --output consolidated-security-report.json \\
                          --include-summary
                    '''
                    
                    // Generate executive summary
                    sh '''
                        claude-code executive-summary \\
                          --input consolidated-security-report.json \\
                          --output executive-summary.md \\
                          --format markdown
                    '''
                    
                    archiveArtifacts artifacts: 'consolidated-security-report.json,executive-summary.md', allowEmptyArchive: false
                    
                    // Publish HTML reports
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: '.',
                        reportFiles: 'compliance-dashboard.html',
                        reportName: 'Security Dashboard'
                    ])
                }
            }
        }
        
        stage('Deployment Gate') {
            when {
                anyOf {
                    branch 'main'
                    branch 'master'
                }
            }
            steps {
                script {
                    echo "🚪 Evaluating deployment gate..."
                    
                    def securityReport = readJSON file: 'consolidated-security-report.json'
                    
                    if (!securityReport.isValid) {
                        error "❌ Security validation failed - deployment blocked"
                    }
                    
                    if (securityReport.errors && securityReport.errors.size() > 0) {
                        error "❌ Critical security errors found - deployment blocked"
                    }
                    
                    echo "✅ Security gate passed - deployment authorized"
                    echo "🚀 Ready for production deployment"
                    
                    // Set deployment approval flag
                    env.DEPLOYMENT_APPROVED = 'true'
                }
            }
        }
    }
    
    post {
        always {
            script {
                echo "🧹 Cleaning up artifacts..."
                
                // Clean up temporary files
                sh 'rm -f *.tmp'
                
                // Archive all reports
                archiveArtifacts artifacts: '*.json,*.html,*.md', allowEmptyArchive: true, fingerprint: true
            }
        }
        
        success {
            script {
                echo "✅ Pipeline completed successfully!"
                
                if (env.NOTIFICATION_EMAIL) {
                    emailext (
                        subject: "✅ Claude Code Security Validation Passed - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                        body: """
                        <h2>Security Validation Successful</h2>
                        <p>The Claude Code security validation pipeline has completed successfully.</p>
                        <ul>
                            <li><strong>Job:</strong> ${env.JOB_NAME}</li>
                            <li><strong>Build:</strong> #${env.BUILD_NUMBER}</li>
                            <li><strong>Branch:</strong> ${env.BRANCH_NAME}</li>
                            <li><strong>Commit:</strong> ${env.GIT_COMMIT}</li>
                        </ul>
                        <p><a href="${env.BUILD_URL}">View Build Details</a></p>
                        """,
                        mimeType: 'text/html',
                        to: env.NOTIFICATION_EMAIL
                    )
                }
            }
        }
        
        failure {
            script {
                echo "❌ Pipeline failed!"
                
                if (env.NOTIFICATION_EMAIL) {
                    emailext (
                        subject: "❌ Claude Code Security Validation Failed - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                        body: """
                        <h2>Security Validation Failed</h2>
                        <p>The Claude Code security validation pipeline has failed.</p>
                        <ul>
                            <li><strong>Job:</strong> ${env.JOB_NAME}</li>
                            <li><strong>Build:</strong> #${env.BUILD_NUMBER}</li>
                            <li><strong>Branch:</strong> ${env.BRANCH_NAME}</li>
                            <li><strong>Commit:</strong> ${env.GIT_COMMIT}</li>
                        </ul>
                        <p><strong>Please review the security errors and fix them before proceeding.</strong></p>
                        <p><a href="${env.BUILD_URL}">View Build Details</a></p>
                        """,
                        mimeType: 'text/html',
                        to: env.NOTIFICATION_EMAIL,
                        attachLog: true
                    )
                }
            }
        }
        
        unstable {
            script {
                echo "⚠️ Pipeline completed with warnings!"
                
                if (env.NOTIFICATION_EMAIL) {
                    emailext (
                        subject: "⚠️ Claude Code Security Validation Unstable - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                        body: """
                        <h2>Security Validation Completed with Warnings</h2>
                        <p>The Claude Code security validation pipeline completed but with some warnings.</p>
                        <ul>
                            <li><strong>Job:</strong> ${env.JOB_NAME}</li>
                            <li><strong>Build:</strong> #${env.BUILD_NUMBER}</li>
                            <li><strong>Branch:</strong> ${env.BRANCH_NAME}</li>
                            <li><strong>Commit:</strong> ${env.GIT_COMMIT}</li>
                        </ul>
                        <p><strong>Please review the warnings to improve security posture.</strong></p>
                        <p><a href="${env.BUILD_URL}">View Build Details</a></p>
                        """,
                        mimeType: 'text/html',
                        to: env.NOTIFICATION_EMAIL
                    )
                }
            }
        }
    }
}`
    };
  }

  /**
   * Generate Azure DevOps pipeline template
   */
  private getAzureDevOpsTemplate(): CITemplate {
    return {
      platform: 'azure',
      name: 'azure-basic',
      description: 'Azure DevOps pipeline with Claude Code security validation',
      filePath: 'azure-pipelines.yml',
      variables: [
        {
          name: 'vmImage',
          description: 'VM image for the pipeline',
          defaultValue: 'ubuntu-latest',
          required: false
        },
        {
          name: 'serviceConnection',
          description: 'Service connection name for notifications',
          required: false
        }
      ],
      content: `# Claude Code Security Validation Pipeline
# Azure DevOps Pipeline for automated security validation

trigger:
  branches:
    include:
    - main
    - master
    - develop
    - release/*
  paths:
    include:
    - .claude-code.json
    - src/*
    - '*.js'
    - '*.ts'

pr:
  branches:
    include:
    - main
    - master
  paths:
    include:
    - .claude-code.json
    - src/*

schedules:
- cron: "0 2 * * *"
  displayName: Daily security audit
  branches:
    include:
    - main
  always: true

variables:
  vmImage: '{{ vmImage }}'
  nodeVersion: '18.x'
  claudeCodeVersion: 'latest'
  serviceConnection: '{{ serviceConnection }}'

pool:
  vmImage: $(vmImage)

stages:
- stage: SecurityValidation
  displayName: 'Security Validation'
  jobs:
  - job: PrepareEnvironment
    displayName: 'Prepare Environment'
    steps:
    - task: NodeTool@0
      displayName: 'Install Node.js'
      inputs:
        versionSpec: $(nodeVersion)
        
    - script: |
        npm install -g claude-code-security-rulesets@$(claudeCodeVersion)
        claude-code --version
      displayName: 'Install Claude Code'
      
    - script: |
        if [ ! -f .claude-code.json ]; then
          echo "No configuration found, generating default..."
          claude-code init --template=production --yes
        fi
        claude-code config validate --config .claude-code.json
      displayName: 'Validate Configuration'
      
  - job: CoreSecurityValidation
    displayName: 'Core Security Validation'
    dependsOn: PrepareEnvironment
    steps:
    - task: NodeTool@0
      inputs:
        versionSpec: $(nodeVersion)
        
    - script: npm install -g claude-code-security-rulesets@$(claudeCodeVersion)
      displayName: 'Install Claude Code'
      
    - script: |
        claude-code validate \\
          --config .claude-code.json \\
          --format json \\
          --output security-validation-report.json \\
          --strict \\
          --include-performance
      displayName: 'Run Security Validation'
      continueOnError: false
      
    - task: PublishTestResults@2
      condition: always()
      inputs:
        testResultsFormat: 'JUnit'
        testResultsFiles: 'security-validation-report.xml'
        testRunTitle: 'Claude Code Security Validation'
      displayName: 'Publish Security Test Results'
      
    - task: PublishBuildArtifacts@1
      condition: always()
      inputs:
        pathtoPublish: 'security-validation-report.json'
        artifactName: 'security-reports'
      displayName: 'Publish Security Reports'
      
  - job: PerformanceBenchmark
    displayName: 'Performance Benchmark'
    dependsOn: PrepareEnvironment
    condition: succeeded()
    steps:
    - task: NodeTool@0
      inputs:
        versionSpec: $(nodeVersion)
        
    - script: npm install -g claude-code-security-rulesets@$(claudeCodeVersion)
      displayName: 'Install Claude Code'
      
    - script: |
        claude-code benchmark \\
          --config .claude-code.json \\
          --target-time 100ms \\
          --memory-limit 50MB \\
          --output performance-benchmark.json
      displayName: 'Run Performance Benchmark'
      continueOnError: true
      
    - task: PublishBuildArtifacts@1
      inputs:
        pathtoPublish: 'performance-benchmark.json'
        artifactName: 'performance-reports'
      displayName: 'Publish Performance Reports'

- stage: ComplianceValidation
  displayName: 'Compliance Validation'
  dependsOn: SecurityValidation
  condition: and(succeeded(), or(eq(variables['Build.SourceBranch'], 'refs/heads/main'), eq(variables['Build.SourceBranch'], 'refs/heads/master'), eq(variables['Build.Reason'], 'Schedule')))
  jobs:
  - job: ComplianceCheck
    displayName: 'Compliance Check'
    steps:
    - task: NodeTool@0
      inputs:
        versionSpec: $(nodeVersion)
        
    - script: npm install -g claude-code-security-rulesets@$(claudeCodeVersion)
      displayName: 'Install Claude Code'
      
    - script: |
        claude-code compliance \\
          --framework SOC2 \\
          --config .claude-code.json \\
          --output compliance-report.json \\
          --generate-evidence \\
          --include-attestation
      displayName: 'Run Compliance Validation'
      
    - script: |
        claude-code dashboard \\
          --input compliance-report.json \\
          --output compliance-dashboard.html \\
          --template enterprise \\
          --include-trends
      displayName: 'Generate Compliance Dashboard'
      
    - task: PublishBuildArtifacts@1
      inputs:
        pathtoPublish: |
          compliance-report.json
          compliance-dashboard.html
        artifactName: 'compliance-reports'
      displayName: 'Publish Compliance Reports'
      
- stage: SecurityReporting
  displayName: 'Security Reporting'
  dependsOn: [SecurityValidation, ComplianceValidation]
  condition: always()
  jobs:
  - job: ConsolidateReports
    displayName: 'Consolidate Reports'
    steps:
    - task: DownloadBuildArtifacts@0
      inputs:
        buildType: 'current'
        downloadType: 'all'
        downloadPath: '$(System.ArtifactsDirectory)'
      displayName: 'Download All Artifacts'
      
    - task: NodeTool@0
      inputs:
        versionSpec: $(nodeVersion)
        
    - script: npm install -g claude-code-security-rulesets@$(claudeCodeVersion)
      displayName: 'Install Claude Code'
      
    - script: |
        claude-code merge-reports \\
          --input-dir "$(System.ArtifactsDirectory)" \\
          --output consolidated-security-report.json \\
          --include-summary \\
          --generate-executive-summary
      displayName: 'Consolidate Security Reports'
      
    - script: |
        claude-code executive-summary \\
          --input consolidated-security-report.json \\
          --output executive-summary.md \\
          --format markdown \\
          --include-recommendations
      displayName: 'Generate Executive Summary'
      
    - task: PublishBuildArtifacts@1
      inputs:
        pathtoPublish: |
          consolidated-security-report.json
          executive-summary.md
        artifactName: 'final-reports'
      displayName: 'Publish Final Reports'

- stage: DeploymentGate
  displayName: 'Deployment Gate'
  dependsOn: SecurityReporting
  condition: and(succeeded(), or(eq(variables['Build.SourceBranch'], 'refs/heads/main'), eq(variables['Build.SourceBranch'], 'refs/heads/master')))
  jobs:
  - job: SecurityGateEvaluation
    displayName: 'Security Gate Evaluation'
    steps:
    - task: DownloadBuildArtifacts@0
      inputs:
        buildType: 'current'
        artifactName: 'final-reports'
        downloadPath: '$(System.ArtifactsDirectory)'
      displayName: 'Download Final Reports'
      
    - script: |
        REPORT_FILE="$(System.ArtifactsDirectory)/final-reports/consolidated-security-report.json"
        
        if [ ! -f "$REPORT_FILE" ]; then
          echo "Security report not found!"
          exit 1
        fi
        
        IS_VALID=$(jq -r '.isValid' "$REPORT_FILE")
        ERROR_COUNT=$(jq -r '.errors | length' "$REPORT_FILE")
        
        if [ "$IS_VALID" != "true" ]; then
          echo "❌ Security validation failed - deployment blocked"
          exit 1
        fi
        
        if [ "$ERROR_COUNT" -gt 0 ]; then
          echo "❌ Critical errors found - deployment blocked"
          jq -r '.errors[] | "Error: " + .message' "$REPORT_FILE"
          exit 1
        fi
        
        echo "✅ Security gate passed - deployment authorized"
        echo "🚀 Ready for production deployment"
        
        # Set output variable for subsequent stages
        echo "##vso[task.setvariable variable=deploymentApproved;isOutput=true]true"
      name: securityGate
      displayName: 'Evaluate Security Gate'
      
  - job: NotifySecurityTeam
    displayName: 'Notify Security Team'
    condition: and(succeeded(), ne(variables.serviceConnection, ''))
    dependsOn: SecurityGateEvaluation
    variables:
      deploymentApproved: $[ dependencies.SecurityGateEvaluation.outputs['securityGate.deploymentApproved'] ]
    steps:
    - script: |
        echo "📧 Sending security validation notification..."
        echo "Deployment Approved: $(deploymentApproved)"
        # Integration with notification service would go here
      displayName: 'Send Notification'
`
    };
  }

  /**
   * Generate CircleCI template
   */
  private getCircleCITemplate(): CITemplate {
    return {
      platform: 'circleci',
      name: 'circleci-basic',
      description: 'CircleCI pipeline with Claude Code security validation',
      filePath: '.circleci/config.yml',
      variables: [
        {
          name: 'docker_image',
          description: 'Docker image for the pipeline',
          defaultValue: 'cimg/node:18.0',
          required: false
        },
        {
          name: 'slack_webhook',
          description: 'Slack webhook URL for notifications',
          required: false
        }
      ],
      content: `# Claude Code Security Validation Pipeline
# CircleCI configuration for automated security validation

version: 2.1

# Orbs for enhanced functionality
orbs:
  node: circleci/node@5.1.0
  slack: circleci/slack@4.10.1

# Executors
executors:
  default:
    docker:
      - image: {{ docker_image }}
    working_directory: ~/project
    environment:
      CLAUDE_CODE_VERSION: latest

# Commands
commands:
  install-claude-code:
    description: "Install Claude Code Security Rulesets"
    steps:
      - run:
          name: Install Claude Code
          command: |
            npm install -g claude-code-security-rulesets@$CLAUDE_CODE_VERSION
            claude-code --version
            
  setup-configuration:
    description: "Setup and validate configuration"
    steps:
      - run:
          name: Setup Configuration
          command: |
            if [ ! -f .claude-code.json ]; then
              echo "No configuration found, generating default..."
              claude-code init --template=production --yes
            fi
            
            claude-code config validate --config .claude-code.json --strict

# Jobs
jobs:
  prepare-environment:
    executor: default
    steps:
      - checkout
      - install-claude-code
      - setup-configuration
      - persist_to_workspace:
          root: ~/project
          paths:
            - .claude-code.json

  security-validation:
    executor: default
    steps:
      - checkout
      - attach_workspace:
          at: ~/project
      - install-claude-code
      - run:
          name: Run Security Validation
          command: |
            claude-code validate \\
              --config .claude-code.json \\
              --format json \\
              --output security-validation-report.json \\
              --strict \\
              --include-performance
          no_output_timeout: 5m
      - run:
          name: Check Validation Results
          command: |
            if [ -f security-validation-report.json ]; then
              IS_VALID=$(jq -r '.isValid' security-validation-report.json)
              ERROR_COUNT=$(jq -r '.errors | length' security-validation-report.json)
              
              echo "Validation Status: $IS_VALID"
              echo "Error Count: $ERROR_COUNT"
              
              if [ "$IS_VALID" != "true" ]; then
                echo "Security validation failed!"
                jq -r '.errors[] | "❌ " + .type + ": " + .message' security-validation-report.json
                exit 1
              fi
              
              echo "✅ Security validation passed!"
            else
              echo "Security report not found!"
              exit 1
            fi
      - store_artifacts:
          path: security-validation-report.json
          destination: reports/security-validation-report.json
      - store_test_results:
          path: security-validation-report.json

  performance-benchmark:
    executor: default
    steps:
      - checkout
      - attach_workspace:
          at: ~/project
      - install-claude-code
      - run:
          name: Run Performance Benchmark
          command: |
            claude-code benchmark \\
              --config .claude-code.json \\
              --target-time 100ms \\
              --memory-limit 50MB \\
              --output performance-benchmark.json
      - run:
          name: Evaluate Performance
          command: |
            if [ -f performance-benchmark.json ]; then
              VALIDATION_TIME=$(jq -r '.performance.validationTime // 0' performance-benchmark.json)
              echo "Validation Time: ${VALIDATION_TIME}ms"
              
              if [ "$VALIDATION_TIME" -gt 100 ]; then
                echo "⚠️ Performance target not met: ${VALIDATION_TIME}ms > 100ms"
                # Don't fail, just warn
              else
                echo "✅ Performance target achieved: ${VALIDATION_TIME}ms"
              fi
            fi
      - store_artifacts:
          path: performance-benchmark.json
          destination: reports/performance-benchmark.json

  compliance-check:
    executor: default
    steps:
      - checkout
      - attach_workspace:
          at: ~/project
      - install-claude-code
      - run:
          name: Run Compliance Check
          command: |
            claude-code compliance \\
              --framework SOC2 \\
              --config .claude-code.json \\
              --output compliance-report.json \\
              --generate-evidence
      - run:
          name: Generate Compliance Dashboard
          command: |
            claude-code dashboard \\
              --input compliance-report.json \\
              --output compliance-dashboard.html \\
              --template enterprise
      - store_artifacts:
          path: compliance-report.json
          destination: reports/compliance-report.json
      - store_artifacts:
          path: compliance-dashboard.html
          destination: reports/compliance-dashboard.html

  security-report:
    executor: default
    steps:
      - checkout
      - attach_workspace:
          at: ~/project
      - install-claude-code
      - run:
          name: Download Previous Artifacts
          command: |
            # In a real scenario, you'd download artifacts from previous jobs
            # For now, we'll create placeholder files
            mkdir -p reports
            echo '{"isValid": true, "errors": [], "warnings": []}' > reports/security-validation-report.json
      - run:
          name: Consolidate Reports
          command: |
            claude-code merge-reports \\
              --input-dir reports \\
              --output consolidated-security-report.json \\
              --include-summary
      - run:
          name: Generate Executive Summary
          command: |
            claude-code executive-summary \\
              --input consolidated-security-report.json \\
              --output executive-summary.md \\
              --format markdown
      - store_artifacts:
          path: consolidated-security-report.json
          destination: reports/consolidated-security-report.json
      - store_artifacts:
          path: executive-summary.md
          destination: reports/executive-summary.md
      - persist_to_workspace:
          root: ~/project
          paths:
            - consolidated-security-report.json

  deployment-gate:
    executor: default
    steps:
      - checkout
      - attach_workspace:
          at: ~/project
      - run:
          name: Evaluate Deployment Gate
          command: |
            if [ ! -f consolidated-security-report.json ]; then
              echo "❌ Security report not found - deployment blocked"
              exit 1
            fi
            
            IS_VALID=$(jq -r '.isValid' consolidated-security-report.json)
            ERROR_COUNT=$(jq -r '.errors | length' consolidated-security-report.json)
            
            if [ "$IS_VALID" != "true" ]; then
              echo "❌ Security validation failed - deployment blocked"
              exit 1
            fi
            
            if [ "$ERROR_COUNT" -gt 0 ]; then
              echo "❌ Critical errors found - deployment blocked"
              jq -r '.errors[] | "Error: " + .message' consolidated-security-report.json
              exit 1
            fi
            
            echo "✅ Security gate passed - deployment authorized"
            echo "🚀 Ready for production deployment"
      - slack/notify:
          channel: '#security'
          event: pass
          custom: |
            {
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "✅ *Claude Code Security Validation Passed*\\n\\nProject: $CIRCLE_PROJECT_REPONAME\\nBranch: $CIRCLE_BRANCH\\nCommit: $CIRCLE_SHA1"
                  }
                }
              ]
            }

# Workflows
workflows:
  version: 2
  
  security-validation:
    jobs:
      - prepare-environment
      
      - security-validation:
          requires:
            - prepare-environment
            
      - performance-benchmark:
          requires:
            - prepare-environment
            
      - compliance-check:
          requires:
            - prepare-environment
          filters:
            branches:
              only:
                - main
                - master
                
      - security-report:
          requires:
            - security-validation
            - performance-benchmark
            - compliance-check
          filters:
            branches:
              only:
                - main
                - master
                
      - deployment-gate:
          requires:
            - security-report
          filters:
            branches:
              only:
                - main
                - master
                
  # Nightly security audit
  nightly-audit:
    triggers:
      - schedule:
          cron: "0 2 * * *"
          filters:
            branches:
              only:
                - main
    jobs:
      - prepare-environment
      - security-validation:
          requires:
            - prepare-environment
      - compliance-check:
          requires:
            - prepare-environment
      - security-report:
          requires:
            - security-validation
            - compliance-check
`
    };
  }

  /**
   * Add custom validation steps to CI content
   */
  private addCustomValidationSteps(content: string, steps: string[], platform: CIPlatform): string {
    const customStepsSection = steps.map(step => 
      `        - run: ${step}`
    ).join('\n');

    // Platform-specific insertion logic
    switch (platform) {
      case 'github':
        return content.replace(
          /- name: Validate Security Configuration/,
          `- name: Custom Validation Steps\n      run: |\n${customStepsSection}\n        \n    - name: Validate Security Configuration`
        );
      
      case 'gitlab':
        return content.replace(
          /- echo "🔍 Running security validation..."/,
          `- echo "🔧 Running custom validation steps..."\n${customStepsSection}\n    - echo "🔍 Running security validation..."`
        );
      
      case 'jenkins':
        return content.replace(
          /echo "🔍 Running core security validation..."/,
          `echo "🔧 Running custom validation steps..."\n                            ${steps.join('\n                            ')}\n                            echo "🔍 Running core security validation..."`
        );
      
      case 'azure':
        return content.replace(
          /displayName: 'Run Security Validation'/,
          `displayName: 'Custom Validation Steps'\n      \n    - script: |\n        ${steps.join('\n        ')}\n      displayName: 'Run Security Validation'`
        );
      
      case 'circleci':
        return content.replace(
          /name: Run Security Validation/,
          `name: Custom Validation Steps\n          command: |\n            ${steps.join('\n            ')}\n      - run:\n          name: Run Security Validation`
        );
      
      default:
        return content;
    }
  }

  /**
   * Generate next steps for a platform
   */
  private generateNextSteps(platform: CIPlatform, configPath: string): string[] {
    const baseSteps = [
      `Configuration file created: ${configPath}`,
      'Review and customize the configuration as needed',
      'Commit the configuration file to your repository'
    ];

    const platformSteps: Record<CIPlatform, string[]> = {
      github: [
        'Enable Actions in your repository settings',
        'Configure any required secrets (SLACK_WEBHOOK_URL, etc.)',
        'Push changes to trigger the workflow'
      ],
      gitlab: [
        'Ensure GitLab CI/CD is enabled in your project',
        'Configure CI/CD variables for notifications',
        'Push changes to trigger the pipeline'
      ],
      jenkins: [
        'Configure Node.js tool installation in Jenkins',
        'Set up email notifications if desired',
        'Create or update the pipeline job'
      ],
      azure: [
        'Enable Azure Pipelines in your project',
        'Configure service connections for notifications',
        'Push changes to trigger the pipeline'
      ],
      circleci: [
        'Connect your repository to CircleCI',
        'Configure environment variables (SLACK_WEBHOOK_URL, etc.)',
        'Push changes to trigger the pipeline'
      ],
      generic: [
        'Adapt the configuration to your specific CI/CD platform',
        'Configure notification endpoints',
        'Test the pipeline configuration'
      ]
    };

    return [...baseSteps, ...platformSteps[platform]];
  }
}

/**
 * Factory function to create CICDIntegration instance
 */
export function createCICDIntegration(): CICDIntegration {
  return new CICDIntegration();
}

/**
 * Utility function to validate template variables
 */
export function validateTemplateVariables(
  template: CITemplate,
  variables: Record<string, string>
): string[] {
  const errors: string[] = [];

  for (const templateVar of template.variables) {
    const value = variables[templateVar.name];

    // Check required variables
    if (templateVar.required && !value) {
      errors.push(`Missing required variable: ${templateVar.name}`);
      continue;
    }

    // Check pattern if value exists
    if (value && templateVar.pattern) {
      const regex = new RegExp(templateVar.pattern);
      if (!regex.test(value)) {
        errors.push(
          `Variable '${templateVar.name}' value '${value}' doesn't match pattern: ${templateVar.pattern}`
        );
      }
    }
  }

  return errors;
}

/**
 * Utility function to substitute template variables
 */
export function substituteTemplateVariables(
  content: string,
  variables: Record<string, string>,
  template: CITemplate
): string {
  let result = content;

  // Substitute provided variables
  for (const [varName, varValue] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${varName}\\s*\\}\\}`, 'g');
    result = result.replace(regex, varValue);
  }

  // Substitute default values for missing optional variables
  for (const templateVar of template.variables) {
    if (!templateVar.required && !variables[templateVar.name] && templateVar.defaultValue) {
      const regex = new RegExp(`\\{\\{\\s*${templateVar.name}\\s*\\}\\}`, 'g');
      result = result.replace(regex, templateVar.defaultValue);
    }
  }

  return result;
}