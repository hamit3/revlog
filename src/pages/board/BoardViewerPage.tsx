import React, { useEffect, useMemo, useState } from 'react';
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

  const [viewType, setViewType] = useState<'gerber' | 'gerber-3d' | '3d' | 'pdf'>('gerber');
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

        const releaseData = relRes.data as Release;
        const items = ((itemsRes.data as ReleaseItem[]) ?? []).filter(
          (ri) => ri.file_name && ri.storage_path,
        );

        setLoadedRelease(releaseData);
        setReleaseItems(items);

        // Auto-select initial view mode based on what files exist in the release
        const hasGerbers = items.some((ri) => isAnyGerberItem(ri.file_name));
        const has3d = items.some((ri) => is3DModelFileName(ri.file_name));
        const hasPdf = items.some((ri) => isPdfFileName(ri.file_name));

        if (hasGerbers) {
          setViewType('gerber');
        } else if (has3d) {
          setViewType('3d');
        } else if (hasPdf) {
          setViewType('pdf');
        }

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

  // Available modes in this release
  const availableModes = useMemo(() => {
    const modes: { value: 'gerber' | 'gerber-3d' | '3d' | 'pdf'; label: string; icon: React.ReactNode }[] = [];
    if (releaseGerberItems.length > 0) {
      modes.push({
        value: 'gerber',
        label: t('viewer3d.view2d'),
        icon: <FileSearchOutlined aria-hidden="true" />,
      });
      modes.push({
        value: 'gerber-3d',
        label: t('viewer3d.pcbBoard3d'),
        icon: <BoxPlotOutlined aria-hidden="true" />,
      });
    }
    if (release3DItems.length > 0) {
      modes.push({
        value: '3d',
        label: t('viewer3d.view3d'),
        icon: <BoxPlotOutlined aria-hidden="true" />,
      });
    }
    if (releasePdfItems.length > 0) {
      modes.push({
        value: 'pdf',
        label: t('pdf.schematicTab'),
        icon: <FilePdfOutlined aria-hidden="true" />,
      });
    }
    return modes;
  }, [releaseGerberItems.length, release3DItems.length, releasePdfItems.length, t]);

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
      {/* Clean Release Toolbar */}
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
            {/* Show view switcher only if multiple modes exist */}
            {availableModes.length > 1 && (
              <Segmented
                value={viewType}
                onChange={(val) => setViewType(val as typeof viewType)}
                options={availableModes}
              />
            )}

            <Tag color="blue" bordered={false}>
              <HistoryOutlined aria-hidden="true" style={{ marginRight: 4 }} />
              {loadedRelease.version_label}
            </Tag>

            {viewType === '3d' && release3DItems.length > 1 && (
              <Select
                value={activeRelease3D?.fileName}
                style={{ minWidth: 180 }}
                options={release3DItems.map((item) => ({
                  label: item.fileName,
                  value: item.fileName,
                }))}
                onChange={(val) => setSelected3DFileName(val)}
              />
            )}

            {viewType === 'pdf' && releasePdfItems.length > 1 && (
              <Select
                value={activeReleasePdf?.fileName}
                style={{ minWidth: 200 }}
                options={releasePdfItems.map((item) => ({
                  label: item.title || item.fileName,
                  value: item.fileName,
                }))}
                onChange={(val) => setSelectedPdfFileName(val)}
              />
            )}
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
              {t('boardViewer.clearFiles')}
            </Button>
          </Space>
        </div>
      </Card>

      {/* Viewer Body */}
      {viewType === 'pdf' ? (
        !activeReleasePdf ? (
          <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
            <Empty description={t('pdf.noSchematicInRelease')}>
              <Button type="primary" icon={<UploadOutlined aria-hidden="true" />} onClick={onClear}>
                {t('boardViewer.clearFiles')}
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
      ) : viewType === 'gerber-3d' ? (
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
      ) : viewType === 'gerber' ? (
        releaseGerberItems.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
            <Empty description={t('boardViewer.noGerberForRelease')}>
              <Button type="primary" icon={<UploadOutlined aria-hidden="true" />} onClick={onClear}>
                {t('boardViewer.clearFiles')}
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
      ) : !activeRelease3D ? (
        <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
          <Empty description={t('viewer3d.noModelsInRelease')}>
            <Button type="primary" icon={<UploadOutlined aria-hidden="true" />} onClick={onClear}>
              {t('boardViewer.clearFiles')}
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

  // Active view: 'gerber' (2D), 'gerber-3d' (3D PCB), '3d' (CAD model), 'pdf'
  const [viewType, setViewType] = useState<'gerber' | 'gerber-3d' | '3d' | 'pdf'>('gerber');
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

  const {
    project,
    product,
    isLoading: isProductAccessLoading,
  } = useProductAccess(projectId, productId);
  const { project: fallbackProject, isLoading: isProjectAccessLoading } = useProjectAccess(projectId);

  // Set document title
  useEffect(() => {
    document.title = `${t('boardViewer.pageTitle')}${product?.name ? ` - ${product.name}` : ''} | ${t('app.name')}`;
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

  // Handle external file upload processing with smart type auto-detection
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

      // Auto-switch to the viewer matching what was uploaded:
      // ZIP / Gerber -> Gerber viewer
      // PDF -> PDF viewer
      // 3D Model -> 3D viewer
      if (collectedGerbers.length > 0) {
        setLocalGerberFiles(collectedGerbers);
        setLocalArchiveName(mainName);
        setViewType('gerber');
      } else if (collectedPdfFiles.length > 0) {
        setLocalPdfFiles((prev) => [...prev, ...collectedPdfFiles]);
        setSelectedPdfFileName(collectedPdfFiles[0]?.name);
        setViewType('pdf');
      } else if (collected3DFiles.length > 0) {
        setLocal3DFiles((prev) => [...prev, ...collected3DFiles]);
        setSelected3DFileName(collected3DFiles[0]?.name);
        setViewType('3d');
      }

      if (collectedPdfFiles.length > 0 && collectedGerbers.length > 0) {
        setLocalPdfFiles((prev) => [...prev, ...collectedPdfFiles]);
        setSelectedPdfFileName(collectedPdfFiles[0]?.name);
      }

      if (collected3DFiles.length > 0 && collectedGerbers.length > 0) {
        setLocal3DFiles((prev) => [...prev, ...collected3DFiles]);
        setSelected3DFileName(collected3DFiles[0]?.name);
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

  // Available modes for uploaded content
  const uploadedModes = useMemo(() => {
    const modes: { value: 'gerber' | 'gerber-3d' | '3d' | 'pdf'; label: string; icon: React.ReactNode }[] = [];
    if (localGerberFiles.length > 0) {
      modes.push({
        value: 'gerber',
        label: t('viewer3d.view2d'),
        icon: <FileSearchOutlined aria-hidden="true" />,
      });
      modes.push({
        value: 'gerber-3d',
        label: t('viewer3d.pcbBoard3d'),
        icon: <BoxPlotOutlined aria-hidden="true" />,
      });
    }
    if (local3DFiles.length > 0) {
      modes.push({
        value: '3d',
        label: t('viewer3d.view3d'),
        icon: <BoxPlotOutlined aria-hidden="true" />,
      });
    }
    if (localPdfFiles.length > 0) {
      modes.push({
        value: 'pdf',
        label: t('pdf.schematicTab'),
        icon: <FilePdfOutlined aria-hidden="true" />,
      });
    }
    return modes;
  }, [localGerberFiles.length, local3DFiles.length, localPdfFiles.length, t]);

  const isAccessLoading = productId ? isProductAccessLoading : isProjectAccessLoading;
  if (isAccessLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  const effectiveProject = project || fallbackProject;
  if (!effectiveProject) {
    return <Alert type="error" showIcon message={t('projects.notFound')} />;
  }

  return (
    <PageHeader
      backIcon={false}
      title={
        <PageHeaderTitle
          title={t('boardViewer.pageTitle')}
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

      {/* When releaseIdParam is provided: render ReleaseBoardView directly */}
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
          {/* Action Toolbar Card: only shown when files are uploaded */}
          {hasLocalFiles && (
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
                  {/* Show switcher only if multiple modes exist (e.g. Gerber 2D vs 3D) */}
                  {uploadedModes.length > 1 && (
                    <Segmented
                      value={viewType}
                      onChange={(val) => setViewType(val as typeof viewType)}
                      options={uploadedModes}
                    />
                  )}

                  {localArchiveName && <Tag color="blue" bordered={false}>{localArchiveName}</Tag>}

                  {viewType === '3d' && local3DFiles.length > 1 && (
                    <Select
                      value={activeLocal3D?.name}
                      style={{ minWidth: 180 }}
                      options={local3DFiles.map((f) => ({
                        label: f.name,
                        value: f.name,
                      }))}
                      onChange={(val) => setSelected3DFileName(val)}
                    />
                  )}

                  {viewType === 'pdf' && localPdfFiles.length > 1 && (
                    <Select
                      value={activeLocalPdf?.name}
                      style={{ minWidth: 180 }}
                      options={localPdfFiles.map((f) => ({
                        label: f.name,
                        value: f.name,
                      }))}
                      onChange={(val) => setSelectedPdfFileName(val)}
                    />
                  )}
                </Space>

                <Button
                  icon={<DeleteOutlined aria-hidden="true" />}
                  onClick={handleClearLocalFiles}
                >
                  {t('boardViewer.clearFiles')}
                </Button>
              </div>
            </Card>
          )}

          {/* Main Upload Body */}
          {!hasLocalFiles ? (
            /* Empty Dropzone with clean design */
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
          ) : viewType === 'pdf' && activeLocalPdf ? (
            /* PDF Viewer */
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
          ) : viewType === '3d' && activeLocal3D ? (
            /* 3D CAD Model Viewer */
            <Card styles={{ body: { padding: 0 } }}>
              <ThreeViewer
                key={activeLocal3D.name}
                data={activeLocal3D.buffer}
                fileName={activeLocal3D.name}
                height={720}
              />
            </Card>
          ) : viewType === 'gerber-3d' && localGerberFiles.length > 0 ? (
            /* 3D PCB Board Viewer from Gerber */
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
          ) : localGerberFiles.length > 0 ? (
            /* 2D Gerber Layer Viewer */
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
          ) : null}
        </>
      )}
    </PageHeader>
  );
};
