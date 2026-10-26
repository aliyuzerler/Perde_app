-- FAZ 9 — Push bildirim altyapısı: cihaz token geçersizlik izi,
-- bildirim dedup anahtarı, cihaz başına gönderim izleme tablosu.

-- Device: geçersiz token izi
ALTER TABLE "devices" ADD COLUMN "invalidAt" TIMESTAMP(3);
ALTER TABLE "devices" ADD COLUMN "invalidReason" TEXT;

-- Notification: olay bazlı mükerrerlik anahtarı
ALTER TABLE "notifications" ADD COLUMN "dedupKey" TEXT;
-- Postgres'te NULL dedupKey mükerrerliğe girmez (kampanya satırları güvenli)
CREATE UNIQUE INDEX "notifications_userId_dedupKey_key" ON "notifications"("userId", "dedupKey");

-- CreateEnum
CREATE TYPE "NotificationSendStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "notification_sends" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" "NotificationSendStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL DEFAULT 'none',
    "ticketId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_sends_status_createdAt_idx" ON "notification_sends"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_sends_notificationId_deviceId_key" ON "notification_sends"("notificationId", "deviceId");

-- AddForeignKey
ALTER TABLE "notification_sends" ADD CONSTRAINT "notification_sends_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_sends" ADD CONSTRAINT "notification_sends_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
