-- CreateEnum
CREATE TYPE "PromptEvalRunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "prompt_test_cases" (
    "id" TEXT NOT NULL,
    "tool" "DraftToolType" NOT NULL,
    "input" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_eval_runs" (
    "id" TEXT NOT NULL,
    "tool" "DraftToolType" NOT NULL,
    "promptId" TEXT NOT NULL,
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PromptEvalRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "prompt_eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_lab_actions" (
    "id" TEXT NOT NULL,
    "tool" "DraftToolType" NOT NULL,
    "action" TEXT NOT NULL,
    "fromPromptId" TEXT,
    "toPromptId" TEXT NOT NULL,
    "evalRunId" TEXT,
    "note" TEXT,
    "operatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_lab_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompt_test_cases_tool_idx" ON "prompt_test_cases"("tool");

-- CreateIndex
CREATE INDEX "prompt_eval_runs_tool_startedAt_idx" ON "prompt_eval_runs"("tool", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "prompt_lab_actions_tool_createdAt_idx" ON "prompt_lab_actions"("tool", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "prompt_eval_runs" ADD CONSTRAINT "prompt_eval_runs_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
