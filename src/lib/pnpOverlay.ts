import { tokens } from '../theme/tokens';
import type { BomBoardSide, ParsedBomRow, ParsedPnpRow } from '../types/database';

export interface PnpOverlayComponent {
  designator: string;
  value: string;
  footprint: string;
  x: number;
  y: number;
  rotation: number;
  side: BomBoardSide;
  bomRow: ParsedBomRow | null;
  widthMm: number;
  heightMm: number;
  pin1X: number;
  pin1Y: number;
}

export interface SvgViewBoxBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface ComponentSvgPosition {
  x: number;
  y: number;
  rotation: number;
  transform: string;
}

export const PNP_OVERLAY_THEME = {
  componentBg: tokens.colors.pnpOverlayComponentBg,
  componentBorder: tokens.colors.pnpOverlayComponentBorder,
  pin1Marker: tokens.colors.pnpOverlayPin1Marker,
  selectedBg: tokens.colors.pnpOverlaySelected,
  selectedBorder: tokens.colors.pnpOverlaySelectedBorder,
  hoverBorder: tokens.colors.pnpOverlayHoverBorder,
  textColor: tokens.colors.pnpOverlayText,
} as const;

export const DEFAULT_FALLBACK_WIDTH_MM = 2.0;
export const DEFAULT_FALLBACK_HEIGHT_MM = 1.5;

/**
 * Normalizes rotation angle to 0 <= deg < 360, avoiding -0.
 */
export function normalizeRotation(angle: number): number {
  let normalized = angle % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized === 0 ? 0 : Number(normalized.toFixed(4));
}

/**
 * Parses an SVG viewBox string (e.g. "-10 -20 120 80") into numerical bounds.
 */
export function parseSvgViewBox(viewBoxStr?: string | null): SvgViewBoxBounds | null {
  if (!viewBoxStr) {
    return null;
  }
  const parts = viewBoxStr
    .trim()
    .split(/[\s,]+/)
    .map((s) => parseFloat(s));
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    const [minX, minY, width, height] = parts as [number, number, number, number];
    return { minX, minY, width, height };
  }
  return null;
}

/**
 * Estimates component physical dimensions (width and height in mm) from a footprint string.
 * Deterministically recognizes standard chip passives (imperial and metric), transistors,
 * IC packages (SOIC, TSSOP, MSOP, QFP, QFN, BGA), and explicit dimensions (e.g. 7x7mm).
 */
export function estimateFootprintDimensions(footprint?: string | null): {
  widthMm: number;
  heightMm: number;
} {
  if (!footprint || !footprint.trim()) {
    return { widthMm: DEFAULT_FALLBACK_WIDTH_MM, heightMm: DEFAULT_FALLBACK_HEIGHT_MM };
  }

  const normalized = footprint.trim().toUpperCase();

  // 1. Direct dimension pattern in footprint name, e.g. "7x7mm", "5.0x5.0mm", "3.9x4.9mm"
  const dimMatch = normalized.match(/(?:^|[-_\s])(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*MM/);
  if (dimMatch) {
    const w = parseFloat(dimMatch[1] ?? '0');
    const h = parseFloat(dimMatch[2] ?? '0');
    if (w > 0 && h > 0) {
      return { widthMm: Number(w.toFixed(2)), heightMm: Number(h.toFixed(2)) };
    }
  }

  // 2. Ultra-small and standard passive chip packages
  // Ordered specifically to prevent metric suffix collision (e.g. 0201 vs 0603Metric)
  if (/\b01005\b|0402METRIC/.test(normalized)) {
    return { widthMm: 0.4, heightMm: 0.2 };
  }
  if (/\b0201\b|0603METRIC/.test(normalized)) {
    return { widthMm: 0.6, heightMm: 0.3 };
  }
  if (/\b0402\b|1005METRIC/.test(normalized)) {
    return { widthMm: 1.0, heightMm: 0.5 };
  }
  if (/\b0603\b|1608METRIC/.test(normalized)) {
    return { widthMm: 1.6, heightMm: 0.8 };
  }
  if (/\b0805\b|2012METRIC/.test(normalized)) {
    return { widthMm: 2.0, heightMm: 1.25 };
  }
  if (/\b1206\b|3216METRIC/.test(normalized)) {
    return { widthMm: 3.2, heightMm: 1.6 };
  }
  if (/\b1210\b|3225METRIC/.test(normalized)) {
    return { widthMm: 3.2, heightMm: 2.5 };
  }
  if (/\b1812\b|4532METRIC/.test(normalized)) {
    return { widthMm: 4.5, heightMm: 3.2 };
  }
  if (/\b2010\b|5025METRIC/.test(normalized)) {
    return { widthMm: 5.0, heightMm: 2.5 };
  }
  if (/\b2512\b|6432METRIC/.test(normalized)) {
    return { widthMm: 6.4, heightMm: 3.2 };
  }

  // 3. Discrete diodes and transistors
  if (/\bSOT[-_]23|SOT23/.test(normalized)) {
    return { widthMm: 2.9, heightMm: 1.3 };
  }
  if (/\bSOT[-_]223|SOT223/.test(normalized)) {
    return { widthMm: 6.5, heightMm: 3.5 };
  }
  if (/\bSOT[-_]323|SOT323|\bSC[-_]70/.test(normalized)) {
    return { widthMm: 2.0, heightMm: 1.25 };
  }
  if (/\bSOT[-_]89|SOT89/.test(normalized)) {
    return { widthMm: 4.5, heightMm: 2.5 };
  }
  if (/\bSOD[-_]123|SOD123|\bSMA\b|DO[-_]214AC/.test(normalized)) {
    return { widthMm: 2.7, heightMm: 1.6 };
  }
  if (/\bSOD[-_]323|SOD323/.test(normalized)) {
    return { widthMm: 1.7, heightMm: 1.25 };
  }
  if (/\bSOD[-_]523|SOD523/.test(normalized)) {
    return { widthMm: 1.2, heightMm: 0.8 };
  }
  if (/\bSMB\b|DO[-_]214AA/.test(normalized)) {
    return { widthMm: 5.4, heightMm: 3.6 };
  }
  if (/\bSMC\b|DO[-_]214AB/.test(normalized)) {
    return { widthMm: 7.9, heightMm: 5.9 };
  }

  // 4. Small Outline ICs (SOIC, TSSOP, MSOP)
  if (/\bSOIC[-_]8\b|\bSO[-_]8\b|\bSOIC8\b/.test(normalized)) {
    return { widthMm: 4.9, heightMm: 3.9 };
  }
  if (/\bSOIC[-_]14\b|\bSO[-_]14\b|\bSOIC14\b/.test(normalized)) {
    return { widthMm: 8.7, heightMm: 3.9 };
  }
  if (/\bSOIC[-_]16\b|\bSO[-_]16\b|\bSOIC16\b/.test(normalized)) {
    return { widthMm: 9.9, heightMm: 3.9 };
  }
  if (/\bSOIC[-_]20\b|\bSO[-_]20\b|\bSOIC20\b/.test(normalized)) {
    return { widthMm: 12.8, heightMm: 7.5 };
  }
  if (/\bSOIC|\bSO\b/.test(normalized)) {
    return { widthMm: 5.0, heightMm: 4.0 };
  }

  if (/\bTSSOP[-_]8\b/.test(normalized)) {
    return { widthMm: 3.0, heightMm: 4.4 };
  }
  if (/\bTSSOP[-_]14\b|\bTSSOP[-_]16\b/.test(normalized)) {
    return { widthMm: 5.0, heightMm: 4.4 };
  }
  if (/\bTSSOP[-_]20\b/.test(normalized)) {
    return { widthMm: 6.5, heightMm: 4.4 };
  }
  if (/\bTSSOP[-_]24\b|\bTSSOP[-_]28\b/.test(normalized)) {
    return { widthMm: 8.0, heightMm: 4.4 };
  }
  if (/\bTSSOP|\bSSOP/.test(normalized)) {
    return { widthMm: 6.0, heightMm: 4.4 };
  }

  if (/\bMSOP[-_]8\b|\bMSOP[-_]10\b|\bMSOP\b/.test(normalized)) {
    return { widthMm: 3.0, heightMm: 3.0 };
  }

  // 5. Quad Flat Packages (QFP, TQFP, LQFP)
  if (/\b[TLP]?QFP[-_]32\b/.test(normalized)) {
    return { widthMm: 7.0, heightMm: 7.0 };
  }
  if (/\b[TLP]?QFP[-_]44\b/.test(normalized)) {
    return { widthMm: 10.0, heightMm: 10.0 };
  }
  if (/\b[TLP]?QFP[-_]48\b/.test(normalized)) {
    return { widthMm: 7.0, heightMm: 7.0 };
  }
  if (/\b[TLP]?QFP[-_]64\b/.test(normalized)) {
    return { widthMm: 10.0, heightMm: 10.0 };
  }
  if (/\b[TLP]?QFP[-_]100\b/.test(normalized)) {
    return { widthMm: 14.0, heightMm: 14.0 };
  }
  if (/\b[TLP]?QFP\b/.test(normalized)) {
    return { widthMm: 10.0, heightMm: 10.0 };
  }

  // 6. QFN and DFN
  if (/\bQFN[-_]16\b|\bQFN[-_]20\b|\bQFN[-_]24\b/.test(normalized)) {
    return { widthMm: 4.0, heightMm: 4.0 };
  }
  if (/\bQFN[-_]28\b|\bQFN[-_]32\b/.test(normalized)) {
    return { widthMm: 5.0, heightMm: 5.0 };
  }
  if (/\bQFN[-_]48\b/.test(normalized)) {
    return { widthMm: 7.0, heightMm: 7.0 };
  }
  if (/\bQFN[-_]64\b/.test(normalized)) {
    return { widthMm: 9.0, heightMm: 9.0 };
  }
  if (/\bQFN|\bMLF/.test(normalized)) {
    return { widthMm: 5.0, heightMm: 5.0 };
  }
  if (/\bDFN[-_]6\b/.test(normalized)) {
    return { widthMm: 2.0, heightMm: 2.0 };
  }
  if (/\bDFN[-_]8\b|\bDFN\b/.test(normalized)) {
    return { widthMm: 3.0, heightMm: 3.0 };
  }

  // 7. Ball Grid Array (BGA)
  if (/\bBGA[-_]48\b|\bBGA[-_]64\b/.test(normalized)) {
    return { widthMm: 8.0, heightMm: 8.0 };
  }
  if (/\bBGA[-_]100\b|\bBGA[-_]144\b/.test(normalized)) {
    return { widthMm: 10.0, heightMm: 10.0 };
  }
  if (/\bBGA[-_]256\b/.test(normalized)) {
    return { widthMm: 17.0, heightMm: 17.0 };
  }
  if (/\bBGA\b/.test(normalized)) {
    return { widthMm: 10.0, heightMm: 10.0 };
  }

  // 8. Dual In-line Packages (DIP)
  if (/\bDIP[-_]8\b/.test(normalized)) {
    return { widthMm: 9.6, heightMm: 6.3 };
  }
  if (/\bDIP[-_]14\b|\bDIP[-_]16\b/.test(normalized)) {
    return { widthMm: 19.0, heightMm: 6.3 };
  }
  if (/\bDIP[-_]28\b/.test(normalized)) {
    return { widthMm: 35.0, heightMm: 7.6 };
  }
  if (/\bDIP\b/.test(normalized)) {
    return { widthMm: 19.0, heightMm: 6.3 };
  }

  // 9. Fallback
  return { widthMm: DEFAULT_FALLBACK_WIDTH_MM, heightMm: DEFAULT_FALLBACK_HEIGHT_MM };
}

/**
 * Calculates local Pin 1 offset relative to component center (0, 0).
 */
export function calculatePin1Offset(
  widthMm: number,
  heightMm: number,
): { pin1X: number; pin1Y: number } {
  return {
    pin1X: Number((-widthMm * 0.35).toFixed(4)),
    pin1Y: Number((-heightMm * 0.35).toFixed(4)),
  };
}

/**
 * Computes absolute Pin 1 board coordinates (in board units) by applying component rotation.
 */
export function getPin1BoardCoordinates(comp: PnpOverlayComponent): { x: number; y: number } {
  const rad = (comp.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rotatedX = comp.pin1X * cos - comp.pin1Y * sin;
  const rotatedY = comp.pin1X * sin + comp.pin1Y * cos;
  return {
    x: Number((comp.x + rotatedX).toFixed(4)),
    y: Number((comp.y + rotatedY).toFixed(4)),
  };
}

/**
 * Computes component SVG coordinates and transform string.
 *
 * Gerber coordinate space has Y pointing UP, while SVG has Y pointing DOWN:
 * Top side: svgX = comp.x, svgY = -comp.y, svgRotation = -comp.rotation.
 * Bottom side: tracespace bottom board applies translate(2*minX + width, 0) scale(-1, 1).
 * When rendered as mirrored overlay: svgX = 2 * minX + width - comp.x, svgY = -comp.y, svgRotation = comp.rotation.
 */
export function getComponentSvgPosition(
  comp: PnpOverlayComponent,
  viewSide: 'top' | 'bottom' | 'layers',
  viewBox: SvgViewBoxBounds | null,
): ComponentSvgPosition {
  if (viewSide === 'bottom') {
    const minX = viewBox?.minX ?? 0;
    const width = viewBox?.width ?? 0;
    const x = Number((2 * minX + width - comp.x).toFixed(4));
    const y = Number((-comp.y).toFixed(4));
    const rotation = normalizeRotation(comp.rotation);
    const transform = `translate(${x}, ${y}) rotate(${rotation})`;
    return { x, y, rotation, transform };
  }

  // Top or Layers side
  const x = Number(comp.x.toFixed(4));
  const y = Number((-comp.y).toFixed(4));
  const rotation = normalizeRotation(-comp.rotation);
  const transform = `translate(${x}, ${y}) rotate(${rotation})`;
  return { x, y, rotation, transform };
}

/**
 * Computes the SVG transform string for positioning a component group over the Gerber view.
 */
export function getComponentSvgTransform(
  comp: PnpOverlayComponent,
  viewSide: 'top' | 'bottom' | 'layers',
  viewBox: SvgViewBoxBounds | null,
): string {
  return getComponentSvgPosition(comp, viewSide, viewBox).transform;
}

/**
 * Returns the SVG transform when rendered inside tracespace's bottom mirrored group
 * `<g transform="translate(2*minX + width, 0) scale(-1, 1)">`.
 */
export function getComponentInsideGroupSvgTransform(comp: PnpOverlayComponent): string {
  const x = Number(comp.x.toFixed(4));
  const y = Number((-comp.y).toFixed(4));
  const rotation = normalizeRotation(-comp.rotation);
  return `translate(${x}, ${y}) rotate(${rotation})`;
}

/**
 * Matches PnP rows with BOM rows by case-insensitive designator matching.
 * A BOM row can represent multiple components (e.g. ['R1', 'R2', 'R3']).
 */
export function matchPnpComponentsWithBom(
  pnpRows: ParsedPnpRow[],
  bomRows: ParsedBomRow[],
): PnpOverlayComponent[] {
  const bomMap = new Map<string, ParsedBomRow>();

  for (const bomRow of bomRows) {
    for (const des of bomRow.designators) {
      const trimmed = des.trim().toUpperCase();
      if (trimmed) {
        bomMap.set(trimmed, bomRow);
      }
    }
  }

  return pnpRows.map((pnp) => {
    const designator = pnp.designator.trim();
    const matchedBom = bomMap.get(designator.toUpperCase()) ?? null;
    const effectiveFootprint = pnp.footprint || matchedBom?.footprint || '';
    const effectiveValue = pnp.value || matchedBom?.value || '';

    const { widthMm, heightMm } = estimateFootprintDimensions(effectiveFootprint);
    const { pin1X, pin1Y } = calculatePin1Offset(widthMm, heightMm);

    return {
      designator,
      value: effectiveValue,
      footprint: effectiveFootprint,
      x: pnp.x ?? 0,
      y: pnp.y ?? 0,
      rotation: pnp.rotation ?? 0,
      side: pnp.side ?? 'unknown',
      bomRow: matchedBom,
      widthMm,
      heightMm,
      pin1X,
      pin1Y,
    };
  });
}

/**
 * Finds all overlay components matching the designators in a BOM row.
 */
export function findComponentsForBomRow(
  bomRow: ParsedBomRow,
  components: PnpOverlayComponent[],
): PnpOverlayComponent[] {
  const targetDesignators = new Set(
    bomRow.designators.map((d) => d.trim().toUpperCase()).filter(Boolean),
  );
  return components.filter((c) => targetDesignators.has(c.designator.trim().toUpperCase()));
}

/**
 * Finds the BOM row matching a component's designator (case-insensitive).
 */
export function findBomRowForComponent(
  designator: string,
  bomRows: ParsedBomRow[],
): ParsedBomRow | null {
  const target = designator.trim().toUpperCase();
  if (!target) {
    return null;
  }

  for (const bomRow of bomRows) {
    if (bomRow.designators.some((d) => d.trim().toUpperCase() === target)) {
      return bomRow;
    }
  }

  return null;
}

/**
 * Filters components by board side ('top' | 'bottom' | 'all').
 */
export function filterComponentsBySide(
  components: PnpOverlayComponent[],
  side: 'top' | 'bottom' | 'all',
): PnpOverlayComponent[] {
  if (side === 'all') {
    return components;
  }
  return components.filter((c) => c.side === side);
}

/**
 * Searches components across designator, value, footprint, MPN, and manufacturer.
 */
export function searchComponents(
  components: PnpOverlayComponent[],
  query: string,
): PnpOverlayComponent[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return components;
  }

  return components.filter((c) => {
    if (c.designator.toLowerCase().includes(q)) {
      return true;
    }
    if (c.value.toLowerCase().includes(q)) {
      return true;
    }
    if (c.footprint.toLowerCase().includes(q)) {
      return true;
    }
    if (c.bomRow?.mpn && c.bomRow.mpn.toLowerCase().includes(q)) {
      return true;
    }
    if (c.bomRow?.manufacturer && c.bomRow.manufacturer.toLowerCase().includes(q)) {
      return true;
    }
    return false;
  });
}
