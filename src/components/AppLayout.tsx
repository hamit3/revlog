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

  if (!item.to || item.disabled) {
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
          disabled: item.disabled,
          children: item.children.map((child) => ({
            key: child.key,
            icon: child.icon,
            disabled: child.disabled,
            label: renderNavItemLabel(child, selectedKeySet.has(child.key), onNavigate),
          })),
        };
      }

      return {
        key: item.key,
        icon: item.icon,
        disabled: item.disabled,
        label: renderNavItemLabel(item, selectedKeySet.has(item.key), onNavigate),
      };
    });

    if (collapsed || !section.title) {
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

  // Global projects list powers the sidebar context switcher
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

  const activeProject = useMemo(
    () =>
      activeProjectQuery.data?.data ??
      (projectId ? (allProjects.find((p) => p.id === projectId) ?? null) : null),
    [activeProjectQuery.data?.data, allProjects, projectId],
  );

  const projectProducts = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data?.data]);

  const activeProduct = useMemo(
    () => (productId ? (projectProducts.find((p) => p.id === productId) ?? null) : null),
    [productId, projectProducts],
  );

  const showSidebar = hasProjectSidebar(projectId);

  const sections = useMemo<NavSectionConfig[]>(() => {
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

  // Filtered projects for the switcher popover
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

  // Filtered products for the switcher popover
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
                  if (isMobile) {
                    setMobileSiderOpen(false);
                  }
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

      <Link
        to="/projects"
        className="revlog-switcher-item"
        onClick={() => {
          closeProjectPopover();
          if (isMobile) {
            setMobileSiderOpen(false);
          }
        }}
      >
        <span className="revlog-switcher-icon-slot">
          <AppstoreOutlined aria-hidden="true" />
        </span>
        <span className="revlog-switcher-label">{t('nav.allProjects')}</span>
      </Link>

      <Link
        to="/projects/new"
        className="revlog-switcher-item"
        onClick={() => {
          closeProjectPopover();
          if (isMobile) {
            setMobileSiderOpen(false);
          }
        }}
      >
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
          if (isMobile) {
            setMobileSiderOpen(false);
          }
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
                  if (isMobile) {
                    setMobileSiderOpen(false);
                  }
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
        onClick={() => {
          closeProductPopover();
          if (isMobile) {
            setMobileSiderOpen(false);
          }
        }}
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
      {/* Sider Header: Brand + Context Switchers */}
      <div
        style={{
          padding: `${tokens.spacing.sm}px ${tokens.spacing.sm}px`,
          borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
          display: 'flex',
          flexDirection: 'column',
          gap: tokens.spacing.xs,
          flexShrink: 0,
        }}
      >
        {/* Brand Link */}
        <Link
          to="/projects"
          aria-label={t('app.name')}
          onClick={() => isMobile && setMobileSiderOpen(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing.xs,
            height: 32,
            paddingInline: collapsed ? 0 : tokens.spacing.xs,
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: tokens.radius.sm,
            textDecoration: 'none',
            color: tokens.colors.textPrimary,
          }}
        >
          <RevLogBrandIcon />
          {!collapsed && <span className="revlog-brand-wordmark">{t('app.name')}</span>}
        </Link>

        {/* Project Context Switcher */}
        {collapsed ? (
          <Tooltip placement="right" title={activeProject?.name ?? t('nav.allProjects')}>
            <Popover
              trigger="click"
              placement="rightTop"
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
                className="revlog-sider-collapsed-btn"
                aria-label={t('nav.switchProject')}
                aria-expanded={projectPopoverOpen}
              >
                <HddOutlined aria-hidden="true" style={{ color: tokens.colors.accent }} />
              </button>
            </Popover>
          </Tooltip>
        ) : (
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
              className="revlog-sider-context-btn"
              aria-label={t('nav.switchProject')}
              aria-expanded={projectPopoverOpen}
            >
              <HddOutlined
                aria-hidden="true"
                style={{ color: tokens.colors.accent, flexShrink: 0 }}
              />
              <span className="revlog-sider-context-label">
                {activeProject?.name ?? t('nav.allProjects')}
              </span>
              <ChevronsUpDownIcon />
            </button>
          </Popover>
        )}

        {/* Product Context Switcher (visible when a project is selected) */}
        {projectId &&
          (collapsed ? (
            <Tooltip
              placement="right"
              title={activeProduct?.name ?? t('nav.projectOverviewOption')}
            >
              <Popover
                trigger="click"
                placement="rightTop"
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
                  className="revlog-sider-collapsed-btn"
                  aria-label={t('nav.switchProduct')}
                  aria-expanded={productPopoverOpen}
                >
                  <span style={{ color: tokens.colors.accent, display: 'inline-flex' }}>
                    {activeProduct
                      ? getProductTypeIcon(activeProduct.product_type)
                      : <BlockOutlined aria-hidden="true" />}
                  </span>
                </button>
              </Popover>
            </Tooltip>
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
                className="revlog-sider-context-btn"
                aria-label={t('nav.switchProduct')}
                aria-expanded={productPopoverOpen}
              >
                <span
                  style={{
                    color: tokens.colors.accent,
                    display: 'inline-flex',
                    flexShrink: 0,
                  }}
                >
                  {activeProduct
                    ? getProductTypeIcon(activeProduct.product_type)
                    : <BlockOutlined aria-hidden="true" />}
                </span>
                <span className="revlog-sider-context-label">
                  {activeProduct?.name ?? t('nav.allProducts')}
                </span>
                <ChevronsUpDownIcon />
              </button>
            </Popover>
          ))}
      </div>

      {/* Primary Fixed SaaS Navigation Menu */}
      <nav
        aria-label={t('nav.primary')}
        className="revlog-sider-scroll"
        style={{ paddingBlock: tokens.spacing.sm, flex: 1, overflowY: 'auto' }}
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

      {/* Sider Footer: Collapse / Expand Toggle */}
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

      {/* Clean Top Header Bar: Breadcrumb + Account Menu */}
      <header className="revlog-topbar">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing.sm,
            minWidth: 0,
            flex: 1,
          }}
        >
          {isMobile && (
            <Button
              type="text"
              size="small"
              icon={<MenuOutlined aria-hidden="true" />}
              aria-label={t('nav.expandSidebar')}
              onClick={() => setMobileSiderOpen(true)}
            />
          )}

          <nav aria-label={t('nav.contextNav')} className="revlog-topbar-breadcrumb">
            <Link to="/projects" className="revlog-topbar-link">
              {t('nav.projects')}
            </Link>

            {location.pathname === '/projects/new' && (
              <>
                <span className="revlog-topbar-slash" aria-hidden="true">
                  /
                </span>
                <span className="revlog-breadcrumb-current">{t('projects.createTitle')}</span>
              </>
            )}

            {projectId && (
              <>
                <span className="revlog-topbar-slash" aria-hidden="true">
                  /
                </span>
                {location.pathname === `/projects/${projectId}` && !trailingSection ? (
                  <span className="revlog-breadcrumb-current">
                    {activeProject?.name ?? t('nav.project')}
                  </span>
                ) : (
                  <Link to={`/projects/${projectId}`} className="revlog-topbar-link">
                    {activeProject?.name ?? t('nav.project')}
                  </Link>
                )}
              </>
            )}

            {projectId && location.pathname === `/projects/${projectId}/products/new` && (
              <>
                <span className="revlog-topbar-slash" aria-hidden="true">
                  /
                </span>
                <span className="revlog-breadcrumb-current">{t('products.createTitle')}</span>
              </>
            )}

            {projectId && productId && (
              <>
                <span className="revlog-topbar-slash" aria-hidden="true">
                  /
                </span>
                {location.pathname === `/projects/${projectId}/products/${productId}` &&
                !trailingSection ? (
                  <span className="revlog-breadcrumb-current">
                    {activeProduct?.name ?? t('nav.product')}
                  </span>
                ) : (
                  <Link
                    to={`/projects/${projectId}/products/${productId}`}
                    className="revlog-topbar-link"
                  >
                    {activeProduct?.name ?? t('nav.product')}
                  </Link>
                )}
              </>
            )}

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
                <span className="revlog-breadcrumb-current">{trailingSection.label}</span>
              </>
            )}
          </nav>
        </div>

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

      {/* Body Workspace: Persistent Sider + Main Content Region */}
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
