/*
  Warnings:

  - You are about to drop the column `secretHash` on the `WebhookSecret` table. All the data in the column will be lost.
  - Added the required column `secretEnc` to the `WebhookSecret` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WebhookSecret" DROP COLUMN "secretHash",
ADD COLUMN     "secretEnc" TEXT NOT NULL;
