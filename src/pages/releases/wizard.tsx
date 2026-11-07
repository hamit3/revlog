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
  FileOutlined,
  FileSearchOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { useProductAccess } from '../../lib/useProjectAccess';
import { formatFileSize, formatReleaseDate } from '../../lib/format';
import { computeReleaseWarnings, suggestInitialItemIds } from '../../lib/releaseHelpers';
import { supabaseClient } from '../../providers/supabaseClient';
import type { BomPnpCheckRun, Category, Item, Release } from '../../types/database';

interface StepOneFormValues {
  version_label: string;
  notes?: string;
}

export const ReleaseWizardPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId, productId, releaseId } = useParams<{
    projectId: string;
    productId: string;
    releaseId?: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { open: notify } = useNotification();
  const {
    project,
    product,
    canEditContent,
    isLoading: isAccessLoading,
  } = useProductAccess(projectId, productId);

  const [form] = Form.useForm<StepOneFormValues>();

  const initialStep = useMemo(() => {
    const raw = Number(searchParams.get('step') ?? '0');
    if (!releaseId) {
      return 0;
    }
    return Number.isInteger(raw) && raw >= 0 && raw <= 3 ? raw : 0;
  }, [releaseId, searchParams]);

  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [draftRelease, setDraftRelease] = useState<Release | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bomPnpRun, setBomPnpRun] = useState<BomPnpCheckRun | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!draftRelease?.id) {
        if (active) {
          setBomPnpRun(null);
        }
        return;
      }
      const { data } = await supabaseClient
        .from('bom_pnp_check_runs')
        .select('*')
        .eq('release_id', draftRelease.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active && data) {
        setBomPnpRun(data as BomPnpCheckRun);
      }
    })();
    return () => {
      active = false;
    };
  }, [draftRelease?.id, currentStep]);

  useEffect(() => {
    document.title = `${
      releaseId ? t('releases.wizardTitleEdit') : t('releases.wizardTitleNew')
    }${product?.name ? ` - ${product.name}` : ''} | ${t('app.name')}`;
  }, [product?.name, releaseId, t]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !productId) {
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);

      const [catRes, itemRes] = await Promise.all([
        supabaseClient
          .from('categories')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', productId)
          .order('position', { ascending: true }),
        supabaseClient
          .from('items')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', productId)
          .eq('archived', false)
          .order('created_at', { ascending: false }),
      ]);

      if (!active) {
        return;
      }

      if (catRes.error || itemRes.error) {
        setErrorMessage(catRes.error?.message ?? itemRes.error?.message ?? t('common.errorPrefix'));
        setIsLoading(false);
        return;
      }

      const loadedCategories = (catRes.data as Category[]) ?? [];
      const loadedItems = (itemRes.data as Item[]) ?? [];
      setCategories(loadedCategories);
      setItems(loadedItems);

      if (releaseId) {
        const [relRes, relItemsRes] = await Promise.all([
          supabaseClient
            .from('releases')
            .select('*')
            .eq('id', releaseId)
            .eq('project_id', projectId)
            .eq('product_id', productId)
            .maybeSingle(),
          supabaseClient.from('release_items').select('item_id').eq('release_id', releaseId),
        ]);

        if (!active) {
          return;
        }

        if (relRes.error || !relRes.data) {
          setErrorMessage(relRes.error?.message ?? t('products.notFound'));
          setIsLoading(false);
          return;
        }

        const loadedRelease = relRes.data as Release;
        if (loadedRelease.status === 'published') {
          navigate(`/projects/${projectId}/products/${productId}/releases/${loadedRelease.id}`, {
            replace: true,
          });
          return;
        }

        setDraftRelease(loadedRelease);
        form.setFieldsValue({
          version_label: loadedRelease.version_label,
          notes: loadedRelease.notes ?? '',
        });

        const existingIds =
          (relItemsRes.data as { item_id: string }[] | null)?.map((r) => r.item_id) ?? [];
        setSelectedItemIds(existingIds);
      } else {
        setDraftRelease(null);
        setCurrentStep(0);
        form.setFieldsValue({ version_label: '', notes: '' });
        setSelectedItemIds(suggestInitialItemIds(loadedCategories, loadedItems));
      }

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, productId, releaseId, form, navigate, t]);

  const goToStep = (nextStep: number) => {
    setCurrentStep(nextStep);
    if (releaseId) {
      setSearchParams({ step: String(nextStep) }, { replace: true });
    }
  };

  const persistReleaseItems = async (
    targetReleaseId: string,
    nextIds: readonly string[],
  ): Promise<boolean> => {
    const { data: existingRows, error: fetchErr } = await supabaseClient
      .from('release_items')
      .select('item_id')
      .eq('release_id', targetReleaseId);

    if (fetchErr) {
      setErrorMessage(fetchErr.message);
      return false;
    }

    const existingSet = new Set(
      ((existingRows as { item_id: string }[] | null) ?? []).map((r) => r.item_id),
    );
    const nextSet = new Set(nextIds);

    const toDelete = Array.from(existingSet).filter((id) => !nextSet.has(id));
    const toInsert = Array.from(nextSet).filter((id) => !existingSet.has(id));

    if (toDelete.length > 0) {
      const { error: delErr } = await supabaseClient
        .from('release_items')
        .delete()
        .eq('release_id', targetReleaseId)
        .in('item_id', toDelete);
      if (delErr) {
        setErrorMessage(delErr.message);
        return false;
      }
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabaseClient.from('release_items').insert(
        toInsert.map((itemId) => ({
          release_id: targetReleaseId,
          item_id: itemId,
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
    if (!projectId || !productId) {
      return;
    }
    try {
      const values = await form.validateFields();
      setIsSaving(true);
      setErrorMessage(null);

      if (!draftRelease) {
        const { data: created, error } = await supabaseClient
          .from('releases')
          .insert({
            project_id: projectId,
            product_id: productId,
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

        const createdDraft = created as Release;
        const ok = await persistReleaseItems(createdDraft.id, selectedItemIds);
        setIsSaving(false);
        if (!ok) {
          return;
        }

        setDraftRelease(createdDraft);
        setCurrentStep(1);
        navigate(
          `/projects/${projectId}/products/${productId}/releases/${createdDraft.id}/edit?step=1`,
          {
            replace: true,
          },
        );
        return;
      }

      const { data: updated, error } = await supabaseClient
        .from('releases')
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

      setDraftRelease(updated as Release);
      goToStep(1);
    } catch {
      // Form validation errors are shown inline on fields
    }
  };

  const handleToggleItem = async (itemId: string, checked: boolean) => {
    const nextIds = checked
      ? Array.from(new Set([...selectedItemIds, itemId]))
      : selectedItemIds.filter((id) => id !== itemId);

    setSelectedItemIds(nextIds);

    if (draftRelease) {
      setIsSaving(true);
      setErrorMessage(null);
      await persistReleaseItems(draftRelease.id, nextIds);
      setIsSaving(false);
    }
  };

  const handleStepOneNext = async () => {
    if (!draftRelease) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    const ok = await persistReleaseItems(draftRelease.id, selectedItemIds);
    setIsSaving(false);
    if (ok) {
      goToStep(2);
    }
  };

  const handlePublish = async () => {
    if (!draftRelease || !projectId || !productId) {
      return;
    }
    if (selectedItemIds.length === 0) {
      setErrorMessage(t('releases.reviewNoItemsError'));
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const synced = await persistReleaseItems(draftRelease.id, selectedItemIds);
    if (!synced) {
      setIsSaving(false);
      return;
    }

    const { data, error } = await supabaseClient.rpc('publish_release', {
      p_release_id: draftRelease.id,
    });

    setIsSaving(false);

    if (error || !data) {
      setErrorMessage(error?.message ?? t('common.errorPrefix'));
      return;
    }

    notify?.({ type: 'success', message: t('releases.publishedSuccess') });
    navigate(`/projects/${projectId}/products/${productId}/releases/${draftRelease.id}`, {
      replace: true,
    });
  };

  const handleDiscardDraft = async () => {
    if (!draftRelease || !projectId || !productId) {
      return;
    }
    setIsSaving(true);
    const { error } = await supabaseClient.from('releases').delete().eq('id', draftRelease.id);
    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    notify?.({ type: 'success', message: t('releases.discardedSuccess') });
    navigate(`/projects/${projectId}/products/${productId}`);
  };

  const selectedItems = useMemo(() => {
    const idSet = new Set(selectedItemIds);
    return items.filter((item) => idSet.has(item.id));
  }, [items, selectedItemIds]);

  const warnings = useMemo(
    () => computeReleaseWarnings(categories, selectedItems),
    [categories, selectedItems],
  );

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  if (isAccessLoading || isLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (!project || !product || !projectId || !productId || !canEditContent) {
    return <Alert type="error" showIcon message={t('products.notFound')} />;
  }

  const productBase = `/projects/${project.id}/products/${product.id}`;

  const reviewColumns: ColumnsType<Item> = [
    {
      title: t('items.categoryLabel'),
      key: 'category',
      width: 150,
      render: (_val: unknown, record: Item) => (
        <Tag bordered style={{ marginInlineEnd: 0 }}>
          {categoryNameById.get(record.category_id) ?? t('common.none')}
        </Tag>
      ),
    },
    {
      title: t('items.columns.title'),
      dataIndex: 'title',
      key: 'title',
      render: (val: string) => <Typography.Text strong>{val}</Typography.Text>,
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
      render: (val: string) =>
        val ? (
          <Tag bordered style={{ marginInlineEnd: 0 }}>
            {val}
          </Tag>
        ) : (
          <Typography.Text type="secondary">{t('common.none')}</Typography.Text>
        ),
    },
    {
      title: t('releases.columns.artifact'),
      key: 'artifact',
      render: (_val: unknown, record: Item) =>
        record.kind === 'file' ? (
          <Typography.Text>{record.file_name}</Typography.Text>
        ) : (
          <span className="revlog-break-url">{record.url}</span>
        ),
    },
  ];

  return (
    <PageHeader
      onBack={() => navigate(productBase)}
      title={
        <PageHeaderTitle
          title={draftRelease ? t('releases.wizardTitleEdit') : t('releases.wizardTitleNew')}
          subtitle={`${project.name} / ${product.name}${
            draftRelease ? ` · ${draftRelease.version_label}` : ` · ${t('releases.wizardSubtitle')}`
          }`}
          badge={draftRelease ? <StatusBadge kind="draft" /> : undefined}
        />
      }
      extra={
        <Space size={tokens.spacing.sm}>
          {draftRelease && (
            <Popconfirm
              title={t('releases.discardConfirm')}
              onConfirm={() => void handleDiscardDraft()}
              okText={t('releases.discardDraft')}
              cancelText={t('common.cancel')}
            >
              <Button danger icon={<DeleteOutlined aria-hidden="true" />} disabled={isSaving}>
                {t('releases.discardDraft')}
              </Button>
            </Popconfirm>
          )}
          <Button onClick={() => navigate(productBase)}>{t('common.back')}</Button>
        </Space>
      }
    >
      <Card style={{ marginBottom: tokens.spacing.lg }}>
        <nav aria-label={t('releases.wizardTitleNew')}>
          <Steps
            current={currentStep}
            items={[
              { title: t('releases.steps.details') },
              { title: t('releases.steps.selection') },
              { title: t('releases.steps.review') },
              { title: t('releases.steps.confirm') },
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
              label={t('releases.versionLabel')}
              name="version_label"
              htmlFor="release-version-label"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: t('releases.versionRequired'),
                },
              ]}
            >
              <Input
                id="release-version-label"
                name="version_label"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={t('releases.versionPlaceholder')}
                maxLength={60}
              />
            </Form.Item>

            <Form.Item label={t('releases.notesLabel')} name="notes" htmlFor="release-notes">
              <Input.TextArea
                id="release-notes"
                name="notes"
                rows={4}
                placeholder={t('releases.notesPlaceholder')}
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

      {/* Step 1: Module-by-module item selection */}
      {currentStep === 1 && (
        <div>
          <Alert
            type="info"
            showIcon
            message={t('releases.selectionHint')}
            style={{ marginBottom: tokens.spacing.md }}
          />

          <Space direction="vertical" size={tokens.spacing.md} style={{ width: '100%' }}>
            {categories.map((cat) => {
              const catItems = items.filter((i) => i.category_id === cat.id);
              const selectedInCat = catItems.filter((i) => selectedItemIds.includes(i.id)).length;

              return (
                <Card
                  key={cat.id}
                  size="small"
                  title={cat.name}
                  extra={
                    <Tag
                      bordered
                      style={{
                        marginInlineEnd: 0,
                        backgroundColor:
                          selectedInCat > 0
                            ? tokens.colors.surfaceSelected
                            : tokens.colors.surfaceSubtle,
                        borderColor:
                          selectedInCat > 0 ? tokens.colors.accent : tokens.colors.border,
                        color:
                          selectedInCat > 0 ? tokens.colors.accent : tokens.colors.textSecondary,
                      }}
                    >
                      {t('releases.selectedCount', { count: selectedInCat })}
                    </Tag>
                  }
                >
                  {catItems.length === 0 ? (
                    <Typography.Text type="secondary">
                      {t('releases.noItemsInCategory')}
                    </Typography.Text>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: tokens.spacing.sm,
                      }}
                    >
                      {catItems.map((item) => {
                        const checked = selectedItemIds.includes(item.id);
                        return (
                          <div
                            key={item.id}
                            className="revlog-selectable-card"
                            onClick={() => {
                              if (!isSaving) {
                                void handleToggleItem(item.id, !checked);
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: tokens.spacing.sm,
                              padding: '8px 12px',
                              borderRadius: tokens.radius.md,
                              border: `1px solid ${
                                checked ? tokens.colors.accent : tokens.colors.border
                              }`,
                              backgroundColor: checked
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
                                checked={checked}
                                disabled={isSaving}
                                aria-label={item.title}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => void handleToggleItem(item.id, e.target.checked)}
                              />
                              <div className="revlog-inline-row" style={{ minWidth: 0 }}>
                                <Typography.Text strong>{item.title}</Typography.Text>
                                {item.version_label && <Tag bordered>{item.version_label}</Tag>}
                                <span className="revlog-inline-row revlog-secondary-text">
                                  {item.kind === 'file' ? (
                                    <>
                                      <FileOutlined aria-hidden="true" />
                                      <span>
                                        {item.file_name} ({formatFileSize(item.file_size)})
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <LinkOutlined aria-hidden="true" />
                                      <span className="revlog-break-url">{item.url}</span>
                                    </>
                                  )}
                                </span>
                              </div>
                            </div>

                            <span className="revlog-secondary-text" style={{ flexShrink: 0 }}>
                              {formatReleaseDate(item.created_at)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </Space>

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
            title={t('releases.bomPnpCardHeading')}
            style={{ marginBottom: tokens.spacing.lg }}
            extra={
              draftRelease && (
                <Button
                  size="small"
                  icon={<FileSearchOutlined aria-hidden="true" />}
                  onClick={() =>
                    navigate(
                      `/projects/${projectId}/products/${productId}/bom-pnp?releaseId=${draftRelease.id}`,
                    )
                  }
                >
                  {t('releases.bomPnpOpenButton')}
                </Button>
              )
            }
          >
            {bomPnpRun ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: tokens.spacing.sm,
                    marginBottom: tokens.spacing.sm,
                  }}
                >
                  {bomPnpRun.summary.error_count === 0 &&
                  bomPnpRun.summary.warning_count === 0 ? (
                    <Tag
                      bordered
                      style={{
                        backgroundColor: tokens.colors.publishedBg,
                        borderColor: tokens.colors.publishedBorder,
                        color: tokens.colors.publishedText,
                      }}
                    >
                      <CheckCircleOutlined
                        aria-hidden="true"
                        style={{ marginInlineEnd: 4 }}
                      />
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
                      <ExclamationCircleOutlined
                        aria-hidden="true"
                        style={{ marginInlineEnd: 4 }}
                      />
                      {t('releases.bomPnpCheckIssues', {
                        errors: bomPnpRun.summary.error_count,
                        warnings: bomPnpRun.summary.warning_count,
                      })}
                    </Tag>
                  )}
                  {(bomPnpRun.bom_file_name || bomPnpRun.pnp_file_name) && (
                    <Typography.Text type="secondary">
                      {t('releases.bomPnpCheckedFiles', {
                        bom: bomPnpRun.bom_file_name || '-',
                        pnp: bomPnpRun.pnp_file_name || '-',
                      })}
                    </Typography.Text>
                  )}
                </div>

                {bomPnpRun.findings.length > 0 && (
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
                    {bomPnpRun.findings.slice(0, 5).map((f) => (
                      <li
                        key={f.id}
                        style={{
                          color:
                            f.severity === 'error'
                              ? tokens.colors.errorText
                              : f.severity === 'warning'
                                ? tokens.colors.warningText
                                : tokens.colors.draftText,
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 6,
                        }}
                      >
                        <ExclamationCircleOutlined
                          aria-hidden="true"
                          style={{ marginTop: 3, flexShrink: 0 }}
                        />
                        <span>{f.message}</span>
                      </li>
                    ))}
                    {bomPnpRun.findings.length > 5 && (
                      <li style={{ marginTop: tokens.spacing.xs }}>
                        <Typography.Text type="secondary">
                          {t('releases.bomPnpMoreFindings', {
                            count: bomPnpRun.findings.length - 5,
                          })}
                        </Typography.Text>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ) : (
              <div className="revlog-inline-row">
                <InfoCircleOutlined
                  aria-hidden="true"
                  style={{ color: tokens.colors.draftText }}
                />
                <Typography.Text type="secondary">
                  {t('releases.bomPnpNoCheckRunYet')}
                </Typography.Text>
              </div>
            )}
          </Card>

          <Card title={t('releases.warningsHeading')} style={{ marginBottom: tokens.spacing.lg }}>
            {warnings.length === 0 ? (
              <div className="revlog-inline-row">
                <CheckCircleOutlined
                  aria-hidden="true"
                  style={{ color: tokens.colors.publishedText }}
                />
                <Typography.Text type="secondary">{t('releases.noWarnings')}</Typography.Text>
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
                {warnings.map((w, idx) => {
                  let text: string;
                  if (w.type === 'empty_category') {
                    text = t('releases.warningEmptyCategory', {
                      category: w.categoryName,
                    });
                  } else if (w.type === 'missing_hash') {
                    text = t('releases.warningMissingHash', { title: w.itemTitle });
                  } else {
                    text = t('releases.warningLinkItem', { title: w.itemTitle });
                  }
                  return (
                    <li
                      key={`${w.type}-${idx}`}
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
                      <span>{text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card
            title={t('releases.reviewSelectedHeading', {
              count: selectedItems.length,
            })}
            styles={{ body: { padding: 0 } }}
          >
            <div className="revlog-table-region" tabIndex={0}>
              <Table<Item>
                rowKey="id"
                size="middle"
                columns={reviewColumns}
                dataSource={selectedItems}
                pagination={false}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={t('releases.reviewNoItemsError')}
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
              disabled={selectedItems.length === 0}
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
                key: 'product',
                label: t('nav.product'),
                children: <Typography.Text strong>{product.name}</Typography.Text>,
              },
              {
                key: 'version',
                label: t('releases.versionLabel'),
                children: (
                  <Tag bordered style={{ marginInlineEnd: 0 }}>
                    {draftRelease.version_label}
                  </Tag>
                ),
              },
              {
                key: 'items',
                label: t('releases.contentsHeading'),
                children: t('releases.reviewSelectedHeading', { count: selectedItems.length }),
              },
              {
                key: 'notes',
                label: t('releases.notesLabel'),
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
              disabled={selectedItems.length === 0}
              onClick={() => void handlePublish()}
            >
              {t('releases.publishButton')}
            </Button>
          </Space>
        </Card>
      )}
    </PageHeader>
  );
};
