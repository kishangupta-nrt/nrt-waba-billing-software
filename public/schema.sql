-- SUPABASE SCHEMA FOR WABA BILLING SYSTEM
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- This script is idempotent: it can be re-run safely on a new or existing project.
-- Keep public/schema.sql in sync (served to the Settings modal copy button).

-- 1. Company settings ---------------------------------------------------------
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
  branch_ifsc TEXT NOT NULL DEFAULT 'ICIC0001192',
  swift_code TEXT NOT NULL DEFAULT 'ICICINBBXXX',
  default_hsn TEXT NOT NULL DEFAULT '998314',
  default_rate NUMERIC(10, 4) NOT NULL DEFAULT 0.3650,
  voucher_prefix TEXT NOT NULL DEFAULT 'NRT/PI/',
  current_voucher_seq INT NOT NULL DEFAULT 242,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Clients ------------------------------------------------------------------
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

-- 3. Invoices -----------------------------------------------------------------
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
  cancellation_reason TEXT,
  payment_proof_url TEXT,
  payment_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Monthly credit usage -----------------------------------------------------
CREATE TABLE IF NOT EXISTS monthly_credit_usage (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  month TEXT NOT NULL,
  year INT NOT NULL,
  utility_credits NUMERIC(12, 4) DEFAULT 0,
  marketing_credits NUMERIC(12, 4) DEFAULT 0,
  service_credits NUMERIC(12, 4) DEFAULT 0,
  auth_credits NUMERIC(12, 4) DEFAULT 0,
  total_credits NUMERIC(12, 4) NOT NULL,
  rate_applied NUMERIC(10, 4) NOT NULL DEFAULT 0.3650,
  billed_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  tax_mode TEXT NOT NULL DEFAULT 'CGST_SGST' CHECK (tax_mode IN ('CGST_SGST', 'IGST')),
  billed BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'billed', 'paid', 'refused_to_pay', 'cancelled')),
  status_reason TEXT,
  payment_proof_url TEXT,
  invoice_voucher_no TEXT,
  invoice_id TEXT,
  due_date TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4b. Audit trail for reason-bearing actions ----------------------------------
CREATE TABLE IF NOT EXISTS billing_audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Remove duplicate invoice-linked usage rows left by earlier versions before
-- enforcing one usage row per invoice.
WITH ranked AS (
  SELECT ctid,
         ROW_NUMBER() OVER (
           PARTITION BY invoice_id
           ORDER BY updated_at DESC NULLS LAST, id
         ) AS rn
  FROM monthly_credit_usage
  WHERE invoice_id IS NOT NULL
)
DELETE FROM monthly_credit_usage
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_invoice_id_unique
  ON monthly_credit_usage (invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_voucher_no_unique ON invoices (voucher_no);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_usage_month_year ON monthly_credit_usage (month, year);
CREATE INDEX IF NOT EXISTS idx_usage_client_id ON monthly_credit_usage (client_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (name);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON billing_audit_log (entity_type, entity_id);

-- 5. Row Level Security: read-only for authenticated users -------------------
-- The Render backend uses the service-role key (bypasses RLS) for all writes.
-- The browser must never be able to bypass API validation or voucher rules.
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_credit_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated access to company_settings" ON company_settings;
DROP POLICY IF EXISTS "Authenticated access to clients" ON clients;
DROP POLICY IF EXISTS "Authenticated access to invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated access to monthly_credit_usage" ON monthly_credit_usage;
DROP POLICY IF EXISTS "Allow public read-write for company_settings" ON company_settings;
DROP POLICY IF EXISTS "Allow public read-write for clients" ON clients;
DROP POLICY IF EXISTS "Allow public read-write for invoices" ON invoices;
DROP POLICY IF EXISTS "Allow public read-write for monthly_credit_usage" ON monthly_credit_usage;
DROP POLICY IF EXISTS "Allow public all" ON company_settings;
DROP POLICY IF EXISTS "Allow public all" ON clients;
DROP POLICY IF EXISTS "Allow public all" ON invoices;
DROP POLICY IF EXISTS "Allow public all" ON monthly_credit_usage;
DROP POLICY IF EXISTS "Authenticated read company_settings" ON company_settings;
DROP POLICY IF EXISTS "Authenticated read clients" ON clients;
DROP POLICY IF EXISTS "Authenticated read invoices" ON invoices;
DROP POLICY IF EXISTS "Authenticated read monthly_credit_usage" ON monthly_credit_usage;
DROP POLICY IF EXISTS "Authenticated read billing_audit_log" ON billing_audit_log;
DROP POLICY IF EXISTS "Allow public all" ON billing_audit_log;

CREATE POLICY "Authenticated read company_settings"
  ON company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read clients"
  ON clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read invoices"
  ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read monthly_credit_usage"
  ON monthly_credit_usage FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read billing_audit_log"
  ON billing_audit_log FOR SELECT TO authenticated USING (true);

-- 6. Initial company settings (no sample clients or fabricated invoices) -----
INSERT INTO company_settings (id, company_name, gstin, state_name, state_code, pan, voucher_prefix, current_voucher_seq)
VALUES ('primary', 'NEWRISE TECHNOSYS PVT LTD', '23AAECN8171A1ZT', 'Madhya Pradesh', '23', 'AAECN8171A', 'NRT/PI/', 242)
ON CONFLICT (id) DO NOTHING;

-- 7. Voucher numbering: server/database-owned, per financial year ------------
CREATE OR REPLACE FUNCTION get_next_unique_pi_number(p_prefix TEXT DEFAULT 'NRT/PI/')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('invoice_voucher:' || p_prefix));

  SELECT COALESCE(MAX(NULLIF(SUBSTRING(voucher_no FROM '([0-9]+)$'), '')::INT), 242) + 1
  INTO v_seq
  FROM invoices
  WHERE voucher_no LIKE p_prefix || '%';

  RETURN p_prefix || LPAD(v_seq::TEXT, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION assign_invoice_voucher_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base TEXT;
  v_fy_start INT;
  v_fy TEXT;
  v_prefix TEXT;
  v_seq INT;
BEGIN
  -- Existing voucher numbers are preserved on updates; inserts always get a
  -- database-assigned number (client-supplied values are ignored).
  IF TG_OP = 'UPDATE' AND NEW.voucher_no IS NOT NULL AND BTRIM(NEW.voucher_no) <> '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(BTRIM(voucher_prefix), ''), 'NRT/PI/')
  INTO v_base
  FROM company_settings
  WHERE id = 'primary';

  IF v_base IS NULL THEN
    v_base := 'NRT/PI/';
  END IF;

  -- Strip any stored year segment and derive the FY from the invoice date.
  v_base := REGEXP_REPLACE(v_base, '[0-9]{2}-[0-9]{2}/?\s*$', '');
  IF RIGHT(v_base, 1) <> '/' THEN
    v_base := v_base || '/';
  END IF;

  v_fy_start := CASE
    WHEN EXTRACT(MONTH FROM NEW.invoice_date) >= 4
      THEN EXTRACT(YEAR FROM NEW.invoice_date)::INT
    ELSE EXTRACT(YEAR FROM NEW.invoice_date)::INT - 1
  END;
  v_fy := LPAD((v_fy_start % 100)::TEXT, 2, '0') || '-' || LPAD(((v_fy_start + 1) % 100)::TEXT, 2, '0');
  v_prefix := v_base || v_fy || '/';

  PERFORM pg_advisory_xact_lock(hashtext('invoice_voucher:' || v_prefix));

  SELECT COALESCE(MAX(NULLIF(SUBSTRING(voucher_no FROM '([0-9]+)$'), '')::INT), 242) + 1
  INTO v_seq
  FROM invoices
  WHERE voucher_no LIKE v_prefix || '%';

  NEW.voucher_no := v_prefix || LPAD(v_seq::TEXT, 5, '0');

  UPDATE company_settings
  SET current_voucher_seq = GREATEST(COALESCE(current_voucher_seq, 0), v_seq),
      updated_at = NOW()
  WHERE id = 'primary';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_invoice_voucher_no ON invoices;
CREATE TRIGGER trg_assign_invoice_voucher_no
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION assign_invoice_voucher_no();

-- 8. Monthly usage reconciliation --------------------------------------------
-- Every invoice create/update writes exactly one linked usage row. The month
-- and year come from a valid billing_month ("Month YYYY"), otherwise they are
-- derived from invoice_date. Pending manual rows for the same client/month are
-- converted instead of duplicated.
CREATE OR REPLACE FUNCTION sync_invoice_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month TEXT;
  v_year INT;
  v_usage_id TEXT;
  v_rate NUMERIC(10, 4);
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE monthly_credit_usage
    SET invoice_id = NULL,
        invoice_voucher_no = NULL,
        billed = FALSE,
        status = 'pending',
        status_reason = NULL,
        payment_proof_url = NULL,
        updated_at = NOW()
    WHERE invoice_id = OLD.id;
    RETURN OLD;
  END IF;

  -- A cancelled invoice releases its usage row so the account can be billed
  -- again for the same service period without creating a duplicate.
  IF NEW.status = 'Cancelled' THEN
    UPDATE monthly_credit_usage
    SET invoice_id = NULL,
        invoice_voucher_no = NULL,
        billed = FALSE,
        status = 'pending',
        status_reason = NULL,
        payment_proof_url = NULL,
        updated_at = NOW()
    WHERE invoice_id = NEW.id;
    RETURN NEW;
  END IF;

  IF SPLIT_PART(NEW.billing_month, ' ', 1) IN (
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ) AND SPLIT_PART(NEW.billing_month, ' ', 2) ~ '^[0-9]{4}$' THEN
    v_month := SPLIT_PART(NEW.billing_month, ' ', 1);
    v_year := SPLIT_PART(NEW.billing_month, ' ', 2)::INT;
  ELSE
    v_month := CASE EXTRACT(MONTH FROM NEW.invoice_date)
      WHEN 1 THEN 'January'
      WHEN 2 THEN 'February'
      WHEN 3 THEN 'March'
      WHEN 4 THEN 'April'
      WHEN 5 THEN 'May'
      WHEN 6 THEN 'June'
      WHEN 7 THEN 'July'
      WHEN 8 THEN 'August'
      WHEN 9 THEN 'September'
      WHEN 10 THEN 'October'
      WHEN 11 THEN 'November'
      WHEN 12 THEN 'December'
    END;
    v_year := EXTRACT(YEAR FROM NEW.invoice_date)::INT;
  END IF;
  v_rate := CASE
    WHEN NEW.total_quantity > 0 THEN NEW.subtotal / NEW.total_quantity
    ELSE 0.3650
  END;

  SELECT id INTO v_usage_id
  FROM monthly_credit_usage
  WHERE invoice_id = NEW.id
  LIMIT 1;

  IF v_usage_id IS NULL THEN
    SELECT id INTO v_usage_id
    FROM monthly_credit_usage
    WHERE invoice_id IS NULL
      AND billed = FALSE
      AND LOWER(month) = LOWER(v_month)
      AND year = v_year
      AND (
        (NEW.client_id IS NOT NULL AND client_id = NEW.client_id)
        OR LOWER(client_name) = LOWER(NEW.buyer_name)
      )
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_usage_id IS NOT NULL THEN
    UPDATE monthly_credit_usage
    SET client_id = NEW.client_id,
        client_name = NEW.buyer_name,
        month = v_month,
        year = v_year,
        utility_credits = NEW.total_quantity,
        marketing_credits = 0,
        service_credits = 0,
        auth_credits = 0,
        total_credits = NEW.total_quantity,
        rate_applied = ROUND(v_rate, 4),
        billed_amount = NEW.total_amount,
        tax_mode = NEW.tax_mode,
        billed = TRUE,
        status = 'billed',
        status_reason = NULL,
        payment_proof_url = NULL,
        invoice_voucher_no = NEW.voucher_no,
        invoice_id = NEW.id,
        due_date = NEW.due_date,
        updated_at = NOW()
    WHERE id = v_usage_id;
  ELSE
    INSERT INTO monthly_credit_usage (
      id, client_id, client_name, month, year,
      utility_credits, marketing_credits, service_credits, auth_credits,
      total_credits, rate_applied, billed_amount, tax_mode, billed, status,
      invoice_voucher_no, invoice_id, due_date, updated_at
    ) VALUES (
      'usage_' || NEW.id, NEW.client_id, NEW.buyer_name, v_month, v_year,
      NEW.total_quantity, 0, 0, 0,
      NEW.total_quantity, ROUND(v_rate, 4), NEW.total_amount, NEW.tax_mode, TRUE, 'billed',
      NEW.voucher_no, NEW.id, NEW.due_date, NOW()
    )
    ON CONFLICT (invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET
      client_id = EXCLUDED.client_id,
      client_name = EXCLUDED.client_name,
      month = EXCLUDED.month,
      year = EXCLUDED.year,
      utility_credits = EXCLUDED.utility_credits,
      total_credits = EXCLUDED.total_credits,
      rate_applied = EXCLUDED.rate_applied,
      billed_amount = EXCLUDED.billed_amount,
      tax_mode = EXCLUDED.tax_mode,
      billed = TRUE,
      status = 'billed',
      status_reason = NULL,
      payment_proof_url = NULL,
      invoice_voucher_no = EXCLUDED.invoice_voucher_no,
      due_date = EXCLUDED.due_date,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_usage ON invoices;
CREATE TRIGGER trg_sync_invoice_usage
  AFTER INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_usage();

DROP TRIGGER IF EXISTS trg_delete_invoice_usage ON invoices;
CREATE TRIGGER trg_delete_invoice_usage
  AFTER DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION sync_invoice_usage();
