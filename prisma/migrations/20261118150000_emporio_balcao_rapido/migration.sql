-- Frente D do Empório (spec de 18/11/2026): balcão rápido (Q357 a Q361).
-- Código de barras na apresentação (anulável) e as configurações dos atalhos e
-- das etiquetas, todas com padrão: nenhum dado existente muda.

-- AlterTable
ALTER TABLE "EmporioSettings" ADD COLUMN     "label_a4_columns" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "label_a4_gap_x" DECIMAL(6,2) NOT NULL DEFAULT 2.5,
ADD COLUMN     "label_a4_gap_y" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "label_a4_height" DECIMAL(6,2) NOT NULL DEFAULT 38.1,
ADD COLUMN     "label_a4_margin_left" DECIMAL(6,2) NOT NULL DEFAULT 7.2,
ADD COLUMN     "label_a4_margin_top" DECIMAL(6,2) NOT NULL DEFAULT 15.15,
ADD COLUMN     "label_a4_rows" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "label_a4_width" DECIMAL(6,2) NOT NULL DEFAULT 63.5,
ADD COLUMN     "label_default_format" TEXT NOT NULL DEFAULT 'a4',
ADD COLUMN     "label_roll_columns" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "label_roll_gap_x" DECIMAL(6,2) NOT NULL DEFAULT 2,
ADD COLUMN     "label_roll_height" DECIMAL(6,2) NOT NULL DEFAULT 25,
ADD COLUMN     "label_roll_width" DECIMAL(6,2) NOT NULL DEFAULT 40,
ADD COLUMN     "shortcut_close" TEXT NOT NULL DEFAULT 'Ctrl+Enter',
ADD COLUMN     "shortcut_customer" TEXT NOT NULL DEFAULT 'F4',
ADD COLUMN     "shortcut_payment" TEXT NOT NULL DEFAULT 'F9',
ADD COLUMN     "shortcut_product" TEXT NOT NULL DEFAULT 'F2',
ADD COLUMN     "shortcut_seller" TEXT NOT NULL DEFAULT 'F8',
ADD COLUMN     "show_shortcut_legend" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ProductPresentation" ADD COLUMN     "barcode" TEXT;

-- CreateIndex
CREATE INDEX "ProductPresentation_tenant_id_barcode_idx" ON "ProductPresentation"("tenant_id", "barcode");
