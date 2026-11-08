import * as THREE from 'three';
import type { PnpOverlayComponent } from './pnpOverlay';
import { tokens } from '../theme/tokens';

export type ComponentCategory =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'diode'
  | 'transistor'
  | 'ic'
  | 'connector'
  | 'other';

/**
 * Categorizes a component by its reference designator prefix.
 */
export function getComponentCategory(designator: string): ComponentCategory {
  const upper = designator.trim().toUpperCase();
  if (upper.startsWith('R') || upper.startsWith('RN')) {
    return 'resistor';
  }
  if (upper.startsWith('C')) {
    return 'capacitor';
  }
  if (upper.startsWith('D') || upper.startsWith('LED')) {
    return 'diode';
  }
  if (upper.startsWith('L') || upper.startsWith('FB')) {
    return 'inductor';
  }
  if (upper.startsWith('TP')) {
    return 'other';
  }
  if (upper.startsWith('Q') || upper.startsWith('T')) {
    return 'transistor';
  }
  if (upper.startsWith('U') || upper.startsWith('IC')) {
    return 'ic';
  }
  if (upper.startsWith('J') || upper.startsWith('CN') || upper.startsWith('P')) {
    return 'connector';
  }
  return 'other';
}

/**
 * Estimates standard height in millimeters from footprint and designator.
 */
export function estimateComponentHeightMm(designator: string, footprint: string): number {
  const lowerFp = footprint.toLowerCase();
  const cat = getComponentCategory(designator);

  if (cat === 'capacitor') {
    if (lowerFp.includes('elec') || lowerFp.includes('radial') || lowerFp.includes('can')) {
      return 6.0;
    }
    if (lowerFp.includes('tant') || lowerFp.includes('case')) {
      return 2.5;
    }
  }

  if (cat === 'connector') {
    return 4.5;
  }

  if (cat === 'ic') {
    if (lowerFp.includes('bga') || lowerFp.includes('dip')) {
      return 2.8;
    }
    if (lowerFp.includes('soic') || lowerFp.includes('sop') || lowerFp.includes('tssop')) {
      return 1.4;
    }
    if (lowerFp.includes('qfp') || lowerFp.includes('qfn') || lowerFp.includes('lqfp')) {
      return 1.2;
    }
    return 1.5;
  }

  if (lowerFp.includes('0201')) {
    return 0.3;
  }
  if (lowerFp.includes('0402')) {
    return 0.45;
  }
  if (lowerFp.includes('0603')) {
    return 0.55;
  }
  if (lowerFp.includes('0805')) {
    return 0.75;
  }
  if (lowerFp.includes('1206')) {
    return 0.95;
  }
  if (lowerFp.includes('1210') || lowerFp.includes('2512')) {
    return 1.2;
  }
  if (lowerFp.includes('sot') || lowerFp.includes('sod')) {
    return 1.1;
  }

  return 0.8;
}

/**
 * Creates an interactive 3D mesh representation of a PCB component.
 */
export function createComponent3DMesh(
  comp: PnpOverlayComponent,
  boardThicknessMm: number,
  boardCenterX: number,
  boardCenterY: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `comp-${comp.designator}`;

  const category = getComponentCategory(comp.designator);
  const widthMm = Math.max(comp.widthMm, 0.4);
  const depthMm = Math.max(comp.heightMm, 0.4);
  const heightMm = estimateComponentHeightMm(comp.designator, comp.footprint);

  // Body color based on category
  let bodyColorHex: string = tokens.colors.pcb3dComponentBody;
  if (category === 'capacitor') {
    bodyColorHex = tokens.colors.pcb3dCapacitorBody;
  } else if (category === 'resistor') {
    bodyColorHex = tokens.colors.pcb3dResistorBody;
  }

  // 1. Component Main Body
  const bodyGeom = new THREE.BoxGeometry(widthMm * 0.9, heightMm, depthMm * 0.9);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(bodyColorHex),
    roughness: 0.5,
    metalness: 0.1,
  });
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // 2. Add Metallic Terminals / Pins
  const pinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tokens.colors.pcb3dPinMetal),
    metalness: 0.85,
    roughness: 0.25,
  });

  if (category === 'resistor' || category === 'capacitor' || category === 'inductor') {
    // End caps for passive chips
    const capWidth = widthMm * 0.18;
    const capGeom = new THREE.BoxGeometry(capWidth, heightMm * 1.02, depthMm * 0.92);
    const leftCap = new THREE.Mesh(capGeom, pinMat);
    leftCap.position.x = -widthMm * 0.45 + capWidth / 2;
    group.add(leftCap);

    const rightCap = new THREE.Mesh(capGeom, pinMat);
    rightCap.position.x = widthMm * 0.45 - capWidth / 2;
    group.add(rightCap);
  } else if (category === 'ic') {
    // Pin 1 indicator dot
    const dotGeom = new THREE.CylinderGeometry(
      Math.min(widthMm, depthMm) * 0.08,
      Math.min(widthMm, depthMm) * 0.08,
      0.05,
      12,
    );
    const dotMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(tokens.colors.pcb3dPin1Marker),
    });
    const dotMesh = new THREE.Mesh(dotGeom, dotMat);
    dotMesh.position.set(-widthMm * 0.32, heightMm / 2 + 0.03, -depthMm * 0.32);
    group.add(dotMesh);
  }

  // 3. Coordinate Positioning in Three.js
  // In CAD: (x, y) relative to board origin.
  // In Three.js: X is right, Y is height above/below board, Z is front/back (-Y in SVG).
  const posX = comp.x - boardCenterX;
  const posZ = -(comp.y - boardCenterY);

  const isBottom = comp.side === 'bottom';
  const posY = isBottom
    ? -boardThicknessMm / 2 - heightMm / 2
    : boardThicknessMm / 2 + heightMm / 2;

  group.position.set(posX, posY, posZ);

  // Rotation in radians around vertical Y-axis
  const rad = ((-comp.rotation % 360) * Math.PI) / 180;
  group.rotation.y = rad;

  // Metadata for raycasting selection
  group.userData = {
    isComponent: true,
    component: comp,
  };

  // Ensure all child meshes link to the parent component userData
  group.traverse((child) => {
    child.userData = group.userData;
  });

  return group;
}

/**
 * Creates the 3D PCB substrate slab mesh with top and bottom face textures.
 */
export function createPcbBoardMesh(
  widthMm: number,
  heightMm: number,
  thicknessMm: number,
  topTexture?: THREE.Texture | null,
  bottomTexture?: THREE.Texture | null,
): THREE.Mesh {
  // BoxGeometry: width (X), height/thickness (Y), depth (Z)
  const geom = new THREE.BoxGeometry(widthMm, thicknessMm, heightMm);

  // Side material: FR4 Core green edge
  const edgeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tokens.colors.pcb3dBoardCore),
    roughness: 0.7,
    metalness: 0.1,
  });

  // Top surface material (+Y face, index 2)
  const topMat = topTexture
    ? new THREE.MeshStandardMaterial({
        map: topTexture,
        roughness: 0.4,
        metalness: 0.15,
      })
    : edgeMat;

  // Bottom surface material (-Y face, index 3)
  const bottomMat = bottomTexture
    ? new THREE.MeshStandardMaterial({
        map: bottomTexture,
        roughness: 0.4,
        metalness: 0.15,
      })
    : edgeMat;

  // Materials array for BoxGeometry faces:
  // 0: +X, 1: -X, 2: +Y (Top), 3: -Y (Bottom), 4: +Z, 5: -Z
  const materials = [edgeMat, edgeMat, topMat, bottomMat, edgeMat, edgeMat];

  const mesh = new THREE.Mesh(geom, materials);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.name = 'pcb-substrate';

  return mesh;
}
