-- Secret path token for Joe's outcome webhook (POST /api/joe/{token}).
ALTER TABLE "Program" ADD COLUMN "fraudWebhookToken" TEXT;

CREATE UNIQUE INDEX "Program_fraudWebhookToken_key" ON "Program"("fraudWebhookToken");
