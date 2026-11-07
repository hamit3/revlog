import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useInvalidate, useNotification, useTranslate } from '@refinedev/core';
import { Edit } from '@refinedev/antd';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Popconfirm,
  Select,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  InboxOutlined,
  PlusOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { useProjectAccess } from '../../lib/useProjectAccess';
import { supabaseClient } from '../../providers/supabaseClient';
import type { ProjectMember, ProjectRole } from '../../types/database';

interface GeneralFormValues {
  name: string;
  description?: string;
}

interface AddMemberFormValues {
  email: string;
  role: ProjectRole;
}

function memberInitials(fullName?: string | null, email?: string | null): string {
  const source = (fullName && fullName.trim()) || email || 'U';
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export const ProjectSettingsPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();
  const {
    project,
    isOwner,
    isLoading: isAccessLoading,
    reload: reloadProject,
  } = useProjectAccess(projectId);

  const [generalForm] = Form.useForm<GeneralFormValues>();
  const [memberForm] = Form.useForm<AddMemberFormValues>();

  const [members, setMembers] = useState<ProjectMember[]>([]);

  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isSavingGeneral, setIsSavingGeneral] = useState<boolean>(false);
  const [isMutatingMember, setIsMutatingMember] = useState<boolean>(false);
  const [isArchiving, setIsArchiving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSettingsData = useCallback(async () => {
    if (!projectId) {
      return;
    }
    setIsLoadingData(true);

    const { data, error } = await supabaseClient
      .from('project_members')
      .select('*, profiles:user_id(id, full_name, email, created_at)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      setIsLoadingData(false);
      return;
    }

    setMembers((data as ProjectMember[]) ?? []);
    setIsLoadingData(false);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId) {
        return;
      }
      const { data, error } = await supabaseClient
        .from('project_members')
        .select('*, profiles:user_id(id, full_name, email, created_at)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (!active) {
        return;
      }
      if (error) {
        setErrorMessage(error.message);
      } else {
        setMembers((data as ProjectMember[]) ?? []);
      }
      setIsLoadingData(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (project) {
      document.title = `${t('settings.pageTitle')} - ${project.name} | ${t('app.name')}`;
      generalForm.setFieldsValue({
        name: project.name,
        description: project.description ?? '',
      });
    }
  }, [project, generalForm, t]);

  const ownerCount = useMemo(() => members.filter((m) => m.role === 'owner').length, [members]);

  const handleSaveGeneral = async (values: GeneralFormValues) => {
    if (!project) {
      return;
    }
    setIsSavingGeneral(true);
    setErrorMessage(null);

    const { error } = await supabaseClient
      .from('projects')
      .update({
        name: values.name.trim(),
        description: values.description?.trim() || null,
      })
      .eq('id', project.id);

    setIsSavingGeneral(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await reloadProject();
    await invalidate({ resource: 'projects', invalidates: ['list', 'detail'] });
    notify?.({ type: 'success', message: t('common.saved') });
  };

  const handleAddMember = async (values: AddMemberFormValues) => {
    if (!project) {
      return;
    }
    setIsMutatingMember(true);
    setErrorMessage(null);

    const { error } = await supabaseClient.rpc('add_project_member_by_email', {
      p_project_id: project.id,
      p_email: values.email.trim(),
      p_role: values.role,
    });

    setIsMutatingMember(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    memberForm.resetFields();
    memberForm.setFieldsValue({ role: 'member' });
    await loadSettingsData();
    await invalidate({ resource: 'projects', invalidates: ['list'] });
    notify?.({ type: 'success', message: t('settings.memberAdded') });
  };

  const handleRoleChange = async (member: ProjectMember, nextRole: ProjectRole) => {
    setIsMutatingMember(true);
    setErrorMessage(null);

    const { error } = await supabaseClient
      .from('project_members')
      .update({ role: nextRole })
      .eq('id', member.id);

    setIsMutatingMember(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadSettingsData();
    await reloadProject();
    notify?.({ type: 'success', message: t('settings.memberUpdated') });
  };

  const handleRemoveMember = async (member: ProjectMember) => {
    setIsMutatingMember(true);
    setErrorMessage(null);

    const { error } = await supabaseClient.from('project_members').delete().eq('id', member.id);

    setIsMutatingMember(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await loadSettingsData();
    await invalidate({ resource: 'projects', invalidates: ['list'] });
    notify?.({ type: 'success', message: t('settings.memberRemoved') });
  };

  const handleToggleArchive = async (nextArchived: boolean) => {
    if (!project) {
      return;
    }
    setIsArchiving(true);
    setErrorMessage(null);

    const { error } = await supabaseClient
      .from('projects')
      .update({ archived: nextArchived })
      .eq('id', project.id);

    setIsArchiving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    await reloadProject();
    await invalidate({ resource: 'projects', invalidates: ['list', 'detail'] });
    notify?.({
      type: 'success',
      message: nextArchived ? t('settings.archivedSuccess') : t('settings.unarchivedSuccess'),
    });
  };

  if (isAccessLoading || isLoadingData) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (!project || !projectId) {
    return <Alert type="error" showIcon message={t('projects.notFound')} />;
  }

  const memberColumns: ColumnsType<ProjectMember> = [
    {
      title: t('settings.membersColumns.name'),
      key: 'name',
      render: (_val: unknown, record: ProjectMember) => (
        <div className="revlog-inline-row">
          <span className="revlog-mini-avatar">
            {memberInitials(record.profiles?.full_name, record.profiles?.email)}
          </span>
          <Typography.Text strong>{record.profiles?.full_name || t('common.none')}</Typography.Text>
        </div>
      ),
    },
    {
      title: t('settings.membersColumns.email'),
      key: 'email',
      render: (_val: unknown, record: ProjectMember) => (
        <Typography.Text type="secondary">
          {record.profiles?.email ?? t('common.unknownUser')}
        </Typography.Text>
      ),
    },
    {
      title: t('settings.membersColumns.role'),
      key: 'role',
      width: 180,
      render: (_val: unknown, record: ProjectMember) => {
        const email = record.profiles?.email ?? '';
        const isLastOwner = record.role === 'owner' && ownerCount <= 1;

        if (!isOwner) {
          return <Tag bordered>{t(`roles.${record.role}`)}</Tag>;
        }

        return (
          <Select<ProjectRole>
            size="small"
            value={record.role}
            disabled={isMutatingMember || isLastOwner}
            aria-label={t('settings.roleSelectAria', { email })}
            style={{ width: 140 }}
            onChange={(nextRole) => void handleRoleChange(record, nextRole)}
            options={[
              { value: 'owner', label: t('roles.owner') },
              { value: 'member', label: t('roles.member') },
              { value: 'viewer', label: t('roles.viewer') },
            ]}
          />
        );
      },
    },
    ...(isOwner
      ? [
          {
            title: t('settings.membersColumns.actions'),
            key: 'actions',
            width: 100,
            align: 'right' as const,
            render: (_val: unknown, record: ProjectMember) => {
              const email = record.profiles?.email ?? '';
              const isLastOwner = record.role === 'owner' && ownerCount <= 1;

              return (
                <Popconfirm
                  title={t('settings.removeMemberConfirm', { email })}
                  onConfirm={() => void handleRemoveMember(record)}
                  okText={t('common.remove')}
                  cancelText={t('common.cancel')}
                  disabled={isLastOwner}
                >
                  <Button
                    size="small"
                    danger
                    disabled={isMutatingMember || isLastOwner}
                    icon={<DeleteOutlined aria-hidden="true" />}
                    aria-label={t('settings.removeMemberAria', { email })}
                  />
                </Popconfirm>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <Edit
      resource="projects"
      recordItemId={project.id}
      breadcrumb={false}
      canDelete={false}
      footerButtons={() => null}
      headerButtons={() => (
        <Button onClick={() => navigate(`/projects/${project.id}`)}>{t('common.back')}</Button>
      )}
      title={
        <PageHeaderTitle
          title={t('settings.pageTitle')}
          subtitle={`${project.name} · ${t('settings.subtitle')}`}
          badge={project.archived ? <StatusBadge kind="archived" /> : undefined}
        />
      }
      headerProps={{
        onBack: () => navigate(`/projects/${project.id}`),
      }}
      contentProps={{
        styles: { body: { paddingTop: tokens.spacing.sm } },
      }}
    >
      {!isOwner && (
        <Alert
          type="info"
          showIcon
          message={t('settings.ownerOnlyNotice')}
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
              <div style={{ paddingTop: tokens.spacing.sm, maxWidth: 580 }}>
                <Form<GeneralFormValues>
                  form={generalForm}
                  layout="vertical"
                  requiredMark={false}
                  validateTrigger="onBlur"
                  disabled={!isOwner || project.archived}
                  onFinish={handleSaveGeneral}
                >
                  <Form.Item
                    label={t('projects.nameLabel')}
                    name="name"
                    htmlFor="settings-project-name"
                    rules={[
                      {
                        required: true,
                        whitespace: true,
                        message: t('projects.nameRequired'),
                      },
                    ]}
                  >
                    <Input id="settings-project-name" name="name" maxLength={120} />
                  </Form.Item>

                  <Form.Item
                    label={t('projects.descriptionLabel')}
                    name="description"
                    htmlFor="settings-project-description"
                  >
                    <Input.TextArea
                      id="settings-project-description"
                      name="description"
                      rows={3}
                      maxLength={500}
                    />
                  </Form.Item>

                  {isOwner && !project.archived && (
                    <Button type="primary" htmlType="submit" loading={isSavingGeneral}>
                      {t('common.save')}
                    </Button>
                  )}
                </Form>
              </div>
            ),
          },
          {
            key: 'members',
            label: (
              <span className="revlog-inline-row">
                <TeamOutlined aria-hidden="true" />
                <span>{t('settings.membersHeading')}</span>
                <span className="revlog-count-pill">{members.length}</span>
              </span>
            ),
            children: (
              <div
                style={{
                  paddingTop: tokens.spacing.sm,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: tokens.spacing.lg,
                }}
              >
                <div className="revlog-table-region" tabIndex={0}>
                  <Table<ProjectMember>
                    rowKey="id"
                    size="middle"
                    columns={memberColumns}
                    dataSource={members}
                    pagination={false}
                  />
                </div>

                {isOwner && !project.archived && (
                  <Card
                    size="small"
                    style={{
                      backgroundColor: tokens.colors.surfaceSubtle,
                      borderColor: tokens.colors.border,
                    }}
                  >
                    <Form<AddMemberFormValues>
                      form={memberForm}
                      layout="vertical"
                      requiredMark={false}
                      validateTrigger="onBlur"
                      initialValues={{ role: 'member' }}
                      onFinish={handleAddMember}
                    >
                      <div className="revlog-inline-form-grid" style={{ maxWidth: 680 }}>
                        <Form.Item
                          label={t('settings.memberEmailLabel')}
                          name="email"
                          htmlFor="add-member-email"
                          style={{ marginBottom: 0 }}
                          rules={[
                            { required: true, message: t('settings.memberEmailRequired') },
                            { type: 'email', message: t('settings.memberEmailRequired') },
                          ]}
                        >
                          <Input
                            id="add-member-email"
                            name="member_email"
                            type="email"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            placeholder={t('settings.memberEmailPlaceholder')}
                          />
                        </Form.Item>

                        <Form.Item
                          label={t('settings.memberRoleLabel')}
                          name="role"
                          style={{ marginBottom: 0 }}
                        >
                          <Select<ProjectRole>
                            options={[
                              { value: 'owner', label: t('roles.owner') },
                              { value: 'member', label: t('roles.member') },
                              { value: 'viewer', label: t('roles.viewer') },
                            ]}
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
                            loading={isMutatingMember}
                          >
                            {t('settings.addMemberButton')}
                          </Button>
                        </Form.Item>
                      </div>
                    </Form>
                  </Card>
                )}
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
                      {project.archived
                        ? t('settings.unarchiveDescription')
                        : t('settings.archiveDescription')}
                    </Typography.Text>

                    {isOwner &&
                      (project.archived ? (
                        <Button
                          loading={isArchiving}
                          onClick={() => void handleToggleArchive(false)}
                        >
                          {t('common.unarchive')}
                        </Button>
                      ) : (
                        <Popconfirm
                          title={t('settings.archiveConfirm')}
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
