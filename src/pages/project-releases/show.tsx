import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useTranslate } from '@refinedev/core';
import { Show } from '@refinedev/antd';
import { Alert, Button, Card, Descriptions, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { useProjectAccess } from '../../lib/useProjectAccess';
import { formatDateTime, formatReleaseDate } from '../../lib/format';
import { computeProjectReleaseManifestHash } from '../../lib/manifestHash';
import { supabaseClient } from '../../providers/supabaseClient';
import type { ProjectRelease, ProjectReleaseProduct } from '../../types/database';

export const ProjectReleaseShowPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId, projectReleaseId } = useParams<{
    projectId: string;
    projectReleaseId: string;
  }>();
  const { project, isLoading: isAccessLoading } = useProjectAccess(projectId);

  const [projectRelease, setProjectRelease] = useState<ProjectRelease | null>(null);
  const [bundledProducts, setBundledProducts] = useState<ProjectReleaseProduct[]>([]);
  const [verifiedHash, setVerifiedHash] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !projectReleaseId) {
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);

      const [relRes, bundledRes] = await Promise.all([
        supabaseClient
          .from('project_releases')
          .select('*, profiles:published_by(id, full_name, email, created_at)')
          .eq('id', projectReleaseId)
          .eq('project_id', projectId)
          .maybeSingle(),
        supabaseClient
          .from('project_release_products')
          .select('*')
          .eq('project_release_id', projectReleaseId),
      ]);

      if (!active) {
        return;
      }

      if (relRes.error || bundledRes.error || !relRes.data) {
        setErrorMessage(
          relRes.error?.message ?? bundledRes.error?.message ?? t('projects.notFound'),
        );
        setIsLoading(false);
        return;
      }

      const loadedRelease = relRes.data as ProjectRelease;
      const loadedBundled = (bundledRes.data as ProjectReleaseProduct[]) ?? [];
      setProjectRelease(loadedRelease);
      setBundledProducts(loadedBundled);

      if (loadedRelease.status === 'published' && loadedRelease.manifest_hash) {
        const computed = await computeProjectReleaseManifestHash(
          loadedBundled.map((bp) => ({
            product_code: bp.product_code ?? null,
            product_id: bp.product_id,
            product_name: bp.product_name ?? '',
            product_position: bp.product_position ?? 0,
            release_id: bp.release_id,
            release_manifest_hash: bp.release_manifest_hash ?? '',
            release_version_label: bp.release_version_label ?? '',
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
  }, [projectId, projectReleaseId, t]);

  useEffect(() => {
    if (projectRelease?.version_label) {
      document.title = `${t('projectReleases.detailTitle', {
        version: projectRelease.version_label,
      })}${project?.name ? ` - ${project.name}` : ''} | ${t('app.name')}`;
    }
  }, [project?.name, projectRelease?.version_label, t]);

  const orderedBundledProducts = useMemo(() => {
    return [...bundledProducts].sort((a, b) => {
      const posDiff = (a.product_position ?? 0) - (b.product_position ?? 0);
      if (posDiff !== 0) {
        return posDiff;
      }
      return (a.product_name ?? '').localeCompare(b.product_name ?? '');
    });
  }, [bundledProducts]);

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

  if (isAccessLoading || isLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (!project || !projectId || !projectRelease) {
    return <Alert type="error" showIcon message={errorMessage ?? t('projects.notFound')} />;
  }

  if (projectRelease.status === 'draft') {
    return <Navigate to={`/projects/${projectId}/releases/${projectRelease.id}/edit`} replace />;
  }

  const publisherName =
    projectRelease.profiles?.full_name || projectRelease.profiles?.email || t('common.unknownUser');

  const columns: ColumnsType<ProjectReleaseProduct> = [
    {
      title: t('projectReleases.columns.product'),
      key: 'product',
      render: (_val: unknown, record: ProjectReleaseProduct) => (
        <div className="revlog-inline-row">
          <Link
            to={`/projects/${project.id}/products/${record.product_id}`}
            style={{ fontWeight: 600, color: tokens.colors.textPrimary }}
          >
            {record.product_name ?? t('nav.product')}
          </Link>
          {record.product_code && <Tag bordered>{record.product_code}</Tag>}
        </div>
      ),
    },
    {
      title: t('projectReleases.columns.type'),
      key: 'type',
      width: 170,
      render: (_val: unknown, record: ProjectReleaseProduct) =>
        record.product_type ? (
          <Tag bordered style={{ marginInlineEnd: 0 }}>
            {t(`products.types.${record.product_type}`)}
          </Tag>
        ) : (
          <Typography.Text type="secondary">{t('common.none')}</Typography.Text>
        ),
    },
    {
      title: t('projectReleases.columns.release'),
      key: 'release',
      width: 160,
      render: (_val: unknown, record: ProjectReleaseProduct) => (
        <Link
          to={`/projects/${project.id}/products/${record.product_id}/releases/${record.release_id}`}
          style={{ display: 'inline-flex', alignItems: 'center' }}
        >
          <Tag
            icon={<LockOutlined aria-hidden="true" />}
            bordered
            style={{
              marginInlineEnd: 0,
              backgroundColor: tokens.colors.publishedBg,
              borderColor: tokens.colors.publishedBorder,
              color: tokens.colors.publishedText,
              fontWeight: 500,
            }}
          >
            {record.release_version_label ?? t('common.none')}
          </Tag>
        </Link>
      ),
    },
    {
      title: t('projectReleases.columns.publishedAt'),
      key: 'publishedAt',
      width: 140,
      render: (_val: unknown, record: ProjectReleaseProduct) => (
        <Typography.Text type="secondary">
          {formatReleaseDate(record.release_published_at)}
        </Typography.Text>
      ),
    },
    {
      title: t('projectReleases.columns.manifestHash'),
      key: 'manifestHash',
      width: 300,
      render: (_val: unknown, record: ProjectReleaseProduct) => {
        if (!record.release_manifest_hash) {
          return <Typography.Text type="secondary">{t('common.none')}</Typography.Text>;
        }
        return (
          <div className="revlog-inline-row" style={{ flexWrap: 'nowrap' }}>
            <span className="revlog-hash">{record.release_manifest_hash}</span>
            <Tooltip title={copiedKey === record.id ? t('common.copied') : t('common.copy')}>
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined aria-hidden="true" />}
                aria-label={`${t('common.copy')} ${record.product_name ?? ''}`}
                onClick={() => void handleCopy(record.id, record.release_manifest_hash ?? '')}
              />
            </Tooltip>
          </div>
        );
      },
    },
    {
      title: t('projectReleases.columns.action'),
      key: 'action',
      width: 190,
      align: 'right',
      render: (_val: unknown, record: ProjectReleaseProduct) => (
        <Button
          size="small"
          icon={<ArrowRightOutlined aria-hidden="true" />}
          onClick={() =>
            navigate(
              `/projects/${project.id}/products/${record.product_id}/releases/${record.release_id}`,
            )
          }
        >
          {t('projectReleases.inspectProductRelease')}
        </Button>
      ),
    },
  ];

  return (
    <Show
      resource="project_releases"
      recordItemId={projectRelease.id}
      breadcrumb={false}
      canEdit={false}
      canDelete={false}
      title={
        <PageHeaderTitle
          title={projectRelease.version_label}
          subtitle={`${project.name} · ${t('projectReleases.detailSubtitle')}`}
          badge={<StatusBadge kind="published" />}
        />
      }
      headerProps={{
        onBack: () => navigate(`/projects/${project.id}/releases`),
      }}
      headerButtons={() => (
        <Button
          icon={<HistoryOutlined aria-hidden="true" />}
          onClick={() => navigate(`/projects/${project.id}/releases`)}
        >
          {t('projectReleases.historyTitle')}
        </Button>
      )}
      contentProps={{
        bordered: false,
        style: { background: 'transparent', boxShadow: 'none' },
        styles: { body: { padding: 0 } },
      }}
    >
      <Card style={{ marginBottom: tokens.spacing.lg }}>
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2 }}
          items={[
            {
              key: 'publishedAt',
              label: t('releases.publishedAtLabel'),
              children: formatDateTime(projectRelease.published_at),
            },
            {
              key: 'publishedBy',
              label: t('releases.publishedByLabel'),
              children: publisherName,
            },
            {
              key: 'counts',
              label: t('projectReleases.bundledHeading'),
              span: 2,
              children: (
                <Tag bordered>
                  {t('projectReleases.productCount', { count: orderedBundledProducts.length })}
                </Tag>
              ),
            },
            ...(projectRelease.manifest_hash
              ? [
                  {
                    key: 'manifest',
                    label: t('projectReleases.manifestHashLabel'),
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
                          <span className="revlog-hash">{projectRelease.manifest_hash}</span>
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
                          onClick={() =>
                            void handleCopy('manifest', projectRelease.manifest_hash ?? '')
                          }
                        >
                          {copiedKey === 'manifest' ? t('common.copied') : t('common.copy')}
                        </Button>
                      </div>
                    ),
                  },
                ]
              : []),
            ...(projectRelease.notes
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
                        {projectRelease.notes}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      <Typography.Title level={2} style={{ marginBottom: tokens.spacing.md }}>
        {t('projectReleases.bundledHeading')}
      </Typography.Title>

      <Card styles={{ body: { padding: 0 } }}>
        <div className="revlog-table-region" tabIndex={0}>
          <Table<ProjectReleaseProduct>
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={orderedBundledProducts}
            pagination={false}
          />
        </div>
      </Card>
    </Show>
  );
};
