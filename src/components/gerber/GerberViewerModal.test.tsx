/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { GerberViewerModal } from './GerberViewerModal';
import * as gerberLib from '../../lib/gerber';
import * as storageLib from '../../lib/storage';

// Configure React act environment for jsdom
// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockTranslate = (key: string, _options?: Record<string, unknown>, defaultMessage?: string) =>
  defaultMessage || key;

vi.mock('@refinedev/core', () => ({
  useTranslate: () => mockTranslate,
}));

vi.mock('../../lib/storage', () => ({
  downloadProjectFileBytes: vi.fn(),
  downloadProjectFileText: vi.fn(),
}));

// Setup matchMedia mock for Ant Design in jsdom
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

describe('GerberViewerModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
  });

  it('does not render modal dialog content when open is false', () => {
    act(() => {
      root.render(
        <GerberViewerModal
          open={false}
          title="Test Gerber"
          files={[{ name: 'board.gtl', content: 'G04 test*' }]}
          onClose={vi.fn()}
        />
      );
    });

    const modal = document.querySelector('.ant-modal');
    expect(modal).toBeNull();
  });

  it('renders modal with title and controls when open is true', async () => {
    const mockParse = vi.spyOn(gerberLib, 'parseGerberFiles').mockResolvedValue({
      success: true,
      layers: [
        {
          id: 'layer-1',
          filename: 'top_copper.gtl',
          type: 'copper',
          side: 'top',
          color: '#E58E26',
          visible: true,
          svg: '<svg><path d="M0,0 L10,10" /></svg>',
        },
      ],
      topBoardSvg: '<svg viewBox="0 0 100 100"><g id="top" /></svg>',
      bottomBoardSvg: '<svg viewBox="0 0 100 100"><g id="bottom" /></svg>',
      viewBox: '0 0 100 100',
    });

    await act(async () => {
      root.render(
        <GerberViewerModal
          open={true}
          title="Board Top Copper"
          files={[{ name: 'top_copper.gtl', content: 'G04 test*' }]}
          onClose={vi.fn()}
        />
      );
    });

    // Check modal rendered
    const modalTitle = document.querySelector('.ant-modal-title');
    expect(modalTitle?.textContent).toContain('Board Top Copper');

    // Check zoom buttons exist
    const zoomButtons = document.querySelectorAll('button[aria-label]');
    expect(zoomButtons.length).toBeGreaterThan(0);

    // Check layer tag is rendered in layer manager
    expect(document.body.textContent).toContain('top_copper.gtl');

    mockParse.mockRestore();
  });

  it('displays graceful error alert when parser fails or errors are returned', async () => {
    const mockParse = vi.spyOn(gerberLib, 'parseGerberFiles').mockResolvedValue({
      success: false,
      error: 'Invalid Gerber header syntax',
    });

    await act(async () => {
      root.render(
        <GerberViewerModal
          open={true}
          title="Corrupted File"
          files={[{ name: 'bad.gtl', content: 'corrupted content' }]}
          onClose={vi.fn()}
        />
      );
    });

    const alert = document.querySelector('.ant-alert-error');
    expect(alert).not.toBeNull();
    expect(document.body.textContent).toContain('Invalid Gerber header syntax');

    mockParse.mockRestore();
  });

  it('unpacks and renders zip archives when storagePath points to a .zip', async () => {
    const fakeZipBytes = new Uint8Array([80, 75, 3, 4]); // PK zip header
    vi.spyOn(storageLib, 'downloadProjectFileBytes').mockResolvedValue(fakeZipBytes);
    vi.spyOn(gerberLib, 'extractFilesFromZip').mockReturnValue([
      { name: 'board-F_Cu.gtl', content: 'G04 test*' },
    ]);
    const mockParse = vi.spyOn(gerberLib, 'parseGerberFiles').mockResolvedValue({
      success: true,
      layers: [
        {
          id: 'l1',
          filename: 'board-F_Cu.gtl',
          type: 'copper',
          side: 'top',
          color: '#E58E26',
          visible: true,
          svg: '<svg></svg>',
        },
      ],
      topBoardSvg: '<svg></svg>',
      bottomBoardSvg: null,
      viewBox: '0 0 50 50',
    });

    await act(async () => {
      root.render(
        <GerberViewerModal
          open={true}
          fileName="gerbers.zip"
          storagePath="projects/p1/gerbers.zip"
          onClose={vi.fn()}
        />
      );
    });

    expect(storageLib.downloadProjectFileBytes).toHaveBeenCalledWith('projects/p1/gerbers.zip');
    expect(gerberLib.extractFilesFromZip).toHaveBeenCalledWith(fakeZipBytes);
    expect(document.body.textContent).toContain('board-F_Cu.gtl');

    mockParse.mockRestore();
  });

  it('unpacks multiple items including zip archives cleanly', async () => {
    const fakeZipBytes = new Uint8Array([80, 75, 3, 4]);
    vi.spyOn(storageLib, 'downloadProjectFileBytes').mockResolvedValue(fakeZipBytes);
    vi.spyOn(storageLib, 'downloadProjectFileText').mockResolvedValue('G04 drill file*');
    vi.spyOn(gerberLib, 'extractFilesFromZip').mockReturnValue([
      { name: 'board-F_Cu.gtl', content: 'G04 copper*' },
    ]);
    const mockParse = vi.spyOn(gerberLib, 'parseGerberFiles').mockResolvedValue({
      success: true,
      layers: [
        {
          id: 'l1',
          filename: 'board-F_Cu.gtl',
          type: 'copper',
          side: 'top',
          color: '#E58E26',
          visible: true,
          svg: '<svg></svg>',
        },
      ],
      topBoardSvg: '<svg></svg>',
      bottomBoardSvg: null,
      viewBox: '0 0 50 50',
    });

    await act(async () => {
      root.render(
        <GerberViewerModal
          open={true}
          multipleItems={[
            { fileName: 'gerbers.zip', storagePath: 'p1/gerbers.zip' },
            { fileName: 'drill.drl', storagePath: 'p1/drill.drl' },
          ]}
          onClose={vi.fn()}
        />
      );
    });

    expect(storageLib.downloadProjectFileBytes).toHaveBeenCalledWith('p1/gerbers.zip');
    expect(storageLib.downloadProjectFileText).toHaveBeenCalledWith('p1/drill.drl');
    expect(gerberLib.parseGerberFiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        { name: 'board-F_Cu.gtl', content: 'G04 copper*' },
        { name: 'drill.drl', content: 'G04 drill file*' },
      ])
    );

    mockParse.mockRestore();
  });

  it('triggers onClose when close button is clicked', async () => {
    const onCloseSpy = vi.fn();

    await act(async () => {
      root.render(
        <GerberViewerModal
          open={true}
          title="Test Title"
          files={[{ name: 'test.gtl', content: 'G04 test*' }]}
          onClose={onCloseSpy}
        />
      );
    });

    const closeBtn = document.querySelector('.ant-modal-close');
    expect(closeBtn).not.toBeNull();
    closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onCloseSpy).toHaveBeenCalled();
  });
});
