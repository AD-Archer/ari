-- Routing migrated to Program.id (immutable, survives renames); the slug column
-- and its unique index are no longer read anywhere. Drop them.
-- DropIndex
DROP INDEX IF EXISTS "Program_slug_key";

-- AlterTable
ALTER TABLE "Program" DROP COLUMN "slug";
