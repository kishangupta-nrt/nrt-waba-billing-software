import { createClient } from '@supabase/supabase-js';
import { env } from './config';

// Service-role client: bypasses RLS. It must never reach the browser.
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
