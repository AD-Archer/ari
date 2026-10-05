-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "isUpdate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updateMessage" TEXT;
