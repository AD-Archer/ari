-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'secondpass';

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "secondPass" BOOLEAN NOT NULL DEFAULT false;
