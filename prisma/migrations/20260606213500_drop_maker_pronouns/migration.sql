-- Pronouns are gone from the product entirely (never displayed anywhere now);
-- drop the column rather than carry unused personal data.
ALTER TABLE "Maker" DROP COLUMN "pronouns";
