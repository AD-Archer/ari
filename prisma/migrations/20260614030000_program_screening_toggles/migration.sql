-- Per-program toggles for the two ingest screening auto-rejects. On by default,
-- so existing programs keep auto-rejecting on unverified identity / Hackatime ban.
ALTER TABLE "Program" ADD COLUMN     "screenIdentity" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Program" ADD COLUMN     "screenHackatime" BOOLEAN NOT NULL DEFAULT true;
