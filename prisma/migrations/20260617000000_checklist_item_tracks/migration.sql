-- Per-track approval-checklist items: each requirement can apply to software,
-- hardware, or both. A reviewer only sees and must tick items whose tracks
-- include the submission's track. Existing items backfill to both tracks so
-- they keep showing on every submission exactly as before.
ALTER TABLE "ChecklistItem" ADD COLUMN     "tracks" "Track"[] DEFAULT ARRAY['software', 'hardware']::"Track"[];
