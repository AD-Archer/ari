-- The six computed flag kinds ari-webhooks raises, plus the AI-coding discount it
-- records. Both live in this schema but are written by that service, whose own
-- goose migrations (00002-00005) already added them guarded. Guarded here too so
-- either deploy order works and a re-run is a no-op: Prisma's generated DDL would
-- use a bare ADD VALUE and fail on a value that is already there.
ALTER TYPE "FlagKind" ADD VALUE IF NOT EXISTS 'NO_README';
ALTER TYPE "FlagKind" ADD VALUE IF NOT EXISTS 'PLAGIARISM';
ALTER TYPE "FlagKind" ADD VALUE IF NOT EXISTS 'PHANTOM_FILES';
ALTER TYPE "FlagKind" ADD VALUE IF NOT EXISTS 'MARATHON_SESSION';
ALTER TYPE "FlagKind" ADD VALUE IF NOT EXISTS 'HOURS_REUSE';
ALTER TYPE "FlagKind" ADD VALUE IF NOT EXISTS 'IDLE_DEVLOG';

ALTER TABLE "HoursBreakdown" ADD COLUMN IF NOT EXISTS "aiDiscountedMinutes" INTEGER NOT NULL DEFAULT 0;
