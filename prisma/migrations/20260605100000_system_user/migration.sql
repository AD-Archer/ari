-- Seed a synthetic system user for automated review decisions (auto-reject).
-- This user is never authenticated; it represents ari's built-in policy checks
-- (inaccessible repository, inaccessible demo). The id is the literal string
-- 'system' - intentionally not a CUID so it can never collide with a real user.
INSERT INTO "User" (id, email, name, "avatarColor", "orgRole", "createdAt", "lastSeenAt")
VALUES (
  'system',
  'system@ari',
  'System',
  '#6b7280',
  'MEMBER'::"OrgRole",
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
