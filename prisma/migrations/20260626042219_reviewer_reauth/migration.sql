-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "reviewerReauth" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewerReauthTtlMinutes" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "ReviewerReauth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "reauthAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewerReauth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewerReauth_programId_idx" ON "ReviewerReauth"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewerReauth_userId_programId_key" ON "ReviewerReauth"("userId", "programId");

-- AddForeignKey
ALTER TABLE "ReviewerReauth" ADD CONSTRAINT "ReviewerReauth_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewerReauth" ADD CONSTRAINT "ReviewerReauth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
