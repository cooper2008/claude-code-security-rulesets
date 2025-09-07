/**
 * IDE Extensions Module Exports
 * Provides access to all extension components and utilities
 */

// Base extension architecture
export * from './base';

// Diagnostics system
export * from './diagnostics';

// Language Server Protocol
export * from './lsp-server';

// Command system
export * from './commands';

// UI components
export * from './ui';

// VS Code implementation
export * from './vscode';

// Re-export types from validation engine for convenience
export { ValidationResult, ValidationError, ValidationWarning, ClaudeCodeConfiguration } from '../types';
export { ValidationEngine } from '../validation/engine';

/**
 * Extension factory for creating platform-specific extensions
 */
export interface ExtensionFactory {
  /** Create extension for VS Code */
  createVSCodeExtension(context: any): Promise<any>;
  /** Create Language Server for multi-IDE support */
  createLanguageServer(config?: any): any;
}

/**
 * Default extension factory implementation
 */
export class DefaultExtensionFactory implements ExtensionFactory {
  /**
   * Create VS Code extension instance
   */
  async createVSCodeExtension(context: any): Promise<any> {
    const { VSCodeExtension } = await import('./vscode');
    return new VSCodeExtension(context);
  }

  /**
   * Create Language Server instance
   */
  createLanguageServer(config?: any): any {
    const { ClaudeCodeLanguageServer } = require('./lsp-server');
    return new ClaudeCodeLanguageServer(config);
  }
}

/**
 * Singleton factory instance
 */
export const extensionFactory = new DefaultExtensionFactory();

/**
 * Utility function to detect IDE platform
 */
export function detectPlatform(): string {
  // VS Code detection
  if (typeof process !== 'undefined' && process.env.VSCODE_PID) {
    return 'vscode';
  }

  // IntelliJ/WebStorm detection (via LSP)
  if (typeof process !== 'undefined' && process.env.IDEA_INITIAL_DIRECTORY) {
    return 'intellij';
  }

  // Sublime Text detection (via LSP)
  if (typeof process !== 'undefined' && process.env.SUBLIME_TEXT_PATH) {
    return 'sublime';
  }

  // Vim/Neovim detection (via LSP)
  if (typeof process !== 'undefined' && (process.env.VIM || process.env.NVIM_LISTEN_ADDRESS)) {
    return 'vim';
  }

  // Emacs detection (via LSP)
  if (typeof process !== 'undefined' && process.env.EMACS) {
    return 'emacs';
  }

  // Default to LSP server for unknown platforms
  return 'lsp';
}

/**
 * Extension capabilities by platform
 */
export const PLATFORM_CAPABILITIES = {
  vscode: {
    realTimeValidation: true,
    syntaxHighlighting: true,
    diagnostics: true,
    codeActions: true,
    completion: true,
    hover: true,
    statusBar: true,
    commands: true,
    settingsUI: true
  },
  intellij: {
    realTimeValidation: true,
    syntaxHighlighting: true,
    diagnostics: true,
    codeActions: true,
    completion: true,
    hover: true,
    statusBar: false,
    commands: true,
    settingsUI: false
  },
  sublime: {
    realTimeValidation: true,
    syntaxHighlighting: true,
    diagnostics: true,
    codeActions: false,
    completion: true,
    hover: true,
    statusBar: false,
    commands: false,
    settingsUI: false
  },
  vim: {
    realTimeValidation: true,
    syntaxHighlighting: false,
    diagnostics: true,
    codeActions: false,
    completion: true,
    hover: true,
    statusBar: false,
    commands: false,
    settingsUI: false
  },
  emacs: {
    realTimeValidation: true,
    syntaxHighlighting: false,
    diagnostics: true,
    codeActions: true,
    completion: true,
    hover: true,
    statusBar: false,
    commands: true,
    settingsUI: false
  },
  lsp: {
    realTimeValidation: true,
    syntaxHighlighting: false,
    diagnostics: true,
    codeActions: true,
    completion: true,
    hover: true,
    statusBar: false,
    commands: false,
    settingsUI: false
  }
};

/**
 * Get platform capabilities
 */
export function getPlatformCapabilities(platform?: string): any {
  const detectedPlatform = platform || detectPlatform();
  return PLATFORM_CAPABILITIES[detectedPlatform as keyof typeof PLATFORM_CAPABILITIES] || PLATFORM_CAPABILITIES.lsp;
}

/**
 * Extension metadata
 */
export const EXTENSION_METADATA = {
  name: 'Claude Code Security Extensions',
  version: '1.0.0',
  description: 'IDE extensions for Claude Code security validation',
  author: 'Claude Code Team',
  homepage: 'https://github.com/claude-code/security-extensions',
  supportedPlatforms: Object.keys(PLATFORM_CAPABILITIES),
  features: [
    'Real-time validation',
    'Syntax highlighting',
    'Error diagnostics',
    'Quick fixes',
    'Code completion',
    'Hover information',
    'Command palette integration',
    'Multi-IDE support via LSP'
  ]
};

/**
 * Common extension configuration
 */
export interface CommonExtensionConfig {
  /** Enable real-time validation */
  realTimeValidation?: boolean;
  /** Validation delay in milliseconds */
  validationDelay?: number;
  /** Show error decorations */
  showDecorations?: boolean;
  /** Enable syntax highlighting */
  syntaxHighlighting?: boolean;
  /** Enable quick fixes */
  quickFixes?: boolean;
  /** Show status bar */
  statusBar?: boolean;
  /** Security level */
  securityLevel?: 'permissive' | 'balanced' | 'strict';
  /** Conflict detection level */
  conflictDetection?: 'disabled' | 'warnings' | 'errors';
}

/**
 * Default extension configuration
 */
export const DEFAULT_EXTENSION_CONFIG: Required<CommonExtensionConfig> = {
  realTimeValidation: true,
  validationDelay: 500,
  showDecorations: true,
  syntaxHighlighting: true,
  quickFixes: true,
  statusBar: true,
  securityLevel: 'balanced',
  conflictDetection: 'errors'
};

/**
 * Security templates for quick setup
 */
export const SECURITY_TEMPLATES = {
  development: {
    name: 'Development Environment',
    description: 'Permissive rules suitable for development',
    permissions: {
      deny: ['exec', 'shell', '../../../*'],
      allow: ['src/**/*', 'test/**/*', '*.json', '*.md'],
      ask: ['package.json', 'tsconfig.json', '.env*']
    }
  },
  production: {
    name: 'Production Environment',
    description: 'Strict rules for production environments',
    permissions: {
      deny: ['*', 'exec', 'shell', 'eval', '../*', '/etc/*'],
      allow: ['public/**/*', 'static/**/*'],
      ask: []
    }
  },
  enterprise: {
    name: 'Enterprise Security',
    description: 'Maximum security for enterprise use',
    permissions: {
      deny: [
        'exec', 'shell', 'cmd', 'powershell', 'eval',
        '../*', '/etc/*', '/usr/*', '/root/*',
        '*.exe', '*.bat', '*.sh', '*.ps1'
      ],
      allow: [
        'src/**/*.js', 'src/**/*.ts', 'src/**/*.json',
        'public/**/*', 'assets/**/*'
      ],
      ask: [
        'package.json', 'tsconfig.json', '*.config.*',
        'Dockerfile', 'docker-compose.*'
      ]
    }
  }
};

/**
 * Validation presets for different security levels
 */
export const VALIDATION_PRESETS = {
  permissive: {
    enforceZeroBypass: false,
    detectWeakPatterns: false,
    requireDenyRules: false,
    conflictSeverity: 'warning'
  },
  balanced: {
    enforceZeroBypass: true,
    detectWeakPatterns: true,
    requireDenyRules: false,
    conflictSeverity: 'error'
  },
  strict: {
    enforceZeroBypass: true,
    detectWeakPatterns: true,
    requireDenyRules: true,
    conflictSeverity: 'error'
  }
};

/**
 * Utility functions
 */
export const utils = {
  /**
   * Create extension config from user preferences
   */
  createExtensionConfig(
    platform: string,
    userConfig?: Partial<CommonExtensionConfig>
  ): ExtensionConfig {
    const capabilities = getPlatformCapabilities(platform);
    const config = { ...DEFAULT_EXTENSION_CONFIG, ...userConfig };

    return {
      id: 'claude-code-security',
      name: 'Claude Code Security',
      version: EXTENSION_METADATA.version,
      platform: platform as any,
      realTimeValidation: config.realTimeValidation && capabilities.realTimeValidation,
      validationDelay: config.validationDelay,
      showDecorations: config.showDecorations && capabilities.diagnostics,
      syntaxHighlighting: config.syntaxHighlighting && capabilities.syntaxHighlighting,
      quickFixes: config.quickFixes && capabilities.codeActions,
      statusBar: config.statusBar && capabilities.statusBar
    };
  },

  /**
   * Get validation config for security level
   */
  getValidationConfig(securityLevel: keyof typeof VALIDATION_PRESETS): any {
    return VALIDATION_PRESETS[securityLevel] || VALIDATION_PRESETS.balanced;
  },

  /**
   * Get security template by name
   */
  getSecurityTemplate(templateName: keyof typeof SECURITY_TEMPLATES): any {
    return SECURITY_TEMPLATES[templateName];
  },

  /**
   * Validate platform support
   */
  isPlatformSupported(platform: string): boolean {
    return platform in PLATFORM_CAPABILITIES;
  },

  /**
   * Get recommended features for platform
   */
  getRecommendedFeatures(platform: string): string[] {
    const capabilities = getPlatformCapabilities(platform);
    return Object.entries(capabilities)
      .filter(([_, supported]) => supported)
      .map(([feature, _]) => feature);
  }
};

/**
 * Extension lifecycle hooks
 */
export interface ExtensionHooks {
  /** Called before extension activation */
  onBeforeActivate?(): Promise<void>;
  /** Called after extension activation */
  onAfterActivate?(): Promise<void>;
  /** Called before extension deactivation */
  onBeforeDeactivate?(): Promise<void>;
  /** Called after extension deactivation */
  onAfterDeactivate?(): Promise<void>;
}

/**
 * Extension registry for managing multiple platform extensions
 */
export class ExtensionRegistry {
  private extensions = new Map<string, any>();
  private hooks: ExtensionHooks = {};

  /**
   * Register extension for platform
   */
  register(platform: string, extension: any): void {
    this.extensions.set(platform, extension);
  }

  /**
   * Get extension for platform
   */
  get(platform: string): any | undefined {
    return this.extensions.get(platform);
  }

  /**
   * Check if platform is registered
   */
  has(platform: string): boolean {
    return this.extensions.has(platform);
  }

  /**
   * Set lifecycle hooks
   */
  setHooks(hooks: ExtensionHooks): void {
    this.hooks = { ...this.hooks, ...hooks };
  }

  /**
   * Activate extension for current platform
   */
  async activate(): Promise<void> {
    await this.hooks.onBeforeActivate?.();
    
    const platform = detectPlatform();
    const extension = this.extensions.get(platform);
    
    if (extension && typeof extension.activate === 'function') {
      await extension.activate();
    }
    
    await this.hooks.onAfterActivate?.();
  }

  /**
   * Deactivate all extensions
   */
  async deactivate(): Promise<void> {
    await this.hooks.onBeforeDeactivate?.();
    
    for (const extension of this.extensions.values()) {
      if (extension && typeof extension.deactivate === 'function') {
        await extension.deactivate();
      }
    }
    
    await this.hooks.onAfterDeactivate?.();
  }

  /**
   * Get registry statistics
   */
  getStats(): { platforms: number; registered: string[] } {
    return {
      platforms: this.extensions.size,
      registered: Array.from(this.extensions.keys())
    };
  }
}

/**
 * Global extension registry instance
 */
export const extensionRegistry = new ExtensionRegistry();

/**
 * Version information
 */
export const VERSION = EXTENSION_METADATA.version;
export const BUILD_DATE = new Date().toISOString();

/**
 * Debug utilities
 */
export const debug = {
  /**
   * Log extension information
   */
  logExtensionInfo(): void {
    console.log(`Claude Code Security Extensions v${VERSION}`);
    console.log(`Platform: ${detectPlatform()}`);
    console.log(`Build Date: ${BUILD_DATE}`);
    console.log(`Supported Platforms: ${EXTENSION_METADATA.supportedPlatforms.join(', ')}`);
  },

  /**
   * Get diagnostic information
   */
  getDiagnosticInfo(): any {
    const platform = detectPlatform();
    return {
      version: VERSION,
      platform,
      capabilities: getPlatformCapabilities(platform),
      buildDate: BUILD_DATE,
      registeredExtensions: extensionRegistry.getStats()
    };
  }
};

// Export everything for comprehensive access
export default {
  extensionFactory,
  extensionRegistry,
  detectPlatform,
  getPlatformCapabilities,
  utils,
  debug,
  EXTENSION_METADATA,
  PLATFORM_CAPABILITIES,
  SECURITY_TEMPLATES,
  VALIDATION_PRESETS,
  DEFAULT_EXTENSION_CONFIG,
  VERSION,
  BUILD_DATE
};