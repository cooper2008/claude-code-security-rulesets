/**
 * Example Security Validation Plugin
 * Demonstrates how to create a plugin for the Claude Code Security Rulesets system
 */

/**
 * Plugin manifest - typically in package.json under "claudePlugin" key
 */
const pluginManifest = {
  id: 'example-security-validator',
  name: 'Example Security Validator',
  version: '1.0.0',
  description: 'Example plugin that validates security configurations for dangerous patterns',
  author: {
    name: 'Security Team',
    email: 'security@example.com'
  },
  category: 'validation',
  types: ['validation-rule'],
  apiVersion: '1.0.0',
  permissions: {
    filesystem: {
      read: ['./configs']
    }
  },
  entryPoints: {
    main: 'example-plugin.js'
  }
};

/**
 * Example validation plugin implementation
 */
class ExampleSecurityValidator {
  constructor() {
    this.manifest = pluginManifest;
    this.context = null;
    this.apis = null;
    this.initialized = false;
  }

  /**
   * Initialize plugin with context and APIs
   */
  async initialize(context, apis) {
    this.context = context;
    this.apis = apis;
    
    // Log initialization
    this.apis.logger.info('Example Security Validator plugin initializing...');
    
    // Set up any required resources
    await this.setupValidationRules();
    
    this.initialized = true;
    this.apis.logger.info('Example Security Validator plugin initialized');
  }

  /**
   * Activate plugin
   */
  async activate() {
    if (!this.initialized) {
      throw new Error('Plugin not initialized');
    }
    
    this.apis.logger.info('Example Security Validator plugin activated');
    
    // Register for events
    this.apis.events.on('validation-request', this.handleValidationRequest.bind(this));
  }

  /**
   * Deactivate plugin
   */
  async deactivate() {
    this.apis.logger.info('Example Security Validator plugin deactivated');
    
    // Unregister from events
    this.apis.events.off('validation-request', this.handleValidationRequest.bind(this));
  }

  /**
   * Cleanup plugin resources
   */
  async cleanup() {
    this.apis.logger.info('Example Security Validator plugin cleaning up...');
    // Clean up any resources
    this.initialized = false;
  }

  /**
   * Get plugin health status
   */
  getHealth() {
    return {
      status: this.initialized ? 'healthy' : 'unhealthy',
      message: this.initialized ? 'Plugin is operational' : 'Plugin not initialized',
      details: {
        initialized: this.initialized,
        rulesLoaded: this.validationRules ? this.validationRules.length : 0
      },
      timestamp: new Date()
    };
  }

  /**
   * Main validation method
   */
  async validate(config, context) {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      this.apis.logger.debug('Starting validation with Example Security Validator');

      const errors = [];
      const warnings = [];

      // Validation Rule 1: Check for dangerous shell commands
      const dangerousCommands = this.checkDangerousCommands(config);
      if (dangerousCommands.length > 0) {
        dangerousCommands.forEach(command => {
          errors.push({
            code: 'DANGEROUS_COMMAND',
            message: `Dangerous command pattern detected: ${command}`,
            severity: 'critical',
            location: { path: 'permissions.allow' }
          });
        });
      }

      // Validation Rule 2: Check for overly permissive patterns
      const overlyPermissive = this.checkOverlyPermissivePatterns(config);
      if (overlyPermissive.length > 0) {
        overlyPermissive.forEach(pattern => {
          warnings.push({
            code: 'OVERLY_PERMISSIVE',
            message: `Overly permissive pattern detected: ${pattern}`,
            location: { path: 'permissions.allow' }
          });
        });
      }

      // Validation Rule 3: Check for missing deny rules
      const missingDenyRules = this.checkMissingDenyRules(config);
      if (missingDenyRules.length > 0) {
        warnings.push({
          code: 'MISSING_DENY_RULES',
          message: 'Consider adding deny rules for: ' + missingDenyRules.join(', '),
          location: { path: 'permissions.deny' }
        });
      }

      // Validation Rule 4: Check for path traversal vulnerabilities
      const pathTraversalVulns = this.checkPathTraversalVulnerabilities(config);
      if (pathTraversalVulns.length > 0) {
        pathTraversalVulns.forEach(vuln => {
          errors.push({
            code: 'PATH_TRAVERSAL',
            message: `Potential path traversal vulnerability: ${vuln}`,
            severity: 'high',
            location: { path: 'permissions' }
          });
        });
      }

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      const result = {
        isValid: errors.length === 0,
        errors,
        warnings,
        performance: {
          duration: endTime - startTime,
          memoryUsed: (endMemory - startMemory) / (1024 * 1024) // Convert to MB
        }
      };

      this.apis.logger.info(
        `Validation completed: ${errors.length} errors, ${warnings.length} warnings ` +
        `(${result.performance.duration}ms)`
      );

      // Store validation result in plugin storage
      await this.apis.storage.set('last_validation', {
        timestamp: new Date().toISOString(),
        result: { 
          isValid: result.isValid, 
          errorCount: errors.length, 
          warningCount: warnings.length 
        }
      });

      return result;

    } catch (error) {
      this.apis.logger.error('Validation failed', error);
      
      return {
        isValid: false,
        errors: [{
          code: 'VALIDATION_ERROR',
          message: `Validation failed: ${error.message}`,
          severity: 'critical'
        }],
        warnings: [],
        performance: {
          duration: Date.now() - startTime,
          memoryUsed: 0
        }
      };
    }
  }

  /**
   * Get supported validation rules
   */
  getSupportedRules() {
    return [
      {
        id: 'dangerous-commands',
        name: 'Dangerous Commands Check',
        description: 'Detects dangerous shell commands in allow rules',
        category: 'security',
        defaultSeverity: 'critical'
      },
      {
        id: 'overly-permissive',
        name: 'Overly Permissive Patterns',
        description: 'Detects overly broad permission patterns',
        category: 'security',
        defaultSeverity: 'medium'
      },
      {
        id: 'missing-deny-rules',
        name: 'Missing Deny Rules',
        description: 'Suggests missing deny rules for common dangerous operations',
        category: 'best-practice',
        defaultSeverity: 'low'
      },
      {
        id: 'path-traversal',
        name: 'Path Traversal Check',
        description: 'Detects potential path traversal vulnerabilities',
        category: 'security',
        defaultSeverity: 'high'
      }
    ];
  }

  /**
   * Setup validation rules
   */
  async setupValidationRules() {
    this.validationRules = [
      // Dangerous commands that should be blocked
      {
        type: 'dangerous_commands',
        patterns: [
          /rm\s+-rf/,
          /sudo\s+/,
          /chmod\s+777/,
          /eval\s*\(/,
          /exec\s*\(/,
          /system\s*\(/,
          /shell_exec/,
          /passthru/
        ]
      },
      // Overly permissive patterns
      {
        type: 'overly_permissive',
        patterns: [
          /^\*+$/,
          /^\.\.\/.*\*/,
          /^\/.*\*$/
        ]
      },
      // Common dangerous operations that should have deny rules
      {
        type: 'recommended_deny',
        operations: [
          'rm',
          'rmdir',
          'del',
          'format',
          'fdisk',
          'mkfs',
          'dd',
          'chmod',
          'chown'
        ]
      }
    ];

    this.apis.logger.debug(`Loaded ${this.validationRules.length} validation rules`);
  }

  /**
   * Check for dangerous commands in configuration
   */
  checkDangerousCommands(config) {
    const dangerous = [];
    const allowRules = config.permissions?.allow || [];
    const dangerousPatterns = this.validationRules
      .find(rule => rule.type === 'dangerous_commands')?.patterns || [];

    allowRules.forEach(rule => {
      dangerousPatterns.forEach(pattern => {
        if (pattern.test(rule)) {
          dangerous.push(rule);
        }
      });
    });

    return [...new Set(dangerous)]; // Remove duplicates
  }

  /**
   * Check for overly permissive patterns
   */
  checkOverlyPermissivePatterns(config) {
    const permissive = [];
    const allowRules = config.permissions?.allow || [];
    const permissivePatterns = this.validationRules
      .find(rule => rule.type === 'overly_permissive')?.patterns || [];

    allowRules.forEach(rule => {
      permissivePatterns.forEach(pattern => {
        if (pattern.test(rule)) {
          permissive.push(rule);
        }
      });
    });

    return [...new Set(permissive)];
  }

  /**
   * Check for missing deny rules
   */
  checkMissingDenyRules(config) {
    const missing = [];
    const denyRules = config.permissions?.deny || [];
    const recommendedOps = this.validationRules
      .find(rule => rule.type === 'recommended_deny')?.operations || [];

    recommendedOps.forEach(op => {
      const hasRule = denyRules.some(rule => rule.includes(op));
      if (!hasRule) {
        missing.push(op);
      }
    });

    return missing;
  }

  /**
   * Check for path traversal vulnerabilities
   */
  checkPathTraversalVulnerabilities(config) {
    const vulnerabilities = [];
    const allRules = [
      ...(config.permissions?.allow || []),
      ...(config.permissions?.ask || [])
    ];

    allRules.forEach(rule => {
      if (rule.includes('..')) {
        vulnerabilities.push(rule);
      }
    });

    return vulnerabilities;
  }

  /**
   * Handle validation request events
   */
  async handleValidationRequest(data) {
    this.apis.logger.debug('Received validation request event', data);
    
    // Could trigger additional validations or logging here
    await this.apis.storage.set('last_request', {
      timestamp: new Date().toISOString(),
      data
    });
  }
}

// Export the plugin class
module.exports = ExampleSecurityValidator;

// For CommonJS environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports.pluginManifest = pluginManifest;
}

// For ES6 environments  
if (typeof export !== 'undefined') {
  export default ExampleSecurityValidator;
  export { pluginManifest };
}