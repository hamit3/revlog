import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useNotification, useTranslate } from '@refinedev/core';
import { PageHeader } from '@refinedev/antd';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Empty,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { getProductTypeIcon } from '../../components/navigationConfig';
import { useProjectAccess } from '../../lib/useProjectAccess';
import { formatReleaseDate } from '../../lib/format';
import {
  computeProjectReleaseWarnings,
  suggestInitialProductReleaseMap,
} from '../../lib/releaseHelpers';
import { supabaseClient } from '../../providers/supabaseClient';
import type { Product, ProjectRelease, Release } from '../../types/database';

interface StepOneFormValues {
  version_label: string;
  notes?: string;
}

interface ReviewRow {
  product: Product;
  release: Release;
}

export const ProjectReleaseWizardPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId, projectReleaseId } = useParams<{
    projectId: string;
    projectReleaseId?: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { open: notify } = useNotification();
  const { project, canEditContent, isLoading: isAccessLoading } = useProjectAccess(projectId);

  const [form] = Form.useForm<StepOneFormValues>();

  const initialStep = useMemo(() => {
    const raw = Number(searchParams.get('step') ?? '0');
    if (!projectReleaseId) {
      return 0;
    }
    return Number.isInteger(raw) && raw >= 0 && raw <= 3 ? raw : 0;
  }, [projectReleaseId, searchParams]);

  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [draftRelease, setDraftRelease] = useState<ProjectRelease | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [publishedReleases, setPublishedReleases] = useState<Release[]>([]);
  const [selectedByProduct, setSelectedByProduct] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${
      projectReleaseId ? t('projectReleases.wizardTitleEdit') : t('projectReleases.wizardTitleNew')
    }${project?.name ? ` - ${project.name}` : ''} | ${t('app.name')}`;
  }, [project?.name, projectReleaseId, t]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId) {
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);

      const [prodRes, relRes] = await Promise.all([
        supabaseClient
          .from('products')
          .select('*')
          .eq('project_id', projectId)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true }),
        supabaseClient
          .from('releases')
          .select('*')
          .eq('project_id', projectId)
          .eq('status', 'published')
          .order('published_at', { ascending: false }),
      ]);

      if (!active) {
        return;
      }

      if (prodRes.error || relRes.error) {
        setErrorMessage(prodRes.error?.message ?? relRes.error?.message ?? t('common.errorPrefix'));
        setIsLoading(false);
        return;
      }

      const loadedProducts = (prodRes.data as Product[]) ?? [];
      const loadedPubReleases = (relRes.data as Release[]) ?? [];
      setProducts(loadedProducts);
      setPublishedReleases(loadedPubReleases);

      if (projectReleaseId) {
        const [projRelRes, bundledRes] = await Promise.all([
          supabaseClient
            .from('project_releases')
            .select('*')
            .eq('id', projectReleaseId)
            .eq('project_id', projectId)
            .maybeSingle(),
          supabaseClient
            .from('project_release_products')
            .select('product_id, release_id')
            .eq('project_release_id', projectReleaseId),
        ]);

        if (!active) {
          return;
        }

        if (projRelRes.error || !projRelRes.data) {
          setErrorMessage(projRelRes.error?.message ?? t('projects.notFound'));
          setIsLoading(false);
          return;
        }

        const loadedProjRel = projRelRes.data as ProjectRelease;
        if (loadedProjRel.status === 'published') {
          navigate(`/projects/${projectId}/releases/${loadedProjRel.id}`, {
            replace: true,
          });
          return;
        }

        setDraftRelease(loadedProjRel);
        form.setFieldsValue({
          version_label: loadedProjRel.version_label,
          notes: loadedProjRel.notes ?? '',
        });

        const existingMap: Record<string, string> = {};
        for (const row of (bundledRes.data as
          { product_id: string; release_id: string }[] | null) ?? []) {
          existingMap[row.product_id] = row.release_id;
        }
        setSelectedByProduct(existingMap);
      } else {
        setDraftRelease(null);
        setCurrentStep(0);
        form.setFieldsValue({ version_label: '', notes: '' });
        setSelectedByProduct(suggestInitialProductReleaseMap(loadedProducts, loadedPubReleases));
      }

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, projectReleaseId, form, navigate, t]);

  const goToStep = (nextStep: number) => {
    setCurrentStep(nextStep);
    if (projectReleaseId) {
      setSearchParams({ step: String(nextStep) }, { replace: true });
    }
  };

  const persistBundledProducts = async (
    targetProjectReleaseId: string,
    nextMap: Readonly<Record<string, string>>,
  ): Promise<boolean> => {
    const { data: existingRows, error: fetchErr } = await supabaseClient
      .from('project_release_products')
      .select('product_id, release_id')
      .eq('project_release_id', targetProjectReleaseId);

    if (fetchErr) {
      setErrorMessage(fetchErr.message);
      return false;
    }

    const existingMap = new Map<string, string>();
    for (const r of (existingRows as { product_id: string; release_id: string }[] | null) ?? []) {
      existingMap.set(r.product_id, r.release_id);
    }

    const nextProductIds = new Set(Object.keys(nextMap));
    const toDelete = Array.from(existingMap.keys()).filter((pid) => !nextProductIds.has(pid));

    if (toDelete.length > 0) {
      const { error: delErr } = await supabaseClient
        .from('project_release_products')
        .delete()
        .eq('project_release_id', targetProjectReleaseId)
        .in('product_id', toDelete);
      if (delErr) {
        setErrorMessage(delErr.message);
        return false;
      }
    }

    for (const [prodId, relId] of Object.entries(nextMap)) {
      const existingRelId = existingMap.get(prodId);
      if (existingRelId && existingRelId !== relId) {
        const { error: updErr } = await supabaseClient
          .from('project_release_products')
          .update({ release_id: relId })
          .eq('project_release_id', targetProjectReleaseId)
          .eq('product_id', prodId);
        if (updErr) {
          setErrorMessage(updErr.message);
          return false;
        }
      }
    }

    const toInsert = Object.entries(nextMap).filter(([prodId]) => !existingMap.has(prodId));
    if (toInsert.length > 0) {
      const { error: insErr } = await supabaseClient.from('project_release_products').insert(
        toInsert.map(([prodId, relId]) => ({
          project_release_id: targetProjectReleaseId,
          product_id: prodId,
          release_id: relId,
        })),
      );
      if (insErr) {
        setErrorMessage(insErr.message);
        return false;
      }
    }

    return true;
  };

  const handleStepZeroNext = async () => {
    if (!projectId) {
      return;
    }
    try {
      const values = await form.validateFields();
      setIsSaving(true);
      setErrorMessage(null);

      if (!draftRelease) {
        const { data: created, error } = await supabaseClient
          .from('project_releases')
          .insert({
            project_id: projectId,
            version_label: values.version_label.trim(),
            notes: values.notes?.trim() || null,
            status: 'draft',
          })
          .select('*')
          .single();

        if (error || !created) {
          setIsSaving(false);
          setErrorMessage(error?.message ?? t('common.errorPrefix'));
          return;
        }

        const createdDraft = created as ProjectRelease;
        const ok = await persistBundledProducts(createdDraft.id, selectedByProduct);
        setIsSaving(false);
        if (!ok) {
          return;
        }

        setDraftRelease(createdDraft);
        setCurrentStep(1);
        navigate(`/projects/${projectId}/releases/${createdDraft.id}/edit?step=1`, {
          replace: true,
        });
        return;
      }

      const { data: updated, error } = await supabaseClient
        .from('project_releases')
        .update({
          version_label: values.version_label.trim(),
          notes: values.notes?.trim() || null,
        })
        .eq('id', draftRelease.id)
        .select('*')
        .single();

      setIsSaving(false);

      if (error || !updated) {
        setErrorMessage(error?.message ?? t('common.errorPrefix'));
        return;
      }

      setDraftRelease(updated as ProjectRelease);
      goToStep(1);
    } catch {
      // Form validation errors are shown inline on fields
    }
  };

  const releasesForProduct = useMemo(() => {
    const map = new Map<string, Release[]>();
    for (const rel of publishedReleases) {
      const list = map.get(rel.product_id) ?? [];
      list.push(rel);
      map.set(rel.product_id, list);
    }
    return map;
  }, [publishedReleases]);

  const selectableProducts = useMemo(
    () => products.filter((p) => !p.archived || Boolean(selectedByProduct[p.id])),
    [products, selectedByProduct],
  );

  const handleToggleProduct = async (productId: string, checked: boolean) => {
    const nextMap = { ...selectedByProduct };
    if (checked) {
      const defaultRel = (releasesForProduct.get(productId) ?? [])[0];
      if (!defaultRel) {
        return;
      }
      nextMap[productId] = defaultRel.id;
    } else {
      delete nextMap[productId];
    }

    setSelectedByProduct(nextMap);

    if (draftRelease) {
      setIsSaving(true);
      setErrorMessage(null);
      await persistBundledProducts(draftRelease.id, nextMap);
      setIsSaving(false);
    }
  };

  const handleSelectProductRelease = async (productId: string, releaseId: string) => {
    const nextMap = { ...selectedByProduct, [productId]: releaseId };
    setSelectedByProduct(nextMap);

    if (draftRelease) {
      setIsSaving(true);
      setErrorMessage(null);
      await persistBundledProducts(draftRelease.id, nextMap);
      setIsSaving(false);
    }
  };

  const handleStepOneNext = async () => {
    if (!draftRelease) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    const ok = await persistBundledProducts(draftRelease.id, selectedByProduct);
    setIsSaving(false);
    if (ok) {
      goToStep(2);
    }
  };

  const handlePublish = async () => {
    if (!draftRelease || !projectId) {
      return;
    }
    if (Object.keys(selectedByProduct).length === 0) {
      setErrorMessage(t('projectReleases.reviewNoProductsError'));
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const synced = await persistBundledProducts(draftRelease.id, selectedByProduct);
    if (!synced) {
      setIsSaving(false);
      return;
    }

    const { data, error } = await supabaseClient.rpc('publish_project_release', {
      p_project_release_id: draftRelease.id,
    });

    setIsSaving(false);

    if (error || !data) {
      setErrorMessage(error?.message ?? t('common.errorPrefix'));
      return;
    }

    notify?.({ type: 'success', message: t('projectReleases.publishedSuccess') });
    navigate(`/projects/${projectId}/releases/${draftRelease.id}`, { replace: true });
  };

  const handleDiscardDraft = async () => {
    if (!draftRelease || !projectId) {
      return;
    }
    setIsSaving(true);
    const { error } = await supabaseClient
      .from('project_releases')
      .delete()
      .eq('id', draftRelease.id);
    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    notify?.({ type: 'success', message: t('projectReleases.discardedSuccess') });
    navigate(`/projects/${projectId}`);
  };

  const reviewRows = useMemo<ReviewRow[]>(() => {
    const releaseById = new Map<string, Release>();
    for (const r of publishedReleases) {
      releaseById.set(r.id, r);
    }
    const rows: ReviewRow[] = [];
    for (const prod of products) {
      const chosenRelId = selectedByProduct[prod.id];
      if (!chosenRelId) {
        continue;
      }
      const chosenRel = releaseById.get(chosenRelId);
      if (chosenRel) {
        rows.push({ product: prod, release: chosenRel });
      }
    }
    return rows;
  }, [products, publishedReleases, selectedByProduct]);

  const warnings = useMemo(
    () => computeProjectReleaseWarnings(products, new Set(reviewRows.map((row) => row.product.id))),
    [products, reviewRows],
  );

  if (isAccessLoading || isLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (!project || !projectId || !canEditContent) {
    return <Alert type="error" showIcon message={t('projects.notFound')} />;
  }

  const reviewColumns: ColumnsType<ReviewRow> = [
    {
      title: t('projectReleases.columns.product'),
      key: 'product',
      render: (_val: unknown, row: ReviewRow) => (
        <div className="revlog-inline-row">
          <Typography.Text strong>{row.product.name}</Typography.Text>
          {row.product.code && <Tag bordered>{row.product.code}</Tag>}
        </div>
      ),
    },
    {
      title: t('projectReleases.columns.type'),
      key: 'type',
      width: 170,
      render: (_val: unknown, row: ReviewRow) => (
        <Tag bordered style={{ marginInlineEnd: 0 }}>
          {t(`products.types.${row.product.product_type}`)}
        </Tag>
      ),
    },
    {
      title: t('projectReleases.columns.release'),
      key: 'release',
      width: 160,
      render: (_val: unknown, row: ReviewRow) => (
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
          {row.release.version_label}
        </Tag>
      ),
    },
    {
      title: t('projectReleases.columns.publishedAt'),
      key: 'publishedAt',
      width: 140,
      render: (_val: unknown, row: ReviewRow) => (
        <Typography.Text type="secondary">
          {formatReleaseDate(row.release.published_at)}
        </Typography.Text>
      ),
    },
    {
      title: t('projectReleases.columns.manifestHash'),
      key: 'manifestHash',
      render: (_val: unknown, row: ReviewRow) =>
        row.release.manifest_hash ? (
          <span className="revlog-hash">{row.release.manifest_hash}</span>
        ) : (
          <Typography.Text type="secondary">{t('common.none')}</Typography.Text>
        ),
    },
  ];

  return (
    <PageHeader
      onBack={() => navigate(`/projects/${project.id}`)}
      title={
        <PageHeaderTitle
          title={
            draftRelease
              ? t('projectReleases.wizardTitleEdit')
              : t('projectReleases.wizardTitleNew')
          }
          subtitle={`${project.name}${
            draftRelease
              ? ` · ${draftRelease.version_label}`
              : ` · ${t('projectReleases.wizardSubtitle')}`
          }`}
          badge={draftRelease ? <StatusBadge kind="draft" /> : undefined}
        />
      }
      extra={
        <Space size={tokens.spacing.sm}>
          {draftRelease && (
            <Popconfirm
              title={t('projectReleases.discardConfirm')}
              onConfirm={() => void handleDiscardDraft()}
              okText={t('projectReleases.discardDraft')}
              cancelText={t('common.cancel')}
            >
              <Button danger icon={<DeleteOutlined aria-hidden="true" />} disabled={isSaving}>
                {t('projectReleases.discardDraft')}
              </Button>
            </Popconfirm>
          )}
          <Button onClick={() => navigate(`/projects/${project.id}`)}>{t('common.back')}</Button>
        </Space>
      }
    >
      <Card style={{ marginBottom: tokens.spacing.lg }}>
        <nav aria-label={t('projectReleases.wizardTitleNew')}>
          <Steps
            current={currentStep}
            items={[
              { title: t('projectReleases.steps.details') },
              { title: t('projectReleases.steps.selection') },
              { title: t('projectReleases.steps.review') },
              { title: t('projectReleases.steps.confirm') },
            ]}
          />
        </nav>
      </Card>

      {errorMessage && (
        <div role="alert" style={{ marginBottom: tokens.spacing.lg }}>
          <Alert type="error" showIcon message={errorMessage} />
        </div>
      )}

      {/* Step 0: Version & notes */}
      {currentStep === 0 && (
        <Card>
          <Form<StepOneFormValues>
            form={form}
            layout="vertical"
            requiredMark={false}
            validateTrigger="onBlur"
            style={{ maxWidth: 600 }}
          >
            <Form.Item
              label={t('projectReleases.versionLabel')}
              name="version_label"
              htmlFor="project-release-version-label"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: t('projectReleases.versionRequired'),
                },
              ]}
            >
              <Input
                id="project-release-version-label"
                name="version_label"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={t('projectReleases.versionPlaceholder')}
                maxLength={60}
              />
            </Form.Item>

            <Form.Item
              label={t('projectReleases.notesLabel')}
              name="notes"
              htmlFor="project-release-notes"
            >
              <Input.TextArea
                id="project-release-notes"
                name="notes"
                rows={4}
                placeholder={t('projectReleases.notesPlaceholder')}
                maxLength={4000}
              />
            </Form.Item>

            <Space size={tokens.spacing.sm}>
              <Button
                type="primary"
                icon={<ArrowRightOutlined aria-hidden="true" />}
                iconPosition="end"
                loading={isSaving}
                onClick={() => void handleStepZeroNext()}
              >
                {t('common.next')}
              </Button>
            </Space>
          </Form>
        </Card>
      )}

      {/* Step 1: Product release selection */}
      {currentStep === 1 && (
        <div>
          <Alert
            type="info"
            showIcon
            message={t('projectReleases.selectionHint')}
            style={{ marginBottom: tokens.spacing.md }}
          />

          {selectableProducts.length === 0 ? (
            <Card>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t('projectReleases.noProducts')}
              />
            </Card>
          ) : (
            <Space direction="vertical" size={tokens.spacing.sm} style={{ width: '100%' }}>
              {selectableProducts.map((prod) => {
                const availableReleases = releasesForProduct.get(prod.id) ?? [];
                const selectedRelId = selectedByProduct[prod.id];
                const isChecked = Boolean(selectedRelId);
                const hasReleases = availableReleases.length > 0;

                return (
                  <div
                    key={prod.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: tokens.spacing.md,
                      padding: `${tokens.spacing.md}px ${tokens.spacing.lg}px`,
                      borderRadius: tokens.radius.md,
                      border: `1px solid ${
                        isChecked ? tokens.colors.accent : tokens.colors.border
                      }`,
                      backgroundColor: isChecked
                        ? tokens.colors.surfaceSelected
                        : tokens.colors.surface,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: tokens.spacing.sm,
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={isSaving || !hasReleases}
                        aria-label={prod.name}
                        onChange={(e) => void handleToggleProduct(prod.id, e.target.checked)}
                      />

                      <span style={{ color: tokens.colors.accent, display: 'inline-flex' }}>
                        {getProductTypeIcon(prod.product_type)}
                      </span>

                      <div className="revlog-inline-row" style={{ minWidth: 0 }}>
                        <Typography.Text strong>{prod.name}</Typography.Text>
                        {prod.code && <Tag bordered>{prod.code}</Tag>}
                        <Tag bordered>{t(`products.types.${prod.product_type}`)}</Tag>
                      </div>
                    </div>

                    {hasReleases ? (
                      <Select<string>
                        value={selectedRelId}
                        disabled={isSaving || !isChecked}
                        aria-label={t('projectReleases.selectReleaseAria', { product: prod.name })}
                        style={{ minWidth: 230 }}
                        onChange={(val) => void handleSelectProductRelease(prod.id, val)}
                        options={availableReleases.map((rel) => ({
                          value: rel.id,
                          label: `${rel.version_label} · ${formatReleaseDate(rel.published_at)}`,
                        }))}
                      />
                    ) : (
                      <Typography.Text type="secondary">
                        {t('projectReleases.noPublishedForProduct')}
                      </Typography.Text>
                    )}
                  </div>
                );
              })}
            </Space>
          )}

          <Space size={tokens.spacing.sm} style={{ marginTop: tokens.spacing.lg }}>
            <Button
              icon={<ArrowLeftOutlined aria-hidden="true" />}
              onClick={() => goToStep(0)}
              disabled={isSaving}
            >
              {t('common.previous')}
            </Button>
            <Button
              type="primary"
              icon={<ArrowRightOutlined aria-hidden="true" />}
              iconPosition="end"
              loading={isSaving}
              onClick={() => void handleStepOneNext()}
            >
              {t('common.next')}
            </Button>
          </Space>
        </div>
      )}

      {/* Step 2: Review */}
      {currentStep === 2 && (
        <div>
          <Card
            title={t('projectReleases.warningsHeading')}
            style={{ marginBottom: tokens.spacing.lg }}
          >
            {warnings.length === 0 ? (
              <div className="revlog-inline-row">
                <CheckCircleOutlined
                  aria-hidden="true"
                  style={{ color: tokens.colors.publishedText }}
                />
                <Typography.Text type="secondary">
                  {t('projectReleases.noWarnings')}
                </Typography.Text>
              </div>
            ) : (
              <ul
                style={{
                  margin: 0,
                  paddingInlineStart: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: tokens.spacing.xs,
                }}
              >
                {warnings.map((w) => (
                  <li
                    key={w.productId}
                    style={{
                      color: tokens.colors.warningText,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 6,
                    }}
                  >
                    <ExclamationCircleOutlined
                      aria-hidden="true"
                      style={{ marginTop: 3, flexShrink: 0 }}
                    />
                    <span>
                      {t('projectReleases.warningMissingProduct', { product: w.productName })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={t('projectReleases.selectedProductsHeading', {
              count: reviewRows.length,
            })}
            styles={{ body: { padding: 0 } }}
          >
            <div className="revlog-table-region" tabIndex={0}>
              <Table<ReviewRow>
                rowKey={(row) => row.product.id}
                size="middle"
                columns={reviewColumns}
                dataSource={reviewRows}
                pagination={false}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={t('projectReleases.reviewNoProductsError')}
                    />
                  ),
                }}
              />
            </div>
          </Card>

          <Space size={tokens.spacing.sm} style={{ marginTop: tokens.spacing.lg }}>
            <Button icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={() => goToStep(1)}>
              {t('common.previous')}
            </Button>
            <Button
              type="primary"
              icon={<ArrowRightOutlined aria-hidden="true" />}
              iconPosition="end"
              disabled={reviewRows.length === 0}
              onClick={() => goToStep(3)}
            >
              {t('common.next')}
            </Button>
          </Space>
        </div>
      )}

      {/* Step 3: Confirm & Publish */}
      {currentStep === 3 && draftRelease && (
        <Card style={{ maxWidth: 680 }}>
          <Descriptions
            bordered
            size="small"
            column={1}
            style={{ marginBottom: tokens.spacing.lg }}
            items={[
              {
                key: 'version',
                label: t('projectReleases.versionLabel'),
                children: (
                  <Tag bordered style={{ marginInlineEnd: 0 }}>
                    {draftRelease.version_label}
                  </Tag>
                ),
              },
              {
                key: 'products',
                label: t('projectReleases.bundledHeading'),
                children: (
                  <div className="revlog-inline-row">
                    {reviewRows.map((row) => (
                      <Tag key={row.product.id} bordered>
                        {`${row.product.name} · ${row.release.version_label}`}
                      </Tag>
                    ))}
                  </div>
                ),
              },
              {
                key: 'notes',
                label: t('projectReleases.notesLabel'),
                children: draftRelease.notes ? (
                  <span
                    className="revlog-prose"
                    style={{ display: 'block', whiteSpace: 'pre-wrap' }}
                  >
                    {draftRelease.notes}
                  </span>
                ) : (
                  <Typography.Text type="secondary">{t('releases.noNotes')}</Typography.Text>
                ),
              },
            ]}
          />

          <Alert
            type="warning"
            showIcon
            icon={<LockOutlined aria-hidden="true" />}
            message={t('releases.confirmImmutabilityNotice')}
            style={{ marginBottom: tokens.spacing.lg }}
          />

          <Space size={tokens.spacing.sm}>
            <Button
              icon={<ArrowLeftOutlined aria-hidden="true" />}
              onClick={() => goToStep(2)}
              disabled={isSaving}
            >
              {t('common.previous')}
            </Button>
            <Button
              type="primary"
              icon={<LockOutlined aria-hidden="true" />}
              loading={isSaving}
              disabled={reviewRows.length === 0}
              onClick={() => void handlePublish()}
            >
              {t('projectReleases.publishButton')}
            </Button>
          </Space>
        </Card>
      )}
    </PageHeader>
  );
};
