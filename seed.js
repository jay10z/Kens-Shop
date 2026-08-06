import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log("Starting seed process...");

  console.log("1. Clearing old data...");
  await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('product_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log("2. Inserting categories...");
  const categories = [
    { name: 'Perfumes', display_order: 1 },
    { name: 'Watches', display_order: 2 },
    { name: 'Jewelry', display_order: 3 },
    { name: 'Bracelets', display_order: 4 },
    { name: 'Accessories', display_order: 5 }
  ];

  const { data: catData, error: catErr } = await supabase.from('categories').insert(categories).select();
  if (catErr) throw catErr;

  const catMap = {};
  catData.forEach(c => catMap[c.name] = c.id);

  console.log("3. Inserting products...");
  const products = [
    // Perfumes
    { name: 'Oud Exquis', category: 'Perfumes', short: 'A woody and rich fragrance', price: 295, stock: 12, images: ['https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=80'], display_priority: 1, featured: true },
    { name: 'Rose Midnight', category: 'Perfumes', short: 'Elegant floral notes', price: 210, stock: 8, images: ['https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Santal Volcanique', category: 'Perfumes', short: 'Spicy and warm', price: 250, stock: 3, images: ['https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?auto=format&fit=crop&w=800&q=80'], low_stock_threshold: 4 },
    { name: 'Neroli Blanc', category: 'Perfumes', short: 'Fresh citrus burst', price: 180, stock: 0, images: ['https://images.unsplash.com/photo-1595425970377-c9703c48657a?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Ambre Nuit', category: 'Perfumes', short: 'Deep amber scent', price: 320, stock: 15, images: ['https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Vanille Royale', category: 'Perfumes', short: 'Sweet vanilla essence', price: 190, stock: 20, images: ['https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80'] },
    
    // Watches
    { name: 'Chronographe Éternel', category: 'Watches', short: 'Automatic movement', price: 4500, stock: 2, images: ['https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=800&q=80'], featured: true },
    { name: 'Plongée Océan', category: 'Watches', short: 'Water resistant to 300m', price: 3200, stock: 5, images: ['https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Classic Gold', category: 'Watches', short: '18k rose gold case', price: 8500, stock: 1, images: ['https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=800&q=80'], low_stock_threshold: 2 },
    { name: 'Silver Minimalist', category: 'Watches', short: 'Sleek everyday wear', price: 1200, stock: 18, images: ['https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Pilot Heritage', category: 'Watches', short: 'Aviation inspired design', price: 5600, stock: 4, images: ['https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&w=800&q=80'] },
    
    // Jewelry & Bracelets
    { name: 'Collier Diamant', category: 'Jewelry', short: 'Solitaire diamond necklace', price: 2100, stock: 6, images: ['https://images.unsplash.com/photo-1599643478524-fb66645365ea?auto=format&fit=crop&w=800&q=80'], featured: true },
    { name: 'Bague Éternité', category: 'Jewelry', short: 'Sapphire and diamond ring', price: 3400, stock: 3, images: ['https://images.unsplash.com/photo-1605100804763-247f67b8548e?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Bracelet Maille', category: 'Bracelets', short: 'Gold link bracelet', price: 890, stock: 14, images: ['https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Cuff Minimal', category: 'Bracelets', short: 'Silver open cuff', price: 450, stock: 22, images: ['https://images.unsplash.com/photo-1573408301145-b98c46544665?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Boucles Perles', category: 'Jewelry', short: 'Akoya pearl earrings', price: 650, stock: 0, images: ['https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Charm Bracelet', category: 'Bracelets', short: 'Customizable gold charms', price: 1100, stock: 9, images: ['https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80'] },
    
    // Accessories
    { name: 'Leather Wallet', category: 'Accessories', short: 'Hand-stitched calf leather', price: 350, stock: 30, images: ['https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Silk Scarf', category: 'Accessories', short: 'Printed monogram silk', price: 280, stock: 12, images: ['https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Sunglasses Aviator', category: 'Accessories', short: 'Polarized gold frames', price: 420, stock: 7, images: ['https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=80'], featured: true },
    { name: 'Travel Pouch', category: 'Accessories', short: 'Canvas and leather mix', price: 550, stock: 4, images: ['https://images.unsplash.com/photo-1547949003-9792a18a2601?auto=format&fit=crop&w=800&q=80'], low_stock_threshold: 5 },
    { name: 'Card Holder', category: 'Accessories', short: 'Slim minimalist design', price: 190, stock: 45, images: ['https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?auto=format&fit=crop&w=800&q=80'] },
    
    // More mix
    { name: 'Oud Mystique', category: 'Perfumes', short: 'Intense oriental blend', price: 410, stock: 5, images: ['https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Rose Précieuse', category: 'Perfumes', short: 'Delicate summer floral', price: 230, stock: 11, images: ['https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80'], hidden: true },
    { name: 'Montre Éclipse', category: 'Watches', short: 'Black titanium case', price: 6200, stock: 2, images: ['https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Bracelet Jonc', category: 'Bracelets', short: 'Solid gold bangle', price: 1450, stock: 8, images: ['https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Collier Perles', category: 'Jewelry', short: 'Classic pearl strand', price: 950, stock: 15, images: ['https://images.unsplash.com/photo-1599643478524-fb66645365ea?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Bague Saphir', category: 'Jewelry', short: 'Blue sapphire center', price: 2800, stock: 1, images: ['https://images.unsplash.com/photo-1605100804763-247f67b8548e?auto=format&fit=crop&w=800&q=80'], low_stock_threshold: 2 },
    { name: 'Sac Hobo', category: 'Accessories', short: 'Slouchy leather bag', price: 1850, stock: 6, images: ['https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=800&q=80'] },
    { name: 'Porte-Clés', category: 'Accessories', short: 'Woven leather keychain', price: 120, stock: 50, images: ['https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?auto=format&fit=crop&w=800&q=80'] }
  ];

  const dbProducts = products.map((p, i) => ({
    name: p.name,
    category_id: catMap[p.category],
    slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + i,
    description: `Experience the luxury of ${p.name}. ${p.short}. Crafted with the finest materials for unparalleled elegance.`,
    short_description: p.short,
    price: p.price,
    images: p.images,
    stock_quantity: p.stock,
    low_stock_threshold: p.low_stock_threshold || 5,
    featured: p.featured || false,
    hidden: p.hidden || false,
    display_priority: p.display_priority || null,
    active: true,
    colors: ['Gold', 'Silver', 'Black'],
    models: ['Standard']
  }));

  const { data: insertedProducts, error: prodErr } = await supabase.from('products').insert(dbProducts).select();
  if (prodErr) throw prodErr;

  console.log("4. Simulating analytics (views, carts, purchases) and generating orders...");
  
  const statuses = ['Pending', 'Discussing on WhatsApp', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
  const now = new Date();
  
  const allEvents = [];
  const allOrders = [];
  const allOrderItems = [];
  
  // Make some products "Trending" and "Best Sellers"
  for (let i = 0; i < insertedProducts.length; i++) {
    const product = insertedProducts[i];
    
    // Base traffic
    let views = Math.floor(Math.random() * 50);
    let carts = Math.floor(Math.random() * 10);
    let purchases = Math.floor(Math.random() * 5);
    
    // Boost specific items
    if (i === 0 || i === 6) { // Make the first perfume and first watch massive trenders
      views += 300;
      carts += 50;
      purchases += 25;
    }
    
    for (let v=0; v<views; v++) allEvents.push({ product_id: product.id, event_type: 'view', created_at: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() });
    for (let c=0; c<carts; c++) allEvents.push({ product_id: product.id, event_type: 'cart', created_at: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() });
    for (let p=0; p<purchases; p++) allEvents.push({ product_id: product.id, event_type: 'purchase', created_at: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() });
    
    // Update product counters
    await supabase.from('products').update({
      view_count: views,
      cart_count: carts,
      purchase_count: purchases
    }).eq('id', product.id);
  }
  
  // Chunk events insertion
  for (let i=0; i<allEvents.length; i+=1000) {
    await supabase.from('product_events').insert(allEvents.slice(i, i+1000));
  }
  
  // Generate Orders
  console.log("5. Generating sample orders...");
  for (let i = 0; i < 20; i++) {
    const randomProduct = insertedProducts[Math.floor(Math.random() * insertedProducts.length)];
    const randomProduct2 = insertedProducts[Math.floor(Math.random() * insertedProducts.length)];
    
    const total = randomProduct.price + (i % 3 === 0 ? randomProduct2.price : 0);
    const orderDate = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
    
    const { data: order } = await supabase.from('orders').insert({
      order_number: `KS-${orderDate.toISOString().slice(2, 10).replaceAll('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`,
      total,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      created_at: orderDate.toISOString(),
      updated_at: orderDate.toISOString(),
      customer_name: `Client ${i + 1}`,
      whatsapp_number: `+1555000${Math.floor(1000 + Math.random() * 9000)}`,
      address: `${Math.floor(Math.random() * 100) + 1} Luxury Ave, Paris`,
      payment_method: i % 2 === 0 ? 'Card' : 'Cash on Delivery'
    }).select().single();
    
    allOrderItems.push({
      order_id: order.id,
      product_id: randomProduct.id,
      quantity: 1,
      price: randomProduct.price,
      product_name: randomProduct.name
    });
    
    if (i % 3 === 0) {
      allOrderItems.push({
        order_id: order.id,
        product_id: randomProduct2.id,
        quantity: 1,
        price: randomProduct2.price,
        product_name: randomProduct2.name
      });
    }
  }
  
  await supabase.from('order_items').insert(allOrderItems);

  console.log("Done! Seeded categories, products, analytics events, and orders successfully.");
}

seed().catch(console.error);
