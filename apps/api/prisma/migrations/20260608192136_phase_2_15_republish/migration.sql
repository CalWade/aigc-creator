-- Phase 2.15 — 发布后二次编辑
-- 1. 加 enum 值(必须在事务外:Postgres 限制)
ALTER TYPE "DraftStatus" ADD VALUE 'REVIEWING' BEFORE 'PUBLISHED';

-- 2. 加列
ALTER TABLE "drafts" ADD COLUMN "publishedBody" JSONB;
ALTER TABLE "drafts" ADD COLUMN "publishedTitle" TEXT;
ALTER TABLE "drafts" ADD COLUMN "publishedVersion" INTEGER;

-- 3. backfill 已 PUBLISHED 行,把 body/title/version 拷到 publishedBody/Title/Version
UPDATE "drafts"
SET
  "publishedBody"    = "body",
  "publishedTitle"   = "title",
  "publishedVersion" = "version"
WHERE "status" = 'PUBLISHED' AND "publishedBody" IS NULL;
