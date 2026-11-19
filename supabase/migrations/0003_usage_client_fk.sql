-- 0003_usage_client_fk.sql
-- Allows manual/custom clients (no clients row) in monthly usage and stores
-- fractional credits consistently with invoices.

begin;

alter table monthly_credit_usage alter column client_id drop not null;
alter table monthly_credit_usage drop constraint if exists monthly_credit_usage_client_id_fkey;
alter table monthly_credit_usage
  add constraint monthly_credit_usage_client_id_fkey
  foreign key (client_id) references clients(id) on delete set null;

alter table monthly_credit_usage alter column utility_credits type numeric(12, 4);
alter table monthly_credit_usage alter column marketing_credits type numeric(12, 4);
alter table monthly_credit_usage alter column service_credits type numeric(12, 4);
alter table monthly_credit_usage alter column auth_credits type numeric(12, 4);
alter table monthly_credit_usage alter column total_credits type numeric(12, 4);

commit;
