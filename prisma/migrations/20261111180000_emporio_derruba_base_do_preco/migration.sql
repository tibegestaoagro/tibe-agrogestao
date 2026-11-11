-- Q299: um custo só por produto e loja. A base do preço sugerido (Q294) ficou sem
-- uso no deploy anterior; sai agora que nenhum código no ar a lê.

-- AlterTable
ALTER TABLE "Establishment" DROP COLUMN "price_cost_basis";

-- DropEnum
DROP TYPE "EmporioPriceCostBasis";
