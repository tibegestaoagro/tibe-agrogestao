SET lock_timeout = '5s';

-- Frente 3 do Empório: pedido para entrega. Só acréscimo.
-- CreateEnum
CREATE TYPE "EmporioDeliveryAddressKind" AS ENUM ('principal', 'cadastro_entrega', 'outro');

-- AlterTable
ALTER TABLE "EmporioQuote" ADD COLUMN     "delivery_address_kind" "EmporioDeliveryAddressKind",
ADD COLUMN     "delivery_city" TEXT,
ADD COLUMN     "delivery_complement" TEXT,
ADD COLUMN     "delivery_district" TEXT,
ADD COLUMN     "delivery_number" TEXT,
ADD COLUMN     "delivery_state" TEXT,
ADD COLUMN     "delivery_street" TEXT,
ADD COLUMN     "delivery_zip" TEXT,
ADD COLUMN     "for_delivery" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EmporioSale" ADD COLUMN     "delivery_address_kind" "EmporioDeliveryAddressKind",
ADD COLUMN     "delivery_city" TEXT,
ADD COLUMN     "delivery_complement" TEXT,
ADD COLUMN     "delivery_district" TEXT,
ADD COLUMN     "delivery_number" TEXT,
ADD COLUMN     "delivery_state" TEXT,
ADD COLUMN     "delivery_street" TEXT,
ADD COLUMN     "delivery_zip" TEXT,
ADD COLUMN     "for_delivery" BOOLEAN NOT NULL DEFAULT false;

RESET lock_timeout;
