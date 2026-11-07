import { describe, expect, it } from 'vitest';
import { translateText } from '../providers/i18nProvider';
import {
  buildProjectNavSections,
  hasProjectSidebar,
  resolveActiveNavKeys,
  resolveHeaderTrailingSection,
  resolveSwitchedProductPath,
  resolveSwitchedProjectPath,
  type NavSectionConfig,
} from './navigationConfig';

describe('Classic Persistent SaaS navigationConfig and switcher helpers', () => {
  it('keeps the left sidebar persistent across all routes including landing', () => {
    expect(hasProjectSidebar(undefined)).toBe(true);
    expect(hasProjectSidebar('proj-1')).toBe(true);
  });

  it('provides the fixed 5-item menu at project scope without morphing or duplicate sections', () => {
    const projectSections = buildProjectNavSections('proj-1', translateText, {
      products: [
        { id: 'prod-a', name: 'Sensor Board', product_type: 'mixed', archived: false },
        { id: 'prod-b', name: 'Gateway Firmware', product_type: 'software', archived: false },
      ],
    });

    expect(projectSections).toHaveLength(1);
    expect(projectSections[0]!.key).toBe('main-menu');

    const itemKeys = projectSections[0]!.items.map((i) => i.key);
    expect(itemKeys).toEqual([
      'nav-projects',
      'nav-overview',
      'nav-releases',
      'nav-bom-pnp',
      'nav-settings',
    ]);

    expect(resolveActiveNavKeys(projectSections, '/projects')).toEqual({
      selectedKeys: ['nav-projects'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/new')).toEqual({
      selectedKeys: ['nav-projects'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1')).toEqual({
      selectedKeys: ['nav-overview'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/products/new')).toEqual({
      selectedKeys: ['nav-overview'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/releases')).toEqual({
      selectedKeys: ['nav-releases'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/releases/sys-99')).toEqual({
      selectedKeys: ['nav-releases'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/releases/new')).toEqual({
      selectedKeys: ['nav-releases'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/releases/sys-99/edit')).toEqual({
      selectedKeys: ['nav-releases'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/bom-pnp')).toEqual({
      selectedKeys: ['nav-bom-pnp'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/settings')).toEqual({
      selectedKeys: ['nav-settings'],
      openKeys: [],
    });
  });

  it('keeps the exact same 5-item menu structure when scoped to a product without duplicating sections', () => {
    const productSections = buildProjectNavSections('proj-1', translateText, {
      activeProductId: 'prod-a',
    });

    expect(productSections).toHaveLength(1);
    const itemKeys = productSections[0]!.items.map((i) => i.key);
    expect(itemKeys).toEqual([
      'nav-projects',
      'nav-overview',
      'nav-releases',
      'nav-bom-pnp',
      'nav-settings',
    ]);

    expect(resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a')).toEqual({
      selectedKeys: ['nav-overview'],
      openKeys: [],
    });
    expect(
      resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a/releases'),
    ).toEqual({
      selectedKeys: ['nav-releases'],
      openKeys: [],
    });
    expect(
      resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a/releases/rel-1'),
    ).toEqual({
      selectedKeys: ['nav-releases'],
      openKeys: [],
    });
    expect(
      resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a/releases/new'),
    ).toEqual({
      selectedKeys: ['nav-releases'],
      openKeys: [],
    });
    expect(
      resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a/bom-pnp'),
    ).toEqual({
      selectedKeys: ['nav-bom-pnp'],
      openKeys: [],
    });
    expect(
      resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a/settings'),
    ).toEqual({
      selectedKeys: ['nav-settings'],
      openKeys: [],
    });
  });

  it('disables project-scoped items when on root /projects without an active project', () => {
    const rootSections = buildProjectNavSections(undefined, translateText);
    const items = rootSections[0]!.items;

    const projectsItem = items.find((i) => i.key === 'nav-projects');
    const overviewItem = items.find((i) => i.key === 'nav-overview');
    const releasesItem = items.find((i) => i.key === 'nav-releases');

    expect(projectsItem?.disabled).toBeFalsy();
    expect(overviewItem?.disabled).toBe(true);
    expect(releasesItem?.disabled).toBe(true);
  });

  it('preserves equivalent sub-routes when switching projects or products in context switchers', () => {
    expect(resolveSwitchedProjectPath('/projects/p1/settings', 'p1', 'p2')).toBe(
      '/projects/p2/settings',
    );
    expect(resolveSwitchedProjectPath('/projects/p1/releases', 'p1', 'p2')).toBe(
      '/projects/p2/releases',
    );
    expect(resolveSwitchedProjectPath('/projects/p1/bom-pnp', 'p1', 'p2')).toBe(
      '/projects/p2/bom-pnp',
    );
    expect(resolveSwitchedProjectPath('/projects/p1/products/a1', 'p1', 'p2')).toBe('/projects/p2');

    expect(resolveSwitchedProductPath('/projects/p1/products/a1/releases', 'p1', 'a1', 'b2')).toBe(
      '/projects/p1/products/b2/releases',
    );
    expect(resolveSwitchedProductPath('/projects/p1/products/a1/bom-pnp', 'p1', 'a1', 'b2')).toBe(
      '/projects/p1/products/b2/bom-pnp',
    );
    expect(resolveSwitchedProductPath('/projects/p1/products/a1/settings', 'p1', 'a1', 'b2')).toBe(
      '/projects/p1/products/b2/settings',
    );
    expect(
      resolveSwitchedProductPath('/projects/p1/products/a1/releases/r1', 'p1', 'a1', 'b2'),
    ).toBe('/projects/p1/products/b2');

    expect(
      resolveHeaderTrailingSection('/projects', undefined, undefined, translateText),
    ).toBeNull();
    expect(
      resolveHeaderTrailingSection('/projects/new', undefined, undefined, translateText)?.label,
    ).toBe('New project');
    expect(
      resolveHeaderTrailingSection('/projects/p1/settings', 'p1', undefined, translateText)?.label,
    ).toBe('Settings');
    expect(
      resolveHeaderTrailingSection('/projects/p1/bom-pnp', 'p1', undefined, translateText)?.label,
    ).toBe('BOM & PnP');
    expect(
      resolveHeaderTrailingSection(
        '/projects/p1/products/a1/bom-pnp',
        'p1',
        'a1',
        translateText,
      )?.label,
    ).toBe('BOM & PnP');
    expect(
      resolveHeaderTrailingSection(
        '/projects/p1/products/a1/releases/rel-1',
        'p1',
        'a1',
        translateText,
      ),
    ).toEqual({
      parentLabel: 'Releases',
      parentTo: '/projects/p1/products/a1/releases',
      label: 'Release snapshot',
    });
  });

  it('supports nested submenu items and resolves parent openKeys for future feature modules', () => {
    const customSections: NavSectionConfig[] = [
      {
        key: 'future-group',
        title: 'Governance',
        items: [
          {
            key: 'compliance',
            label: 'Compliance',
            children: [
              {
                key: 'compliance-sbom',
                label: 'SBOM exports',
                to: '/projects/proj-1/sbom',
                matches: (p) => p.startsWith('/projects/proj-1/sbom'),
              },
            ],
          },
        ],
      },
    ];

    expect(resolveActiveNavKeys(customSections, '/projects/proj-1/sbom')).toEqual({
      selectedKeys: ['compliance-sbom'],
      openKeys: ['compliance'],
    });
  });
});
