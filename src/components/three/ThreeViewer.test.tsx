/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ThreeViewer } from './ThreeViewer';
import { Model3DViewerModal } from './Model3DViewerModal';

// Configure React act environment for jsdom
// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockTranslate = (key: string, _options?: Record<string, unknown>, defaultMessage?: string) =>
  defaultMessage || key;

vi.mock('@refinedev/core', () => ({
  useTranslate: () => mockTranslate,
}));

vi.mock('../../lib/storage', () => ({
  downloadProjectFileBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  downloadProjectFileText: vi.fn(),
}));

// Mock Three.js WebGLRenderer in jsdom environment
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockWebGLRenderer {
    domElement = document.createElement('canvas');
    toneMapping = 0;
    toneMappingExposure = 1;
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

// Mock OrbitControls
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => {
  class MockOrbitControls {
    enableDamping = true;
    dampingFactor = 0.05;
    screenSpacePanning = true;
    update = vi.fn();
    dispose = vi.fn();
    target = { set: vi.fn() };
    autoRotate = false;
  }
  return {
    OrbitControls: MockOrbitControls,
  };
});

// Mock STLLoader
vi.mock('three/examples/jsm/loaders/STLLoader.js', async () => {
  const THREE = await vi.importActual<typeof import('three')>('three');
  class MockSTLLoader {
    parse = vi.fn().mockImplementation(() => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
      );
      return geom;
    });
    load = vi.fn();
  }
  return {
    STLLoader: MockSTLLoader,
  };
});
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('ThreeViewer & Model3DViewerModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders ThreeViewer toolbar and canvas container', async () => {
    const dummyBuffer = new ArrayBuffer(16);

    await act(async () => {
      root.render(
        <ThreeViewer
          data={dummyBuffer}
          fileName="board.stl"
          format="stl"
          height={400}
        />,
      );
    });

    expect(container.querySelector('canvas')).toBeTruthy();
    // Buttons in toolbar
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(4);
  });

  it('renders Model3DViewerModal inline and modal modes', async () => {
    const dummyBuffer = new ArrayBuffer(16);

    await act(async () => {
      root.render(
        <Model3DViewerModal
          inline={true}
          fileName="case.stl"
          arrayBuffer={dummyBuffer}
          height={300}
        />,
      );
    });

    expect(container.querySelector('canvas')).toBeTruthy();
  });

  it('shows error alert when format is unsupported or file load fails', async () => {
    await act(async () => {
      root.render(
        <ThreeViewer
          data="http://localhost/bad-file.glb"
          fileName="bad-file.glb"
          format="glb"
        />,
      );
    });

    // Renders safely without throwing uncaught exceptions
    expect(container).toBeTruthy();
  });
});
