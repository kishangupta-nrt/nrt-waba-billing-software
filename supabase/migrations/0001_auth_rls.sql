-- 0001_auth_rls.sql
-- Replaces the permissive "public" policies with authenticated read-only access.
-- Apply this AFTER Supabase Auth users exist and the Render backend is live.
--
-- Model: single-tenant (any authenticated user may read company data).
-- All writes go through the Render API, which validates input and owns voucher
-- numbering. Public sign-ups should be disabled in Supabase Dashboard >
-- Authentication. The Render backend uses the service-role key and is not
-- affected by RLS.

begin;

alter table company_settings enable row level security;
alter table clients enable row level security;
alter table invoices enable row level security;
alter table monthly_credit_usage enable row level security;

-- Legacy names created by schema.sql
drop policy if exists "Allow public read-write for company_settings" on company_settings;
drop policy if exists "Allow public read-write for clients" on clients;
drop policy if exists "Allow public read-write for invoices" on invoices;
drop policy if exists "Allow public read-write for monthly_credit_usage" on monthly_credit_usage;

-- Legacy names created by the Settings modal SQL helper
drop policy if exists "Allow public all" on company_settings;
drop policy if exists "Allow public all" on clients;
drop policy if exists "Allow public all" on invoices;
drop policy if exists "Allow public all" on monthly_credit_usage;

drop policy if exists "Authenticated access to company_settings" on company_settings;
drop policy if exists "Authenticated access to clients" on clients;
drop policy if exists "Authenticated access to invoices" on invoices;
drop policy if exists "Authenticated access to monthly_credit_usage" on monthly_credit_usage;

create policy "Authenticated access to company_settings"
  on company_settings for select to authenticated using (true);
create policy "Authenticated access to clients"
  on clients for select to authenticated using (true);
create policy "Authenticated access to invoices"
  on invoices for select to authenticated using (true);
create policy "Authenticated access to monthly_credit_usage"
  on monthly_credit_usage for select to authenticated using (true);

create index if not exists idx_invoices_client_id on invoices (client_id);
create index if not exists idx_usage_month_year on monthly_credit_usage (month, year);
create index if not exists idx_usage_client_id on monthly_credit_usage (client_id);
create index if not exists idx_clients_name on clients (name);

commit;
