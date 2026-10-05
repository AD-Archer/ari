-- CreateEnum
CREATE TYPE "FraudReviewMethod" AS ENUM ('off', 'gate', 'presecond', 'relay');

-- CreateEnum
CREATE TYPE "FraudCheckStatus" AS ENUM ('pending', 'passed', 'failed');

-- AlterEnum
ALTER TYPE "FlagKind" ADD VALUE 'FRAUD';

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'fraudreview';

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "fraudApiKeyEnc" TEXT,
ADD COLUMN     "fraudApiKeyLast4" TEXT,
ADD COLUMN     "fraudEventId" TEXT,
ADD COLUMN     "fraudReviewMethod" "FraudReviewMethod" NOT NULL DEFAULT 'off';

-- CreateTable
CREATE TABLE "FraudCheck" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "makerId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "joeProjectId" TEXT,
    "trustScore" INTEGER,
    "justification" TEXT,
    "status" "FraudCheckStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FraudCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FraudCheck_programId_status_idx" ON "FraudCheck"("programId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FraudCheck_submissionId_makerId_key" ON "FraudCheck"("submissionId", "makerId");

-- AddForeignKey
ALTER TABLE "FraudCheck" ADD CONSTRAINT "FraudCheck_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudCheck" ADD CONSTRAINT "FraudCheck_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
