begin;
alter table public.transactions add column deleted_at timestamptz;
alter table public.transactions drop constraint transactions_payroll_kind_check;
alter table public.transactions add constraint transactions_payroll_kind_check check (payroll_kind in ('salary_payment','advance','bonus','bonus_due','deduction'));
alter table public.transactions drop constraint payroll_consistency;
alter table public.transactions add constraint payroll_consistency check (
  (payroll_kind is null and type in ('income','expense') and payroll_period_id is null)
  or (payroll_kind is not null and employee_id is not null and vehicle_id is null and payroll_period_id is not null
    and ((payroll_kind in ('deduction','bonus_due') and type = 'adjustment')
      or (payroll_kind not in ('deduction','bonus_due') and type = 'expense')))
);
create table public.finance_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.app_admin(user_id) on delete restrict,
  opening_balance bigint not null check (opening_balance between -999999999999 and 999999999999),
  opening_date date not null
);
alter table public.finance_settings enable row level security;
revoke all on public.finance_settings from anon, authenticated;
grant select,insert,update on public.finance_settings to authenticated;
create policy settings_read on public.finance_settings for select to authenticated using (user_id = (select auth.uid()));
create policy settings_insert on public.finance_settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy settings_update on public.finance_settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Transactions remain recoverable. Client roles cannot permanently remove them.
revoke delete on public.transactions from authenticated;
notify pgrst, 'reload schema';
commit;
