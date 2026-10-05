-- Per-item hour adjustments: reviewers deflate per commit/journal/clip instead
-- of overriding one approved-hours number. approvedHours is preserved as
-- approvedMinutes (*60) before the column drops.
ALTER TABLE "HoursBreakdown" ADD COLUMN "lapseMinutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Review"
  ADD COLUMN "approvedMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "adjustments" JSONB NOT NULL DEFAULT '{}';
UPDATE "Review" SET "approvedMinutes" = "approvedHours" * 60;
ALTER TABLE "Review" DROP COLUMN "approvedHours";

ALTER TABLE "Draft"
  ADD COLUMN "adjustments" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Draft" DROP COLUMN "approvedHours";
