-- Run AFTER the migration and after manually creating the one user in Supabase Authentication.
-- Replace ADMIN_USER_UUID with the user's UUID. No passwords or keys belong in this file.
begin;
insert into public.app_admin(user_id) values ('ADMIN_USER_UUID'::uuid);
insert into public.categories(user_id,name,type)
select user_id, defaults.name, defaults.type from public.app_admin cross join (values
 ('Müşteri Ödemesi','income'),('Diğer Gelir','income'),
 ('Yakıt','expense'),('Bakım','expense'),('Tamir','expense'),('Sigorta','expense'),
 ('Vergi','expense'),('Otopark','expense'),('Personel','expense'),('Kira','expense'),('Diğer','expense')
) as defaults(name,type);
commit;
