-- Movimentação passa a registrar QUANTAS cabeças se moveram.
--
-- Buraco encontrado ao implementar o modelo único de lote: sem isto, vender
-- 5 cabeças de um lote de 20 não teria como ser registrado, e a evolução do
-- rebanho não conseguiria subtrair a saída parcial.
--
-- Default 1 porque as linhas existentes vieram do modelo antigo, onde cada
-- movimentação era de exatamente uma cabeça.
ALTER TABLE "AnimalMovement" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
