-- Modulo 38, Meu Dia: a tarefa ganha os campos do §18 e a data vira opcional.
--
-- ⚠️ SEM REVERSAO TRIVIAL. Tornar `due_date` opcional e seguro; voltar a
-- exigi-la depois que existir tarefa sem data falharia no NOT NULL, e as
-- tarefas sem data teriam que ser apagadas ou receber uma data inventada.
--
-- ⚠️ A mudanca de codigo que acompanha esta migracao e obrigatoria:
-- `effectiveStatus` precisa responder "pendente" para `due_date` nulo. Sem
-- isso a primeira tarefa sem data faz a listagem ESTOURAR, e a pagina inteira
-- do Meu Dia cai, nao so a linha dela (provado em 14/09).

-- CreateEnum
CREATE TYPE "TaskRecurrence" AS ENUM ('diaria', 'semanal', 'mensal');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assignee" TEXT,
ADD COLUMN     "due_time" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "priority" "ShoppingPriority" NOT NULL DEFAULT 'normal',
ADD COLUMN     "property_id" TEXT,
ADD COLUMN     "recurrence" "TaskRecurrence",
ADD COLUMN     "worker_id" TEXT,
ALTER COLUMN "due_date" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
