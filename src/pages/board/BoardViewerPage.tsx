import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslate } from '@refinedev/core';
import { PageHeader } from '@refinedev/antd';
import { Alert, Button, Card, Empty, Select, Space, Spin, Typography } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { GerberViewerModal } from '../../components/gerber/GerberViewerModal';
import { isAnyGerberItem } from '../../lib/gerber';
import { useProductAccess, useProjectAccess } from '../../lib/useProjectAccess';
import { supabaseClient } from '../../providers/supabaseClient';
import { tokens } from '../../theme/tokens';
import type { Item, Product, Release, ReleaseItem } from '../../types/database';

export const BoardViewerPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId, productId } = useParams<{ projectId: string; productId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [effectiveProductId, setEffectiveProductId] = useState<string | undefined>(productId);

  const { project, product } = useProductAccess(projectId, effectiveProductId);
  const { project: fallbackProject } = useProjectAccess(projectId);

  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | undefined>(
    searchParams.get('releaseId') ?? undefined,
  );

  const [productItems, setProductItems] = useState<Item[]>([]);
  const [releaseItemsFromDb, setReleaseItemsFromDb] = useState<
    { fileName: string; storagePath: string }[]
  >([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Set document title
  useEffect(() => {
    document.title = `${t('nav.boardViewer')}${product?.name ? ` - ${product.name}` : ''} | ${t('app.name')}`;
  }, [product?.name, t]);

  // Load products of project
  useEffect(() => {
    if (!projectId) {
      return;
    }
    let active = true;
    void (async () => {
      const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('project_id', projectId)
        .eq('archived', false)
        .order('position', { ascending: true });

      if (!active) {
        return;
      }
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      const list = (data as Product[]) ?? [];
      setProducts(list);
      if (!productId && list.length > 0 && !effectiveProductId) {
        setEffectiveProductId(list[0]?.id);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, productId, effectiveProductId]);

  // Load releases and product items for effective product
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !effectiveProductId) {
        if (active) {
          setIsLoading(false);
        }
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);

      const [relRes, itemRes] = await Promise.all([
        supabaseClient
          .from('releases')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', effectiveProductId)
          .order('created_at', { ascending: false }),
        supabaseClient
          .from('items')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', effectiveProductId)
          .eq('archived', false)
          .eq('kind', 'file')
          .order('created_at', { ascending: false }),
      ]);

      if (!active) {
        return;
      }

      if (relRes.error || itemRes.error) {
        setErrorMessage(relRes.error?.message ?? itemRes.error?.message ?? t('common.errorPrefix'));
        setIsLoading(false);
        return;
      }

      const relList = (relRes.data as Release[]) ?? [];
      const itmList = (itemRes.data as Item[]) ?? [];
      setReleases(relList);
      setProductItems(itmList);

      // Default selected release to latest release
      if (!selectedReleaseId && relList.length > 0) {
        setSelectedReleaseId(relList[0]?.id);
      }

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, effectiveProductId, t, selectedReleaseId]);

  const selectedRelease = useMemo(() => {
    if (!selectedReleaseId) {
      return null;
    }
    return releases.find((r) => r.id === selectedReleaseId) ?? null;
  }, [releases, selectedReleaseId]);

  const productGerberItems = useMemo(() => {
    return productItems
      .filter((i) => isAnyGerberItem(i.file_name) && i.storage_path && i.file_name)
      .map((i) => ({ fileName: i.file_name!, storagePath: i.storage_path! }));
  }, [productItems]);

  const effectiveGerberItems = useMemo(() => {
    return selectedRelease ? releaseItemsFromDb : productGerberItems;
  }, [selectedRelease, releaseItemsFromDb, productGerberItems]);

  // Load Gerber files available for the selected release
  useEffect(() => {
    if (!selectedRelease) {
      return;
    }

    let active = true;
    void (async () => {
      const { data, error } = await supabaseClient
        .from('release_items')
        .select('*')
        .eq('release_id', selectedRelease.id);

      if (!active) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      const items = ((data as ReleaseItem[]) ?? [])
        .filter((ri) => isAnyGerberItem(ri.file_name) && ri.storage_path && ri.file_name)
        .map((ri) => ({ fileName: ri.file_name!, storagePath: ri.storage_path! }));

      setReleaseItemsFromDb(items);
    })();

    return () => {
      active = false;
    };
  }, [selectedRelease]);

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

      {/* Selectors Card: Product & Release */}
      <Card style={{ marginBottom: tokens.spacing.md }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: tokens.spacing.md,
            flexWrap: 'wrap',
          }}
        >
          <Space size="middle" wrap>
            {!productId && products.length > 0 && (
              <div>
                <Typography.Text
                  type="secondary"
                  style={{ display: 'block', marginBottom: 4 }}
                >
                  {t('nav.product')}
                </Typography.Text>
                <Select
                  value={effectiveProductId}
                  style={{ minWidth: 200 }}
                  options={products.map((p) => ({ label: p.name, value: p.id }))}
                  onChange={(val) => {
                    setEffectiveProductId(val);
                    setSelectedReleaseId(undefined);
                  }}
                />
              </div>
            )}

            <div>
              <Typography.Text
                type="secondary"
                style={{ display: 'block', marginBottom: 4 }}
              >
                {t('boardViewer.selectRelease')}
              </Typography.Text>
              <Select
                value={selectedReleaseId}
                style={{ minWidth: 260 }}
                placeholder={t('boardViewer.chooseReleasePlaceholder')}
                options={releases.map((r) => ({
                  label: `${r.version_label} (${t(`releases.status.${r.status}`)})`,
                  value: r.id,
                }))}
                onChange={(val) => {
                  setSelectedReleaseId(val);
                  setSearchParams({ releaseId: val });
                }}
              />
            </div>
          </Space>

          {selectedRelease && (
            <Button
              icon={<HistoryOutlined aria-hidden="true" />}
              onClick={() => {
                if (effectiveProductId) {
                  navigate(
                    `/projects/${projectId}/products/${effectiveProductId}/releases/${selectedRelease.id}`,
                  );
                } else {
                  navigate(`/projects/${projectId}/releases/${selectedRelease.id}`);
                }
              }}
            >
              {t('boardViewer.viewReleaseDetails')}
            </Button>
          )}
        </div>
      </Card>

      {/* Viewer Main Body */}
      {isLoading ? (
        <Card style={{ textAlign: 'center', padding: tokens.spacing.xxl }}>
          <Spin />
          <div style={{ marginTop: tokens.spacing.sm }}>
            <Typography.Text type="secondary">{t('gerber.loading')}</Typography.Text>
          </div>
        </Card>
      ) : releases.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
          <Empty description={t('boardViewer.noReleases')}>
            {effectiveProductId && (
              <Button
                type="primary"
                onClick={() =>
                  navigate(`/projects/${projectId}/products/${effectiveProductId}/releases/new`)
                }
              >
                {t('releases.createNew')}
              </Button>
            )}
          </Empty>
        </Card>
      ) : effectiveGerberItems.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: tokens.spacing.xl }}>
          <Empty description={t('boardViewer.noGerberForRelease')}>
            {selectedRelease && effectiveProductId && (
              <Button
                onClick={() =>
                  navigate(
                    `/projects/${projectId}/products/${effectiveProductId}/releases/${selectedRelease.id}`,
                  )
                }
              >
                {t('boardViewer.goToReleaseItems')}
              </Button>
            )}
          </Empty>
        </Card>
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          <GerberViewerModal
            key={selectedRelease?.id ?? 'preview'}
            inline
            multipleItems={effectiveGerberItems}
            releaseId={selectedRelease?.id}
            title={
              selectedRelease
                ? `${selectedRelease.version_label} · ${t('gerber.viewerTitle')}`
                : t('gerber.viewerTitle')
            }
            height={720}
          />
        </Card>
      )}
    </PageHeader>
  );
};
