/**
 * Configuration file discovery system
 * Searches for Claude Code settings.json files in project hierarchy
 */

import * as fs from 'fs/promises';
import type { Stats } from 'fs';
import * as path from 'path';
import { ClaudeCodeConfiguration } from '../types/index';

/**
 * Configuration sources in order of discovery
 */
export interface ConfigurationSource {
  /** Path to the configuration file */
  path: string;
  /** Configuration level for hierarchy */
  level: ConfigurationLevel;
  /** Whether the file exists */
  exists: boolean;
  /** File modification time for caching */
  modifiedTime?: Date;
  /** File size for integrity checking */
  size?: number;
}

/**
 * Configuration hierarchy levels
 */
export type ConfigurationLevel = 'enterprise' | 'system' | 'project' | 'user';

/**
 * Discovery options for finding configuration files
 */
export interface DiscoveryOptions {
  /** Starting directory for search */
  startDir?: string;
  /** Maximum directory depth to search */
  maxDepth?: number;
  /** Additional configuration file names to search for */
  additionalNames?: string[];
  /** Whether to follow symbolic links */
  followSymlinks?: boolean;
  /** Include non-existent files in results */
  includeNonExistent?: boolean;
  /** Cache results for performance */
  useCache?: boolean;
  /** Custom environment variables for path resolution */
  envVars?: Record<string, string | undefined>;
}

/**
 * Default configuration file names in priority order
 */
const DEFAULT_CONFIG_NAMES = [
  '.claude/settings.json',        // Official: Shared project settings
  '.claude/settings.local.json', // Official: Local project settings
  'settings.json',                // Legacy fallback
  '.clauderc.json'                // Legacy fallback
];

/**
 * Configuration discovery cache
 */
const discoveryCache = new Map<string, { sources: ConfigurationSource[]; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

/**
 * Discovers all Claude Code configuration files in the project hierarchy
 * 
 * @param options Discovery options
 * @returns Promise resolving to array of configuration sources
 */
export async function discoverConfigurations(
  options: DiscoveryOptions = {}
): Promise<ConfigurationSource[]> {
  const {
    startDir = process.cwd(),
    maxDepth = 10,
    additionalNames = [],
    followSymlinks = false,
    includeNonExistent = false,
    useCache = true,
    envVars = process.env as Record<string, string | undefined>
  } = options;

  const cacheKey = JSON.stringify({ startDir, maxDepth, additionalNames, followSymlinks });
  
  // Check cache first
  if (useCache) {
    const cached = discoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.sources;
    }
  }

  const configNames = [...DEFAULT_CONFIG_NAMES, ...additionalNames];
  const sources: ConfigurationSource[] = [];

  // Enterprise-level configuration (system-wide)
  const enterprisePaths = getEnterprisePaths(envVars);
  for (const enterprisePath of enterprisePaths) {
    const source = await checkConfigurationPath(enterprisePath, 'enterprise', followSymlinks);
    if (source && (includeNonExistent || source.exists)) {
      sources.push(source);
    }
  }

  // System-level configuration
  const systemPaths = getSystemPaths(envVars);
  for (const systemPath of systemPaths) {
    const source = await checkConfigurationPath(systemPath, 'system', followSymlinks);
    if (source && (includeNonExistent || source.exists)) {
      sources.push(source);
    }
  }

  // Project hierarchy search (bottom-up from startDir)
  const projectSources = await searchProjectHierarchy(
    startDir,
    configNames,
    maxDepth,
    followSymlinks,
    includeNonExistent
  );
  sources.push(...projectSources);

  // User-level configuration
  const userPaths = getUserPaths(envVars);
  for (const userPath of userPaths) {
    const source = await checkConfigurationPath(userPath, 'user', followSymlinks);
    if (source && (includeNonExistent || source.exists)) {
      sources.push(source);
    }
  }

  // Cache results
  if (useCache) {
    discoveryCache.set(cacheKey, {
      sources,
      timestamp: Date.now()
    });
  }

  return sources;
}

/**
 * Gets enterprise-level configuration paths
 */
function getEnterprisePaths(envVars: Record<string, string | undefined>): string[] {
  const paths: string[] = [];
  
  // Enterprise configuration from environment variable
  if (envVars.CLAUDE_ENTERPRISE_CONFIG) {
    paths.push(envVars.CLAUDE_ENTERPRISE_CONFIG);
  }
  
  // Standard enterprise locations per official Claude Code documentation
  if (process.platform === 'darwin') {
    paths.push('/Library/Application Support/ClaudeCode/managed-settings.json');
  } else if (process.platform === 'win32') {
    paths.push('C:\\ProgramData\\ClaudeCode\\managed-settings.json');
  } else {
    // Linux and WSL
    paths.push('/etc/claude-code/managed-settings.json');
  }

  return paths;
}

/**
 * Gets system-level configuration paths
 */
function getSystemPaths(envVars: Record<string, string | undefined>): string[] {
  const paths: string[] = [];
  
  if (envVars.CLAUDE_SYSTEM_CONFIG) {
    paths.push(envVars.CLAUDE_SYSTEM_CONFIG);
  }

  if (process.platform === 'win32') {
    if (envVars.PROGRAMFILES) {
      paths.push(path.join(envVars.PROGRAMFILES, 'Claude', 'settings.json'));
    }
  } else {
    paths.push('/opt/claude/settings.json');
  }

  return paths;
}

/**
 * Gets user-level configuration paths
 */
function getUserPaths(envVars: Record<string, string | undefined>): string[] {
  const paths: string[] = [];
  
  if (envVars.CLAUDE_USER_CONFIG) {
    paths.push(envVars.CLAUDE_USER_CONFIG);
  }

  const homeDir = envVars.HOME || envVars.USERPROFILE;
  if (homeDir) {
    paths.push(
      path.join(homeDir, '.claude', 'settings.json'),
      path.join(homeDir, '.config', 'claude', 'settings.json'),
      path.join(homeDir, '.clauderc.json')
    );
  }

  return paths;
}

/**
 * Searches project hierarchy for configuration files
 */
async function searchProjectHierarchy(
  startDir: string,
  configNames: string[],
  maxDepth: number,
  followSymlinks: boolean,
  includeNonExistent: boolean
): Promise<ConfigurationSource[]> {
  const sources: ConfigurationSource[] = [];
  let currentDir = path.resolve(startDir);
  let depth = 0;

  while (depth < maxDepth) {
    for (const configName of configNames) {
      const configPath = path.join(currentDir, configName);
      const source = await checkConfigurationPath(configPath, 'project', followSymlinks);
      
      if (source && (includeNonExistent || source.exists)) {
        sources.push(source);
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached filesystem root
    }
    
    currentDir = parentDir;
    depth++;
  }

  return sources;
}

/**
 * Checks a specific configuration path and returns source info
 */
async function checkConfigurationPath(
  configPath: string,
  level: ConfigurationLevel,
  followSymlinks: boolean
): Promise<ConfigurationSource | null> {
  try {
    const resolvedPath = path.resolve(configPath);
    let stats: Stats;

    try {
      stats = await fs.stat(resolvedPath);
      
      // Handle symbolic links
      if (stats.isSymbolicLink() && !followSymlinks) {
        return null;
      }
      
      if (stats.isSymbolicLink() && followSymlinks) {
        const realPath = await fs.realpath(resolvedPath);
        stats = await fs.stat(realPath);
      }

      if (!stats.isFile()) {
        return null;
      }

      return {
        path: resolvedPath,
        level,
        exists: true,
        modifiedTime: stats.mtime,
        size: stats.size
      };
    } catch (error) {
      // File doesn't exist, but include in results for potential creation
      return {
        path: resolvedPath,
        level,
        exists: false
      };
    }
  } catch (error) {
    // Invalid path
    return null;
  }
}

/**
 * Loads configuration from a source
 * 
 * @param source Configuration source
 * @returns Promise resolving to configuration object or null
 */
export async function loadConfigurationFromSource(
  source: ConfigurationSource
): Promise<ClaudeCodeConfiguration | null> {
  if (!source.exists) {
    return null;
  }

  try {
    const content = await fs.readFile(source.path, 'utf8');
    const config = JSON.parse(content) as ClaudeCodeConfiguration;
    
    // Add metadata about the source
    if (!config.metadata) {
      config.metadata = {
        version: '1.0.0',
        timestamp: Date.now()
      };
    }

    return config;
  } catch (error) {
    throw new Error(`Failed to load configuration from ${source.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validates that a configuration path is safe to use
 * 
 * @param configPath Path to validate
 * @returns Whether the path is safe
 */
export function isConfigurationPathSafe(configPath: string): boolean {
  const resolvedPath = path.resolve(configPath);
  
  // Prevent directory traversal attacks
  if (resolvedPath.includes('..')) {
    return false;
  }
  
  // Ensure path is within allowed directories
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const cwd = process.cwd();
  
  return (
    resolvedPath.startsWith(cwd) ||
    (homeDir && resolvedPath.startsWith(homeDir)) ||
    resolvedPath.startsWith('/etc/claude') ||
    resolvedPath.startsWith('/opt/claude') ||
    (process.platform === 'win32' && resolvedPath.startsWith('C:\\ProgramData\\Claude'))
  );
}

/**
 * Clears the discovery cache
 */
export function clearDiscoveryCache(): void {
  discoveryCache.clear();
}

/**
 * Gets cache statistics for monitoring
 */
export function getDiscoveryCacheStats(): { size: number; hitRate: number } {
  return {
    size: discoveryCache.size,
    hitRate: 0 // TODO: Implement hit rate tracking
  };
}