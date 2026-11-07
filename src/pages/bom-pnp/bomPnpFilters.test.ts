import { describe, expect, it } from 'vitest';
import type { BomPnpFinding, ParsedBomRow, ParsedPnpRow } from '../../types/database';
import { filterBomRows, filterFindings, filterPnpRows } from './bomPnpFilters';

describe('BOM & PnP UI search and filtering helpers', () => {
  const sampleFindings: BomPnpFinding[] = [
    {
      id: 'f-1',
      code: 'missing_mpn',
      severity: 'warning',
      source: 'bom',
      designators: ['R1', 'R2'],
      affectedBomRows: [2],
      affectedPnpRows: [],
      message: 'Row 2 (R1, R2) has no Manufacturer Part Number (MPN).',
    },
    {
      id: 'f-2',
      code: 'missing_in_pnp',
      severity: 'error',
      source: 'cross',
      designators: ['C1'],
      affectedBomRows: [3],
      affectedPnpRows: [],
      message: 'Part C1 is in BOM but missing from PnP.',
    },
    {
      id: 'f-3',
      code: 'dnp_entry',
      severity: 'info',
      source: 'bom',
      designators: ['R5'],
      affectedBomRows: [5],
      affectedPnpRows: [],
      message: 'Row 5 (R5) is marked Do Not Populate.',
    },
  ];

  it('filters findings by search query, severity and source', () => {
    expect(filterFindings(sampleFindings)).toHaveLength(3);
    expect(filterFindings(sampleFindings, { severity: 'error' })).toEqual([sampleFindings[1]]);
    expect(filterFindings(sampleFindings, { source: 'bom' })).toEqual([
      sampleFindings[0],
      sampleFindings[2],
    ]);
    expect(filterFindings(sampleFindings, { searchQuery: 'C1' })).toEqual([sampleFindings[1]]);
    expect(filterFindings(sampleFindings, { searchQuery: 'missing_mpn' })).toEqual([
      sampleFindings[0],
    ]);
    expect(filterFindings(sampleFindings, { searchQuery: 'nonexistent' })).toEqual([]);
  });

  const sampleBomRows: ParsedBomRow[] = [
    {
      rowNumber: 2,
      rawDesignators: 'R1, R2',
      designators: ['R1', 'R2'],
      mpn: '',
      value: '10k',
      footprint: 'R_0603',
      quantity: 2,
      manufacturer: 'Yageo',
      dnp: false,
      side: 'top',
    },
    {
      rowNumber: 3,
      rawDesignators: 'C1',
      designators: ['C1'],
      mpn: 'GRM188R71H104KA93D',
      value: '100nF',
      footprint: 'C_0603',
      quantity: 1,
      manufacturer: 'Murata',
      dnp: false,
      side: 'top',
    },
    {
      rowNumber: 5,
      rawDesignators: 'R5',
      designators: ['R5'],
      mpn: 'RC0603FR-070RL',
      value: '0R',
      footprint: 'R_0603',
      quantity: 1,
      manufacturer: 'Yageo',
      dnp: true,
      side: 'bottom',
    },
  ];

  it('filters BOM rows by population, search and issue association', () => {
    expect(filterBomRows(sampleBomRows)).toHaveLength(3);
    expect(filterBomRows(sampleBomRows, { population: 'dnp' })).toEqual([sampleBomRows[2]]);
    expect(filterBomRows(sampleBomRows, { population: 'fitted' })).toHaveLength(2);
    expect(filterBomRows(sampleBomRows, { searchQuery: 'Murata' })).toEqual([sampleBomRows[1]]);
    expect(
      filterBomRows(sampleBomRows, {
        issuesOnly: true,
        affectedRowNumbers: new Set([2]),
      }),
    ).toEqual([sampleBomRows[0]]);
  });

  const samplePnpRows: ParsedPnpRow[] = [
    {
      rowNumber: 2,
      designator: 'R1',
      value: '10k',
      footprint: 'R_0603',
      x: 12.5,
      y: 8.2,
      rawRotation: '90',
      rotation: 90,
      rawSide: 'top',
      side: 'top',
    },
    {
      rowNumber: 3,
      designator: 'R5',
      value: '0R',
      footprint: 'R_0603',
      x: 18.0,
      y: 14.1,
      rawRotation: '0',
      rotation: 0,
      rawSide: 'bottom',
      side: 'bottom',
    },
  ];

  it('filters PnP rows by layer side, search and issue association', () => {
    expect(filterPnpRows(samplePnpRows)).toHaveLength(2);
    expect(filterPnpRows(samplePnpRows, { side: 'bottom' })).toEqual([samplePnpRows[1]]);
    expect(filterPnpRows(samplePnpRows, { searchQuery: 'R1' })).toEqual([samplePnpRows[0]]);
    expect(
      filterPnpRows(samplePnpRows, {
        issuesOnly: true,
        affectedRowNumbers: new Set([3]),
      }),
    ).toEqual([samplePnpRows[1]]);
  });
});
