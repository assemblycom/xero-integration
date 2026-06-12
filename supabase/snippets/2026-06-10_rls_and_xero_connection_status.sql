BEGIN;

-- Revoke writes, grant select-only to anon
REVOKE INSERT, UPDATE, DELETE, SELECT ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON xero_connection_status TO anon;

-- Create the policy before enabling RLS to avoid a default-deny gap
CREATE POLICY "anon can read connection status"
  ON xero_connection_status FOR SELECT
  TO anon USING (true);

-- Enable RLS on all public tables
do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end $$;

-- Point realtime at the new table
ALTER PUBLICATION supabase_realtime ADD TABLE xero_connection_status;
ALTER PUBLICATION supabase_realtime DROP TABLE xero_connections;

COMMIT;
