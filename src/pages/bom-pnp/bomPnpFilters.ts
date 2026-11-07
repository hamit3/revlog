import type {
  BomBoardSide,
  BomPnpFinding,
  BomPnpSeverity,
  ParsedBomRow,
  ParsedPnpRow,
} from '../../types/database';

export interface FilterFindingsOptions {
  searchQuery?: string;
  severity?: BomPnpSeverity | 'all';
  source?: 'all' | 'bom' | 'pnp' | 'cross';
}

export function filterFindings(
  findings: readonly BomPnpFinding[],
  options: FilterFindingsOptions = {},
): BomPnpFinding[] {
  const { searchQuery = '', severity = 'all', source = 'all' } = options;
  const q = searchQuery.trim().toLowerCase();

  return findings.filter((f) => {
    if (severity !== 'all' && f.severity !== severity) {
      return false;
    }
    if (source !== 'all' && f.source !== source) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      f.message.toLowerCase().includes(q) ||
      f.code.toLowerCase().includes(q) ||
      f.designators.some((d) => d.toLowerCase().includes(q))
    );
  });
}

export interface FilterBomRowsOptions {
  searchQuery?: string;
  population?: 'all' | 'fitted' | 'dnp';
  issuesOnly?: boolean;
  affectedRowNumbers?: ReadonlySet<number>;
}

export function filterBomRows(
  rows: readonly ParsedBomRow[],
  options: FilterBomRowsOptions = {},
): ParsedBomRow[] {
  const { searchQuery = '', population = 'all', issuesOnly = false, affectedRowNumbers } = options;
  const q = searchQuery.trim().toLowerCase();

  return rows.filter((r) => {
    if (population === 'fitted' && r.dnp) {
      return false;
    }
    if (population === 'dnp' && !r.dnp) {
      return false;
    }
    if (issuesOnly && affectedRowNumbers && !affectedRowNumbers.has(r.rowNumber)) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      r.rawDesignators.toLowerCase().includes(q) ||
      r.designators.some((d) => d.toLowerCase().includes(q)) ||
      r.value.toLowerCase().includes(q) ||
      r.footprint.toLowerCase().includes(q) ||
      r.mpn.toLowerCase().includes(q) ||
      r.manufacturer.toLowerCase().includes(q)
    );
  });
}

export interface FilterPnpRowsOptions {
  searchQuery?: string;
  side?: BomBoardSide | 'all';
  issuesOnly?: boolean;
  affectedRowNumbers?: ReadonlySet<number>;
}

export function filterPnpRows(
  rows: readonly ParsedPnpRow[],
  options: FilterPnpRowsOptions = {},
): ParsedPnpRow[] {
  const { searchQuery = '', side = 'all', issuesOnly = false, affectedRowNumbers } = options;
  const q = searchQuery.trim().toLowerCase();

  return rows.filter((r) => {
    if (side !== 'all' && r.side !== side) {
      return false;
    }
    if (issuesOnly && affectedRowNumbers && !affectedRowNumbers.has(r.rowNumber)) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      r.designator.toLowerCase().includes(q) ||
      r.value.toLowerCase().includes(q) ||
      r.footprint.toLowerCase().includes(q)
    );
  });
}
