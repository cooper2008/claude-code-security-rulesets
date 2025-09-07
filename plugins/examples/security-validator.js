/**
 * Advanced Security Validator Plugin
 * 
 * This plugin performs comprehensive security validation on templates,
 * checking for common vulnerabilities, security best practices, and
 * compliance with security standards.
 * 
 * @author Claude Code Security Team
 * @version 1.0.0
 */

/**
 * Security patterns that should be denied
 */
const CRITICAL_SECURITY_PATTERNS = [
  {
    pattern: /eval\s*\(/i,
    severity: 'critical',
    message: 'Use of eval() is extremely dangerous and should never be allowed'
  },
  {
    pattern: /Function\s*\(/i,
    severity: 'critical', 
    message: 'Function constructor can execute arbitrary code and should be denied'
  },
  {
    pattern: /innerHTML\s*=/i,
    severity: 'error',
    message: 'Direct innerHTML assignment can lead to XSS vulnerabilities'
  },
  {
    pattern: /document\.write\s*\(/i,
    severity: 'error',
    message: 'document.write() can be exploited for XSS attacks'
  },
  {
    pattern: /process\.env\.(PASSWORD|SECRET|KEY|TOKEN)/i,
    severity: 'critical',
    message: 'Sensitive environment variables should not be directly accessible'
  },
  {
    pattern: /dangerouslySetInnerHTML/i,
    severity: 'error',
    message: 'dangerouslySetInnerHTML should be avoided or properly sanitized'
  },
  {
    pattern: /child_process\.(exec|spawn)/i,
    severity: 'critical',
    message: 'Command execution methods are highly dangerous'
  }
];

/**
 * Security patterns that should be allowed/required
 */
const REQUIRED_SECURITY_PATTERNS = [
  {
    pattern: /helmet\(/i,
    category: 'nodejs',
    message: 'Helmet middleware should be used for security headers'
  },
  {
    pattern: /cors\(/i,
    category: 'api',
    message: 'CORS should be properly configured for API security'
  },
  {
    pattern: /bcrypt\.(hash|compare)/i,
    category: 'authentication',
    message: 'Bcrypt should be used for password hashing'
  },
  {
    pattern: /jwt\.(sign|verify)/i,
    category: 'authentication',
    message: 'JWT methods for secure token handling'
  }
];

/**
 * Deprecated patterns that should be replaced
 */
const DEPRECATED_PATTERNS = [
  {
    pattern: /md5/i,
    severity: 'warning',
    message: 'MD5 is cryptographically broken, use SHA-256 or better',
    suggestion: 'Use crypto.createHash(\'sha256\')'
  },
  {
    pattern: /sha1/i,
    severity: 'warning',
    message: 'SHA-1 is deprecated for security purposes',
    suggestion: 'Use SHA-256 or SHA-3'
  }
];

/**
 * Main plugin function
 * @param {Object} context - Plugin execution context
 * @returns {Promise<Object>} Validation result
 */
async function main(context) {
  const startTime = Date.now();
  const { template, buildContext, apis } = context;
  const { logger, utils } = apis;
  
  logger.info(`Starting security validation for template: ${template.id}`);
  
  const errors = [];
  const warnings = [];
  const suggestions = [];
  
  try {
    // Get plugin configuration
    const config = context.config || {
      strictMode: true,
      checkDeprecated: true,
      customPatterns: []
    };
    
    logger.debug('Using configuration:', config);
    
    // Validate deny rules
    await validateDenyRules(template, errors, warnings, config, logger);
    
    // Validate allow rules
    await validateAllowRules(template, errors, warnings, config, logger);
    
    // Check for required security patterns
    await checkRequiredPatterns(template, warnings, suggestions, config, logger);
    
    // Check for deprecated patterns
    if (config.checkDeprecated) {
      await checkDeprecatedPatterns(template, warnings, config, logger);
    }
    
    // Validate custom patterns
    if (config.customPatterns && config.customPatterns.length > 0) {
      await validateCustomPatterns(template, errors, warnings, config.customPatterns, logger);
    }
    
    // Environment-specific validation
    await validateEnvironmentSpecific(template, buildContext, errors, warnings, logger);
    
    // Compliance validation
    await validateCompliance(template, errors, warnings, suggestions, logger);
    
    const duration = Date.now() - startTime;
    const isValid = errors.length === 0 && (!config.strictMode || warnings.length === 0);
    
    logger.info(`Security validation completed in ${duration}ms`);
    logger.info(`Found ${errors.length} errors, ${warnings.length} warnings`);
    
    return {
      success: true,
      data: {
        isValid,
        errors,
        warnings,
        suggestions,
        performance: {
          duration,
          rulesChecked: (template.rules.deny?.length || 0) + (template.rules.allow?.length || 0),
          patternsMatched: errors.length + warnings.length
        }
      },
      metrics: {
        duration,
        memoryUsed: 0 // Will be filled by sandbox
      }
    };
    
  } catch (error) {
    logger.error('Security validation failed:', error);
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

/**
 * Validate deny rules for security patterns
 */
async function validateDenyRules(template, errors, warnings, config, logger) {
  if (!template.rules.deny || template.rules.deny.length === 0) {
    errors.push({
      type: 'security',
      severity: 'critical',
      message: 'Template must have deny rules for basic security',
      location: { path: 'rules.deny' }
    });
    return;
  }
  
  const denyRules = template.rules.deny.join(' ');
  
  // Check if critical security patterns are properly denied
  for (const pattern of CRITICAL_SECURITY_PATTERNS) {
    const hasPattern = template.rules.deny.some(rule => pattern.pattern.test(rule));
    
    if (!hasPattern) {
      const severity = pattern.severity === 'critical' ? 'error' : 'warning';
      const target = severity === 'error' ? errors : warnings;
      
      target.push({
        type: 'security',
        severity: pattern.severity,
        message: `Missing security rule: ${pattern.message}`,
        location: { path: 'rules.deny' },
        suggestion: `Add rule to deny: ${pattern.pattern.source}`
      });
    }
  }
  
  // Check for overly broad deny rules
  const broadPatterns = template.rules.deny.filter(rule => 
    rule === '*' || 
    rule === '.*' || 
    rule.length < 3
  );
  
  if (broadPatterns.length > 0) {
    warnings.push({
      type: 'security',
      severity: 'warning',
      message: `Overly broad deny rules detected: ${broadPatterns.join(', ')}`,
      location: { path: 'rules.deny' },
      suggestion: 'Use more specific patterns to avoid blocking legitimate code'
    });
  }
  
  logger.debug(`Validated ${template.rules.deny.length} deny rules`);
}

/**
 * Validate allow rules for security implications
 */
async function validateAllowRules(template, errors, warnings, config, logger) {
  if (!template.rules.allow || template.rules.allow.length === 0) {
    // Allow rules are optional, but log for completeness
    logger.debug('No allow rules defined in template');
    return;
  }
  
  // Check for dangerous patterns in allow rules
  for (const rule of template.rules.allow) {
    for (const pattern of CRITICAL_SECURITY_PATTERNS) {
      if (pattern.pattern.test(rule)) {
        errors.push({
          type: 'security',
          severity: 'critical',
          message: `Dangerous pattern allowed: ${pattern.message}`,
          location: { path: 'rules.allow' },
          details: { rule, pattern: pattern.pattern.source }
        });
      }
    }
    
    // Check for overly permissive allow rules
    if (rule === '*' || rule === '.*') {
      errors.push({
        type: 'security',
        severity: 'critical',
        message: 'Wildcard allow rules defeat the purpose of security rules',
        location: { path: 'rules.allow' },
        details: { rule }
      });
    }
  }
  
  logger.debug(`Validated ${template.rules.allow.length} allow rules`);
}

/**
 * Check for required security patterns
 */
async function checkRequiredPatterns(template, warnings, suggestions, config, logger) {
  const templateTags = template.tags || [];
  const allRules = [
    ...(template.rules.deny || []),
    ...(template.rules.allow || [])
  ].join(' ');
  
  for (const required of REQUIRED_SECURITY_PATTERNS) {
    // Check if pattern applies to this template
    if (required.category && !templateTags.includes(required.category)) {
      continue;
    }
    
    const hasPattern = required.pattern.test(allRules);
    if (!hasPattern) {
      suggestions.push({
        type: 'best_practice',
        message: required.message,
        pattern: required.pattern.source,
        category: required.category
      });
    }
  }
  
  logger.debug('Checked required security patterns');
}

/**
 * Check for deprecated security patterns
 */
async function checkDeprecatedPatterns(template, warnings, config, logger) {
  const allRules = [
    ...(template.rules.deny || []),
    ...(template.rules.allow || [])
  ];
  
  for (const rule of allRules) {
    for (const deprecated of DEPRECATED_PATTERNS) {
      if (deprecated.pattern.test(rule)) {
        warnings.push({
          type: 'deprecated',
          severity: deprecated.severity,
          message: deprecated.message,
          location: { path: 'rules' },
          suggestion: deprecated.suggestion,
          details: { rule }
        });
      }
    }
  }
  
  logger.debug('Checked deprecated patterns');
}

/**
 * Validate custom patterns from configuration
 */
async function validateCustomPatterns(template, errors, warnings, customPatterns, logger) {
  const allRules = [
    ...(template.rules.deny || []),
    ...(template.rules.allow || [])
  ].join(' ');
  
  for (const custom of customPatterns) {
    try {
      const pattern = new RegExp(custom.pattern, 'i');
      const hasPattern = pattern.test(allRules);
      
      if (hasPattern) {
        const target = custom.severity === 'error' || custom.severity === 'critical' 
          ? errors 
          : warnings;
          
        target.push({
          type: 'custom',
          severity: custom.severity,
          message: custom.message,
          location: { path: 'rules' },
          pattern: custom.pattern
        });
      }
    } catch (error) {
      logger.warn(`Invalid custom pattern: ${custom.pattern}`, error);
    }
  }
  
  logger.debug(`Validated ${customPatterns.length} custom patterns`);
}

/**
 * Validate environment-specific security requirements
 */
async function validateEnvironmentSpecific(template, buildContext, errors, warnings, logger) {
  const environment = buildContext.environment || 'development';
  
  if (environment === 'production') {
    // Production-specific validations
    const productionRules = [
      'console.log(',
      'console.debug(',
      'debugger',
      'alert('
    ];
    
    for (const rule of productionRules) {
      const isAllowed = template.rules.allow?.includes(rule);
      const isDenied = template.rules.deny?.includes(rule);
      
      if (isAllowed && !isDenied) {
        warnings.push({
          type: 'environment',
          severity: 'warning',
          message: `${rule} should not be allowed in production environment`,
          location: { path: 'rules.allow' },
          suggestion: `Move ${rule} to deny rules for production`
        });
      }
    }
  }
  
  logger.debug(`Validated environment-specific rules for ${environment}`);
}

/**
 * Validate compliance requirements
 */
async function validateCompliance(template, errors, warnings, suggestions, logger) {
  const compliance = template.compliance || [];
  
  for (const framework of compliance) {
    switch (framework) {
      case 'OWASP_TOP10':
        await validateOWASPCompliance(template, errors, warnings, logger);
        break;
      case 'SOC2':
        await validateSOC2Compliance(template, warnings, suggestions, logger);
        break;
      case 'PCI_DSS':
        await validatePCICompliance(template, errors, warnings, logger);
        break;
      case 'HIPAA':
        await validateHIPAACompliance(template, errors, warnings, logger);
        break;
    }
  }
  
  logger.debug(`Validated compliance for ${compliance.length} frameworks`);
}

/**
 * Validate OWASP Top 10 compliance
 */
async function validateOWASPCompliance(template, errors, warnings, logger) {
  const owaspPatterns = [
    { pattern: /injection/i, message: 'Should have injection protection' },
    { pattern: /authentication/i, message: 'Should have authentication controls' },
    { pattern: /xss|cross.site/i, message: 'Should have XSS protection' }
  ];
  
  const allRules = [
    ...(template.rules.deny || []),
    ...(template.rules.allow || [])
  ].join(' ');
  
  for (const check of owaspPatterns) {
    if (!check.pattern.test(allRules)) {
      warnings.push({
        type: 'compliance',
        severity: 'warning',
        message: `OWASP compliance: ${check.message}`,
        framework: 'OWASP_TOP10'
      });
    }
  }
}

/**
 * Validate SOC2 compliance
 */
async function validateSOC2Compliance(template, warnings, suggestions, logger) {
  // SOC2 focuses on security, availability, processing integrity, confidentiality, privacy
  const hasLogging = template.rules.allow?.some(rule => rule.includes('log'));
  const hasSecurityHeaders = template.rules.allow?.some(rule => rule.includes('helmet'));
  
  if (!hasLogging) {
    suggestions.push({
      type: 'compliance',
      message: 'SOC2: Consider enabling audit logging',
      framework: 'SOC2'
    });
  }
  
  if (!hasSecurityHeaders) {
    suggestions.push({
      type: 'compliance',
      message: 'SOC2: Consider using security headers (helmet)',
      framework: 'SOC2'
    });
  }
}

/**
 * Validate PCI DSS compliance
 */
async function validatePCICompliance(template, errors, warnings, logger) {
  // PCI DSS has strict requirements for payment card data
  const sensitivePatterns = [
    'credit.card',
    'card.number',
    'cvv',
    'expiry'
  ];
  
  const allRules = [
    ...(template.rules.deny || []),
    ...(template.rules.allow || [])
  ].join(' ');
  
  for (const pattern of sensitivePatterns) {
    const regex = new RegExp(pattern, 'i');
    const isAllowed = template.rules.allow?.some(rule => regex.test(rule));
    
    if (isAllowed) {
      errors.push({
        type: 'compliance',
        severity: 'critical',
        message: `PCI DSS: Sensitive payment data should not be allowed: ${pattern}`,
        framework: 'PCI_DSS'
      });
    }
  }
}

/**
 * Validate HIPAA compliance
 */
async function validateHIPAACompliance(template, errors, warnings, logger) {
  // HIPAA requires protection of health information
  const phiPatterns = [
    'ssn',
    'social.security',
    'medical.record',
    'health.record',
    'patient.data'
  ];
  
  const allRules = [
    ...(template.rules.deny || []),
    ...(template.rules.allow || [])
  ].join(' ');
  
  for (const pattern of phiPatterns) {
    const regex = new RegExp(pattern, 'i');
    const isAllowed = template.rules.allow?.some(rule => regex.test(rule));
    
    if (isAllowed) {
      errors.push({
        type: 'compliance',
        severity: 'critical',
        message: `HIPAA: Protected health information should not be allowed: ${pattern}`,
        framework: 'HIPAA'
      });
    }
  }
}

// Export the main function for the plugin system
module.exports = { main };