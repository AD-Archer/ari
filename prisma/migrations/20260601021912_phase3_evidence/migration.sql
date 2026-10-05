-- AlterTable
ALTER TABLE "Commit" ADD COLUMN     "codingSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "htSeen" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "HoursBreakdown" ADD COLUMN     "afterLastCommitMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Maker" ADD COLUMN     "slackId" TEXT;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "evidenceSyncedAt" TIMESTAMP(3),
ADD COLUMN     "hackatimeProjects" TEXT[];
