/**
 * Test fixtures for template system testing
 */

import { SecurityTemplate, ClaudeCodeConfiguration, TemplateParameter } from '../../../src/types';

/**
 * Mock base configuration for testing
 */
export const mockBaseConfig: ClaudeCodeConfiguration = {
  permissions: {
    deny: [
      "**/.env*",
      "**/secret*/**",
      "Execute(sudo)"
    ],
    allow: [
      "Read(/project/**)",
      "Execute(git status)"
    ],
    ask: [
      "Execute(git push)",
      "Network(*)"
    ]
  },
  metadata: {
    version: "1.0.0",
    timestamp: Date.now(),
    name: "Base Configuration"
  }
};

/**
 * Mock template for testing
 */
export const mockTemplate: SecurityTemplate = {
  id: "test-template",
  name: "Test Template",
  version: "1.0.0",
  category: "development",
  description: "A test template for unit testing",
  compliance: [] as any,
  tags: ["test", "development"],
  isBuiltIn: false,
  createdAt: new Date("2024-01-15T00:00:00Z"),
  updatedAt: new Date("2024-01-15T00:00:00Z"),
  rules: {
    permissions: {
      deny: [
        "**/*password*",
        "**/private*/**",
        "Execute(rm -rf)"
      ],
      allow: [
        "Read(/app/**)",
        "Write(/app/logs/**)",
        "Execute(npm)"
      ],
      ask: [
        "Write(**/package.json)",
        "Network(api.example.com)"
      ]
    },
    metadata: {
      version: "1.0.0",
      timestamp: Date.now(),
      templateId: "test-template",
      name: "Test Template Configuration"
    }
  },
  parameters: [
    {
      name: "appPath",
      type: "string",
      description: "Path to the application directory",
      required: true,
      defaultValue: "/app"
    },
    {
      name: "enableLogging",
      type: "boolean", 
      description: "Enable application logging",
      required: false,
      defaultValue: true
    }
  ]
};

/**
 * Template with parameters for testing parameter processing
 */
export const mockParameterizedTemplate: SecurityTemplate = {
  id: "parameterized-template",
  name: "Parameterized Template",
  version: "1.0.0",
  category: "custom",
  description: "Template with parameters for testing",
  compliance: [] as any,
  tags: ["test", "parameterized"],
  isBuiltIn: false,
  createdAt: new Date("2024-01-15T00:00:00Z"),
  updatedAt: new Date("2024-01-15T00:00:00Z"),
  rules: {
    permissions: {
      deny: [
        "**/*secret*",
        "{{denyPath}}/**"
      ],
      allow: [
        "Read({{projectPath}}/**)",
        "Write({{projectPath}}/dist/**)",
        "Execute({{allowedCommand}})"
      ],
      ask: [
        "Network({{apiEndpoint}})"
      ]
    },
    metadata: {
      version: "1.0.0",
      timestamp: Date.now(),
      templateId: "parameterized-template",
      name: "{{templateName}}"
    }
  },
  parameters: [
    {
      name: "projectPath",
      type: "string",
      description: "Path to the project",
      required: true,
      defaultValue: "/project"
    },
    {
      name: "templateName", 
      type: "string",
      description: "Name for the template",
      required: true,
      validation: {
        minLength: 1,
        maxLength: 100
      }
    },
    {
      name: "denyPath",
      type: "string",
      description: "Path to deny access to",
      required: false,
      defaultValue: "/restricted"
    },
    {
      name: "allowedCommand",
      type: "string",
      description: "Command to allow execution",
      required: false,
      defaultValue: "node",
      validation: {
        enum: ["node", "npm", "python", "java"]
      }
    },
    {
      name: "apiEndpoint",
      type: "string",
      description: "API endpoint to ask permission for",
      required: false,
      defaultValue: "api.example.com",
      validation: {
        pattern: "^[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"
      }
    }
  ]
};

/**
 * Invalid template for error testing
 */
export const mockInvalidTemplate: Partial<SecurityTemplate> = {
  id: "invalid-template",
  name: "Invalid Template",
  // Missing required fields like version, category, etc.
  rules: {
    permissions: {
      deny: [],
      allow: ["Invalid(pattern)"],  // Invalid permission pattern
      ask: []
    }
  }
};

/**
 * Template with conflicting rules
 */
export const mockConflictingTemplate: SecurityTemplate = {
  id: "conflicting-template",
  name: "Conflicting Template", 
  version: "1.0.0",
  category: "development",
  description: "Template with conflicting rules for testing",
  compliance: [] as any,
  tags: ["test", "conflict"],
  isBuiltIn: false,
  createdAt: new Date("2024-01-15T00:00:00Z"),
  updatedAt: new Date("2024-01-15T00:00:00Z"),
  rules: {
    permissions: {
      deny: [
        "**/secret*/**",
        "Execute(*)"  // Very broad deny
      ],
      allow: [
        "Execute(git)",  // Conflicts with deny Execute(*)
        "Read(**/secret*/public/**)"  // Conflicts with deny **/secret*/**
      ],
      ask: [
        "Execute(npm)"  // Also conflicts with deny Execute(*)
      ]
    },
    metadata: {
      version: "1.0.0",
      timestamp: Date.now(),
      templateId: "conflicting-template",
      name: "Conflicting Template"
    }
  }
};

/**
 * Large template for performance testing
 */
export const mockLargeTemplate: SecurityTemplate = {
  id: "large-template",
  name: "Large Template",
  version: "1.0.0",
  category: "production",
  description: "Large template with many rules for performance testing",
  compliance: ["SOC2", "HIPAA"],
  tags: ["test", "performance", "large"],
  isBuiltIn: false,
  createdAt: new Date("2024-01-15T00:00:00Z"),
  updatedAt: new Date("2024-01-15T00:00:00Z"),
  rules: {
    permissions: {
      deny: Array.from({ length: 500 }, (_, i) => `**/secret${i}*/**`),
      allow: Array.from({ length: 300 }, (_, i) => `Read(/app/public${i}/**)`),
      ask: Array.from({ length: 200 }, (_, i) => `Network(api${i}.example.com)`)
    },
    metadata: {
      version: "1.0.0",
      timestamp: Date.now(),
      templateId: "large-template",
      name: "Large Template"
    }
  },
  parameters: Array.from({ length: 50 }, (_, i) => ({
    name: `param${i}`,
    type: "string" as const,
    description: `Parameter ${i} for testing`,
    required: i < 10,
    defaultValue: `default${i}`
  }))
};

/**
 * Template parameters for testing
 */
export const mockTemplateParameters = {
  valid: {
    projectPath: "/test/project",
    templateName: "Test Configuration",
    allowedCommand: "npm",
    apiEndpoint: "test.api.com"
  },
  invalid: {
    templateName: "", // Violates minLength validation
    allowedCommand: "invalid-command", // Not in enum
    apiEndpoint: "not-a-domain" // Doesn't match pattern
  },
  partial: {
    projectPath: "/partial/project"
    // Missing required templateName
  }
};

/**
 * Expected merge results for different strategies
 */
export const expectedMergeResults = {
  override: {
    rulesCount: 6, // Should match template rule count
    hasBaseRules: false,
    hasTemplateRules: true
  },
  merge: {
    rulesCount: 9, // Base (6) + Template (6) - duplicates (3)
    hasBaseRules: true,
    hasTemplateRules: true
  },
  combine: {
    rulesCount: 12, // Base (6) + Template (6)
    hasBaseRules: true,
    hasTemplateRules: true
  }
};

/**
 * Mock built-in templates (simplified versions of actual ones)
 */
export const mockBuiltInTemplates = {
  development: {
    id: "development",
    name: "Development Environment",
    version: "1.0.0",
    category: "development" as const,
    description: "Development template for testing",
    compliance: [] as any,
    tags: ["development"],
    isBuiltIn: true,
    createdAt: new Date("2024-01-15T00:00:00Z"),
    updatedAt: new Date("2024-01-15T00:00:00Z"),
    rules: {
      permissions: {
        deny: ["**/secret*/**", "Execute(sudo)"],
        allow: ["Read(/project/**)", "Execute(npm)"],
        ask: ["Execute(git push)", "Network(*)"]
      },
      metadata: {
        version: "1.0.0",
        timestamp: Date.now(),
        templateId: "development"
      }
    },
    parameters: []
  },
  production: {
    id: "production", 
    name: "Production Environment",
    version: "1.0.0",
    category: "production" as const,
    description: "Production template for testing",
    compliance: [] as any,
    tags: ["production"],
    isBuiltIn: true,
    createdAt: new Date("2024-01-15T00:00:00Z"),
    updatedAt: new Date("2024-01-15T00:00:00Z"),
    rules: {
      permissions: {
        deny: [
          "**/secret*/**", 
          "**/credential*/**",
          "Execute(sudo)",
          "Execute(rm)",
          "Network(*.internal)"
        ],
        allow: [
          "Read(/app/**)",
          "Execute(node)"
        ],
        ask: [
          "Execute(git push)",
          "Write(**/config/**)"
        ]
      },
      metadata: {
        version: "1.0.0", 
        timestamp: Date.now(),
        templateId: "production"
      }
    },
    parameters: []
  }
};

/**
 * Test scenario configurations
 */
export const testScenarios = {
  basic: {
    name: "Basic template application",
    template: mockTemplate,
    baseConfig: mockBaseConfig,
    parameters: {},
    expectSuccess: true
  },
  parameterized: {
    name: "Template with parameters",
    template: mockParameterizedTemplate,
    baseConfig: mockBaseConfig,
    parameters: mockTemplateParameters.valid,
    expectSuccess: true
  },
  invalidParameters: {
    name: "Template with invalid parameters", 
    template: mockParameterizedTemplate,
    baseConfig: mockBaseConfig,
    parameters: mockTemplateParameters.invalid,
    expectSuccess: false
  },
  missingParameters: {
    name: "Template with missing required parameters",
    template: mockParameterizedTemplate,
    baseConfig: mockBaseConfig,
    parameters: mockTemplateParameters.partial,
    expectSuccess: false
  },
  conflicting: {
    name: "Template with conflicting rules",
    template: mockConflictingTemplate,
    baseConfig: mockBaseConfig,
    parameters: {},
    expectSuccess: true, // Should succeed but with warnings
    expectWarnings: true
  },
  performance: {
    name: "Large template for performance testing",
    template: mockLargeTemplate,
    baseConfig: mockBaseConfig,
    parameters: {},
    expectSuccess: true,
    performanceTarget: 100 // milliseconds
  }
};

/**
 * Mock version scenarios for compatibility testing
 */
export const versionScenarios = {
  compatible: {
    templateVersion: "1.0.0",
    systemVersion: "1.0.0",
    expectCompatible: true
  },
  minorVersionDiff: {
    templateVersion: "1.1.0",
    systemVersion: "1.0.0", 
    expectCompatible: true // Should be compatible with warnings
  },
  majorVersionDiff: {
    templateVersion: "2.0.0",
    systemVersion: "1.0.0",
    expectCompatible: false
  },
  newerSystem: {
    templateVersion: "1.0.0",
    systemVersion: "2.0.0",
    expectCompatible: true
  }
};