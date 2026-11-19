-- 0002_voucher_sequence.sql
-- Atomic PI/voucher assignment and race-safe next-number helper.

begin;

create or replace function get_next_unique_pi_number(p_prefix text default 'NRT/PI/26-27/')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
begin
  perform pg_advisory_xact_lock(hashtext('invoice_voucher:' || p_prefix));

  select coalesce(max(substring(voucher_no from '[0-9]+$')::int), 242) + 1
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
  v_prefix text;
  v_seq int;
begin
  if new.voucher_no is not null and btrim(new.voucher_no) <> '' then
    return new;
  end if;

  select coalesce(voucher_prefix, 'NRT/PI/26-27/')
  into v_prefix
  from company_settings
  where id = 'primary';

  if v_prefix is null or btrim(v_prefix) = '' then
    v_prefix := 'NRT/PI/26-27/';
  end if;

  perform pg_advisory_xact_lock(hashtext('invoice_voucher:' || v_prefix));

  select coalesce(max(substring(voucher_no from '[0-9]+$')::int), 242) + 1
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
  before insert on invoices
  for each row execute function assign_invoice_voucher_no();

commit;
