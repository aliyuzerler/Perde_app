/**
 * Mock içerik verisi — TAMAMI ÖZGÜN KURGU.
 *
 * ÖNEMLİ: Buradaki başlıklar, özetler ve kişiler bu proje için üretilmiş
 * kurgulardır; gerçek yapım/afiş kullanılmaz (Tasarım Zorunlulukları).
 * posterUrl/heroImageUrl bilinçli olarak null bırakılır; istemci özgün
 * placeholder görsel bileşenini gösterir.
 *
 * Bu dosya yalnızca geliştirme adapter'i tarafından kullanılır ve
 * React Native'e bağımlı DEĞİLDİR (saf TS, test edilebilir).
 */
import type {
  Content,
  ContentSummary,
  FeedResponse,
  PublicUserProfile,
  SearchResponse,
} from '@perdego/contracts';

export const mockProfile: PublicUserProfile = {
  id: 'u_dev_001',
  displayName: 'Deniz Aksoy',
  maskedEmail: 'd***@ornek.com',
  avatarUrl: null,
  preferredLocale: 'tr',
  joinedAt: '2025-03-14T10:00:00.000Z',
};

function summary(
  source: Content,
  overrides?: Partial<ContentSummary>
): ContentSummary {
  return {
    contentId: source.id,
    slug: source.slug,
    kind: source.kind,
    title: source.title,
    releaseYear: source.releaseYear,
    ageRating: source.ageRating,
    genres: source.genres,
    posterUrl: source.posterUrl,
    verticalPreviewUrl: source.verticalPreviewUrl,
    accessType: source.accessType,
    isNew: source.isNew,
    ...overrides,
  };
}

export const mockContentList: Content[] = [
  {
    id: 'c_kum_saati',
    slug: 'kum-saati-protokolu',
    kind: 'SERIES',
    title: 'Kum Saati Protokolü',
    synopsis:
      'Ankara’da bir meteoroloji mühendisi, şehirde zamanın yerel olarak yavaşladığını gösteren veri anomalileri yakalar. İlk sezonda altı bölümde, bir devlet laboratuvarındaki gizli deneyin izleri gün yüzüne çıkar.',
    tagline: 'Zaman herkes için aynı akmıyor.',
    releaseYear: 2026,
    ageRating: '13+',
    genres: ['bilim-kurgu', 'gizem'],
    cast: [
      { id: 'p_1', fullName: 'Ela Tunalı', role: 'DIRECTOR' },
      { id: 'p_2', fullName: 'Barış Koray', role: 'ACTOR', characterName: 'Mert Adalı' },
      { id: 'p_3', fullName: 'Suna Yalu', role: 'ACTOR', characterName: 'Dr. Leyla Ünver' },
      { id: 'p_4', fullName: 'Cem Doruk', role: 'WRITER' },
    ],
    posterUrl: null,
    heroImageUrl: null,
    verticalPreviewUrl: null,
    accessType: 'SUBSCRIPTION',
    seasons: [
      {
        id: 's_kum_1',
        seasonNumber: 1,
        title: 'Sezon 1',
        episodes: [
          {
            id: 'e_kum_101',
            seasonNumber: 1,
            episodeNumber: 1,
            title: 'Saat 03:14',
            synopsis: 'Gözlem istasyonundan gelen bozuk bir veri paketi her şeyin başlangıcı olur.',
            durationSeconds: 1240,
            verticalPreviewUrl: null,
            accessType: 'FREE',
          },
          {
            id: 'e_kum_102',
            seasonNumber: 1,
            episodeNumber: 2,
            title: 'Milisaniye',
            synopsis: 'Mert, laboratuvar kayıtlarında silinmiş bir geceyi bulur.',
            durationSeconds: 1180,
            verticalPreviewUrl: null,
            accessType: 'SUBSCRIPTION',
          },
          {
            id: 'e_kum_103',
            seasonNumber: 1,
            episodeNumber: 3,
            title: 'Gölge Değişken',
            synopsis: 'Leyla’nın geçmişi, protokolün ilk deneklerinden birine bağlanır.',
            durationSeconds: 1310,
            verticalPreviewUrl: null,
            accessType: 'SUBSCRIPTION',
          },
          {
            id: 'e_kum_104',
            seasonNumber: 1,
            episodeNumber: 4,
            title: 'Karşı Saat',
            synopsis: 'Ekip, anomalini şehir merkezine yayıldığını keşfeder.',
            durationSeconds: 1215,
            verticalPreviewUrl: null,
            accessType: 'SUBSCRIPTION',
          },
          {
            id: 'e_kum_105',
            seasonNumber: 1,
            episodeNumber: 5,
            title: 'Kum Fırtınası',
            synopsis: 'Laboratuvar dışarı sızan ilk sonuçla yüzleşir.',
            durationSeconds: 1275,
            verticalPreviewUrl: null,
            accessType: 'CREDIT',
          },
          {
            id: 'e_kum_106',
            seasonNumber: 1,
            episodeNumber: 6,
            title: 'Protokol',
            synopsis: 'Her şeyin bilindiği gece, kimse hazır değildir.',
            durationSeconds: 1420,
            verticalPreviewUrl: null,
            accessType: 'SUBSCRIPTION',
          },
        ],
      },
    ],
    isNew: true,
  },
  {
    id: 'c_gece_yarisi',
    slug: 'gece-yarisi-konseri',
    kind: 'SHORT_FILM',
    title: 'Gece Yarısı Konseri',
    synopsis:
      'Kapanma kararı almış bir sinema salonunda kalan son görevli, gece yarısı projeksiyon odasından gelen piyano sesinin peşine düşer. 14 dakikalık gerilim kısa filmi.',
    tagline: 'Son seans hiç bitmeyebilir.',
    releaseYear: 2026,
    ageRating: '16+',
    durationSeconds: 840,
    genres: ['gerilim', 'korku'],
    cast: [
      { id: 'p_5', fullName: 'Kaan Işıldar', role: 'DIRECTOR' },
      { id: 'p_6', fullName: 'Nihal Soylu', role: 'ACTOR', characterName: 'Ece' },
    ],
    posterUrl: null,
    heroImageUrl: null,
    verticalPreviewUrl: null,
    accessType: 'FREE',
    seasons: [],
    isNew: true,
  },
  {
    id: 'c_son_vapur',
    slug: 'son-vapur',
    kind: 'FILM',
    title: 'Son Vapur',
    synopsis:
      'Boğaz’da kış son işletme gecesinde iki eski dost, yıllar önce aralarını kesen bir anlaşmanın hesabını vapur köprüsünde görür. 96 dakikalık dram.',
    releaseYear: 2025,
    ageRating: '13+',
    durationSeconds: 5760,
    genres: ['dram'],
    cast: [
      { id: 'p_7', fullName: 'Yıldız Arman', role: 'DIRECTOR' },
      { id: 'p_8', fullName: 'Tarık Ünsal', role: 'ACTOR', characterName: 'Kemal' },
      { id: 'p_9', fullName: 'Ferit Aslan', role: 'ACTOR', characterName: 'Selim' },
    ],
    posterUrl: null,
    heroImageUrl: null,
    verticalPreviewUrl: null,
    accessType: 'SUBSCRIPTION',
    seasons: [],
    isNew: false,
  },
  {
    id: 'c_beyaz_gurultu',
    slug: 'beyaz-gurultu-kulubu',
    kind: 'SERIES',
    title: 'Beyaz Gürültü Kulübü',
    synopsis:
      'İstanbul’da terk edilmiş bir plak stüdyosunda toplanan beş kişi, eski kayıtlarda duydukları tanımsız sesin peşine düşer. Mini dizi, tek sezonda tamamlanır.',
    tagline: 'Bazı sesler dinlenmemeli.',
    releaseYear: 2025,
    ageRating: '16+',
    genres: ['gizem', 'gerilim'],
    cast: [
      { id: 'p_10', fullName: 'Selin Duru', role: 'DIRECTOR' },
      { id: 'p_11', fullName: 'Ozan Karaca', role: 'ACTOR', characterName: 'Volkan' },
    ],
    posterUrl: null,
    heroImageUrl: null,
    verticalPreviewUrl: null,
    accessType: 'CREDIT',
    seasons: [
      {
        id: 's_bg_1',
        seasonNumber: 1,
        episodes: [
          {
            id: 'e_bg_101',
            seasonNumber: 1,
            episodeNumber: 1,
            title: 'Örnek No. 7',
            synopsis: 'Kulübün ilk gecesinde stüdyo arşivinden şüpheli bir kayıt çıkar.',
            durationSeconds: 990,
            verticalPreviewUrl: null,
            accessType: 'FREE',
          },
          {
            id: 'e_bg_102',
            seasonNumber: 1,
            episodeNumber: 2,
            title: 'Ters Kayıt',
            synopsis: 'Volkan, sesin geriye doğru çalındığında bir isim fısıldadığını fark eder.',
            durationSeconds: 1040,
            verticalPreviewUrl: null,
            accessType: 'CREDIT',
          },
          {
            id: 'e_bg_103',
            seasonNumber: 1,
            episodeNumber: 3,
            title: 'Sessiz Oda',
            synopsis: 'Stüdyonun yalıtım odası, kayıtlardaki sesin kaynağına daha yakındır.',
            durationSeconds: 1010,
            verticalPreviewUrl: null,
            accessType: 'CREDIT',
          },
        ],
      },
    ],
    isNew: false,
  },
  {
    id: 'c_ankara_ruzgar',
    slug: 'ankarada-ruzgar',
    kind: 'SHORT_FILM',
    title: 'Ankara’da Rüzgâr',
    synopsis:
      'Bir kurye, rüzgârın savurduğu bir mektubu adresine ulaştırmaya çalışırken şehri yeniden keşfeder. 12 dakikalık dram kısa filmi.',
    releaseYear: 2026,
    ageRating: '7+',
    durationSeconds: 720,
    genres: ['dram', 'yaşam'],
    cast: [{ id: 'p_12', fullName: 'Melis Akça', role: 'DIRECTOR' }],
    posterUrl: null,
    heroImageUrl: null,
    verticalPreviewUrl: null,
    accessType: 'FREE',
    seasons: [],
    isNew: false,
  },
  {
    id: 'c_perde_arkasi_43',
    slug: 'perde-arkasi-43',
    kind: 'SHORT_FILM',
    title: 'Perde Arkası: 4:3',
    synopsis:
      'Eski bir projeksiyoncinin kamera karşısına anlattığı son iş günü, sinematek geleneğine saygı duruşudur. 18 dakikalık belgesel kısa film.',
    releaseYear: 2025,
    ageRating: 'Genel',
    durationSeconds: 1080,
    genres: ['belgesel'],
    cast: [{ id: 'p_13', fullName: 'Hakan Öz', role: 'DIRECTOR' }],
    posterUrl: null,
    heroImageUrl: null,
    verticalPreviewUrl: null,
    accessType: 'FREE',
    seasons: [],
    isNew: false,
  },
  {
    id: 'c_kirik_sekiz',
    slug: 'kirik-sekiz',
    kind: 'FILM',
    title: 'Kırık Sekiz',
    synopsis:
      'Kapanmak üzere bir bilardo salonunda oynanan son parti, mahallede yıllardır konuşulan kayıp paranın sırrını açar. 88 dakikalık suç filmi.',
    releaseYear: 2025,
    ageRating: '16+',
    durationSeconds: 5280,
    genres: ['suç', 'dram'],
    cast: [
      { id: 'p_14', fullName: 'Deniz Karahan', role: 'DIRECTOR' },
      { id: 'p_15', fullName: 'Umut Erten', role: 'ACTOR', characterName: 'Orhan' },
    ],
    posterUrl: null,
    heroImageUrl: null,
    verticalPreviewUrl: null,
    accessType: 'SUBSCRIPTION',
    seasons: [],
    isNew: false,
  },
  {
    id: 'c_fazla_bagaj',
    slug: 'fazla-bagaj',
    kind: 'SERIES',
    title: 'Fazla Bagaj',
    synopsis:
      'Havaalanında kaybolan bir bavul, üç yabancının hayatını bir gece boyunca iç içe geçirir. Altı bölümlük komedi mini dizisi.',
    tagline: 'Bavul sahibini bulmalı.',
    releaseYear: 2026,
    ageRating: '13+',
    genres: ['komedi'],
    cast: [
      { id: 'p_16', fullName: 'Aslı Menekşe', role: 'DIRECTOR' },
      { id: 'p_17', fullName: 'Batu Kaya', role: 'ACTOR', characterName: 'İlyas' },
    ],
    posterUrl: null,
    heroImageUrl: null,
    verticalPreviewUrl: null,
    accessType: 'SUBSCRIPTION',
    seasons: [
      {
        id: 's_fb_1',
        seasonNumber: 1,
        episodes: [
          {
            id: 'e_fb_101',
            seasonNumber: 1,
            episodeNumber: 1,
            title: 'Kayıp Etiket',
            synopsis: 'Üç yolcu aynı siyah bavulu hak eder.',
            durationSeconds: 1120,
            verticalPreviewUrl: null,
            accessType: 'FREE',
          },
          {
            id: 'e_fb_102',
            seasonNumber: 1,
            episodeNumber: 2,
            title: 'Transfer',
            synopsis: 'Bavul, yanlış transfer bandında bir şehir değiştirir.',
            durationSeconds: 1080,
            verticalPreviewUrl: null,
            accessType: 'SUBSCRIPTION',
          },
          {
            id: 'e_fb_103',
            seasonNumber: 1,
            episodeNumber: 3,
            title: 'Bagaj Etiketi',
            synopsis: 'İçindeki eski bir kamera, üçünü ortak bir hedefte birleştirir.',
            durationSeconds: 1150,
            verticalPreviewUrl: null,
            accessType: 'SUBSCRIPTION',
          },
        ],
      },
    ],
    isNew: true,
  },
];

export const mockFeed: FeedResponse = {
  sections: [
    {
      id: 'hero_one',
      title: 'Öne Çıkan',
      layout: 'HERO',
      items: [summary(mockContentList[0]!)],
    },
    {
      id: 'rail_trend',
      title: 'Bu Hafta Trendler',
      layout: 'RAIL',
      items: [
        summary(mockContentList[1]!),
        summary(mockContentList[6]!),
        summary(mockContentList[2]!),
        summary(mockContentList[3]!),
        summary(mockContentList[7]!),
      ],
    },
    {
      id: 'rail_new',
      title: 'Yeni Eklenenler',
      layout: 'RAIL',
      items: [
        summary(mockContentList[7]!),
        summary(mockContentList[0]!),
        summary(mockContentList[1]!),
      ],
    },
    {
      id: 'rail_shorts',
      title: 'Kısa Filmler',
      layout: 'RAIL',
      items: [
        summary(mockContentList[1]!),
        summary(mockContentList[4]!),
        summary(mockContentList[5]!),
      ],
    },
  ],
};

/** Arama endeksi: başlık, tür ve oyuncu adlarına göre basit eşleşme. */
export function searchMockContent(
  query: string,
  page: number,
  pageSize: number
): SearchResponse {
  const normalized = query
    .trim()
    .toLocaleLowerCase('tr-TR');
  const matched = mockContentList.filter((content) => {
    const haystack = [
      content.title,
      content.genres.join(' '),
      content.cast.map((member) => member.fullName).join(' '),
    ]
      .join(' ')
      .toLocaleLowerCase('tr-TR');
    return haystack.includes(normalized);
  });

  const start = (page - 1) * pageSize;
  const items = matched
    .slice(start, start + pageSize)
    .map((content) => summary(content));
  const totalItems = matched.length;
  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    items,
    meta: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
    },
  };
}

export function findMockContent(contentId: string): Content | undefined {
  return mockContentList.find((content) => content.id === contentId);
}
