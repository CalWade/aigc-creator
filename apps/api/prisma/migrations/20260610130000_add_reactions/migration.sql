-- CreateEnum
CREATE TYPE "ReactionKind" AS ENUM ('LIKE', 'COLLECT');

-- CreateTable
CREATE TABLE "reactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "kind" "ReactionKind" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reactions_userId_postId_kind_key" ON "reactions"("userId", "postId", "kind");
CREATE INDEX "reactions_postId_kind_idx" ON "reactions"("postId", "kind");

ALTER TABLE "reactions"
  ADD CONSTRAINT "reactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reactions"
  ADD CONSTRAINT "reactions_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
