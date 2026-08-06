-- Phase 4: Consolidate storefront categories to Perfumes, Watches, Accessories.
-- Safe for existing databases. Jewelry / Bracelets products move into Accessories.

-- Ensure the three main categories exist
INSERT INTO categories (name, display_order)
SELECT 'Perfumes', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Perfumes');

INSERT INTO categories (name, display_order)
SELECT 'Watches', 2
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Watches');

INSERT INTO categories (name, display_order)
SELECT 'Accessories', 3
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Accessories');

UPDATE categories SET display_order = 1 WHERE name = 'Perfumes';
UPDATE categories SET display_order = 2 WHERE name = 'Watches';
UPDATE categories SET display_order = 3 WHERE name = 'Accessories';

-- Remap legacy categories into Accessories
UPDATE products
SET category_id = (SELECT id FROM categories WHERE name = 'Accessories' LIMIT 1)
WHERE category_id IN (
  SELECT id FROM categories WHERE name IN ('Jewelry', 'Bracelets', 'jewellery', 'jewelry')
);

-- Remove unused category rows (only when no products remain)
DELETE FROM categories
WHERE name IN ('Jewelry', 'Bracelets', 'jewellery', 'jewelry')
  AND NOT EXISTS (
    SELECT 1 FROM products WHERE products.category_id = categories.id
  );
