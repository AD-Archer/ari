-- one statement per table, each committed on its own (prisma does not wrap this file): row locks last one table's update, not the whole backfill.
-- existing rows only know whole minutes, so minutes * 60 is exact for them. a row is touched only
-- where its seconds do not already stand for its minutes, so rows a trigger filled, rows a writer
-- gave true seconds, and a second run of this file are all left alone.

UPDATE "HoursBreakdown" SET
  "hackatimeSeconds" = CASE WHEN COALESCE(("hackatimeSeconds"::bigint + 30) / 60, -1) <> COALESCE("hackatimeMinutes", -1) THEN "ariMinutesToSeconds"("hackatimeMinutes") ELSE "hackatimeSeconds" END,
  "devlogSeconds" = CASE WHEN COALESCE(("devlogSeconds"::bigint + 30) / 60, -1) <> COALESCE("devlogMinutes", -1) THEN "ariMinutesToSeconds"("devlogMinutes") ELSE "devlogSeconds" END,
  "afterLastCommitSeconds" = CASE WHEN COALESCE(("afterLastCommitSeconds"::bigint + 30) / 60, -1) <> COALESCE("afterLastCommitMinutes", -1) THEN "ariMinutesToSeconds"("afterLastCommitMinutes") ELSE "afterLastCommitSeconds" END,
  "lapseSeconds" = CASE WHEN COALESCE(("lapseSeconds"::bigint + 30) / 60, -1) <> COALESCE("lapseMinutes", -1) THEN "ariMinutesToSeconds"("lapseMinutes") ELSE "lapseSeconds" END,
  "aiDiscountedSeconds" = CASE WHEN COALESCE(("aiDiscountedSeconds"::bigint + 30) / 60, -1) <> COALESCE("aiDiscountedMinutes", -1) THEN "ariMinutesToSeconds"("aiDiscountedMinutes") ELSE "aiDiscountedSeconds" END,
  "programSeconds" = CASE WHEN COALESCE(("programSeconds"::bigint + 30) / 60, -1) <> COALESCE("programMinutes", -1) THEN "ariMinutesToSeconds"("programMinutes") ELSE "programSeconds" END
WHERE COALESCE(("hackatimeSeconds"::bigint + 30) / 60, -1) <> COALESCE("hackatimeMinutes", -1)
   OR COALESCE(("devlogSeconds"::bigint + 30) / 60, -1) <> COALESCE("devlogMinutes", -1)
   OR COALESCE(("afterLastCommitSeconds"::bigint + 30) / 60, -1) <> COALESCE("afterLastCommitMinutes", -1)
   OR COALESCE(("lapseSeconds"::bigint + 30) / 60, -1) <> COALESCE("lapseMinutes", -1)
   OR COALESCE(("aiDiscountedSeconds"::bigint + 30) / 60, -1) <> COALESCE("aiDiscountedMinutes", -1)
   OR COALESCE(("programSeconds"::bigint + 30) / 60, -1) <> COALESCE("programMinutes", -1);

UPDATE "SubmissionCollaborator" SET
  "hackatimeSeconds" = CASE WHEN COALESCE(("hackatimeSeconds"::bigint + 30) / 60, -1) <> COALESCE("hackatimeMinutes", -1) THEN "ariMinutesToSeconds"("hackatimeMinutes") ELSE "hackatimeSeconds" END,
  "devlogSeconds" = CASE WHEN COALESCE(("devlogSeconds"::bigint + 30) / 60, -1) <> COALESCE("devlogMinutes", -1) THEN "ariMinutesToSeconds"("devlogMinutes") ELSE "devlogSeconds" END,
  "afterLastCommitSeconds" = CASE WHEN COALESCE(("afterLastCommitSeconds"::bigint + 30) / 60, -1) <> COALESCE("afterLastCommitMinutes", -1) THEN "ariMinutesToSeconds"("afterLastCommitMinutes") ELSE "afterLastCommitSeconds" END,
  "lapseSeconds" = CASE WHEN COALESCE(("lapseSeconds"::bigint + 30) / 60, -1) <> COALESCE("lapseMinutes", -1) THEN "ariMinutesToSeconds"("lapseMinutes") ELSE "lapseSeconds" END,
  "programSeconds" = CASE WHEN COALESCE(("programSeconds"::bigint + 30) / 60, -1) <> COALESCE("programMinutes", -1) THEN "ariMinutesToSeconds"("programMinutes") ELSE "programSeconds" END,
  "hackatimeProjectSeconds" = CASE WHEN ("hackatimeProjectSeconds" IS NULL AND jsonb_typeof("hackatimeProjectMinutes") = 'object') THEN "ariMinutesJsonToSeconds"("hackatimeProjectMinutes") ELSE "hackatimeProjectSeconds" END
WHERE COALESCE(("hackatimeSeconds"::bigint + 30) / 60, -1) <> COALESCE("hackatimeMinutes", -1)
   OR COALESCE(("devlogSeconds"::bigint + 30) / 60, -1) <> COALESCE("devlogMinutes", -1)
   OR COALESCE(("afterLastCommitSeconds"::bigint + 30) / 60, -1) <> COALESCE("afterLastCommitMinutes", -1)
   OR COALESCE(("lapseSeconds"::bigint + 30) / 60, -1) <> COALESCE("lapseMinutes", -1)
   OR COALESCE(("programSeconds"::bigint + 30) / 60, -1) <> COALESCE("programMinutes", -1)
   OR ("hackatimeProjectSeconds" IS NULL AND jsonb_typeof("hackatimeProjectMinutes") = 'object');

UPDATE "Devlog" SET
  "seconds" = CASE WHEN COALESCE(("seconds"::bigint + 30) / 60, -1) <> COALESCE("minutes", -1) THEN "ariMinutesToSeconds"("minutes") ELSE "seconds" END
WHERE COALESCE(("seconds"::bigint + 30) / 60, -1) <> COALESCE("minutes", -1);

UPDATE "Review" SET
  "approvedSeconds" = CASE WHEN COALESCE(("approvedSeconds"::bigint + 30) / 60, -1) <> COALESCE("approvedMinutes", -1) THEN "ariMinutesToSeconds"("approvedMinutes") ELSE "approvedSeconds" END,
  "deflateSeconds" = CASE WHEN COALESCE(("deflateSeconds"::bigint + 30) / 60, -1) <> COALESCE("deflateMinutes", -1) THEN "ariMinutesToSeconds"("deflateMinutes") ELSE "deflateSeconds" END,
  "collaboratorSeconds" = CASE WHEN ("collaboratorSeconds" = '{}'::jsonb AND jsonb_typeof("collaboratorMinutes") = 'object' AND "collaboratorMinutes" <> '{}'::jsonb) THEN "ariMinutesJsonToSeconds"("collaboratorMinutes") ELSE "collaboratorSeconds" END,
  "collaboratorDeflatesSeconds" = CASE WHEN ("collaboratorDeflatesSeconds" IS NULL AND jsonb_typeof("collaboratorDeflates") = 'object') THEN "ariMinutesJsonToSeconds"("collaboratorDeflates") ELSE "collaboratorDeflatesSeconds" END
WHERE COALESCE(("approvedSeconds"::bigint + 30) / 60, -1) <> COALESCE("approvedMinutes", -1)
   OR COALESCE(("deflateSeconds"::bigint + 30) / 60, -1) <> COALESCE("deflateMinutes", -1)
   OR ("collaboratorSeconds" = '{}'::jsonb AND jsonb_typeof("collaboratorMinutes") = 'object' AND "collaboratorMinutes" <> '{}'::jsonb)
   OR ("collaboratorDeflatesSeconds" IS NULL AND jsonb_typeof("collaboratorDeflates") = 'object');

UPDATE "Draft" SET
  "deflateSeconds" = CASE WHEN COALESCE(("deflateSeconds"::bigint + 30) / 60, -1) <> COALESCE("deflateMinutes", -1) THEN "ariMinutesToSeconds"("deflateMinutes") ELSE "deflateSeconds" END,
  "adjustmentsSeconds" = CASE WHEN ("adjustmentsSeconds" = '{}'::jsonb AND jsonb_typeof("adjustments") = 'object' AND "adjustments" <> '{}'::jsonb) THEN "ariMinutesJsonToSeconds"("adjustments") ELSE "adjustmentsSeconds" END,
  "collaboratorDeflatesSeconds" = CASE WHEN ("collaboratorDeflatesSeconds" IS NULL AND jsonb_typeof("collaboratorDeflates") = 'object') THEN "ariMinutesJsonToSeconds"("collaboratorDeflates") ELSE "collaboratorDeflatesSeconds" END
WHERE COALESCE(("deflateSeconds"::bigint + 30) / 60, -1) <> COALESCE("deflateMinutes", -1)
   OR ("adjustmentsSeconds" = '{}'::jsonb AND jsonb_typeof("adjustments") = 'object' AND "adjustments" <> '{}'::jsonb)
   OR ("collaboratorDeflatesSeconds" IS NULL AND jsonb_typeof("collaboratorDeflates") = 'object');
