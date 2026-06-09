-- CreateEnum
CREATE TYPE "AssetReviewStatus" AS ENUM ('PENDING', 'PASSED', 'WARNED', 'BLOCKED');

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "reviewStatus" "AssetReviewStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "reviewNote" TEXT;
