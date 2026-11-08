import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PdfViewer } from './PdfViewer';
import { PdfViewerModal } from './PdfViewerModal';

// Mock Refine useTranslate
vi.mock('@refinedev/core', () => ({
  useTranslate: () => (key: string, params?: Record<string, unknown>) => {
    if (key === 'pdf.noDocumentLoaded') return 'No document loaded';
    if (key === 'pdf.documentPreview') return 'PDF Preview';
    if (key === 'pdf.schematicBadge') return 'Schematic';
    if (key === 'pdf.zoomIn') return 'Zoom in';
    if (key === 'pdf.zoomOut') return 'Zoom out';
    if (key === 'pdf.resetZoom') return 'Reset zoom';
    if (key === 'pdf.rotateCw') return 'Rotate 90 degrees';
    if (key === 'pdf.resetOrientation') return 'Reset rotation';
    if (key === 'pdf.openNewTab') return 'Open in new tab';
    if (key === 'pdf.newTab') return 'New tab';
    if (key === 'pdf.loadingDocument') return 'Loading document...';
    if (key === 'pdf.downloadError') return 'Failed to download document from storage';
    if (key === 'pdf.noFileSpecified') return 'No file specified for preview';
    if (key === 'pdf.fallbackNotice') return 'Your browser does not display inline PDF previews';
    if (key === 'pdf.openInNewTab') return 'Open PDF in new tab';
    if (key === 'common.download') return 'Download';
    if (key === 'common.errorPrefix') return 'Error';
    return params ? `${key} ${JSON.stringify(params)}` : key;
  },
}));

describe('PdfViewer component', () => {
  it('renders empty fallback when no blobUrl is provided', () => {
    const html = renderToStaticMarkup(<PdfViewer blobUrl={null} />);
    expect(html).toContain('No document loaded');
  });

  it('renders toolbar, document title and PDF object container when blobUrl is provided', () => {
    const fakeBlobUrl = 'blob:http://localhost:3000/123-abc';
    const html = renderToStaticMarkup(
      <PdfViewer
        blobUrl={fakeBlobUrl}
        fileName="power_board_schematic.pdf"
        title="Power Board Schematic"
        downloadFileName="power_board_schematic.pdf"
      />,
    );

    expect(html).toContain('Power Board Schematic');
    // Schematic badge
    expect(html).toContain('Schematic');
    // Zoom control
    expect(html).toContain('100%');
    // Object and iframe tags with pdf URL
    expect(html).toContain(fakeBlobUrl);
    expect(html).toContain('application/pdf');
    // Download button
    expect(html).toContain('Download');
  });

  it('renders regular PDF document without schematic badge when not schematic', () => {
    const fakeBlobUrl = 'blob:http://localhost:3000/datasheet-456';
    const html = renderToStaticMarkup(
      <PdfViewer
        blobUrl={fakeBlobUrl}
        fileName="component_datasheet.pdf"
        title="Component Datasheet"
      />,
    );

    expect(html).toContain('Component Datasheet');
    expect(html).not.toContain('Schematic');
    expect(html).toContain('New tab');
  });
});

describe('PdfViewerModal component', () => {
  it('renders modal cleanly when open is false without mounting content', () => {
    const html = renderToStaticMarkup(
      <PdfViewerModal
        open={false}
        title="Schematic Document"
        fileName="schematic.pdf"
        onClose={() => {}}
      />,
    );

    expect(html).toBe('');
  });
});
