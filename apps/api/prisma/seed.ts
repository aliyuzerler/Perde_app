/**
 * PerdeGo seed — Faz 2a altyapı doğrulama verisi.
 *
 * Özgün kurgu içerik kullanılır (telifli afiş/yapım yasak — Tasarım
 * Zorunlulukları). Idempotenttir: tekrar çalıştırmak güvenlidir (upsert).
 * Amaç: migration + Prisma istemcisi + temel veri akışını kanıtlamak.
 * Gerçek içerik yönetimi Faz 6 admin paneli ile yapılır.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // 1) Kategoriler
  const categories = [
    { slug: 'aksiyon', nameTr: 'Aksiyon', nameEn: 'Action', sortOrder: 1 },
    { slug: 'komedi', nameTr: 'Komedi', nameEn: 'Comedy', sortOrder: 2 },
    { slug: 'dram', nameTr: 'Dram', nameEn: 'Drama', sortOrder: 3 },
  ] as const;

  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { nameTr: c.nameTr, nameEn: c.nameEn, sortOrder: c.sortOrder },
      create: { ...c },
    });
  }

  // 2) Kurgu kısa film (tek bölüm)
  const shortFilm = await prisma.content.upsert({
    where: { slug: 'kayip-sinyal' },
    update: {},
    create: {
      slug: 'kayip-sinyal',
      kind: 'SHORT_FILM',
      titleTr: 'Kayıp Sinyal',
      titleEn: 'Lost Signal',
      synopsisTr:
        'Şehir dışına giden bir genç, telefonundaki garip bir sinyalin peşine düşer. Dikey çekim deneysel kısa film.',
      synopsisEn:
        'A young traveler follows a strange signal on her phone. An experimental vertical short film.',
      releaseYear: 2026,
      ageRating: '13+',
      accessType: 'FREE',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-01T09:00:00Z'),
      episodes: {
        create: [
          {
            seasonNumber: 1,
            episodeNumber: 1,
            titleTr: 'Kayıp Sinyal',
            titleEn: 'Lost Signal',
            durationSeconds: 640,
            accessType: 'FREE',
            status: 'PUBLISHED',
            publishedAt: new Date('2026-10-01T09:00:00Z'),
          },
        ],
      },
    },
  });

  // 3) Kurgu mini dizi (2 bölüm; 1. ücretsiz, 2. abonelik)
  const miniSeries = await prisma.content.upsert({
    where: { slug: 'son-vardiya' },
    update: {},
    create: {
      slug: 'son-vardiya',
      kind: 'SERIES',
      seriesFormat: 'MINI',
      titleTr: 'Son Vardiya',
      titleEn: 'Last Shift',
      synopsisTr:
        'Bir gece kulübünde çalışan barmen, şehrin altındaki sır ile yüzleşir. 3 bölümlük dikey mini dizi.',
      synopsisEn:
        'A bartender faces the secret beneath the city. A 3-episode vertical mini series.',
      releaseYear: 2026,
      ageRating: '16+',
      accessType: 'SUBSCRIPTION',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-10T09:00:00Z'),
      categories: {
        create: [{ category: { connect: { slug: 'dram' } } }],
      },
      episodes: {
        create: [
          {
            seasonNumber: 1,
            episodeNumber: 1,
            titleTr: 'Kapanış Saati',
            titleEn: 'Closing Time',
            durationSeconds: 512,
            accessType: 'FREE',
            status: 'PUBLISHED',
            publishedAt: new Date('2026-10-10T09:00:00Z'),
          },
          {
            seasonNumber: 1,
            episodeNumber: 2,
            titleTr: 'Bodrum Kat',
            titleEn: 'The Basement',
            durationSeconds: 498,
            accessType: 'SUBSCRIPTION',
            status: 'PUBLISHED',
            publishedAt: new Date('2026-10-10T09:05:00Z'),
          },
        ],
      },
    },
  });

  // 4) Kısa filmi "aksiyon" kategorisine bağla (idempotent)
  const aksiyon = await prisma.category.findUniqueOrThrow({
    where: { slug: 'aksiyon' },
  });
  await prisma.contentCategory.upsert({
    where: {
      contentId_categoryId: {
        contentId: shortFilm.id,
        categoryId: aksiyon.id,
      },
    },
    update: {},
    create: { contentId: shortFilm.id, categoryId: aksiyon.id },
  });

  console.log(
    `Seed tamam: ${categories.length} kategori, 2 içerik (${shortFilm.slug}, ${miniSeries.slug})`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('Seed başarısız:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
