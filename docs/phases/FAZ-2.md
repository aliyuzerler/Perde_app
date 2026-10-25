# Faz 2a Raporu — Temel Altyapı (pnpm monorepo, API health, DB, admin iskeleti)

> Tarih: 2026-10-25 · Durum: ✅ Tamamlandı · Kapsam: ROADMAP Faz 2'nin
> **altyapı alt aşaması (2a)**. İçerik/feed/arama uçları ve mobilin gerçek
> adapter'e geçişi **2b'de** yapılacak (Genel Kural 2 — erken feature yazımı
> yok).

## 1. Kapsam Özeti

Faz 0'da onaylanan mimariye göre temel altyapı kuruldu: pnpm workspace
geçişi, NestJS API (health uçları + Zod env doğrulaması + Prisma), PostgreSQL
16 + Redis 7 Docker Compose'u, Next.js 16 admin başlangıç ekranı (dürüst
sağlık göstergesi), per-app ortam değişkeni dosyaları, migration/seed
komutları ve doğrulanmış README (Windows adımları dahil).

## 2. Değişen / Oluşturulan Dosyalar

**Kök (8)**
`package.json` (pnpm scripts + packageManager), `pnpm-workspace.yaml` (yeni —
`nodeLinker: hoisted`, `allowBuilds`), `.npmrc` (yorum amaçlı; pnpm 12
ayarları workspace dosyasından okur), `docker-compose.yml` (yeni),
`.env.example` (master referans, yeniden yazıldı), `README.md` (yeni,
doğrulanmış kurulum + Windows), `package-lock.json` **silindi**
(pnpm-lock.yaml geçti), `.gitignore` (önceden uyumluydu — değişmedi).

**apps/api (yeni, 16 dosya)**
`package.json` (NestJS 11 + Prisma 6 + vitest + tsx seed), `tsconfig.json`
(module Node16 + decorators), `tsconfig.build.json`, `nest-cli.json`,
`eslint.config.js` (DI notlu), `vitest.config.mts`, `.env.example`,
`prisma/schema.prisma` (ERD §3.2 katalog alt kümesi + genişletme notu),
`prisma/seed.ts` (idempotent, özgün kurgu içerik),
`src/main.ts` (env doğrulama → clear error + exit 1; prefix `api/v1`,
health hariç), `src/app.module.ts`, `src/config/env.schema.ts` (+ spec),
`src/config/env.module.ts`, `src/config/load-dotenv.ts` (+ spec,
`util.parseEnv` tabanlı, ortam değişkeni önceliği korunur),
`src/prisma/prisma.service.ts|module.ts` (dayanıklı connect — süreç çökmez),
`src/health/health.controller.ts|service.ts|module.ts` (+ spec).

**apps/admin (yeni, create-next-app + özelleştirme)**
`package.json` (`@perdego/admin`, port 3001, typecheck script'i),
`app/layout.tsx` (koyu tema, sistem fontu — build'te ağ bağımlılığı yok),
`app/page.tsx` (API/DB sağlık kartları: loading/up/down/error durumları,
env uyarısı, Sağlığı Yenile), `.env.example`; iç içe `pnpm-workspace.yaml`
**silindi** (create-next-app artığı).

**apps/mobile (3)**
`package.json` (+ `dev` script), `.env.example` (yeni, app-local).

## 3. Önemli Mimari Kararlar

1. **npm → pnpm geçişi** — kullanıcı talebi. `nodeLinker: hoisted` seçildi:
   Metro/jest-expo monorepo çözümlemesi ve sandbox inotify limiti (8192) ile
   en uyumlu düzen; `node_modules/.pnpm` izolasyonu Metro için ek
   yapılandırma gerektirecekti. `packageManager: pnpm@12.15.0` sabitlendi.
2. **pnpm 12 `allowBuilds` (map)** — `@parcel/watcher`, `unrs-resolver`,
   `@prisma/*`, `prisma`, `esbuild` postinstall'ları için izin. Eski
   `onlyBuiltDependencies` alan adı pnpm 12'de etkisiz (resmi
   pnpm.io/settings/build).
3. **Env doğrulama Zod ile, boot'ta** — eksik/geçersiz değişken → her sorun
   için tek satır insan-okur mesaj + çözüm önerisi + `process.exit(1)`.
   `@nestjs/config` yerine 40 satırlık kendi `EnvModule`'ü (daha az bağımlılık).
4. **`.env` yükleyici bağımlılıksız** — Node 24 `util.parseEnv`; gerçek
   ortam değişkenleri `.env` dosyasını ezer (CI/üretim standardı).
5. **Sağlık uçları dürüst** — `/health` liveness (200), `/health/db`
   readiness: Prisma `$queryRaw SELECT 1`; down → **503 + gerçek hata
   metni**; sağlıksız servisi başarılı gösteren mekanizma yok (görev md. 10).
   Redis henüz entegre edilmedi (Faz 2b+ kuyruk ile) — o yüzden redis
   health ucu YOK (var olmayan şeye "not_configured: up" da denmez);
   compose içinde servis hazır bekliyor.
6. **PrismaService dayanıklı** — DB yokken boot çökmez; `/health/db` gerçek
   durumu raporlar (LB readiness davranışı).
7. **Şema alt küme + not** — `schema.prisma` ERD §3.2 katalog çekirdeği;
   users/credit/subscriptions tabloları bilinçli olarak fazlarına bırakıldı.
8. **Admin ekranı mock'suz** — gerçek `/health` + `/health/db` çağırır;
   API kapalıysa "API'ye erişilemedi + çözüm ipucu" gösterir.
9. **module Node16** — TS 6 `node10` deprecations'ından kaçınıldı;
   NestJS decorators uyumlu.
10. **consistent-type-imports API'de kapalı** — kural, NestJS DI
    (emitDecoratorMetadata) gerektiren constructor importlarını `import
    type`a çevirmeye zorluyor; typescript-eslint 8'de dekoratör farkındalığı
    seçeneği kaldırıldığı için kural yalnızca bu pakette devre dışı (not
    eslint.config içinde; contracts/mobile katı).

## 4. Çalıştırılacak Komutlar

```bash
pnpm install                 # tüm workspace'ler
cp apps/api/.env.example apps/api/.env
pnpm db:up                   # Docker: postgres + redis (healthcheck'li)
pnpm db:migrate              # ilk sefer: migration adı = init
pnpm db:seed                 # özgün kurgu veri (idempotent)
pnpm dev:api                 # :3000 — /health, /health/db
pnpm dev:admin               # :3001 — sağlık ekranı
pnpm dev:mobile              # Expo dev server
pnpm typecheck && pnpm lint && pnpm test
```

## 5. Test Sonuçları (gerçek çalıştırma)

| Katman | Komut | Sonuç |
|--------|-------|-------|
| api | `pnpm run test` (vitest) | ✅ **11/11** (env doğrulama 7 + health 2 + dotenv 2) |
| api | `typecheck` / `lint` / `build` | ✅ temiz (nest build → dist/main.js) |
| admin | `lint` / `typecheck` / `build` | ✅ (next build, static `/`) |
| mobile | typecheck / lint / test | ✅ 49/49 (pnpm düzeni ile) |
| contracts | typecheck / lint / test | ✅ 16/16 |
| kök | `pnpm typecheck` / `lint` / `test` | ✅ 4 workspace, **76 test** |

## 6. Canlı Doğrulama (sandbox'ta gerçekten koşuldu)

1. **Env eksikken:** `env -i node dist/main.js` → anlaşılır Türkçe hata
   listesi + **exit 1** ✅
2. **Sandbox ortam değişkeni çakışması:** ortamda hazır bulunan
   `DATABASE_URL=file:...custom.db` (mysql/file şemalı) doğrulama tarafından
   **reddedildi** → yanlış yapılandırmaya sessiz geçiş yok ✅
3. **API canlı:** `/health` → `200 {"ok":true,...}` ✅
4. **/health/db DB yokken:** → `503 {"ok":false,"checks":{"database":
   {"status":"down","error":"Can't reach database server at localhost:5432"}}}`
   — dürüst başarısızlık ✅
5. **Admin canlı:** `next start` → `HTTP 200` + "PerdeGo Admin" render ✅
6. **Mobil:** `npx expo export --platform ios` → bundle (3,9 MB) ✅ (pnpm
   layout ile Metro çözümlemesi çalışıyor)

**Sandbox kısıtı (dürüst kayıt):** Bu ortamda **Docker yok**. Bu yüzden
`pnpm db:up → db:migrate → db:seed` zinciri burada canlı koşulamadı; DB'ye
gerçek bağlantı kanıtı (health/db 200) Docker Desktop olan makinede
alınmalıdır. Compose dosyası, migration ve seed komutları hazırdır ve
README'de adım adım belgelenmiştir (Windows dahil).

## 7. Eksik Dış Hesaplar / Manuel Adımlar

| Kalem | Faz | Not |
|-------|-----|-----|
| Docker Desktop (yerel makine) | 2b öncesi | `pnpm db:up` için zorunlu |
| PostgreSQL migration (`init`) | 2b öncesi | Docker ile ilk `pnpm db:migrate` |
| Redis istemci entegrasyonu | 2b+ | compose servisi hazır; BullMQ Faz 2b+ |
| Ağ erişimi olan makinede Expo Go testi | her faz | cihaz + yerel IP env |

## 8. Kabul Kriterleri (görev maddeleriyle)

| Kriter | Durum |
|--------|-------|
| Mobil uygulama açılıyor | ✅ bundle derlemesi + Faz 1 smoke; cihazda Expo Go ile açılış makinede doğrulanacak |
| API health endpoint yanıt veriyor | ✅ canlı 200 |
| Veritabanına bağlantı kuruluyor | ⚠️ Kod + migration + seed hazır; sandbox'ta Docker yok — makinede `pnpm db:up` ile kanıtlanacak; DB down davranışı (503) canlı doğrulandı |
| Admin paneli açılıyor | ✅ canlı 200 |
| Env eksikken anlaşılır hata | ✅ canlı (exit 1 + mesaj listesi) |
| README doğrulanmış | ✅ çalıştırılabilen adımlar koşuldu; Docker adımları makineye bırakıldı (açıkça işaretli) |

## 9. 2b'ye Geçiş

Faz 2b (İçerik Hizmeti): ERD'nin tam şemaya genişlemesi, içerik/feed/arama
uçları, `EXPO_PUBLIC_MOCK_API=0` ile gerçek HTTP adapter geçişi, Redis
önbellek kararı. Ön koşul: Docker'lı makinede `pnpm db:migrate + db:seed`
başarılı olmalı.
