-- Re-ship verification: which prior request-changes reviews the approving
-- reviewer confirmed were addressed, plus its draft mirror.
ALTER TABLE "Review" ADD COLUMN "fixChecks" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Draft" ADD COLUMN "fixChecks" JSONB NOT NULL DEFAULT '[]';
