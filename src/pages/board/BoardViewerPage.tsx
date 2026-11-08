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
  DeleteOutlined,
  HistoryOutlined,
  InboxOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { unzipSync } from 'fflate';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { GerberViewerModal } from '../../components/gerber/GerberViewerModal';
import {
  extractFilesFromZip,
  isAnyGerberItem,
  isGerberArchiveFileName,
  isGerberFileName,
} from '../../lib/gerber';
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

  // External file upload states
  const [localGerberFiles, setLocalGerberFiles] = useState<{ name: string; content: string }[]>([]);
  const [localBomRows, setLocalBomRows] = useState<ParsedBomRow[]>([]);
  const [localPnpRows, setLocalPnpRows] = useState<ParsedPnpRow[]>([]);
  const [localArchiveName, setLocalArchiveName] = useState<string>('');
  const [isProcessingUpload, setIsProcessingUpload] = useState<boolean>(false);
  const extraPnpInputRef = useRef<HTMLInputElement>(null);
  const extraBomInputRef = useRef<HTMLInputElement>(null);

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

  // Load Gerber files available for the selected release
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

      const items = ((data as ReleaseItem[]) ?? [])
        .filter((ri) => isAnyGerberItem(ri.file_name) && ri.storage_path && ri.file_name)
        .map((ri) => ({ fileName: ri.file_name!, storagePath: ri.storage_path! }));

      setReleaseItemsFromDb(items);
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

          // Check if zip also contains BOM or PnP CSVs
          try {
            const unzipped = unzipSync(zipBytes);
            const decoder = new TextDecoder('utf-8', { fatal: false });
            for (const [path, data] of Object.entries(unzipped)) {
              if (path.endsWith('/') || data.length === 0) {
                continue;
              }
              const basename = path.split('/').pop() ?? path;
              const lower = basename.toLowerCase();
              if (lower.endsWith('.csv') || lower.endsWith('.pos') || lower.endsWith('.txt')) {
                const text = decoder.decode(data);
                if (isLikelyPnpName(basename)) {
                  detectedPnpText = text;
                } else if (isLikelyBomName(basename)) {
                  detectedBomText = text;
                }
              }
            }
          } catch {
            // Ignore errors in supplementary CSV extraction from zip
          }
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

      if (collectedGerbers.length === 0) {
        setErrorMessage(t('boardViewer.noGerberInUpload'));
        setIsProcessingUpload(false);
        return;
      }

      setLocalGerberFiles(collectedGerbers);
      setLocalArchiveName(mainName);

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
    setLocalBomRows([]);
    setLocalPnpRows([]);
    setLocalArchiveName('');
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
          {/* Left Controls: Mode Switcher + Contextual Selectors */}
          <Space size="middle" align="center" wrap>
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
                    style={{ minWidth: 260 }}
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
              </Space>
            )}

            {/* External Upload Status Badges */}
            {sourceMode === 'upload' && localGerberFiles.length > 0 && (
              <Space size={tokens.spacing.xs} align="center" wrap>
                {localArchiveName && <Tag bordered>{localArchiveName}</Tag>}
                <span className="revlog-count-pill">
                  {t('boardViewer.loadedLayersCount', { count: localGerberFiles.length })}
                </span>
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

            {sourceMode === 'upload' && localGerberFiles.length > 0 && (
              <Space size="small" align="center">
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
        localGerberFiles.length === 0 ? (
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
                accept=".zip,.gtl,.gbl,.gto,.gbo,.gts,.gbs,.gm1,.gm2,.gko,.edge,.drl,.xln,.exc,.nc,.drd,.gbr,.ger,.csv,.pos,.txt"
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
      ) : effectiveGerberItems.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
          <Empty description={t('boardViewer.noGerberForRelease')}>
            {selectedRelease && effectiveProductId && (
              <Button
                onClick={() =>
                  navigate(
                    `/projects/${projectId}/products/${effectiveProductId}/releases/${selectedRelease.id}`,
                  )
                }
              >
                {t('boardViewer.goToReleaseItems')}
              </Button>
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
      )}
    </PageHeader>
  );
};
