-- Drop slack_id (notifications removed).
ALTER TABLE "User" DROP COLUMN "slackId";
ALTER TABLE "Maker" DROP COLUMN "slackId";
