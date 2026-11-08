import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslate } from '@refinedev/core';
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Segmented,
  Spin,
  Switch,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CompressOutlined,
  FileSearchOutlined,
  SearchOutlined,
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
import {
  filterComponentsBySide,
  findComponentsForBomRow,
  getComponentSvgTransform,
  matchPnpComponentsWithBom,
  parseSvgViewBox,
  PNP_OVERLAY_THEME,
  searchComponents,
  type PnpOverlayComponent,
  type SvgViewBoxBounds,
} from '../../lib/pnpOverlay';
import { downloadProjectFileBytes, downloadProjectFileText } from '../../lib/storage';
import { sanitizeSvg } from '../../lib/svgSanitizer';
import { supabaseClient } from '../../providers/supabaseClient';
import type { ParsedBomRow, ParsedPnpRow } from '../../types/database';

export type GerberViewMode = 'top' | 'bottom' | 'layers';

export interface GerberViewerModalProps {
  open?: boolean;
  inline?: boolean;
  height?: number | string;
  title?: string;
  files?: { name: string; content: string }[];
  storagePath?: string | null;
  fileName?: string | null;
  multipleItems?: { fileName: string; storagePath: string }[];
  releaseId?: string;
  bomRows?: ParsedBomRow[];
  pnpRows?: ParsedPnpRow[];
  onClose?: () => void;
}

export const GerberViewerModal: React.FC<GerberViewerModalProps> = ({
  open = false,
  inline = false,
  height = 720,
  title,
  files: initialFiles,
  storagePath,
  fileName,
  multipleItems,
  releaseId,
  bomRows: propBomRows,
  pnpRows: propPnpRows,
  onClose,
}) => {
  const t = useTranslate();
  const isOpen = inline || open;

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
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // PnP & BOM overlay state
  const [fetchedBomRows, setFetchedBomRows] = useState<ParsedBomRow[]>([]);
  const [fetchedPnpRows, setFetchedPnpRows] = useState<ParsedPnpRow[]>([]);
  const [showPnpOverlay, setShowPnpOverlay] = useState<boolean>(true);
  const [pnpSideFilter, setPnpSideFilter] = useState<'all' | 'top' | 'bottom'>('all');
  const [pnpSearchQuery, setPnpSearchQuery] = useState<string>('');
  const [bomSearchQuery, setBomSearchQuery] = useState<string>('');

  const [selectedDesignator, setSelectedDesignator] = useState<string | null>(null);
  const [selectedDesignators, setSelectedDesignators] = useState<Set<string>>(new Set());
  const [selectedBomRow, setSelectedBomRow] = useState<ParsedBomRow | null>(null);
  const [hoveredDesignator, setHoveredDesignator] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'layers' | 'components' | 'bom'>('layers');

  // Fetch BOM & PnP check run if releaseId is provided without direct rows
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (propBomRows && propPnpRows) {
      return;
    }
    if (!releaseId) {
      return;
    }

    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabaseClient
          .from('bom_pnp_check_runs')
          .select('parsed_bom, parsed_pnp')
          .eq('release_id', releaseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!active || error || !data) {
          return;
        }

        if (!propBomRows && data.parsed_bom) {
          setFetchedBomRows(data.parsed_bom);
        }
        if (!propPnpRows && data.parsed_pnp) {
          setFetchedPnpRows(data.parsed_pnp);
        }
      } catch {
        // Continue silently if check run cannot be fetched
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, releaseId, propBomRows, propPnpRows]);

  const effectiveBomRows = useMemo(() => {
    return propBomRows ?? fetchedBomRows;
  }, [propBomRows, fetchedBomRows]);

  const effectivePnpRows = useMemo(() => {
    return propPnpRows ?? fetchedPnpRows;
  }, [propPnpRows, fetchedPnpRows]);

  // Match PnP components with BOM entries
  const allMatchedComponents = useMemo(() => {
    if (!effectivePnpRows || effectivePnpRows.length === 0) {
      return [];
    }
    return matchPnpComponentsWithBom(effectivePnpRows, effectiveBomRows ?? []);
  }, [effectivePnpRows, effectiveBomRows]);

  // Load Gerber files
  useEffect(() => {
    if (!isOpen) {
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
  }, [isOpen, initialFiles, storagePath, fileName, multipleItems, t]);

  // ViewBox bounds
  const viewBoxBounds = useMemo<SvgViewBoxBounds | null>(() => {
    return parseSvgViewBox(parsedData?.viewBox);
  }, [parsedData?.viewBox]);

  // Filter overlay components based on current viewMode, side filter, and search
  const visibleOverlayComponents = useMemo(() => {
    if (!showPnpOverlay || allMatchedComponents.length === 0) {
      return [];
    }

    let filtered = allMatchedComponents;

    if (viewMode === 'top') {
      filtered = filtered.filter((c) => c.side === 'top' || c.side === 'unknown');
    } else if (viewMode === 'bottom') {
      filtered = filtered.filter((c) => c.side === 'bottom');
    } else {
      // viewMode === 'layers'
      if (pnpSideFilter !== 'all') {
        filtered = filterComponentsBySide(filtered, pnpSideFilter);
      }
    }

    if (pnpSearchQuery.trim()) {
      filtered = searchComponents(filtered, pnpSearchQuery);
    }

    return filtered;
  }, [allMatchedComponents, showPnpOverlay, viewMode, pnpSideFilter, pnpSearchQuery]);

  // Filter components in inspector tab
  const tabFilteredComponents = useMemo(() => {
    let comps = allMatchedComponents;
    if (pnpSideFilter !== 'all') {
      comps = filterComponentsBySide(comps, pnpSideFilter);
    }
    if (pnpSearchQuery.trim()) {
      comps = searchComponents(comps, pnpSearchQuery);
    }
    return comps;
  }, [allMatchedComponents, pnpSideFilter, pnpSearchQuery]);

  // Filter BOM rows in inspector tab
  const filteredBomRows = useMemo(() => {
    if (!bomSearchQuery.trim()) {
      return effectiveBomRows;
    }
    const q = bomSearchQuery.trim().toLowerCase();
    return effectiveBomRows.filter((r) => {
      if (r.designators.some((d) => d.toLowerCase().includes(q))) return true;
      if (r.mpn && r.mpn.toLowerCase().includes(q)) return true;
      if (r.value && r.value.toLowerCase().includes(q)) return true;
      if (r.footprint && r.footprint.toLowerCase().includes(q)) return true;
      if (r.manufacturer && r.manufacturer.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [effectiveBomRows, bomSearchQuery]);

  // Center pan/zoom on specific board coordinates
  const centerCanvasOnCoords = (boardX: number, boardY: number) => {
    if (!viewBoxBounds) {
      return;
    }

    const svgY = -boardY;
    let svgX = boardX;
    if (viewMode === 'bottom') {
      svgX = 2 * viewBoxBounds.minX + viewBoxBounds.width - boardX;
    }

    const centerX = viewBoxBounds.minX + viewBoxBounds.width / 2;
    const centerY = viewBoxBounds.minY + viewBoxBounds.height / 2;

    const containerW = canvasContainerRef.current?.clientWidth || 700;
    const containerH = canvasContainerRef.current?.clientHeight || 560;

    const boardPxW = containerW * 0.9;
    const boardPxH = containerH * 0.9;
    const fitScale = Math.min(boardPxW / viewBoxBounds.width, boardPxH / viewBoxBounds.height);

    const targetZoom = Math.max(zoom, 1.8);
    setZoom(targetZoom);

    const panX = -(svgX - centerX) * fitScale * targetZoom;
    const panY = -(svgY - centerY) * fitScale * targetZoom;

    setPan({
      x: Number(panX.toFixed(2)),
      y: Number(panY.toFixed(2)),
    });
  };

  // Selection handlers
  const handleSelectComponent = (comp: PnpOverlayComponent) => {
    setSelectedDesignator(comp.designator);
    setSelectedDesignators(new Set([comp.designator.toUpperCase()]));
    setSelectedBomRow(comp.bomRow);
    setInspectorTab('bom');
    centerCanvasOnCoords(comp.x, comp.y);
  };

  const handleSelectBomRow = (row: ParsedBomRow) => {
    setSelectedBomRow(row);
    const desSet = new Set(row.designators.map((d) => d.trim().toUpperCase()));
    setSelectedDesignators(desSet);
    setSelectedDesignator(row.designators[0] ?? null);

    const matchingComps = findComponentsForBomRow(row, allMatchedComponents);
    if (matchingComps.length > 0) {
      const avgX = matchingComps.reduce((acc, c) => acc + c.x, 0) / matchingComps.length;
      const avgY = matchingComps.reduce((acc, c) => acc + c.y, 0) / matchingComps.length;
      centerCanvasOnCoords(avgX, avgY);
    }
  };

  const handleClearSelection = () => {
    setSelectedDesignator(null);
    setSelectedDesignators(new Set());
    setSelectedBomRow(null);
  };

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
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
      );
    }

    if (viewMode === 'bottom' && parsedData.bottomBoardSvg) {
      return (
        <div
          dangerouslySetInnerHTML={{ __html: sanitizeSvg(parsedData.bottomBoardSvg) }}
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />
      );
    }

    // Layer stack mode
    const visibleLayers = layers.filter((l) => l.visible);

    if (visibleLayers.length === 0) {
      return (
        <div
          style={{
            textAlign: 'center',
            color: tokens.colors.textSecondary,
            padding: tokens.spacing.xl,
          }}
        >
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

  const selectedComponentDetails = useMemo(() => {
    if (!selectedDesignator) {
      return null;
    }
    return (
      allMatchedComponents.find(
        (c) => c.designator.toUpperCase() === selectedDesignator.toUpperCase(),
      ) ?? null
    );
  }, [allMatchedComponents, selectedDesignator]);

  const renderViewerBody = () => (
    <>
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
          {onClose && (
            <div style={{ textAlign: 'right' }}>
              <Button onClick={onClose}>{t('common.close')}</Button>
            </div>
          )}
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
            {/* View Mode & PnP Overlay Controls */}
            <div className="revlog-inline-row" style={{ gap: tokens.spacing.md }}>
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

              {allMatchedComponents.length > 0 && (
                <div className="revlog-inline-row" style={{ gap: tokens.spacing.xs }}>
                  <Switch
                    size="small"
                    checked={showPnpOverlay}
                    onChange={setShowPnpOverlay}
                    aria-label={t('gerber.pnpOverlayToggle')}
                  />
                  <Typography.Text>{t('gerber.pnpOverlayToggle')}</Typography.Text>
                  <span className="revlog-count-pill">{allMatchedComponents.length}</span>

                  {showPnpOverlay && (
                    <>
                      <Input
                        placeholder={t('gerber.pnpSearchPlaceholder')}
                        value={pnpSearchQuery}
                        onChange={(e) => setPnpSearchQuery(e.target.value)}
                        size="small"
                        style={{ width: 170 }}
                        allowClear
                        prefix={<SearchOutlined aria-hidden="true" />}
                        aria-label={t('gerber.pnpSearchPlaceholder')}
                      />
                      <Segmented
                        size="small"
                        value={pnpSideFilter}
                        onChange={(v) => setPnpSideFilter(v as 'all' | 'top' | 'bottom')}
                        options={[
                          { value: 'all', label: t('gerber.pnpSideAll') },
                          { value: 'top', label: t('gerber.pnpSideTop') },
                          { value: 'bottom', label: t('gerber.pnpSideBottom') },
                        ]}
                      />
                    </>
                  )}
                </div>
              )}
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
                ref={canvasContainerRef}
                style={{
                  width: '90%',
                  height: '90%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.08s ease-out',
                  position: 'relative',
                }}
              >
                {activeSvgContent}

                {/* SVG Overlay Layer for PnP Components */}
                {showPnpOverlay && parsedData?.viewBox && visibleOverlayComponents.length > 0 && (
                  <svg
                    viewBox={parsedData.viewBox}
                    preserveAspectRatio="xMidYMid meet"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      overflow: 'visible',
                    }}
                    data-testid="pnp-overlay-svg"
                  >
                    {visibleOverlayComponents.map((comp) => {
                      const isSelected = selectedDesignators.has(comp.designator.toUpperCase());
                      const isHovered = hoveredDesignator === comp.designator;
                      const transform = getComponentSvgTransform(comp, viewMode, viewBoxBounds);

                      const textFontSize = Math.max(
                        0.3,
                        Math.min(
                          (comp.widthMm * 0.75) / Math.max(comp.designator.length * 0.55, 1),
                          comp.heightMm * 0.65,
                        ),
                      );

                      return (
                        <g
                          key={`${comp.designator}-${comp.x}-${comp.y}`}
                          transform={transform}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectComponent(comp);
                          }}
                          onMouseEnter={() => setHoveredDesignator(comp.designator)}
                          onMouseLeave={() => setHoveredDesignator(null)}
                          style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                          data-testid={`pnp-component-${comp.designator}`}
                          aria-label={`${comp.designator}: ${comp.value}`}
                        >
                          <title>
                            {`${comp.designator}: ${comp.value || '-'}${comp.footprint ? ` (${comp.footprint})` : ''}${comp.bomRow?.mpn ? ` · ${comp.bomRow.mpn}` : ''}`}
                          </title>
                          <rect
                            x={-comp.widthMm / 2}
                            y={-comp.heightMm / 2}
                            width={comp.widthMm}
                            height={comp.heightMm}
                            rx={Math.min(comp.widthMm, comp.heightMm) * 0.15}
                            ry={Math.min(comp.widthMm, comp.heightMm) * 0.15}
                            fill={
                              isSelected
                                ? PNP_OVERLAY_THEME.selectedBg
                                : PNP_OVERLAY_THEME.componentBg
                            }
                            stroke={
                              isSelected
                                ? PNP_OVERLAY_THEME.selectedBorder
                                : isHovered
                                  ? PNP_OVERLAY_THEME.hoverBorder
                                  : PNP_OVERLAY_THEME.componentBorder
                            }
                            strokeWidth={
                              isSelected
                                ? Math.max(0.14, Math.min(comp.widthMm, comp.heightMm) * 0.08)
                                : Math.max(0.08, Math.min(comp.widthMm, comp.heightMm) * 0.04)
                            }
                          />
                          <circle
                            cx={comp.pin1X}
                            cy={comp.pin1Y}
                            r={Math.max(0.12, Math.min(comp.widthMm, comp.heightMm) * 0.12)}
                            fill={PNP_OVERLAY_THEME.pin1Marker}
                          />
                          <text
                            x={0}
                            y={0}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill={PNP_OVERLAY_THEME.textColor}
                            stroke="none"
                            fontSize={textFontSize}
                            style={{
                              pointerEvents: 'none',
                              userSelect: 'none',
                              fontWeight: 600,
                            }}
                          >
                            {comp.designator}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
            </div>

            {/* Inspector Sidebar Panel: Layers, Components, BOM */}
            <div
              style={{
                width: 360,
                borderLeft: `1px solid ${tokens.colors.border}`,
                backgroundColor: tokens.colors.surface,
                display: 'flex',
                flexDirection: 'column',
                height: 580,
              }}
            >
              <div
                style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              >
                <Tabs
                  activeKey={inspectorTab}
                  onChange={(k) => setInspectorTab(k as 'layers' | 'components' | 'bom')}
                  tabBarStyle={{ padding: `0 ${tokens.spacing.sm}`, marginBottom: 0 }}
                  items={[
                    {
                      key: 'layers',
                      label: `${t('gerber.tabs.layers')} (${layers.length})`,
                      children: (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            overflow: 'hidden',
                          }}
                        >
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
                                <div
                                  className="revlog-inline-row"
                                  style={{ flex: 1, minWidth: 0, gap: 8 }}
                                >
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
                      ),
                    },
                    ...(allMatchedComponents.length > 0
                      ? [
                          {
                            key: 'components',
                            label: `${t('gerber.tabs.components')} (${allMatchedComponents.length})`,
                            children: (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  height: '100%',
                                  overflow: 'hidden',
                                  padding: tokens.spacing.xs,
                                }}
                              >
                                <Input
                                  size="small"
                                  placeholder={t('gerber.pnpSearchPlaceholder')}
                                  value={pnpSearchQuery}
                                  onChange={(e) => setPnpSearchQuery(e.target.value)}
                                  allowClear
                                  prefix={<SearchOutlined aria-hidden="true" />}
                                  style={{ marginBottom: tokens.spacing.xs }}
                                  aria-label={t('gerber.pnpSearchPlaceholder')}
                                />
                                <Segmented
                                  size="small"
                                  value={pnpSideFilter}
                                  onChange={(v) => setPnpSideFilter(v as 'all' | 'top' | 'bottom')}
                                  options={[
                                    { value: 'all', label: t('gerber.pnpSideAll') },
                                    { value: 'top', label: t('gerber.pnpSideTop') },
                                    { value: 'bottom', label: t('gerber.pnpSideBottom') },
                                  ]}
                                  block
                                  style={{ marginBottom: tokens.spacing.xs }}
                                />

                                <div
                                  role="list"
                                  aria-label={t('gerber.tabs.components')}
                                  style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4,
                                  }}
                                >
                                  {tabFilteredComponents.length === 0 ? (
                                    <Empty
                                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                                      description={t('gerber.noComponentsFound')}
                                    />
                                  ) : (
                                    tabFilteredComponents.map((comp) => {
                                      const isSelected = selectedDesignators.has(
                                        comp.designator.toUpperCase(),
                                      );
                                      return (
                                        <div
                                          key={`${comp.designator}-${comp.x}-${comp.y}`}
                                          role="listitem"
                                          tabIndex={0}
                                          onClick={() => handleSelectComponent(comp)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              handleSelectComponent(comp);
                                            }
                                          }}
                                          style={{
                                            padding: '6px 8px',
                                            borderRadius: tokens.radius.sm,
                                            backgroundColor: isSelected
                                              ? tokens.colors.surfaceSelected
                                              : tokens.colors.surfaceSubtle,
                                            border: `1px solid ${
                                              isSelected ? tokens.colors.accent : 'transparent'
                                            }`,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 2,
                                          }}
                                          data-testid={`pnp-list-item-${comp.designator}`}
                                        >
                                          <div
                                            className="revlog-inline-row"
                                            style={{ justifyContent: 'space-between' }}
                                          >
                                            <div
                                              className="revlog-inline-row"
                                              style={{ gap: tokens.spacing.xs }}
                                            >
                                              <Typography.Text strong>
                                                {comp.designator}
                                              </Typography.Text>
                                              <Tag
                                                bordered
                                                style={{
                                                  textTransform: 'capitalize',
                                                  margin: 0,
                                                  padding: '0 4px',
                                                  lineHeight: '18px',
                                                }}
                                              >
                                                {comp.side}
                                              </Tag>
                                            </div>
                                            <Typography.Text
                                              type="secondary"
                                              ellipsis
                                              style={{ maxWidth: 140 }}
                                            >
                                              {comp.value}
                                            </Typography.Text>
                                          </div>
                                          <div
                                            className="revlog-inline-row"
                                            style={{ justifyContent: 'space-between' }}
                                          >
                                            <Typography.Text
                                              type="secondary"
                                              style={{ color: tokens.colors.textSecondary }}
                                            >
                                              {comp.footprint || '-'}
                                            </Typography.Text>
                                            {comp.bomRow?.mpn && (
                                              <Typography.Text ellipsis style={{ maxWidth: 160 }}>
                                                {comp.bomRow.mpn}
                                              </Typography.Text>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            ),
                          },
                        ]
                      : []),
                    ...(effectiveBomRows.length > 0
                      ? [
                          {
                            key: 'bom',
                            label: `${t('gerber.tabs.bom')} (${effectiveBomRows.length})`,
                            children: (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  height: '100%',
                                  overflow: 'hidden',
                                  padding: tokens.spacing.xs,
                                }}
                              >
                                <Input
                                  size="small"
                                  placeholder={t('compare.searchBomPlaceholder')}
                                  value={bomSearchQuery}
                                  onChange={(e) => setBomSearchQuery(e.target.value)}
                                  allowClear
                                  prefix={<SearchOutlined aria-hidden="true" />}
                                  style={{ marginBottom: tokens.spacing.xs }}
                                  aria-label={t('compare.searchBomPlaceholder')}
                                />

                                <div
                                  role="list"
                                  aria-label={t('gerber.tabs.bom')}
                                  style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4,
                                  }}
                                >
                                  {filteredBomRows.length === 0 ? (
                                    <Empty
                                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                                      description={t('gerber.noBomRowsFound')}
                                    />
                                  ) : (
                                    filteredBomRows.map((row) => {
                                      const isSelected =
                                        selectedBomRow === row ||
                                        (selectedDesignator !== null &&
                                          row.designators.some(
                                            (d) =>
                                              d.toUpperCase() === selectedDesignator?.toUpperCase(),
                                          ));
                                      return (
                                        <div
                                          key={row.rowNumber}
                                          role="listitem"
                                          tabIndex={0}
                                          onClick={() => handleSelectBomRow(row)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              handleSelectBomRow(row);
                                            }
                                          }}
                                          style={{
                                            padding: '6px 8px',
                                            borderRadius: tokens.radius.sm,
                                            backgroundColor: isSelected
                                              ? tokens.colors.surfaceSelected
                                              : tokens.colors.surfaceSubtle,
                                            border: `1px solid ${
                                              isSelected ? tokens.colors.accent : 'transparent'
                                            }`,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 2,
                                          }}
                                          data-testid={`bom-list-item-${row.rowNumber}`}
                                        >
                                          <div
                                            className="revlog-inline-row"
                                            style={{ justifyContent: 'space-between' }}
                                          >
                                            <Typography.Text
                                              strong
                                              ellipsis
                                              style={{ maxWidth: 220 }}
                                            >
                                              {row.designators.join(', ') || '-'}
                                            </Typography.Text>
                                            <span className="revlog-count-pill">
                                              {row.quantity ?? row.designators.length}
                                            </span>
                                          </div>
                                          <div
                                            className="revlog-inline-row"
                                            style={{ justifyContent: 'space-between' }}
                                          >
                                            <Typography.Text
                                              type="secondary"
                                              ellipsis
                                              style={{ maxWidth: 200 }}
                                            >
                                              {row.mpn || row.value || '-'}
                                            </Typography.Text>
                                            {row.dnp ? (
                                              <Tag
                                                bordered
                                                style={{
                                                  margin: 0,
                                                  lineHeight: '18px',
                                                  padding: '0 4px',
                                                  backgroundColor: tokens.colors.draftBg,
                                                  borderColor: tokens.colors.draftBorder,
                                                  color: tokens.colors.draftText,
                                                }}
                                              >
                                                DNP
                                              </Tag>
                                            ) : (
                                              <Tag
                                                bordered
                                                style={{
                                                  margin: 0,
                                                  lineHeight: '18px',
                                                  padding: '0 4px',
                                                  backgroundColor: tokens.colors.publishedBg,
                                                  borderColor: tokens.colors.publishedBorder,
                                                  color: tokens.colors.publishedText,
                                                }}
                                              >
                                                Fitted
                                              </Tag>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            ),
                          },
                        ]
                      : []),
                  ]}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                />
              </div>

              {/* Selection Inspector Footer Card */}
              {(selectedDesignator || selectedBomRow) && (
                <div
                  style={{
                    padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
                    borderTop: `1px solid ${tokens.colors.border}`,
                    backgroundColor: tokens.colors.surfaceSubtle,
                  }}
                  data-testid="pnp-inspector-card"
                >
                  <div
                    className="revlog-inline-row"
                    style={{ justifyContent: 'space-between', marginBottom: 2 }}
                  >
                    <Typography.Text strong>
                      {selectedDesignator
                        ? `${t('gerber.selectedComponent')}: ${selectedDesignator}`
                        : t('gerber.selectedBomPart')}
                    </Typography.Text>
                    <Button size="small" type="text" onClick={handleClearSelection}>
                      {t('gerber.clearSelection')}
                    </Button>
                  </div>
                  {selectedComponentDetails && (
                    <div style={{ color: tokens.colors.textSecondary, marginBottom: 2 }}>
                      {t('gerber.componentPosition')}: X {selectedComponentDetails.x.toFixed(2)} mm,
                      Y {selectedComponentDetails.y.toFixed(2)} mm (
                      {selectedComponentDetails.rotation}° {selectedComponentDetails.side})
                    </div>
                  )}
                  {selectedBomRow && (
                    <div style={{ color: tokens.colors.textSecondary }}>
                      {selectedBomRow.mpn ? `${selectedBomRow.mpn} · ` : ''}
                      {selectedBomRow.value || selectedBomRow.footprint || ''}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (inline) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height }}>
        {renderViewerBody()}
      </div>
    );
  }

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
          {allMatchedComponents.length > 0 && (
            <span className="revlog-count-pill">
              {t('gerber.pnpComponentsCount', { count: allMatchedComponents.length })}
            </span>
          )}
        </div>
      }
      width={1120}
      footer={null}
      destroyOnHidden
      onCancel={onClose}
      afterClose={() => {
        setParsedData(null);
        setLayers([]);
        setErrorMessage(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setFetchedBomRows([]);
        setFetchedPnpRows([]);
        setSelectedDesignator(null);
        setSelectedDesignators(new Set());
        setSelectedBomRow(null);
        setPnpSearchQuery('');
        setBomSearchQuery('');
        setInspectorTab('layers');
      }}
      styles={{
        body: { padding: 0 },
      }}
    >
      {renderViewerBody()}
    </Modal>
  );
};
