-- Sprint 1 - Task 1.1 architecture hardening
-- Non-destructive follow-up to sprint1_task1_1_migration.sql
-- Apply after the consolidation migration on existing databases.

BEGIN;

-- 1) Prefer built-in UUID generation (PostgreSQL 13+ / current Supabase default)
-- Existing uuid-ossp defaults remain valid; new defaults use gen_random_uuid().
ALTER TABLE categories ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE product_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE orders ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE order_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE testimonials ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE faqs ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2) Remove denormalized ranking flags (derive from created_at / purchase_count in app)
ALTER TABLE products DROP COLUMN IF EXISTS is_new;
ALTER TABLE products DROP COLUMN IF EXISTS best_seller;

-- 3) Harden foreign keys
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_id_fkey;
ALTER TABLE products
  ADD CONSTRAINT products_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES categories(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_product_id_fkey;
ALTER TABLE product_events
  ADD CONSTRAINT product_events_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES orders(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) Add missing CHECK constraints (safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_display_order_check') THEN
    ALTER TABLE categories ADD CONSTRAINT categories_display_order_check CHECK (display_order >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_price_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_price_check CHECK (price >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_quantity_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_stock_quantity_check CHECK (stock_quantity >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_display_priority_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_display_priority_check CHECK (display_priority IS NULL OR display_priority >= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_purchase_count_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_purchase_count_check CHECK (purchase_count >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_view_count_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_view_count_check CHECK (view_count >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cart_count_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_cart_count_check CHECK (cart_count >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_low_stock_threshold_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_low_stock_threshold_check CHECK (low_stock_threshold >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_total_check CHECK (total >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
      status IN (
        'Pending',
        'Discussing on WhatsApp',
        'Confirmed',
        'Preparing',
        'Out for Delivery',
        'Delivered',
        'Cancelled'
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_check') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_price_check') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_price_check CHECK (price >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faqs_display_order_check') THEN
    ALTER TABLE faqs ADD CONSTRAINT faqs_display_order_check CHECK (display_order >= 0);
  END IF;
END $$;

-- 5) Supporting index for event analytics filters
CREATE INDEX IF NOT EXISTS idx_product_events_type_created_at
  ON product_events(event_type, created_at);

COMMIT;
