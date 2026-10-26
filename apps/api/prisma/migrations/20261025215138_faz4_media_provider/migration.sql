-- AlterEnum
ALTER TYPE "MediaProvider" ADD VALUE 'LOCAL';

-- AlterEnum
ALTER TYPE "MediaState" ADD VALUE 'AWAITING_UPLOAD';

-- AlterTable
ALTER TABLE "episode_media" ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "readyAt" TIMESTAMP(3),
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "uploadExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "media_text_tracks" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "media_text_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_text_tracks_mediaId_language_key" ON "media_text_tracks"("mediaId", "language");

-- AddForeignKey
ALTER TABLE "media_text_tracks" ADD CONSTRAINT "media_text_tracks_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "episode_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
