/**
 * Utility functions for detecting and validating PDF and schematic files.
 */

const PDF_FILE_EXTENSIONS = ['.pdf'];

const SCHEMATIC_EXTENSIONS = [
  '.pdf',
  '.sch',
  '.kicad_sch',
  '.brd',
  '.dsn',
];

const SCHEMATIC_KEYWORDS = [
  'schematic',
  'sch',
  'circuit',
  'diagram',
  'sema',
  'sematik',
  'wiring',
];

/**
 * Checks if a file name has a .pdf extension.
 */
export function isPdfFileName(fileName?: string | null): boolean {
  if (!fileName) {
    return false;
  }
  const lower = fileName.trim().toLowerCase();
  return PDF_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Checks if a file name is likely a schematic (e.g. schematic.pdf, board_sch.pdf, etc.).
 */
export function isSchematicFileName(fileName?: string | null): boolean {
  if (!fileName) {
    return false;
  }
  const lower = fileName.trim().toLowerCase();
  const hasSchematicExt = SCHEMATIC_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const hasSchematicKeyword = SCHEMATIC_KEYWORDS.some((kw) => lower.includes(kw));
  return hasSchematicExt && hasSchematicKeyword;
}

/**
 * Checks if the byte buffer starts with the '%PDF-' magic header (0x25, 0x50, 0x44, 0x46, 0x2D).
 */
export function isPdfBuffer(buffer: ArrayBuffer | Uint8Array): boolean {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 5) {
    return false;
  }
  // %PDF-
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d    // -
  );
}

