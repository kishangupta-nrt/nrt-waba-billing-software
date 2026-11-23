import { supabaseAdmin } from './supabase';

/**
 * Best-effort audit trail for reason-bearing actions. A failure here must
 * never fail, block, or delay the primary operation, so every error path is
 * swallowed and the insert result is inspected rather than thrown.
 */
export async function logAudit(
  action: string,
  entityType: 'invoice' | 'usage',
  entityId: string,
  reason?: string | null,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('billing_audit_log').insert({
      id: crypto.randomUUID(),
      action,
      entity_type: entityType,
      entity_id: entityId,
      reason: reason || null,
      details,
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[audit] failed to record', action, entityId, error.message);
    }
  } catch (error) {
    console.error('[audit] unexpected error recording', action, entityId, error);
  }
}
