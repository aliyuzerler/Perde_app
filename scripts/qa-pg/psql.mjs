/**
 * Mini psql yerine: SQL'i çalıştırır, sonucu JSON/tek satır olarak basar.
 * Kullanım:
 *   node psql.mjs "postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego" "SELECT 1"
 *   node psql.mjs <url> --file <sql-dosyasi>
 * Çoklu komut destekler (simple query protokolü).
 */
import pg from 'pg';

const args = process.argv.slice(2);
let url = args[0];
let sql = args[1];
if (args[2] === '--file') {
  const { readFileSync } = await import('node:fs');
  sql = readFileSync(args[3], 'utf8');
}
if (!url || !sql) {
  console.error('Kullanım: node psql.mjs <postgres-url> "<sql>" | --file <dosya>');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const res = await client.query(sql);
  const rows = Array.isArray(res) ? res[res.length - 1]?.rows : res.rows;
  if (rows && rows.length > 0) {
    console.log(JSON.stringify(rows, null, 1));
  }
  const count = Array.isArray(res)
    ? res.map((r) => r.command + ':' + r.rowCount).join(' | ')
    : res.command + ':' + res.rowCount;
  console.error(`[ok] ${count}`);
} finally {
  await client.end();
}
