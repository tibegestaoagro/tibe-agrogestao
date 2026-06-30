-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('campo', 'fazenda', 'grupo');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('trial', 'active', 'suspended', 'canceled');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('MASTER_ADMIN', 'EQUIPE');

-- CreateEnum
CREATE TYPE "ProfileType" AS ENUM ('fazenda', 'prestador');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'OPERADOR', 'VISUALIZADOR');

-- CreateEnum
CREATE TYPE "AnimalStatus" AS ENUM ('active', 'sold', 'deceased');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('purchase', 'sale', 'transfer', 'death');

-- CreateEnum
CREATE TYPE "CropCycleStatus" AS ENUM ('planted', 'growing', 'harvested');

-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('fertilizer', 'pesticide', 'seed');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('hour', 'day', 'fixed');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('scheduled', 'completed', 'invoiced');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "RelatedModule" AS ENUM ('rebanho', 'lavoura', 'servico', 'geral');

-- CreateEnum
CREATE TYPE "FinancialEntryStatus" AS ENUM ('pending', 'paid', 'overdue');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('vaccine_due', 'harvest_near', 'bill_due', 'low_balance');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('pending', 'sent', 'dismissed');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'overdue', 'canceled');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "plan" "TenantPlan" NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'trial',
    "trial_ends_at" TIMESTAMP(3),
    "lead_source_utm_source" TEXT,
    "lead_source_utm_medium" TEXT,
    "lead_source_utm_campaign" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL DEFAULT 'EQUIPE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantProfile" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "profile_type" "ProfileType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERADOR',
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "area_hectares" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Animal" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "ear_tag" TEXT NOT NULL,
    "breed" TEXT,
    "sex" TEXT,
    "birth_date" TIMESTAMP(3),
    "status" "AnimalStatus" NOT NULL DEFAULT 'active',
    "current_weight" DECIMAL(10,3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalWeightLog" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "weight" DECIMAL(10,3) NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalWeightLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vaccine" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_interval_days" INTEGER,

    CONSTRAINT "Vaccine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalVaccination" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "vaccine_id" TEXT NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL,
    "next_due_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalVaccination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalMovement" (
    "id" TEXT NOT NULL,
    "animal_id" TEXT NOT NULL,
    "movement_type" "MovementType" NOT NULL,
    "from_property_id" TEXT,
    "to_property_id" TEXT,
    "value" DECIMAL(14,2),
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plot" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area_hectares" DECIMAL(12,2),
    "current_crop" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CropCycle" (
    "id" TEXT NOT NULL,
    "plot_id" TEXT NOT NULL,
    "crop_name" TEXT NOT NULL,
    "planted_at" TIMESTAMP(3),
    "expected_harvest_at" TIMESTAMP(3),
    "harvested_at" TIMESTAMP(3),
    "yield_amount" DECIMAL(14,3),
    "yield_unit" TEXT,
    "status" "CropCycleStatus" NOT NULL DEFAULT 'planted',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CropCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlotInput" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "input_type" "InputType" NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(14,3),
    "unit" TEXT,
    "cost" DECIMAL(14,2),
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlotInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceClient" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricing_type" "PricingType" NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_client_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(14,3),
    "total_value" DECIMAL(14,2),
    "performed_at" TIMESTAMP(3),
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEntry" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entry_type" "EntryType" NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "related_module" "RelatedModule" NOT NULL DEFAULT 'geral',
    "related_id" TEXT,
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "status" "FinancialEntryStatus" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppContact" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "user_id" TEXT,
    "last_interaction_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConversationLog" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "whatsapp_contact_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "message_type" TEXT,
    "content" TEXT,
    "intent_detected" TEXT,
    "action_taken" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentConversationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "alert_type" "AlertType" NOT NULL,
    "related_module" "RelatedModule",
    "related_id" TEXT,
    "message" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'pending',
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "asaas_customer_id" TEXT,
    "asaas_subscription_id" TEXT,
    "plan" "TenantPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "next_due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_email_key" ON "PlatformUser"("email");

-- CreateIndex
CREATE INDEX "TenantProfile_tenant_id_idx" ON "TenantProfile"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "TenantProfile_tenant_id_profile_type_key" ON "TenantProfile"("tenant_id", "profile_type");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenant_id_idx" ON "User"("tenant_id");

-- CreateIndex
CREATE INDEX "Property_tenant_id_idx" ON "Property"("tenant_id");

-- CreateIndex
CREATE INDEX "Animal_tenant_id_idx" ON "Animal"("tenant_id");

-- CreateIndex
CREATE INDEX "Animal_property_id_idx" ON "Animal"("property_id");

-- CreateIndex
CREATE INDEX "AnimalWeightLog_animal_id_idx" ON "AnimalWeightLog"("animal_id");

-- CreateIndex
CREATE INDEX "Vaccine_tenant_id_idx" ON "Vaccine"("tenant_id");

-- CreateIndex
CREATE INDEX "AnimalVaccination_animal_id_idx" ON "AnimalVaccination"("animal_id");

-- CreateIndex
CREATE INDEX "AnimalVaccination_vaccine_id_idx" ON "AnimalVaccination"("vaccine_id");

-- CreateIndex
CREATE INDEX "AnimalMovement_animal_id_idx" ON "AnimalMovement"("animal_id");

-- CreateIndex
CREATE INDEX "Plot_tenant_id_idx" ON "Plot"("tenant_id");

-- CreateIndex
CREATE INDEX "Plot_property_id_idx" ON "Plot"("property_id");

-- CreateIndex
CREATE INDEX "CropCycle_plot_id_idx" ON "CropCycle"("plot_id");

-- CreateIndex
CREATE INDEX "PlotInput_cycle_id_idx" ON "PlotInput"("cycle_id");

-- CreateIndex
CREATE INDEX "ServiceClient_tenant_id_idx" ON "ServiceClient"("tenant_id");

-- CreateIndex
CREATE INDEX "Service_tenant_id_idx" ON "Service"("tenant_id");

-- CreateIndex
CREATE INDEX "ServiceOrder_tenant_id_idx" ON "ServiceOrder"("tenant_id");

-- CreateIndex
CREATE INDEX "ServiceOrder_service_client_id_idx" ON "ServiceOrder"("service_client_id");

-- CreateIndex
CREATE INDEX "ServiceOrder_service_id_idx" ON "ServiceOrder"("service_id");

-- CreateIndex
CREATE INDEX "FinancialEntry_tenant_id_idx" ON "FinancialEntry"("tenant_id");

-- CreateIndex
CREATE INDEX "WhatsAppContact_tenant_id_idx" ON "WhatsAppContact"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppContact_tenant_id_phone_key" ON "WhatsAppContact"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "AgentConversationLog_tenant_id_idx" ON "AgentConversationLog"("tenant_id");

-- CreateIndex
CREATE INDEX "AgentConversationLog_whatsapp_contact_id_idx" ON "AgentConversationLog"("whatsapp_contact_id");

-- CreateIndex
CREATE INDEX "Alert_tenant_id_idx" ON "Alert"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenant_id_key" ON "Subscription"("tenant_id");

-- CreateIndex
CREATE INDEX "Subscription_tenant_id_idx" ON "Subscription"("tenant_id");

-- AddForeignKey
ALTER TABLE "TenantProfile" ADD CONSTRAINT "TenantProfile_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalWeightLog" ADD CONSTRAINT "AnimalWeightLog_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vaccine" ADD CONSTRAINT "Vaccine_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalVaccination" ADD CONSTRAINT "AnimalVaccination_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalVaccination" ADD CONSTRAINT "AnimalVaccination_vaccine_id_fkey" FOREIGN KEY ("vaccine_id") REFERENCES "Vaccine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalMovement" ADD CONSTRAINT "AnimalMovement_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalMovement" ADD CONSTRAINT "AnimalMovement_from_property_id_fkey" FOREIGN KEY ("from_property_id") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalMovement" ADD CONSTRAINT "AnimalMovement_to_property_id_fkey" FOREIGN KEY ("to_property_id") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CropCycle" ADD CONSTRAINT "CropCycle_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "Plot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotInput" ADD CONSTRAINT "PlotInput_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "CropCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceClient" ADD CONSTRAINT "ServiceClient_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_service_client_id_fkey" FOREIGN KEY ("service_client_id") REFERENCES "ServiceClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppContact" ADD CONSTRAINT "WhatsAppContact_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppContact" ADD CONSTRAINT "WhatsAppContact_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConversationLog" ADD CONSTRAINT "AgentConversationLog_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConversationLog" ADD CONSTRAINT "AgentConversationLog_whatsapp_contact_id_fkey" FOREIGN KEY ("whatsapp_contact_id") REFERENCES "WhatsAppContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
