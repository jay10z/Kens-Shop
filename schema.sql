-- Kens Shop canonical database schema
-- Safe for new environments. For existing databases, apply:
--   1) sprint1_task1_1_migration.sql
--   2) sprint1_task1_1_schema_hardening.sql
--   3) phase4_hero_slides_migration.sql
--   4) phase4_categories_migration.sql
--   5) phase5_products_columns_migration.sql  (colors/models/short_description/etc.)
--   6) phase7_order_items_product_name_migration.sql  (order_items.product_name snapshot)

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0)
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  short_description TEXT,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
  images TEXT[] NOT NULL DEFAULT '{}',
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  featured BOOLEAN NOT NULL DEFAULT false,
  hidden BOOLEAN NOT NULL DEFAULT false,
  display_priority INTEGER CHECK (display_priority IS NULL OR display_priority >= 1),
  purchase_count INTEGER NOT NULL DEFAULT 0 CHECK (purchase_count >= 0),
  view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  cart_count INTEGER NOT NULL DEFAULT 0 CHECK (cart_count >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  colors TEXT[] NOT NULL DEFAULT '{}',
  models TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'cart', 'purchase')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (
    status IN (
      'Pending',
      'Discussing on WhatsApp',
      'Confirmed',
      'Preparing',
      'Out for Delivery',
      'Delivered',
      'Cancelled'
    )
  ),
  user_email TEXT,
  shipping_address JSONB,
  customer_name TEXT,
  whatsapp_number TEXT,
  address TEXT,
  gps_location TEXT,
  payment_method TEXT,
  delivery_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL ON UPDATE CASCADE,
  product_name TEXT,
  color TEXT,
  model TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0)
);

CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  content TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5)
);

CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0)
);

CREATE TABLE IF NOT EXISTS hero_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  cta_label TEXT,
  cta_href TEXT DEFAULT '/shop',
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
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
CREATE INDEX IF NOT EXISTS idx_product_events_type_created_at ON product_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_hero_slides_display_order ON hero_slides(display_order);
CREATE INDEX IF NOT EXISTS idx_hero_slides_enabled ON hero_slides(enabled);

-- Note: If you use Supabase Storage for product images,
-- create a bucket such as `product-images` in the Supabase dashboard.
