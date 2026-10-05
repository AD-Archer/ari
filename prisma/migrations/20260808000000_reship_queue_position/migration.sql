-- Queue position timestamp: the open queue sorts by this instead of receivedAt.
-- A re-ship after "request changes" inherits the prior ship's position so fixing
-- requested changes never sends a project to the back of the queue.
ALTER TABLE "Submission" ADD COLUMN "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: each ship's position is the earliest receivedAt in its run of
-- consecutive request-changes predecessors (versions are contiguous per
-- project). Any other prior outcome resets the run, so a fresh ship - or one
-- following a rejection/withdrawal - keeps its own receivedAt.
UPDATE "Submission" s
SET "queuedAt" = (
  SELECT MIN(p."receivedAt") FROM "Submission" p
  WHERE p."programId" = s."programId" AND p."externalId" = s."externalId"
    AND p."version" <= s."version"
    AND p."version" > COALESCE((
      SELECT MAX(q."version") FROM "Submission" q
      WHERE q."programId" = s."programId" AND q."externalId" = s."externalId"
        AND q."version" < s."version" AND q."status" <> 'changes'
    ), 0)
);
