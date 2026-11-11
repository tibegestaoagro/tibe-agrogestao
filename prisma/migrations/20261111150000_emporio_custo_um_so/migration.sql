-- Q299: um custo só por produto e loja, sem a escolha da base do preço sugerido (desfaz a Q294).

-- AlterTable
ALTER TABLE "Establishment" DROP COLUMN "price_cost_basis";

-- DropEnum
DROP TYPE "EmporioPriceCostBasis";
