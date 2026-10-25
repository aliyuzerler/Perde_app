/**
 * PerdeGo seed — Faz 2b tam alan verisi.
 *
 * İlkeler:
 *  - ÖZGÜN kurgu içerik (telifli afiş/yapım yasak); görseller API'nin kendi
 *    deterministik SVG placeholder'larına işaret eder (telifsiz).
 *  - Idempotent: tekrar çalıştırmak güvenlidir (upsert; ledger yalnızca
 *    idempotencyKey ile bir kez yazılır).
 *  - Kural 1 doğrulaması: cüzdan bakiyeleri ledger toplamından üretilir.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

const poster = (slug: string) => `/placeholders/poster/${slug}.svg`;
const hero = (slug: string) => `/placeholders/hero/${slug}.svg`;
const vertical = (slug: string) => `/placeholders/vertical/${slug}.svg`;
const bannerImg = (slug: string) => `/placeholders/banner/${slug}.svg`;

async function main(): Promise<void> {
  // 0) Admin kullanıcı şifreleri (yalnızca geliştirme/seed hesapları)
  const viewerPassword = await hash('Dev12345');
  const adminPassword = await hash('Admin12345');

  // 1) Kategoriler ------------------------------------------------------------
  const categories = [
    { slug: 'aksiyon', nameTr: 'Aksiyon', nameEn: 'Action', sortOrder: 1 },
    { slug: 'komedi', nameTr: 'Komedi', nameEn: 'Comedy', sortOrder: 2 },
    { slug: 'dram', nameTr: 'Dram', nameEn: 'Drama', sortOrder: 3 },
    { slug: 'gerilim', nameTr: 'Gerilim', nameEn: 'Thriller', sortOrder: 4 },
    { slug: 'romantik', nameTr: 'Romantik', nameEn: 'Romance', sortOrder: 5 },
  ] as const;
  for (const c of categories) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { nameTr: c.nameTr, nameEn: c.nameEn, sortOrder: c.sortOrder },
      create: { ...c },
    });
  }

  // 2) Kadro (özgün isimler) ---------------------------------------------------
  const cast = [
    { id: 'cast_elif-demir', fullName: 'Elif Demir', role: 'ACTOR' as const },
    { id: 'cast_kaan-arslan', fullName: 'Kaan Arslan', role: 'ACTOR' as const },
    { id: 'cast_zeynep-yildiz', fullName: 'Zeynep Yıldız', role: 'ACTOR' as const },
    { id: 'cast_mert-ozkan', fullName: 'Mert Özkan', role: 'DIRECTOR' as const },
  ];
  for (const member of cast) {
    await prisma.castMember.upsert({ where: { id: member.id }, update: {}, create: member });
  }

  // 3) Planlar + kredi paketleri ------------------------------------------------
  const plans = [
    {
      code: 'SUB_MONTHLY',
      titleTr: 'Aylık Abonelik',
      titleEn: 'Monthly Subscription',
      billingPeriod: 'MONTHLY' as const,
      priceKurus: 4990,
      trialDays: 7,
      platformProductIdIos: 'perdego.sub.monthly',
      platformProductIdAndroid: 'perdego.sub.monthly',
      sortOrder: 1,
    },
    {
      code: 'SUB_YEARLY',
      titleTr: 'Yıllık Abonelik',
      titleEn: 'Yearly Subscription',
      billingPeriod: 'YEARLY' as const,
      priceKurus: 39990,
      trialDays: 0,
      platformProductIdIos: 'perdego.sub.yearly',
      platformProductIdAndroid: 'perdego.sub.yearly',
      sortOrder: 2,
    },
  ];
  for (const plan of plans) {
    await prisma.plan.upsert({ where: { code: plan.code }, update: { ...plan }, create: { ...plan } });
  }

  const packs = [
    { code: 'PACK_10', credits: 10, bonusCredits: 0, priceKurus: 2990, sortOrder: 1 },
    { code: 'PACK_25', credits: 25, bonusCredits: 5, priceKurus: 5990, sortOrder: 2 },
    { code: 'PACK_60', credits: 60, bonusCredits: 15, priceKurus: 9990, sortOrder: 3 },
  ];
  for (const pack of packs) {
    await prisma.creditPack.upsert({
      where: { code: pack.code },
      update: { ...pack },
      create: {
        ...pack,
        platformProductIdIos: `perdego.pack.${pack.code.toLowerCase()}`,
        platformProductIdAndroid: `perdego.pack.${pack.code.toLowerCase()}`,
      },
    });
  }

  // 4) Kurgu içerikler -----------------------------------------------------------
  // 4a) Kayıp Sinyal — kısa film (FREE)
  await prisma.content.upsert({
    where: { slug: 'kayip-sinyal' },
    update: {
      posterUrl: poster('kayip-sinyal'),
      heroImageUrl: hero('kayip-sinyal'),
      verticalPreviewUrl: vertical('kayip-sinyal'),
      taglineTr: 'Sinyal kesildi. Hikâye başladı.',
    },
    create: {
      slug: 'kayip-sinyal',
      kind: 'SHORT_FILM',
      titleTr: 'Kayıp Sinyal',
      titleEn: 'Lost Signal',
      synopsisTr:
        'Şehir dışına giden bir genç, telefonundaki garip bir sinyalin peşine düşer. Dikey çekim deneysel kısa film.',
      synopsisEn:
        'A young traveler follows a strange signal on her phone. An experimental vertical short film.',
      taglineTr: 'Sinyal kesildi. Hikâye başladı.',
      releaseYear: 2026,
      ageRating: '13+',
      durationSeconds: 640,
      posterUrl: poster('kayip-sinyal'),
      heroImageUrl: hero('kayip-sinyal'),
      verticalPreviewUrl: vertical('kayip-sinyal'),
      accessType: 'FREE',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-01T09:00:00Z'),
      categories: { create: [{ categoryId: (await cat('aksiyon')).id }, { categoryId: (await cat('gerilim')).id }] },
      castMembers: { create: [{ castMemberId: 'cast_zeynep-yildiz', sortOrder: 1 }, { castMemberId: 'cast_mert-ozkan', sortOrder: 2 }] },
    },
  });

  // 4b) Son Vardiya — mini dizi (abonelik)
  await prisma.content.upsert({
    where: { slug: 'son-vardiya' },
    update: {
      posterUrl: poster('son-vardiya'),
      heroImageUrl: hero('son-vardiya'),
      verticalPreviewUrl: vertical('son-vardiya'),
    },
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
      posterUrl: poster('son-vardiya'),
      heroImageUrl: hero('son-vardiya'),
      verticalPreviewUrl: vertical('son-vardiya'),
      accessType: 'SUBSCRIPTION',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-10T09:00:00Z'),
      categories: { create: [{ categoryId: (await cat('gerilim')).id }, { categoryId: (await cat('dram')).id }] },
      castMembers: { create: [{ castMemberId: 'cast_kaan-arslan', sortOrder: 1 }] },
    },
  });

  // 4c) Gizli Bahçe — standart dizi, 2 sezon, kredili bölümler (CREDIT)
  await prisma.content.upsert({
    where: { slug: 'gizli-bahce' },
    update: {
      posterUrl: poster('gizli-bahce'),
      verticalPreviewUrl: vertical('gizli-bahce'),
    },
    create: {
      slug: 'gizli-bahce',
      kind: 'SERIES',
      seriesFormat: 'STANDARD',
      titleTr: 'Gizli Bahçe',
      titleEn: 'The Secret Garden',
      synopsisTr:
        'Şehir ortasındaki terk edilmiş bir evin arkasında açan gizemli bahçe, komşuların sırlarını çiçek gibi açar.',
      synopsisEn:
        'A mysterious garden behind an abandoned house reveals the neighbors’ secrets.',
      releaseYear: 2025,
      ageRating: '7+',
      posterUrl: poster('gizli-bahce'),
      heroImageUrl: hero('gizli-bahce'),
      verticalPreviewUrl: vertical('gizli-bahce'),
      accessType: 'CREDIT',
      status: 'PUBLISHED',
      publishedAt: new Date('2025-11-05T09:00:00Z'),
      categories: { create: [{ categoryId: (await cat('dram')).id }, { categoryId: (await cat('romantik')).id }] },
      castMembers: { create: [{ castMemberId: 'cast_elif-demir', sortOrder: 1 }] },
    },
  });

  // 4d) Yankı — film (FREE)
  await prisma.content.upsert({
    where: { slug: 'yanki' },
    update: { posterUrl: poster('yanki') },
    create: {
      slug: 'yanki',
      kind: 'FILM',
      titleTr: 'Yankı',
      titleEn: 'Echo',
      synopsisTr:
        'Terk edilmiş bir vokal stüdyosunda kaydedilen ses kayıtları, bir şarkının tamamlanmasını bekler.',
      synopsisEn: 'Vocal recordings left in an abandoned studio wait for a song to be finished.',
      releaseYear: 2024,
      ageRating: '7+',
      durationSeconds: 5200,
      posterUrl: poster('yanki'),
      heroImageUrl: hero('yanki'),
      verticalPreviewUrl: vertical('yanki'),
      accessType: 'FREE',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-09-20T09:00:00Z'),
      categories: { create: [{ categoryId: (await cat('dram')).id }] },
    },
  });

  // 4e) Gece Yarısı Treni — mini dizi (abonelik; 3 bölüm)
  await prisma.content.upsert({
    where: { slug: 'gece-yarisi-treni' },
    update: { posterUrl: poster('gece-yarisi-treni') },
    create: {
      slug: 'gece-yarisi-treni',
      kind: 'SERIES',
      seriesFormat: 'MINI',
      titleTr: 'Gece Yarısı Treni',
      titleEn: 'Midnight Train',
      synopsisTr:
        'Her gece yarısı kalkan bir banliyö treninde yolcular aynı rüyayı paylaşır. Dikey mini dizi.',
      synopsisEn: 'Commuters on a midnight train share the same dream. A vertical mini series.',
      releaseYear: 2026,
      ageRating: '13+',
      posterUrl: poster('gece-yarisi-treni'),
      heroImageUrl: hero('gece-yarisi-treni'),
      verticalPreviewUrl: vertical('gece-yarisi-treni'),
      accessType: 'SUBSCRIPTION',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-18T09:00:00Z'),
      categories: { create: [{ categoryId: (await cat('gerilim')).id }, { categoryId: (await cat('komedi')).id }] },
    },
  });

  // 4f) Sessiz Şehir — film (kredili)
  await prisma.content.upsert({
    where: { slug: 'sessiz-sehir' },
    update: { posterUrl: poster('sessiz-sehir') },
    create: {
      slug: 'sessiz-sehir',
      kind: 'FILM',
      titleTr: 'Sessiz Şehir',
      titleEn: 'Silent City',
      synopsisTr:
        'Şehirde herkes bir gün susarsa, ilk konuşan kaybeder. Kredili dikey uzun metraj denemesi.',
      synopsisEn: 'If the whole city goes quiet for a day, the first to speak loses.',
      releaseYear: 2025,
      ageRating: '16+',
      durationSeconds: 4900,
      posterUrl: poster('sessiz-sehir'),
      verticalPreviewUrl: vertical('sessiz-sehir'),
      accessType: 'CREDIT',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-08-15T09:00:00Z'),
      categories: { create: [{ categoryId: (await cat('gerilim')).id }] },
    },
  });

  // 4g) Yeni Başlangıç — TASLAK (Kural 6 kanıtı: herkese açık uçlarda görünmez)
  await prisma.content.upsert({
    where: { slug: 'yeni-baslangic' },
    update: {},
    create: {
      slug: 'yeni-baslangic',
      kind: 'SERIES',
      seriesFormat: 'STANDARD',
      titleTr: 'Yeni Başlangıç',
      titleEn: 'A New Beginning',
      synopsisTr: 'Yayına hazır olmayan taslak dizi — yalnızca admin uçlarında görünür.',
      synopsisEn: 'Draft series — visible only through admin endpoints.',
      releaseYear: 2026,
      ageRating: '13+',
      posterUrl: poster('yeni-baslangic'),
      accessType: 'SUBSCRIPTION',
      status: 'DRAFT',
      categories: { create: [{ categoryId: (await cat('dram')).id }] },
    },
  });

  // 5) Bölüm tanımları → sezonlar → bölümler (sıra FK zorunluluğu) -----------
  // Bölümler seasons satırına bileşik FK ile bağlanır; bu yüzden önce
  // içerik, sonra sezon, en son bölüm yazılır.
  const EPISODE_SPECS: Array<{
    slug: string;
    seasonNumber: number;
    episodeNumber: number;
    titleTr: string;
    titleEn: string;
    durationSeconds: number;
    accessType: 'FREE' | 'SUBSCRIPTION' | 'CREDIT';
    creditCost?: number;
    status?: 'DRAFT' | 'PUBLISHED';
  }> = [
    { slug: 'kayip-sinyal', seasonNumber: 1, episodeNumber: 1, titleTr: 'Kayıp Sinyal', titleEn: 'Lost Signal', durationSeconds: 640, accessType: 'FREE' },
    { slug: 'son-vardiya', seasonNumber: 1, episodeNumber: 1, titleTr: 'Kapanış Saati', titleEn: 'Closing Time', durationSeconds: 512, accessType: 'FREE' },
    { slug: 'son-vardiya', seasonNumber: 1, episodeNumber: 2, titleTr: 'Bodrum Kat', titleEn: 'The Basement', durationSeconds: 498, accessType: 'SUBSCRIPTION' },
    { slug: 'son-vardiya', seasonNumber: 1, episodeNumber: 3, titleTr: 'Son Çıkış', titleEn: 'The Last Exit', durationSeconds: 540, accessType: 'SUBSCRIPTION' },
    { slug: 'gizli-bahce', seasonNumber: 1, episodeNumber: 1, titleTr: 'Tohum', titleEn: 'The Seed', durationSeconds: 480, accessType: 'CREDIT', creditCost: 2 },
    { slug: 'gizli-bahce', seasonNumber: 1, episodeNumber: 2, titleTr: 'Sulama', titleEn: 'Watering', durationSeconds: 465, accessType: 'CREDIT', creditCost: 2 },
    { slug: 'gizli-bahce', seasonNumber: 2, episodeNumber: 1, titleTr: 'Çiçeklenme', titleEn: 'Blooming', durationSeconds: 510, accessType: 'CREDIT', creditCost: 3 },
    { slug: 'yanki', seasonNumber: 1, episodeNumber: 1, titleTr: 'Yankı', titleEn: 'Echo', durationSeconds: 5200, accessType: 'FREE' },
    { slug: 'gece-yarisi-treni', seasonNumber: 1, episodeNumber: 1, titleTr: 'Peron 3', titleEn: 'Platform 3', durationSeconds: 420, accessType: 'FREE' },
    { slug: 'gece-yarisi-treni', seasonNumber: 1, episodeNumber: 2, titleTr: 'Yolcu Listesi', titleEn: 'Passenger List', durationSeconds: 445, accessType: 'SUBSCRIPTION' },
    { slug: 'gece-yarisi-treni', seasonNumber: 1, episodeNumber: 3, titleTr: 'Son Durak', titleEn: 'Terminus', durationSeconds: 470, accessType: 'SUBSCRIPTION' },
    { slug: 'sessiz-sehir', seasonNumber: 1, episodeNumber: 1, titleTr: 'Sessiz Şehir', titleEn: 'Silent City', durationSeconds: 4900, accessType: 'CREDIT', creditCost: 4 },
    { slug: 'yeni-baslangic', seasonNumber: 1, episodeNumber: 1, titleTr: 'Pilot (taslak)', titleEn: 'Pilot (draft)', durationSeconds: 400, accessType: 'SUBSCRIPTION', status: 'DRAFT' },
  ];

  for (const content of await prisma.content.findMany()) {
    const seasonNumbers = [...new Set(EPISODE_SPECS.filter((e) => e.slug === content.slug).map((e) => e.seasonNumber))];
    for (const seasonNumber of seasonNumbers) {
      await prisma.season.upsert({
        where: { contentId_seasonNumber: { contentId: content.id, seasonNumber } },
        update: {},
        create: {
          contentId: content.id,
          seasonNumber,
          titleTr: `${seasonNumber}. Sezon`,
          titleEn: `Season ${seasonNumber}`,
        },
      });
    }
  }

  for (const spec of EPISODE_SPECS) {
    const content = await prisma.content.findUniqueOrThrow({ where: { slug: spec.slug }, select: { id: true } });
    await prisma.episode.upsert({
      where: {
        contentId_seasonNumber_episodeNumber: {
          contentId: content.id,
          seasonNumber: spec.seasonNumber,
          episodeNumber: spec.episodeNumber,
        },
      },
      update: {
        titleTr: spec.titleTr,
        titleEn: spec.titleEn,
        durationSeconds: spec.durationSeconds,
        accessType: spec.accessType,
        creditCost: spec.creditCost,
        status: spec.status ?? 'PUBLISHED',
      },
      create: {
        contentId: content.id,
        seasonNumber: spec.seasonNumber,
        episodeNumber: spec.episodeNumber,
        titleTr: spec.titleTr,
        titleEn: spec.titleEn,
        synopsisTr: `${spec.titleTr} — dikey bölüm.`,
        synopsisEn: `${spec.titleEn} — vertical episode.`,
        durationSeconds: spec.durationSeconds,
        accessType: spec.accessType,
        creditCost: spec.creditCost,
        status: spec.status ?? 'PUBLISHED',
        publishedAt: spec.status === 'DRAFT' ? null : new Date('2026-10-18T09:00:00Z'),
      },
    });
  }

  // 6) Medya asset'leri (READY) --------------------------------------------------
  for (const episode of await prisma.episode.findMany()) {
    await prisma.episodeMedia.upsert({
      where: { episodeId_provider_providerAssetId: { episodeId: episode.id, provider: 'BUNNY', providerAssetId: `seed-${episode.id}` } },
      update: { state: 'READY', durationSeconds: episode.durationSeconds },
      create: {
        episodeId: episode.id,
        provider: 'BUNNY',
        providerAssetId: `seed-${episode.id}`,
        state: 'READY',
        durationSeconds: episode.durationSeconds,
      },
    });
  }

  // 6) Ana sayfa düzeni: banner'lar + bölümler ----------------------------------
  await prisma.banner.upsert({
    where: { slug: 'yeni-sezon-banner' },
    update: { imageUrl: bannerImg('gece-yarisi-treni') },
    create: {
      slug: 'yeni-sezon-banner',
      titleTr: 'Gece Yarısı Treni yayında',
      titleEn: 'Midnight Train is live',
      subtitleTr: 'Üç bölümlük yeni mini dizi',
      subtitleEn: 'A brand-new three-part mini series',
      imageUrl: bannerImg('gece-yarisi-treni'),
      targetContent: { connect: { slug: 'gece-yarisi-treni' } },
      sortOrder: 1,
    },
  });
  await prisma.banner.upsert({
    where: { slug: 'kredi-kampanya-banner' },
    update: { imageUrl: bannerImg('gizli-bahce') },
    create: {
      slug: 'kredi-kampanya-banner',
      titleTr: 'Krediyle aç, dilediğin zaman izle',
      titleEn: 'Unlock with credits, watch anytime',
      imageUrl: bannerImg('gizli-bahce'),
      targetContent: { connect: { slug: 'gizli-bahce' } },
      sortOrder: 2,
    },
  });

  const contentBySlug = (slug: string) =>
    prisma.content.findUniqueOrThrow({ where: { slug }, select: { id: true } });

  const heroSection = await prisma.homeSection.upsert({
    where: { key: 'hero' },
    update: {},
    create: { key: 'hero', sectionType: 'HERO', titleTr: 'Öne Çıkan', titleEn: 'Featured', sortOrder: 0 },
  });
  await linkItems(heroSection.id, [{ slug: 'kayip-sinyal', order: 1 }]);

  const yeniSection = await prisma.homeSection.upsert({
    where: { key: 'yeni-eklenenler' },
    update: {},
    create: { key: 'yeni-eklenenler', sectionType: 'RAIL', titleTr: 'Yeni Eklenenler', titleEn: 'New Releases', sortOrder: 1 },
  });
  await linkItems(yeniSection.id, [
    { slug: 'gece-yarisi-treni', order: 1 },
    { slug: 'son-vardiya', order: 2 },
    { slug: 'kayip-sinyal', order: 3 },
    { slug: 'yanki', order: 4 },
    { slug: 'sessiz-sehir', order: 5 },
    { slug: 'gizli-bahce', order: 6 },
  ]);

  const miniSection = await prisma.homeSection.upsert({
    where: { key: 'mini-diziler' },
    update: {},
    create: { key: 'mini-diziler', sectionType: 'RAIL', titleTr: 'Mini Diziler', titleEn: 'Mini Series', sortOrder: 2 },
  });
  await linkItems(miniSection.id, [
    { slug: 'son-vardiya', order: 1 },
    { slug: 'gece-yarisi-treni', order: 2 },
    { slug: 'gizli-bahce', order: 3 },
  ]);

  const dramGrid = await prisma.homeSection.upsert({
    where: { key: 'dram-kesfeti' },
    update: {},
    create: {
      key: 'dram-kesfeti',
      sectionType: 'CATEGORY_GRID',
      titleTr: 'Dram',
      titleEn: 'Drama',
      categoryId: (await cat('dram')).id,
      sortOrder: 3,
    },
  });
  void dramGrid;

  // 7) Demo kullanıcılar ---------------------------------------------------------
  const admin = await prisma.user.upsert({
    where: { email: 'admin@perdego.dev' },
    update: { role: 'ADMIN', passwordHash: adminPassword, emailVerifiedAt: new Date() },
    create: {
      email: 'admin@perdego.dev',
      passwordHash: adminPassword,
      displayName: 'PerdeGo Admin',
      role: 'ADMIN',
      locale: 'tr',
      // Demo hesaplar Faz 3b'den beri doğrulanmış doğar (giriş akışı bozulmaz).
      emailVerifiedAt: new Date(),
      creditWallet: { create: { purchasedBalance: 0, grantedBalance: 0 } },
      notificationPreference: { create: {} },
    },
  });

  await prisma.user.upsert({
    where: { email: 'editor@perdego.dev' },
    update: { role: 'EDITOR', passwordHash: adminPassword, emailVerifiedAt: new Date() },
    create: {
      email: 'editor@perdego.dev',
      passwordHash: adminPassword,
      displayName: 'PerdeGo Editör',
      role: 'EDITOR',
      locale: 'tr',
      emailVerifiedAt: new Date(),
      creditWallet: { create: { purchasedBalance: 0, grantedBalance: 0 } },
      notificationPreference: { create: {} },
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@perdego.dev' },
    update: { passwordHash: viewerPassword, emailVerifiedAt: new Date() },
    create: {
      email: 'viewer@perdego.dev',
      passwordHash: viewerPassword,
      displayName: 'Demo İzleyici',
      role: 'USER',
      locale: 'tr',
      birthYear: 1995,
      emailVerifiedAt: new Date(),
      creditWallet: { create: { purchasedBalance: 0, grantedBalance: 0 } },
      notificationPreference: { create: {} },
    },
  });

  // 8) Demo izleyici cüzdanı: GRANT 20 hediye + PURCHASE 12 satın alma,
  //    2 kredilik bölüm açımı (ledger'dan cüzdan türetimi kanıtlanır).
  await prisma.creditLedger.upsert({
    where: { idempotencyKey: 'seed:grant:viewer:welcome' },
    update: {},
    create: {
      userId: viewer.id,
      type: 'GRANT',
      delta: 20,
      purchasedDelta: 0,
      grantedDelta: 20,
      balanceAfterPurchased: 0,
      balanceAfterGranted: 20,
      referenceType: 'WEBHOOK',
      referenceId: 'seed',
      idempotencyKey: 'seed:grant:viewer:welcome',
      expiresAt: new Date(Date.now() + 30 * 86400_000),
      note: 'Hoş geldin hediye kredisi',
    },
  });
  await prisma.creditLedger.upsert({
    where: { idempotencyKey: 'seed:purchase:IOS:seed-credits-viewer-001' },
    update: {},
    create: {
      userId: viewer.id,
      type: 'PURCHASE',
      delta: 12,
      purchasedDelta: 12,
      grantedDelta: 0,
      balanceAfterPurchased: 12,
      balanceAfterGranted: 20,
      referenceType: 'STORE_TRANSACTION',
      referenceId: 'seed',
      idempotencyKey: 'seed:purchase:IOS:seed-credits-viewer-001',
      note: 'PACK_10 + 2 bonus (demo)',
    },
  });
  await prisma.storeTransaction.upsert({
    where: { platform_storeTransactionId: { platform: 'IOS', storeTransactionId: 'seed-credits-viewer-001' } },
    update: {},
    create: {
      userId: viewer.id,
      platform: 'IOS',
      productType: 'CREDIT_PACK',
      productId: 'PACK_10',
      storeTransactionId: 'seed-credits-viewer-001',
      storeOriginalTransactionId: 'seed-credits-viewer-001',
      priceKurus: 2990,
      currency: 'TRY',
      purchaseState: 'PURCHASED',
      validatedAt: new Date(),
    },
  });

  // Demo abonelik: ACTIVE aylık (dönem sonu +25 gün).
  await prisma.storeTransaction.upsert({
    where: { platform_storeTransactionId: { platform: 'IOS', storeTransactionId: 'seed-sub-viewer-001' } },
    update: {},
    create: {
      userId: viewer.id,
      platform: 'IOS',
      productType: 'SUBSCRIPTION',
      productId: 'SUB_MONTHLY',
      storeTransactionId: 'seed-sub-viewer-001',
      storeOriginalTransactionId: 'seed-sub-viewer-001',
      priceKurus: 4990,
      currency: 'TRY',
      purchaseState: 'PURCHASED',
      validatedAt: new Date(),
    },
  });
  const viewerSub = await prisma.subscription.findFirst({
    where: { userId: viewer.id, storeOriginalTransactionId: 'seed-sub-viewer-001' },
  });
  if (!viewerSub) {
    await prisma.subscription.create({
      data: {
        userId: viewer.id,
        planId: (await prisma.plan.findUniqueOrThrow({ where: { code: 'SUB_MONTHLY' } })).id,
        platform: 'IOS',
        status: 'ACTIVE',
        autoRenew: true,
        currentPeriodStart: new Date(Date.now() - 5 * 86400_000),
        currentPeriodEnd: new Date(Date.now() + 25 * 86400_000),
        storeOriginalTransactionId: 'seed-sub-viewer-001',
        productId: 'SUB_MONTHLY',
      },
    });
  }

  // Demo bölüm açımı: Gizli Bahçe S1B1 (2 kredi, granted'tan düşülür).
  const gardenEp1 = await prisma.episode.findFirstOrThrow({
    where: { content: { slug: 'gizli-bahce' }, seasonNumber: 1, episodeNumber: 1 },
    include: { content: { select: { id: true } } },
  });
  const existingUnlock = await prisma.episodeUnlock.findUnique({
    where: { userId_episodeId: { userId: viewer.id, episodeId: gardenEp1.id } },
  });
  if (!existingUnlock) {
    await prisma.episodeUnlock.create({
      data: {
        user: { connect: { id: viewer.id } },
        episode: { connect: { id: gardenEp1.id } },
        source: 'CREDIT',
        creditLedger: {
          create: {
            user: { connect: { id: viewer.id } },
            type: 'UNLOCK_SPEND',
            delta: -2,
            purchasedDelta: 0,
            grantedDelta: -2,
            balanceAfterPurchased: 12,
            balanceAfterGranted: 18,
            referenceType: 'EPISODE_UNLOCK',
            referenceId: gardenEp1.id,
            idempotencyKey: `seed:unlock:${viewer.id}:${gardenEp1.id}`,
          },
        },
      },
    });
  }

  // Cüzdanı ledger'dan nihai doğrula (Kural 1 kanıtı).
  const sums = await prisma.creditLedger.aggregate({
    where: { userId: viewer.id },
    _sum: { purchasedDelta: true, grantedDelta: true },
  });
  await prisma.creditWallet.upsert({
    where: { userId: viewer.id },
    update: { purchasedBalance: sums._sum.purchasedDelta ?? 0, grantedBalance: sums._sum.grantedDelta ?? 0 },
    create: {
      userId: viewer.id,
      purchasedBalance: sums._sum.purchasedDelta ?? 0,
      grantedBalance: sums._sum.grantedDelta ?? 0,
    },
  });

  // Demo favori + izleme ilerlemesi (devam et rayı dolu görünsün).
  await prisma.favorite.upsert({
    where: { userId_contentId: { userId: viewer.id, contentId: (await contentBySlug('gece-yarisi-treni')).id } },
    update: {},
    create: { userId: viewer.id, contentId: (await contentBySlug('gece-yarisi-treni')).id },
  });
  const sonVardiyaEp1 = await prisma.episode.findFirstOrThrow({
    where: { content: { slug: 'son-vardiya' }, seasonNumber: 1, episodeNumber: 1 },
  });
  await prisma.watchHistory.upsert({
    where: { userId_episodeId: { userId: viewer.id, episodeId: sonVardiyaEp1.id } },
    update: { positionSeconds: 210, lastWatchedAt: new Date() },
    create: {
      userId: viewer.id,
      episodeId: sonVardiyaEp1.id,
      contentId: (await contentBySlug('son-vardiya')).id,
      positionSeconds: 210,
      completed: false,
      lastWatchedAt: new Date(),
    },
  });

  // Karşılama bildirimi.
  await prisma.notification.upsert({
    where: { id: 'seed-notification-welcome' },
    update: {},
    create: {
      id: 'seed-notification-welcome',
      userId: viewer.id,
      type: 'SYSTEM',
      titleTr: 'PerdeGo’ya hoş geldin',
      titleEn: 'Welcome to PerdeGo',
      bodyTr: 'Dikey mini diziler ve kısa filmler seni bekliyor.',
      bodyEn: 'Vertical mini series and short films are waiting for you.',
    },
  });

  const counts = {
    kategori: await prisma.category.count(),
    icerik: await prisma.content.count(),
    sezon: await prisma.season.count(),
    bolum: await prisma.episode.count(),
    medya: await prisma.episodeMedia.count(),
    kullanici: await prisma.user.count(),
    plan: await prisma.plan.count(),
    paket: await prisma.creditPack.count(),
    banner: await prisma.banner.count(),
    bolum_: await prisma.homeSection.count(),
    ledger: await prisma.creditLedger.count(),
    abonelik: await prisma.subscription.count(),
  };
  console.log(`Seed tamam: ${JSON.stringify(counts)}`);
  console.log(
    `Demo hesaplar: viewer@perdego.dev / Dev12345 · editor@perdego.dev / Admin12345 · admin@perdego.dev / Admin12345`,
  );
  void admin;

  // --- yardımcılar ------------------------------------------------------------
  async function cat(slug: string) {
    return prisma.category.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  }


  async function linkItems(sectionId: string, items: Array<{ slug: string; order: number }>) {
    for (const item of items) {
      const content = await contentBySlug(item.slug);
      await prisma.homeSectionItem.upsert({
        where: { sectionId_contentId: { sectionId, contentId: content.id } },
        update: { sortOrder: item.order },
        create: { sectionId, contentId: content.id, sortOrder: item.order },
      });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('Seed başarısız:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
