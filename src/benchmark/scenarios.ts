/**
 * Performance benchmark scenarios for real-world usage
 * Tests realistic workloads for 1000+ developer deployments
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BenchmarkScenario, ScenarioConfig } from './types';
import { DataGenerator } from './data-generator';
import { CacheSimulator } from './cache-simulator';

const execAsync = promisify(exec);
const dataGen = new DataGenerator();
const cacheSimulator = new CacheSimulator();

/**
 * Template validation performance scenarios
 */
const validationScenarios: BenchmarkScenario[] = [
  {
    name: 'validation-small-template',
    description: 'Validate small template (10 rules)',
    category: 'validation',
    priority: 'high',
    run: async () => {
      const template = dataGen.generateTemplate('small');
      const validator = await import('../validation/validator');
      await validator.validateTemplate(template);
    }
  },
  {
    name: 'validation-medium-template',
    description: 'Validate medium template (100 rules)',
    category: 'validation',
    priority: 'high',
    run: async () => {
      const template = dataGen.generateTemplate('medium');
      const validator = await import('../validation/validator');
      await validator.validateTemplate(template);
    }
  },
  {
    name: 'validation-large-template',
    description: 'Validate large template (1000 rules)',
    category: 'validation',
    priority: 'critical',
    run: async () => {
      const template = dataGen.generateTemplate('large');
      const validator = await import('../validation/validator');
      await validator.validateTemplate(template);
    }
  },
  {
    name: 'validation-xlarge-template',
    description: 'Validate extra large template (5000+ rules)',
    category: 'validation',
    priority: 'medium',
    run: async () => {
      const template = dataGen.generateTemplate('xlarge');
      const validator = await import('../validation/validator');
      await validator.validateTemplate(template);
    }
  },
  {
    name: 'validation-with-conflicts',
    description: 'Validate template with rule conflicts',
    category: 'validation',
    priority: 'critical',
    run: async () => {
      const template = dataGen.generateTemplateWithConflicts(100, 20);
      const validator = await import('../validation/conflict-detector');
      await validator.detectConflicts(template);
    }
  },
  {
    name: 'validation-nested-rules',
    description: 'Validate deeply nested rule structures',
    category: 'validation',
    priority: 'high',
    run: async () => {
      const template = dataGen.generateNestedTemplate(10, 5);
      const validator = await import('../validation/validator');
      await validator.validateTemplate(template);
    }
  },
  {
    name: 'validation-schema-compliance',
    description: 'Validate against complex JSON schema',
    category: 'validation',
    priority: 'high',
    run: async () => {
      const template = dataGen.generateTemplate('medium');
      const schemaValidator = await import('../validation/schema-validator');
      await schemaValidator.validateAgainstSchema(template);
    }
  }
];

/**
 * CLI command performance scenarios
 */
const cliScenarios: BenchmarkScenario[] = [
  {
    name: 'cli-response-init',
    description: 'CLI init command response time',
    category: 'cli',
    priority: 'critical',
    run: async () => {
      const testDir = await fs.mkdtemp(path.join('/tmp', 'bench-'));
      try {
        await execAsync(`node dist/cli/index.js init --path ${testDir}`, {
          cwd: process.cwd()
        });
      } finally {
        await fs.remove(testDir);
      }
    }
  },
  {
    name: 'cli-response-validate',
    description: 'CLI validate command response time',
    category: 'cli',
    priority: 'critical',
    setup: async () => {
      const templatePath = path.join('/tmp', 'bench-template.json');
      await fs.writeJson(templatePath, dataGen.generateTemplate('medium'));
    },
    run: async () => {
      await execAsync(`node dist/cli/index.js validate --template /tmp/bench-template.json`, {
        cwd: process.cwd()
      });
    },
    teardown: async () => {
      await fs.remove('/tmp/bench-template.json');
    }
  },
  {
    name: 'cli-response-apply',
    description: 'CLI apply template command response time',
    category: 'cli',
    priority: 'critical',
    setup: async () => {
      const templatePath = path.join('/tmp', 'bench-apply-template.json');
      await fs.writeJson(templatePath, dataGen.generateTemplate('small'));
    },
    run: async () => {
      const testDir = await fs.mkdtemp(path.join('/tmp', 'bench-apply-'));
      try {
        await execAsync(`node dist/cli/index.js apply --template /tmp/bench-apply-template.json --path ${testDir}`, {
          cwd: process.cwd()
        });
      } finally {
        await fs.remove(testDir);
      }
    },
    teardown: async () => {
      await fs.remove('/tmp/bench-apply-template.json');
    }
  },
  {
    name: 'cli-response-list',
    description: 'CLI list templates command response time',
    category: 'cli',
    priority: 'high',
    run: async () => {
      await execAsync(`node dist/cli/index.js list`, {
        cwd: process.cwd()
      });
    }
  },
  {
    name: 'cli-response-generate',
    description: 'CLI generate ruleset command response time',
    category: 'cli',
    priority: 'critical',
    run: async () => {
      const outputPath = path.join('/tmp', `bench-rules-${Date.now()}.json`);
      try {
        await execAsync(`node dist/cli/index.js generate --type security --output ${outputPath}`, {
          cwd: process.cwd()
        });
      } finally {
        await fs.remove(outputPath);
      }
    }
  },
  {
    name: 'cli-response-audit',
    description: 'CLI audit command response time',
    category: 'cli',
    priority: 'high',
    run: async () => {
      const testDir = await fs.mkdtemp(path.join('/tmp', 'bench-audit-'));
      try {
        // Create sample project structure
        await dataGen.createSampleProject(testDir);
        await execAsync(`node dist/cli/index.js audit --path ${testDir}`, {
          cwd: process.cwd()
        });
      } finally {
        await fs.remove(testDir);
      }
    }
  }
];

/**
 * Cache performance scenarios
 */
const cacheScenarios: BenchmarkScenario[] = [
  {
    name: 'cache-hit-performance',
    description: 'Cache hit response time',
    category: 'cache',
    priority: 'critical',
    setup: async () => {
      await cacheSimulator.populate(1000);
    },
    run: async () => {
      await cacheSimulator.get('template-500');
    },
    teardown: async () => {
      await cacheSimulator.clear();
    }
  },
  {
    name: 'cache-miss-performance',
    description: 'Cache miss and populate response time',
    category: 'cache',
    priority: 'high',
    run: async () => {
      const key = `template-${Date.now()}`;
      await cacheSimulator.get(key);
    }
  },
  {
    name: 'cache-eviction-lru',
    description: 'Cache LRU eviction performance',
    category: 'cache',
    priority: 'medium',
    setup: async () => {
      await cacheSimulator.populate(10000);
    },
    run: async () => {
      await cacheSimulator.set(`new-template-${Date.now()}`, dataGen.generateTemplate('medium'));
    },
    teardown: async () => {
      await cacheSimulator.clear();
    }
  },
  {
    name: 'cache-bulk-operations',
    description: 'Bulk cache operations performance',
    category: 'cache',
    priority: 'high',
    run: async () => {
      const keys = Array.from({ length: 100 }, (_, i) => `bulk-${i}`);
      await Promise.all(keys.map(key => cacheSimulator.set(key, { data: key })));
      await Promise.all(keys.map(key => cacheSimulator.get(key)));
      await Promise.all(keys.map(key => cacheSimulator.delete(key)));
    }
  },
  {
    name: 'cache-ttl-expiry',
    description: 'Cache TTL expiry handling',
    category: 'cache',
    priority: 'medium',
    run: async () => {
      await cacheSimulator.setWithTTL('ttl-key', { data: 'test' }, 100);
      await new Promise(resolve => setTimeout(resolve, 150));
      await cacheSimulator.get('ttl-key');
    }
  }
];

/**
 * Concurrency and scale scenarios
 */
const concurrencyScenarios: BenchmarkScenario[] = [
  {
    name: 'concurrent-validations-100',
    description: 'Handle 100 concurrent validation requests',
    category: 'concurrency',
    priority: 'critical',
    run: async () => {
      const validator = await import('../validation/validator');
      const promises = Array.from({ length: 100 }, () => 
        validator.validateTemplate(dataGen.generateTemplate('small'))
      );
      await Promise.all(promises);
    }
  },
  {
    name: 'concurrent-validations-1000',
    description: 'Handle 1000 concurrent validation requests',
    category: 'concurrency',
    priority: 'critical',
    run: async () => {
      const validator = await import('../validation/validator');
      const promises = Array.from({ length: 1000 }, () => 
        validator.validateTemplate(dataGen.generateTemplate('small'))
      );
      await Promise.all(promises);
    }
  },
  {
    name: 'concurrent-cli-commands-50',
    description: 'Handle 50 concurrent CLI commands',
    category: 'concurrency',
    priority: 'high',
    run: async () => {
      const promises = Array.from({ length: 50 }, async (_, i) => {
        const testDir = await fs.mkdtemp(path.join('/tmp', `bench-concurrent-${i}-`));
        try {
          await execAsync(`node dist/cli/index.js init --path ${testDir}`, {
            cwd: process.cwd()
          });
        } finally {
          await fs.remove(testDir);
        }
      });
      await Promise.all(promises);
    }
  },
  {
    name: 'concurrent-cache-operations-500',
    description: 'Handle 500 concurrent cache operations',
    category: 'concurrency',
    priority: 'high',
    run: async () => {
      const operations = Array.from({ length: 500 }, async (_, i) => {
        const key = `concurrent-${i}`;
        await cacheSimulator.set(key, { index: i });
        await cacheSimulator.get(key);
        await cacheSimulator.delete(key);
      });
      await Promise.all(operations);
    }
  },
  {
    name: 'concurrent-rule-conflicts-detection',
    description: 'Detect conflicts in concurrent rule applications',
    category: 'concurrency',
    priority: 'critical',
    run: async () => {
      const conflictDetector = await import('../validation/conflict-detector');
      const templates = Array.from({ length: 100 }, () => 
        dataGen.generateTemplateWithConflicts(50, 10)
      );
      await Promise.all(templates.map(t => conflictDetector.detectConflicts(t)));
    }
  }
];

/**
 * Large scale scenarios
 */
const scaleScenarios: BenchmarkScenario[] = [
  {
    name: 'scale-large-organization',
    description: 'Simulate large organization (1000+ developers)',
    category: 'scale',
    priority: 'critical',
    run: async () => {
      // Simulate 1000 developers each with their own ruleset
      const developers = Array.from({ length: 1000 }, (_, i) => ({
        id: `dev-${i}`,
        template: dataGen.generateTemplate('small'),
        projects: Math.floor(Math.random() * 5) + 1
      }));

      const validator = await import('../validation/validator');
      
      // Process in batches to avoid overwhelming the system
      const batchSize = 100;
      for (let i = 0; i < developers.length; i += batchSize) {
        const batch = developers.slice(i, i + batchSize);
        await Promise.all(batch.map(dev => 
          validator.validateTemplate(dev.template)
        ));
      }
    }
  },
  {
    name: 'scale-enterprise-templates',
    description: 'Process enterprise-scale template library',
    category: 'scale',
    priority: 'high',
    run: async () => {
      // Generate enterprise template library
      const templates = {
        security: Array.from({ length: 50 }, () => dataGen.generateTemplate('medium')),
        compliance: Array.from({ length: 30 }, () => dataGen.generateTemplate('large')),
        custom: Array.from({ length: 100 }, () => dataGen.generateTemplate('small'))
      };

      const validator = await import('../validation/validator');
      
      for (const [category, categoryTemplates] of Object.entries(templates)) {
        await Promise.all(categoryTemplates.map(t => 
          validator.validateTemplate(t)
        ));
      }
    }
  },
  {
    name: 'scale-rule-inheritance',
    description: 'Process complex rule inheritance chains',
    category: 'scale',
    priority: 'medium',
    run: async () => {
      const inheritanceChain = dataGen.generateInheritanceChain(10, 100);
      const validator = await import('../validation/inheritance-validator');
      await validator.resolveInheritance(inheritanceChain);
    }
  }
];

/**
 * Git integration scenarios
 */
const gitScenarios: BenchmarkScenario[] = [
  {
    name: 'git-pre-commit-hook',
    description: 'Git pre-commit hook performance',
    category: 'git',
    priority: 'high',
    setup: async () => {
      const repoPath = await fs.mkdtemp(path.join('/tmp', 'bench-git-'));
      await execAsync('git init', { cwd: repoPath });
      await dataGen.createSampleProject(repoPath);
      return repoPath;
    },
    run: async () => {
      const hookValidator = await import('../integrations/git/pre-commit');
      await hookValidator.validateChangedFiles();
    },
    teardown: async (repoPath: string) => {
      await fs.remove(repoPath);
    }
  },
  {
    name: 'git-diff-analysis',
    description: 'Analyze git diff for rule violations',
    category: 'git',
    priority: 'medium',
    run: async () => {
      const diffAnalyzer = await import('../integrations/git/diff-analyzer');
      const diff = dataGen.generateGitDiff(100);
      await diffAnalyzer.analyzeDiff(diff);
    }
  },
  {
    name: 'git-merge-conflict-detection',
    description: 'Detect rule conflicts in git merges',
    category: 'git',
    priority: 'high',
    run: async () => {
      const mergeValidator = await import('../integrations/git/merge-validator');
      const mergeData = dataGen.generateMergeScenario();
      await mergeValidator.validateMerge(mergeData);
    }
  }
];

/**
 * All scenarios combined
 */
export const scenarios: BenchmarkScenario[] = [
  ...validationScenarios,
  ...cliScenarios,
  ...cacheScenarios,
  ...concurrencyScenarios,
  ...scaleScenarios,
  ...gitScenarios
];

/**
 * Get scenario by name
 */
export function getScenarioByName(name: string): BenchmarkScenario | undefined {
  return scenarios.find(s => s.name === name);
}

/**
 * Get scenarios by category
 */
export function getScenariosByCategory(category: string): BenchmarkScenario[] {
  return scenarios.filter(s => s.category === category);
}

/**
 * Get critical scenarios
 */
export function getCriticalScenarios(): BenchmarkScenario[] {
  return scenarios.filter(s => s.priority === 'critical');
}