-- SUPABASE SCHEMA FOR WABA BILLING SYSTEM
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- 1. Create company_settings table
CREATE TABLE IF NOT EXISTS company_settings (
  id TEXT PRIMARY KEY DEFAULT 'primary',
  company_name TEXT NOT NULL DEFAULT 'NEWRISE TECHNOSYS PVT LTD',
  subtitle TEXT DEFAULT 'From India To The World',
  address_line1 TEXT NOT NULL DEFAULT 'FOURTH FLOOR, BLOCK 1, PACIFIC BUSINESS',
  address_line2 TEXT NOT NULL DEFAULT 'CENTRE, HOSHANAGABAD ROAD, BEHIND D MART',
  address_line3 TEXT NOT NULL DEFAULT 'Bawaria Kalan',
  city_state_pin TEXT NOT NULL DEFAULT 'Bhopal, Madhya Pradesh, 462026',
  gstin TEXT NOT NULL DEFAULT '23AAECN8171A1ZT',
  state_name TEXT NOT NULL DEFAULT 'Madhya Pradesh',
  state_code TEXT NOT NULL DEFAULT '23',
  pan TEXT NOT NULL DEFAULT 'AAECN8171A',
  bank_holder_name TEXT NOT NULL DEFAULT 'NEWRISE TECHNOSYS PVT LTD',
  bank_name TEXT NOT NULL DEFAULT 'ICICI Bank - 447',
  account_no TEXT NOT NULL DEFAULT '119305000447',
  branch_ifsc TEXT NOT NULL DEFAULT 'M P Nagar Zone 2 & ICIC0001192',
  swift_code TEXT NOT NULL DEFAULT 'ICICINBBXXX',
  default_hsn TEXT NOT NULL DEFAULT '998314',
  default_rate NUMERIC(10, 4) NOT NULL DEFAULT 0.3650,
  voucher_prefix TEXT NOT NULL DEFAULT 'NRT/PI/26-27/',
  current_voucher_seq INT NOT NULL DEFAULT 242,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business_name TEXT,
  address TEXT,
  state_name TEXT NOT NULL DEFAULT 'Madhya Pradesh',
  state_code TEXT NOT NULL DEFAULT '23',
  gstin TEXT,
  email TEXT,
  phone TEXT,
  reference_category TEXT DEFAULT 'General',
  default_rate NUMERIC(10, 4) DEFAULT 0.3650,
  default_tax_mode TEXT DEFAULT 'CGST_SGST' CHECK (default_tax_mode IN ('CGST_SGST', 'IGST')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  voucher_no TEXT UNIQUE NOT NULL,
  invoice_type TEXT NOT NULL DEFAULT 'Proforma Invoice',
  invoice_date DATE NOT NULL,
  formatted_date TEXT,
  due_date DATE,
  mode_terms_of_payment TEXT,
  buyer_order_no TEXT,
  other_references TEXT,
  dispatched_through TEXT,
  destination TEXT,
  terms_of_delivery TEXT,
  
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  buyer_name TEXT NOT NULL,
  buyer_address TEXT,
  buyer_state_name TEXT NOT NULL,
  buyer_state_code TEXT NOT NULL,
  buyer_gstin TEXT,
  
  tax_mode TEXT NOT NULL CHECK (tax_mode IN ('CGST_SGST', 'IGST')),
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(12, 4) NOT NULL,
  
  cgst_rate NUMERIC(5, 2) DEFAULT 9.00,
  cgst_amount NUMERIC(12, 4) DEFAULT 0.0000,
  sgst_rate NUMERIC(5, 2) DEFAULT 9.00,
  sgst_amount NUMERIC(12, 4) DEFAULT 0.0000,
  igst_rate NUMERIC(5, 2) DEFAULT 18.00,
  igst_amount NUMERIC(12, 4) DEFAULT 0.0000,
  
  round_off NUMERIC(8, 4) DEFAULT 0.0000,
  total_amount NUMERIC(12, 4) NOT NULL,
  total_quantity NUMERIC(12, 4) NOT NULL,
  amount_in_words TEXT NOT NULL,
  
  billing_month TEXT,
  status TEXT DEFAULT 'Sent' CHECK (status IN ('Draft', 'Sent', 'Paid', 'Cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create monthly_credit_usage table
CREATE TABLE IF NOT EXISTS monthly_credit_usage (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  month TEXT NOT NULL,
  year INT NOT NULL,
  utility_credits INT DEFAULT 0,
  marketing_credits INT DEFAULT 0,
  service_credits INT DEFAULT 0,
  auth_credits INT DEFAULT 0,
  total_credits INT NOT NULL,
  rate_applied NUMERIC(10, 4) NOT NULL DEFAULT 0.3650,
  billed_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  tax_mode TEXT NOT NULL DEFAULT 'CGST_SGST' CHECK (tax_mode IN ('CGST_SGST', 'IGST')),
  billed BOOLEAN DEFAULT FALSE,
  invoice_voucher_no TEXT,
  invoice_id TEXT,
  due_date TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and create permissive public access policies (for client app anon key)
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_credit_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-write for company_settings" ON company_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for clients" ON clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for invoices" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for monthly_credit_usage" ON monthly_credit_usage FOR ALL USING (true) WITH CHECK (true);

-- Insert Initial Company Settings
INSERT INTO company_settings (id, company_name, gstin, state_name, state_code, pan, current_voucher_seq)
VALUES ('primary', 'NEWRISE TECHNOSYS PVT LTD', '23AAECN8171A1ZT', 'Madhya Pradesh', '23', 'AAECN8171A', 242)
ON CONFLICT (id) DO NOTHING;

-- Insert Dermatology and Beyond sample client
INSERT INTO clients (id, name, address, state_name, state_code, reference_category, default_rate, default_tax_mode)
VALUES ('client_1', 'DERMATOLOGY AND BEYOD', 'Bhopal, Madhya Pradesh', 'Madhya Pradesh', '23', 'Health Clinic', 0.3650, 'CGST_SGST')
ON CONFLICT (id) DO NOTHING;
