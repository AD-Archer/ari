-- New custom-field type: multi-select dropdown. Stores an array of chosen
-- option strings (vs. `select`, which stores one). IF NOT EXISTS keeps the
-- migration idempotent if it gets re-run.
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'multiselect';
