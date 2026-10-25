-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameTr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contents" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "seriesFormat" TEXT,
    "titleTr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "originalTitle" TEXT,
    "synopsisTr" TEXT NOT NULL,
    "synopsisEn" TEXT NOT NULL,
    "releaseYear" INTEGER NOT NULL,
    "ageRating" TEXT,
    "accessType" TEXT NOT NULL DEFAULT 'FREE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_categories" (
    "contentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "content_categories_pkey" PRIMARY KEY ("contentId","categoryId")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "titleTr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "accessType" TEXT NOT NULL DEFAULT 'FREE',
    "creditCost" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "contents_slug_key" ON "contents"("slug");

-- CreateIndex
CREATE INDEX "contents_status_publishedAt_idx" ON "contents"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_contentId_seasonNumber_episodeNumber_key" ON "episodes"("contentId", "seasonNumber", "episodeNumber");

-- AddForeignKey
ALTER TABLE "content_categories" ADD CONSTRAINT "content_categories_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_categories" ADD CONSTRAINT "content_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
