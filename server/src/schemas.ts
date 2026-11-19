import { z } from 'zod';

export const TaxModeSchema = z.enum(['CGST_SGST', 'IGST']);

export const InvoiceItemSchema = z.looseObject({
  id: z.string().optional(),
  sl_no: z.coerce.number().int().positive().optional(),
  service_title: z.string().min(1, 'service_title is required'),
  service_description: z.string().optional().default(''),
  hsn_sac: z.string().optional().default(''),
  due_on: z.string().optional().default(''),
  quantity: z.coerce.number().nonnegative(),
  rate: z.coerce.number().nonnegative(),
  per: z.string().optional().default('NOS'),
  amount: z.coerce.number().optional(),
});

export const InvoiceSchema = z.looseObject({
  id: z.string().optional(),
  voucher_no: z.string().optional(),
  invoice_type: z.enum(['Proforma Invoice', 'Tax Invoice']).default('Proforma Invoice'),
  invoice_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'invoice_date must use YYYY-MM-DD'),
  formatted_date: z.string().optional(),
  due_date: z.string().optional(),
  mode_terms_of_payment: z.string().optional().default(''),
  buyer_order_no: z.string().optional().default(''),
  other_references: z.string().optional().default(''),
  dispatched_through: z.string().optional().default(''),
  destination: z.string().optional().default(''),
  terms_of_delivery: z.string().optional().default(''),
  client_id: z.string().nullish(),
  buyer_name: z.string().min(1, 'buyer_name is required'),
  buyer_address: z.string().optional().default(''),
  buyer_state_name: z.string().min(1, 'buyer_state_name is required'),
  buyer_state_code: z.string().min(1, 'buyer_state_code is required'),
  buyer_gstin: z.string().optional().default(''),
  tax_mode: TaxModeSchema,
  items: z.array(InvoiceItemSchema).min(1, 'At least one line item is required'),
  status: z.enum(['Draft', 'Sent', 'Paid', 'Cancelled']).default('Sent'),
  billing_month: z.string().optional(),
  created_at: z.string().optional(),
});

export const ClientSchema = z.looseObject({
  id: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  business_name: z.string().nullish(),
  address: z.string().optional().default(''),
  state_name: z.string().min(1, 'state_name is required').default('Madhya Pradesh'),
  state_code: z.string().min(1, 'state_code is required').default('23'),
  gstin: z.string().optional().default(''),
  email: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  reference_category: z.string().optional().default('General'),
  default_rate: z.coerce.number().nonnegative().optional().default(0.365),
  default_tax_mode: TaxModeSchema.optional().default('CGST_SGST'),
  created_at: z.string().optional(),
});

export const MonthlyUsageSchema = z.looseObject({
  id: z.string().optional(),
  client_id: z.string().nullish(),
  client_name: z.string().min(1, 'client_name is required'),
  month: z.string().min(1, 'month is required'),
  year: z.coerce.number().int().min(2000).max(2100),
  utility_credits: z.coerce.number().nonnegative().optional().default(0),
  marketing_credits: z.coerce.number().nonnegative().optional().default(0),
  service_credits: z.coerce.number().nonnegative().optional().default(0),
  auth_credits: z.coerce.number().nonnegative().optional().default(0),
  total_credits: z.coerce.number().nonnegative(),
  rate_applied: z.coerce.number().nonnegative().optional().default(0.365),
  billed_amount: z.coerce.number().nonnegative().optional().default(0),
  tax_mode: TaxModeSchema.optional().default('CGST_SGST'),
  billed: z.boolean().optional().default(false),
  invoice_voucher_no: z.string().optional(),
  invoice_id: z.string().optional(),
  due_date: z.string().optional(),
  updated_at: z.string().optional(),
});

export const CompanySettingsSchema = z.looseObject({
  id: z.string().optional(),
  company_name: z.string().min(1, 'company_name is required'),
  subtitle: z.string().optional().default(''),
  address_line1: z.string().optional().default(''),
  address_line2: z.string().optional().default(''),
  address_line3: z.string().optional().default(''),
  city_state_pin: z.string().optional().default(''),
  gstin: z.string().optional().default(''),
  state_name: z.string().optional().default('Madhya Pradesh'),
  state_code: z.string().optional().default('23'),
  pan: z.string().optional().default(''),
  bank_holder_name: z.string().optional().default(''),
  bank_name: z.string().optional().default(''),
  account_no: z.string().optional().default(''),
  branch_ifsc: z.string().optional().default(''),
  swift_code: z.string().optional().default(''),
  default_hsn: z.string().optional().default('998314'),
  default_rate: z.coerce.number().nonnegative().optional().default(0.365),
  voucher_prefix: z.string().optional().default('NRT/PI/26-27/'),
  current_voucher_seq: z.coerce.number().int().nonnegative().optional().default(242),
});

export type InvoiceInput = z.infer<typeof InvoiceSchema>;
export type ClientInput = z.infer<typeof ClientSchema>;
export type MonthlyUsageInput = z.infer<typeof MonthlyUsageSchema>;
export type CompanySettingsInput = z.infer<typeof CompanySettingsSchema>;
