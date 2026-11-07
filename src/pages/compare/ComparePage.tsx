import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useList, useTranslate } from '@refinedev/core';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileOutlined,
  LinkOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  SearchOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { formatFileSize, formatReleaseDate } from '../../lib/format';
import {
  compareBomParts,
  compareProjectReleases,
  compareReleaseItems,
  type BomPartDiff,
  type BomRow,
  type DiffStatus,
  type ProjectReleaseProductDiff,
  type ReleaseItemDiff,
} from '../../lib/releaseCompare';
import type {
  BomPnpCheckRun,
  ProjectRelease,
  ProjectReleaseProduct,
  Release,
  ReleaseItem,
} from '../../types/database';

function StatusTag({ status }: { status: DiffStatus }) {
  const t = useTranslate();
  if (status === 'added') {
    return (
      <Tag
        icon={<PlusCircleOutlined aria-hidden="true" />}
        style={{
          color: tokens.colors.publishedText,
          backgroundColor: tokens.colors.publishedBg,
          borderColor: tokens.colors.borderSubtle,
        }}
      >
        {t('compare.added')}
      </Tag>
    );
  }
  if (status === 'removed') {
    return (
      <Tag
        icon={<CloseCircleOutlined aria-hidden="true" />}
        style={{
          color: tokens.colors.errorText,
          backgroundColor: tokens.colors.errorBg,
          borderColor: tokens.colors.borderSubtle,
        }}
      >
        {t('compare.removed')}
      </Tag>
    );
  }
  if (status === 'changed') {
    return (
      <Tag
        icon={<ExclamationCircleOutlined aria-hidden="true" />}
        style={{
          color: tokens.colors.warningText,
          backgroundColor: tokens.colors.warningBg,
          borderColor: tokens.colors.borderSubtle,
        }}
      >
        {t('compare.changed')}
      </Tag>
    );
  }
  return (
    <Tag
      icon={<MinusCircleOutlined aria-hidden="true" />}
      style={{
        color: tokens.colors.textSecondary,
        backgroundColor: tokens.colors.surfaceSubtle,
        borderColor: tokens.colors.borderSubtle,
      }}
    >
      {t('compare.unchanged')}
    </Tag>
  );
}

export const ComparePage: React.FC = () => {
  const t = useTranslate();
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, productId } = useParams<{ projectId?: string; productId?: string }>();

  // Parse query params for direct links: ?base=xxx&target=yyy
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryBase = queryParams.get('base') ?? undefined;
  const queryTarget = queryParams.get('target') ?? undefined;

  const [selectedBaseId, setSelectedBaseId] = useState<string | undefined>(queryBase);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>(queryTarget);
  const [statusFilter, setStatusFilter] = useState<DiffStatus | 'all'>('all');
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [bomSearchQuery, setBomSearchQuery] = useState<string>('');

  // 1. Fetch published product releases if in product scope
  const { query: productReleasesQuery } = useList<Release>({
    resource: 'releases',
    pagination: { mode: 'off' },
    filters: productId
      ? [
          { field: 'product_id', operator: 'eq', value: productId },
          { field: 'status', operator: 'eq', value: 'published' },
        ]
      : [],
    sorters: [{ field: 'published_at', order: 'desc' }],
    queryOptions: {
      enabled: Boolean(projectId && productId),
    },
  });

  // 2. Fetch published project releases if at system scope
  const { query: projectReleasesQuery } = useList<ProjectRelease>({
    resource: 'project_releases',
    pagination: { mode: 'off' },
    filters:
      projectId && !productId
        ? [
            { field: 'project_id', operator: 'eq', value: projectId },
            { field: 'status', operator: 'eq', value: 'published' },
          ]
        : [],
    sorters: [{ field: 'published_at', order: 'desc' }],
    queryOptions: {
      enabled: Boolean(projectId && !productId),
    },
  });

  const publishedReleases = useMemo(() => {
    if (productId) {
      return productReleasesQuery.data?.data ?? [];
    }
    return projectReleasesQuery.data?.data ?? [];
  }, [productId, productReleasesQuery.data?.data, projectReleasesQuery.data?.data]);

  const isLoadingReleases = productId
    ? productReleasesQuery.isLoading
    : projectReleasesQuery.isLoading;

  // Auto-select latest and previous published releases if not set
  const effectiveTargetId = useMemo(() => {
    if (selectedTargetId && publishedReleases.some((r) => r.id === selectedTargetId)) {
      return selectedTargetId;
    }
    return publishedReleases[0]?.id;
  }, [publishedReleases, selectedTargetId]);

  const effectiveBaseId = useMemo(() => {
    if (selectedBaseId && publishedReleases.some((r) => r.id === selectedBaseId)) {
      return selectedBaseId;
    }
    return publishedReleases[1]?.id ?? publishedReleases[0]?.id;
  }, [publishedReleases, selectedBaseId]);

  // Sync state and query string
  const handleSelectBase = (id: string) => {
    setSelectedBaseId(id);
    const params = new URLSearchParams(location.search);
    params.set('base', id);
    if (effectiveTargetId) {
      params.set('target', effectiveTargetId);
    }
    navigate({ search: params.toString() }, { replace: true });
  };

  const handleSelectTarget = (id: string) => {
    setSelectedTargetId(id);
    const params = new URLSearchParams(location.search);
    params.set('target', id);
    if (effectiveBaseId) {
      params.set('base', effectiveBaseId);
    }
    navigate({ search: params.toString() }, { replace: true });
  };

  const handleSwap = () => {
    if (!effectiveBaseId || !effectiveTargetId) {
      return;
    }
    setSelectedBaseId(effectiveTargetId);
    setSelectedTargetId(effectiveBaseId);
    const params = new URLSearchParams(location.search);
    params.set('base', effectiveTargetId);
    params.set('target', effectiveBaseId);
    navigate({ search: params.toString() }, { replace: true });
  };

  // 3. Load product release_items snapshots
  const { query: baseItemsQuery } = useList<ReleaseItem>({
    resource: 'release_items',
    pagination: { mode: 'off' },
    filters: effectiveBaseId ? [{ field: 'release_id', operator: 'eq', value: effectiveBaseId }] : [],
    queryOptions: {
      enabled: Boolean(productId && effectiveBaseId),
    },
  });

  const { query: targetItemsQuery } = useList<ReleaseItem>({
    resource: 'release_items',
    pagination: { mode: 'off' },
    filters: effectiveTargetId
      ? [{ field: 'release_id', operator: 'eq', value: effectiveTargetId }]
      : [],
    queryOptions: {
      enabled: Boolean(productId && effectiveTargetId),
    },
  });

  // 4. Load BOM check runs attached to releases
  const { query: bomRunsQuery } = useList<BomPnpCheckRun>({
    resource: 'bom_pnp_check_runs',
    pagination: { mode: 'off' },
    filters:
      effectiveBaseId && effectiveTargetId
        ? [{ field: 'release_id', operator: 'in', value: [effectiveBaseId, effectiveTargetId] }]
        : [],
    queryOptions: {
      enabled: Boolean(productId && effectiveBaseId && effectiveTargetId),
    },
  });

  // 5. Load project_release_products snapshots for system releases
  const { query: baseProjectProductsQuery } = useList<ProjectReleaseProduct>({
    resource: 'project_release_products',
    pagination: { mode: 'off' },
    filters: effectiveBaseId
      ? [{ field: 'project_release_id', operator: 'eq', value: effectiveBaseId }]
      : [],
    queryOptions: {
      enabled: Boolean(!productId && effectiveBaseId),
    },
  });

  const { query: targetProjectProductsQuery } = useList<ProjectReleaseProduct>({
    resource: 'project_release_products',
    pagination: { mode: 'off' },
    filters: effectiveTargetId
      ? [{ field: 'project_release_id', operator: 'eq', value: effectiveTargetId }]
      : [],
    queryOptions: {
      enabled: Boolean(!productId && effectiveTargetId),
    },
  });

  const baseItems = useMemo(() => baseItemsQuery.data?.data ?? [], [baseItemsQuery.data?.data]);
  const targetItems = useMemo(
    () => targetItemsQuery.data?.data ?? [],
    [targetItemsQuery.data?.data],
  );

  const bomRuns = useMemo(() => bomRunsQuery.data?.data ?? [], [bomRunsQuery.data?.data]);
  const baseBomRun = useMemo(
    () => bomRuns.find((r) => r.release_id === effectiveBaseId) ?? null,
    [bomRuns, effectiveBaseId],
  );
  const targetBomRun = useMemo(
    () => bomRuns.find((r) => r.release_id === effectiveTargetId) ?? null,
    [bomRuns, effectiveTargetId],
  );

  const baseProjectProducts = useMemo(
    () => baseProjectProductsQuery.data?.data ?? [],
    [baseProjectProductsQuery.data?.data],
  );
  const targetProjectProducts = useMemo(
    () => targetProjectProductsQuery.data?.data ?? [],
    [targetProjectProductsQuery.data?.data],
  );

  // Compute Item Diffs deterministically
  const itemDiffResult = useMemo(
    () => compareReleaseItems(baseItems, targetItems),
    [baseItems, targetItems],
  );

  // Extract and expand BOM rows from check runs
  const baseBomRows = useMemo<BomRow[]>(() => {
    if (!baseBomRun?.parsed_bom) {
      return [];
    }
    return baseBomRun.parsed_bom.flatMap((row) =>
      row.designators.map((d) => ({
        designator: d,
        mpn: row.mpn,
        value: row.value,
        footprint: row.footprint,
        dnp: row.dnp,
        description: row.manufacturer,
      })),
    );
  }, [baseBomRun]);

  const targetBomRows = useMemo<BomRow[]>(() => {
    if (!targetBomRun?.parsed_bom) {
      return [];
    }
    return targetBomRun.parsed_bom.flatMap((row) =>
      row.designators.map((d) => ({
        designator: d,
        mpn: row.mpn,
        value: row.value,
        footprint: row.footprint,
        dnp: row.dnp,
        description: row.manufacturer,
      })),
    );
  }, [targetBomRun]);

  const hasBothBomData = Boolean(baseBomRun && targetBomRun);

  // Compute BOM Diffs deterministically
  const bomDiffResult = useMemo(
    () => (hasBothBomData ? compareBomParts(baseBomRows, targetBomRows) : null),
    [baseBomRows, hasBothBomData, targetBomRows],
  );

  // Compute System Product Diffs deterministically
  const systemDiffResult = useMemo(
    () =>
      !productId ? compareProjectReleases(baseProjectProducts, targetProjectProducts) : null,
    [baseProjectProducts, productId, targetProjectProducts],
  );

  // Filtered Item Diffs for presentation
  const filteredItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    return itemDiffResult.allItems.filter((diff) => {
      if (statusFilter !== 'all' && diff.status !== statusFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        diff.title.toLowerCase().includes(q) ||
        diff.categoryName.toLowerCase().includes(q) ||
        (diff.targetItem?.file_name ?? diff.baseItem?.file_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [itemDiffResult.allItems, itemSearchQuery, statusFilter]);

  // Filtered BOM Diffs for presentation
  const filteredBomParts = useMemo(() => {
    if (!bomDiffResult) {
      return [];
    }
    const q = bomSearchQuery.trim().toLowerCase();
    return bomDiffResult.parts.filter((diff) => {
      if (statusFilter !== 'all' && diff.status !== statusFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      const mpn = diff.targetPart?.mpn ?? diff.basePart?.mpn ?? '';
      return diff.designator.toLowerCase().includes(q) || mpn.toLowerCase().includes(q);
    });
  }, [bomDiffResult, bomSearchQuery, statusFilter]);

  const isLoadingSnapshots =
    baseItemsQuery.isLoading ||
    targetItemsQuery.isLoading ||
    bomRunsQuery.isLoading ||
    baseProjectProductsQuery.isLoading ||
    targetProjectProductsQuery.isLoading;

  const itemColumns: ColumnsType<ReleaseItemDiff> = [
    {
      title: t('compare.category'),
      dataIndex: 'categoryName',
      key: 'categoryName',
      width: 140,
    },
    {
      title: t('compare.statusAll'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: DiffStatus) => <StatusTag status={status} />,
    },
    {
      title: t('compare.item'),
      key: 'title',
      width: 200,
      render: (_: unknown, diff: ReleaseItemDiff) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spacing.xs }}>
          {(diff.targetItem?.kind ?? diff.baseItem?.kind) === 'file' ? (
            <FileOutlined aria-hidden="true" style={{ color: tokens.colors.accent }} />
          ) : (
            <LinkOutlined aria-hidden="true" style={{ color: tokens.colors.accent }} />
          )}
          <span style={{ fontWeight: 500 }}>{diff.title}</span>
        </span>
      ),
    },
    {
      title: t('compare.version'),
      key: 'version',
      width: 150,
      render: (_: unknown, diff: ReleaseItemDiff) => {
        const baseV = diff.baseItem?.version_label ?? '—';
        const targetV = diff.targetItem?.version_label ?? '—';
        if (diff.status === 'changed' && diff.fieldChanges?.versionLabelChanged) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spacing.xs }}>
              <span className="revlog-secondary-text">{baseV}</span>
              <ArrowRightOutlined aria-hidden="true" />
              <span style={{ fontWeight: 600, color: tokens.colors.warningText }}>{targetV}</span>
            </span>
          );
        }
        return <span>{targetV !== '—' ? targetV : baseV}</span>;
      },
    },
    {
      title: t('compare.sha256'),
      key: 'sha256',
      width: 260,
      render: (_: unknown, diff: ReleaseItemDiff) => {
        const baseSha = diff.baseItem?.sha256;
        const targetSha = diff.targetItem?.sha256;
        if (!baseSha && !targetSha) {
          return <span className="revlog-secondary-text">—</span>;
        }
        if (diff.status === 'changed' && diff.fieldChanges?.sha256Changed) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {baseSha && (
                <div style={{ textDecoration: 'line-through' }} className="revlog-secondary-text">
                  <span className="revlog-hash">{baseSha.slice(0, 16)}...</span>
                </div>
              )}
              {targetSha && (
                <div>
                  <Tag
                    style={{
                      fontFamily: 'monospace',
                      color: tokens.colors.warningText,
                      backgroundColor: tokens.colors.warningBg,
                    }}
                  >
                    {targetSha.slice(0, 16)}...
                  </Tag>
                </div>
              )}
            </div>
          );
        }
        const sha = targetSha ?? baseSha;
        return <span className="revlog-hash">{sha ? `${sha.slice(0, 16)}...` : '—'}</span>;
      },
    },
    {
      title: t('compare.url'),
      key: 'url',
      render: (_: unknown, diff: ReleaseItemDiff) => {
        const baseTarget = diff.targetItem ?? diff.baseItem;
        if (baseTarget?.kind === 'link') {
          const baseU = diff.baseItem?.url ?? '—';
          const targetU = diff.targetItem?.url ?? '—';
          if (diff.status === 'changed' && diff.fieldChanges?.urlChanged) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="revlog-secondary-text" style={{ textDecoration: 'line-through' }}>
                  {baseU}
                </span>
                <span style={{ fontWeight: 500, color: tokens.colors.warningText }}>{targetU}</span>
              </div>
            );
          }
          return <span>{targetU !== '—' ? targetU : baseU}</span>;
        }
        const baseName = diff.baseItem?.file_name ?? '—';
        const targetName = diff.targetItem?.file_name ?? '—';
        if (diff.status === 'changed' && diff.fieldChanges?.fileNameChanged) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spacing.xs }}>
              <span className="revlog-secondary-text">{baseName}</span>
              <ArrowRightOutlined aria-hidden="true" />
              <span style={{ fontWeight: 500 }}>{targetName}</span>
            </span>
          );
        }
        return <span>{targetName !== '—' ? targetName : baseName}</span>;
      },
    },
    {
      title: t('compare.size'),
      key: 'size',
      width: 120,
      render: (_: unknown, diff: ReleaseItemDiff) => {
        const baseSize = diff.baseItem?.file_size;
        const targetSize = diff.targetItem?.file_size;
        if (baseSize === undefined && targetSize === undefined) {
          return <span className="revlog-secondary-text">—</span>;
        }
        if (
          diff.status === 'changed' &&
          diff.fieldChanges?.fileSizeChanged &&
          typeof baseSize === 'number' &&
          typeof targetSize === 'number'
        ) {
          const delta = targetSize - baseSize;
          const sign = delta > 0 ? '+' : '';
          return (
            <Tooltip title={`${sign}${formatFileSize(delta)}`}>
              <span>
                {formatFileSize(baseSize)} → {formatFileSize(targetSize)}
              </span>
            </Tooltip>
          );
        }
        return <span>{formatFileSize(targetSize ?? baseSize)}</span>;
      },
    },
  ];

  const bomColumns: ColumnsType<BomPartDiff> = [
    {
      title: t('compare.designator'),
      dataIndex: 'designator',
      key: 'designator',
      width: 120,
      render: (des: string) => <span style={{ fontWeight: 600 }}>{des}</span>,
    },
    {
      title: t('compare.statusAll'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: DiffStatus) => <StatusTag status={status} />,
    },
    {
      title: t('compare.mpn'),
      key: 'mpn',
      render: (_: unknown, diff: BomPartDiff) => {
        const baseM = diff.basePart?.mpn ?? '—';
        const targetM = diff.targetPart?.mpn ?? '—';
        if (diff.status === 'changed' && diff.fieldChanges?.mpnChanged) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spacing.xs }}>
              <span className="revlog-secondary-text">{baseM}</span>
              <ArrowRightOutlined aria-hidden="true" />
              <span style={{ fontWeight: 600, color: tokens.colors.warningText }}>{targetM}</span>
            </span>
          );
        }
        return <span>{targetM !== '—' ? targetM : baseM}</span>;
      },
    },
    {
      title: t('compare.value'),
      key: 'value',
      render: (_: unknown, diff: BomPartDiff) => {
        const baseV = diff.basePart?.value ?? '—';
        const targetV = diff.targetPart?.value ?? '—';
        if (diff.status === 'changed' && diff.fieldChanges?.valueChanged) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spacing.xs }}>
              <span className="revlog-secondary-text">{baseV}</span>
              <ArrowRightOutlined aria-hidden="true" />
              <span style={{ fontWeight: 600, color: tokens.colors.warningText }}>{targetV}</span>
            </span>
          );
        }
        return <span>{targetV !== '—' ? targetV : baseV}</span>;
      },
    },
    {
      title: t('compare.footprint'),
      key: 'footprint',
      render: (_: unknown, diff: BomPartDiff) => {
        const baseF = diff.basePart?.footprint ?? '—';
        const targetF = diff.targetPart?.footprint ?? '—';
        if (diff.status === 'changed' && diff.fieldChanges?.footprintChanged) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spacing.xs }}>
              <span className="revlog-secondary-text">{baseF}</span>
              <ArrowRightOutlined aria-hidden="true" />
              <span style={{ fontWeight: 600 }}>{targetF}</span>
            </span>
          );
        }
        return <span>{targetF !== '—' ? targetF : baseF}</span>;
      },
    },
    {
      title: t('compare.dnp'),
      key: 'dnp',
      width: 120,
      render: (_: unknown, diff: BomPartDiff) => {
        const isTargetDnp = diff.targetPart?.dnp;
        const isBaseDnp = diff.basePart?.dnp;
        if (diff.status === 'changed' && diff.fieldChanges?.dnpChanged) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spacing.xs }}>
              <span className="revlog-secondary-text">{isBaseDnp ? 'DNP' : 'Fitted'}</span>
              <ArrowRightOutlined aria-hidden="true" />
              <Tag color={isTargetDnp ? 'warning' : 'default'}>
                {isTargetDnp ? 'DNP' : 'Fitted'}
              </Tag>
            </span>
          );
        }
        const activeDnp = isTargetDnp ?? isBaseDnp;
        return activeDnp ? <Tag color="warning">DNP</Tag> : <span>Fitted</span>;
      },
    },
  ];

  const systemColumns: ColumnsType<ProjectReleaseProductDiff> = [
    {
      title: t('compare.item'),
      dataIndex: 'productName',
      key: 'productName',
      render: (name: string, record) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spacing.xs }}>
          <span style={{ fontWeight: 600 }}>{name}</span>
          {record.productCode && <Tag bordered>{record.productCode}</Tag>}
        </span>
      ),
    },
    {
      title: t('compare.statusAll'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: DiffStatus) => <StatusTag status={status} />,
    },
    {
      title: t('compare.version'),
      key: 'version',
      render: (_: unknown, record) => {
        const baseV = record.baseProduct?.release_version_label ?? '—';
        const targetV = record.targetProduct?.release_version_label ?? '—';
        if (record.status === 'changed' && record.versionChanged) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.spacing.xs }}>
              <span className="revlog-secondary-text">{baseV}</span>
              <ArrowRightOutlined aria-hidden="true" />
              <span style={{ fontWeight: 600, color: tokens.colors.warningText }}>{targetV}</span>
            </span>
          );
        }
        return <span>{targetV !== '—' ? targetV : baseV}</span>;
      },
    },
    {
      title: t('compare.sha256'),
      key: 'manifestHash',
      render: (_: unknown, record) => {
        const baseHash = record.baseProduct?.release_manifest_hash;
        const targetHash = record.targetProduct?.release_manifest_hash;
        if (!baseHash && !targetHash) {
          return <span className="revlog-secondary-text">—</span>;
        }
        if (record.status === 'changed' && record.manifestHashChanged) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {baseHash && (
                <div style={{ textDecoration: 'line-through' }} className="revlog-secondary-text">
                  <span className="revlog-hash">{baseHash.slice(0, 16)}...</span>
                </div>
              )}
              {targetHash && (
                <div>
                  <Tag
                    style={{
                      fontFamily: 'monospace',
                      color: tokens.colors.warningText,
                      backgroundColor: tokens.colors.warningBg,
                    }}
                  >
                    {targetHash.slice(0, 16)}...
                  </Tag>
                </div>
              )}
            </div>
          );
        }
        const hash = targetHash ?? baseHash;
        return <span className="revlog-hash">{hash ? `${hash.slice(0, 16)}...` : '—'}</span>;
      },
    },
  ];

  if (isLoadingReleases) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (publishedReleases.length < 2) {
    return (
      <div style={{ paddingBlock: tokens.spacing.lg }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('compare.pageTitle')}
        </Typography.Title>
        <div className="revlog-secondary-text" style={{ marginBottom: tokens.spacing.lg }}>
          {t('compare.pageSubtitle')}
        </div>
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('compare.notEnoughReleases')}
          />
        </Card>
      </div>
    );
  }

  const releaseOptions = publishedReleases.map((r) => ({
    label: `${r.version_label} (${formatReleaseDate(r.published_at)})`,
    value: r.id,
  }));

  const activeSummary = productId
    ? itemDiffResult.summary
    : (systemDiffResult?.summary ?? itemDiffResult.summary);

  return (
    <div style={{ paddingBlock: tokens.spacing.sm }}>
      {/* Page Heading */}
      <div style={{ marginBottom: tokens.spacing.md }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('compare.pageTitle')}
        </Typography.Title>
        <div className="revlog-secondary-text">{t('compare.pageSubtitle')}</div>
      </div>

      {/* Release Selection Toolbar */}
      <Card style={{ marginBottom: tokens.spacing.md }}>
        <Row gutter={[tokens.spacing.md, tokens.spacing.sm]} align="middle">
          <Col xs={24} sm={11}>
            <div style={{ marginBottom: 4 }}>
              <Typography.Text type="secondary" strong>
                {t('compare.baseReleaseLabel')}
              </Typography.Text>
            </div>
            <Select
              style={{ width: '100%' }}
              value={effectiveBaseId}
              options={releaseOptions}
              onChange={handleSelectBase}
              aria-label={t('compare.baseReleaseLabel')}
            />
          </Col>

          <Col xs={24} sm={2} style={{ textAlign: 'center', paddingTop: 18 }}>
            <Tooltip title={t('compare.swapReleases')}>
              <Button
                icon={<SwapOutlined aria-hidden="true" />}
                onClick={handleSwap}
                aria-label={t('compare.swapReleases')}
              />
            </Tooltip>
          </Col>

          <Col xs={24} sm={11}>
            <div style={{ marginBottom: 4 }}>
              <Typography.Text type="secondary" strong>
                {t('compare.targetReleaseLabel')}
              </Typography.Text>
            </div>
            <Select
              style={{ width: '100%' }}
              value={effectiveTargetId}
              options={releaseOptions}
              onChange={handleSelectTarget}
              aria-label={t('compare.targetReleaseLabel')}
            />
          </Col>
        </Row>
      </Card>

      {/* Comparison Summary Cards */}
      <Row gutter={[tokens.spacing.md, tokens.spacing.md]} style={{ marginBottom: tokens.spacing.md }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderLeft: `3px solid ${tokens.colors.publishedText}` }}>
            <div className="revlog-secondary-text">{t('compare.added')}</div>
            <Typography.Title level={3} style={{ margin: 0, color: tokens.colors.publishedText }}>
              +{activeSummary.addedCount}
            </Typography.Title>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderLeft: `3px solid ${tokens.colors.errorText}` }}>
            <div className="revlog-secondary-text">{t('compare.removed')}</div>
            <Typography.Title level={3} style={{ margin: 0, color: tokens.colors.errorText }}>
              -{activeSummary.removedCount}
            </Typography.Title>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderLeft: `3px solid ${tokens.colors.warningText}` }}>
            <div className="revlog-secondary-text">{t('compare.changed')}</div>
            <Typography.Title level={3} style={{ margin: 0, color: tokens.colors.warningText }}>
              ~{activeSummary.changedCount}
            </Typography.Title>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderLeft: `3px solid ${tokens.colors.borderSubtle}` }}>
            <div className="revlog-secondary-text">{t('compare.unchanged')}</div>
            <Typography.Title level={3} style={{ margin: 0, color: tokens.colors.textSecondary }}>
              {activeSummary.unchangedCount}
            </Typography.Title>
          </Card>
        </Col>
      </Row>

      {/* Filter and Search Bar */}
      <Card size="small" style={{ marginBottom: tokens.spacing.md }}>
        <Row gutter={[tokens.spacing.md, tokens.spacing.sm]} align="middle" justify="space-between">
          <Col xs={24} sm={14}>
            <Space wrap>
              {(['all', 'changed', 'added', 'removed', 'unchanged'] as const).map((status) => {
                const isSelected = statusFilter === status;
                return (
                  <Button
                    key={status}
                    size="small"
                    type={isSelected ? 'primary' : 'default'}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status === 'all'
                      ? t('compare.statusAll')
                      : status === 'added'
                        ? `${t('compare.added')} (${activeSummary.addedCount})`
                        : status === 'removed'
                          ? `${t('compare.removed')} (${activeSummary.removedCount})`
                          : status === 'changed'
                            ? `${t('compare.changed')} (${activeSummary.changedCount})`
                            : `${t('compare.unchanged')} (${activeSummary.unchangedCount})`}
                  </Button>
                );
              })}
            </Space>
          </Col>
          <Col xs={24} sm={10} style={{ textAlign: 'right' }}>
            <Input
              size="small"
              allowClear
              prefix={<SearchOutlined aria-hidden="true" />}
              placeholder={t('compare.searchItemsPlaceholder')}
              aria-label={t('compare.searchItemsPlaceholder')}
              value={itemSearchQuery}
              onChange={(e) => {
                setItemSearchQuery(e.target.value);
                setBomSearchQuery(e.target.value);
              }}
              style={{ maxWidth: 280 }}
            />
          </Col>
        </Row>
      </Card>

      {isLoadingSnapshots ? (
        <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : (
        <Tabs
          defaultActiveKey={productId ? 'items' : 'system'}
          items={[
            ...(productId
              ? [
                  {
                    key: 'items',
                    label: (
                      <span>
                        {t('compare.itemsTab')} ({filteredItems.length})
                      </span>
                    ),
                    children: (
                      <Card>
                        {filteredItems.length === 0 ? (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={t('compare.noItemsFound')}
                          />
                        ) : (
                          <Table<ReleaseItemDiff>
                            dataSource={filteredItems}
                            columns={itemColumns}
                            rowKey="item_id"
                            pagination={false}
                            size="small"
                          />
                        )}
                      </Card>
                    ),
                  },
                  {
                    key: 'bom',
                    label: (
                      <span>
                        {t('compare.bomTab')}{' '}
                        {hasBothBomData && `(${filteredBomParts.length})`}
                      </span>
                    ),
                    children: (
                      <Card>
                        {!hasBothBomData ? (
                          <Alert
                            type="info"
                            showIcon
                            icon={<CheckCircleOutlined aria-hidden="true" />}
                            message={t('compare.noBomData')}
                          />
                        ) : filteredBomParts.length === 0 ? (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={t('compare.noItemsFound')}
                          />
                        ) : (
                          <Table<BomPartDiff>
                            dataSource={filteredBomParts}
                            columns={bomColumns}
                            rowKey="designator"
                            pagination={{ pageSize: 50, showSizeChanger: true }}
                            size="small"
                          />
                        )}
                      </Card>
                    ),
                  },
                ]
              : [
                  {
                    key: 'system',
                    label: (
                      <span>
                        {t('compare.systemTab')} (
                        {systemDiffResult?.products.length ?? 0})
                      </span>
                    ),
                    children: (
                      <Card>
                        {systemDiffResult?.products.length === 0 ? (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={t('compare.noItemsFound')}
                          />
                        ) : (
                          <Table<ProjectReleaseProductDiff>
                            dataSource={systemDiffResult?.products ?? []}
                            columns={systemColumns}
                            rowKey="productId"
                            pagination={false}
                            size="small"
                          />
                        )}
                      </Card>
                    ),
                  },
                ]),
          ]}
        />
      )}
    </div>
  );
};
