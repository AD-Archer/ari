-- Program-wide deflation toggle. On by default, preserving the existing behaviour
-- where reviewers/organizers can deflate verified hours. When off, the deflation UI
-- is hidden and the decision/confirm paths settle every ship to its full captured
-- time, ignoring any per-item adjustments or flat deflate amount a client posts.
ALTER TABLE "Program" ADD COLUMN "allowDeflation" BOOLEAN NOT NULL DEFAULT true;
