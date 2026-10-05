ALTER TABLE "Submission" ADD COLUMN "authorNameOverrides" JSONB;

ALTER TYPE "ActivityKind" ADD VALUE 'SHIP_EDIT';
