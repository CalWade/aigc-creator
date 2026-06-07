-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('POLITICS', 'PORNOGRAPHY', 'GAMBLING', 'DRUGS', 'VULGARITY', 'FRAUD', 'MEDICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReportResolution" AS ENUM ('OFFLINE', 'WARN', 'DISMISS');

-- AlterEnum
ALTER TYPE "DraftStatus" ADD VALUE 'OFFLINE';

-- AlterEnum
ALTER TYPE "DraftToolType" ADD VALUE 'POST_PUBLISH_REVIEW';

-- AlterTable
ALTER TABLE "drafts" ADD COLUMN     "offlineAt" TIMESTAMP(3),
ADD COLUMN     "offlineReason" TEXT;

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "reason" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolution" "ReportResolution",
    "resolverId" TEXT,
    "llmRecommendation" "ReviewRecommendation",
    "llmReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_postId_status_idx" ON "reports"("postId", "status");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporterId_postId_key" ON "reports"("reporterId", "postId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_postId_fkey" FOREIGN KEY ("postId") REFERENCES "drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
