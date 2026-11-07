import type { Category, Item, Product, Release, ReleaseItem } from '../types/database';

export type ReleaseWarning =
  | { type: 'empty_category'; categoryId: string; categoryName: string }
  | { type: 'missing_hash'; itemId: string; itemTitle: string }
  | { type: 'link_item'; itemId: string; itemTitle: string };

export type ProjectReleaseWarning = {
  type: 'missing_product';
  productId: string;
  productName: string;
};

export interface GroupedReleaseCategory {
  categoryName: string;
  categoryPosition: number;
  items: ReleaseItem[];
}

/**
 * Suggests the single most recently created non-archived item per category.
 */
export function suggestInitialItemIds(
  categories: readonly Category[],
  items: readonly Item[],
): string[] {
  const activeItems = items.filter((item) => !item.archived);
  const suggested: string[] = [];

  for (const category of categories) {
    const inCategory = activeItems
      .filter((item) => item.category_id === category.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    if (inCategory[0]) {
      suggested.push(inCategory[0].id);
    }
  }

  return suggested;
}

export function computeReleaseWarnings(
  categories: readonly Category[],
  selectedItems: readonly Item[],
): ReleaseWarning[] {
  const warnings: ReleaseWarning[] = [];

  const selectedCategoryIds = new Set(selectedItems.map((item) => item.category_id));
  for (const category of categories) {
    if (!selectedCategoryIds.has(category.id)) {
      warnings.push({
        type: 'empty_category',
        categoryId: category.id,
        categoryName: category.name,
      });
    }
  }

  for (const item of selectedItems) {
    if (item.kind === 'file' && (!item.sha256 || item.sha256.trim().length === 0)) {
      warnings.push({
        type: 'missing_hash',
        itemId: item.id,
        itemTitle: item.title,
      });
    }
    if (item.kind === 'link') {
      warnings.push({
        type: 'link_item',
        itemId: item.id,
        itemTitle: item.title,
      });
    }
  }

  return warnings;
}

export function groupReleaseItemsByCategory(
  releaseItems: readonly ReleaseItem[],
): GroupedReleaseCategory[] {
  const map = new Map<string, GroupedReleaseCategory>();

  for (const ri of releaseItems) {
    const categoryName = ri.category_name ?? 'Uncategorized';
    const categoryPosition = ri.category_position ?? 0;
    const key = `${categoryPosition}::${categoryName}`;

    const existing = map.get(key);
    if (existing) {
      existing.items.push(ri);
    } else {
      map.set(key, {
        categoryName,
        categoryPosition,
        items: [ri],
      });
    }
  }

  const groups = Array.from(map.values()).sort((a, b) => {
    if (a.categoryPosition !== b.categoryPosition) {
      return a.categoryPosition - b.categoryPosition;
    }
    return a.categoryName.localeCompare(b.categoryName);
  });

  for (const group of groups) {
    group.items.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
  }

  return groups;
}

/**
 * Suggests the latest published release per non-archived product in a project.
 * Returns a map of productId -> releaseId.
 */
export function suggestInitialProductReleaseMap(
  products: readonly Product[],
  releases: readonly Release[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const published = releases.filter((rel) => rel.status === 'published' && rel.published_at);

  for (const product of products) {
    if (product.archived) {
      continue;
    }
    const latest = published
      .filter((rel) => rel.product_id === product.id)
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))[0];
    if (latest) {
      result[product.id] = latest.id;
    }
  }

  return result;
}

export function computeProjectReleaseWarnings(
  products: readonly Product[],
  selectedProductIds: ReadonlySet<string>,
): ProjectReleaseWarning[] {
  const warnings: ProjectReleaseWarning[] = [];
  for (const product of products) {
    if (!product.archived && !selectedProductIds.has(product.id)) {
      warnings.push({
        type: 'missing_product',
        productId: product.id,
        productName: product.name,
      });
    }
  }
  return warnings;
}
