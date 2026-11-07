import React, { useCallback, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { useGetIdentity, useList, useLogout, useOne, useTranslate } from '@refinedev/core';
import {
  Button,
  Drawer,
  Dropdown,
  Grid,
  Input,
  Layout,
  Menu,
  Popover,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  BlockOutlined,
  CheckOutlined,
  HddOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { tokens } from '../theme/tokens';
import { StatusBadge } from './StatusBadge';
import {
  buildProjectNavSections,
  getProductTypeIcon,
  hasProjectSidebar,
  resolveActiveNavKeys,
  resolveHeaderTrailingSection,
  resolveSwitchedProductPath,
  resolveSwitchedProjectPath,
  type NavItemConfig,
  type NavSectionConfig,
} from './navigationConfig';
import type { Product, Project } from '../types/database';

interface UserIdentity {
  id: string;
  name: string;
  email: string;
}

const SIDER_STORAGE_KEY = 'revlog:sider-collapsed';

function readInitialSiderCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(SIDER_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getInitials(name?: string, email?: string): string {
  const source = (name && name.trim()) || email || 'U';
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

const ChevronsUpDownIcon: React.FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ display: 'block', flexShrink: 0 }}
  >
    <path d="M5.25 6.25L8 3.5L10.75 6.25" />
    <path d="M5.25 9.75L8 12.5L10.75 9.75" />
  </svg>
);

const RevLogBrandIcon: React.FC = () => (
  <span
    style={{
      width: 24,
      height: 24,
      borderRadius: tokens.radius.sm,
      backgroundColor: tokens.colors.accent,
      color: tokens.colors.white,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    <HddOutlined aria-hidden="true" />
  </span>
);

function renderNavItemLabel(
  item: NavItemConfig,
  isSelected: boolean,
  onNavigate: () => void,
): React.ReactNode {
  const content = (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: tokens.spacing.xs,
        width: '100%',
        minWidth: 0,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
      </span>
      {typeof item.badgeCount === 'number' && (
        <span className={`revlog-count-pill${isSelected ? ' revlog-count-pill-active' : ''}`}>
          {item.badgeCount}
        </span>
      )}
    </span>
  );

  if (!item.to) {
    return content;
  }

  return (
    <Link
      to={item.to}
      aria-current={isSelected ? 'page' : undefined}
      onClick={onNavigate}
      style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0 }}
    >
      {content}
    </Link>
  );
}

function mapSectionsToMenuItems(
  sections: readonly NavSectionConfig[],
  collapsed: boolean,
  selectedKeySet: ReadonlySet<string>,
  onNavigate: () => void,
): NonNullable<MenuProps['items']> {
  const menuItems: NonNullable<MenuProps['items']> = [];

  sections.forEach((section, index) => {
    if (index > 0) {
      menuItems.push({
        type: 'divider',
        key: `${section.key}-divider`,
        style: { marginBlock: tokens.spacing.xs },
      });
    }

    const mappedChildren: NonNullable<MenuProps['items']> = section.items.map((item) => {
      if (item.children && item.children.length > 0) {
        return {
          key: item.key,
          icon: item.icon,
          label: item.label,
          children: item.children.map((child) => ({
            key: child.key,
            icon: child.icon,
            label: renderNavItemLabel(child, selectedKeySet.has(child.key), onNavigate),
          })),
        };
      }

      return {
        key: item.key,
        icon: item.icon,
        label: renderNavItemLabel(item, selectedKeySet.has(item.key), onNavigate),
      };
    });

    if (collapsed) {
      menuItems.push(...mappedChildren);
    } else {
      menuItems.push({
        type: 'group',
        key: section.key,
        label: section.title,
        children: mappedChildren,
      });
    }
  });

  return menuItems;
}

export const AppLayout: React.FC = () => {
  const t = useTranslate();
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId, productId } = useParams<{ projectId?: string; productId?: string }>();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const { data: identity } = useGetIdentity<UserIdentity>();
  const screens = Grid.useBreakpoint();
  const isMobile = typeof screens.lg === 'boolean' ? !screens.lg : false;

  const [siderCollapsed, setSiderCollapsed] = useState<boolean>(readInitialSiderCollapsed);
  const [mobileSiderOpen, setMobileSiderOpen] = useState<boolean>(false);

  const [projectPopoverOpen, setProjectPopoverOpen] = useState<boolean>(false);
  const [productPopoverOpen, setProductPopoverOpen] = useState<boolean>(false);
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [productFilter, setProductFilter] = useState<string>('');

  const handleToggleSider = useCallback(() => {
    setSiderCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDER_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors in restricted environments
      }
      return next;
    });
  }, []);

  // Global projects list powers the Supabase-style header project switcher and count pill
  const { query: allProjectsQuery } = useList<Project>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'updated_at', order: 'desc' }],
  });

  const { query: activeProjectQuery } = useOne<Project>({
    resource: 'projects',
    id: projectId ?? '',
    queryOptions: {
      enabled: Boolean(projectId),
    },
  });

  const { query: productsQuery } = useList<Product>({
    resource: 'products',
    pagination: { mode: 'off' },
    filters: projectId ? [{ field: 'project_id', operator: 'eq', value: projectId }] : [],
    sorters: [
      { field: 'position', order: 'asc' },
      { field: 'created_at', order: 'asc' },
    ],
    queryOptions: {
      enabled: Boolean(projectId),
    },
  });

  const allProjects = useMemo(() => allProjectsQuery.data?.data ?? [], [allProjectsQuery.data]);
  const activeProjects = useMemo(() => allProjects.filter((proj) => !proj.archived), [allProjects]);

  const activeProject = useMemo(
    () =>
      activeProjectQuery.data?.data ??
      (projectId ? (allProjects.find((p) => p.id === projectId) ?? null) : null),
    [activeProjectQuery.data?.data, allProjects, projectId],
  );

  const projectProducts = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data?.data]);
  const activeProjectProducts = useMemo(
    () => projectProducts.filter((prod) => !prod.archived),
    [projectProducts],
  );

  const activeProduct = useMemo(
    () => (productId ? (projectProducts.find((p) => p.id === productId) ?? null) : null),
    [productId, projectProducts],
  );

  const showSidebar = hasProjectSidebar(projectId);

  const sections = useMemo<NavSectionConfig[]>(() => {
    if (!projectId) {
      return [];
    }
    return buildProjectNavSections(projectId, t, {
      activeProductId: productId,
      products: projectProducts,
    });
  }, [productId, projectId, projectProducts, t]);

  const { selectedKeys, openKeys } = useMemo(
    () => resolveActiveNavKeys(sections, location.pathname),
    [sections, location.pathname],
  );

  const effectiveCollapsed = isMobile ? false : siderCollapsed;

  const menuItems = useMemo(() => {
    const selectedSet = new Set(selectedKeys);
    return mapSectionsToMenuItems(sections, effectiveCollapsed, selectedSet, () =>
      setMobileSiderOpen(false),
    );
  }, [effectiveCollapsed, sections, selectedKeys]);

  const trailingSection = useMemo(
    () => resolveHeaderTrailingSection(location.pathname, projectId, productId, t),
    [location.pathname, productId, projectId, t],
  );

  // Filtered projects for the header switcher
  const switcherProjects = useMemo(() => {
    const q = projectFilter.trim().toLowerCase();
    return allProjects.filter((proj) => {
      if (proj.archived && proj.id !== projectId) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        proj.name.toLowerCase().includes(q) || (proj.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [allProjects, projectFilter, projectId]);

  // Filtered products for the header switcher
  const switcherProducts = useMemo(() => {
    const q = productFilter.trim().toLowerCase();
    return projectProducts.filter((prod) => {
      if (prod.archived && prod.id !== productId) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        prod.name.toLowerCase().includes(q) ||
        (prod.code ?? '').toLowerCase().includes(q) ||
        (prod.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [productFilter, productId, projectProducts]);

  const closeProjectPopover = useCallback(() => {
    setProjectPopoverOpen(false);
    setProjectFilter('');
  }, []);

  const closeProductPopover = useCallback(() => {
    setProductPopoverOpen(false);
    setProductFilter('');
  }, []);

  const projectSwitcherContent = (
    <div className="revlog-switcher-panel">
      <Input
        size="small"
        allowClear
        prefix={<SearchOutlined aria-hidden="true" />}
        placeholder={t('nav.findProject')}
        aria-label={t('nav.findProject')}
        value={projectFilter}
        onChange={(e) => setProjectFilter(e.target.value)}
      />

      <div className="revlog-switcher-list">
        {switcherProjects.length === 0 ? (
          <div
            className="revlog-secondary-text"
            style={{ padding: `${tokens.spacing.sm}px ${tokens.spacing.sm}px` }}
          >
            {t('nav.noMatchingProjects')}
          </div>
        ) : (
          switcherProjects.map((proj) => {
            const isSelected = proj.id === projectId;
            return (
              <button
                key={proj.id}
                type="button"
                className={`revlog-switcher-item${isSelected ? ' revlog-switcher-item-selected' : ''}`}
                onClick={() => {
                  const targetPath = resolveSwitchedProjectPath(
                    location.pathname,
                    projectId,
                    proj.id,
                  );
                  closeProjectPopover();
                  navigate(targetPath);
                }}
              >
                <span className="revlog-switcher-icon-slot">
                  <HddOutlined aria-hidden="true" />
                </span>
                <span className="revlog-switcher-label">{proj.name}</span>
                <span className="revlog-switcher-trailing">
                  {proj.archived && <StatusBadge kind="archived" />}
                  {isSelected && <CheckOutlined aria-hidden="true" />}
                </span>
              </button>
            );
          })
        )}
      </div>

      <hr className="revlog-switcher-divider" />

      <Link to="/projects" className="revlog-switcher-item" onClick={closeProjectPopover}>
        <span className="revlog-switcher-icon-slot">
          <AppstoreOutlined aria-hidden="true" />
        </span>
        <span className="revlog-switcher-label">{t('nav.allProjects')}</span>
      </Link>

      <Link to="/projects/new" className="revlog-switcher-item" onClick={closeProjectPopover}>
        <span className="revlog-switcher-icon-slot">
          <PlusOutlined aria-hidden="true" />
        </span>
        <span className="revlog-switcher-label">{t('nav.newProject')}</span>
      </Link>
    </div>
  );

  const productSwitcherContent = projectId ? (
    <div className="revlog-switcher-panel">
      <Input
        size="small"
        allowClear
        prefix={<SearchOutlined aria-hidden="true" />}
        placeholder={t('nav.findProduct')}
        aria-label={t('nav.findProduct')}
        value={productFilter}
        onChange={(e) => setProductFilter(e.target.value)}
      />

      <button
        type="button"
        className={`revlog-switcher-item${!productId ? ' revlog-switcher-item-selected' : ''}`}
        onClick={() => {
          closeProductPopover();
          navigate(`/projects/${projectId}`);
        }}
      >
        <span className="revlog-switcher-icon-slot">
          <AppstoreOutlined aria-hidden="true" />
        </span>
        <span className="revlog-switcher-label">{t('nav.projectOverviewOption')}</span>
        {!productId && (
          <span className="revlog-switcher-trailing">
            <CheckOutlined aria-hidden="true" />
          </span>
        )}
      </button>

      <hr className="revlog-switcher-divider" />

      <div className="revlog-switcher-list">
        {projectProducts.length === 0 ? (
          <div
            className="revlog-secondary-text"
            style={{ padding: `${tokens.spacing.sm}px ${tokens.spacing.sm}px` }}
          >
            {t('nav.noProductsYet')}
          </div>
        ) : switcherProducts.length === 0 ? (
          <div
            className="revlog-secondary-text"
            style={{ padding: `${tokens.spacing.sm}px ${tokens.spacing.sm}px` }}
          >
            {t('nav.noMatchingProducts')}
          </div>
        ) : (
          switcherProducts.map((prod) => {
            const isSelected = prod.id === productId;
            return (
              <button
                key={prod.id}
                type="button"
                className={`revlog-switcher-item${isSelected ? ' revlog-switcher-item-selected' : ''}`}
                onClick={() => {
                  const targetPath = resolveSwitchedProductPath(
                    location.pathname,
                    projectId,
                    productId,
                    prod.id,
                  );
                  closeProductPopover();
                  navigate(targetPath);
                }}
              >
                <span className="revlog-switcher-icon-slot">
                  {getProductTypeIcon(prod.product_type)}
                </span>
                <span className="revlog-switcher-label">{prod.name}</span>
                <span className="revlog-switcher-trailing">
                  {prod.code && <Tag bordered>{prod.code}</Tag>}
                  {isSelected && <CheckOutlined aria-hidden="true" />}
                </span>
              </button>
            );
          })
        )}
      </div>

      <hr className="revlog-switcher-divider" />

      <Link
        to={`/projects/${projectId}/products/new`}
        className="revlog-switcher-item"
        onClick={closeProductPopover}
      >
        <span className="revlog-switcher-icon-slot">
          <PlusOutlined aria-hidden="true" />
        </span>
        <span className="revlog-switcher-label">{t('nav.newProduct')}</span>
      </Link>
    </div>
  ) : null;

  const displayName =
    identity?.name && identity.name !== identity.email
      ? identity.name
      : (identity?.email ?? t('common.unknownUser'));

  const accountDropdownItems: MenuProps['items'] = [
    ...(identity?.email
      ? [
          {
            key: 'identity',
            disabled: true,
            label: (
              <div style={{ cursor: 'default' }}>
                <Typography.Text
                  strong
                  style={{ display: 'block', color: tokens.colors.textPrimary }}
                >
                  {displayName}
                </Typography.Text>
                <div className="revlog-secondary-text">{identity.email}</div>
              </div>
            ),
          },
          { type: 'divider' as const, key: 'divider' },
        ]
      : []),
    {
      key: 'logout',
      danger: true,
      icon: <LogoutOutlined aria-hidden="true" />,
      label: t('nav.signOut'),
      disabled: isLoggingOut,
      onClick: () => logout(),
    },
  ];

  const renderSiderBody = (collapsed: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <nav
        aria-label={t('nav.primary')}
        className="revlog-sider-scroll"
        style={{ paddingBlock: tokens.spacing.sm }}
      >
        <Menu
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={selectedKeys}
          defaultOpenKeys={collapsed ? undefined : openKeys}
          items={menuItems}
          style={{ borderInlineEnd: 'none' }}
        />
      </nav>

      {!isMobile && (
        <div
          style={{
            borderTop: `1px solid ${tokens.colors.borderSubtle}`,
            padding: tokens.spacing.xs,
            flexShrink: 0,
          }}
        >
          <Button
            type="text"
            size="small"
            block
            icon={
              collapsed ? (
                <MenuUnfoldOutlined aria-hidden="true" />
              ) : (
                <MenuFoldOutlined aria-hidden="true" />
              )
            }
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            onClick={handleToggleSider}
            style={{
              justifyContent: collapsed ? 'center' : 'flex-start',
              color: tokens.colors.textSecondary,
              paddingInline: collapsed ? 0 : tokens.spacing.sm,
            }}
          >
            {!collapsed ? t('nav.collapseSidebar') : null}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="revlog-app-shell">
      <a href="#main-content" className="skip-link visually-hidden">
        {t('app.skipToContent')}
      </a>

      {/* Full-Width Supabase-Style Top Context Navigation Bar */}
      <header className="revlog-topbar">
        <nav aria-label={t('nav.contextNav')} className="revlog-topbar-nav">
          {isMobile && showSidebar && (
            <Button
              type="text"
              size="small"
              icon={<MenuOutlined aria-hidden="true" />}
              aria-label={t('nav.expandSidebar')}
              onClick={() => setMobileSiderOpen(true)}
            />
          )}

          <Tooltip title={projectId ? `${t('app.name')} · ${t('nav.allProjects')}` : undefined}>
            <Link to="/projects" aria-label={t('app.name')} className="revlog-topbar-brand">
              <RevLogBrandIcon />
              {!projectId && <span className="revlog-brand-wordmark">{t('app.name')}</span>}
            </Link>
          </Tooltip>

          <span className="revlog-topbar-slash" aria-hidden="true">
            /
          </span>

          {!projectId ? (
            trailingSection ? (
              <>
                {trailingSection.parentTo && trailingSection.parentLabel && (
                  <>
                    <Link to={trailingSection.parentTo} className="revlog-topbar-link">
                      {trailingSection.parentLabel}
                    </Link>
                    <span className="revlog-topbar-slash" aria-hidden="true">
                      /
                    </span>
                  </>
                )}
                <span className="revlog-topbar-current">{trailingSection.label}</span>
              </>
            ) : (
              <span className="revlog-topbar-current">
                <span>{t('nav.projects')}</span>
                {activeProjects.length > 0 && (
                  <span className="revlog-count-pill">{activeProjects.length}</span>
                )}
              </span>
            )
          ) : (
            <>
              {/* Segment 1: Active Project + Switcher */}
              <div className="revlog-context-segment" data-open={projectPopoverOpen}>
                <Link to={`/projects/${projectId}`} className="revlog-context-segment-link">
                  <HddOutlined
                    aria-hidden="true"
                    style={{ color: tokens.colors.accent, flexShrink: 0 }}
                  />
                  <span className="revlog-context-segment-label">
                    {activeProject?.name ?? t('nav.project')}
                  </span>
                </Link>
                <Popover
                  trigger="click"
                  placement="bottomLeft"
                  arrow={false}
                  open={projectPopoverOpen}
                  onOpenChange={(next) => {
                    setProjectPopoverOpen(next);
                    if (!next) {
                      setProjectFilter('');
                    }
                  }}
                  content={projectSwitcherContent}
                >
                  <button
                    type="button"
                    className="revlog-context-segment-trigger"
                    aria-label={t('nav.switchProject')}
                    aria-expanded={projectPopoverOpen}
                  >
                    <ChevronsUpDownIcon />
                  </button>
                </Popover>
              </div>

              <span className="revlog-topbar-slash" aria-hidden="true">
                /
              </span>

              {/* Segment 2: Active Product (or Quick Product Picker) + Switcher */}
              {productId ? (
                <div
                  className="revlog-context-segment revlog-context-segment-active"
                  data-open={productPopoverOpen}
                >
                  <Link
                    to={`/projects/${projectId}/products/${productId}`}
                    className="revlog-context-segment-link"
                  >
                    <span style={{ color: tokens.colors.accent, display: 'inline-flex' }}>
                      {getProductTypeIcon(activeProduct?.product_type ?? 'mixed')}
                    </span>
                    <span className="revlog-context-segment-label">
                      {activeProduct?.name ?? t('nav.product')}
                    </span>
                    {activeProduct?.code && <Tag bordered>{activeProduct.code}</Tag>}
                  </Link>
                  <Popover
                    trigger="click"
                    placement="bottomLeft"
                    arrow={false}
                    open={productPopoverOpen}
                    onOpenChange={(next) => {
                      setProductPopoverOpen(next);
                      if (!next) {
                        setProductFilter('');
                      }
                    }}
                    content={productSwitcherContent}
                  >
                    <button
                      type="button"
                      className="revlog-context-segment-trigger"
                      aria-label={t('nav.switchProduct')}
                      aria-expanded={productPopoverOpen}
                    >
                      <ChevronsUpDownIcon />
                    </button>
                  </Popover>
                </div>
              ) : (
                <Popover
                  trigger="click"
                  placement="bottomLeft"
                  arrow={false}
                  open={productPopoverOpen}
                  onOpenChange={(next) => {
                    setProductPopoverOpen(next);
                    if (!next) {
                      setProductFilter('');
                    }
                  }}
                  content={productSwitcherContent}
                >
                  <button
                    type="button"
                    className="revlog-context-picker-btn"
                    aria-label={t('nav.switchProduct')}
                    aria-expanded={productPopoverOpen}
                  >
                    <BlockOutlined aria-hidden="true" />
                    <span>{t('nav.selectProduct')}</span>
                    {activeProjectProducts.length > 0 && (
                      <span className="revlog-count-pill">{activeProjectProducts.length}</span>
                    )}
                    <ChevronsUpDownIcon />
                  </button>
                </Popover>
              )}

              {/* Segment 3: Optional Sub-Page Crumb */}
              {trailingSection && (
                <>
                  {trailingSection.parentTo && trailingSection.parentLabel && (
                    <>
                      <span className="revlog-topbar-slash" aria-hidden="true">
                        /
                      </span>
                      <Link to={trailingSection.parentTo} className="revlog-topbar-link">
                        {trailingSection.parentLabel}
                      </Link>
                    </>
                  )}
                  <span className="revlog-topbar-slash" aria-hidden="true">
                    /
                  </span>
                  <span className="revlog-topbar-current">{trailingSection.label}</span>
                </>
              )}
            </>
          )}
        </nav>

        <Dropdown
          menu={{ items: accountDropdownItems }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            type="text"
            size="small"
            aria-label={t('nav.accountMenuAria')}
            style={{
              height: 30,
              paddingInline: tokens.spacing.sm,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0,
            }}
          >
            <span className="revlog-mini-avatar">
              {getInitials(identity?.name, identity?.email)}
            </span>
            {!isMobile && (
              <Typography.Text type="secondary" style={{ maxWidth: 180, lineHeight: 1.3 }} ellipsis>
                {displayName}
              </Typography.Text>
            )}
          </Button>
        </Dropdown>
      </header>

      {/* Body Workspace: Scoped Sidebar (only when a project is selected) + Main Content */}
      <div className="revlog-shell-body">
        {showSidebar &&
          (isMobile ? (
            <Drawer
              placement="left"
              open={mobileSiderOpen}
              onClose={() => setMobileSiderOpen(false)}
              width={tokens.layout.siderWidth}
              styles={{
                body: { padding: 0, backgroundColor: tokens.colors.surface },
                header: {
                  borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
                  padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px`,
                },
              }}
              title={
                <span className="revlog-inline-row">
                  <RevLogBrandIcon />
                  <Typography.Text strong ellipsis>
                    {activeProduct?.name ?? activeProject?.name ?? t('app.name')}
                  </Typography.Text>
                </span>
              }
            >
              {renderSiderBody(false)}
            </Drawer>
          ) : (
            <Layout.Sider
              theme="light"
              collapsible
              trigger={null}
              collapsed={siderCollapsed}
              onCollapse={setSiderCollapsed}
              width={tokens.layout.siderWidth}
              collapsedWidth={tokens.layout.siderCollapsedWidth}
              className="revlog-sticky-sider"
            >
              {renderSiderBody(siderCollapsed)}
            </Layout.Sider>
          ))}

        <main id="main-content" tabIndex={-1} className="revlog-main-region">
          <div
            style={{
              maxWidth: tokens.layout.maxContentWidth,
              margin: '0 auto',
              width: '100%',
            }}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
