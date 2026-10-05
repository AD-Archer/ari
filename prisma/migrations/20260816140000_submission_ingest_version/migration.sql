-- A source-controlled revision for one ship's ingest payload. This is separate
-- from Submission.version, which counts distinct ships of the same project.
-- Existing ships and legacy senders begin at revision 1.
ALTER TABLE "Submission" ADD COLUMN "ingestVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Submission"
ADD CONSTRAINT "Submission_ingestVersion_positive" CHECK ("ingestVersion" > 0);
