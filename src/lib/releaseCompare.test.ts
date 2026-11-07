import { describe, expect, it } from 'vitest';
import {
  compareBomParts,
  compareDesignatorsNatural,
  compareProjectReleases,
  compareReleaseItems,
  type BomRow,
  type ProjectReleaseProductSnapshot,
  type ReleaseItemSnapshot,
} from './releaseCompare';

describe('Deterministic release comparison domain engine', () => {
  describe('Natural reference designator sorting', () => {
    it('sorts reference designators with natural alphanumeric order', () => {
      const designators = ['R10', 'R1', 'R2', 'C100', 'C2', 'R9', 'C1', 'U12', 'U2'];
      const sorted = [...designators].sort(compareDesignatorsNatural);
      expect(sorted).toEqual(['C1', 'C2', 'C100', 'R1', 'R2', 'R9', 'R10', 'U2', 'U12']);
    });
  });

  describe('compareReleaseItems', () => {
    it('returns zero counts for empty snapshots', () => {
      const result = compareReleaseItems([], []);
      expect(result.summary).toEqual({
        addedCount: 0,
        removedCount: 0,
        changedCount: 0,
        unchangedCount: 0,
        totalBaseCount: 0,
        totalTargetCount: 0,
        hasChanges: false,
      });
      expect(result.groups).toHaveLength(0);
      expect(result.allItems).toHaveLength(0);
    });

    it('identifies identical release items as unchanged', () => {
      const item: ReleaseItemSnapshot = {
        item_id: 'item-1',
        category_name: 'Schematics',
        category_position: 1,
        title: 'Main Schematic PDF',
        kind: 'file',
        file_name: 'schematic_v1.pdf',
        file_size: 1024,
        sha256: 'abc123def456',
        version_label: 'v1.0.0',
      };

      const result = compareReleaseItems([item], [item]);
      expect(result.summary.hasChanges).toBe(false);
      expect(result.summary.unchangedCount).toBe(1);
      expect(result.allItems[0]?.status).toBe('unchanged');
      expect(result.allItems[0]?.fieldChanges).toBeUndefined();
    });

    it('identifies added, removed and changed items with specific field flags', () => {
      const baseItems: ReleaseItemSnapshot[] = [
        {
          item_id: 'item-kept',
          category_name: 'Firmware',
          category_position: 2,
          title: 'Bootloader',
          kind: 'file',
          sha256: 'hash-original',
          version_label: '1.0.0',
        },
        {
          item_id: 'item-removed',
          category_name: 'Hardware',
          category_position: 1,
          title: 'Legacy Gerber',
          kind: 'file',
          sha256: 'hash-old',
        },
        {
          item_id: 'item-changed-hash',
          category_name: 'Hardware',
          category_position: 1,
          title: 'PCB Gerber Zip',
          kind: 'file',
          file_name: 'gerbers_v1.zip',
          file_size: 50000,
          sha256: 'hash-v1',
          version_label: '1.0',
        },
        {
          item_id: 'item-changed-url',
          category_name: 'Documentation',
          category_position: 3,
          title: 'Datasheet Link',
          kind: 'link',
          url: 'https://example.com/v1',
        },
      ];

      const targetItems: ReleaseItemSnapshot[] = [
        {
          item_id: 'item-kept',
          category_name: 'Firmware',
          category_position: 2,
          title: 'Bootloader',
          kind: 'file',
          sha256: 'hash-original',
          version_label: '1.0.0',
        },
        {
          item_id: 'item-changed-hash',
          category_name: 'Hardware',
          category_position: 1,
          title: 'PCB Gerber Zip',
          kind: 'file',
          file_name: 'gerbers_v2.zip',
          file_size: 52000,
          sha256: 'hash-v2-NEW',
          version_label: '2.0',
        },
        {
          item_id: 'item-changed-url',
          category_name: 'Documentation',
          category_position: 3,
          title: 'Datasheet Link',
          kind: 'link',
          url: 'https://example.com/v2-updated',
        },
        {
          item_id: 'item-newly-added',
          category_name: 'Hardware',
          category_position: 1,
          title: 'Pick and Place POS',
          kind: 'file',
          file_name: 'pnp.pos',
          sha256: 'hash-pnp',
        },
      ];

      const result = compareReleaseItems(baseItems, targetItems);

      expect(result.summary).toEqual({
        addedCount: 1,
        removedCount: 1,
        changedCount: 2,
        unchangedCount: 1,
        totalBaseCount: 4,
        totalTargetCount: 4,
        hasChanges: true,
      });

      const added = result.allItems.find((i) => i.item_id === 'item-newly-added');
      expect(added?.status).toBe('added');
      expect(added?.categoryName).toBe('Hardware');

      const removed = result.allItems.find((i) => i.item_id === 'item-removed');
      expect(removed?.status).toBe('removed');

      const changedHash = result.allItems.find((i) => i.item_id === 'item-changed-hash');
      expect(changedHash?.status).toBe('changed');
      expect(changedHash?.fieldChanges).toEqual({
        sha256Changed: true,
        urlChanged: false,
        versionLabelChanged: true,
        fileNameChanged: true,
        fileSizeChanged: true,
        titleChanged: false,
        kindChanged: false,
      });

      const changedUrl = result.allItems.find((i) => i.item_id === 'item-changed-url');
      expect(changedUrl?.status).toBe('changed');
      expect(changedUrl?.fieldChanges?.urlChanged).toBe(true);
      expect(changedUrl?.fieldChanges?.sha256Changed).toBe(false);

      // Verify category grouping and sorting
      expect(result.groups.map((g) => g.categoryName)).toEqual(['Hardware', 'Firmware', 'Documentation']);
    });
  });

  describe('compareBomParts', () => {
    it('returns zero counts for empty BOMs', () => {
      const result = compareBomParts([], []);
      expect(result.summary).toEqual({
        addedCount: 0,
        removedCount: 0,
        changedCount: 0,
        unchangedCount: 0,
        totalBaseCount: 0,
        totalTargetCount: 0,
        hasChanges: false,
      });
      expect(result.parts).toHaveLength(0);
    });

    it('identifies added, removed and changed BOM components by reference designator', () => {
      const baseBom: BomRow[] = [
        { designator: 'R1', mpn: 'RC0603FR-0710KL', value: '10k', footprint: '0603', dnp: false },
        { designator: 'R2', mpn: 'RC0603FR-071KL', value: '1k', footprint: '0603', dnp: false },
        { designator: 'C1', mpn: 'CL10B104KB8NNNC', value: '100nF', footprint: '0603', dnp: false },
        { designator: 'U1', mpn: 'STM32F401RET6', value: 'MCU', footprint: 'LQFP-64', dnp: false },
      ];

      const targetBom: BomRow[] = [
        // R1 unchanged
        { designator: 'R1', mpn: 'RC0603FR-0710KL', value: '10k', footprint: '0603', dnp: false },
        // R2 MPN and value changed
        { designator: 'R2', mpn: 'RC0603FR-072K2L', value: '2.2k', footprint: '0603', dnp: false },
        // C1 removed in target
        // U1 DNP toggled from false to true
        { designator: 'U1', mpn: 'STM32F401RET6', value: 'MCU', footprint: 'LQFP-64', dnp: true },
        // R10 newly added
        { designator: 'R10', mpn: 'RC0402FR-070RL', value: '0R', footprint: '0402', dnp: false },
      ];

      const result = compareBomParts(baseBom, targetBom);

      expect(result.summary).toEqual({
        addedCount: 1, // R10
        removedCount: 1, // C1
        changedCount: 2, // R2, U1
        unchangedCount: 1, // R1
        totalBaseCount: 4,
        totalTargetCount: 4,
        hasChanges: true,
      });

      // Sorted naturally: C1, R1, R2, R10, U1
      expect(result.parts.map((p) => p.designator)).toEqual(['C1', 'R1', 'R2', 'R10', 'U1']);

      const r2 = result.parts.find((p) => p.designator === 'R2');
      expect(r2?.status).toBe('changed');
      expect(r2?.fieldChanges?.mpnChanged).toBe(true);
      expect(r2?.fieldChanges?.valueChanged).toBe(true);
      expect(r2?.fieldChanges?.footprintChanged).toBe(false);

      const u1 = result.parts.find((p) => p.designator === 'U1');
      expect(u1?.status).toBe('changed');
      expect(u1?.fieldChanges?.dnpChanged).toBe(true);

      const r10 = result.parts.find((p) => p.designator === 'R10');
      expect(r10?.status).toBe('added');

      const c1 = result.parts.find((p) => p.designator === 'C1');
      expect(c1?.status).toBe('removed');
    });
  });

  describe('compareProjectReleases', () => {
    it('compares system release bundled products', () => {
      const baseProducts: ProjectReleaseProductSnapshot[] = [
        {
          product_id: 'prod-board',
          release_id: 'rel-b1',
          product_name: 'Sensor Board',
          product_code: 'SNSR',
          product_type: 'hardware',
          release_version_label: '1.0.0',
          release_manifest_hash: 'hash-aaa',
        },
        {
          product_id: 'prod-fw',
          release_id: 'rel-f1',
          product_name: 'Gateway Firmware',
          product_code: 'FIRM',
          product_type: 'software',
          release_version_label: '1.0.0',
          release_manifest_hash: 'hash-bbb',
        },
      ];

      const targetProducts: ProjectReleaseProductSnapshot[] = [
        {
          product_id: 'prod-board',
          release_id: 'rel-b2',
          product_name: 'Sensor Board',
          product_code: 'SNSR',
          product_type: 'hardware',
          release_version_label: '1.1.0', // version changed
          release_manifest_hash: 'hash-aaa-v2', // manifest hash changed
        },
        {
          product_id: 'prod-app',
          release_id: 'rel-app1',
          product_name: 'Companion Mobile App',
          product_code: 'APP',
          product_type: 'software',
          release_version_label: '1.0.0',
          release_manifest_hash: 'hash-ccc',
        },
      ];

      const result = compareProjectReleases(baseProducts, targetProducts);

      expect(result.summary).toEqual({
        addedCount: 1, // Companion Mobile App
        removedCount: 1, // Gateway Firmware
        changedCount: 1, // Sensor Board
        unchangedCount: 0,
        hasChanges: true,
      });

      const board = result.products.find((p) => p.productId === 'prod-board');
      expect(board?.status).toBe('changed');
      expect(board?.versionChanged).toBe(true);
      expect(board?.manifestHashChanged).toBe(true);

      const fw = result.products.find((p) => p.productId === 'prod-fw');
      expect(fw?.status).toBe('removed');

      const app = result.products.find((p) => p.productId === 'prod-app');
      expect(app?.status).toBe('added');
    });
  });
});
