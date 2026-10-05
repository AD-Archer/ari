-- Backfill for invites stranded as pending: first login used to consume only the
-- OLDEST pending invite, and adding an already-signed-in user by hand never touched
-- their invites, so people who are already inside still showed as "Invited".
-- Mark an invite accepted only when it is already fulfilled - the person signed in
-- AND holds what the invite would have granted. Nothing here grants new access;
-- genuinely pending invites (no matching user/membership) are left untouched.

-- Program-scoped invites whose person already holds a membership in that program.
UPDATE "Invite" i
SET "acceptedAt" = now()
WHERE i."acceptedAt" IS NULL
  AND i."programId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "User" u
    JOIN "Membership" m ON m."userId" = u."id" AND m."programId" = i."programId"
    WHERE lower(u."email") = lower(i."email")
  );

-- Org-level invites (no program) whose person already signed in and already holds
-- every org permission the invite carries.
UPDATE "Invite" i
SET "acceptedAt" = now()
WHERE i."acceptedAt" IS NULL
  AND i."programId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "User" u
    WHERE lower(u."email") = lower(i."email")
      AND u."orgPermissions" @> i."orgPermissions"
  );
