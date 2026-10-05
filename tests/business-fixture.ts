import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
export const admin = "00000000-0000-0000-0000-000000000001",
  outsider = "00000000-0000-0000-0000-000000000002";
export async function businessDB() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${admin}'),('${outsider}');create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;`,
  );
  for (const path of [
    "20261003153214_finance_mvp.sql",
    "20261003184712_finance_improvements.sql",
    "20261003210828_business_finance.sql",
    "20261004145726_vehicle_documents.sql",
    "20261005100217_safe_vehicle_deletion.sql",
    "20261005131126_fix_vehicle_delete_owner_ambiguity.sql",
    "20261005173926_complete_safe_entity_deletion.sql",
  ])
    await db.exec(await readFile("supabase/migrations/" + path, "utf8"));
  await db.exec(
    (await readFile("supabase/setup-admin.sql", "utf8")).replaceAll(
      "ADMIN_USER_UUID",
      admin,
    ),
  );
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false);`,
  );
  return db;
}
