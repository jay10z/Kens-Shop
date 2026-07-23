import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load from environment: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function extract() {
  console.log('Extracting data from old Supabase...');
  
  const tables = ['categories', 'products', 'orders', 'order_items', 'testimonials', 'faqs'];
  let sql = `-- Auto-generated schema and data migration\n\n`;

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.error(`Error fetching ${table}:`, error.message);
      continue;
    }
    
    if (data && data.length > 0) {
      console.log(`Found ${data.length} records in ${table}`);
      
      // Basic schema inference based on data keys
      const columns = Object.keys(data[0]);
      sql += `-- Table: ${table}\n`;
      // We don't have exact types, but we'll try to infer
      sql += `/*\nCREATE TABLE ${table} (\n`;
      for (const col of columns) {
        sql += `  ${col} TEXT,\n`;
      }
      sql += `);\n*/\n\n`;
      
      for (const row of data) {
        const cols = Object.keys(row).join(', ');
        const vals = Object.values(row).map(v => {
          if (v === null) return 'NULL';
          if (typeof v === 'boolean') return v ? 'true' : 'false';
          if (typeof v === 'number') return v;
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
          return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');
        sql += `INSERT INTO ${table} (${cols}) VALUES (${vals});\n`;
      }
      sql += '\n';
    } else {
       console.log(`No records found in ${table}`);
    }
  }

  fs.writeFileSync('migration.sql', sql);
  console.log('Done! Saved to migration.sql');
}

extract();
