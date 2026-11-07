import { createClient } from '@refinedev/supabase';
import { appEnv } from '../lib/env';

export const supabaseClient = createClient(appEnv.supabaseUrl, appEnv.supabaseAnonKey, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
