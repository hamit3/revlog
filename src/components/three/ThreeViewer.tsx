import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { Alert, Button, Space, Spin, Tag, Tooltip } from 'antd';
import {
  AimOutlined,
  BorderOutlined,
  FieldTimeOutlined,
} from '@ant-design/icons';
import { useTranslate } from '@refinedev/core';
import { getModel3DFormat, type Model3DFormat, type Model3DMeta } from '../../lib/model3d';
import { downloadProjectFileBytes } from '../../lib/storage';
import { tokens } from '../../theme/tokens';

export interface ThreeViewerProps {
  data?: ArrayBuffer | string | null;
  storagePath?: string | null;
  fileName: string;
  format?: Model3DFormat;
  height?: number | string;
  style?: React.CSSProperties;
  showToolbar?: boolean;
}

export const ThreeViewer: React.FC<ThreeViewerProps> = ({
  data: propData,
  storagePath,
  fileName,
  format: explicitFormat,
  height = 540,
  style,
  showToolbar = true,
}) => {
  const t = useTranslate();
  const mountRef = useRef<HTMLDivElement>(null);

  const [downloadedBuffer, setDownloadedBuffer] = useState<ArrayBuffer | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modelMeta, setModelMeta] = useState<Model3DMeta | null>(null);

  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [isGridVisible, setIsGridVisible] = useState<boolean>(true);
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(false);
  const isGridVisibleRef = useRef<boolean>(isGridVisible);

  // References to live Three.js instances for dynamic control
  const rootObjectRef = useRef<THREE.Object3D | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const initialCameraPosRef = useRef<THREE.Vector3>(new THREE.Vector3(100, 80, 120));

  const detectedFormat = explicitFormat ?? getModel3DFormat(fileName);

  // Download storage file bytes if storagePath is provided and no direct data buffer
  useEffect(() => {
    if (propData || !storagePath) {
      return;
    }
    let active = true;

    void (async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const bytes = await downloadProjectFileBytes(storagePath);
        if (!active) {
          return;
        }
        setDownloadedBuffer(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        );
      } catch (err) {
        if (!active) {
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(msg);
        setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [propData, storagePath]);

  const activeData = propData ?? downloadedBuffer;

  // Toggle wireframe on all meshes
  useEffect(() => {
    if (!rootObjectRef.current) {
      return;
    }
    rootObjectRef.current.traverse((child) => {
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

  // Toggle grid visibility
  useEffect(() => {
    isGridVisibleRef.current = isGridVisible;
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = isGridVisible;
    }
  }, [isGridVisible]);

  // Toggle auto-rotate
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = isAutoRotate;
    }
  }, [isAutoRotate]);

  // Reset camera view
  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) {
      return;
    }
    cameraRef.current.position.copy(initialCameraPosRef.current);
    controlsRef.current.target.set(0, 0, 0);
    cameraRef.current.lookAt(0, 0, 0);
    controlsRef.current.update();
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container || !activeData || !detectedFormat) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setModelMeta(null);

    let animationFrameId: number;
    let isDisposed = false;

    // 1. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(tokens.colors.viewer3dCanvasBg);

    const width = container.clientWidth || 800;
    const initialHeight = typeof height === 'number' ? height : container.clientHeight || 540;

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(45, width / initialHeight, 0.1, 5000);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, initialHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. OrbitControls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controlsRef.current = controls;

    // 5. Lighting setup
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight1.position.set(150, 200, 150);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight2.position.set(-150, -100, -150);
    scene.add(dirLight2);

    // Helper function to process loaded 3D root object
    const setupModelObject = (object: THREE.Object3D) => {
      if (isDisposed) {
        return;
      }
      rootObjectRef.current = object;

      // Compute bounding box and center
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // Center object at origin (0, 0, 0)
      object.position.sub(center);
      scene.add(object);

      // Compute stats
      let triangles = 0;
      let vertices = 0;
      object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const geom = mesh.geometry;
          if (geom.index) {
            triangles += geom.index.count / 3;
          } else if (geom.attributes.position) {
            triangles += geom.attributes.position.count / 3;
          }
          if (geom.attributes.position) {
            vertices += geom.attributes.position.count;
          }
        }
      });

      setModelMeta({
        format: detectedFormat,
        trianglesCount: Math.round(triangles),
        verticesCount: Math.round(vertices),
        dimensions: {
          width: Math.round(size.x * 10) / 10,
          height: Math.round(size.y * 10) / 10,
          depth: Math.round(size.z * 10) / 10,
        },
      });

      // Grid helper based on max model dimension
      const maxDim = Math.max(size.x, size.y, size.z, 10);
      const gridHelper = new THREE.GridHelper(maxDim * 2.5, 20, 0x556677, 0x223344);
      gridHelper.position.y = -size.y / 2;
      gridHelper.visible = isGridVisibleRef.current;
      gridHelperRef.current = gridHelper;
      scene.add(gridHelper);

      // Position camera nicely
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.8;
      const initialCamPos = new THREE.Vector3(maxDim * 1.1, maxDim * 0.9, cameraZ);
      camera.position.copy(initialCamPos);
      initialCameraPosRef.current.copy(initialCamPos);
      camera.near = maxDim / 100;
      camera.far = maxDim * 100;
      camera.updateProjectionMatrix();

      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();

      setIsLoading(false);
    };

    const handleLoadError = (err: unknown) => {
      if (isDisposed) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`${t('viewer3d.loadError')}: ${msg}`);
      setIsLoading(false);
    };

    // 6. Model Loading
    if (detectedFormat === 'glb' || detectedFormat === 'gltf') {
      const loader = new GLTFLoader();
      if (activeData instanceof ArrayBuffer) {
        loader.parse(
          activeData,
          '',
          (gltf) => setupModelObject(gltf.scene),
          handleLoadError,
        );
      } else {
        loader.load(
          activeData,
          (gltf) => setupModelObject(gltf.scene),
          undefined,
          handleLoadError,
        );
      }
    } else if (detectedFormat === 'stl') {
      const loader = new STLLoader();
      const processStlGeometry = (geom: THREE.BufferGeometry) => {
        geom.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({
          color: 0x1f5fbf,
          metalness: 0.2,
          roughness: 0.6,
        });
        const mesh = new THREE.Mesh(geom, material);
        setupModelObject(mesh);
      };

      if (activeData instanceof ArrayBuffer) {
        try {
          const geom = loader.parse(activeData);
          processStlGeometry(geom);
        } catch (err) {
          handleLoadError(err);
        }
      } else {
        loader.load(
          activeData,
          processStlGeometry,
          undefined,
          handleLoadError,
        );
      }
    }

    // 7. Render loop
    const animate = () => {
      if (isDisposed) {
        return;
      }
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 8. ResizeObserver
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

    // 9. Clean disposal on unmount
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();

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
      rootObjectRef.current = null;
      gridHelperRef.current = null;
      controlsRef.current = null;
    };
  }, [activeData, detectedFormat, height, t]);

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
      {/* Three.js canvas container */}
      <div
        ref={mountRef}
        style={{ width: '100%', height: '100%', outline: 'none' }}
      />

      {/* Loading Spinner */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tokens.colors.viewer3dMaskBg,
            zIndex: 10,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <Spin />
            <div
              style={{
                marginTop: tokens.spacing.xs,
                color: tokens.colors.textSecondary,
              }}
            >
              {t('viewer3d.loading')}
            </div>
          </div>
        </div>
      )}

      {/* Error Message Alert */}
      {errorMessage && (
        <div
          style={{
            position: 'absolute',
            top: tokens.spacing.md,
            left: tokens.spacing.md,
            right: tokens.spacing.md,
            zIndex: 20,
          }}
        >
          <Alert
            type="error"
            showIcon
            message={errorMessage}
            closable
            onClose={() => setErrorMessage(null)}
          />
        </div>
      )}

      {/* Floating 3D Control Toolbar */}
      {showToolbar && !errorMessage && (
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
          {/* Controls buttons */}
          <Space size={tokens.spacing.xs} style={{ pointerEvents: 'auto' }}>
            <Tooltip title={t('viewer3d.resetCamera')}>
              <Button
                size="small"
                icon={<AimOutlined aria-hidden="true" />}
                onClick={handleResetCamera}
              >
                {t('viewer3d.resetCamera')}
              </Button>
            </Tooltip>

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

            <Tooltip title={t('viewer3d.grid')}>
              <Button
                size="small"
                type={isGridVisible ? 'primary' : 'default'}
                icon={<BorderOutlined aria-hidden="true" />}
                onClick={() => setIsGridVisible((prev) => !prev)}
              >
                {t('viewer3d.grid')}
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

          {/* Model Statistics Badges */}
          {modelMeta && (
            <Space size={tokens.spacing.xs} style={{ pointerEvents: 'auto' }}>
              <Tag bordered color="blue">
                {modelMeta.format.toUpperCase()}
              </Tag>
              <Tag bordered>
                {t('viewer3d.triangles', { count: modelMeta.trianglesCount.toLocaleString() })}
              </Tag>
              <Tag bordered>
                {t('viewer3d.dimensions', {
                  x: modelMeta.dimensions.width,
                  y: modelMeta.dimensions.height,
                  z: modelMeta.dimensions.depth,
                })}
              </Tag>
            </Space>
          )}
        </div>
      )}
    </div>
  );
};
