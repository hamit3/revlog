import { describe, expect, it } from 'vitest';
import { isPdfBuffer, isPdfFileName, isSchematicFileName } from './pdf';

describe('PDF and schematic detection utilities', () => {
  it('correctly detects PDF file extensions', () => {
    expect(isPdfFileName('schematic.pdf')).toBe(true);
    expect(isPdfFileName('DATASHEET.PDF')).toBe(true);
    expect(isPdfFileName('my_board_v1.0.pdf')).toBe(true);
    expect(isPdfFileName('notes.txt')).toBe(false);
    expect(isPdfFileName('gerber.zip')).toBe(false);
    expect(isPdfFileName(null)).toBe(false);
    expect(isPdfFileName(undefined)).toBe(false);
  });

  it('identifies schematic file names and keywords', () => {
    expect(isSchematicFileName('main_schematic.pdf')).toBe(true);
    expect(isSchematicFileName('power_sch.pdf')).toBe(true);
    expect(isSchematicFileName('wiring_diagram.pdf')).toBe(true);
    expect(isSchematicFileName('kicad_project.kicad_sch')).toBe(true);
    expect(isSchematicFileName('datasheet.pdf')).toBe(false);
    expect(isSchematicFileName('random.pdf')).toBe(false);
    expect(isSchematicFileName(null)).toBe(false);
  });

  it('validates %PDF- magic bytes header', () => {
    // Valid %PDF-1.7
    const validPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(isPdfBuffer(validPdfBytes)).toBe(true);
    expect(isPdfBuffer(validPdfBytes.buffer)).toBe(true);

    // Invalid bytes
    const invalidBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK.. (ZIP)
    expect(isPdfBuffer(invalidBytes)).toBe(false);

    // Too short
    expect(isPdfBuffer(new Uint8Array([0x25, 0x50]))).toBe(false);
  });
});

