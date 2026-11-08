import { describe, expect, it } from 'vitest';
import {
  createComponent3DMesh,
  createPcbBoardMesh,
  estimateComponentHeightMm,
  getComponentCategory,
} from './pcb3d';
import type { PnpOverlayComponent } from './pnpOverlay';

describe('pcb3d domain logic', () => {
  it('correctly categorizes components by designator prefix', () => {
    expect(getComponentCategory('R1')).toBe('resistor');
    expect(getComponentCategory('RN2')).toBe('resistor');
    expect(getComponentCategory('C10')).toBe('capacitor');
    expect(getComponentCategory('L3')).toBe('inductor');
    expect(getComponentCategory('FB1')).toBe('inductor');
    expect(getComponentCategory('D1')).toBe('diode');
    expect(getComponentCategory('LED_STATUS')).toBe('diode');
    expect(getComponentCategory('Q2')).toBe('transistor');
    expect(getComponentCategory('U1')).toBe('ic');
    expect(getComponentCategory('IC5')).toBe('ic');
    expect(getComponentCategory('J1')).toBe('connector');
    expect(getComponentCategory('TP1')).toBe('other');
  });

  it('estimates component heights based on footprint and category', () => {
    expect(estimateComponentHeightMm('R1', 'R_0402_1005Metric')).toBe(0.45);
    expect(estimateComponentHeightMm('C1', 'C_0805_2012Metric')).toBe(0.75);
    expect(estimateComponentHeightMm('C2', 'CP_Elec_6.3x5.4')).toBe(6.0);
    expect(estimateComponentHeightMm('U1', 'SOIC-8_3.9x4.9mm')).toBe(1.4);
    expect(estimateComponentHeightMm('J1', 'PinHeader_1x4')).toBe(4.5);
  });

  it('creates 3D component mesh with correct user data and position', () => {
    const comp: PnpOverlayComponent = {
      designator: 'R1',
      value: '10k',
      footprint: 'R_0603_1608Metric',
      x: 50,
      y: 30,
      rotation: 90,
      side: 'top',
      bomRow: null,
      widthMm: 1.6,
      heightMm: 0.8,
      pin1X: -0.8,
      pin1Y: -0.4,
    };

    const group = createComponent3DMesh(comp, 1.6, 50, 30);
    expect(group.name).toBe('comp-R1');
    expect(group.userData.isComponent).toBe(true);
    expect(group.userData.component).toBe(comp);
    // At center of board (50, 30), posX and posZ should be 0
    expect(group.position.x).toBe(0);
    expect(group.position.z).toBe(-0);
    expect(group.position.y).toBeGreaterThan(0); // Top side above thickness
  });

  it('creates 3D PCB board mesh with 6 material faces', () => {
    const mesh = createPcbBoardMesh(100, 80, 1.6, null, null);
    expect(mesh.name).toBe('pcb-substrate');
    expect(Array.isArray(mesh.material)).toBe(true);
    expect((mesh.material as unknown[]).length).toBe(6);
  });
});
