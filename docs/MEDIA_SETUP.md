# PerdeGo — Video Sağlayıcı (MediaProvider) Kurulum ve Canlı Geçiş Rehberi

> FAZ 4 ile devreye alınan video akışı altyapısının mimarisi, geliştirme
> kurulumu ve canlı sağlayıcıya (Bunny Stream / Mux / Cloudflare Stream)
> geçiş adımları.

## 1. Mimari özet

```
┌──────────────┐  playback session   ┌──────────────────────────────────┐
│  Mobil (expo │ ──────────────────▶ │  API — MediaService               │
│  -video)     │ ◀────────────────── │   · AccessService kararı (BR-07)  │
└──────────────┘  imzalı hls/mp4     │   · PlaybackSession (TTL, iptal)  │
      │                              │   · MEDIA_PROVIDER_PORT           │
      │  imzalı manifest/segment/    └───────────────┬──────────────────┘
      │  vtt istekleri (?token&exp)                  │
      ▼                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  MediaProviderPort (arayüz)                                      │
│   createUploadTicket · settleUpload · syncStatus ·               │
│   buildPlaybackSources · resolveFile · deleteAsset               │
├─────────────────────────────────────────────────────────────────┤
│  LOCAL (geliştirme)        │  Bunny / Mux / Cloudflare (canlı)   │
│  ffmpeg örnek HLS paketleri│  kendi HLS transkod + CDN           │
└─────────────────────────────────────────────────────────────────┘
```

**Sağlayıcı değişimi uygulamayı değiştirmez**: mobil istemci yalnızca oturum
yanıtındaki `sources.hls / sources.mp4` URL'lerini kullanır; yeni sağlayıcı
= yeni bir `MediaProviderPort` adapter'ı + ortam değişkenleri.

## 2. Güvenlik kuralları (görevin video altyapısı maddeleri)

| # | Kural | Uygulama |
|---|-------|----------|
| 1 | Orijinal video uygulamaya gömülmez | Video sağlayıcıda; mobilde yalnız imzalı URL |
| 2 | HLS + kalite seviyeleri | LOCAL: 240p/360p/540p HLS merdiveni; canlı sağlayıcı kendi ABR'ı |
| 3 | Büyük dosya backend gövdesinden taşınmaz | `POST /admin/episodes/:id/media/upload-url` → istemci dosyayı DOĞRUDAN sağlayıcıya PUT eder (local modda API'nin imzalı yükleme ucuna; gövde JSON ayrıştırıcısına girmez, akış diske yazılır) |
| 4 | Süreli + kontrollü yükleme URL'i | HMAC imzalı, `MEDIA_UPLOAD_TTL_SECONDS` (varsayılan 900 sn), tek kullanımlık (ikinci PUT 409) |
| 5 | Transkod/processing takibi | `AWAITING_UPLOAD → PROCESSING → READY/ERROR`; `GET /admin/media/:id` + `POST /admin/media/:id/sync` |
| 6 | Yalnız READY + PUBLISHED oynatılır | Oturum açılışında ve HER dosya isteğinde yeniden denetlenir |
| 7 | Her oynatma isteğinde erişim doğrulaması | `POST /media/playback/:id/session` AccessService kararı; dosya uçları imza + oturum + READY kontrolü |
| 8 | Süreli imzalı playback token/URL | `PLAYBACK_TTL_SECONDS` (max 900 sn), HMAC-SHA256, oturum iptali anında keser |
| 9 | Premium için kalıcı public URL yok | Tüm kaynaklar oturum imzalı; kalıcı bağlantı üretilemez |
| 10 | URL/anahtar uygulamaya gömülmez | Yalnız oturum yanıtı taşır; mock adapter bile sahte URL üretmez |

## 3. Geliştirme kurulumu (LOCAL sağlayıcı)

### 3.1 Ortam değişkenleri (apps/api/.env)

```bash
MEDIA_PROVIDER=local
MEDIA_UPLOAD_TTL_SECONDS=900      # yükleme anahtarı TTL'i (sn)
MEDIA_STORAGE_DIR=media-storage   # API çalışma dizinine göre
MEDIA_MAX_UPLOAD_MB=512           # tek yükleme üst sınırı
MEDIA_PROCESSING_DELAY_MS=1500    # sahte transkod gecikmesi (test: 0)
```

> `WEBHOOK_SIGNING_SECRET` tanımlıysa oynatma/yükleme imzaları da ondan
> türetilir; tanımsızsa geliştirmeye özel türemiş sır kullanılır.

### 3.2 Örnek medya paketlerini üret (telifsiz, sentetik)

```bash
bash scripts/generate-sample-media.sh
# → apps/api/media-storage/samples/{a,b,c}/
#    master.m3u8 (3 seviye + tr/en altyazı grubu), video.mp4, subtitles/*.vtt
```

- Paketler `.gitignore`'dadır; API bunlar olmadan `MEDIA_MISSING` hatası
  verir (sessiz bozuk davranış yok).
- Seed, 13 bölümü `a|b|c` paketlerine round-robin atar (`sample:a|b|c`).

### 3.3 Doğrudan yükleme akışı (geliştirme → canlı birebir)

```bash
# 1) Anahtar al (EDITOR/ADMIN)
TICKET=$(curl -X POST :3000/api/v1/admin/episodes/:id/media/upload-url \
  -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d '{"originalName":"bolum1.mp4","contentType":"video/mp4"}')
# 2) Dosyayı DOĞRUDAN sağlayıcıya gönder (API gövdesinden geçmez)
curl -X PUT "$TICKET.data.uploadUrl" -H 'Content-Type: video/mp4' \
  --data-binary @bolum1.mp4
# 3) Durum takibi (polling)
curl -X POST :3000/api/v1/admin/media/$MEDIA_ID/sync -H "Authorization: Bearer $ADMIN"
#    AWAITING_UPLOAD → PROCESSING → READY
```

Not: `settleUpload` magic byte (`ftyp`) doğrulaması yapar; sahte/mp4 olmayan
dosya `UNSUPPORTED_MEDIA` ile reddedilir ve disk temizlenir.

## 4. Canlı sağlayıcıya geçiş

`MEDIA_PROVIDER` ortam değişkenini değiştirin ve ilgili adapter'ı
`apps/api/src/media/provider/` altına ekleyin (port `media-provider.port.ts`).
Bu depoda canlı sağlayıcı adapter'ları BİLİNÇLİ olarak uygulanmamıştır —
`MEDIA_PROVIDER=bunny|mux|cloudflare` başlangıçta anlaşılır hatayla çıkar
(sessiz local'e düşme yok). Aşağıdaki tablo geçişte doldurulacak sözleşmeyi
özetler:

| Port metodu | Bunny Stream | Mux | Cloudflare Stream |
|---|---|---|---|
| `createUploadTicket` | `POST /videolibrary/{id}/videos` (`ttl`'li direct upload URL) | `POST /video/v1/uploads` (signed, `max_duration_secs`) | `POST /stream/direct_upload` (TUS) |
| `settleUpload` | upload tamam → `state=preparing` | upload tamam → asset `preparing` | TUS complete → `ready_to_stream=false` |
| `syncStatus` | `GET video` → `readyToStream` | `GET asset` → `status.state=ready` | `GET stream/:id` → `readyToStream` |
| `buildPlaybackSources` | `.m3u8` iFrame/URL + token auth | `.m3u8` playback policy imzalı JWT | `manifest.m3u8` + signed token |
| `resolveFile` | CDN'e 302 (imzalı) | playback JWT'li URL | signed URL |
| `deleteAsset` | `DELETE video` | `DELETE asset` | `DELETE stream/:id` |

Ortam değişkenleri (eklenecekler):

```bash
MEDIA_PROVIDER=bunny               # bunny | mux | cloudflare
MEDIA_BUNNY_LIBRARY_ID=...
MEDIA_BUNNY_API_KEY=...            # sunucu sırrı — uygulamaya ASLA gömülmez
# MEDIA_MUX_TOKEN_ID / MEDIA_MUX_TOKEN_SECRET / MEDIA_MUX_SIGNING_KEY
# MEDIA_CF_ACCOUNT_ID / MEDIA_CF_API_TOKEN / MEDIA_CF_SIGNING_KEY
```

**Tetikleyiciler:**
- `PRODUCTION` + `MEDIA_PROVIDER=local` → başlangıç reddi (env doğrulaması).
- `MEDIA_PROVIDER` adapter'sız → `MediaModule` fabrikası anlaşılır hata verir.

## 5. Oynatma akışı (istemci perspektifi)

1. `GET /catalog/episodes/:id` → `access.canPlay` (sunucu kararı).
2. `POST /media/playback/:id/session` → `sources` + `textTracks` + `expiresAt`.
3. Platform: native → `sources.hls` (ABR + altyazı grubu), web → `sources.mp4`.
4. `expiresAt`'a ≤60 sn kalınca sessiz yenileme: yeni oturum + `player.replace`
   (konum korunur).
5. İlerleme: 5 sn'de bir `PUT /watch-progress/:episodeId`; pause/background/
   unmount'ta anında. Devam: oturumun `positionSeconds` alanı.

## 6. Test ve kanıt

- Birim: `apps/api/src/media/provider/local-sample.provider.spec.ts` (19 test)
- Entegrasyon (gerçek PG): `apps/api/src/integration.faz4-media.spec.ts`
  (oturum → manifest → segment → vtt → mp4 Range; imza ihlalleri; 402/403;
  yükleme → READY → tek-READY düşürme → mp4 oynatımı)
- Mobil mantık: `src/components/player/__tests__/playback-logic.test.ts`
- E2E (Expo web, gerçek API): `scripts/qa-faz4-ui-e2e.py` — oynatma altın yol,
  kilit ekranları, farklı ekran oranlarında kırpma denetimi, bellek temizliği.
