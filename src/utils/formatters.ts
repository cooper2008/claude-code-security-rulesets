/**
 * Formatting utilities for better user experience
 * Includes duration formatting, progress indicators, and display helpers
 */

/**
 * Convert milliseconds to human-readable duration format
 * Examples:
 *   formatDuration(123) => "123ms"
 *   formatDuration(1500) => "1.5s" 
 *   formatDuration(65000) => "1m 5s"
 *   formatDuration(3661000) => "1h 1m 1s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const remainingSeconds = seconds % 60;
  const remainingMinutes = minutes % 60;

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  
  if (remainingMinutes > 0) {
    parts.push(`${remainingMinutes}m`);
  }
  
  // For sub-10 second durations, show decimal precision for seconds
  if (hours === 0 && minutes === 0 && ms >= 1000) {
    const preciseSecs = (ms / 1000).toFixed(1);
    return `${preciseSecs}s`;
  }
  
  if (remainingSeconds > 0) {
    parts.push(`${remainingSeconds}s`);
  }

  // If no parts (edge case), fall back to ms
  return parts.length > 0 ? parts.join(' ') : `${ms}ms`;
}

/**
 * Format file count with appropriate pluralization
 * Examples:
 *   formatFileCount(1) => "1 file"
 *   formatFileCount(5) => "5 files"
 */
export function formatFileCount(count: number): string {
  return `${count} ${count === 1 ? 'file' : 'files'}`;
}

/**
 * Format rule count with appropriate pluralization
 * Examples:
 *   formatRuleCount(1) => "1 rule"
 *   formatRuleCount(3) => "3 rules"
 */
export function formatRuleCount(count: number): string {
  return `${count} ${count === 1 ? 'rule' : 'rules'}`;
}

/**
 * Generate progress indicator for long-running operations
 * Examples:
 *   getProgressIndicator(25, 100) => "◆◆◆◇◇◇◇◇◇◇ 25%"
 *   getProgressIndicator(75, 100) => "◆◆◆◆◆◆◆◇◇◇ 75%"
 */
export function getProgressIndicator(current: number, total: number, width: number = 10): string {
  if (total === 0) return '◇'.repeat(width) + ' 0%';
  
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  
  const bar = '◆'.repeat(filled) + '◇'.repeat(empty);
  return `${bar} ${percentage}%`;
}

/**
 * Format file size in human-readable format
 * Examples:
 *   formatFileSize(1024) => "1.0 KB"
 *   formatFileSize(1536) => "1.5 KB"
 *   formatFileSize(1048576) => "1.0 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const base = 1024;
  const index = Math.floor(Math.log(bytes) / Math.log(base));
  const value = bytes / Math.pow(base, index);
  
  return `${value.toFixed(1)} ${units[index]}`;
}

/**
 * Create a timestamp for backups and logs
 * Format: YYYY-MM-DD_HH-MM-SS
 * Examples:
 *   createTimestamp() => "2024-09-07_14-30-45"
 */
export function createTimestamp(): string {
  const now = new Date();
  return now.toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .split('.')[0]; // Remove milliseconds
}

/**
 * Calculate estimated time remaining for operations
 * Examples:
 *   calculateETA(processed=25, total=100, elapsedMs=5000) => "15.0s remaining"
 */
export function calculateETA(processed: number, total: number, elapsedMs: number): string {
  if (processed === 0) return 'calculating...';
  
  const rate = processed / elapsedMs; // items per millisecond
  const remaining = total - processed;
  const etaMs = remaining / rate;
  
  return `${formatDuration(etaMs)} remaining`;
}

/**
 * Truncate text with ellipsis for display purposes
 * Examples:
 *   truncateText("very long text here", 10) => "very lon..."
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format configuration level with appropriate emoji and description
 * Examples:
 *   formatConfigLevel('global') => "🌐 Global (affects all projects)"
 *   formatConfigLevel('local') => "📁 Local (current project only)"
 */
export function formatConfigLevel(level: 'global' | 'local'): string {
  switch (level) {
    case 'global':
      return '🌐 Global (affects all projects)';
    case 'local':
      return '📁 Local (current project only)';
    default:
      return level;
  }
}

/**
 * Format security risk level with appropriate colors and icons
 * Examples:
 *   formatRiskLevel('CRITICAL') => "🚨 CRITICAL"
 *   formatRiskLevel('HIGH') => "⚠️  HIGH"
 */
export function formatRiskLevel(level: string): string {
  switch (level.toLowerCase()) {
    case 'critical':
      return '🚨 CRITICAL';
    case 'high':
      return '⚠️  HIGH';
    case 'medium':
      return '⚡ MEDIUM';
    case 'low':
      return '💡 LOW';
    default:
      return level;
  }
}