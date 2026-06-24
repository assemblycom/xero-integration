-- =============================================================================
-- One-time dedupe for synced_payments — OUT-3896
-- =============================================================================
-- Context: payment.succeeded had no idempotency check, so repeated webhooks
-- created duplicate EXPENSE rows (each pointing to a separate Xero
-- BankTransaction). Before the new partial unique index on
-- (portal_id, tenant_id, copilot_payment_id) WHERE copilot_payment_id IS NOT NULL
-- can be created, each group must be collapsed to a single canonical row:
-- the EARLIEST-created mapping (tie-break on id for determinism).
--
-- Only rows with copilot_payment_id IS NOT NULL (EXPENSE rows) are affected.
-- PAYMENT rows store copilot_payment_id = NULL and are untouched.
--
-- Run the DRY-RUN queries first to preview impact, then run the DELETE.
-- Must run BEFORE the migration that creates the new index, ideally with
-- payment.succeeded processing paused so no new duplicates appear in the gap.
--
-- NOTE: This removes duplicate DB rows only. The duplicate BankTransactions
-- already in Xero are a separate manual accounting reconciliation.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- DRY RUN #1 — duplicate groups (the affected keys)
-- -----------------------------------------------------------------------------
SELECT portal_id, tenant_id, copilot_payment_id, COUNT(*) AS row_count
FROM "synced_payments"
WHERE copilot_payment_id IS NOT NULL
GROUP BY portal_id, tenant_id, copilot_payment_id
HAVING COUNT(*) > 1
ORDER BY row_count DESC;


-- -----------------------------------------------------------------------------
-- DRY RUN #2 — survivor vs doomed, side by side (rn = 1 is the survivor)
-- -----------------------------------------------------------------------------
SELECT
  id,
  portal_id,
  tenant_id,
  copilot_payment_id,
  xero_payment_id,
  type,
  created_at,
  ROW_NUMBER() OVER (
    PARTITION BY portal_id, tenant_id, copilot_payment_id
    ORDER BY created_at ASC, id ASC
  ) AS rn,
  CASE
    WHEN ROW_NUMBER() OVER (
      PARTITION BY portal_id, tenant_id, copilot_payment_id
      ORDER BY created_at ASC, id ASC
    ) = 1 THEN 'KEEP'
    ELSE 'DELETE'
  END AS action
FROM "synced_payments"
WHERE copilot_payment_id IS NOT NULL
ORDER BY portal_id, tenant_id, copilot_payment_id, rn;


-- -----------------------------------------------------------------------------
-- THE DELETE — keep the earliest-created row per
-- (portal, tenant, copilot_payment_id), delete the rest.
-- Tie-break on id so the result is deterministic.
-- -----------------------------------------------------------------------------
DELETE FROM "synced_payments" a
USING "synced_payments" b
WHERE a."copilot_payment_id" IS NOT NULL
  AND b."copilot_payment_id" IS NOT NULL
  AND a."portal_id"          = b."portal_id"
  AND a."tenant_id"          = b."tenant_id"
  AND a."copilot_payment_id" = b."copilot_payment_id"
  AND (
    a."created_at" > b."created_at"
    OR (a."created_at" = b."created_at" AND a."id" > b."id")
  );
