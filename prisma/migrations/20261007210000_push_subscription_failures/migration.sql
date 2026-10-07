-- Dívida 5.0g: falhas de entrega seguidas por inscrição de push. Coluna com
-- default, então as linhas existentes nascem com 0 sem preenchimento.

-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN     "failures" INTEGER NOT NULL DEFAULT 0;
