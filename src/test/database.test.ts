import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDbContext } from './pgliteSupabaseHarness';
import {
  computeManifestHash,
  computeProjectReleaseManifestHash,
  type ManifestItemInput,
} from '../lib/manifestHash';
import { sha256HexFromBytes, sha256HexFromFile, sha256HexFromString } from '../lib/sha256';
import type {
  Product,
  ProjectRelease,
  ProjectReleaseProduct,
  Release,
  ReleaseItem,
} from '../types/database';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const VIEWER_ID = '33333333-3333-4333-8333-333333333333';
const OUTSIDER_ID = '44444444-4444-4444-8444-444444444444';
const SEED_PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SEED_PRODUCT_SENSOR_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const SEED_PRODUCT_GATEWAY_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
const SEED_RELEASE_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const SEED_GW_RELEASE_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
const SEED_PROJECT_RELEASE_ID = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
const SEED_BOM_ITEM_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const SEED_FW_ITEM_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const SEED_LINK_ITEM_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
const SEED_BOM_PATH =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/10000000-0000-4000-8000-000000000001/sensor-board-bom-rev-b.csv';

describe('SHA-256 and canonical manifest hash helpers', () => {
  it('computes known SHA-256 digests accurately from strings, bytes and Blobs', async () => {
    expect(await sha256HexFromString('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await sha256HexFromString('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );

    const bytes = new TextEncoder().encode('RevLog PCB Gerber Archive');
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    expect(await sha256HexFromFile(blob)).toBe(await sha256HexFromBytes(bytes));
  });

  it('produces identical manifest hashes regardless of input item order', async () => {
    const itemsA: ManifestItemInput[] = [
      {
        category_name: 'Test',
        category_position: 3,
        title: 'EMC Report',
        kind: 'link',
        version_label: 'Rev C',
        url: 'https://example.com/emc-rev-c',
      },
      {
        category_name: 'Hardware',
        category_position: 0,
        title: 'Production BOM',
        kind: 'file',
        version_label: 'Rev C',
        file_name: 'bom.csv',
        file_size: 4096,
        sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      },
      {
        category_name: 'Firmware',
        category_position: 1,
        title: 'Bootloader',
        kind: 'file',
        version_label: 'v2.0.1',
        file_name: 'boot.bin',
        file_size: 16384,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
    ];

    const itemsB: ManifestItemInput[] = [itemsA[2]!, itemsA[0]!, itemsA[1]!];

    const hashA = await computeManifestHash(itemsA);
    const hashB = await computeManifestHash(itemsB);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);
    expect(hashA).toBe(hashB);
  });
});

describe('Database migrations, products, product & project releases, immutability and RLS', () => {
  let ctx: TestDbContext;

  beforeAll(async () => {
    ctx = await createTestDatabase({ runSeed: true });
    await ctx.asSuperuser(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, 'outsider@revlog.local', '{"full_name":"Outsider User"}'::jsonb)`,
      [OUTSIDER_ID],
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('matches Postgres publish_release manifest_hash with TypeScript computeManifestHash', async () => {
    const releases = await ctx.asUser<Release>(
      VIEWER_ID,
      `select * from public.releases where id = $1`,
      [SEED_RELEASE_ID],
    );
    expect(releases).toHaveLength(1);
    const release = releases[0]!;
    expect(release.status).toBe('published');
    expect(release.product_id).toBe(SEED_PRODUCT_SENSOR_ID);
    expect(release.manifest_hash).toMatch(/^[0-9a-f]{64}$/);

    const items = await ctx.asUser<ReleaseItem>(
      VIEWER_ID,
      `select * from public.release_items where release_id = $1`,
      [SEED_RELEASE_ID],
    );
    expect(items).toHaveLength(3);

    const tsHash = await computeManifestHash(
      items.map((ri) => ({
        category_name: ri.category_name ?? '',
        category_position: ri.category_position ?? 0,
        title: ri.title ?? '',
        kind: ri.kind ?? 'file',
        version_label: ri.version_label ?? '',
        file_name: ri.file_name,
        file_size: ri.file_size,
        sha256: ri.sha256,
        url: ri.url,
      })),
    );
    expect(tsHash).toBe(release.manifest_hash);
  });

  it('matches Postgres publish_project_release manifest_hash with TypeScript computeProjectReleaseManifestHash and enforces immutability', async () => {
    const projReleases = await ctx.asUser<ProjectRelease>(
      VIEWER_ID,
      `select * from public.project_releases where id = $1`,
      [SEED_PROJECT_RELEASE_ID],
    );
    expect(projReleases).toHaveLength(1);
    const projRelease = projReleases[0]!;
    expect(projRelease.status).toBe('published');
    expect(projRelease.manifest_hash).toMatch(/^[0-9a-f]{64}$/);

    const bundled = await ctx.asUser<ProjectReleaseProduct>(
      VIEWER_ID,
      `select * from public.project_release_products where project_release_id = $1`,
      [SEED_PROJECT_RELEASE_ID],
    );
    expect(bundled).toHaveLength(2);

    const tsSysHash = await computeProjectReleaseManifestHash(
      bundled.map((row) => ({
        product_code: row.product_code,
        product_id: row.product_id,
        product_name: row.product_name ?? '',
        product_position: row.product_position ?? 0,
        release_id: row.release_id,
        release_manifest_hash: row.release_manifest_hash ?? '',
        release_version_label: row.release_version_label ?? '',
      })),
    );
    expect(tsSysHash).toBe(projRelease.manifest_hash);

    // Order-independent project release manifest hash
    const sysDraft = await ctx.asUser<ProjectRelease>(
      MEMBER_ID,
      `insert into public.project_releases (project_id, version_label, notes)
       values ($1, 'System 2026.11-reordered', 'Reverse product insert order') returning *`,
      [SEED_PROJECT_ID],
    );
    await ctx.asUser(
      MEMBER_ID,
      `insert into public.project_release_products (project_release_id, product_id, release_id)
       values ($1, $2, $3), ($1, $4, $5)`,
      [
        sysDraft[0]!.id,
        SEED_PRODUCT_GATEWAY_ID,
        SEED_GW_RELEASE_ID,
        SEED_PRODUCT_SENSOR_ID,
        SEED_RELEASE_ID,
      ],
    );
    const sysPub = await ctx.asUser<ProjectRelease>(
      MEMBER_ID,
      `select * from public.publish_project_release($1)`,
      [sysDraft[0]!.id],
    );
    expect(sysPub[0]!.manifest_hash).toBe(projRelease.manifest_hash);

    // Block modifying or deleting published project releases
    await expect(
      ctx.asSuperuser(`update public.project_releases set notes = 'Tampered' where id = $1`, [
        SEED_PROJECT_RELEASE_ID,
      ]),
    ).rejects.toThrow(/Published project releases cannot be modified or deleted/);

    await expect(
      ctx.asSuperuser(`delete from public.project_release_products where project_release_id = $1`, [
        SEED_PROJECT_RELEASE_ID,
      ]),
    ).rejects.toThrow(/Cannot modify or delete products of a published project release/);
  });

  it('produces identical database manifest_hash when product items are added in different order', async () => {
    const draft1 = await ctx.asUser<Release>(
      MEMBER_ID,
      `insert into public.releases (project_id, product_id, version_label, notes)
       values ($1, $2, 'Order-Test-1', 'Order A') returning *`,
      [SEED_PROJECT_ID, SEED_PRODUCT_SENSOR_ID],
    );
    await ctx.asUser(
      MEMBER_ID,
      `insert into public.release_items (release_id, item_id)
       values ($1, $2), ($1, $3), ($1, $4)`,
      [draft1[0]!.id, SEED_BOM_ITEM_ID, SEED_FW_ITEM_ID, SEED_LINK_ITEM_ID],
    );
    const pub1 = await ctx.asUser<Release>(MEMBER_ID, `select * from public.publish_release($1)`, [
      draft1[0]!.id,
    ]);

    const draft2 = await ctx.asUser<Release>(
      MEMBER_ID,
      `insert into public.releases (project_id, product_id, version_label, notes)
       values ($1, $2, 'Order-Test-2', 'Order B') returning *`,
      [SEED_PROJECT_ID, SEED_PRODUCT_SENSOR_ID],
    );
    await ctx.asUser(
      MEMBER_ID,
      `insert into public.release_items (release_id, item_id)
       values ($1, $2), ($1, $3), ($1, $4)`,
      [draft2[0]!.id, SEED_LINK_ITEM_ID, SEED_FW_ITEM_ID, SEED_BOM_ITEM_ID],
    );
    const pub2 = await ctx.asUser<Release>(MEMBER_ID, `select * from public.publish_release($1)`, [
      draft2[0]!.id,
    ]);

    expect(pub1[0]!.manifest_hash).toBe(pub2[0]!.manifest_hash);
  });

  it('blocks updating or deleting published releases and published release_items at the DB level', async () => {
    await expect(
      ctx.asSuperuser(`update public.releases set notes = 'Tampered note' where id = $1`, [
        SEED_RELEASE_ID,
      ]),
    ).rejects.toThrow(/Published releases cannot be modified or deleted/);

    await expect(
      ctx.asSuperuser(`delete from public.releases where id = $1`, [SEED_RELEASE_ID]),
    ).rejects.toThrow(/Published releases cannot be modified or deleted/);

    await expect(
      ctx.asSuperuser(`update public.release_items set title = 'Tampered' where release_id = $1`, [
        SEED_RELEASE_ID,
      ]),
    ).rejects.toThrow(/Cannot modify or delete items of a published release/);

    await expect(
      ctx.asSuperuser(`delete from public.release_items where release_id = $1`, [SEED_RELEASE_ID]),
    ).rejects.toThrow(/Cannot modify or delete items of a published release/);
  });

  it('preserves published release snapshots when underlying items are later edited or archived', async () => {
    await ctx.asUser(
      MEMBER_ID,
      `update public.items
          set title = 'Production BOM Updated',
              version_label = 'Rev C',
              storage_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/10000000-0000-4000-8000-000000000099/bom-rev-c.csv',
              file_name = 'bom-rev-c.csv',
              sha256 = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
              archived = true
        where id = $1`,
      [SEED_BOM_ITEM_ID],
    );

    const snapshotRows = await ctx.asUser<ReleaseItem>(
      VIEWER_ID,
      `select * from public.release_items where release_id = $1 and item_id = $2`,
      [SEED_RELEASE_ID, SEED_BOM_ITEM_ID],
    );

    expect(snapshotRows[0]!.title).toBe('Production BOM');
    expect(snapshotRows[0]!.version_label).toBe('Rev B');
    expect(snapshotRows[0]!.storage_path).toBe(SEED_BOM_PATH);
    expect(snapshotRows[0]!.sha256).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('enforces RLS across projects, products, items, product releases, project releases and storage', async () => {
    const outsiderProjects = await ctx.asUser(OUTSIDER_ID, `select * from public.projects`);
    const outsiderProducts = await ctx.asUser(OUTSIDER_ID, `select * from public.products`);
    const outsiderItems = await ctx.asUser(OUTSIDER_ID, `select * from public.items`);
    const outsiderProjectReleases = await ctx.asUser(
      OUTSIDER_ID,
      `select * from public.project_releases`,
    );
    expect(outsiderProjects).toHaveLength(0);
    expect(outsiderProducts).toHaveLength(0);
    expect(outsiderItems).toHaveLength(0);
    expect(outsiderProjectReleases).toHaveLength(0);

    const viewerProducts = await ctx.asUser(VIEWER_ID, `select * from public.products`);
    expect(viewerProducts).toHaveLength(2);

    await expect(
      ctx.asUser(
        VIEWER_ID,
        `insert into public.items (project_id, product_id, category_id, title, kind, url, created_by)
         values ($1, $2, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'Unauthorized Link', 'link', 'https://example.com', $3)`,
        [SEED_PROJECT_ID, SEED_PRODUCT_SENSOR_ID, VIEWER_ID],
      ),
    ).rejects.toThrow(/row-level security/);

    await expect(
      ctx.asUser(
        VIEWER_ID,
        `insert into public.releases (project_id, product_id, version_label) values ($1, $2, 'Unauthorized-Rel')`,
        [SEED_PROJECT_ID, SEED_PRODUCT_SENSOR_ID],
      ),
    ).rejects.toThrow(/row-level security/);

    // Member cannot create products or categories (owner only)
    await expect(
      ctx.asUser(
        MEMBER_ID,
        `insert into public.products (project_id, name, created_by) values ($1, 'Unauthorized Product', $2)`,
        [SEED_PROJECT_ID, MEMBER_ID],
      ),
    ).rejects.toThrow(/row-level security/);

    await expect(
      ctx.asUser(
        MEMBER_ID,
        `insert into public.categories (project_id, product_id, name, position) values ($1, $2, 'Packaging', 5)`,
        [SEED_PROJECT_ID, SEED_PRODUCT_SENSOR_ID],
      ),
    ).rejects.toThrow(/row-level security/);

    // Storage protection
    await ctx.asUser(
      OWNER_ID,
      `insert into storage.objects (bucket_id, name) values ('project-files', $1)`,
      [SEED_BOM_PATH],
    );

    const outsiderObjects = await ctx.asUser(
      OUTSIDER_ID,
      `select * from storage.objects where bucket_id = 'project-files'`,
    );
    expect(outsiderObjects).toHaveLength(0);

    const deletedReferenced = await ctx.asUser(
      OWNER_ID,
      `delete from storage.objects where bucket_id = 'project-files' and name = $1 returning id`,
      [SEED_BOM_PATH],
    );
    expect(deletedReferenced).toHaveLength(0);
  });

  it('creates a multi-product project with independent PCB hardware and software templates', async () => {
    const createdProj = await ctx.asUser<{ id: string; name: string }>(
      OUTSIDER_ID,
      `select * from public.create_project('Smart Motor Drive', 'Multi-board servo controller')`,
    );
    expect(createdProj).toHaveLength(1);
    const newProjectId = createdProj[0]!.id;

    const pcbProduct = await ctx.asUser<Product>(
      OUTSIDER_ID,
      `select * from public.create_product_with_template($1, 'Power Stage PCB', 'PCB-PWR-01', 'hardware', 'GaN inverter board', 'hardware_only')`,
      [newProjectId],
    );
    const fwProduct = await ctx.asUser<Product>(
      OUTSIDER_ID,
      `select * from public.create_product_with_template($1, 'FOC Control Firmware', 'FW-FOC-01', 'software', 'DSP control loop', 'software_only')`,
      [newProjectId],
    );

    expect(pcbProduct[0]!.product_type).toBe('hardware');
    expect(fwProduct[0]!.product_type).toBe('software');

    const pcbCats = await ctx.asUser<{ name: string }>(
      OUTSIDER_ID,
      `select name from public.categories where product_id = $1 order by position asc`,
      [pcbProduct[0]!.id],
    );
    expect(pcbCats.map((c) => c.name)).toEqual([
      'Schematics & PCB',
      'BOM & Fabrication',
      'Assembly & Test',
    ]);

    const fwCats = await ctx.asUser<{ name: string }>(
      OUTSIDER_ID,
      `select name from public.categories where product_id = $1 order by position asc`,
      [fwProduct[0]!.id],
    );
    expect(fwCats.map((c) => c.name)).toEqual([
      'Binaries & Builds',
      'Configuration',
      'Test & Verification',
    ]);
  });

  it('manages project members by email, protects sole owner and enforces project/product archive read-only', async () => {
    await expect(
      ctx.asUser(
        OWNER_ID,
        `update public.project_members set role = 'member' where project_id = $1 and user_id = $2`,
        [SEED_PROJECT_ID, OWNER_ID],
      ),
    ).rejects.toThrow(/Project must retain at least one owner/);

    const added = await ctx.asUser<{ user_id: string; role: string }>(
      OWNER_ID,
      `select * from public.add_project_member_by_email($1, 'outsider@revlog.local', 'viewer')`,
      [SEED_PROJECT_ID],
    );
    expect(added[0]!.user_id).toBe(OUTSIDER_ID);

    await ctx.asUser(
      OWNER_ID,
      `delete from public.project_members where project_id = $1 and user_id = $2`,
      [SEED_PROJECT_ID, OUTSIDER_ID],
    );

    // Archive individual product -> blocks adding releases to that product while project remains active
    await ctx.asUser(OWNER_ID, `update public.products set archived = true where id = $1`, [
      SEED_PRODUCT_SENSOR_ID,
    ]);

    await expect(
      ctx.asUser(
        MEMBER_ID,
        `insert into public.releases (project_id, product_id, version_label) values ($1, $2, 'Blocked-Product-Archived')`,
        [SEED_PROJECT_ID, SEED_PRODUCT_SENSOR_ID],
      ),
    ).rejects.toThrow(/row-level security/);

    await ctx.asUser(OWNER_ID, `update public.products set archived = false where id = $1`, [
      SEED_PRODUCT_SENSOR_ID,
    ]);
  });
});
