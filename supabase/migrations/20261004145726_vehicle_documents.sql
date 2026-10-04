begin;
-- Apply the existing three finance migrations first. No existing row or file is deleted.
create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_admin(user_id) on delete restrict,
  vehicle_id uuid not null,
  type text not null check (type in ('ruhsat','muayene','sigorta','kasko')),
  start_date date, end_date date,
  provider text check (char_length(provider) between 1 and 120),
  policy_number text check (char_length(policy_number) between 1 and 120),
  notes text check (char_length(notes) between 1 and 1000),
  file_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (user_id,vehicle_id) references public.vehicles(user_id,id) on delete restrict,
  unique (user_id,vehicle_id,type),
  check (start_date is null or start_date between date '1000-01-01' and date '9999-12-31'),
  check (end_date is null or end_date between date '1000-01-01' and date '9999-12-31'),
  check (start_date is null or end_date is null or end_date>=start_date),
  check (type<>'ruhsat' or (start_date is null and end_date is null)),
  check (type in ('sigorta','kasko') or (provider is null and policy_number is null)),
  check (file_path is null or (
    file_path ~ ('^'||user_id::text||'/'||vehicle_id::text||'/'||type||'/[0-9a-f-]{36}[.](jpg|pdf)$')
    and char_length(file_path)<=180
  ))
);
create index vehicle_documents_expiry on public.vehicle_documents(user_id,end_date,vehicle_id) where end_date is not null;
alter table public.vehicle_documents enable row level security;
revoke all on public.vehicle_documents from anon,authenticated;
grant select,insert,update on public.vehicle_documents to authenticated;
create policy vehicle_documents_owner on public.vehicle_documents for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
-- Keep one editable current record per document type. Replacing a file never deletes a vehicle.
create function public.validate_vehicle_document() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.id<>old.id or new.user_id<>old.user_id or new.vehicle_id<>old.vehicle_id or new.type<>old.type) then
    raise exception 'document_identity_immutable' using errcode='23514';
  end if;
  new.updated_at:=now();
  return new;
end $$;
create trigger validate_vehicle_document before insert or update on public.vehicle_documents
  for each row execute function public.validate_vehicle_document();
revoke execute on function public.validate_vehicle_document() from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('vehicle-documents','vehicle-documents',false,2097152,array['image/jpeg','image/png','image/webp','application/pdf']);
-- The quota helper needs to inspect objects without recursive Storage RLS. It is deliberately
-- outside the exposed public schema and returns only the current administrator's quota boolean.
create schema if not exists vehicle_document_internal;
revoke all on schema vehicle_document_internal from public,anon;
grant usage on schema vehicle_document_internal to authenticated;
create function vehicle_document_internal.vehicle_document_budget_available() returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
  if not exists(select 1 from public.app_admin where user_id=auth.uid()) then return false; end if;
  perform pg_advisory_xact_lock(74022,hashtext(auth.uid()::text));
  return (select count(*)<500 and coalesce(sum(coalesce((metadata->>'size')::bigint,2097152)),0)+2097152<=209715200
    from storage.objects where bucket_id='vehicle-documents' and (storage.foldername(name))[1]=auth.uid()::text);
end $$;
revoke execute on function vehicle_document_internal.vehicle_document_budget_available() from public,anon;
grant execute on function vehicle_document_internal.vehicle_document_budget_available() to authenticated;
create policy vehicle_document_read on storage.objects for select to authenticated
  using (bucket_id='vehicle-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists(select 1 from public.vehicles where user_id=(select auth.uid()) and id::text=(storage.foldername(name))[2]));
create policy vehicle_document_insert on storage.objects for insert to authenticated
  with check (bucket_id='vehicle-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
    and (storage.foldername(name))[3] in ('ruhsat','muayene','sigorta','kasko')
    and exists(select 1 from public.vehicles where user_id=(select auth.uid()) and id::text=(storage.foldername(name))[2])
    and vehicle_document_internal.vehicle_document_budget_available());
-- Only an unreferenced object may be removed. Protects retained records and ambiguous save timeouts.
create policy vehicle_document_remove on storage.objects for delete to authenticated
  using (bucket_id='vehicle-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists(select 1 from public.vehicles where user_id=(select auth.uid()) and id::text=(storage.foldername(name))[2])
    and not exists(select 1 from public.vehicle_documents where file_path=name));
notify pgrst,'reload schema';
commit;
