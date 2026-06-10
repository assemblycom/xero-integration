CREATE TABLE "xero_connection_status" (
	"portal_id" varchar(64) PRIMARY KEY NOT NULL,
	"status" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_xero_connection_status()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO xero_connection_status (portal_id, status, updated_at)
    VALUES (NEW.portal_id, NEW.status, now())
    ON CONFLICT (portal_id) DO UPDATE
      SET status = EXCLUDED.status, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_sync_xero_connection_status
  AFTER INSERT OR UPDATE ON xero_connections
  FOR EACH ROW EXECUTE FUNCTION sync_xero_connection_status();
--> statement-breakpoint
INSERT INTO xero_connection_status (portal_id, status, updated_at)
SELECT portal_id, status, now() FROM xero_connections
ON CONFLICT (portal_id) DO NOTHING;
