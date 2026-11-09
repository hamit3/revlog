import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useInvalidate, useNotification, useTranslate } from '@refinedev/core';
import { Edit } from '@refinedev/antd';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Popconfirm,
  Radio,
  Row,
  Spin,
  Tabs,
  Typography,
} from 'antd';
import {
  BlockOutlined,
  CodeOutlined,
  HddOutlined,
  InboxOutlined,
  SettingOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { CategoryManager, type CategoryWithCounts } from '../../components/CategoryManager';
import { useProductAccess } from '../../lib/useProjectAccess';
import { supabaseClient } from '../../providers/supabaseClient';
import type { Category, Item, ProductType } from '../../types/database';

interface ProductGeneralFormValues {
  name: string;
  code?: string;
  product_type: ProductType;
  description?: string;
}

export const ProductSettingsPage: React.FC = () => {
  const t = useTranslate();
  const { projectId, productId } = useParams<{ projectId: string; productId: string }>();
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();
  const {
    project,
    product,
    isOwner,
    canManageProduct,
    isLoading: isAccessLoading,
    reload: reloadProduct,
  } = useProductAccess(projectId, productId);

  const [generalForm] = Form.useForm<ProductGeneralFormValues>();

  const [categories, setCategories] = useState<Category[]>([]);
  const [allItems, setAllItems] = useState<Pick<Item, 'id' | 'category_id' | 'archived'>[]>([]);

  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isSavingGeneral, setIsSavingGeneral] = useState<boolean>(false);
  const [isArchiving, setIsArchiving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSettingsData = useCallback(async () => {
    if (!projectId || !productId) {
      return;
    }
    setIsLoadingData(true);

    const [catRes, itemRes] = await Promise.all([
      supabaseClient
        .from('categories')
        .select('*')
        .eq('project_id', projectId)
        .eq('product_id', productId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
      supabaseClient
        .from('items')
        .select('id, category_id, archived')
        .eq('project_id', projectId)
        .eq('product_id', productId),
    ]);

    if (catRes.error || itemRes.error) {
      setErrorMessage(catRes.error?.message ?? itemRes.error?.message ?? t('common.errorPrefix'));
      setIsLoadingData(false);
      return;
    }

    setCategories((catRes.data as Category[]) ?? []);
    setAllItems((itemRes.data as Pick<Item, 'id' | 'category_id' | 'archived'>[]) ?? []);
    setIsLoadingData(false);
  }, [projectId, productId, t]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId || !productId) {
        return;
      }
      const [catRes, itemRes] = await Promise.all([
        supabaseClient
          .from('categories')
          .select('*')
          .eq('project_id', projectId)
          .eq('product_id', productId)
          .order('position', { ascending: true })
          .order('created_at', { ascending: true }),
        supabaseClient
          .from('items')
          .select('id, category_id, archived')
          .eq('project_id', projectId)
          .eq('product_id', productId),
      ]);

      if (!active) {
        return;
      }
      if (catRes.error || itemRes.error) {
        setErrorMessage(catRes.error?.message ?? itemRes.error?.message ?? t('common.errorPrefix'));
      } else {
        setCategories((catRes.data as Category[]) ?? []);
        setAllItems((itemRes.data as Pick<Item, 'id' | 'category_id' | 'archived'>[]) ?? []);
      }
      setIsLoadingData(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId, productId, t]);

  useEffect(() => {
    if (product) {
      document.title = `${t('products.settingsTitle')} - ${product.name} | ${t('app.name')}`;
      generalForm.setFieldsValue({
        name: product.name,
        code: product.code ?? '',
        product_type: product.product_type,
        description: product.description ?? '',
      });
    }
  }, [product, generalForm, t]);

  const categoriesWithCounts = useMemo<CategoryWithCounts[]>(() => {
    return categories.map((cat) => {
      const catItems = allItems.filter((item) => item.category_id === cat.id);
      const activeCount = catItems.filter((item) => !item.archived).length;
      return {
        ...cat,
        totalItemCount: catItems.length,
        activeItemCount: activeCount,
      };
    });
  }, [categories, allItems]);

  const handleSaveGeneral = async (values: ProductGeneralFormValues) => {
    if (!product) {
      return;
    }
    setIsSavingGeneral(true);
    setErrorMessage(null);

    const { error } = await supabaseClient
      .from('products')
      .update({
        name: values.name.trim(),
        code: values.code?.trim() || null,
        product_type: values.product_type,
        description: values.description?.trim() || null,
      })
      .eq('id', product.id);

    setIsSavingGeneral(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await reloadProduct();
    await invalidate({ resource: 'products', invalidates: ['list', 'detail'] });
    await invalidate({ resource: 'projects', invalidates: ['list'] });
    notify?.({ type: 'success', message: t('common.saved') });
  };

  const handleToggleArchive = async (nextArchived: boolean) => {
    if (!product) {
      return;
    }
    setIsArchiving(true);
    setErrorMessage(null);

    const { error } = await supabaseClient
      .from('products')
      .update({ archived: nextArchived })
      .eq('id', product.id);

    setIsArchiving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await reloadProduct();
    await invalidate({ resource: 'products', invalidates: ['list', 'detail'] });
    await invalidate({ resource: 'projects', invalidates: ['list'] });
    notify?.({
      type: 'success',
      message: nextArchived ? t('products.archivedSuccess') : t('products.unarchivedSuccess'),
    });
  };

  if (isAccessLoading || isLoadingData) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (!project || !product || !projectId || !productId) {
    return <Alert type="error" showIcon message={t('products.notFound')} />;
  }

  return (
    <Edit
      goBack={false}
      resource="products"
      recordItemId={product.id}
      breadcrumb={false}
      canDelete={false}
      footerButtons={() => null}
      title={
        <PageHeaderTitle
          title={t('products.settingsTitle')}
          subtitle={`${product.name} · ${t('products.settingsSubtitle')}`}
          badge={product.archived ? <StatusBadge kind="archived" /> : undefined}
        />
      }
      contentProps={{
        styles: { body: { paddingTop: tokens.spacing.sm } },
      }}
    >
      {!isOwner && (
        <Alert
          type="info"
          showIcon
          message={t('products.ownerOnlyNotice')}
          style={{ marginBottom: tokens.spacing.md }}
        />
      )}

      {errorMessage && (
        <div role="alert" style={{ marginBottom: tokens.spacing.md }}>
          <Alert type="error" showIcon message={errorMessage} />
        </div>
      )}

      <Tabs
        defaultActiveKey="general"
        items={[
          {
            key: 'general',
            label: (
              <span className="revlog-inline-row">
                <SettingOutlined aria-hidden="true" />
                <span>{t('settings.generalHeading')}</span>
              </span>
            ),
            children: (
              <div style={{ paddingTop: tokens.spacing.sm, maxWidth: 620 }}>
                <Form<ProductGeneralFormValues>
                  form={generalForm}
                  layout="vertical"
                  requiredMark={false}
                  validateTrigger="onBlur"
                  disabled={!canManageProduct}
                  onFinish={handleSaveGeneral}
                >
                  <Row gutter={[tokens.spacing.md, 0]}>
                    <Col xs={24} sm={16}>
                      <Form.Item
                        label={t('products.nameLabel')}
                        name="name"
                        htmlFor="settings-product-name"
                        rules={[
                          {
                            required: true,
                            whitespace: true,
                            message: t('products.nameRequired'),
                          },
                        ]}
                      >
                        <Input id="settings-product-name" name="name" maxLength={120} />
                      </Form.Item>
                    </Col>

                    <Col xs={24} sm={8}>
                      <Form.Item
                        label={t('products.codeLabel')}
                        name="code"
                        htmlFor="settings-product-code"
                      >
                        <Input
                          id="settings-product-code"
                          name="code"
                          autoCorrect="off"
                          autoCapitalize="characters"
                          spellCheck={false}
                          maxLength={40}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item label={t('products.typeLabel')} name="product_type">
                    <Radio.Group optionType="button" buttonStyle="solid">
                      <Radio.Button value="mixed">
                        <span className="revlog-inline-row">
                          <BlockOutlined aria-hidden="true" />
                          <span>{t('products.types.mixed')}</span>
                        </span>
                      </Radio.Button>
                      <Radio.Button value="hardware">
                        <span className="revlog-inline-row">
                          <HddOutlined aria-hidden="true" />
                          <span>{t('products.types.hardware')}</span>
                        </span>
                      </Radio.Button>
                      <Radio.Button value="software">
                        <span className="revlog-inline-row">
                          <CodeOutlined aria-hidden="true" />
                          <span>{t('products.types.software')}</span>
                        </span>
                      </Radio.Button>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item
                    label={t('products.descriptionLabel')}
                    name="description"
                    htmlFor="settings-product-description"
                  >
                    <Input.TextArea
                      id="settings-product-description"
                      name="description"
                      rows={3}
                      maxLength={500}
                    />
                  </Form.Item>

                  {canManageProduct && (
                    <Button type="primary" htmlType="submit" loading={isSavingGeneral}>
                      {t('common.save')}
                    </Button>
                  )}
                </Form>
              </div>
            ),
          },
          {
            key: 'modules',
            label: (
              <span className="revlog-inline-row">
                <TagsOutlined aria-hidden="true" />
                <span>{t('products.modulesHeading')}</span>
                <span className="revlog-count-pill">{categories.length}</span>
              </span>
            ),
            children: (
              <div style={{ paddingTop: tokens.spacing.sm }}>
                <CategoryManager
                  projectId={project.id}
                  productId={product.id}
                  categories={categoriesWithCounts}
                  canManage={canManageProduct && !product.archived}
                  onChanged={loadSettingsData}
                />
              </div>
            ),
          },
          {
            key: 'archive',
            label: (
              <span className="revlog-inline-row">
                <InboxOutlined aria-hidden="true" />
                <span>{t('settings.archiveHeading')}</span>
              </span>
            ),
            children: (
              <div style={{ paddingTop: tokens.spacing.sm }}>
                <Card
                  size="small"
                  style={{
                    backgroundColor: tokens.colors.surfaceSubtle,
                    borderColor: tokens.colors.border,
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
                    <Typography.Text type="secondary" className="revlog-prose">
                      {product.archived
                        ? t('products.unarchiveDescription')
                        : t('products.archiveDescription')}
                    </Typography.Text>

                    {canManageProduct &&
                      (product.archived ? (
                        <Button
                          loading={isArchiving}
                          onClick={() => void handleToggleArchive(false)}
                        >
                          {t('common.unarchive')}
                        </Button>
                      ) : (
                        <Popconfirm
                          title={t('products.archiveConfirm')}
                          onConfirm={() => void handleToggleArchive(true)}
                          okText={t('common.archive')}
                          cancelText={t('common.cancel')}
                        >
                          <Button danger loading={isArchiving}>
                            {t('common.archive')}
                          </Button>
                        </Popconfirm>
                      ))}
                  </div>
                </Card>
              </div>
            ),
          },
        ]}
      />
    </Edit>
  );
};
