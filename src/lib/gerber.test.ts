import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { tokens } from '../theme/tokens';

// Polyfill FileReader for Vitest Node environment
if (typeof globalThis.FileReader === 'undefined') {
  class TestFileReader {
    result: string | null = null;
    listeners: Record<string, (() => void)[]> = {};
    readAsText(blob: Blob) {
      blob
        .text()
        .then((text) => {
          this.result = text;
          this.listeners['load']?.forEach((fn) => fn());
        })
        .catch(() => {
          this.listeners['error']?.forEach((fn) => fn());
        });
    }
    addEventListener(event: string, fn: () => void) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(fn);
    }
    removeEventListener(event: string, fn: () => void) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter((cb) => cb !== fn);
      }
    }
  }
  Object.defineProperty(globalThis, 'FileReader', {
    value: TestFileReader,
    writable: true,
    configurable: true,
  });
}

import {
  extractFilesFromZip,
  getDefaultLayerColor,
  isAnyGerberItem,
  isGerberArchiveFileName,
  isGerberFileName,
  parseGerberFiles,
} from './gerber';

const SAMPLE_TOP_COPPER = `G04 RevLog Sample KiCad Gerber*
%FSLAX24Y24*%
%MOIN*%
%ADD10C,0.020000*%
%ADD11R,0.060000X0.040000*%
D10*
X1000Y1000D02*
X2000Y1000D01*
X2000Y2000D01*
X1000Y2000D01*
X1000Y1000D01*
D11*
X1500Y1500D03*
M02*`;

const SAMPLE_OUTLINE = `G04 Board Edge Outline*
%FSLAX24Y24*%
%MOIN*%
%ADD10C,0.010000*%
D10*
X0Y0D02*
X3000Y0D01*
X3000Y3000D01*
X0Y3000D01*
X0Y0D01*
M02*`;

const SAMPLE_BOTTOM_COPPER = `G04 Bottom Copper*
%FSLAX24Y24*%
%MOIN*%
%ADD10C,0.020000*%
D10*
X500Y500D02*
X2500Y500D01*
X2500Y2500D01*
X500Y2500D01*
M02*`;

describe('gerber library', () => {
  describe('filename identification', () => {
    it('identifies standard Gerber layer file extensions', () => {
      expect(isGerberFileName('project-F_Cu.gbr')).toBe(true);
      expect(isGerberFileName('board.GTL')).toBe(true);
      expect(isGerberFileName('layer.gbl')).toBe(true);
      expect(isGerberFileName('board.Edge_Cuts.ger')).toBe(true);
      expect(isGerberFileName('drills.drl')).toBe(true);
      expect(isGerberFileName('holes.xln')).toBe(true);
      expect(isGerberFileName('notes.txt')).toBe(false);
      expect(isGerberFileName('bom.csv')).toBe(false);
      expect(isGerberFileName(null)).toBe(false);
    });

    it('identifies Gerber archive zip files', () => {
      expect(isGerberArchiveFileName('gerbers.zip')).toBe(true);
      expect(isGerberArchiveFileName('sensor_cam_outputs.ZIP')).toBe(true);
      expect(isGerberArchiveFileName('pcb_fab_package.zip')).toBe(true);
      expect(isGerberArchiveFileName('board_release.zip')).toBe(true);
      expect(isGerberArchiveFileName('source_code.zip')).toBe(false);
      expect(isGerberArchiveFileName(null)).toBe(false);
    });

    it('identifies any gerber item (single file or archive)', () => {
      expect(isAnyGerberItem('board-F_Cu.gbr')).toBe(true);
      expect(isAnyGerberItem('gerbers.zip')).toBe(true);
      expect(isAnyGerberItem('schematic.pdf')).toBe(false);
    });
  });

  describe('layer color determination', () => {
    it('returns standard PCB engineering colors by type and side', () => {
      expect(getDefaultLayerColor('copper', 'top')).toBe(tokens.colors.gerberCopperTop);
      expect(getDefaultLayerColor('copper', 'bottom')).toBe(tokens.colors.gerberCopperBottom);
      expect(getDefaultLayerColor('outline', 'all')).toBe(tokens.colors.gerberOutline);
      expect(getDefaultLayerColor('drill', 'all')).toBe(tokens.colors.gerberDrill);
      expect(getDefaultLayerColor('silkscreen', 'top')).toBe(tokens.colors.gerberSilkscreen);
    });
  });

  describe('parseGerberFiles', () => {
    it('returns error when file list is empty', async () => {
      const result = await parseGerberFiles([]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No Gerber files provided');
      }
    });

    it('gracefully handles corrupted or non-gerber content', async () => {
      const result = await parseGerberFiles([
        { name: 'corrupted.gbr', content: 'INVALID_NON_GERBER_SYNTAX_DATA_12345' },
      ]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/Failed to parse Gerber files|not recognized/);
      }
    });

    it('successfully parses single Gerber layer', async () => {
      const result = await parseGerberFiles([
        { name: 'sensor-F_Cu.gbr', content: SAMPLE_TOP_COPPER },
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.layers).toHaveLength(1);
        expect(result.layers[0]!.filename).toBe('sensor-F_Cu.gbr');
        expect(result.layers[0]!.type).toBe('copper');
        expect(result.layers[0]!.side).toBe('top');
        expect(result.layers[0]!.svg).toContain('<svg');
      }
    });

    it('successfully parses multi-layer stackup with top copper, bottom copper and outline', async () => {
      const result = await parseGerberFiles([
        { name: 'sensor-F_Cu.gbr', content: SAMPLE_TOP_COPPER },
        { name: 'sensor-B_Cu.gbr', content: SAMPLE_BOTTOM_COPPER },
        { name: 'sensor-Edge_Cuts.gbr', content: SAMPLE_OUTLINE },
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.layers.length).toBeGreaterThanOrEqual(3);
        expect(result.topBoardSvg).toBeTruthy();
        expect(result.bottomBoardSvg).toBeTruthy();
        expect(result.viewBox).toBeTruthy();
      }
    });
  });

  describe('extractFilesFromZip', () => {
    it('extracts Gerber files from in-memory zip buffer', () => {
      const zipData = zipSync({
        'sensor-F_Cu.gbr': strToU8(SAMPLE_TOP_COPPER),
        'sensor-Edge_Cuts.gbr': strToU8(SAMPLE_OUTLINE),
        'readme.txt': strToU8('ignore this text'),
      });

      const extracted = extractFilesFromZip(zipData);
      expect(extracted.length).toBeGreaterThanOrEqual(2);
      expect(extracted.some((f) => f.name === 'sensor-F_Cu.gbr')).toBe(true);
      expect(extracted.some((f) => f.name === 'sensor-Edge_Cuts.gbr')).toBe(true);
    });
  });
});
