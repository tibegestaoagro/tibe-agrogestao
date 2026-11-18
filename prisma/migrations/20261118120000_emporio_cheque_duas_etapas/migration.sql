-- Frente C do Empório (spec de 18/11/2026): cheque em duas etapas (Q354 a Q356).
-- Número, banco e bom para podem ficar para depois; nenhum dado existente muda.

-- AlterTable
ALTER TABLE "EmporioCheck" ALTER COLUMN "number" DROP NOT NULL,
ALTER COLUMN "bank" DROP NOT NULL,
ALTER COLUMN "good_for" DROP NOT NULL;
