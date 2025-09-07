/**
 * Filter Engine for Enterprise Distribution System
 * Advanced filtering and targeting for 1000+ developers
 */

import type { 
  DistributionTarget,
  DeveloperFilter,
  FilterCriteria,
  DeveloperField,
  FilterOperator
} from './types';

/**
 * Filter evaluation result
 */
export interface FilterResult {
  matched: boolean;
  reason?: string;
  matchedCriteria: string[];
  failedCriteria: string[];
}

/**
 * Filter statistics
 */
export interface FilterStats {
  totalTargets: number;
  matchedTargets: number;
  matchRate: number;
  criteriaStats: Record<string, {
    applied: number;
    matched: number;
    matchRate: number;
  }>;
}

/**
 * Advanced filter engine for enterprise target selection
 */
export class FilterEngine {
  private filterCache = new Map<string, FilterResult>();
  private statsCache = new Map<string, FilterStats>();

  /**
   * Apply filters to targets
   */
  async applyFilters(
    targets: DistributionTarget[],
    filters: DeveloperFilter[]
  ): Promise<DistributionTarget[]> {
    if (filters.length === 0) {
      return targets;
    }

    const filteredTargets: DistributionTarget[] = [];
    const stats: FilterStats = {
      totalTargets: targets.length,
      matchedTargets: 0,
      matchRate: 0,
      criteriaStats: {}
    };

    for (const target of targets) {
      const result = await this.evaluateTarget(target, filters);
      
      if (result.matched) {
        filteredTargets.push(target);
        stats.matchedTargets++;
      }

      // Update criteria statistics
      [...result.matchedCriteria, ...result.failedCriteria].forEach(criteria => {
        if (!stats.criteriaStats[criteria]) {
          stats.criteriaStats[criteria] = { applied: 0, matched: 0, matchRate: 0 };
        }
        stats.criteriaStats[criteria].applied++;
        if (result.matchedCriteria.includes(criteria)) {
          stats.criteriaStats[criteria].matched++;
        }
      });
    }

    // Calculate final statistics
    stats.matchRate = stats.totalTargets > 0 ? (stats.matchedTargets / stats.totalTargets) * 100 : 0;
    
    Object.values(stats.criteriaStats).forEach(criteriaStats => {
      criteriaStats.matchRate = criteriaStats.applied > 0 ? 
        (criteriaStats.matched / criteriaStats.applied) * 100 : 0;
    });

    // Cache statistics
    const filtersKey = this.getFiltersKey(filters);
    this.statsCache.set(filtersKey, stats);

    return filteredTargets;
  }

  /**
   * Evaluate single target against filters
   */
  async evaluateTarget(
    target: DistributionTarget,
    filters: DeveloperFilter[]
  ): Promise<FilterResult> {
    const cacheKey = `${target.id}-${this.getFiltersKey(filters)}`;
    const cached = this.filterCache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    let overallMatch = false;
    const matchedCriteria: string[] = [];
    const failedCriteria: string[] = [];
    let reason = '';

    // Apply each filter (OR logic between filters)
    for (const filter of filters) {
      const filterResult = this.evaluateFilter(target, filter);
      
      if (filterResult.matched) {
        overallMatch = true;
        matchedCriteria.push(...filterResult.matchedCriteria);
        if (!reason) reason = filterResult.reason || 'Matched filter criteria';
      } else {
        failedCriteria.push(...filterResult.failedCriteria);
        if (!overallMatch && !reason) reason = filterResult.reason || 'Did not match any criteria';
      }

      // If this is an include filter and it matches, we can stop
      if (filter.type === 'include' && filterResult.matched) {
        break;
      }

      // If this is an exclude filter and it matches, we exclude the target
      if (filter.type === 'exclude' && filterResult.matched) {
        overallMatch = false;
        reason = 'Excluded by filter criteria';
        break;
      }
    }

    const result: FilterResult = {
      matched: overallMatch,
      reason,
      matchedCriteria: [...new Set(matchedCriteria)],
      failedCriteria: [...new Set(failedCriteria)]
    };

    this.filterCache.set(cacheKey, result);
    return result;
  }

  /**
   * Evaluate single filter against target
   */
  private evaluateFilter(target: DistributionTarget, filter: DeveloperFilter): FilterResult {
    const matchedCriteria: string[] = [];
    const failedCriteria: string[] = [];
    
    let criteriaResults: boolean[] = [];

    for (const criteria of filter.criteria) {
      const criteriaKey = `${criteria.field}:${criteria.operator}:${criteria.value}`;
      const matches = this.evaluateCriteria(target, criteria);
      
      criteriaResults.push(matches);
      
      if (matches) {
        matchedCriteria.push(criteriaKey);
      } else {
        failedCriteria.push(criteriaKey);
      }
    }

    // Apply logic (AND/OR) to criteria results
    const filterMatches = filter.logic === 'and' ? 
      criteriaResults.every(r => r) : 
      criteriaResults.some(r => r);

    return {
      matched: filterMatches,
      reason: filterMatches ? 
        `Matched ${filter.logic.toUpperCase()} criteria` : 
        `Failed ${filter.logic.toUpperCase()} criteria`,
      matchedCriteria,
      failedCriteria
    };
  }

  /**
   * Evaluate single criteria against target
   */
  private evaluateCriteria(target: DistributionTarget, criteria: FilterCriteria): boolean {
    const targetValue = this.getTargetFieldValue(target, criteria.field);
    
    if (targetValue === undefined || targetValue === null) {
      return false;
    }

    return this.evaluateOperator(targetValue, criteria.operator, criteria.value);
  }

  /**
   * Get field value from target
   */
  private getTargetFieldValue(target: DistributionTarget, field: DeveloperField): any {
    const fieldMap: Record<DeveloperField, any> = {
      department: target.metadata.developer?.department,
      team: target.metadata.developer?.team,
      role: target.metadata.developer?.role,
      location: target.metadata.environment?.region,
      'machine-type': target.metadata.machine?.type,
      environment: target.metadata.environment?.type,
      project: target.metadata.tags?.project,
      'skill-level': target.metadata.developer?.skillLevel || target.metadata.tags?.['skill-level'],
      'access-level': target.metadata.developer?.accessLevel || target.metadata.tags?.['access-level']
    };

    return fieldMap[field];
  }

  /**
   * Evaluate operator against values
   */
  private evaluateOperator(
    targetValue: any,
    operator: FilterOperator,
    filterValue: string | string[] | number | boolean
  ): boolean {
    const targetStr = String(targetValue).toLowerCase();
    
    switch (operator) {
      case 'equals':
        return targetStr === String(filterValue).toLowerCase();
      
      case 'not-equals':
        return targetStr !== String(filterValue).toLowerCase();
      
      case 'contains':
        return targetStr.includes(String(filterValue).toLowerCase());
      
      case 'not-contains':
        return !targetStr.includes(String(filterValue).toLowerCase());
      
      case 'starts-with':
        return targetStr.startsWith(String(filterValue).toLowerCase());
      
      case 'ends-with':
        return targetStr.endsWith(String(filterValue).toLowerCase());
      
      case 'in':
        if (Array.isArray(filterValue)) {
          return filterValue.some(v => String(v).toLowerCase() === targetStr);
        }
        return false;
      
      case 'not-in':
        if (Array.isArray(filterValue)) {
          return !filterValue.some(v => String(v).toLowerCase() === targetStr);
        }
        return true;
      
      case 'greater-than':
        const targetNum = this.parseNumber(targetValue);
        const filterNum = this.parseNumber(filterValue);
        return targetNum !== null && filterNum !== null && targetNum > filterNum;
      
      case 'less-than':
        const targetNumLt = this.parseNumber(targetValue);
        const filterNumLt = this.parseNumber(filterValue);
        return targetNumLt !== null && filterNumLt !== null && targetNumLt < filterNumLt;
      
      default:
        return false;
    }
  }

  /**
   * Get filter statistics
   */
  getFilterStats(filters: DeveloperFilter[]): FilterStats | null {
    const filtersKey = this.getFiltersKey(filters);
    return this.statsCache.get(filtersKey) || null;
  }

  /**
   * Create smart filters based on target analysis
   */
  createSmartFilters(targets: DistributionTarget[]): {
    recommended: DeveloperFilter[];
    analysis: {
      departments: Record<string, number>;
      teams: Record<string, number>;
      roles: Record<string, number>;
      environments: Record<string, number>;
      machineTypes: Record<string, number>;
    };
  } {
    const analysis = {
      departments: {} as Record<string, number>,
      teams: {} as Record<string, number>,
      roles: {} as Record<string, number>,
      environments: {} as Record<string, number>,
      machineTypes: {} as Record<string, number>
    };

    // Analyze target distribution
    targets.forEach(target => {
      const dept = target.metadata.developer?.department;
      const team = target.metadata.developer?.team;
      const role = target.metadata.developer?.role;
      const env = target.metadata.environment?.type;
      const machineType = target.metadata.machine?.type;

      if (dept) analysis.departments[dept] = (analysis.departments[dept] || 0) + 1;
      if (team) analysis.teams[team] = (analysis.teams[team] || 0) + 1;
      if (role) analysis.roles[role] = (analysis.roles[role] || 0) + 1;
      if (env) analysis.environments[env] = (analysis.environments[env] || 0) + 1;
      if (machineType) analysis.machineTypes[machineType] = (analysis.machineTypes[machineType] || 0) + 1;
    });

    // Generate recommended filters
    const recommended: DeveloperFilter[] = [];

    // Common filter patterns
    if (Object.keys(analysis.departments).length > 1) {
      // Multiple departments - suggest engineering filter
      if (analysis.departments['Engineering'] || analysis.departments['engineering']) {
        recommended.push({
          criteria: [{
            field: 'department',
            operator: 'equals',
            value: 'engineering'
          }],
          logic: 'and',
          type: 'include'
        });
      }
    }

    if (Object.keys(analysis.environments).length > 1) {
      // Multiple environments - suggest production exclusion
      if (analysis.environments['production']) {
        recommended.push({
          criteria: [{
            field: 'environment',
            operator: 'equals',
            value: 'production'
          }],
          logic: 'and',
          type: 'exclude'
        });
      }
    }

    // Machine type filters
    if (analysis.machineTypes['workstation']) {
      recommended.push({
        criteria: [{
          field: 'machine-type',
          operator: 'equals',
          value: 'workstation'
        }],
        logic: 'and',
        type: 'include'
      });
    }

    return { recommended, analysis };
  }

  /**
   * Validate filter syntax
   */
  validateFilter(filter: DeveloperFilter): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate criteria
    if (!filter.criteria || filter.criteria.length === 0) {
      errors.push('Filter must have at least one criteria');
    }

    filter.criteria?.forEach((criteria, index) => {
      // Validate field
      const validFields: DeveloperField[] = [
        'department', 'team', 'role', 'location', 'machine-type',
        'environment', 'project', 'skill-level', 'access-level'
      ];
      
      if (!validFields.includes(criteria.field)) {
        errors.push(`Invalid field '${criteria.field}' in criteria ${index + 1}`);
      }

      // Validate operator
      const validOperators: FilterOperator[] = [
        'equals', 'not-equals', 'contains', 'not-contains',
        'starts-with', 'ends-with', 'in', 'not-in',
        'greater-than', 'less-than'
      ];
      
      if (!validOperators.includes(criteria.operator)) {
        errors.push(`Invalid operator '${criteria.operator}' in criteria ${index + 1}`);
      }

      // Validate value for array operators
      if (['in', 'not-in'].includes(criteria.operator) && !Array.isArray(criteria.value)) {
        errors.push(`Operator '${criteria.operator}' requires array value in criteria ${index + 1}`);
      }

      // Validate value for numeric operators
      if (['greater-than', 'less-than'].includes(criteria.operator)) {
        if (this.parseNumber(criteria.value) === null) {
          errors.push(`Operator '${criteria.operator}' requires numeric value in criteria ${index + 1}`);
        }
      }
    });

    // Warnings for potential issues
    if (filter.criteria && filter.criteria.length > 5) {
      warnings.push('Filter has many criteria - consider simplifying for better performance');
    }

    if (filter.logic === 'or' && filter.criteria && filter.criteria.length > 3) {
      warnings.push('OR logic with many criteria may match more targets than expected');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.filterCache.clear();
    this.statsCache.clear();
  }

  /**
   * Private utility methods
   */
  private getFiltersKey(filters: DeveloperFilter[]): string {
    return JSON.stringify(filters);
  }

  private parseNumber(value: any): number | null {
    const num = Number(value);
    return isNaN(num) ? null : num;
  }
}