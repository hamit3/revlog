import { strToU8, unzipSync, zipSync } from 'fflate';
import { computeManifestHash, type ManifestItemInput } from './manifestHash';
import type { ReleaseItem } from '../types/database';

export interface ReleasePackageFileEntry {
  path: string;
  category: string;
  title: string;
  file_name: string;
  file_size: number | null;
  sha256: string | null;
  version_label: string | null;
}

export interface ReleasePackageLinkEntry {
  category: string;
  title: string;
  url: string;
  version_label: string | null;
}

export interface ReleasePackageManifest {
  version: string;
  date: string;
  publisher: string;
  manifest_hash: string;
  project?: {
    id: string;
    name: string;
  };
  product?: {
    id: string;
    name: string;
    code?: string | null;
  };
  files: ReleasePackageFileEntry[];
  links?: ReleasePackageLinkEntry[];
}

export interface BuildReleasePackageManifestOptions {
  release: {
    id: string;
    version_label: string;
    published_at?: string | null;
    release_date?: string | null;
    manifest_hash: string | null;
  };
  releaseItems: readonly ReleaseItem[];
  publisherName?: string | null;
  project?: {
    id: string;
    name: string;
  } | null;
  product?: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
  skipHashVerification?: boolean;
}

export interface ReleasePackageFilePayload {
  path: string;
  data: Uint8Array | ArrayBuffer;
}

export interface BuildReleasePackageZipOptions {
  manifest: ReleasePackageManifest;
  files: readonly ReleasePackageFilePayload[];
}

/**
 * Sanitizes a category name and file name into a safe, normalized relative path
 * for ZIP archives without directory traversal or unsafe control characters.
 */
export function sanitizeZipRelativePath(categoryName: string, fileName: string): string {
  // Strip path traversal prefixes (e.g. ../ or ..\)
  const baseCategory = categoryName.trim().replace(/^(\.\.[/\\])+/, '');
  const cleanCategory = baseCategory
    .replace(/[/\\]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/[^\w\s.-]/g, '_')
    .trim();

  const baseFileName = fileName.trim().replace(/^(\.\.[/\\])+/, '');
  const cleanFileName = baseFileName
    .replace(/[/\\]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .trim();

  const safeFileName =
    cleanFileName.length > 0 && cleanFileName !== '_' ? cleanFileName : 'file.bin';

  if (!cleanCategory || cleanCategory === '_') {
    return safeFileName;
  }

  return `${cleanCategory}/${safeFileName}`;
}

/**
 * Maps release items to unique, collision-free safe relative ZIP paths.
 */
export function mapReleaseItemsToZipPaths(
  releaseItems: readonly ReleaseItem[],
): Map<string, string> {
  const usedPaths = new Set<string>();
  const pathMap = new Map<string, string>();

  for (const item of releaseItems) {
    if (item.kind !== 'file' || !item.file_name) {
      continue;
    }
    const category = item.category_name?.trim() || 'General';
    const basePath = sanitizeZipRelativePath(category, item.file_name);
    let targetPath = basePath;
    let counter = 2;

    while (usedPaths.has(targetPath.toLowerCase())) {
      const extIndex = basePath.lastIndexOf('.');
      if (extIndex > 0) {
        targetPath = `${basePath.substring(0, extIndex)}_${counter}${basePath.substring(extIndex)}`;
      } else {
        targetPath = `${basePath}_${counter}`;
      }
      counter += 1;
    }

    usedPaths.add(targetPath.toLowerCase());
    pathMap.set(item.id, targetPath);
  }

  return pathMap;
}

/**
 * Validates that release items match the stored manifest hash,
 * and constructs the release package manifest.json payload.
 */
export async function buildReleasePackageManifest({
  release,
  releaseItems,
  publisherName,
  project,
  product,
  skipHashVerification = false,
}: BuildReleasePackageManifestOptions): Promise<ReleasePackageManifest> {
  if (!release.version_label) {
    throw new Error('Release version label is required to build a release package.');
  }

  const storedHash = release.manifest_hash?.trim().toLowerCase() ?? '';
  if (!storedHash) {
    throw new Error('Release manifest hash is missing or not yet published.');
  }

  if (!skipHashVerification) {
    const manifestInputs: ManifestItemInput[] = releaseItems.map((item) => ({
      category_name: item.category_name ?? '',
      category_position: Number(item.category_position ?? 0),
      title: item.title ?? '',
      kind: item.kind ?? 'file',
      version_label: item.version_label ?? '',
      file_name: item.file_name ?? null,
      file_size: item.file_size ?? null,
      sha256: item.sha256 ?? null,
      url: item.url ?? null,
    }));

    const computedHash = await computeManifestHash(manifestInputs);
    if (computedHash.toLowerCase() !== storedHash) {
      throw new Error(
        `Manifest hash mismatch: computed hash (${computedHash}) does not match published manifest_hash (${storedHash}).`,
      );
    }
  }

  const pathMap = mapReleaseItemsToZipPaths(releaseItems);
  const files: ReleasePackageFileEntry[] = [];
  const links: ReleasePackageLinkEntry[] = [];

  for (const item of releaseItems) {
    const category = item.category_name?.trim() || 'General';
    const versionLabel = item.version_label ?? null;

    if (item.kind === 'file' && item.file_name) {
      const targetPath = pathMap.get(item.id) ?? sanitizeZipRelativePath(category, item.file_name);

      files.push({
        path: targetPath,
        category,
        title: item.title ?? item.file_name,
        file_name: item.file_name,
        file_size: item.file_size ?? null,
        sha256: item.sha256 ?? null,
        version_label: versionLabel,
      });
    } else if (item.kind === 'link' && item.url) {
      links.push({
        category,
        title: item.title ?? item.url,
        url: item.url,
        version_label: versionLabel,
      });
    }
  }

  const manifest: ReleasePackageManifest = {
    version: release.version_label,
    date: release.published_at || release.release_date || new Date().toISOString(),
    publisher: publisherName?.trim() || 'Unknown',
    manifest_hash: storedHash,
    files,
  };

  if (project) {
    manifest.project = {
      id: project.id,
      name: project.name,
    };
  }

  if (product) {
    manifest.product = {
      id: product.id,
      name: product.name,
      code: product.code ?? null,
    };
  }

  if (links.length > 0) {
    manifest.links = links;
  }

  return manifest;
}

/**
 * Builds an on-demand, in-memory ZIP package containing all binary release files
 * plus manifest.json, without saving anything to persistent storage.
 */
export function buildReleasePackageZip({
  manifest,
  files,
}: BuildReleasePackageZipOptions): Uint8Array {
  const zippable: Record<string, Uint8Array> = {};

  // Add manifest.json formatted as indented JSON
  const manifestJsonString = JSON.stringify(manifest, null, 2);
  zippable['manifest.json'] = strToU8(manifestJsonString);

  // Add files
  for (const file of files) {
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    zippable[file.path] = data;
  }

  return zipSync(zippable, { level: 6 });
}

/**
 * Inspects a generated release package ZIP file in memory,
 * returning decoded entries for testing and client verification.
 */
export function readReleasePackageZip(zipBytes: Uint8Array): {
  entries: Record<string, Uint8Array>;
  manifest: ReleasePackageManifest | null;
} {
  const entries = unzipSync(zipBytes);
  let manifest: ReleasePackageManifest | null = null;

  if (entries['manifest.json']) {
    try {
      const decoder = new TextDecoder();
      const text = decoder.decode(entries['manifest.json']);
      manifest = JSON.parse(text) as ReleasePackageManifest;
    } catch {
      manifest = null;
    }
  }

  return { entries, manifest };
}
