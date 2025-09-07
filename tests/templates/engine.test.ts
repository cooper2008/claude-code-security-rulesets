/**
 * Comprehensive tests for the Template Engine
 * Tests template loading, application, merging strategies, and validation
 */

import { TemplateEngine } from '../../src/templates/engine';
import { 
  mockBaseConfig,
  mockTemplate,
  mockParameterizedTemplate,
  mockInvalidTemplate,
  mockConflictingTemplate,
  mockLargeTemplate,
  mockTemplateParameters,
  testScenarios
} from './fixtures';

describe('TemplateEngine', () => {
  let templateEngine: TemplateEngine;

  beforeEach(() => {
    templateEngine = new TemplateEngine();
  });

  afterEach(() => {
    templateEngine.clearCache();
  });

  describe('Template Discovery and Loading', () => {
    test('should discover built-in templates', async () => {
      const templates = await templateEngine.discoverTemplates({
        includeBuiltIn: true,
        includeCustom: false
      });

      expect(templates).toHaveLength(7); // All built-in templates
      expect(templates.every(t => t.isBuiltIn)).toBe(true);
      expect(templates.map(t => t.id)).toEqual(
        expect.arrayContaining(['development', 'production', 'soc2', 'hipaa', 'maximum-security'])
      );
    });

    test('should filter templates by category', async () => {
      const productionTemplates = await templateEngine.discoverTemplates({
        category: 'production'
      });

      expect(productionTemplates.every(t => t.category === 'production')).toBe(true);
    });

    test('should filter templates by compliance', async () => {
      const hipaaTemplates = await templateEngine.discoverTemplates({
        compliance: ['HIPAA']
      });

      expect(hipaaTemplates.every(t => t.compliance.includes('HIPAA'))).toBe(true);
    });

    test('should filter templates by tags', async () => {
      const developmentTemplates = await templateEngine.discoverTemplates({
        tags: ['development']
      });

      expect(developmentTemplates.every(t => t.tags.includes('development'))).toBe(true);
    });

    test('should get specific template by ID', async () => {
      const template = await templateEngine.getTemplate('development');

      expect(template).toBeTruthy();
      expect(template!.id).toBe('development');
      expect(template!.name).toBe('Development Environment');
    });

    test('should return null for non-existent template', async () => {
      const template = await templateEngine.getTemplate('non-existent');

      expect(template).toBeNull();
    });

    test('should register custom template', async () => {
      await templateEngine.registerTemplate(mockTemplate);
      
      const retrieved = await templateEngine.getTemplate(mockTemplate.id);
      expect(retrieved).toEqual(mockTemplate);
    });

    test('should reject invalid template registration', async () => {
      await expect(
        templateEngine.registerTemplate(mockInvalidTemplate as any)
      ).rejects.toThrow('Cannot register invalid template');
    });

    test('should unregister custom template', async () => {
      await templateEngine.registerTemplate(mockTemplate);
      
      const unregistered = await templateEngine.unregisterTemplate(mockTemplate.id);
      expect(unregistered).toBe(true);
      
      const retrieved = await templateEngine.getTemplate(mockTemplate.id);
      expect(retrieved).toBeNull();
    });

    test('should update existing template', async () => {
      await templateEngine.registerTemplate(mockTemplate);
      
      const updates = {
        name: 'Updated Test Template',
        description: 'Updated description'
      };
      
      const updated = await templateEngine.updateTemplate(mockTemplate.id, updates);
      
      expect(updated.name).toBe(updates.name);
      expect(updated.description).toBe(updates.description);
      expect(updated.updatedAt.getTime()).toBeGreaterThan(mockTemplate.updatedAt.getTime());
    });
  });

  describe('Template Validation', () => {
    test('should validate valid template', async () => {
      const validation = await templateEngine.validateTemplate(mockTemplate);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should detect invalid template', async () => {
      const validation = await templateEngine.validateTemplate(mockInvalidTemplate as any);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test('should detect template conflicts', async () => {
      const validation = await templateEngine.validateTemplate(mockConflictingTemplate);

      // Template might be structurally valid but have rule conflicts
      expect(validation.conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('Template Compatibility', () => {
    test('should check template compatibility', () => {
      const compatibleTemplate = { ...mockTemplate, version: '1.0.0' };
      const compatibility = templateEngine.checkCompatibility(compatibleTemplate);

      expect(compatibility.compatible).toBe(true);
      expect(compatibility.templateVersion).toBe('1.0.0');
      expect(compatibility.systemVersion).toBe('1.0.0');
      expect(compatibility.issues).toHaveLength(0);
    });

    test('should detect version incompatibilities', () => {
      const incompatibleTemplate = { ...mockTemplate, version: '2.0.0' };
      const compatibility = templateEngine.checkCompatibility(incompatibleTemplate);

      expect(compatibility.compatible).toBe(false);
      expect(compatibility.issues.length).toBeGreaterThan(0);
      expect(compatibility.requiredUpgrades.length).toBeGreaterThan(0);
    });

    test('should warn about newer minor versions', () => {
      const newerTemplate = { ...mockTemplate, version: '1.1.0' };
      const compatibility = templateEngine.checkCompatibility(newerTemplate);

      expect(compatibility.compatible).toBe(true);
      expect(compatibility.issues.some(issue => 
        issue.includes('newer features')
      )).toBe(true);
    });

    test('should warn about required parameters', () => {
      const compatibility = templateEngine.checkCompatibility(mockParameterizedTemplate);

      expect(compatibility.issues.some(issue => 
        issue.includes('requires') && issue.includes('parameters')
      )).toBe(true);
    });
  });

  describe('Parameter Processing', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockParameterizedTemplate);
    });

    test('should apply template with valid parameters', async () => {
      const result = await templateEngine.applyTemplate(
        mockParameterizedTemplate.id,
        {
          parameters: mockTemplateParameters.valid,
          baseConfig: mockBaseConfig,
          validateResult: false
        }
      );

      expect(result.config).toBeDefined();
      expect(result.appliedParameters).toEqual(mockTemplateParameters.valid);
      expect(result.warnings).toHaveLength(0);
    });

    test('should reject invalid parameters', async () => {
      await expect(
        templateEngine.applyTemplate(mockParameterizedTemplate.id, {
          parameters: mockTemplateParameters.invalid
        })
      ).rejects.toThrow();
    });

    test('should reject missing required parameters', async () => {
      await expect(
        templateEngine.applyTemplate(mockParameterizedTemplate.id, {
          parameters: mockTemplateParameters.partial
        })
      ).rejects.toThrow('Required parameter missing: templateName');
    });

    test('should use default values for optional parameters', async () => {
      const result = await templateEngine.applyTemplate(
        mockParameterizedTemplate.id,
        {
          parameters: { 
            projectPath: '/test',
            templateName: 'Test Template'
          },
          validateResult: false
        }
      );

      expect(result.appliedParameters).toMatchObject({
        projectPath: '/test',
        templateName: 'Test Template',
        denyPath: '/restricted', // default value
        allowedCommand: 'node', // default value
        apiEndpoint: 'api.example.com' // default value
      });
    });

    test('should validate string parameters', async () => {
      await expect(
        templateEngine.applyTemplate(mockParameterizedTemplate.id, {
          parameters: {
            projectPath: '/test',
            templateName: '', // Violates minLength
          }
        })
      ).rejects.toThrow('too short');
    });

    test('should validate enum parameters', async () => {
      await expect(
        templateEngine.applyTemplate(mockParameterizedTemplate.id, {
          parameters: {
            projectPath: '/test',
            templateName: 'Test',
            allowedCommand: 'invalid-command' // Not in enum
          }
        })
      ).rejects.toThrow('must be one of');
    });

    test('should validate pattern parameters', async () => {
      await expect(
        templateEngine.applyTemplate(mockParameterizedTemplate.id, {
          parameters: {
            projectPath: '/test',
            templateName: 'Test',
            apiEndpoint: 'not-a-domain' // Doesn't match pattern
          }
        })
      ).rejects.toThrow("doesn't match pattern");
    });

    test('should substitute parameters in configuration', async () => {
      const result = await templateEngine.applyTemplate(
        mockParameterizedTemplate.id,
        {
          parameters: {
            projectPath: '/my-project',
            templateName: 'My Template',
            denyPath: '/my-restricted',
            allowedCommand: 'python'
          },
          validateResult: false
        }
      );

      const config = result.config;
      expect(config.permissions?.allow).toContain('Read(/my-project/**)');
      expect(config.permissions?.deny).toContain('/my-restricted/**');
      expect(config.permissions?.allow).toContain('Execute(python)');
      expect(config.metadata?.name).toBe('My Template');
    });
  });

  describe('Template Application and Merging', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockTemplate);
      await templateEngine.registerTemplate(mockConflictingTemplate);
    });

    test('should apply template without base configuration', async () => {
      const result = await templateEngine.applyTemplate(
        mockTemplate.id,
        { validateResult: false }
      );

      expect(result.config.permissions).toEqual(mockTemplate.rules.permissions);
      expect(result.mergeDetails.rulesAdded).toBeGreaterThan(0);
      expect(result.mergeDetails.rulesOverridden).toBe(0);
    });

    test('should merge template with base configuration', async () => {
      const result = await templateEngine.applyTemplate(
        mockTemplate.id,
        {
          baseConfig: mockBaseConfig,
          validateResult: false
        }
      );

      expect(result.config.permissions?.deny?.length).toBeGreaterThan(
        (mockBaseConfig.permissions?.deny?.length || 0)
      );
      expect(result.mergeDetails.rulesAdded).toBeGreaterThan(0);
    });

    test('should use override merge strategy', async () => {
      const result = await templateEngine.applyTemplate(
        mockTemplate.id,
        {
          baseConfig: mockBaseConfig,
          mergeStrategy: 'override',
          validateResult: false
        }
      );

      // With override, base config should be completely replaced
      expect(result.config.permissions).toEqual(mockTemplate.rules.permissions);
      expect(result.mergeDetails.strategy).toBe('override');
    });

    test('should use combine merge strategy', async () => {
      const result = await templateEngine.applyTemplate(
        mockTemplate.id,
        {
          baseConfig: mockBaseConfig,
          mergeStrategy: 'combine',
          validateResult: false
        }
      );

      // With combine, all rules from both should be present
      const totalTemplateRules = (mockTemplate.rules.permissions?.deny?.length || 0) + 
                                (mockTemplate.rules.permissions?.allow?.length || 0) +
                                (mockTemplate.rules.permissions?.ask?.length || 0);
      
      expect(result.mergeDetails.strategy).toBe('combine');
      expect(result.mergeDetails.rulesAdded).toBe(totalTemplateRules);
    });

    test('should use selective merge strategy', async () => {
      const result = await templateEngine.applyTemplate(
        mockTemplate.id,
        {
          baseConfig: mockBaseConfig,
          mergeStrategy: 'combine',
          sections: ['permissions'],
          validateResult: false
        }
      );

      expect(result.mergeDetails.strategy).toBe('combine');
      expect(result.mergeDetails.rulesAdded).toBeGreaterThan(0);
    });

    test('should handle conflicting rules gracefully', async () => {
      const result = await templateEngine.applyTemplate(
        mockConflictingTemplate.id,
        {
          baseConfig: mockBaseConfig,
          validateResult: false
        }
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      // Should still succeed but with warnings about conflicts
      expect(result.config).toBeDefined();
    });

    test('should update metadata correctly', async () => {
      const result = await templateEngine.applyTemplate(
        mockTemplate.id,
        {
          baseConfig: mockBaseConfig,
          environment: 'staging',
          validateResult: false
        }
      );

      expect(result.config.metadata?.templateId).toBe(mockTemplate.id);
      expect(result.config.metadata?.version).toBe(mockTemplate.version);
      expect(result.config.metadata?.environment).toBe('staging');
      expect(result.config.metadata?.timestamp).toBeDefined();
    });

    test('should handle dry run mode', async () => {
      const result = await templateEngine.applyTemplate(
        mockTemplate.id,
        {
          baseConfig: mockBaseConfig,
          dryRun: true
        }
      );

      expect(result.config).toBeDefined();
      
      // Cache should not be populated in dry run
      const cacheStats = templateEngine.getCacheStats();
      expect(cacheStats.size).toBe(0);
    });
  });

  describe('Performance and Caching', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockTemplate);
      await templateEngine.registerTemplate(mockLargeTemplate);
    });

    test('should cache template application results', async () => {
      const params = { parameters: {}, baseConfig: mockBaseConfig };
      
      // First application
      const result1 = await templateEngine.applyTemplate(mockTemplate.id, params);
      
      // Second application should use cache
      const result2 = await templateEngine.applyTemplate(mockTemplate.id, params);
      
      expect(result1).toBe(result2); // Should be the exact same object from cache
      
      const cacheStats = templateEngine.getCacheStats();
      expect(cacheStats.size).toBe(1);
    });

    test('should handle large templates efficiently', async () => {
      const startTime = performance.now();
      
      const result = await templateEngine.applyTemplate(
        mockLargeTemplate.id,
        {
          baseConfig: mockBaseConfig,
          validateResult: false
        }
      );
      
      const totalTime = performance.now() - startTime;
      
      expect(result.config).toBeDefined();
      expect(result.performance.totalTime).toBeLessThan(1000); // Should complete within 1 second
      expect(totalTime).toBeLessThan(2000); // Including test overhead
    });

    test('should report performance metrics', async () => {
      const result = await templateEngine.applyTemplate(
        mockTemplate.id,
        {
          baseConfig: mockBaseConfig,
          validateResult: true
        }
      );

      expect(result.performance.applicationTime).toBeDefined();
      expect(result.performance.validationTime).toBeDefined();
      expect(result.performance.totalTime).toBeDefined();
      expect(result.performance.applicationTime).toBeGreaterThan(0);
      expect(result.performance.totalTime).toBeGreaterThanOrEqual(
        result.performance.applicationTime
      );
    });

    test('should clear cache', () => {
      templateEngine.clearCache();
      
      const cacheStats = templateEngine.getCacheStats();
      expect(cacheStats.size).toBe(0);
    });

    test('should have configurable cache size', () => {
      const cacheStats = templateEngine.getCacheStats();
      expect(cacheStats.maxSize).toBeDefined();
      expect(cacheStats.maxSize).toBeGreaterThan(0);
    });
  });

  describe('Template Export and Import', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockTemplate);
    });

    test('should export templates as JSON', async () => {
      const json = await templateEngine.exportTemplates([mockTemplate.id]);
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(mockTemplate.id);
    });

    test('should export all templates when no IDs specified', async () => {
      const json = await templateEngine.exportTemplates();
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(1); // Built-ins + custom
    });

    test('should import templates from JSON', async () => {
      const templatesJson = JSON.stringify([mockTemplate]);
      
      const imported = await templateEngine.importTemplates(templatesJson);
      
      expect(imported).toHaveLength(1);
      expect(imported[0].id).toBe(mockTemplate.id);
      
      const retrieved = await templateEngine.getTemplate(mockTemplate.id);
      expect(retrieved).toBeTruthy();
    });

    test('should handle import errors gracefully', async () => {
      const invalidJson = JSON.stringify([mockInvalidTemplate]);
      
      const imported = await templateEngine.importTemplates(invalidJson);
      
      expect(imported).toHaveLength(0); // Should fail to import invalid template
    });
  });

  describe('Template Statistics', () => {
    test('should track template usage statistics', () => {
      const stats = templateEngine.getTemplateStats();

      expect(typeof stats).toBe('object');
      expect(Object.keys(stats).length).toBeGreaterThan(0);
      
      // Each entry should have usageCount
      Object.values(stats).forEach(stat => {
        expect(stat.usageCount).toBeDefined();
        expect(typeof stat.usageCount).toBe('number');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent template application', async () => {
      await expect(
        templateEngine.applyTemplate('non-existent-template')
      ).rejects.toThrow('Template not found: non-existent-template');
    });

    test('should handle template validation failure', async () => {
      // Register a template that will fail validation
      const invalidTemplate = { 
        ...mockTemplate,
        rules: { permissions: null }
      } as any;
      
      await templateEngine.registerTemplate(invalidTemplate);
      
      await expect(
        templateEngine.applyTemplate(invalidTemplate.id, {
          skipValidation: false
        })
      ).rejects.toThrow('Template validation failed');
    });

    test('should handle incompatible template version', async () => {
      const incompatibleTemplate = { 
        ...mockTemplate, 
        id: 'incompatible',
        version: '2.0.0' 
      };
      
      await templateEngine.registerTemplate(incompatibleTemplate);
      
      await expect(
        templateEngine.applyTemplate(incompatibleTemplate.id)
      ).rejects.toThrow('Template not compatible');
    });

    test('should handle update of non-existent template', async () => {
      await expect(
        templateEngine.updateTemplate('non-existent', { name: 'Updated' })
      ).rejects.toThrow('Template not found: non-existent');
    });

    test('should handle invalid template update', async () => {
      await templateEngine.registerTemplate(mockTemplate);
      
      await expect(
        templateEngine.updateTemplate(mockTemplate.id, { 
          rules: null 
        } as any)
      ).rejects.toThrow('Updated template is invalid');
    });
  });

  describe('Cleanup and Shutdown', () => {
    test('should shutdown cleanly', async () => {
      await templateEngine.registerTemplate(mockTemplate);
      
      await templateEngine.shutdown();
      
      const cacheStats = templateEngine.getCacheStats();
      expect(cacheStats.size).toBe(0);
    });
  });

  // Test all scenarios from fixtures
  describe('Test Scenarios', () => {
    Object.entries(testScenarios).forEach(([, scenario]) => {
      test(`should handle ${scenario.name}`, async () => {
        if (!scenario.template.isBuiltIn) {
          await templateEngine.registerTemplate(scenario.template);
        }

        if (scenario.expectSuccess) {
          const result = await templateEngine.applyTemplate(
            scenario.template.id,
            {
              parameters: scenario.parameters,
              baseConfig: scenario.baseConfig,
              validateResult: false
            }
          );

          expect(result.config).toBeDefined();
          
          if ('expectWarnings' in scenario && scenario.expectWarnings) {
            expect(result.warnings.length).toBeGreaterThan(0);
          }

          if ((scenario as any).performanceTarget) {
            expect(result.performance.totalTime).toBeLessThan(
              (scenario as any).performanceTarget
            );
          }
        } else {
          await expect(
            templateEngine.applyTemplate(scenario.template.id, {
              parameters: scenario.parameters,
              baseConfig: scenario.baseConfig
            })
          ).rejects.toThrow();
        }
      });
    });
  });
});