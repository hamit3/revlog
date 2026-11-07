import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useInvalidate, useNotification, useTranslate } from '@refinedev/core';
import { Create } from '@refinedev/antd';
import { Alert, Button, Col, Form, Input, Radio, Row, Space, Tag, Typography } from 'antd';
import { AppstoreAddOutlined, BlockOutlined, HddOutlined } from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { supabaseClient } from '../../providers/supabaseClient';
import type { Project, ProjectTemplate } from '../../types/database';

interface CreateProjectFormValues {
  name: string;
  description?: string;
  template: ProjectTemplate;
}

export const CreateProjectPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();
  const [form] = Form.useForm<CreateProjectFormValues>();
  const selectedTemplate = Form.useWatch('template', form) ?? 'empty';

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t('projects.createTitle')} | ${t('app.name')}`;
  }, [t]);

  const handleFinish = async (values: CreateProjectFormValues) => {
    setSubmitting(true);
    setErrorMessage(null);

    const { data, error } = await supabaseClient.rpc('create_project_with_template', {
      p_name: values.name.trim(),
      p_description: values.description?.trim() ?? '',
      p_template: values.template,
    });

    setSubmitting(false);

    if (error || !data) {
      setErrorMessage(error?.message ?? t('common.errorPrefix'));
      return;
    }

    const createdProject = data as Project;

    await invalidate({
      resource: 'projects',
      invalidates: ['list'],
    });
    await invalidate({
      resource: 'products',
      invalidates: ['list'],
    });

    notify?.({
      type: 'success',
      message: t('projects.createdSuccess'),
    });

    navigate(`/projects/${createdProject.id}`);
  };

  const hardwareCategoryPreview = [
    t('categories.templateNames.hardware'),
    t('categories.templateNames.firmware'),
    t('categories.templateNames.enclosure'),
    t('categories.templateNames.test'),
    t('categories.templateNames.production'),
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      <Create
        resource="projects"
        breadcrumb={false}
        isLoading={submitting}
        title={
          <PageHeaderTitle
            title={t('projects.createTitle')}
            subtitle={t('projects.createSubtitle')}
          />
        }
        headerProps={{
          onBack: () => navigate('/projects'),
        }}
        footerButtons={() => (
          <Space size={tokens.spacing.sm}>
            <Button onClick={() => navigate('/projects')} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button
              type="primary"
              icon={<AppstoreAddOutlined aria-hidden="true" />}
              loading={submitting}
              onClick={() => form.submit()}
            >
              {t('projects.createButton')}
            </Button>
          </Space>
        )}
      >
        {errorMessage && (
          <div role="alert" style={{ marginBottom: tokens.spacing.lg }}>
            <Alert type="error" showIcon message={errorMessage} />
          </div>
        )}

        <Form<CreateProjectFormValues>
          form={form}
          layout="vertical"
          requiredMark={false}
          validateTrigger="onBlur"
          initialValues={{ template: 'empty' }}
          onValuesChange={() => {
            if (errorMessage) {
              setErrorMessage(null);
            }
          }}
          onFinish={handleFinish}
        >
          <Form.Item
            label={t('projects.nameLabel')}
            name="name"
            htmlFor="project-name"
            rules={[{ required: true, whitespace: true, message: t('projects.nameRequired') }]}
          >
            <Input
              id="project-name"
              name="name"
              placeholder={t('projects.namePlaceholder')}
              maxLength={120}
            />
          </Form.Item>

          <Form.Item
            label={t('projects.descriptionLabel')}
            name="description"
            htmlFor="project-description"
          >
            <Input.TextArea
              id="project-description"
              name="description"
              rows={3}
              placeholder={t('projects.descriptionPlaceholder')}
              maxLength={500}
            />
          </Form.Item>

          <Form.Item
            label={t('projects.templateLabel')}
            name="template"
            style={{ marginBottom: 0 }}
          >
            <Radio.Group style={{ width: '100%' }}>
              <Row gutter={[tokens.spacing.md, tokens.spacing.md]}>
                <Col xs={24} md={12}>
                  <div
                    className="revlog-selectable-card"
                    onClick={() => form.setFieldValue('template', 'empty')}
                    style={{
                      height: '100%',
                      border: `1px solid ${
                        selectedTemplate === 'empty' ? tokens.colors.accent : tokens.colors.border
                      }`,
                      backgroundColor:
                        selectedTemplate === 'empty'
                          ? tokens.colors.surfaceSelected
                          : tokens.colors.surface,
                      borderRadius: tokens.radius.md,
                      padding: tokens.spacing.md,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.spacing.sm }}
                    >
                      <Radio
                        value="empty"
                        aria-labelledby="template-empty-label"
                        style={{ marginInlineEnd: 0, marginTop: 2 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="revlog-inline-row" id="template-empty-label">
                          <BlockOutlined
                            aria-hidden="true"
                            style={{ color: tokens.colors.accent }}
                          />
                          <Typography.Text strong>{t('projects.templateEmpty')}</Typography.Text>
                        </div>
                        <div
                          className="revlog-secondary-text revlog-prose"
                          style={{ marginTop: 2 }}
                        >
                          {t('projects.templateEmptyHint')}
                        </div>
                      </div>
                    </div>
                  </div>
                </Col>

                <Col xs={24} md={12}>
                  <div
                    className="revlog-selectable-card"
                    onClick={() => form.setFieldValue('template', 'hardware_product')}
                    style={{
                      height: '100%',
                      border: `1px solid ${
                        selectedTemplate === 'hardware_product'
                          ? tokens.colors.accent
                          : tokens.colors.border
                      }`,
                      backgroundColor:
                        selectedTemplate === 'hardware_product'
                          ? tokens.colors.surfaceSelected
                          : tokens.colors.surface,
                      borderRadius: tokens.radius.md,
                      padding: tokens.spacing.md,
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.spacing.sm }}
                    >
                      <Radio
                        value="hardware_product"
                        aria-labelledby="template-hardware-label"
                        style={{ marginInlineEnd: 0, marginTop: 2 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="revlog-inline-row" id="template-hardware-label">
                          <HddOutlined
                            aria-hidden="true"
                            style={{ color: tokens.colors.textSecondary }}
                          />
                          <Typography.Text strong>{t('projects.templateHardware')}</Typography.Text>
                        </div>
                        <div
                          className="revlog-secondary-text revlog-prose"
                          style={{ marginTop: 2 }}
                        >
                          {t('projects.templateHardwareHint')}
                        </div>
                        <div className="revlog-inline-row" style={{ marginTop: tokens.spacing.sm }}>
                          {hardwareCategoryPreview.map((catName) => (
                            <Tag key={catName} bordered>
                              {catName}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </Col>
              </Row>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Create>
    </div>
  );
};
