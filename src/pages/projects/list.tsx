import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useList, useTranslate } from '@refinedev/core';
import { List } from '@refinedev/antd';
import { Alert, Button, Card, Col, Empty, Input, Row, Spin, Switch, Tag } from 'antd';
import {
  AppstoreOutlined,
  BlockOutlined,
  HddOutlined,
  LockOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { formatReleaseDate } from '../../lib/format';
import type {
  Product,
  Project,
  ProjectRelease,
  Release,
  ReleaseStatus,
} from '../../types/database';

interface ReleaseSummaryLike {
  id: string;
  version_label: string;
  status: ReleaseStatus;
  published_at: string | null;
}

interface ProjectListRow extends Project {
  project_members?: { id: string }[];
  products?: Pick<Product, 'id' | 'archived'>[];
  project_releases?: Pick<ProjectRelease, 'id' | 'version_label' | 'status' | 'published_at'>[];
  releases?: Pick<Release, 'id' | 'status'>[];
}

export function pickLatestPublishedRelease<T extends ReleaseSummaryLike>(
  releases: readonly T[] | undefined,
): T | null {
  if (!releases || releases.length === 0) {
    return null;
  }
  const published = releases.filter((rel) => rel.status === 'published' && rel.published_at);
  if (published.length === 0) {
    return null;
  }
  return (
    [...published].sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))[0] ??
    null
  );
}

export const ProjectsListPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    document.title = `${t('projects.pageTitle')} | ${t('app.name')}`;
  }, [t]);

  const { query: projectsQuery } = useList<ProjectListRow>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'updated_at', order: 'desc' }],
    meta: {
      select:
        'id, name, description, archived, created_by, created_at, updated_at, project_members(id), products(id, archived), project_releases(id, version_label, status, published_at), releases(id, status)',
    },
  });

  const allProjects = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data]);
  const hasAnyArchived = useMemo(() => allProjects.some((proj) => proj.archived), [allProjects]);

  const stats = useMemo(() => {
    const activeCount = allProjects.filter((p) => !p.archived).length;
    const activeProductCount = allProjects.reduce((acc, proj) => {
      if (proj.archived) {
        return acc;
      }
      const activeProds = (proj.products ?? []).filter((pr) => !pr.archived).length;
      return acc + activeProds;
    }, 0);
    const publishedReleaseCount = allProjects.reduce((acc, proj) => {
      const prodPub = (proj.releases ?? []).filter((r) => r.status === 'published').length;
      const sysPub = (proj.project_releases ?? []).filter((r) => r.status === 'published').length;
      return acc + prodPub + sysPub;
    }, 0);
    return { activeCount, activeProductCount, publishedReleaseCount };
  }, [allProjects]);

  const visibleProjects = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    return allProjects.filter((proj) => {
      if (!showArchived && proj.archived) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const inName = proj.name.toLowerCase().includes(normalizedQuery);
      const inDesc = (proj.description ?? '').toLowerCase().includes(normalizedQuery);
      return inName || inDesc;
    });
  }, [allProjects, showArchived, searchTerm]);

  return (
    <List
      resource="projects"
      breadcrumb={false}
      title={
        <PageHeaderTitle
          title={t('projects.pageTitle')}
          subtitle={t('projects.subtitle')}
          headingId="projects-heading"
        />
      }
      headerButtons={() => (
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden="true" />}
          onClick={() => navigate('/projects/new')}
        >
          {t('projects.newProject')}
        </Button>
      )}
    >
      {projectsQuery.isError && (
        <div role="alert" style={{ marginBottom: tokens.spacing.lg }}>
          <Alert
            type="error"
            showIcon
            message={`${t('common.errorPrefix')} ${projectsQuery.error?.message ?? ''}`}
          />
        </div>
      )}

      {/* Supabase-style Action & Filter Bar */}
      {allProjects.length > 0 && (
        <div
          style={{
            marginBottom: tokens.spacing.lg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: tokens.spacing.md,
          }}
        >
          <div className="revlog-inline-row" style={{ flex: '1 1 260px', maxWidth: 420 }}>
            <Input
              allowClear
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              prefix={
                <SearchOutlined aria-hidden="true" style={{ color: tokens.colors.textSecondary }} />
              }
              placeholder={t('projects.searchPlaceholder')}
              aria-label={t('projects.searchPlaceholder')}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </div>

          <div className="revlog-inline-row" style={{ gap: tokens.spacing.sm }}>
            <Tag icon={<AppstoreOutlined aria-hidden="true" />} bordered>
              {stats.activeCount} {t('projects.statsActive').toLowerCase()}
            </Tag>
            <Tag icon={<BlockOutlined aria-hidden="true" />} bordered>
              {stats.activeProductCount} {t('projects.statsProducts').toLowerCase()}
            </Tag>
            <Tag icon={<LockOutlined aria-hidden="true" />} bordered>
              {stats.publishedReleaseCount} {t('projects.statsPublished').toLowerCase()}
            </Tag>

            {hasAnyArchived && (
              <div className="revlog-inline-row" style={{ marginInlineStart: tokens.spacing.xs }}>
                <Switch
                  id="toggle-archived-projects"
                  size="small"
                  checked={showArchived}
                  onChange={setShowArchived}
                />
                <label
                  htmlFor="toggle-archived-projects"
                  className="revlog-secondary-text"
                  style={{ cursor: 'pointer' }}
                >
                  {t('projects.showArchived')}
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {projectsQuery.isLoading ? (
        <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : allProjects.length === 0 ? (
        <Card>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('projects.empty')}>
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden="true" />}
              onClick={() => navigate('/projects/new')}
            >
              {t('projects.emptyAction')}
            </Button>
          </Empty>
        </Card>
      ) : visibleProjects.length === 0 ? (
        <Card>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('projects.emptyFiltered')} />
        </Card>
      ) : (
        <section aria-labelledby="projects-heading">
          <Row gutter={[tokens.spacing.lg, tokens.spacing.lg]}>
            {visibleProjects.map((record) => {
              const activeProductCount = (record.products ?? []).filter((p) => !p.archived).length;
              const latestSysRelease = pickLatestPublishedRelease(record.project_releases);
              const memberCount = record.project_members?.length ?? 0;

              return (
                <Col xs={24} md={12} xl={8} key={record.id}>
                  <article className="revlog-project-card">
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: tokens.spacing.sm,
                      }}
                    >
                      <header className="revlog-flex-row">
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: tokens.radius.sm,
                            backgroundColor: tokens.colors.surfaceSelected,
                            color: tokens.colors.accent,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <HddOutlined aria-hidden="true" />
                        </span>

                        <h2 className="revlog-card-heading" style={{ minWidth: 0 }}>
                          <Link
                            to={`/projects/${record.id}`}
                            className="revlog-card-link"
                            style={{ color: tokens.colors.textPrimary }}
                          >
                            {record.name}
                          </Link>
                        </h2>

                        {record.archived && <StatusBadge kind="archived" />}

                        <RightOutlined className="revlog-card-chevron" aria-hidden="true" />
                      </header>

                      <p className="revlog-card-description">
                        {record.description && record.description.trim()
                          ? record.description
                          : t('projects.noDescription')}
                      </p>
                    </div>

                    <footer
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: tokens.spacing.xs,
                        paddingTop: tokens.spacing.sm,
                        borderTop: `1px solid ${tokens.colors.borderSubtle}`,
                      }}
                    >
                      <div className="revlog-inline-row">
                        <Tag icon={<BlockOutlined aria-hidden="true" />} bordered>
                          {t('projects.productCount', { count: activeProductCount })}
                        </Tag>

                        {latestSysRelease ? (
                          <Link
                            to={`/projects/${record.id}/releases/${latestSysRelease.id}`}
                            style={{ display: 'inline-flex', alignItems: 'center' }}
                          >
                            <Tag
                              icon={<LockOutlined aria-hidden="true" />}
                              bordered
                              style={{
                                backgroundColor: tokens.colors.publishedBg,
                                borderColor: tokens.colors.publishedBorder,
                                color: tokens.colors.publishedText,
                                fontWeight: 500,
                              }}
                            >
                              {latestSysRelease.version_label}
                            </Tag>
                          </Link>
                        ) : (
                          <span className="revlog-secondary-text">{t('projects.noReleases')}</span>
                        )}
                      </div>

                      <div className="revlog-inline-row">
                        <Tag icon={<TeamOutlined aria-hidden="true" />} bordered>
                          {memberCount}
                        </Tag>
                        <span className="revlog-secondary-text">
                          {formatReleaseDate(record.updated_at)}
                        </span>
                      </div>
                    </footer>
                  </article>
                </Col>
              );
            })}
          </Row>
        </section>
      )}
    </List>
  );
};
