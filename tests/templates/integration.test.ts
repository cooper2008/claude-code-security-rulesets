/**
 * Integration tests for template system
 * Tests integration with validation engine, conflict detection, and full workflows
 */

import { TemplateEngine } from '../../src/templates/engine';
import { TemplateMerger } from '../../src/templates/merger';
import { TemplateValidator } from '../../src/templates/validator';
import { validationEngine } from '../../src/validation/engine';
import { 
  mockBaseConfig,
  mockTemplate,
  mockParameterizedTemplate,
  mockConflictingTemplate,
  mockBuiltInTemplates
} from './fixtures';

// Mock the validation engine
jest.mock('../../src/validation/engine', () => ({
  validationEngine: {
    validate: jest.fn()
  }
}));

const mockValidationEngine = validationEngine as jest.Mocked<typeof validationEngine>;

describe('Template Integration Tests', () => {
  let templateEngine: TemplateEngine;
  let templateMerger: TemplateMerger;
  let templateValidator: TemplateValidator;

  beforeEach(() => {
    templateEngine = new TemplateEngine();
    templateMerger = new TemplateMerger();
    templateValidator = new TemplateValidator();
    
    // Reset mocks
    mockValidationEngine.validate.mockClear();
  });

  afterEach(() => {
    templateEngine.clearCache();
  });

  describe('Template + Validation Engine Integration', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockTemplate);
    });

    test('should validate configuration after template application', async () => {
      // Mock successful validation
      mockValidationEngine.validate.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        conflicts: [],
        performance: {
          validationTime: 50,
          rulesProcessed: 10,
          performanceTarget: { target: 100, achieved: true }
        },
        suggestions: []
      });

      const result = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: true
      });

      expect(result.validation).toBeDefined();
      expect(result.validation!.isValid).toBe(true);
      expect(result.performance.validationTime).toBeDefined();
      expect(mockValidationEngine.validate).toHaveBeenCalledWith(result.config);
    });

    test('should handle validation failures gracefully', async () => {
      // Mock validation failure
      mockValidationEngine.validate.mockResolvedValue({
        isValid: false,
        errors: [{
          type: 'RULE_CONFLICT',
          message: 'Conflicting rules detected',
          severity: 'high'
        }],
        warnings: [],
        conflicts: [{
          type: 'ALLOW_OVERRIDES_DENY',
          message: 'Allow rule overrides deny rule',
          conflictingRules: [
            { type: 'deny', pattern: '**/secret*/**', location: { path: 'permissions.deny[0]' } },
            { type: 'allow', pattern: 'Read(**/secret*/public/**)', location: { path: 'permissions.allow[0]' } }
          ],
          resolution: 'MAKE_DENY_MORE_SPECIFIC',
          securityImpact: 'high'
        }],
        performance: {
          validationTime: 75,
          rulesProcessed: 15,
          performanceTarget: { target: 100, achieved: true }
        },
        suggestions: []
      });

      const result = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: true
      });

      expect(result.validation).toBeDefined();
      expect(result.validation!.isValid).toBe(false);
      expect(result.validation!.errors).toHaveLength(1);
      expect(result.validation!.conflicts).toHaveLength(1);
      
      // Should log warning but not fail
      expect(result.config).toBeDefined();
    });

    test('should skip validation when requested', async () => {
      const result = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: false
      });

      expect(result.validation).toBeUndefined();
      expect(result.performance.validationTime).toBeUndefined();
      expect(mockValidationEngine.validate).not.toHaveBeenCalled();
    });

    test('should measure validation performance', async () => {
      mockValidationEngine.validate.mockImplementation(async () => {
        // Simulate validation taking some time
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          isValid: true,
          errors: [],
          warnings: [],
          conflicts: [],
          performance: {
            validationTime: 50,
            rulesProcessed: 8,
            performanceTarget: { target: 100, achieved: true }
          },
          suggestions: []
        };
      });

      const result = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: true
      });

      expect(result.performance.validationTime).toBeGreaterThan(40);
      expect(result.performance.totalTime).toBeGreaterThan(
        result.performance.validationTime!
      );
    });
  });

  describe('Template + Conflict Detection Integration', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockConflictingTemplate);
    });

    test('should detect conflicts during template application', async () => {
      mockValidationEngine.validate.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        conflicts: [
          {
            type: 'ALLOW_OVERRIDES_DENY',
            message: 'Allow rule conflicts with deny rule',
            conflictingRules: [
              { type: 'deny', pattern: 'Execute(*)', location: { path: 'permissions.deny[1]' } },
              { type: 'allow', pattern: 'Execute(git)', location: { path: 'permissions.allow[0]' } }
            ],
            resolution: 'MAKE_ALLOW_MORE_RESTRICTIVE',
            securityImpact: 'medium'
          }
        ],
        performance: {
          validationTime: 45,
          rulesProcessed: 12,
          performanceTarget: { target: 100, achieved: true }
        },
        suggestions: []
      });

      const result = await templateEngine.applyTemplate(mockConflictingTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: true
      });

      expect(result.validation!.conflicts).toHaveLength(1);
      expect(result.validation!.conflicts[0].type).toBe('ALLOW_OVERRIDES_DENY');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('should merge conflicting templates with conflict resolution', async () => {
      const result = await templateMerger.merge(
        mockBaseConfig,
        mockConflictingTemplate.rules,
        {
          strategy: 'merge',
          conflictResolution: 'strict-deny',
          validateResult: false
        }
      );

      expect(result.conflictingRules.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.strategy).toBe('merge');
    });

    test('should handle different conflict resolution strategies', async () => {
      const strategies = ['strict-deny', 'template-wins', 'base-wins'] as const;

      for (const strategy of strategies) {
        const result = await templateMerger.merge(
          mockBaseConfig,
          mockConflictingTemplate.rules,
          {
            strategy: 'merge',
            conflictResolution: strategy,
            validateResult: false
          }
        );

        expect(result.config).toBeDefined();
        expect(result.strategy).toBe('merge');
      }
    });
  });

  describe('Template Merger Integration', () => {
    test('should integrate with all merge strategies', async () => {
      await templateEngine.registerTemplate(mockTemplate);

      const strategies = ['override', 'merge', 'combine'] as const;

      for (const strategy of strategies) {
        const result = await templateEngine.applyTemplate(mockTemplate.id, {
          baseConfig: mockBaseConfig,
          mergeStrategy: strategy,
          validateResult: false
        });

        expect(result.config).toBeDefined();
        expect(result.mergeDetails.strategy).toBe(strategy);
        expect(result.mergeDetails.rulesAdded).toBeGreaterThanOrEqual(0);
        expect(result.mergeDetails.rulesOverridden).toBeGreaterThanOrEqual(0);
      }
    });

    test('should merge multiple templates sequentially', async () => {
      await templateEngine.registerTemplate(mockTemplate);

      // Apply development template first
      const firstResult = await templateEngine.applyTemplate('development', {
        baseConfig: mockBaseConfig,
        validateResult: false
      });

      // Then apply custom template on top
      const finalResult = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: firstResult.config,
        mergeStrategy: 'combine',
        validateResult: false
      });

      expect(finalResult.config).toBeDefined();
      expect(finalResult.mergeDetails.rulesAdded).toBeGreaterThan(0);
      
      // Should have rules from both templates
      const finalRuleCount = 
        (finalResult.config.permissions?.deny?.length || 0) +
        (finalResult.config.permissions?.allow?.length || 0) +
        (finalResult.config.permissions?.ask?.length || 0);

      const originalRuleCount = 
        (mockBaseConfig.permissions?.deny?.length || 0) +
        (mockBaseConfig.permissions?.allow?.length || 0) +
        (mockBaseConfig.permissions?.ask?.length || 0);

      expect(finalRuleCount).toBeGreaterThan(originalRuleCount);
    });

    test('should handle merge conflicts across multiple templates', async () => {
      const conflictingConfig = {
        permissions: {
          deny: ['Execute(*)'], // Very broad deny
          allow: ['Read(/app/**)'],
          ask: []
        },
        metadata: {
          version: '1.0.0',
          timestamp: Date.now(),
          name: 'Conflicting Base'
        }
      };

      const templateWithConflicts = {
        permissions: {
          deny: [],
          allow: ['Execute(npm)', 'Execute(node)'], // Conflicts with base deny
          ask: ['Network(*)']
        },
        metadata: {
          version: '1.0.0',
          timestamp: Date.now(),
          name: 'Template with conflicts'
        }
      };

      const mergeResult = await templateMerger.merge(
        conflictingConfig,
        templateWithConflicts,
        { 
          strategy: 'merge',
          conflictResolution: 'strict-deny'
        }
      );

      expect(mergeResult.conflictingRules.length).toBeGreaterThan(0);
      // With strict-deny, conflicting allow rules should be filtered out
      expect(mergeResult.config.permissions?.allow).not.toContain('Execute(npm)');
    });
  });

  describe('Full Template Workflow Integration', () => {
    test('should complete full template application workflow', async () => {
      await templateEngine.registerTemplate(mockParameterizedTemplate);

      // 1. Discover templates
      const templates = await templateEngine.discoverTemplates({
        category: 'custom'
      });
      expect(templates.some(t => t.id === mockParameterizedTemplate.id)).toBe(true);

      // 2. Check compatibility
      const compatibility = templateEngine.checkCompatibility(mockParameterizedTemplate);
      expect(compatibility.compatible).toBe(true);

      // 3. Validate template
      const validation = await templateEngine.validateTemplate(mockParameterizedTemplate);
      expect(validation.isValid).toBe(true);

      // 4. Apply template with validation
      mockValidationEngine.validate.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        conflicts: [],
        performance: {
          validationTime: 30,
          rulesProcessed: 6,
          performanceTarget: { target: 100, achieved: true }
        },
        suggestions: []
      });

      const result = await templateEngine.applyTemplate(mockParameterizedTemplate.id, {
        parameters: {
          projectPath: '/my-app',
          templateName: 'My Configuration',
          allowedCommand: 'npm'
        },
        baseConfig: mockBaseConfig,
        validateResult: true,
        environment: 'production'
      });

      // 5. Verify result
      expect(result.config).toBeDefined();
      expect(result.validation!.isValid).toBe(true);
      expect(result.appliedParameters.projectPath).toBe('/my-app');
      expect(result.config.metadata?.environment).toBe('production');
      expect(result.performance.totalTime).toBeDefined();
    });

    test('should handle end-to-end error scenarios', async () => {
      // Invalid parameters should fail early
      await expect(
        templateEngine.applyTemplate('development', {
          parameters: { invalidParam: 'value' },
          validateResult: false
        })
      ).resolves.toBeDefined(); // Should succeed but warn about unknown params

      // Non-existent template should fail
      await expect(
        templateEngine.applyTemplate('non-existent')
      ).rejects.toThrow('Template not found');

      // Invalid template should fail validation
      const invalidTemplate = { ...mockTemplate, rules: null } as any;
      await expect(
        templateEngine.registerTemplate(invalidTemplate)
      ).rejects.toThrow();
    });

    test('should integrate with built-in templates end-to-end', async () => {
      const scenarios = [
        { templateId: 'development', environment: 'development' },
        { templateId: 'production', environment: 'production' },
        { templateId: 'soc2', environment: 'production' },
      ];

      mockValidationEngine.validate.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        conflicts: [],
        performance: {
          validationTime: 25,
          rulesProcessed: 5,
          performanceTarget: { target: 100, achieved: true }
        },
        suggestions: []
      });

      for (const scenario of scenarios) {
        const result = await templateEngine.applyTemplate(scenario.templateId, {
          baseConfig: mockBaseConfig,
          environment: scenario.environment as any,
          validateResult: true
        });

        expect(result.config).toBeDefined();
        expect(result.config.metadata?.templateId).toBe(scenario.templateId);
        expect(result.config.metadata?.environment).toBe(scenario.environment);
        expect(result.validation!.isValid).toBe(true);
      }
    });
  });

  describe('Template Caching Integration', () => {
    beforeEach(async () => {
      await templateEngine.registerTemplate(mockTemplate);
    });

    test('should cache template applications with validation', async () => {
      mockValidationEngine.validate.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        conflicts: [],
        performance: {
          validationTime: 40,
          rulesProcessed: 8,
          performanceTarget: { target: 100, achieved: true }
        },
        suggestions: []
      });

      const params = {
        baseConfig: mockBaseConfig,
        validateResult: true
      };

      // First call should validate
      const result1 = await templateEngine.applyTemplate(mockTemplate.id, params);
      expect(mockValidationEngine.validate).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await templateEngine.applyTemplate(mockTemplate.id, params);
      expect(mockValidationEngine.validate).toHaveBeenCalledTimes(1); // No additional calls
      expect(result1).toBe(result2); // Same object from cache
    });

    test('should invalidate cache when template is updated', async () => {
      const result1 = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: false
      });

      // Update template
      await templateEngine.updateTemplate(mockTemplate.id, {
        name: 'Updated Template'
      });

      const result2 = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: false
      });

      expect(result1).not.toBe(result2); // Different objects (cache invalidated)
      expect(result2.template.name).toBe('Updated Template');
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover from validation engine failures', async () => {
      await templateEngine.registerTemplate(mockTemplate);

      // Mock validation engine throwing an error
      mockValidationEngine.validate.mockRejectedValue(new Error('Validation engine error'));

      // Should still complete template application
      const result = await templateEngine.applyTemplate(mockTemplate.id, {
        baseConfig: mockBaseConfig,
        validateResult: true
      });

      expect(result.config).toBeDefined();
      expect(result.validation).toBeUndefined(); // Validation failed but application succeeded
    });

    test('should handle partial merge failures gracefully', async () => {
      const corruptedBase = {
        permissions: null, // Invalid structure
        metadata: { version: '1.0.0', timestamp: Date.now() }
      } as any;

      // Should handle gracefully
      const result = await templateEngine.applyTemplate('development', {
        baseConfig: corruptedBase,
        validateResult: false
      });

      expect(result.config).toBeDefined();
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
    });

    test('should maintain system integrity after errors', async () => {
      // Cause an error with invalid template
      try {
        await templateEngine.registerTemplate({ id: 'invalid' } as any);
      } catch (error) {
        // Expected to fail
      }

      // System should still work for valid operations
      const result = await templateEngine.applyTemplate('development', {
        baseConfig: mockBaseConfig,
        validateResult: false
      });

      expect(result.config).toBeDefined();
    });
  });

  describe('Performance Integration', () => {
    test('should maintain performance targets during integration', async () => {
      const startTime = performance.now();

      mockValidationEngine.validate.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        conflicts: [],
        performance: {
          validationTime: 20,
          rulesProcessed: 5,
          performanceTarget: { target: 100, achieved: true }
        },
        suggestions: []
      });

      // Apply multiple templates
      const results = await Promise.all([
        templateEngine.applyTemplate('development', {
          baseConfig: mockBaseConfig,
          validateResult: true
        }),
        templateEngine.applyTemplate('production', {
          baseConfig: mockBaseConfig,
          validateResult: true
        }),
        templateEngine.applyTemplate('soc2', {
          baseConfig: mockBaseConfig,
          validateResult: true
        })
      ]);

      const totalTime = performance.now() - startTime;

      results.forEach(result => {
        expect(result.config).toBeDefined();
        expect(result.performance.totalTime).toBeLessThan(100);
      });

      expect(totalTime).toBeLessThan(1000); // All operations within 1 second
    });

    test('should handle concurrent template applications', async () => {
      await templateEngine.registerTemplate(mockTemplate);

      mockValidationEngine.validate.mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        conflicts: [],
        performance: {
          validationTime: 15,
          rulesProcessed: 3,
          performanceTarget: { target: 100, achieved: true }
        },
        suggestions: []
      });

      // Run concurrent applications
      const promises = Array.from({ length: 5 }, () =>
        templateEngine.applyTemplate(mockTemplate.id, {
          baseConfig: mockBaseConfig,
          parameters: { randomParam: Math.random() },
          validateResult: true
        })
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.config).toBeDefined();
        expect(result.validation!.isValid).toBe(true);
      });
    });
  });
});