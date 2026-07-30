-- CreateTable
CREATE TABLE "PendingSignup" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "owner_email" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "plan" "TenantPlan" NOT NULL,
    "whatsapp_code_hash" TEXT NOT NULL,
    "whatsapp_code_expires_at" TIMESTAMP(3) NOT NULL,
    "whatsapp_attempts" INTEGER NOT NULL DEFAULT 0,
    "whatsapp_verified_at" TIMESTAMP(3),
    "email_code_hash" TEXT,
    "email_code_expires_at" TIMESTAMP(3),
    "email_attempts" INTEGER NOT NULL DEFAULT 0,
    "email_verified_at" TIMESTAMP(3),
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingSignup_document_idx" ON "PendingSignup"("document");

-- CreateIndex
CREATE INDEX "PendingSignup_expires_at_idx" ON "PendingSignup"("expires_at");

