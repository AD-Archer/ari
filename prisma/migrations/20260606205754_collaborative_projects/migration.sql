-- AlterTable
ALTER TABLE "Commit" ADD COLUMN     "authorEmail" TEXT,
ADD COLUMN     "authorName" TEXT,
ADD COLUMN     "makerId" TEXT;

-- AlterTable
ALTER TABLE "Devlog" ADD COLUMN     "makerId" TEXT;

-- AlterTable
ALTER TABLE "ElapsedClip" ADD COLUMN     "makerId" TEXT;

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "collaborative" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "collaboratorMinutes" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "SubmissionCollaborator" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "makerId" TEXT NOT NULL,
    "hackatimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "devlogMinutes" INTEGER NOT NULL DEFAULT 0,
    "afterLastCommitMinutes" INTEGER NOT NULL DEFAULT 0,
    "lapseMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubmissionCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionCollaborator_makerId_idx" ON "SubmissionCollaborator"("makerId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionCollaborator_submissionId_makerId_key" ON "SubmissionCollaborator"("submissionId", "makerId");

-- AddForeignKey
ALTER TABLE "SubmissionCollaborator" ADD CONSTRAINT "SubmissionCollaborator_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "Maker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionCollaborator" ADD CONSTRAINT "SubmissionCollaborator_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devlog" ADD CONSTRAINT "Devlog_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "Maker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElapsedClip" ADD CONSTRAINT "ElapsedClip_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "Maker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
