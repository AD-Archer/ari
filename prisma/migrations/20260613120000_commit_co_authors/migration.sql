-- `Co-authored-by` trailers parsed from each commit body, stored as a JSON
-- array of `{ name, email }`. Informational only (surfaced on the review screen
-- so reviewers can see extra/AI contributors); never gated on. Backfills empty
-- for existing rows - evidence is frozen at ingest, so prior commits keep [].
ALTER TABLE "Commit" ADD COLUMN "coAuthors" JSONB NOT NULL DEFAULT '[]';
