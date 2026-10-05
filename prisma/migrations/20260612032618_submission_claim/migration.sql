-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedById" TEXT;

-- CreateIndex
CREATE INDEX "Submission_claimedById_idx" ON "Submission"("claimedById");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
