import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useGetIdentity, useNotification, useTranslate } from '@refinedev/core';
import { Show } from '@refinedev/antd';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Input,
  Modal,
  Popconfirm,
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
  CheckSquareOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  FileOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  LinkOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { ShareLinkModal } from './ShareLinkModal';
import { useProductAccess } from '../../lib/useProjectAccess';
import { formatDateTime, formatFileSize } from '../../lib/format';
import { computeManifestHash } from '../../lib/manifestHash';
import { groupReleaseItemsByCategory } from '../../lib/releaseHelpers';
import { evaluateReleaseCompleteness } from '../../lib/completeness';
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
import type {
  BomPnpCheckRun,
  Release,
  ReleaseChecklistRule,
  ReleaseItem,
} from '../../types/database';

export const ReleaseShowPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId, productId, releaseId } = useParams<{
    projectId: string;
    productId: string;
    releaseId: string;
  }>();
  const { open: notify } = useNotification();
  const {
    project,
    product,
    canEditContent,
    isLoading: isAccessLoading,
  } = useProductAccess(projectId, productId);

  const { data: identity } = useGetIdentity<{
    id: string;
    email?: string;
    full_name?: string;
  }>();
  const currentUserId = identity?.id;

  const [release, setRelease] = useState<Release | null>(null);
  const [releaseItems, setReleaseItems] = useState<ReleaseItem[]>([]);
  const [checklistRules, setChecklistRules] = useState<ReleaseChecklistRule[]>([]);
  const [verifiedHash, setVerifiedHash] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [bomPnpRun, setBomPnpRun] = useState<BomPnpCheckRun | null>(null);
  const [isPackaging, setIsPackaging] = useState<boolean>(false);
  const [packagingStatus, setPackagingStatus] = useState<string | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

  const [isApproveModalOpen, setIsApproveModalOpen] = useState<boolean>(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);
  const [approvalNotes, setApprovalNotes] = useState<string>('');
  const [rejectionNotes, setRejectionNotes] = useState<string>('');
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  const [refreshIndex, setRefreshIndex] = useState<number>(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !productId || !releaseId) {
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);

      const [relRes, itemsRes, checkRunRes, rulesRes] = await Promise.all([
        supabaseClient
          .from('releases')
          .select(
            '*, profiles:published_by(id, full_name, email, created_at), submitted_by_profile:submitted_for_review_by(id, full_name, email), approved_by_profile:approved_by(id, full_name, email)',
          )
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
        supabaseClient
          .from('release_checklist_rules')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }),
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
      const loadedRules = (rulesRes.data as ReleaseChecklistRule[]) ?? [];
      setRelease(loadedRelease);
      setReleaseItems(loadedItems);
      setChecklistRules(loadedRules);

      if (checkRunRes.data) {
        setBomPnpRun(checkRunRes.data as BomPnpCheckRun);
      } else {
        setBomPnpRun(null);
      }

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
      } else {
        setVerifiedHash(null);
      }

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, productId, releaseId, refreshIndex, t]);

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

  const completenessCategories = useMemo(
    () => groupedCategories.map((g) => ({ id: g.categoryName, name: g.categoryName })),
    [groupedCategories],
  );

  const completenessEvaluation = useMemo(() => {
    return evaluateReleaseCompleteness(checklistRules, completenessCategories, releaseItems);
  }, [checklistRules, completenessCategories, releaseItems]);

  const hasLinkItems = useMemo(() => releaseItems.some((ri) => ri.kind === 'link'), [releaseItems]);

  const isAuthorOrSubmitter = Boolean(
    currentUserId &&
    release &&
    (currentUserId === release.submitted_for_review_by ||
      (release.created_by && currentUserId === release.created_by)),
  );

  const isPublished = release?.status === 'published';
  const isInReview = release?.status === 'in_review';
  const isApproved = release?.status === 'approved';

  const productBase = project && product ? `/projects/${project.id}/products/${product.id}` : '';

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
    setPackagingStatus(t('releases.packagingProgress', { current: 0, total: fileItems.length }));

    try {
      const publisherName =
        release.profiles?.full_name || release.profiles?.email || t('common.unknownUser');

      const manifest = await buildReleasePackageManifest({
        release,
        releaseItems,
        publisherName,
        project: { id: project.id, name: project.name },
        product: { id: product.id, name: product.name, code: product.code },
      });

      const pathMap = mapReleaseItemsToZipPaths(releaseItems);
      const downloadedFiles: Array<{ path: string; data: Uint8Array }> = [];

      for (let i = 0; i < fileItems.length; i++) {
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

      setPackagingStatus(t('releases.packagingBuildingZip'));
      const zipBytes = buildReleasePackageZip({
        manifest,
        files: downloadedFiles,
      });

      const cleanPrefix = (product.code || product.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const cleanVersion = release.version_label.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${cleanPrefix}-${cleanVersion}.zip`;

      const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
      triggerBlobDownload(blob, filename);
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

  const handleApprove = async () => {
    if (!release) return;
    setIsActionLoading(true);
    const { error } = await supabaseClient.rpc('approve_release', {
      p_release_id: release.id,
      p_notes: approvalNotes.trim() || null,
    });
    setIsActionLoading(false);
    if (error) {
      notify?.({ type: 'error', message: error.message });
      return;
    }
    notify?.({ type: 'success', message: t('approval.approvedSuccess') });
    setIsApproveModalOpen(false);
    setApprovalNotes('');
    setRefreshIndex((prev) => prev + 1);
  };

  const handleReject = async () => {
    if (!release || !productBase) return;
    setIsActionLoading(true);
    const { error } = await supabaseClient.rpc('reject_release', {
      p_release_id: release.id,
      p_notes: rejectionNotes.trim() || null,
    });
    setIsActionLoading(false);
    if (error) {
      notify?.({ type: 'error', message: error.message });
      return;
    }
    notify?.({ type: 'success', message: t('approval.changesRequestedSuccess') });
    setIsRejectModalOpen(false);
    setRejectionNotes('');
    navigate(`${productBase}/releases/${release.id}/edit`);
  };

  const handleCancelReview = async () => {
    if (!release || !productBase) return;
    setIsActionLoading(true);
    const { error } = await supabaseClient.rpc('cancel_release_review', {
      p_release_id: release.id,
    });
    setIsActionLoading(false);
    if (error) {
      notify?.({ type: 'error', message: error.message });
      return;
    }
    notify?.({ type: 'success', message: t('approval.reviewCancelledSuccess') });
    navigate(`${productBase}/releases/${release.id}/edit`);
  };

  const handlePublish = async () => {
    if (!release) return;
    setIsActionLoading(true);
    const { error } = await supabaseClient.rpc('publish_release', {
      p_release_id: release.id,
    });
    setIsActionLoading(false);
    if (error) {
      notify?.({ type: 'error', message: error.message });
      return;
    }
    notify?.({ type: 'success', message: t('releases.publishedSuccess') });
    setRefreshIndex((prev) => prev + 1);
  };

  if (isLoading || isAccessLoading) {
    return (
      <div style={{ padding: tokens.spacing.xl, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!project || !product || !projectId || !productId || !release) {
    return <Alert type="error" showIcon message={errorMessage ?? t('products.notFound')} />;
  }

  if (release.status === 'draft') {
    return <Navigate to={`${productBase}/releases/${release.id}/edit`} replace />;
  }

  const publisherName =
    release.profiles?.full_name || release.profiles?.email || t('common.unknownUser');
  const submitterName =
    release.submitted_by_profile?.full_name ||
    release.submitted_by_profile?.email ||
    t('common.unknownUser');
  const approverName =
    release.approved_by_profile?.full_name ||
    release.approved_by_profile?.email ||
    t('common.unknownUser');

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
          subtitle={`${project.name} / ${product.name} · ${
            isPublished
              ? t('releases.detailSubtitle')
              : isInReview
                ? t('approval.inReviewNotice')
                : t('approval.readyToPublish')
          }`}
          badge={<StatusBadge kind={release.status} />}
        />
      }
      headerProps={{
        onBack: () => navigate(`${productBase}/releases`),
      }}
      headerButtons={() => (
        <Space size="small">
          {isPublished && (
            <>
              <Button
                type="primary"
                icon={<DownloadOutlined aria-hidden="true" />}
                loading={isPackaging}
                aria-label={t('releases.downloadPackageAria', {
                  version: release.version_label,
                })}
                onClick={() => void handleDownloadPackage()}
              >
                {isPackaging
                  ? packagingStatus || t('releases.downloadPackage')
                  : t('releases.downloadPackage')}
              </Button>
              {canEditContent && (
                <Button
                  icon={<ShareAltOutlined aria-hidden="true" />}
                  onClick={() => setIsShareModalOpen(true)}
                >
                  {t('share.button')}
                </Button>
              )}
            </>
          )}
          {isApproved && canEditContent && (
            <Button
              type="primary"
              icon={<LockOutlined aria-hidden="true" />}
              loading={isActionLoading}
              onClick={() => void handlePublish()}
            >
              {t('releases.publishButton')}
            </Button>
          )}
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
      {/* Approval & Review Workflow Banners */}
      {isInReview && (
        <Card
          style={{
            marginBottom: tokens.spacing.lg,
            backgroundColor: isAuthorOrSubmitter
              ? tokens.colors.surfaceSubtle
              : tokens.colors.warningBg,
            borderColor: isAuthorOrSubmitter ? tokens.colors.border : tokens.colors.warningBorder,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: tokens.spacing.md,
            }}
          >
            <div>
              <div className="revlog-inline-row">
                <EyeOutlined
                  aria-hidden="true"
                  style={{
                    color: isAuthorOrSubmitter ? tokens.colors.accent : tokens.colors.warningText,
                  }}
                />
                <Typography.Text
                  strong
                  style={{
                    color: isAuthorOrSubmitter
                      ? tokens.colors.textPrimary
                      : tokens.colors.warningText,
                  }}
                >
                  {t('approval.inReviewNotice')}
                </Typography.Text>
              </div>
              <div
                style={{
                  marginTop: tokens.spacing.xs,
                  color: tokens.colors.textSecondary,
                }}
              >
                {isAuthorOrSubmitter
                  ? t('approval.waitingForReviewer')
                  : t('approval.needsSecondPersonApproval')}
              </div>
              {isAuthorOrSubmitter && (
                <div
                  style={{
                    marginTop: tokens.spacing.xs,
                    color: tokens.colors.textSecondary,
                  }}
                >
                  {t('approval.selfApprovalForbidden')}
                </div>
              )}
              {release.submitted_by_profile && (
                <div
                  style={{
                    marginTop: tokens.spacing.xs,
                    color: tokens.colors.textSecondary,
                  }}
                >
                  {t('releases.submittedByLabel')}: {submitterName}
                  {release.submitted_for_review_at &&
                    ` · ${formatDateTime(release.submitted_for_review_at)}`}
                </div>
              )}
            </div>

            {canEditContent && (
              <Space size="small">
                {isAuthorOrSubmitter ? (
                  <Popconfirm
                    title={t('approval.cancelReviewButton')}
                    description={t('approval.reviewCancelledSuccess')}
                    onConfirm={() => void handleCancelReview()}
                  >
                    <Button
                      danger
                      icon={<CloseCircleOutlined aria-hidden="true" />}
                      loading={isActionLoading}
                    >
                      {t('approval.cancelReviewButton')}
                    </Button>
                  </Popconfirm>
                ) : (
                  <>
                    <Button
                      danger
                      icon={<CloseCircleOutlined aria-hidden="true" />}
                      onClick={() => setIsRejectModalOpen(true)}
                    >
                      {t('approval.requestChangesButton')}
                    </Button>
                    <Button
                      type="primary"
                      icon={<SafetyCertificateOutlined aria-hidden="true" />}
                      onClick={() => setIsApproveModalOpen(true)}
                    >
                      {t('approval.approveButton')}
                    </Button>
                  </>
                )}
              </Space>
            )}
          </div>
        </Card>
      )}

      {isApproved && (
        <Card
          style={{
            marginBottom: tokens.spacing.lg,
            backgroundColor: tokens.colors.publishedBg,
            borderColor: tokens.colors.publishedBorder,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: tokens.spacing.md,
            }}
          >
            <div>
              <div className="revlog-inline-row">
                <CheckCircleOutlined
                  aria-hidden="true"
                  style={{ color: tokens.colors.publishedText }}
                />
                <Typography.Text strong style={{ color: tokens.colors.publishedText }}>
                  {t('approval.readyToPublish')}
                </Typography.Text>
              </div>
              <div
                style={{
                  marginTop: tokens.spacing.xs,
                  color: tokens.colors.textSecondary,
                }}
              >
                {t('approval.approvedBanner', {
                  name: approverName,
                  date: formatDateTime(release.approved_at),
                })}
              </div>
              {release.approval_notes && (
                <div
                  style={{
                    marginTop: tokens.spacing.xs,
                    color: tokens.colors.textSecondary,
                  }}
                >
                  {t('releases.approvalNotesHeading')}: {release.approval_notes}
                </div>
              )}
            </div>

            {canEditContent && (
              <Space size="small">
                <Button
                  danger
                  icon={<CloseCircleOutlined aria-hidden="true" />}
                  onClick={() => setIsRejectModalOpen(true)}
                >
                  {t('approval.requestChangesButton')}
                </Button>
                <Button
                  type="primary"
                  icon={<LockOutlined aria-hidden="true" />}
                  loading={isActionLoading}
                  onClick={() => void handlePublish()}
                >
                  {t('releases.publishButton')}
                </Button>
              </Space>
            )}
          </div>
        </Card>
      )}

      {/* Metadata Card */}
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
            ...(isPublished
              ? [
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
                ]
              : []),
            ...(isInReview
              ? [
                  {
                    key: 'submittedAt',
                    label: t('releases.submittedAtLabel'),
                    children: formatDateTime(release.submitted_for_review_at),
                  },
                  {
                    key: 'submittedBy',
                    label: t('releases.submittedByLabel'),
                    children: submitterName,
                  },
                ]
              : []),
            ...(isApproved
              ? [
                  {
                    key: 'approvedAt',
                    label: t('releases.approvedAtLabel'),
                    children: formatDateTime(release.approved_at),
                  },
                  {
                    key: 'approvedBy',
                    label: t('releases.approvedByLabel'),
                    children: approverName,
                  },
                ]
              : []),
            {
              key: 'counts',
              label: t('releases.contentsHeading'),
              children: (
                <div className="revlog-inline-row">
                  <Tag bordered>{t('releases.artifactCount', { count: releaseItems.length })}</Tag>
                  <Tag bordered>
                    {t('releases.categoryCount', {
                      count: groupedCategories.length,
                    })}
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
            ...(isApproved && release.approval_notes
              ? [
                  {
                    key: 'approval_notes',
                    label: t('releases.approvalNotesHeading'),
                    span: 2,
                    children: (
                      <span
                        className="revlog-prose"
                        style={{ display: 'block', whiteSpace: 'pre-wrap' }}
                      >
                        {release.approval_notes}
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
              {t('bomPnp.summaryBomCount', {
                count: bomPnpRun.summary.bom_component_count,
              })}
            </Tag>
            <Tag bordered>
              {t('bomPnp.summaryPnpCount', {
                count: bomPnpRun.summary.pnp_row_count,
              })}
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

      {/* Completeness Checklist Card */}
      <Card
        title={
          <span className="revlog-inline-row">
            <CheckSquareOutlined aria-hidden="true" />
            <span>{t('releases.completenessCardHeading')}</span>
            {checklistRules.length > 0 && (
              <span className="revlog-count-pill">{checklistRules.length}</span>
            )}
          </span>
        }
        style={{ marginBottom: tokens.spacing.lg }}
      >
        {checklistRules.length === 0 ? (
          <Typography.Text type="secondary">{t('releases.completenessNoRules')}</Typography.Text>
        ) : (
          <div>
            {completenessEvaluation.blockingMissingCount > 0 ? (
              <Alert
                type="error"
                showIcon
                icon={<LockOutlined aria-hidden="true" />}
                message={t('releases.completenessBlockingAlert')}
                style={{ marginBottom: tokens.spacing.md }}
              />
            ) : completenessEvaluation.warningMissingCount > 0 ? (
              <Alert
                type="warning"
                showIcon
                icon={<ExclamationCircleOutlined aria-hidden="true" />}
                message={t('releases.completenessWarningNotice', {
                  count: completenessEvaluation.warningMissingCount,
                })}
                style={{ marginBottom: tokens.spacing.md }}
              />
            ) : (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined aria-hidden="true" />}
                message={t('releases.completenessAllPassed', {
                  count: checklistRules.length,
                })}
                style={{ marginBottom: tokens.spacing.md }}
              />
            )}

            <div className="revlog-table-region" tabIndex={0}>
              <Table
                rowKey={(r) => r.rule.id}
                size="small"
                pagination={false}
                dataSource={completenessEvaluation.results}
                columns={[
                  {
                    title: t('checklist.categoryLabel'),
                    key: 'category',
                    width: 140,
                    render: (_val, record) => <Tag bordered>{record.rule.category_name}</Tag>,
                  },
                  {
                    title: t('checklist.patternLabel'),
                    key: 'pattern',
                    render: (_val, record) => (
                      <div>
                        <Typography.Text strong>{record.rule.item_name_pattern}</Typography.Text>
                        {record.rule.description && (
                          <Typography.Text type="secondary" style={{ display: 'block' }}>
                            {record.rule.description}
                          </Typography.Text>
                        )}
                      </div>
                    ),
                  },
                  {
                    title: t('checklist.severityLabel'),
                    key: 'severity',
                    width: 140,
                    render: (_val, record) =>
                      record.rule.severity === 'blocking' ? (
                        <Tag
                          bordered
                          style={{
                            backgroundColor: tokens.colors.errorBg,
                            borderColor: tokens.colors.errorBorder,
                            color: tokens.colors.errorText,
                          }}
                        >
                          {t('checklist.severityBlocking')}
                        </Tag>
                      ) : (
                        <Tag
                          bordered
                          style={{
                            backgroundColor: tokens.colors.warningBg,
                            borderColor: tokens.colors.warningBorder,
                            color: tokens.colors.warningText,
                          }}
                        >
                          {t('checklist.severityWarning')}
                        </Tag>
                      ),
                  },
                  {
                    title: t('checklist.statusLabel'),
                    key: 'status',
                    width: 140,
                    render: (_val, record) =>
                      record.satisfied ? (
                        <Tag
                          bordered
                          style={{
                            backgroundColor: tokens.colors.publishedBg,
                            borderColor: tokens.colors.publishedBorder,
                            color: tokens.colors.publishedText,
                          }}
                        >
                          <CheckCircleOutlined aria-hidden="true" style={{ marginInlineEnd: 4 }} />
                          {t('checklist.statusPassed')}
                        </Tag>
                      ) : (
                        <Tag
                          bordered
                          style={{
                            backgroundColor:
                              record.rule.severity === 'blocking'
                                ? tokens.colors.errorBg
                                : tokens.colors.warningBg,
                            borderColor:
                              record.rule.severity === 'blocking'
                                ? tokens.colors.errorBorder
                                : tokens.colors.warningBorder,
                            color:
                              record.rule.severity === 'blocking'
                                ? tokens.colors.errorText
                                : tokens.colors.warningText,
                          }}
                        >
                          <ExclamationCircleOutlined
                            aria-hidden="true"
                            style={{ marginInlineEnd: 4 }}
                          />
                          {t('checklist.statusMissing')}
                        </Tag>
                      ),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Card>

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

      {/* Confirmation Modals */}
      <Modal
        open={isApproveModalOpen}
        title={t('approval.approveButton')}
        okText={t('approval.approveButton')}
        cancelText={t('common.cancel')}
        confirmLoading={isActionLoading}
        onCancel={() => setIsApproveModalOpen(false)}
        onOk={() => void handleApprove()}
      >
        <div style={{ marginTop: tokens.spacing.sm }}>
          <div style={{ marginBottom: tokens.spacing.xs }}>
            <Typography.Text strong>{t('approval.approvalNotesLabel')}</Typography.Text>
          </div>
          <Input.TextArea
            rows={3}
            value={approvalNotes}
            onChange={(e) => setApprovalNotes(e.target.value)}
            placeholder={t('approval.approvalNotesPlaceholder')}
            maxLength={500}
          />
        </div>
      </Modal>

      <Modal
        open={isRejectModalOpen}
        title={t('approval.requestChangesButton')}
        okText={t('approval.requestChangesButton')}
        okButtonProps={{ danger: true }}
        cancelText={t('common.cancel')}
        confirmLoading={isActionLoading}
        onCancel={() => setIsRejectModalOpen(false)}
        onOk={() => void handleReject()}
      >
        <div style={{ marginTop: tokens.spacing.sm }}>
          <div style={{ marginBottom: tokens.spacing.xs }}>
            <Typography.Text strong>{t('approval.rejectionNotesLabel')}</Typography.Text>
          </div>
          <Input.TextArea
            rows={3}
            value={rejectionNotes}
            onChange={(e) => setRejectionNotes(e.target.value)}
            placeholder={t('approval.rejectionNotesPlaceholder')}
            maxLength={500}
          />
        </div>
      </Modal>

      <ShareLinkModal
        open={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        releaseId={release.id}
        releaseVersion={release.version_label}
      />
    </Show>
  );
};
