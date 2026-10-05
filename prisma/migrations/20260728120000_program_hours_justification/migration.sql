-- Per-program opt-in for the Override Hours Spent Justification (YSWS handbook,
-- Quality and Integrity). Off is the legacy review flow: a note to the maker and an
-- internal audit note, with no `review.justification` in the outbound payload. On adds
-- the two reviewer-written fields (required to approve, and to deflate) and ships the
-- captured evidence alongside them.
--
-- Defaults to false so programs already running keep the flow their reviewers know
-- until an organizer turns it on.
ALTER TABLE "Program" ADD COLUMN "hoursJustification" BOOLEAN NOT NULL DEFAULT false;
