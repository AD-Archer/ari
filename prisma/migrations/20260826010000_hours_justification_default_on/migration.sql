-- Hours justification becomes org policy: on for every program, new and existing.
-- Turning it off is gated behind the MANAGE_PROGRAMS org permission in the app.
ALTER TABLE "Program" ALTER COLUMN "hoursJustification" SET DEFAULT true;
UPDATE "Program" SET "hoursJustification" = true;
