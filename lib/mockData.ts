import { Client, CompanySettings, Invoice, MonthlyCreditUsage } from './types';

export const defaultCompanySettings: CompanySettings = {
  company_name: 'NEWRISE TECHNOSYS PVT LTD',
  subtitle: 'From India To The World',
  address_line1: 'FOURTH FLOOR, BLOCK 1, PACIFIC BUSINESS',
  address_line2: 'CENTRE, HOSHANAGABAD ROAD, BEHIND D MART',
  address_line3: 'Bawaria Kalan',
  city_state_pin: 'Bhopal, Madhya Pradesh, 462026',
  gstin: '23AAECN8171A1ZT',
  state_name: 'Madhya Pradesh',
  state_code: '23',
  pan: 'AAECN8171A',
  bank_holder_name: 'NEWRISE TECHNOSYS PVT LTD',
  bank_name: 'ICICI Bank - 447',
  account_no: '119305000447',
  branch_ifsc: 'ICIC0001192',
  swift_code: 'ICICINBBXXX',
  default_hsn: '998314',
  default_rate: 0.365,
  voucher_prefix: 'NRT/PI/',
  current_voucher_seq: 242,
};

// Demo/sample records were removed from the production bundle. New databases
// now start empty and only show real records fetched from the API/database.
export const initialClients: Client[] = [];
export const initialInvoices: Invoice[] = [];
export const initialMonthlyUsage: MonthlyCreditUsage[] = [];
