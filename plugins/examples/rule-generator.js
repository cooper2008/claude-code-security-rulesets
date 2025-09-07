/**
 * Smart Rule Generator Plugin
 * 
 * This plugin intelligently generates security rules based on project context,
 * framework analysis, environment requirements, and compliance needs.
 * 
 * @author Claude Code AI Team
 * @version 1.0.0
 */

/**
 * Framework-specific rule patterns
 */
const FRAMEWORK_RULES = {
  react: {
    deny: [
      'dangerouslySetInnerHTML',
      'innerHTML =',
      'React.createElement(\'script\'',
      'React.createElement("script"',
      'target="_blank"',
      'href="javascript:',
      'on[a-zA-Z]+\\s*=',
      'style\\s*=.*expression',
      'style\\s*=.*javascript:'
    ],
    allow: [
      'React.',
      'ReactDOM.',
      'useState',
      'useEffect',
      'useContext',
      'useReducer',
      'useCallback',
      'useMemo',
      'createElement',
      'Component',
      'Fragment'
    ]
  },
  vue: {
    deny: [
      'v-html',
      'innerHTML =',
      'eval(',
      'Function(',
      'script.*src.*javascript:',
      'on[a-zA-Z]+\\s*='
    ],
    allow: [
      'Vue.',
      'this.$',
      'v-if',
      'v-for',
      'v-model',
      'v-show',
      'v-bind',
      'v-on',
      '@click',
      '@submit'
    ]
  },
  angular: {
    deny: [
      'innerHTML =',
      'bypassSecurityTrust',
      'eval(',
      'Function(',
      'document.write'
    ],
    allow: [
      '@Component',
      '@Injectable',
      '@Input',
      '@Output',
      'ngOnInit',
      'ngOnDestroy',
      'Observable',
      'Subject',
      'HttpClient'
    ]
  },
  nodejs: {
    deny: [
      'child_process.exec',
      'child_process.spawn',
      'eval(',
      'Function(',
      'vm.runInThisContext',
      'process.env.PASSWORD',
      'process.env.SECRET',
      'process.env.PRIVATE_KEY'
    ],
    allow: [
      'process.env.NODE_ENV',
      'process.env.PORT',
      'express.',
      'app.get',
      'app.post',
      'req.params',
      'res.json',
      'next(',
      'bcrypt.',
      'jwt.',
      'helmet('
    ]
  },
  python: {
    deny: [
      'exec(',
      'eval(',
      'compile(',
      '__import__',
      'subprocess.call',
      'os.system',
      'pickle.loads'
    ],
    allow: [
      'flask.',
      'django.',
      'request.',
      'response.',
      'json.loads',
      'json.dumps',
      'hashlib.',
      'secrets.'
    ]
  }
};

/**
 * Environment-specific rules
 */
const ENVIRONMENT_RULES = {
  development: {
    deny: [],
    allow: [
      'console.log(',
      'console.debug(',
      'console.warn(',
      'debugger',
      'alert(',
      'process.env.DEBUG'
    ]
  },
  staging: {
    deny: [
      'debugger',
      'alert(',
      'confirm('
    ],
    allow: [
      'console.log(',
      'console.warn(',
      'console.error('
    ]
  },
  production: {
    deny: [
      'console.log(',
      'console.debug(',
      'debugger',
      'alert(',
      'confirm(',
      'prompt(',
      'process.env.DEBUG'
    ],
    allow: [
      'console.error(',
      'console.warn('
    ]
  }
};

/**
 * Compliance framework rules
 */
const COMPLIANCE_RULES = {
  OWASP: {
    deny: [
      'sql.*DROP',
      'sql.*DELETE.*WHERE.*1=1',
      'eval(',
      'innerHTML =',
      'document.write(',
      'child_process.exec',
      'UNION.*SELECT',
      'OR.*1=1',
      'script.*src.*http:',
      'javascript:',
      'vbscript:',
      'data:text/html'
    ],
    allow: [
      'parameterized.*query',
      'prepared.*statement',
      'sanitize(',
      'escape(',
      'validate(',
      'csrf.*token',
      'helmet(',
      'cors('
    ]
  },
  SOC2: {
    deny: [
      'password.*log',
      'secret.*log',
      'token.*log',
      'api.key.*log'
    ],
    allow: [
      'audit.*log',
      'security.*log',
      'access.*log',
      'authentication.*log'
    ]
  },
  PCI_DSS: {
    deny: [
      'credit.card',
      'card.number',
      'cvv',
      'card.expiry',
      'pan',
      'primary.account.number',
      'cardholder.data'
    ],
    allow: [
      'tokenize(',
      'encrypt(',
      'decrypt(',
      'secure.hash'
    ]
  },
  HIPAA: {
    deny: [
      'ssn',
      'social.security',
      'medical.record',
      'patient.data',
      'health.record',
      'phi',
      'protected.health.information'
    ],
    allow: [
      'anonymize(',
      'de.identify(',
      'encrypt(',
      'audit.log'
    ]
  },
  GDPR: {
    deny: [
      'personal.data.*export',
      'user.data.*third.party',
      'tracking.*without.consent'
    ],
    allow: [
      'consent.management',
      'data.portability',
      'right.to.erasure',
      'privacy.by.design'
    ]
  }
};

/**
 * Risk-based rule sets
 */
const RISK_RULES = {
  low: {
    // Conservative approach - more rules
    additionalDeny: [
      'setTimeout.*string',
      'setInterval.*string',
      'document.domain',
      'window.name',
      'location.href.*javascript'
    ]
  },
  medium: {
    // Balanced approach
    additionalDeny: [
      'eval(',
      'innerHTML =',
      'document.write('
    ]
  },
  high: {
    // Liberal approach - fewer restrictive rules
    additionalDeny: [
      'eval('
    ]
  }
};

/**
 * Main plugin function
 * @param {Object} context - Plugin execution context
 * @returns {Promise<Object>} Generated rules
 */
async function main(context) {
  const startTime = Date.now();
  const { template, buildContext, apis } = context;
  const { logger, utils } = apis;
  
  logger.info(`Starting rule generation for template: ${template.id}`);
  
  try {
    // Get plugin configuration
    const config = context.config || {
      analysisDepth: 'comprehensive',
      includeFrameworkRules: true,
      includeEnvironmentRules: true,
      complianceFrameworks: [],
      customRulesets: [],
      riskTolerance: 'medium'
    };
    
    logger.debug('Using configuration:', config);
    
    const generatedRules = {
      deny: [],
      allow: []
    };
    
    // Analyze project context
    const projectAnalysis = await analyzeProjectContext(template, buildContext, config, logger);
    
    // Generate framework-specific rules
    if (config.includeFrameworkRules) {
      await generateFrameworkRules(projectAnalysis, generatedRules, config, logger);
    }
    
    // Generate environment-specific rules
    if (config.includeEnvironmentRules) {
      await generateEnvironmentRules(buildContext, generatedRules, config, logger);
    }
    
    // Generate compliance rules
    if (config.complianceFrameworks.length > 0) {
      await generateComplianceRules(config.complianceFrameworks, generatedRules, logger);
    }
    
    // Apply risk-based rules
    await applyRiskBasedRules(config.riskTolerance, generatedRules, logger);
    
    // Apply custom rulesets
    if (config.customRulesets.length > 0) {
      await applyCustomRulesets(config.customRulesets, projectAnalysis, generatedRules, logger);
    }
    
    // Optimize and deduplicate rules
    await optimizeRules(generatedRules, logger);
    
    const duration = Date.now() - startTime;
    
    logger.info(`Rule generation completed in ${duration}ms`);
    logger.info(`Generated ${generatedRules.deny.length} deny rules, ${generatedRules.allow.length} allow rules`);
    
    return {
      success: true,
      data: generatedRules,
      metadata: {
        generationInfo: {
          analysisDepth: config.analysisDepth,
          detectedFrameworks: projectAnalysis.frameworks,
          environment: buildContext.environment,
          complianceFrameworks: config.complianceFrameworks,
          riskTolerance: config.riskTolerance
        },
        performance: {
          duration,
          rulesGenerated: generatedRules.deny.length + generatedRules.allow.length
        }
      },
      metrics: {
        duration,
        memoryUsed: 0 // Will be filled by sandbox
      }
    };
    
  } catch (error) {
    logger.error('Rule generation failed:', error);
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
 * Analyze project context to determine frameworks, technologies, and patterns
 */
async function analyzeProjectContext(template, buildContext, config, logger) {
  const analysis = {
    frameworks: [],
    technologies: [],
    patterns: [],
    riskFactors: []
  };
  
  // Analyze template tags for framework hints
  if (template.tags) {
    for (const tag of template.tags) {
      const lowercaseTag = tag.toLowerCase();
      
      if (Object.keys(FRAMEWORK_RULES).includes(lowercaseTag)) {
        analysis.frameworks.push(lowercaseTag);
      }
      
      // Technology detection
      const techPatterns = {
        'frontend': ['react', 'vue', 'angular', 'javascript', 'typescript'],
        'backend': ['nodejs', 'python', 'java', 'csharp', 'php'],
        'database': ['mongodb', 'mysql', 'postgresql', 'redis'],
        'cloud': ['aws', 'azure', 'gcp', 'kubernetes'],
        'api': ['rest', 'graphql', 'grpc']
      };
      
      for (const [category, techs] of Object.entries(techPatterns)) {
        if (techs.includes(lowercaseTag)) {
          analysis.technologies.push({ category, technology: lowercaseTag });
        }
      }
    }
  }
  
  // Analyze existing rules for patterns
  const existingRules = [
    ...(template.rules.deny || []),
    ...(template.rules.allow || [])
  ].join(' ');
  
  // Detect framework patterns in existing rules
  for (const [framework, rules] of Object.entries(FRAMEWORK_RULES)) {
    const hasFrameworkPatterns = rules.allow.some(pattern => 
      existingRules.includes(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
    
    if (hasFrameworkPatterns && !analysis.frameworks.includes(framework)) {
      analysis.frameworks.push(framework);
    }
  }
  
  // Analyze build context for additional hints
  if (buildContext.parameters) {
    const params = buildContext.parameters;
    
    if (params.framework) {
      analysis.frameworks.push(params.framework);
    }
    
    if (params.technologies) {
      analysis.technologies.push(...params.technologies);
    }
  }
  
  // Risk factor analysis
  if (template.compliance && template.compliance.length > 0) {
    analysis.riskFactors.push('compliance-required');
  }
  
  if (buildContext.environment === 'production') {
    analysis.riskFactors.push('production-environment');
  }
  
  logger.debug('Project analysis completed:', analysis);
  return analysis;
}

/**
 * Generate framework-specific rules
 */
async function generateFrameworkRules(projectAnalysis, generatedRules, config, logger) {
  for (const framework of projectAnalysis.frameworks) {
    const frameworkRules = FRAMEWORK_RULES[framework];
    if (frameworkRules) {
      generatedRules.deny.push(...frameworkRules.deny);
      generatedRules.allow.push(...frameworkRules.allow);
      
      logger.debug(`Added ${frameworkRules.deny.length} deny and ${frameworkRules.allow.length} allow rules for ${framework}`);
    }
  }
  
  // Add cross-framework rules if multiple frameworks detected
  if (projectAnalysis.frameworks.length > 1) {
    // Common cross-framework security rules
    generatedRules.deny.push(
      'eval(',
      'Function(',
      'innerHTML =',
      'document.write('
    );
    
    logger.debug('Added cross-framework security rules');
  }
}

/**
 * Generate environment-specific rules
 */
async function generateEnvironmentRules(buildContext, generatedRules, config, logger) {
  const environment = buildContext.environment || 'development';
  const envRules = ENVIRONMENT_RULES[environment];
  
  if (envRules) {
    generatedRules.deny.push(...envRules.deny);
    generatedRules.allow.push(...envRules.allow);
    
    logger.debug(`Added ${envRules.deny.length} deny and ${envRules.allow.length} allow rules for ${environment}`);
  }
}

/**
 * Generate compliance framework rules
 */
async function generateComplianceRules(complianceFrameworks, generatedRules, logger) {
  for (const framework of complianceFrameworks) {
    const complianceRules = COMPLIANCE_RULES[framework];
    if (complianceRules) {
      generatedRules.deny.push(...complianceRules.deny);
      generatedRules.allow.push(...complianceRules.allow);
      
      logger.debug(`Added compliance rules for ${framework}`);
    }
  }
}

/**
 * Apply risk-based rules
 */
async function applyRiskBasedRules(riskTolerance, generatedRules, logger) {
  const riskRules = RISK_RULES[riskTolerance];
  if (riskRules && riskRules.additionalDeny) {
    generatedRules.deny.push(...riskRules.additionalDeny);
    
    logger.debug(`Applied ${riskRules.additionalDeny.length} risk-based rules for ${riskTolerance} tolerance`);
  }
}

/**
 * Apply custom rulesets based on conditions
 */
async function applyCustomRulesets(customRulesets, projectAnalysis, generatedRules, logger) {
  for (const ruleset of customRulesets) {
    if (!ruleset.conditions || ruleset.conditions.length === 0) {
      // Apply unconditionally
      generatedRules.deny.push(...(ruleset.rules || []));
      logger.debug(`Applied custom ruleset: ${ruleset.name}`);
      continue;
    }
    
    // Check conditions
    let shouldApply = true;
    for (const condition of ruleset.conditions) {
      if (!evaluateCondition(condition, projectAnalysis)) {
        shouldApply = false;
        break;
      }
    }
    
    if (shouldApply) {
      generatedRules.deny.push(...(ruleset.rules || []));
      logger.debug(`Applied conditional custom ruleset: ${ruleset.name}`);
    }
  }
}

/**
 * Evaluate condition for custom rulesets
 */
function evaluateCondition(condition, projectAnalysis) {
  // Simple condition evaluation
  // In practice, you'd want a more sophisticated condition evaluator
  
  if (condition.startsWith('framework:')) {
    const framework = condition.split(':')[1];
    return projectAnalysis.frameworks.includes(framework);
  }
  
  if (condition.startsWith('technology:')) {
    const tech = condition.split(':')[1];
    return projectAnalysis.technologies.some(t => 
      t.technology === tech || t.category === tech
    );
  }
  
  if (condition.startsWith('risk:')) {
    const risk = condition.split(':')[1];
    return projectAnalysis.riskFactors.includes(risk);
  }
  
  return false;
}

/**
 * Optimize and deduplicate rules
 */
async function optimizeRules(generatedRules, logger) {
  const originalDenyCount = generatedRules.deny.length;
  const originalAllowCount = generatedRules.allow.length;
  
  // Remove duplicates
  generatedRules.deny = [...new Set(generatedRules.deny)];
  generatedRules.allow = [...new Set(generatedRules.allow)];
  
  // Remove conflicting rules (where same pattern appears in both deny and allow)
  const conflicts = generatedRules.deny.filter(rule => 
    generatedRules.allow.includes(rule)
  );
  
  for (const conflict of conflicts) {
    // Remove from allow list (deny takes precedence)
    const index = generatedRules.allow.indexOf(conflict);
    if (index > -1) {
      generatedRules.allow.splice(index, 1);
    }
  }
  
  // Sort rules for consistency
  generatedRules.deny.sort();
  generatedRules.allow.sort();
  
  const finalDenyCount = generatedRules.deny.length;
  const finalAllowCount = generatedRules.allow.length;
  
  logger.debug(`Optimized rules: deny ${originalDenyCount} -> ${finalDenyCount}, allow ${originalAllowCount} -> ${finalAllowCount}`);
  
  if (conflicts.length > 0) {
    logger.debug(`Resolved ${conflicts.length} rule conflicts`);
  }
}

// Export the main function for the plugin system
module.exports = { main };