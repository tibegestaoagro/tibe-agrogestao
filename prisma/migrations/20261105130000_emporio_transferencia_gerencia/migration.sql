-- AlterTable
ALTER TABLE "CashTransfer" ADD COLUMN     "from_manager_establishment_id" TEXT,
ADD COLUMN     "to_manager_establishment_id" TEXT;

-- A transferencia sai e entra numa conta ou na gerencia de uma loja (a gaveta antiga segue valendo para o historico): exatamente um lugar em cada ponta.
ALTER TABLE "CashTransfer" DROP CONSTRAINT "CashTransfer_exactly_one_from";
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_exactly_one_from" CHECK (
    (("from_establishment_id" IS NOT NULL)::int + ("from_bank_account_id" IS NOT NULL)::int + ("from_manager_establishment_id" IS NOT NULL)::int) = 1
);
ALTER TABLE "CashTransfer" DROP CONSTRAINT "CashTransfer_exactly_one_to";
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_exactly_one_to" CHECK (
    (("to_establishment_id" IS NOT NULL)::int + ("to_bank_account_id" IS NOT NULL)::int + ("to_manager_establishment_id" IS NOT NULL)::int) = 1
);
