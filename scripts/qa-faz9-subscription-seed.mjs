/**
 * FAZ 9 runner yardımcı — hatırlatma testi için viewer'a +2 günde biten
 * aktif abonelik ekler (varsa geçen koşum kalıntısını temizler).
 * Kullanım: node qa-faz9-subscription-seed.mjs <DATABASE_URL>
 */
import { Client } from 'pg';

const url = process.argv[2];
if (!url?.startsWith('postgresql://')) {
  console.error('Kullanım: node qa-faz9-subscription-seed.mjs postgresql://...');
  process.exit(2);
}

const client = new Client({ connectionString: url });
await client.connect();

const viewer = await client.query("SELECT id FROM users WHERE email = 'viewer@perdego.dev'");
const plan = await client.query('SELECT id FROM plans ORDER BY "sortOrder" LIMIT 1');

if (viewer.rows.length === 0 || plan.rows.length === 0) {
  console.error('viewer veya plan bulunamadı');
  await client.end();
  process.exit(1);
}

await client.query("DELETE FROM subscriptions WHERE id LIKE 'qa9-reminder-sub-%'");
const subId = `qa9-reminder-sub-${Date.now().toString(36)}`;
await client.query(
  `INSERT INTO subscriptions (id, "userId", "planId", platform, status, "autoRenew", "currentPeriodEnd", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, 'IOS', 'ACTIVE', true, now() + interval '2 days', now(), now())`,
  [subId, viewer.rows[0].id, plan.rows[0].id],
);

console.log(JSON.stringify({ ok: true, subId }));
await client.end();
