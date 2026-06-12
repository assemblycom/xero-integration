DROP INDEX "uq_synced_items_portal_id_product_id_price_id";
CREATE UNIQUE INDEX "uq_synced_items_portal_id_tenant_id_product_id" ON "synced_items" USING btree ("portal_id","tenant_id","product_id");
ALTER TABLE "synced_items" DROP COLUMN "price_id";
