-- CreateEnum
CREATE TYPE "VersionKind" AS ENUM ('AUTO', 'NAMED', 'PUBLISHED');

-- AlterTable
ALTER TABLE "draft_versions" ADD COLUMN     "kind" "VersionKind" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "wordCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "draft_versions_draftId_createdAt_idx" ON "draft_versions"("draftId", "createdAt");
