-- CreateEnum
CREATE TYPE "VariableExpenseKind" AS ENUM ('percentual', 'fixo_por_venda', 'por_unidade', 'embalagem');

-- CreateEnum
CREATE TYPE "FixedSplitKind" AS ENUM ('percentual', 'valor');

-- AlterEnum
ALTER TYPE "CashMovementOrigin" ADD VALUE 'pagamento_despesa';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "sale_variable_expense_id" TEXT;

-- CreateTable
CREATE TABLE "VariableExpenseRule" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "VariableExpenseKind" NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "payment_kind" "EmporioPaymentKind",
    "emporio_product_id" TEXT,
    "presentation_id" TEXT,
    "packaging_emporio_product_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariableExpenseRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleVariableExpense" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "rule_snapshot" JSONB NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "financial_entry_id" TEXT,
    "cost_provisional" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleVariableExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpenseTemplate" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "due_day" INTEGER NOT NULL,
    "split_kind" "FixedSplitKind" NOT NULL,
    "starts_on" DATE NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedExpenseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpenseSplit" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "FixedExpenseSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpenseOccurrence" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "establishment_id" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "financial_entry_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedExpenseOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariableExpenseRule_tenant_id_establishment_id_idx" ON "VariableExpenseRule"("tenant_id", "establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "SaleVariableExpense_financial_entry_id_key" ON "SaleVariableExpense"("financial_entry_id");

-- CreateIndex
CREATE INDEX "SaleVariableExpense_tenant_id_idx" ON "SaleVariableExpense"("tenant_id");

-- CreateIndex
CREATE INDEX "SaleVariableExpense_sale_id_idx" ON "SaleVariableExpense"("sale_id");

-- CreateIndex
CREATE INDEX "FixedExpenseTemplate_tenant_id_idx" ON "FixedExpenseTemplate"("tenant_id");

-- CreateIndex
CREATE INDEX "FixedExpenseSplit_tenant_id_idx" ON "FixedExpenseSplit"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "FixedExpenseSplit_template_id_establishment_id_key" ON "FixedExpenseSplit"("template_id", "establishment_id");

-- CreateIndex
CREATE UNIQUE INDEX "FixedExpenseOccurrence_financial_entry_id_key" ON "FixedExpenseOccurrence"("financial_entry_id");

-- CreateIndex
CREATE INDEX "FixedExpenseOccurrence_tenant_id_establishment_id_period_idx" ON "FixedExpenseOccurrence"("tenant_id", "establishment_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "FixedExpenseOccurrence_template_id_establishment_id_period_key" ON "FixedExpenseOccurrence"("template_id", "establishment_id", "period");

-- AddForeignKey
ALTER TABLE "VariableExpenseRule" ADD CONSTRAINT "VariableExpenseRule_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariableExpenseRule" ADD CONSTRAINT "VariableExpenseRule_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariableExpenseRule" ADD CONSTRAINT "VariableExpenseRule_emporio_product_id_fkey" FOREIGN KEY ("emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariableExpenseRule" ADD CONSTRAINT "VariableExpenseRule_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "ProductPresentation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariableExpenseRule" ADD CONSTRAINT "VariableExpenseRule_packaging_emporio_product_id_fkey" FOREIGN KEY ("packaging_emporio_product_id") REFERENCES "EmporioProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleVariableExpense" ADD CONSTRAINT "SaleVariableExpense_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleVariableExpense" ADD CONSTRAINT "SaleVariableExpense_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "EmporioSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleVariableExpense" ADD CONSTRAINT "SaleVariableExpense_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "VariableExpenseRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleVariableExpense" ADD CONSTRAINT "SaleVariableExpense_financial_entry_id_fkey" FOREIGN KEY ("financial_entry_id") REFERENCES "FinancialEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpenseTemplate" ADD CONSTRAINT "FixedExpenseTemplate_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpenseSplit" ADD CONSTRAINT "FixedExpenseSplit_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpenseSplit" ADD CONSTRAINT "FixedExpenseSplit_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "FixedExpenseTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpenseSplit" ADD CONSTRAINT "FixedExpenseSplit_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpenseOccurrence" ADD CONSTRAINT "FixedExpenseOccurrence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpenseOccurrence" ADD CONSTRAINT "FixedExpenseOccurrence_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "FixedExpenseTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpenseOccurrence" ADD CONSTRAINT "FixedExpenseOccurrence_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpenseOccurrence" ADD CONSTRAINT "FixedExpenseOccurrence_financial_entry_id_fkey" FOREIGN KEY ("financial_entry_id") REFERENCES "FinancialEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sale_variable_expense_id_fkey" FOREIGN KEY ("sale_variable_expense_id") REFERENCES "SaleVariableExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Q100: vencimento de 1 a 31 (no mes curto, o ultimo dia) e valor positivo.
ALTER TABLE "FixedExpenseTemplate" ADD CONSTRAINT "FixedExpenseTemplate_due_day_range" CHECK ("due_day" >= 1 AND "due_day" <= 31);
ALTER TABLE "FixedExpenseTemplate" ADD CONSTRAINT "FixedExpenseTemplate_amount_positive" CHECK ("amount" > 0);

-- Q97: valor da regra nunca negativo.
ALTER TABLE "VariableExpenseRule" ADD CONSTRAINT "VariableExpenseRule_value_nonnegative" CHECK ("value" >= 0);

