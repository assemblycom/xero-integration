# RLS, Grants & Realtime for `xero_connection_status`

This document describes the database security setup that lets the UI subscribe to
Xero connection status changes over Supabase Realtime **without** exposing any
sensitive data to the public `anon` role.

**Snippet location:**
`supabase/snippets/2026-06-10_rls_and_xero_connection_status.sql`
([open](../supabase/snippets/2026-06-10_rls_and_xero_connection_status.sql))

It is run **manually** against the database (it is not a Drizzle migration).

## Background

The app needs the browser to know, in real time, when a portal's Xero
connection changes. Supabase Realtime delivers row changes to the client using
the `anon` key, which means any table it broadcasts is readable by the public
`anon` role under RLS.

Broadcasting `xero_connections` directly is unsafe — that table holds
`tokenSet` (OAuth access/refresh tokens). To avoid leaking secrets, a dedicated
mirror table `xero_connection_status` holds only non-sensitive fields:

| Column       | Type          | Notes                          |
| ------------ | ------------- | ------------------------------ |
| `portal_id`  | `varchar(64)` | Primary key                    |
| `status`     | `boolean`     | Connection status              |
| `updated_at` | `timestamptz` | Last status change             |

An `AFTER INSERT OR UPDATE` trigger on `xero_connections` upserts into this
mirror table, guarded by `IS DISTINCT FROM` so token-only writes don't generate
realtime noise. Realtime then subscribes to `xero_connection_status` only.

## What the snippet does

The snippet runs as a single transaction and performs four things:

### 1. Revoke all `anon` access from every table, then grant select on the mirror

```sql
REVOKE INSERT, UPDATE, DELETE, SELECT ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON xero_connection_status TO anon;
```

`anon` loses all read/write privileges on every table in `public`, then is
granted **`SELECT` only** on `xero_connection_status`. This is the *grant* layer
— it controls which tables `anon` can touch at all. The mirror table is the only
one `anon` can read, which is exactly what Realtime needs.

### 2. Create the RLS policy before enabling RLS

```sql
CREATE POLICY "anon can read connection status"
  ON xero_connection_status FOR SELECT
  TO anon USING (true);
```

This is the *RLS* layer. With RLS enabled and no policy, every row is denied by
default. The policy is created **before** RLS is enabled to avoid a window where
`anon` reads are blocked (a default-deny gap). `USING (true)` allows `anon` to
read all rows of the mirror table — safe because the table contains no secrets.

> Grants and RLS are two independent gates. A query must pass **both**: the role
> needs the table-level `GRANT`, *and* the row must satisfy an RLS policy.

### 3. Enable RLS on all public tables

```sql
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
```

RLS is enabled on **every** table in `public`. Tables other than
`xero_connection_status` have no `anon` policy and no `anon` grant, so they are
fully locked down for the public role. The application's own database role (the
service/connection role used by Drizzle) is unaffected and continues to operate
normally.

### 4. Repoint Realtime at the mirror table

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE xero_connection_status;
ALTER PUBLICATION supabase_realtime DROP TABLE xero_connections;
```

Realtime broadcasts come from the `supabase_realtime` publication. The mirror
table is added and `xero_connections` is removed, so token data is never part of
a realtime payload.

## Security summary

- **Every** `public` table has RLS enabled.
- `anon` has **no** access to any table except `SELECT` on
  `xero_connection_status`.
- `xero_connection_status` exposes only `portal_id`, `status`, `updated_at` —
  no secrets.
- `xero_connections` (with `tokenSet`) is no longer broadcast over Realtime.

## How the client uses it

`useRealtimeXeroConnections`
([`src/features/auth/hooks/useRealtimeXeroConnections.ts`](../src/features/auth/hooks/useRealtimeXeroConnections.ts))
subscribes to `UPDATE` events on `xero_connection_status`, filtered to the
current portal (`portal_id=eq.${portalId}`). When the status changes it reloads
the page so the UI reflects the new connection state.

## Running the snippet

The snippet lives at
`supabase/snippets/2026-06-10_rls_and_xero_connection_status.sql`.

It is **not** a Drizzle migration — run it manually (e.g. via the Supabase SQL
editor or `psql`) after the
`20260610095713_add_xero_connection_status` migration has created the table,
trigger, and backfill. The whole snippet is wrapped in `BEGIN; … COMMIT;`, so it
applies atomically.
