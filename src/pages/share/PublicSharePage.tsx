import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslate } from '@refinedev/core';
import {
  Button,
  Card,
  Descriptions,
  Result,
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
  FileOutlined,
  HddOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime, formatFileSize } from '../../lib/format';
import { computeShareTokenHash } from '../../lib/shareToken';
import {
  buildReleasePackageManifest,
  buildReleasePackageZip,
  mapReleaseItemsToZipPaths,
} from '../../lib/releasePackage';
import { triggerBlobDownload } from '../../lib/storage';
import { supabaseClient } from '../../providers/supabaseClient';
import type {
  PublicSharedRelease,
  PublicSharedReleaseItem,
  ReleaseItem,
} from '../../types/database';

const RevLogBrandIcon: React.FC = () => (
  <span
    style={{
      width: 24,
      height: 24,
      borderRadius: tokens.radius.sm,
      backgroundColor: tokens.colors.accent,
      color: tokens.colors.white,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    <HddOutlined aria-hidden="true" />
  </span>
);

export const PublicSharePage: React.FC = () => {
  const t = useTranslate();
  const { token } = useParams<{ token: string }>();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [data, setData] = useState<PublicSharedRelease | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isPackaging, setIsPackaging] = useState<boolean>(false);
  const [packagingStatus, setPackagingStatus] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!token) {
        setErrorStatus('invalid');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorStatus(null);

      try {
        const tokenHash = await computeShareTokenHash(token);
        const { data: rpcData, error: rpcError } = await supabaseClient.rpc(
          'get_public_shared_release',
          { p_token_hash: tokenHash },
        );

        if (!active) {
          return;
        }

        if (rpcError || !rpcData) {
          setErrorStatus('not_found');
          setData(null);
          setDaysRemaining(null);
        } else {
          const payload = rpcData as unknown as PublicSharedRelease;
          setData(payload);
          if (payload.link?.expires_at) {
            const diffMs = new Date(payload.link.expires_at).getTime() - Date.now();
            setDaysRemaining(Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24))));
          }
        }
      } catch {
        if (active) {
          setErrorStatus('error');
          setData(null);
          setDaysRemaining(null);
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
  }, [token]);

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1500);
    } catch {
      // Clipboard fallback
    }
  };

  const handleDownloadFile = async (item: PublicSharedReleaseItem) => {
    if (!item.storage_path) {
      return;
    }
    setDownloadingId(item.id);
    try {
      const { data: fileBlob, error: downloadError } = await supabaseClient.storage
        .from('project-files')
        .download(item.storage_path);

      if (downloadError || !fileBlob) {
        throw new Error(downloadError?.message ?? 'Could not download file.');
      }

      triggerBlobDownload(fileBlob, item.file_name || 'download.bin');
    } catch {
      // Download failed
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadPackage = async () => {
    if (!data) {
      return;
    }

    const fileItems = data.items.filter(
      (i) => i.kind === 'file' && Boolean(i.storage_path) && Boolean(i.file_name),
    );

    setIsPackaging(true);
    setPackagingStatus(t('releases.packagingProgress', { current: 0, total: fileItems.length }));

    try {
      const convertedReleaseItems: ReleaseItem[] = data.items.map((it) => ({
        id: it.id,
        release_id: data.release.id,
        item_id: it.id,
        category_name: it.category_name,
        category_position: it.category_position,
        title: it.title,
        kind: it.kind,
        file_name: it.file_name,
        file_size: it.file_size,
        sha256: it.sha256,
        url: it.url,
        storage_path: it.storage_path,
        version_label: it.version_label,
        created_at:
          data.release.published_at || data.release.release_date || new Date().toISOString(),
      }));

      const manifest = await buildReleasePackageManifest({
        release: {
          id: data.release.id,
          version_label: data.release.version_label,
          published_at: data.release.published_at,
          release_date: data.release.release_date,
          manifest_hash: data.release.manifest_hash,
        },
        releaseItems: convertedReleaseItems,
        publisherName: data.release.publisher,
        project: { id: data.project.id, name: data.project.name },
        product: { id: data.product.id, name: data.product.name, code: data.product.code },
      });

      const pathMap = mapReleaseItemsToZipPaths(convertedReleaseItems);
      const downloadedFiles: Array<{ path: string; data: Uint8Array }> = [];

      for (let i = 0; i < fileItems.length; i += 1) {
        const item = fileItems[i]!;
        setPackagingStatus(
          t('releases.packagingProgress', { current: i + 1, total: fileItems.length }),
        );

        const safePath = pathMap.get(item.id) ?? item.file_name ?? 'file.bin';
        const { data: fileBlob, error: downloadError } = await supabaseClient.storage
          .from('project-files')
          .download(item.storage_path!);

        if (downloadError || !fileBlob) {
          throw new Error(downloadError?.message ?? `Could not download ${item.file_name}`);
        }

        const arrayBuffer = await fileBlob.arrayBuffer();
        downloadedFiles.push({
          path: safePath,
          data: new Uint8Array(arrayBuffer),
        });
      }

      const zipBytes = buildReleasePackageZip({
        manifest,
        files: downloadedFiles,
      });

      const productPrefix = data.product.code || data.product.name;
      const cleanPrefix = productPrefix.replace(/[^\w.-]+/g, '_');
      const cleanVersion = data.release.version_label.replace(/[^\w.-]+/g, '_');
      const zipFileName = `${cleanPrefix}-${cleanVersion}.zip`;

      const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
      triggerBlobDownload(blob, zipFileName);
    } catch {
      // Packaging error handled
    } finally {
      setIsPackaging(false);
      setPackagingStatus(null);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (errorStatus || !data) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: tokens.spacing.lg }}>
        <Result
          status="404"
          title={t('share.invalidOrExpiredTitle')}
          subTitle={t('share.invalidOrExpiredSubtitle')}
          extra={
            <Button type="primary" href="/login">
              {t('share.backHome')}
            </Button>
          }
        />
      </div>
    );
  }

  const columns: ColumnsType<PublicSharedReleaseItem> = [
    {
      title: t('releases.columns.title'),
      dataIndex: 'title',
      key: 'title',
      render: (val: string | null) => (
        <Typography.Text strong>{val ?? t('common.none')}</Typography.Text>
      ),
    },
    {
      title: t('items.categoryLabel'),
      dataIndex: 'category_name',
      key: 'category_name',
      width: 140,
      render: (val: string | null) => (val ? <Tag>{val}</Tag> : t('common.none')),
    },
    {
      title: t('releases.columns.kind'),
      dataIndex: 'kind',
      key: 'kind',
      width: 100,
      render: (kind: PublicSharedReleaseItem['kind']) => (
        <Tag
          icon={
            kind === 'file' ? (
              <FileOutlined aria-hidden="true" />
            ) : (
              <LinkOutlined aria-hidden="true" />
            )
          }
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
      render: (val: string | null) =>
        val ? (
          <Tag bordered>{val}</Tag>
        ) : (
          <Typography.Text type="secondary">{t('common.none')}</Typography.Text>
        ),
    },
    {
      title: t('releases.columns.artifact'),
      key: 'artifact',
      render: (_val: unknown, record: PublicSharedReleaseItem) =>
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
      render: (val: number | null, record: PublicSharedReleaseItem) =>
        record.kind === 'file' ? formatFileSize(val) : t('common.none'),
    },
    {
      title: t('releases.columns.sha256'),
      dataIndex: 'sha256',
      key: 'sha256',
      width: 280,
      render: (sha: string | null, record: PublicSharedReleaseItem) => {
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
      render: (_val: unknown, record: PublicSharedReleaseItem) =>
        record.kind === 'file' ? (
          <Button
            size="small"
            icon={<DownloadOutlined aria-hidden="true" />}
            loading={downloadingId === record.id}
            onClick={() => void handleDownloadFile(record)}
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
          >
            {t('common.openLink')}
          </Button>
        ),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: tokens.colors.background }}>
      {/* Standalone Public Header Bar */}
      <header
        style={{
          borderBottom: `1px solid ${tokens.colors.border}`,
          backgroundColor: tokens.colors.surface,
          padding: `${tokens.spacing.sm} ${tokens.spacing.xl}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Space size="middle" align="center">
          <div className="revlog-inline-row" style={{ gap: tokens.spacing.xs }}>
            <RevLogBrandIcon />
            <Typography.Text strong>RevLog</Typography.Text>
          </div>
          <span style={{ color: tokens.colors.border }}>/</span>
          <Typography.Text type="secondary">{t('share.publicTitle')}</Typography.Text>
        </Space>

        <Space size="small">
          <Tag icon={<SafetyCertificateOutlined aria-hidden="true" />} color="blue">
            {t('share.publicNotice')}
          </Tag>
          {daysRemaining !== null && (
            <Tag color="orange">{t('share.expiresBadge', { days: daysRemaining })}</Tag>
          )}
        </Space>
      </header>

      {/* Main Container */}
      <main
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: `${tokens.spacing.xl} ${tokens.spacing.lg}`,
        }}
      >
        {/* Release Title & Top Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: tokens.spacing.md,
            marginBottom: tokens.spacing.lg,
          }}
        >
          <div>
            <div className="revlog-inline-row" style={{ gap: tokens.spacing.sm }}>
              <Typography.Title level={2} style={{ margin: 0 }}>
                {data.release.version_label}
              </Typography.Title>
              <StatusBadge kind="published" />
            </div>
            <Typography.Text type="secondary">
              {data.project.name} / {data.product.name}
              {data.product.code ? ` (${data.product.code})` : ''}
            </Typography.Text>
          </div>

          <Button
            type="primary"
            icon={<DownloadOutlined aria-hidden="true" />}
            loading={isPackaging}
            onClick={() => void handleDownloadPackage()}
          >
            {isPackaging
              ? packagingStatus || t('share.downloadAllPackage')
              : t('share.downloadAllPackage')}
          </Button>
        </div>

        {/* Metadata Card */}
        <Card style={{ marginBottom: tokens.spacing.lg }}>
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2 }}
            items={[
              {
                key: 'project',
                label: t('nav.project'),
                children: <Typography.Text strong>{data.project.name}</Typography.Text>,
              },
              {
                key: 'product',
                label: t('nav.product'),
                children: (
                  <div className="revlog-inline-row">
                    <Typography.Text strong>{data.product.name}</Typography.Text>
                    {data.product.code && <Tag bordered>{data.product.code}</Tag>}
                  </div>
                ),
              },
              {
                key: 'publishedAt',
                label: t('releases.publishedAtLabel'),
                children: formatDateTime(data.release.published_at),
              },
              {
                key: 'publishedBy',
                label: t('releases.publishedByLabel'),
                children: data.release.publisher,
              },
              ...(data.release.manifest_hash
                ? [
                    {
                      key: 'manifestHash',
                      label: t('releases.manifestHashLabel'),
                      span: 2,
                      children: (
                        <div
                          className="revlog-inline-row"
                          style={{ justifyContent: 'space-between' }}
                        >
                          <span className="revlog-hash">{data.release.manifest_hash}</span>
                          <Space size="small">
                            <Tag
                              icon={<CheckCircleOutlined aria-hidden="true" />}
                              color="success"
                              bordered
                            >
                              {t('releases.manifestVerified')}
                            </Tag>
                            <Tooltip
                              title={
                                copiedKey === 'manifest' ? t('common.copied') : t('common.copy')
                              }
                            >
                              <Button
                                size="small"
                                type="text"
                                icon={<CopyOutlined aria-hidden="true" />}
                                aria-label={`${t('common.copy')} ${t('releases.manifestHashLabel')}`}
                                onClick={() =>
                                  void handleCopy('manifest', data.release.manifest_hash ?? '')
                                }
                              />
                            </Tooltip>
                          </Space>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
          />

          {data.release.notes && (
            <div style={{ marginTop: tokens.spacing.md }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: tokens.spacing.xs }}>
                {t('releases.notesHeading')}
              </Typography.Text>
              <Typography.Paragraph
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  backgroundColor: tokens.colors.background,
                  padding: tokens.spacing.sm,
                  borderRadius: tokens.radius.md,
                }}
              >
                {data.release.notes}
              </Typography.Paragraph>
            </div>
          )}
        </Card>

        {/* Files Table */}
        <Card
          title={
            <div className="revlog-inline-row" style={{ justifyContent: 'space-between' }}>
              <span>{t('releases.contentsHeading')}</span>
              <Typography.Text type="secondary">
                {t('releases.artifactCount', { count: data.items.length })}
              </Typography.Text>
            </div>
          }
        >
          <div className="revlog-table-region" tabIndex={0}>
            <Table<PublicSharedReleaseItem>
              rowKey="id"
              size="middle"
              columns={columns}
              dataSource={data.items}
              pagination={false}
            />
          </div>
        </Card>
      </main>
    </div>
  );
};
