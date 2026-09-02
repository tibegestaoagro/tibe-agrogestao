import type { WorkerLogKind } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * A anotação sobre um trabalhador: atividade (§12) e ausência (§34).
 *
 * ⚠️ **NADA AQUI CALCULA NADA, e isso é o requisito, não a limitação.** O §12
 * diz que "o objetivo não será controlar cada minuto do trabalhador", e o §34
 * é explícito: o TIBÉ "não deverá calcular automaticamente consequências
 * trabalhistas". Em particular, **uma falta NÃO gera desconto**: descontar
 * seria decidir uma regra trabalhista, que o §35 tira de escopo inteiro e
 * devolve ao contador.
 *
 * Se alguém chegar aqui querendo ligar falta a desconto, ou férias a provisão,
 * o lugar da conversa é a spec, não este arquivo.
 *
 * APAGAR É APAGAR, e é a única exceção do módulo ao "desativar, nunca apagar".
 * Uma anotação errada não é histórico de dinheiro: registrar "folga" no dia
 * errado e não poder corrigir seria pior que perder a linha.
 */

export type WorkerLogInput = {
  worker_id: string;
  kind: WorkerLogKind;
  occurred_at: Date;
  description?: string | null;
  property_id?: string | null;
  pasture_id?: string | null;
};

export type WorkerLogView = {
  id: string;
  kind: WorkerLogKind;
  occurred_at: string;
  description: string | null;
  property_id: string | null;
  pasture_id: string | null;
};

function serializar(l: {
  id: string;
  kind: WorkerLogKind;
  occurred_at: Date;
  description: string | null;
  property_id: string | null;
  pasture_id: string | null;
}): WorkerLogView {
  return {
    id: l.id,
    kind: l.kind,
    occurred_at: l.occurred_at.toISOString(),
    description: l.description,
    property_id: l.property_id,
    pasture_id: l.pasture_id,
  };
}

export async function listWorkerLogs(
  db: TenantPrismaClient,
  workerId: string,
): Promise<WorkerLogView[]> {
  const logs = await db.workerLog.findMany({
    where: { worker_id: workerId },
    orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }],
    take: 200,
  });
  return logs.map(serializar);
}

export async function createWorkerLog(
  db: TenantPrismaClient,
  input: WorkerLogInput,
): Promise<ActionResult<WorkerLogView>> {
  const worker = await db.worker.findUnique({ where: { id: input.worker_id } });
  if (!worker) return fail("NOT_FOUND", "Trabalhador não encontrado.", 404, "worker_id");

  if (Number.isNaN(input.occurred_at.getTime())) {
    return fail("VALIDATION_ERROR", "Informe uma data válida.", 422, "occurred_at");
  }

  // A atividade sem descrição não diz nada: o §12 lista "conserto de cerca,
  // manejo do gado, vacinação". As ausências dispensam, porque o tipo já é a
  // informação inteira.
  if (input.kind === "atividade" && !(input.description ?? "").trim()) {
    return fail("VALIDATION_ERROR", "Descreva a atividade.", 422, "description");
  }

  const log = await db.workerLog.create({
    data: scoped({
      worker_id: input.worker_id,
      kind: input.kind,
      occurred_at: input.occurred_at,
      description: input.description?.trim() || null,
      property_id: input.property_id ?? null,
      pasture_id: input.pasture_id ?? null,
    }),
  });
  return ok(serializar(log));
}

export async function deleteWorkerLog(
  db: TenantPrismaClient,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const log = await db.workerLog.findUnique({ where: { id } });
  if (!log) return fail("NOT_FOUND", "Anotação não encontrada.", 404);

  await db.workerLog.delete({ where: { id } });
  return ok({ id });
}
