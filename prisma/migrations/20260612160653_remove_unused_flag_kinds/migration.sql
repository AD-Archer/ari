-- Remove the unused PHANTOM_FILES and AUTO_HOLD_60H flag kinds: placeholder
-- options that were never implemented (only DOUBLE_DIP runs). Drop the FlagRule
-- rows holding them first so the enum can be recreated (Flag has no such rows).
DELETE FROM "FlagRule" WHERE "kind" IN ('PHANTOM_FILES', 'AUTO_HOLD_60H');
DELETE FROM "Flag" WHERE "kind" IN ('PHANTOM_FILES', 'AUTO_HOLD_60H');

-- AlterEnum
BEGIN;
CREATE TYPE "FlagKind_new" AS ENUM ('DOUBLE_DIP');
ALTER TABLE "Flag" ALTER COLUMN "kind" TYPE "FlagKind_new" USING ("kind"::text::"FlagKind_new");
ALTER TABLE "FlagRule" ALTER COLUMN "kind" TYPE "FlagKind_new" USING ("kind"::text::"FlagKind_new");
ALTER TYPE "FlagKind" RENAME TO "FlagKind_old";
ALTER TYPE "FlagKind_new" RENAME TO "FlagKind";
DROP TYPE "FlagKind_old";
COMMIT;
