-- Dívida 2.14: a âncora da recorrência e a data de conclusão da tarefa.

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "recurrence_anchor" TIMESTAMP(3);

-- Concluída antes desta coluna: o `updated_at` é o melhor que existe, e é o
-- que o histórico do dia já lia. Não piora nada.
UPDATE "Task" SET "completed_at" = "updated_at"
WHERE "status" = 'completed' AND "completed_at" IS NULL;

-- Série que já existia ancora na data atual. A que já derivou (31 virou 28)
-- não tem como recuperar o dia original, e fica no 28 até alguém editar.
UPDATE "Task" SET "recurrence_anchor" = "due_date"
WHERE "recurrence" IS NOT NULL AND "due_date" IS NOT NULL AND "recurrence_anchor" IS NULL;
