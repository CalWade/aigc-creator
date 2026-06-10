-- AlterTable: 给 users 加 phone/email/passwordHash
ALTER TABLE "users"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "passwordHash" TEXT;

CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateEnum
CREATE TYPE "AuthEventType" AS ENUM ('LOGIN', 'REGISTER', 'LOGOUT', 'SEND_CODE');

-- CreateTable
CREATE TABLE "auth_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "type" "AuthEventType" NOT NULL,
  "method" TEXT,
  "identity" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_events_userId_createdAt_idx" ON "auth_events"("userId", "createdAt");
CREATE INDEX "auth_events_type_createdAt_idx" ON "auth_events"("type", "createdAt");

ALTER TABLE "auth_events"
  ADD CONSTRAINT "auth_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
