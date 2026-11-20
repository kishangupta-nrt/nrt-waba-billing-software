import { z } from 'zod';
import {
  INDIAN_STATES,
  MONTH_NAMES,
  determineTaxMode,
  isValidDateOnly,
  isValidIfsc,
  isValidStateCode,
  validateGstin,
} from '../../lib/taxUtils';

export const TaxModeSchema = z.enum(['CGST_SGST', 'IGST']);

const stateCodeSchema = z
  .string()
  .trim()
  .refine(isValidStateCode, 'state_code must be a valid GST state code');

const optionalDateSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || isValidDateOnly(value), 'date must be a real YYYY-MM-DD date');

export const InvoiceItemSchema = z
  .object({
    id: z.string().optional(),
    sl_no: z.coerce.number().int().positive().optional(),
    service_title: z.string().trim().min(1, 'service_title is required').max(200),
    service_description: z.string().max(1000).optional().default(''),
    hsn_sac: z.string().trim().max(20).optional().default(''),
    due_on: z.string().max(40).optional().default(''),
    quantity: z.coerce.number().nonnegative().finite(),
    rate: z.coerce.number().nonnegative().finite(),
    per: z.string().trim().max(20).optional().default('NOS'),
    amount: z.coerce.number().nonnegative().optional(),
  })
  .strip();

const gstinSchema = z.string().trim().max(15).optional().default('');

export const InvoiceSchema = z
  .object({
    invoice_type: z.enum(['Proforma Invoice', 'Tax Invoice']).optional().default('Proforma Invoice'),
    invoice_date: z
      .string()
      .trim()
      .refine(isValidDateOnly, 'invoice_date must be a real YYYY-MM-DD date'),
    formatted_date: z.string().max(40).optional(),
    due_date: optionalDateSchema,
    mode_terms_of_payment: z.string().max(500).optional().default(''),
    buyer_order_no: z.string().max(120).optional().default(''),
    other_references: z.string().max(200).optional().default(''),
    dispatched_through: z.string().max(200).optional().default(''),
    destination: z.string().max(200).optional().default(''),
    terms_of_delivery: z.string().max(1000).optional().default(''),
    client_id: z.string().trim().max(120).nullish(),
    buyer_name: z.string().trim().min(1, 'buyer_name is required').max(250),
    buyer_address: z.string().max(1000).optional().default(''),
    buyer_state_name: z.string().trim().min(1, 'buyer_state_name is required').max(100),
    buyer_state_code: stateCodeSchema,
    buyer_gstin: gstinSchema,
    tax_mode: TaxModeSchema,
    items: z.array(InvoiceItemSchema).min(1, 'At least one line item is required').max(50),
    billing_month: z
      .string()
      .trim()
      .regex(/^[A-Z][a-z]+ \d{4}$/, 'billing_month must look like "November 2026"')
      .optional(),
    status: z.enum(['Draft', 'Sent', 'Paid', 'Cancelled']).optional(),
  })
  .strip()
  .superRefine((value, ctx) => {
    if (value.buyer_state_name) {
      const matchingState = INDIAN_STATES.find(
        (state) => state.name.toLowerCase() === value.buyer_state_name.toLowerCase()
      );
      if (!matchingState) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['buyer_state_name'],
          message: 'buyer_state_name is not a recognised GST state/UT name',
        });
      } else if (matchingState.code !== value.buyer_state_code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['buyer_state_code'],
          message: `buyer_state_code does not match ${matchingState.name}`,
        });
      }
    }

    const gstinCheck = validateGstin(value.buyer_gstin || '', value.buyer_state_code);
    if (!gstinCheck.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['buyer_gstin'],
        message: gstinCheck.error || 'Invalid GSTIN',
      });
    }

    const hasPositiveItem = value.items.some((item) => Number(item.quantity) > 0);
    if (!hasPositiveItem) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: 'At least one line item must have a quantity greater than zero',
      });
    }
  });

export const ClientSchema = z
  .object({
    id: z.string().trim().max(120).optional(),
    name: z.string().trim().min(1, 'name is required').max(250),
    business_name: z.string().trim().max(250).nullish(),
    address: z.string().max(1000).optional().default(''),
    state_name: z.string().trim().min(1, 'state_name is required').default('Madhya Pradesh'),
    state_code: stateCodeSchema.default('23'),
    gstin: gstinSchema,
    email: z.string().trim().max(200).optional().default('').refine(
      (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      'email is invalid'
    ),
    phone: z.string().trim().max(30).optional().default('').refine(
      (value) => !value || /^[0-9+\-()\s]{7,30}$/.test(value),
      'phone is invalid'
    ),
    reference_category: z.string().trim().max(120).optional().default('General'),
    default_rate: z.coerce.number().nonnegative().finite().optional().default(0.365),
    default_tax_mode: TaxModeSchema.optional().default('CGST_SGST'),
  })
  .strip()
  .superRefine((value, ctx) => {
    const matchingState = INDIAN_STATES.find(
      (state) => state.name.toLowerCase() === value.state_name.toLowerCase()
    );
    if (!matchingState) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['state_name'],
        message: 'state_name is not a recognised GST state/UT name',
      });
    } else if (matchingState.code !== value.state_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['state_code'],
        message: `state_code does not match ${matchingState.name}`,
      });
    }

    const gstinCheck = validateGstin(value.gstin || '', value.state_code);
    if (!gstinCheck.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gstin'],
        message: gstinCheck.error || 'Invalid GSTIN',
      });
    }
  });

export const MonthlyUsageSchema = z
  .object({
    id: z.string().trim().max(120).optional(),
    client_id: z.string().trim().max(120).nullish(),
    client_name: z.string().trim().min(1, 'client_name is required').max(250),
    month: z.string().trim().refine(
      (value) => MONTH_NAMES.includes(value),
      'month must be a full English month name'
    ),
    year: z.coerce.number().int().min(2000).max(2100),
    utility_credits: z.coerce.number().nonnegative().finite().optional().default(0),
    marketing_credits: z.coerce.number().nonnegative().finite().optional().default(0),
    service_credits: z.coerce.number().nonnegative().finite().optional().default(0),
    auth_credits: z.coerce.number().nonnegative().finite().optional().default(0),
    total_credits: z.coerce.number().nonnegative().finite().optional().default(0),
    rate_applied: z.coerce.number().nonnegative().finite().optional().default(0.365),
    tax_mode: TaxModeSchema.optional().default('CGST_SGST'),
    due_date: optionalDateSchema,
  })
  .strip();

export const CompanySettingsSchema = z
  .object({
    company_name: z.string().trim().min(1, 'company_name is required').max(250),
    subtitle: z.string().max(250).optional().default(''),
    address_line1: z.string().max(500).optional().default(''),
    address_line2: z.string().max(500).optional().default(''),
    address_line3: z.string().max(500).optional().default(''),
    city_state_pin: z.string().max(300).optional().default(''),
    gstin: z.string().trim().max(15).optional().default(''),
    state_name: z.string().trim().max(100).optional().default('Madhya Pradesh'),
    state_code: stateCodeSchema.optional().default('23'),
    pan: z.string().trim().max(10).optional().default('').refine(
      (value) => !value || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value),
      'PAN must be in the format AAAAA9999A'
    ),
    bank_holder_name: z.string().max(250).optional().default(''),
    bank_name: z.string().max(250).optional().default(''),
    account_no: z.string().trim().max(40).optional().default('').refine(
      (value) => !value || /^[0-9]{6,40}$/.test(value),
      'account_no must contain digits only'
    ),
    branch_ifsc: z.string().trim().max(60).optional().default('').refine(
      (value) =>
        !value || value.split(/\s+/).some((token) => isValidIfsc(token)),
      'IFSC code is invalid'
    ),
    swift_code: z.string().trim().max(20).optional().default('').refine(
      (value) => !value || /^[A-Z0-9]{8,11}$/.test(value),
      'SWIFT code is invalid'
    ),
    default_hsn: z.string().trim().max(20).optional().default('998314'),
    default_rate: z.coerce.number().nonnegative().finite().optional().default(0.365),
    voucher_prefix: z.string().trim().min(1).max(60).optional().default('NRT/PI/'),
  })
  .strip()
  .superRefine((value, ctx) => {
    const gstinCheck = validateGstin(value.gstin || '', value.state_code);
    if (!gstinCheck.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gstin'],
        message: gstinCheck.error || 'Invalid GSTIN',
      });
    }
  });

export type InvoiceInput = z.infer<typeof InvoiceSchema>;
export type ClientInput = z.infer<typeof ClientSchema>;
export type MonthlyUsageInput = z.infer<typeof MonthlyUsageSchema>;
export type CompanySettingsInput = z.infer<typeof CompanySettingsSchema>;

export function taxModeMatchesState(
  taxMode: 'CGST_SGST' | 'IGST',
  buyerStateCode: string,
  sellerStateCode: string
): boolean {
  return taxMode === determineTaxMode(buyerStateCode, sellerStateCode);
}
