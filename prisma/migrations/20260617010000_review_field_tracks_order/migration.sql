-- Per-track + draggable custom review fields. `tracks` scopes a field to
-- software, hardware, or both (legacy fields backfill to both). `order` gives
-- fields an explicit rail order, backfilled from the previous id-ascending sort
-- so nothing visibly reshuffles on deploy.
ALTER TABLE "ReviewField" ADD COLUMN     "tracks" "Track"[] DEFAULT ARRAY['software', 'hardware']::"Track"[];
ALTER TABLE "ReviewField" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY "programId" ORDER BY id ASC) - 1 AS rn
  FROM "ReviewField"
)
UPDATE "ReviewField" f SET "order" = ranked.rn FROM ranked WHERE f.id = ranked.id;
