-- Add the 'processing' value to SubmissionStatus.
-- Submissions start in 'processing' while evidence is being captured; they
-- advance to 'pending' (visible in the review queue) once enrichment succeeds.
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'processing';

-- The partial unique index that prevents two open ships for the same project
-- must now include 'processing' so concurrent deliveries during enrichment
-- are still blocked.
DROP INDEX IF EXISTS "Submission_open_project_key";
CREATE UNIQUE INDEX "Submission_open_project_key"
  ON "Submission"("programId", "externalId")
  WHERE status IN (
    'processing'::"SubmissionStatus",
    'pending'::"SubmissionStatus",
    'review'::"SubmissionStatus"
  );
