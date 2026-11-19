import { Hono } from 'hono';
import { supabaseAdmin } from '../supabase';
import { ClientSchema } from '../schemas';
import { fail } from '../errors';
import type { AppEnv } from '../auth';

export const clients = new Hono<AppEnv>();

clients.get('/', async (c) => {
  const { data, error } = await supabaseAdmin.from('clients').select('*').order('name');

  if (error) return fail(c, error);
  return c.json({ success: true, data: data ?? [] });
});

clients.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const isBatch = Array.isArray(body);
  const inputRows: unknown[] = isBatch ? (body as unknown[]) : [body];
  const rows = [];

  for (let index = 0; index < inputRows.length; index += 1) {
    const parsed = ClientSchema.safeParse(inputRows[index]);
    if (!parsed.success) {
      return c.json(
        { success: false, error: `Invalid client at index ${index}`, issues: parsed.error.issues },
        400
      );
    }
    rows.push({
      ...parsed.data,
      id: parsed.data.id || crypto.randomUUID(),
      created_at: parsed.data.created_at || undefined,
    });
  }

  if (rows.length === 0) {
    return c.json({ success: false, error: 'No clients supplied' }, 400);
  }

  const { data, error } = await supabaseAdmin.from('clients').upsert(rows).select();

  if (error) return fail(c, error);
  return c.json({ success: true, data: isBatch ? data : data?.[0], count: rows.length });
});

clients.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: 'Client id is required' }, 400);

  const { error } = await supabaseAdmin.from('clients').delete().eq('id', id);

  if (error) return fail(c, error);
  return c.json({ success: true, id });
});
