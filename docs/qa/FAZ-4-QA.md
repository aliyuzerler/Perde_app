# FAZ 4 QA — Kimlik Doğrulama (Uçtan Uca)

| | |
|---|---|
| **Tarih** | 2026-10-25 |
| **Denetlenen faz** | Faz 3b — mobil uygulama ile NestJS backend arasında uçtan uca kullanıcı kimlik doğrulaması (commit `afc593f`) |
| **Ortam** | Node v24.21.0 · pnpm 12.15.0 · gömülü PostgreSQL 16.14 (`scripts/qa-pg`, 127.0.0.1:5432) · API `node dist/main.js` :3000 · Mailpit **yok** (dev outbox transport) |
| **Karar** | **PASS WITH WARNINGS** — kabul kriterleri gerçek kanıtla karşılandı; uyarılar dış bağımlılıklar (Mailpit SMTP, gerçek cihaz) ve dokümante edilmiş bilinçli ödünlerdir. Sonraki faza geçiş onaylandı. |

---

## 1. Kapsam

Mobil uygulama (React Native/Expo) ile NestJS backend arasındaki kimlik doğrulama akışının kalite kontrolü, hata bulma/düzeltme ve kabul doğrulaması. Yeni özellik geliştirme **yapılmadı**; yalnızca (a) kapsam içi bir test kapsamı boşluğu kapatıldı, (b) QA sınama betiğindeki hatalar düzeltildi.

Kapsam kaynakları: görev listesindeki 7 pozitif + 8 negatif senaryo; 3 oturum yaşam döngüsü senaryosu; docs/SECURITY.md, docs/API_CONTRACT.md §2, docs/ACCOUNT_DELETION.md.

## 2. Tanımlı komutlar (tahmin değil, package.json'lardan doğrulandı)

| Komut | Tanım yeri |
|---|---|
| `pnpm typecheck` → `pnpm -r --if-present run typecheck` | kök package.json |
| `pnpm lint` → `pnpm -r --if-present run lint` | kök package.json |
| `pnpm test` → `pnpm -r --if-present run test` (contracts: vitest, api: vitest, mobile: jest) | kök + workspace package.json'ları |
| `pnpm build` (api: `nest build`, admin: `next build`) + `npx expo export --platform ios/android` | workspace package.json'ları |
| `prisma migrate status` | apps/api (`db:*` scriptleri) |

Entegrasyon testleri için `--pool=threads` ve açık `DATABASE_URL` gerekliliği (fork havuzunda Nest init hatasının SIGABRT ile maskelenmesi) faz 3b'den bilinen ortam kuralıdır; bu koşumda uygulandı.

## 3. Çalıştırılan komutlar ve gerçek sonuçlar

| # | Komut | Sonuç |
|---|---|---|
| 1 | `pnpm typecheck` (4 workspace) | **PASS** — 0 hata |
| 2 | `pnpm lint` (4 workspace) | **PASS** — 0 hata, 0 uyarı |
| 3 | `pnpm exec vitest run --pool=threads` (apps/api, gerçek PG) | **109/109 PASS** (16 dosya; `integration.faz3-auth.spec.ts` 16 test 3.0 sn, `integration.faz2b.spec.ts` 18 test 2.8 sn — gerçek DB üzerinde koştu) |
| 4 | `pnpm test` (packages/contracts) | **48/48 PASS** |
| 5 | `pnpm test` (apps/mobile, jest) | **91/91 PASS** (87 mevcut + 4 yeni — bkz. F4-01) |
| 6 | `pnpm build` (apps/api — nest build) | **PASS** — `dist/main.js` üretildi |
| 7 | `pnpm build` (apps/admin — next build) | **PASS** — static prerender |
| 8 | `npx expo export --platform ios` / `--platform android` | **PASS** — her ikisi derlendi |
| 9 | `prisma migrate status` (gömülü PG) | **PASS** — "Database schema is up to date!" (4 migration) |
| 10 | Canlı API `/health`, `/health/db` | **PASS** — 200; DB gecikmesi 4 ms |
| 11 | `node scripts/qa-faz4-auth-probe.mjs functional` | **21/21 PASS** |
| 12 | `node scripts/qa-faz4-auth-probe.mjs ratelimit` (varsayılan limitler) | **3/3 PASS** |
| 13 | `node scripts/qa-faz4-auth-probe.mjs expiry` (ACCESS_TOKEN_TTL_SECONDS=60) | **3/3 PASS** |
| 14 | Log sızıntısı denetimi (16 sır × 3 API logu) | **0 sızıntı** |
| 15 | Regresyon: `node scripts/qa-faz3b-auth-probe.mjs` | **22/22 PASS** |
| 16 | Final kök regresyon: `pnpm test` + `typecheck` + `lint` | **PASS** — toplam 248 test (48+109+91) |

Toplam: **248 otomatik test + 27 faz-4 canlı probe kontrolü + 22 regresyon probe kontrolü = 297 doğrulama, 297 PASS.**

## 4. Pozitif senaryolar (canlı API üzerinde)

| Senaryo | Kanıt | Sonuç |
|---|---|---|
| Yeni kullanıcı kaydı | P01: 201 + `emailVerified:false` + token çifti + outbox'ta doğrulama e-postası | PASS |
| E-posta doğrulama | P04: outbox'taki anahtarla `verify-email` 201; anahtar tek kullanımlık (2. kullanım 400) | PASS |
| Doğru bilgilerle giriş | P05: 201 + token çifti + `emailVerified:true` | PASS |
| Profil görüntüleme/güncelleme | P08: `GET /me` maskeli e-posta; `PATCH /me` kalıcı (P20 DB hash denetimi ayrı) | PASS |
| Avatar altyapısı | P09: multipart upload 201 → statik yayın 200 `image/png` → DELETE sonrası `avatarUrl:null` | PASS |
| Oturum listesi / tek iptal / hepsi | P10-P11: `current:true`; ikinci oturum iptali sonrası refresh 401; faz3b probe oturumlar bölümü | PASS |
| Çıkış yapma | P13-TTL kanıtı: `logout` 201 → refresh anında 401 | PASS |
| Parola sıfırlama | P14: forgot 201 → reset 201 → eski parola 401, yeni parola 201, reset öncesi tüm oturumlar 401 | PASS |
| Parola değiştirme | P13: yanlış mevcut 400; doğru → diğer oturumlar 401, mevcut ayakta | PASS |
| Hesap silme akışı (test ortamı) | P18: yanlış parola 400 → talep 201+`purgeAt` → giriş 401 → restore 201 → `/me` 200 | PASS |
| Kullanım koşulları / gizlilik metinleri | P19: `terms`+`privacy` 200 Türkçe; bilinmeyen slug 404 | PASS |

## 5. Negatif senaryolar

| Senaryo | Kanıt | Sonuç |
|---|---|---|
| Aynı e-posta ile ikinci kayıt | P06: 409 `EMAIL_ALREADY_EXISTS` | PASS |
| Yanlış parola | P07: 401 `BAD_CREDENTIALS` (bilinmeyen e-postada da aynı yanıt — P11-faz3b, kullanıcı sayımı engeli) | PASS |
| Geçersiz/bozuk token | P17: token'sız `PATCH /me` → 401 `TOKEN_MISSING`; bozuk JWT → 401 `TOKEN_INVALID`; P16: bozuk e-posta anahtarları 400 | PASS |
| Süresi dolmuş access token | E02 (TTL=60 koşumu): 61 sn sonra `/me` → 401 `TOKEN_EXPIRED` | PASS |
| Süresi dolmuş e-posta anahtarı | P15: DB'de `expiresAt` geçmişe çekildi → reset 400 `TOKEN_INVALID` | PASS |
| İptal edilmiş refresh token | P12: eski token reuse → 401 `REFRESH_REUSED` + **aile iptali** (rotasyonla gelen yeni token da 401) | PASS |
| Yetkisiz profil güncelleme | P17: 401 (yok/bozuk token); P11: yabancı kullanıcının oturumunu silme → 404 `SESSION_NOT_FOUND` (sahiplik) | PASS |
| Rate limit aşımı | RL01: 6. hatalı giriş → 429 + `retryAfterSeconds:60`; RL02: 4. kayıt → 429; RL03: 4. forgot → 429 (manuel doğrulama dahil) | PASS |
| Doğrulanmamış e-posta ile kısıtlı erişim | P02: giriş 403 `EMAIL_NOT_VERIFIED`; P03: refresh 403. Kayıt-oturumunun "göz atma penceresi" (`GET /me` 200) API_CONTRACT'ta belgeli tasarım | PASS |
| Hassas tokenların loglara yazılması | 16 sır (refresh/access/parola) × 3 API log koşumu → **0 eşleşme**; P20: DB'de yalnızca SHA-256 hash (`refreshTokenHash` 64-hex, düz metinle eşleşmez), `ipHash` hash/NULL | PASS |

## 6. Oturum yaşam döngüsü ek senaryoları

1. **Access token süresi dolunca oturum yenileme** (E03): refresh 201 → yeni access ile `/me` 200. Mobil `api-client`'ın 401→tek uçuş refresh→tek tekrar akışı birim testli (`api-client-auth.test.ts`: paralel 401'lerde tek refresh; refresh reddinde `onSessionExpired`).
2. **Uygulama yeniden açılması**: oturum `expo-secure-store` (Keychain/Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`) üzerinden `zustand persist` v2 ile geri yüklenir; v1 mock oturumları migrate'de düşürülür (bayat mock token gerçek API'ye sızamaz). Sunucu tarafında oturum satırı refresh TTL'i (30 gün) boyunca geçerli — E03 ile uçtan uca kanıtlandı. **Yeni:** SecureStore adaptörü artık 4 birim testle kanıtlı (F4-01).
3. **Çıkış sonrası korumalı ekranlar**: mobilde `clearSession()` → misafir akışı + kök layout guard'ı (`reason: session-expired` yönlendirmesi). Sunucuda refresh anında ölür (401). **Belgelenmiş ödün canlı doğrulandı:** logout sonrası access token TTL'e (≤15 dk) dek kriptografik geçerli kalır — aynı access ile `/me` 200 döner. Bu, SECURITY.md §11.2'de kayıtlı bilinçli sınırdır (Faz 6'da sid blok listesi değerlendirilecek); refresh token'ın anında ölmesi ve kısa TTL (15 dk) riski sınırlar.

## 7. Bulunan hatalar, sınıflandırma ve düzeltmeler

Ürün (API/mobil) kodunda **Kritik/Yüksek/Orta düzey kusur bulunamadı**. Bulunan ve giderilen bulgular:

| ID | Önem | Bulgu | Düzeltme | Yeniden koşum |
|---|---|---|---|---|
| F4-01 | **Orta** | Mobil SecureStore adaptörünün (Teknik Kural 3) hiçbir birim testi yoktu; "token AsyncStorage'a sızmaz + Keychain bayrağı" kanıtsızdı | `apps/mobile/src/services/__tests__/secure-storage.test.ts` eklendi: Keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY` çağrısı, okuma, web bellek düşüşü, temizlik (4 test) | Mobil 91/91, typecheck+lint yeşil |
| F4-02 | Düşük | QA probe P21: Swagger yol öneki varsayımı hatalıydı (`/api/v1` önekini hesaba katmıyordu) | Probe her iki biçimi kabul eder biçimde düzeltildi — ürün etkisi yok | Probe 21/21 |
| F4-03 | Düşük | QA probe RL01/RL03: beklenen 429 kod adı yanlıştı (`RATE_LIMITED` değil gerçek `details.reason=RATE_LIMIT_EXCEEDED`) | Probe beklentisi gerçek sözleşmeye göre düzeltildi — API davranışı doğruydu | Probe 3/3 |
| F4-04 | Düşük | QA probe RL02: e-posta soneki TLD'den sonra ekleniyordu → doğrulama 400 döndüğünden limiter'a ulaşmıyordu (limiter handler girişinde sayaç yapar) | Geçerli e-posta üretimine düzeltildi; manuel 4 istekle 3×201 + 4. 429 ayrıca kanıtlandı | Probe 3/3 |
| F4-05 | Düşük | Misafir, korumalı ekranlara doğrudan derin bağlantıyla giderse (örn. `/account/sessions`) ekran-özel giriş kapısı yok: sunucu 401 döndürür, ekran hata durumu gösterir (çökme/veri sızıntısı yok). UI kapısı profil ekranı ayrımıyla sağlanıyor | Bu QA fazında düzeltilmedi — expo-router v58'in kök-layout Redirect döngüsü dersinden ötürü rota-kapısı tasarımı geliştirme fazına bırakıldı (öneri: `_layout` efektiyle pathname kontrolü). Sunucu yetkilendirmesi sağlam | — |

Gözlem (kusur değil): API hata zarfında `message` alanı i18n **anahtarı** taşır (`errors.rateLimited` vb.) — tasarım `common/errors.ts` başlığında belgeli; mobil `useDescribeApiError()` anahtar/nedenleri Türkçe'ye çevirir (`RATE_LIMIT_EXCEEDED` → `auth.errorRateLimited`). Doğrudan API tüketıcısı ham anahtar görür; istenirse Faz 5/6'da sunucu tarafı TR metin seçeneği değerlendirilir.

## 8. Başarısız veya çalıştırılamayan testler (dürüst kayıt)

1. **Mailpit SMTP transport** — sandbox'ta Mailpit/SMTP sunucusu yok. E-postalar geliştirme JSONL outbox'ı ile uçtan uca doğrulandı (kayıt/sıfırlama/silme akışları anahtarı gerçekten outbox'tan okuyup kullandı). `MailerService` SMTP dalı birim testli değildir; **SMTP_HOST=localhost:1025 ile Mailpit doğrulaması makinede yapılmalıdır.** Mock sonuç gerçek üretim doğrulaması olarak sunulmaz.
2. **Gerçek cihaz/emülatör** — iOS/Android native SecureStore, image-picker ve derin bağlantı (`/auth/verify-email?token=...` tıklama) davranışları yalnızca birim test + web export düzeyinde doğrulanabilir. Cihaz koşusu yapılabilir ortam gerektirir.
3. **Yatay ölçekleme / Redis tabanlı rate limit** — limiter bellek içi ve tek örnekli (SECURITY §11.2'de belgeli); çok örnekli dağıtımda yetersizdir. Tek örnek davranışı canlı doğrulandı.
4. **Purge cron'u** — `purgeExpiredDeletions` HTTP ucu yoktur (servis yöntemi); nefallet dolmuş hesabın PII anonimleşmesi ve finansal kayıt korunması **gerçek PG üzerinde entegrasyon testi A15 ile kanıtlandı**. Üretim takvimi (kuyruk/cron) Faz 6 maddesidir.
5. **Canlı ödeme, gerçek kullanıcı verisi silme, üretim DB'si, gerçek kullanıcılara bildirim** — görev gereği hiçbir zaman denendi; tüm testler izole QA DB'sinde `@qa.local` kullanıcılarıyla yapıldı.

## 9. Regresyon (önceki fazlar)

- **Faz 2b entegrasyonu**: `integration.faz2b.spec.ts` 18/18 gerçek PG üzerinde PASS (katalog, cüzdan=ledger denklemi, idempotensi, erişim ayrımı). Profil okuma/güncelleme testi (10. madde) dahil.
- **Faz 3b probe**: 22/22 PASS (API yeniden başlatıldıktan sonra, varsayılan limitlerle).
- **Kök koşum**: 248/248 test (contracts 48 + api 109 + mobile 91), typecheck+lint 4 workspace 0 hata/0 uyarı, nest+admin+expo(ios+android) build yeşil.
- **Veri/şema**: migration 4/4 güncel; silme matrisi dokümanı (`docs/ACCOUNT_DELETION.md`) ve API_CONTRACT §2 koşumla tutarlı bulundu.
- Değiştirilen ürün dosyası **yoktur**; `git status` yalnızca 2 yeni QA dosyası içerir (probe + secure-storage testi).

## 10. Dış bağımlılık / hesap riskleri

| Risk | Durum |
|---|---|
| Mailpit (SMTP) | Sandbox'ta yok — makinede `SMTP_HOST=localhost:1025` ile doğrulanmalı (madde 8.1) |
| Mağaza hesapları / RevenueCat / gerçek HLS | Bu fazın kapsamı dışı (Faz 5/6) |
| Üretim JWT anahtarları | Dev'de geçici RSA üretimi uyarıyla çalışıyor; `NODE_ENV=production` zorunlu kılıyor (env şeması testli) |
| Cihaz doğrulaması | Güvenli alan/klavye/derin bağlantı gerçek cihazda teyit bekliyor |

## 11. Sonraki faza geçiş kararı

**PASS WITH WARNINGS — geçiş onaylandı.** Giriş ve oturum yönetimi uçtan uca kanıtlandı; yetkisiz erişim (bozuk token, iptal edilmiş refresh, yabancı oturum, doğrulanmamış e-posta, rate limit) tümüyle engelleniyor; hassas veriler hash'li saklanıyor ve loglara sızmıyor. Uyarılar yalnızca (a) Mailpit/cihaz doğrulaması gibi makine-bağımlı maddeler, (b) dokümante edilmiş bilinçli ödünler (access TTL iptal penceresi, tek örnekli limiter, cron'suz purge) ve (c) F4-05 Düşük UX cilasıdır.

**Sonraki ajan için notlar:**
- Probe tekrarı: API'yi uygun env ile başlat → `node scripts/qa-faz4-auth-probe.mjs functional|ratelimit|expiry` (bash başlıklarındaki env tablosuna bakınız).
- F4-05 için rota-seviyesi misafir kapısı, expo-router v58 kısıtları gözetilerek bir sonraki geliştirme fazında eklenmeli.
- Mailpit doğrulaması ve gerçek cihaz turu Faz 5 öncesi yapılacaklar listesindedir.
