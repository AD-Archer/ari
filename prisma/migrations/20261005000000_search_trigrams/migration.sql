-- the program search bar ranks ships with word_similarity, which this extension provides.
-- it ships with postgres and is trusted, so the database owner can create it
CREATE EXTENSION IF NOT EXISTS pg_trgm;
