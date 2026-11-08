import React, { useState } from 'react';
import { Button, Space, Tag, Tooltip, Typography } from 'antd';
import {
  DownloadOutlined,
  ExportOutlined,
  FilePdfOutlined,
  RedoOutlined,
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { useTranslate } from '@refinedev/core';
import { tokens } from '../../theme/tokens';
import { isSchematicFileName } from '../../lib/pdf';

export interface PdfViewerProps {
  blobUrl?: string | null;
  fileName?: string | null;
  title?: string;
  height?: number | string;
  downloadFileName?: string | null;
  onDownload?: () => void;
  style?: React.CSSProperties;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  blobUrl,
  fileName,
  title,
  height = '72vh',
  downloadFileName,
  onDownload,
  style,
}) => {
  const t = useTranslate();
  const [zoom, setZoom] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);

  const isSchematic = isSchematicFileName(fileName);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(200, prev + 20));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(50, prev - 20));
  };

  const handleResetZoom = () => {
    setZoom(100);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  if (!blobUrl) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tokens.colors.surfaceSubtle,
          borderRadius: tokens.radius.md,
          border: `1px dashed ${tokens.colors.border}`,
          ...style,
        }}
      >
        <Typography.Text type="secondary">{t('pdf.noDocumentLoaded')}</Typography.Text>
      </div>
    );
  }

  // Construct iframe URL with PDF open parameters
  const iframeSrc = `${blobUrl}#view=FitH&toolbar=1&navpanes=1`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: tokens.radius.md,
        border: `1px solid ${tokens.colors.border}`,
        backgroundColor: tokens.colors.surface,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Top Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: tokens.spacing.xs,
          padding: `${tokens.spacing.xs}px ${tokens.spacing.sm}px`,
          backgroundColor: tokens.colors.surfaceSubtle,
          borderBottom: `1px solid ${tokens.colors.border}`,
        }}
      >
        <Space size={tokens.spacing.xs} align="center">
          <FilePdfOutlined aria-hidden="true" style={{ color: tokens.colors.accent }} />
          <Typography.Text strong ellipsis style={{ maxWidth: 320 }}>
            {title || fileName || t('pdf.documentPreview')}
          </Typography.Text>
          {isSchematic && (
            <Tag color="blue" bordered={false}>
              {t('pdf.schematicBadge')}
            </Tag>
          )}
        </Space>

        <Space size={tokens.spacing.xs} wrap>
          {/* Zoom Controls */}
          <Space.Compact size="small">
            <Tooltip title={t('pdf.zoomOut')}>
              <Button
                icon={<ZoomOutOutlined aria-hidden="true" />}
                onClick={handleZoomOut}
                disabled={zoom <= 50}
                aria-label={t('pdf.zoomOut')}
              />
            </Tooltip>
            <Button onClick={handleResetZoom} aria-label={t('pdf.resetZoom')}>
              {zoom}%
            </Button>
            <Tooltip title={t('pdf.zoomIn')}>
              <Button
                icon={<ZoomInOutlined aria-hidden="true" />}
                onClick={handleZoomIn}
                disabled={zoom >= 200}
                aria-label={t('pdf.zoomIn')}
              />
            </Tooltip>
          </Space.Compact>

          {/* Rotate 90° */}
          <Tooltip title={t('pdf.rotateCw')}>
            <Button
              size="small"
              icon={<RedoOutlined aria-hidden="true" />}
              onClick={handleRotate}
              aria-label={t('pdf.rotateCw')}
            >
              {rotation > 0 ? `${rotation}°` : undefined}
            </Button>
          </Tooltip>

          {/* Reset Orientation */}
          {rotation > 0 && (
            <Tooltip title={t('pdf.resetOrientation')}>
              <Button
                size="small"
                icon={<ReloadOutlined aria-hidden="true" />}
                onClick={() => setRotation(0)}
                aria-label={t('pdf.resetOrientation')}
              />
            </Tooltip>
          )}

          {/* Open in New Tab */}
          <Tooltip title={t('pdf.openNewTab')}>
            <Button
              size="small"
              icon={<ExportOutlined aria-hidden="true" />}
              href={blobUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('pdf.openNewTab')}
            >
              {t('pdf.newTab')}
            </Button>
          </Tooltip>

          {/* Download */}
          {(downloadFileName || onDownload) && (
            <Tooltip title={t('common.download')}>
              <Button
                size="small"
                icon={<DownloadOutlined aria-hidden="true" />}
                href={onDownload ? undefined : blobUrl}
                download={downloadFileName || fileName || 'document.pdf'}
                onClick={onDownload}
                aria-label={t('common.download')}
              >
                {t('common.download')}
              </Button>
            </Tooltip>
          )}
        </Space>
      </div>

      {/* PDF Viewport */}
      <div
        style={{
          position: 'relative',
          height,
          width: '100%',
          overflow: 'auto',
          backgroundColor: tokens.colors.surfaceSubtle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out',
          }}
        >
          <object
            data={iframeSrc}
            type="application/pdf"
            width="100%"
            height="100%"
            style={{ display: 'block', border: 'none' }}
          >
            {/* Fallback for browsers without native PDF plugin */}
            <iframe
              src={iframeSrc}
              title={title || fileName || 'PDF Preview'}
              width="100%"
              height="100%"
              style={{ border: 'none' }}
            >
              <div
                style={{
                  padding: tokens.spacing.lg,
                  textAlign: 'center',
                  backgroundColor: tokens.colors.surface,
                }}
              >
                <Typography.Paragraph>{t('pdf.fallbackNotice')}</Typography.Paragraph>
                <Button
                  type="primary"
                  icon={<ExportOutlined aria-hidden="true" />}
                  href={blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('pdf.openInNewTab')}
                </Button>
              </div>
            </iframe>
          </object>
        </div>
      </div>
    </div>
  );
};

