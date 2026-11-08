export type Model3DFormat = 'glb' | 'gltf' | 'stl';

/**
 * Checks whether a given file name corresponds to a supported 3D model format (GLB, glTF, STL).
 */
export function is3DModelFileName(fileName: string | null | undefined): boolean {
  if (!fileName) {
    return false;
  }
  const lower = fileName.toLowerCase().trim();
  return lower.endsWith('.glb') || lower.endsWith('.gltf') || lower.endsWith('.stl');
}

/**
 * Returns the detected 3D format for a given file name, or null if unsupported.
 */
export function getModel3DFormat(fileName: string | null | undefined): Model3DFormat | null {
  if (!fileName) {
    return null;
  }
  const lower = fileName.toLowerCase().trim();
  if (lower.endsWith('.glb')) {
    return 'glb';
  }
  if (lower.endsWith('.gltf')) {
    return 'gltf';
  }
  if (lower.endsWith('.stl')) {
    return 'stl';
  }
  return null;
}

/**
 * Metadata describing a loaded 3D model.
 */
export interface Model3DMeta {
  format: Model3DFormat;
  verticesCount: number;
  trianglesCount: number;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
}

