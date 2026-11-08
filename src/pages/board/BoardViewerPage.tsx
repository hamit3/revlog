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
  FilePdfOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  InboxOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { unzipSync } from 'fflate';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { GerberViewerModal } from '../../components/gerber/GerberViewerModal';
import { ThreeViewer } from '../../components/three/ThreeViewer';
import { PdfViewer } from '../../components/pdf/PdfViewer';
import {
  extractFilesFromZip,
  isAnyGerberItem,
  isGerberArchiveFileName,
  isGerberFileName,
} from '../../lib/gerber';
import { is3DModelFileName } from '../../lib/model3d';
import { isPdfFileName } from '../../lib/pdf';
import {
  evaluateBomPnpCsvTexts,
  isLikelyBomName,
  isLikelyPnpName,
} from '../../lib/bomPnp';
import { useProductAccess, useProjectAccess } from '../../lib/useProjectAccess';
import { supabaseClient } from '../../providers/supabaseClient';
import { tokens } from '../../theme/tokens';
import type {
  BomPnpCheckRun,
  ParsedBomRow,
  ParsedPnpRow,
  Release,
  ReleaseItem,
} from '../../types/database';

interface ReleasePdfViewProps {
  storagePath: string;
  fileName: string;
  title?: string;
}

const ReleasePdfView: React.FC<ReleasePdfViewProps> = ({ storagePath, fileName, title }) => {
  const t = useTranslate();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let url: string | null = null;

    void (async () => {
      try {
        const { data, error } = await supabaseClient.storage
          .from('project-files')
          .download(storagePath);

        if (error || !data) {
          throw new Error(error?.message ?? t('pdf.downloadError'));
        }

        if (!active) {
          return;
        }

        const pdfBlob = new Blob([data], { type: 'application/pdf' });
        url = URL.createObjectURL(pdfBlob);
        setBlobUrl(url);
      } catch (err) {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : t('common.errorPrefix'));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [storagePath, t]);

  if (isLoading) {
    return (
      <Card style={{ textAlign: 'center', padding: tokens.spacing.xxl }}>
        <Spin />
        <div style={{ marginTop: tokens.spacing.sm }}>
          <Typography.Text type="secondary">{t('pdf.loadingDocument')}</Typography.Text>
        </div>
      </Card>
    );
  }

  if (errorMessage) {
    return (
      <Card style={{ padding: tokens.spacing.md }}>
        <Alert type="error" showIcon message={errorMessage} />
      </Card>
    );
  }

  if (!blobUrl) {
    return null;
  }

  return (
    <Card styles={{ body: { padding: 0 } }}>
      <PdfViewer
        blobUrl={blobUrl}
        fileName={fileName}
        title={title || fileName}
        height={720}
        downloadFileName={fileName}
      />
    </Card>
  );
};

interface ReleaseBoardViewProps {
  releaseId: string;
  projectId?: string;
  productId?: string;
  onClear: () => void;
}

const ReleaseBoardView: React.FC<ReleaseBoardViewProps> = ({
  releaseId,
  projectId,
  productId,
  onClear,
}) => {
  const t = useTranslate();
  const navigate = useNavigate();

  const [viewType, setViewType] = useState<'2d' | '3d' | 'schematic'>('2d');
  const [selected3DFileName, setSelected3DFileName] = useState<string | undefined>(undefined);
  const [selectedPdfFileName, setSelectedPdfFileName] = useState<string | undefined>(undefined);

  const [loadedRelease, setLoadedRelease] = useState<Release | null>(null);
  const [releaseItems, setReleaseItems] = useState<ReleaseItem[]>([]);
  const [releaseBomRows, setReleaseBomRows] = useState<ParsedBomRow[]>([]);
  const [releasePnpRows, setReleasePnpRows] = useState<ParsedPnpRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [relRes, itemsRes, bomPnpRes] = await Promise.all([
          supabaseClient
            .from('releases')
            .select('*')
            .eq('id', releaseId)
            .maybeSingle(),
          supabaseClient
            .from('release_items')
            .select('*')
            .eq('release_id', releaseId),
          supabaseClient
            .from('bom_pnp_check_runs')
            .select('*')
            .eq('release_id', releaseId)
            .maybeSingle(),
        ]);

        if (!active) {
          return;
        }

        if (relRes.error) {
          throw new Error(relRes.error.message);
        }
        if (!relRes.data) {
          throw new Error(t('releases.notFound'));
        }

        setLoadedRelease(relRes.data as Release);
        setReleaseItems(((itemsRes.data as ReleaseItem[]) ?? []).filter((ri) => ri.file_name && ri.storage_path));

        const checkRun = bomPnpRes.data as BomPnpCheckRun | null;
        if (checkRun?.parsed_bom) {
          setReleaseBomRows(checkRun.parsed_bom);
        }
        if (checkRun?.parsed_pnp) {
          setReleasePnpRows(checkRun.parsed_pnp);
        }
      } catch (err) {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [releaseId, t]);

  const releaseGerberItems = useMemo(() => {
    return releaseItems
      .filter((ri) => isAnyGerberItem(ri.file_name))
      .map((ri) => ({ fileName: ri.file_name!, storagePath: ri.storage_path! }));
  }, [releaseItems]);

  const release3DItems = useMemo(() => {
    return releaseItems
      .filter((ri) => is3DModelFileName(ri.file_name))
      .map((ri) => ({ fileName: ri.file_name!, storagePath: ri.storage_path! }));
  }, [releaseItems]);

  const releasePdfItems = useMemo(() => {
    return releaseItems
      .filter((ri) => isPdfFileName(ri.file_name))
      .map((ri) => ({
        fileName: ri.file_name!,
        storagePath: ri.storage_path!,
        title: ri.title || undefined,
      }));
  }, [releaseItems]);

  const activeRelease3D = useMemo(() => {
    if (release3DItems.length === 0) {
      return null;
    }
    if (selected3DFileName) {
      const match = release3DItems.find((i) => i.fileName === selected3DFileName);
      if (match) {
        return match;
      }
    }
    return release3DItems[0] ?? null;
  }, [release3DItems, selected3DFileName]);

  const activeReleasePdf = useMemo(() => {
    if (releasePdfItems.length === 0) {
      return null;
    }
    if (selectedPdfFileName) {
      const match = releasePdfItems.find((i) => i.fileName === selectedPdfFileName);
      if (match) {
        return match;
      }
    }
    return releasePdfItems[0] ?? null;
  }, [releasePdfItems, selectedPdfFileName]);

  if (errorMessage) {
    return (
      <Card style={{ padding: tokens.spacing.md }}>
        <Alert type="error" showIcon message={errorMessage} />
      </Card>
    );
  }

  if (isLoading || !loadedRelease) {
    return (
      <Card style={{ textAlign: 'center', padding: tokens.spacing.xxl }}>
        <Spin />
        <div style={{ marginTop: tokens.spacing.sm }}>
          <Typography.Text type="secondary">{t('gerber.loading')}</Typography.Text>
        </div>
      </Card>
    );
  }

  return (
    <>
      {/* Release Toolbar */}
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
          <Space size="middle" align="center" wrap>
            <Segmented
              value={viewType}
              onChange={(val) => setViewType(val as '2d' | '3d' | 'schematic')}
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
                {
                  value: 'schematic',
                  label: t('pdf.schematicTab'),
                  icon: <FilePdfOutlined aria-hidden="true" />,
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

            <Space size={tokens.spacing.xs} align="center" wrap>
              <Tag color="blue" bordered={false}>
                <HistoryOutlined aria-hidden="true" style={{ marginRight: 4 }} />
                {loadedRelease.version_label} ({t(`releases.status.${loadedRelease.status}`)})
              </Tag>

              {viewType === '3d' && release3DItems.length > 1 && (
                <Space size={tokens.spacing.xs} align="center">
                  <Typography.Text type="secondary">
                    {t('viewer3d.selectModel')}:
                  </Typography.Text>
                  <Select
                    value={activeRelease3D?.fileName}
                    style={{ minWidth: 200 }}
                    options={release3DItems.map((item) => ({
                      label: item.fileName,
                      value: item.fileName,
                    }))}
                    onChange={(val) => setSelected3DFileName(val)}
                  />
                </Space>
              )}

              {viewType === 'schematic' && releasePdfItems.length > 1 && (
                <Space size={tokens.spacing.xs} align="center">
                  <Typography.Text type="secondary">
                    {t('pdf.selectSchematic')}:
                  </Typography.Text>
                  <Select
                    value={activeReleasePdf?.fileName}
                    style={{ minWidth: 220 }}
                    options={releasePdfItems.map((item) => ({
                      label: item.title || item.fileName,
                      value: item.fileName,
                    }))}
                    onChange={(val) => setSelectedPdfFileName(val)}
                  />
                </Space>
              )}
            </Space>
          </Space>

          <Space size="small">
            <Button
              icon={<HistoryOutlined aria-hidden="true" />}
              onClick={() => {
                const base = productId
                  ? `/projects/${projectId}/products/${productId}`
                  : `/projects/${projectId}`;
                navigate(`${base}/releases/${loadedRelease.id}`);
              }}
            >
              {t('boardViewer.viewReleaseDetails')}
            </Button>
            <Button
              icon={<UploadOutlined aria-hidden="true" />}
              onClick={onClear}
            >
              {t('boardViewer.sourceUploadExternal')}
            </Button>
          </Space>
        </div>
      </Card>

      {/* Release Body */}
      {viewType === 'schematic' ? (
        !activeReleasePdf ? (
          <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
            <Empty description={t('pdf.noSchematicInRelease')}>
              <Button type="primary" icon={<UploadOutlined aria-hidden="true" />} onClick={onClear}>
                {t('boardViewer.sourceUploadExternal')}
              </Button>
            </Empty>
          </Card>
        ) : (
          <ReleasePdfView
            key={`${loadedRelease.id}-${activeReleasePdf.fileName}`}
            storagePath={activeReleasePdf.storagePath}
            fileName={activeReleasePdf.fileName}
            title={activeReleasePdf.title}
          />
        )
      ) : viewType === '2d' ? (
        releaseGerberItems.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
            <Empty description={t('boardViewer.noGerberForRelease')}>
              <Button type="primary" icon={<UploadOutlined aria-hidden="true" />} onClick={onClear}>
                {t('boardViewer.sourceUploadExternal')}
              </Button>
            </Empty>
          </Card>
        ) : (
          <Card styles={{ body: { padding: 0 } }}>
            <GerberViewerModal
              key={loadedRelease.id}
              inline
              initialViewMode="top"
              multipleItems={releaseGerberItems}
              releaseId={loadedRelease.id}
              bomRows={releaseBomRows.length > 0 ? releaseBomRows : undefined}
              pnpRows={releasePnpRows.length > 0 ? releasePnpRows : undefined}
              title={`${loadedRelease.version_label} · ${t('gerber.viewerTitle')}`}
              height={720}
            />
          </Card>
        )
      ) : releaseGerberItems.length > 0 ? (
        <Card styles={{ body: { padding: 0 } }}>
          <GerberViewerModal
            key={`${loadedRelease.id}-3d`}
            inline
            initialViewMode="3d"
            multipleItems={releaseGerberItems}
            releaseId={loadedRelease.id}
            bomRows={releaseBomRows.length > 0 ? releaseBomRows : undefined}
            pnpRows={releasePnpRows.length > 0 ? releasePnpRows : undefined}
            title={`${loadedRelease.version_label} · ${t('gerber.viewerTitle')}`}
            height={720}
          />
        </Card>
      ) : !activeRelease3D ? (
        <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
          <Empty description={t('viewer3d.noModelsInRelease')}>
            <Button type="primary" icon={<UploadOutlined aria-hidden="true" />} onClick={onClear}>
              {t('boardViewer.sourceUploadExternal')}
            </Button>
          </Empty>
        </Card>
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          <ThreeViewer
            key={`${loadedRelease.id}-${activeRelease3D.fileName}`}
            storagePath={activeRelease3D.storagePath}
            fileName={activeRelease3D.fileName}
            height={720}
          />
        </Card>
      )}
    </>
  );
};

export const BoardViewerPage: React.FC = () => {
  const t = useTranslate();
  const { projectId, productId } = useParams<{ projectId: string; productId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const releaseIdParam = searchParams.get('releaseId');

  // View type selection: 2D Gerber & PnP layer view vs 3D model view vs Schematic PDF
  const [viewType, setViewType] = useState<'2d' | '3d' | 'schematic'>('2d');
  const [selected3DFileName, setSelected3DFileName] = useState<string | undefined>(undefined);
  const [selectedPdfFileName, setSelectedPdfFileName] = useState<string | undefined>(undefined);

  // External file upload states
  const [localGerberFiles, setLocalGerberFiles] = useState<{ name: string; content: string }[]>([]);
  const [local3DFiles, setLocal3DFiles] = useState<{ name: string; buffer: ArrayBuffer }[]>([]);
  const [localPdfFiles, setLocalPdfFiles] = useState<{ name: string; blobUrl: string }[]>([]);
  const [localBomRows, setLocalBomRows] = useState<ParsedBomRow[]>([]);
  const [localPnpRows, setLocalPnpRows] = useState<ParsedPnpRow[]>([]);
  const [localArchiveName, setLocalArchiveName] = useState<string>('');
  const [isProcessingUpload, setIsProcessingUpload] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const extraPnpInputRef = useRef<HTMLInputElement>(null);
  const extraBomInputRef = useRef<HTMLInputElement>(null);
  const extra3DInputRef = useRef<HTMLInputElement>(null);
  const extraPdfInputRef = useRef<HTMLInputElement>(null);

  const { project, product } = useProductAccess(projectId, productId);
  const { project: fallbackProject } = useProjectAccess(projectId);

  // Set document title
  useEffect(() => {
    document.title = `${t('nav.boardViewer')}${product?.name ? ` - ${product.name}` : ''} | ${t('app.name')}`;
  }, [product?.name, t]);

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

  const activeLocalPdf = useMemo(() => {
    if (localPdfFiles.length === 0) {
      return null;
    }
    if (selectedPdfFileName) {
      const match = localPdfFiles.find((f) => f.name === selectedPdfFileName);
      if (match) {
        return match;
      }
    }
    return localPdfFiles[0] ?? null;
  }, [localPdfFiles, selectedPdfFileName]);

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
      const collectedPdfFiles: { name: string; blobUrl: string }[] = [];
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

          // Check if zip also contains BOM, PnP CSVs, 3D models, or PDFs
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
              } else if (isPdfFileName(basename)) {
                const pdfBlob = new Blob([data], { type: 'application/pdf' });
                collectedPdfFiles.push({
                  name: basename,
                  blobUrl: URL.createObjectURL(pdfBlob),
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
        } else if (isPdfFileName(file.name)) {
          if (!mainName) {
            mainName = file.name;
          }
          collectedPdfFiles.push({
            name: file.name,
            blobUrl: URL.createObjectURL(file),
          });
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

      if (
        collectedGerbers.length === 0 &&
        collected3DFiles.length === 0 &&
        collectedPdfFiles.length === 0
      ) {
        setErrorMessage(t('boardViewer.noGerberInUpload'));
        setIsProcessingUpload(false);
        return;
      }

      if (collectedPdfFiles.length > 0) {
        setLocalPdfFiles((prev) => [...prev, ...collectedPdfFiles]);
        setSelectedPdfFileName(collectedPdfFiles[0]?.name);
        if (collectedGerbers.length === 0 && collected3DFiles.length === 0) {
          setViewType('schematic');
        }
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

  // Add supplementary PDF / schematic file to local viewer
  const handleAddExtraPdfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const blobUrl = URL.createObjectURL(file);
    setLocalPdfFiles((prev) => [
      ...prev.filter((f) => f.name !== file.name),
      { name: file.name, blobUrl },
    ]);
    setSelectedPdfFileName(file.name);
    setViewType('schematic');
    e.target.value = '';
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
    for (const pdf of localPdfFiles) {
      URL.revokeObjectURL(pdf.blobUrl);
    }
    setLocalGerberFiles([]);
    setLocal3DFiles([]);
    setLocalPdfFiles([]);
    setLocalBomRows([]);
    setLocalPnpRows([]);
    setLocalArchiveName('');
    setSelected3DFileName(undefined);
    setSelectedPdfFileName(undefined);
    setErrorMessage(null);
  };

  const hasLocalFiles =
    localGerberFiles.length > 0 || local3DFiles.length > 0 || localPdfFiles.length > 0;

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

      {/* When releaseIdParam is provided: render ReleaseBoardView */}
      {releaseIdParam ? (
        <ReleaseBoardView
          releaseId={releaseIdParam}
          projectId={projectId}
          productId={productId}
          onClear={() => setSearchParams({})}
        />
      ) : (
        /* Pure Upload Mode */
        <>
          {/* Action Toolbar Card */}
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
              {/* Left Controls: View Type + File Count Badges / Selectors */}
              <Space size="middle" align="center" wrap>
                <Segmented
                  value={viewType}
                  onChange={(val) => {
                    setViewType(val as '2d' | '3d' | 'schematic');
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
                    {
                      value: 'schematic',
                      label: t('pdf.schematicTab'),
                      icon: <FilePdfOutlined aria-hidden="true" />,
                    },
                  ]}
                />

                {hasLocalFiles && (
                  <>
                    <div
                      style={{
                        width: 1,
                        height: 20,
                        backgroundColor: tokens.colors.border,
                      }}
                      aria-hidden="true"
                    />

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
                      {localPdfFiles.length > 0 && (
                        <span className="revlog-count-pill">
                          {localPdfFiles.length} PDF
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

                      {viewType === 'schematic' && localPdfFiles.length > 1 && (
                        <Space size={tokens.spacing.xs} align="center" style={{ marginLeft: tokens.spacing.xs }}>
                          <Typography.Text type="secondary">
                            {t('pdf.selectSchematic')}:
                          </Typography.Text>
                          <Select
                            value={activeLocalPdf?.name}
                            style={{ minWidth: 180 }}
                            options={localPdfFiles.map((f) => ({
                              label: f.name,
                              value: f.name,
                            }))}
                            onChange={(val) => setSelectedPdfFileName(val)}
                          />
                        </Space>
                      )}
                    </Space>
                  </>
                )}
              </Space>

              {/* Right Action Buttons */}
              {hasLocalFiles && (
                <Space size="small" align="center">
                  {/* Supplementary 3D model upload */}
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

                  {/* Supplementary Schematic PDF upload */}
                  <input
                    ref={extraPdfInputRef}
                    type="file"
                    accept=".pdf"
                    style={{ display: 'none' }}
                    onChange={(e) => void handleAddExtraPdfFile(e)}
                  />
                  <Button
                    size="small"
                    icon={<FilePdfOutlined aria-hidden="true" />}
                    onClick={() => extraPdfInputRef.current?.click()}
                  >
                    {t('pdf.uploadPdfPrompt')}
                  </Button>

                  {/* Supplementary PnP / BOM upload buttons */}
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
          </Card>

          {/* Main Upload Body */}
          {!hasLocalFiles ? (
            /* Empty Dropzone */
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
                  accept=".zip,.gtl,.gbl,.gto,.gbo,.gts,.gbs,.gm1,.gm2,.gko,.edge,.drl,.xln,.exc,.nc,.drd,.gbr,.ger,.csv,.pos,.txt,.glb,.gltf,.stl,.pdf"
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
          ) : viewType === 'schematic' ? (
            !activeLocalPdf ? (
              <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
                <Empty description={t('pdf.noSchematicInUpload')}>
                  <Button
                    type="primary"
                    icon={<FilePdfOutlined aria-hidden="true" />}
                    onClick={() => extraPdfInputRef.current?.click()}
                  >
                    {t('pdf.uploadPdfPrompt')}
                  </Button>
                </Empty>
              </Card>
            ) : (
              <Card styles={{ body: { padding: 0 } }}>
                <PdfViewer
                  key={activeLocalPdf.name}
                  blobUrl={activeLocalPdf.blobUrl}
                  fileName={activeLocalPdf.name}
                  title={activeLocalPdf.name}
                  height={720}
                  downloadFileName={activeLocalPdf.name}
                />
              </Card>
            )
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
                  initialViewMode="top"
                  files={localGerberFiles}
                  bomRows={localBomRows.length > 0 ? localBomRows : undefined}
                  pnpRows={localPnpRows.length > 0 ? localPnpRows : undefined}
                  title={localArchiveName || t('boardViewer.externalFilesTitle')}
                  height={720}
                />
              </Card>
            )
          ) : localGerberFiles.length > 0 ? (
            <Card styles={{ body: { padding: 0 } }}>
              <GerberViewerModal
                key={`${localArchiveName || 'uploaded-files'}-3d`}
                inline
                initialViewMode="3d"
                files={localGerberFiles}
                bomRows={localBomRows.length > 0 ? localBomRows : undefined}
                pnpRows={localPnpRows.length > 0 ? localPnpRows : undefined}
                title={localArchiveName || t('boardViewer.externalFilesTitle')}
                height={720}
              />
            </Card>
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
          )}
        </>
      )}
    </PageHeader>
  );
};
