/**
 * Data generator for realistic benchmark test data
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { RulesetData } from './types';

export class DataGenerator {
  private rulesetSizes: RulesetData = {
    small: {
      rules: 10,
      templates: 2,
      size: '~10KB'
    },
    medium: {
      rules: 100,
      templates: 10,
      size: '~100KB'
    },
    large: {
      rules: 1000,
      templates: 50,
      size: '~1MB'
    },
    xlarge: {
      rules: 5000,
      templates: 200,
      size: '~5MB'
    }
  };

  /**
   * Generate a template with specified size
   */
  generateTemplate(size: 'small' | 'medium' | 'large' | 'xlarge'): any {
    const config = this.rulesetSizes[size];
    
    return {
      name: `benchmark-template-${size}`,
      version: '1.0.0',
      description: `Benchmark template with ${config.rules} rules`,
      metadata: {
        created: new Date().toISOString(),
        author: 'benchmark-generator',
        organization: 'test-org',
        tags: ['benchmark', size],
        compliance: ['SOC2', 'ISO27001', 'GDPR']
      },
      rules: this.generateRules(config.rules),
      templates: this.generateSubTemplates(config.templates),
      settings: {
        enforceMode: 'strict',
        allowOverrides: false,
        cacheTTL: 3600,
        validationLevel: 'comprehensive'
      }
    };
  }

  /**
   * Generate rules
   */
  private generateRules(count: number): any[] {
    const rules = [];
    const categories = ['security', 'compliance', 'performance', 'quality', 'accessibility'];
    const severities = ['critical', 'high', 'medium', 'low'];
    
    for (let i = 0; i < count; i++) {
      rules.push({
        id: `rule-${i}`,
        name: `Rule ${i}`,
        description: `Generated rule for benchmarking - ${i}`,
        category: categories[i % categories.length],
        severity: severities[i % severities.length],
        enabled: Math.random() > 0.1,
        conditions: this.generateConditions(Math.floor(Math.random() * 5) + 1),
        actions: this.generateActions(Math.floor(Math.random() * 3) + 1),
        metadata: {
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          version: '1.0.0',
          tags: [`tag-${i % 10}`, `category-${i % 5}`]
        }
      });
    }
    
    return rules;
  }

  /**
   * Generate conditions for rules
   */
  private generateConditions(count: number): any[] {
    const conditions = [];
    const types = ['path', 'content', 'size', 'permission', 'metadata'];
    const operators = ['equals', 'contains', 'regex', 'gt', 'lt', 'in'];
    
    for (let i = 0; i < count; i++) {
      conditions.push({
        type: types[i % types.length],
        operator: operators[i % operators.length],
        value: `test-value-${i}`,
        negate: Math.random() > 0.7
      });
    }
    
    return conditions;
  }

  /**
   * Generate actions for rules
   */
  private generateActions(count: number): any[] {
    const actions = [];
    const types = ['block', 'allow', 'warn', 'log', 'redirect'];
    
    for (let i = 0; i < count; i++) {
      actions.push({
        type: types[i % types.length],
        params: {
          message: `Action message ${i}`,
          level: i % 3,
          target: `target-${i}`
        }
      });
    }
    
    return actions;
  }

  /**
   * Generate sub-templates
   */
  private generateSubTemplates(count: number): any[] {
    const templates = [];
    
    for (let i = 0; i < count; i++) {
      templates.push({
        id: `sub-template-${i}`,
        name: `Sub Template ${i}`,
        inherit: i > 0 ? `sub-template-${i - 1}` : null,
        rules: this.generateRules(10),
        overrides: i % 2 === 0 ? this.generateOverrides(5) : []
      });
    }
    
    return templates;
  }

  /**
   * Generate overrides
   */
  private generateOverrides(count: number): any[] {
    const overrides = [];
    
    for (let i = 0; i < count; i++) {
      overrides.push({
        ruleId: `rule-${i}`,
        field: i % 2 === 0 ? 'enabled' : 'severity',
        value: i % 2 === 0 ? false : 'low'
      });
    }
    
    return overrides;
  }

  /**
   * Generate template with conflicts
   */
  generateTemplateWithConflicts(ruleCount: number, conflictCount: number): any {
    const template = this.generateTemplate('medium');
    const rules = template.rules;
    
    // Create conflicting rules
    for (let i = 0; i < conflictCount && i < rules.length - 1; i++) {
      const rule1 = rules[i];
      const rule2 = rules[i + 1];
      
      // Make rules conflict
      rule2.conditions = [...rule1.conditions];
      rule2.actions = [
        {
          type: rule1.actions[0].type === 'allow' ? 'block' : 'allow',
          params: rule1.actions[0].params
        }
      ];
    }
    
    return template;
  }

  /**
   * Generate nested template structure
   */
  generateNestedTemplate(depth: number, rulesPerLevel: number): any {
    const generateLevel = (currentDepth: number): any => {
      if (currentDepth === 0) {
        return {
          rules: this.generateRules(rulesPerLevel),
          templates: []
        };
      }
      
      return {
        rules: this.generateRules(rulesPerLevel),
        templates: [generateLevel(currentDepth - 1)]
      };
    };
    
    const template = this.generateTemplate('small');
    template.templates = [generateLevel(depth)];
    return template;
  }

  /**
   * Generate inheritance chain
   */
  generateInheritanceChain(chainLength: number, rulesPerTemplate: number): any[] {
    const chain = [];
    
    for (let i = 0; i < chainLength; i++) {
      chain.push({
        id: `template-${i}`,
        name: `Template ${i}`,
        parent: i > 0 ? `template-${i - 1}` : null,
        rules: this.generateRules(rulesPerTemplate),
        overrides: i > 0 ? this.generateOverrides(10) : []
      });
    }
    
    return chain;
  }

  /**
   * Create sample project structure
   */
  async createSampleProject(basePath: string): Promise<void> {
    // Create directory structure
    const dirs = [
      'src',
      'src/components',
      'src/utils',
      'src/services',
      'tests',
      'config',
      '.claude'
    ];
    
    for (const dir of dirs) {
      await fs.ensureDir(path.join(basePath, dir));
    }
    
    // Create sample files
    const files = [
      { path: 'package.json', content: this.generatePackageJson() },
      { path: '.clauderc.json', content: this.generateClaudeConfig() },
      { path: 'src/index.ts', content: this.generateTypeScriptFile() },
      { path: 'src/components/App.tsx', content: this.generateReactComponent() },
      { path: 'tests/app.test.ts', content: this.generateTestFile() },
      { path: 'README.md', content: this.generateReadme() }
    ];
    
    for (const file of files) {
      await fs.writeFile(
        path.join(basePath, file.path),
        typeof file.content === 'object' 
          ? JSON.stringify(file.content, null, 2)
          : file.content
      );
    }
  }

  /**
   * Generate package.json
   */
  private generatePackageJson(): any {
    return {
      name: 'benchmark-test-project',
      version: '1.0.0',
      scripts: {
        build: 'tsc',
        test: 'jest',
        lint: 'eslint'
      },
      dependencies: {
        react: '^18.0.0',
        typescript: '^5.0.0'
      }
    };
  }

  /**
   * Generate Claude config
   */
  private generateClaudeConfig(): any {
    return {
      version: '1.0.0',
      rules: this.generateRules(20),
      templates: ['security-baseline', 'compliance-soc2'],
      settings: {
        autoFix: true,
        severity: 'error'
      }
    };
  }

  /**
   * Generate TypeScript file
   */
  private generateTypeScriptFile(): string {
    return `
// Benchmark test file
export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  private users: Map<string, User> = new Map();
  
  addUser(user: User): void {
    this.users.set(user.id, user);
  }
  
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }
  
  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }
}
`;
  }

  /**
   * Generate React component
   */
  private generateReactComponent(): string {
    return `
import React, { useState, useEffect } from 'react';

interface AppProps {
  title: string;
}

export const App: React.FC<AppProps> = ({ title }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    console.log('Component mounted');
  }, []);
  
  return (
    <div>
      <h1>{title}</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
};
`;
  }

  /**
   * Generate test file
   */
  private generateTestFile(): string {
    return `
import { UserService } from '../src/index';

describe('UserService', () => {
  let service: UserService;
  
  beforeEach(() => {
    service = new UserService();
  });
  
  test('should add user', () => {
    const user = { id: '1', name: 'Test', email: 'test@example.com' };
    service.addUser(user);
    expect(service.getUser('1')).toEqual(user);
  });
});
`;
  }

  /**
   * Generate README
   */
  private generateReadme(): string {
    return `
# Benchmark Test Project

This is a sample project for benchmarking Claude Code Security Rulesets.

## Installation
\`\`\`bash
npm install
\`\`\`

## Usage
\`\`\`bash
npm run build
npm test
\`\`\`
`;
  }

  /**
   * Generate git diff
   */
  generateGitDiff(changeCount: number): string {
    let diff = '';
    
    for (let i = 0; i < changeCount; i++) {
      diff += `
diff --git a/src/file${i}.ts b/src/file${i}.ts
index abc123..def456 100644
--- a/src/file${i}.ts
+++ b/src/file${i}.ts
@@ -1,5 +1,7 @@
 export function test${i}() {
-  console.log('old');
+  console.log('new');
+  // Added comment
+  const value = ${i};
 }
`;
    }
    
    return diff;
  }

  /**
   * Generate merge scenario
   */
  generateMergeScenario(): any {
    return {
      base: this.generateTemplate('small'),
      ours: this.generateTemplate('small'),
      theirs: this.generateTemplate('small'),
      conflicts: [
        {
          file: 'rules.json',
          line: 42,
          ours: 'severity: "high"',
          theirs: 'severity: "critical"'
        }
      ]
    };
  }
}