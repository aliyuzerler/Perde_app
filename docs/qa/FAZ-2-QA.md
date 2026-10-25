# FAZ-2 QA Raporu — UI ve Görsel Kalite

> Tarih: 2026-10-25 · Kapsam: Mobil arayüzün tamamı (13 ekran), tasarım sistemi
> uyumu, gezinme ve etkileşim testleri · **Sonuç: PASS WITH WARNINGS**
>
> Depo içi karşılık: ROADMAP **Faz 3a** (mobil görsel tasarım sistemi ve 12 ana
> ekran — `docs/phases/FAZ-3.md`). Kullanıcı faz numaralandırmasında "Faz 2: UI
> ve görsel kalite" olarak anılan kapsam budur.

---

## 1. Faz Adı ve Test Kapsamı

| Madde | Kapsam |
|---|---|
| Ekranlar | Açılış (onboarding), ana sayfa, keşfet (+tür filtresi), arama (+yazma), dizi detayı (+sezon/bölüm listesi), video oynatıcı (+sonraki bölüm), abonelik (paywall, 3 plan), kredi mağazası (bakiye/paket/hareketler), favoriler (Planim: Favoriler/Devam/Geçmiş), giriş, kayıt, profil, 404 |
| Tasarım denetimi | 4 tema rengi, kart formu (dikdörtgen), radius 0–4 px, en-boy oranları, metin taşması, durum görünümleri (loading/empty/error) |
| Etkileşim | Sekme gezinmesi, karta dokunma, tür filtresi çipi, Planıma ekle/çıkar durumu, oynatıcı sonraki bölüm, mock abonelik, mock kredi satın alma, boş form doğrulama hatası, mock oturum açma, 404 rotası |
| Konsol denetimi | React DOM hatası (iç içe `<button>`), sonsuz render döngüsü, CORS hatası |

**Kritik sınırlılık (dürüst kayıt):** Bu ortamda **gerçek cihaz, iOS simülatörü
veya Android emülatörü yoktur**. Testler uygulamanın **Expo web çıktısı
(react-native-web)** üzerinde, 390×844 px mobil görünümde, gerçek tıklama/yazma
etkileşimleriyle (Playwright 1.57 + headless Chromium 143) yapılmıştır. Web,
RN bileşenlerini gerçek zamanlı render eder; ancak safe area, klavye davranışı,
dokunma hassasiyeti ve performans **native cihaz doğrulaması gerektirir** ve bu
raporda "yapılamayan testler" bölümünde açıkça listelenir. Ekran görüntüleri
`docs/qa/screenshots/` altında 23 dosya olarak saklanmıştır.

## 2. Çalıştırılan Komutlar (gerçek)

```bash
# Statik kalite kapıları (kök, 4 workspace)
pnpm install --frozen-lockfile          # ✅ lockfile güncel, 5 proje
pnpm typecheck                          # ✅ admin+mobile+contracts+api temiz
pnpm lint                               # ✅ 4/4 workspace 0 hata
pnpm test                               # ✅ contracts 16 + api 11 + mobile 70 = 97 test
pnpm typecheck && pnpm lint && pnpm test   # (düzeltmeler SONRASI kapanış regresyonu) ✅

# Mobil (apps/mobile)
npx tsc --noEmit                        # ✅ (her düzeltme sonrası 3 kez)
npx expo lint                           # ✅
npx jest                                # ✅ 70/70 (12 suite)
npx expo export --platform ios          # ✅ native bundle derlendi (regresyon)
npx expo export --platform android      # ✅ native bundle derlendi (regresyon)
CI=1 EXPO_PUBLIC_MOCK_API=1 npx expo start --web --port 8081 --clear  # UI test sunucusu

# Altyapı regresyonu (Faz-1 QA yöntemi; Docker bu ortamda yok)
scripts/qa-pg/setup-pg.sh               # ✅ PostgreSQL 16.14 (embedded) hazır
npx prisma migrate status               # ✅ "Database schema is up to date!"
npx prisma db seed                      # ✅ idempotent (3 kategori, 2 içerik, 3 bölüm)
node scripts/qa-pg/verify-db.mjs …      # ✅ bağımsız veri kanıtı
PORT=3000 node dist/main.js             # ✅ /health 200, /health/db 200 (3ms)
DATABASE_URL=…5499/yok PORT=3111 node dist/main.js  # ✅ /health/db → 503 + gerçek hata
cd apps/admin && npx next build         # ✅ (static /)
curl -H "Origin: http://localhost:3001" …/health   # ✅ Access-Control-Allow-Origin döndü
curl http://localhost:3001/             # ✅ admin 200

# UI testi
/home/z/.venv/bin/python scripts/qa-faz2-ui.py
# → 33 adım: 31 PASS, 2 SKIP (dürüst), 0 FAIL; sonuç: scripts/qa-faz2-results.json
/home/z/.venv/bin/python scripts/qa-faz2-player-probe.py
```

## 3. Her Testin Gerçek Sonucu (UI koşusu)

| # | Adım | Sonuç | Kanıt |
|---|---|---|---|
| 01 | İlk yüklemede onboarding kapısı | ✅ PASS | localStorage boşken `/onboarding`'e yönlendirme |
| 01 | Onboarding radius denetimi | ✅ | yalnız `0px` (tam köşeli marka çubuğu) |
| 01 | "Geliştirme modu: örnek veri gösteriliyor" bildirimi | ✅ | dürüst mock bildirimi görünür |
| 02 | Misafir girişi → ana sayfa | ✅ | hero + 4 ray + kategori şeridi render |
| 02 | Ana sayfa radius / zemin | ✅ | `0px, 4px`; içerik zemini `rgb(13,13,15)` |
| 03 | 4 sekme gezinmesi (Keşfet/Ara/Planim/Profil) | ✅ | URL + ekran marker'ları; `03..06-*.png` |
| 04 | Keşfet tür filtresi çipi ("bilim kurgu") | ✅ | ızgara filtreledi; `07-kesfet-filtreli.png` |
| 05 | Ana sayfadan detaya geçiş (DETAY) | ✅ | `/content/c_kum_saati`; `08-detay.png` |
| 05 | Detay radius | ✅ | `0px, 4px` |
| 06 | "PLANIMA EKLE" → durum "PLANIMDA" | ✅ | buton etiketi değişti; `09-detay-planimda.png` |
| 07 | Oynatıcı açılış (OYNAT) | ✅ | `/player/e_kum_101?contentId=c_kum_saati`; `10-oynatici.png` |
| 07 | "SONRAKİ BÖLÜM" etkileşimi | ✅ | oynatıcı B2'ye geçti |
| 08 | Kilitli bölüm (SUBSCRIPTION) paneli | ⏭️ SKIP | mock profil `subscriptionStatus: 'TRIALING'` → kilit **tasarım gereği** açık; karar `player/[episodeId].tsx:86-94` kod incelemesiyle doğrulandı |
| 09 | Kilitli bölüm (CREDIT) paneli | ⏭️ SKIP | mock bakiye 260 ≥ maliyet → kilit açık; aynı gerekçe |
| 10 | Paywall: 3 plan render + "Yıllık" seçimi + mock abonelik | ✅ | "Abonelik etkin" başarı ekranı; `14/15-paywall-*.png` |
| 11 | Kredi: bakiye kırılımı + pakete dokunma + hareketler | ✅ | bakiye 260 (220+40), "…kredi cüzdanına eklendi"; `16/17-kredi-*.png` |
| 12 | Planim segment etkileşimi (Geçmiş) | ✅ | `18-planim-gecmis.png` |
| 12 | Favoriler'de eklenen içerik | ✅ | "Kum Saati Protokolü" listede; `19-planim-favoriler-dolu.png` |
| 13 | Arama yazma ("kayıp") + sonuç | ✅ | mock sonuç listelendi; `20-arama-sonuc.png` |
| 14 | Giriş boş gönderim → Türkçe doğrulama hatası | ✅ | "Geçerli bir e-posta adresi girin"; `21-giris-dogrulama.png` |
| 14 | Mock oturum (deniz@ornek.com) | ✅ | "Hoş geldin…"; `22-giris-basarili.png` |
| 15 | Kayıt ekranı (KVKK onayı dahil) | ✅ | `23-kayit.png` |
| 16 | Olmayan rota → not-found ekranı | ✅ | "Sayfa bulunamadı"; `24-404.png` |
| 17 | Konsol: iç içe `<button>` | ✅ | **0 hata** (düzeltme öncesi 4'tü) |
| 17 | Konsol: sonsuz render döngüsü | ✅ | **0 hata** |
| 17 | Konsol: CORS | ✅ | **0 hata** (mock mod; gerçek HTTP modu için bkz. F2-02) |

**Tasarım denetimleri (görev maddeleri 1–10) ile eşleştirme:**

| Görev maddesi | Sonuç | Kanıt |
|---|---|---|
| 1. Tema #0D0D0F/#19191D/#B71C36/#F5F1EA | ✅ | `tokens.ts:9-12` birebir; runtime zemin `rgb(13,13,15)` |
| 2. Kartlar dikdörtgen mi | ✅ | Tüm kartlar dikdörtgen (23 ekran görüntüsü) |
| 3. Yuvarlak tasarıma dönüş var mı | ✅ Yok | 5 ayrı ekranın runtime radius denetimi |
| 4. Radius 0–4 px | ✅ | Yalnız `0px/2px/4px` gözlemlendi; ölçek `none:0, sm:2, md:4` |
| 5. En-boy oranları | ✅ | `poster 2/3, vertical 9/16, wide 16/9` (tokens.ts:73-77) |
| 6. Metin kesilme/binişme | ✅ | Belirgin sorun yok; başlıklarda `numberOfLines` korunumlu |
| 7. Safe area / alt nav / klavye | ⚠️ Kısmen | Tab bar + `tabBarHideOnKeyboard` config doğru; **gerçek cihaz gerektirir** |
| 8. Loading/empty/error durumları | ✅ | Lazy-yükleme iskeletleri, Planım boş durumları, 404 ekranı görüldü |
| 9. Farklı ekran boyutlarında taşma | ⚠️ Kısmen | Tek görünüm (390×844) test edildi; yüzde tabanlı yerleşim — cihaz doğrulaması gerek |
| 10. Butonlar/sekmeler/yönlendirmeler | ✅ | Bölüm 3'teki 20+ gerçek etkileşim |

## 4. Bulunan Hatalar ve Yapılan Düzeltmeler

| ID | Önem | Bulgu | Düzeltme | Kanıt |
|---|---|---|---|---|
| F2-01 | **Yüksek** | **Web'de uygulama açılmıyordu:** expo-router v58 (58.0.26) web hedefinde, kök `_layout.tsx` içindeki `<Redirect href="/onboarding">` sonsuz render döngüsüne giriyor (`Maximum update depth exceeded` ×400+) ve seed çökmesi (`Linking did not produce an initial navigation state`) üretiyordu. Ana hedef platform native olduğundan Kritik değil; ancak web çıktısı tamamen kullanılamazdı. `npm view` ile doğrulandı: 58.0.26 en son 58.0.x — yama yok. | Açılış kapısı, gezgin mount **edikken** güvenli olan ekran düzeyi desene taşındı (`(tabs)/index.tsx` içinde `<Redirect>`; expo-router'ın resmi gate deseni). Kök layout sadeleşti. | Taze bundle ile döngü **0**; onboarding ilk yüklemede görünüyor |
| F2-02 | **Orta** | `CORS_ORIGINS` örneğinde Expo web'in gerçek dev portu **8081 yoktu** (bayat 19006 vardı) → web istemcisi API'ye erişemiyor (`blocked by CORS policy` canlı yakalandı). | `apps/api/.env.example` (ve lokal `.env`) güncellendi: `http://localhost:8081` eklendi; API yeniden başlatıldı. | `curl -H "Origin: http://localhost:8081" …/feed` → `Access-Control-Allow-Origin` döndü |
| F2-03 | **Orta (web)** | **İç içe `<button>` geçersiz HTML** — 3 kaynak: hero-banner (dış Pressable role=button içinde 2 AppButton), keşvet + kategori ızgaraları (dış Pressable içinde PosterCard), Planım geçmiş satırı (dış satır içinde "Geçmişten çıkar"). React DOM hatası + LogBox toast'u alt ekran tıklamalarını engelliyordu. | Dış kapsayıcılardan `accessibilityRole="button"` kaldırıldı (erişilebilirlik, iç semantik butonlar üzerinden korunur); her düzeltmeye gerekçe yorumu eklendi. | Konsolda nested-button hatası **4 → 0**; toast kalktı, tüm etkileşimler açıldı |
| F2-04 | **Düşük** | `useContentDetail(heroItem ? id : '')` boş id ile sorgu ateşliyor → HTTP adapter modunda `/api/v1/content/` (boş) bogus isteği canlı yakalandı. | Hook'a `enabled: contentId.length > 0` eklendi. | Mock koşusunda bogus istek yok; unit testler yeşil |
| F2-05 | **Düşük (gözlem)** | RNW web çıktısında uygulama altındaki kök zemin `rgb(242,242,242)` (açık gri) — uygulama içeriği tamamen koyu, ancak web'de taşma/overscroll'da açığa çıkabilir. Native'de yoktur. | Bu fazda düzeltilmedi (web parlatma kalemidir); öneri: web kök zemini `#0D0D0F` yapılmalı. | bg denetimi kaydı |
| F2-06 | **Bilgi (tasarım kararı)** | Oynatıcıda kalan süre "-20 dk" biçiminde (eksi işaretli) gösteriliyor — `player/[episodeId].tsx:300`'de bilinçli konvansiyon. | Düzeltme gerekmedi; karışıklık istenirse "kalan 20 dk" önerilir. | Oynatıcı ekran görüntüleri |

**Düzeltme kapsamı disiplini:** Yalnızca bu fazın (UI kalite) hataları
düzeltildi; yeni özellik yazılmadı, sonraki fazlara ait iş erkenden alınmadı,
kütüphane sürümü yükseltilmedi (58.0.26 zaten en son yama; yükseltme kural
gereği yapılmadı). Deney amaçlı geçici mutasyonların tamamı geri alındı
(`app.json` dahil — `git diff` ile doğrulandı).

## 5. Başarısız veya Çalıştırılamayan Testler

| Kalem | Durum | Gerekçe / Plan |
|---|---|---|
| Gerçek iOS cihazı / simülatörü | **Yapılamadı** | Ortamda macOS/Xcode yok |
| Gerçek Android cihazı / emülatörü | **Yapılamadı** | Ortamda KVM/emülatör yok |
| Safe area, klavye, dokunma hedefi, kaydırma hissi, performans | **Yapılamadı** | Native cihaz gerektirir; config düzeyi denetim yapıldı (`tabBarHideOnKeyboard: true`, minTouchTarget 44, SafeAreaProvider) |
| Farklı ekran boyutları (küçük Android / büyük iOS) | **Kısmen** | Tek görünüm (390×844) koşturuldu; yerleşimler yüzde tabanlı, 3 kolon ızgara flexWrap — cihazda doğrulanmalı |
| Kilitli bölüm panelleri (abonelik/kredi CTA) | **Atlandı (dürüst)** | Mock varsayılan profili deneme üyeliğinde ve kredisine yeter; sahte durum üretilmedi. Kilit kararı kod incelemesi + mevcut unit testlerle destekli |
| Canlı ödeme / gerçek IAP | **Kapsam dışı** | Faz 5 |
| Gerçek video akışı (HLS) | **Kapsam dışı** | Faz 4; oynatıcı "ilerleme simülasyonu" bildirimiyle dürüst çalışıyor |
| Docker Compose (postgres+redis) | **Yapılamadı** | Sandbox'ta Docker yok; altyapı regresyonu gömülü PostgreSQL 16.14 ile yapıldı (Faz-1 QA yöntemi) |

## 6. Önceki Fazlardan Kalan Regresyonlar

| Regresyon | Sonuç |
|---|---|
| Kök typecheck / lint / test (4 workspace) | ✅ 97/97 test yeşil (16+11+70) — UI düzeltmeleri sonrası kapanış koşusu |
| Native bundle (iOS + Android export) | ✅ Her ikisi derlendi — web yönelimli düzeltmeler native'i bozmadı |
| Gömülü PostgreSQL: migrate status + seed + bağımsız veri kanıtı | ✅ Şema güncel; seed idempotent (3 kategori / 2 içerik / 3 bölüm) |
| API `/health` 200 + `/health/db` 200 (gerçek PG, 3ms) | ✅ |
| API DB-erişilemez → 503 + gerçek hata (dürüst başarısızlık) | ✅ (5499 sahte portuyla canlı doğrulandı) |
| EADDRINUSE dostu mesajı (Faz-1 düzeltmesi F-06) | ✅ Kazara canlı kanıtlandı: 3000 doluyken yeni örnek "Port 3000 kullanımda + çözüm" mesajıyla çıkış yaptı |
| Admin prod build + `next start` 200 + koyu tema | ✅ |
| Admin→API CORS (3001 origin) | ✅ `Access-Control-Allow-Origin` döndü — Faz-1'deki admin sağlık kartları da bu düzeltmeden faydalanıyor |
| Mock adapter iki katmanlı koruma (yalnız `__DEV__` + flag) | ✅ Flag'siz koşuda HTTP adapter'e düşme davranışı canlı gözlendi (fail-closed, sahte başarı yok) |

Regresyon bulgusu yok: önceki fazlarda çalışan hiçbir özellik bozulmadı.

## 7. Bir Sonraki Faza Geçiş Kararı

**Karar: PASS WITH WARNINGS — bir sonraki faza (2b içerik uçları / 3b sunucu
kimliği, yol haritası numaralandırmasıyla) geçiş onaylanmıştır.**

Temel kabul kriteri — "temel ekranlar açılmalı, gezinme çalışmalı ve köşeli
kart tasarımı bütün ilgili ekranlarda korunmalı" — web platformunda ve gerçek
etkileşimlerle **sağlandı**: 13 ekranın tamamı açıldı, 20+ etkileşim çalıştı,
tüm runtime radius gözlemleri 0–4 px aralığında kaldı.

**Açık riskler (uyarılar):**
1. **Native cihaz doğrulaması bekliyor** — safe area, klavye, dokunma ve çoklu
   ekran boyutu deneyimi yalnız config/yüzde tabanlı kod incelemesiyle
   desteklenebildi. Cihazla ilk koşuda görsel kabul tekrarlanmalıdır.
2. **Kilitli bölüm panelleri** gerçek veri akışında (sunucu erişim kararı,
   Faz 2b/4) uçtan uca test edilmelidir; mock varsayılan profilinde ulaşılamadı.
3. Web kök zemini (F2-05) ve gerekiyorsa "-dk" gösterimi (F2-06) küçük
   parlatma kalemleri olarak bir sonraki UI dokunuşuna bırakıldı.

## Ekler

- Ekran görüntüleri (23 dosya): `docs/qa/screenshots/01-onboarding.png` … `24-404.png`
- Ham test sonuçları: `scripts/qa-faz2-results.json`
- Yeniden koşulabilir test betiği: `scripts/qa-faz2-ui.py`,
  `scripts/qa-faz2-player-probe.py`
- Değişen dosyalar (düzeltmeler): `apps/mobile/src/app/_layout.tsx`,
  `(tabs)/index.tsx`, `(tabs)/explore.tsx`, `(tabs)/library.tsx`,
  `category/[slug].tsx`, `components/home/hero-banner.tsx`,
  `hooks/queries/use-content-detail.ts`, `apps/api/.env.example`
