-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ReviewStage" AS ENUM ('PREFLIGHT', 'POST_PUBLISH');

-- CreateEnum
CREATE TYPE "ReviewRecommendation" AS ENUM ('ALLOW', 'WARN', 'BLOCK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DraftToolType" ADD VALUE 'SAFETY_REVIEW';
ALTER TYPE "DraftToolType" ADD VALUE 'QUALITY_REVIEW';

-- AlterTable
ALTER TABLE "drafts" ADD COLUMN     "lastReviewId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "stage" "ReviewStage" NOT NULL,
    "safety" JSONB NOT NULL,
    "quality" JSONB NOT NULL,
    "recommendation" "ReviewRecommendation" NOT NULL,
    "modelMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_draftId_createdAt_idx" ON "reviews"("draftId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "drafts_status_idx" ON "drafts"("status");

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_lastReviewId_fkey" FOREIGN KEY ("lastReviewId") REFERENCES "reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
