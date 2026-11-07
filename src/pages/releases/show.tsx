import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useNotification, useTranslate } from '@refinedev/core';
import { Show } from '@refinedev/antd';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  FileOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { useProductAccess } from '../../lib/useProjectAccess';
import { formatDateTime, formatFileSize } from '../../lib/format';
import { computeManifestHash } from '../../lib/manifestHash';
import { groupReleaseItemsByCategory } from '../../lib/releaseHelpers';
import {
  buildReleasePackageManifest,
  buildReleasePackageZip,
  mapReleaseItemsToZipPaths,
} from '../../lib/releasePackage';
import {
  downloadProjectFileBytes,
  triggerBlobDownload,
  triggerSignedFileDownload,
} from '../../lib/storage';
import { supabaseClient } from '../../providers/supabaseClient';
import type { BomPnpCheckRun, Release, ReleaseItem } from '../../types/database';

export const ReleaseShowPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId, productId, releaseId } = useParams<{
    projectId: string;
    productId: string;
    releaseId: string;
  }>();
  const { open: notify } = useNotification();
  const { project, product, isLoading: isAccessLoading } = useProductAccess(projectId, productId);

  const [release, setRelease] = useState<Release | null>(null);
  const [releaseItems, setReleaseItems] = useState<ReleaseItem[]>([]);
  const [verifiedHash, setVerifiedHash] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [bomPnpRun, setBomPnpRun] = useState<BomPnpCheckRun | null>(null);
  const [isPackaging, setIsPackaging] = useState<boolean>(false);
  const [packagingStatus, setPackagingStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !productId || !releaseId) {
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);

      const [relRes, itemsRes, checkRunRes] = await Promise.all([
        supabaseClient
          .from('releases')
          .select('*, profiles:published_by(id, full_name, email, created_at)')
          .eq('id', releaseId)
          .eq('project_id', projectId)
          .eq('product_id', productId)
          .maybeSingle(),
        supabaseClient.from('release_items').select('*').eq('release_id', releaseId),
        supabaseClient
          .from('bom_pnp_check_runs')
          .select('*')
          .eq('release_id', releaseId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!active) {
        return;
      }

      if (relRes.error || itemsRes.error || !relRes.data) {
        setErrorMessage(relRes.error?.message ?? itemsRes.error?.message ?? t('products.notFound'));
        setIsLoading(false);
        return;
      }

      const loadedRelease = relRes.data as Release;
      const loadedItems = (itemsRes.data as ReleaseItem[]) ?? [];
      setRelease(loadedRelease);
      setReleaseItems(loadedItems);
      if (checkRunRes.data) {
        setBomPnpRun(checkRunRes.data as BomPnpCheckRun);
      } else {
        setBomPnpRun(null);
      }
      setReleaseItems(loadedItems);

      if (loadedRelease.status === 'published' && loadedRelease.manifest_hash) {
        const computed = await computeManifestHash(
          loadedItems.map((ri) => ({
            category_name: ri.category_name ?? '',
            category_position: ri.category_position ?? 0,
            title: ri.title ?? '',
            kind: ri.kind ?? 'file',
            version_label: ri.version_label ?? '',
            file_name: ri.file_name,
            file_size: ri.file_size,
            sha256: ri.sha256,
            url: ri.url,
          })),
        );
        if (active) {
          setVerifiedHash(computed === loadedRelease.manifest_hash);
        }
      }

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, productId, releaseId, t]);

  useEffect(() => {
    if (release?.version_label) {
      document.title = `${t('releases.detailTitle', {
        version: release.version_label,
      })}${product?.name ? ` - ${product.name}` : ''} | ${t('app.name')}`;
    }
  }, [product?.name, release?.version_label, t]);

  const groupedCategories = useMemo(
    () => groupReleaseItemsByCategory(releaseItems),
    [releaseItems],
  );

  const hasLinkItems = useMemo(() => releaseItems.some((ri) => ri.kind === 'link'), [releaseItems]);

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1500);
    } catch {
      // Clipboard API unavailable in non-secure context
    }
  };

  const handleDownload = async (ri: ReleaseItem) => {
    if (!ri.storage_path) {
      return;
    }
    setDownloadingId(ri.id);
    try {
      await triggerSignedFileDownload(ri.storage_path, ri.file_name);
    } catch (err) {
      notify?.({
        type: 'error',
        message: err instanceof Error ? err.message : t('items.downloadError'),
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadPackage = async () => {
    if (!release || release.status !== 'published' || !project || !product) {
      return;
    }

    const fileItems = releaseItems.filter(
      (ri) => ri.kind === 'file' && Boolean(ri.storage_path) && Boolean(ri.file_name),
    );

    setIsPackaging(true);
    setPackagingStatus(
      t('releases.packagingProgress', { current: 0, total: fileItems.length }),
    );

    try {
      const manifest = await buildReleasePackageManifest({
        release,
        releaseItems,
        publisherName,
        project: { id: project.id, name: project.name },
        product: { id: product.id, name: product.name, code: product.code },
      });

      const pathMap = mapReleaseItemsToZipPaths(releaseItems);
      const downloadedFiles: Array<{ path: string; data: Uint8Array }> = [];

      for (let i = 0; i < fileItems.length; i += 1) {
        const item = fileItems[i]!;
        setPackagingStatus(
          t('releases.packagingProgress', { current: i + 1, total: fileItems.length }),
        );

        const safePath = pathMap.get(item.id) ?? item.file_name ?? 'file.bin';
        const fileBytes = await downloadProjectFileBytes(item.storage_path!);
        downloadedFiles.push({
          path: safePath,
          data: fileBytes,
        });
      }

      const zipBytes = buildReleasePackageZip({
        manifest,
        files: downloadedFiles,
      });

      const productPrefix = product.code || product.name;
      const cleanPrefix = productPrefix.replace(/[^\w.-]+/g, '_');
      const cleanVersion = release.version_label.replace(/[^\w.-]+/g, '_');
      const zipFileName = `${cleanPrefix}-${cleanVersion}.zip`;

      const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
      triggerBlobDownload(blob, zipFileName);

      notify?.({
        type: 'success',
        message: t('releases.downloadPackageSuccess'),
      });
    } catch (err) {
      notify?.({
        type: 'error',
        message: err instanceof Error ? err.message : t('releases.downloadPackageError'),
      });
    } finally {
      setIsPackaging(false);
      setPackagingStatus(null);
    }
  };

  if (isAccessLoading || isLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (!project || !product || !projectId || !productId || !release) {
    return <Alert type="error" showIcon message={errorMessage ?? t('products.notFound')} />;
  }

  const productBase = `/projects/${project.id}/products/${product.id}`;

  if (release.status === 'draft') {
    return <Navigate to={`${productBase}/releases/${release.id}/edit`} replace />;
  }

  const publisherName =
    release.profiles?.full_name || release.profiles?.email || t('common.unknownUser');

  const itemColumns: ColumnsType<ReleaseItem> = [
    {
      title: t('releases.columns.title'),
      dataIndex: 'title',
      key: 'title',
      render: (value: string | null) => (
        <Typography.Text strong>{value ?? t('common.none')}</Typography.Text>
      ),
    },
    {
      title: t('releases.columns.kind'),
      dataIndex: 'kind',
      key: 'kind',
      width: 100,
      render: (kind: ReleaseItem['kind']) => (
        <Tag
          icon={
            kind === 'file' ? (
              <FileOutlined aria-hidden="true" />
            ) : (
              <LinkOutlined aria-hidden="true" />
            )
          }
          bordered
          style={{ marginInlineEnd: 0 }}
        >
          {kind === 'file' ? t('items.kindFile') : t('items.kindLink')}
        </Tag>
      ),
    },
    {
      title: t('releases.columns.version'),
      dataIndex: 'version_label',
      key: 'version_label',
      width: 110,
      render: (value: string | null) =>
        value ? (
          <Tag bordered style={{ marginInlineEnd: 0 }}>
            {value}
          </Tag>
        ) : (
          <Typography.Text type="secondary">{t('common.none')}</Typography.Text>
        ),
    },
    {
      title: t('releases.columns.artifact'),
      key: 'artifact',
      render: (_val: unknown, record: ReleaseItem) =>
        record.kind === 'file' ? (
          <Typography.Text>{record.file_name}</Typography.Text>
        ) : (
          <a
            href={record.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="revlog-break-url"
          >
            {record.url}
          </a>
        ),
    },
    {
      title: t('releases.columns.size'),
      dataIndex: 'file_size',
      key: 'file_size',
      width: 100,
      render: (val: number | null, record: ReleaseItem) =>
        record.kind === 'file' ? formatFileSize(val) : t('common.none'),
    },
    {
      title: t('releases.columns.sha256'),
      dataIndex: 'sha256',
      key: 'sha256',
      width: 280,
      render: (sha: string | null, record: ReleaseItem) => {
        if (record.kind !== 'file' || !sha) {
          return <Typography.Text type="secondary">{t('common.none')}</Typography.Text>;
        }
        return (
          <div className="revlog-inline-row" style={{ flexWrap: 'nowrap' }}>
            <span className="revlog-hash">{sha}</span>
            <Tooltip title={copiedKey === record.id ? t('common.copied') : t('common.copy')}>
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined aria-hidden="true" />}
                aria-label={`${t('common.copy')} ${record.title ?? ''}`}
                onClick={() => void handleCopy(record.id, sha)}
              />
            </Tooltip>
          </div>
        );
      },
    },
    {
      title: t('releases.columns.action'),
      key: 'action',
      width: 130,
      align: 'right',
      render: (_val: unknown, record: ReleaseItem) =>
        record.kind === 'file' ? (
          <Button
            size="small"
            icon={<DownloadOutlined aria-hidden="true" />}
            loading={downloadingId === record.id}
            aria-label={t('items.downloadAria', { title: record.title ?? '' })}
            onClick={() => void handleDownload(record)}
          >
            {t('common.download')}
          </Button>
        ) : (
          <Button
            size="small"
            icon={<LinkOutlined aria-hidden="true" />}
            href={record.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('items.openLinkAria', { title: record.title ?? '' })}
          >
            {t('common.openLink')}
          </Button>
        ),
    },
  ];

  return (
    <Show
      resource="releases"
      recordItemId={release.id}
      breadcrumb={false}
      canEdit={false}
      canDelete={false}
      title={
        <PageHeaderTitle
          title={release.version_label}
          subtitle={`${project.name} / ${product.name} · ${t('releases.detailSubtitle')}`}
          badge={<StatusBadge kind="published" />}
        />
      }
      headerProps={{
        onBack: () => navigate(`${productBase}/releases`),
      }}
      headerButtons={() => (
        <Space size="small">
          <Button
            type="primary"
            icon={<DownloadOutlined aria-hidden="true" />}
            loading={isPackaging}
            aria-label={t('releases.downloadPackageAria', { version: release.version_label })}
            onClick={() => void handleDownloadPackage()}
          >
            {isPackaging
              ? packagingStatus || t('releases.downloadPackage')
              : t('releases.downloadPackage')}
          </Button>
          <Button
            icon={<HistoryOutlined aria-hidden="true" />}
            onClick={() => navigate(`${productBase}/releases`)}
          >
            {t('releases.historyTitle')}
          </Button>
        </Space>
      )}
      contentProps={{
        bordered: false,
        style: { background: 'transparent', boxShadow: 'none' },
        styles: { body: { padding: 0 } },
      }}
    >
      {/* Read-only Locked Metadata Card */}
      <Card style={{ marginBottom: tokens.spacing.lg }}>
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2 }}
          items={[
            {
              key: 'product',
              label: t('nav.product'),
              children: (
                <div className="revlog-inline-row">
                  <Typography.Text strong>{product.name}</Typography.Text>
                  {product.code && <Tag bordered>{product.code}</Tag>}
                </div>
              ),
            },
            {
              key: 'publishedAt',
              label: t('releases.publishedAtLabel'),
              children: formatDateTime(release.published_at),
            },
            {
              key: 'publishedBy',
              label: t('releases.publishedByLabel'),
              children: publisherName,
            },
            {
              key: 'counts',
              label: t('releases.contentsHeading'),
              children: (
                <div className="revlog-inline-row">
                  <Tag bordered>{t('releases.artifactCount', { count: releaseItems.length })}</Tag>
                  <Tag bordered>
                    {t('releases.categoryCount', { count: groupedCategories.length })}
                  </Tag>
                </div>
              ),
            },
            ...(release.manifest_hash
              ? [
                  {
                    key: 'manifest',
                    label: t('releases.manifestHashLabel'),
                    span: 2,
                    children: (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: tokens.spacing.sm,
                        }}
                      >
                        <div className="revlog-inline-row">
                          <span className="revlog-hash">{release.manifest_hash}</span>
                          {verifiedHash === true && (
                            <Tag
                              icon={<CheckCircleOutlined aria-hidden="true" />}
                              bordered
                              style={{
                                backgroundColor: tokens.colors.publishedBg,
                                borderColor: tokens.colors.publishedBorder,
                                color: tokens.colors.publishedText,
                              }}
                            >
                              {t('releases.manifestVerified')}
                            </Tag>
                          )}
                          {verifiedHash === false && (
                            <Tag
                              icon={<ExclamationCircleOutlined aria-hidden="true" />}
                              bordered
                              style={{
                                backgroundColor: tokens.colors.errorBg,
                                borderColor: tokens.colors.errorBorder,
                                color: tokens.colors.errorText,
                              }}
                            >
                              {t('releases.manifestMismatch')}
                            </Tag>
                          )}
                        </div>

                        <Button
                          size="small"
                          icon={<CopyOutlined aria-hidden="true" />}
                          onClick={() => void handleCopy('manifest', release.manifest_hash ?? '')}
                        >
                          {copiedKey === 'manifest' ? t('common.copied') : t('common.copy')}
                        </Button>
                      </div>
                    ),
                  },
                ]
              : []),
            ...(release.notes
              ? [
                  {
                    key: 'notes',
                    label: t('releases.notesHeading'),
                    span: 2,
                    children: (
                      <span
                        className="revlog-prose"
                        style={{ display: 'block', whiteSpace: 'pre-wrap' }}
                      >
                        {release.notes}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      {bomPnpRun && (
        <Card
          title={t('releases.bomPnpCardHeading')}
          style={{ marginBottom: tokens.spacing.lg }}
          extra={
            <Button
              size="small"
              icon={<FileSearchOutlined aria-hidden="true" />}
              onClick={() =>
                navigate(
                  `/projects/${projectId}/products/${productId}/bom-pnp?releaseId=${release.id}`,
                )
              }
            >
              {t('releases.bomPnpViewButton')}
            </Button>
          }
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: tokens.spacing.sm,
            }}
          >
            {bomPnpRun.summary.error_count === 0 && bomPnpRun.summary.warning_count === 0 ? (
              <Tag
                bordered
                style={{
                  backgroundColor: tokens.colors.publishedBg,
                  borderColor: tokens.colors.publishedBorder,
                  color: tokens.colors.publishedText,
                }}
              >
                <CheckCircleOutlined aria-hidden="true" style={{ marginInlineEnd: 4 }} />
                {t('releases.bomPnpCheckPassed')}
              </Tag>
            ) : (
              <Tag
                bordered
                style={{
                  backgroundColor:
                    bomPnpRun.summary.error_count > 0
                      ? tokens.colors.errorBg
                      : tokens.colors.warningBg,
                  borderColor:
                    bomPnpRun.summary.error_count > 0
                      ? tokens.colors.errorBorder
                      : tokens.colors.warningBorder,
                  color:
                    bomPnpRun.summary.error_count > 0
                      ? tokens.colors.errorText
                      : tokens.colors.warningText,
                }}
              >
                <ExclamationCircleOutlined aria-hidden="true" style={{ marginInlineEnd: 4 }} />
                {t('releases.bomPnpCheckIssues', {
                  errors: bomPnpRun.summary.error_count,
                  warnings: bomPnpRun.summary.warning_count,
                })}
              </Tag>
            )}
            <Tag bordered>
              {t('bomPnp.summaryBomCount', { count: bomPnpRun.summary.bom_component_count })}
            </Tag>
            <Tag bordered>
              {t('bomPnp.summaryPnpCount', { count: bomPnpRun.summary.pnp_row_count })}
            </Tag>
            {(bomPnpRun.bom_file_name || bomPnpRun.pnp_file_name) && (
              <Typography.Text type="secondary">
                {t('releases.bomPnpCheckedFiles', {
                  bom: bomPnpRun.bom_file_name || '-',
                  pnp: bomPnpRun.pnp_file_name || '-',
                })}
              </Typography.Text>
            )}
          </div>
        </Card>
      )}

      {/* Release Contents Grouped by Module */}
      <Typography.Title level={2} style={{ marginBottom: tokens.spacing.md }}>
        {t('releases.contentsHeading')}
      </Typography.Title>

      <Space direction="vertical" size={tokens.spacing.md} style={{ width: '100%' }}>
        {groupedCategories.map((group) => (
          <Card
            key={`${group.categoryPosition}-${group.categoryName}`}
            title={group.categoryName}
            extra={
              <Tag bordered style={{ marginInlineEnd: 0 }}>
                {t('releases.artifactCount', { count: group.items.length })}
              </Tag>
            }
            styles={{ body: { padding: 0 } }}
          >
            <div className="revlog-table-region" tabIndex={0}>
              <Table<ReleaseItem>
                rowKey="id"
                size="middle"
                columns={itemColumns}
                dataSource={group.items}
                pagination={false}
              />
            </div>
          </Card>
        ))}
      </Space>

      {hasLinkItems && (
        <div className="revlog-secondary-text" style={{ marginTop: tokens.spacing.md }}>
          {t('items.linkUnverifiedNote')}
        </div>
      )}
    </Show>
  );
};
