export type TaxMode = 'CGST_SGST' | 'IGST';

export interface Client {
  id: string;
  name: string;
  business_name?: string;
  address: string;
  state_name: string;
  state_code: string;
  gstin?: string;
  email?: string;
  phone?: string;
  reference_category?: string; // e.g. Health Clinic, Retail, Tech
  default_rate?: number; // e.g. 0.3650
  default_tax_mode?: TaxMode;
  created_at?: string;
}

export interface CompanySettings {
  id?: string;
  company_name: string;
  subtitle?: string;
  address_line1: string;
  address_line2: string;
  address_line3: string;
  city_state_pin: string;
  gstin: string;
  state_name: string;
  state_code: string;
  pan: string;
  bank_holder_name: string;
  bank_name: string;
  account_no: string;
  branch_ifsc: string;
  swift_code: string;
  default_hsn: string;
  default_rate: number;
  voucher_prefix: string; // e.g. 'NRT/PI/26-27/'
  current_voucher_seq: number;
}

export interface InvoiceItem {
  id: string;
  sl_no: number;
  service_title: string; // "WhatsApp Business API"
  service_description: string; // "Utility Message TILL 31 OCT 2026"
  hsn_sac: string; // "998314"
  due_on: string; // "2-Nov-26"
  quantity: number; // 756.0000
  rate: number; // 0.3650
  per: string; // "NOS"
  amount: number; // 275.9400
}

export interface Invoice {
  id: string;
  voucher_no: string; // "NRT/PI/26-27/00242"
  invoice_type: 'Proforma Invoice' | 'Tax Invoice';
  invoice_date: string; // e.g. "2026-11-02"
  formatted_date?: string; // "2-Nov-26"
  due_date?: string;
  mode_terms_of_payment?: string;
  buyer_order_no?: string; // "NRT/PI/26-27/00242"
  other_references?: string; // "Health Clinic"
  dispatched_through?: string;
  destination?: string;
  terms_of_delivery?: string;
  
  // Buyer Details
  client_id?: string;
  buyer_name: string;
  buyer_address?: string;
  buyer_state_name: string;
  buyer_state_code: string;
  buyer_gstin?: string;
  
  // Tax & Calculations
  tax_mode: TaxMode;
  items: InvoiceItem[];
  subtotal: number;
  
  // Taxes
  cgst_rate?: number; // 9
  cgst_amount?: number; // 24.8346
  sgst_rate?: number; // 9
  sgst_amount?: number; // 24.8346
  igst_rate?: number; // 18
  igst_amount?: number; // 49.6692
  
  round_off: number; // 0.3908
  total_amount: number; // 326.0000
  total_quantity: number; // 756.0000
  amount_in_words: string; // "INR Three Hundred Twenty Six Only"
  
  billing_month?: string; // e.g. "October 2026"
  status: 'Draft' | 'Sent' | 'Paid' | 'Cancelled';
  created_at?: string;
}

export interface MonthlyCreditUsage {
  id: string;
  client_id?: string | null;
  client_name: string;
  month: string; // e.g. "October"
  year: number; // 2026
  utility_credits: number;
  marketing_credits: number;
  service_credits: number;
  auth_credits: number;
  total_credits: number;
  rate_applied: number;
  billed_amount: number;
  tax_mode: TaxMode;
  billed: boolean;
  invoice_voucher_no?: string;
  invoice_id?: string;
  due_date?: string;
  updated_at?: string;
}

export interface BatchLineItem {
  id: string;
  description: string;
  credits: number;
  rate: number;
}

export interface BatchClientRow {
  selected: boolean;
  clientId?: string;
  clientName: string;
  stateName: string;
  stateCode: string;
  gstin: string;
  category: string;
  messageType: string; // fallback / common description
  credits: number;
  rate: number;
  taxMode: TaxMode;
  billingMonth: string;
  dueOn: string;
  voucherNo?: string;
  status?: 'pending' | 'success' | 'error';
  errorMsg?: string;
  items?: BatchLineItem[];
}
