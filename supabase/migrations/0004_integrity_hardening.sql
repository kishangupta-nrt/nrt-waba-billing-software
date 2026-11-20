-- 0004_integrity_hardening.sql
-- Fixes the critical audit findings:
--   * one reconciled usage row per invoice, month/year from billing_month (fallback invoice_date)
--   * database-owned voucher numbers per financial year
--   * read-only RLS for authenticated browser users
-- Safe to run on an existing project. Apply after 0001-0003.

begin;

-- Store the prefix without a pinned financial year.
update company_settings
set voucher_prefix = regexp_replace(voucher_prefix, '[0-9]{2}-[0-9]{2}/?\s*$', '')
where id = 'primary' and voucher_prefix ~ '[0-9]{2}-[0-9]{2}';

update company_settings
set voucher_prefix = 'NRT/PI/'
where id = 'primary' and (voucher_prefix is null or btrim(voucher_prefix) = '');

update company_settings
set voucher_prefix = voucher_prefix || '/'
where id = 'primary' and right(voucher_prefix, 1) <> '/';

-- Remove duplicate invoice-linked usage rows before adding the unique index.
with ranked as (
  select ctid,
         row_number() over (
           partition by invoice_id
           order by updated_at desc nulls last, id
         ) as rn
  from monthly_credit_usage
  where invoice_id is not null
)
delete from monthly_credit_usage
where ctid in (select ctid from ranked where rn > 1);

create unique index if not exists idx_usage_invoice_id_unique
  on monthly_credit_usage (invoice_id)
  where invoice_id is not null;

create index if not exists idx_invoices_invoice_date on invoices (invoice_date);

-- Read-only RLS: the browser cannot bypass the Render API.
drop policy if exists "Authenticated access to company_settings" on company_settings;
drop policy if exists "Authenticated access to clients" on clients;
drop policy if exists "Authenticated access to invoices" on invoices;
drop policy if exists "Authenticated access to monthly_credit_usage" on monthly_credit_usage;
drop policy if exists "Authenticated read company_settings" on company_settings;
drop policy if exists "Authenticated read clients" on clients;
drop policy if exists "Authenticated read invoices" on invoices;
drop policy if exists "Authenticated read monthly_credit_usage" on monthly_credit_usage;

create policy "Authenticated read company_settings"
  on company_settings for select to authenticated using (true);
create policy "Authenticated read clients"
  on clients for select to authenticated using (true);
create policy "Authenticated read invoices"
  on invoices for select to authenticated using (true);
create policy "Authenticated read monthly_credit_usage"
  on monthly_credit_usage for select to authenticated using (true);

create or replace function get_next_unique_pi_number(p_prefix text default 'NRT/PI/')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  perform pg_advisory_xact_lock(hashtext('invoice_voucher:' || p_prefix));

  select coalesce(max(nullif(substring(voucher_no from '([0-9]+)$'), '')::int), 242) + 1
  into v_seq
  from invoices
  where voucher_no like p_prefix || '%';

  return p_prefix || lpad(v_seq::text, 5, '0');
end;
$$;

create or replace function assign_invoice_voucher_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base text;
  v_fy_start int;
  v_fy text;
  v_prefix text;
  v_seq int;
begin
  if tg_op = 'update' and new.voucher_no is not null and btrim(new.voucher_no) <> '' then
    return new;
  end if;

  select coalesce(nullif(btrim(voucher_prefix), ''), 'NRT/PI/')
  into v_base
  from company_settings
  where id = 'primary';

  if v_base is null then
    v_base := 'NRT/PI/';
  end if;

  v_base := regexp_replace(v_base, '[0-9]{2}-[0-9]{2}/?\s*$', '');
  if right(v_base, 1) <> '/' then
    v_base := v_base || '/';
  end if;

  v_fy_start := case
    when extract(month from new.invoice_date) >= 4
      then extract(year from new.invoice_date)::int
    else extract(year from new.invoice_date)::int - 1
  end;
  v_fy := lpad((v_fy_start % 100)::text, 2, '0') || '-' || lpad(((v_fy_start + 1) % 100)::text, 2, '0');
  v_prefix := v_base || v_fy || '/';

  perform pg_advisory_xact_lock(hashtext('invoice_voucher:' || v_prefix));

  select coalesce(max(nullif(substring(voucher_no from '([0-9]+)$'), '')::int), 242) + 1
  into v_seq
  from invoices
  where voucher_no like v_prefix || '%';

  new.voucher_no := v_prefix || lpad(v_seq::text, 5, '0');

  update company_settings
  set current_voucher_seq = greatest(coalesce(current_voucher_seq, 0), v_seq),
      updated_at = now()
  where id = 'primary';

  return new;
end;
$$;

drop trigger if exists trg_assign_invoice_voucher_no on invoices;
create trigger trg_assign_invoice_voucher_no
  before insert or update on invoices
  for each row execute function assign_invoice_voucher_no();

create or replace function sync_invoice_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text;
  v_year int;
  v_usage_id text;
  v_rate numeric(10, 4);
begin
  if tg_op = 'delete' then
    update monthly_credit_usage
    set invoice_id = null,
        invoice_voucher_no = null,
        billed = false,
        updated_at = now()
    where invoice_id = old.id;
    return old;
  end if;

  if split_part(new.billing_month, ' ', 1) in (
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ) and split_part(new.billing_month, ' ', 2) ~ '^[0-9]{4}$' then
    v_month := split_part(new.billing_month, ' ', 1);
    v_year := split_part(new.billing_month, ' ', 2)::int;
  else
    v_month := case extract(month from new.invoice_date)
      when 1 then 'January'
      when 2 then 'February'
      when 3 then 'March'
      when 4 then 'April'
      when 5 then 'May'
      when 6 then 'June'
      when 7 then 'July'
      when 8 then 'August'
      when 9 then 'September'
      when 10 then 'October'
      when 11 then 'November'
      when 12 then 'December'
    end;
    v_year := extract(year from new.invoice_date)::int;
  end if;
  v_rate := case
    when new.total_quantity > 0 then new.subtotal / new.total_quantity
    else 0.3650
  end;

  select id into v_usage_id
  from monthly_credit_usage
  where invoice_id = new.id
  limit 1;

  if v_usage_id is null then
    select id into v_usage_id
    from monthly_credit_usage
    where invoice_id is null
      and billed = false
      and lower(month) = lower(v_month)
      and year = v_year
      and (
        (new.client_id is not null and client_id = new.client_id)
        or lower(client_name) = lower(new.buyer_name)
      )
    order by updated_at desc nulls last
    limit 1;
  end if;

  if v_usage_id is not null then
    update monthly_credit_usage
    set client_id = new.client_id,
        client_name = new.buyer_name,
        month = v_month,
        year = v_year,
        utility_credits = new.total_quantity,
        marketing_credits = 0,
        service_credits = 0,
        auth_credits = 0,
        total_credits = new.total_quantity,
        rate_applied = round(v_rate, 4),
        billed_amount = new.total_amount,
        tax_mode = new.tax_mode,
        billed = true,
        invoice_voucher_no = new.voucher_no,
        invoice_id = new.id,
        due_date = new.due_date,
        updated_at = now()
    where id = v_usage_id;
  else
    insert into monthly_credit_usage (
      id, client_id, client_name, month, year,
      utility_credits, marketing_credits, service_credits, auth_credits,
      total_credits, rate_applied, billed_amount, tax_mode, billed,
      invoice_voucher_no, invoice_id, due_date, updated_at
    ) values (
      'usage_' || new.id, new.client_id, new.buyer_name, v_month, v_year,
      new.total_quantity, 0, 0, 0,
      new.total_quantity, round(v_rate, 4), new.total_amount, new.tax_mode, true,
      new.voucher_no, new.id, new.due_date, now()
    )
    on conflict (invoice_id) where invoice_id is not null do update set
      client_id = excluded.client_id,
      client_name = excluded.client_name,
      month = excluded.month,
      year = excluded.year,
      utility_credits = excluded.utility_credits,
      total_credits = excluded.total_credits,
      rate_applied = excluded.rate_applied,
      billed_amount = excluded.billed_amount,
      tax_mode = excluded.tax_mode,
      billed = true,
      invoice_voucher_no = excluded.invoice_voucher_no,
      due_date = excluded.due_date,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_invoice_usage on invoices;
create trigger trg_sync_invoice_usage
  after insert or update on invoices
  for each row execute function sync_invoice_usage();

drop trigger if exists trg_delete_invoice_usage on invoices;
create trigger trg_delete_invoice_usage
  after delete on invoices
  for each row execute function sync_invoice_usage();

commit;
