-- The priority review system is removed; drop the reviewer-set marker.
ALTER TABLE "Submission" DROP COLUMN "priority";
