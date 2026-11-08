import React, { useEffect, useState } from 'react';
import { useNotification, useTranslate } from '@refinedev/core';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  Progress,
  Radio,
  Select,
  Space,
  Typography,
  Upload,
} from 'antd';
import { EyeOutlined, FileOutlined, InboxOutlined, LinkOutlined } from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { appEnv } from '../../lib/env';
import { sha256HexFromFile } from '../../lib/sha256';
import { formatFileSize } from '../../lib/format';
import { uploadProjectFileWithProgress, validateUploadFileSize } from '../../lib/storage';
import { isAnyGerberItem } from '../../lib/gerber';
import { GerberViewerModal } from '../../components/gerber/GerberViewerModal';
import { supabaseClient } from '../../providers/supabaseClient';
import type { Category, Item, ItemKind } from '../../types/database';

export interface ItemDrawerProps {
  open: boolean;
  projectId: string;
  productId: string;
  categories: Category[];
  defaultCategoryId?: string | null;
  editingItem?: Item | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface ItemFormValues {
  category_id: string;
  kind: ItemKind;
  title: string;
  version_label?: string;
  note?: string;
  url?: string;
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const ItemDrawer: React.FC<ItemDrawerProps> = ({
  open,
  projectId,
  productId,
  categories,
  defaultCategoryId,
  editingItem,
  onClose,
  onSaved,
}) => {
  const t = useTranslate();
  const { open: notify } = useNotification();
  const [form] = Form.useForm<ItemFormValues>();

  const isEditing = Boolean(editingItem);
  const watchedKind = Form.useWatch('kind', form) ?? editingItem?.kind ?? 'file';

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [computedSha256, setComputedSha256] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGerberModalOpen, setIsGerberModalOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editingItem) {
      form.setFieldsValue({
        category_id: editingItem.category_id,
        kind: editingItem.kind,
        title: editingItem.title,
        version_label: editingItem.version_label,
        note: editingItem.note ?? '',
        url: editingItem.url ?? '',
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        category_id: defaultCategoryId ?? categories[0]?.id ?? '',
        kind: 'file',
        title: '',
        version_label: '',
        note: '',
        url: '',
      });
    }
  }, [open, editingItem, defaultCategoryId, categories, form]);

  const resetTransientState = () => {
    setSelectedFile(null);
    setComputedSha256(null);
    setIsHashing(false);
    setUploadPercent(null);
    setSubmitting(false);
    setErrorMessage(null);
  };

  const handleDrawerClose = () => {
    if (submitting) {
      return;
    }
    resetTransientState();
    onClose();
  };

  const processSelectedFile = async (file: File) => {
    setErrorMessage(null);
    setSelectedFile(null);
    setComputedSha256(null);

    if (!validateUploadFileSize(file.size)) {
      setErrorMessage(t('items.fileTooLarge', { maxMb: appEnv.maxUploadMb }));
      return;
    }

    setSelectedFile(file);
    setIsHashing(true);
    try {
      const digest = await sha256HexFromFile(file);
      setComputedSha256(digest);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('common.errorPrefix'));
      setSelectedFile(null);
    } finally {
      setIsHashing(false);
    }
  };

  const handleFinish = async (values: ItemFormValues) => {
    setErrorMessage(null);

    const activeKind: ItemKind = editingItem ? editingItem.kind : values.kind;

    if (activeKind === 'file' && !isEditing && !selectedFile) {
      setErrorMessage(t('items.fileRequired'));
      return;
    }

    if (activeKind === 'link' && (!values.url || !isValidHttpUrl(values.url))) {
      setErrorMessage(t('items.urlRequired'));
      return;
    }

    setSubmitting(true);

    try {
      const { data: userData } = await supabaseClient.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        throw new Error('Authentication required.');
      }

      let storagePath = editingItem?.storage_path ?? null;
      let fileName = editingItem?.file_name ?? null;
      let fileSize = editingItem?.file_size ?? null;
      let sha256 = editingItem?.sha256 ?? null;

      if (activeKind === 'file' && selectedFile) {
        const hashToSave = computedSha256 ?? (await sha256HexFromFile(selectedFile));
        setUploadPercent(0);
        const uploaded = await uploadProjectFileWithProgress({
          projectId,
          file: selectedFile,
          onProgress: (pct) => setUploadPercent(pct),
        });
        storagePath = uploaded.storagePath;
        fileName = uploaded.fileName;
        fileSize = uploaded.fileSize;
        sha256 = hashToSave;
      }

      if (isEditing && editingItem) {
        const { error } = await supabaseClient
          .from('items')
          .update({
            category_id: values.category_id,
            title: values.title.trim(),
            version_label: values.version_label?.trim() ?? '',
            note: values.note?.trim() || null,
            url: activeKind === 'link' ? (values.url?.trim() ?? null) : null,
            storage_path: activeKind === 'file' ? storagePath : null,
            file_name: activeKind === 'file' ? fileName : null,
            file_size: activeKind === 'file' ? fileSize : null,
            sha256: activeKind === 'file' ? sha256 : null,
          })
          .eq('id', editingItem.id);

        if (error) {
          throw new Error(error.message);
        }

        notify?.({ type: 'success', message: t('items.updatedSuccess') });
      } else {
        const { error } = await supabaseClient.from('items').insert({
          project_id: projectId,
          product_id: productId,
          category_id: values.category_id,
          title: values.title.trim(),
          kind: activeKind,
          version_label: values.version_label?.trim() ?? '',
          note: values.note?.trim() || null,
          url: activeKind === 'link' ? (values.url?.trim() ?? null) : null,
          storage_path: activeKind === 'file' ? storagePath : null,
          file_name: activeKind === 'file' ? fileName : null,
          file_size: activeKind === 'file' ? fileSize : null,
          sha256: activeKind === 'file' ? sha256 : null,
          created_by: userId,
        });

        if (error) {
          throw new Error(error.message);
        }

        notify?.({ type: 'success', message: t('items.createdSuccess') });
      }

      resetTransientState();
      await onSaved();
      onClose();
    } catch (err) {
      setUploadPercent(null);
      setSubmitting(false);
      setErrorMessage(err instanceof Error ? err.message : t('common.errorPrefix'));
    }
  };

  return (
    <Drawer
      open={open}
      onClose={handleDrawerClose}
      title={isEditing ? t('items.editItem') : t('items.addItem')}
      width={520}
      destroyOnClose
      extra={
        <Space size={tokens.spacing.sm}>
          <Button onClick={handleDrawerClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button type="primary" loading={submitting || isHashing} onClick={() => form.submit()}>
            {isEditing ? t('items.saveEdit') : t('items.saveCreate')}
          </Button>
        </Space>
      }
    >
      {errorMessage && (
        <div role="alert" style={{ marginBottom: tokens.spacing.lg }}>
          <Alert type="error" showIcon message={errorMessage} />
        </div>
      )}

      <Form<ItemFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        validateTrigger="onBlur"
        onFinish={handleFinish}
      >
        <Form.Item
          label={t('items.categoryLabel')}
          name="category_id"
          rules={[{ required: true, message: t('items.categoryRequired') }]}
        >
          <Select
            options={categories.map((cat) => ({
              value: cat.id,
              label: cat.name,
            }))}
          />
        </Form.Item>

        <Form.Item label={t('items.kindLabel')} name="kind">
          <Radio.Group optionType="button" buttonStyle="solid" disabled={isEditing}>
            <Radio.Button value="file">
              <span className="revlog-inline-row">
                <FileOutlined aria-hidden="true" />
                <span>{t('items.kindFile')}</span>
              </span>
            </Radio.Button>
            <Radio.Button value="link">
              <span className="revlog-inline-row">
                <LinkOutlined aria-hidden="true" />
                <span>{t('items.kindLink')}</span>
              </span>
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          label={t('items.titleLabel')}
          name="title"
          htmlFor="item-title"
          rules={[{ required: true, whitespace: true, message: t('items.titleRequired') }]}
        >
          <Input
            id="item-title"
            name="title"
            placeholder={t('items.titlePlaceholder')}
            maxLength={160}
          />
        </Form.Item>

        <Form.Item
          label={t('items.versionLabel')}
          name="version_label"
          htmlFor="item-version-label"
        >
          <Input
            id="item-version-label"
            name="version_label"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={t('items.versionPlaceholder')}
            maxLength={60}
          />
        </Form.Item>

        {watchedKind === 'file' ? (
          <div style={{ marginBottom: tokens.spacing.lg }}>
            <Typography.Text
              style={{
                display: 'block',
                marginBottom: tokens.spacing.xs,
              }}
            >
              {isEditing ? t('items.replaceFile') : t('items.fileLabel')}
            </Typography.Text>

            {isEditing && editingItem?.file_name && !selectedFile && (
              <Descriptions
                size="small"
                bordered
                column={1}
                style={{ marginBottom: tokens.spacing.sm }}
                items={[
                  {
                    key: 'current-file',
                    label: t('items.currentArtifactHeading'),
                    children: (
                      <Typography.Text>
                        {editingItem.file_name} ({formatFileSize(editingItem.file_size)})
                      </Typography.Text>
                    ),
                  },
                  ...(editingItem.sha256
                    ? [
                        {
                          key: 'current-sha',
                          label: t('items.sha256Label'),
                          children: <span className="revlog-hash">{editingItem.sha256}</span>,
                        },
                      ]
                    : []),
                ]}
              />
            )}

            {isEditing &&
              editingItem?.file_name &&
              isAnyGerberItem(editingItem.file_name) &&
              editingItem.storage_path && (
                <div style={{ marginBottom: tokens.spacing.sm }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined aria-hidden="true" />}
                    onClick={() => setIsGerberModalOpen(true)}
                  >
                    {t('gerber.openViewer')}
                  </Button>
                </div>
              )}

            <Upload.Dragger
              name="file"
              multiple={false}
              showUploadList={false}
              disabled={submitting || isHashing}
              beforeUpload={(file) => {
                void processSelectedFile(file);
                return false;
              }}
            >
              <p className="ant-upload-drag-icon" style={{ marginBottom: tokens.spacing.xs }}>
                <InboxOutlined aria-hidden="true" style={{ color: tokens.colors.accent }} />
              </p>
              <p
                style={{
                  margin: 0,
                  fontWeight: 500,
                  color: tokens.colors.textPrimary,
                }}
              >
                {t('items.dropzoneTitle')}
              </p>
              <p
                className="revlog-secondary-text"
                style={{
                  margin: `${tokens.spacing.xs}px 0 0`,
                }}
              >
                {t('items.dropzoneHint', { maxMb: appEnv.maxUploadMb })}
              </p>
            </Upload.Dragger>

            {selectedFile && (
              <Descriptions
                size="small"
                bordered
                column={1}
                style={{ marginTop: tokens.spacing.sm }}
                items={[
                  {
                    key: 'selected-file',
                    label: t('items.selectedArtifactHeading'),
                    children: (
                      <Typography.Text>
                        {selectedFile.name} ({formatFileSize(selectedFile.size)})
                      </Typography.Text>
                    ),
                  },
                  {
                    key: 'selected-sha',
                    label: t('items.sha256Label'),
                    children: isHashing ? (
                      <Typography.Text type="secondary">{t('items.computingHash')}</Typography.Text>
                    ) : (
                      <span className="revlog-hash">{computedSha256 ?? ''}</span>
                    ),
                  },
                ]}
              />
            )}

            {uploadPercent !== null && (
              <div style={{ marginTop: tokens.spacing.sm }}>
                <div className="revlog-secondary-text" style={{ marginBottom: 2 }}>
                  {t('items.uploadingProgress', { percent: uploadPercent })}
                </div>
                <Progress percent={uploadPercent} size="small" status="active" />
              </div>
            )}
          </div>
        ) : (
          <>
            <Form.Item
              label={t('items.urlLabel')}
              name="url"
              htmlFor="item-url"
              rules={[
                { required: true, message: t('items.urlRequired') },
                {
                  validator: async (_rule, value: string | undefined) => {
                    if (value && !isValidHttpUrl(value)) {
                      throw new Error(t('items.urlRequired'));
                    }
                  },
                },
              ]}
            >
              <Input
                id="item-url"
                name="url"
                type="url"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={t('items.urlPlaceholder')}
              />
            </Form.Item>

            <Alert
              type="warning"
              showIcon
              message={t('items.linkUnverifiedNote')}
              style={{ marginBottom: tokens.spacing.lg }}
            />
          </>
        )}

        <Form.Item label={t('items.noteLabel')} name="note" htmlFor="item-note">
          <Input.TextArea
            id="item-note"
            name="note"
            rows={3}
            placeholder={t('items.notePlaceholder')}
            maxLength={1000}
          />
        </Form.Item>
      </Form>

      {editingItem && (
        <GerberViewerModal
          open={isGerberModalOpen}
          title={editingItem.title || editingItem.file_name || undefined}
          fileName={editingItem.file_name}
          storagePath={editingItem.storage_path}
          onClose={() => setIsGerberModalOpen(false)}
        />
      )}
    </Drawer>
  );
};
