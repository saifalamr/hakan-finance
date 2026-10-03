begin;
-- Amounts are integer kuruş, never floating point. One explicitly provisioned administrator.
create table public.app_admin (
  user_id uuid primary key references auth.users(id) on delete restrict,
  singleton boolean not null default true unique check (singleton = true)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_admin(user_id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 50),
  type text not null check (type in ('income','expense')),
  unique (user_id, id), unique (user_id, name, type)
);
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_admin(user_id) on delete restrict,
  plate text not null check (char_length(trim(plate)) between 1 and 20),
  brand text not null check (char_length(trim(brand)) between 1 and 60),
  model text not null check (char_length(trim(model)) between 1 and 60),
  unique (user_id, id), unique (user_id, plate)
);
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_admin(user_id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 100),
  salary bigint not null check (salary between 0 and 999999999999),
  work_days smallint not null default 30 check (work_days between 0 and 30),
  unique (user_id, id)
);
create table public.employee_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_admin(user_id) on delete restrict,
  employee_id uuid not null,
  month date not null check (extract(day from month) = 1),
  salary bigint not null check (salary between 0 and 999999999999),
  work_days smallint not null check (work_days between 0 and 30),
  foreign key (user_id,employee_id) references public.employees(user_id,id) on delete cascade,
  unique (user_id,id), unique (user_id,employee_id,month)
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_admin(user_id) on delete restrict,
  type text not null check (type in ('income','expense','adjustment')),
  amount bigint not null check (amount between 1 and 999999999999),
  category_id uuid,
  date date not null default ((now() at time zone 'Europe/Istanbul')::date),
  description text not null default '' check (char_length(description) <= 300),
  vehicle_id uuid,
  employee_id uuid,
  payroll_kind text check (payroll_kind in ('salary_payment','advance','bonus','deduction')),
  payroll_period_id uuid,
  created_at timestamptz not null default now(),
  foreign key (user_id,category_id) references public.categories(user_id,id) on delete restrict,
  foreign key (user_id,vehicle_id) references public.vehicles(user_id,id) on delete restrict,
  foreign key (user_id,employee_id) references public.employees(user_id,id) on delete restrict,
  foreign key (user_id,payroll_period_id) references public.employee_periods(user_id,id) on delete restrict,
  constraint cash_category check ((type = 'adjustment' and category_id is null) or (type != 'adjustment' and category_id is not null)),
  constraint payroll_consistency check (
    (payroll_kind is null and type in ('income','expense') and payroll_period_id is null)
    or (payroll_kind is not null and employee_id is not null and vehicle_id is null and payroll_period_id is not null
      and ((payroll_kind = 'deduction' and type = 'adjustment') or (payroll_kind != 'deduction' and type = 'expense')))
  )
);
-- No definer functions: all validation and writes run with the authenticated user's RLS permissions.
create function public.validate_transaction() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.category_id is not null and not exists (
    select 1 from public.categories where id = new.category_id and user_id = new.user_id and type = new.type
  ) then raise exception 'category_type_mismatch' using errcode = '23514'; end if;
  if new.payroll_kind is not null then
    select id into new.payroll_period_id from public.employee_periods
      where user_id = new.user_id and employee_id = new.employee_id and month = date_trunc('month', new.date)::date;
    if new.payroll_period_id is null then raise exception 'payroll_period_required' using errcode = '23514'; end if;
  else new.payroll_period_id := null;
  end if;
  return new;
end $$;
create trigger validate_transaction before insert or update on public.transactions for each row execute function public.validate_transaction();
create function public.validate_category_update() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.type != old.type and exists (select 1 from public.transactions where category_id = old.id and user_id = old.user_id) then
    raise exception 'category_in_use' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger validate_category_update before update on public.categories for each row execute function public.validate_category_update();
create function public.create_initial_employee_period() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.employee_periods(user_id,employee_id,month,salary,work_days)
  values (new.user_id,new.id,date_trunc('month',now() at time zone 'Europe/Istanbul')::date,new.salary,new.work_days);
  return new;
end $$;
create trigger create_initial_employee_period after insert on public.employees for each row execute function public.create_initial_employee_period();
create function public.validate_period_update() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.month != old.month or new.employee_id != old.employee_id then
    raise exception 'period_identity_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger validate_period_update before update on public.employee_periods for each row execute function public.validate_period_update();
create index transactions_owner_date on public.transactions(user_id,date desc,created_at desc);
create index transactions_vehicle_date on public.transactions(user_id,vehicle_id,date);
create index transactions_employee_date on public.transactions(user_id,employee_id,date);
create index transactions_category on public.transactions(user_id,category_id);
create index transactions_period on public.transactions(user_id,payroll_period_id);
alter table public.app_admin enable row level security;
create policy admin_self_read on public.app_admin for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.app_admin from anon, authenticated;
grant select on public.app_admin to authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array['categories','vehicles','employees','employee_periods','transactions'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy owner_access on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',table_name);
    execute format('revoke all on public.%I from anon, authenticated',table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated',table_name);
  end loop;
end $$;
revoke execute on function public.validate_transaction(), public.validate_category_update(), public.create_initial_employee_period(), public.validate_period_update() from public, anon, authenticated;
commit;
