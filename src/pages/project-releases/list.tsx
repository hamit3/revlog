import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslate } from '@refinedev/core';
import { List } from '@refinedev/antd';
import { Alert, Button, Card, Empty, Spin, Tag, Timeline, Typography } from 'antd';
import { ArrowRightOutlined, BlockOutlined, EditOutlined, RocketOutlined } from '@ant-design/icons';
import { tokens } from '../../theme/tokens';
import { PageHeaderTitle } from '../../components/PageHeaderTitle';
import { StatusBadge } from '../../components/StatusBadge';
import { useProjectAccess } from '../../lib/useProjectAccess';
import { formatDateTime, formatReleaseDate } from '../../lib/format';
import { supabaseClient } from '../../providers/supabaseClient';
import type { ProjectRelease, ProjectReleaseProduct } from '../../types/database';

interface ProjectReleaseWithProducts extends ProjectRelease {
  project_release_products?: Pick<
    ProjectReleaseProduct,
    'id' | 'product_id' | 'product_name' | 'product_code' | 'release_version_label'
  >[];
}

function publisherInitials(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export const ProjectReleaseListPage: React.FC = () => {
  const t = useTranslate();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const { project, canEditContent, isLoading: isAccessLoading } = useProjectAccess(projectId);

  const [releases, setReleases] = useState<ProjectReleaseWithProducts[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!projectId) {
        return;
      }
      setIsLoading(true);
      const { data, error } = await supabaseClient
        .from('project_releases')
        .select(
          '*, profiles:published_by(id, full_name, email, created_at), project_release_products(id, product_id, product_name, product_code, release_version_label)',
        )
        .eq('project_id', projectId);

      if (!active) {
        return;
      }
      if (error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(null);
        setReleases((data as ProjectReleaseWithProducts[]) ?? []);
      }
      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    document.title = `${t('projectReleases.historyTitle')}${
      project?.name ? ` - ${project.name}` : ''
    } | ${t('app.name')}`;
  }, [project?.name, t]);

  const orderedReleases = useMemo(() => {
    return [...releases].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'draft' ? -1 : 1;
      }
      const timeA = a.published_at ?? a.created_at;
      const timeB = b.published_at ?? b.created_at;
      return timeB.localeCompare(timeA);
    });
  }, [releases]);

  const latestPublishedId = useMemo(() => {
    const published = orderedReleases.filter((rel) => rel.status === 'published');
    return published[0]?.id ?? null;
  }, [orderedReleases]);

  if (isAccessLoading || isLoading) {
    return (
      <div style={{ padding: tokens.spacing.xxl, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  if (!project || !projectId) {
    return <Alert type="error" showIcon message={t('projects.notFound')} />;
  }

  return (
    <List
      resource="project_releases"
      breadcrumb={false}
      title={
        <PageHeaderTitle
          title={t('projectReleases.historyTitle')}
          subtitle={`${project.name} · ${t('projectReleases.subtitle')}`}
        />
      }
      headerProps={{
        onBack: () => navigate(`/projects/${project.id}`),
      }}
      headerButtons={() =>
        canEditContent ? (
          <Button
            type="primary"
            icon={<RocketOutlined aria-hidden="true" />}
            onClick={() => navigate(`/projects/${project.id}/releases/new`)}
          >
            {t('projects.createReleaseButton')}
          </Button>
        ) : null
      }
    >
      {errorMessage && (
        <div role="alert" style={{ marginBottom: tokens.spacing.lg }}>
          <Alert type="error" showIcon message={errorMessage} />
        </div>
      )}

      {orderedReleases.length === 0 ? (
        <Card>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('projectReleases.empty')}>
            {canEditContent && (
              <Button
                type="primary"
                icon={<RocketOutlined aria-hidden="true" />}
                onClick={() => navigate(`/projects/${project.id}/releases/new`)}
              >
                {t('projectReleases.emptyAction')}
              </Button>
            )}
          </Empty>
        </Card>
      ) : (
        <Card style={{ paddingTop: tokens.spacing.sm }}>
          <Timeline
            className="revlog-release-timeline"
            items={orderedReleases.map((rel) => {
              const isPublished = rel.status === 'published';
              const isLatest = rel.id === latestPublishedId;
              const publisher =
                rel.profiles?.full_name || rel.profiles?.email || t('common.unknownUser');
              const bundled = rel.project_release_products ?? [];

              return {
                key: rel.id,
                color: isPublished ? tokens.colors.publishedText : tokens.colors.draftText,
                children: (
                  <Card
                    size="small"
                    style={{
                      marginBottom: tokens.spacing.xs,
                      borderColor: isLatest ? tokens.colors.accent : tokens.colors.border,
                      backgroundColor: tokens.colors.surface,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: tokens.spacing.sm,
                      }}
                    >
                      <div className="revlog-inline-row">
                        {isPublished ? (
                          <Link
                            to={`/projects/${project.id}/releases/${rel.id}`}
                            style={{ color: tokens.colors.textPrimary }}
                          >
                            <Typography.Title level={4} style={{ margin: 0 }}>
                              {rel.version_label}
                            </Typography.Title>
                          </Link>
                        ) : (
                          <Typography.Title level={4} style={{ margin: 0 }}>
                            {rel.version_label}
                          </Typography.Title>
                        )}

                        <StatusBadge kind={isPublished ? 'published' : 'draft'} />
                        {isLatest && <StatusBadge kind="latest" />}
                      </div>

                      {isPublished ? (
                        <Button
                          size="small"
                          icon={<ArrowRightOutlined aria-hidden="true" />}
                          onClick={() => navigate(`/projects/${project.id}/releases/${rel.id}`)}
                        >
                          {t('releases.viewRelease')}
                        </Button>
                      ) : (
                        canEditContent && (
                          <Button
                            size="small"
                            type="primary"
                            icon={<EditOutlined aria-hidden="true" />}
                            onClick={() =>
                              navigate(`/projects/${project.id}/releases/${rel.id}/edit`)
                            }
                          >
                            {t('releases.resumeDraft')}
                          </Button>
                        )
                      )}
                    </div>

                    <div
                      className="revlog-inline-row revlog-secondary-text"
                      style={{ marginTop: tokens.spacing.xs }}
                    >
                      {isPublished ? (
                        <>
                          <span>{formatDateTime(rel.published_at)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="revlog-mini-avatar">{publisherInitials(publisher)}</span>
                          <span>{publisher}</span>
                        </>
                      ) : (
                        <span>{formatReleaseDate(rel.created_at)}</span>
                      )}
                    </div>

                    {bundled.length > 0 && (
                      <div className="revlog-inline-row" style={{ marginTop: tokens.spacing.xs }}>
                        {bundled.map((bp) => (
                          <Tag
                            key={bp.id}
                            icon={<BlockOutlined aria-hidden="true" />}
                            bordered
                            style={{ backgroundColor: tokens.colors.surfaceSubtle }}
                          >
                            {bp.product_name
                              ? `${bp.product_name}${bp.release_version_label ? ` · ${bp.release_version_label}` : ''}`
                              : t('nav.product')}
                          </Tag>
                        ))}
                      </div>
                    )}

                    {rel.manifest_hash && (
                      <div className="revlog-secondary-text" style={{ marginTop: 4 }}>
                        {t('projectReleases.manifestHashLabel')}:{' '}
                        <span className="revlog-hash">{rel.manifest_hash}</span>
                      </div>
                    )}

                    {rel.notes && (
                      <Typography.Paragraph
                        className="revlog-prose"
                        style={{
                          marginTop: tokens.spacing.xs,
                          marginBottom: 0,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {rel.notes}
                      </Typography.Paragraph>
                    )}
                  </Card>
                ),
              };
            })}
          />
        </Card>
      )}
    </List>
  );
};
