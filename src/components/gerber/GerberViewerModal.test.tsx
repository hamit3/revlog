/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { GerberViewerModal } from './GerberViewerModal';
import * as gerberLib from '../../lib/gerber';
import * as storageLib from '../../lib/storage';
import { supabaseClient } from '../../providers/supabaseClient';
import type { ParsedBomRow, ParsedPnpRow } from '../../types/database';

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

vi.mock('../../providers/supabaseClient', () => ({
  supabaseClient: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        })),
      })),
    })),
  },
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

const sampleBomRows: ParsedBomRow[] = [
  {
    rowNumber: 1,
    rawDesignators: 'R1',
    designators: ['R1'],
    value: '10k',
    footprint: '0603',
    quantity: 1,
    dnp: false,
    mpn: 'RC0603FR-0710KL',
    manufacturer: 'Yageo',
    side: 'top',
  },
  {
    rowNumber: 2,
    rawDesignators: 'C1',
    designators: ['C1'],
    value: '100nF',
    footprint: '0402',
    quantity: 1,
    dnp: false,
    mpn: 'CL05B104KO5NNNC',
    manufacturer: 'Samsung',
    side: 'top',
  },
];

const samplePnpRows: ParsedPnpRow[] = [
  {
    rowNumber: 1,
    designator: 'R1',
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
    designator: 'C1',
    value: '100nF',
    footprint: '0402',
    x: 15.0,
    y: 25.0,
    rawRotation: '0',
    rotation: 0,
    rawSide: 'top',
    side: 'top',
  },
];

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
        />,
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
        />,
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
        />,
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
        />,
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
        />,
      );
    });

    expect(storageLib.downloadProjectFileBytes).toHaveBeenCalledWith('p1/gerbers.zip');
    expect(storageLib.downloadProjectFileText).toHaveBeenCalledWith('p1/drill.drl');
    expect(gerberLib.parseGerberFiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        { name: 'board-F_Cu.gtl', content: 'G04 copper*' },
        { name: 'drill.drl', content: 'G04 drill file*' },
      ]),
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
        />,
      );
    });

    const closeBtn = document.querySelector('.ant-modal-close');
    expect(closeBtn).not.toBeNull();
    closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onCloseSpy).toHaveBeenCalled();
  });

  it('renders PnP overlay components, tabs, and allows bidirectional selection', async () => {
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
          title="Board with PnP"
          files={[{ name: 'top_copper.gtl', content: 'G04 test*' }]}
          bomRows={sampleBomRows}
          pnpRows={samplePnpRows}
          onClose={vi.fn()}
        />,
      );
    });

    // Verify PnP overlay SVG is rendered
    const overlaySvg = document.querySelector('[data-testid="pnp-overlay-svg"]');
    expect(overlaySvg).not.toBeNull();

    // Verify component groups on SVG board
    const compR1 = document.querySelector('[data-testid="pnp-component-R1"]');
    const compC1 = document.querySelector('[data-testid="pnp-component-C1"]');
    expect(compR1).not.toBeNull();
    expect(compC1).not.toBeNull();

    // Verify text inside R1 group
    expect(compR1?.querySelector('text')?.textContent).toBe('R1');
    expect(compR1?.querySelector('circle')).not.toBeNull(); // Pin 1 marker
    expect(compR1?.querySelector('rect')).not.toBeNull(); // Component body

    // Click R1 component on SVG board: should select it, switch to BOM tab, and show inspector card
    await act(async () => {
      compR1?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const inspectorCard = document.querySelector('[data-testid="pnp-inspector-card"]');
    expect(inspectorCard).not.toBeNull();
    expect(inspectorCard?.textContent).toContain('R1');
    expect(inspectorCard?.textContent).toContain('RC0603FR-0710KL');
    expect(inspectorCard?.textContent).toContain('10.50 mm');

    // Click BOM item for C1: should highlight C1 component
    const bomItemC1 = document.querySelector('[data-testid="bom-list-item-2"]');
    expect(bomItemC1).not.toBeNull();
    await act(async () => {
      bomItemC1?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Inspector card should now show C1 information
    const updatedInspector = document.querySelector('[data-testid="pnp-inspector-card"]');
    expect(updatedInspector?.textContent).toContain('C1');
    expect(updatedInspector?.textContent).toContain('CL05B104KO5NNNC');

    mockParse.mockRestore();
  });

  it('fetches bom_pnp_check_runs via supabaseClient when releaseId is passed without rows', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        parsed_bom: sampleBomRows,
        parsed_pnp: samplePnpRows,
      },
      error: null,
    });

    vi.spyOn(supabaseClient, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: mockMaybeSingle,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabaseClient.from>);

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
          svg: '<svg></svg>',
        },
      ],
      topBoardSvg: '<svg viewBox="0 0 100 100"></svg>',
      bottomBoardSvg: null,
      viewBox: '0 0 100 100',
    });

    await act(async () => {
      root.render(
        <GerberViewerModal
          open={true}
          title="Release Board"
          files={[{ name: 'top_copper.gtl', content: 'G04 test*' }]}
          releaseId="rel-xyz-123"
          onClose={vi.fn()}
        />,
      );
    });

    expect(supabaseClient.from).toHaveBeenCalledWith('bom_pnp_check_runs');
    expect(mockMaybeSingle).toHaveBeenCalled();

    // Verify fetched PnP component rendered
    const compR1 = document.querySelector('[data-testid="pnp-component-R1"]');
    expect(compR1).not.toBeNull();

    mockParse.mockRestore();
  });
});
