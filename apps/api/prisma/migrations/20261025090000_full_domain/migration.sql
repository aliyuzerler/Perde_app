-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('FILM', 'SERIES', 'SHORT_FILM');

-- CreateEnum
CREATE TYPE "SeriesFormat" AS ENUM ('STANDARD', 'MINI');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('FREE', 'SUBSCRIPTION', 'CREDIT');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EpisodeStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CastRole" AS ENUM ('ACTOR', 'DIRECTOR', 'WRITER');

-- CreateEnum
CREATE TYPE "MediaProvider" AS ENUM ('BUNNY', 'CLOUDFLARE', 'MUX');

-- CreateEnum
CREATE TYPE "MediaState" AS ENUM ('PROCESSING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('tr', 'en');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionPlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'ON_HOLD', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StoreProductType" AS ENUM ('SUBSCRIPTION', 'CREDIT_PACK');

-- CreateEnum
CREATE TYPE "PurchaseState" AS ENUM ('PENDING', 'PURCHASED', 'REFUNDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('PURCHASE', 'GRANT', 'UNLOCK_SPEND', 'REFUND', 'ADJUSTMENT', 'EXPIRY');

-- CreateEnum
CREATE TYPE "LedgerReferenceType" AS ENUM ('STORE_TRANSACTION', 'EPISODE_UNLOCK', 'ADMIN_ADJUSTMENT', 'SUBSCRIPTION', 'EXPIRY_JOB', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "UnlockSource" AS ENUM ('CREDIT', 'INCLUDED');

-- CreateEnum
CREATE TYPE "WebhookSource" AS ENUM ('APPLE', 'GOOGLE', 'REVENUECAT');

-- CreateEnum
CREATE TYPE "WebhookState" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_EPISODE', 'NEW_CONTENT', 'PROMO', 'SYSTEM');

-- CreateEnum
CREATE TYPE "HomeSectionType" AS ENUM ('HERO', 'RAIL', 'CATEGORY_GRID');

-- DropIndex
DROP INDEX "contents_status_publishedAt_idx";

-- AlterTable
ALTER TABLE "contents" ADD COLUMN     "createdById" TEXT,
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
ALTER TABLE "contents" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"ContentStatus";

-- AlterTable
ALTER TABLE "episodes" ADD COLUMN     "freeUntilAt" TIMESTAMP(3),
ADD COLUMN     "synopsisEn" TEXT,
ADD COLUMN     "synopsisTr" TEXT,
ADD COLUMN     "verticalPreviewUrl" TEXT;
ALTER TABLE "episodes" ALTER COLUMN "accessType" DROP DEFAULT;
ALTER TABLE "episodes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "episodes" ALTER COLUMN "accessType" SET DATA TYPE "AccessType" USING "accessType"::text::"AccessType",
ALTER COLUMN "status" SET DATA TYPE "EpisodeStatus" USING "status"::text::"EpisodeStatus";
ALTER TABLE "episodes" ALTER COLUMN "accessType" SET DEFAULT 'FREE'::"AccessType";
ALTER TABLE "episodes" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"EpisodeStatus";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'tr',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "birthYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "pushToken" TEXT NOT NULL,
    "appVersion" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'tr',
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "titleTr" TEXT,
    "titleEn" TEXT,
    "synopsisTr" TEXT,
    "synopsisEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cast_members" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "CastRole" NOT NULL,
    "characterName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cast_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_cast" (
    "contentId" TEXT NOT NULL,
    "castMemberId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "content_cast_pkey" PRIMARY KEY ("contentId","castMemberId")
);

-- CreateTable
CREATE TABLE "episode_media" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "provider" "MediaProvider" NOT NULL,
    "providerAssetId" TEXT NOT NULL,
    "state" "MediaState" NOT NULL DEFAULT 'PROCESSING',
    "durationSeconds" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episode_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_sections" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sectionType" "HomeSectionType" NOT NULL,
    "titleTr" TEXT,
    "titleEn" TEXT,
    "categoryId" TEXT,
    "contentLimit" INTEGER NOT NULL DEFAULT 10,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_section_items" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "home_section_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banners" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleTr" TEXT,
    "titleEn" TEXT,
    "subtitleTr" TEXT,
    "subtitleEn" TEXT,
    "imageUrl" TEXT NOT NULL,
    "targetContentId" TEXT,
    "deepLink" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "lastWatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playback_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "deviceId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "playback_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "titleTr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "platformProductIdIos" TEXT,
    "platformProductIdAndroid" TEXT,
    "billingPeriod" "BillingPeriod" NOT NULL,
    "priceKurus" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 16,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "platform" "SubscriptionPlatform" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "storeOriginalTransactionId" TEXT,
    "productId" TEXT,
    "canceledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_packs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "bonusCredits" INTEGER NOT NULL DEFAULT 0,
    "platformProductIdIos" TEXT,
    "platformProductIdAndroid" TEXT,
    "priceKurus" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_wallets" (
    "userId" TEXT NOT NULL,
    "purchasedBalance" INTEGER NOT NULL DEFAULT 0,
    "grantedBalance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_wallets_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "purchasedDelta" INTEGER NOT NULL DEFAULT 0,
    "grantedDelta" INTEGER NOT NULL DEFAULT 0,
    "balanceAfterPurchased" INTEGER NOT NULL,
    "balanceAfterGranted" INTEGER NOT NULL,
    "referenceType" "LedgerReferenceType" NOT NULL,
    "referenceId" TEXT,
    "idempotencyKey" TEXT,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "source" "UnlockSource" NOT NULL,
    "creditLedgerId" TEXT,
    "storeTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episode_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "platform" "SubscriptionPlatform" NOT NULL,
    "productType" "StoreProductType" NOT NULL,
    "productId" TEXT NOT NULL,
    "storeTransactionId" TEXT NOT NULL,
    "storeOriginalTransactionId" TEXT,
    "purchaseToken" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceKurus" INTEGER,
    "currency" TEXT,
    "purchaseState" "PurchaseState" NOT NULL DEFAULT 'PURCHASED',
    "validatedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "source" "WebhookSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "state" "WebhookState" NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("scope","key")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "titleTr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "bodyTr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "dataJson" JSONB,
    "pushSentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" TEXT NOT NULL,
    "newEpisode" BOOLEAN NOT NULL DEFAULT true,
    "newContent" BOOLEAN NOT NULL DEFAULT true,
    "promo" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "devices_pushToken_key" ON "devices"("pushToken");

-- CreateIndex
CREATE INDEX "devices_userId_idx" ON "devices"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_replacedById_key" ON "sessions"("replacedById");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_familyId_idx" ON "sessions"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_contentId_seasonNumber_key" ON "seasons"("contentId", "seasonNumber");

-- CreateIndex
CREATE INDEX "cast_members_fullName_idx" ON "cast_members"("fullName");

-- CreateIndex
CREATE INDEX "episode_media_episodeId_state_idx" ON "episode_media"("episodeId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "episode_media_episodeId_provider_providerAssetId_key" ON "episode_media"("episodeId", "provider", "providerAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "home_sections_key_key" ON "home_sections"("key");

-- CreateIndex
CREATE INDEX "home_sections_isActive_sortOrder_idx" ON "home_sections"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "home_section_items_contentId_idx" ON "home_section_items"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "home_section_items_sectionId_contentId_key" ON "home_section_items"("sectionId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "banners_slug_key" ON "banners"("slug");

-- CreateIndex
CREATE INDEX "banners_isActive_sortOrder_idx" ON "banners"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "watch_history_userId_lastWatchedAt_idx" ON "watch_history"("userId", "lastWatchedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "watch_history_userId_episodeId_key" ON "watch_history"("userId", "episodeId");

-- CreateIndex
CREATE INDEX "favorites_userId_createdAt_idx" ON "favorites"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_contentId_key" ON "favorites"("userId", "contentId");

-- CreateIndex
CREATE INDEX "playback_sessions_userId_issuedAt_idx" ON "playback_sessions"("userId", "issuedAt" DESC);

-- CreateIndex
CREATE INDEX "playback_sessions_episodeId_issuedAt_idx" ON "playback_sessions"("episodeId", "issuedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE INDEX "plans_isActive_billingPeriod_idx" ON "plans"("isActive", "billingPeriod");

-- CreateIndex
CREATE INDEX "subscriptions_userId_status_idx" ON "subscriptions"("userId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_storeOriginalTransactionId_idx" ON "subscriptions"("storeOriginalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_packs_code_key" ON "credit_packs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_idempotencyKey_key" ON "credit_ledger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_ledger_userId_createdAt_idx" ON "credit_ledger"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "credit_ledger_type_createdAt_idx" ON "credit_ledger"("type", "createdAt");

-- CreateIndex
CREATE INDEX "credit_ledger_referenceType_referenceId_idx" ON "credit_ledger"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "episode_unlocks_userId_createdAt_idx" ON "episode_unlocks"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "episode_unlocks_episodeId_idx" ON "episode_unlocks"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "episode_unlocks_userId_episodeId_key" ON "episode_unlocks"("userId", "episodeId");

-- CreateIndex
CREATE INDEX "store_transactions_userId_createdAt_idx" ON "store_transactions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "store_transactions_platform_storeTransactionId_key" ON "store_transactions"("platform", "storeTransactionId");

-- CreateIndex
CREATE INDEX "webhook_events_state_receivedAt_idx" ON "webhook_events"("state", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_source_eventId_key" ON "webhook_events"("source", "eventId");

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "contents_status_publishedAt_idx" ON "contents"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "contents_kind_idx" ON "contents"("kind");

-- CreateIndex
CREATE INDEX "episodes_status_publishedAt_idx" ON "episodes"("status", "publishedAt");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: mevcut bölümlerden seasons satırları üret (FK öncesi zorunlu)
INSERT INTO "seasons" ("id", "contentId", "seasonNumber", "createdAt", "updatedAt")
SELECT DISTINCT ON ("contentId", "seasonNumber")
       'sn_' || "contentId" || '_' || "seasonNumber",
       "contentId", "seasonNumber", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "episodes"
ON CONFLICT ("contentId", "seasonNumber") DO NOTHING;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_contentId_seasonNumber_fkey" FOREIGN KEY ("contentId", "seasonNumber") REFERENCES "seasons"("contentId", "seasonNumber") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_cast" ADD CONSTRAINT "content_cast_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_cast" ADD CONSTRAINT "content_cast_castMemberId_fkey" FOREIGN KEY ("castMemberId") REFERENCES "cast_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_media" ADD CONSTRAINT "episode_media_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_section_items" ADD CONSTRAINT "home_section_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "home_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_section_items" ADD CONSTRAINT "home_section_items_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_targetContentId_fkey" FOREIGN KEY ("targetContentId") REFERENCES "contents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_history" ADD CONSTRAINT "watch_history_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_unlocks" ADD CONSTRAINT "episode_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_unlocks" ADD CONSTRAINT "episode_unlocks_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_unlocks" ADD CONSTRAINT "episode_unlocks_creditLedgerId_fkey" FOREIGN KEY ("creditLedgerId") REFERENCES "credit_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_unlocks" ADD CONSTRAINT "episode_unlocks_storeTransactionId_fkey" FOREIGN KEY ("storeTransactionId") REFERENCES "store_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_transactions" ADD CONSTRAINT "store_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
