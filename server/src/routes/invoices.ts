import { Hono } from 'hono';
import { supabaseAdmin } from '../supabase';
import { InvoiceSchema, type InvoiceInput } from '../schemas';
import { normalizeInvoice } from '../normalize';
import { fail } from '../errors';
import type { AppEnv } from '../auth';

export const invoices = new Hono<AppEnv>();

invoices.get('/', async (c) => {
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return fail(c, error);
  return c.json({ success: true, data: data ?? [] });
});

invoices.post('/', async (c) => {
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
    const parsed = InvoiceSchema.safeParse(inputRows[index]);
    if (!parsed.success) {
      return c.json(
        { success: false, error: `Invalid invoice at index ${index}`, issues: parsed.error.issues },
        400
      );
    }
    rows.push(normalizeInvoice(parsed.data as InvoiceInput));
  }

  if (rows.length === 0) {
    return c.json({ success: false, error: 'No invoices supplied' }, 400);
  }

  // Totals and amount-in-words are recomputed above; voucher_no is optionally
  // omitted so the database trigger can assign an atomic sequential number.
  const { data, error } = await supabaseAdmin.from('invoices').upsert(rows).select();

  if (error) return fail(c, error);
  return c.json({ success: true, data: isBatch ? data : data?.[0], count: rows.length });
});
