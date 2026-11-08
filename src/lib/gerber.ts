import { read, plot, renderLayers, renderBoard, stringifySvg } from '@tracespace/core';
import type { GerberType, GerberSide } from '@tracespace/identify-layers';
import { unzipSync } from 'fflate';
import { tokens } from '../theme/tokens';
import { sanitizeSvg } from './svgSanitizer';

export interface GerberLayer {
  id: string;
  filename: string;
  type: GerberType;
  side: GerberSide;
  color: string;
  svg: string;
  visible: boolean;
}

export interface GerberParsedResult {
  success: true;
  layers: GerberLayer[];
  topBoardSvg: string | null;
  bottomBoardSvg: string | null;
  viewBox: string | null;
}

export interface GerberParseError {
  success: false;
  error: string;
  filename?: string;
}

export type GerberResult = GerberParsedResult | GerberParseError;

export const GERBER_EXTENSIONS = [
  '.gbr',
  '.ger',
  '.gtl',
  '.gbl',
  '.gto',
  '.gbo',
  '.gts',
  '.gbs',
  '.gm1',
  '.gm2',
  '.gko',
  '.edge',
  '.drl',
  '.xln',
  '.exc',
  '.nc',
  '.drd',
] as const;

export function isGerberFileName(fileName?: string | null): boolean {
  if (!fileName) {
    return false;
  }
  const lower = fileName.toLowerCase().trim();
  return GERBER_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isGerberArchiveFileName(fileName?: string | null): boolean {
  if (!fileName) {
    return false;
  }
  const lower = fileName.toLowerCase().trim();
  return (
    lower.endsWith('.zip') &&
    (lower.includes('gerber') ||
      lower.includes('cam') ||
      lower.includes('pcb') ||
      lower.includes('fab') ||
      lower.includes('board') ||
      lower.includes('layout'))
  );
}

export function isAnyGerberItem(fileName?: string | null): boolean {
  if (!fileName) {
    return false;
  }
  return isGerberFileName(fileName) || isGerberArchiveFileName(fileName);
}

export function getDefaultLayerColor(type: GerberType, side: GerberSide): string {
  switch (type) {
    case 'copper':
      return side === 'bottom' ? tokens.colors.gerberCopperBottom : tokens.colors.gerberCopperTop;
    case 'silkscreen':
      return tokens.colors.gerberSilkscreen;
    case 'soldermask':
      return side === 'bottom'
        ? tokens.colors.gerberSoldermaskBottom
        : tokens.colors.gerberSoldermaskTop;
    case 'outline':
      return tokens.colors.gerberOutline;
    case 'drill':
      return tokens.colors.gerberDrill;
    default:
      return tokens.colors.gerberOther;
  }
}

const MAX_UNCOMPRESSED_FILE_BYTES = 10 * 1024 * 1024; // 10 MB limit per file entry

export function extractFilesFromZip(zipBuffer: Uint8Array): { name: string; content: string }[] {
  const unzipped = unzipSync(zipBuffer);
  const result: { name: string; content: string }[] = [];
  const textDecoder = new TextDecoder('utf-8', { fatal: false });

  for (const [path, data] of Object.entries(unzipped)) {
    if (
      path.endsWith('/') ||
      path.includes('__MACOSX') ||
      data.length === 0 ||
      data.length > MAX_UNCOMPRESSED_FILE_BYTES
    ) {
      continue;
    }
    const basename = path.split('/').pop() ?? path;
    if (isGerberFileName(basename)) {
      result.push({
        name: basename,
        content: textDecoder.decode(data),
      });
    }
  }

  // If no files matched strict extension, fallback to text/CAM files under 10MB
  if (result.length === 0) {
    for (const [path, data] of Object.entries(unzipped)) {
      if (
        path.endsWith('/') ||
        path.includes('__MACOSX') ||
        data.length === 0 ||
        data.length > MAX_UNCOMPRESSED_FILE_BYTES
      ) {
        continue;
      }
      const basename = path.split('/').pop() ?? path;
      const lower = basename.toLowerCase();
      if (
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.pdf') ||
        lower.endsWith('.exe') ||
        lower.endsWith('.bin') ||
        lower.endsWith('.zip')
      ) {
        continue;
      }
      result.push({
        name: basename,
        content: textDecoder.decode(data),
      });
    }
  }

  return result;
}

export async function parseGerberFiles(
  files: { name: string; content: string }[],
): Promise<GerberResult> {
  if (files.length === 0) {
    return {
      success: false,
      error: 'No Gerber files provided for parsing.',
    };
  }

  try {
    const fileObjects = files.map((f) => new File([f.content], f.name));
    const readResult = await read(fileObjects);

    if (!readResult.layers || readResult.layers.length === 0) {
      return {
        success: false,
        error: 'No recognizable Gerber or drill layers found in the provided files.',
      };
    }

    const plotResult = plot(readResult);
    const renderLayersResult = renderLayers(plotResult);

    const layers: GerberLayer[] = renderLayersResult.layers.map((layer) => {
      const svgElement = renderLayersResult.rendersById[layer.id];
      const rawSvg = svgElement ? stringifySvg(svgElement) : '';
      return {
        id: layer.id,
        filename: layer.filename,
        type: layer.type,
        side: layer.side,
        color: getDefaultLayerColor(layer.type, layer.side),
        svg: sanitizeSvg(rawSvg),
        visible: true,
      };
    });

    let topBoardSvg: string | null = null;
    let bottomBoardSvg: string | null = null;

    try {
      const renderBoardResult = renderBoard(renderLayersResult);
      if (renderBoardResult.top) {
        topBoardSvg = sanitizeSvg(stringifySvg(renderBoardResult.top));
      }
      if (renderBoardResult.bottom) {
        bottomBoardSvg = sanitizeSvg(stringifySvg(renderBoardResult.bottom));
      }
    } catch {
      // Board composite render might fail if board outline is missing; individual layers will still render cleanly
    }

    let viewBox: string | null = null;
    const match = (topBoardSvg || layers[0]?.svg || '').match(/viewBox="([^"]+)"/);
    if (match?.[1]) {
      viewBox = match[1];
    }

    return {
      success: true,
      layers,
      topBoardSvg,
      bottomBoardSvg,
      viewBox,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Failed to parse Gerber files: ${message}`,
    };
  }
}
