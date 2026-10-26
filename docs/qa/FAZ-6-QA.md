# FAZ 6 QA — Video ve HLS

> Doğrulanan faz: **FAZ 4 geliştirmesi — gerçek dikey video oynatım sistemi +
> MediaProvider video altyapısı** (commit `3550145`).
> Tarih: 2026-10-26 · Görev türü: kalite kontrol / test / kabul doğrulaması
> · Karar: **PASS WITH WARNINGS**

---

## 1. Faz adı ve test kapsamı

Bu faz QA'sı, görevin **FAZ 6 TESTİ: VİDEO VE HLS** listesindeki 12 maddenin
tamamını, üç erişim türünün (ücretsiz / abonelik / kredi) ayrı ayrı
denetlenmesini ve önceki fazların regresyonunu kapsar. Yeni özellik
geliştirilmemiş; yalnızca **test sırasında bulunan 2 kusur düzeltilmiş** ve
bu düzeltmelere ait 5 yeni test yazılmıştır.

**Test ortamı (sıfırdan kurtarıldı):** workspace bağımlılıkları yeniden
kuruldu, kök `.env` bozulmuştu (SQLite `file:` yolu) → git'ten geri
yüklendi, `apps/api/.env` örnekten yeniden yaratıldı, gömülü PostgreSQL
16.14 (`scripts/qa-pg/setup-pg.sh`) start alındı, 5 migration + idempotent
seed koşuldu, örnek HLS paketleri (`scripts/generate-sample-media.sh`,
ffmpeg) yeniden üretildi.

**Canlı yayın kaynağı:** görevin izin verdiği gibi **geliştirme için izinli
test videosu** (telifsiz sentetik HLS paketleri, LOCAL adapter) kullanıldı.
Gerçek yayın servisi (Bunny/Mux/Cloudflare) bağlanmadı; bu nedenle canlı
sağlayıcı testleri tamamlanmış SAYILMADI (bkz. §6).

## 2. Çalıştırılan komutlar (gerçek koşumlar)

| # | Komut | Sonuç |
|---|---|---|
| 1 | `pnpm -r --if-present run typecheck` (contracts/api/mobile/admin, `tsc --noEmit`) | **4/4 hata yok** |
| 2 | `pnpm -r --if-present run lint` (`eslint .`, `expo lint`) | **4/4 hata/uyarı yok** |
| 3 | `pnpm --filter @perdego/api run build` (nest build) | ✅ derlendi |
| 4 | `pnpm --filter @perdego/admin run build` (next build) | ✅ derlendi |
| 5 | `expo export -p web` (EXPO_PUBLIC_MOCK_API=0) | ✅ çıktı alındı |
| 6 | `pnpm --filter @perdego/contracts run test` (vitest) | **58/58** |
| 7 | `pnpm exec vitest run --pool=threads` (apps/api, gerçek PG üzerinde) | **154/154** (19 dosya; 30 gerçek-PG entegrasyon dahil) |
| 8 | `pnpm --filter @perdego/mobile run test` (jest) | **133/133** |
| 9 | `bash scripts/qa-faz4-run-probes.sh` → `qa-faz4-media-probe.mjs` (canlı API :4571) | **44/44 PASS** |
| 10 | `bash scripts/qa-faz6-run-probes.sh` → `qa-faz6-security-probe.mjs` (**YENİ**, canlı API :4572, `PLAYBACK_TTL_SECONDS=60`) | **18/18 PASS** |
| 11 | `bash scripts/qa-faz4-ui-e2e.sh` → `qa-faz4-ui-e2e.py` (Expo web + Playwright, MOCK_API=0) | **17/17 PASS** (2. koşum; 1. koşumda soğuk derleme dalganması — bkz. F6-04) |
| 12 | `bash scripts/qa-faz5-run-probes.sh` (regresyon: P2C + F5 + auth) | **41/41 + 16/16 + 22/22** |
| 13 | `bash scripts/qa-faz2b-smoke.sh` (API :3000 canlı) | **13/13** |
| 14 | Paket taraması: `grep -rl <sır-deseni> dist-web` (9 desen) + mobil kaynak taraması | **sızıntı yok** (bkz. madde 12) |

**Toplam: 345 birim/entegrasyon testi + 79 canlı probe + 17 UI E2E = 441
koşum, 0 başarısız** (düzeltmeler sonrası son koşumlar).

## 3. FAZ 6 kabul maddeleri — tek tek sonuçlar

| # | Madde | Yöntem | Sonuç |
|---|---|---|---|
| 1 | Video yükleme + transkod durumu takibi | probe: `upload-url → AWAITING_UPLOAD → PUT (PROCESSING) → sync → READY`; tek-READY kuralında eski sürüm ERROR'a düşürüldü; `status.playbackReady` | ✅ 44/44 içinde 9 kontrol |
| 2 | HLS akışının oynatılması | probe: master manifest → varyant playlist → `.ts` segment (`video/mp2t`) → `.vtt`; UI E2E: `<video>` yüklendi, gerçek HLS oynatıldı | ✅ web kanıtlı; **native cihaz doğrulaması YOK** (bkz. §6) |
| 3 | Oynat/duraklat, ses, ilerleme çubuğu | UI E2E 02–06: pause→paused=True, play→paused=False; ses etiketleri; seek=True; süre etiketleri | ✅ |
| 4 | Bölüm değiştirme + bölüm sonu | UI E2E 07 (tek bölümde sonraki devre dışı), 14 (bölüm sonu ekranı), 15 (baştan oynat); FAZ 4 geliştirmesinde sonraki-bölüm otomatik geçişi kanıtlanmıştı | ✅ |
| 5 | İzleme ilerlemesinin backend'e kaydı | probe: `PUT /watch-progress` 200 saved=true; UI E2E 16: oynatma sonrası sunucuda `watch_progress` güncellendi (DB/API kanıtı) | ✅ |
| 6 | Uygulama yeniden açıldığında kaldığı yerden devam | probe: oturum yanıtı `positionSeconds` (kayıtlı konum) + `GET /watch-progress` okuma; UI E2E 10: devam-et rayı sunucu verisiyle | ✅ sunucu + web kanıtı |
| 7 | İnternet kesintisi, buffering, bozuk URL | UI E2E 12/13: ağ kesintisi → çevrimdışı ekranı → toparlanma; oynatıcı `stalled/buffering/error` durumları (birim testli); bozuk imzalı URL → 403 (probe) | ✅ web kanıtı |
| 8 | Süresi dolmuş playback URL/token | **gerçek TTL dolumu**: `PLAYBACK_TTL_SECONDS=60` ile API, 61 sn bekleme → manifest **403 TOKEN_EXPIRED**; yeni oturum açılabilir (kalıcı kilit yok) | ✅ |
| 9 | Ücretli bölüme yetkisiz doğrudan API çağrısı | aboneliksiz üye SUB → **402 NEEDS_SUBSCRIPTION**; kredisiz üye CREDIT → **402 NEEDS_CREDITS**; kredi satın al (simüle) → `POST /credits/unlock` → oturum **201** → manifest 200; DRAFT → 404 | ✅ |
| 10 | Başka kullanıcının playback yetkisi/URL'i | B kullanıcısı A imzalı manifest URL ile **200 aldı** → imzalı URL hamilidir (bearer); TTL 60 sn ve oturum satırı süresi ile sınırlı — **belgeli ödün** (bkz. §4) | ⚠️ ölçüldü, ödün olarak kabul |
| 11 | Bölüm değişiminde eski oynatıcı temizliği | UI E2E 08: ekran kapanınca `<video>` DOM'dan düşüyor (kalan video=0); ekran `key` ile tam remount (useVideoPlayer release) | ✅ |
| 12 | API anahtarlarının mobil pakete sızması | `dist-web` 9 desen taraması: `perdego-dev-playback`, `perdego-dev-media`, `perdego_dev_pass`, `WEBHOOK_SIGNING_SECRET`, `JWT_ACCESS`, `PRIVATE KEY`, `apiKey`, `api_key` → **0 eşleşme** (`SECRET` tek eşleşme React iç yapısı `__SECRET_INTERNALS_...` — yanlış pozitif); API oturum/upload-url yanıtlarında 5 desen taraması → temiz; mobil kaynakta sabit video URL/anahtar yok | ✅ |
| + | Ücretsiz / abonelik / kredi ayrı ayrı | FREE: konuk + üye oturum 201, satırsız konuk akışı BR-08; SUB: 402 → simüle doğrulama → 201; CREDIT: 402 → satın al → unlock → 201 | ✅ |
| + | "Sadece buton kilitli görünmesi yeterli değil" | kilit kararı sunucuda: oturum ucu 402/403/404 matrisi canlı kanıtlandı; UI kilit paneli yalnız CTA | ✅ |

## 4. Bulunan hatalar ve yapılan düzeltmeler

### F6-01 · YÜKSEK (güvenlik) — İmza sırrı üretimde zorunlu değildi; sahte token ile premium içerik alınabiliyordu · DÜZELTİLDİ
- **Kanıt (düzeltme öncesi, canlı):** fallback sır (`WEBHOOK_SIGNING_SECRET` tanımsızken `perdego-dev-playback-<DATABASE_URL son 24 karakter>`) ile var olmayan `sessionId` için üretilen HMAC token, **premium (SUBSCRIPTION) bölüm manifestini 200 ile döndürdü**; ayrıca bilinen sırra sahip saldırgan mevcut bir oturumu farklı `exp` ile yeniden imzalayabildi.
- **Kök neden (üç katman):** (a) `env.schema` üretimde `WEBHOOK_SIGNING_SECRET` istemiyordu; (b) fallback sır `DATABASE_URL`'den türetildiği için öngörülebilir; (c) dosya servisi, oturum satırı **yoksa** denetimi atlıyordu (`session &&` kısa devresi).
- **Düzeltme:** (1) `env.schema.ts` — `PRODUCTION` için `WEBHOOK_SIGNING_SECRET` zorunlu (refine; tanımsızsa API açılmaz); (2) `media.service.verifyPlaybackRequest` — **FREE olmayan bölümlerde canlı (iptal edilmemiş, süresi geçmemiş) oturum satırı şartı**; satır yoksa 403. Konuk FREE akışı (BR-08) bilinçli olarak satırsız kalmayı sürdürür ve davranış testle sabitlendi.
- **Testler:** 3 yeni env şema testi + entegrasyon testi `03b` (sahte token premium → 403; FREE satırsız konuk → 200) + probe F6-01/01b (canlı 403 kanıtı). `docs/MEDIA_SETUP.md`'ye üretim sırrı uyarısı eklendi.
- **Not:** üretim geçişinde `WEBHOOK_SIGNING_SECRET` artık zorunlu olduğundan `.env`/gizli anahtar yönetimine eklenmelidir (öneri: `openssl rand -hex 32`).

### F6-02 · YÜKSEK (gizli kusur, F6-01 düzeltmesiyle ortaya çıktı) — Oynatma oturum satırı kimliği URL ile eşleşmiyordu; iptal/süre denetimi fiilen ölüydü · DÜZELTİLDİ
- **Kanıt:** F6-01 düzeltmesi (premiumda satır şartı) uygulandığında **aboneli/kredi hakları olan kullanıcıların premium manifestleri de 403** aldı — satır bulunamıyordu.
- **Kök neden:** `createPlaybackSession` satırı `@default(cuid())` ile yaratıyor ama URL'lerde `randomUUID()` sessionId taşıyordu → `findUnique` hiç eşleşmez, "oturum iptali/süresi" denetimi hiçbir zaman gerçek veriye bakmıyordu (satırlar ölü veri; paralel-limit sayacı userId üzerinden olduğundan etkilenmiyordu).
- **Düzeltme:** satır `id: sessionId` ile yaratılır. Artık oturum satırı süresi/iptali dosya isteklerinde gerçekten uygulanır (TTL testi canlı kanıtladı).
- **Test:** FAZ 4 media probe 44/44 yeniden koşuldu → regresyon yok.

### F6-03 · ORTA (QA aracı) — yeni güvenlik probe'unun ilk koşumundaki 3 hata (bu fazda yazıldı, ürün etkisi yok) · DÜZELTİLDİ
- `/store/...` yerine `/billing/purchases/validate` (Idempotency-Key ile), bakiye alanı `data.total`, URL çıkarımında `endsWith` yerine sorgu içeren eşleşme, `freeEp.id` yerine `freeEp` (ID string'i). Düzeltme sonrası probe **18/18**.

### F6-04 · DÜŞÜK (dalgalanma) — UI E2E "01 ana sayfa" ilk koşumda 20 sn timeout · KABUL + NOT
- Metro soğuk derlemesi ilk yüklemede 20 sn'lik zaman aşımını aştı; aynı koşumun devamındaki 16 test geçti. **2. koşumda 17/17.** Ürün hatası değil; betikte ilk-yükleme zaman aşımının artırılması önerilir (bu fazda değiştirilmedi).

### Ödün olarak kabul edilenler (kusur değil, bilinçli sınır — raporlanması zorunlu)
- **F6-ÖDÜN-1 (bearer URL):** geçerli imzalı URL'i alan başka bir kullanıcı TTL (varsayılan 300 sn; koşumda 60 sn) ve oturum satırı süresi dolana kadar akışı çalabilir. Standart imzalı-URL modeliyle uyumlu; premium içerik daima oturum bağlı, kalıcı public URL üretilemiyor. Sonraki faz önerisi: cihaz parmak izi bağlama veya daha kısa segment TTL'i.
- **F6-ÖDÜN-2 (dev fallback sır):** yalnız `NODE_ENV≠production`'da; sır biliniyorsa mevcut oturum re-sign edilebilir — üretimde sır zorunlu+güçlü olduğundan pratikte imkansız, oturum TTL'i de üst sınır koyar.
- **BR-08 (bilinçli tasarım):** FREE içerikte satırsız konuk isteği geçerli imzayla 200 — testle sabitlendi.

## 5. Başarısız veya çalıştırılamayan testler

| Test | Durum | Neden |
|---|---|---|
| Native cihaz oynatma (AVPlayer/ExoPlayer: native HLS, tam ekran yönelim kilidi, arka plan sesi, altyazı menüsü, AirPlay) | **YAPILAMADI** | Bu ortamda fiziksel cihaz/emülatör yok; EAS build gerektirir. Web (Playwright gerçek tarayıcı) kanıtı mevcut. |
| Canlı sağlayıcı (Bunny/Mux/Cloudflare) yükleme + transkod + CDN | **YAPILAMADI** | Dış hesap/API anahtarı yok; görev gereği bu testler tamamlanmış sayılmadı. Port-tablo eşlemesi `MEDIA_SETUP.md §4`'te hazır; geliştirme adapter'ı tüm akışı LOCAL'de uçtan uca kanıtlıyor. |
| Mailpit SMTP doğrulaması | **YAPILAMADI** | Mailpit kurulu değil; JSONL outbox transport kullanıldı (auth akışları için yeterli). |
| Ekran görüntüsü setini yenileme | Kısmi | 2. E2E koşumu ekran görüntülerini yeniledi (17 kanıt `docs/qa/screenshots/faz4/`); bu QA'da yeni görsel üretilmedi. |

## 6. Önceki fazlardan kalan regresyonlar

| Regresyon | Sonuç |
|---|---|
| FAZ 4 media probe (44 kontrol — oynatma, yükleme, imza, medya yönetimi) | **44/44** (F6-01/F6-02 düzeltmeleri sonrası yeniden koşuldu) |
| Faz 2c katalog probe (P2C, 41 kontrol) | **41/41** |
| FAZ 5 ek probe (F5, 16 kontrol — sayfalama/izolasyon/taslak sızma) | **16/16** |
| Faz 3b auth probe (22 kontrol — kayıt/doğrulama/oturum/parola/rate limit) | **22/22** |
| Faz 2b smoke (13 kontrol — sağlık/Swagger/zorunlu uçlar/hata zarfı) | **13/13** |
| Contracts 58 + Mobile 133 (dokunulmadı; son teyit koşumu) | **58/58 + 133/133** |
| Gözlem: `integration.faz3-auth.spec` çok-dosyalı paralel koşumda 1 kez rate-limit dalgalanması gösterdi (tek dosya + tam koşum tekrarında yeşil); bellek içi limiterin paralel dosyalar arasında paylaşımı — test altyapısı gözlemi, ürün kusuru değil | Notlandı |

## 7. Değişen dosyalar (bu QA fazında)

- `apps/api/src/config/env.schema.ts` — üretimde `WEBHOOK_SIGNING_SECRET` zorunlu (F6-01)
- `apps/api/src/media/media.service.ts` — premium bölümlerde canlı oturum satırı şartı (F6-01) + satır `id: sessionId` (F6-02)
- `apps/api/src/config/env.schema.spec.ts` — +3 test
- `apps/api/src/integration.faz4-media.spec.ts` — +1 entegrasyon testi (03b sahte token savunması)
- `docs/MEDIA_SETUP.md` — üretim sırrı uyarısı
- `scripts/qa-faz6-security-probe.mjs` (**yeni**), `scripts/qa-faz6-run-probes.sh` (**yeni**)
- `scripts/qa-pg/package.json` — ortam kurtarımı için yeniden yaratıldı (lock dosyasıyla uyumlu)

## 8. Sonraki faza geçiş kararı

**PASS WITH WARNINGS.**

Kabul kriteri — "yetkili kullanıcı videoyu oynatabilmeli; yetkisiz erişim
backend tarafından engellenmeli" — canlı koşumlarla sağlandı: üç erişim
türünde yetkili oynatma kanıtlandı, yetkisiz/sahte/süresi dolmuş erişim
sunucu tarafında reddedildi (402/403/404), imzalı URL'ler ve sırlar mobil
pakete sızmadı. Bulunan iki YÜKSEK kusur bu faz içinde düzeltildi ve
regresyonla doğrulandı.

Uyarılar (geçişe engel değil, risk olarak taşınır):
1. **Gerçek cihaz doğrulaması yok** — native HLS/tam ekran/altyazı
   davranışları EAS build sonrası test edilmelidir.
2. **Canlı yayın servisi bağlı değil** — Bunny/Mux/Cloudflare geçişi
   ayrı doğrulama gerektirir (`MEDIA_SETUP.md` rehberi hazır).
3. **F6-ÖDÜN-1** (bearer imzalı URL, TTL sınırlı) — sonraki fazda
   sertleştirme önerilir.
4. Üretim geçişinde `WEBHOOK_SIGNING_SECRET` (≥32 rastgele karakter)
   sağlanmalıdır — artık doğrulama tarafından zorunlu kılınıyor.
