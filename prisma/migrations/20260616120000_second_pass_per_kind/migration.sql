-- Per-kind second-pass gating. Only consulted when Program.secondPass is on.
-- All on by default so existing programs with second pass enabled keep holding
-- every decision (approve, request changes, reject) exactly as before.
ALTER TABLE "Program" ADD COLUMN     "secondPassApproved" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Program" ADD COLUMN     "secondPassChanges" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Program" ADD COLUMN     "secondPassRejected" BOOLEAN NOT NULL DEFAULT true;
