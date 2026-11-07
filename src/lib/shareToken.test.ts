import { describe, expect, it } from 'vitest';
import { buildShareUrl, computeShareTokenHash, generateShareToken } from './shareToken';

describe('shareToken', () => {
  it('generates high-entropy 64-character lowercase hex tokens', () => {
    const token1 = generateShareToken();
    const token2 = generateShareToken();

    expect(token1).toHaveLength(64);
    expect(token2).toHaveLength(64);
    expect(token1).toMatch(/^[0-9a-f]{64}$/);
    expect(token2).toMatch(/^[0-9a-f]{64}$/);
    expect(token1).not.toBe(token2);
  });

  it('computes deterministic SHA-256 hash of tokens', async () => {
    const token = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
    const hash1 = await computeShareTokenHash(token);
    const hash2 = await computeShareTokenHash(token.toUpperCase());

    expect(hash1).toHaveLength(64);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(token);
  });

  it('throws when hashing an empty token', async () => {
    await expect(computeShareTokenHash('')).rejects.toThrow('Token cannot be empty.');
    await expect(computeShareTokenHash('   ')).rejects.toThrow('Token cannot be empty.');
  });

  it('constructs correct public share URL', () => {
    const token = 'abcdef123456';
    expect(buildShareUrl(token, 'https://app.revlog.dev')).toBe(
      'https://app.revlog.dev/share/abcdef123456',
    );
    expect(buildShareUrl(token, 'https://app.revlog.dev/')).toBe(
      'https://app.revlog.dev/share/abcdef123456',
    );
  });
});
