/**
 * full_domain migration yaması.
 *
 * `prisma migrate diff` çıktısındaki enum dönüşümlerini (DROP+ADD COLUMN)
 * veri koruyan ALTER TYPE ... USING cast'lerine çevirir; seasons backfill
 * INSERT'ini bileşik FK'dan önce ekler; CHECK kısıtlarını sona ekler ve
 * nihai migration dosyasını yazar.
 *
 * Kullanım: node make-full-domain-migration.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const API = '/home/z/my-project/apps/api';
const diff = readFileSync('/tmp/full_domain_diff.sql', 'utf8');

// 1) Enum dönüşümleri: DROP+ADD yerine USING cast (mevcut veri korunur).
// Not: DEFAULT'lı kolonlarda (accessType/status) ALTER TYPE öncesi DEFAULT
// düşürülmeli, sonrasında enum tipiyle geri verilmelidir (PG 42804).
const contentsPatch = `ALTER TABLE "contents" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "heroImageUrl" TEXT,
ADD COLUMN     "posterUrl" TEXT,
ADD COLUMN     "taglineEn" TEXT,
ADD COLUMN     "taglineTr" TEXT,
ADD COLUMN     "verticalPreviewUrl" TEXT;
ALTER TABLE "contents" ALTER COLUMN "accessType" DROP DEFAULT;
ALTER TABLE "contents" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contents" ALTER COLUMN "kind" SET DATA TYPE "ContentKind" USING "kind"::text::"ContentKind",
ALTER COLUMN "seriesFormat" SET DATA TYPE "SeriesFormat" USING "seriesFormat"::text::"SeriesFormat",
ALTER COLUMN "accessType" SET DATA TYPE "AccessType" USING "accessType"::text::"AccessType",
ALTER COLUMN "status" SET DATA TYPE "ContentStatus" USING "status"::text::"ContentStatus";
ALTER TABLE "contents" ALTER COLUMN "accessType" SET DEFAULT 'FREE'::"AccessType";
ALTER TABLE "contents" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"ContentStatus";`;

const episodesPatch = `ALTER TABLE "episodes" ADD COLUMN     "freeUntilAt" TIMESTAMP(3),
ADD COLUMN     "synopsisEn" TEXT,
ADD COLUMN     "synopsisTr" TEXT,
ADD COLUMN     "verticalPreviewUrl" TEXT;
ALTER TABLE "episodes" ALTER COLUMN "accessType" DROP DEFAULT;
ALTER TABLE "episodes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "episodes" ALTER COLUMN "accessType" SET DATA TYPE "AccessType" USING "accessType"::text::"AccessType",
ALTER COLUMN "status" SET DATA TYPE "EpisodeStatus" USING "status"::text::"EpisodeStatus";
ALTER TABLE "episodes" ALTER COLUMN "accessType" SET DEFAULT 'FREE'::"AccessType";
ALTER TABLE "episodes" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"EpisodeStatus";`;

let sql = diff.replace(
  `ALTER TABLE "contents" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "heroImageUrl" TEXT,
ADD COLUMN     "posterUrl" TEXT,
ADD COLUMN     "taglineEn" TEXT,
ADD COLUMN     "taglineTr" TEXT,
ADD COLUMN     "verticalPreviewUrl" TEXT,
DROP COLUMN "kind",
ADD COLUMN     "kind" "ContentKind" NOT NULL,
DROP COLUMN "seriesFormat",
ADD COLUMN     "seriesFormat" "SeriesFormat",
DROP COLUMN "accessType",
ADD COLUMN     "accessType" "AccessType" NOT NULL DEFAULT 'FREE',
DROP COLUMN "status",
ADD COLUMN     "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT';`,
  contentsPatch,
);

sql = sql.replace(
  `ALTER TABLE "episodes" ADD COLUMN     "freeUntilAt" TIMESTAMP(3),
ADD COLUMN     "synopsisEn" TEXT,
ADD COLUMN     "synopsisTr" TEXT,
ADD COLUMN     "verticalPreviewUrl" TEXT,
DROP COLUMN "accessType",
ADD COLUMN     "accessType" "AccessType" NOT NULL DEFAULT 'FREE',
DROP COLUMN "status",
ADD COLUMN     "status" "EpisodeStatus" NOT NULL DEFAULT 'DRAFT';`,
  episodesPatch,
);

if (!sql.includes('SET DATA TYPE "ContentKind"')) {
  throw new Error('contents enum yaması uygulanamadı');
}
if (!sql.includes('SET DATA TYPE "EpisodeStatus"')) {
  throw new Error('episodes enum yaması uygulanamadı');
}

// 2) Seasons backfill: mevcut episode satırlarından sezon üret — bileşik FK
//    eklemeden HEMEN ÖNCE yerleştirilir (FK, sezonu olmayan bölümü yasaklar).
const backfill = `-- Backfill: mevcut bölümlerden seasons satırları üret (FK öncesi zorunlu)
INSERT INTO "seasons" ("id", "contentId", "seasonNumber", "createdAt", "updatedAt")
SELECT DISTINCT ON ("contentId", "seasonNumber")
       'sn_' || "contentId" || '_' || "seasonNumber",
       "contentId", "seasonNumber", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "episodes"
ON CONFLICT ("contentId", "seasonNumber") DO NOTHING;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_contentId_seasonNumber_fkey" FOREIGN KEY ("contentId", "seasonNumber") REFERENCES "seasons"("contentId", "seasonNumber") ON DELETE RESTRICT ON UPDATE CASCADE;`;

const fkMarker = `-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_contentId_seasonNumber_fkey" FOREIGN KEY ("contentId", "seasonNumber") REFERENCES "seasons"("contentId", "seasonNumber") ON DELETE RESTRICT ON UPDATE CASCADE;`;

if (!sql.includes(fkMarker)) {
  throw new Error('episodes-seasons bileşik FK ifadesi bulunamadı');
}
sql = sql.replace(fkMarker, backfill);

// 3) CHECK kısıtları + tek READY medya kısıtı (Prisma'nın modellemediği
//    bütünlük kuralları; ERD §1.3/§3.2/§3.4).
const checks = `
-- CHECK kısıtları: uygulama katmanı hatalarına karşı DB düzeyi son savunma
ALTER TABLE "contents" ADD CONSTRAINT "contents_series_format_required" CHECK ("kind" <> 'SERIES' OR "seriesFormat" IS NOT NULL);
ALTER TABLE "contents" ADD CONSTRAINT "contents_release_year_range" CHECK ("releaseYear" BETWEEN 1890 AND 2100);
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_credit_cost_positive" CHECK ("creditCost" IS NULL OR "creditCost" > 0);
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_credit_cost_required_for_credit" CHECK ("accessType" <> 'CREDIT' OR "creditCost" IS NOT NULL);
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_purchased_nonnegative" CHECK ("purchasedBalance" >= 0);
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_granted_nonnegative" CHECK ("grantedBalance" >= 0);
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_delta_nonzero" CHECK ("delta" <> 0);
ALTER TABLE "store_transactions" ADD CONSTRAINT "store_transactions_quantity_positive" CHECK ("quantity" > 0);

-- Kısmi unique index: bir bölümün aynı anda tek READY medya asset'i olabilir
CREATE UNIQUE INDEX "episode_media_single_ready" ON "episode_media"("episodeId") WHERE "state" = 'READY';
`;

sql = sql.trimEnd() + '\n' + checks;

const stamp = '20261025090000';
const dir = join(API, 'prisma', 'migrations', `${stamp}_full_domain`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'migration.sql'), sql, 'utf8');
console.log(`Yazıldı: ${dir}/migration.sql (${sql.split('\n').length} satır)`);
