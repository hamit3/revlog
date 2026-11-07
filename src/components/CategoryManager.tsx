import React, { useState } from 'react';
import { useNotification, useTranslate } from '@refinedev/core';
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { tokens } from '../theme/tokens';
import { supabaseClient } from '../providers/supabaseClient';
import type { Category } from '../types/database';

export interface CategoryWithCounts extends Category {
  totalItemCount: number;
  activeItemCount: number;
}

export interface CategoryManagerProps {
  projectId: string;
  productId: string;
  categories: CategoryWithCounts[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}

interface CategoryFormValues {
  name: string;
  description?: string;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  projectId,
  productId,
  categories,
  canManage,
  onChanged,
}) => {
  const t = useTranslate();
  const { open: notify } = useNotification();
  const [addForm] = Form.useForm<CategoryFormValues>();
  const [editForm] = Form.useForm<CategoryFormValues>();

  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<CategoryWithCounts | null>(null);

  const handleAdd = async (values: CategoryFormValues) => {
    setBusy(true);
    setErrorMessage(null);

    const nextPosition =
      categories.length > 0 ? Math.max(...categories.map((cat) => cat.position)) + 1 : 0;

    const { error } = await supabaseClient.from('categories').insert({
      project_id: projectId,
      product_id: productId,
      name: values.name.trim(),
      description: values.description?.trim() || null,
      position: nextPosition,
    });

    setBusy(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    addForm.resetFields();
    notify?.({ type: 'success', message: t('categories.createdSuccess') });
    await onChanged();
  };

  const openEditModal = (cat: CategoryWithCounts) => {
    setEditingCategory(cat);
    editForm.setFieldsValue({
      name: cat.name,
      description: cat.description ?? '',
    });
  };

  const handleEditSave = async (values: CategoryFormValues) => {
    if (!editingCategory) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);

    const { error } = await supabaseClient
      .from('categories')
      .update({
        name: values.name.trim(),
        description: values.description?.trim() || null,
      })
      .eq('id', editingCategory.id);

    setBusy(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setEditingCategory(null);
    notify?.({ type: 'success', message: t('categories.updatedSuccess') });
    await onChanged();
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    const current = categories[index];
    const swapWith = categories[targetIndex];
    if (!current || !swapWith) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    const reordered = [...categories];
    reordered[index] = swapWith;
    reordered[targetIndex] = current;

    for (let idx = 0; idx < reordered.length; idx += 1) {
      const cat = reordered[idx]!;
      if (cat.position !== idx) {
        const { error } = await supabaseClient
          .from('categories')
          .update({ position: idx })
          .eq('id', cat.id);
        if (error) {
          setErrorMessage(error.message);
          setBusy(false);
          return;
        }
      }
    }

    setBusy(false);
    await onChanged();
  };

  const handleDelete = async (cat: CategoryWithCounts) => {
    setBusy(true);
    setErrorMessage(null);

    const { error } = await supabaseClient.from('categories').delete().eq('id', cat.id);
    setBusy(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    notify?.({ type: 'success', message: t('categories.deletedSuccess') });
    await onChanged();
  };

  const columns: ColumnsType<CategoryWithCounts> = [
    {
      title: t('categories.nameLabel'),
      dataIndex: 'name',
      key: 'name',
      render: (_val: unknown, record: CategoryWithCounts) => (
        <div>
          <Typography.Text strong>{record.name}</Typography.Text>
          {record.description && (
            <div className="revlog-secondary-text revlog-prose">{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: t('items.heading'),
      key: 'count',
      width: 140,
      render: (_val: unknown, record: CategoryWithCounts) => (
        <Tag bordered style={{ marginInlineEnd: 0 }}>
          {t('categories.itemCount', { count: record.activeItemCount })}
        </Tag>
      ),
    },
    ...(canManage
      ? [
          {
            title: t('items.columns.actions'),
            key: 'actions',
            width: 220,
            render: (_val: unknown, record: CategoryWithCounts, index: number) => {
              const isEmpty = record.totalItemCount === 0;
              return (
                <Space size={tokens.spacing.xs}>
                  <Tooltip title={t('categories.moveUp')}>
                    <Button
                      size="small"
                      icon={<ArrowUpOutlined aria-hidden="true" />}
                      aria-label={t('categories.moveUpAria', { name: record.name })}
                      disabled={busy || index === 0}
                      onClick={() => void handleMove(index, -1)}
                    />
                  </Tooltip>
                  <Tooltip title={t('categories.moveDown')}>
                    <Button
                      size="small"
                      icon={<ArrowDownOutlined aria-hidden="true" />}
                      aria-label={t('categories.moveDownAria', { name: record.name })}
                      disabled={busy || index === categories.length - 1}
                      onClick={() => void handleMove(index, 1)}
                    />
                  </Tooltip>
                  <Button
                    size="small"
                    icon={<EditOutlined aria-hidden="true" />}
                    aria-label={t('categories.editAria', { name: record.name })}
                    disabled={busy}
                    onClick={() => openEditModal(record)}
                  >
                    {t('common.edit')}
                  </Button>
                  {isEmpty ? (
                    <Popconfirm
                      title={t('categories.deleteConfirm', { name: record.name })}
                      onConfirm={() => void handleDelete(record)}
                      okText={t('common.delete')}
                      cancelText={t('common.cancel')}
                    >
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined aria-hidden="true" />}
                        aria-label={t('categories.deleteAria', { name: record.name })}
                        disabled={busy}
                      />
                    </Popconfirm>
                  ) : (
                    <Tooltip title={t('categories.cannotDeleteNonEmpty')}>
                      <Button
                        size="small"
                        danger
                        disabled
                        icon={<DeleteOutlined aria-hidden="true" />}
                        aria-label={t('categories.deleteAria', { name: record.name })}
                      />
                    </Tooltip>
                  )}
                </Space>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.lg }}>
      {errorMessage && (
        <div role="alert">
          <Alert type="error" showIcon message={errorMessage} />
        </div>
      )}

      <div className="revlog-table-region" tabIndex={0}>
        <Table<CategoryWithCounts>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={categories}
          pagination={false}
          locale={{
            emptyText: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('categories.empty')} />
            ),
          }}
        />
      </div>

      {canManage && (
        <Card
          size="small"
          style={{
            backgroundColor: tokens.colors.surfaceSubtle,
            borderColor: tokens.colors.border,
          }}
        >
          <Form<CategoryFormValues>
            form={addForm}
            layout="vertical"
            requiredMark={false}
            validateTrigger="onBlur"
            onFinish={handleAdd}
          >
            <div className="revlog-inline-form-grid">
              <Form.Item
                label={t('categories.nameLabel')}
                name="name"
                htmlFor="new-category-name"
                style={{ marginBottom: 0 }}
                rules={[
                  { required: true, whitespace: true, message: t('categories.nameRequired') },
                ]}
              >
                <Input
                  id="new-category-name"
                  name="category_name"
                  placeholder={t('categories.namePlaceholder')}
                  maxLength={80}
                />
              </Form.Item>

              <Form.Item
                label={t('categories.descriptionLabel')}
                name="description"
                htmlFor="new-category-description"
                style={{ marginBottom: 0 }}
              >
                <Input
                  id="new-category-description"
                  name="category_description"
                  placeholder={t('categories.descriptionPlaceholder')}
                  maxLength={240}
                />
              </Form.Item>

              <Form.Item
                className="revlog-submit-item"
                label={<span aria-hidden="true">&nbsp;</span>}
                colon={false}
                style={{ marginBottom: 0 }}
              >
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<PlusOutlined aria-hidden="true" />}
                  loading={busy}
                >
                  {t('categories.addCategory')}
                </Button>
              </Form.Item>
            </div>
          </Form>
        </Card>
      )}

      <Modal
        open={Boolean(editingCategory)}
        title={t('common.edit')}
        onCancel={() => setEditingCategory(null)}
        footer={null}
        destroyOnClose
      >
        <Form<CategoryFormValues>
          form={editForm}
          layout="vertical"
          requiredMark={false}
          validateTrigger="onBlur"
          onFinish={handleEditSave}
        >
          <Form.Item
            label={t('categories.nameLabel')}
            name="name"
            htmlFor="edit-category-name"
            rules={[{ required: true, whitespace: true, message: t('categories.nameRequired') }]}
          >
            <Input id="edit-category-name" name="name" maxLength={80} />
          </Form.Item>

          <Form.Item
            label={t('categories.descriptionLabel')}
            name="description"
            htmlFor="edit-category-description"
          >
            <Input id="edit-category-description" name="description" maxLength={240} />
          </Form.Item>

          <Space size={tokens.spacing.sm}>
            <Button type="primary" htmlType="submit" loading={busy}>
              {t('common.save')}
            </Button>
            <Button onClick={() => setEditingCategory(null)} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};
