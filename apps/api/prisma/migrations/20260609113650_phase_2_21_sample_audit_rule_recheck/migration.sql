-- CreateEnum
CREATE TYPE "SampleAuditStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "RuleRecheckRunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "sample_audits" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "status" "SampleAuditStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_recheck_runs" (
    "id" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "totalScanned" INTEGER NOT NULL DEFAULT 0,
    "totalOffline" INTEGER NOT NULL DEFAULT 0,
    "status" "RuleRecheckRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "rule_recheck_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sample_audits_status_idx" ON "sample_audits"("status");

-- CreateIndex
CREATE INDEX "sample_audits_draftId_idx" ON "sample_audits"("draftId");

-- CreateIndex
CREATE INDEX "rule_recheck_runs_status_idx" ON "rule_recheck_runs"("status");

-- AddForeignKey
ALTER TABLE "sample_audits" ADD CONSTRAINT "sample_audits_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
