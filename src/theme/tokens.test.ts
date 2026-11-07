import { describe, expect, it } from 'vitest';
import { tokens, antdTheme } from './tokens';
import { translateText } from '../providers/i18nProvider';
import { assertPublicAnonKey, readAppEnv } from '../lib/env';
import { canPerformProjectAction } from '../providers/accessControlProvider';

function buildUnsignedJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('Phase 1 skeleton verification', () => {
  it('uses specified light theme palette and modern 6px radius without pure black or wireframe mode', () => {
    expect(tokens.colors.background).toBe('#FAFAF9');
    expect(tokens.colors.surface).toBe('#FFFFFF');
    expect(tokens.colors.textPrimary).toBe('#1F2328');
    expect(tokens.colors.textSecondary).toBe('#59636E');
    expect(tokens.colors.border).toBe('#D8DEE4');
    expect(tokens.colors.accent).toBe('#1F5FBF');
    expect(Object.values(tokens.colors)).not.toContain('#000000');
    expect(Object.values(tokens.colors)).not.toContain('#000');
    expect(antdTheme.token?.borderRadius).toBe(6);
    expect(antdTheme.token?.wireframe).toBeUndefined();
  });

  it('defines a strictly monotonic Ant Design v5 heading scale with Inter sans-serif', () => {
    const t = antdTheme.token;
    expect(t?.fontFamily).toContain('Inter');
    expect(t?.fontSize).toBe(13);
    expect(t?.fontSizeSM).toBe(12);
    expect(t?.fontSizeLG).toBe(14);
    expect(t?.fontWeightStrong).toBe(600);
    expect(t?.fontSizeHeading1).toBeGreaterThan(t?.fontSizeHeading2 ?? 0);
    expect(t?.fontSizeHeading2).toBeGreaterThan(t?.fontSizeHeading3 ?? 0);
    expect(t?.fontSizeHeading3).toBeGreaterThan(t?.fontSizeHeading4 ?? 0);
    expect(t?.fontSizeHeading4).toBeGreaterThan(t?.fontSizeHeading5 ?? 0);
  });

  it('resolves and interpolates translation strings from en.json', () => {
    expect(translateText('app.name')).toBe('RevLog');
    expect(
      translateText('projects.latestReleaseSummary', {
        version: 'Rev C',
        date: '12 Nov 2026',
      }),
    ).toBe('Latest project release: Rev C, 12 Nov 2026');
    expect(
      translateText('products.latestReleaseSummary', {
        version: '1.2.0',
        date: '12 Nov 2026',
      }),
    ).toBe('Latest product release: 1.2.0, 12 Nov 2026');
  });

  it('rejects service_role and sb_secret_ keys in client environment configuration', () => {
    const anonJwt = buildUnsignedJwt({ role: 'anon' });
    const serviceJwt = buildUnsignedJwt({ role: 'service_role' });

    expect(() => assertPublicAnonKey(anonJwt)).not.toThrow();
    expect(() => assertPublicAnonKey('sb_publishable_demo_key')).not.toThrow();
    expect(() => assertPublicAnonKey(serviceJwt)).toThrow(/service_role/);
    expect(() => assertPublicAnonKey('sb_secret_demo_key')).toThrow(/sb_secret_/);

    const parsed = readAppEnv({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: anonJwt,
      VITE_MAX_UPLOAD_MB: '25',
    });
    expect(parsed.isConfigured).toBe(true);
    expect(parsed.maxUploadMb).toBe(25);
    expect(parsed.maxUploadBytes).toBe(25 * 1024 * 1024);
  });

  it('enforces role matrix in accessControlProvider helper', () => {
    expect(canPerformProjectAction('viewer', 'items', 'show')).toBe(true);
    expect(canPerformProjectAction('viewer', 'items', 'create')).toBe(false);
    expect(canPerformProjectAction('member', 'items', 'create')).toBe(true);
    expect(canPerformProjectAction('member', 'categories', 'edit')).toBe(false);
    expect(canPerformProjectAction('owner', 'categories', 'edit')).toBe(true);
    expect(canPerformProjectAction('viewer', 'products', 'show')).toBe(true);
    expect(canPerformProjectAction('member', 'products', 'create')).toBe(false);
    expect(canPerformProjectAction('owner', 'products', 'create')).toBe(true);
    expect(canPerformProjectAction('viewer', 'project_releases', 'create')).toBe(false);
    expect(canPerformProjectAction('member', 'project_releases', 'create')).toBe(true);
  });
});
