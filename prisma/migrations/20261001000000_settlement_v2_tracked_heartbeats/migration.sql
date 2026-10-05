-- Settlement v2: per-person Hackatime credit comes from the captured tracked
-- minutes (SubmissionCollaborator.hackatimeMinutes / HoursBreakdown.hackatimeMinutes)
-- instead of commit-anchored coding seconds. Every Review row records which
-- settlement model produced its stored minutes / adjustments so replays
-- (second-pass confirm, outbound redispatch) re-derive identical numbers.
-- Default 1: every existing review row replays under the commit-anchored model
-- that decided it; only new decisions write 2.
ALTER TABLE "Review" ADD COLUMN "settlementVersion" INTEGER NOT NULL DEFAULT 1;
