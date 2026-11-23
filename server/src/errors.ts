import type { Context } from 'hono';
import { env } from './config';

interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

const BAD_REQUEST_CODES = new Set([
  '22P02', // invalid text representation
  '23514', // check constraint
  '23502', // not null
  'PGRST204', // column not found in schema cache
  'PGRST205', // table not found in schema cache
  '42P01', // undefined_table
  '42703', // undefined column
  'PGRST100', // failed to parse query
  'PGRST102', // invalid request body
]);

export function fail(c: Context, error: unknown) {
  const err = (error || {}) as PostgrestLikeError;

  // Log full details server-side only.
  console.error('[api:error]', err.code || '-', err.message || error, err.details || '');

  if (err.code === 'PGRST205' || err.code === '42P01') {
    return c.json({
      success: false,
      error: 'Database tables not initialized. Please run schema.sql in Supabase SQL editor.',
      code: err.code
    }, 503);
  }

  if (err.code === '23505') {
    return c.json({ success: false, error: 'Duplicate record (unique constraint violated)' }, 409);
  }

  if (err.code === '23503') {
    return c.json({ success: false, error: 'Related record does not exist' }, 400);
  }

  if (err.code && BAD_REQUEST_CODES.has(err.code)) {
    return c.json({ success: false, error: 'Invalid data supplied' }, 400);
  }

  const message = env.isProduction ? 'Request failed' : err.message || 'Request failed';
  return c.json({ success: false, error: message }, 500);
}
