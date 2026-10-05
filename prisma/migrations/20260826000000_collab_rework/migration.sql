ALTER TABLE "Review" ADD COLUMN "collaboratorDeflates" JSONB;
ALTER TABLE "Review" ADD COLUMN "collaboratorNotes" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "Draft" ADD COLUMN "collaboratorDeflates" JSONB;
ALTER TABLE "Draft" ADD COLUMN "collaboratorNotes" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "SubmissionCollaborator" ADD COLUMN "hackatimeProjectMinutes" JSONB;
