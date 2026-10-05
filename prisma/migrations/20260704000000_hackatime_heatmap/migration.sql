-- Per-day, per-project Hackatime coding time for the review-screen activity heatmap.
-- Populated at capture time by ari-webhooks (enrich); NULL for ships captured before this.
ALTER TABLE "HoursBreakdown" ADD COLUMN "hackatimeHeatmap" JSONB;
