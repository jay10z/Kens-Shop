/**
 * Schema-adaptive seed for Ken's Shop.
 * Works on older/minimal Supabase schemas and newer full schemas.
 * Run: node seed.js
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function columnExists(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}

async function tableExists(table) {
  const { error } = await supabase.from(table).select('*').limit(1);
  if (!error) return true;
  return !/schema cache|does not exist/i.test(error.message || '');
}

async function detectProductColumns() {
  const candidates = [
    'id', 'name', 'slug', 'price', 'stock_quantity', 'active', 'category_id', 'images',
    'description', 'short_description', 'featured', 'hidden', 'display_priority',
    'purchase_count', 'view_count', 'cart_count', 'low_stock_threshold', 'colors', 'models', 'created_at',
  ];
  const available = new Set();
  for (const col of candidates) {
    if (await columnExists('products', col)) available.add(col);
  }
  return available;
}

function pick(row, available) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (available.has(k)) out[k] = v;
  }
  return out;
}

async function seed() {
  console.log('Starting adaptive seed...');

  const hasEvents = await tableExists('product_events');
  const hasHero = await tableExists('hero_slides');
  const hasOrders = await tableExists('orders');
  const hasOrderItems = await tableExists('order_items');
  const productCols = await detectProductColumns();
  console.log('products columns:', [...productCols].join(', ') || '(none)');
  console.log('tables:', { product_events: hasEvents, hero_slides: hasHero, orders: hasOrders, order_items: hasOrderItems });

  console.log('1. Clearing old catalog data...');
  if (hasOrderItems) await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (hasOrders) await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (hasEvents) await supabase.from('product_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  // keep categories if present; re-upsert below
  if (hasHero) await supabase.from('hero_slides').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('2. Ensuring categories...');
  const categoryDefs = [
    { name: 'Perfumes', display_order: 1 },
    { name: 'Watches', display_order: 2 },
    { name: 'Accessories', display_order: 3 },
  ];
  let { data: cats } = await supabase.from('categories').select('*').order('display_order');
  if (!cats?.length) {
    const { data, error } = await supabase.from('categories').insert(categoryDefs).select();
    if (error) throw error;
    cats = data;
  }
  const catMap = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  // map French names if present
  for (const c of cats) {
    const n = (c.name || '').toLowerCase();
    if (n.includes('parfum')) catMap['Perfumes'] = c.id;
    if (n.includes('montre') || n.includes('watch')) catMap['Watches'] = c.id;
    if (n.includes('access')) catMap['Accessories'] = c.id;
  }

  console.log('3. Inserting products...');
  const products = [
    { name: 'Oud Exquis', category: 'Perfumes', short: 'A woody and rich fragrance', price: 295, stock: 12, images: ['https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=80'], display_priority: 1, featured: true, views: 320, carts: 55, purchases: 28 },
    { name: 'Rose Midnight', category: 'Perfumes', short: 'Elegant floral notes', price: 210, stock: 8, images: ['https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80'], views: 90, carts: 18, purchases: 7 },
    { name: 'Santal Volcanique', category: 'Perfumes', short: 'Spicy and warm', price: 250, stock: 3, images: ['https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?auto=format&fit=crop&w=800&q=80'], low_stock_threshold: 4, views: 70, carts: 12, purchases: 4 },
    { name: 'Neroli Blanc', category: 'Perfumes', short: 'Fresh citrus burst', price: 180, stock: 0, images: ['https://images.unsplash.com/photo-1595425970377-c9703c48657a?auto=format&fit=crop&w=800&q=80'], views: 40, carts: 6, purchases: 1 },
    { name: 'Ambre Nuit', category: 'Perfumes', short: 'Deep amber scent', price: 320, stock: 15, images: ['https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=80'], views: 110, carts: 22, purchases: 9 },
    { name: 'Chronographe Éternel', category: 'Watches', short: 'Automatic movement', price: 4500, stock: 2, images: ['https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=800&q=80'], featured: true, views: 280, carts: 40, purchases: 18 },
    { name: 'Plongée Océan', category: 'Watches', short: 'Water resistant to 300m', price: 3200, stock: 5, images: ['https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=800&q=80'], views: 95, carts: 14, purchases: 5 },
    { name: 'Classic Gold', category: 'Watches', short: '18k rose gold case', price: 8500, stock: 1, images: ['https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=800&q=80'], low_stock_threshold: 2, views: 150, carts: 20, purchases: 6 },
    { name: 'Silver Minimalist', category: 'Watches', short: 'Sleek everyday wear', price: 1200, stock: 18, images: ['https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=800&q=80'], views: 60, carts: 10, purchases: 3 },
    { name: 'Leather Wallet', category: 'Accessories', short: 'Hand-stitched calf leather', price: 350, stock: 30, images: ['https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80'], views: 75, carts: 16, purchases: 11 },
    { name: 'Sunglasses Aviator', category: 'Accessories', short: 'Polarized gold frames', price: 420, stock: 7, images: ['https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80'], featured: true, views: 130, carts: 25, purchases: 12 },
    { name: 'Collier Diamant', category: 'Accessories', short: 'Solitaire diamond necklace', price: 2100, stock: 6, images: ['https://images.unsplash.com/photo-1599643478524-fb66645365ea?auto=format&fit=crop&w=800&q=80'], featured: true, views: 160, carts: 30, purchases: 8 },
    { name: 'Bracelet Maille', category: 'Accessories', short: 'Gold link bracelet', price: 890, stock: 14, images: ['https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80'], views: 55, carts: 9, purchases: 4 },
    { name: 'Key Holder', category: 'Accessories', short: 'Woven leather key holder', price: 120, stock: 50, images: ['https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80'], views: 45, carts: 8, purchases: 15 },
    { name: 'Travel Pouch', category: 'Accessories', short: 'Canvas and leather mix', price: 550, stock: 4, images: ['https://images.unsplash.com/photo-1547949003-9792a18a2601?auto=format&fit=crop&w=800&q=80'], low_stock_threshold: 5, views: 35, carts: 5, purchases: 2 },
  ];

  const dbProducts = products.map((p, i) => {
    const full = {
      name: p.name,
      category_id: catMap[p.category] || cats[0]?.id,
      slug: `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i}`,
      description: `Experience the luxury of ${p.name}. ${p.short}. Crafted with the finest materials for unparalleled elegance.`,
      short_description: p.short,
      price: p.price,
      images: p.images,
      stock_quantity: p.stock,
      low_stock_threshold: p.low_stock_threshold || 5,
      featured: !!p.featured,
      hidden: false,
      display_priority: p.display_priority || null,
      active: true,
      colors: ['Gold', 'Silver', 'Black'],
      models: ['Standard'],
      view_count: p.views || 0,
      cart_count: p.carts || 0,
      purchase_count: p.purchases || 0,
    };
    return pick(full, productCols);
  });

  const { data: insertedProducts, error: prodErr } = await supabase.from('products').insert(dbProducts).select();
  if (prodErr) throw prodErr;
  console.log(`   inserted ${insertedProducts.length} products`);

  if (hasEvents) {
    console.log('4. Inserting product_events for trending...');
    const now = Date.now();
    const allEvents = [];
    for (let i = 0; i < insertedProducts.length; i++) {
      const meta = products[i];
      const product = insertedProducts[i];
      const views = meta.views || 20;
      const carts = meta.carts || 5;
      const purchases = meta.purchases || 2;
      for (let v = 0; v < views; v++) {
        allEvents.push({
          product_id: product.id,
          event_type: 'view',
          created_at: new Date(now - Math.random() * 25 * 86400000).toISOString(),
        });
      }
      for (let c = 0; c < carts; c++) {
        allEvents.push({
          product_id: product.id,
          event_type: 'cart',
          created_at: new Date(now - Math.random() * 25 * 86400000).toISOString(),
        });
      }
      for (let p = 0; p < purchases; p++) {
        allEvents.push({
          product_id: product.id,
          event_type: 'purchase',
          created_at: new Date(now - Math.random() * 25 * 86400000).toISOString(),
        });
      }
      if (productCols.has('view_count')) {
        await supabase.from('products').update({
          ...(productCols.has('view_count') ? { view_count: views } : {}),
          ...(productCols.has('cart_count') ? { cart_count: carts } : {}),
          ...(productCols.has('purchase_count') ? { purchase_count: purchases } : {}),
        }).eq('id', product.id);
      }
    }
    for (let i = 0; i < allEvents.length; i += 500) {
      const { error } = await supabase.from('product_events').insert(allEvents.slice(i, i + 500));
      if (error) console.warn('event chunk error', error.message);
    }
  } else {
    console.log('4. Skipping product_events (table missing). Run smart_ranking_migration.sql for full trending.');
  }

  if (hasOrders && hasOrderItems) {
    console.log('5. Generating sample orders...');
    const orderColCandidates = [
      'order_number', 'total', 'status', 'created_at', 'updated_at',
      'customer_name', 'whatsapp_number', 'address', 'gps_location',
      'payment_method', 'delivery_instructions', 'user_email',
    ];
    const orderCols = new Set();
    for (const col of orderColCandidates) {
      if (await columnExists('orders', col)) orderCols.add(col);
    }
    const statuses = ['Pending', 'Discussing on WhatsApp', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
    const now = Date.now();
    const orderItems = [];
    for (let i = 0; i < 12; i++) {
      const a = insertedProducts[i % insertedProducts.length];
      const b = insertedProducts[(i + 3) % insertedProducts.length];
      const total = Number(a.price) + (i % 3 === 0 ? Number(b.price) : 0);
      const orderDate = new Date(now - Math.random() * 6 * 86400000);
      const full = {
        order_number: `KS-${orderDate.toISOString().slice(2, 10).replaceAll('-', '')}-${1000 + i}`,
        total,
        status: statuses[i % statuses.length],
        created_at: orderDate.toISOString(),
        updated_at: orderDate.toISOString(),
        customer_name: `Client ${i + 1}`,
        whatsapp_number: `+1555000${1000 + i}`,
        address: `${10 + i} Luxury Ave`,
        payment_method: i % 2 === 0 ? 'Card' : 'Cash on Delivery',
      };
      const payload = pick(full, orderCols);
      const { data: order, error } = await supabase.from('orders').insert(payload).select().single();
      if (error) {
        console.warn('order error', error.message);
        continue;
      }
      orderItems.push({
        order_id: order.id,
        product_id: a.id,
        quantity: 1,
        price: a.price,
        product_name: a.name,
      });
      if (i % 3 === 0) {
        orderItems.push({
          order_id: order.id,
          product_id: b.id,
          quantity: 1,
          price: b.price,
          product_name: b.name,
        });
      }
    }
    if (orderItems.length) await supabase.from('order_items').insert(orderItems);
  } else {
    console.log('5. Skipping orders (tables incomplete).');
  }

  if (hasHero) {
    console.log('6. Inserting hero slides...');
    await supabase.from('hero_slides').insert([
      {
        image_url: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=2000&q=88',
        title: 'Quiet luxury.',
        subtitle: 'A considered collection of perfumes, watches and accessories.',
        cta_label: 'Explore the collection',
        cta_href: '/shop',
        display_order: 1,
        enabled: true,
      },
      {
        image_url: 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=2000&q=88',
        title: 'Time, refined.',
        subtitle: 'Exceptional watches selected for presence and precision.',
        cta_label: 'View watches',
        cta_href: '/shop',
        display_order: 2,
        enabled: true,
      },
      {
        image_url: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=2000&q=80',
        title: 'Scent & presence.',
        subtitle: 'Signature fragrances for evenings that linger.',
        cta_label: 'Discover perfumes',
        cta_href: '/shop',
        display_order: 3,
        enabled: true,
      },
    ]);
  } else {
    console.log('6. Skipping hero_slides (table missing). Run phase4_hero_slides_migration.sql in Supabase SQL editor.');
  }

  console.log('Done. Catalog seeded.');
  if (!hasEvents || !productCols.has('purchase_count')) {
    console.log('\nFor full trending / ranking columns, run in Supabase SQL Editor:');
    console.log('  - smart_ranking_migration.sql (or sprint1_task1_1_migration.sql)');
    console.log('  - phase4_hero_slides_migration.sql');
    console.log('Then run: node seed.js again');
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
