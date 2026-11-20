import type { User } from '@supabase/supabase-js';
import { createMiddleware } from 'hono/factory';
import { supabaseAdmin } from './supabase';
import { env } from './config';

export type AppEnv = {
  Variables: {
    user: User;
  };
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Auth verification timed out')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

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

  try {
    const { data, error } = await withTimeout(
      supabaseAdmin.auth.getUser(token),
      env.authTimeoutMs
    );

    if (error || !data.user) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    c.set('user', data.user);
  } catch {
    return c.json({ success: false, error: 'Authentication service unavailable' }, 503);
  }

  await next();
});
