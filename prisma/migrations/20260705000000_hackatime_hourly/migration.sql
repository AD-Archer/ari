-- Per-day, per-hour Hackatime coding time for the day-detail card on the review
-- screen. Populated by ari-webhooks enrich alongside hackatimeHeatmap.
ALTER TABLE "HoursBreakdown" ADD COLUMN "hackatimeHourly" JSONB;
