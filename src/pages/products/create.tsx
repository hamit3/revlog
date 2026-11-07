import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useInvalidate, useNotification, useTranslate } from '@refinedev/core';
import { Create } from '@refinedev/antd';
import { Alert, Button, Col, Form, Input, Radio, Row, Space, Spin, Tag, Typography } from 'antd';
import {
  BlockOutlined,
  BorderOutlined,
  CodeOutlined,
  HddOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { useProjectAccess } from '../../lib/useProjectAccess';
import { supabaseClient } from '../../providers/supabaseClient';
import type { Product, ProductTemplate, ProductType } from '../../types/database';

interface CreateProductFormValues {
  name: string;
  code?: string;
  product_type: ProductType;
  description?: string;
  template: ProductTemplate;
}

export const CreateProductPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();
  const { project, isOwner, isLoading: isAccessLoading } = useProjectAccess(projectId);

  const [form] = Form.useForm<CreateProductFormValues>();
  const selectedTemplate = Form.useWatch('template', form) ?? 'hardware_software';

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [templateTouched, setTemplateTouched] = useState(false);

  useEffect(() => {
    document.title = `${t('products.createTitle')}${
      project?.name ? ` - ${project.name}` : ''
    } | ${t('app.name')}`;
  }, [project?.name, t]);

  const handleDomainChange = (nextType: ProductType) => {
    if (templateTouched) {
      return;
    }
    if (nextType === 'hardware') {
      form.setFieldValue('template', 'hardware_only');
    } else if (nextType === 'software') {
      form.setFieldValue('template', 'software_only');
    } else {
      form.setFieldValue('template', 'hardware_software');
    }
  };

  const handleFinish = async (values: CreateProductFormValues) => {
    if (!project) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);

    const { data, error } = await supabaseClient.rpc('create_product_with_template', {
      p_project_id: project.id,
      p_name: values.name.trim(),
      p_code: values.code?.trim() || null,
      p_product_type: values.product_type,
      p_description: values.description?.trim() || null,
      p_template: values.template,
    });

    setSubmitting(false);

    if (error || !data) {
      setErrorMessage(error?.message ?? t('common.errorPrefix'));
      return;
    }

    const createdProduct = data as Product;

    await invalidate({ resource: 'products', invalidates: ['list'] });
    await invalidate({ resource: 'projects', invalidates: ['list', 'detail'] });

    notify?.({
      type: 'success',
      message: t('products.createdSuccess'),
    });

    navigate(`/projects/${project.id}/products/${createdProduct.id}`);
  };

  if (isAccessLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (!project || !projectId || !isOwner || project.archived) {
    return <Alert type="error" showIcon message={t('projects.notFound')} />;
  }

  const templateCards: {
    key: ProductTemplate;
    icon: React.ReactNode;
    title: string;
    hint: string;
    modules: string[];
  }[] = [
    {
      key: 'hardware_software',
      icon: <BlockOutlined aria-hidden="true" style={{ color: tokens.colors.accent }} />,
      title: t('products.templates.hardware_software'),
      hint: t('products.templates.hardware_softwareHint'),
      modules: [
        t('categories.templateNames.hardware'),
        t('categories.templateNames.firmware'),
        t('categories.templateNames.enclosure'),
        t('categories.templateNames.test'),
        t('categories.templateNames.production'),
      ],
    },
    {
      key: 'hardware_only',
      icon: <HddOutlined aria-hidden="true" style={{ color: tokens.colors.accent }} />,
      title: t('products.templates.hardware_only'),
      hint: t('products.templates.hardware_onlyHint'),
      modules: [
        t('products.templatePreviews.schematicsPcb'),
        t('products.templatePreviews.bomFab'),
        t('products.templatePreviews.assemblyTest'),
      ],
    },
    {
      key: 'software_only',
      icon: <CodeOutlined aria-hidden="true" style={{ color: tokens.colors.accent }} />,
      title: t('products.templates.software_only'),
      hint: t('products.templates.software_onlyHint'),
      modules: [
        t('products.templatePreviews.binariesBuilds'),
        t('products.templatePreviews.configuration'),
        t('products.templatePreviews.testVerification'),
      ],
    },
    {
      key: 'empty',
      icon: <BorderOutlined aria-hidden="true" style={{ color: tokens.colors.textSecondary }} />,
      title: t('products.templates.empty'),
      hint: t('products.templates.emptyHint'),
      modules: [],
    },
  ];

  return (
    <div style={{ maxWidth: 820 }}>
      <Create
        resource="products"
        breadcrumb={false}
        isLoading={submitting}
        title={
          <PageHeaderTitle
            title={t('products.createTitle')}
            subtitle={t('products.createSubtitle', { project: project.name })}
          />
        }
        headerProps={{
          onBack: () => navigate(`/projects/${project.id}`),
        }}
        footerButtons={() => (
          <Space size={tokens.spacing.sm}>
            <Button onClick={() => navigate(`/projects/${project.id}`)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden="true" />}
              loading={submitting}
              onClick={() => form.submit()}
            >
              {t('products.createButton')}
            </Button>
          </Space>
        )}
      >
        {errorMessage && (
          <div role="alert" style={{ marginBottom: tokens.spacing.lg }}>
            <Alert type="error" showIcon message={errorMessage} />
          </div>
        )}

        <Form<CreateProductFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          validateTrigger="onBlur"
          initialValues={{
            product_type: 'mixed',
            template: 'hardware_software',
          }}
          onValuesChange={() => {
            if (errorMessage) {
              setErrorMessage(null);
            }
          }}
          onFinish={handleFinish}
        >
          <Row gutter={[tokens.spacing.md, 0]}>
            <Col xs={24} sm={16}>
              <Form.Item
                label={t('products.nameLabel')}
                name="name"
                htmlFor="product-name"
                rules={[{ required: true, whitespace: true, message: t('products.nameRequired') }]}
              >
                <Input
                  id="product-name"
                  name="name"
                  placeholder={t('products.namePlaceholder')}
                  maxLength={120}
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={8}>
              <Form.Item label={t('products.codeLabel')} name="code" htmlFor="product-code">
                <Input
                  id="product-code"
                  name="code"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={t('products.codePlaceholder')}
                  maxLength={40}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label={t('products.typeLabel')} name="product_type">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              onChange={(e) => handleDomainChange(e.target.value as ProductType)}
            >
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
            htmlFor="product-description"
          >
            <Input.TextArea
              id="product-description"
              name="description"
              rows={3}
              placeholder={t('products.descriptionPlaceholder')}
              maxLength={500}
            />
          </Form.Item>

          <Form.Item
            label={t('products.templateLabel')}
            name="template"
            style={{ marginBottom: 0 }}
          >
            <Radio.Group style={{ width: '100%' }} onChange={() => setTemplateTouched(true)}>
              <Row gutter={[tokens.spacing.md, tokens.spacing.md]}>
                {templateCards.map((tpl) => {
                  const isSelected = selectedTemplate === tpl.key;
                  const labelId = `product-tpl-${tpl.key}`;
                  return (
                    <Col key={tpl.key} xs={24} md={12}>
                      <div
                        className="revlog-selectable-card"
                        onClick={() => {
                          setTemplateTouched(true);
                          form.setFieldValue('template', tpl.key);
                        }}
                        style={{
                          height: '100%',
                          border: `1px solid ${
                            isSelected ? tokens.colors.accent : tokens.colors.border
                          }`,
                          backgroundColor: isSelected
                            ? tokens.colors.surfaceSelected
                            : tokens.colors.surface,
                          borderRadius: tokens.radius.md,
                          padding: tokens.spacing.md,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: tokens.spacing.sm,
                          }}
                        >
                          <Radio
                            value={tpl.key}
                            aria-labelledby={labelId}
                            style={{ marginInlineEnd: 0, marginTop: 2 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="revlog-inline-row" id={labelId}>
                              {tpl.icon}
                              <Typography.Text strong>{tpl.title}</Typography.Text>
                            </div>
                            <div
                              className="revlog-secondary-text revlog-prose"
                              style={{ marginTop: 2 }}
                            >
                              {tpl.hint}
                            </div>
                            {tpl.modules.length > 0 && (
                              <div
                                className="revlog-inline-row"
                                style={{ marginTop: tokens.spacing.sm }}
                              >
                                {tpl.modules.map((mod) => (
                                  <Tag key={mod} bordered>
                                    {mod}
                                  </Tag>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Col>
                  );
                })}
              </Row>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Create>
    </div>
  );
};
