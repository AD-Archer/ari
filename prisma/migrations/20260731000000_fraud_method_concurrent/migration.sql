-- Fraud review alongside first pass: checks file at queue entry, the ship stays
-- claimable, and a held decision parks in fraudreview only while checks are open.
ALTER TYPE "FraudReviewMethod" ADD VALUE IF NOT EXISTS 'concurrent';
