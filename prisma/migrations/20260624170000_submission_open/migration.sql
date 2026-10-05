-- CreateTable
CREATE TABLE "SubmissionOpen" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionOpen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmissionOpen_submissionId_openedAt_idx" ON "SubmissionOpen"("submissionId", "openedAt");

-- CreateIndex
CREATE INDEX "SubmissionOpen_reviewerId_idx" ON "SubmissionOpen"("reviewerId");

-- AddForeignKey
ALTER TABLE "SubmissionOpen" ADD CONSTRAINT "SubmissionOpen_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionOpen" ADD CONSTRAINT "SubmissionOpen_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
