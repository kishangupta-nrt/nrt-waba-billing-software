import type { Invoice, InvoiceItem } from '../../lib/types';
import { calculateInvoiceTotals, formatDateForDisplay, MONTH_NAMES, parseDateOnly } from '../../lib/taxUtils';
import { numberToIndianWords } from '../../lib/numberToWords';
import type { InvoiceInput } from './schemas';

const round4 = (value: number): number => Number(value.toFixed(4));

export interface InvoiceWriteRow {
  id: string;
  invoice_type: Invoice['invoice_type'];
  invoice_date: string;
  formatted_date: string;
  due_date: string | null;
  mode_terms_of_payment: string;
  buyer_order_no: string;
  other_references: string;
  dispatched_through: string;
  destination: string;
  terms_of_delivery: string;
  client_id: string | null;
  buyer_name: string;
  buyer_address: string;
  buyer_state_name: string;
  buyer_state_code: string;
  buyer_gstin: string | null;
  tax_mode: Invoice['tax_mode'];
  items: InvoiceItem[];
  subtotal: number;
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  round_off: number;
  total_amount: number;
  total_quantity: number;
  amount_in_words: string;
  billing_month: string;
}

function billingMonthFromDate(dateStr: string): string {
  const date = parseDateOnly(dateStr);
  if (!date) return '';
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * Recompute every monetary value server-side and whitelist persisted columns so
 * a tampered or stale client payload can never persist incorrect totals or IDs.
 */
export function normalizeInvoice(input: InvoiceInput, id: string = crypto.randomUUID()): InvoiceWriteRow {
  const formattedDate = formatDateForDisplay(input.invoice_date);

  const items: InvoiceItem[] = input.items.map((item, index) => {
    const quantity = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    return {
      id: item.id || `item_${index + 1}`,
      sl_no: item.sl_no ?? index + 1,
      service_title: item.service_title,
      service_description: item.service_description || '',
      hsn_sac: item.hsn_sac || '',
      due_on: item.due_on || formattedDate,
      quantity,
      rate,
      per: item.per || 'NOS',
      amount: round4(quantity * rate),
    };
  });

  const totals = calculateInvoiceTotals(items, input.tax_mode);

  return {
    id,
    invoice_type: input.invoice_type,
    invoice_date: input.invoice_date,
    formatted_date: formattedDate,
    due_date: input.due_date || null,
    mode_terms_of_payment: input.mode_terms_of_payment || '',
    buyer_order_no: input.buyer_order_no || '',
    other_references: input.other_references || '',
    dispatched_through: input.dispatched_through || '',
    destination: input.destination || '',
    terms_of_delivery: input.terms_of_delivery || '',
    client_id: input.client_id || null,
    buyer_name: input.buyer_name,
    buyer_address: input.buyer_address || '',
    buyer_state_name: input.buyer_state_name,
    buyer_state_code: input.buyer_state_code,
    buyer_gstin: (input.buyer_gstin || '').toUpperCase() || null,
    tax_mode: input.tax_mode,
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
    billing_month: input.billing_month || billingMonthFromDate(input.invoice_date),
  };
}
