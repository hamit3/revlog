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

describe('Supabase-style scoped navigationConfig and header switcher helpers', () => {
  it('hides the left sidebar on landing routes and scopes sections to active project or product', () => {
    expect(hasProjectSidebar(undefined)).toBe(false);
    expect(hasProjectSidebar('proj-1')).toBe(true);

    const projectSections = buildProjectNavSections('proj-1', translateText, {
      products: [
        { id: 'prod-a', name: 'Sensor Board', product_type: 'mixed', archived: false },
        { id: 'prod-b', name: 'Gateway Firmware', product_type: 'software', archived: false },
      ],
    });

    expect(projectSections.map((s) => s.key)).toEqual([
      'project-ledger-section',
      'project-products-section',
      'project-config-section',
    ]);

    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1')).toEqual({
      selectedKeys: ['project-overview'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/products/new')).toEqual({
      selectedKeys: ['project-new-product'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/releases')).toEqual({
      selectedKeys: ['project-releases'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/releases/sys-99')).toEqual({
      selectedKeys: ['project-releases'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/releases/new')).toEqual({
      selectedKeys: ['project-new-release'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/releases/sys-99/edit')).toEqual({
      selectedKeys: ['project-new-release'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/bom-pnp')).toEqual({
      selectedKeys: ['project-bom-pnp'],
      openKeys: [],
    });
    expect(resolveActiveNavKeys(projectSections, '/projects/proj-1/settings')).toEqual({
      selectedKeys: ['project-settings'],
      openKeys: [],
    });

    const productSections = buildProjectNavSections('proj-1', translateText, {
      activeProductId: 'prod-a',
    });

    expect(productSections.map((s) => s.key)).toEqual([
      'product-ledger-section',
      'product-parent-project-section',
    ]);

    expect(resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a')).toEqual({
      selectedKeys: ['product-overview'],
      openKeys: [],
    });
    expect(
      resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a/releases'),
    ).toEqual({
      selectedKeys: ['product-releases'],
      openKeys: [],
    });
    expect(
      resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a/releases/rel-1'),
    ).toEqual({
      selectedKeys: ['product-releases'],
      openKeys: [],
    });
    expect(
      resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a/releases/new'),
    ).toEqual({
      selectedKeys: ['product-new-release'],
      openKeys: [],
    });
    expect(
      resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a/bom-pnp'),
    ).toEqual({
      selectedKeys: ['product-bom-pnp'],
      openKeys: [],
    });
    expect(
      resolveActiveNavKeys(productSections, '/projects/proj-1/products/prod-a/settings'),
    ).toEqual({
      selectedKeys: ['product-settings'],
      openKeys: [],
    });
  });

  it('preserves equivalent sub-routes when switching projects or products in the top bar', () => {
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
    ).toBe('Project settings');
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
