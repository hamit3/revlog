import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Button, Space, Tag, Tooltip } from 'antd';
import {
  AimOutlined,
  BlockOutlined,
  BorderOutlined,
  FieldTimeOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useTranslate } from '@refinedev/core';
import {
  createComponent3DMesh,
  createPcbBoardMesh,
} from '../../lib/pcb3d';
import { parseSvgViewBox, type PnpOverlayComponent } from '../../lib/pnpOverlay';
import { tokens } from '../../theme/tokens';

export interface Pcb3DViewerProps {
  topSvg?: string | null;
  bottomSvg?: string | null;
  viewBox?: string | null;
  pnpComponents?: PnpOverlayComponent[];
  boardThicknessMm?: number;
  height?: number | string;
  selectedDesignator?: string | null;
  onSelectComponent?: (comp: PnpOverlayComponent | null) => void;
  style?: React.CSSProperties;
}

/**
 * Converts an SVG string into a Three.js CanvasTexture.
 */
function svgToCanvasTexture(svgStr: string, width = 2048): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      URL.revokeObjectURL(url);
      const aspect = img.width > 0 && img.height > 0 ? img.height / img.width : 1;
      const height = Math.round(width * aspect);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2d context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      resolve(texture);
    };

    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };

    img.src = url;
  });
}

export const Pcb3DViewer: React.FC<Pcb3DViewerProps> = ({
  topSvg,
  bottomSvg,
  viewBox,
  pnpComponents = [],
  boardThicknessMm = 1.6,
  height = 720,
  selectedDesignator,
  onSelectComponent,
  style,
}) => {
  const t = useTranslate();
  const mountRef = useRef<HTMLDivElement>(null);

  const [hoveredComp, setHoveredComp] = useState<PnpOverlayComponent | null>(null);
  const [clickedComp, setClickedComp] = useState<PnpOverlayComponent | null>(null);

  const activeComp = useMemo(() => {
    if (selectedDesignator) {
      return (
        pnpComponents.find(
          (c) => c.designator.toUpperCase() === selectedDesignator.toUpperCase(),
        ) ?? null
      );
    }
    return clickedComp;
  }, [selectedDesignator, pnpComponents, clickedComp]);

  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [showComponents, setShowComponents] = useState<boolean>(true);
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(false);

  // References to live Three.js instances
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const componentsGroupRef = useRef<THREE.Group | null>(null);
  const initialCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 80, 100));

  // Toggle wireframe on meshes
  useEffect(() => {
    if (!sceneRef.current) {
      return;
    }
    sceneRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => {
            if ('wireframe' in m) {
              (m as THREE.MeshStandardMaterial).wireframe = isWireframe;
            }
          });
        } else if (mesh.material && 'wireframe' in mesh.material) {
          (mesh.material as THREE.MeshStandardMaterial).wireframe = isWireframe;
        }
      }
    });
  }, [isWireframe]);

  // Toggle component visibility
  useEffect(() => {
    if (componentsGroupRef.current) {
      componentsGroupRef.current.visible = showComponents;
    }
  }, [showComponents]);

  // Toggle auto-rotate
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAutoRotate;
    }
  }, [isAutoRotate]);

  // Highlight active or hovered components
  useEffect(() => {
    if (!componentsGroupRef.current) {
      return;
    }
    const targetDesignator = activeComp?.designator || hoveredComp?.designator;

    componentsGroupRef.current.children.forEach((compGroup) => {
      const isTarget = targetDesignator && compGroup.name === `comp-${targetDesignator}`;
      compGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.name !== 'pin1-dot') {
          const mesh = child as THREE.Mesh;
          if (mesh.material instanceof THREE.MeshStandardMaterial) {
            mesh.material.emissive = isTarget
              ? new THREE.Color(tokens.colors.pcb3dSelectedGlow)
              : new THREE.Color(0x000000);
            mesh.material.emissiveIntensity = isTarget ? 0.6 : 0.0;
          }
        }
      });
    });
  }, [activeComp, hoveredComp]);

  // Camera presets
  const handleViewTop = () => {
    if (!cameraRef.current || !controlsRef.current) {
      return;
    }
    const dist = initialCamPosRef.current.length();
    cameraRef.current.position.set(0, dist, 0.001);
    cameraRef.current.lookAt(0, 0, 0);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const handleViewBottom = () => {
    if (!cameraRef.current || !controlsRef.current) {
      return;
    }
    const dist = initialCamPosRef.current.length();
    cameraRef.current.position.set(0, -dist, 0.001);
    cameraRef.current.lookAt(0, 0, 0);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) {
      return;
    }
    cameraRef.current.position.copy(initialCamPosRef.current);
    cameraRef.current.lookAt(0, 0, 0);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) {
      return;
    }

    let animationFrameId: number;
    let isDisposed = false;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(tokens.colors.viewer3dCanvasBg);
    sceneRef.current = scene;

    const width = container.clientWidth || 800;
    const initialHeight = typeof height === 'number' ? height : container.clientHeight || 720;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(40, width / initialHeight, 0.1, 5000);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, initialHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. OrbitControls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    // 5. Lighting: Top Key Light, Bottom Fill Light, Hemisphere Ambient
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    scene.add(hemiLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 2.0);
    topLight.position.set(120, 200, 100);
    scene.add(topLight);

    const bottomLight = new THREE.DirectionalLight(0xffffff, 1.2);
    bottomLight.position.set(-120, -200, -100);
    scene.add(bottomLight);

    // 6. Board Dimensions from viewBox or defaults
    const bounds = parseSvgViewBox(viewBox);
    const boardWidthMm = bounds ? bounds.width : 100;
    const boardHeightMm = bounds ? bounds.height : 80;
    const boardCenterX = bounds ? bounds.minX + bounds.width / 2 : 50;
    const boardCenterY = bounds ? bounds.minY + bounds.height / 2 : 40;

    // 7. Grid helper on ground plane
    const maxDim = Math.max(boardWidthMm, boardHeightMm, 20);
    const gridHelper = new THREE.GridHelper(maxDim * 2.4, 24, 0x556677, 0x223344);
    gridHelper.position.y = -boardThicknessMm / 2 - 8;
    scene.add(gridHelper);

    // 8. Position camera nicely around the board
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.7;
    const initialCamPos = new THREE.Vector3(maxDim * 0.8, maxDim * 0.9, cameraZ);
    camera.position.copy(initialCamPos);
    initialCamPosRef.current.copy(initialCamPos);
    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();

    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();

    // 9. Load SVG Textures and build 3D PCB Board
    void (async () => {
      let topTex: THREE.Texture | null = null;
      let bottomTex: THREE.Texture | null = null;

      try {
        if (topSvg) {
          topTex = await svgToCanvasTexture(topSvg, 2048);
        }
        if (bottomSvg) {
          bottomTex = await svgToCanvasTexture(bottomSvg, 2048);
        }
      } catch {
        // Fallback to untextured solid PCB substrate
      }

      if (isDisposed) {
        topTex?.dispose();
        bottomTex?.dispose();
        return;
      }

      // Create PCB board substrate mesh
      const boardMesh = createPcbBoardMesh(
        boardWidthMm,
        boardHeightMm,
        boardThicknessMm,
        topTex,
        bottomTex,
      );
      scene.add(boardMesh);

      // Create 3D components group
      const compGroup = new THREE.Group();
      compGroup.name = 'pcb-components-group';
      componentsGroupRef.current = compGroup;

      pnpComponents.forEach((comp) => {
        const mesh = createComponent3DMesh(
          comp,
          boardThicknessMm,
          boardCenterX,
          boardCenterY,
        );
        compGroup.add(mesh);
      });

      scene.add(compGroup);
    })();

    // 10. Raycasting for hover and click interactions
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (!componentsGroupRef.current) {
        return;
      }

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(
        componentsGroupRef.current.children,
        true,
      );

      if (intersects.length > 0) {
        const hit = intersects[0]?.object;
        if (hit?.userData?.isComponent) {
          renderer.domElement.style.cursor = 'pointer';
          setHoveredComp(hit.userData.component as PnpOverlayComponent);
          return;
        }
      }
      renderer.domElement.style.cursor = 'default';
      setHoveredComp(null);
    };

    const handleClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (!componentsGroupRef.current) {
        return;
      }

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(
        componentsGroupRef.current.children,
        true,
      );

      if (intersects.length > 0) {
        const hit = intersects[0]?.object;
        if (hit?.userData?.isComponent) {
          const comp = hit.userData.component as PnpOverlayComponent;
          setClickedComp(comp);
          onSelectComponent?.(comp);
          return;
        }
      }
      setClickedComp(null);
      onSelectComponent?.(null);
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('click', handleClick);

    // 11. Render loop
    const animate = () => {
      if (isDisposed) {
        return;
      }
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 12. ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        const newHeight = entry.contentRect.height;
        if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
        }
      }
    });
    resizeObserver.observe(container);

    // 13. Cleanup on unmount
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();

      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handleClick);

      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      componentsGroupRef.current = null;
    };
  }, [topSvg, bottomSvg, viewBox, pnpComponents, boardThicknessMm, height, onSelectComponent]);

  const displayedComp = activeComp || hoveredComp;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        backgroundColor: tokens.colors.viewer3dCanvasBg,
        borderRadius: 6,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Three.js Canvas Container */}
      <div
        ref={mountRef}
        style={{ width: '100%', height: '100%', outline: 'none' }}
      />

      {/* Floating 3D Control Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: tokens.spacing.sm,
          left: tokens.spacing.sm,
          right: tokens.spacing.sm,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
          zIndex: 15,
          flexWrap: 'wrap',
          gap: tokens.spacing.xs,
        }}
      >
        <Space size={tokens.spacing.xs} style={{ pointerEvents: 'auto' }}>
          <Tooltip title={t('viewer3d.viewTopSide')}>
            <Button size="small" onClick={handleViewTop}>
              {t('gerber.viewSideTop')}
            </Button>
          </Tooltip>

          <Tooltip title={t('viewer3d.viewBottomSide')}>
            <Button size="small" onClick={handleViewBottom}>
              {t('gerber.viewSideBottom')}
            </Button>
          </Tooltip>

          <Tooltip title={t('viewer3d.resetCamera')}>
            <Button
              size="small"
              icon={<AimOutlined aria-hidden="true" />}
              onClick={handleResetCamera}
            >
              {t('viewer3d.resetCamera')}
            </Button>
          </Tooltip>

          {pnpComponents.length > 0 && (
            <Tooltip title={t('viewer3d.toggleComponents')}>
              <Button
                size="small"
                type={showComponents ? 'primary' : 'default'}
                icon={<BlockOutlined aria-hidden="true" />}
                onClick={() => setShowComponents((prev) => !prev)}
              >
                {t('gerber.tabs.components')} ({pnpComponents.length})
              </Button>
            </Tooltip>
          )}

          <Tooltip title={t('viewer3d.wireframe')}>
            <Button
              size="small"
              type={isWireframe ? 'primary' : 'default'}
              icon={<BorderOutlined aria-hidden="true" />}
              onClick={() => setIsWireframe((prev) => !prev)}
            >
              {t('viewer3d.wireframe')}
            </Button>
          </Tooltip>

          <Tooltip title={t('viewer3d.autoRotate')}>
            <Button
              size="small"
              type={isAutoRotate ? 'primary' : 'default'}
              icon={<FieldTimeOutlined aria-hidden="true" />}
              onClick={() => setIsAutoRotate((prev) => !prev)}
            >
              {t('viewer3d.autoRotate')}
            </Button>
          </Tooltip>
        </Space>

        {/* Selected / Hovered Component Tag Card */}
        {displayedComp && (
          <div
            style={{
              pointerEvents: 'auto',
              backgroundColor: tokens.colors.viewer3dMaskBg,
              border: `1px solid ${tokens.colors.pcb3dSelectedGlow}`,
              borderRadius: 6,
              padding: `${tokens.spacing.xs}px ${tokens.spacing.sm}px`,
              color: tokens.colors.white,
              display: 'flex',
              alignItems: 'center',
              gap: tokens.spacing.xs,
              boxShadow: tokens.colors.subtleShadow,
            }}
          >
            <Tag bordered color="orange">
              {displayedComp.designator}
            </Tag>
            {displayedComp.value && (
              <span style={{ fontWeight: 600 }}>{displayedComp.value}</span>
            )}
            {displayedComp.footprint && (
              <span style={{ color: tokens.colors.textSecondary }}>
                ({displayedComp.footprint})
              </span>
            )}
            {displayedComp.bomRow && (
              <Tag bordered color="green">
                BOM #{displayedComp.bomRow.rowNumber}
              </Tag>
            )}
            {activeComp && (
              <Button
                size="small"
                type="text"
                style={{ color: tokens.colors.textSecondary }}
                icon={<SwapOutlined aria-hidden="true" />}
                onClick={() => {
                  setClickedComp(null);
                  onSelectComponent?.(null);
                }}
              >
                {t('gerber.clearSelection')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
