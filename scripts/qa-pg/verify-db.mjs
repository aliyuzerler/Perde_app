/**
 * QA doğrulaması: seed verisinin gerçekten PostgreSQL'de olduğunu kanıtla.
 * Açıkça verilen DATABASE_URL ile PrismaClient üzerinden sayar.
 * Kullanım: node verify-db.mjs postgresql://...
 */
import { PrismaClient } from '@prisma/client';

const url = process.argv[2];
if (!url || !url.startsWith('postgresql://')) {
  console.error('Kullanım: node verify-db.mjs postgresql://...');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

const categories = await prisma.category.findMany({
  orderBy: { sortOrder: 'asc' },
  select: { slug: true, nameTr: true, sortOrder: true },
});
const contents = await prisma.content.findMany({
  select: { slug: true, kind: true, accessType: true, status: true },
});
const episodes = await prisma.episode.findMany({
  select: { contentId: true, seasonNumber: true, episodeNumber: true },
});

console.log(JSON.stringify({ categories, contents, episodes }, null, 2));
console.log(
  `TOPLAM: kategori=${categories.length} icerik=${contents.length} bolum=${episodes.length}`,
);
await prisma.$disconnect();
