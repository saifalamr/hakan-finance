-- Read-only: run in Supabase SQL Editor. This is not an application migration.
-- Includes PostgreSQL data/indexes, not the filesystem WAL/system allocation.
select pg_size_pretty(pg_database_size(current_database())) as database_size,
       pg_database_size(current_database()) as database_bytes;

select schemaname, relname as table_name,
       pg_size_pretty(pg_total_relation_size(relid)) as total_with_indexes,
       n_live_tup as estimated_live_rows, n_dead_tup as estimated_dead_rows,
       last_autovacuum
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc;

select count(*) as total_transactions,
       count(*) filter (where deleted_at is not null) as recoverable_transactions
from public.transactions;
