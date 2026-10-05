-- Private internal notes POCs / org admins keep about a reviewer. Org-wide (no
-- programId): any POC or org admin can read/write them from the reviewer profile.

CREATE TABLE "ReviewerNote" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewerNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewerNote_subjectId_createdAt_idx" ON "ReviewerNote"("subjectId", "createdAt");

ALTER TABLE "ReviewerNote" ADD CONSTRAINT "ReviewerNote_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewerNote" ADD CONSTRAINT "ReviewerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
