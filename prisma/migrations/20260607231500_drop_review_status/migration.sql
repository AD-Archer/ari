-- The 'review' submission status is removed: it was vestigial - nothing ever set
-- it (only WHERE-filters referenced it). Fold any stragglers back onto the queue,
-- then drop the enum value. Postgres can't DROP an enum value in place, and the
-- open-project partial unique index references it, so the index is rebuilt around
-- a rename/recreate/swap of the type.

-- 1. fold any in-review ships back to the queue
UPDATE "Submission" SET "status" = 'pending' WHERE "status" = 'review';

-- 2. the partial unique index references 'review' - drop it before the type swap
DROP INDEX IF EXISTS "Submission_open_project_key";

-- 3. recreate SubmissionStatus without 'review'
ALTER TYPE "SubmissionStatus" RENAME TO "SubmissionStatus_old";
CREATE TYPE "SubmissionStatus" AS ENUM ('pending', 'approved', 'changes', 'rejected', 'reverted', 'processing', 'withdrawn');
ALTER TABLE "Submission" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Submission" ALTER COLUMN "status" TYPE "SubmissionStatus" USING ("status"::text::"SubmissionStatus");
ALTER TABLE "Submission" ALTER COLUMN "status" SET DEFAULT 'pending';
DROP TYPE "SubmissionStatus_old";

-- 4. rebuild the open-project unique index without 'review'
CREATE UNIQUE INDEX "Submission_open_project_key"
  ON "Submission"("programId", "externalId")
  WHERE status IN (
    'processing'::"SubmissionStatus",
    'pending'::"SubmissionStatus"
  );
