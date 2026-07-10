-- CreateTable
CREATE TABLE "SubscriptionStatusLog" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "from_status" "SubscriptionStatus",
    "to_status" "SubscriptionStatus" NOT NULL,
    "changed_by_platform_user_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionStatusLog_subscription_id_idx" ON "SubscriptionStatusLog"("subscription_id");

-- CreateIndex
CREATE INDEX "SubscriptionStatusLog_to_status_idx" ON "SubscriptionStatusLog"("to_status");

-- AddForeignKey
ALTER TABLE "SubscriptionStatusLog" ADD CONSTRAINT "SubscriptionStatusLog_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionStatusLog" ADD CONSTRAINT "SubscriptionStatusLog_changed_by_platform_user_id_fkey" FOREIGN KEY ("changed_by_platform_user_id") REFERENCES "PlatformUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
