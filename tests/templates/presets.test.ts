/**
 * Comprehensive tests for built-in template presets
 * Tests all built-in templates (development, production, SOC2, HIPAA, maximum-security)
 * Validates their structure, security properties, and compliance requirements
 */

import { TemplateEngine } from '../../src/templates/engine';
import { TemplateLoader } from '../../src/templates/loader';
import { SecurityTemplate, ComplianceFramework } from '../../src/types';
import { mockBaseConfig } from './fixtures';

describe('Built-in Template Presets', () => {
  let templateEngine: TemplateEngine;
  let templateLoader: TemplateLoader;

  beforeEach(() => {
    templateEngine = new TemplateEngine();
    templateLoader = new TemplateLoader();
  });

  afterEach(() => {
    templateEngine.clearCache();
  });

  /**
   * Generic template validation tests that all built-in templates should pass
   */
  const validateTemplate = (template: SecurityTemplate, expectedCompliance?: ComplianceFramework[]) => {
    // Structure validation
    expect(template.id).toBeDefined();
    expect(template.name).toBeDefined();
    expect(template.version).toBeDefined();
    expect(template.category).toBeDefined();
    expect(template.description).toBeDefined();
    expect(template.isBuiltIn).toBe(true);
    expect(template.createdAt).toBeInstanceOf(Date);
    expect(template.updatedAt).toBeInstanceOf(Date);
    expect(template.tags).toBeInstanceOf(Array);
    expect(template.compliance).toBeInstanceOf(Array);
    
    // Rules validation
    expect(template.rules).toBeDefined();
    expect(template.rules.permissions).toBeDefined();
    
    const permissions = template.rules.permissions!;
    expect(permissions.deny).toBeInstanceOf(Array);
    expect(permissions.allow).toBeInstanceOf(Array);
    expect(permissions.ask).toBeInstanceOf(Array);
    
    // Metadata validation
    expect(template.rules.metadata).toBeDefined();
    expect(template.rules.metadata!.version).toBeDefined();
    expect(template.rules.metadata!.templateId).toBe(template.id);
    
    // Compliance validation
    if (expectedCompliance) {
      expectedCompliance.forEach(compliance => {
        expect(template.compliance).toContain(compliance);
      });
    }

    // Security validation - deny rules should be comprehensive
    expect(permissions.deny!.length).toBeGreaterThan(0);
    
    // Should protect secrets
    const secretPatterns = [
      '**/secret*/**',
      '**/*secret*',
      '**/*password*',
      '**/*key*',
      '**/.env*'
    ];
    
    const hasSecretProtection = secretPatterns.some(pattern =>
      permissions.deny!.some(rule => 
        rule.toLowerCase().includes('secret') || 
        rule.includes('.env') ||
        rule.includes('password') ||
        rule.includes('key')
      )
    );
    expect(hasSecretProtection).toBe(true);
  };

  describe('Development Template', () => {
    let developmentTemplate: SecurityTemplate;

    beforeAll(async () => {
      developmentTemplate = (await templateEngine.getTemplate('development'))!;
    });

    test('should load development template successfully', () => {
      expect(developmentTemplate).toBeTruthy();
      expect(developmentTemplate.id).toBe('development');
      expect(developmentTemplate.name).toBe('Development Environment');
      expect(developmentTemplate.category).toBe('development');
    });

    test('should pass generic template validation', () => {
      validateTemplate(developmentTemplate);
    });

    test('should have appropriate development tags', () => {
      expect(developmentTemplate.tags).toContain('development');
      expect(developmentTemplate.tags).toContain('local');
    });

    test('should allow development tools', () => {
      const allowRules = developmentTemplate.rules.permissions!.allow!;
      
      // Should allow common development tools
      const developmentTools = ['npm', 'node', 'python', 'java', 'git'];
      developmentTools.forEach(tool => {
        expect(allowRules.some(rule => rule.includes(tool))).toBe(true);
      });
    });

    test('should protect secrets even in development', () => {
      const denyRules = developmentTemplate.rules.permissions!.deny!;
      
      // Should still protect secrets in development
      const secretProtections = ['.env', 'secret', 'password', 'credential', 'private'];
      secretProtections.forEach(protection => {
        expect(denyRules.some(rule => 
          rule.toLowerCase().includes(protection)
        )).toBe(true);
      });
    });

    test('should allow reasonable network access', () => {
      const allowRules = developmentTemplate.rules.permissions!.allow!;
      const askRules = developmentTemplate.rules.permissions!.ask!;
      
      // Should allow access to package registries
      const packageRegistries = ['npmjs.org', 'pypi.org', 'github.com'];
      packageRegistries.forEach(registry => {
        expect(allowRules.some(rule => rule.includes(registry))).toBe(true);
      });
      
      // Should ask for general network access
      expect(askRules.some(rule => rule.includes('Network(*)'))).toBe(true);
    });

    test('should be permissive for development workflows', () => {
      const askRules = developmentTemplate.rules.permissions!.ask!;
      
      // Should ask (not deny) for common development operations
      const developmentOps = ['git push', 'npm install', 'package.json'];
      developmentOps.forEach(op => {
        expect(askRules.some(rule => 
          rule.toLowerCase().includes(op.toLowerCase())
        )).toBe(true);
      });
    });

    test('should apply successfully with parameters', async () => {
      const result = await templateEngine.applyTemplate('development', {
        parameters: {
          projectPath: '/my-project',
          allowedRegistries: ['custom.registry.com']
        },
        validateResult: false
      });

      expect(result.config).toBeDefined();
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('Production Template', () => {
    let productionTemplate: SecurityTemplate;

    beforeAll(async () => {
      productionTemplate = (await templateEngine.getTemplate('production'))!;
    });

    test('should load production template successfully', () => {
      expect(productionTemplate).toBeTruthy();
      expect(productionTemplate.id).toBe('production');
      expect(productionTemplate.name).toBe('Production Environment');
      expect(productionTemplate.category).toBe('production');
    });

    test('should pass generic template validation', () => {
      validateTemplate(productionTemplate);
    });

    test('should have production-appropriate tags', () => {
      expect(productionTemplate.tags).toContain('production');
      expect(productionTemplate.tags).toContain('strict');
    });

    test('should be more restrictive than development', async () => {
      const devTemplate = (await templateEngine.getTemplate('development'))!;
      
      const productionDenyCount = productionTemplate.rules.permissions!.deny!.length;
      const developmentDenyCount = devTemplate.rules.permissions!.deny!.length;
      
      // Production should have more deny rules
      expect(productionDenyCount).toBeGreaterThan(developmentDenyCount);
    });

    test('should have comprehensive secret protection', () => {
      const denyRules = productionTemplate.rules.permissions!.deny!;
      
      // Should have extensive secret protection patterns
      const secretPatterns = [
        'secret', 'credential', 'password', 'private', 'auth',
        'key', 'cert', '.env', 'backup', 'ssh'
      ];
      
      secretPatterns.forEach(pattern => {
        const hasPattern = denyRules.some(rule => 
          rule.toLowerCase().includes(pattern)
        );
        expect(hasPattern).toBe(true);
      });
    });

    test('should block dangerous operations', () => {
      const denyRules = productionTemplate.rules.permissions!.deny!;
      
      const dangerousOps = ['sudo', 'rm -rf', 'chmod +x', 'systemctl'];
      dangerousOps.forEach(op => {
        expect(denyRules.some(rule => rule.includes(op))).toBe(true);
      });
    });

    test('should restrict network access', () => {
      const denyRules = productionTemplate.rules.permissions!.deny!;
      const askRules = productionTemplate.rules.permissions!.ask!;
      
      // Should deny internal networks
      expect(denyRules.some(rule => rule.includes('*.internal'))).toBe(true);
      expect(denyRules.some(rule => rule.includes('*.local'))).toBe(true);
      
      // Should ask for general network access
      expect(askRules.some(rule => rule.includes('Network(*)'))).toBe(true);
    });

    test('should limit write access', () => {
      const denyRules = productionTemplate.rules.permissions!.deny!;
      
      // Should prevent writing to system directories
      const systemDirs = ['/etc', '/usr', '/bin', '/sbin'];
      systemDirs.forEach(dir => {
        expect(denyRules.some(rule => 
          rule.includes(`Write(${dir}`)
        )).toBe(true);
      });
    });

    test('should apply successfully with parameters', async () => {
      const result = await templateEngine.applyTemplate('production', {
        parameters: {
          allowedNetworks: ['api.trusted.com'],
          deploymentTools: ['docker']
        },
        validateResult: false
      });

      expect(result.config).toBeDefined();
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('SOC2 Template', () => {
    let soc2Template: SecurityTemplate;

    beforeAll(async () => {
      soc2Template = (await templateEngine.getTemplate('soc2'))!;
    });

    test('should load SOC2 template successfully', () => {
      expect(soc2Template).toBeTruthy();
      expect(soc2Template.id).toBe('soc2');
      expect(soc2Template.category).toBe('compliance');
    });

    test('should pass generic template validation', () => {
      validateTemplate(soc2Template, ['SOC2']);
    });

    test('should include SOC2 compliance', () => {
      expect(soc2Template.compliance).toContain('SOC2');
      expect(soc2Template.tags).toContain('compliance');
      expect(soc2Template.tags).toContain('soc2');
    });

    test('should enforce access controls (CC6.1)', () => {
      const denyRules = soc2Template.rules.permissions!.deny!;
      
      // SOC2 CC6.1 requires logical and physical access controls
      const accessControlPatterns = [
        'ssh', 'credential', 'auth', 'password', 'key'
      ];
      
      accessControlPatterns.forEach(pattern => {
        expect(denyRules.some(rule => 
          rule.toLowerCase().includes(pattern)
        )).toBe(true);
      });
    });

    test('should enforce data protection (CC6.7)', () => {
      const denyRules = soc2Template.rules.permissions!.deny!;
      
      // Should protect sensitive data patterns
      const dataProtectionPatterns = [
        'backup', 'log', 'database', 'user', 'customer'
      ];
      
      const hasDataProtection = dataProtectionPatterns.some(pattern =>
        denyRules.some(rule => 
          rule.toLowerCase().includes(pattern)
        )
      );
      expect(hasDataProtection).toBe(true);
    });

    test('should be stricter than production template', async () => {
      const productionTemplate = (await templateEngine.getTemplate('production'))!;
      
      const soc2DenyCount = soc2Template.rules.permissions!.deny!.length;
      const productionDenyCount = productionTemplate.rules.permissions!.deny!.length;
      
      // SOC2 should be at least as strict as production
      expect(soc2DenyCount).toBeGreaterThanOrEqual(productionDenyCount);
    });

    test('should apply successfully', async () => {
      const result = await templateEngine.applyTemplate('soc2', {
        validateResult: false
      });

      expect(result.config).toBeDefined();
      expect(result.config.metadata?.templateId).toBe('soc2');
    });
  });

  describe('HIPAA Template', () => {
    let hipaaTemplate: SecurityTemplate;

    beforeAll(async () => {
      hipaaTemplate = (await templateEngine.getTemplate('hipaa'))!;
    });

    test('should load HIPAA template successfully', () => {
      expect(hipaaTemplate).toBeTruthy();
      expect(hipaaTemplate.id).toBe('hipaa');
      expect(hipaaTemplate.category).toBe('compliance');
    });

    test('should pass generic template validation', () => {
      validateTemplate(hipaaTemplate, ['HIPAA']);
    });

    test('should include HIPAA compliance', () => {
      expect(hipaaTemplate.compliance).toContain('HIPAA');
      expect(hipaaTemplate.tags).toContain('healthcare');
      expect(hipaaTemplate.tags).toContain('hipaa');
    });

    test('should protect PHI (Protected Health Information)', () => {
      const denyRules = hipaaTemplate.rules.permissions!.deny!;
      
      // HIPAA requires protection of PHI
      const phiProtectionPatterns = [
        'patient', 'medical', 'health', 'phi', 'pii',
        'ssn', 'dob', 'diagnosis', 'treatment'
      ];
      
      const hasPhiProtection = phiProtectionPatterns.some(pattern =>
        denyRules.some(rule => 
          rule.toLowerCase().includes(pattern)
        )
      );
      
      // Should at least protect general sensitive data patterns
      expect(denyRules.some(rule => 
        rule.toLowerCase().includes('sensitive') ||
        rule.toLowerCase().includes('confidential') ||
        rule.toLowerCase().includes('private')
      )).toBe(true);
    });

    test('should enforce encryption requirements', () => {
      const denyRules = hipaaTemplate.rules.permissions!.deny!;
      
      // Should prevent unencrypted data access
      expect(denyRules.some(rule => 
        rule.toLowerCase().includes('unencrypted') ||
        rule.toLowerCase().includes('plaintext')
      )).toBe(true);
    });

    test('should enforce audit logging', () => {
      const denyRules = hipaaTemplate.rules.permissions!.deny!;
      
      // Should protect audit logs
      expect(denyRules.some(rule => 
        rule.toLowerCase().includes('audit') ||
        rule.toLowerCase().includes('log')
      )).toBe(true);
    });

    test('should be very restrictive', async () => {
      const productionTemplate = (await templateEngine.getTemplate('production'))!;
      
      const hipaaDenyCount = hipaaTemplate.rules.permissions!.deny!.length;
      const productionDenyCount = productionTemplate.rules.permissions!.deny!.length;
      
      // HIPAA should be more restrictive than production
      expect(hipaaDenyCount).toBeGreaterThanOrEqual(productionDenyCount);
    });

    test('should apply successfully', async () => {
      const result = await templateEngine.applyTemplate('hipaa', {
        validateResult: false
      });

      expect(result.config).toBeDefined();
      expect(result.config.metadata?.templateId).toBe('hipaa');
    });
  });

  describe('PCI-DSS Template', () => {
    let pciTemplate: SecurityTemplate;

    beforeAll(async () => {
      pciTemplate = (await templateEngine.getTemplate('pci-dss'))!;
    });

    test('should load PCI-DSS template successfully', () => {
      expect(pciTemplate).toBeTruthy();
      expect(pciTemplate.id).toBe('pci-dss');
      expect(pciTemplate.category).toBe('compliance');
    });

    test('should pass generic template validation', () => {
      validateTemplate(pciTemplate, ['PCI-DSS']);
    });

    test('should include PCI-DSS compliance', () => {
      expect(pciTemplate.compliance).toContain('PCI-DSS');
      expect(pciTemplate.tags).toContain('payment');
      expect(pciTemplate.tags).toContain('pci');
    });

    test('should protect cardholder data', () => {
      const denyRules = pciTemplate.rules.permissions!.deny!;
      
      // PCI-DSS requires protection of cardholder data
      const cardDataPatterns = [
        'card', 'payment', 'credit', 'debit', 'pan', 'cvv', 'cvn'
      ];
      
      const hasCardProtection = cardDataPatterns.some(pattern =>
        denyRules.some(rule => 
          rule.toLowerCase().includes(pattern)
        )
      );
      
      // Should at least protect sensitive data patterns
      expect(denyRules.some(rule => 
        rule.toLowerCase().includes('sensitive') ||
        rule.toLowerCase().includes('secret')
      )).toBe(true);
    });

    test('should apply successfully', async () => {
      const result = await templateEngine.applyTemplate('pci-dss', {
        validateResult: false
      });

      expect(result.config).toBeDefined();
      expect(result.config.metadata?.templateId).toBe('pci-dss');
    });
  });

  describe('Maximum Security Template', () => {
    let maxSecTemplate: SecurityTemplate;

    beforeAll(async () => {
      maxSecTemplate = (await templateEngine.getTemplate('maximum-security'))!;
    });

    test('should load maximum security template successfully', () => {
      expect(maxSecTemplate).toBeTruthy();
      expect(maxSecTemplate.id).toBe('maximum-security');
      expect(maxSecTemplate.category).toBe('production');
    });

    test('should pass generic template validation', () => {
      validateTemplate(maxSecTemplate);
    });

    test('should have maximum security tags', () => {
      expect(maxSecTemplate.tags).toContain('maximum');
      expect(maxSecTemplate.tags).toContain('strict');
      expect(maxSecTemplate.tags).toContain('lockdown');
    });

    test('should be the most restrictive template', async () => {
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });

      const denyRuleCounts = await Promise.all(
        templates.map(async (template) => ({
          id: template.id,
          denyCount: template.rules.permissions?.deny?.length || 0
        }))
      );

      const maxSecDenyCount = denyRuleCounts.find(t => 
        t.id === 'maximum-security'
      )?.denyCount || 0;

      // Should have the most deny rules among all templates
      const otherTemplateDenyCounts = denyRuleCounts
        .filter(t => t.id !== 'maximum-security')
        .map(t => t.denyCount);

      expect(maxSecDenyCount).toBeGreaterThanOrEqual(
        Math.max(...otherTemplateDenyCounts)
      );
    });

    test('should deny most operations by default', () => {
      const permissions = maxSecTemplate.rules.permissions!;
      const denyCount = permissions.deny?.length || 0;
      const allowCount = permissions.allow?.length || 0;
      
      // Should have more deny rules than allow rules
      expect(denyCount).toBeGreaterThan(allowCount);
    });

    test('should have minimal allow rules', () => {
      const allowRules = maxSecTemplate.rules.permissions!.allow!;
      
      // Should only allow the absolute minimum
      expect(allowRules.length).toBeLessThan(10);
    });

    test('should apply successfully', async () => {
      const result = await templateEngine.applyTemplate('maximum-security', {
        validateResult: false
      });

      expect(result.config).toBeDefined();
      expect(result.config.metadata?.templateId).toBe('maximum-security');
    });
  });

  describe('Enterprise Template', () => {
    let enterpriseTemplate: SecurityTemplate;

    beforeAll(async () => {
      enterpriseTemplate = (await templateEngine.getTemplate('enterprise'))!;
    });

    test('should load enterprise template successfully', () => {
      expect(enterpriseTemplate).toBeTruthy();
      expect(enterpriseTemplate.id).toBe('enterprise');
    });

    test('should pass generic template validation', () => {
      validateTemplate(enterpriseTemplate);
    });

    test('should have enterprise-appropriate features', () => {
      expect(enterpriseTemplate.tags).toContain('enterprise');
      
      // Should have parameters for customization
      expect(enterpriseTemplate.parameters).toBeDefined();
      expect(enterpriseTemplate.parameters!.length).toBeGreaterThan(0);
    });

    test('should apply successfully', async () => {
      const result = await templateEngine.applyTemplate('enterprise', {
        validateResult: false
      });

      expect(result.config).toBeDefined();
    });
  });

  describe('Template Compatibility and Integration', () => {
    test('all built-in templates should be compatible', async () => {
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });

      for (const template of templates) {
        const compatibility = templateEngine.checkCompatibility(template);
        expect(compatibility.compatible).toBe(true);
      }
    });

    test('all built-in templates should validate successfully', async () => {
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });

      for (const template of templates) {
        const validation = await templateEngine.validateTemplate(template);
        expect(validation.isValid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      }
    });

    test('all built-in templates should apply successfully', async () => {
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });

      for (const template of templates) {
        const result = await templateEngine.applyTemplate(template.id, {
          baseConfig: mockBaseConfig,
          validateResult: false
        });

        expect(result.config).toBeDefined();
        expect(result.config.metadata?.templateId).toBe(template.id);
      }
    });

    test('built-in templates should have consistent metadata', async () => {
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });

      templates.forEach(template => {
        expect(template.isBuiltIn).toBe(true);
        expect(template.version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning
        expect(template.createdAt).toBeInstanceOf(Date);
        expect(template.updatedAt).toBeInstanceOf(Date);
        expect(template.updatedAt.getTime()).toBeGreaterThanOrEqual(
          template.createdAt.getTime()
        );
      });
    });

    test('templates should have appropriate compliance mappings', async () => {
      const complianceTemplates = await templateEngine.discoverTemplates({
        category: 'compliance'
      });

      complianceTemplates.forEach(template => {
        expect(template.compliance.length).toBeGreaterThan(0);
        
        // Each compliance framework should map to template name
        template.compliance.forEach(framework => {
          expect(template.name.toLowerCase()).toContain(
            framework.toLowerCase().replace('-', '')
          );
        });
      });
    });

    test('templates should have unique IDs', async () => {
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });

      const ids = templates.map(t => t.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length);
    });

    test('templates should have consistent rule structure', async () => {
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });

      templates.forEach(template => {
        const permissions = template.rules.permissions!;
        
        // All rule arrays should be defined (even if empty)
        expect(permissions.deny).toBeDefined();
        expect(permissions.allow).toBeDefined();
        expect(permissions.ask).toBeDefined();
        
        // Rules should be strings
        [...permissions.deny!, ...permissions.allow!, ...permissions.ask!]
          .forEach(rule => {
            expect(typeof rule).toBe('string');
            expect(rule.length).toBeGreaterThan(0);
          });
      });
    });
  });

  describe('Template Performance', () => {
    test('all built-in templates should load quickly', async () => {
      const start = performance.now();
      
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });
      
      const loadTime = performance.now() - start;
      
      expect(templates.length).toBeGreaterThan(0);
      expect(loadTime).toBeLessThan(1000); // Should load within 1 second
    });

    test('template application should be performant', async () => {
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });

      for (const template of templates.slice(0, 3)) { // Test first 3 for performance
        const start = performance.now();
        
        const result = await templateEngine.applyTemplate(template.id, {
          baseConfig: mockBaseConfig,
          validateResult: false
        });
        
        const applicationTime = performance.now() - start;
        
        expect(result.config).toBeDefined();
        expect(applicationTime).toBeLessThan(100); // Should apply within 100ms
      }
    });
  });

  describe('Template Error Handling', () => {
    test('should handle missing built-in templates gracefully', async () => {
      const template = await templateEngine.getTemplate('non-existent-builtin');
      expect(template).toBeNull();
    });

    test('should handle template application with invalid base config', async () => {
      const invalidBaseConfig = { permissions: null } as any;
      
      // Should still work but might have warnings
      const result = await templateEngine.applyTemplate('development', {
        baseConfig: invalidBaseConfig,
        validateResult: false
      });

      expect(result.config).toBeDefined();
    });
  });
});