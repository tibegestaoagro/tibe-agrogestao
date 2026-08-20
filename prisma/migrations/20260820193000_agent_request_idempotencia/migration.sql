-- CreateTable
CREATE TABLE "AgentRequest" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_message_id" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRequest_tenant_id_idx" ON "AgentRequest"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRequest_tenant_id_provider_message_id_key" ON "AgentRequest"("tenant_id", "provider_message_id");

-- AddForeignKey
ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

