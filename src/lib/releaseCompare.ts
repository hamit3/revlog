export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface BomRow {
  designator: string;
  mpn?: string;
  value?: string;
  footprint?: string;
  dnp?: boolean;
  description?: string;
}

export interface ReleaseItemSnapshot {
  id?: string;
  release_id?: string;
  item_id: string;
  category_name?: string | null;
  category_position?: number | null;
  title?: string | null;
  kind?: 'file' | 'link' | null;
  version_label?: string | null;
  url?: string | null;
  storage_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  sha256?: string | null;
  created_at?: string;
}

export interface ItemFieldChanges {
  sha256Changed: boolean;
  urlChanged: boolean;
  versionLabelChanged: boolean;
  fileNameChanged: boolean;
  fileSizeChanged: boolean;
  titleChanged: boolean;
  kindChanged: boolean;
}

export interface ReleaseItemDiff {
  item_id: string;
  status: DiffStatus;
  categoryName: string;
  categoryPosition: number;
  title: string;
  baseItem?: ReleaseItemSnapshot;
  targetItem?: ReleaseItemSnapshot;
  fieldChanges?: ItemFieldChanges;
}

export interface CategoryItemDiffGroup {
  categoryName: string;
  categoryPosition: number;
  items: ReleaseItemDiff[];
  counts: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    total: number;
  };
}

export interface ReleaseItemDiffResult {
  groups: CategoryItemDiffGroup[];
  allItems: ReleaseItemDiff[];
  summary: {
    addedCount: number;
    removedCount: number;
    changedCount: number;
    unchangedCount: number;
    totalBaseCount: number;
    totalTargetCount: number;
    hasChanges: boolean;
  };
}

export interface BomPartFieldChanges {
  mpnChanged: boolean;
  valueChanged: boolean;
  footprintChanged: boolean;
  dnpChanged: boolean;
  descriptionChanged: boolean;
}

export interface BomPartDiff {
  designator: string;
  status: DiffStatus;
  basePart?: BomRow;
  targetPart?: BomRow;
  fieldChanges?: BomPartFieldChanges;
}

export interface BomPartDiffResult {
  parts: BomPartDiff[];
  summary: {
    addedCount: number;
    removedCount: number;
    changedCount: number;
    unchangedCount: number;
    totalBaseCount: number;
    totalTargetCount: number;
    hasChanges: boolean;
  };
}

export interface ProjectReleaseProductSnapshot {
  id?: string;
  project_release_id?: string;
  product_id: string;
  release_id: string;
  product_name?: string | null;
  product_code?: string | null;
  product_type?: 'hardware' | 'software' | 'mixed' | null;
  product_position?: number | null;
  release_version_label?: string | null;
  release_manifest_hash?: string | null;
  release_published_at?: string | null;
}

export interface ProjectReleaseProductDiff {
  productId: string;
  productName: string;
  productCode?: string | null;
  productType?: 'hardware' | 'software' | 'mixed' | null;
  status: DiffStatus;
  baseProduct?: ProjectReleaseProductSnapshot;
  targetProduct?: ProjectReleaseProductSnapshot;
  versionChanged: boolean;
  manifestHashChanged: boolean;
}

export interface ProjectReleaseDiffResult {
  products: ProjectReleaseProductDiff[];
  summary: {
    addedCount: number;
    removedCount: number;
    changedCount: number;
    unchangedCount: number;
    hasChanges: boolean;
  };
}

/**
 * Natural alphanumeric comparator for reference designators (e.g. C1, C2, C10, R1, R2, R10).
 */
export function compareDesignatorsNatural(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function normalizeStr(val?: string | null): string {
  return (val ?? '').trim();
}

/**
 * Compares two snapshots of release items (from release_items table) deterministically.
 * Identifies added, removed, changed and unchanged items, with field-level change flags
 * for sha256 and url highlighting.
 */
export function compareReleaseItems(
  baseItems: readonly ReleaseItemSnapshot[],
  targetItems: readonly ReleaseItemSnapshot[],
): ReleaseItemDiffResult {
  const baseMap = new Map<string, ReleaseItemSnapshot>();
  for (const item of baseItems) {
    baseMap.set(item.item_id, item);
  }

  const targetMap = new Map<string, ReleaseItemSnapshot>();
  for (const item of targetItems) {
    targetMap.set(item.item_id, item);
  }

  const allItemIds = new Set<string>([...baseMap.keys(), ...targetMap.keys()]);
  const diffs: ReleaseItemDiff[] = [];

  for (const itemId of allItemIds) {
    const base = baseMap.get(itemId);
    const target = targetMap.get(itemId);

    if (!base && target) {
      diffs.push({
        item_id: itemId,
        status: 'added',
        categoryName: target.category_name ?? 'Uncategorized',
        categoryPosition: target.category_position ?? 999999,
        title: target.title ?? 'Untitled item',
        targetItem: target,
      });
    } else if (base && !target) {
      diffs.push({
        item_id: itemId,
        status: 'removed',
        categoryName: base.category_name ?? 'Uncategorized',
        categoryPosition: base.category_position ?? 999999,
        title: base.title ?? 'Untitled item',
        baseItem: base,
      });
    } else if (base && target) {
      const sha256Changed =
        normalizeStr(base.sha256).toLowerCase() !== normalizeStr(target.sha256).toLowerCase();
      const urlChanged = normalizeStr(base.url) !== normalizeStr(target.url);
      const versionLabelChanged =
        normalizeStr(base.version_label) !== normalizeStr(target.version_label);
      const fileNameChanged = normalizeStr(base.file_name) !== normalizeStr(target.file_name);
      const fileSizeChanged = (base.file_size ?? null) !== (target.file_size ?? null);
      const titleChanged = normalizeStr(base.title) !== normalizeStr(target.title);
      const kindChanged = base.kind !== target.kind;

      const hasChange =
        sha256Changed ||
        urlChanged ||
        versionLabelChanged ||
        fileNameChanged ||
        fileSizeChanged ||
        titleChanged ||
        kindChanged;

      const status: DiffStatus = hasChange ? 'changed' : 'unchanged';

      diffs.push({
        item_id: itemId,
        status,
        categoryName: target.category_name ?? base.category_name ?? 'Uncategorized',
        categoryPosition: target.category_position ?? base.category_position ?? 999999,
        title: target.title ?? base.title ?? 'Untitled item',
        baseItem: base,
        targetItem: target,
        fieldChanges: hasChange
          ? {
              sha256Changed,
              urlChanged,
              versionLabelChanged,
              fileNameChanged,
              fileSizeChanged,
              titleChanged,
              kindChanged,
            }
          : undefined,
      });
    }
  }

  // Group by category, preserve deterministic category positioning and title sorting
  const groupMap = new Map<string, { categoryPosition: number; items: ReleaseItemDiff[] }>();

  for (const diff of diffs) {
    let group = groupMap.get(diff.categoryName);
    if (!group) {
      group = { categoryPosition: diff.categoryPosition, items: [] };
      groupMap.set(diff.categoryName, group);
    }
    group.items.push(diff);
  }

  const groups: CategoryItemDiffGroup[] = Array.from(groupMap.entries())
    .map(([catName, data]) => {
      // Sort items within group: status (changed, added, removed, unchanged) then title
      const sortedItems = [...data.items].sort((a, b) => {
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      });

      const counts = {
        added: sortedItems.filter((i) => i.status === 'added').length,
        removed: sortedItems.filter((i) => i.status === 'removed').length,
        changed: sortedItems.filter((i) => i.status === 'changed').length,
        unchanged: sortedItems.filter((i) => i.status === 'unchanged').length,
        total: sortedItems.length,
      };

      return {
        categoryName: catName,
        categoryPosition: data.categoryPosition,
        items: sortedItems,
        counts,
      };
    })
    .sort((a, b) => {
      if (a.categoryPosition !== b.categoryPosition) {
        return a.categoryPosition - b.categoryPosition;
      }
      return a.categoryName.localeCompare(b.categoryName, undefined, { sensitivity: 'base' });
    });

  const allItemsSorted = groups.flatMap((g) => g.items);

  const addedCount = diffs.filter((i) => i.status === 'added').length;
  const removedCount = diffs.filter((i) => i.status === 'removed').length;
  const changedCount = diffs.filter((i) => i.status === 'changed').length;
  const unchangedCount = diffs.filter((i) => i.status === 'unchanged').length;

  return {
    groups,
    allItems: allItemsSorted,
    summary: {
      addedCount,
      removedCount,
      changedCount,
      unchangedCount,
      totalBaseCount: baseItems.length,
      totalTargetCount: targetItems.length,
      hasChanges: addedCount > 0 || removedCount > 0 || changedCount > 0,
    },
  };
}

/**
 * Compares two BOM snapshots deterministically by reference designator.
 * Highlights added/removed parts and changed MPN, value, footprint, or DNP status.
 */
export function compareBomParts(
  baseBom: readonly BomRow[],
  targetBom: readonly BomRow[],
): BomPartDiffResult {
  const baseMap = new Map<string, BomRow>();
  for (const part of baseBom) {
    const key = part.designator.trim().toUpperCase();
    if (key) {
      baseMap.set(key, part);
    }
  }

  const targetMap = new Map<string, BomRow>();
  for (const part of targetBom) {
    const key = part.designator.trim().toUpperCase();
    if (key) {
      targetMap.set(key, part);
    }
  }

  const allDesignators = new Set<string>([...baseMap.keys(), ...targetMap.keys()]);
  const parts: BomPartDiff[] = [];

  for (const des of allDesignators) {
    const base = baseMap.get(des);
    const target = targetMap.get(des);

    if (!base && target) {
      parts.push({
        designator: des,
        status: 'added',
        targetPart: target,
      });
    } else if (base && !target) {
      parts.push({
        designator: des,
        status: 'removed',
        basePart: base,
      });
    } else if (base && target) {
      const mpnChanged = normalizeStr(base.mpn) !== normalizeStr(target.mpn);
      const valueChanged = normalizeStr(base.value) !== normalizeStr(target.value);
      const footprintChanged = normalizeStr(base.footprint) !== normalizeStr(target.footprint);
      const dnpChanged = Boolean(base.dnp) !== Boolean(target.dnp);
      const descriptionChanged =
        normalizeStr(base.description) !== normalizeStr(target.description);

      const hasChange =
        mpnChanged || valueChanged || footprintChanged || dnpChanged || descriptionChanged;
      const status: DiffStatus = hasChange ? 'changed' : 'unchanged';

      parts.push({
        designator: des,
        status,
        basePart: base,
        targetPart: target,
        fieldChanges: hasChange
          ? {
              mpnChanged,
              valueChanged,
              footprintChanged,
              dnpChanged,
              descriptionChanged,
            }
          : undefined,
      });
    }
  }

  // Sort natural alphanumeric by reference designator (R1, R2, R10...)
  parts.sort((a, b) => compareDesignatorsNatural(a.designator, b.designator));

  const addedCount = parts.filter((p) => p.status === 'added').length;
  const removedCount = parts.filter((p) => p.status === 'removed').length;
  const changedCount = parts.filter((p) => p.status === 'changed').length;
  const unchangedCount = parts.filter((p) => p.status === 'unchanged').length;

  return {
    parts,
    summary: {
      addedCount,
      removedCount,
      changedCount,
      unchangedCount,
      totalBaseCount: baseBom.length,
      totalTargetCount: targetBom.length,
      hasChanges: addedCount > 0 || removedCount > 0 || changedCount > 0,
    },
  };
}

/**
 * Compares bundled product releases in two system releases (from project_release_products).
 */
export function compareProjectReleases(
  baseProducts: readonly ProjectReleaseProductSnapshot[],
  targetProducts: readonly ProjectReleaseProductSnapshot[],
): ProjectReleaseDiffResult {
  const baseMap = new Map<string, ProjectReleaseProductSnapshot>();
  for (const p of baseProducts) {
    baseMap.set(p.product_id, p);
  }

  const targetMap = new Map<string, ProjectReleaseProductSnapshot>();
  for (const p of targetProducts) {
    targetMap.set(p.product_id, p);
  }

  const allProductIds = new Set<string>([...baseMap.keys(), ...targetMap.keys()]);
  const products: ProjectReleaseProductDiff[] = [];

  for (const prodId of allProductIds) {
    const base = baseMap.get(prodId);
    const target = targetMap.get(prodId);

    if (!base && target) {
      products.push({
        productId: prodId,
        productName: target.product_name ?? 'Untitled Product',
        productCode: target.product_code,
        productType: target.product_type,
        status: 'added',
        targetProduct: target,
        versionChanged: false,
        manifestHashChanged: false,
      });
    } else if (base && !target) {
      products.push({
        productId: prodId,
        productName: base.product_name ?? 'Untitled Product',
        productCode: base.product_code,
        productType: base.product_type,
        status: 'removed',
        baseProduct: base,
        versionChanged: false,
        manifestHashChanged: false,
      });
    } else if (base && target) {
      const versionChanged =
        normalizeStr(base.release_version_label) !== normalizeStr(target.release_version_label);
      const manifestHashChanged =
        normalizeStr(base.release_manifest_hash).toLowerCase() !==
        normalizeStr(target.release_manifest_hash).toLowerCase();

      const hasChange = versionChanged || manifestHashChanged;
      const status: DiffStatus = hasChange ? 'changed' : 'unchanged';

      products.push({
        productId: prodId,
        productName: target.product_name ?? base.product_name ?? 'Untitled Product',
        productCode: target.product_code ?? base.product_code,
        productType: target.product_type ?? base.product_type,
        status,
        baseProduct: base,
        targetProduct: target,
        versionChanged,
        manifestHashChanged,
      });
    }
  }

  // Sort by product name
  products.sort((a, b) =>
    a.productName.localeCompare(b.productName, undefined, { sensitivity: 'base' }),
  );

  const addedCount = products.filter((p) => p.status === 'added').length;
  const removedCount = products.filter((p) => p.status === 'removed').length;
  const changedCount = products.filter((p) => p.status === 'changed').length;
  const unchangedCount = products.filter((p) => p.status === 'unchanged').length;

  return {
    products,
    summary: {
      addedCount,
      removedCount,
      changedCount,
      unchangedCount,
      hasChanges: addedCount > 0 || removedCount > 0 || changedCount > 0,
    },
  };
}
