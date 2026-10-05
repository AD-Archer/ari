-- Where User.name came from. HCA's legal name is never used (it can deadname):
-- SLACK refreshes from the Slack display name at login, PENDING prompts the
-- user once for a preferred name, CUSTOM is user-typed and never overwritten.

CREATE TYPE "NameSource" AS ENUM ('SLACK', 'PENDING', 'CUSTOM');

ALTER TABLE "User" ADD COLUMN "nameSource" "NameSource" NOT NULL DEFAULT 'SLACK';
