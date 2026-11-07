import type { ReleaseChecklistRule } from '../types/database';

export interface CompletenessItem {
  id: string;
  category_id?: string | null;
  category_name?: string | null;
  title?: string | null;
  file_name?: string | null;
}

export interface CompletenessCategory {
  id: string;
  name: string;
}

export interface CompletenessRuleResult {
  rule: ReleaseChecklistRule;
  satisfied: boolean;
  matchedItem?: CompletenessItem;
}

export interface CompletenessEvaluation {
  results: CompletenessRuleResult[];
  allPassed: boolean;
  canPublish: boolean;
  totalRules: number;
  satisfiedCount: number;
  missingCount: number;
  blockingMissingCount: number;
  warningMissingCount: number;
  blockingIssues: CompletenessRuleResult[];
  warningIssues: CompletenessRuleResult[];
}

/**
 * Normalizes text for case-insensitive, whitespace-trimmed comparison.
 */
function normalize(text?: string | null): string {
  return (text ?? '').trim().toLowerCase();
}

/**
 * Checks whether an item matches a checklist rule's required pattern.
 * Checks both title and file_name.
 */
export function itemMatchesPattern(item: CompletenessItem, pattern: string): boolean {
  const normPattern = normalize(pattern);
  if (!normPattern) {
    return false;
  }

  const normTitle = normalize(item.title);
  const normFileName = normalize(item.file_name);

  return normTitle.includes(normPattern) || normFileName.includes(normPattern);
}

/**
 * Checks whether an item belongs to a category matching the rule's category target.
 */
export function itemBelongsToCategory(
  item: CompletenessItem,
  ruleCategoryName: string,
  categories: readonly CompletenessCategory[],
): boolean {
  const targetCategory = normalize(ruleCategoryName);
  if (!targetCategory) {
    return true; // Empty rule category matches any category
  }

  // Check direct category_name on item (e.g. from release_items)
  if (item.category_name && normalize(item.category_name) === targetCategory) {
    return true;
  }

  // Check category looked up by category_id
  if (item.category_id) {
    const matchedCat = categories.find((c) => c.id === item.category_id);
    if (matchedCat && normalize(matchedCat.name) === targetCategory) {
      return true;
    }
  }

  // Substring fallback (e.g. rule "Hardware" matching category "Hardware & Schematics")
  if (item.category_name && normalize(item.category_name).includes(targetCategory)) {
    return true;
  }
  if (item.category_id) {
    const matchedCat = categories.find((c) => c.id === item.category_id);
    if (matchedCat && normalize(matchedCat.name).includes(targetCategory)) {
      return true;
    }
  }

  return false;
}

/**
 * Deterministically evaluates a set of checklist rules against selected items in a release.
 */
export function evaluateReleaseCompleteness(
  rules: readonly ReleaseChecklistRule[],
  categories: readonly CompletenessCategory[],
  selectedItems: readonly CompletenessItem[],
): CompletenessEvaluation {
  const results: CompletenessRuleResult[] = [];
  const blockingIssues: CompletenessRuleResult[] = [];
  const warningIssues: CompletenessRuleResult[] = [];

  for (const rule of rules) {
    // Find candidate items belonging to the rule's target category
    const categoryItems = selectedItems.filter((item) =>
      itemBelongsToCategory(item, rule.category_name, categories),
    );

    // Look for a candidate item that satisfies the required pattern
    const matched = categoryItems.find((item) => itemMatchesPattern(item, rule.item_name_pattern));

    const result: CompletenessRuleResult = {
      rule,
      satisfied: Boolean(matched),
      matchedItem: matched,
    };

    results.push(result);

    if (!matched) {
      if (rule.severity === 'blocking') {
        blockingIssues.push(result);
      } else {
        warningIssues.push(result);
      }
    }
  }

  const satisfiedCount = results.filter((r) => r.satisfied).length;
  const missingCount = results.length - satisfiedCount;
  const blockingMissingCount = blockingIssues.length;
  const warningMissingCount = warningIssues.length;
  const allPassed = missingCount === 0;
  const canPublish = blockingMissingCount === 0;

  return {
    results,
    allPassed,
    canPublish,
    totalRules: rules.length,
    satisfiedCount,
    missingCount,
    blockingMissingCount,
    warningMissingCount,
    blockingIssues,
    warningIssues,
  };
}
