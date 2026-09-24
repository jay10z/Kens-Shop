/**
 * Local lifecycle tests. Refuses any non-local database URL.
 * Does not connect to production.
 *
 * Database: a throwaway server on 127.0.0.1 only.
 * Docker is used when its daemon is running. Otherwise the test
 * initdb's a temporary cluster with a Postgres already installed
 * on this machine. It never opens an existing database and never
 * reads Supabase or other remote credentials.
 */
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { evaluateStatusUpdate } from '../api/_lib/orderStatus.js';
import { isAdminUser } from '../api/_lib/adminAuth.js';
import handler from '../api/orders.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = 'ks-order-lifecycle-pg';
let connectionUrl = '';
let localDataDir = null;
let localDataDirSocket = null;
let localPgCtl = null;

const results = [];
function check(id, ok, detail = '') {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`);
}

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

async function apiCall(body) {
  const res = mockRes();
  await handler({ method: 'PUT', headers: {}, body }, res);
  return res;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out }));
  });
}

function assertLocal(connectionString) {
  const url = new URL(connectionString);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`Refusing non-Postgres URL protocol: ${url.protocol}`);
  }
  const host = url.hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`Refusing non-local database host: ${host}`);
  }
}

function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function findPgBin() {
  const candidates = [
    '/Library/PostgreSQL/18/bin',
    '/Library/PostgreSQL/17/bin',
    '/Library/PostgreSQL/16/bin',
    '/opt/homebrew/opt/postgresql@18/bin',
    '/opt/homebrew/opt/postgresql@16/bin',
    '/usr/local/opt/postgresql/bin',
  ];
  try {
    const initdbPath = execFileSync('which', ['initdb'], { encoding: 'utf8' }).trim();
    if (initdbPath) candidates.push(path.dirname(initdbPath));
  } catch {
    /* initdb is not on PATH */
  }
  return candidates.find((dir) => (
    existsSync(path.join(dir, 'initdb'))
    && existsSync(path.join(dir, 'pg_ctl'))
    && existsSync(path.join(dir, 'postgres'))
  )) || null;
}

async function startThrowawayCluster(port) {
  const bin = findPgBin();
  if (!bin) {
    throw new Error(
      'No local PostgreSQL server is available. Docker is not running, and initdb was not found on this machine. Refusing to use Supabase or any remote database.'
    );
  }
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'ks-pg-'));
  const socketDir = mkdtempSync(path.join(os.tmpdir(), 'ks-pg-sock-'));
  const init = await run(path.join(bin, 'initdb'), [
    '-D', dataDir,
    '-U', 'postgres',
    '--auth=trust',
    '--encoding=UTF8',
    '--locale=C',
    '--no-sync',
  ]);
  if (init.code !== 0) {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(socketDir, { recursive: true, force: true });
    throw new Error(`initdb failed. Refusing any remote database.\n${init.out.slice(0, 500)}`);
  }
  const pgCtl = path.join(bin, 'pg_ctl');
  const started = await run(pgCtl, [
    '-D', dataDir,
    '-l', path.join(dataDir, 'server.log'),
    '-o', `-h 127.0.0.1 -p ${port} -k ${socketDir}`,
    'start',
  ]);
  if (started.code !== 0) {
    await run(pgCtl, ['-D', dataDir, 'stop', '-m', 'immediate']).catch(() => {});
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(socketDir, { recursive: true, force: true });
    throw new Error(`Could not start a throwaway Postgres on 127.0.0.1:${port}. Refusing any remote database.\n${started.out.slice(0, 500)}`);
  }
  localDataDir = dataDir;
  localPgCtl = pgCtl;
  localDataDirSocket = socketDir;
  connectionUrl = `postgres://postgres@127.0.0.1:${port}/postgres`;
}

async function stopLocalPostgres() {
  if (localPgCtl && localDataDir) {
    await run(localPgCtl, ['-D', localDataDir, 'stop', '-m', 'fast']).catch(() => {});
  }
  await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
  if (localDataDir) rmSync(localDataDir, { recursive: true, force: true });
  if (localDataDirSocket) rmSync(localDataDirSocket, { recursive: true, force: true });
  localDataDir = null;
  localDataDirSocket = null;
  localPgCtl = null;
}

async function waitForDb() {
  for (let i = 0; i < 40; i += 1) {
    const probe = new pg.Client({ connectionString: connectionUrl });
    try {
      await probe.connect();
      await probe.query('SELECT 1');
      await probe.end();
      return;
    } catch {
      await probe.end().catch(() => {});
      await sleep(500);
    }
  }
  throw new Error('Local Postgres did not become ready');
}

async function applySql(client, file) {
  const sql = readFileSync(path.join(root, file), 'utf8');
  await client.query(sql);
}

function codeOf(error) {
  const message = String(error?.message || '');
  const known = [
    'PRODUCT_NOT_FOUND',
    'PRODUCT_INACTIVE',
    'PRODUCT_HIDDEN',
    'INSUFFICIENT_STOCK',
    'INVALID_QUANTITY',
    'ORDER_NOT_PENDING',
    'LEGACY_RESERVED_ORDER',
    'ORDER_NOT_FOUND',
  ];
  return known.find((code) => message.includes(code)) || message;
}

async function expectError(fn) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the database call to fail');
}

async function stockOf(client, productId) {
  const { rows } = await client.query('SELECT stock_quantity, purchase_count FROM products WHERE id = $1', [productId]);
  return rows[0];
}

async function purchaseEvents(client, productId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM product_events WHERE product_id = $1 AND event_type = 'purchase'`,
    [productId]
  );
  return rows[0].n;
}

async function main() {
  process.env.ADMIN_EMAILS = 'owner@kens-shop.test';
  const stranger = isAdminUser({ email: 'stranger@example.com', app_metadata: {} });
  const owner = isAdminUser({ email: 'owner@kens-shop.test', app_metadata: {} });
  check('P-non-admin-identity', stranger === false && owner === true, 'allowlist rejects a non-admin user');

  const unauthConfirm = await apiCall({ id: '00000000-0000-0000-0000-000000000001', action: 'confirm' });
  const unauthEdit = await apiCall({
    id: '00000000-0000-0000-0000-000000000001',
    action: 'edit_items',
    items: [{ product_id: '00000000-0000-0000-0000-000000000002', quantity: 1 }],
  });
  check('P-unauthenticated', unauthConfirm.statusCode === 401 && unauthEdit.statusCode === 401, `confirm ${unauthConfirm.statusCode}, edit ${unauthEdit.statusCode}`);

  const blocked = evaluateStatusUpdate('Pending', 'Confirmed', 'on_confirm');
  const cancelOk = evaluateStatusUpdate('Pending', 'Cancelled', 'on_confirm');
  const deliverBlocked = evaluateStatusUpdate('Pending', 'Delivered', 'on_confirm');
  const legacyDeliver = evaluateStatusUpdate('Pending', 'Delivered', null);
  const legacyConfirm = evaluateStatusUpdate('Pending', 'Confirmed', null);
  const confirmedDeliver = evaluateStatusUpdate('Confirmed', 'Delivered', 'on_confirm');
  const reopenBlocked = evaluateStatusUpdate('Confirmed', 'Pending', 'on_confirm');
  check(
    'Q-generic-status',
    blocked.ok === false && blocked.code === 'CONFIRM_REQUIRED'
      && cancelOk.ok === true
      && deliverBlocked.ok === false
      && legacyDeliver.ok === true
      && legacyConfirm.ok === true && legacyConfirm.next === 'Confirmed'
      && confirmedDeliver.ok === true
      && reopenBlocked.ok === false,
    blocked.code
  );

  const ordersSrc = readFileSync(path.join(root, 'api/orders.js'), 'utf8');
  const appSrc = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  const phase12Src = readFileSync(path.join(root, 'phase12_pending_confirm_lifecycle.sql'), 'utf8');
  const cartSlice = appSrc.slice(appSrc.indexOf('function Cart('), appSrc.indexOf('function Empty('));
  const confirmSlice = appSrc.slice(appSrc.indexOf('const confirmOrder'), appSrc.indexOf('const addProduct'));
  const createSql = phase12Src.slice(
    phase12Src.indexOf('FUNCTION public.create_pending_order'),
    phase12Src.indexOf('FUNCTION public.update_pending_order')
  );
  const confirmSql = phase12Src.slice(
    phase12Src.indexOf('FUNCTION public.confirm_pending_order'),
    phase12Src.indexOf('REVOKE ALL ON FUNCTION public.create_pending_order')
  );
  check('O-no-purchase-on-create-api', !ordersSrc.includes('purchase_count') && !ordersSrc.includes("event_type: 'purchase'") && !ordersSrc.includes("rpc('create_order_with_stock'"));
  check(
    'O-ga4-db-purchase-only',
    cartSlice.includes('trackBeginCheckout(')
      && !appSrc.includes('trackPurchase(')
      && !confirmSlice.includes('trackPurchase(')
      && !confirmSlice.includes("emit('purchase'")
      && ordersSrc.includes("rpc('confirm_pending_order'")
      && !createSql.includes("'purchase'")
      && !createSql.includes('purchase_count')
      && confirmSql.includes("'purchase'")
      && confirmSql.includes('purchase_count'),
    'checkout keeps begin_checkout; browser purchase is absent; confirm RPC owns purchase analytics'
  );

  const port = await reserveLocalPort();
  const docker = await run('docker', ['version']).catch(() => ({ code: 1, out: 'docker is not available' }));
  if (docker.code === 0) {
    await run('docker', ['rm', '-f', CONTAINER]).catch(() => {});
    const started = await run('docker', [
      'run', '-d', '--name', CONTAINER,
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
      '-p', `127.0.0.1:${port}:5432`,
      'postgres:16',
    ]);
    if (started.code !== 0) {
      throw new Error(`Docker could not start a local Postgres. Refusing any remote database.\n${started.out.slice(0, 400)}`);
    }
    connectionUrl = `postgres://postgres@127.0.0.1:${port}/postgres`;
  } else {
    await startThrowawayCluster(port);
  }
  assertLocal(connectionUrl);

  let client;
  try {
    await waitForDb();
    client = new pg.Client({ connectionString: connectionUrl });
    await client.connect();
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
      END $$;
    `);
    await applySql(client, 'schema.sql');
    await applySql(client, 'phase10_rls_hardening_migration.sql');

    const customer = (await client.query(
      `INSERT INTO customers (full_name, phone, normalized_phone, email)
       VALUES ('Historical', '+237600000001', '237600000001', 'hist@example.com')
       RETURNING id`
    )).rows[0];
    const legacyProduct = (await client.query(
      `INSERT INTO products (name, slug, price, stock_quantity, active, hidden)
       VALUES ('Legacy Bottle', 'legacy-bottle', 10000, 4, true, false)
       RETURNING id`
    )).rows[0];
    const legacyOrder = (await client.query(
      `INSERT INTO orders (order_number, total, status, customer_id, customer_name, whatsapp_number)
       VALUES ('KS-LEGACY-1', 10000, 'Pending', $1, 'Historical', '+237600000001')
       RETURNING id`,
      [customer.id]
    )).rows[0];
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
       VALUES ($1, $2, 'Legacy Bottle', 1, 10000)`,
      [legacyOrder.id, legacyProduct.id]
    );

    await applySql(client, 'phase12_pending_confirm_lifecycle.sql');

    const afterMigration = await stockOf(client, legacyProduct.id);
    const policy = (await client.query('SELECT stock_policy, status FROM orders WHERE id = $1', [legacyOrder.id])).rows[0];
    check(
      'historical-untouched',
      afterMigration.stock_quantity === 4 && policy.stock_policy === null && policy.status === 'Pending',
      `stock ${afterMigration.stock_quantity}, policy ${policy.stock_policy}`
    );

    const legacyConfirm = await expectError(() => client.query('SELECT confirm_pending_order($1)', [legacyOrder.id]));
    const legacyEdit = await expectError(() => client.query(
      'SELECT update_pending_order($1, $2::jsonb)',
      [legacyOrder.id, JSON.stringify([{ product_id: legacyProduct.id, quantity: 2 }])]
    ));
    const legacyStock = await stockOf(client, legacyProduct.id);
    check(
      'historical-confirm-blocked',
      codeOf(legacyConfirm) === 'LEGACY_RESERVED_ORDER'
        && codeOf(legacyEdit) === 'LEGACY_RESERVED_ORDER'
        && legacyStock.stock_quantity === 4,
      `${codeOf(legacyConfirm)} / ${codeOf(legacyEdit)}`
    );

    const alpha = (await client.query(
      `INSERT INTO products (name, slug, price, stock_quantity, active, hidden)
       VALUES ('Alpha', 'alpha', 15000, 5, true, false) RETURNING id, price`
    )).rows[0];
    const beta = (await client.query(
      `INSERT INTO products (name, slug, price, stock_quantity, active, hidden)
       VALUES ('Beta', 'beta', 20000, 1, true, false) RETURNING id, price`
    )).rows[0];
    const zero = (await client.query(
      `INSERT INTO products (name, slug, price, stock_quantity, active, hidden)
       VALUES ('Zero', 'zero', 8000, 0, true, false) RETURNING id`
    )).rows[0];

    const created = (await client.query(
      `SELECT create_pending_order($1,$2,$3,$4,$5::jsonb,$6) AS result`,
      [
        customer.id,
        'Historical',
        '+237600000001',
        'KS-NEW-1',
        JSON.stringify([{
          product_id: alpha.id,
          quantity: 2,
          price: 1,
          product_name: 'FAKE NAME',
          total: 1,
        }]),
        'hist@example.com',
      ]
    )).rows[0].result;
    const alphaAfterCreate = await stockOf(client, alpha.id);
    const eventsAfterCreate = await purchaseEvents(client, alpha.id);
    check('A-pending-no-stock-change', created.status === 'Pending' && alphaAfterCreate.stock_quantity === 5 && alphaAfterCreate.purchase_count === 0 && eventsAfterCreate === 0);
    check('B-fake-price-ignored', Number(created.items[0].price) === 15000 && created.items[0].product_name === 'Alpha');
    check('C-fake-total-ignored', Number(created.total) === 30000);

    const edited = (await client.query(
      `SELECT update_pending_order($1, $2::jsonb) AS result`,
      [created.id, JSON.stringify([
        { product_id: alpha.id, quantity: 1, price: 5, product_name: 'NOPE' },
        { product_id: alpha.id, quantity: 2 },
      ])]
    )).rows[0].result;
    const alphaAfterEdit = await stockOf(client, alpha.id);
    const itemCount = (await client.query('SELECT COUNT(*)::int AS n, SUM(quantity)::int AS qty FROM order_items WHERE order_id = $1', [created.id])).rows[0];
    check('D-edit-quantity', Number(edited.total) === 45000 && itemCount.n === 1 && itemCount.qty === 3 && alphaAfterEdit.stock_quantity === 5 && alphaAfterEdit.purchase_count === 0 && edited.items[0].product_name === 'Alpha', `total ${edited.total} qty ${itemCount.qty}`);

    const removed = (await client.query(
      `SELECT update_pending_order($1, $2::jsonb) AS result`,
      [created.id, JSON.stringify([{ product_id: alpha.id, quantity: 1 }])]
    )).rows[0].result;
    check('E-remove-item', removed.items.length === 1 && Number(removed.total) === 15000 && (await stockOf(client, alpha.id)).stock_quantity === 5);

    const added = (await client.query(
      `SELECT update_pending_order($1, $2::jsonb) AS result`,
      [created.id, JSON.stringify([
        { product_id: alpha.id, quantity: 1 },
        { product_id: zero.id, quantity: 1, price: 1 },
      ])]
    )).rows[0].result;
    const zeroStock = await stockOf(client, zero.id);
    check('F-add-item-even-if-no-stock', added.items.length === 2 && Number(added.total) === 23000 && zeroStock.stock_quantity === 0 && (await purchaseEvents(client, zero.id)) === 0);

    const confirmZero = await expectError(() => client.query('SELECT confirm_pending_order($1)', [created.id]));
    const pendingStill = (await client.query('SELECT status FROM orders WHERE id = $1', [created.id])).rows[0];
    check(
      'H-confirm-insufficient',
      codeOf(confirmZero) === 'INSUFFICIENT_STOCK' && pendingStill.status === 'Pending' && (await stockOf(client, alpha.id)).stock_quantity === 5 && (await stockOf(client, zero.id)).stock_quantity === 0,
      codeOf(confirmZero)
    );

    await client.query(
      `SELECT update_pending_order($1, $2::jsonb)`,
      [created.id, JSON.stringify([{ product_id: alpha.id, quantity: 1 }])]
    );
    await client.query('UPDATE products SET active = false WHERE id = $1', [alpha.id]);
    const inactive = await expectError(() => client.query('SELECT confirm_pending_order($1)', [created.id]));
    check('J-inactive', codeOf(inactive) === 'PRODUCT_INACTIVE' && (await client.query('SELECT status FROM orders WHERE id = $1', [created.id])).rows[0].status === 'Pending' && (await stockOf(client, alpha.id)).stock_quantity === 5, codeOf(inactive));

    await client.query('UPDATE products SET active = true, hidden = true WHERE id = $1', [alpha.id]);
    const hidden = await expectError(() => client.query('SELECT confirm_pending_order($1)', [created.id]));
    check('K-hidden', codeOf(hidden) === 'PRODUCT_HIDDEN' && (await stockOf(client, alpha.id)).stock_quantity === 5, codeOf(hidden));

    await client.query('UPDATE products SET hidden = false WHERE id = $1', [alpha.id]);
    const gamma = (await client.query(
      `INSERT INTO products (name, slug, price, stock_quantity, active, hidden)
       VALUES ('Gamma', 'gamma', 4000, 0, true, false) RETURNING id`
    )).rows[0];
    const mixedOrder = (await client.query(
      `SELECT create_pending_order($1,$2,$3,$4,$5::jsonb,NULL) AS result`,
      [customer.id, 'Historical', '+237600000001', 'KS-MIX', JSON.stringify([
        { product_id: alpha.id, quantity: 1 },
        { product_id: gamma.id, quantity: 1 },
      ])]
    )).rows[0].result;
    const beforeMixed = await stockOf(client, alpha.id);
    const mixedFail = await expectError(() => client.query('SELECT confirm_pending_order($1)', [mixedOrder.id]));
    const afterMixed = await stockOf(client, alpha.id);
    check(
      'I-no-partial-deduction',
      codeOf(mixedFail) === 'INSUFFICIENT_STOCK' && beforeMixed.stock_quantity === afterMixed.stock_quantity && (await client.query('SELECT status FROM orders WHERE id = $1', [mixedOrder.id])).rows[0].status === 'Pending',
      `stock ${beforeMixed.stock_quantity} -> ${afterMixed.stock_quantity}`
    );

    const confirmed = (await client.query('SELECT confirm_pending_order($1) AS result', [created.id])).rows[0].result;
    const alphaSold = await stockOf(client, alpha.id);
    const events = await purchaseEvents(client, alpha.id);
    check('G-confirm-once', confirmed.status === 'Confirmed' && Number(confirmed.total) === 15000 && alphaSold.stock_quantity === 4 && events === 1 && alphaSold.purchase_count === 1);

    const second = await expectError(() => client.query('SELECT confirm_pending_order($1)', [created.id]));
    const alphaTwice = await stockOf(client, alpha.id);
    check('L-double-confirm', codeOf(second) === 'ORDER_NOT_PENDING' && alphaTwice.stock_quantity === 4 && await purchaseEvents(client, alpha.id) === 1, codeOf(second));

    const orderA = (await client.query(
      `SELECT create_pending_order($1,$2,$3,$4,$5::jsonb,NULL) AS result`,
      [customer.id, 'Historical', '+237600000001', 'KS-RACE-A', JSON.stringify([{ product_id: beta.id, quantity: 1 }])]
    )).rows[0].result;
    const orderB = (await client.query(
      `SELECT create_pending_order($1,$2,$3,$4,$5::jsonb,NULL) AS result`,
      [customer.id, 'Historical', '+237600000001', 'KS-RACE-B', JSON.stringify([{ product_id: beta.id, quantity: 1 }])]
    )).rows[0].result;
    check('M-create-does-not-take-last-unit', (await stockOf(client, beta.id)).stock_quantity === 1);

    const pool = new pg.Pool({ connectionString: connectionUrl, max: 4 });
    const raced = await Promise.allSettled([
      pool.query('SELECT confirm_pending_order($1) AS result', [orderA.id]),
      pool.query('SELECT confirm_pending_order($1) AS result', [orderB.id]),
    ]);
    const betaAfter = await stockOf(client, beta.id);
    const statuses = (await client.query(
      'SELECT id, status FROM orders WHERE id = ANY($1::uuid[])',
      [[orderA.id, orderB.id]]
    )).rows;
    const wins = raced.filter((r) => r.status === 'fulfilled').length;
    const confirmedCount = statuses.filter((row) => row.status === 'Confirmed').length;
    const pendingCount = statuses.filter((row) => row.status === 'Pending').length;
    check(
      'M-one-winner',
      wins === 1 && confirmedCount === 1 && pendingCount === 1 && betaAfter.stock_quantity === 0 && betaAfter.purchase_count === 1,
      `wins ${wins} stock ${betaAfter.stock_quantity} statuses ${statuses.map((s) => s.status).join(',')}`
    );

    const lockOrder = (await client.query(
      `SELECT create_pending_order($1,$2,$3,$4,$5::jsonb,NULL) AS result`,
      [customer.id, 'Historical', '+237600000001', 'KS-LOCK', JSON.stringify([{ product_id: alpha.id, quantity: 1 }])]
    )).rows[0].result;
    const holder = await pool.connect();
    const waiter = await pool.connect();
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [lockOrder.id]);
    let confirmFinished = false;
    const waiting = waiter.query('SELECT confirm_pending_order($1) AS result', [lockOrder.id]).then((row) => {
      confirmFinished = true;
      return row;
    });
    await sleep(400);
    const blockedByLock = confirmFinished === false;
    await holder.query('ROLLBACK');
    await waiting;
    holder.release();
    waiter.release();
    const lockedStatus = (await client.query('SELECT status FROM orders WHERE id = $1', [lockOrder.id])).rows[0];
    check('N-order-row-lock', blockedByLock && lockedStatus.status === 'Confirmed', blockedByLock ? 'confirm waited' : 'confirm did not wait');

    const priv = await client.query(`
      SELECT
        has_function_privilege('anon', 'public.create_pending_order(uuid,text,text,text,jsonb,text)', 'execute') AS anon_create,
        has_function_privilege('authenticated', 'public.confirm_pending_order(uuid)', 'execute') AS auth_confirm,
        has_function_privilege('service_role', 'public.confirm_pending_order(uuid)', 'execute') AS service_confirm,
        has_function_privilege('anon', 'public.update_pending_order(uuid,jsonb)', 'execute') AS anon_update
    `);
    const rls = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname IN ('orders', 'order_items', 'products', 'customers', 'product_events')
    `);
    const privileges = priv.rows[0];
    const rlsOk = rls.rows.length === 5 && rls.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity);
    check(
      'security-execute-and-rls',
      privileges.anon_create === false
        && privileges.auth_confirm === false
        && privileges.anon_update === false
        && privileges.service_confirm === true
        && rlsOk,
      JSON.stringify(privileges)
    );

    await pool.end();
  } finally {
    await client?.end().catch(() => {});
    await stopLocalPostgres();
  }
}

main()
  .then(() => {
    const failed = results.filter((row) => !row.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    if (failed.length) process.exit(1);
  })
  .catch((error) => {
    console.error(error);
    stopLocalPostgres().finally(() => process.exit(1));
  });
