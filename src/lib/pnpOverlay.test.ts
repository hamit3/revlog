import { describe, expect, it } from 'vitest';
import { tokens } from '../theme/tokens';
import type { ParsedBomRow, ParsedPnpRow } from '../types/database';
import {
  DEFAULT_FALLBACK_HEIGHT_MM,
  DEFAULT_FALLBACK_WIDTH_MM,
  PNP_OVERLAY_THEME,
  calculatePin1Offset,
  estimateFootprintDimensions,
  filterComponentsBySide,
  findBomRowForComponent,
  findComponentsForBomRow,
  getComponentInsideGroupSvgTransform,
  getComponentSvgPosition,
  getComponentSvgTransform,
  getPin1BoardCoordinates,
  matchPnpComponentsWithBom,
  normalizeRotation,
  parseSvgViewBox,
  searchComponents,
  type PnpOverlayComponent,
} from './pnpOverlay';

describe('pnpOverlay deterministic domain engine', () => {
  describe('footprint dimension estimation', () => {
    it('estimates dimensions for standard passive chip packages', () => {
      expect(estimateFootprintDimensions('0402')).toEqual({ widthMm: 1.0, heightMm: 0.5 });
      expect(estimateFootprintDimensions('0603')).toEqual({ widthMm: 1.6, heightMm: 0.8 });
      expect(estimateFootprintDimensions('0805')).toEqual({ widthMm: 2.0, heightMm: 1.25 });
      expect(estimateFootprintDimensions('1206')).toEqual({ widthMm: 3.2, heightMm: 1.6 });
      expect(estimateFootprintDimensions('1210')).toEqual({ widthMm: 3.2, heightMm: 2.5 });
      expect(estimateFootprintDimensions('1812')).toEqual({ widthMm: 4.5, heightMm: 3.2 });
      expect(estimateFootprintDimensions('2010')).toEqual({ widthMm: 5.0, heightMm: 2.5 });
      expect(estimateFootprintDimensions('2512')).toEqual({ widthMm: 6.4, heightMm: 3.2 });
      expect(estimateFootprintDimensions('0201')).toEqual({ widthMm: 0.6, heightMm: 0.3 });
      expect(estimateFootprintDimensions('01005')).toEqual({ widthMm: 0.4, heightMm: 0.2 });
    });

    it('correctly handles KiCad metric footprint naming without imperial collisions', () => {
      // KiCad R_0201_0603Metric must NOT match 0603 imperial
      expect(estimateFootprintDimensions('Resistor_SMD:R_0201_0603Metric')).toEqual({
        widthMm: 0.6,
        heightMm: 0.3,
      });
      expect(estimateFootprintDimensions('Resistor_SMD:R_0402_1005Metric')).toEqual({
        widthMm: 1.0,
        heightMm: 0.5,
      });
      expect(estimateFootprintDimensions('Capacitor_SMD:C_0603_1608Metric')).toEqual({
        widthMm: 1.6,
        heightMm: 0.8,
      });
      expect(estimateFootprintDimensions('Resistor_SMD:R_0805_2012Metric')).toEqual({
        widthMm: 2.0,
        heightMm: 1.25,
      });
      expect(estimateFootprintDimensions('Capacitor_SMD:C_1206_3216Metric')).toEqual({
        widthMm: 3.2,
        heightMm: 1.6,
      });
    });

    it('extracts explicit dimensions embedded in footprint names', () => {
      expect(estimateFootprintDimensions('Package_DFN_QFN:QFN-32-1EP_5x5mm_P0.5mm')).toEqual({
        widthMm: 5.0,
        heightMm: 5.0,
      });
      expect(estimateFootprintDimensions('Package_QFP:LQFP-48_7x7mm_P0.5mm')).toEqual({
        widthMm: 7.0,
        heightMm: 7.0,
      });
      expect(estimateFootprintDimensions('SOIC-8_3.9x4.9mm_P1.27mm')).toEqual({
        widthMm: 3.9,
        heightMm: 4.9,
      });
    });

    it('estimates dimensions for discrete transistors and diodes', () => {
      expect(estimateFootprintDimensions('Package_TO_SOT_SMD:SOT-23')).toEqual({
        widthMm: 2.9,
        heightMm: 1.3,
      });
      expect(estimateFootprintDimensions('SOT-223')).toEqual({ widthMm: 6.5, heightMm: 3.5 });
      expect(estimateFootprintDimensions('SOT-323')).toEqual({ widthMm: 2.0, heightMm: 1.25 });
      expect(estimateFootprintDimensions('SOT-89')).toEqual({ widthMm: 4.5, heightMm: 2.5 });
      expect(estimateFootprintDimensions('SOD-123')).toEqual({ widthMm: 2.7, heightMm: 1.6 });
      expect(estimateFootprintDimensions('SOD-323')).toEqual({ widthMm: 1.7, heightMm: 1.25 });
      expect(estimateFootprintDimensions('SMB')).toEqual({ widthMm: 5.4, heightMm: 3.6 });
      expect(estimateFootprintDimensions('SMC')).toEqual({ widthMm: 7.9, heightMm: 5.9 });
    });

    it('estimates dimensions for IC packages (SOIC, TSSOP, MSOP, QFP, QFN, BGA, DIP)', () => {
      expect(estimateFootprintDimensions('SOIC-8')).toEqual({ widthMm: 4.9, heightMm: 3.9 });
      expect(estimateFootprintDimensions('SOIC-14')).toEqual({ widthMm: 8.7, heightMm: 3.9 });
      expect(estimateFootprintDimensions('SOIC-16')).toEqual({ widthMm: 9.9, heightMm: 3.9 });
      expect(estimateFootprintDimensions('TSSOP-14')).toEqual({ widthMm: 5.0, heightMm: 4.4 });
      expect(estimateFootprintDimensions('MSOP-8')).toEqual({ widthMm: 3.0, heightMm: 3.0 });
      expect(estimateFootprintDimensions('TQFP-48')).toEqual({ widthMm: 7.0, heightMm: 7.0 });
      expect(estimateFootprintDimensions('QFP-64')).toEqual({ widthMm: 10.0, heightMm: 10.0 });
      expect(estimateFootprintDimensions('QFN-32')).toEqual({ widthMm: 5.0, heightMm: 5.0 });
      expect(estimateFootprintDimensions('BGA-64')).toEqual({ widthMm: 8.0, heightMm: 8.0 });
      expect(estimateFootprintDimensions('BGA-256')).toEqual({ widthMm: 17.0, heightMm: 17.0 });
      expect(estimateFootprintDimensions('DIP-8')).toEqual({ widthMm: 9.6, heightMm: 6.3 });
    });

    it('returns default fallback dimensions when footprint is empty or unrecognized', () => {
      expect(estimateFootprintDimensions(null)).toEqual({
        widthMm: DEFAULT_FALLBACK_WIDTH_MM,
        heightMm: DEFAULT_FALLBACK_HEIGHT_MM,
      });
      expect(estimateFootprintDimensions('')).toEqual({
        widthMm: DEFAULT_FALLBACK_WIDTH_MM,
        heightMm: DEFAULT_FALLBACK_HEIGHT_MM,
      });
      expect(estimateFootprintDimensions('   ')).toEqual({
        widthMm: DEFAULT_FALLBACK_WIDTH_MM,
        heightMm: DEFAULT_FALLBACK_HEIGHT_MM,
      });
      expect(estimateFootprintDimensions('MY_CUSTOM_PROPRIETARY_MODULE_2026')).toEqual({
        widthMm: DEFAULT_FALLBACK_WIDTH_MM,
        heightMm: DEFAULT_FALLBACK_HEIGHT_MM,
      });
    });
  });

  describe('Pin 1 calculation and board coordinates', () => {
    it('calculates local Pin 1 offset relative to component center', () => {
      const pin1 = calculatePin1Offset(2.0, 1.0);
      expect(pin1.pin1X).toBe(-0.7);
      expect(pin1.pin1Y).toBe(-0.35);
    });

    it('calculates rotated Pin 1 coordinates on the board', () => {
      const comp: PnpOverlayComponent = {
        designator: 'U1',
        value: 'STM32',
        footprint: 'LQFP-48',
        x: 100,
        y: 50,
        rotation: 0,
        side: 'top',
        bomRow: null,
        widthMm: 7.0,
        heightMm: 7.0,
        pin1X: -2.45,
        pin1Y: -2.45,
      };

      const coords0 = getPin1BoardCoordinates(comp);
      expect(coords0.x).toBe(97.55);
      expect(coords0.y).toBe(47.55);

      // Rotated 90 degrees counter-clockwise in board space
      const comp90 = { ...comp, rotation: 90 };
      const coords90 = getPin1BoardCoordinates(comp90);
      // cos(90) = 0, sin(90) = 1 => rotatedX = -(-2.45) = 2.45, rotatedY = -2.45
      expect(coords90.x).toBeCloseTo(102.45, 2);
      expect(coords90.y).toBeCloseTo(47.55, 2);
    });
  });

  describe('parseSvgViewBox', () => {
    it('parses valid space and comma separated viewBox strings', () => {
      expect(parseSvgViewBox('0 0 100 80')).toEqual({
        minX: 0,
        minY: 0,
        width: 100,
        height: 80,
      });
      expect(parseSvgViewBox('-12.5, -24.8, 150.2, 95.6')).toEqual({
        minX: -12.5,
        minY: -24.8,
        width: 150.2,
        height: 95.6,
      });
    });

    it('returns null for invalid or missing viewBox', () => {
      expect(parseSvgViewBox(null)).toBeNull();
      expect(parseSvgViewBox('')).toBeNull();
      expect(parseSvgViewBox('invalid text')).toBeNull();
      expect(parseSvgViewBox('0 0 100')).toBeNull();
    });
  });

  describe('coordinate conversion & SVG transforms', () => {
    const compTop: PnpOverlayComponent = {
      designator: 'R1',
      value: '10k',
      footprint: '0603',
      x: 25.5,
      y: 40.0,
      rotation: 45,
      side: 'top',
      bomRow: null,
      widthMm: 1.6,
      heightMm: 0.8,
      pin1X: -0.56,
      pin1Y: -0.28,
    };

    const viewBox = { minX: 10, minY: 5, width: 100, height: 80 };

    it('transforms top side coordinates with inverted Y and inverted rotation', () => {
      const pos = getComponentSvgPosition(compTop, 'top', viewBox);
      expect(pos.x).toBe(25.5);
      expect(pos.y).toBe(-40.0);
      expect(pos.rotation).toBe(315); // -45 deg normalized to 315 deg
      expect(pos.transform).toBe('translate(25.5, -40) rotate(315)');

      const transformStr = getComponentSvgTransform(compTop, 'top', viewBox);
      expect(transformStr).toBe('translate(25.5, -40) rotate(315)');
    });

    it('transforms bottom side coordinates with tracespace horizontal mirroring', () => {
      const compBottom: PnpOverlayComponent = {
        ...compTop,
        side: 'bottom',
        x: 30,
        y: 50,
        rotation: 90,
      };

      // In tracespace: mirror formula is 2*minX + width - comp.x = 2*10 + 100 - 30 = 90
      const pos = getComponentSvgPosition(compBottom, 'bottom', viewBox);
      expect(pos.x).toBe(90);
      expect(pos.y).toBe(-50);
      expect(pos.rotation).toBe(90);
      expect(pos.transform).toBe('translate(90, -50) rotate(90)');

      const transformStr = getComponentSvgTransform(compBottom, 'bottom', viewBox);
      expect(transformStr).toBe('translate(90, -50) rotate(90)');
    });

    it('handles bottom side with null viewBox fallback', () => {
      const compBottom: PnpOverlayComponent = {
        ...compTop,
        side: 'bottom',
        x: 30,
        y: 50,
        rotation: 0,
      };

      const pos = getComponentSvgPosition(compBottom, 'bottom', null);
      expect(pos.x).toBe(-30);
      expect(pos.y).toBe(-50);
      expect(pos.rotation).toBe(0);
      expect(pos.transform).toBe('translate(-30, -50) rotate(0)');
    });

    it('transforms layers view side as unmirrored top-down projection', () => {
      const pos = getComponentSvgPosition(compTop, 'layers', viewBox);
      expect(pos.x).toBe(25.5);
      expect(pos.y).toBe(-40.0);
      expect(pos.rotation).toBe(315);
    });

    it('generates transform for components inside tracespace bottom mirrored group', () => {
      const insideGroupTransform = getComponentInsideGroupSvgTransform(compTop);
      expect(insideGroupTransform).toBe('translate(25.5, -40) rotate(315)');
    });

    it('normalizes rotation angles correctly', () => {
      expect(normalizeRotation(0)).toBe(0);
      expect(normalizeRotation(-0)).toBe(0);
      expect(normalizeRotation(360)).toBe(0);
      expect(normalizeRotation(450)).toBe(90);
      expect(normalizeRotation(-90)).toBe(270);
      expect(normalizeRotation(-45)).toBe(315);
    });
  });

  describe('BOM & PnP linking', () => {
    const mockBomRows: ParsedBomRow[] = [
      {
        rowNumber: 1,
        rawDesignators: 'R1, R2, R3',
        designators: ['R1', 'R2', 'R3'],
        mpn: 'RC0603FR-0710KL',
        value: '10k',
        footprint: '0603',
        quantity: 3,
        manufacturer: 'Yageo',
        dnp: false,
        side: 'top',
      },
      {
        rowNumber: 2,
        rawDesignators: 'C1',
        designators: ['C1'],
        mpn: 'CC0402KRX7R9BB104',
        value: '100nF',
        footprint: '0402',
        quantity: 1,
        manufacturer: 'Yageo',
        dnp: false,
        side: 'top',
      },
      {
        rowNumber: 3,
        rawDesignators: 'U1',
        designators: ['U1'],
        mpn: 'STM32F401RET6',
        value: 'STM32F401',
        footprint: 'LQFP-64_10x10mm',
        quantity: 1,
        manufacturer: 'STMicroelectronics',
        dnp: false,
        side: 'top',
      },
    ];

    const mockPnpRows: ParsedPnpRow[] = [
      {
        rowNumber: 1,
        designator: 'r1', // Lowercase to test case insensitivity
        value: '10k',
        footprint: '0603',
        x: 10.5,
        y: 20.0,
        rawRotation: '90',
        rotation: 90,
        rawSide: 'top',
        side: 'top',
      },
      {
        rowNumber: 2,
        designator: 'R2',
        value: '10k',
        footprint: '0603',
        x: 15.0,
        y: 20.0,
        rawRotation: '90',
        rotation: 90,
        rawSide: 'top',
        side: 'top',
      },
      {
        rowNumber: 3,
        designator: 'R3',
        value: '10k',
        footprint: '0603',
        x: 20.0,
        y: 20.0,
        rawRotation: '90',
        rotation: 90,
        rawSide: 'top',
        side: 'top',
      },
      {
        rowNumber: 4,
        designator: 'C1',
        value: '', // Missing in PnP; will inherit from BOM
        footprint: '',
        x: 5.0,
        y: 12.0,
        rawRotation: '0',
        rotation: 0,
        rawSide: 'top',
        side: 'top',
      },
      {
        rowNumber: 5,
        designator: 'TP1', // Test point in PnP, not in BOM
        value: 'TEST_POINT',
        footprint: 'PAD-1MM',
        x: 2.0,
        y: 3.0,
        rawRotation: '0',
        rotation: 0,
        rawSide: 'top',
        side: 'top',
      },
    ];

    it('matches PnP components with BOM rows with case-insensitivity and multi-designator support', () => {
      const components = matchPnpComponentsWithBom(mockPnpRows, mockBomRows);
      expect(components).toHaveLength(5);

      // R1 matched with row 1
      const r1 = components[0]!;
      expect(r1.designator).toBe('r1');
      expect(r1.bomRow).toBe(mockBomRows[0]);
      expect(r1.widthMm).toBe(1.6);
      expect(r1.heightMm).toBe(0.8);
      expect(r1.pin1X).toBe(-0.56);
      expect(r1.pin1Y).toBe(-0.28);

      // R2 and R3 also matched with row 1
      expect(components[1]!.bomRow).toBe(mockBomRows[0]);
      expect(components[2]!.bomRow).toBe(mockBomRows[0]);

      // C1 inherited footprint and value from BOM row
      const c1 = components[3]!;
      expect(c1.designator).toBe('C1');
      expect(c1.footprint).toBe('0402');
      expect(c1.value).toBe('100nF');
      expect(c1.widthMm).toBe(1.0);
      expect(c1.heightMm).toBe(0.5);

      // TP1 is not in BOM, bomRow must be null
      const tp1 = components[4]!;
      expect(tp1.designator).toBe('TP1');
      expect(tp1.bomRow).toBeNull();
      expect(tp1.widthMm).toBe(DEFAULT_FALLBACK_WIDTH_MM);
      expect(tp1.heightMm).toBe(DEFAULT_FALLBACK_HEIGHT_MM);
    });

    it('finds components corresponding to a given BOM row', () => {
      const components = matchPnpComponentsWithBom(mockPnpRows, mockBomRows);
      const row1Components = findComponentsForBomRow(mockBomRows[0]!, components);
      expect(row1Components).toHaveLength(3);
      expect(row1Components.map((c) => c.designator)).toEqual(['r1', 'R2', 'R3']);

      // U1 is in BOM but not in PnP
      const u1Components = findComponentsForBomRow(mockBomRows[2]!, components);
      expect(u1Components).toHaveLength(0);
    });

    it('finds BOM row for a given component designator', () => {
      const bomR1 = findBomRowForComponent('r1', mockBomRows);
      expect(bomR1).toBe(mockBomRows[0]);

      const bomR2 = findBomRowForComponent('R2', mockBomRows);
      expect(bomR2).toBe(mockBomRows[0]);

      const bomC1 = findBomRowForComponent(' C1 ', mockBomRows);
      expect(bomC1).toBe(mockBomRows[1]);

      const bomNonExistent = findBomRowForComponent('NON_EXISTENT', mockBomRows);
      expect(bomNonExistent).toBeNull();

      const bomEmpty = findBomRowForComponent('', mockBomRows);
      expect(bomEmpty).toBeNull();
    });
  });

  describe('filtering and searching', () => {
    const components: PnpOverlayComponent[] = [
      {
        designator: 'R1',
        value: '10k',
        footprint: '0603',
        x: 10,
        y: 20,
        rotation: 0,
        side: 'top',
        bomRow: {
          rowNumber: 1,
          rawDesignators: 'R1',
          designators: ['R1'],
          mpn: 'RC0603FR-0710KL',
          value: '10k',
          footprint: '0603',
          quantity: 1,
          manufacturer: 'Yageo',
          dnp: false,
          side: 'top',
        },
        widthMm: 1.6,
        heightMm: 0.8,
        pin1X: -0.56,
        pin1Y: -0.28,
      },
      {
        designator: 'R2',
        value: '22k',
        footprint: '0805',
        x: 30,
        y: 40,
        rotation: 90,
        side: 'bottom',
        bomRow: {
          rowNumber: 2,
          rawDesignators: 'R2',
          designators: ['R2'],
          mpn: 'CRCW080522K0FKEA',
          value: '22k',
          footprint: '0805',
          quantity: 1,
          manufacturer: 'Vishay',
          dnp: false,
          side: 'bottom',
        },
        widthMm: 2.0,
        heightMm: 1.25,
        pin1X: -0.7,
        pin1Y: -0.4375,
      },
      {
        designator: 'U1',
        value: 'STM32',
        footprint: 'LQFP-48_7x7mm',
        x: 50,
        y: 50,
        rotation: 0,
        side: 'top',
        bomRow: null,
        widthMm: 7.0,
        heightMm: 7.0,
        pin1X: -2.45,
        pin1Y: -2.45,
      },
    ];

    it('filters components by side', () => {
      expect(filterComponentsBySide(components, 'all')).toHaveLength(3);
      expect(filterComponentsBySide(components, 'top')).toEqual([components[0], components[2]]);
      expect(filterComponentsBySide(components, 'bottom')).toEqual([components[1]]);
    });

    it('searches components by designator, value, footprint, MPN, and manufacturer', () => {
      // By designator
      expect(searchComponents(components, 'r1')).toEqual([components[0]]);
      expect(searchComponents(components, 'R')).toEqual([components[0], components[1]]);

      // By value
      expect(searchComponents(components, '10k')).toEqual([components[0]]);
      expect(searchComponents(components, 'STM32')).toEqual([components[2]]);

      // By footprint
      expect(searchComponents(components, '0805')).toEqual([components[1]]);
      expect(searchComponents(components, 'LQFP')).toEqual([components[2]]);

      // By MPN
      expect(searchComponents(components, 'CRCW')).toEqual([components[1]]);

      // By Manufacturer
      expect(searchComponents(components, 'Vishay')).toEqual([components[1]]);
      expect(searchComponents(components, 'Yageo')).toEqual([components[0]]);

      // Empty query returns all
      expect(searchComponents(components, '')).toHaveLength(3);
      expect(searchComponents(components, '   ')).toHaveLength(3);

      // Non-matching query returns empty
      expect(searchComponents(components, 'NON_EXISTENT')).toHaveLength(0);
    });
  });

  describe('design tokens integration', () => {
    it('uses centralized tokens from tokens.ts without hardcoded values', () => {
      expect(PNP_OVERLAY_THEME.componentBg).toBe(tokens.colors.pnpOverlayComponentBg);
      expect(PNP_OVERLAY_THEME.componentBorder).toBe(tokens.colors.pnpOverlayComponentBorder);
      expect(PNP_OVERLAY_THEME.pin1Marker).toBe(tokens.colors.pnpOverlayPin1Marker);
      expect(PNP_OVERLAY_THEME.selectedBg).toBe(tokens.colors.pnpOverlaySelected);
      expect(PNP_OVERLAY_THEME.selectedBorder).toBe(tokens.colors.pnpOverlaySelectedBorder);
      expect(PNP_OVERLAY_THEME.hoverBorder).toBe(tokens.colors.pnpOverlayHoverBorder);
      expect(PNP_OVERLAY_THEME.textColor).toBe(tokens.colors.pnpOverlayText);

      // Verify none of the colors are raw black '#000000' or '#000'
      expect(Object.values(PNP_OVERLAY_THEME)).not.toContain('#000000');
      expect(Object.values(PNP_OVERLAY_THEME)).not.toContain('#000');
    });
  });
});
