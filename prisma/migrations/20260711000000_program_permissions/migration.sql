-- Move program access control from the binary ProgramRole (REVIEWER | ORGANIZER)
-- to a granular per-membership permission set, plus a single per-program POC.
-- Existing organizers are backfilled to the full permission set; reviewers to none.

-- 1. The new permission enum.
CREATE TYPE "ProgramPermission" AS ENUM (
  'MANAGE_SETTINGS',
  'SECOND_PASS',
  'USE_VMS',
  'VIEW_REVIEWED',
  'VIEW_AUDIT_LOG',
  'VIEW_FRAUD',
  'VIEW_REVIEWERS',
  'MANAGE_REVIEWERS',
  'OVERRIDE_DECISIONS'
);

-- 2. New columns (default empty / not-poc so existing rows are valid).
ALTER TABLE "Membership"
  ADD COLUMN "permissions" "ProgramPermission"[] NOT NULL DEFAULT '{}',
  ADD COLUMN "isPoc" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Invite"
  ADD COLUMN "permissions" "ProgramPermission"[] NOT NULL DEFAULT '{}';

-- 3. Backfill: an ORGANIZER held everything, so grant all 9 permissions. A REVIEWER
--    keeps the empty default. No POC is assigned - it's a new concept org admins pick.
UPDATE "Membership"
  SET "permissions" = ARRAY[
    'MANAGE_SETTINGS', 'SECOND_PASS', 'USE_VMS', 'VIEW_REVIEWED', 'VIEW_AUDIT_LOG',
    'VIEW_FRAUD', 'VIEW_REVIEWERS', 'MANAGE_REVIEWERS', 'OVERRIDE_DECISIONS'
  ]::"ProgramPermission"[]
  WHERE "role" = 'ORGANIZER';

UPDATE "Invite"
  SET "permissions" = ARRAY[
    'MANAGE_SETTINGS', 'SECOND_PASS', 'USE_VMS', 'VIEW_REVIEWED', 'VIEW_AUDIT_LOG',
    'VIEW_FRAUD', 'VIEW_REVIEWERS', 'MANAGE_REVIEWERS', 'OVERRIDE_DECISIONS'
  ]::"ProgramPermission"[]
  WHERE "role" = 'ORGANIZER';

-- 4. Drop the old role column and enum.
ALTER TABLE "Membership" DROP COLUMN "role";
ALTER TABLE "Invite" DROP COLUMN "role";
DROP TYPE "ProgramRole";
