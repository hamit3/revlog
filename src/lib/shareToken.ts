import { sha256HexFromString } from './sha256';

/**
 * Generates a high-entropy cryptographically secure random token (32 bytes = 256 bits)
 * encoded as a 64-character lowercase hexadecimal string.
 */
export function generateShareToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes the canonical SHA-256 hex hash of a share token.
 * Only this hash is stored in the PostgreSQL database.
 */
export async function computeShareTokenHash(token: string): Promise<string> {
  const normalized = token.trim().toLowerCase();
  if (!normalized) {
    throw new Error('Token cannot be empty.');
  }
  return sha256HexFromString(normalized);
}

/**
 * Constructs a full public share URL from a raw token.
 */
export function buildShareUrl(token: string, origin?: string): string {
  const base =
    origin?.replace(/\/+$/, '') ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin.replace(/\/+$/, '')
      : '');
  return `${base}/share/${encodeURIComponent(token.trim())}`;
}

