-- Program-asserted "program-added" time (ingest payload `program_hours`).
-- Evidence-free: set at ingest from the program's own number, counted toward the
-- verified total, and reviewer-deflatable. On collaborative ships HoursBreakdown
-- holds the aggregate and each SubmissionCollaborator holds that person's share.
ALTER TABLE "HoursBreakdown" ADD COLUMN "programMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubmissionCollaborator" ADD COLUMN "programMinutes" INTEGER NOT NULL DEFAULT 0;
