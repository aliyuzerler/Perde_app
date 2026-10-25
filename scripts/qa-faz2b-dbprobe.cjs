// Faz 2b QA yardımcı: test DB'sinde favoriler + son-vardiya bölümleri.
const { Client } = require('pg');

const URL = 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego_faz2b_test';

(async () => {
  const c = new Client({ connectionString: URL });
  await c.connect();

  const favs = await c.query(
    'SELECT u.email, c.slug FROM favorites f JOIN users u ON u.id=f."userId" JOIN contents c ON c.id=f."contentId" ORDER BY u.email, c.slug',
  );
  console.log('FAVORITES:', JSON.stringify(favs.rows, null, 1));

  const eps = await c.query(
    'SELECT c.slug, e."seasonNumber" AS s, e."episodeNumber" AS e, e."accessType" FROM episodes e JOIN contents c ON c.id=e."contentId" WHERE c.slug = \'son-vardiya\' ORDER BY e."seasonNumber", e."episodeNumber"',
  );
  console.log('SON-VARDIYA EPISODES:', JSON.stringify(eps.rows));

  const users = await c.query('SELECT email, role, status FROM users ORDER BY "createdAt" LIMIT 10');
  console.log('USERS:', JSON.stringify(users.rows));

  await c.end();
})().catch((err) => {
  console.error('PROBE HATASI:', err.message);
  process.exit(1);
});
