import type { User } from '@supabase/supabase-js';
import { createMiddleware } from 'hono/factory';
import { supabaseAdmin } from './supabase';
import { env } from './config';

export type AppEnv = {
  Variables: {
    user: User;
  };
};

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!env.authRequired) {
    await next();
    return;
  }

  const header = c.req.header('Authorization') || c.req.header('authorization');
  const token = header?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  c.set('user', data.user);
  await next();
});
