import { compareCodePoints } from './manifestHash';
import type {
  BomBoardSide,
  BomColumnMapping,
  BomPnpColumnMapping,
  BomPnpFinding,
  BomPnpFormat,
  BomPnpSeverity,
  BomPnpSummary,
  ParsedBomRow,
  ParsedPnpRow,
  PnpColumnMapping,
} from '../types/database';

export interface ParsedCsvRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ParsedCsvTable {
  headers: string[];
  headerRowNumber: number;
  rows: ParsedCsvRow[];
}

export interface BomColumnDetectionResult {
  format: BomPnpFormat;
  mapping: BomColumnMapping;
  needsColumnMapping: boolean;
  missingRequired: string[];
}

export interface PnpColumnDetectionResult {
  format: BomPnpFormat;
  mapping: PnpColumnMapping;
  needsColumnMapping: boolean;
  missingRequired: string[];
}

export interface RunBomPnpChecksInput {
  bomRows?: readonly ParsedBomRow[];
  pnpRows?: readonly ParsedPnpRow[];
  hasBom: boolean;
  hasPnp: boolean;
}

export interface RunBomPnpChecksResult {
  findings: BomPnpFinding[];
  summary: BomPnpSummary;
}

export interface EvaluateBomPnpCsvOptions {
  bomText?: string | null;
  pnpText?: string | null;
  bomMappingOverride?: BomColumnMapping | null;
  pnpMappingOverride?: PnpColumnMapping | null;
}

export interface EvaluateBomPnpCsvResult {
  bomTable: ParsedCsvTable | null;
  pnpTable: ParsedCsvTable | null;
  bomDetection: BomColumnDetectionResult | null;
  pnpDetection: PnpColumnDetectionResult | null;
  effectiveColumnMapping: BomPnpColumnMapping;
  parsedBom: ParsedBomRow[];
  parsedPnp: ParsedPnpRow[];
  findings: BomPnpFinding[];
  summary: BomPnpSummary;
}

interface LogicalLine {
  lineNumber: number;
  raw: string;
}

const CANDIDATE_DELIMITERS = [',', ';', '\t'] as const;

const PRIMARY_DESIGNATOR_KEYS = new Set([
  'ref',
  'refs',
  'reference',
  'references',
  'designator',
  'designators',
  'refdes',
  'ref des',
  'part reference',
]);

function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./]+/g, ' ');
}

function stripHeaderUnits(normalizedKey: string): string {
  return normalizedKey
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits text into logical records while preserving newlines inside RFC 4180 quoted cells
 * and ignoring stray inch marks (e.g. 0.1") inside unquoted cells.
 */
function splitLogicalLines(input: string): LogicalLine[] {
  const lines: LogicalLine[] = [];
  let currentLine = 1;
  let recordStartLine = 1;
  let inQuotes = false;
  let atFieldStart = true;
  let buf = '';

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          buf += '""';
          i += 1;
        } else {
          inQuotes = false;
          buf += ch;
        }
      } else if (ch === '\r') {
        if (input[i + 1] === '\n') {
          i += 1;
        }
        buf += '\n';
        currentLine += 1;
      } else if (ch === '\n') {
        buf += '\n';
        currentLine += 1;
      } else {
        buf += ch;
      }
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && input[i + 1] === '\n') {
        i += 1;
      }
      lines.push({ lineNumber: recordStartLine, raw: buf });
      buf = '';
      currentLine += 1;
      recordStartLine = currentLine;
      atFieldStart = true;
      continue;
    }

    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      buf += ch;
      continue;
    }

    if (ch === ',' || ch === ';' || ch === '\t') {
      atFieldStart = true;
      buf += ch;
      continue;
    }

    if (ch === ' ' && atFieldStart) {
      buf += ch;
      continue;
    }

    atFieldStart = false;
    buf += ch;
  }

  if (buf.length > 0) {
    lines.push({ lineNumber: recordStartLine, raw: buf });
  }

  return lines;
}

/**
 * Parses a single logical CSV record using RFC 4180 quoting rules for the chosen delimiter.
 */
export function parseDelimitedRow(raw: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  let atFieldStart = true;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === delimiter) {
      cells.push(current);
      current = '';
      atFieldStart = true;
      continue;
    }

    if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      continue;
    }

    if (ch === ' ' && atFieldStart) {
      current += ch;
      continue;
    }

    atFieldStart = false;
    current += ch;
  }

  cells.push(current);
  return cells;
}

function countNonEmptyCells(cells: readonly string[]): number {
  let count = 0;
  for (const cell of cells) {
    if (cell.trim().length > 0) {
      count += 1;
    }
  }
  return count;
}

function hasKnownPrimaryHeader(cells: readonly string[]): boolean {
  for (const cell of cells) {
    if (PRIMARY_DESIGNATOR_KEYS.has(normalizeHeaderKey(cell))) {
      return true;
    }
  }
  return false;
}

function tryParseKicadAsciiPosTable(logicalLines: readonly LogicalLine[]): ParsedCsvTable | null {
  let headerLineIdx = -1;
  let headerTokens: string[] = [];

  for (let i = 0; i < Math.min(logicalLines.length, 30); i += 1) {
    const line = logicalLines[i]!;
    const trimmed = line.raw.trim();
    if (!trimmed.startsWith('#') || trimmed.startsWith('##')) {
      continue;
    }
    const withoutHash = trimmed.replace(/^#+\s*/, '').trim();
    const tokens = withoutHash.split(/\s+/).filter((tok) => tok.length > 0);
    if (tokens.length >= 4 && hasKnownPrimaryHeader(tokens)) {
      headerLineIdx = i;
      headerTokens = tokens;
      break;
    }
  }

  if (headerLineIdx < 0) {
    return null;
  }

  const headerEntries = buildUniqueHeaderColumns(headerTokens);
  const headers = headerEntries.map((entry) => entry.name);
  const rows: ParsedCsvRow[] = [];

  for (let i = headerLineIdx + 1; i < logicalLines.length; i += 1) {
    const line = logicalLines[i]!;
    const trimmed = line.raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const cells = trimmed.split(/\s+/);
    if (countNonEmptyCells(cells) === 0) {
      continue;
    }
    const values: Record<string, string> = {};
    for (const col of headerEntries) {
      values[col.name] = (cells[col.index] ?? '').trim();
    }
    rows.push({ rowNumber: line.lineNumber, values });
  }

  return {
    headers,
    headerRowNumber: logicalLines[headerLineIdx]!.lineNumber,
    rows,
  };
}

function buildUniqueHeaderColumns(
  rawHeaderCells: readonly string[],
): { name: string; index: number }[] {
  const seenCounts = new Map<string, number>();
  const result: { name: string; index: number }[] = [];

  for (let idx = 0; idx < rawHeaderCells.length; idx += 1) {
    const base = (rawHeaderCells[idx] ?? '').trim();
    if (base.length === 0) {
      continue;
    }
    const prev = seenCounts.get(base) ?? 0;
    seenCounts.set(base, prev + 1);
    const uniqueName = prev === 0 ? base : `${base} (${prev + 1})`;
    result.push({ name: uniqueName, index: idx });
  }

  return result;
}

/**
 * Parses delimited BOM or Pick-and-Place text into headers and 1-based numbered rows.
 * Handles UTF-8 BOM, CRLF/LF, leading '#' comments, Altium preamble blocks,
 * KiCad whitespace-aligned .pos files, auto-detected ',', ';', or '\t' delimiters,
 * and RFC 4180 quoted cells.
 */
export function parseCsvTable(text: string): ParsedCsvTable {
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  if (withoutBom.trim().length === 0) {
    return { headers: [], headerRowNumber: 0, rows: [] };
  }

  const logicalLines = splitLogicalLines(withoutBom);
  const contentLines = logicalLines.filter((line) => {
    const trimmed = line.raw.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#');
  });

  if (contentLines.length === 0) {
    return { headers: [], headerRowNumber: 0, rows: [] };
  }

  const sampleCount = Math.min(contentLines.length, 30);
  let bestDelimiter: string = ',';
  let bestHeaderIdx = 0;
  let bestScore = 0;

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const sampleCells = contentLines
      .slice(0, sampleCount)
      .map((line) => parseDelimitedRow(line.raw, delimiter));
    const sampleNonEmpty = sampleCells.map((cells) => countNonEmptyCells(cells));

    let candidateIdx = 0;
    const firstCells = sampleCells[0] ?? [];
    const firstNonEmpty = sampleNonEmpty[0] ?? 0;

    if (firstNonEmpty <= 2 && !hasKnownPrimaryHeader(firstCells)) {
      for (let i = 1; i < sampleCells.length; i += 1) {
        const priorAllSmall = sampleNonEmpty
          .slice(0, i)
          .every((count, idx) => count <= 2 && !hasKnownPrimaryHeader(sampleCells[idx] ?? []));
        if (!priorAllSmall) {
          break;
        }
        const currNonEmpty = sampleNonEmpty[i] ?? 0;
        const nextNonEmpty =
          i + 1 < sampleNonEmpty.length ? (sampleNonEmpty[i + 1] ?? 0) : currNonEmpty;
        if (currNonEmpty >= 3 && nextNonEmpty >= Math.min(3, currNonEmpty - 1)) {
          candidateIdx = i;
          break;
        }
      }
    }

    const headerCells = sampleCells[candidateIdx] ?? [];
    const delimiterCount = headerCells.length - 1;
    if (delimiterCount <= 0) {
      continue;
    }

    const nonEmptyCount = sampleNonEmpty[candidateIdx] ?? 0;
    const nextCells =
      candidateIdx + 1 < sampleCells.length ? (sampleCells[candidateIdx + 1] ?? []) : headerCells;
    const consistencyBonus = nextCells.length === headerCells.length ? 2 : 0;
    const headerKnownBonus = hasKnownPrimaryHeader(headerCells) ? 4 : 0;
    const score = nonEmptyCount * 2 + consistencyBonus + headerKnownBonus;

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
      bestHeaderIdx = candidateIdx;
    }
  }

  if (bestScore === 0) {
    const kicadAscii = tryParseKicadAsciiPosTable(logicalLines);
    if (kicadAscii) {
      return kicadAscii;
    }
  }

  const headerLine = contentLines[bestHeaderIdx]!;
  const rawHeaderCells = parseDelimitedRow(headerLine.raw, bestDelimiter);
  const headerColumns = buildUniqueHeaderColumns(rawHeaderCells);
  const headers = headerColumns.map((col) => col.name);
  const rows: ParsedCsvRow[] = [];

  for (let i = bestHeaderIdx + 1; i < contentLines.length; i += 1) {
    const rowLine = contentLines[i]!;
    const cells = parseDelimitedRow(rowLine.raw, bestDelimiter);
    if (countNonEmptyCells(cells) === 0) {
      continue;
    }

    const values: Record<string, string> = {};
    for (const col of headerColumns) {
      values[col.name] = (cells[col.index] ?? '').trim();
    }
    rows.push({ rowNumber: rowLine.lineNumber, values });
  }

  return {
    headers,
    headerRowNumber: headerLine.lineNumber,
    rows,
  };
}

function findMatchingHeader(
  headers: readonly string[],
  usedHeaders: Set<string>,
  exactNormalizedNames: readonly string[],
  strippedUnitNames: readonly string[] = [],
): string | null {
  for (const target of exactNormalizedNames) {
    for (const header of headers) {
      if (usedHeaders.has(header)) {
        continue;
      }
      if (normalizeHeaderKey(header) === target) {
        usedHeaders.add(header);
        return header;
      }
    }
  }

  for (const target of strippedUnitNames) {
    for (const header of headers) {
      if (usedHeaders.has(header)) {
        continue;
      }
      if (stripHeaderUnits(normalizeHeaderKey(header)) === target) {
        usedHeaders.add(header);
        return header;
      }
    }
  }

  return null;
}

export function detectBomColumnMapping(headers: readonly string[]): BomColumnDetectionResult {
  const used = new Set<string>();

  const designators = findMatchingHeader(headers, used, [
    'reference',
    'references',
    'ref',
    'refs',
    'designator',
    'designators',
    'refdes',
    'ref des',
    'part reference',
  ]);

  const mpn = findMatchingHeader(headers, used, [
    'mpn',
    'manufacturer part number',
    'manufacturer part number 1',
    'mfr part number',
    'mfg part number',
    'mfr part #',
    'mfg part #',
    'manufacturer part #',
    'mfr pn',
    'mfg pn',
    'manf#',
    'manf part number',
    'part number',
    'partnumber',
  ]);

  const value = findMatchingHeader(headers, used, ['value', 'val', 'comment']);

  const footprint = findMatchingHeader(headers, used, [
    'footprint',
    'package',
    'pcb footprint',
    'pattern',
    'case',
    'land pattern',
  ]);

  const dnpDirect = findMatchingHeader(headers, used, [
    'dnp',
    'do not populate',
    'exclude from board',
    'exclude from bom',
    'dns',
    'dni',
    'no populate',
  ]);

  const dnpFitted = dnpDirect
    ? null
    : findMatchingHeader(headers, used, ['fitted', 'populate', 'populated', 'mounted', 'mount']);

  const dnp = dnpDirect ?? dnpFitted;
  const dnpPolarity: 'dnp' | 'fitted' = dnpFitted ? 'fitted' : 'dnp';

  const quantity = findMatchingHeader(headers, used, ['qty', 'quantity', 'count', 'qnty']);

  const manufacturer = findMatchingHeader(headers, used, [
    'manufacturer',
    'manufacturer 1',
    'mfr',
    'mfg',
    'manf',
    'vendor',
  ]);

  const side = findMatchingHeader(headers, used, [
    'side',
    'layer',
    'board side',
    'mount side',
    'placement side',
    'top bottom',
  ]);

  const missingRequired: string[] = [];
  if (!designators) {
    missingRequired.push('designators');
  }
  const hasSecondary = Boolean(value || footprint || mpn);
  if (!hasSecondary) {
    missingRequired.push('value', 'footprint', 'mpn');
  }

  const needsColumnMapping = !designators || !hasSecondary;

  const normalizedSet = new Set(headers.map((h) => normalizeHeaderKey(h)));
  let format: BomPnpFormat = 'unrecognized';
  if (!needsColumnMapping) {
    const hasAltiumDesignator = normalizedSet.has('designator') || normalizedSet.has('designators');
    const hasAltiumSecondary =
      normalizedSet.has('comment') ||
      normalizedSet.has('fitted') ||
      normalizedSet.has('populate') ||
      normalizedSet.has('mounted') ||
      normalizedSet.has('libref') ||
      normalizedSet.has('layer') ||
      normalizedSet.has('manufacturer part number 1');

    const hasKicadReference =
      normalizedSet.has('reference') || normalizedSet.has('ref') || normalizedSet.has('references');
    const hasKicadSecondary =
      normalizedSet.has('value') ||
      normalizedSet.has('val') ||
      normalizedSet.has('footprint') ||
      normalizedSet.has('package') ||
      normalizedSet.has('dnp') ||
      normalizedSet.has('exclude from board') ||
      normalizedSet.has('qty');

    if (hasAltiumDesignator && hasAltiumSecondary) {
      format = 'altium';
    } else if (hasKicadReference && hasKicadSecondary) {
      format = 'kicad';
    } else {
      format = 'generic';
    }
  }

  return {
    format,
    mapping: {
      designators,
      mpn,
      value,
      footprint,
      dnp,
      dnpPolarity,
      quantity,
      manufacturer,
      side,
    },
    needsColumnMapping,
    missingRequired,
  };
}

export function detectPnpColumnMapping(headers: readonly string[]): PnpColumnDetectionResult {
  const used = new Set<string>();

  const designator = findMatchingHeader(headers, used, [
    'ref',
    'reference',
    'designator',
    'refdes',
    'ref des',
  ]);

  const value = findMatchingHeader(headers, used, ['val', 'value', 'comment']);

  const footprint = findMatchingHeader(headers, used, [
    'package',
    'footprint',
    'pcb footprint',
    'pattern',
  ]);

  const x = findMatchingHeader(
    headers,
    used,
    ['posx', 'pos x', 'position x', 'mid x', 'center x', 'ref x', 'pad x', 'x', 'x coord', 'loc x'],
    ['posx', 'pos x', 'position x', 'mid x', 'center x', 'ref x', 'pad x', 'x', 'location x'],
  );

  const y = findMatchingHeader(
    headers,
    used,
    ['posy', 'pos y', 'position y', 'mid y', 'center y', 'ref y', 'pad y', 'y', 'y coord', 'loc y'],
    ['posy', 'pos y', 'position y', 'mid y', 'center y', 'ref y', 'pad y', 'y', 'location y'],
  );

  const rotation = findMatchingHeader(
    headers,
    used,
    ['rot', 'rotation', 'angle', 'orientation', 'theta'],
    ['rot', 'rotation', 'angle', 'orientation', 'theta'],
  );

  const side = findMatchingHeader(headers, used, [
    'side',
    'layer',
    'tb',
    'board side',
    'mount side',
    'top bottom',
  ]);

  const missingRequired: string[] = [];
  if (!designator) {
    missingRequired.push('designator');
  }
  const hasSecondary = Boolean(side || rotation || x || y);
  if (!hasSecondary) {
    missingRequired.push('side', 'rotation', 'x', 'y');
  }

  const needsColumnMapping = !designator || !hasSecondary;

  const normalizedList = headers.map((h) => normalizeHeaderKey(h));
  const strippedSet = new Set(normalizedList.map((n) => stripHeaderUnits(n)));
  const normalizedSet = new Set(normalizedList);

  let format: BomPnpFormat = 'unrecognized';
  if (!needsColumnMapping) {
    const isAltium =
      normalizedSet.has('designator') &&
      (strippedSet.has('center x') ||
        strippedSet.has('mid x') ||
        strippedSet.has('ref x') ||
        strippedSet.has('pad x') ||
        normalizedSet.has('layer') ||
        normalizedSet.has('comment'));

    const isKicad =
      (normalizedSet.has('ref') || normalizedSet.has('reference')) &&
      (normalizedSet.has('posx') ||
        normalizedSet.has('pos x') ||
        normalizedSet.has('rot') ||
        normalizedSet.has('val') ||
        normalizedSet.has('package') ||
        normalizedSet.has('side'));

    if (isAltium) {
      format = 'altium';
    } else if (isKicad) {
      format = 'kicad';
    } else {
      format = 'generic';
    }
  }

  return {
    format,
    mapping: {
      designator,
      value,
      footprint,
      x,
      y,
      rotation,
      side,
    },
    needsColumnMapping,
    missingRequired,
  };
}

/**
 * Expands multi-designator BOM cells such as "C1, C2, C3", "R1 R2", and numeric ranges "R1-R4"
 * (when prefix matches and count <= 256) into trimmed uppercase designators.
 * Preserves duplicate tokens so duplicate-designator checks catch intra-row duplicates.
 */
export function expandDesignators(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const tokens = trimmed.split(/[,;\s]+/).filter((tok) => tok.length > 0);
  const expanded: string[] = [];

  for (const token of tokens) {
    const upper = token.trim().toUpperCase();
    if (upper.length === 0) {
      continue;
    }

    const rangeMatch = /^([A-Z_]+)(\d+)(?:-|\.\.|–)([A-Z_]+)(\d+)$/.exec(upper);
    if (rangeMatch) {
      const prefixStart = rangeMatch[1]!;
      const numStartStr = rangeMatch[2]!;
      const prefixEnd = rangeMatch[3]!;
      const numEndStr = rangeMatch[4]!;
      const startNum = Number.parseInt(numStartStr, 10);
      const endNum = Number.parseInt(numEndStr, 10);

      if (
        prefixStart === prefixEnd &&
        Number.isSafeInteger(startNum) &&
        Number.isSafeInteger(endNum) &&
        endNum >= startNum &&
        endNum - startNum + 1 <= 256
      ) {
        const padWidth =
          numStartStr.startsWith('0') && numStartStr.length === numEndStr.length
            ? numStartStr.length
            : 0;
        for (let n = startNum; n <= endNum; n += 1) {
          const digits = padWidth > 0 ? String(n).padStart(padWidth, '0') : String(n);
          expanded.push(`${prefixStart}${digits}`);
        }
        continue;
      }
    }

    expanded.push(upper);
  }

  return expanded;
}

export function normalizeBoardSide(raw: string): BomBoardSide {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');

  if (
    cleaned === 'top' ||
    cleaned === 't' ||
    cleaned === 'toplayer' ||
    cleaned === 'top layer' ||
    cleaned === 'f.cu' ||
    cleaned === 'f cu' ||
    cleaned === 'front' ||
    cleaned === 'topside' ||
    cleaned === 'top side' ||
    cleaned === 'component side'
  ) {
    return 'top';
  }

  if (
    cleaned === 'bottom' ||
    cleaned === 'b' ||
    cleaned === 'bot' ||
    cleaned === 'bottomlayer' ||
    cleaned === 'bottom layer' ||
    cleaned === 'b.cu' ||
    cleaned === 'b cu' ||
    cleaned === 'back' ||
    cleaned === 'bottomside' ||
    cleaned === 'bottom side' ||
    cleaned === 'solder side'
  ) {
    return 'bottom';
  }

  return 'unknown';
}

const DNP_TRUTHY_VALUES = new Set([
  'dnp',
  '1',
  'yes',
  'y',
  'true',
  'x',
  'excluded',
  'do not populate',
  'do not fit',
  'dns',
  'dni',
  'nf',
  'not fitted',
  'notfitted',
  'nm',
  'not mounted',
  'unpopulated',
]);

const FITTED_UNPOPULATED_VALUES = new Set([
  'not fitted',
  'notfitted',
  'nf',
  'no',
  'n',
  'false',
  '0',
  'dnp',
  'dns',
  'dni',
  'nm',
  'not mounted',
  'do not populate',
  'do not fit',
  'unpopulated',
  'excluded',
]);

const FITTED_POPULATED_VALUES = new Set([
  'fitted',
  'fit',
  'yes',
  'y',
  'true',
  '1',
  'populated',
  'populate',
  'mounted',
  'mount',
  'installed',
  'install',
]);

const VALUE_DNP_MARKERS = new Set(['dnp', 'do not populate', 'dns', 'dni']);

function evaluateBomDnp(
  rawDnpCell: string | null,
  polarity: 'dnp' | 'fitted',
  valueCell: string,
): boolean {
  const normalizedValue = valueCell
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');

  if (rawDnpCell !== null) {
    const normalizedDnp = rawDnpCell
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, ' ');

    if (polarity === 'fitted') {
      if (FITTED_UNPOPULATED_VALUES.has(normalizedDnp)) {
        return true;
      }
      if (FITTED_POPULATED_VALUES.has(normalizedDnp)) {
        return false;
      }
    } else if (DNP_TRUTHY_VALUES.has(normalizedDnp)) {
      return true;
    }
  }

  return VALUE_DNP_MARKERS.has(normalizedValue);
}

function parseOptionalNumber(raw: string, stripPattern?: RegExp): number | null {
  let cleaned = raw.trim();
  if (cleaned.length === 0) {
    return null;
  }
  if (stripPattern) {
    cleaned = cleaned.replace(stripPattern, '').trim();
  }
  if (/^[+-]?\d+,\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) {
    return null;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function getMappedCell(values: Record<string, string>, columnName?: string | null): string {
  if (!columnName) {
    return '';
  }
  return (values[columnName] ?? '').trim();
}

export function parseBomWithMapping(
  table: ParsedCsvTable,
  mapping: BomColumnMapping,
): ParsedBomRow[] {
  const polarity = mapping.dnpPolarity ?? 'dnp';

  return table.rows.map((row) => {
    const rawDesignators = getMappedCell(row.values, mapping.designators);
    const designators = expandDesignators(rawDesignators);
    const mpn = getMappedCell(row.values, mapping.mpn);
    const value = getMappedCell(row.values, mapping.value);
    const footprint = getMappedCell(row.values, mapping.footprint);
    const rawQuantity = getMappedCell(row.values, mapping.quantity);
    const quantity = parseOptionalNumber(rawQuantity);
    const manufacturer = getMappedCell(row.values, mapping.manufacturer);
    const rawDnp = mapping.dnp ? getMappedCell(row.values, mapping.dnp) : null;
    const dnp = evaluateBomDnp(rawDnp, polarity, value);
    const rawSide = getMappedCell(row.values, mapping.side);
    const side: BomBoardSide | null = rawSide.length > 0 ? normalizeBoardSide(rawSide) : null;

    return {
      rowNumber: row.rowNumber,
      rawDesignators,
      designators,
      mpn,
      value,
      footprint,
      quantity,
      manufacturer,
      dnp,
      side,
    };
  });
}

export function parsePnpWithMapping(
  table: ParsedCsvTable,
  mapping: PnpColumnMapping,
): ParsedPnpRow[] {
  return table.rows.map((row) => {
    const designator = getMappedCell(row.values, mapping.designator).toUpperCase();
    const value = getMappedCell(row.values, mapping.value);
    const footprint = getMappedCell(row.values, mapping.footprint);
    const rawX = getMappedCell(row.values, mapping.x);
    const rawY = getMappedCell(row.values, mapping.y);
    const x = parseOptionalNumber(rawX, /\s*(?:mm|mils?|in(?:ch)?)$/i);
    const y = parseOptionalNumber(rawY, /\s*(?:mm|mils?|in(?:ch)?)$/i);
    const rawRotation = getMappedCell(row.values, mapping.rotation);
    const rotation = parseOptionalNumber(rawRotation, /\s*(?:deg(?:rees?)?|°)$/i);
    const rawSide = getMappedCell(row.values, mapping.side);
    const side = normalizeBoardSide(rawSide);

    return {
      rowNumber: row.rowNumber,
      designator,
      value,
      footprint,
      x,
      y,
      rawRotation,
      rotation,
      rawSide,
      side,
    };
  });
}

function uniqueSortedNumbers(nums: readonly number[]): number[] {
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

function uniqueDesignators(designators: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const d of designators) {
    if (!seen.has(d)) {
      seen.add(d);
      result.push(d);
    }
  }
  return result;
}

function formatDesignatorParen(designators: readonly string[]): string {
  const unique = uniqueDesignators(designators);
  if (unique.length === 0) {
    return '';
  }
  if (unique.length <= 4) {
    return ` (${unique.join(', ')})`;
  }
  return ` (${unique.slice(0, 4).join(', ')} and ${unique.length - 4} more)`;
}

const SEVERITY_ORDER: Record<BomPnpSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function firstAffectedRow(finding: BomPnpFinding): number {
  let min = Number.MAX_SAFE_INTEGER;
  for (const r of finding.affectedBomRows) {
    if (r < min) {
      min = r;
    }
  }
  for (const r of finding.affectedPnpRows) {
    if (r < min) {
      min = r;
    }
  }
  return min;
}

/**
 * Runs 100% deterministic BOM, PnP, and cross BOM-vs-PnP consistency checks.
 */
export function runBomPnpChecks({
  bomRows = [],
  pnpRows = [],
  hasBom,
  hasPnp,
}: RunBomPnpChecksInput): RunBomPnpChecksResult {
  const rawFindings: Omit<BomPnpFinding, 'id'>[] = [];

  const bomByDesignator = new Map<
    string,
    { count: number; rows: number[]; populatedRows: ParsedBomRow[]; dnpRows: ParsedBomRow[] }
  >();

  if (hasBom) {
    for (const row of bomRows) {
      for (const des of row.designators) {
        let entry = bomByDesignator.get(des);
        if (!entry) {
          entry = { count: 0, rows: [], populatedRows: [], dnpRows: [] };
          bomByDesignator.set(des, entry);
        }
        entry.count += 1;
        entry.rows.push(row.rowNumber);
        if (row.dnp) {
          entry.dnpRows.push(row);
        } else {
          entry.populatedRows.push(row);
        }
      }

      const rowDes = uniqueDesignators(row.designators);

      if (row.dnp) {
        rawFindings.push({
          code: 'dnp_entry',
          severity: 'info',
          source: 'bom',
          designators: rowDes,
          affectedBomRows: [row.rowNumber],
          affectedPnpRows: [],
          message: `BOM row ${row.rowNumber}${formatDesignatorParen(rowDes)} is marked Do Not Populate.`,
        });
      }

      if (!row.dnp && row.mpn.trim().length === 0) {
        rawFindings.push({
          code: 'missing_mpn',
          severity: 'warning',
          source: 'bom',
          designators: rowDes,
          affectedBomRows: [row.rowNumber],
          affectedPnpRows: [],
          message: `BOM row ${row.rowNumber}${formatDesignatorParen(rowDes)} is missing a manufacturer part number (MPN).`,
        });
      }

      if (row.value.trim().length === 0) {
        rawFindings.push({
          code: 'empty_value',
          severity: 'warning',
          source: 'bom',
          designators: rowDes,
          affectedBomRows: [row.rowNumber],
          affectedPnpRows: [],
          message: `BOM row ${row.rowNumber}${formatDesignatorParen(rowDes)} has an empty component value.`,
        });
      }

      if (!row.dnp && row.footprint.trim().length === 0) {
        rawFindings.push({
          code: 'empty_footprint',
          severity: 'warning',
          source: 'bom',
          designators: rowDes,
          affectedBomRows: [row.rowNumber],
          affectedPnpRows: [],
          message: `BOM row ${row.rowNumber}${formatDesignatorParen(rowDes)} has an empty footprint.`,
        });
      }
    }

    const sortedBomDesignators = Array.from(bomByDesignator.keys()).sort(compareCodePoints);
    for (const des of sortedBomDesignators) {
      const info = bomByDesignator.get(des)!;
      if (info.count > 1) {
        const affectedRows = uniqueSortedNumbers(info.rows);
        const message =
          affectedRows.length > 1
            ? `Reference designator ${des} is duplicated across BOM rows ${affectedRows.join(', ')}.`
            : `Reference designator ${des} appears multiple times in BOM row ${affectedRows[0]}.`;
        rawFindings.push({
          code: 'duplicate_bom_designator',
          severity: 'error',
          source: 'bom',
          designators: [des],
          affectedBomRows: affectedRows,
          affectedPnpRows: [],
          message,
        });
      }
    }
  }

  const pnpByDesignator = new Map<string, ParsedPnpRow[]>();

  if (hasPnp) {
    for (const row of pnpRows) {
      if (row.designator.length > 0) {
        const list = pnpByDesignator.get(row.designator);
        if (list) {
          list.push(row);
        } else {
          pnpByDesignator.set(row.designator, [row]);
        }
      }

      const rowDes = row.designator.length > 0 ? [row.designator] : [];

      if (row.side === 'unknown') {
        const rawSuffix = row.rawSide.length > 0 ? ` ("${row.rawSide}")` : '';
        rawFindings.push({
          code: 'side_mismatch',
          severity: 'warning',
          source: 'pnp',
          designators: rowDes,
          affectedBomRows: [],
          affectedPnpRows: [row.rowNumber],
          message: `PnP row ${row.rowNumber}${formatDesignatorParen(rowDes)} has an unrecognized or missing board side${rawSuffix}.`,
        });
      }

      if (row.rotation === null) {
        const rawSuffix = row.rawRotation.length > 0 ? ` ("${row.rawRotation}")` : '';
        rawFindings.push({
          code: 'rotation_anomaly',
          severity: 'warning',
          source: 'pnp',
          designators: rowDes,
          affectedBomRows: [],
          affectedPnpRows: [row.rowNumber],
          message: `PnP row ${row.rowNumber}${formatDesignatorParen(rowDes)} has a missing or invalid rotation value${rawSuffix}.`,
        });
      } else if (Math.abs(row.rotation) > 360) {
        rawFindings.push({
          code: 'rotation_anomaly',
          severity: 'warning',
          source: 'pnp',
          designators: rowDes,
          affectedBomRows: [],
          affectedPnpRows: [row.rowNumber],
          message: `PnP row ${row.rowNumber}${formatDesignatorParen(rowDes)} has an out-of-range rotation angle of ${row.rotation} degrees.`,
        });
      } else {
        const nearest45 = Math.round(row.rotation / 45) * 45;
        if (Math.abs(row.rotation - nearest45) > 1e-6) {
          rawFindings.push({
            code: 'rotation_anomaly',
            severity: 'warning',
            source: 'pnp',
            designators: rowDes,
            affectedBomRows: [],
            affectedPnpRows: [row.rowNumber],
            message: `PnP row ${row.rowNumber}${formatDesignatorParen(rowDes)} has a non-standard rotation angle of ${row.rotation} degrees (not a multiple of 45 degrees).`,
          });
        }
      }
    }

    const sortedPnpDesignators = Array.from(pnpByDesignator.keys()).sort(compareCodePoints);
    for (const des of sortedPnpDesignators) {
      const matchingRows = pnpByDesignator.get(des)!;
      if (matchingRows.length > 1) {
        const affectedRows = uniqueSortedNumbers(matchingRows.map((r) => r.rowNumber));
        rawFindings.push({
          code: 'duplicate_pnp_designator',
          severity: 'error',
          source: 'pnp',
          designators: [des],
          affectedBomRows: [],
          affectedPnpRows: affectedRows,
          message: `Reference designator ${des} is duplicated across PnP rows ${affectedRows.join(', ')}.`,
        });
      }
    }
  }

  if (hasBom && hasPnp) {
    const sortedBomDesignators = Array.from(bomByDesignator.keys()).sort(compareCodePoints);
    for (const des of sortedBomDesignators) {
      const bomInfo = bomByDesignator.get(des)!;
      const pnpMatches = pnpByDesignator.get(des) ?? [];

      if (bomInfo.populatedRows.length > 0 && pnpMatches.length === 0) {
        const affectedBom = uniqueSortedNumbers(bomInfo.populatedRows.map((r) => r.rowNumber));
        rawFindings.push({
          code: 'missing_in_pnp',
          severity: 'error',
          source: 'cross',
          designators: [des],
          affectedBomRows: affectedBom,
          affectedPnpRows: [],
          message: `Populated BOM component ${des} (BOM row ${affectedBom.join(', ')}) is missing from Pick and Place.`,
        });
      } else if (
        bomInfo.populatedRows.length === 0 &&
        bomInfo.dnpRows.length > 0 &&
        pnpMatches.length > 0
      ) {
        const affectedBom = uniqueSortedNumbers(bomInfo.dnpRows.map((r) => r.rowNumber));
        const affectedPnp = uniqueSortedNumbers(pnpMatches.map((r) => r.rowNumber));
        rawFindings.push({
          code: 'dnp_present_in_pnp',
          severity: 'warning',
          source: 'cross',
          designators: [des],
          affectedBomRows: affectedBom,
          affectedPnpRows: affectedPnp,
          message: `Component ${des} is marked Do Not Populate in BOM row ${affectedBom.join(', ')} but appears in PnP row ${affectedPnp.join(', ')}.`,
        });
      }

      if (pnpMatches.length > 0) {
        const allBomRowsForDes = [...bomInfo.populatedRows, ...bomInfo.dnpRows];
        for (const bomRow of allBomRowsForDes) {
          if (bomRow.side !== 'top' && bomRow.side !== 'bottom') {
            continue;
          }
          for (const pnpRow of pnpMatches) {
            if (
              (pnpRow.side === 'top' || pnpRow.side === 'bottom') &&
              pnpRow.side !== bomRow.side
            ) {
              rawFindings.push({
                code: 'side_mismatch',
                severity: 'error',
                source: 'cross',
                designators: [des],
                affectedBomRows: [bomRow.rowNumber],
                affectedPnpRows: [pnpRow.rowNumber],
                message: `Board side mismatch for ${des}: BOM row ${bomRow.rowNumber} specifies ${bomRow.side}, whereas PnP row ${pnpRow.rowNumber} specifies ${pnpRow.side}.`,
              });
            }
          }
        }
      }
    }

    const sortedPnpDesignators = Array.from(pnpByDesignator.keys()).sort(compareCodePoints);
    for (const des of sortedPnpDesignators) {
      if (!bomByDesignator.has(des)) {
        const pnpMatches = pnpByDesignator.get(des)!;
        const affectedPnp = uniqueSortedNumbers(pnpMatches.map((r) => r.rowNumber));
        rawFindings.push({
          code: 'extra_in_pnp',
          severity: 'error',
          source: 'cross',
          designators: [des],
          affectedBomRows: [],
          affectedPnpRows: affectedPnp,
          message: `Component ${des} in PnP row ${affectedPnp.join(', ')} is not present in the BOM.`,
        });
      }
    }
  }

  const idCounts = new Map<string, number>();
  const findingsWithIds: BomPnpFinding[] = rawFindings.map((item) => {
    const baseId = `${item.code}:${item.designators.join(',') || 'row'}:b${item.affectedBomRows.join('_')}:p${item.affectedPnpRows.join('_')}`;
    const prev = idCounts.get(baseId) ?? 0;
    idCounts.set(baseId, prev + 1);
    const id = prev === 0 ? baseId : `${baseId}:${prev + 1}`;
    return { id, ...item };
  });

  findingsWithIds.sort((left, right) => {
    const sevDiff = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (sevDiff !== 0) {
      return sevDiff;
    }
    const rowDiff = firstAffectedRow(left) - firstAffectedRow(right);
    if (rowDiff !== 0) {
      return rowDiff;
    }
    const codeDiff = compareCodePoints(left.code, right.code);
    if (codeDiff !== 0) {
      return codeDiff;
    }
    const desDiff = compareCodePoints(left.designators.join(','), right.designators.join(','));
    if (desDiff !== 0) {
      return desDiff;
    }
    return compareCodePoints(left.id, right.id);
  });

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const f of findingsWithIds) {
    if (f.severity === 'error') {
      errorCount += 1;
    } else if (f.severity === 'warning') {
      warningCount += 1;
    } else {
      infoCount += 1;
    }
  }

  const bomRowCount = hasBom ? bomRows.length : 0;
  const bomComponentCount = hasBom ? bomRows.reduce((sum, r) => sum + r.designators.length, 0) : 0;
  const bomDnpCount = hasBom
    ? bomRows.reduce((sum, r) => sum + (r.dnp ? Math.max(r.designators.length, 1) : 0), 0)
    : 0;
  const pnpRowCount = hasPnp ? pnpRows.length : 0;

  return {
    findings: findingsWithIds,
    summary: {
      error_count: errorCount,
      warning_count: warningCount,
      info_count: infoCount,
      bom_row_count: bomRowCount,
      bom_component_count: bomComponentCount,
      bom_dnp_count: bomDnpCount,
      pnp_row_count: pnpRowCount,
    },
  };
}

/**
 * Convenience pipeline that parses raw BOM and/or PnP CSV text, detects headers (or applies
 * manual column mappings), parses normalized rows, and runs consistency checks.
 */
export function evaluateBomPnpCsvTexts({
  bomText,
  pnpText,
  bomMappingOverride,
  pnpMappingOverride,
}: EvaluateBomPnpCsvOptions): EvaluateBomPnpCsvResult {
  const hasBom = typeof bomText === 'string' && bomText.trim().length > 0;
  const hasPnp = typeof pnpText === 'string' && pnpText.trim().length > 0;

  const bomTable = hasBom ? parseCsvTable(bomText) : null;
  const pnpTable = hasPnp ? parseCsvTable(pnpText) : null;

  const bomDetection = bomTable ? detectBomColumnMapping(bomTable.headers) : null;
  const pnpDetection = pnpTable ? detectPnpColumnMapping(pnpTable.headers) : null;

  const effectiveBomMapping = bomMappingOverride ?? bomDetection?.mapping ?? null;
  const effectivePnpMapping = pnpMappingOverride ?? pnpDetection?.mapping ?? null;

  const parsedBom =
    bomTable && effectiveBomMapping?.designators
      ? parseBomWithMapping(bomTable, effectiveBomMapping)
      : [];
  const parsedPnp =
    pnpTable && effectivePnpMapping?.designator
      ? parsePnpWithMapping(pnpTable, effectivePnpMapping)
      : [];

  const { findings, summary } = runBomPnpChecks({
    bomRows: parsedBom,
    pnpRows: parsedPnp,
    hasBom: Boolean(bomTable && effectiveBomMapping?.designators),
    hasPnp: Boolean(pnpTable && effectivePnpMapping?.designator),
  });

  return {
    bomTable,
    pnpTable,
    bomDetection,
    pnpDetection,
    effectiveColumnMapping: {
      bom: effectiveBomMapping,
      pnp: effectivePnpMapping,
    },
    parsedBom,
    parsedPnp,
    findings,
    summary,
  };
}

/**
 * Heuristic helper to identify likely BOM file items by title or filename.
 */
export function isLikelyBomName(nameOrTitle: string): boolean {
  const lower = nameOrTitle.toLowerCase();
  return /\bbom\b|bill[\s_-]*of[\s_-]*materials/.test(lower);
}

/**
 * Heuristic helper to identify likely Pick-and-Place / centroid file items by title or filename.
 */
export function isLikelyPnpName(nameOrTitle: string): boolean {
  const lower = nameOrTitle.toLowerCase();
  return (
    lower.endsWith('.pos') ||
    lower.endsWith('.xy') ||
    /\bpnp\b|pick[\s_-]*(?:and|&)[\s_-]*place|centroid|cpl|positions?\b/.test(lower)
  );
}
