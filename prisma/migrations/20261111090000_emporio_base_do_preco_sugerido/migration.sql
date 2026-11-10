-- CreateEnum
CREATE TYPE "EmporioPriceCostBasis" AS ENUM ('medio', 'ultima_compra', 'maior');

-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "price_cost_basis" "EmporioPriceCostBasis" NOT NULL DEFAULT 'maior';

