-- Maker-driven priority review: program opt-in (public form token + message) and the
-- per-ship maker-requested marker. The Submission column deliberately reuses the name
-- of the reviewer-set marker dropped in the previous migration - the data did not
-- carry over because the semantics changed (makers request it, reviewers never set it).
ALTER TABLE "Program" ADD COLUMN "priorityReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Program" ADD COLUMN "priorityReviewMessage" TEXT;
ALTER TABLE "Program" ADD COLUMN "priorityReviewToken" TEXT;
CREATE UNIQUE INDEX "Program_priorityReviewToken_key" ON "Program"("priorityReviewToken");

ALTER TABLE "Submission" ADD COLUMN "priority" BOOLEAN NOT NULL DEFAULT false;

-- Audit-trail kind for maker priority requests.
ALTER TYPE "ActivityKind" ADD VALUE 'PRIORITY';
