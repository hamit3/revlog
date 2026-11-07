import React, { useEffect, useState } from 'react';
import { useNotification, useTranslate } from '@refinedev/core';
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CopyOutlined, LinkOutlined, StopOutlined } from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { formatDateTime } from '../../lib/format';
import { buildShareUrl, computeShareTokenHash, generateShareToken } from '../../lib/shareToken';
import { supabaseClient } from '../../providers/supabaseClient';
import type { ReleaseShareLink } from '../../types/database';

interface ShareLinkModalProps {
  open: boolean;
  onClose: () => void;
  releaseId: string;
  releaseVersion: string;
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  open,
  onClose,
  releaseId,
  releaseVersion,
}) => {
  const t = useTranslate();
  const { open: notify } = useNotification();

  const [durationDays, setDurationDays] = useState<number>(7);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [newShareUrl, setNewShareUrl] = useState<string | null>(null);
  const [existingLinks, setExistingLinks] = useState<ReleaseShareLink[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState<boolean>(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const refreshLinks = async () => {
    setIsLoadingLinks(true);
    try {
      const { data, error } = await supabaseClient
        .from('release_share_links')
        .select('*, profiles:created_by(id, full_name, email)')
        .eq('release_id', releaseId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }
      setExistingLinks((data as ReleaseShareLink[]) ?? []);
    } catch {
      // Ignore or empty
    } finally {
      setIsLoadingLinks(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!open) {
      return;
    }

    void (async () => {
      const { data, error } = await supabaseClient
        .from('release_share_links')
        .select('*, profiles:created_by(id, full_name, email)')
        .eq('release_id', releaseId)
        .order('created_at', { ascending: false });

      if (!active) {
        return;
      }
      if (!error && data) {
        setExistingLinks(data as ReleaseShareLink[]);
      }
    })();

    return () => {
      active = false;
    };
  }, [open, releaseId]);

  const handleGenerateLink = async () => {
    setIsGenerating(true);
    try {
      const rawToken = generateShareToken();
      const tokenHash = await computeShareTokenHash(rawToken);
      const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();

      const { error } = await supabaseClient.rpc('create_release_share_link', {
        p_release_id: releaseId,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
      });

      if (error) {
        throw new Error(error.message);
      }

      const fullUrl = buildShareUrl(rawToken);
      setNewShareUrl(fullUrl);
      void refreshLinks();

      notify?.({
        type: 'success',
        message: t('share.createSuccess'),
      });
    } catch (err) {
      notify?.({
        type: 'error',
        message: err instanceof Error ? err.message : t('share.createError'),
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevoke = async (linkId: string) => {
    setRevokingId(linkId);
    try {
      const { error } = await supabaseClient.rpc('revoke_release_share_link', {
        p_link_id: linkId,
      });

      if (error) {
        throw new Error(error.message);
      }

      void refreshLinks();
      notify?.({
        type: 'success',
        message: t('share.revokedSuccess'),
      });
    } catch (err) {
      notify?.({
        type: 'error',
        message: err instanceof Error ? err.message : t('share.revokeError'),
      });
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify?.({
        type: 'success',
        message: t('share.linkCopied'),
      });
    } catch {
      // Clipboard fallback
    }
  };

  const columns: ColumnsType<ReleaseShareLink> = [
    {
      title: t('share.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: t('share.expiresAt'),
      dataIndex: 'expires_at',
      key: 'expires_at',
      width: 170,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: t('share.status'),
      key: 'status',
      width: 110,
      render: (_val: unknown, record: ReleaseShareLink) => {
        if (record.revoked_at) {
          return <Tag color="error">{t('share.statusRevoked')}</Tag>;
        }
        if (new Date(record.expires_at).getTime() < Date.now()) {
          return <Tag color="warning">{t('share.statusExpired')}</Tag>;
        }
        return <Tag color="success">{t('share.statusActive')}</Tag>;
      },
    },
    {
      title: t('items.columns.actions'),
      key: 'action',
      width: 110,
      align: 'right',
      render: (_val: unknown, record: ReleaseShareLink) => {
        const isRevoked = Boolean(record.revoked_at);
        const isExpired = new Date(record.expires_at).getTime() < Date.now();
        const canRevoke = !isRevoked && !isExpired;

        if (!canRevoke) {
          return null;
        }

        return (
          <Popconfirm
            title={t('share.revokeConfirm')}
            okText={t('share.revoke')}
            cancelText={t('common.cancel')}
            onConfirm={() => void handleRevoke(record.id)}
          >
            <Button
              size="small"
              danger
              icon={<StopOutlined aria-hidden="true" />}
              loading={revokingId === record.id}
            >
              {t('share.revoke')}
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterClose={() => setNewShareUrl(null)}
      footer={null}
      title={
        <div style={{ marginBottom: tokens.spacing.sm }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t('share.modalTitle')} - {releaseVersion}
          </Typography.Title>
          <Typography.Text type="secondary">{t('share.modalSubtitle')}</Typography.Text>
        </div>
      }
      width={680}
    >
      <Card size="small" style={{ marginBottom: tokens.spacing.md }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Typography.Text strong style={{ display: 'block', marginBottom: tokens.spacing.xs }}>
              {t('share.durationLabel')}
            </Typography.Text>
            <Radio.Group
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
            >
              <Radio.Button value={1}>{t('share.duration1Day')}</Radio.Button>
              <Radio.Button value={7}>{t('share.duration7Days')}</Radio.Button>
              <Radio.Button value={30}>{t('share.duration30Days')}</Radio.Button>
            </Radio.Group>
          </div>

          <Button
            type="primary"
            icon={<LinkOutlined aria-hidden="true" />}
            loading={isGenerating}
            onClick={() => void handleGenerateLink()}
          >
            {t('share.generateButton')}
          </Button>

          {newShareUrl && (
            <Alert
              type="success"
              showIcon
              message={
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Typography.Text strong>{t('share.linkGeneratedNotice')}</Typography.Text>
                  <Input.Search
                    readOnly
                    value={newShareUrl}
                    enterButton={
                      <Button icon={<CopyOutlined aria-hidden="true" />}>
                        {t('share.copyLink')}
                      </Button>
                    }
                    onSearch={() => void handleCopy(newShareUrl)}
                  />
                </Space>
              }
            />
          )}
        </Space>
      </Card>

      <div>
        <Typography.Text strong style={{ display: 'block', marginBottom: tokens.spacing.xs }}>
          {t('share.existingLinksTitle')}
        </Typography.Text>
        <Table<ReleaseShareLink>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={existingLinks}
          loading={isLoadingLinks}
          locale={{ emptyText: t('share.noLinks') }}
          pagination={{ pageSize: 5 }}
        />
      </div>
    </Modal>
  );
};
