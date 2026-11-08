import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslate } from '@refinedev/core';
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Modal,
  Segmented,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CompressOutlined,
  FileSearchOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import {
  extractFilesFromZip,
  isGerberArchiveFileName,
  parseGerberFiles,
  type GerberLayer,
  type GerberParsedResult,
} from '../../lib/gerber';
import { downloadProjectFileBytes, downloadProjectFileText } from '../../lib/storage';
import { sanitizeSvg } from '../../lib/svgSanitizer';

export type GerberViewMode = 'top' | 'bottom' | 'layers';

export interface GerberViewerModalProps {
  open: boolean;
  title?: string;
  files?: { name: string; content: string }[];
  storagePath?: string | null;
  fileName?: string | null;
  multipleItems?: { fileName: string; storagePath: string }[];
  onClose: () => void;
}

export const GerberViewerModal: React.FC<GerberViewerModalProps> = ({
  open,
  title,
  files: initialFiles,
  storagePath,
  fileName,
  multipleItems,
  onClose,
}) => {
  const t = useTranslate();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<GerberParsedResult | null>(null);
  const [layers, setLayers] = useState<GerberLayer[]>([]);
  const [viewMode, setViewMode] = useState<GerberViewMode>('top');

  // Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;

    void (async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        let filesToParse: { name: string; content: string }[] = [];

        if (initialFiles && initialFiles.length > 0) {
          filesToParse = initialFiles;
        } else if (multipleItems && multipleItems.length > 0) {
          const loadedResults: { name: string; content: string }[] = [];
          for (const item of multipleItems) {
            if (isGerberArchiveFileName(item.fileName)) {
              const bytes = await downloadProjectFileBytes(item.storagePath);
              const extracted = extractFilesFromZip(bytes);
              loadedResults.push(...extracted);
            } else {
              const text = await downloadProjectFileText(item.storagePath);
              loadedResults.push({ name: item.fileName, content: text });
            }
          }
          filesToParse = loadedResults;
        } else if (storagePath && fileName) {
          if (isGerberArchiveFileName(fileName)) {
            const bytes = await downloadProjectFileBytes(storagePath);
            filesToParse = extractFilesFromZip(bytes);
          } else {
            const text = await downloadProjectFileText(storagePath);
            filesToParse = [{ name: fileName, content: text }];
          }
        }

        if (!active) {
          return;
        }

        if (filesToParse.length === 0) {
          setErrorMessage(t('gerber.noLayersFound'));
          setIsLoading(false);
          return;
        }

        const parseResult = await parseGerberFiles(filesToParse);

        if (!active) {
          return;
        }

        if (!parseResult.success) {
          setErrorMessage(parseResult.error);
          setIsLoading(false);
          return;
        }

        setParsedData(parseResult);
        setLayers(parseResult.layers);

        // Pick suitable default view mode
        if (parseResult.topBoardSvg) {
          setViewMode('top');
        } else if (parseResult.bottomBoardSvg) {
          setViewMode('bottom');
        } else {
          setViewMode('layers');
        }
      } catch (err) {
        if (!active) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [open, initialFiles, storagePath, fileName, multipleItems, t]);

  // Layer toggle handler
  const handleToggleLayer = (id: string, checked: boolean) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === id ? { ...layer, visible: checked } : layer)),
    );
  };

  // Preset handlers
  const handleSelectAll = () => {
    setLayers((prev) => prev.map((l) => ({ ...l, visible: true })));
  };

  const handleDeselectAll = () => {
    setLayers((prev) => prev.map((l) => ({ ...l, visible: false })));
  };

  const handleSelectTopOnly = () => {
    setLayers((prev) =>
      prev.map((l) => ({
        ...l,
        visible: l.side === 'top' || l.side === 'all' || l.type === 'outline' || l.type === 'drill',
      })),
    );
  };

  const handleSelectBottomOnly = () => {
    setLayers((prev) =>
      prev.map((l) => ({
        ...l,
        visible:
          l.side === 'bottom' || l.side === 'all' || l.type === 'outline' || l.type === 'drill',
      })),
    );
  };

  // Zoom handlers
  const handleZoomIn = () => {
    setZoom((z) => Math.min(10, Number((z * 1.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((z) => Math.max(0.2, Number((z / 1.25).toFixed(2))));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Pan mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { x: pan.x, y: pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) {
      return;
    }
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom((z) => {
      const next = z * factor;
      return Math.min(10, Math.max(0.2, Number(next.toFixed(2))));
    });
  };

  // Active SVG content
  const activeSvgContent = useMemo(() => {
    if (!parsedData) {
      return null;
    }

    if (viewMode === 'top' && parsedData.topBoardSvg) {
      return (
        <div
          dangerouslySetInnerHTML={{ __html: sanitizeSvg(parsedData.topBoardSvg) }}
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      );
    }

    if (viewMode === 'bottom' && parsedData.bottomBoardSvg) {
      return (
        <div
          dangerouslySetInnerHTML={{ __html: sanitizeSvg(parsedData.bottomBoardSvg) }}
          style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        />
      );
    }

    // Layer stack mode
    const visibleLayers = layers.filter((l) => l.visible);

    if (visibleLayers.length === 0) {
      return (
        <div style={{ textAlign: 'center', color: tokens.colors.textSecondary, padding: tokens.spacing.xl }}>
          <Typography.Text type="secondary">{t('gerber.noLayersFound')}</Typography.Text>
        </div>
      );
    }

    return (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {visibleLayers.map((layer) => (
          <div
            key={layer.id}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: layer.color,
              pointerEvents: 'none',
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeSvg(layer.svg) }}
          />
        ))}
      </div>
    );
  }, [parsedData, viewMode, layers, t]);

  return (
    <Modal
      open={open}
      title={
        <div className="revlog-inline-row" style={{ gap: tokens.spacing.sm }}>
          <FileSearchOutlined aria-hidden="true" />
          <Typography.Text strong>{title || t('gerber.viewerTitle')}</Typography.Text>
          {fileName && <Tag bordered>{fileName}</Tag>}
          {layers.length > 0 && (
            <span className="revlog-count-pill">
              {t('gerber.layerCount', { count: layers.length })}
            </span>
          )}
        </div>
      }
      width={1040}
      footer={null}
      destroyOnHidden
      onCancel={onClose}
      afterClose={() => {
        setParsedData(null);
        setLayers([]);
        setErrorMessage(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }}
      styles={{
        body: { padding: 0 },
      }}
    >
      {isLoading ? (
        <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
          <Spin />
          <div style={{ marginTop: tokens.spacing.sm }}>
            <Typography.Text type="secondary">{t('gerber.loading')}</Typography.Text>
          </div>
        </div>
      ) : errorMessage ? (
        <div style={{ padding: tokens.spacing.lg }}>
          <Alert
            type="error"
            showIcon
            message={t('gerber.parseErrorTitle')}
            description={errorMessage}
            style={{ marginBottom: tokens.spacing.md }}
          />
          <div style={{ textAlign: 'right' }}>
            <Button onClick={onClose}>{t('common.close')}</Button>
          </div>
        </div>
      ) : !parsedData ? (
        <div style={{ padding: tokens.spacing.xl, textAlign: 'center' }}>
          <Empty description={t('gerber.noLayersFound')} />
        </div>
      ) : (
        <div>
          {/* Controls Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
              borderBottom: `1px solid ${tokens.colors.border}`,
              backgroundColor: tokens.colors.surfaceSubtle,
              flexWrap: 'wrap',
              gap: tokens.spacing.sm,
            }}
          >
            {/* View Mode */}
            <div className="revlog-inline-row">
              <Typography.Text type="secondary">{t('gerber.viewMode')}:</Typography.Text>
              <Segmented
                size="small"
                value={viewMode}
                onChange={(val) => setViewMode(val as GerberViewMode)}
                options={[
                  {
                    value: 'top',
                    label: t('gerber.viewTopBoard'),
                    disabled: !parsedData.topBoardSvg,
                  },
                  {
                    value: 'bottom',
                    label: t('gerber.viewBottomBoard'),
                    disabled: !parsedData.bottomBoardSvg,
                  },
                  { value: 'layers', label: t('gerber.viewLayers') },
                ]}
              />
            </div>

            {/* Zoom & Pan Controls */}
            <div className="revlog-inline-row">
              <Tooltip title={t('gerber.zoomOut')}>
                <Button
                  size="small"
                  icon={<ZoomOutOutlined aria-hidden="true" />}
                  onClick={handleZoomOut}
                  aria-label={t('gerber.zoomOut')}
                />
              </Tooltip>
              <Tag bordered style={{ margin: 0, minWidth: 48, textAlign: 'center' }}>
                {Math.round(zoom * 100)}%
              </Tag>
              <Tooltip title={t('gerber.zoomIn')}>
                <Button
                  size="small"
                  icon={<ZoomInOutlined aria-hidden="true" />}
                  onClick={handleZoomIn}
                  aria-label={t('gerber.zoomIn')}
                />
              </Tooltip>
              <Tooltip title={t('gerber.resetZoom')}>
                <Button
                  size="small"
                  icon={<CompressOutlined aria-hidden="true" />}
                  onClick={handleResetZoom}
                  aria-label={t('gerber.resetZoom')}
                />
              </Tooltip>
            </div>
          </div>

          {/* Main Content Area */}
          <div
            style={{
              display: 'flex',
              height: 580,
              backgroundColor: tokens.colors.gerberCanvasBg,
              position: 'relative',
            }}
          >
            {/* Viewport Canvas */}
            <div
              tabIndex={0}
              role="region"
              aria-label={t('gerber.viewerTitle')}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              style={{
                flex: 1,
                overflow: 'hidden',
                position: 'relative',
                cursor: isDragging ? 'grabbing' : 'grab',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundImage: `radial-gradient(${tokens.colors.gerberGridDot} 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
              }}
            >
              <div
                style={{
                  width: '90%',
                  height: '90%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.08s ease-out',
                }}
              >
                {activeSvgContent}
              </div>
            </div>

            {/* Sidebar Layer Panel (Available in Layer Stack mode or for layer inspection) */}
            <div
              style={{
                width: 280,
                borderLeft: `1px solid ${tokens.colors.border}`,
                backgroundColor: tokens.colors.surface,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
                  borderBottom: `1px solid ${tokens.colors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Typography.Text strong>{t('gerber.layersHeading')}</Typography.Text>
                <span className="revlog-count-pill">{layers.length}</span>
              </div>

              {/* Quick Presets */}
              <div
                style={{
                  padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
                  borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
                  display: 'flex',
                  gap: 4,
                  flexWrap: 'wrap',
                }}
              >
                <Button size="small" type="text" onClick={handleSelectAll}>
                  {t('gerber.selectAll')}
                </Button>
                <Button size="small" type="text" onClick={handleDeselectAll}>
                  {t('gerber.deselectAll')}
                </Button>
                <Button size="small" type="text" onClick={handleSelectTopOnly}>
                  {t('gerber.topOnly')}
                </Button>
                <Button size="small" type="text" onClick={handleSelectBottomOnly}>
                  {t('gerber.bottomOnly')}
                </Button>
              </div>

              {/* Layer List */}
              <div
                tabIndex={0}
                role="list"
                aria-label={t('gerber.layersHeading')}
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: tokens.spacing.xs,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {layers.map((layer) => (
                  <div
                    key={layer.id}
                    role="listitem"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      borderRadius: tokens.radius.sm,
                      backgroundColor: layer.visible
                        ? tokens.colors.surfaceSubtle
                        : 'transparent',
                    }}
                  >
                    <div className="revlog-inline-row" style={{ flex: 1, minWidth: 0, gap: 8 }}>
                      <Checkbox
                        checked={layer.visible}
                        onChange={(e) => handleToggleLayer(layer.id, e.target.checked)}
                        aria-label={layer.filename}
                      />
                      <span
                        aria-hidden="true"
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: layer.color,
                          display: 'inline-block',
                          flexShrink: 0,
                          border: `1px solid ${tokens.colors.gerberDotBorder}`,
                        }}
                      />
                      <Typography.Text
                        ellipsis
                        style={{
                          color: layer.visible
                            ? tokens.colors.textPrimary
                            : tokens.colors.textSecondary,
                        }}
                        title={layer.filename}
                      >
                        {layer.filename}
                      </Typography.Text>
                    </div>

                    <Tag
                      bordered
                      style={{
                        margin: 0,
                        lineHeight: '16px',
                        padding: '0 4px',
                        textTransform: 'capitalize',
                      }}
                    >
                      {t(`gerber.types.${layer.type}`) || layer.type}
                    </Tag>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
