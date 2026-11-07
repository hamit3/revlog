import React from 'react';
import {
  CheckCircleOutlined,
  EyeOutlined,
  FileTextOutlined,
  InboxOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';
import { useTranslate } from '@refinedev/core';
import { tokens } from '../theme/tokens';

export type BadgeKind = 'published' | 'draft' | 'archived' | 'latest' | 'in_review' | 'approved';

export interface StatusBadgeProps {
  kind: BadgeKind;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ kind }) => {
  const t = useTranslate();

  const config: Record<
    BadgeKind,
    {
      bg: string;
      border: string;
      text: string;
      label: string;
      icon: React.ReactNode;
    }
  > = {
    published: {
      bg: tokens.colors.publishedBg,
      border: tokens.colors.publishedBorder,
      text: tokens.colors.publishedText,
      label: t('status.published'),
      icon: <LockOutlined aria-hidden="true" />,
    },
    draft: {
      bg: tokens.colors.draftBg,
      border: tokens.colors.draftBorder,
      text: tokens.colors.draftText,
      label: t('status.draft'),
      icon: <FileTextOutlined aria-hidden="true" />,
    },
    archived: {
      bg: tokens.colors.draftBg,
      border: tokens.colors.draftBorder,
      text: tokens.colors.draftText,
      label: t('status.archived'),
      icon: <InboxOutlined aria-hidden="true" />,
    },
    latest: {
      bg: tokens.colors.surfaceSelected,
      border: tokens.colors.accent,
      text: tokens.colors.accent,
      label: t('status.latest'),
      icon: <CheckCircleOutlined aria-hidden="true" />,
    },
    in_review: {
      bg: tokens.colors.warningBg,
      border: tokens.colors.warningBorder,
      text: tokens.colors.warningText,
      label: t('status.inReview'),
      icon: <EyeOutlined aria-hidden="true" />,
    },
    approved: {
      bg: tokens.colors.publishedBg,
      border: tokens.colors.publishedBorder,
      text: tokens.colors.publishedText,
      label: t('status.approved'),
      icon: <SafetyCertificateOutlined aria-hidden="true" />,
    },
  };

  const current = config[kind];

  return (
    <Tag
      icon={current.icon}
      bordered
      style={{
        paddingInline: 7,
        fontWeight: 500,
        borderRadius: tokens.radius.sm,
        backgroundColor: current.bg,
        borderColor: current.border,
        color: current.text,
      }}
    >
      {current.label}
    </Tag>
  );
};
