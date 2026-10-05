-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "allowVms" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReviewerVm" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "vmid" INTEGER NOT NULL,
    "vmType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "guacUrl" TEXT NOT NULL,
    "rdpUri" TEXT,
    "rdpPasswordEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewerVm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewerVm_reviewerId_idx" ON "ReviewerVm"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewerVm_submissionId_reviewerId_key" ON "ReviewerVm"("submissionId", "reviewerId");

-- AddForeignKey
ALTER TABLE "ReviewerVm" ADD CONSTRAINT "ReviewerVm_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewerVm" ADD CONSTRAINT "ReviewerVm_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewerVm" ADD CONSTRAINT "ReviewerVm_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
