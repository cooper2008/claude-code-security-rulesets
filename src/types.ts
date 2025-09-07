/**
 * Core types for Claude Code Security Rulesets Generator
 */

export interface ClaudeCodeConfiguration {
  permissions?: {
    allow?: string[];
    deny?: string[];
    ask?: string[];
  };
  metadata?: {
    version?: string;
    timestamp?: number;
    name?: string;
    environment?: string;
    templateId?: string;
    signature?: string;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  conflicts: RuleConflict[];
  suggestions: string[];
  performance: {
    validationTime: number;
    rulesProcessed: number;
    performanceTarget: {
      target: number;
      achieved: boolean;
    };
  };
}

export interface ValidationError {
  type: string;
  message: string;
  rule?: string;
  severity?: 'error' | 'warning';
}

export interface ValidationWarning {
  type: string;
  message: string;
  rule?: string;
}

export interface RuleConflict {
  type: string;
  message: string;
  rules: string[];
}

export type Environment = 'development' | 'test' | 'staging' | 'production';

export interface DeploymentStatus {
  id: string;
  configurationId: string;
  environment: Environment;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  deployedBy: string;
  error?: string;
}

// Template system types
export interface SecurityTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  compliance: ComplianceFramework[];
  tags: string[];
  permissions: {
    deny: string[];
    allow: string[];
    ask: string[];
  };
  metadata: {
    version: string;
    author?: string;
    lastUpdated?: string;
  };
}

export type TemplateCategory = 'development' | 'production' | 'compliance' | 'custom';
export type ComplianceFramework = 'SOC2' | 'HIPAA' | 'PCI-DSS' | 'GDPR' | 'ISO27001';

export interface TemplateParameter {
  name: string;
  type: 'string' | 'boolean' | 'number' | 'array';
  description: string;
  required: boolean;
  defaultValue?: unknown;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}