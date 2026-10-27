// Run with PGLITE_MODULE pointing at a temporary installation of @electric-sql/pglite.
// In-memory PostgreSQL only; never reads production credentials or sends SMS.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const org = '11111111-1111-4111-8111-111111111111'
const user = '22222222-2222-4222-8222-222222222222'
const sale = n => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`
const phone = n => `+1702555${String(n).padStart(4, '0')}`
const run = (sql, args = []) => db.query(sql, args)
const rpc = async (name, n, recipient = phone(n), organization = org) =>
  (await run(`SELECT public.${name}($1::uuid,$2::uuid,$3::uuid,$4::text) AS result`, [organization, sale(n), user, recipient])).rows[0].result
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_app_meta_data jsonb);
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.customers(id uuid PRIMARY KEY, organization_id uuid, phone text,
      phone_normalized text, sms_consent_status text, archived boolean DEFAULT false);
    CREATE TABLE public.sales(id uuid PRIMARY KEY, organization_id uuid REFERENCES organizations,
      number integer, status text, total numeric, subtotal numeric, tax numeric, tip numeric,
      location_name text, linked_customer_id uuid, UNIQUE(id,organization_id));
    CREATE TABLE public.sale_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid REFERENCES sales,
      name text, qty integer, subtotal numeric, created_at timestamptz DEFAULT now());
    CREATE TABLE public.payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid REFERENCES sales, amount numeric);
  `)
  await db.exec(await readFile(new URL('../database/migration_receipt_queue.sql', import.meta.url), 'utf8'))
  await run('INSERT INTO organizations VALUES ($1)', [org])
  await run('INSERT INTO auth.users VALUES ($1,$2)', [user, JSON.stringify({ org_id: org })])
  for (let n = 1; n <= 9; n++) {
    await run("INSERT INTO sales VALUES ($1,$2,$3,'completed',108,100,8,0,'Fixture',NULL)", [sale(n), org, n])
    await run("INSERT INTO sale_items(sale_id,name,qty,subtotal) VALUES ($1,'Fixture perfume',1,100)", [sale(n)])
    await run('INSERT INTO payments(sale_id,amount) VALUES ($1,108)', [sale(n)])
  }
  const held = await rpc('enqueue_receipt', 1)
  await db.exec(await readFile(new URL('../database/migration_receipt_delivery.sql', import.meta.url), 'utf8'))
  assert.equal((await run('SELECT status FROM receipt_queue WHERE id=$1', [held.id])).rows[0].status, 'held')
  assert.equal((await run('SELECT * FROM claim_receipt_send($1)', [org])).rows.length, 0)
  console.log('PASS migration preserves held requests; worker cannot claim them')

  const released = await rpc('request_receipt_send', 1)
  assert.equal(released.id, held.id); assert.equal(released.status, 'pending')
  assert.equal((await rpc('request_receipt_send', 1)).id, held.id)
  assert.equal((await rpc('request_receipt_send', 1, phone(2))).error, 'recipient_conflict')
  console.log('PASS explicit release reuses existing row; repeated requests and recipient changes are safe')
  const claimed = (await run('SELECT * FROM claim_receipt_send($1,$2)', [org, phone(1)])).rows
  assert.equal(claimed.length, 1); assert.equal(claimed[0].attempts, 1)
  assert.equal(claimed[0].delivery_mode, 'live')
  assert.equal((await run('SELECT * FROM claim_receipt_send($1)', [org])).rows.length, 0)
  assert.equal((await rpc('request_receipt_send', 1)).status, 'processing')
  for (const status of ['sent', 'failed', 'uncertain', 'cancelled']) {
    await run('UPDATE receipt_queue SET status=$1 WHERE id=$2', [status, held.id])
    assert.equal((await rpc('request_receipt_send', 1)).status, status)
    assert.equal((await run('SELECT * FROM claim_receipt_send($1)', [org])).rows.length, 0)
  }
  console.log('PASS atomic claim increments once; terminal outcomes cannot be re-released')

  await rpc('request_receipt_send', 2)
  assert.equal((await run('SELECT * FROM claim_receipt_send($1,$2)', [org, phone(3)])).rows.length, 0)
  assert.equal((await run('SELECT * FROM claim_receipt_send($1)', [user])).rows.length, 0)
  assert.equal((await run('SELECT * FROM claim_receipt_send($1)', [org])).rows.length, 1)
  console.log('PASS organization and pilot recipient scopes enforced')
  await run("UPDATE sales SET status='voided' WHERE id=$1", [sale(3)])
  assert.equal((await rpc('request_receipt_send', 3)).error, 'sale_not_completed')
  await run('DELETE FROM payments WHERE sale_id=$1', [sale(4)])
  assert.equal((await rpc('request_receipt_send', 4)).error, 'sale_incomplete')
  await run("INSERT INTO customers VALUES (gen_random_uuid(),$1,$2,$2,'opted_out',false)", [org, phone(5)])
  assert.equal((await rpc('request_receipt_send', 5)).error, 'opted_out')
  assert.equal((await rpc('request_receipt_send', 6, phone(6), user)).error, 'organization_denied')
  console.log('PASS voided/incomplete sales, opt-outs and foreign identities rejected')
  for (let n = 6; n <= 9; n++) {
    await run(`INSERT INTO receipt_queue(organization_id,sale_id,requested_by_auth_user_id,
      requested_by_auth_user_snapshot,recipient,message_body,requested_at)
      VALUES ($1,$2,$3,$3,$4,'Old held fixture',now()-interval '2 days')`, [org, sale(n), user, phone(6)])
  }
  for (let n = 6; n <= 8; n++) assert.equal((await rpc('request_receipt_send', n, phone(6))).status, 'pending')
  assert.equal((await rpc('request_receipt_send', 9, phone(6))).error, 'rate_limit')
  console.log('PASS old held requests cannot bypass recipient release rate limit')
  for (const role of ['anon', 'authenticated']) {
    const result = (await run(`SELECT has_function_privilege($1,'public.request_receipt_send(uuid,uuid,uuid,text)','EXECUTE') AS release,
      has_function_privilege($1,'public.claim_receipt_send(uuid,text)','EXECUTE') AS claim`, [role])).rows[0]
    assert.deepEqual(result, { release: false, claim: false })
  }
  const allowed = (await run("SELECT has_function_privilege('service_role','public.request_receipt_send(uuid,uuid,uuid,text)','EXECUTE') AS allowed")).rows[0]
  assert.equal(allowed.allowed, true)
  console.log('PASS privileged RPCs denied to browser roles and granted to service_role')
} finally { await db.close() }
