import type {
  Prisma,
  ServiceDirection,
  ServiceJobStatus,
  ServicePricing,
} from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { findOrCreateContact } from "@/lib/actions/contacts";
import { totalDoServico, quantidadeTrabalhada } from "@/lib/mao-de-obra/total-do-servico";
import { decToNum, isoOrNull } from "@/lib/serialize";

/**
 * O serviço contratado de terceiro (Módulo 33, fase 2: §13 a §31 e §34).
 *
 * NENHUM SALDO MORA NO `ServiceJob` (invariante 2). Os três números que o §22
 * pede vêm de fora:
 *
 * | número | de onde vem |
 * |---|---|
 * | total combinado | `fechado`: `agreed_amount`. Senão: soma dos logs vezes `unit_price` |
 * | já pago | soma dos `FinancialEntry` com `status: paid` do serviço |
 * | restante | soma dos `FinancialEntry` com `status: pending` do serviço |
 *
 * ⚠️ **Os três podem divergir, e isso é informação, não defeito.** O produtor
 * pode editar um lançamento em `/financeiro`, e é ali que o dinheiro de verdade
 * mora. A tela mostra os três lado a lado justamente para a divergência
 * aparecer. Nunca "corrija" um pelo outro.
 *
 * O QUE ESTA FASE NÃO ACEITA, e as duas recusas são deliberadas:
 *
 * - `direction: "prestado"`. A fase 34.1 é que abre o caminho da receita, e
 *   aceitá-lo agora criaria dinheiro entrando sem tela para vê-lo.
 * - `machine_id`. Manutenção de máquina é `MachineMaintenance`, que já tem
 *   data, descrição e custo, e já gera lançamento (decisão 10 da spec). Dois
 *   lugares para a mesma coisa é o que a decisão 3 evita.
 */

/**
 * Os 19 serviços do §20, oferecidos na tela como sugestão.
 *
 * `description` continua sendo TEXTO LIVRE: a lista do §20 termina em "Outros",
 * e o documento diz que "o produtor também poderá utilizar uma descrição
 * personalizada quando necessário".
 */
export const SERVICOS_SUGERIDOS = [
  "Construção de cerca",
  "Reforma de cerca",
  "Roçada",
  "Gradagem",
  "Aração",
  "Plantio",
  "Adubação",
  "Calagem",
  "Colheita",
  "Silagem",
  "Transporte",
  "Manutenção de máquina",
  "Serviço veterinário",
  "Vacinação",
  "Inseminação",
  "Construção",
  "Eletricista",
  "Limpeza",
  "Outros",
] as const;

const CATEGORIA = "Serviço terceirizado";

export type ServiceJobInput = {
  property_id: string;
  occurred_at: Date;
  description: string;
  pricing: ServicePricing;
  unit_price?: number | null;
  agreed_amount?: number | null;
  /** Vira o PRIMEIRO `ServiceJobLog`. Ignorado quando a cobrança é `fechado`. */
  quantity?: number | null;
  worker_count?: number | null;
  contact_id?: string | null;
  /** O nome dito, quando não há contato escolhido. Cria o contato. */
  contact_name?: string | null;
  worker_id?: string | null;
  pasture_id?: string | null;
  confinement_stay_id?: string | null;
  milk_site_id?: string | null;
  machine_id?: string | null;
  notes?: string | null;
  /** §21 à vista: o lançamento nasce quitado. */
  pago?: boolean;
  /** §21 futuro: o vencimento da conta a pagar. */
  due_date?: Date | null;
};

export type ServiceJobView = {
  id: string;
  direction: ServiceDirection;
  status: ServiceJobStatus;
  occurred_at: string;
  description: string;
  pricing: ServicePricing;
  unit_price: number | null;
  agreed_amount: number | null;
  worker_count: number;
  quantidade: number;
  total: number;
  pago: number;
  restante: number;
  contact_id: string | null;
  contact_name: string | null;
  worker_id: string | null;
  worker_name: string | null;
  property_id: string;
  pasture_id: string | null;
  confinement_stay_id: string | null;
  milk_site_id: string | null;
  notes: string | null;
  canceled_at: string | null;
};

export type ServiceJobDetailView = ServiceJobView & {
  logs: {
    id: string;
    occurred_at: string;
    quantity: number;
    notes: string | null;
    canceled_at: string | null;
  }[];
  entries: {
    id: string;
    amount: number;
    status: string;
    due_date: string | null;
    paid_at: string | null;
  }[];
};

type LinhaDeServico = Prisma.ServiceJobGetPayload<{
  include: {
    logs: true;
    contact: { select: { name: true } };
    worker: { select: { name: true } };
  };
}>;

type LinhaDeLancamento = {
  id: string;
  amount: Prisma.Decimal;
  status: string;
  due_date: Date | null;
  paid_at: Date | null;
};

function serializar(job: LinhaDeServico, entries: LinhaDeLancamento[]): ServiceJobView {
  const logs = job.logs.map((l) => ({
    quantity: decToNum(l.quantity) ?? 0,
    canceled_at: l.canceled_at,
  }));

  const total = totalDoServico(
    {
      pricing: job.pricing,
      unit_price: decToNum(job.unit_price),
      agreed_amount: decToNum(job.agreed_amount),
      worker_count: job.worker_count,
    },
    logs,
  );

  const soma = (status: string) =>
    entries
      .filter((e) => e.status === status)
      .reduce((s, e) => s + (decToNum(e.amount) ?? 0), 0);

  return {
    id: job.id,
    direction: job.direction,
    status: job.status,
    occurred_at: job.occurred_at.toISOString(),
    description: job.description,
    pricing: job.pricing,
    unit_price: decToNum(job.unit_price),
    agreed_amount: decToNum(job.agreed_amount),
    worker_count: job.worker_count,
    quantidade: quantidadeTrabalhada(logs),
    total,
    pago: soma("paid"),
    restante: soma("pending") + soma("overdue"),
    contact_id: job.contact_id,
    contact_name: job.contact?.name ?? null,
    worker_id: job.worker_id,
    worker_name: job.worker?.name ?? null,
    property_id: job.property_id,
    pasture_id: job.pasture_id,
    confinement_stay_id: job.confinement_stay_id,
    milk_site_id: job.milk_site_id,
    notes: job.notes,
    canceled_at: isoOrNull(job.canceled_at),
  };
}

const INCLUDE = {
  logs: true,
  contact: { select: { name: true } },
  worker: { select: { name: true } },
} as const;

/**
 * A validação do §13 ao §18, em ordem, e SEMPRE com `field`.
 *
 * O `field` é o que faz a mensagem aparecer embaixo do campo em vez de num
 * rodapé genérico.
 */
function validar(input: ServiceJobInput): ActionResult<null> {
  if (!(input.description ?? "").trim()) {
    return fail("VALIDATION_ERROR", "Informe qual serviço foi feito.", 422, "description");
  }

  if (input.machine_id) {
    return fail(
      "VALIDATION_ERROR",
      "Manutenção e serviço com máquina são registrados em Máquinas, na ficha da própria máquina, onde já existe custo e histórico.",
      422,
      "machine_id",
    );
  }

  if (input.pricing === "fechado") {
    const combinado = input.agreed_amount;
    if (combinado === null || combinado === undefined || !Number.isFinite(combinado) || combinado <= 0) {
      return fail(
        "VALIDATION_ERROR",
        "Informe o valor combinado do serviço.",
        422,
        "agreed_amount",
      );
    }
  } else {
    const preco = input.unit_price;
    if (preco === null || preco === undefined || !Number.isFinite(preco) || preco <= 0) {
      return fail(
        "VALIDATION_ERROR",
        "Informe quanto vale cada unidade do serviço.",
        422,
        "unit_price",
      );
    }
    const qtd = input.quantity;
    if (qtd !== null && qtd !== undefined && (!Number.isFinite(qtd) || qtd <= 0)) {
      return fail("VALIDATION_ERROR", "A quantidade precisa ser maior que zero.", 422, "quantity");
    }
  }

  // Pagar à vista e ter vencimento é contradição: o §21 lista "à vista" e
  // "futuro" como caminhos DIFERENTES. Aceitar os dois juntos deixaria uma
  // conta a pagar quitada com data futura, que nenhuma tela sabe mostrar.
  if (input.pago && input.due_date) {
    return fail(
      "VALIDATION_ERROR",
      "Um serviço pago à vista não tem vencimento. Escolha uma coisa ou outra.",
      422,
      "due_date",
    );
  }

  return ok(null);
}

export async function listServiceJobs(
  db: TenantPrismaClient,
  filtro: {
    status?: ServiceJobStatus | null;
    property_id?: string | null;
    contact_id?: string | null;
    incluir_cancelados?: boolean;
  } = {},
): Promise<ServiceJobView[]> {
  const jobs = await db.serviceJob.findMany({
    where: {
      ...(filtro.incluir_cancelados ? {} : { canceled_at: null }),
      ...(filtro.status ? { status: filtro.status } : {}),
      ...(filtro.property_id ? { property_id: filtro.property_id } : {}),
      ...(filtro.contact_id ? { contact_id: filtro.contact_id } : {}),
    },
    include: INCLUDE,
    orderBy: { occurred_at: "desc" },
  });
  if (jobs.length === 0) return [];

  // Uma consulta só para os lançamentos de todos os serviços, não uma por
  // linha: a tela do §38 lista todos, e N+1 aqui seria uma consulta por serviço.
  const entries = await db.financialEntry.findMany({
    where: { related_module: "servico", related_id: { in: jobs.map((j) => j.id) } },
    select: { id: true, amount: true, status: true, due_date: true, paid_at: true, related_id: true },
  });
  const porJob = new Map<string, LinhaDeLancamento[]>();
  for (const e of entries) {
    if (!e.related_id) continue;
    const lista = porJob.get(e.related_id) ?? [];
    lista.push(e);
    porJob.set(e.related_id, lista);
  }

  return jobs.map((j) => serializar(j, porJob.get(j.id) ?? []));
}

export async function createServiceJob(
  db: TenantPrismaClient,
  input: ServiceJobInput,
): Promise<ActionResult<ServiceJobView>> {
  const recusa = validar(input);
  if (!recusa.ok) return recusa;

  const property = await db.property.findUnique({ where: { id: input.property_id } });
  if (!property) return fail("NOT_FOUND", "Fazenda não encontrada.", 404, "property_id");

  const fechado = input.pricing === "fechado";
  const quantidade = fechado ? null : (input.quantity ?? null);

  // TUDO NUMA TRANSAÇÃO: o serviço, o contato criado pelo nome dito, o primeiro
  // log, o lançamento e o compromisso do §24. Uma recusa no meio não pode
  // deixar contato órfão nem serviço sem a conta a pagar que a tela promete.
  const criado = await runSerializableTenantTransaction(db, async (tx) => {
    let contactId = input.contact_id ?? null;
    let contactName: string | null = null;
    if (!contactId && input.contact_name?.trim()) {
      const contato = await findOrCreateContact(tx, input.contact_name);
      contactId = contato.id;
      contactName = contato.name;
    }

    const job = await tx.serviceJob.create({
      data: scoped({
        property_id: input.property_id,
        direction: "contratado" as ServiceDirection,
        status: "concluido" as ServiceJobStatus,
        occurred_at: input.occurred_at,
        description: input.description.trim(),
        pricing: input.pricing,
        unit_price: fechado ? null : (input.unit_price ?? null),
        agreed_amount: fechado ? (input.agreed_amount ?? null) : null,
        worker_count: input.worker_count && input.worker_count > 0 ? input.worker_count : 1,
        contact_id: contactId,
        worker_id: input.worker_id ?? null,
        pasture_id: input.pasture_id ?? null,
        confinement_stay_id: input.confinement_stay_id ?? null,
        milk_site_id: input.milk_site_id ?? null,
        notes: input.notes?.trim() || null,
      }),
    });

    if (quantidade !== null) {
      await tx.serviceJobLog.create({
        data: scoped({
          service_job_id: job.id,
          occurred_at: input.occurred_at,
          quantity: quantidade,
        }),
      });
    }

    const total = totalDoServico(
      {
        pricing: input.pricing,
        unit_price: input.unit_price ?? null,
        agreed_amount: input.agreed_amount ?? null,
        worker_count: input.worker_count && input.worker_count > 0 ? input.worker_count : 1,
      },
      quantidade !== null ? [{ quantity: quantidade, canceled_at: null }] : [],
    );

    if (total > 0) {
      await createLinkedEntry(tx as never, {
        entry_type: "expense",
        category: CATEGORIA,
        amount: total,
        related_module: "servico",
        related_id: job.id,
        occurred_at: input.occurred_at,
        status: input.pago ? "paid" : "pending",
        due_date: input.pago ? null : (input.due_date ?? input.occurred_at),
      });
    }

    /**
     * §24: serviço marcado para o FUTURO vira compromisso no Meu Dia.
     *
     * Só o futuro. A maioria dos serviços é registrada depois do fato, e criar
     * tarefa para todos encheria o Meu Dia de lembretes do que já aconteceu.
     *
     * ⚠️ `Task` não tem `related_id`, então o vínculo é só o texto do título.
     * É limitação conhecida do Módulo 27, não descuido: ligar os dois exigiria
     * mexer naquele model, e o §24 pede que o compromisso "apareça", não que
     * seja navegável.
     */
    if (input.occurred_at.getTime() > Date.now()) {
      const quem = contactName ?? input.contact_name?.trim() ?? "serviço contratado";
      await tx.task.create({
        data: scoped({
          title: `${input.description.trim()}: ${quem}`,
          due_date: input.occurred_at,
          remind: true,
        }),
      });
    }

    return job;
  });

  const completo = await db.serviceJob.findUnique({ where: { id: criado.id }, include: INCLUDE });
  if (!completo) return fail("NOT_FOUND", "Serviço não encontrado.", 404);
  const entries = await db.financialEntry.findMany({
    where: { related_module: "servico", related_id: criado.id },
    select: { id: true, amount: true, status: true, due_date: true, paid_at: true },
  });
  return ok(serializar(completo, entries));
}

export async function getServiceJobDetail(
  db: TenantPrismaClient,
  id: string,
): Promise<ActionResult<ServiceJobDetailView>> {
  const job = await db.serviceJob.findUnique({ where: { id }, include: INCLUDE });
  if (!job) return fail("NOT_FOUND", "Serviço não encontrado.", 404);

  const entries = await db.financialEntry.findMany({
    where: { related_module: "servico", related_id: id },
    orderBy: { created_at: "asc" },
    select: { id: true, amount: true, status: true, due_date: true, paid_at: true },
  });

  return ok({
    ...serializar(job, entries),
    logs: job.logs
      .slice()
      .sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime())
      .map((l) => ({
        id: l.id,
        occurred_at: l.occurred_at.toISOString(),
        quantity: decToNum(l.quantity) ?? 0,
        notes: l.notes,
        canceled_at: isoOrNull(l.canceled_at),
      })),
    entries: entries.map((e) => ({
      id: e.id,
      amount: decToNum(e.amount) ?? 0,
      status: e.status,
      due_date: isoOrNull(e.due_date),
      paid_at: isoOrNull(e.paid_at),
    })),
  });
}
