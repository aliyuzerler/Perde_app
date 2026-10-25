# FAZ 4 — Video Akışı ve Oynatma (Geliştirme Raporu)

> Dikey video oynatım sistemi + MediaProvider video altyapısı.
> Tarih: 2026-10-26 · Görev türü: geliştirme (sonraki faz QA'sı ile kabul
> doğrulaması yapılacaktır — bu rapor uygulama kanıtını belgeler).

## 1. Kapsam ve yaklaşım

Görev: PerdeGo için gerçek dikey video oynatım sistemi. Video yayın
sağlayıcısı backend'deki **MediaProvider arayüzünün arkasına** yerleştirildi;
mobil tarafta **expo-video** kullanıldı. Amaç: kullanılan video servisi,
uygulama kodu değiştirilmeden değiştirilebilsin (Kural D5 — sağlayıcı
bağımsızlığı).

İki katman geliştirildi:

1. **Backend (apps/api)** — `MediaProviderPort` arayüzü + geliştirme için
   telifsiz örnek videolarla çalışan `LOCAL` adapter; süreli/imzalı doğrudan
   yükleme akışı; işleme (transcoding) durumu takibi; her oynatma isteğinde
   sunucu tarafı erişim doğrulaması; oturum bağlı imzalı akış URL'leri.
2. **Mobil (apps/mobile)** — expo-video tabanlı dikey oynatıcı: görevde
   sayılan 12 oynatıcı özelliğinin tamamı; ilerleme sunucuya senkron; kaldığı
   yerden devam; bölüm sonu + sonraki bölüm.

Uygulanan mimari kararlar, görevin 10 video altyapısı kuralıyla birebir
eşleşir (bkz. `docs/MEDIA_SETUP.md` §2 tablosu).

## 2. Backend — MediaProvider altyapısı

### 2.1 Port ve adapter

- `src/media/provider/media-provider.port.ts` — arayüz: `createUploadTicket`,
  `verifyUploadTicket`, `settleUpload`, `syncStatus`, `buildPlaybackSources`,
  `resolveFile`, `deleteAsset` (+ opsiyonel `assertSamplePresent`).
- `src/media/provider/local-sample.provider.ts` — geliştirme adapter'ı:
  - **Örnek paketler** (`sample:a|b|c`): `scripts/generate-sample-media.sh`
    ffmpeg ile telifsiz sentetik dikey 9:16 akışlar üretir — 3 kalite
    (240p/360p/540p HLS merdiveni) + ilerleyici mp4 + tr/en WebVTT altyazı.
  - **Yüklemeler** (`upload:<mediaId>`): doğrudan yükleme PUT gövdesi akış
    olarak diske yazılır; magic byte (`ftyp`) doğrulaması; ffprobe ile süre;
    `MEDIA_PROCESSING_DELAY_MS` ile gecikmeli PROCESSING→READY (sahte transkod
    taklidi — canlı sağlayıcıda gerçek transkod vardır).
- `media.module.ts` — `MEDIA_PROVIDER` env'siyle adapter seçimi; uygulanmayan
  sağlayıcı (bunny/mux/cloudflare) başlangıçta ANLAŞILIR hatayla çıkar
  (sessiz local'e düşme yok). `PRODUCTION` + `local` env doğrulamasında reddedilir.

### 2.2 Güvenli yükleme akışı (sağlayıcıya doğrudan)

```
POST /admin/episodes/:id/media/upload-url   → { mediaId, uploadUrl (imzalı, TTL 900 sn), method: PUT, maxSizeBytes }
PUT  <uploadUrl> (ham dosya gövdesi)        → sağlayıcı ucu (local modda API'nin imzalı yükleme ucu)
GET  /admin/media/:mediaId                  → durum (polling)
POST /admin/media/:mediaId/sync             → sağlayıcı durumu yeniden çekilir
```

- Büyük dosya backend JSON gövdesinden TAŞINMAZ; JSON içerik türüyle gelen
  PUT reddedilir (400), üst sınır aşımı 400 UPLOAD_TOO_LARGE, sahte dosya
  400 UNSUPPORTED_MEDIA, ikinci PUT 409 MEDIA_ALREADY_UPLOADED (tek kullanım).
- Durum makinesi: `AWAITING_UPLOAD → PROCESSING → READY | ERROR`.
- **Tek-READY kısıtı** (kısmi unique index): yeni sürüm READY olduğunda eski
  READY kayıtları aynı transaction içinde `ERROR ('Eski sürüm: yeni medya
  yayında')` ile düşürülür — sıra hatası UNIQUE_CONSTRAINT'a yol açtığı için
  düşürme ÖNCE yapılır (geliştirme sırasında yakalanan kusur — §5).

### 2.3 Oynatma uçları ve imza modeli

- `POST /media/playback/:episodeId/session` — erişim kararı YENİDEN
  doğrulanır (AccessService; BR-07): 402 NEEDS_SUBSCRIPTION/NEEDS_CREDITS,
  403 AGE_RESTRICTED, 409 EPISODE_NOT_READY/PLAYBACK_LIMIT_REACHED.
  Yanıt: `provider`, `sources {hls, mp4}`, `quality`, `textTracks[]`,
  `positionSeconds` (kaldığı yer), `expiresAt`, `guest`.
- `GET /media/hls/:episodeId/:sessionId/*file` — imzalı dosya servisi
  (master/varyant playlist, .ts segment, .vtt altyazı, video.mp4).
  Her istekte: HMAC imza + süre + oturum iptali (DB) + READY denetimi.
  Manifest satırları (segment + altyazı URI) sunucu tarafından oturum
  imzalı mutlak URL'lere yeniden yazılır; varyant playlist'lerde göreli
  segment yolları playlist'in KENDİ dizinine göre çözülür (geliştirme
  sırasında yakalanan kusur — §5).
- MP4: `Range` desteği (206 + Content-Range; `bytes=a-b`, `bytes=a-`,
  `bytes=-N`; geçersiz aralık 416). Akış dosyadan servis edilir
  (belleğe tam yüklenmez).
- İmza: HMAC-SHA256(secret, `playback:{sessionId}:{episodeId}:{exp}`) —
  kalıcı public URL üretilemez; premium içerik daima oturum bağlıdır.

### 2.4 Veri modeli (migration `20261025215138_faz4_media_provider`)

- `MediaProvider` enum'una `LOCAL`; `MediaState`'e `AWAITING_UPLOAD`.
- `episode_media`: `originalName`, `sizeBytes`, `uploadExpiresAt`, `readyAt`.
- Yeni tablo `media_text_tracks` (mediaId, language UNIQUE, label, sourceRef,
  isDefault) — sağlayıcı bağımsız altyazı kaydı.
- Seed: 13 bölüm `a|b|c` örnek paketlerine round-robin atandı + tr/en demo
  altyazı satırları; eski sahte BUNNY asset kayıtları temizlendi
  (gerçek dosyası hiç var olmadığından dürüst davranış).

## 3. Mobil — expo-video dikey oynatıcı

### 3.1 Yapı (motor izolasyonu)

- `components/player/video-stage.tsx` — expo-video `VideoView` yalnız burada;
  `contentFit="contain"` ZORUNLU (kırpma yok — farklı ekran oranlarında zarf).
- `components/player/video-player-commands.ts` — player mutasyonları için
  modül düzeyi komutlar (React Compiler uyumu: hook değerine özellik ataması yok).
- `components/player/playback-machine.ts` — saf durum makinesi
  (`acquiring/preparing/playing/paused/buffering/stalled/error/ended/locked`),
  oturum yenileme eşiği, platform kaynak seçimi (native→HLS, web→mp4).
- `components/player/progress-reporter.ts` — 5 sn'de bir flush + anlık flush;
  <1 sn ilerlemede yazmaz (sahte kayıt engeli); `bindFlush` ile bayat kapanış yok.
- `hooks/player/use-playback-session.ts` — imzalı oturum sorgusu.
- `hooks/player/use-episode-neighbors.ts` — accessSeasons'tan önceki/sonraki
  bölüm (yalnız canPlay olanlar).
- `app/player/[episodeId].tsx` — kompozisyon; bölüm değişiminde `key` ile tam
  remount → eski oynatıcı belleği serbest kalır (useVideoPlayer unmount'ta release).

### 3.2 Görevin oynatıcı özellikleri — tamam

| Özellik | Durum |
|---|---|
| Dikey video oynatma | ✅ 9:16 sahne, contain |
| Oynat/duraklat | ✅ + otomatik oynatma (hazır olunca) |
| İlerleme çubuğu + süre | ✅ sürükleme/dokunma ile arama (PanResponder) |
| Ses açma/kapatma | ✅ |
| Tam ekran + yönelim | ✅ JS state + expo-screen-orientation PORTRAIT kilidi (dikey içerik; yatay içerik için LANDSCAPE dalı hazır) |
| Bölümü baştan başlatma | ✅ |
| Önceki/sonraki bölüm | ✅ sunucu accessSeasons'tan; canPlay olmayanlar hariç |
| Altyazı seçimi (destekleniyorsa) | ✅ sunucu textTracks ↔ oynatıcı track eşlemesi; desteklemeyen platformda menü gizli (zarif düşüş) |
| İnternet kesintisi / buffering / hata ekranları | ✅ stalled → "Bağlantı koptu"; buffering spinner; error → Tekrar Dene |
| İzlenen süreyi backend'e kaydetme | ✅ 5 sn'de bir PUT /watch-progress + pause/background/unmount/ended anlık |
| Kaldığı yerden devam | ✅ oturum positionSeconds > 5 → seek + oynat |
| Bölüm sonu + sonraki bölüm | ✅ "Bölüm sonu" kaplaması: Baştan Oynat / sonraki (10 sn geri sayımlı otomatik geçiş, Vazgeç ile iptal) / Kapat |

Erişim kararı YALNIZCA sunucudan: kilitli bölümde oynatma oturumu hiç açılmaz
(kilit paneli + CTA); mock adapter oturum ucunda SAHTE URL ÜRETMEZ (503 —
gerçek sunucu gerekir). Video URL'i/anahtarı uygulama koduna gömülmedi.

Oturum TTL yenileme: `expiresAt`'a ≤60 sn kalınca sessiz refetch +
`player.replace` (konum korunur) — uzun bölümlerde akış kopmaz.

## 4. Doğrulama kanıtları (gerçek komutlar)

| Koşum | Sonuç |
|---|---|
| typecheck (contracts, api, mobile, admin) `tsc --noEmit` | 4/4 hata yok |
| lint (`expo lint`, `eslint .`) | hata/uyarı yok |
| Testler | **341/341** — contracts 58 (10 yeni) + api 150 (19 provider unit + 7 gerçek-PG entegrasyon yeni) + mobile 133 (19 oynatıcı mantığı yeni) |
| Build | `nest build` ✅, `expo export -p web` ✅ |
| Canlı probe `scripts/qa-faz4-run-probes.sh` → `qa-faz4-media-probe.mjs` | **44/44 PASS** — oturum, manifest→segment→vtt→mp4 (Range 206/416), imza ihlalleri, 402/403/404 matrisi, doğrudan yükleme (AWAITING→PROCESSING→READY, tek-READY düşürme, ikinci PUT 409), medya yönetimi |
| UI E2E `scripts/qa-faz4-ui-e2e.sh` (Expo web, MOCK_API=0, Playwright) | **17/17 PASS** — altın yol (otomatik oynatma, duraklat/oynat, ses, baştan başlat, ilerleme çubuğu), 3 ekran oranında `object-fit: contain` (kırpma yok), CREDIT kilit paneli, çevrimdışı ekranı + toparlanma, bölüm sonu + baştan oynat, `<video>` ekran kapanınca DOM'dan düşer (bellek temizliği), üye izleme senkronu |
| Regresyon | P2C katalog 41/41, F5 ek probe 16/16, auth 22/22 |
| Ekran görüntüleri | `docs/qa/screenshots/faz4/` (10 adet) |

## 5. Geliştirme sırasında bulunan ve düzeltilen kusurlar

| # | Şiddet | Kusur | Düzeltme |
|---|---|---|---|
| F4-D1 | YÜKSEK | `createUploadUrl` rastgele UUID'li `providerAssetId` üretiyor, dosya satır id'siyle yazılıyordu → sync yanlış dosyayı arıyor, durumu AWAITING_UPLOAD'a geri yazıyordu | Kimlik deterministik: satır id = `upload:<id>`; ayrıca sağlayıcı "dosya yok" derse mevcut durum KORUNUR (geriye örtme yok) |
| F4-D2 | ORTA | Tek-READY kısıtında yeni medya önce READY'e alınıyordu → UNIQUE_CONSTRAINT 409 | Transaction sırası: eski READY'ler ÖNCE ERROR'a düşürülür |
| F4-D3 | ORTA | Varyant playlist'in segment satırları alt dizin önekisiz imzalanıyordu → segment 404 | Yeniden yazım playlist'in kendi dizinine göre (`240p/seg000.ts`) |
| F4-D4 | ORTA | MediaService ↔ MediaModule döngüsel import → Nest init UndefinedDependencyException (entegrasyon testlerinde SIGABRT maskesi) | Simgeler `provider/tokens.ts`'e taşındı; AdminModule'e MediaModule importu |
| F4-D5 | ORTA | Oynatıcı yalnızca `positionSeconds > 5` iken oynatıyordu → YENİ bölüm otomatik oynatmıyordu (UI E2E'de canlı yakalandı) | readyToPlay'de konum > 5 ise seek + HER ZAMAN oynat |
| F4-D6 | DÜŞÜK | Suffix Range (`bytes=-N`) bitiş ofseti olarak yorumlanıyordu → 416 | Son-N bayt: start=total−N, end=total−1 |
| F4-D7 | DÜŞÜK | Detay ekranı kısa filmde "Faz 4'te devreye alınacak" uyarısı gösteriyordu (bayat) | FILM/SHORT_FILM de gerçek oynatıcıya gider |
| F4-D8 | DÜŞÜK | Express 5 wildcard parametresi segment DİZİSİ döndürüyordu → çok parçalı dosya yolları 404 | Parametre birleştirilir (`240p/playlist.m3u8`) |

## 6. Dürüst sınırlar ve sonraki faz notları

- **Gerçek cihaz doğrulaması yok** (emülatör/fiziksel cihaz bu ortamda yok):
  native HLS (AVPlayer/ExoPlayer), arka plan sesi, tam ekran yönelim kilidi ve
  AirPlay davranışları Expo web'de doğrulanamaz — EAS build sonrası test
  edilmelidir. Web oynatma gerçek tarayıcıda (Playwright) kanıtlandı.
- **Canlı sağlayıcı adapter'ları bilinçli olarak uygulanmadı** (görev: geliştirme
  için örnek adapter + canlı geçiş için env/belge): Bunny/Mux/Cloudflare için
  port-tablo eşlemesi `docs/MEDIA_SETUP.md` §4'te hazır.
- Yüklenen dosyalar için HLS transkod YOKTUR (local adapter mp4 servis eder);
  canlı sağlayıcılar kendi transkodunu yapar — port sözleşmesi bunu
  `buildPlaybackSources` ile soyutlar.
- Altyazı seçimi web'de etkin değildir (expo-video web text track API'si bu
  paketlerde boş döner) — menü gizlenir; native'de HLS WebVTT grubu ile çalışır.
- Oturum yenileme penceresi PLAYBACK_TTL (varsayılan 300 sn) içinde çalışır;
  iptal (revoke) sonrası 403 anında keser (probe kanıtlı).
- Kredi bölümü kilit akışının "kredi ile aç → oynat" tam döngüsü mevcut
  mock satın alma uçlarıyla çalışır; gerçek mağaza doğrulaması Faz 5.
