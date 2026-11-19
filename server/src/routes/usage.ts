import { Hono } from 'hono';
import { supabaseAdmin } from '../supabase';
import { MonthlyUsageSchema } from '../schemas';
import { fail } from '../errors';
import type { AppEnv } from '../auth';

export const usage = new Hono<AppEnv>();

usage.get('/', async (c) => {
  const month = c.req.query('month');
  const yearRaw = c.req.query('year');
  const year = yearRaw ? Number(yearRaw) : undefined;

  if (yearRaw && (!Number.isInteger(year) || Number(year) < 2000 || Number(year) > 2100)) {
    return c.json({ success: false, error: 'Invalid year' }, 400);
  }

  let query = supabaseAdmin.from('monthly_credit_usage').select('*');
  if (month) query = query.eq('month', month);
  if (year) query = query.eq('year', year);

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) return fail(c, error);
  return c.json({ success: true, data: data ?? [] });
});

usage.post('/', async (c) => {
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
    const parsed = MonthlyUsageSchema.safeParse(inputRows[index]);
    if (!parsed.success) {
      return c.json(
        { success: false, error: `Invalid usage record at index ${index}`, issues: parsed.error.issues },
        400
      );
    }
    rows.push({
      ...parsed.data,
      id: parsed.data.id || crypto.randomUUID(),
      // Manual/custom clients have no clients row yet; NULL keeps the FK valid.
      client_id: parsed.data.client_id || null,
      updated_at: parsed.data.updated_at || new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    return c.json({ success: false, error: 'No usage records supplied' }, 400);
  }

  const { data, error } = await supabaseAdmin.from('monthly_credit_usage').upsert(rows).select();

  if (error) return fail(c, error);
  return c.json({ success: true, data: isBatch ? data : data?.[0], count: rows.length });
});
