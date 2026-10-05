-- time moves to integer seconds. additive: every minutes column stays and keeps
-- being written until both services read seconds, then a later change drops them.
-- columns and triggers come first so no writer is ever uncovered; the next migration backfills.

ALTER TABLE "HoursBreakdown"
  ADD COLUMN "hackatimeSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "devlogSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "afterLastCommitSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lapseSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiDiscountedSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "programSeconds" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SubmissionCollaborator"
  ADD COLUMN "hackatimeSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "devlogSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "afterLastCommitSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lapseSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "programSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hackatimeProjectSeconds" JSONB;

ALTER TABLE "Devlog" ADD COLUMN "seconds" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Review"
  ADD COLUMN "approvedSeconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "adjustmentsSeconds" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "collaboratorSeconds" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "deflateSeconds" INTEGER,
  ADD COLUMN "collaboratorDeflatesSeconds" JSONB;

ALTER TABLE "Draft"
  ADD COLUMN "adjustmentsSeconds" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "deflateSeconds" INTEGER,
  ADD COLUMN "collaboratorDeflatesSeconds" JSONB;

-- minutes * 60, exact for every real value. computed in bigint and held to the integer range
-- (-2147483648..2147483647: -2 ** 31 .. 2 ** 31 - 1) so an absurd stored value cannot raise
CREATE FUNCTION "ariMinutesToSeconds"(minutes INTEGER) RETURNS INTEGER AS $$
  SELECT LEAST(GREATEST(minutes::bigint * 60, -2147483648), 2147483647)::integer
$$ LANGUAGE sql IMMUTABLE STRICT;

-- multiply every numeric leaf of a json object by 60, at any depth, held to the same range
CREATE FUNCTION "ariMinutesJsonToSeconds"(input JSONB) RETURNS JSONB AS $$
  SELECT COALESCE(jsonb_object_agg(
    entry.key,
    CASE jsonb_typeof(entry.value)
      WHEN 'number' THEN to_jsonb(LEAST(GREATEST(round((entry.value #>> '{}')::numeric * 60), -2147483648), 2147483647)::bigint)
      WHEN 'object' THEN "ariMinutesJsonToSeconds"(entry.value)
      ELSE entry.value
    END
  ), '{}'::jsonb)
  FROM jsonb_each(input) AS entry
$$ LANGUAGE sql IMMUTABLE;

-- the old app and the old ari-webhooks build write only the minutes columns. while they
-- still run, fill the seconds column from minutes whenever a writer did not supply it.
-- writers that set seconds themselves are left alone. dropped with the minutes columns.

CREATE FUNCTION "ariSecondsFromMinutesHoursBreakdown"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."hackatimeSeconds", 0) = 0 AND COALESCE(NEW."hackatimeMinutes", 0) <> 0 THEN
      NEW."hackatimeSeconds" := "ariMinutesToSeconds"(NEW."hackatimeMinutes");
    END IF;
  ELSIF NEW."hackatimeMinutes" IS DISTINCT FROM OLD."hackatimeMinutes" AND NEW."hackatimeSeconds" IS NOT DISTINCT FROM OLD."hackatimeSeconds" THEN
    NEW."hackatimeSeconds" := "ariMinutesToSeconds"(NEW."hackatimeMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."devlogSeconds", 0) = 0 AND COALESCE(NEW."devlogMinutes", 0) <> 0 THEN
      NEW."devlogSeconds" := "ariMinutesToSeconds"(NEW."devlogMinutes");
    END IF;
  ELSIF NEW."devlogMinutes" IS DISTINCT FROM OLD."devlogMinutes" AND NEW."devlogSeconds" IS NOT DISTINCT FROM OLD."devlogSeconds" THEN
    NEW."devlogSeconds" := "ariMinutesToSeconds"(NEW."devlogMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."afterLastCommitSeconds", 0) = 0 AND COALESCE(NEW."afterLastCommitMinutes", 0) <> 0 THEN
      NEW."afterLastCommitSeconds" := "ariMinutesToSeconds"(NEW."afterLastCommitMinutes");
    END IF;
  ELSIF NEW."afterLastCommitMinutes" IS DISTINCT FROM OLD."afterLastCommitMinutes" AND NEW."afterLastCommitSeconds" IS NOT DISTINCT FROM OLD."afterLastCommitSeconds" THEN
    NEW."afterLastCommitSeconds" := "ariMinutesToSeconds"(NEW."afterLastCommitMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."lapseSeconds", 0) = 0 AND COALESCE(NEW."lapseMinutes", 0) <> 0 THEN
      NEW."lapseSeconds" := "ariMinutesToSeconds"(NEW."lapseMinutes");
    END IF;
  ELSIF NEW."lapseMinutes" IS DISTINCT FROM OLD."lapseMinutes" AND NEW."lapseSeconds" IS NOT DISTINCT FROM OLD."lapseSeconds" THEN
    NEW."lapseSeconds" := "ariMinutesToSeconds"(NEW."lapseMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."aiDiscountedSeconds", 0) = 0 AND COALESCE(NEW."aiDiscountedMinutes", 0) <> 0 THEN
      NEW."aiDiscountedSeconds" := "ariMinutesToSeconds"(NEW."aiDiscountedMinutes");
    END IF;
  ELSIF NEW."aiDiscountedMinutes" IS DISTINCT FROM OLD."aiDiscountedMinutes" AND NEW."aiDiscountedSeconds" IS NOT DISTINCT FROM OLD."aiDiscountedSeconds" THEN
    NEW."aiDiscountedSeconds" := "ariMinutesToSeconds"(NEW."aiDiscountedMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."programSeconds", 0) = 0 AND COALESCE(NEW."programMinutes", 0) <> 0 THEN
      NEW."programSeconds" := "ariMinutesToSeconds"(NEW."programMinutes");
    END IF;
  ELSIF NEW."programMinutes" IS DISTINCT FROM OLD."programMinutes" AND NEW."programSeconds" IS NOT DISTINCT FROM OLD."programSeconds" THEN
    NEW."programSeconds" := "ariMinutesToSeconds"(NEW."programMinutes");
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ariSecondsFromMinutes" BEFORE INSERT OR UPDATE ON "HoursBreakdown"
  FOR EACH ROW EXECUTE FUNCTION "ariSecondsFromMinutesHoursBreakdown"();

CREATE FUNCTION "ariSecondsFromMinutesSubmissionCollaborator"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."hackatimeSeconds", 0) = 0 AND COALESCE(NEW."hackatimeMinutes", 0) <> 0 THEN
      NEW."hackatimeSeconds" := "ariMinutesToSeconds"(NEW."hackatimeMinutes");
    END IF;
  ELSIF NEW."hackatimeMinutes" IS DISTINCT FROM OLD."hackatimeMinutes" AND NEW."hackatimeSeconds" IS NOT DISTINCT FROM OLD."hackatimeSeconds" THEN
    NEW."hackatimeSeconds" := "ariMinutesToSeconds"(NEW."hackatimeMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."devlogSeconds", 0) = 0 AND COALESCE(NEW."devlogMinutes", 0) <> 0 THEN
      NEW."devlogSeconds" := "ariMinutesToSeconds"(NEW."devlogMinutes");
    END IF;
  ELSIF NEW."devlogMinutes" IS DISTINCT FROM OLD."devlogMinutes" AND NEW."devlogSeconds" IS NOT DISTINCT FROM OLD."devlogSeconds" THEN
    NEW."devlogSeconds" := "ariMinutesToSeconds"(NEW."devlogMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."afterLastCommitSeconds", 0) = 0 AND COALESCE(NEW."afterLastCommitMinutes", 0) <> 0 THEN
      NEW."afterLastCommitSeconds" := "ariMinutesToSeconds"(NEW."afterLastCommitMinutes");
    END IF;
  ELSIF NEW."afterLastCommitMinutes" IS DISTINCT FROM OLD."afterLastCommitMinutes" AND NEW."afterLastCommitSeconds" IS NOT DISTINCT FROM OLD."afterLastCommitSeconds" THEN
    NEW."afterLastCommitSeconds" := "ariMinutesToSeconds"(NEW."afterLastCommitMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."lapseSeconds", 0) = 0 AND COALESCE(NEW."lapseMinutes", 0) <> 0 THEN
      NEW."lapseSeconds" := "ariMinutesToSeconds"(NEW."lapseMinutes");
    END IF;
  ELSIF NEW."lapseMinutes" IS DISTINCT FROM OLD."lapseMinutes" AND NEW."lapseSeconds" IS NOT DISTINCT FROM OLD."lapseSeconds" THEN
    NEW."lapseSeconds" := "ariMinutesToSeconds"(NEW."lapseMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."programSeconds", 0) = 0 AND COALESCE(NEW."programMinutes", 0) <> 0 THEN
      NEW."programSeconds" := "ariMinutesToSeconds"(NEW."programMinutes");
    END IF;
  ELSIF NEW."programMinutes" IS DISTINCT FROM OLD."programMinutes" AND NEW."programSeconds" IS NOT DISTINCT FROM OLD."programSeconds" THEN
    NEW."programSeconds" := "ariMinutesToSeconds"(NEW."programMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."hackatimeProjectSeconds", '{}'::jsonb) = '{}'::jsonb AND jsonb_typeof(NEW."hackatimeProjectMinutes") = 'object' AND NEW."hackatimeProjectMinutes" <> '{}'::jsonb THEN
      NEW."hackatimeProjectSeconds" := "ariMinutesJsonToSeconds"(NEW."hackatimeProjectMinutes");
    END IF;
  ELSIF NEW."hackatimeProjectMinutes" IS DISTINCT FROM OLD."hackatimeProjectMinutes" AND NEW."hackatimeProjectSeconds" IS NOT DISTINCT FROM OLD."hackatimeProjectSeconds" THEN
    NEW."hackatimeProjectSeconds" := CASE WHEN jsonb_typeof(NEW."hackatimeProjectMinutes") = 'object' THEN "ariMinutesJsonToSeconds"(NEW."hackatimeProjectMinutes") ELSE NULL END;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ariSecondsFromMinutes" BEFORE INSERT OR UPDATE ON "SubmissionCollaborator"
  FOR EACH ROW EXECUTE FUNCTION "ariSecondsFromMinutesSubmissionCollaborator"();

CREATE FUNCTION "ariSecondsFromMinutesDevlog"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."seconds", 0) = 0 AND COALESCE(NEW."minutes", 0) <> 0 THEN
      NEW."seconds" := "ariMinutesToSeconds"(NEW."minutes");
    END IF;
  ELSIF NEW."minutes" IS DISTINCT FROM OLD."minutes" AND NEW."seconds" IS NOT DISTINCT FROM OLD."seconds" THEN
    NEW."seconds" := "ariMinutesToSeconds"(NEW."minutes");
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ariSecondsFromMinutes" BEFORE INSERT OR UPDATE ON "Devlog"
  FOR EACH ROW EXECUTE FUNCTION "ariSecondsFromMinutesDevlog"();

CREATE FUNCTION "ariSecondsFromMinutesReview"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."approvedSeconds", 0) = 0 AND COALESCE(NEW."approvedMinutes", 0) <> 0 THEN
      NEW."approvedSeconds" := "ariMinutesToSeconds"(NEW."approvedMinutes");
    END IF;
  ELSIF NEW."approvedMinutes" IS DISTINCT FROM OLD."approvedMinutes" AND NEW."approvedSeconds" IS NOT DISTINCT FROM OLD."approvedSeconds" THEN
    NEW."approvedSeconds" := "ariMinutesToSeconds"(NEW."approvedMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."deflateSeconds", 0) = 0 AND COALESCE(NEW."deflateMinutes", 0) <> 0 THEN
      NEW."deflateSeconds" := "ariMinutesToSeconds"(NEW."deflateMinutes");
    END IF;
  ELSIF NEW."deflateMinutes" IS DISTINCT FROM OLD."deflateMinutes" AND NEW."deflateSeconds" IS NOT DISTINCT FROM OLD."deflateSeconds" THEN
    NEW."deflateSeconds" := "ariMinutesToSeconds"(NEW."deflateMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."collaboratorSeconds", '{}'::jsonb) = '{}'::jsonb AND jsonb_typeof(NEW."collaboratorMinutes") = 'object' AND NEW."collaboratorMinutes" <> '{}'::jsonb THEN
      NEW."collaboratorSeconds" := "ariMinutesJsonToSeconds"(NEW."collaboratorMinutes");
    END IF;
  ELSIF NEW."collaboratorMinutes" IS DISTINCT FROM OLD."collaboratorMinutes" AND NEW."collaboratorSeconds" IS NOT DISTINCT FROM OLD."collaboratorSeconds" THEN
    NEW."collaboratorSeconds" := CASE WHEN jsonb_typeof(NEW."collaboratorMinutes") = 'object' THEN "ariMinutesJsonToSeconds"(NEW."collaboratorMinutes") ELSE '{}'::jsonb END;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."collaboratorDeflatesSeconds", '{}'::jsonb) = '{}'::jsonb AND jsonb_typeof(NEW."collaboratorDeflates") = 'object' AND NEW."collaboratorDeflates" <> '{}'::jsonb THEN
      NEW."collaboratorDeflatesSeconds" := "ariMinutesJsonToSeconds"(NEW."collaboratorDeflates");
    END IF;
  ELSIF NEW."collaboratorDeflates" IS DISTINCT FROM OLD."collaboratorDeflates" AND NEW."collaboratorDeflatesSeconds" IS NOT DISTINCT FROM OLD."collaboratorDeflatesSeconds" THEN
    NEW."collaboratorDeflatesSeconds" := CASE WHEN jsonb_typeof(NEW."collaboratorDeflates") = 'object' THEN "ariMinutesJsonToSeconds"(NEW."collaboratorDeflates") ELSE NULL END;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ariSecondsFromMinutes" BEFORE INSERT OR UPDATE ON "Review"
  FOR EACH ROW EXECUTE FUNCTION "ariSecondsFromMinutesReview"();

CREATE FUNCTION "ariSecondsFromMinutesDraft"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."deflateSeconds", 0) = 0 AND COALESCE(NEW."deflateMinutes", 0) <> 0 THEN
      NEW."deflateSeconds" := "ariMinutesToSeconds"(NEW."deflateMinutes");
    END IF;
  ELSIF NEW."deflateMinutes" IS DISTINCT FROM OLD."deflateMinutes" AND NEW."deflateSeconds" IS NOT DISTINCT FROM OLD."deflateSeconds" THEN
    NEW."deflateSeconds" := "ariMinutesToSeconds"(NEW."deflateMinutes");
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."adjustmentsSeconds", '{}'::jsonb) = '{}'::jsonb AND jsonb_typeof(NEW."adjustments") = 'object' AND NEW."adjustments" <> '{}'::jsonb THEN
      NEW."adjustmentsSeconds" := "ariMinutesJsonToSeconds"(NEW."adjustments");
    END IF;
  ELSIF NEW."adjustments" IS DISTINCT FROM OLD."adjustments" AND NEW."adjustmentsSeconds" IS NOT DISTINCT FROM OLD."adjustmentsSeconds" THEN
    NEW."adjustmentsSeconds" := CASE WHEN jsonb_typeof(NEW."adjustments") = 'object' THEN "ariMinutesJsonToSeconds"(NEW."adjustments") ELSE '{}'::jsonb END;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW."collaboratorDeflatesSeconds", '{}'::jsonb) = '{}'::jsonb AND jsonb_typeof(NEW."collaboratorDeflates") = 'object' AND NEW."collaboratorDeflates" <> '{}'::jsonb THEN
      NEW."collaboratorDeflatesSeconds" := "ariMinutesJsonToSeconds"(NEW."collaboratorDeflates");
    END IF;
  ELSIF NEW."collaboratorDeflates" IS DISTINCT FROM OLD."collaboratorDeflates" AND NEW."collaboratorDeflatesSeconds" IS NOT DISTINCT FROM OLD."collaboratorDeflatesSeconds" THEN
    NEW."collaboratorDeflatesSeconds" := CASE WHEN jsonb_typeof(NEW."collaboratorDeflates") = 'object' THEN "ariMinutesJsonToSeconds"(NEW."collaboratorDeflates") ELSE NULL END;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ariSecondsFromMinutes" BEFORE INSERT OR UPDATE ON "Draft"
  FOR EACH ROW EXECUTE FUNCTION "ariSecondsFromMinutesDraft"();
