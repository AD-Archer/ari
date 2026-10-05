-- Org-level granular permissions replace the binary MEMBER/ORG_ADMIN role.
CREATE TYPE "OrgPermission" AS ENUM ('MANAGE_PROGRAMS', 'MANAGE_PEOPLE', 'GRANT_ORG_PERMS', 'VIEW_WEBHOOK_LOGS', 'MANAGE_MCP', 'VIEW_ALL_PROGRAMS', 'OPERATE_ALL_PROGRAMS');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "orgPermissions" "OrgPermission"[] DEFAULT ARRAY[]::"OrgPermission"[];
ALTER TABLE "Invite" ADD COLUMN     "orgPermissions" "OrgPermission"[] DEFAULT ARRAY[]::"OrgPermission"[];

-- Existing org admins (and pending admin invites) keep everything they could
-- do: seed the full permission set before the role column disappears. Without
-- this, a deployed org would have nobody holding GRANT_ORG_PERMS - a lockout.
UPDATE "User"
  SET "orgPermissions" = ARRAY[
    'MANAGE_PROGRAMS', 'MANAGE_PEOPLE', 'GRANT_ORG_PERMS',
    'VIEW_WEBHOOK_LOGS', 'MANAGE_MCP', 'VIEW_ALL_PROGRAMS', 'OPERATE_ALL_PROGRAMS'
  ]::"OrgPermission"[]
  WHERE "orgRole" = 'ORG_ADMIN';
UPDATE "Invite"
  SET "orgPermissions" = ARRAY[
    'MANAGE_PROGRAMS', 'MANAGE_PEOPLE', 'GRANT_ORG_PERMS',
    'VIEW_WEBHOOK_LOGS', 'MANAGE_MCP', 'VIEW_ALL_PROGRAMS', 'OPERATE_ALL_PROGRAMS'
  ]::"OrgPermission"[]
  WHERE "orgRole" = 'ORG_ADMIN';

-- AlterTable
ALTER TABLE "User" DROP COLUMN "orgRole";
ALTER TABLE "Invite" DROP COLUMN "orgRole";

-- DropEnum
DROP TYPE "OrgRole";
