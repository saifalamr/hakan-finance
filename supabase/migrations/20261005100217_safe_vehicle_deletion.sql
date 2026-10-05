begin;
-- Additive: no record is deleted by applying this migration. Direct client DELETE remains revoked.
-- Only a confirmed administrator request can remove an unused vehicle.
create function public.delete_unused_vehicle(p_vehicle uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null or not exists(select 1 from public.app_admin where user_id=owner_id) then
    raise exception 'administrator_required' using errcode='42501';
  end if;
  -- Serialize deletion with owned FK-linked inserts/updates. Missing IDs make explicit retries safe.
  perform 1 from public.vehicles where id=p_vehicle and user_id=owner_id for update;
  if not found then return false; end if;
  if exists(select 1 from public.transactions where user_id=owner_id and vehicle_id=p_vehicle)
    or exists(select 1 from public.recurring_expenses where user_id=owner_id and vehicle_id=p_vehicle)
    or exists(select 1 from public.vehicle_documents where user_id=owner_id and vehicle_id=p_vehicle)
    or exists(select 1 from storage.objects where bucket_id='vehicle-documents'
      and name like owner_id::text||'/'||p_vehicle::text||'/%') then
    raise exception 'vehicle_has_history_archive_instead' using errcode='23503';
  end if;
  delete from public.vehicles where id=p_vehicle and user_id=owner_id;
  return true;
end $$;
revoke execute on function public.delete_unused_vehicle(uuid) from public,anon;
grant execute on function public.delete_unused_vehicle(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
