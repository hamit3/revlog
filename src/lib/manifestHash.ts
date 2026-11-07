import type { ItemKind } from '../types/database';
import { sha256HexFromString } from './sha256';

export interface ManifestItemInput {
  category_name: string;
  category_position: number;
  title: string;
  kind: ItemKind;
  version_label: string | null | undefined;
  file_name?: string | null;
  file_size?: number | null;
  sha256?: string | null;
  url?: string | null;
}

export interface CanonicalManifestItem {
  category_name: string;
  category_position: number;
  file_name: string | null;
  file_size: number | null;
  kind: ItemKind;
  sha256: string | null;
  title: string;
  url: string | null;
  version_label: string;
}

export interface ProjectReleaseManifestInput {
  product_code?: string | null;
  product_id: string;
  product_name: string;
  product_position: number;
  release_id: string;
  release_manifest_hash: string;
  release_version_label: string;
}

export interface CanonicalProjectReleaseProduct {
  product_code: string | null;
  product_id: string;
  product_name: string;
  product_position: number;
  release_id: string;
  release_manifest_hash: string;
  release_version_label: string;
}

/**
 * Compares two strings strictly by Unicode code point order,
 * matching PostgreSQL UTF-8 COLLATE "C" ordering.
 */
export function compareCodePoints(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  const aPoints = Array.from(a);
  const bPoints = Array.from(b);
  const minLen = Math.min(aPoints.length, bPoints.length);
  for (let i = 0; i < minLen; i += 1) {
    const cpA = aPoints[i]!.codePointAt(0) ?? 0;
    const cpB = bPoints[i]!.codePointAt(0) ?? 0;
    if (cpA !== cpB) {
      return cpA < cpB ? -1 : 1;
    }
  }
  return aPoints.length < bPoints.length ? -1 : 1;
}

export function canonicalizeManifestItems(
  items: readonly ManifestItemInput[],
): CanonicalManifestItem[] {
  const normalized: CanonicalManifestItem[] = items.map((item) => ({
    category_name: item.category_name,
    category_position: Number(item.category_position),
    file_name: item.file_name ?? null,
    file_size:
      item.file_size === null || item.file_size === undefined ? null : Number(item.file_size),
    kind: item.kind,
    sha256: item.sha256 ?? null,
    title: item.title,
    url: item.url ?? null,
    version_label: item.version_label ?? '',
  }));

  return normalized.sort((left, right) => {
    if (left.category_position !== right.category_position) {
      return left.category_position - right.category_position;
    }

    const titleDiff = compareCodePoints(left.title, right.title);
    if (titleDiff !== 0) {
      return titleDiff;
    }

    const kindDiff = compareCodePoints(left.kind, right.kind);
    if (kindDiff !== 0) {
      return kindDiff;
    }

    const versionDiff = compareCodePoints(left.version_label, right.version_label);
    if (versionDiff !== 0) {
      return versionDiff;
    }

    const leftArtifactKey = left.kind === 'file' ? (left.sha256 ?? '') : (left.url ?? '');
    const rightArtifactKey = right.kind === 'file' ? (right.sha256 ?? '') : (right.url ?? '');
    return compareCodePoints(leftArtifactKey, rightArtifactKey);
  });
}

export function serializeCanonicalManifest(items: readonly ManifestItemInput[]): string {
  const canonical = canonicalizeManifestItems(items);
  return JSON.stringify(canonical);
}

export async function computeManifestHash(items: readonly ManifestItemInput[]): Promise<string> {
  const json = serializeCanonicalManifest(items);
  return sha256HexFromString(json);
}

export function canonicalizeProjectReleaseProducts(
  entries: readonly ProjectReleaseManifestInput[],
): CanonicalProjectReleaseProduct[] {
  const normalized: CanonicalProjectReleaseProduct[] = entries.map((entry) => ({
    product_code: entry.product_code ?? null,
    product_id: entry.product_id,
    product_name: entry.product_name,
    product_position: Number(entry.product_position),
    release_id: entry.release_id,
    release_manifest_hash: entry.release_manifest_hash,
    release_version_label: entry.release_version_label,
  }));

  return normalized.sort((left, right) => {
    if (left.product_position !== right.product_position) {
      return left.product_position - right.product_position;
    }

    const nameDiff = compareCodePoints(left.product_name, right.product_name);
    if (nameDiff !== 0) {
      return nameDiff;
    }

    return compareCodePoints(left.product_id, right.product_id);
  });
}

export function serializeCanonicalProjectReleaseManifest(
  entries: readonly ProjectReleaseManifestInput[],
): string {
  const canonical = canonicalizeProjectReleaseProducts(entries);
  return JSON.stringify(canonical);
}

export async function computeProjectReleaseManifestHash(
  entries: readonly ProjectReleaseManifestInput[],
): Promise<string> {
  const json = serializeCanonicalProjectReleaseManifest(entries);
  return sha256HexFromString(json);
}
