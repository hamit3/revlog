import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useNotification, useTranslate } from '@refinedev/core';
import { List } from '@refinedev/antd';
import { Alert, Button, Card, Empty, Space, Spin, Timeline, Tooltip, Typography } from 'antd';
import {
  ArrowRightOutlined,
  DownloadOutlined,
  EditOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { useProductAccess } from '../../lib/useProjectAccess';
import { formatDateTime, formatReleaseDate } from '../../lib/format';
import {
  buildReleasePackageManifest,
  buildReleasePackageZip,
  mapReleaseItemsToZipPaths,
} from '../../lib/releasePackage';
import { downloadProjectFileBytes, triggerBlobDownload } from '../../lib/storage';
import { supabaseClient } from '../../providers/supabaseClient';
import type { Release, ReleaseItem } from '../../types/database';

function publisherInitials(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export const ReleaseListPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId, productId } = useParams<{ projectId: string; productId: string }>();
  const {
    project,
    product,
    canEditContent,
    isLoading: isAccessLoading,
  } = useProductAccess(projectId, productId);

  const { open: notify } = useNotification();
  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [packagingReleaseId, setPackagingReleaseId] = useState<string | null>(null);

  const handleDownloadPackage = async (rel: Release) => {
    if (rel.status !== 'published' || !project || !product) {
      return;
    }

    setPackagingReleaseId(rel.id);
    try {
      const itemsRes = await supabaseClient
        .from('release_items')
        .select('*')
        .eq('release_id', rel.id);

      if (itemsRes.error || !itemsRes.data) {
        throw new Error(itemsRes.error?.message ?? 'Could not load release items.');
      }

      const releaseItems = itemsRes.data as ReleaseItem[];
      const fileItems = releaseItems.filter(
        (ri) => ri.kind === 'file' && Boolean(ri.storage_path) && Boolean(ri.file_name),
      );

      const publisher =
        rel.profiles?.full_name || rel.profiles?.email || t('common.unknownUser');

      const manifest = await buildReleasePackageManifest({
        release: rel,
        releaseItems,
        publisherName: publisher,
        project: { id: project.id, name: project.name },
        product: { id: product.id, name: product.name, code: product.code },
      });

      const pathMap = mapReleaseItemsToZipPaths(releaseItems);
      const downloadedFiles: Array<{ path: string; data: Uint8Array }> = [];

      for (const item of fileItems) {
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
      const cleanVersion = rel.version_label.replace(/[^\w.-]+/g, '_');
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
      setPackagingReleaseId(null);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !productId) {
        return;
      }
      setIsLoading(true);
      const { data, error } = await supabaseClient
        .from('releases')
        .select('*, profiles:published_by(id, full_name, email, created_at)')
        .eq('project_id', projectId)
        .eq('product_id', productId);

      if (!active) {
        return;
      }
      if (error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(null);
        setReleases((data as Release[]) ?? []);
      }
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, productId]);

  useEffect(() => {
    document.title = `${t('releases.historyTitle')}${
      product?.name ? ` - ${product.name}` : ''
    } | ${t('app.name')}`;
  }, [product?.name, t]);

  const orderedReleases = useMemo(() => {
    return [...releases].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'draft' ? -1 : 1;
      }
      const timeA = a.published_at ?? a.created_at;
      const timeB = b.published_at ?? b.created_at;
      return timeB.localeCompare(timeA);
    });
  }, [releases]);

  const latestPublishedId = useMemo(() => {
    const published = orderedReleases.filter((rel) => rel.status === 'published');
    return published[0]?.id ?? null;
  }, [orderedReleases]);

  if (isAccessLoading || isLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (!project || !product || !projectId || !productId) {
    return <Alert type="error" showIcon message={t('products.notFound')} />;
  }

  const productBase = `/projects/${project.id}/products/${product.id}`;

  return (
    <List
      resource="releases"
      breadcrumb={false}
      title={
        <PageHeaderTitle
          title={t('releases.historyTitle')}
          subtitle={`${project.name} / ${product.name} · ${t('releases.subtitle')}`}
        />
      }
      headerProps={{
        onBack: () => navigate(productBase),
      }}
      headerButtons={() =>
        canEditContent ? (
          <Button
            type="primary"
            icon={<RocketOutlined aria-hidden="true" />}
            onClick={() => navigate(`${productBase}/releases/new`)}
          >
            {t('products.createReleaseButton')}
          </Button>
        ) : null
      }
    >
      {errorMessage && (
        <div role="alert" style={{ marginBottom: tokens.spacing.lg }}>
          <Alert type="error" showIcon message={errorMessage} />
        </div>
      )}

      {orderedReleases.length === 0 ? (
        <Card>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('releases.empty')}>
            {canEditContent && (
              <Button
                type="primary"
                icon={<RocketOutlined aria-hidden="true" />}
                onClick={() => navigate(`${productBase}/releases/new`)}
              >
                {t('releases.emptyAction')}
              </Button>
            )}
          </Empty>
        </Card>
      ) : (
        <Card style={{ paddingTop: tokens.spacing.sm }}>
          <Timeline
            className="revlog-release-timeline"
            items={orderedReleases.map((rel) => {
              const isPublished = rel.status === 'published';
              const isLatest = rel.id === latestPublishedId;
              const publisher =
                rel.profiles?.full_name || rel.profiles?.email || t('common.unknownUser');

              return {
                key: rel.id,
                color: isPublished ? tokens.colors.publishedText : tokens.colors.draftText,
                children: (
                  <Card
                    size="small"
                    style={{
                      marginBottom: tokens.spacing.xs,
                      borderColor: isLatest ? tokens.colors.accent : tokens.colors.border,
                      backgroundColor: tokens.colors.surface,
                    }}
                  >
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
                        {isPublished ? (
                          <Link
                            to={`${productBase}/releases/${rel.id}`}
                            style={{ color: tokens.colors.textPrimary }}
                          >
                            <Typography.Title level={4} style={{ margin: 0 }}>
                              {rel.version_label}
                            </Typography.Title>
                          </Link>
                        ) : (
                          <Typography.Title level={4} style={{ margin: 0 }}>
                            {rel.version_label}
                          </Typography.Title>
                        )}

                        <StatusBadge kind={isPublished ? 'published' : 'draft'} />
                        {isLatest && <StatusBadge kind="latest" />}
                      </div>

                      {isPublished ? (
                        <Space size="small">
                          <Tooltip title={t('releases.downloadPackage')}>
                            <Button
                              size="small"
                              icon={<DownloadOutlined aria-hidden="true" />}
                              loading={packagingReleaseId === rel.id}
                              aria-label={t('releases.downloadPackageAria', {
                                version: rel.version_label,
                              })}
                              onClick={() => void handleDownloadPackage(rel)}
                            />
                          </Tooltip>
                          <Button
                            size="small"
                            icon={<ArrowRightOutlined aria-hidden="true" />}
                            onClick={() => navigate(`${productBase}/releases/${rel.id}`)}
                          >
                            {t('releases.viewRelease')}
                          </Button>
                        </Space>
                      ) : (
                        canEditContent && (
                          <Button
                            size="small"
                            type="primary"
                            icon={<EditOutlined aria-hidden="true" />}
                            onClick={() => navigate(`${productBase}/releases/${rel.id}/edit`)}
                          >
                            {t('releases.resumeDraft')}
                          </Button>
                        )
                      )}
                    </div>

                    <div
                      className="revlog-inline-row revlog-secondary-text"
                      style={{ marginTop: tokens.spacing.xs }}
                    >
                      {isPublished ? (
                        <>
                          <span>{formatDateTime(rel.published_at)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="revlog-mini-avatar">{publisherInitials(publisher)}</span>
                          <span>{publisher}</span>
                        </>
                      ) : (
                        <span>{formatReleaseDate(rel.created_at)}</span>
                      )}
                    </div>

                    {rel.manifest_hash && (
                      <div className="revlog-secondary-text" style={{ marginTop: 4 }}>
                        {t('releases.manifestHashLabel')}:{' '}
                        <span className="revlog-hash">{rel.manifest_hash}</span>
                      </div>
                    )}

                    {rel.notes && (
                      <Typography.Paragraph
                        className="revlog-prose"
                        style={{
                          marginTop: tokens.spacing.xs,
                          marginBottom: 0,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {rel.notes}
                      </Typography.Paragraph>
                    )}
                  </Card>
                ),
              };
            })}
          />
        </Card>
      )}
    </List>
  );
};
