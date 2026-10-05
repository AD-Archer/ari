-- On by default (only meaningful while "secondPass" is on): an organizer's or org
-- admin's own decision in the normal queue skips the second-pass hold and fires the
-- outbound webhook immediately, instead of parking in `secondpass`. A plain reviewer's
-- decision is still held.
--
-- Idempotent: an earlier (now-removed) migration already added this column on some
-- databases at DEFAULT false. IF NOT EXISTS makes the create a no-op there; the
-- following statements then converge every database to the intended state - default
-- true for new programs AND existing rows flipped on, so the bypass is on everywhere.
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "secondPassOrganizerBypass" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Program" ALTER COLUMN "secondPassOrganizerBypass" SET DEFAULT true;
UPDATE "Program" SET "secondPassOrganizerBypass" = true;
