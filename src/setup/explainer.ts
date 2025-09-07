/**
 * Security Education Content Library
 * User-friendly explanations for security concepts
 */

import chalk from 'chalk';
import { ProjectType, RiskLevel } from './scanner';

export interface SecurityConcept {
  /** Short title */
  title: string;
  /** Simple explanation */
  explanation: string;
  /** Real-world example */
  example?: string;
  /** What could happen if not protected */
  risk?: string;
}

/**
 * Security Education and Explanation Class
 */
export class Explainer {

  /**
   * Get explanation for different file types
   */
  getFileTypeExplanation(fileType: string): SecurityConcept {
    const explanations: Record<string, SecurityConcept> = {
      'Environment Variables': {
        title: 'Environment Files (.env)',
        explanation: 'These files store secret information like API keys, database passwords, and other credentials that your app needs to work.',
        example: 'Like: API_KEY=secret123, DATABASE_PASSWORD=mypassword',
        risk: 'If exposed, hackers could access your databases, cloud accounts, and third-party services.'
      },
      
      'SSH Private Keys': {
        title: 'SSH Keys',
        explanation: 'These are like digital keys that let you log into servers and push code to Git repositories without typing passwords.',
        example: 'Files like id_rsa, id_ed25519 in your ~/.ssh/ folder',
        risk: 'If someone gets your SSH key, they could access your servers, steal your code, or impersonate you online.'
      },
      
      'AWS Credentials': {
        title: 'Cloud Account Keys',
        explanation: 'These files contain access keys for cloud services like Amazon AWS, Google Cloud, or Microsoft Azure.',
        example: 'AWS credentials file with access keys and secret keys',
        risk: 'Someone could use your cloud account, run up huge bills, access your data, or delete your services.'
      },
      
      'Database Configuration': {
        title: 'Database Settings',
        explanation: 'Configuration files that tell your app how to connect to databases, including usernames and passwords.',
        example: 'database.yml with connection strings and passwords',
        risk: 'Attackers could access all your application data, user information, and potentially modify or delete everything.'
      },
      
      'Terraform State': {
        title: 'Infrastructure State Files',
        explanation: 'These files track your cloud infrastructure setup and often contain sensitive configuration details.',
        example: 'terraform.tfstate files with cloud resource configurations',
        risk: 'Could expose your entire infrastructure setup, security configurations, and access credentials.'
      },
      
      'Certificate/Key Files': {
        title: 'SSL Certificates and Keys',
        explanation: 'Digital certificates and private keys used to secure websites and encrypt communications.',
        example: 'Files ending in .pem, .key, .p12 used for HTTPS',
        risk: 'Could allow someone to impersonate your website, intercept secure communications, or decrypt data.'
      },
      
      'Docker Configuration': {
        title: 'Container Settings',
        explanation: 'Configuration files for Docker containers that may include registry passwords and deployment secrets.',
        example: 'Docker config files with registry credentials',
        risk: 'Could give access to your container registries, deployment systems, or application secrets.'
      },
    };

    return explanations[fileType] || {
      title: 'Sensitive File',
      explanation: 'This file may contain sensitive information that should be protected.',
      risk: 'Could expose private information or system access.'
    };
  }

  /**
   * Get project-specific security advice
   */
  getProjectSecurityAdvice(projectType: ProjectType): SecurityConcept {
    const advice: Record<ProjectType, SecurityConcept> = {
      'web-development': {
        title: 'Web Development Security',
        explanation: 'Web apps handle user data and connect to many external services, making them attractive targets for hackers.',
        example: 'Protect API keys, database passwords, and user authentication secrets.',
        risk: 'Data breaches can expose user information, damage your reputation, and result in legal issues.'
      },
      
      'python': {
        title: 'Python Project Security',
        explanation: 'Python applications often process data and integrate with various APIs and databases.',
        example: 'Secure environment variables, database connections, and API credentials.',
        risk: 'Exposed credentials could lead to data theft, unauthorized API usage, or system compromise.'
      },
      
      'devops': {
        title: 'DevOps Security',
        explanation: 'DevOps tools manage your entire infrastructure, making security critical for protecting all systems.',
        example: 'Protect deployment keys, infrastructure credentials, and configuration files.',
        risk: 'A single exposed credential could compromise your entire infrastructure and all applications.'
      },
      
      'infrastructure': {
        title: 'Infrastructure Security',
        explanation: 'Infrastructure code defines your cloud resources and security settings across all environments.',
        example: 'Secure Terraform state, cloud provider keys, and infrastructure configurations.',
        risk: 'Could lead to complete infrastructure takeover, data breaches, and massive cloud bills.'
      },
      
      'mobile': {
        title: 'Mobile App Security',
        explanation: 'Mobile apps store user data and connect to backend services, requiring protection of keys and certificates.',
        example: 'Protect signing certificates, API endpoints, and user authentication systems.',
        risk: 'Could lead to app store removal, user data theft, or malicious app updates.'
      },
      
      'data-science': {
        title: 'Data Science Security',
        explanation: 'Data science projects often work with sensitive datasets and require protection of both data and analysis results.',
        example: 'Protect datasets, model files, and database connections with personal information.',
        risk: 'Could expose personal data, violate privacy regulations, or compromise research integrity.'
      },
      
      'general': {
        title: 'General Project Security',
        explanation: 'Every project has some sensitive files that should be protected from accidental exposure.',
        example: 'Protect configuration files, credentials, and any files with personal or sensitive information.',
        risk: 'Could expose private information, system access, or damage your professional reputation.'
      }
    };

    return advice[projectType];
  }

  /**
   * Get risk level explanation
   */
  getRiskLevelExplanation(riskLevel: RiskLevel): SecurityConcept {
    const explanations: Record<RiskLevel, SecurityConcept> = {
      'CRITICAL': {
        title: 'Critical Risk',
        explanation: 'These files contain passwords, keys, or credentials that give direct access to systems or accounts.',
        example: 'SSH keys, API keys, database passwords, cloud credentials',
        risk: 'Immediate and severe security impact if exposed - could lead to complete system compromise.'
      },
      
      'HIGH': {
        title: 'High Risk',
        explanation: 'These files contain sensitive configuration or data that could be used to attack your systems.',
        example: 'Database configurations, infrastructure settings, user data files',
        risk: 'Could lead to data breaches, system access, or significant security incidents.'
      },
      
      'MEDIUM': {
        title: 'Medium Risk',
        explanation: 'These files may contain information that could help attackers but don\'t give direct access.',
        example: 'Log files, configuration files, development databases',
        risk: 'Could provide information useful for targeted attacks or expose some sensitive data.'
      },
      
      'LOW': {
        title: 'Low Risk',
        explanation: 'These files are generally safe but might contain some information worth protecting.',
        example: 'Development logs, cache files, build artifacts',
        risk: 'Minimal direct risk, but could reveal information about your development process.'
      }
    };

    return explanations[riskLevel];
  }

  /**
   * Explain what Claude Code is and why we need protection
   */
  getClaudeCodeExplanation(): SecurityConcept {
    return {
      title: 'Why Claude Code Needs Security Rules',
      explanation: 'Claude Code is an AI assistant that helps you write code by reading and understanding your project files. ' +
                  'However, you may not want it to accidentally read sensitive files like passwords or private keys.',
      example: 'Without protection, Claude Code might read your .env file and include your database password in a chat response.',
      risk: 'Your sensitive information could end up in chat logs, be shared accidentally, or be used inappropriately.'
    };
  }

  /**
   * Explain the different types of protection rules
   */
  getProtectionRulesExplanation(): { deny: SecurityConcept; ask: SecurityConcept; allow: SecurityConcept } {
    return {
      deny: {
        title: 'Deny Rules (Block Access)',
        explanation: 'These rules completely block Claude Code from reading specific files or directories.',
        example: 'Block access to SSH keys, API credentials, and password files',
        risk: 'Files with deny rules cannot be read by Claude Code under any circumstances.'
      },
      
      ask: {
        title: 'Ask Rules (Request Permission)',
        explanation: 'These rules make Claude Code ask for your permission before reading files.',
        example: 'Ask before reading config files, log files, or development databases',
        risk: 'You control access on a case-by-case basis and can deny if the file contains sensitive data.'
      },
      
      allow: {
        title: 'Allow Rules (Explicit Permission)',
        explanation: 'These rules explicitly grant Claude Code permission to read specific files or directories.',
        example: 'Allow access to source code, documentation, and public configuration files',
        risk: 'Files with allow rules can be freely accessed by Claude Code.'
      }
    };
  }

  /**
   * Get beginner-friendly security tips
   */
  getSecurityTips(): SecurityConcept[] {
    return [
      {
        title: 'Start with the Critical Files',
        explanation: 'Focus on protecting files with passwords, keys, and credentials first - these have the highest impact.',
        example: 'SSH keys, .env files, cloud credentials are the most important to protect.'
      },
      
      {
        title: 'Use Global Protection for Personal Files',
        explanation: 'Files in your home directory (like SSH keys) should be protected globally across all projects.',
        example: 'Your ~/.ssh/ and ~/.aws/ folders contain credentials used by multiple projects.'
      },
      
      {
        title: 'Local Protection for Project Files',
        explanation: 'Project-specific sensitive files should be protected locally for that project only.',
        example: '.env files and project configs only need protection within their specific project.'
      },
      
      {
        title: 'Regular Security Checkups',
        explanation: 'Run security scans regularly, especially when adding new services or credentials to your project.',
        example: 'Re-scan when you add new API integrations, databases, or cloud services.'
      },
      
      {
        title: 'Keep Backups of Settings',
        explanation: 'The security tool automatically backs up your Claude Code settings so you can restore them if needed.',
        example: 'If something goes wrong, you can always restore your previous Claude Code configuration.'
      }
    ];
  }

  /**
   * Format and display a security concept with nice formatting
   */
  displayConcept(concept: SecurityConcept, showRisk: boolean = true): void {
    console.log(chalk.cyan.bold(`💡 ${concept.title}`));
    console.log(chalk.gray(`   ${concept.explanation}`));
    
    if (concept.example) {
      console.log(chalk.dim(`   Example: ${concept.example}`));
    }
    
    if (showRisk && concept.risk) {
      console.log(chalk.yellow(`   ⚠️  ${concept.risk}`));
    }
    
    console.log(); // Add spacing
  }

  /**
   * Display multiple concepts in a formatted list
   */
  displayConceptList(concepts: SecurityConcept[], title?: string): void {
    if (title) {
      console.log(chalk.blue.bold(`\n📚 ${title}\n`));
    }

    concepts.forEach((concept, index) => {
      console.log(chalk.cyan(`${index + 1}. ${concept.title}`));
      console.log(chalk.gray(`   ${concept.explanation}`));
      
      if (concept.example) {
        console.log(chalk.dim(`   Example: ${concept.example}`));
      }
      
      console.log(); // Add spacing between items
    });
  }

  /**
   * Get a simple explanation of the setup process
   */
  getSetupProcessExplanation(): SecurityConcept {
    return {
      title: 'How the Security Setup Works',
      explanation: 'We scan your files, identify sensitive ones, create protection rules, and apply them to Claude Code automatically. ' +
                  'The whole process takes about 30 seconds and you maintain full control.',
      example: 'Scan → Identify sensitive files → Explain risks → Create rules → Apply protection',
      risk: 'No changes are made without your confirmation, and backups are created automatically.'
    };
  }
}