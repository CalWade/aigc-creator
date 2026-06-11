-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AUTHOR', 'ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'AUTHOR';
