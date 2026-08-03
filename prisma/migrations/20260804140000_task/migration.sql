-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('pending', 'completed', 'cancelled');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'task_reminder';

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "remind" BOOLEAN NOT NULL DEFAULT true,
    "status" "TaskStatus" NOT NULL DEFAULT 'pending',
    "created_by" TEXT,
    "reminded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_tenant_id_idx" ON "Task"("tenant_id");

-- CreateIndex
CREATE INDEX "Task_due_date_idx" ON "Task"("due_date");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
