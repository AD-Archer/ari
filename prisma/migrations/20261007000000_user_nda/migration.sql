-- signed status from the hack club nda api, re-verified in the background once a day
ALTER TABLE "User" ADD COLUMN "ndaSignedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "ndaCheckedAt" TIMESTAMP(3);
