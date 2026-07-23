-- Smart Product Ranking & Inventory System Migration
-- Run this script in your Supabase SQL Editor

-- 1. Add new columns to the products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS display_priority INTEGER NULL,
ADD COLUMN IF NOT EXISTS purchase_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cart_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS best_seller BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS colors TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS models TEXT[] DEFAULT '{}';

-- 2. Create the product_events table for 30-day trending calculations
CREATE TABLE IF NOT EXISTS product_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'cart', 'purchase')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_events_product_id ON product_events(product_id);
CREATE INDEX IF NOT EXISTS idx_product_events_created_at ON product_events(created_at);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_hidden ON products(hidden);
