-- FAZ 3B: e-posta doğrulama, tek kullanımlık e-posta anahtarları ve hesap
-- silme talebi altyapısı.
--
-- 1) users.email_verified_at: e-posta doğrulama mührü. Null ise giriş
--    EMAIL_NOT_VERIFIED ile reddedilir (API_CONTRACT §2 kuralı).
-- 2) email_tokens: tek kullanımlık anahtarlar (VERIFY_EMAIL / RESET_PASSWORD).
--    Ham token saklanmaz; yalnızca SHA-256 hash. Yeni anahtar üretiminde
--    önceki tüketilmemiş anahtarlar uygulama tarafından consumedAt ile
--    kapatılır; DB düzeyinde ek kontrol: tüketilmemiş (consumed_at IS NULL)
--    ve süresi geçmemiş anahtar sayısı uygulama akışında 1 tutulur.
-- 3) account_deletion_requests: nefallet süresi (varsayılan 30 gün) —
--    süre sonunda purge job'ı kişisel veriyi anonimleştirir; finansal
--    kayıtlar yasal saklama süresince korunur (docs/ACCOUNT_DELETION.md).

-- 1) users.email_verified_at -------------------------------------------------
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- 2) email_tokens -------------------------------------------------------------
CREATE TYPE "EmailTokenKind" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

CREATE TABLE "email_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EmailTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_tokens_tokenHash_key" ON "email_tokens"("tokenHash");
CREATE INDEX "email_tokens_userId_kind_idx" ON "email_tokens"("userId", "kind");

ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) account_deletion_requests ------------------------------------------------
CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'CANCELED', 'COMPLETED');

CREATE TABLE "account_deletion_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purgeAt" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- Kullanıcı başına en fazla bir silme talebi (geri alma bu satırı CANCELED yapar).
CREATE UNIQUE INDEX "account_deletion_requests_userId_key" ON "account_deletion_requests"("userId");
CREATE INDEX "account_deletion_requests_status_purgeAt_idx" ON "account_deletion_requests"("status", "purgeAt");

ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
