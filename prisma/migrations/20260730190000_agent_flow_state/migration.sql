-- CreateTable
CREATE TABLE "AgentFlowState" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "target_count" INTEGER NOT NULL DEFAULT 1,
    "completed_items" JSONB NOT NULL DEFAULT '[]',
    "current_item" JSONB NOT NULL DEFAULT '{}',
    "pending_field" TEXT,
    "awaiting_summary" BOOLEAN NOT NULL DEFAULT false,
    "reminded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentFlowState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentFlowState_tenant_id_idx" ON "AgentFlowState"("tenant_id");

-- CreateIndex
CREATE INDEX "AgentFlowState_expires_at_idx" ON "AgentFlowState"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "AgentFlowState_tenant_id_user_id_key" ON "AgentFlowState"("tenant_id", "user_id");

-- AddForeignKey
ALTER TABLE "AgentFlowState" ADD CONSTRAINT "AgentFlowState_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentFlowState" ADD CONSTRAINT "AgentFlowState_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

