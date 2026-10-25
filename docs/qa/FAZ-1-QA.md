# FAZ 1 Testi: Proje Altyapısı — QA Raporu

> Tarih: 2026-10-25 · Kapsam: PerdeGo monorepo altyapısı (repo fazları **Faz 1**
> — mobil iskelet/contracts ve **Faz 2a** — pnpm monorepo, NestJS API, Docker
> Compose, Next.js admin). Görev türü: yalnızca kalite kontrol, test ve
> düzeltme; yeni özellik geliştirilmemiştir.
>
> **SONUÇ: PASS WITH WARNINGS** — Kabul kriterleri gerçek çalıştırmalarla
> karşılandı; açık riskler yalnızca bu ortamda bulunmayan dış bağımlılıklardır
> (Docker, Redis, gerçek cihaz) ve bunlar başarılı gösterilmemiştir.

## 1. Test Kapsamı ve Yöntem

Doğrulama, repo içinden tespit edilen **gerçek** komutlarla yapıldı; hiçbir
komut tahmin edilmemiş, çalıştırılmayan hiçbir test başarılı gösterilmemiştir.
Bulgu düzeltmeleri sonrası ilgili kontroller **yeniden çalıştırıldı**.

## 2. Çalıştırılan Komutlar ve Gerçek Sonuçlar

| Komut (gerçek) | Sonuç |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ Lockfile güncel, 5 workspace, tedarik-zinciri kontrolü geçti |
| `pnpm typecheck` (kök) | ✅ 4/4 workspace temiz |
| `pnpm lint` (kök) | ✅ 0 hata, 0 uyarı |
| `pnpm test` (kök) | ✅ **76/76** (contracts 16 + api 11 + mobile 49) |
| `pnpm build` (kök: nest build + next build) | ✅ api `dist/main.js`, admin statik `/` |
| `node dist/main.js` canlı + `curl` | ✅ `/health` 200 (`version: 0.1.0`), `/health/db` 200 (gerçek PG, 3–22 ms) |
| DB kapalıyken `curl /health/db` | ✅ **503** + gerçek hata: `Can't reach database server at 127.0.0.1:5432` |
| `pnpm db:migrate --name init` | ✅ Parametre iletimi doğru; DB `perdego` otomatik oluştu, `20261025022857_init` uygulandı, seed koştu |
| `pnpm db:seed` (2. kez) | ✅ İdempotent (aynı sayılar, çoğaltma yok) |
| Bağımsız Prisma sorgusu (`verify-db.mjs`) | ✅ PostgreSQL'de 3 kategori, 2 içerik, 3 bölüm |
| `env -i node dist/main.js` (DATABASE_URL yok) | ✅ Anlaşılır Türkçe hata + **exit 1** (boot öncesi) |
| `DATABASE_URL=file:...` (yanlış şema) | ✅ Reddedildi: `"postgresql://" ile başlamalıdır` + exit 1 |
| Port 3000 dolu iken 2. süreç | ✅ (düzeltme sonrası) `[PerdeGo API] Port 3000 kullanımda (EADDRINUSE). Çözüm: …` + exit 1 — ham stack yok |
| `npx next start -p 3002` + `curl` | ✅ HTTP 200 + "PerdeGo Admin" render; env uyarısı ("NEXT_PUBLIC_API_BASE_URL tanımlı değil") görünür |
| `npx expo export --platform ios` | ✅ 3,9 MB hbc bundle |
| `npx expo export --platform android` | ✅ 4,2 MB hbc bundle |
| `npx expo start --offline` (smoke) | ✅ "Starting Metro Bundler" + "Waiting on http://localhost:19023" |
| `require.resolve('@perdego/contracts')` (api + mobile'dan) | ✅ `packages/contracts/src/index.ts` çözümleniyor; `node_modules/@perdego/*` symlink'leri doğru |
| docker-compose.yml YAML doğrulaması (parser ile) | ✅ Sözdizimi geçerli; postgres + redis servisleri, healthcheck'ler tanımlı |

**Veritabanı notu:** Bu sandbox'ta **Docker yok**. PostgreSQL'i canlı koşmak
için Docker'sız, root'suz alternatif kullanıldı: **zonky embedded PostgreSQL
16.14** ikilileri (`scripts/qa-pg/`, kullanıcı/şifre/db compose paritesi:
`perdego/perdego_dev_pass/perdego`). Böylece compose'un sağlayacağı gerçek bir
PostgreSQL'e karşı migration, seed, `/health/db` 200 ve servis-kapalı 503
senaryoları **gerçekten** kanıtlandı. Bu, Docker Compose'un kendisinin
testi değildir; compose dosyası yalnızca sözdizimi düzeyinde doğrulanabildi.

## 3. Kabul Kriterleri (görev maddeleri)

| # | Kriter | Durum | Kanıt |
|---|--------|-------|-------|
| 1 | Mobil uygulama açılır | ✅ | iOS+Android bundle derlemesi + Metro açılışı (cihaz testi aşağıda) |
| 2 | API yanıt verir | ✅ | `/health` 200, `/health/db` 200/503 canlı |
| 3 | PostgreSQL'e bağlanılır | ✅ | Gerçek PG 16.14 ile migrate+seed+SELECT 1 (Docker yok — parite kanıtı) |
| 4 | Admin paneli açılır | ✅ | Prod build + `next start` → 200 |
| 5 | Workspace çözümlemesi | ✅ | Symlink + resolve kanıtı; 4 workspace typecheck/test |
| 6 | `.env.example` davranışı | ✅/🔧 | Eksik env → TR hata + exit 1; yanlış URL reddedilir; **F-01 düzeltildi** |
| 7 | Lint/typecheck/build | ✅ | Bölüm 2 tablosu |
| 8 | README Windows adımları | 🔧 | **F-03/F-04** düzeltildi; Docker'a bağımlı adımlar açıkça işaretli |
| 9 | Bir servis kapalıyken hata mesajları | ✅/🔧 | DB down → 503 + gerçek hata; port çakışması → dostu mesaj (**F-06**); admin hata ekranı client bundle'da derli |
| 10 | Mock/sahte başarılı gösterim yok | ✅ | Sağlık uçları dürüst; yapılamayanlar "yapılamadı" işaretli |

## 4. Bulgular ve Yapılan Düzeltmeler

| ID | Önem | Bulgu | Düzeltme |
|----|------|-------|----------|
| F-01 | **Yüksek** | `apps/admin/.env.example` yoktu; README kurulum adımı (`cp apps/admin/.env.example …`) temiz klonda kırılırdı. Faz 2a raporu dosyanın var olduğunu yazıyordu (tutarsızlık) | Dosya oluşturuldu (`NEXT_PUBLIC_API_BASE_URL`); kurulum akışı artık çalışır |
| F-02 | Orta | Kök `package.json` içindeki `pnpm.onlyBuiltDependencies` pnpm 12'de okunmuyor → her install'da uyarı; ölü yapılandırma | Alan kaldırıldı (yetkili ayar `pnpm-workspace.yaml > allowBuilds`); uyarı kayboldu |
| F-03 | Düşük | README doğrulama bölümü "api 9 test" yazıyor (gerçek: 11) | 11 olarak düzeltildi |
| F-04 | Düşük | `pnpm db:migrate` ilk adı interaktif soruyor; doğrulanmış pratik README'de yeterince belirgin değildi | `pnpm db:migrate --name init` (parametre iletimi test edildi) birincil form olarak eklendi |
| F-05 | Düşük | `/health` `version` alanı `node dist/main.js` ile başlatınca `0.0.0` dönüyordu (`npm_package_version` yalnızca paket yöneticisiyle set) | `package.json`'dan okuma (`createRequire`); canlı doğrulandı: `0.1.0` |
| F-06 | Düşük | Port çakışmasında API ham EADDRINUSE stack'i ile çöküyordu (http sunucusunun `error` olayı promise'e yansımıyor) | Sunucuya `error` dinleyicisi + dostu TR mesaj + exit 1; canlı doğrulandı |

Düzeltme sonrası regresyon kontrolü: `typecheck` ✅, `lint` ✅, api testleri
11/11 ✅, `nest build` ✅, canlı `/health` + `/health/db` ✅. Kaynak kodun
yalnızca `apps/api` sağlık/başlatma yolu ve kök `package.json` dokunuldu;
mobil/contracts kodu değişmedi (mevcut davranış korunmuştur).

## 5. Başarısız veya Çalıştırılamayan Testler

| Kalem | Durum | Gerekçe |
|---|---|---|
| `pnpm db:up` (Docker Compose) | ❌ Çalıştırılamadı | Sandbox'ta **Docker yok**. Postgres paritesi embedded PG ile gerçek kanıtlandı (bkz. §2); compose'un kendisi makinede `pnpm db:up` ile doğrulanmalı |
| Redis servisi | ❌ Çalıştırılamadı | Docker yok; redis binary indirmesi ağ politikası engeline takıldı. Etki: düşük — Faz 2a kodu Redis'i kullanmıyor (`REDIS_URL` opsiyonel) |
| Gerçek cihaz/emülatörde Expo Go açılışı | ❌ Yapılamadı | Sandbox'ta cihaz/emülatör yok; derleme düzeyi kanıt (bundle + Metro) sunuldu |
| Windows PowerShell adımlarının birebir koşusu | ❌ Yapılamadı | Windows ortamı yok; adımlar mantıksal gözden geçirme ile denetlendi (F-03/F-04 bulguları bu incelemeden) |

## 6. Önceki Fazlardan Regresyon

- Faz 1 (mobil iskelet): 49/49 jest testi, typecheck/lint, expo export — ✅ regresyon yok.
- Faz 0 dokümanları: değişiklik yok.
- Faz 2a: tüm iddiaları (§5/§6 tabloları) yeniden koşuldu; 2 iddiası düzeltildi (F-01, F-03 — rapor ile disk durumu tutarsızdı).

## 7. Dış Bağımlılıklar (açık beyan)

Docker Desktop (yerel makine), Redis (Faz 2b+), gerçek iOS/Android cihaz,
Windows ortamı, Expo EAS/mağaza hesapları bu ortamda yoktur; bu yüzden
yapılamayan testler "başarılı" işaretlenmedi (bkz. §5). Test için canlı ödeme,
gerçek kullanıcı verisi silme veya üretim DB'si değişikliği **yapılmamıştır**;
yalnızca yerel, sandbox-içi PostgreSQL kullanılmıştır.

## 8. Geçiş Kararı

**PASS WITH WARNINGS.** Kritik hata yok; tüm kapsam-içi bulgular düzeltildi ve
yeniden test edildi. Sonraki aşama (mobil görsel tasarım sistemi ve ekranlar)
için geçiş **onaylandı**. Uyarılar: Docker'lı makinede `pnpm db:up →
db:migrate → db:seed` zincirinin bir kez koşulması ve Redis'in Faz 2b'de
devreye alındığında test edilmesi.
