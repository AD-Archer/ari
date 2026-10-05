-- Wall-clock ingest time, distinct from receivedAt (which is backdatable via
-- the ingest payload's shipped_at for migrations). The stuck-submission sweep
-- measured "wedged in processing >6h" from receivedAt, so every backdated
-- migration ship still enriching was instantly "stuck" and auto-rejected.
-- Existing rows get the migration time, which grants in-flight submissions a
-- fresh 6h window - strictly safer than reaping them early.
ALTER TABLE "Submission" ADD COLUMN "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
