begin;
-- Additive migration: no history is removed. Apply both earlier migrations first.
alter table public.vehicles add column archived_at timestamptz;
alter table public.employees add column archived_at timestamptz;
alter table public.transactions add column receipt_path text;
alter table public.transactions add column client_request_id uuid;
create unique index transactions_request_id on public.transactions(user_id,client_request_id) where client_request_id is not null;
create index transactions_live_page on public.transactions(user_id,date desc,created_at desc,id desc) where deleted_at is null;
create index transactions_live_vehicle on public.transactions(user_id,vehicle_id,date) include(amount,category_id) where deleted_at is null and type='expense';
create index transactions_live_employee on public.transactions(user_id,employee_id,date) include(amount,payroll_kind) where deleted_at is null;
-- Financial entities can be archived and restored, never deleted by the client.
revoke delete on public.vehicles,public.employees,public.employee_periods from authenticated;

-- Preserve salary snapshots even when an administrative SQL client attempts a hard delete.
alter table public.employee_periods drop constraint employee_periods_user_id_employee_id_fkey;
alter table public.employee_periods add constraint employee_periods_user_id_employee_id_fkey foreign key(user_id,employee_id) references public.employees(user_id,id) on delete restrict;

create table public.recurring_expenses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_admin(user_id) on delete restrict,
 name text not null check(char_length(trim(name)) between 1 and 80),
 amount bigint not null check(amount between 1 and 999999999999), category_id uuid not null,
 frequency text not null check(frequency in ('weekly','monthly','yearly')), next_date date not null,
 anchor_day smallint not null check(anchor_day between 1 and 31), anchor_month smallint not null check(anchor_month between 1 and 12),
 vehicle_id uuid, employee_id uuid, payroll_kind text check(payroll_kind in ('salary_payment','advance','bonus')),
 archived_at timestamptz, unique(user_id,id),
 foreign key(user_id,category_id) references public.categories(user_id,id) on delete restrict,
 foreign key(user_id,vehicle_id) references public.vehicles(user_id,id) on delete restrict,
 foreign key(user_id,employee_id) references public.employees(user_id,id) on delete restrict,
 check(payroll_kind is null or (employee_id is not null and vehicle_id is null))
);
alter table public.recurring_expenses enable row level security;
revoke all on public.recurring_expenses from anon,authenticated;
grant select,insert,update on public.recurring_expenses to authenticated;
create policy recurring_owner on public.recurring_expenses for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
alter table public.transactions add column recurring_id uuid;
alter table public.transactions add column recurring_date date;
alter table public.transactions add constraint recurring_reference foreign key(user_id,recurring_id) references public.recurring_expenses(user_id,id) on delete restrict;
alter table public.transactions add constraint recurring_pair check((recurring_id is null)=(recurring_date is null));
create unique index recurring_occurrence on public.transactions(user_id,recurring_id,recurring_date) where recurring_id is not null;

create or replace function public.validate_transaction() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.category_id is not null and not exists(select 1 from public.categories where id=new.category_id and user_id=new.user_id and type=new.type) then raise exception 'category_type_mismatch' using errcode='23514'; end if;
 if new.payroll_kind is not null then
  select id into new.payroll_period_id from public.employee_periods where user_id=new.user_id and employee_id=new.employee_id and month=date_trunc('month',new.date)::date;
  if new.payroll_period_id is null then raise exception 'payroll_period_required' using errcode='23514'; end if;
 else new.payroll_period_id:=null; end if;
 -- Archived links are allowed on historical edits, but not on new/reassigned links.
 if (tg_op='INSERT' or new.vehicle_id is distinct from old.vehicle_id) and exists(select 1 from public.vehicles where id=new.vehicle_id and archived_at is not null) then raise exception 'vehicle_archived' using errcode='23514'; end if;
 if (tg_op='INSERT' or new.employee_id is distinct from old.employee_id) and exists(select 1 from public.employees where id=new.employee_id and archived_at is not null) then raise exception 'employee_archived' using errcode='23514'; end if;
 if new.receipt_path is not null and (new.type<>'expense' or new.receipt_path not like new.user_id::text||'/'||new.id::text||'/%' or new.receipt_path like '%..%' or char_length(new.receipt_path)>180) then raise exception 'invalid_receipt_path' using errcode='23514'; end if;
 return new;
end $$;
create function public.validate_recurring() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.categories where id=new.category_id and user_id=new.user_id and type='expense') then raise exception 'category_type_mismatch' using errcode='23514'; end if;
 if (tg_op='INSERT' or new.vehicle_id is distinct from old.vehicle_id) and exists(select 1 from public.vehicles where id=new.vehicle_id and archived_at is not null) then raise exception 'vehicle_archived' using errcode='23514'; end if;
 if (tg_op='INSERT' or new.employee_id is distinct from old.employee_id) and exists(select 1 from public.employees where id=new.employee_id and archived_at is not null) then raise exception 'employee_archived' using errcode='23514'; end if;
 return new;
end $$;
create trigger validate_recurring before insert or update on public.recurring_expenses for each row execute function public.validate_recurring();

create or replace function public.validate_category_update() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.type<>old.type and (exists(select 1 from public.transactions where category_id=old.id and user_id=old.user_id) or exists(select 1 from public.recurring_expenses where category_id=old.id and user_id=old.user_id)) then raise exception 'category_in_use' using errcode='23514'; end if;
 return new;
end $$;

-- One occurrence is explicitly confirmed by the administrator. The insert and advance are atomic.
create function public.post_recurring(p_id uuid,p_due date) returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.recurring_expenses; saved uuid; target date; next_day date;
begin
 select * into r from public.recurring_expenses where id=p_id and user_id=auth.uid() for update;
 if r.id is null then raise exception 'recurring_not_found'; end if;
 select id into saved from public.transactions where recurring_id=r.id and recurring_date=p_due and user_id=r.user_id;
 if saved is not null then return saved; end if;
 if r.archived_at is not null or r.next_date<>p_due or p_due>(now() at time zone 'Europe/Istanbul')::date then raise exception 'recurring_not_due' using errcode='23514'; end if;
 insert into public.transactions(user_id,type,amount,category_id,date,description,vehicle_id,employee_id,payroll_kind,recurring_id,recurring_date)
 values(r.user_id,'expense',r.amount,r.category_id,p_due,r.name,r.vehicle_id,r.employee_id,r.payroll_kind,r.id,p_due) returning id into saved;
 if r.frequency='weekly' then next_day:=p_due+7;
 else
  target:=case when r.frequency='monthly' then (date_trunc('month',p_due)+interval '1 month')::date else make_date(extract(year from p_due)::int+1,r.anchor_month,1) end;
  next_day:=target+least(r.anchor_day,extract(day from (date_trunc('month',target)+interval '1 month - 1 day'))::int)-1;
 end if;
 update public.recurring_expenses set next_date=next_day where id=r.id;
 return saved;
end $$;

create function public.finance_balance(p_end date) returns numeric language sql stable security invoker set search_path='' as $$
 select case when p_end<s.opening_date then null else s.opening_balance+coalesce((select sum(case when t.type='income' then t.amount when t.type='expense' then -t.amount else 0 end) from public.transactions t where t.user_id=auth.uid() and t.deleted_at is null and t.date>=s.opening_date and t.date<=p_end),0) end from public.finance_settings s where s.user_id=auth.uid();
$$;
revoke execute on function public.finance_balance(date) from public,anon;
grant execute on function public.finance_balance(date) to authenticated;

-- RLS applies inside every aggregate. No SECURITY DEFINER or service-role client.
create function public.finance_summary(p_month date) returns jsonb language sql stable security invoker set search_path='' as $$
with bounds as(select date_trunc('month',p_month)::date m, (date_trunc('month',p_month)+interval '1 month')::date e),
live as not materialized(select * from public.transactions where user_id=auth.uid() and deleted_at is null),
monthly as(select t.* from live t,bounds b where t.date>=b.m and t.date<b.e),
months as(select generate_series((select m from bounds)-interval '5 months',(select m from bounds),interval '1 month')::date m),
trend as(select h.m,coalesce(sum(t.amount) filter(where t.type='income'),0) income,coalesce(sum(t.amount) filter(where t.type='expense'),0) expense from months h left join live t on t.date>=h.m and t.date<(h.m+interval '1 month') group by h.m),
vehicle_sums as(select vehicle_id,coalesce(sum(amount) filter(where type='expense'),0) lifetime,max(date) last_activity from live where vehicle_id is not null group by vehicle_id),
vehicle_months as(select t.vehicle_id,date_trunc('month',t.date)::date m,sum(t.amount) amount from live t,bounds b where t.type='expense' and t.vehicle_id is not null and t.date>=b.m-interval '3 months' and t.date<b.e group by t.vehicle_id,date_trunc('month',t.date)),
vehicle_categories as(select t.vehicle_id,coalesce(cat.id::text,'none') id,coalesce(cat.name,'Diğer') name,sum(t.amount) amount from monthly t left join public.categories cat on cat.id=t.category_id where t.vehicle_id is not null and t.type='expense' group by t.vehicle_id,cat.id,cat.name),
vehicle_json as(select v.*,coalesce(s.lifetime,0) lifetime,s.last_activity,
 coalesce((select amount from vehicle_months where vehicle_id=v.id and m=b.m),0) current,
 coalesce((select amount from vehicle_months where vehicle_id=v.id and m=(b.m-interval '1 month')::date),0) previous,
 (select coalesce(jsonb_agg(jsonb_build_object('month',to_char(h,'YYYY-MM'),'amount',coalesce(a.amount,0)) order by h),'[]') from generate_series(b.m-interval '3 months',b.m-interval '1 month',interval '1 month') h left join vehicle_months a on a.vehicle_id=v.id and a.m=h::date) history,
 (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'value',c.amount) order by c.amount desc),'[]') from vehicle_categories c where c.vehicle_id=v.id) categories
 from public.vehicles v cross join bounds b left join vehicle_sums s on s.vehicle_id=v.id where v.user_id=auth.uid()),
payroll as(select employee_id,
 coalesce(sum(amount) filter(where payroll_kind='advance'),0) advance,
 coalesce(sum(amount) filter(where payroll_kind='salary_payment'),0) salary_payment,
 coalesce(sum(amount) filter(where payroll_kind='bonus'),0) bonus,
 coalesce(sum(amount) filter(where payroll_kind='bonus_due'),0) bonus_due,
 coalesce(sum(amount) filter(where payroll_kind='deduction'),0) deduction
 from monthly group by employee_id),
staff as(select e.*,to_jsonb(p) period,coalesce(round(p.salary::numeric*p.work_days/30),0) earned_salary,
 coalesce(q.advance,0) advance,coalesce(q.salary_payment,0) salary_payment,coalesce(q.bonus,0) bonus,coalesce(q.bonus_due,0) bonus_due,coalesce(q.deduction,0) deduction,
 coalesce(q.advance,0)+coalesce(q.salary_payment,0)+coalesce(q.bonus,0) paid,
 coalesce(round(p.salary::numeric*p.work_days/30),0)+coalesce(q.bonus_due,0)-coalesce(q.deduction,0)-coalesce(q.advance,0)-coalesce(q.salary_payment,0) remaining
 from public.employees e cross join bounds b left join public.employee_periods p on p.employee_id=e.id and p.month=b.m and p.user_id=auth.uid() left join payroll q on q.employee_id=e.id where e.user_id=auth.uid())
select jsonb_build_object('month',(select to_char(m,'YYYY-MM') from bounds),
 'total',jsonb_build_object('income',coalesce((select sum(amount) from monthly where type='income'),0),'expense',coalesce((select sum(amount) from monthly where type='expense'),0),'net',coalesce((select sum(case when type='income' then amount when type='expense' then -amount else 0 end) from monthly),0)),
 'balance',public.finance_balance((now() at time zone 'Europe/Istanbul')::date),
 'vehicles',coalesce((select jsonb_agg(to_jsonb(v)) from vehicle_json v),'[]'),
 'employees',coalesce((select jsonb_agg(to_jsonb(s)) from staff s),'[]'),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'value',c.amount) order by c.amount desc) from (select cat.id,cat.name,sum(t.amount) amount from monthly t join public.categories cat on cat.id=t.category_id where t.type='expense' group by cat.id,cat.name)c),'[]'),
 'trend',coalesce((select jsonb_agg(jsonb_build_object('month',to_char(m,'YYYY-MM'),'income',income,'expense',expense) order by m) from trend),'[]'),
 'daily',coalesce((select jsonb_agg(jsonb_build_object('day',extract(day from d.calendar_date)::int,'Gelir',coalesce(q.income,0)/100.0,'Gider',coalesce(q.expense,0)/100.0) order by d.calendar_date) from (select generate_series(m,e-1,interval '1 day') as calendar_date from bounds)d left join (select date,coalesce(sum(amount) filter(where type='income'),0) income,coalesce(sum(amount) filter(where type='expense'),0) expense from monthly group by date)q on q.date=d.calendar_date::date),'[]'));

$$;

create function public.finance_transactions(p_start date default null,p_end date default null,p_vehicle uuid default null,p_employee uuid default null,p_type text default null,p_search text default '',p_trash boolean default false,p_cursor_date date default null,p_cursor_created timestamptz default null,p_cursor_id uuid default null,p_limit int default 40) returns jsonb language sql stable security invoker set search_path='' as $$
with matches as not materialized(select t.* from public.transactions t left join public.categories c on c.id=t.category_id
 where t.user_id=auth.uid() and ((not p_trash and t.deleted_at is null) or (p_trash and t.deleted_at is not null))
 and(p_start is null or t.date>=p_start) and(p_end is null or t.date<=p_end) and(p_vehicle is null or t.vehicle_id=p_vehicle) and(p_employee is null or t.employee_id=p_employee)
 and(p_type is null or t.type=p_type) and(length(coalesce(p_search,''))=0 or strpos(lower(t.description||' '||coalesce(c.name,'')||' '||coalesce(t.payroll_kind,'')),lower(left(p_search,100)))>0)),
matched_totals as(select count(*) count,coalesce(sum(amount) filter(where type='income'),0) income,coalesce(sum(amount) filter(where type='expense'),0) expense from matches),
page as(select * from matches where p_cursor_date is null or (date,created_at,id)<(p_cursor_date,p_cursor_created,p_cursor_id) order by date desc,created_at desc,id desc limit least(greatest(p_limit,1),100)+1)
select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p) order by date desc,created_at desc,id desc) from page p),'[]'),
 'count',s.count,
 'total',jsonb_build_object('income',s.income,'expense',s.expense,'net',s.income-s.expense)) from matched_totals s;
$$;
-- Explicit export only: every sheet uses the same MVCC snapshot. Fetch one extra row to
-- detect an oversized report without transferring unlimited financial history.
create function public.finance_export(p_start date,p_end date) returns jsonb language sql stable security invoker set search_path='' as $$
with bounds as(select date_trunc('month',p_start)::date first_month,(date_trunc('month',p_end)+interval '1 month')::date after_month),
ledger as(select t.* from public.transactions t cross join bounds b where t.user_id=auth.uid() and t.deleted_at is null and t.date>=b.first_month and t.date<b.after_month and p_start<=p_end order by date,created_at,id limit 50001)
select jsonb_build_object(
 'transactions',coalesce((select jsonb_agg(to_jsonb(t) order by date,created_at,id) from ledger t),'[]'),
 'vehicles',coalesce((select jsonb_agg(to_jsonb(v)) from public.vehicles v where v.user_id=auth.uid()),'[]'),
 'employees',coalesce((select jsonb_agg(to_jsonb(e)) from public.employees e where e.user_id=auth.uid()),'[]'),
 'categories',coalesce((select jsonb_agg(to_jsonb(c)) from public.categories c where c.user_id=auth.uid()),'[]'),
 'employee_periods',coalesce((select jsonb_agg(to_jsonb(p)) from public.employee_periods p cross join bounds b where p.user_id=auth.uid() and p.month>=b.first_month and p.month<b.after_month),'[]'),
 'finance_settings',coalesce((select jsonb_agg(to_jsonb(s)) from public.finance_settings s where s.user_id=auth.uid()),'[]'),
 'export_context',jsonb_build_object('end',p_end,'balance',public.finance_balance(p_end)));
$$;
revoke execute on function public.finance_export(date,date) from public,anon;
grant execute on function public.finance_export(date,date) to authenticated;
-- Stored file is private, immutably named and owner scoped. At most one referenced receipt per transaction.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('finance-receipts','finance-receipts',false,2097152,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy finance_receipt_read on storage.objects for select to authenticated
 using(bucket_id='finance-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.app_admin where user_id=(select auth.uid())));
-- Narrow privileged helper: returns only an owner quota boolean, never object data.
-- Serialize competing uploads so the byte budget cannot be bypassed by double taps.
create function public.receipt_budget_available() returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if not exists(select 1 from public.app_admin where user_id=auth.uid()) then return false; end if;
 perform pg_advisory_xact_lock(74021,hashtext(auth.uid()::text));
 return (select count(*)<500 and coalesce(sum(coalesce((metadata->>'size')::bigint,2097152)),0)+2097152<=209715200 from storage.objects where bucket_id='finance-receipts' and (storage.foldername(name))[1]=auth.uid()::text);
end $$;
revoke execute on function public.receipt_budget_available() from public,anon;
grant execute on function public.receipt_budget_available() to authenticated;
create policy finance_receipt_insert on storage.objects for insert to authenticated
 with check(bucket_id='finance-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.app_admin where user_id=(select auth.uid()))
 and public.receipt_budget_available());
create policy finance_receipt_remove on storage.objects for delete to authenticated
 using(bucket_id='finance-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.app_admin where user_id=(select auth.uid())) and not exists(select 1 from public.transactions where receipt_path=name));
revoke execute on function public.validate_recurring() from public,anon,authenticated;
revoke execute on function public.finance_summary(date), public.finance_transactions(date,date,uuid,uuid,text,text,boolean,date,timestamptz,uuid,int),public.post_recurring(uuid,date) from public,anon;
grant execute on function public.finance_summary(date), public.finance_transactions(date,date,uuid,uuid,text,text,boolean,date,timestamptz,uuid,int),public.post_recurring(uuid,date) to authenticated;
notify pgrst,'reload schema';
commit;
