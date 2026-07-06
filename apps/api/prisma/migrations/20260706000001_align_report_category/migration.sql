-- Align ReportCategory enum with SensitiveCategory taxonomy
-- Remove: POLITICS, VULGARITY, MEDICAL (merged into ABUSE/FRAUD/removed)
-- Add: ABUSE, ILLICIT_ADS

-- First, migrate existing data: map old values to new
UPDATE "reports" SET "category" = 'ABUSE' WHERE "category" = 'VULGARITY';
UPDATE "reports" SET "category" = 'FRAUD' WHERE "category" = 'POLITICS';
UPDATE "reports" SET "category" = 'OTHER' WHERE "category" = 'MEDICAL';

-- Recreate the enum type with new values
ALTER TYPE "ReportCategory" RENAME TO "ReportCategory_old";
CREATE TYPE "ReportCategory" AS ENUM ('PORNOGRAPHY', 'GAMBLING', 'DRUGS', 'ABUSE', 'FRAUD', 'ILLICIT_ADS', 'OTHER');
ALTER TABLE "reports" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "reports" ALTER COLUMN "category" TYPE "ReportCategory" USING "category"::text::"ReportCategory";
ALTER TABLE "reports" ALTER COLUMN "category" SET DEFAULT 'OTHER';
DROP TYPE "ReportCategory_old";
