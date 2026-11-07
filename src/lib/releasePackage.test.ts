import { describe, expect, it } from 'vitest';
import { computeManifestHash } from './manifestHash';
import {
  buildReleasePackageManifest,
  buildReleasePackageZip,
  readReleasePackageZip,
  sanitizeZipRelativePath,
} from './releasePackage';
import type { ReleaseItem } from '../types/database';

describe('releasePackage', () => {
  describe('sanitizeZipRelativePath', () => {
    it('normalizes clean paths correctly', () => {
      expect(sanitizeZipRelativePath('Schematics', 'main_board.pdf')).toBe(
        'Schematics/main_board.pdf',
      );
      expect(sanitizeZipRelativePath('Firmware', 'firmware-v1.0.hex')).toBe(
        'Firmware/firmware-v1.0.hex',
      );
    });

    it('neutralizes path traversal attempts', () => {
      expect(sanitizeZipRelativePath('../../etc', 'passwd')).toBe('etc/passwd');
      expect(sanitizeZipRelativePath('docs', '../../boot.bin')).toBe('docs/boot.bin');
      expect(sanitizeZipRelativePath('..', '..')).toBe('file.bin');
    });

    it('falls back when category is empty', () => {
      expect(sanitizeZipRelativePath('', 'readme.txt')).toBe('readme.txt');
      expect(sanitizeZipRelativePath('   ', 'archive.tar.gz')).toBe('archive.tar.gz');
    });
  });

  describe('buildReleasePackageManifest & manifest_hash parity', () => {
    const sampleItems: ReleaseItem[] = [
      {
        id: 'item-1',
        release_id: 'rel-1',
        item_id: 'orig-1',
        category_name: 'Schematics',
        category_position: 10,
        title: 'Motherboard Schematic',
        kind: 'file',
        file_name: 'main_board.kicad_sch',
        file_size: 4096,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        url: null,
        storage_path: 'proj-1/uuid/main_board.kicad_sch',
        version_label: 'v1.0',
        created_at: '2026-11-07T12:00:00Z',
      },
      {
        id: 'item-2',
        release_id: 'rel-1',
        item_id: 'orig-2',
        category_name: 'Firmware',
        category_position: 20,
        title: 'Sensor Firmware Binary',
        kind: 'file',
        file_name: 'firmware.bin',
        file_size: 16384,
        sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        url: null,
        storage_path: 'proj-1/uuid/firmware.bin',
        version_label: 'v1.0',
        created_at: '2026-11-07T12:00:00Z',
      },
      {
        id: 'item-3',
        release_id: 'rel-1',
        item_id: 'orig-3',
        category_name: 'Docs',
        category_position: 30,
        title: 'Datasheet Reference',
        kind: 'link',
        file_name: null,
        file_size: null,
        sha256: null,
        url: 'https://example.com/datasheet.pdf',
        storage_path: null,
        version_label: null,
        created_at: '2026-11-07T12:00:00Z',
      },
    ];

    it('builds manifest where manifest_hash equals the stored release manifest_hash', async () => {
      // 1. Calculate canonical manifest hash from the items
      const expectedHash = await computeManifestHash(
        sampleItems.map((ri) => ({
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

      // 2. Build the package manifest
      const manifest = await buildReleasePackageManifest({
        release: {
          id: 'rel-1',
          version_label: 'v1.0.0',
          published_at: '2026-11-07T14:30:00Z',
          manifest_hash: expectedHash,
        },
        releaseItems: sampleItems,
        publisherName: 'Alice Engineer',
        project: { id: 'p1', name: 'Smart Sensor' },
        product: { id: 'prd1', name: 'Sensor Board', code: 'SN-01' },
      });

      // 3. Verify exact requirement: manifest hash must equal stored manifest_hash
      expect(manifest.manifest_hash).toBe(expectedHash);
      expect(manifest.version).toBe('v1.0.0');
      expect(manifest.date).toBe('2026-11-07T14:30:00Z');
      expect(manifest.publisher).toBe('Alice Engineer');
      expect(manifest.files).toHaveLength(2);
      expect(manifest.files[0]).toEqual({
        path: 'Schematics/main_board.kicad_sch',
        category: 'Schematics',
        title: 'Motherboard Schematic',
        file_name: 'main_board.kicad_sch',
        file_size: 4096,
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        version_label: 'v1.0',
      });
      expect(manifest.files[1]).toEqual({
        path: 'Firmware/firmware.bin',
        category: 'Firmware',
        title: 'Sensor Firmware Binary',
        file_name: 'firmware.bin',
        file_size: 16384,
        sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        version_label: 'v1.0',
      });
      expect(manifest.links).toHaveLength(1);
      expect(manifest.links?.[0]?.url).toBe('https://example.com/datasheet.pdf');
    });

    it('rejects manifest creation when release items do not match published manifest_hash', async () => {
      await expect(
        buildReleasePackageManifest({
          release: {
            id: 'rel-1',
            version_label: 'v1.0.0',
            published_at: '2026-11-07T14:30:00Z',
            manifest_hash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          },
          releaseItems: sampleItems,
          publisherName: 'Alice Engineer',
        }),
      ).rejects.toThrow(/Manifest hash mismatch/);
    });

    it('resolves duplicate file names within the same category without path collisions', async () => {
      const itemsWithDuplicateNames: ReleaseItem[] = [
        {
          id: 'item-a',
          release_id: 'rel-1',
          item_id: 'orig-a',
          category_name: 'Docs',
          category_position: 1,
          title: 'First Spec',
          kind: 'file',
          file_name: 'spec.pdf',
          file_size: 100,
          sha256: '1111111111111111111111111111111111111111111111111111111111111111',
          url: null,
          storage_path: 'p/1/spec.pdf',
          version_label: null,
          created_at: '2026-11-07T12:00:00Z',
        },
        {
          id: 'item-b',
          release_id: 'rel-1',
          item_id: 'orig-b',
          category_name: 'Docs',
          category_position: 1,
          title: 'Second Spec',
          kind: 'file',
          file_name: 'spec.pdf',
          file_size: 200,
          sha256: '2222222222222222222222222222222222222222222222222222222222222222',
          url: null,
          storage_path: 'p/2/spec.pdf',
          version_label: null,
          created_at: '2026-11-07T12:00:00Z',
        },
      ];

      const hash = await computeManifestHash(
        itemsWithDuplicateNames.map((ri) => ({
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

      const manifest = await buildReleasePackageManifest({
        release: {
          id: 'rel-1',
          version_label: 'v1.0.0',
          manifest_hash: hash,
        },
        releaseItems: itemsWithDuplicateNames,
      });

      expect(manifest.files.map((f) => f.path)).toEqual(['Docs/spec.pdf', 'Docs/spec_2.pdf']);
    });
  });

  describe('buildReleasePackageZip & readReleasePackageZip', () => {
    it('produces a complete in-memory zip archive with files and manifest.json', async () => {
      const manifest = {
        version: 'v2.1.0',
        date: '2026-11-07T15:00:00Z',
        publisher: 'Bob Hardware',
        manifest_hash: '3333333333333333333333333333333333333333333333333333333333333333',
        files: [
          {
            path: 'Hardware/schematic.pdf',
            category: 'Hardware',
            title: 'Schematic',
            file_name: 'schematic.pdf',
            file_size: 11,
            sha256: null,
            version_label: 'A1',
          },
          {
            path: 'Firmware/fw.bin',
            category: 'Firmware',
            title: 'Firmware',
            file_name: 'fw.bin',
            file_size: 8,
            sha256: null,
            version_label: null,
          },
        ],
      };

      const textEncoder = new TextEncoder();
      const schematicData = textEncoder.encode('%PDF-sample');
      const fwData = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04]);

      // Build zip on demand
      const zipBytes = buildReleasePackageZip({
        manifest,
        files: [
          { path: 'Hardware/schematic.pdf', data: schematicData },
          { path: 'Firmware/fw.bin', data: fwData },
        ],
      });

      expect(zipBytes).toBeInstanceOf(Uint8Array);
      expect(zipBytes.byteLength).toBeGreaterThan(0);

      // Read back the zip entries
      const { entries, manifest: decodedManifest } = readReleasePackageZip(zipBytes);

      expect(Object.keys(entries).sort()).toEqual([
        'Firmware/fw.bin',
        'Hardware/schematic.pdf',
        'manifest.json',
      ]);

      expect(decodedManifest).toEqual(manifest);
      expect(decodedManifest?.manifest_hash).toBe(manifest.manifest_hash);

      // Verify file data fidelity
      const decoder = new TextDecoder();
      expect(decoder.decode(entries['Hardware/schematic.pdf'])).toBe('%PDF-sample');
      expect(Array.from(entries['Firmware/fw.bin']!)).toEqual([
        0xde, 0xad, 0xbe, 0xef, 0x01, 0x02, 0x03, 0x04,
      ]);
    });

    it('handles release with only link items producing manifest.json', async () => {
      const linkOnlyItems: ReleaseItem[] = [
        {
          id: 'item-link',
          release_id: 'rel-link',
          item_id: 'orig-link',
          category_name: 'Links',
          category_position: 1,
          title: 'Docs Portal',
          kind: 'link',
          file_name: null,
          file_size: null,
          sha256: null,
          url: 'https://docs.example.com',
          storage_path: null,
          version_label: null,
          created_at: '2026-11-07T12:00:00Z',
        },
      ];

      const hash = await computeManifestHash(
        linkOnlyItems.map((ri) => ({
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

      const manifest = await buildReleasePackageManifest({
        release: {
          id: 'rel-link',
          version_label: 'v1.0.0',
          manifest_hash: hash,
        },
        releaseItems: linkOnlyItems,
      });

      expect(manifest.files).toHaveLength(0);
      expect(manifest.links).toHaveLength(1);

      const zipBytes = buildReleasePackageZip({
        manifest,
        files: [],
      });

      const { entries, manifest: decodedManifest } = readReleasePackageZip(zipBytes);
      expect(Object.keys(entries)).toEqual(['manifest.json']);
      expect(decodedManifest?.manifest_hash).toBe(hash);
    });
  });
});
