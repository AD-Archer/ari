-- Override Hours Spent Justification (YSWS handbook, Quality and Integrity).
--
-- The justification a program records against an approved ship must now be
-- verifiable by someone who wasn't in the review: named Hackatime projects with
-- the dates they were counted over, the submitter's Hackatime id, the timelapse
-- links, what the project technically does that accounts for the hours, and - when
-- hours were deflated - what they were deflated to and why.
--
-- The first three are derivable from evidence ari already holds; the last two are
-- reviewer-written, so they get columns here. Both default to '' so reviews decided
-- before the standard landed stay readable (they simply carry no justification).
ALTER TABLE "Review" ADD COLUMN "technicalFeatures" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Review" ADD COLUMN "deflationReason" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Draft" ADD COLUMN "technicalFeatures" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Draft" ADD COLUMN "deflationReason" TEXT NOT NULL DEFAULT '';

-- The evidence window's start, as resolved by the ari-webhooks enrichment that
-- already computes it (program tracking start, the last approved ship of the same
-- project, and the source app's _prior_credited_at, whichever is latest). Persisted
-- so the outbound Hackatime date range reports the window the hours were actually
-- counted over instead of re-deriving it a second time at dispatch. The window ends
-- at "Submission"."receivedAt". Null on ships captured before this column existed.
ALTER TABLE "HoursBreakdown" ADD COLUMN "trackingFromAt" TIMESTAMP(3);
