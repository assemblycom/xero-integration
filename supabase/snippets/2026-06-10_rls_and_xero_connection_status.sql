
-- Revoke all the write permissions from anon and grant select only access on realtime enabled table
REVOKE INSERT, UPDATE, DELETE ON xero_connection_status FROM anon;
GRANT SELECT ON xero_connection_status TO anon;

-- Enable RLS in all table at onces using loop
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

-- Create RLS policy for anon to read the table
CREATE POLICY "anon can read connection status"
  ON xero_connection_status FOR SELECT
  TO anon USING (true);


-- Realtime: subscribe the new table, drop the old one
ALTER PUBLICATION supabase_realtime ADD TABLE xero_connection_status;
ALTER PUBLICATION supabase_realtime DROP TABLE xero_connections;
