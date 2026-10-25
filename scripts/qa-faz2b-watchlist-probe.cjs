// Faz 2b QA: watchlist servisinin birebir sorgusunu test DB üzerinde koşar.
const { PrismaClient } = require('/home/z/my-project/node_modules/@prisma/client');

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego_faz2b_test' } },
});

(async () => {
  // 1) Servisin content araması (publishedContentFilter = { status: 'PUBLISHED' } varsayımıyla)
  const content = await prisma.content.findFirst({
    where: { OR: [{ id: 'yanki' }, { slug: 'yanki' }], status: 'PUBLISHED' },
  });
  console.log('findFirst(yanki) →', content ? { id: content.id, slug: content.slug } : null);

  // 2) Slug ile birebir arama
  const bySlug = await prisma.content.findFirst({ where: { slug: 'yanki' } });
  console.log('findFirst(slug=yanki) →', bySlug ? { id: bySlug.id, slug: bySlug.slug } : null);

  // 3) viewer kullanıcısı ve favorileri
  const viewer = await prisma.user.findUnique({ where: { email: 'viewer@perdego.dev' } });
  console.log('viewer.id →', viewer?.id);
  const favs = await prisma.favorite.findMany({ where: { userId: viewer.id }, include: { content: { select: { slug: true } } } });
  console.log('viewer favorileri →', JSON.stringify(favs.map((f) => ({ contentId: f.contentId, slug: f.content.slug }))));

  // 4) add() mantığını birebir simüle et
  if (content) {
    const existing = await prisma.favorite.findUnique({
      where: { userId_contentId: { userId: viewer.id, contentId: content.id } },
    });
    console.log('add() sonucu →', existing ? '{ favorited: true, alreadyFavorited: true }' : '{ favorited: true, alreadyFavorited: false }');
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
