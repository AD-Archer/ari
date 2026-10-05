-- Reviewer-set "review this first" marker, driving the site-wide priority-only view.
ALTER TABLE "Submission" ADD COLUMN "priority" BOOLEAN NOT NULL DEFAULT false;
