-- §6.2 e §7.2 do documento de Negociações: peso e arroba, opcionais.
-- Só ADD COLUMN anulável, sem default: não reescreve a tabela.
SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "Negotiation" ADD COLUMN     "arroba_count" DECIMAL(12,2),
ADD COLUMN     "arroba_price" DECIMAL(14,2),
ADD COLUMN     "total_weight_kg" DECIMAL(12,2);
