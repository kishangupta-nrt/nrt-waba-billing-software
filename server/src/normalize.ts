import type { Invoice, InvoiceItem } from '../../lib/types';
import { calculateInvoiceTotals } from '../../lib/taxUtils';
import { numberToIndianWords } from '../../lib/numberToWords';
import type { InvoiceInput } from './schemas';

const round4 = (value: number): number => Number(value.toFixed(4));

/**
 * Recompute every monetary value server-side so a tampered or stale client
 * payload can never persist incorrect totals.
 */
export function normalizeInvoice(input: InvoiceInput): Invoice {
  const items: InvoiceItem[] = input.items.map((item, index) => {
    const quantity = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    return {
      id: item.id || `item_${index + 1}`,
      sl_no: item.sl_no ?? index + 1,
      service_title: item.service_title,
      service_description: item.service_description || '',
      hsn_sac: item.hsn_sac || '',
      due_on: item.due_on || input.formatted_date || input.invoice_date,
      quantity,
      rate,
      per: item.per || 'NOS',
      amount: round4(quantity * rate),
    };
  });

  const totals = calculateInvoiceTotals(items, input.tax_mode);

  return {
    ...input,
    id: input.id || crypto.randomUUID(),
    items,
    subtotal: totals.subtotal,
    cgst_rate: totals.cgstRate,
    cgst_amount: totals.cgstAmount,
    sgst_rate: totals.sgstRate,
    sgst_amount: totals.sgstAmount,
    igst_rate: totals.igstRate,
    igst_amount: totals.igstAmount,
    round_off: totals.roundOff,
    total_amount: totals.totalAmount,
    total_quantity: totals.totalQuantity,
    amount_in_words: numberToIndianWords(totals.totalAmount),
    voucher_no: input.voucher_no || undefined,
    client_id: input.client_id || undefined,
    due_date: input.due_date || undefined,
    billing_month: input.billing_month || undefined,
    status: input.status || 'Sent',
    created_at: input.created_at || undefined,
  } as Invoice;
}
