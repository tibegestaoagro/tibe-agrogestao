-- Devolução do dinheiro quando um negócio já pago é cancelado (Módulo 31).
--
-- Lançamento próprio, com a data em que o dinheiro voltou, em vez de apagar a
-- despesa original: o dinheiro saiu num mês e voltou em outro, e o DRE dos dois
-- meses precisa contar essa história como ela aconteceu.
ALTER TYPE "NegotiationEntryRole" ADD VALUE 'estorno';
