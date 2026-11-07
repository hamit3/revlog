import { describe, expect, it } from 'vitest';
import {
  evaluateReleaseCompleteness,
  itemBelongsToCategory,
  itemMatchesPattern,
} from './completeness';
import type { ReleaseChecklistRule } from '../types/database';

describe('completeness', () => {
  const sampleCategories = [
    { id: 'cat-hw', name: 'Hardware' },
    { id: 'cat-fw', name: 'Firmware' },
    { id: 'cat-test', name: 'Test' },
  ];

  const sampleRules: ReleaseChecklistRule[] = [
    {
      id: 'rule-bom',
      project_id: 'proj-1',
      category_name: 'Hardware',
      item_name_pattern: 'BOM',
      severity: 'blocking',
      description: 'Production bill of materials CSV',
      position: 1,
      created_by: 'user-1',
      created_at: '2026-11-08T00:00:00Z',
      updated_at: '2026-11-08T00:00:00Z',
    },
    {
      id: 'rule-pnp',
      project_id: 'proj-1',
      category_name: 'Hardware',
      item_name_pattern: 'PnP',
      severity: 'blocking',
      description: 'Pick and place centroid data',
      position: 2,
      created_by: 'user-1',
      created_at: '2026-11-08T00:00:00Z',
      updated_at: '2026-11-08T00:00:00Z',
    },
    {
      id: 'rule-gerber',
      project_id: 'proj-1',
      category_name: 'Hardware',
      item_name_pattern: 'Gerber',
      severity: 'warning',
      description: 'Fabrication Gerber archive',
      position: 3,
      created_by: 'user-1',
      created_at: '2026-11-08T00:00:00Z',
      updated_at: '2026-11-08T00:00:00Z',
    },
    {
      id: 'rule-test-report',
      project_id: 'proj-1',
      category_name: 'Test',
      item_name_pattern: 'test report',
      severity: 'warning',
      description: 'QA validation report',
      position: 4,
      created_by: 'user-1',
      created_at: '2026-11-08T00:00:00Z',
      updated_at: '2026-11-08T00:00:00Z',
    },
  ];

  describe('itemMatchesPattern', () => {
    it('matches by title or file_name case-insensitively', () => {
      expect(
        itemMatchesPattern(
          { id: '1', title: 'Mainboard BOM Rev C', file_name: 'bom.csv' },
          'bom',
        ),
      ).toBe(true);
      expect(
        itemMatchesPattern(
          { id: '2', title: 'Centroid Coordinates', file_name: 'sensor_pnp.pos' },
          'PnP',
        ),
      ).toBe(true);
      expect(
        itemMatchesPattern(
          { id: '3', title: 'Final Test Report', file_name: 'summary.pdf' },
          'test report',
        ),
      ).toBe(true);
    });

    it('returns false when no match', () => {
      expect(
        itemMatchesPattern(
          { id: '4', title: 'User Manual', file_name: 'manual.pdf' },
          'Gerber',
        ),
      ).toBe(false);
    });
  });

  describe('itemBelongsToCategory', () => {
    it('matches by category_name on item', () => {
      expect(
        itemBelongsToCategory(
          { id: '1', category_name: 'Hardware' },
          'hardware',
          sampleCategories,
        ),
      ).toBe(true);
    });

    it('matches by category_id lookup', () => {
      expect(
        itemBelongsToCategory(
          { id: '2', category_id: 'cat-test' },
          'Test',
          sampleCategories,
        ),
      ).toBe(true);
    });
  });

  describe('evaluateReleaseCompleteness', () => {
    it('returns allPassed when all required items exist', () => {
      const selectedItems = [
        {
          id: 'i-1',
          category_id: 'cat-hw',
          title: 'Motherboard BOM',
          file_name: 'board_bom.csv',
        },
        {
          id: 'i-2',
          category_id: 'cat-hw',
          title: 'Component Placement PnP',
          file_name: 'board.pos',
        },
        {
          id: 'i-3',
          category_id: 'cat-hw',
          title: 'Fabrication Gerber Archive',
          file_name: 'gerbers.zip',
        },
        {
          id: 'i-4',
          category_id: 'cat-test',
          title: 'DVT Test Report',
          file_name: 'test_report.pdf',
        },
      ];

      const evaluation = evaluateReleaseCompleteness(sampleRules, sampleCategories, selectedItems);

      expect(evaluation.allPassed).toBe(true);
      expect(evaluation.canPublish).toBe(true);
      expect(evaluation.satisfiedCount).toBe(4);
      expect(evaluation.missingCount).toBe(0);
      expect(evaluation.blockingMissingCount).toBe(0);
      expect(evaluation.warningMissingCount).toBe(0);
    });

    it('blocks publishing when a blocking rule is missing', () => {
      const selectedItems = [
        // Missing BOM!
        {
          id: 'i-2',
          category_id: 'cat-hw',
          title: 'Component Placement PnP',
          file_name: 'board.pos',
        },
        {
          id: 'i-3',
          category_id: 'cat-hw',
          title: 'Fabrication Gerber Archive',
          file_name: 'gerbers.zip',
        },
      ];

      const evaluation = evaluateReleaseCompleteness(sampleRules, sampleCategories, selectedItems);

      expect(evaluation.allPassed).toBe(false);
      expect(evaluation.canPublish).toBe(false); // Can NOT publish because blocking BOM is missing!
      expect(evaluation.blockingMissingCount).toBe(1);
      expect(evaluation.blockingIssues[0]?.rule.item_name_pattern).toBe('BOM');
      expect(evaluation.warningMissingCount).toBe(1); // Test report is also missing (warning)
    });

    it('allows publishing when only warning rules are missing', () => {
      const selectedItems = [
        // Both blocking rules (BOM and PnP) are satisfied
        {
          id: 'i-1',
          category_id: 'cat-hw',
          title: 'Motherboard BOM',
          file_name: 'board_bom.csv',
        },
        {
          id: 'i-2',
          category_id: 'cat-hw',
          title: 'Component Placement PnP',
          file_name: 'board.pos',
        },
        // Warning rules (Gerber and test report) are NOT present
      ];

      const evaluation = evaluateReleaseCompleteness(sampleRules, sampleCategories, selectedItems);

      expect(evaluation.allPassed).toBe(false);
      expect(evaluation.canPublish).toBe(true); // CAN publish because no blocking rules are missing!
      expect(evaluation.blockingMissingCount).toBe(0);
      expect(evaluation.warningMissingCount).toBe(2);
      expect(evaluation.warningIssues.map((i) => i.rule.item_name_pattern)).toEqual([
        'Gerber',
        'test report',
      ]);
    });

    it('handles empty rules gracefully', () => {
      const evaluation = evaluateReleaseCompleteness([], sampleCategories, []);
      expect(evaluation.allPassed).toBe(true);
      expect(evaluation.canPublish).toBe(true);
      expect(evaluation.totalRules).toBe(0);
    });
  });
});

