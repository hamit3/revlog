import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslate } from '@refinedev/core';
import { Show } from '@refinedev/antd';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowRightOutlined,
  HistoryOutlined,
  LockOutlined,
  PlusOutlined,
  RocketOutlined,
  SearchOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { getProductTypeIcon } from '../../components/navigationConfig';
import { useProjectAccess } from '../../lib/useProjectAccess';
import { formatReleaseDate } from '../../lib/format';
import { supabaseClient } from '../../providers/supabaseClient';
import { pickLatestPublishedRelease } from './list';
import type { Category, Item, Product, ProjectRelease, Release } from '../../types/database';

export const ProjectShowPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const {
    project,
    isOwner,
    canEditContent,
    isLoading: isAccessLoading,
  } = useProjectAccess(projectId);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Pick<Category, 'id' | 'product_id'>[]>([]);
  const [items, setItems] = useState<Pick<Item, 'id' | 'product_id'>[]>([]);
  const [productReleases, setProductReleases] = useState<
    Pick<Release, 'id' | 'product_id' | 'version_label' | 'status' | 'published_at'>[]
  >([]);
  const [projectReleases, setProjectReleases] = useState<ProjectRelease[]>([]);

  const [productSearch, setProductSearch] = useState<string>('');
  const [showArchivedProducts, setShowArchivedProducts] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId) {
        return;
      }

      const [prodRes, catRes, itemRes, prodRelRes, projRelRes] = await Promise.all([
        supabaseClient
          .from('products')
          .select('*')
          .eq('project_id', projectId)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true }),
        supabaseClient.from('categories').select('id, product_id').eq('project_id', projectId),
        supabaseClient
          .from('items')
          .select('id, product_id')
          .eq('project_id', projectId)
          .eq('archived', false),
        supabaseClient
          .from('releases')
          .select('id, product_id, version_label, status, published_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabaseClient
          .from('project_releases')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

      if (!active) {
        return;
      }

      const firstErr =
        prodRes.error ?? catRes.error ?? itemRes.error ?? prodRelRes.error ?? projRelRes.error;
      if (firstErr) {
        setErrorMessage(firstErr.message);
      } else {
        setErrorMessage(null);
        setProducts((prodRes.data as Product[]) ?? []);
        setCategories((catRes.data as Pick<Category, 'id' | 'product_id'>[]) ?? []);
        setItems((itemRes.data as Pick<Item, 'id' | 'product_id'>[]) ?? []);
        setProductReleases(
          (prodRelRes.data as Pick<
            Release,
            'id' | 'product_id' | 'version_label' | 'status' | 'published_at'
          >[]) ?? [],
        );
        setProjectReleases((projRelRes.data as ProjectRelease[]) ?? []);
      }
      setIsLoadingData(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (project?.name) {
      document.title = `${project.name} | ${t('app.name')}`;
    }
  }, [project?.name, t]);

  const latestSystemRelease = useMemo(
    () => pickLatestPublishedRelease(projectReleases),
    [projectReleases],
  );

  const activeSystemDraft = useMemo(
    () => projectReleases.find((rel) => rel.status === 'draft') ?? null,
    [projectReleases],
  );

  const hasAnyArchivedProducts = useMemo(() => products.some((p) => p.archived), [products]);
  const activeProductsCount = useMemo(() => products.filter((p) => !p.archived).length, [products]);

  const moduleCountByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of categories) {
      map.set(c.product_id, (map.get(c.product_id) ?? 0) + 1);
    }
    return map;
  }, [categories]);

  const itemCountByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) {
      map.set(i.product_id, (map.get(i.product_id) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const releasesByProduct = useMemo(() => {
    const map = new Map<
      string,
      Pick<Release, 'id' | 'product_id' | 'version_label' | 'status' | 'published_at'>[]
    >();
    for (const r of productReleases) {
      const list = map.get(r.product_id) ?? [];
      list.push(r);
      map.set(r.product_id, list);
    }
    return map;
  }, [productReleases]);

  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return products.filter((prod) => {
      if (!showArchivedProducts && prod.archived) {
        return false;
      }
      if (!query) {
        return true;
      }
      const inName = prod.name.toLowerCase().includes(query);
      const inCode = (prod.code ?? '').toLowerCase().includes(query);
      const inDesc = (prod.description ?? '').toLowerCase().includes(query);
      return inName || inCode || inDesc;
    });
  }, [products, showArchivedProducts, productSearch]);

  if (isAccessLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (!project || !projectId) {
    return <Alert type="error" showIcon message={t('projects.notFound')} />;
  }

  return (
    <Show
      resource="projects"
      recordItemId={project.id}
      breadcrumb={false}
      canEdit={false}
      canDelete={false}
      title={
        <PageHeaderTitle
          title={project.name}
          subtitle={project.description}
          badge={project.archived ? <StatusBadge kind="archived" /> : undefined}
        />
      }
      headerButtons={() => (
        <Space size={tokens.spacing.sm} wrap>
          <Button
            icon={<HistoryOutlined aria-hidden="true" />}
            onClick={() => navigate(`/projects/${project.id}/releases`)}
          >
            {t('nav.projectReleases')}
          </Button>
          {canEditContent && activeSystemDraft && (
            <Button
              onClick={() =>
                navigate(`/projects/${project.id}/releases/${activeSystemDraft.id}/edit`)
              }
            >
              {t('projects.continueDraftButton', {
                version: activeSystemDraft.version_label,
              })}
            </Button>
          )}
          {canEditContent && (
            <Button
              icon={<RocketOutlined aria-hidden="true" />}
              onClick={() => navigate(`/projects/${project.id}/releases/new`)}
            >
              {t('projects.createReleaseButton')}
            </Button>
          )}
          {isOwner && (
            <Tooltip title={t('nav.settings')}>
              <Button
                icon={<SettingOutlined aria-hidden="true" />}
                aria-label={t('nav.settings')}
                onClick={() => navigate(`/projects/${project.id}/settings`)}
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

      {errorMessage && (
        <div role="alert" style={{ marginBottom: tokens.spacing.lg }}>
          <Alert type="error" showIcon message={errorMessage} />
        </div>
      )}

      {/* System / Project Release Baseline Banner */}
      <Card
        size="small"
        style={{
          marginBottom: tokens.spacing.lg,
          backgroundColor: latestSystemRelease
            ? tokens.colors.surface
            : tokens.colors.surfaceSubtle,
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
          {latestSystemRelease ? (
            <div className="revlog-inline-row">
              <StatusBadge kind="published" />
              <Typography.Text strong>
                {t('projects.latestReleaseSummary', {
                  version: latestSystemRelease.version_label,
                  date: formatReleaseDate(latestSystemRelease.published_at),
                })}
              </Typography.Text>
              <Link to={`/projects/${project.id}/releases/${latestSystemRelease.id}`}>
                {t('releases.viewRelease')}
              </Link>
            </div>
          ) : (
            <Typography.Text type="secondary">{t('projects.noReleaseSummary')}</Typography.Text>
          )}

          <div className="revlog-inline-row">
            <Tag bordered>{t('projects.productCount', { count: activeProductsCount })}</Tag>
            <Tag bordered>{t('products.itemCount', { count: items.length })}</Tag>
          </div>
        </div>
      </Card>

      {/* Products Section Header & Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: tokens.spacing.md,
          marginBottom: tokens.spacing.md,
        }}
      >
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {t('products.heading')}
          </Typography.Title>
          <div className="revlog-secondary-text revlog-prose">{t('products.subtitle')}</div>
        </div>

        {(products.length > 0 || hasAnyArchivedProducts) && (
          <div className="revlog-inline-row" style={{ gap: tokens.spacing.md }}>
            {products.length > 1 && (
              <Input
                allowClear
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                prefix={
                  <SearchOutlined
                    aria-hidden="true"
                    style={{ color: tokens.colors.textSecondary }}
                  />
                }
                placeholder={t('products.searchPlaceholder')}
                aria-label={t('products.searchPlaceholder')}
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="search"
                style={{ width: 260 }}
              />
            )}

            {hasAnyArchivedProducts && (
              <div className="revlog-inline-row">
                <Switch
                  id="toggle-archived-products"
                  size="small"
                  checked={showArchivedProducts}
                  onChange={setShowArchivedProducts}
                />
                <label
                  htmlFor="toggle-archived-products"
                  className="revlog-secondary-text"
                  style={{ cursor: 'pointer' }}
                >
                  {t('products.showArchived')}
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {isLoadingData ? (
        <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : products.length === 0 ? (
        <Card>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('products.empty')}>
            {isOwner && !project.archived && (
              <Button
                type="primary"
                icon={<PlusOutlined aria-hidden="true" />}
                onClick={() => navigate(`/projects/${project.id}/products/new`)}
              >
                {t('products.emptyAction')}
              </Button>
            )}
          </Empty>
        </Card>
      ) : visibleProducts.length === 0 ? (
        <Card>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('products.emptyFiltered')} />
        </Card>
      ) : (
        <Row gutter={[tokens.spacing.lg, tokens.spacing.lg]}>
          {visibleProducts.map((prod) => {
            const productBase = `/projects/${project.id}/products/${prod.id}`;
            const prodRels = releasesByProduct.get(prod.id) ?? [];
            const latestProdRel = pickLatestPublishedRelease(prodRels);
            const activeProdDraft = prodRels.find((r) => r.status === 'draft') ?? null;
            const modCount = moduleCountByProduct.get(prod.id) ?? 0;
            const itemCount = itemCountByProduct.get(prod.id) ?? 0;

            return (
              <Col key={prod.id} xs={24} md={12} xl={8}>
                <article className="revlog-product-card">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.sm }}>
                    {/* Card Header: Icon + Name Link + Code Tag + Status */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: tokens.spacing.sm,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: tokens.radius.sm,
                            backgroundColor: tokens.colors.surfaceSelected,
                            color: tokens.colors.accent,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getProductTypeIcon(prod.product_type)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="revlog-inline-row">
                            <h3 className="revlog-card-heading">
                              <Link
                                to={productBase}
                                className="revlog-card-link"
                                style={{ color: tokens.colors.textPrimary }}
                              >
                                {prod.name}
                              </Link>
                            </h3>
                            {prod.code && <Tag bordered>{prod.code}</Tag>}
                            {prod.archived && <StatusBadge kind="archived" />}
                          </div>
                        </div>
                      </div>

                      {isOwner && (
                        <Tooltip title={t('nav.productSettings')}>
                          <Button
                            size="small"
                            type="text"
                            icon={<ToolOutlined aria-hidden="true" />}
                            aria-label={`${t('nav.productSettings')}: ${prod.name}`}
                            onClick={() => navigate(`${productBase}/settings`)}
                          />
                        </Tooltip>
                      )}
                    </div>

                    {/* Domain & Counts */}
                    <div className="revlog-inline-row">
                      <Tag
                        bordered
                        style={{
                          backgroundColor: tokens.colors.surfaceSubtle,
                          color: tokens.colors.textSecondary,
                        }}
                      >
                        {t(`products.types.${prod.product_type}`)}
                      </Tag>
                      <Tag bordered>{t('products.moduleCount', { count: modCount })}</Tag>
                      <Tag bordered>{t('products.itemCount', { count: itemCount })}</Tag>
                    </div>

                    {/* Description */}
                    {prod.description && (
                      <div className="revlog-secondary-text revlog-prose">{prod.description}</div>
                    )}
                  </div>

                  {/* Release Status & Separate Native Action Controls */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: tokens.spacing.sm,
                      paddingTop: tokens.spacing.sm,
                      borderTop: `1px solid ${tokens.colors.borderSubtle}`,
                    }}
                  >
                    <div className="revlog-inline-row" style={{ justifyContent: 'space-between' }}>
                      {latestProdRel ? (
                        <div className="revlog-inline-row">
                          <Link
                            to={`${productBase}/releases/${latestProdRel.id}`}
                            style={{ display: 'inline-flex', alignItems: 'center' }}
                          >
                            <Tag
                              icon={<LockOutlined aria-hidden="true" />}
                              bordered
                              style={{
                                backgroundColor: tokens.colors.publishedBg,
                                borderColor: tokens.colors.publishedBorder,
                                color: tokens.colors.publishedText,
                                fontWeight: 500,
                              }}
                            >
                              {latestProdRel.version_label}
                            </Tag>
                          </Link>
                          <span className="revlog-secondary-text">
                            {formatReleaseDate(latestProdRel.published_at)}
                          </span>
                        </div>
                      ) : (
                        <span className="revlog-secondary-text">{t('products.noReleases')}</span>
                      )}

                      {activeProdDraft && (
                        <Link to={`${productBase}/releases/${activeProdDraft.id}/edit`}>
                          <Tag bordered>
                            {t('products.draftBadge', { version: activeProdDraft.version_label })}
                          </Tag>
                        </Link>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: tokens.spacing.xs,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Space size={tokens.spacing.xs} wrap>
                        <Button
                          size="small"
                          type="primary"
                          icon={<ArrowRightOutlined aria-hidden="true" />}
                          onClick={() => navigate(productBase)}
                        >
                          {t('products.openProduct')}
                        </Button>
                        <Button
                          size="small"
                          icon={<HistoryOutlined aria-hidden="true" />}
                          onClick={() => navigate(`${productBase}/releases`)}
                        >
                          {t('products.releaseHistory')}
                        </Button>
                      </Space>

                      {canEditContent && !prod.archived && (
                        <Button
                          size="small"
                          icon={<RocketOutlined aria-hidden="true" />}
                          onClick={() => navigate(`${productBase}/releases/new`)}
                        >
                          {t('products.createRelease')}
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              </Col>
            );
          })}
        </Row>
      )}
    </Show>
  );
};
