import { describe, expect, it } from 'vitest';
import {
  computeProjectReleaseWarnings,
  computeReleaseWarnings,
  groupReleaseItemsByCategory,
  suggestInitialItemIds,
  suggestInitialProductReleaseMap,
} from './releaseHelpers';
import { computeProjectReleaseManifestHash } from './manifestHash';
import type { Category, Item, Product, Release, ReleaseItem } from '../types/database';

describe('Release wizard and detail helpers', () => {
  const categories: Category[] = [
    {
      id: 'cat-hw',
      project_id: 'proj-1',
      product_id: 'prod-1',
      name: 'Hardware',
      description: null,
      position: 0,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'cat-fw',
      project_id: 'proj-1',
      product_id: 'prod-1',
      name: 'Firmware',
      description: null,
      position: 1,
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  const items: Item[] = [
    {
      id: 'item-old',
      project_id: 'proj-1',
      product_id: 'prod-1',
      category_id: 'cat-hw',
      title: 'BOM Rev A',
      kind: 'file',
      version_label: 'Rev A',
      note: null,
      url: null,
      storage_path: 'proj-1/u1/bom-a.csv',
      file_name: 'bom-a.csv',
      file_size: 100,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      archived: false,
      created_by: 'user-1',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 'item-new',
      project_id: 'proj-1',
      product_id: 'prod-1',
      category_id: 'cat-hw',
      title: 'BOM Rev B',
      kind: 'link',
      version_label: 'Rev B',
      note: null,
      url: 'https://example.com/bom-b',
      storage_path: null,
      file_name: null,
      file_size: null,
      sha256: null,
      archived: false,
      created_by: 'user-1',
      created_at: '2026-03-01T00:00:00Z',
    },
  ];

  it('suggests the most recent non-archived item per category', () => {
    const suggested = suggestInitialItemIds(categories, items);
    expect(suggested).toEqual(['item-new']);
  });

  it('produces non-blocking warnings for empty categories and external links', () => {
    const warnings = computeReleaseWarnings(categories, [items[1]!]);
    expect(warnings).toEqual([
      { type: 'empty_category', categoryId: 'cat-fw', categoryName: 'Firmware' },
      { type: 'link_item', itemId: 'item-new', itemTitle: 'BOM Rev B' },
    ]);
  });

  it('groups release snapshot items by category_position in ascending order', () => {
    const snapshots: ReleaseItem[] = [
      {
        id: 'ri-2',
        release_id: 'rel-1',
        item_id: 'i-2',
        category_name: 'Firmware',
        category_position: 1,
        title: 'App Binary',
        kind: 'file',
        version_label: 'v1.0',
        url: null,
        storage_path: 'p/u/fw.bin',
        file_name: 'fw.bin',
        file_size: 2048,
        sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        created_at: '2026-04-01T00:00:00Z',
      },
      {
        id: 'ri-1',
        release_id: 'rel-1',
        item_id: 'i-1',
        category_name: 'Hardware',
        category_position: 0,
        title: 'Production BOM',
        kind: 'file',
        version_label: 'Rev B',
        url: null,
        storage_path: 'p/u/bom.csv',
        file_name: 'bom.csv',
        file_size: 1024,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        created_at: '2026-04-01T00:00:00Z',
      },
    ];

    const grouped = groupReleaseItemsByCategory(snapshots);
    expect(grouped.map((g) => g.categoryName)).toEqual(['Hardware', 'Firmware']);
  });

  it('preselects latest published release per active product and warns on omitted products', async () => {
    const products: Product[] = [
      {
        id: 'prod-a',
        project_id: 'proj-1',
        name: 'Sensor Board',
        code: 'PCB-A',
        product_type: 'mixed',
        description: null,
        archived: false,
        position: 0,
        created_by: 'u1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'prod-b',
        project_id: 'proj-1',
        name: 'Gateway Software',
        code: 'SW-B',
        product_type: 'software',
        description: null,
        archived: false,
        position: 1,
        created_by: 'u1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    const releases: Release[] = [
      {
        id: 'rel-a1',
        project_id: 'proj-1',
        product_id: 'prod-a',
        version_label: 'Rev A',
        notes: null,
        status: 'published',
        published_at: '2026-05-01T00:00:00Z',
        published_by: 'u1',
        manifest_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        created_at: '2026-05-01T00:00:00Z',
      },
      {
        id: 'rel-a2',
        project_id: 'proj-1',
        product_id: 'prod-a',
        version_label: 'Rev B',
        notes: null,
        status: 'published',
        published_at: '2026-06-01T00:00:00Z',
        published_by: 'u1',
        manifest_hash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        created_at: '2026-06-01T00:00:00Z',
      },
    ];

    const suggestedMap = suggestInitialProductReleaseMap(products, releases);
    expect(suggestedMap).toEqual({ 'prod-a': 'rel-a2' });

    const warnings = computeProjectReleaseWarnings(products, new Set(Object.keys(suggestedMap)));
    expect(warnings).toEqual([
      { type: 'missing_product', productId: 'prod-b', productName: 'Gateway Software' },
    ]);

    const hashA = await computeProjectReleaseManifestHash([
      {
        product_code: 'SW-B',
        product_id: 'prod-b',
        product_name: 'Gateway Software',
        product_position: 1,
        release_id: 'rel-b1',
        release_manifest_hash: '1111111111111111111111111111111111111111111111111111111111111111',
        release_version_label: 'v1.0.0',
      },
      {
        product_code: 'PCB-A',
        product_id: 'prod-a',
        product_name: 'Sensor Board',
        product_position: 0,
        release_id: 'rel-a2',
        release_manifest_hash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        release_version_label: 'Rev B',
      },
    ]);
    const hashB = await computeProjectReleaseManifestHash([
      {
        product_code: 'PCB-A',
        product_id: 'prod-a',
        product_name: 'Sensor Board',
        product_position: 0,
        release_id: 'rel-a2',
        release_manifest_hash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        release_version_label: 'Rev B',
      },
      {
        product_code: 'SW-B',
        product_id: 'prod-b',
        product_name: 'Gateway Software',
        product_position: 1,
        release_id: 'rel-b1',
        release_manifest_hash: '1111111111111111111111111111111111111111111111111111111111111111',
        release_version_label: 'v1.0.0',
      },
    ]);
    expect(hashA).toBe(hashB);
    expect(hashA).toHaveLength(64);
  });
});
