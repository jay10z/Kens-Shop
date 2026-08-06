-- Sprint 1 - Task 1.1
-- Non-destructive migration to align existing databases with the canonical schema.
-- Run this in Supabase SQL Editor before using the updated schema as the source of truth.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  images TEXT[] DEFAULT '{}',
  stock_quantity INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE products
ADD COLUMN IF NOT EXISTS short_description TEXT,
ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS display_priority INTEGER,
ADD COLUMN IF NOT EXISTS purchase_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cart_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS best_seller BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS colors TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS models TEXT[] DEFAULT '{}';

ALTER TABLE products
ALTER COLUMN images SET DEFAULT '{}',
ALTER COLUMN stock_quantity SET DEFAULT 0,
ALTER COLUMN active SET DEFAULT true,
ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now());

UPDATE products SET images = '{}' WHERE images IS NULL;
UPDATE products SET stock_quantity = 0 WHERE stock_quantity IS NULL;
UPDATE products SET active = true WHERE active IS NULL;
UPDATE products SET featured = false WHERE featured IS NULL;
UPDATE products SET hidden = false WHERE hidden IS NULL;
UPDATE products SET purchase_count = 0 WHERE purchase_count IS NULL;
UPDATE products SET view_count = 0 WHERE view_count IS NULL;
UPDATE products SET cart_count = 0 WHERE cart_count IS NULL;
UPDATE products SET low_stock_threshold = 5 WHERE low_stock_threshold IS NULL;
UPDATE products SET is_new = true WHERE is_new IS NULL;
UPDATE products SET best_seller = false WHERE best_seller IS NULL;
UPDATE products SET colors = '{}' WHERE colors IS NULL;
UPDATE products SET models = '{}' WHERE models IS NULL;
UPDATE products SET created_at = timezone('utc'::text, now()) WHERE created_at IS NULL;

CREATE TABLE IF NOT EXISTS product_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'cart', 'purchase')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status TEXT DEFAULT 'Pending',
  user_email TEXT,
  shipping_address JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS gps_location TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS delivery_instructions TEXT;

ALTER TABLE orders
ALTER COLUMN status SET DEFAULT 'Pending',
ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now()),
ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now());

UPDATE orders SET updated_at = timezone('utc'::text, now()) WHERE updated_at IS NULL;
UPDATE orders SET created_at = timezone('utc'::text, now()) WHERE created_at IS NULL;
UPDATE orders SET status = 'Pending' WHERE status IS NULL;

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL
);

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS product_name TEXT,
ADD COLUMN IF NOT EXISTS color TEXT,
ADD COLUMN IF NOT EXISTS model TEXT;

CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  content TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5)
);

CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_hidden ON products(hidden);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_display_priority ON products(display_priority);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_product_events_product_id ON product_events(product_id);
CREATE INDEX IF NOT EXISTS idx_product_events_created_at ON product_events(created_at);

COMMIT;
