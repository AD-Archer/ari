-- Evidence snapshot counter, written by ari-webhooks inside every capture persist
-- (first enrich and each re-enrich). Guarded because the ari-webhooks goose
-- migration 00007 adds it the same way, so either deploy order works and a
-- re-run is a no-op.
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "enrichmentVersion" INTEGER NOT NULL DEFAULT 0;
