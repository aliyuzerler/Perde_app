# Faz 3 Raporu — Mobil Görsel Tasarım Sistemi ve Ana Ekranlar

> Tarih: 2026-10-25 · Durum: ✅ Tamamlandı (UI katmanı) · Kapsam: 12 ana ekran,
> tasarım token'ları, yeniden kullanılabilir bileşenler, durum görünümleri ve
> **açıkça ayrılmış geçici (mock) veri katmanı**.
>
> İlke: "Önce örnek veriyle çalış" — hiçbir ekran sahte bir "API'ye bağlıyım"
> izlenimi vermez. Mock katman yalnızca `__DEV__ && EXPO_PUBLIC_MOCK_API=1`
> iken seçilir (iki katmanlı koruma korunmuştur); HTTP adapter'da henüz
> sunucuda olmayan uçlar **dürüstçe hata** verir.

## 1. Tasarım Sistemi (mevcut token'lar üstüne inşa edildi)

| Öğe | Uygulama |
|---|---|
| Renkler | `#0D0D0F` zemin, `#19191D` yüzey, `#B71C36` vurgu, `#F5F1EA` metin (`theme/tokens.ts`, tek doğruluk kaynağı) |
| Kartlar | Kesinlikle dikdörtgen; radius 0/2/4. Yuvarlak/oval kart yok — token testleri ihlali CI'da kırar |
| Oranlar | Afiş 2:3, dikey kart ve oynatıcı 9:16, hero 16:9 (`ASPECT_RATIOS`) |
| Tipografi | display/title/heading/body/caption/label ölçeği; güçlü hiyerarşi |
| Dokunuş | min 44 px hedef (`layout.minTouchTarget`) |

**Yeni bileşenler:** `hero-banner`, `content-rail`, `continue-card` (ilerleme
çubuklu dikey kart), `segmented-control`, `price-card`, `setting-row`,
`auth-field`. Mevcut bileşenler (PosterCard, AppBadge, AppButton, AppText,
GradientPlaceholder, Loading/Empty/ErrorView) yeniden kullanıldı.

## 2. Ekranlar (12/12)

| # | Ekran | Rota | Durum |
|---|-------|------|-------|
| 1 | Açılış/yükleme | `onboarding.tsx` (kök Stack kapısı + `expo-splash-screen`) | ✅ Çalışır (ilk açılışta bir kez; misafir girişi serbest) |
| 2 | Ana sayfa | `(tabs)/index.tsx` | ✅ Çalışır — sinematik hero, İzlemeye Devam Et, Trend Mini Diziler, Popüler Dikey Dramalar, Yeni Eklenenler, Filmler/Belgeseller rayları, kategori kartları, cüzdan kısayolu, durum etiketleri (Yeni / Üyelere özel / Kredi ile / 0-4px köşeli) |
| 3 | Keşfet + kategori | `(tabs)/explore.tsx` + `category/[slug].tsx` | ✅ Çalışır — tür çipleriyle filtre, 3 kolon afiş ızgarası, kategori sayfası (sayım + ızgara) |
| 4 | Arama | `(tabs)/search.tsx` | ✅ Çalışır (Faz 1'den; yeni veri katmanına bağlandı) |
| 5 | Detay | `content/[id].tsx` | ✅ Çalışır — açıklama, tür, sezon/bölüm sayısı, erişim modeli rozetleri, kadro, tür çipleri, **İzlemeye Başla** (kaldığı yerden), Planıma Ekle (gerçek yerel) |
| 6 | Sezon/bölüm listesi | detay içinde sezon seçici + bölüm satırları | ✅ Çalışır — bölüm kilit ikonları, süre, erişim türü |
| 7 | Dikey oynatıcı | `player/[episodeId].tsx` (fullScreenModal) | ⚠️ UI çalışır, **video Faz 4** — simüle ilerleme gerçekten playback-store'a yazılır (İzlemeye devam et gerçek), kilit + abonelik/kredi CTA'ları, sonraki bölüm, kaldığın yerden devam |
| 8 | Paywall | `paywall.tsx` (modal) | ⚠️ UI + mock subscribe çalışır — 3 plan (kurgusal fiyat), fayda listesi, deneme notu; **canlı ödeme Faz 5** |
| 9 | Kredi mağazası/cüzdan | `credits.tsx` (modal) | ⚠️ UI + mock satın alma çalışır — bakiye (satın alınan/hediye kırılımı), 3 paket, hareket listesi (credit_ledger ön gösterimi); **canlı ödeme Faz 5** |
| 10 | Favoriler + geçmiş | `(tabs)/library.tsx` (Favoriler/Devam/Geçmiş) | ✅ Çalışır — Favoriler watchlist-store, Devam/Geçmiş playback-store (her ikisi gerçek yerel, kalıcı) |
| 11 | Giriş/kayıt | `auth/login.tsx`, `auth/register.tsx` | ⚠️ UI + mock oturum çalışır — istemci doğrulaması sözleşme kurallarıyla aynı; deneme hesabı `deniz@ornek.com / perdego`; **gerçek kimlik Faz 3 sunucu** (argon2id + JWT) |
| 12 | Profil/ayarlar | `(tabs)/profile.tsx` | ✅ Çalışır — kullanıcı kartı (misafir/üye), abonelik + cüzdan satırları, tercih anahtarları, dil, çıkış |

## 3. Geçici Veri Katmanı (açık ayrım)

- **Sözleşmeler** (`packages/contracts`): yeni `billing.ts` (plan, cüzdan,
  kredi paketi, hareket) ve `account.ts` (login/register oturum, kategori)
  şemaları — Faz 5/Faz 3 sunucu fazlarında birebir kullanılacak.
- **Port** (`services/ports.ts`): katalog + abonelik/kredi + hesap yöntemleri.
- **Mock adapter**: yalnızca DEV + flag; tüm veri `mock-data.ts` içinde TAMAMI
  ÖZGÜN kurgu (telifli materyal yok; posterler deterministik gradyan).
- **HTTP adapter**: katalog uçları gerçek rotalara bağlı; hesap/ödeme uçları
  `SERVICE_UNAVAILABLE` hata verir (sahte başarılı yok).
- **Gerçek yerel katman** (API'siz tam çalışan): Planıma ekleme, izleme
  ilerlemesi/geçmişi (AsyncStorage kalıcı), tercih ve oturum bilinci.

## 4. Test Sonuçları (gerçek çalıştırma)

| Kontrol | Komut | Sonuç |
|---|---|---|
| Mobil typecheck | `npx tsc --noEmit` | ✅ temiz |
| Mobil lint | `npx expo lint` | ✅ 0 hata, 0 uyarı |
| Mobil test | `npx jest` | ✅ **70/70** (12 suite; 21 yeni test: adapter-Faz3, playback-store, auth-store, bileşen render) |
| contracts | typecheck + test | ✅ 16/16 |
| api | typecheck + test | ✅ 11/11 (regresyon yok) |
| Kök | `pnpm typecheck` / `lint` / `test` | ✅ hepsi yeşil |
| iOS bundle | `npx expo export --platform ios` | ✅ derlendi |
| Android bundle | `npx expo export --platform android` | ✅ derlendi |

**Ekran boyutu sınırlılığı (dürüst kayıt):** Bu ortamda cihaz/emülatör yoktur;
"Android ve iOS ekran boyutlarında test" derleme düzeyinde (her iki platform
bundle'ı) + RNTL render testleriyle yapılmıştır. Yerleşimler yüzde/genişlik
tabanlıdır (3 kolon afiş ızgarası, flexWrap raylar, 44px dokunuş hedefi); küçük
Android ve büyük iOS fiziksel doğrulaması makinede yapılmalıdır.

## 5. Sonraki Fazlara Bağlanacaklar

| Konu | Faz | Not |
|---|---|---|
| Gerçek kimlik doğrulama (argon2id, JWT, SecureStore) | Faz 3 sunucu | auth ekranları hazır; HTTP adapter uçları SERVICE_UNAVAILABLE döner |
| Video akışı (HLS, expo-video) | Faz 4 | oynatıcı UI + ilerleme mekanizması hazır |
| Canlı ödeme (RevenueCat/IAP), gerçek cüzdan | Faz 5 | paywall + kredi ekranları hazır; sözleşmeler hazır |
| Katalog uçları (içerik/feed/arama sunucusu) | Faz 2b | HTTP adapter rotaları hazır, mock→gerçek geçiş tek flag |

## 6. Sonuç

12/12 ekran tasarımlandı ve derleme/test kapılarından geçti. **Tam işlevsel
yerel:** ana sayfa-keşfet-arama-gezinme, detay + sezon/bölüm, Planım
(favoriler/devam/geçmiş), onboarding, tercih/ayar ekranları, oynatıcı ilerleme
kaydı. **Mock akışlı (UI tam, veri mock):** giriş/kayıt, paywall, kredi
satın alma, oynatma kilidi kararı. Hiçbir ekran sahte başarı göstermez; mock
kullanılan her yerde "Geliştirme modu" bildirimi görünürdür.
