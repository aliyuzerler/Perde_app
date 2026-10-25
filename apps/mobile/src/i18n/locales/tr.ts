/**
 * Türkçe sözlük (varsayılan dil).
 * Kural: kullanıcıya görünen TÜM metinler bu sözlükten gelir (Genel Kural 6).
 */
export const tr = {
  common: {
    appName: 'PerdeGo',
    retry: 'Tekrar Dene',
    cancel: 'Vazgeç',
    close: 'Kapat',
    seeAll: 'Tümü',
    minutes: 'dk',
    hoursShort: 'sa',
    loading: 'Yükleniyor…',
    offline: 'Bağlantı sağlanamadı',
  },
  tabs: {
    discover: 'Keşfet',
    search: 'Ara',
    watchlist: 'Planim',
    profile: 'Profil',
  },
  discover: {
    title: 'Keşfet',
    errorTitle: 'Akış yüklenemedi',
    errorBody: 'İçerikler alınırken bir sorun oluştu. Bağlantınızı kontrol edip tekrar deneyin.',
  },
  search: {
    title: 'Ara',
    placeholder: 'Film, dizi veya kısa film ara',
    idleTitle: 'Ne izlemek istersin?',
    idleBody: 'Başlık, tür veya oyuncu adıyla arama yapabilirsin.',
    noResultsTitle: 'Sonuç bulunamadı',
    noResultsBody: '“{{query}}” için bir şey bulamadık. Farklı bir ifade dene.',
    searching: 'Aranıyor…',
  },
  watchlist: {
    title: 'Planim',
    emptyTitle: 'Listen henüz boş',
    emptyBody: 'İzlemek istediğin yapımları detay sayfasından listenize ekleyebilirsin.',
    emptyCta: 'Keşfetmeye Başla',
    remove: 'Listeden çıkar',
  },
  profile: {
    title: 'Profil',
    guest: 'Misafir',
    memberSince: 'Katılım',
    preferencesTitle: 'Tercihler',
    autoplayPreviews: 'Otomatik önizleme oynatma',
    autoplayPreviewsHint: 'Kart odaklandığında sessiz önizleme başlar.',
    dataSaver: 'Veri tasarrufu',
    dataSaverHint: 'Düşük çözünürlüklü akış tercih edilir.',
    sectionAccount: 'Hesap',
    devDataNotice: 'Geliştirme verisi gösteriliyor',
    language: 'Dil',
  },
  access: {
    FREE: 'Ücretsiz',
    SUBSCRIPTION: 'Üyelere özel',
    CREDIT: 'Kredi ile',
  },
  content: {
    episodesTitle: 'Bölümler',
    seasonLabel: 'Sezon {{number}}',
    episodeLabel: '{{number}}. Bölüm',
    castTitle: 'Kadro',
    roleActor: 'Oyuncu',
    roleDirector: 'Yönetmen',
    roleWriter: 'Senaryo',
    watchCta: 'Oynat',
    watchUnavailableTitle: 'Oynatma henüz hazır değil',
    watchUnavailableBody: 'Video akışı Faz 4’te devreye alınacak. Şu içerikleri şimdiden listene ekleyebilirsin.',
    lockedNotice: 'Bu bölüm abonelik gerektirir',
    addToList: 'Planıma Ekle',
    inList: 'Planımda',
    newBadge: 'Yeni',
    notFoundTitle: 'İçerik bulunamadı',
    notFoundBody: 'Aradığın yapım kaldırılmış ya da bağlantı hatalı olabilir.',
    backToList: 'Keşfet’e dön',
  },
  error: {
    genericTitle: 'Bir şeyler ters gitti',
    genericBody: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
    networkTitle: 'Bağlantı sağlanamadı',
    networkBody: 'İnternet bağlantını kontrol et ve tekrar dene.',
  },
  empty: {
    genericTitle: 'Burada henüz bir şey yok',
  },
  notFound: {
    title: 'Sayfa bulunamadı',
    body: 'Aradığın sayfa taşınmış ya da hiç var olmamış olabilir.',
    backHome: 'Keşfet’e dön',
  },
} as const;

/** Literal tipleri genişleterek diğer dil dosyalarının aynı yapıyı kullanmasını sağlar. */
type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};

export type TranslationDict = Widen<typeof tr>;
