-- Program.reviewersChannelId: Slack channel id of the program's designated
-- reviewers channel. Members removed from the program are kicked from it.
ALTER TABLE "Program" ADD COLUMN "reviewersChannelId" TEXT;
