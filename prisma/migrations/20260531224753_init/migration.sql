-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('MEMBER', 'ORG_ADMIN');

-- CreateEnum
CREATE TYPE "ProgramRole" AS ENUM ('REVIEWER', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Evidence" AS ENUM ('commits', 'elapsed', 'devlog');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('checkbox', 'text', 'number', 'select');

-- CreateEnum
CREATE TYPE "FlagKind" AS ENUM ('DOUBLE_DIP', 'PHANTOM_FILES', 'AUTO_HOLD_60H');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('pending', 'review', 'approved', 'changes', 'rejected');

-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('WARN', 'DANGER');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('approved', 'changes', 'rejected');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('ACCEPTED', 'DUPLICATE', 'BAD_SIGNATURE', 'INVALID');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('APPROVED', 'CHANGES', 'REJECTED', 'WEBHOOK', 'FLAG', 'MEMBER', 'REVERT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slackId" TEXT,
    "avatarColor" TEXT NOT NULL,
    "orgRole" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hackClubUserId" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "orgRole" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "programId" TEXT,
    "role" "ProgramRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "blurb" TEXT,
    "status" "ProgramStatus" NOT NULL DEFAULT 'ACTIVE',
    "accepts" "Evidence"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "role" "ProgramRole" NOT NULL DEFAULT 'REVIEWER',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSecret" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewField" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "label" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "options" TEXT[],

    CONSTRAINT "ReviewField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlagRule" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "kind" "FlagKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,

    CONSTRAINT "FlagRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Maker" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "pronouns" TEXT,
    "slackId" TEXT,
    "hackatimeUserId" TEXT,

    CONSTRAINT "Maker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "makerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "demoUrl" TEXT,
    "claimedHours" INTEGER NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'pending',
    "lang" TEXT,
    "acceptedEvidence" "Evidence"[],
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commit" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "additions" INTEGER NOT NULL,
    "deletions" INTEGER NOT NULL,

    CONSTRAINT "Commit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devlog" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "hasImage" BOOLEAN NOT NULL DEFAULT false,
    "markdown" TEXT NOT NULL,

    CONSTRAINT "Devlog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElapsedClip" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "lengthSeconds" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "url" TEXT,

    CONSTRAINT "ElapsedClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoursBreakdown" (
    "submissionId" TEXT NOT NULL,
    "hackatimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "devlogMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HoursBreakdown_pkey" PRIMARY KEY ("submissionId")
);

-- CreateTable
CREATE TABLE "Flag" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "kind" "FlagKind" NOT NULL,
    "severity" "FlagSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "what" TEXT NOT NULL,
    "matched" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,

    CONSTRAINT "Flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "approvedHours" INTEGER NOT NULL,
    "noteToMaker" TEXT NOT NULL,
    "auditNote" TEXT NOT NULL,
    "fieldValues" JSONB NOT NULL,
    "checklist" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "audit" TEXT NOT NULL,
    "approvedHours" INTEGER NOT NULL,
    "fieldValues" JSONB NOT NULL,
    "checks" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("submissionId","reviewerId")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "WebhookDeliveryStatus" NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "payloadBytes" INTEGER NOT NULL,
    "rawBodySha256" TEXT NOT NULL,
    "errorDetail" TEXT,
    "submissionId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "actorId" TEXT,
    "submissionId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_key" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_hackClubUserId_key" ON "Account"("hackClubUserId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_programId_key" ON "Membership"("userId", "programId");

-- CreateIndex
CREATE INDEX "WebhookSecret_programId_idx" ON "WebhookSecret"("programId");

-- CreateIndex
CREATE INDEX "ChecklistItem_programId_idx" ON "ChecklistItem"("programId");

-- CreateIndex
CREATE INDEX "ReviewField_programId_idx" ON "ReviewField"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "FlagRule_programId_kind_key" ON "FlagRule"("programId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Maker_email_key" ON "Maker"("email");

-- CreateIndex
CREATE INDEX "Submission_programId_status_idx" ON "Submission"("programId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_programId_externalId_key" ON "Submission"("programId", "externalId");

-- CreateIndex
CREATE INDEX "Commit_submissionId_idx" ON "Commit"("submissionId");

-- CreateIndex
CREATE INDEX "Devlog_submissionId_idx" ON "Devlog"("submissionId");

-- CreateIndex
CREATE INDEX "ElapsedClip_submissionId_idx" ON "ElapsedClip"("submissionId");

-- CreateIndex
CREATE INDEX "Flag_submissionId_idx" ON "Flag"("submissionId");

-- CreateIndex
CREATE INDEX "Review_submissionId_idx" ON "Review"("submissionId");

-- CreateIndex
CREATE INDEX "Review_reviewerId_idx" ON "Review"("reviewerId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_programId_receivedAt_idx" ON "WebhookDelivery"("programId", "receivedAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_programId_createdAt_idx" ON "ActivityEvent"("programId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSecret" ADD CONSTRAINT "WebhookSecret_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewField" ADD CONSTRAINT "ReviewField_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlagRule" ADD CONSTRAINT "FlagRule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "Maker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commit" ADD CONSTRAINT "Commit_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devlog" ADD CONSTRAINT "Devlog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElapsedClip" ADD CONSTRAINT "ElapsedClip_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoursBreakdown" ADD CONSTRAINT "HoursBreakdown_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flag" ADD CONSTRAINT "Flag_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
