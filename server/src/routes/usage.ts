import { Hono } from 'hono';
import { supabaseAdmin } from '../supabase';
import { DeleteRecordSchema, MonthlyUsageSchema, type MonthlyUsageInput } from '../schemas';
import { fail } from '../errors';
import { logAudit } from '../audit';
import type { AppEnv } from '../auth';

export const usage = new Hono<AppEnv>();

const MAX_BATCH = 100;
const MAX_LIMIT = 500;

function calculateBilledAmount(totalCredits: number, rate: number, taxMode: string): number {
  const subtotal = totalCredits * rate;
  const taxRate = taxMode === 'CGST_SGST' ? 0.18 : 0.18;
  return Number((Math.round(subtotal * (1 + taxRate) * 100) / 100).toFixed(2));
}

usage.get('/', async (c) => {
  const month = c.req.query('month');
  const yearRaw = c.req.query('year');
  const year = yearRaw ? Number(yearRaw) : undefined;
  const limitRaw = Number(c.req.query('limit') ?? 200);
  const offsetRaw = Number(c.req.query('offset') ?? 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_LIMIT) : 200;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.trunc(offsetRaw), 0) : 0;

  if (yearRaw && (!Number.isInteger(year) || Number(year) < 2000 || Number(year) > 2100)) {
    return c.json({ success: false, error: 'Invalid year' }, 400);
  }

  let query = supabaseAdmin.from('monthly_credit_usage').select('*');
  if (month) query = query.eq('month', month);
  if (year) query = query.eq('year', year);

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return fail(c, error);
  return c.json({ success: true, data: data ?? [], limit, offset });
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

  if (inputRows.length === 0 || inputRows.length > MAX_BATCH) {
    return c.json(
      { success: false, error: `Batch must contain between 1 and ${MAX_BATCH} usage records` },
      400
    );
  }

  const parsedRows: MonthlyUsageInput[] = [];
  for (let index = 0; index < inputRows.length; index += 1) {
    const parsed = MonthlyUsageSchema.safeParse(inputRows[index]);
    if (!parsed.success) {
      return c.json(
        { success: false, error: `Invalid usage record at index ${index}`, issues: parsed.error.issues },
        400
      );
    }
    parsedRows.push(parsed.data);
  }

  const needsReason = parsedRows.some(
    (row) =>
      (row.status === 'refused_to_pay' || row.status === 'cancelled') &&
      !row.status_reason
  );
  if (needsReason) {
    return c.json(
      {
        success: false,
        error: 'A reason is required for refused-to-pay or cancelled credit usage records',
      },
      400
    );
  }

  const requestedIds = parsedRows.map((row) => row.id).filter((id): id is string => Boolean(id));
  const existingById = new Map<string, { id: string; invoice_id: string | null; billed: boolean }>();
  if (requestedIds.length > 0) {
    const { data: linked, error: linkedError } = await supabaseAdmin
      .from('monthly_credit_usage')
      .select('id, invoice_id, billed')
      .in('id', requestedIds);

    if (linkedError) return fail(c, linkedError);

    (linked ?? []).forEach((row) => existingById.set(row.id, row));
    const linkedIds = new Set(
      (linked ?? []).filter((row) => row.invoice_id).map((row) => row.id)
    );
    if (linkedIds.size > 0) {
      return c.json(
        {
          success: false,
          error: 'Usage records linked to an invoice cannot be edited directly. Edit the invoice instead.',
          linked_ids: Array.from(linkedIds),
        },
        409
      );
    }
  }

  const now = new Date().toISOString();
  const rows = parsedRows.map((input) => {
    const componentTotal =
      Number(input.utility_credits || 0) +
      Number(input.marketing_credits || 0) +
      Number(input.service_credits || 0) +
      Number(input.auth_credits || 0);
    const totalCredits = componentTotal > 0 ? componentTotal : Number(input.total_credits || 0);

    return {
      id: input.id || crypto.randomUUID(),
      client_id: input.client_id || null,
      client_name: input.client_name,
      month: input.month,
      year: input.year,
      utility_credits: Number(input.utility_credits || 0),
      marketing_credits: Number(input.marketing_credits || 0),
      service_credits: Number(input.service_credits || 0),
      auth_credits: Number(input.auth_credits || 0),
      total_credits: totalCredits,
      rate_applied: Number(input.rate_applied || 0.365),
      billed_amount: calculateBilledAmount(totalCredits, Number(input.rate_applied || 0.365), input.tax_mode),
      tax_mode: input.tax_mode,
      // `billed` describes an existing invoice link and is server-owned; a
      // status change (paid/refused/cancelled) must not flip it back.
      billed: input.id ? Boolean(existingById.get(input.id)?.billed) : false,
      status: input.status || 'pending',
      status_reason: input.status_reason || null,
      payment_proof_url: input.payment_proof_url || null,
      invoice_voucher_no: null,
      invoice_id: null,
      due_date: input.due_date || null,
      updated_at: now,
    };
  });

  const { data, error } = await supabaseAdmin
    .from('monthly_credit_usage')
    .upsert(rows, { onConflict: 'id' })
    .select();

  if (error) return fail(c, error);

  await Promise.all(
    rows
      .filter((row) => ['paid', 'refused_to_pay', 'cancelled'].includes(row.status))
      .map((row) =>
        logAudit('usage_status_changed', 'usage', row.id, row.status_reason || null, {
          status: row.status,
        })
      )
  );

  return c.json({ success: true, data: isBatch ? data : data?.[0], count: rows.length });
});

usage.post('/:id/delete', async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ success: false, error: 'Usage id is required' }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const parsed = DeleteRecordSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: 'A deletion reason is required', issues: parsed.error.issues },
      400
    );
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('monthly_credit_usage')
    .select('id, client_name, invoice_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return fail(c, fetchError);
  if (!existing) return c.json({ success: false, error: 'Usage record not found' }, 404);
  if (existing.invoice_id) {
    return c.json(
      { success: false, error: 'Usage linked to an invoice cannot be deleted' },
      409
    );
  }

  const { error } = await supabaseAdmin.from('monthly_credit_usage').delete().eq('id', id);
  if (error) return fail(c, error);

  await logAudit('usage_deleted', 'usage', id, parsed.data.reason, {
    client_name: existing.client_name,
  });
  return c.json({ success: true, id });
});

// Deletion is intentionally only available through POST /:id/delete, which
// requires a reason, rejects invoice-linked rows, and writes an audit entry.
