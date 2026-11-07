import React from 'react';
import {
  AppstoreOutlined,
  BlockOutlined,
  CodeOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  HddOutlined,
  HistoryOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { Product, ProductType } from '../types/database';

export interface NavItemConfig {
  key: string;
  label: string;
  to?: string;
  icon?: React.ReactNode;
  badgeCount?: number;
  disabled?: boolean;
  matches?: (pathname: string) => boolean;
  children?: NavItemConfig[];
}

export interface NavSectionConfig {
  key: string;
  title: string;
  items: NavItemConfig[];
}

export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function getProductTypeIcon(productType: ProductType): React.ReactNode {
  if (productType === 'hardware') {
    return <HddOutlined aria-hidden="true" />;
  }
  if (productType === 'software') {
    return <CodeOutlined aria-hidden="true" />;
  }
  return <BlockOutlined aria-hidden="true" />;
}

/**
 * In the Classic Persistent SaaS navigation model, the left sidebar renders
 * permanently across all routes, including `/projects` and `/projects/new`.
 */
export function hasProjectSidebar(_projectId?: string): boolean {
  return true;
}

/**
 * Preserves the equivalent project-level section (`releases`, `bom-pnp`, `settings`) when
 * switching between projects via the header switcher.
 */
export function resolveSwitchedProjectPath(
  pathname: string,
  currentProjectId: string | undefined,
  nextProjectId: string,
): string {
  const nextBase = `/projects/${nextProjectId}`;
  if (!currentProjectId) {
    return nextBase;
  }
  const currentBase = `/projects/${currentProjectId}`;
  if (pathname === `${currentBase}/settings` || pathname.startsWith(`${currentBase}/settings/`)) {
    return `${nextBase}/settings`;
  }
  if (pathname === `${currentBase}/releases`) {
    return `${nextBase}/releases`;
  }
  if (pathname === `${currentBase}/bom-pnp` || pathname.startsWith(`${currentBase}/bom-pnp`)) {
    return `${nextBase}/bom-pnp`;
  }
  return nextBase;
}

/**
 * Preserves the equivalent product-level section (`releases`, `bom-pnp`, `settings`) when
 * switching between sibling products (A, B, C) via the product switcher.
 */
export function resolveSwitchedProductPath(
  pathname: string,
  projectId: string,
  currentProductId: string | undefined,
  nextProductId: string,
): string {
  const nextBase = `/projects/${projectId}/products/${nextProductId}`;
  if (!currentProductId) {
    return nextBase;
  }
  const currentBase = `/projects/${projectId}/products/${currentProductId}`;
  if (pathname === `${currentBase}/settings` || pathname.startsWith(`${currentBase}/settings/`)) {
    return `${nextBase}/settings`;
  }
  if (pathname === `${currentBase}/releases`) {
    return `${nextBase}/releases`;
  }
  if (pathname === `${currentBase}/bom-pnp` || pathname.startsWith(`${currentBase}/bom-pnp`)) {
    return `${nextBase}/bom-pnp`;
  }
  return nextBase;
}

export interface HeaderTrailingSection {
  parentLabel?: string;
  parentTo?: string;
  label: string;
}

/**
 * Resolves the optional trailing section crumb shown after the Project / Product
 * context switchers in the top bar.
 */
export function resolveHeaderTrailingSection(
  pathname: string,
  projectId: string | undefined,
  productId: string | undefined,
  t: TranslateFn,
): HeaderTrailingSection | null {
  if (!projectId) {
    if (pathname === '/projects/new') {
      return {
        parentLabel: t('nav.projects'),
        parentTo: '/projects',
        label: t('projects.createTitle'),
      };
    }
    return null;
  }

  const projectBase = `/projects/${projectId}`;

  if (pathname === `${projectBase}/products/new`) {
    return { label: t('products.createTitle') };
  }

  if (productId) {
    const productBase = `${projectBase}/products/${productId}`;
    if (pathname === productBase) {
      return null;
    }
    if (pathname.startsWith(`${productBase}/releases/new`)) {
      return {
        parentLabel: t('nav.productReleases'),
        parentTo: `${productBase}/releases`,
        label: t('releases.wizardTitleNew'),
      };
    }
    if (pathname.startsWith(`${productBase}/releases/`) && pathname.endsWith('/edit')) {
      return {
        parentLabel: t('nav.productReleases'),
        parentTo: `${productBase}/releases`,
        label: t('releases.wizardTitleEdit'),
      };
    }
    if (pathname === `${productBase}/releases`) {
      return { label: t('nav.productReleases') };
    }
    if (pathname.startsWith(`${productBase}/releases/`)) {
      return {
        parentLabel: t('nav.productReleases'),
        parentTo: `${productBase}/releases`,
        label: t('releases.detailBreadcrumb'),
      };
    }
    if (pathname.startsWith(`${productBase}/bom-pnp`)) {
      return { label: t('nav.bomPnp') };
    }
    if (pathname.startsWith(`${productBase}/settings`)) {
      return { label: t('nav.productSettings') };
    }
    return null;
  }

  if (pathname === projectBase) {
    return null;
  }
  if (pathname.startsWith(`${projectBase}/releases/new`)) {
    return {
      parentLabel: t('nav.projectReleases'),
      parentTo: `${projectBase}/releases`,
      label: t('projectReleases.wizardTitleNew'),
    };
  }
  if (pathname.startsWith(`${projectBase}/releases/`) && pathname.endsWith('/edit')) {
    return {
      parentLabel: t('nav.projectReleases'),
      parentTo: `${projectBase}/releases`,
      label: t('projectReleases.wizardTitleEdit'),
    };
  }
  if (pathname === `${projectBase}/releases`) {
    return { label: t('nav.projectReleases') };
  }
  if (pathname.startsWith(`${projectBase}/releases/`)) {
    return {
      parentLabel: t('nav.projectReleases'),
      parentTo: `${projectBase}/releases`,
      label: t('projectReleases.detailBreadcrumb'),
    };
  }
  if (pathname.startsWith(`${projectBase}/bom-pnp`)) {
    return { label: t('nav.bomPnp') };
  }
  if (pathname.startsWith(`${projectBase}/settings`)) {
    return { label: t('nav.settings') };
  }

  return null;
}

/**
 * Builds the Classic Persistent SaaS navigation items.
 * The primary menu consists of the exact 5 core items in a fixed order:
 * Projects, Overview, Releases, BOM & PnP, Settings.
 * It never morphs, jumps or duplicates sections.
 */
export function buildProjectNavSections(
  projectId: string | undefined,
  t: TranslateFn,
  options?: {
    activeProductId?: string;
    products?: readonly Pick<Product, 'id' | 'name' | 'product_type' | 'archived'>[];
  },
): NavSectionConfig[] {
  const activeProductId = options?.activeProductId;
  const projectBase = projectId ? `/projects/${projectId}` : '/projects';
  const targetBase =
    projectId && activeProductId
      ? `${projectBase}/products/${activeProductId}`
      : projectBase;

  return [
    {
      key: 'main-menu',
      title: '',
      items: [
        {
          key: 'nav-projects',
          label: t('nav.projects'),
          to: '/projects',
          icon: <AppstoreOutlined aria-hidden="true" />,
          matches: (pathname) => pathname === '/projects' || pathname === '/projects/new',
        },
        {
          key: 'nav-overview',
          label: t('nav.overview'),
          to: projectId ? targetBase : undefined,
          disabled: !projectId,
          icon: <FolderOpenOutlined aria-hidden="true" />,
          matches: (pathname) =>
            Boolean(projectId) &&
            (pathname === targetBase ||
              (!activeProductId && pathname === `${projectBase}/products/new`)),
        },
        {
          key: 'nav-releases',
          label: t('nav.releases'),
          to: projectId ? `${targetBase}/releases` : undefined,
          disabled: !projectId,
          icon: <HistoryOutlined aria-hidden="true" />,
          matches: (pathname) =>
            Boolean(projectId) &&
            (pathname === `${targetBase}/releases` ||
              pathname.startsWith(`${targetBase}/releases/`)),
        },
        {
          key: 'nav-bom-pnp',
          label: t('nav.bomPnp'),
          to: projectId ? `${targetBase}/bom-pnp` : undefined,
          disabled: !projectId,
          icon: <FileSearchOutlined aria-hidden="true" />,
          matches: (pathname) =>
            Boolean(projectId) && pathname.startsWith(`${targetBase}/bom-pnp`),
        },
        {
          key: 'nav-settings',
          label: t('nav.settings'),
          to: projectId ? `${targetBase}/settings` : undefined,
          disabled: !projectId,
          icon: <SettingOutlined aria-hidden="true" />,
          matches: (pathname) =>
            Boolean(projectId) && pathname.startsWith(`${targetBase}/settings`),
        },
      ],
    },
  ];
}

/**
 * Backwards-compatible wrapper that builds the unified nav sections scoped to a product.
 */
export function buildProductNavSections(
  projectId: string,
  productId: string,
  t: TranslateFn,
): NavSectionConfig[] {
  return buildProjectNavSections(projectId, t, { activeProductId: productId });
}

export function resolveActiveNavKeys(
  sections: readonly NavSectionConfig[],
  pathname: string,
): { selectedKeys: string[]; openKeys: string[] } {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.children && item.children.length > 0) {
        for (const child of item.children) {
          if (child.matches?.(pathname) || (child.to && pathname === child.to)) {
            return { selectedKeys: [child.key], openKeys: [item.key] };
          }
        }
      }
      if (item.matches?.(pathname) || (item.to && pathname === item.to)) {
        return { selectedKeys: [item.key], openKeys: [] };
      }
    }
  }
  return { selectedKeys: [], openKeys: [] };
}
