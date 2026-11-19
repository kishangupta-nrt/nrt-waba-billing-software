import type { Context } from 'hono';
import { env } from './config';

interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string;
}

export function fail(c: Context, error: unknown) {
  const err = (error || {}) as PostgrestLikeError;

  // Log full details server-side only.
  console.error('[api:error]', err.code || '-', err.message || error, err.details || '');

  if (err.code === '23505') {
    return c.json({ success: false, error: 'Duplicate record (unique constraint violated)' }, 409);
  }

  if (err.code === '23503') {
    return c.json({ success: false, error: 'Related record does not exist' }, 400);
  }

  const message = env.isProduction ? 'Request failed' : err.message || 'Request failed';
  return c.json({ success: false, error: message }, 500);
}
