const DEFAULT_MAX_UPLOAD_MB = 50;

function decodeJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json =
      typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf-8');
    const payload = JSON.parse(json) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function assertPublicAnonKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed.startsWith('sb_secret_')) {
    throw new Error(
      'Security violation: Supabase secret key (sb_secret_) detected in client configuration. Use only the publishable or anon key.',
    );
  }
  const role = decodeJwtRole(trimmed);
  if (role === 'service_role') {
    throw new Error(
      'Security violation: service_role key detected in client configuration. Use only the Supabase anon key.',
    );
  }
}

export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  maxUploadMb: number;
  maxUploadBytes: number;
  isConfigured: boolean;
}

export function readAppEnv(rawEnv: Record<string, string | undefined> = import.meta.env): AppEnv {
  const supabaseUrl = (rawEnv.VITE_SUPABASE_URL ?? '').trim();
  const supabaseAnonKey = (rawEnv.VITE_SUPABASE_ANON_KEY ?? '').trim();

  if (supabaseAnonKey) {
    assertPublicAnonKey(supabaseAnonKey);
  }

  const parsedMb = Number(rawEnv.VITE_MAX_UPLOAD_MB);
  const maxUploadMb = Number.isFinite(parsedMb) && parsedMb > 0 ? parsedMb : DEFAULT_MAX_UPLOAD_MB;

  const isConfigured =
    Boolean(supabaseUrl) &&
    Boolean(supabaseAnonKey) &&
    supabaseAnonKey !== 'your-supabase-anon-key';

  return {
    supabaseUrl: supabaseUrl || 'http://127.0.0.1:54321',
    supabaseAnonKey: supabaseAnonKey || 'public-anon-placeholder',
    maxUploadMb,
    maxUploadBytes: Math.floor(maxUploadMb * 1024 * 1024),
    isConfigured,
  };
}

export const appEnv = readAppEnv();
