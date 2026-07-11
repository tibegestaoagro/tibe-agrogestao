-- Config de provider WhatsApp (Evolution/Meta) — global da plataforma.
CREATE TYPE "WhatsAppProvider" AS ENUM ('evolution', 'meta_cloud_api');

CREATE TABLE "WhatsAppProviderConfig" (
    "id" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "credentials_encrypted" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppProviderConfig_provider_key" ON "WhatsAppProviderConfig"("provider");

-- Defesa extra além da transação de ativação: no máximo 1 linha com active=true.
CREATE UNIQUE INDEX "WhatsAppProviderConfig_one_active" ON "WhatsAppProviderConfig"("active") WHERE "active";
