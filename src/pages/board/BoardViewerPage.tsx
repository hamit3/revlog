import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslate } from '@refinedev/core';
import { PageHeader } from '@refinedev/antd';
import {
  Alert,
  Button,
  Card,
  Empty,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from 'antd';
import {
  BoxPlotOutlined,
  DeleteOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  InboxOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { unzipSync } from 'fflate';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { GerberViewerModal } from '../../components/gerber/GerberViewerModal';
import { ThreeViewer } from '../../components/three/ThreeViewer';
import {
  extractFilesFromZip,
  isAnyGerberItem,
  isGerberArchiveFileName,
  isGerberFileName,
} from '../../lib/gerber';
import { is3DModelFileName } from '../../lib/model3d';
import {
  evaluateBomPnpCsvTexts,
  isLikelyBomName,
  isLikelyPnpName,
} from '../../lib/bomPnp';
import { useProductAccess, useProjectAccess } from '../../lib/useProjectAccess';
import { supabaseClient } from '../../providers/supabaseClient';
import { tokens } from '../../theme/tokens';
import type {
  Item,
  ParsedBomRow,
  ParsedPnpRow,
  Product,
  Release,
  ReleaseItem,
} from '../../types/database';

export const BoardViewerPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId, productId } = useParams<{ projectId: string; productId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Source selection: from release or upload local external file
  const [sourceMode, setSourceMode] = useState<'release' | 'upload'>('release');

  // View type selection: 2D Gerber & PnP layer view vs 3D model view
  const [viewType, setViewType] = useState<'2d' | '3d'>('2d');
  const [selected3DFileName, setSelected3DFileName] = useState<string | undefined>(undefined);

  // External file upload states
  const [localGerberFiles, setLocalGerberFiles] = useState<{ name: string; content: string }[]>([]);
  const [local3DFiles, setLocal3DFiles] = useState<{ name: string; buffer: ArrayBuffer }[]>([]);
  const [localBomRows, setLocalBomRows] = useState<ParsedBomRow[]>([]);
  const [localPnpRows, setLocalPnpRows] = useState<ParsedPnpRow[]>([]);
  const [localArchiveName, setLocalArchiveName] = useState<string>('');
  const [isProcessingUpload, setIsProcessingUpload] = useState<boolean>(false);
  const extraPnpInputRef = useRef<HTMLInputElement>(null);
  const extraBomInputRef = useRef<HTMLInputElement>(null);
  const extra3DInputRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [effectiveProductId, setEffectiveProductId] = useState<string | undefined>(productId);

  const { project, product } = useProductAccess(projectId, effectiveProductId);
  const { project: fallbackProject } = useProjectAccess(projectId);

  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | undefined>(
    searchParams.get('releaseId') ?? undefined,
  );

  const [productItems, setProductItems] = useState<Item[]>([]);
  const [releaseItemsFromDb, setReleaseItemsFromDb] = useState<
    { fileName: string; storagePath: string }[]
  >([]);
  const [release3DItemsFromDb, setRelease3DItemsFromDb] = useState<
    { fileName: string; storagePath: string }[]
  >([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Set document title
  useEffect(() => {
    document.title = `${t('nav.boardViewer')}${product?.name ? ` - ${product.name}` : ''} | ${t('app.name')}`;
  }, [product?.name, t]);

  // Load products of project
  useEffect(() => {
    if (!projectId) {
      return;
    }
    let active = true;
    void (async () => {
      const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('project_id', projectId)
        .eq('archived', false)
        .order('position', { ascending: true });

      if (!active) {
        return;
      }
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      const list = (data as Product[]) ?? [];
      setProducts(list);
      if (!productId && list.length > 0 && !effectiveProductId) {
        setEffectiveProductId(list[0]?.id);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, productId, effectiveProductId]);

  // Load releases and product items for effective product
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !effectiveProductId) {
        if (active) {
          setIsLoading(false);
        }
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);

      const [relRes, itemRes] = await Promise.all([
        supabaseClient
          .from('releases')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', effectiveProductId)
          .order('created_at', { ascending: false }),
        supabaseClient
          .from('items')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', effectiveProductId)
          .eq('archived', false)
          .eq('kind', 'file')
          .order('created_at', { ascending: false }),
      ]);

      if (!active) {
        return;
      }

      if (relRes.error || itemRes.error) {
        setErrorMessage(relRes.error?.message ?? itemRes.error?.message ?? t('common.errorPrefix'));
        setIsLoading(false);
        return;
      }

      const relList = (relRes.data as Release[]) ?? [];
      const itmList = (itemRes.data as Item[]) ?? [];
      setReleases(relList);
      setProductItems(itmList);

      // Default selected release to latest release
      if (!selectedReleaseId && relList.length > 0) {
        setSelectedReleaseId(relList[0]?.id);
      }

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, effectiveProductId, t, selectedReleaseId]);

  const selectedRelease = useMemo(() => {
    if (!selectedReleaseId) {
      return null;
    }
    return releases.find((r) => r.id === selectedReleaseId) ?? null;
  }, [releases, selectedReleaseId]);

  const productGerberItems = useMemo(() => {
    return productItems
      .filter((i) => isAnyGerberItem(i.file_name) && i.storage_path && i.file_name)
      .map((i) => ({ fileName: i.file_name!, storagePath: i.storage_path! }));
  }, [productItems]);

  const effectiveGerberItems = useMemo(() => {
    return selectedRelease ? releaseItemsFromDb : productGerberItems;
  }, [selectedRelease, releaseItemsFromDb, productGerberItems]);

  const product3DItems = useMemo(() => {
    return productItems
      .filter((i) => is3DModelFileName(i.file_name) && i.storage_path && i.file_name)
      .map((i) => ({ fileName: i.file_name!, storagePath: i.storage_path! }));
  }, [productItems]);

  const effective3DItems = useMemo(() => {
    return selectedRelease ? release3DItemsFromDb : product3DItems;
  }, [selectedRelease, release3DItemsFromDb, product3DItems]);

  const active3DItem = useMemo(() => {
    if (effective3DItems.length === 0) {
      return null;
    }
    if (selected3DFileName) {
      const match = effective3DItems.find((i) => i.fileName === selected3DFileName);
      if (match) {
        return match;
      }
    }
    return effective3DItems[0] ?? null;
  }, [effective3DItems, selected3DFileName]);

  const activeLocal3D = useMemo(() => {
    if (local3DFiles.length === 0) {
      return null;
    }
    if (selected3DFileName) {
      const match = local3DFiles.find((f) => f.name === selected3DFileName);
      if (match) {
        return match;
      }
    }
    return local3DFiles[0] ?? null;
  }, [local3DFiles, selected3DFileName]);

  // Load Gerber and 3D files available for the selected release
  useEffect(() => {
    if (!selectedRelease) {
      return;
    }

    let active = true;
    void (async () => {
      const { data, error } = await supabaseClient
        .from('release_items')
        .select('*')
        .eq('release_id', selectedRelease.id);

      if (!active) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      const allItems = ((data as ReleaseItem[]) ?? [])
        .filter((ri) => ri.storage_path && ri.file_name);

      const gerbers = allItems
        .filter((ri) => isAnyGerberItem(ri.file_name))
        .map((ri) => ({ fileName: ri.file_name!, storagePath: ri.storage_path! }));

      const models3d = allItems
        .filter((ri) => is3DModelFileName(ri.file_name))
        .map((ri) => ({ fileName: ri.file_name!, storagePath: ri.storage_path! }));

      setReleaseItemsFromDb(gerbers);
      setRelease3DItemsFromDb(models3d);
    })();

    return () => {
      active = false;
    };
  }, [selectedRelease]);

  // Handle external file upload processing
  const handleProcessUploadedFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setIsProcessingUpload(true);
    setErrorMessage(null);

    try {
      const collectedGerbers: { name: string; content: string }[] = [];
      const collected3DFiles: { name: string; buffer: ArrayBuffer }[] = [];
      let detectedBomText = '';
      let detectedPnpText = '';
      let mainName = '';

      for (const file of files) {
        if (isGerberArchiveFileName(file.name)) {
          mainName = file.name;
          const arrayBuf = await file.arrayBuffer();
          const zipBytes = new Uint8Array(arrayBuf);

          // Extract Gerbers
          const extracted = extractFilesFromZip(zipBytes);
          collectedGerbers.push(...extracted);

          // Check if zip also contains BOM, PnP CSVs, or 3D models
          try {
            const unzipped = unzipSync(zipBytes);
            const decoder = new TextDecoder('utf-8', { fatal: false });
            for (const [path, data] of Object.entries(unzipped)) {
              if (path.endsWith('/') || data.length === 0) {
                continue;
              }
              const basename = path.split('/').pop() ?? path;
              const lower = basename.toLowerCase();
              if (is3DModelFileName(basename)) {
                collected3DFiles.push({
                  name: basename,
                  buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
                });
              } else if (lower.endsWith('.csv') || lower.endsWith('.pos') || lower.endsWith('.txt')) {
                const text = decoder.decode(data);
                if (isLikelyPnpName(basename)) {
                  detectedPnpText = text;
                } else if (isLikelyBomName(basename)) {
                  detectedBomText = text;
                }
              }
            }
          } catch {
            // Ignore errors in supplementary extraction from zip
          }
        } else if (is3DModelFileName(file.name)) {
          if (!mainName) {
            mainName = file.name;
          }
          const buf = await file.arrayBuffer();
          collected3DFiles.push({ name: file.name, buffer: buf });
        } else if (isGerberFileName(file.name)) {
          if (!mainName) {
            mainName = file.name;
          }
          const text = await file.text();
          collectedGerbers.push({ name: file.name, content: text });
        } else {
          const lower = file.name.toLowerCase();
          if (lower.endsWith('.csv') || lower.endsWith('.pos') || lower.endsWith('.txt')) {
            const text = await file.text();
            if (isLikelyPnpName(file.name)) {
              detectedPnpText = text;
            } else if (isLikelyBomName(file.name)) {
              detectedBomText = text;
            } else if (!detectedBomText) {
              detectedBomText = text;
            } else if (!detectedPnpText) {
              detectedPnpText = text;
            }
          }
        }
      }

      if (collectedGerbers.length === 0 && collected3DFiles.length === 0) {
        setErrorMessage(t('boardViewer.noGerberInUpload'));
        setIsProcessingUpload(false);
        return;
      }

      if (collected3DFiles.length > 0) {
        setLocal3DFiles((prev) => [...prev, ...collected3DFiles]);
        setSelected3DFileName(collected3DFiles[0]?.name);
        if (collectedGerbers.length === 0) {
          setViewType('3d');
        }
      }

      if (collectedGerbers.length > 0) {
        setLocalGerberFiles(collectedGerbers);
        setLocalArchiveName(mainName);
      }

      // Evaluate BOM / PnP if found
      if (detectedBomText || detectedPnpText) {
        const evalResult = evaluateBomPnpCsvTexts({
          bomText: detectedBomText || null,
          pnpText: detectedPnpText || null,
        });
        setLocalBomRows(evalResult.parsedBom);
        setLocalPnpRows(evalResult.parsedPnp);
      } else {
        setLocalBomRows([]);
        setLocalPnpRows([]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsProcessingUpload(false);
    }
  };

  // Add supplementary 3D file to local viewer
  const handleAddExtra3DFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      setLocal3DFiles((prev) => [
        ...prev.filter((f) => f.name !== file.name),
        { name: file.name, buffer: buf },
      ]);
      setSelected3DFileName(file.name);
      setViewType('3d');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  // Add supplementary PnP file to local viewer
  const handleAddExtraPnpFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const evalResult = evaluateBomPnpCsvTexts({
        pnpText: text,
      });
      if (evalResult.parsedPnp.length > 0) {
        setLocalPnpRows(evalResult.parsedPnp);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  // Add supplementary BOM file to local viewer
  const handleAddExtraBomFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const evalResult = evaluateBomPnpCsvTexts({
        bomText: text,
      });
      if (evalResult.parsedBom.length > 0) {
        setLocalBomRows(evalResult.parsedBom);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClearLocalFiles = () => {
    setLocalGerberFiles([]);
    setLocal3DFiles([]);
    setLocalBomRows([]);
    setLocalPnpRows([]);
    setLocalArchiveName('');
    setSelected3DFileName(undefined);
    setErrorMessage(null);
  };

  const effectiveProject = project || fallbackProject;
  if (!effectiveProject) {
    return <Alert type="error" showIcon message={t('projects.notFound')} />;
  }

  return (
    <PageHeader
      title={
        <PageHeaderTitle
          title={t('nav.boardViewer')}
          subtitle={t('boardViewer.pageSubtitle')}
        />
      }
    >
      {errorMessage && (
        <Alert
          type="error"
          showIcon
          closable
          message={errorMessage}
          style={{ marginBottom: tokens.spacing.md }}
          onClose={() => setErrorMessage(null)}
        />
      )}

      {/* Selectors Toolbar Card */}
      <Card
        size="small"
        style={{ marginBottom: tokens.spacing.md }}
        bodyStyle={{ padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px` }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: tokens.spacing.md,
            flexWrap: 'wrap',
          }}
        >
          {/* Left Controls: Source Switcher + View Type + Contextual Selectors */}
          <Space size="middle" align="center" wrap>
            {/* Source Switcher: Releases vs Upload */}
            <Segmented
              value={sourceMode}
              onChange={(val) => {
                setSourceMode(val as 'release' | 'upload');
                setErrorMessage(null);
              }}
              options={[
                {
                  value: 'release',
                  label: t('boardViewer.sourceFromRelease'),
                  icon: <HistoryOutlined aria-hidden="true" />,
                },
                {
                  value: 'upload',
                  label: t('boardViewer.sourceUploadExternal'),
                  icon: <UploadOutlined aria-hidden="true" />,
                },
              ]}
            />

            <div
              style={{
                width: 1,
                height: 20,
                backgroundColor: tokens.colors.border,
              }}
              aria-hidden="true"
            />

            {/* View Type Switcher: 2D Layers vs 3D View */}
            <Segmented
              value={viewType}
              onChange={(val) => {
                setViewType(val as '2d' | '3d');
              }}
              options={[
                {
                  value: '2d',
                  label: t('viewer3d.view2d'),
                  icon: <FileSearchOutlined aria-hidden="true" />,
                },
                {
                  value: '3d',
                  label: t('viewer3d.view3d'),
                  icon: <BoxPlotOutlined aria-hidden="true" />,
                },
              ]}
            />

            <div
              style={{
                width: 1,
                height: 20,
                backgroundColor: tokens.colors.border,
              }}
              aria-hidden="true"
            />

            {/* Release Mode Selectors */}
            {sourceMode === 'release' && (
              <Space size="middle" align="center" wrap>
                {!productId && products.length > 0 && (
                  <Space size={tokens.spacing.xs} align="center">
                    <Typography.Text type="secondary">
                      {t('nav.product')}:
                    </Typography.Text>
                    <Select
                      value={effectiveProductId}
                      style={{ minWidth: 180 }}
                      options={products.map((p) => ({ label: p.name, value: p.id }))}
                      onChange={(val) => {
                        setEffectiveProductId(val);
                        setSelectedReleaseId(undefined);
                      }}
                    />
                  </Space>
                )}

                <Space size={tokens.spacing.xs} align="center">
                  <Typography.Text type="secondary">
                    {t('boardViewer.selectRelease')}:
                  </Typography.Text>
                  <Select
                    value={selectedReleaseId}
                    style={{ minWidth: 240 }}
                    placeholder={t('boardViewer.chooseReleasePlaceholder')}
                    options={releases.map((r) => ({
                      label: `${r.version_label} (${t(`releases.status.${r.status}`)})`,
                      value: r.id,
                    }))}
                    onChange={(val) => {
                      setSelectedReleaseId(val);
                      setSearchParams({ releaseId: val });
                    }}
                  />
                </Space>

                {/* Optional 3D Model Picker when multiple 3D models exist in the release */}
                {viewType === '3d' && effective3DItems.length > 1 && (
                  <Space size={tokens.spacing.xs} align="center">
                    <Typography.Text type="secondary">
                      {t('viewer3d.selectModel')}:
                    </Typography.Text>
                    <Select
                      value={active3DItem?.fileName}
                      style={{ minWidth: 200 }}
                      options={effective3DItems.map((item) => ({
                        label: item.fileName,
                        value: item.fileName,
                      }))}
                      onChange={(val) => setSelected3DFileName(val)}
                    />
                  </Space>
                )}
              </Space>
            )}

            {/* External Upload Status Badges and 3D Selector */}
            {sourceMode === 'upload' && (localGerberFiles.length > 0 || local3DFiles.length > 0) && (
              <Space size={tokens.spacing.xs} align="center" wrap>
                {localArchiveName && <Tag bordered>{localArchiveName}</Tag>}
                {localGerberFiles.length > 0 && (
                  <span className="revlog-count-pill">
                    {t('boardViewer.loadedLayersCount', { count: localGerberFiles.length })}
                  </span>
                )}
                {local3DFiles.length > 0 && (
                  <span className="revlog-count-pill">
                    {t('boardViewer.loaded3dCount', { count: local3DFiles.length })}
                  </span>
                )}
                {localPnpRows.length > 0 && (
                  <span className="revlog-count-pill">
                    {t('boardViewer.loadedPnpCount', { count: localPnpRows.length })}
                  </span>
                )}
                {localBomRows.length > 0 && (
                  <span className="revlog-count-pill">
                    {t('boardViewer.loadedBomRowsCount', { count: localBomRows.length })}
                  </span>
                )}

                {viewType === '3d' && local3DFiles.length > 1 && (
                  <Space size={tokens.spacing.xs} align="center" style={{ marginLeft: tokens.spacing.xs }}>
                    <Typography.Text type="secondary">
                      {t('viewer3d.selectModel')}:
                    </Typography.Text>
                    <Select
                      value={activeLocal3D?.name}
                      style={{ minWidth: 180 }}
                      options={local3DFiles.map((f) => ({
                        label: f.name,
                        value: f.name,
                      }))}
                      onChange={(val) => setSelected3DFileName(val)}
                    />
                  </Space>
                )}
              </Space>
            )}
          </Space>

          {/* Right Action Buttons */}
          <div>
            {sourceMode === 'release' && selectedRelease && (
              <Button
                icon={<HistoryOutlined aria-hidden="true" />}
                onClick={() => {
                  if (effectiveProductId) {
                    navigate(
                      `/projects/${projectId}/products/${effectiveProductId}/releases/${selectedRelease.id}`,
                    );
                  } else {
                    navigate(`/projects/${projectId}/releases/${selectedRelease.id}`);
                  }
                }}
              >
                {t('boardViewer.viewReleaseDetails')}
              </Button>
            )}

            {sourceMode === 'upload' && (localGerberFiles.length > 0 || local3DFiles.length > 0) && (
              <Space size="small" align="center">
                {/* Optional Supplementary 3D model upload */}
                <input
                  ref={extra3DInputRef}
                  type="file"
                  accept=".glb,.gltf,.stl"
                  style={{ display: 'none' }}
                  onChange={(e) => void handleAddExtra3DFile(e)}
                />
                <Button
                  size="small"
                  icon={<BoxPlotOutlined aria-hidden="true" />}
                  onClick={() => extra3DInputRef.current?.click()}
                >
                  {t('boardViewer.upload3dPrompt')}
                </Button>

                {/* Optional Supplementary PnP / BOM upload buttons */}
                <input
                  ref={extraPnpInputRef}
                  type="file"
                  accept=".csv,.pos,.txt"
                  style={{ display: 'none' }}
                  onChange={(e) => void handleAddExtraPnpFile(e)}
                />
                <Button
                  size="small"
                  icon={<UploadOutlined aria-hidden="true" />}
                  onClick={() => extraPnpInputRef.current?.click()}
                >
                  {t('boardViewer.uploadPnpPrompt')}
                </Button>

                <input
                  ref={extraBomInputRef}
                  type="file"
                  accept=".csv,.txt"
                  style={{ display: 'none' }}
                  onChange={(e) => void handleAddExtraBomFile(e)}
                />
                <Button
                  size="small"
                  icon={<UploadOutlined aria-hidden="true" />}
                  onClick={() => extraBomInputRef.current?.click()}
                >
                  {t('boardViewer.uploadBomPrompt')}
                </Button>

                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined aria-hidden="true" />}
                  onClick={handleClearLocalFiles}
                >
                  {t('boardViewer.clearFiles')}
                </Button>
              </Space>
            )}
          </div>
        </div>
      </Card>

      {/* Main Body: Mode-dependent */}
      {sourceMode === 'upload' ? (
        localGerberFiles.length === 0 && local3DFiles.length === 0 ? (
          <Card style={{ padding: tokens.spacing.xl, textAlign: 'center' }}>
            {isProcessingUpload ? (
              <div style={{ padding: tokens.spacing.xxl }}>
                <Spin />
                <div style={{ marginTop: tokens.spacing.md }}>
                  <Typography.Text type="secondary">{t('boardViewer.processingFiles')}</Typography.Text>
                </div>
              </div>
            ) : (
              <Upload.Dragger
                multiple
                accept=".zip,.gtl,.gbl,.gto,.gbo,.gts,.gbs,.gm1,.gm2,.gko,.edge,.drl,.xln,.exc,.nc,.drd,.gbr,.ger,.csv,.pos,.txt,.glb,.gltf,.stl"
                showUploadList={false}
                beforeUpload={(_file, fileList) => {
                  void handleProcessUploadedFiles(fileList as File[]);
                  return false;
                }}
                style={{ padding: tokens.spacing.xl }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ color: tokens.colors.accent }} />
                </p>
                <p className="ant-upload-text" style={{ fontWeight: 600, color: tokens.colors.textPrimary }}>
                  {t('boardViewer.uploadDraggerTitle')}
                </p>
                <p className="ant-upload-hint" style={{ color: tokens.colors.textSecondary, maxWidth: 540, margin: '0 auto' }}>
                  {t('boardViewer.uploadDraggerHint')}
                </p>
              </Upload.Dragger>
            )}
          </Card>
        ) : viewType === '2d' ? (
          localGerberFiles.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
              <Empty description={t('boardViewer.noGerberForRelease')}>
                <Button type="primary" onClick={() => setViewType('3d')}>
                  {t('viewer3d.view3d')}
                </Button>
              </Empty>
            </Card>
          ) : (
            <Card styles={{ body: { padding: 0 } }}>
              <GerberViewerModal
                key={localArchiveName || 'uploaded-files'}
                inline
                files={localGerberFiles}
                bomRows={localBomRows.length > 0 ? localBomRows : undefined}
                pnpRows={localPnpRows.length > 0 ? localPnpRows : undefined}
                title={localArchiveName || t('boardViewer.externalFilesTitle')}
                height={720}
              />
            </Card>
          )
        ) : !activeLocal3D ? (
          <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
            <Empty description={t('viewer3d.noModelsInUpload')}>
              <Button
                type="primary"
                icon={<UploadOutlined aria-hidden="true" />}
                onClick={() => extra3DInputRef.current?.click()}
              >
                {t('boardViewer.upload3dPrompt')}
              </Button>
            </Empty>
          </Card>
        ) : (
          <Card styles={{ body: { padding: 0 } }}>
            <ThreeViewer
              key={activeLocal3D.name}
              data={activeLocal3D.buffer}
              fileName={activeLocal3D.name}
              height={720}
            />
          </Card>
        )
      ) : isLoading ? (
        <Card style={{ textAlign: 'center', padding: tokens.spacing.xxl }}>
          <Spin />
          <div style={{ marginTop: tokens.spacing.sm }}>
            <Typography.Text type="secondary">{t('gerber.loading')}</Typography.Text>
          </div>
        </Card>
      ) : releases.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
          <Empty description={t('boardViewer.noReleases')}>
            {effectiveProductId && (
              <Button
                type="primary"
                onClick={() =>
                  navigate(`/projects/${projectId}/products/${effectiveProductId}/releases/new`)
                }
              >
                {t('releases.createNew')}
              </Button>
            )}
          </Empty>
        </Card>
      ) : viewType === '2d' ? (
        effectiveGerberItems.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
            <Empty description={t('boardViewer.noGerberForRelease')}>
              {effective3DItems.length > 0 ? (
                <Button type="primary" onClick={() => setViewType('3d')}>
                  {t('viewer3d.view3d')}
                </Button>
              ) : (
                selectedRelease &&
                effectiveProductId && (
                  <Button
                    onClick={() =>
                      navigate(
                        `/projects/${projectId}/products/${effectiveProductId}/releases/${selectedRelease.id}`,
                      )
                    }
                  >
                    {t('boardViewer.goToReleaseItems')}
                  </Button>
                )
              )}
            </Empty>
          </Card>
        ) : (
          <Card styles={{ body: { padding: 0 } }}>
            <GerberViewerModal
              key={selectedRelease?.id ?? 'preview'}
              inline
              multipleItems={effectiveGerberItems}
              releaseId={selectedRelease?.id}
              title={
                selectedRelease
                  ? `${selectedRelease.version_label} · ${t('gerber.viewerTitle')}`
                  : t('gerber.viewerTitle')
              }
              height={720}
            />
          </Card>
        )
      ) : !active3DItem ? (
        <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
          <Empty description={t('viewer3d.noModelsInRelease')}>
            <Space size="small">
              <Button
                type="primary"
                icon={<UploadOutlined aria-hidden="true" />}
                onClick={() => {
                  setSourceMode('upload');
                  setViewType('3d');
                }}
              >
                {t('boardViewer.sourceUploadExternal')}
              </Button>
              <Button onClick={() => setViewType('2d')}>
                {t('viewer3d.view2d')}
              </Button>
            </Space>
          </Empty>
        </Card>
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          <ThreeViewer
            key={`${selectedRelease?.id ?? 'preview'}-${active3DItem.fileName}`}
            storagePath={active3DItem.storagePath}
            fileName={active3DItem.fileName}
            height={720}
          />
        </Card>
      )}
    </PageHeader>
  );
};
