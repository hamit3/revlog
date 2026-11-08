import { describe, expect, it } from 'vitest';
import { getModel3DFormat, is3DModelFileName } from './model3d';

describe('model3d utils', () => {
  it('detects supported 3D file formats accurately', () => {
    expect(is3DModelFileName('board.glb')).toBe(true);
    expect(is3DModelFileName('BOARD.GLB')).toBe(true);
    expect(is3DModelFileName('enclosure.stl')).toBe(true);
    expect(is3DModelFileName('Enclosure.STL')).toBe(true);
    expect(is3DModelFileName('assembly.gltf')).toBe(true);
    expect(is3DModelFileName('assembly.GLTF')).toBe(true);

    expect(is3DModelFileName('board.step')).toBe(false);
    expect(is3DModelFileName('board.stp')).toBe(false);
    expect(is3DModelFileName('gerber.zip')).toBe(false);
    expect(is3DModelFileName('bom.csv')).toBe(false);
    expect(is3DModelFileName(null)).toBe(false);
    expect(is3DModelFileName('')).toBe(false);
  });

  it('extracts format correctly', () => {
    expect(getModel3DFormat('pcb.glb')).toBe('glb');
    expect(getModel3DFormat('model.gltf')).toBe('gltf');
    expect(getModel3DFormat('case.stl')).toBe('stl');
    expect(getModel3DFormat('other.pdf')).toBe(null);
  });
});

