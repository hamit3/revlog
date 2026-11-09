import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useNotification, useTranslate } from '@refinedev/core';
import { Show } from '@refinedev/antd';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Menu,
  Popconfirm,
  Row,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  DownloadOutlined,
  EditOutlined,
  FileOutlined,
  FolderOutlined,
  HistoryOutlined,
  InboxOutlined,
  LinkOutlined,
  PlusOutlined,
  RocketOutlined,
  SearchOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { useProductAccess } from '../../lib/useProjectAccess';
import { formatFileSize, formatReleaseDate } from '../../lib/format';
import { triggerSignedFileDownload } from '../../lib/storage';
import { supabaseClient } from '../../providers/supabaseClient';
import { ItemDrawer } from '../items/ItemDrawer';
import { pickLatestPublishedRelease } from '../projects/list';
import type { Category, Item, Release } from '../../types/database';

type KindFilter = 'all' | 'file' | 'link';

export const ProductShowPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId, productId } = useParams<{ projectId: string; productId: string }>();
  const { open: notify } = useNotification();
  const {
    project,
    product,
    isOwner,
    canEditContent,
    isLoading: isAccessLoading,
  } = useProductAccess(projectId, productId);

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const loadProductData = useCallback(async () => {
    if (!projectId || !productId) {
      return;
    }
    setIsLoadingData(true);
    setErrorMessage(null);

    const [catRes, itemRes, relRes] = await Promise.all([
      supabaseClient
        .from('categories')
        .select('*')
        .eq('project_id', projectId)
        .eq('product_id', productId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
      supabaseClient
        .from('items')
        .select('*, profiles:created_by(id, full_name, email, created_at)')
        .eq('project_id', projectId)
        .eq('product_id', productId)
        .eq('archived', false)
        .order('created_at', { ascending: false }),
      supabaseClient
        .from('releases')
        .select('*')
        .eq('project_id', projectId)
        .eq('product_id', productId)
        .order('created_at', { ascending: false }),
    ]);

    if (catRes.error || itemRes.error || relRes.error) {
      setErrorMessage(
        catRes.error?.message ??
          itemRes.error?.message ??
          relRes.error?.message ??
          t('common.errorPrefix'),
      );
      setIsLoadingData(false);
      return;
    }

    const loadedCategories = (catRes.data as Category[]) ?? [];
    setCategories(loadedCategories);
    setItems((itemRes.data as Item[]) ?? []);
    setReleases((relRes.data as Release[]) ?? []);

    setSelectedCategoryId((prev) => {
      if (prev && loadedCategories.some((c) => c.id === prev)) {
        return prev;
      }
      return loadedCategories[0]?.id ?? null;
    });

    setIsLoadingData(false);
  }, [projectId, productId, t]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !productId) {
        return;
      }
      const [catRes, itemRes, relRes] = await Promise.all([
        supabaseClient
          .from('categories')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', productId)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true }),
        supabaseClient
          .from('items')
          .select('*, profiles:created_by(id, full_name, email, created_at)')
          .eq('project_id', projectId)
          .eq('product_id', productId)
          .eq('archived', false)
          .order('created_at', { ascending: false }),
        supabaseClient
          .from('releases')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', productId)
          .order('created_at', { ascending: false }),
      ]);

      if (!active) {
        return;
      }
      if (catRes.error || itemRes.error || relRes.error) {
        setErrorMessage(
          catRes.error?.message ??
            itemRes.error?.message ??
            relRes.error?.message ??
            t('common.errorPrefix'),
        );
      } else {
        setErrorMessage(null);
        const loadedCategories = (catRes.data as Category[]) ?? [];
        setCategories(loadedCategories);
        setItems((itemRes.data as Item[]) ?? []);
        setReleases((relRes.data as Release[]) ?? []);
        setSelectedCategoryId((prev) =>
          prev && loadedCategories.some((c) => c.id === prev)
            ? prev
            : (loadedCategories[0]?.id ?? null),
        );
      }
      setIsLoadingData(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, productId, t]);

  useEffect(() => {
    if (product?.name) {
      document.title = `${product.name}${
        project?.name ? ` - ${project.name}` : ''
      } | ${t('app.name')}`;
    }
  }, [product?.name, project?.name, t]);

  const latestPublished = useMemo(() => pickLatestPublishedRelease(releases), [releases]);

  const activeDraft = useMemo(
    () => releases.find((rel) => rel.status === 'draft') ?? null,
    [releases],
  );

  const selectedCategory = useMemo(
    () => categories.find((cat) => cat.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );

  const categoryItemsAll = useMemo(
    () => items.filter((item) => item.category_id === selectedCategoryId),
    [items, selectedCategoryId],
  );

  const filteredCategoryItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    return categoryItemsAll.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const inTitle = item.title.toLowerCase().includes(query);
      const inVersion = item.version_label.toLowerCase().includes(query);
      const inFile = (item.file_name ?? '').toLowerCase().includes(query);
      const inUrl = (item.url ?? '').toLowerCase().includes(query);
      return inTitle || inVersion || inFile || inUrl;
    });
  }, [categoryItemsAll, itemSearch, kindFilter]);

  const hasLinkItemsInView = useMemo(
    () => filteredCategoryItems.some((item) => item.kind === 'link'),
    [filteredCategoryItems],
  );

  const itemCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const categoryMenuItems = useMemo<MenuProps['items']>(() => {
    return categories.map((cat) => {
      const count = itemCountByCategory.get(cat.id) ?? 0;
      const isSelected = cat.id === selectedCategoryId;
      return {
        key: cat.id,
        icon: <FolderOutlined aria-hidden="true" />,
        label: (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: tokens.spacing.xs,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.name}</span>
            <span className={`revlog-count-pill${isSelected ? ' revlog-count-pill-active' : ''}`}>
              {count}
            </span>
          </div>
        ),
      };
    });
  }, [categories, itemCountByCategory, selectedCategoryId]);

  const handleDownload = async (item: Item) => {
    if (!item.storage_path) {
      return;
    }
    setDownloadingId(item.id);
    try {
      await triggerSignedFileDownload(item.storage_path, item.file_name);
    } catch (err) {
      notify?.({
        type: 'error',
        message: err instanceof Error ? err.message : t('items.downloadError'),
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleArchiveItem = async (item: Item) => {
    const { error } = await supabaseClient
      .from('items')
      .update({ archived: true })
      .eq('id', item.id);

    if (error) {
      notify?.({ type: 'error', message: error.message });
      return;
    }

    notify?.({ type: 'success', message: t('items.archivedSuccess') });
    await loadProductData();
  };

  if (isAccessLoading) {
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

  const subtitleParts = [project.name];
  if (product.description) {
    subtitleParts.push(product.description);
  }

  const columns: ColumnsType<Item> = [
    {
      title: t('items.columns.title'),
      dataIndex: 'title',
      key: 'title',
      render: (_val: unknown, record: Item) => (
        <div>
          <Typography.Text strong>{record.title}</Typography.Text>
          {record.kind === 'file' && record.file_name && (
            <div className="revlog-secondary-text">
              {record.file_name}
              {record.sha256 ? (
                <>
                  {' · '}
                  <span className="revlog-hash">{record.sha256.slice(0, 12)}…</span>
                </>
              ) : null}
            </div>
          )}
          {record.kind === 'link' && record.url && (
            <div className="revlog-secondary-text revlog-break-url">{record.url}</div>
          )}
          {record.note && (
            <div className="revlog-secondary-text revlog-prose" style={{ marginTop: 2 }}>
              {record.note}
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('items.columns.kind'),
      dataIndex: 'kind',
      key: 'kind',
      width: 100,
      render: (kind: Item['kind']) => (
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
      title: t('items.columns.version'),
      dataIndex: 'version_label',
      key: 'version_label',
      width: 120,
      render: (value: string) =>
        value ? (
          <Tag bordered style={{ marginInlineEnd: 0 }}>
            {value}
          </Tag>
        ) : (
          <Typography.Text type="secondary">{t('common.none')}</Typography.Text>
        ),
    },
    {
      title: t('items.columns.size'),
      dataIndex: 'file_size',
      key: 'file_size',
      width: 105,
      render: (value: number | null, record: Item) =>
        record.kind === 'file' ? formatFileSize(value) : t('common.none'),
    },
    {
      title: t('items.columns.addedBy'),
      key: 'addedBy',
      width: 150,
      render: (_val: unknown, record: Item) => (
        <Typography.Text>
          {record.profiles?.full_name || record.profiles?.email || t('common.unknownUser')}
        </Typography.Text>
      ),
    },
    {
      title: t('items.columns.date'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 125,
      render: (value: string) => (
        <Typography.Text type="secondary">{formatReleaseDate(value)}</Typography.Text>
      ),
    },
    {
      title: t('items.columns.actions'),
      key: 'actions',
      width: canEditContent ? 190 : 120,
      align: 'right',
      render: (_val: unknown, record: Item) => (
        <Space size={tokens.spacing.xs}>
          {record.kind === 'file' ? (
            <Button
              size="small"
              icon={<DownloadOutlined aria-hidden="true" />}
              loading={downloadingId === record.id}
              aria-label={t('items.downloadAria', { title: record.title })}
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
              aria-label={t('items.openLinkAria', { title: record.title })}
            >
              {t('common.openLink')}
            </Button>
          )}

          {canEditContent && (
            <>
              <Tooltip title={t('common.edit')}>
                <Button
                  size="small"
                  icon={<EditOutlined aria-hidden="true" />}
                  aria-label={t('items.editAria', { title: record.title })}
                  onClick={() => {
                    setEditingItem(record);
                    setDrawerOpen(true);
                  }}
                />
              </Tooltip>
              <Popconfirm
                title={t('items.archiveConfirm', { title: record.title })}
                onConfirm={() => void handleArchiveItem(record)}
                okText={t('common.archive')}
                cancelText={t('common.cancel')}
              >
                <Tooltip title={t('common.archive')}>
                  <Button
                    size="small"
                    danger
                    icon={<InboxOutlined aria-hidden="true" />}
                    aria-label={t('items.archiveAria', { title: record.title })}
                  />
                </Tooltip>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Show
      goBack={false}
      resource="products"
      recordItemId={product.id}
      breadcrumb={false}
      canEdit={false}
      canDelete={false}
      title={
        <PageHeaderTitle
          title={product.name}
          subtitle={subtitleParts.join(' · ')}
          badge={
            <span className="revlog-inline-row">
              {product.code && <Tag bordered>{product.code}</Tag>}
              <Tag bordered>{t(`products.types.${product.product_type}`)}</Tag>
              {product.archived && <StatusBadge kind="archived" />}
            </span>
          }
        />
      }
      headerButtons={() => (
        <Space size={tokens.spacing.sm} wrap>
          <Button
            icon={<HistoryOutlined aria-hidden="true" />}
            onClick={() => navigate(`${productBase}/releases`)}
          >
            {t('nav.productReleases')}
          </Button>
          {canEditContent && activeDraft && (
            <Button onClick={() => navigate(`${productBase}/releases/${activeDraft.id}/edit`)}>
              {t('products.continueDraftButton', {
                version: activeDraft.version_label,
              })}
            </Button>
          )}
          {canEditContent && (
            <Button
              type="primary"
              icon={<RocketOutlined aria-hidden="true" />}
              onClick={() => navigate(`${productBase}/releases/new`)}
            >
              {t('products.createReleaseButton')}
            </Button>
          )}
          {isOwner && (
            <Tooltip title={t('nav.productSettings')}>
              <Button
                icon={<ToolOutlined aria-hidden="true" />}
                aria-label={t('nav.productSettings')}
                onClick={() => navigate(`${productBase}/settings`)}
              />
            </Tooltip>
          )}
        </Space>
      )}
      contentProps={{
        bordered: false,
        style: { background: 'transparent', boxShadow: 'none' },
        styles: { body: { padding: 0 } },
      }}
    >
      {project.archived && (
        <Alert
          type="info"
          showIcon
          message={t('projects.archivedBanner')}
          style={{ marginBottom: tokens.spacing.lg }}
        />
      )}

      {!project.archived && product.archived && (
        <Alert
          type="info"
          showIcon
          message={t('products.archivedBanner')}
          style={{ marginBottom: tokens.spacing.lg }}
        />
      )}

      {errorMessage && (
        <div role="alert" style={{ marginBottom: tokens.spacing.lg }}>
          <Alert type="error" showIcon message={errorMessage} />
        </div>
      )}

      {/* Latest Published Product Release Summary Banner */}
      <Card
        size="small"
        style={{
          marginBottom: tokens.spacing.lg,
          backgroundColor: latestPublished ? tokens.colors.surface : tokens.colors.surfaceSubtle,
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
          {latestPublished ? (
            <div className="revlog-inline-row">
              <StatusBadge kind="published" />
              <Typography.Text strong>
                {t('products.latestReleaseSummary', {
                  version: latestPublished.version_label,
                  date: formatReleaseDate(latestPublished.published_at),
                })}
              </Typography.Text>
              <Link to={`${productBase}/releases/${latestPublished.id}`}>
                {t('releases.viewRelease')}
              </Link>
            </div>
          ) : (
            <Typography.Text type="secondary">{t('products.noReleaseSummary')}</Typography.Text>
          )}

          <div className="revlog-inline-row">
            <Tag bordered>{t('releases.categoryCount', { count: categories.length })}</Tag>
            <Tag bordered>{t('categories.itemCount', { count: items.length })}</Tag>
          </div>
        </div>
      </Card>

      {/* Split View: Module Menu on Left, Module Items Table on Right */}
      <Row gutter={[tokens.spacing.lg, tokens.spacing.lg]} align="top">
        <Col xs={24} lg={6}>
          <Card
            size="small"
            title={t('categories.heading')}
            extra={
              isOwner ? (
                <Link to={`${productBase}/settings`} className="revlog-inline-row">
                  <SettingOutlined aria-hidden="true" />
                  <span>{t('categories.manageLink')}</span>
                </Link>
              ) : undefined
            }
            styles={{ body: { padding: tokens.spacing.xs } }}
          >
            {isLoadingData && categories.length === 0 ? (
              <div style={{ padding: tokens.spacing.lg, textAlign: 'center' }}>
                <Spin size="small" />
              </div>
            ) : categories.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('categories.empty')}
                style={{ margin: `${tokens.spacing.md}px 0` }}
              >
                {isOwner && !project.archived && !product.archived && (
                  <Button size="small" onClick={() => navigate(`${productBase}/settings`)}>
                    {t('categories.emptyOwnerAction')}
                  </Button>
                )}
              </Empty>
            ) : (
              <Menu
                mode="inline"
                selectedKeys={selectedCategoryId ? [selectedCategoryId] : []}
                items={categoryMenuItems}
                onClick={({ key }) => setSelectedCategoryId(key)}
                style={{ borderInlineEnd: 'none' }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={18}>
          <Card styles={{ body: { padding: 0 } }}>
            <div
              style={{
                padding: `${tokens.spacing.md}px ${tokens.spacing.lg}px`,
                borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: tokens.spacing.md,
              }}
            >
              <div>
                <Typography.Title level={3} id="category-items-heading" style={{ margin: 0 }}>
                  {selectedCategory ? selectedCategory.name : t('items.heading')}
                </Typography.Title>
                {selectedCategory?.description && (
                  <div className="revlog-secondary-text revlog-prose">
                    {selectedCategory.description}
                  </div>
                )}
              </div>

              {canEditContent && selectedCategory && (
                <Button
                  type="primary"
                  icon={<PlusOutlined aria-hidden="true" />}
                  onClick={() => {
                    setEditingItem(null);
                    setDrawerOpen(true);
                  }}
                >
                  {t('items.addItem')}
                </Button>
              )}
            </div>

            {selectedCategory && categoryItemsAll.length > 0 && (
              <div
                style={{
                  padding: `${tokens.spacing.sm}px ${tokens.spacing.lg}px`,
                  borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
                  backgroundColor: tokens.colors.surfaceSubtle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: tokens.spacing.sm,
                }}
              >
                <Input
                  allowClear
                  size="small"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  prefix={
                    <SearchOutlined
                      aria-hidden="true"
                      style={{ color: tokens.colors.textSecondary }}
                    />
                  }
                  placeholder={t('items.searchPlaceholder')}
                  aria-label={t('items.searchPlaceholder')}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  style={{ maxWidth: 300 }}
                />

                <Segmented<KindFilter>
                  size="small"
                  value={kindFilter}
                  onChange={setKindFilter}
                  options={[
                    { value: 'all', label: t('items.filterAll') },
                    { value: 'file', label: t('items.filterFiles') },
                    { value: 'link', label: t('items.filterLinks') },
                  ]}
                />
              </div>
            )}

            {isLoadingData && !selectedCategory ? (
              <div style={{ padding: tokens.spacing.xl, textAlign: 'center' }}>
                <Spin />
              </div>
            ) : !selectedCategory ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('items.selectCategoryPrompt')}
                style={{ padding: tokens.spacing.xl }}
              />
            ) : !isLoadingData && categoryItemsAll.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('items.empty')}
                style={{ padding: tokens.spacing.xl }}
              >
                {canEditContent && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined aria-hidden="true" />}
                    onClick={() => {
                      setEditingItem(null);
                      setDrawerOpen(true);
                    }}
                  >
                    {t('items.emptyAction')}
                  </Button>
                )}
              </Empty>
            ) : (
              <>
                <div
                  className="revlog-table-region"
                  role="region"
                  aria-labelledby="category-items-heading"
                  tabIndex={0}
                >
                  <Table<Item>
                    rowKey="id"
                    size="middle"
                    loading={isLoadingData}
                    columns={columns}
                    dataSource={filteredCategoryItems}
                    pagination={false}
                    locale={{
                      emptyText: (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={t('items.emptyFiltered')}
                        />
                      ),
                    }}
                  />
                </div>
                {hasLinkItemsInView && (
                  <div
                    className="revlog-secondary-text"
                    style={{
                      padding: `${tokens.spacing.sm}px ${tokens.spacing.lg}px`,
                      borderTop: `1px solid ${tokens.colors.borderSubtle}`,
                    }}
                  >
                    {t('items.linkUnverifiedNote')}
                  </div>
                )}
              </>
            )}
          </Card>
        </Col>
      </Row>

      <ItemDrawer
        open={drawerOpen}
        projectId={project.id}
        productId={product.id}
        categories={categories}
        defaultCategoryId={selectedCategoryId}
        editingItem={editingItem}
        onClose={() => {
          setDrawerOpen(false);
          setEditingItem(null);
        }}
        onSaved={loadProductData}
      />
    </Show>
  );
};
