-- Q326: o orçamento leva o frete cobrado do cliente, como a venda (Q244).
ALTER TABLE "EmporioQuote" ADD COLUMN     "freight_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
