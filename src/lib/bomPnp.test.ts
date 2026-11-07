import { describe, expect, it } from 'vitest';
import {
  detectBomColumnMapping,
  detectPnpColumnMapping,
  evaluateBomPnpCsvTexts,
  expandDesignators,
  isLikelyBomName,
  isLikelyPnpName,
  normalizeBoardSide,
  parseBomWithMapping,
  parseCsvTable,
  parsePnpWithMapping,
  runBomPnpChecks,
} from './bomPnp';
import type { BomColumnMapping, PnpColumnMapping } from '../types/database';

const KICAD_BOM_CSV = [
  '\uFEFF"Reference","Value","Footprint","MPN","Manufacturer","Qty","DNP"',
  '"C1, C2","100nF, 50V, X7R","Capacitor_SMD:C_0402_1005Metric","CL05B104KO5NNNC","Samsung","2",""',
  '"R1-R3","10k, 1%, 0603","Resistor_SMD:R_0603_1608Metric","RC0603FR-0710KL","Yageo","3",""',
  '"U1","STM32G071CBT6","Package_QFP:LQFP-48_7x7mm_P0.5mm","STM32G071CBT6","STMicroelectronics","1",""',
  '"J1","Header 1x04 0.1"" Pitch","Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical","61300411121","Wurth","1",""',
  '"R14","0R","Resistor_SMD:R_0402_1005Metric","RC0402JR-070RL","Yageo","1","DNP"',
].join('\r\n');

const KICAD_POS_CSV = [
  '### Footprint positions - created on Fri Nov 07 14:10:00 2026 ###',
  '### Printed by KiCad version 8.0.6',
  '## Unit = mm, Angle = deg.',
  '## Side : All',
  'Ref,Val,Package,PosX,PosY,Rot,Side',
  '"C1","100nF, 50V, X7R","C_0402_1005Metric",114.3000,-82.5500,180.0000,top',
  '"C2","100nF, 50V, X7R","C_0402_1005Metric",116.8400,-82.5500,90.0000,bottom',
  '"R1","10k, 1%, 0603","R_0603_1608Metric",120.0000,-80.0000,0.0000,top',
  '"R2","10k, 1%, 0603","R_0603_1608Metric",122.0000,-80.0000,-90.0000,top',
  '"R3","10k, 1%, 0603","R_0603_1608Metric",124.0000,-80.0000,270.0000,top',
  '"U1","STM32G071CBT6","LQFP-48_7x7mm_P0.5mm",130.0000,-90.0000,45.0000,top',
  '"J1","Header 1x04","PinHeader_1x04",140.0000,-75.0000,0.0000,top',
].join('\r\n');

const ALTIUM_BOM_CSV = [
  'Comment,Designator,Footprint,Manufacturer Part Number,Manufacturer,Quantity,Fitted,Layer',
  '"10uF 25V","C10, C11","CAPC2012X125N","GRM21BR61E106KA73L","Murata","2","Fitted","TopLayer"',
  '"4.7k","R20","RESC1005X40N","ERJ-2RKF4701X","Panasonic","1","Fitted","BottomLayer"',
  '"Test Point","TP1","TP-100","","","1","Not Fitted","TopLayer"',
  '"DNP","R99","RESC1005X40N","ERJ-2GE0R00X","Panasonic","1","Fitted","TopLayer"',
].join('\n');

const ALTIUM_PNP_WITH_PREAMBLE_CSV = [
  'Altium Designer Pick and Place Locations',
  'C:\\Projects\\SensorBoard\\SensorBoard.PcbDoc',
  '',
  '========================================================================================================================',
  'File Design Information:',
  '',
  'Date:       07/11/2026',
  'Time:       14:22:10',
  'Revision:   Rev B',
  'Variant:    Standard',
  'Units used: mm',
  '',
  '"Designator","Comment","Layer","Footprint","Center-X(mm)","Center-Y(mm)","Rotation","Description"',
  '"C10","10uF 25V","TopLayer","CAPC2012X125N","12.500mm","24.100mm","90","Ceramic Capacitor"',
  '"C11","10uF 25V","TopLayer","CAPC2012X125N","15.500mm","24.100mm","180","Ceramic Capacitor"',
  '"R20","4.7k","BottomLayer","RESC1005X40N","18.200mm","19.750mm","270","Precision Resistor"',
  '"R99","DNP","TopLayer","RESC1005X40N","21.000mm","19.750mm","0","Zero Ohm Jumper"',
].join('\r\n');

describe('CSV parsing, header auto-detection, and designator normalization', () => {
  it('parses KiCad BOM and .pos CSV exports accurately and passes clean consistency check', () => {
    const result = evaluateBomPnpCsvTexts({
      bomText: KICAD_BOM_CSV,
      pnpText: KICAD_POS_CSV,
    });

    expect(result.bomDetection?.format).toBe('kicad');
    expect(result.bomDetection?.needsColumnMapping).toBe(false);
    expect(result.pnpDetection?.format).toBe('kicad');
    expect(result.pnpDetection?.needsColumnMapping).toBe(false);

    expect(result.bomTable?.headerRowNumber).toBe(1);
    expect(result.pnpTable?.headerRowNumber).toBe(5);

    expect(result.summary).toEqual({
      error_count: 0,
      warning_count: 0,
      info_count: 1,
      bom_row_count: 5,
      bom_component_count: 8,
      bom_dnp_count: 1,
      pnp_row_count: 7,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.code).toBe('dnp_entry');
    expect(result.findings[0]?.severity).toBe('info');
    expect(result.findings[0]?.affectedBomRows).toEqual([6]);
    expect(result.findings[0]?.designators).toEqual(['R14']);
    expect(result.parsedBom[3]?.value).toBe('Header 1x04 0.1" Pitch');
  });

  it('parses KiCad native whitespace-aligned .pos files with comment header', () => {
    const kicadAsciiPos = [
      '### Module positions - created on Fri Nov 07 2026 ###',
      '## Unit = mm, Angle = deg.',
      '# Ref     Val       Package                PosX       PosY       Rot  Side',
      'C1        100nF     C_0402                 10.5000    -20.2500   90.0 top',
      'R1        10k       R_0603                 15.0000    -22.0000   0.0  bottom',
      '## End',
    ].join('\n');

    const table = parseCsvTable(kicadAsciiPos);
    expect(table.headerRowNumber).toBe(3);
    expect(table.headers).toEqual(['Ref', 'Val', 'Package', 'PosX', 'PosY', 'Rot', 'Side']);
    expect(table.rows).toHaveLength(2);

    const detection = detectPnpColumnMapping(table.headers);
    expect(detection.format).toBe('kicad');
    expect(detection.needsColumnMapping).toBe(false);

    const parsed = parsePnpWithMapping(table, detection.mapping);
    expect(parsed[0]).toMatchObject({
      rowNumber: 4,
      designator: 'C1',
      x: 10.5,
      y: -20.25,
      rotation: 90,
      side: 'top',
    });
    expect(parsed[1]).toMatchObject({
      rowNumber: 5,
      designator: 'R1',
      side: 'bottom',
    });
  });

  it('parses Altium BOM (Fitted polarity) and Altium Pick-and-Place with preamble block', () => {
    const result = evaluateBomPnpCsvTexts({
      bomText: ALTIUM_BOM_CSV,
      pnpText: ALTIUM_PNP_WITH_PREAMBLE_CSV,
    });

    expect(result.bomDetection?.format).toBe('altium');
    expect(result.bomDetection?.mapping.dnpPolarity).toBe('fitted');
    expect(result.bomDetection?.needsColumnMapping).toBe(false);

    expect(result.pnpDetection?.format).toBe('altium');
    expect(result.pnpDetection?.needsColumnMapping).toBe(false);
    expect(result.pnpTable?.headerRowNumber).toBe(13);
    expect(result.parsedPnp[0]?.rowNumber).toBe(14);
    expect(result.parsedPnp[0]?.x).toBe(12.5);
    expect(result.parsedPnp[0]?.y).toBe(24.1);

    // TP1 is Not Fitted -> dnp = true; R99 has Comment="DNP" but explicit Fitted="Fitted" -> dnp = false
    const tp1 = result.parsedBom.find((r) => r.designators.includes('TP1'));
    const r99 = result.parsedBom.find((r) => r.designators.includes('R99'));
    expect(tp1?.dnp).toBe(true);
    expect(r99?.dnp).toBe(false);

    // TP1 has empty value? No, Comment is "Test Point", and TP1 is DNP so missing MPN is not warned!
    expect(result.summary.error_count).toBe(0);
    expect(result.summary.warning_count).toBe(0);
    expect(result.summary.info_count).toBe(1);
    expect(result.findings[0]?.code).toBe('dnp_entry');
    expect(result.findings[0]?.designators).toEqual(['TP1']);
  });

  it('handles multi-line quoted RFC 4180 cells and preserves true physical line numbers', () => {
    const csv = [
      'Reference,Value,Footprint,MPN',
      '"U1","Dual Op-Amp\nLow-Noise Grade","SOIC-8","OPA2171AIDR"',
      '"R5","4.99k","R_0402","RC0402FR-074K99L"',
    ].join('\r\n');

    const table = parseCsvTable(csv);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.rowNumber).toBe(2);
    expect(table.rows[0]?.values.Value).toBe('Dual Op-Amp\nLow-Noise Grade');
    // Line 2 spanned lines 2-3, so R5 starts on physical line 4
    expect(table.rows[1]?.rowNumber).toBe(4);
  });

  it('flags unrecognized custom semicolon/tab headers and parses cleanly with manual mapping', () => {
    const germanBom = [
      'Bauteil;Wert;Gehaeuse;HerstellerNr;Bestueckt',
      'C1, C2;100nF;0402;GRM155R71C104KA88D;Ja',
      'R1;10k;0603;RC0603FR-0710KL;Nein',
    ].join('\n');

    const germanPnp = [
      'RefBez\tLage\tWinkel\tKoordX\tKoordY',
      'C1\tOben\t0\t10,5\t20,25',
      'C2\tTop\t90°\t12,0\t20,25',
    ].join('\n');

    const bomTable = parseCsvTable(germanBom);
    const pnpTable = parseCsvTable(germanPnp);

    const bomDet = detectBomColumnMapping(bomTable.headers);
    const pnpDet = detectPnpColumnMapping(pnpTable.headers);

    expect(bomDet.format).toBe('unrecognized');
    expect(bomDet.needsColumnMapping).toBe(true);
    expect(bomDet.missingRequired).toContain('designators');

    expect(pnpDet.format).toBe('unrecognized');
    expect(pnpDet.needsColumnMapping).toBe(true);
    expect(pnpDet.missingRequired).toContain('designator');

    const manualBomMapping: BomColumnMapping = {
      designators: 'Bauteil',
      value: 'Wert',
      footprint: 'Gehaeuse',
      mpn: 'HerstellerNr',
      dnp: 'Bestueckt',
      dnpPolarity: 'fitted',
    };

    const manualPnpMapping: PnpColumnMapping = {
      designator: 'RefBez',
      side: 'Lage',
      rotation: 'Winkel',
      x: 'KoordX',
      y: 'KoordY',
    };

    // Note: "Nein" -> let's test standard 'No' / '0' vs unrecognized side 'Oben'
    const germanBomStandardBool = germanBom.replace(';Ja', ';1').replace(';Nein', ';0');
    const directBomRows = parseBomWithMapping(
      parseCsvTable(germanBomStandardBool),
      manualBomMapping,
    );
    expect(directBomRows[0]?.designators).toEqual(['C1', 'C2']);
    expect(directBomRows[1]?.dnp).toBe(true);

    const evaluated = evaluateBomPnpCsvTexts({
      bomText: germanBomStandardBool,
      pnpText: germanPnp,
      bomMappingOverride: manualBomMapping,
      pnpMappingOverride: manualPnpMapping,
    });

    expect(evaluated.parsedBom).toHaveLength(2);
    expect(evaluated.parsedBom[1]?.dnp).toBe(true);
    expect(evaluated.parsedPnp[0]?.x).toBe(10.5);
    expect(evaluated.parsedPnp[1]?.rotation).toBe(90);
    // 'Oben' is unrecognized board side -> side_mismatch warning on PnP row 2
    expect(
      evaluated.findings.some(
        (f) => f.code === 'side_mismatch' && f.severity === 'warning' && f.affectedPnpRows[0] === 2,
      ),
    ).toBe(true);
  });

  it('expands designator lists, ranges, zero-padded ranges, and normalizes board sides', () => {
    expect(expandDesignators(' c1, c2; r1 r2 ')).toEqual(['C1', 'C2', 'R1', 'R2']);
    expect(expandDesignators('R1-R4')).toEqual(['R1', 'R2', 'R3', 'R4']);
    expect(expandDesignators('LED01-LED03')).toEqual(['LED01', 'LED02', 'LED03']);
    // Non-matching prefix or connector pin suffix is kept intact
    expect(expandDesignators('X1-1')).toEqual(['X1-1']);
    expect(expandDesignators('R1-C4')).toEqual(['R1-C4']);

    expect(normalizeBoardSide('F.Cu')).toBe('top');
    expect(normalizeBoardSide('TopLayer')).toBe('top');
    expect(normalizeBoardSide('front')).toBe('top');
    expect(normalizeBoardSide('B.Cu')).toBe('bottom');
    expect(normalizeBoardSide('Bottom Layer')).toBe('bottom');
    expect(normalizeBoardSide('bot')).toBe('bottom');
    expect(normalizeBoardSide('Inner1')).toBe('unknown');
    expect(normalizeBoardSide('')).toBe('unknown');

    expect(isLikelyBomName('sensor-board-bom-rev-b.csv')).toBe(true);
    expect(isLikelyPnpName('sensor-board-top.pos')).toBe(true);
    expect(isLikelyPnpName('Pick_and_Place_RevB.csv')).toBe(true);
  });
});

describe('Deterministic BOM, PnP, and cross-file consistency check findings', () => {
  it('detects every BOM finding, PnP finding, and cross BOM-vs-PnP finding in deterministic order', () => {
    const bomCsv = [
      'Reference,Value,Footprint,MPN,DNP,Side',
      // Row 2: C1 duplicated later on Row 3, plus intra-row duplicate R5, R5
      '"C1, R5, R5","100nF","C_0402","GRM155","0","Top"',
      // Row 3: C1 cross-row duplicate, missing MPN, empty value, empty footprint
      '"C1","","","","0","Top"',
      // Row 4: Populated U2 missing from PnP
      '"U2","LDO_3V3","SOT-23-5","MCP1700","0","Top"',
      // Row 5: DNP part R10 (via DNP column) that erroneously still appears in PnP
      '"R10","10k","R_0402","RC0402","DNP","Top"',
      // Row 6: Value="DNP" implicit DNP marker (should NOT trigger missing_mpn or empty_footprint)
      '"R11","DNP","","","0",""',
      // Row 7: Side mismatch (BOM says Top, PnP says Bottom)
      '"D1","TVS","SOD-323","PESD5V0","0","Top"',
    ].join('\n');

    const pnpCsv = [
      'Ref,Val,Package,PosX,PosY,Rot,Side',
      // Row 2: C1 valid
      'C1,100nF,C_0402,10,10,90,top',
      // Row 3: R5 duplicated on Row 4 + non-45-deg rotation (12.5)
      'R5,100nF,C_0402,12,10,12.5,top',
      // Row 4: R5 duplicate in PnP + out-of-bounds rotation (405)
      'R5,100nF,C_0402,14,10,405,top',
      // Row 5: R10 is DNP in BOM but present in PnP + missing rotation
      'R10,10k,R_0402,16,10,,top',
      // Row 6: D1 side mismatch (BOM Top vs PnP Bottom)
      'D1,TVS,SOD-323,18,10,180,bottom',
      // Row 7: J99 extra in PnP (not in BOM) + unknown side ("MidLayer")
      'J99,Conn,Pin_1x2,20,10,0,MidLayer',
    ].join('\n');

    const evaluated = evaluateBomPnpCsvTexts({
      bomText: bomCsv,
      pnpText: pnpCsv,
    });

    const { findings, summary } = evaluated;
    const byCode = (code: string) => findings.filter((f) => f.code === code);

    // 1. duplicate_bom_designator: C1 (rows 2, 3) and R5 (row 2 intra-row)
    const dupBom = byCode('duplicate_bom_designator');
    expect(dupBom).toHaveLength(2);
    expect(dupBom.find((f) => f.designators[0] === 'C1')?.affectedBomRows).toEqual([2, 3]);
    expect(dupBom.find((f) => f.designators[0] === 'R5')?.affectedBomRows).toEqual([2]);

    // 2. missing_mpn: Row 3 only (Row 6 is DNP via Value="DNP" so skipped)
    expect(byCode('missing_mpn').map((f) => f.affectedBomRows)).toEqual([[3]]);

    // 3. empty_value: Row 3
    expect(byCode('empty_value').map((f) => f.affectedBomRows)).toEqual([[3]]);

    // 4. empty_footprint: Row 3 only (Row 6 is DNP so skipped)
    expect(byCode('empty_footprint').map((f) => f.affectedBomRows)).toEqual([[3]]);

    // 5. dnp_entry: Row 5 (R10) and Row 6 (R11)
    expect(byCode('dnp_entry').map((f) => f.affectedBomRows)).toEqual([[5], [6]]);

    // 6. duplicate_pnp_designator: R5 across PnP rows 3, 4
    const dupPnp = byCode('duplicate_pnp_designator');
    expect(dupPnp).toHaveLength(1);
    expect(dupPnp[0]?.affectedPnpRows).toEqual([3, 4]);

    // 7. missing_in_pnp: U2 (BOM row 4)
    const missingInPnp = byCode('missing_in_pnp');
    expect(missingInPnp).toHaveLength(1);
    expect(missingInPnp[0]?.designators).toEqual(['U2']);
    expect(missingInPnp[0]?.affectedBomRows).toEqual([4]);

    // 8. dnp_present_in_pnp: R10 (BOM row 5, PnP row 5)
    const dnpInPnp = byCode('dnp_present_in_pnp');
    expect(dnpInPnp).toHaveLength(1);
    expect(dnpInPnp[0]?.designators).toEqual(['R10']);
    expect(dnpInPnp[0]?.affectedBomRows).toEqual([5]);
    expect(dnpInPnp[0]?.affectedPnpRows).toEqual([5]);

    // 9. extra_in_pnp: J99 (PnP row 7)
    const extraInPnp = byCode('extra_in_pnp');
    expect(extraInPnp).toHaveLength(1);
    expect(extraInPnp[0]?.designators).toEqual(['J99']);
    expect(extraInPnp[0]?.affectedPnpRows).toEqual([7]);

    // 10. side_mismatch: error on D1 (BOM Top vs PnP Bottom) + warning on J99 (unknown side "MidLayer")
    const sideFindings = byCode('side_mismatch');
    expect(sideFindings).toHaveLength(2);
    expect(sideFindings.find((f) => f.severity === 'error')?.designators).toEqual(['D1']);
    expect(sideFindings.find((f) => f.severity === 'warning')?.designators).toEqual(['J99']);

    // 11. rotation_anomaly: PnP row 3 (12.5 deg), PnP row 4 (405 deg), PnP row 5 (missing)
    const rotFindings = byCode('rotation_anomaly');
    expect(rotFindings.map((f) => f.affectedPnpRows[0])).toEqual([3, 4, 5]);

    // Deterministic severity ordering: error -> warning -> info
    const severities = findings.map((f) => f.severity);
    const rank = { error: 0, warning: 1, info: 2 };
    for (let i = 1; i < severities.length; i += 1) {
      expect(rank[severities[i]!]).toBeGreaterThanOrEqual(rank[severities[i - 1]!]);
    }

    // Zero exclamation marks in any message
    for (const f of findings) {
      expect(f.message).not.toContain('!');
    }

    expect(summary.error_count).toBe(6);
    expect(summary.warning_count).toBe(8);
    expect(summary.info_count).toBe(2);

    // Determinism check: running identical inputs produces byte-identical output
    const secondRun = runBomPnpChecks({
      bomRows: evaluated.parsedBom,
      pnpRows: evaluated.parsedPnp,
      hasBom: true,
      hasPnp: true,
    });
    expect(secondRun).toEqual({ findings, summary });
  });
});
