-- external_id now identifies the *project*, not a single ship: a project may be
-- shipped many times (each accepted ship = its own Submission row + version),
-- but never while a prior ship of it is still on queue (pending/review).

-- AlterEnum
ALTER TYPE "WebhookDeliveryStatus" ADD VALUE 'CONFLICT';

-- DropIndex
DROP INDEX "Submission_programId_externalId_key";

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Submission_programId_externalId_idx" ON "Submission"("programId", "externalId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_programId_rawBodySha256_idx" ON "WebhookDelivery"("programId", "rawBodySha256");

-- One open ship per project. Partial unique index - the ingest path checks this
-- invariant in app code, this is the race-proof backstop. Not representable in
-- the Prisma schema DSL (partial indexes are ignored by its diffing).
CREATE UNIQUE INDEX "Submission_open_project_key" ON "Submission"("programId", "externalId")
WHERE "status" IN ('pending', 'review');
