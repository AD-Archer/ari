-- CreateEnum
CREATE TYPE "Track" AS ENUM ('software', 'hardware');

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "tracks" "Track"[] DEFAULT ARRAY['software']::"Track"[];

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "tracks" "Track"[] DEFAULT ARRAY['software']::"Track"[];

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "track" "Track" NOT NULL DEFAULT 'software';

-- CreateIndex
CREATE INDEX "Submission_programId_track_status_idx" ON "Submission"("programId", "track", "status");
