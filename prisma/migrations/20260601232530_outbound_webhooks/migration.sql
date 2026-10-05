-- CreateEnum
CREATE TYPE "OutboundDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "OutboundEndpoint" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "secretEnc" TEXT,
    "last4" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundDelivery" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "submissionId" TEXT,
    "url" TEXT NOT NULL,
    "status" "OutboundDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "httpStatus" INTEGER,
    "errorDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "OutboundDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundEndpoint_programId_key" ON "OutboundEndpoint"("programId");

-- CreateIndex
CREATE INDEX "OutboundDelivery_programId_createdAt_idx" ON "OutboundDelivery"("programId", "createdAt");

-- AddForeignKey
ALTER TABLE "OutboundEndpoint" ADD CONSTRAINT "OutboundEndpoint_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundDelivery" ADD CONSTRAINT "OutboundDelivery_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
