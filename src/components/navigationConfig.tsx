import React from 'react';
import {
  AppstoreOutlined,
  BlockOutlined,
  CodeOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  HddOutlined,
  HistoryOutlined,
  PlusSquareOutlined,
  RocketOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { Product, ProductType } from '../types/database';

export interface NavItemConfig {
  key: string;
  label: string;
  to?: string;
  icon?: React.ReactNode;
  badgeCount?: number;
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
 * In the Supabase-inspired navigation model, the left sidebar renders only once
 * a project has been selected; `/projects` and `/projects/new` act as the clean
 * organization/project selection landing view.
 */
export function hasProjectSidebar(projectId?: string): boolean {
  return Boolean(projectId);
}

/**
 * Preserves the equivalent project-level section (`releases`, `settings`) when
 * switching between projects via the top header switcher.
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
 * Preserves the equivalent product-level section (`releases`, `settings`) when
 * switching between sibling products (A, B, C) via the top header switcher.
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
 * Product-scoped sidebar shown when inspecting a specific hardware/software
 * product under a project. Keeps primary product tools front-and-center while
 * providing 1-click return links to the parent project scope.
 */
export function buildProductNavSections(
  projectId: string,
  productId: string,
  t: TranslateFn,
): NavSectionConfig[] {
  const projectBase = `/projects/${projectId}`;
  const productBase = `${projectBase}/products/${productId}`;

  return [
    {
      key: 'product-ledger-section',
      title: t('nav.productLedgerSection'),
      items: [
        {
          key: 'product-overview',
          label: t('nav.productOverview'),
          to: productBase,
          icon: <FolderOpenOutlined aria-hidden="true" />,
          matches: (pathname) => pathname === productBase,
        },
        {
          key: 'product-releases',
          label: t('nav.productReleases'),
          to: `${productBase}/releases`,
          icon: <HistoryOutlined aria-hidden="true" />,
          matches: (pathname) =>
            pathname === `${productBase}/releases` ||
            (pathname.startsWith(`${productBase}/releases/`) &&
              !pathname.startsWith(`${productBase}/releases/new`) &&
              !pathname.endsWith('/edit')),
        },
        {
          key: 'product-new-release',
          label: t('nav.newProductRelease'),
          to: `${productBase}/releases/new`,
          icon: <RocketOutlined aria-hidden="true" />,
          matches: (pathname) =>
            pathname.startsWith(`${productBase}/releases/new`) ||
            (pathname.startsWith(`${productBase}/releases/`) && pathname.endsWith('/edit')),
        },
        {
          key: 'product-bom-pnp',
          label: t('nav.bomPnp'),
          to: `${productBase}/bom-pnp`,
          icon: <FileSearchOutlined aria-hidden="true" />,
          matches: (pathname) => pathname.startsWith(`${productBase}/bom-pnp`),
        },
        {
          key: 'product-settings',
          label: t('nav.productSettings'),
          to: `${productBase}/settings`,
          icon: <ToolOutlined aria-hidden="true" />,
          matches: (pathname) => pathname.startsWith(`${productBase}/settings`),
        },
      ],
    },
    {
      key: 'product-parent-project-section',
      title: t('nav.parentProjectSection'),
      items: [
        {
          key: 'back-to-project',
          label: t('nav.allProducts'),
          to: projectBase,
          icon: <AppstoreOutlined aria-hidden="true" />,
          matches: (pathname) => pathname === projectBase,
        },
        {
          key: 'project-releases',
          label: t('nav.projectReleases'),
          to: `${projectBase}/releases`,
          icon: <HistoryOutlined aria-hidden="true" />,
          matches: (pathname) => pathname.startsWith(`${projectBase}/releases`),
        },
        {
          key: 'project-settings',
          label: t('nav.settings'),
          to: `${projectBase}/settings`,
          icon: <SettingOutlined aria-hidden="true" />,
          matches: (pathname) => pathname.startsWith(`${projectBase}/settings`),
        },
      ],
    },
  ];
}

/**
 * Project-scoped sidebar sections rendered once a project is selected.
 * Automatically adapts to product-scoped navigation when inside `/products/:productId`.
 */
export function buildProjectNavSections(
  projectId: string,
  t: TranslateFn,
  options?: {
    activeProductId?: string;
    products?: readonly Pick<Product, 'id' | 'name' | 'product_type' | 'archived'>[];
  },
): NavSectionConfig[] {
  const base = `/projects/${projectId}`;
  const activeProductId = options?.activeProductId;

  if (activeProductId) {
    return buildProductNavSections(projectId, activeProductId, t);
  }

  const activeProducts = (options?.products ?? []).filter((p) => !p.archived);

  const productItems: NavItemConfig[] = activeProducts.map((prod) => ({
    key: `product-jump-${prod.id}`,
    label: prod.name,
    to: `${base}/products/${prod.id}`,
    icon: getProductTypeIcon(prod.product_type),
    matches: (pathname) => pathname === `${base}/products/${prod.id}`,
  }));

  productItems.push({
    key: 'project-new-product',
    label: t('nav.newProduct'),
    to: `${base}/products/new`,
    icon: <PlusSquareOutlined aria-hidden="true" />,
    matches: (pathname) => pathname === `${base}/products/new`,
  });

  return [
    {
      key: 'project-ledger-section',
      title: t('nav.ledgerSection'),
      items: [
        {
          key: 'project-overview',
          label: t('nav.overview'),
          to: base,
          icon: <AppstoreOutlined aria-hidden="true" />,
          matches: (pathname) => pathname === base,
        },
        {
          key: 'project-releases',
          label: t('nav.projectReleases'),
          to: `${base}/releases`,
          icon: <HistoryOutlined aria-hidden="true" />,
          matches: (pathname) =>
            pathname === `${base}/releases` ||
            (pathname.startsWith(`${base}/releases/`) &&
              !pathname.startsWith(`${base}/releases/new`) &&
              !pathname.endsWith('/edit')),
        },
        {
          key: 'project-new-release',
          label: t('nav.newProjectRelease'),
          to: `${base}/releases/new`,
          icon: <RocketOutlined aria-hidden="true" />,
          matches: (pathname) =>
            pathname.startsWith(`${base}/releases/new`) ||
            (pathname.startsWith(`${base}/releases/`) && pathname.endsWith('/edit')),
        },
        {
          key: 'project-bom-pnp',
          label: t('nav.bomPnp'),
          to: `${base}/bom-pnp`,
          icon: <FileSearchOutlined aria-hidden="true" />,
          matches: (pathname) => pathname.startsWith(`${base}/bom-pnp`),
        },
      ],
    },
    {
      key: 'project-products-section',
      title: t('nav.products'),
      items: productItems,
    },
    {
      key: 'project-config-section',
      title: t('nav.configSection'),
      items: [
        {
          key: 'project-settings',
          label: t('nav.settings'),
          to: `${base}/settings`,
          icon: <SettingOutlined aria-hidden="true" />,
          matches: (pathname) => pathname.startsWith(`${base}/settings`),
        },
      ],
    },
  ];
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
