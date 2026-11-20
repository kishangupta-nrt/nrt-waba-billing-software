-- 0005_invoice_cancellation.sql
-- Cancelling an invoice releases its linked monthly usage row so the same
-- client can be billed again for the same service period without duplicates.
-- Safe to run after 0001-0004.

begin;

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

  if new.status = 'Cancelled' then
    update monthly_credit_usage
    set invoice_id = null,
        invoice_voucher_no = null,
        billed = false,
        updated_at = now()
    where invoice_id = new.id;
    return new;
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
