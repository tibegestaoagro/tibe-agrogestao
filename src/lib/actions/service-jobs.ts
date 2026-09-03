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

/**
 * Os 21 serviços mecanizados do §5 de Máquinas, oferecidos no `prestado`.
 *
 * ⚠️ NÃO é a lista do §20 da Mão de Obra (`SERVICOS_SUGERIDOS`, acima). Aquela
 * tem "serviço veterinário" e "eletricista", que nenhuma máquina faz; esta tem
 * "subsolagem" e "terraplanagem", que nenhuma diária faz. A tela oferece uma ou
 * outra conforme a direção, e as duas são só sugestão: `description` continua
 * texto livre nas duas pontas, porque as duas listas terminam em "Outro".
 */
export const SERVICOS_MECANIZADOS = [
  "Gradagem",
  "Aração",
  "Subsolagem",
  "Nivelamento",
  "Plantio",
  "Semeadura",
  "Roçada",
  "Pulverização",
  "Adubação",
  "Aplicação de calcário",
  "Distribuição de fertilizante",
  "Colheita",
  "Ensilagem",
  "Corte de forragem",
  "Transporte",
  "Limpeza de área",
  "Abertura de estrada",
  "Manutenção de estrada",
  "Escavação",
  "Terraplanagem",
  "Outro",
] as const;

/**
 * A categoria do lançamento, por direção.
 *
 * Era uma constante até a fase 34.1, quando `prestado` chegou: "Serviço
 * terceirizado" numa RECEITA diria o contrário do que aconteceu, e a categoria
 * é o que o produtor lê no Financeiro.
 */
const categoriaDe = (d: ServiceDirection) =>
  d === "prestado" ? "Serviço prestado" : "Serviço terceirizado";

/**
 * O sinal do dinheiro, por direção. O §28 é literal: serviço prestado gera
 * receita, serviço contratado gera despesa.
 */
const sinalDe = (d: ServiceDirection): "income" | "expense" =>
  d === "prestado" ? "income" : "expense";

export type ServiceJobInput = {
  /** Padrão `contratado`, que é o que a fase 33.2 entregou. */
  direction?: ServiceDirection;
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
  /** §10: onde o serviço aconteceu, quando foi na fazenda do cliente. */
  client_location?: string | null;
  /** §7: grade, arado, plantadeira. Texto livre. */
  implement?: string | null;
  /** §8: o operador cadastrado em Mão de Obra. */
  operator_worker_id?: string | null;
  /** §8: "próprio produtor", "outro", ou o avulso. */
  operator_note?: string | null;
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
  /**
   * Apelidos de `pago` e `restante`, para a tela do prestado não dizer "pago"
   * quando o dinheiro ENTROU. É a mesma soma, derivada uma vez só: o que muda
   * é de quem é o dinheiro, não a conta.
   */
  recebido: number;
  a_receber: number;
  machine_id: string | null;
  machine_name: string | null;
  client_location: string | null;
  implement: string | null;
  operator_worker_id: string | null;
  operator_name: string | null;
  operator_note: string | null;
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
    machine: { select: { name: true } };
    operator: { select: { name: true } };
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

  const pago = soma("paid");
  const restante = soma("pending") + soma("overdue");

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
    pago,
    restante,
    // Os mesmos dois números, com o nome que a tela do prestado usa.
    recebido: pago,
    a_receber: restante,
    machine_id: job.machine_id,
    machine_name: job.machine?.name ?? null,
    client_location: job.client_location,
    implement: job.implement,
    operator_worker_id: job.operator_worker_id,
    operator_name: job.operator?.name ?? null,
    operator_note: job.operator_note,
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
  machine: { select: { name: true } },
  operator: { select: { name: true } },
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

  const direction = input.direction ?? "contratado";

  if (direction === "prestado") {
    // §17: a máquina é obrigatória no serviço prestado, e o §32 depende dela
    // para o histórico ("Trator Massey: 12 horas de gradagem").
    if (!input.machine_id) {
      return fail("VALIDATION_ERROR", "Escolha a máquina que fez o serviço.", 422, "machine_id");
    }
    /**
     * §17 lista o CLIENTE como obrigatório no prestado, e faz sentido: sem ele
     * não há a quem cobrar, e a conta a receber ficaria sem dono.
     *
     * ⚠️ No `contratado` ele continua OPCIONAL, e a mesma coluna com duas
     * exigências é deliberado: o §14 da Mão de Obra descreve "vieram 3 homens
     * trabalhar na cerca" sem nome nenhum, e exigir nos dois quebraria o caso
     * mais comum da fase anterior.
     */
    if (!input.contact_id && !(input.contact_name ?? "").trim()) {
      return fail(
        "VALIDATION_ERROR",
        "Informe para quem o serviço foi feito.",
        422,
        "contact_name",
      );
    }
  } else if (input.machine_id) {
    // A decisão 10 continua valendo para o contratado: manutenção de máquina é
    // `MachineMaintenance`, e a máquina de um terceiro nem está na tabela
    // `Machine` deste produtor, então não poderia ser FK.
    return fail(
      "VALIDATION_ERROR",
      "Manutenção e serviço com máquina de terceiro são registrados em Máquinas, na ficha da própria máquina, onde já existe custo e histórico.",
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

  const direction = input.direction ?? "contratado";

  const property = await db.property.findUnique({ where: { id: input.property_id } });
  if (!property) return fail("NOT_FOUND", "Fazenda não encontrada.", 404, "property_id");

  if (input.machine_id) {
    const machine = await db.machine.findUnique({ where: { id: input.machine_id } });
    if (!machine) return fail("NOT_FOUND", "Máquina não encontrada.", 404, "machine_id");
  }
  if (input.operator_worker_id) {
    const operador = await db.worker.findUnique({ where: { id: input.operator_worker_id } });
    if (!operador) {
      return fail("NOT_FOUND", "Operador não encontrado.", 404, "operator_worker_id");
    }
  }

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
        direction,
        /**
         * O status vem da DATA.
         *
         * Até a fase 33.2 tudo nascia `concluido`, e estava certo quando só
         * existia o `contratado`, que se registra depois do fato. No
         * `prestado` o produtor MARCA antes ("amanhã vou gradear pro João"), e
         * é isso que a agenda do §39 lista. A regra vale para as duas direções:
         * um serviço contratado para a semana que vem também está agendado.
         */
        status: (input.occurred_at.getTime() > Date.now()
          ? "agendado"
          : "concluido") as ServiceJobStatus,
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
        machine_id: input.machine_id ?? null,
        client_location: input.client_location?.trim() || null,
        implement: input.implement?.trim() || null,
        operator_worker_id: input.operator_worker_id ?? null,
        operator_note: input.operator_note?.trim() || null,
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
        entry_type: sinalDe(direction),
        category: categoriaDe(direction),
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

/**
 * Registra um pagamento do serviço (§21 e §22).
 *
 * O DESENHO DO §22, e por que não são as parcelas do Módulo 31: o documento
 * descreve R$ 10.000 combinados, R$ 3.000 adiantados e R$ 7.000 em aberto
 * **sem data**. A regra do §14 do Módulo 31 exige que a soma das parcelas bata
 * exatamente com o valor, então reusá-la recusaria o exemplo literal e
 * obrigaria o produtor a saber de antemão em quantas vezes vai pagar.
 *
 * Aqui: existe UMA conta a pagar, e cada pagamento cria um lançamento quitado e
 * ENCOLHE a pendente pelo mesmo valor. Quando ela chega a zero, é APAGADA: uma
 * conta a pagar de R$ 0,00 na tela do Financeiro seria ruído, e o histórico do
 * que foi pago está nos lançamentos pagos.
 *
 * ⚠️ Pagar mais que o restante é RECUSADO, com a mensagem dizendo quanto falta.
 * Sem isso, um dedo pesado transforma R$ 700 em R$ 7.000 e o serviço fica com
 * saldo negativo, que nenhuma tela deste projeto sabe mostrar.
 */
export async function recordServiceJobPayment(
  db: TenantPrismaClient,
  input: {
    service_job_id: string;
    amount: number;
    paid_at?: Date;
    notes?: string | null;
  },
): Promise<ActionResult<{ pago: number; restante: number }>> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return fail("VALIDATION_ERROR", "Informe um valor maior que zero.", 422, "amount");
  }

  const job = await db.serviceJob.findUnique({ where: { id: input.service_job_id } });
  if (!job) return fail("NOT_FOUND", "Serviço não encontrado.", 404);
  if (job.canceled_at) {
    return fail("CONFLICT", "Este serviço foi cancelado, então não há o que pagar.", 409);
  }

  const pendentes = await db.financialEntry.findMany({
    where: {
      related_module: "servico",
      related_id: job.id,
      status: { in: ["pending", "overdue"] },
    },
    orderBy: { due_date: "asc" },
  });

  const restante = pendentes.reduce((s, e) => s + (decToNum(e.amount) ?? 0), 0);
  if (restante <= 0) {
    return fail("CONFLICT", "Este serviço já está pago por inteiro.", 409);
  }
  if (input.amount > restante) {
    return fail(
      "VALIDATION_ERROR",
      `Faltam ${moeda(restante)} neste serviço, e você informou ${moeda(input.amount)}.`,
      422,
      "amount",
    );
  }

  const quando = input.paid_at ?? new Date();

  await runSerializableTenantTransaction(db, async (tx) => {
    await createLinkedEntry(tx as never, {
      /**
       * ⚠️ A direção é LIDA DO JOB, nunca recebida por parâmetro.
       *
       * Se o chamador pudesse informá-la, um erro dele trocaria o sinal do
       * dinheiro: o serviço mostraria "recebido R$ 3.000" na tela E o DRE
       * registraria uma DESPESA de R$ 3.000. O saldo bateria, e só o
       * demonstrativo estaria errado, que é onde ninguém olha até o fim do ano.
       */
      entry_type: sinalDe(job.direction),
      category: categoriaDe(job.direction),
      amount: input.amount,
      related_module: "servico",
      related_id: job.id,
      occurred_at: quando,
      status: "paid",
    });

    // Encolhe a conta a pagar, da mais próxima para a mais distante. Quando uma
    // zera, ela é apagada: conta a pagar de R$ 0,00 é ruído no Financeiro.
    let aAbater = input.amount;
    for (const pendente of pendentes) {
      if (aAbater <= 0) break;
      const valor = decToNum(pendente.amount) ?? 0;
      if (aAbater >= valor) {
        await tx.financialEntry.delete({ where: { id: pendente.id } });
        aAbater -= valor;
      } else {
        await tx.financialEntry.update({
          where: { id: pendente.id },
          data: { amount: valor - aAbater },
        });
        aAbater = 0;
      }
    }
  });

  const depois = await db.financialEntry.findMany({
    where: { related_module: "servico", related_id: job.id },
    select: { amount: true, status: true },
  });
  const soma = (status: string[]) =>
    depois.filter((e) => status.includes(e.status)).reduce((s, e) => s + (decToNum(e.amount) ?? 0), 0);

  return ok({ pago: soma(["paid"]), restante: soma(["pending", "overdue"]) });
}

/**
 * Cancela o serviço (§17.9 do Módulo 31, aplicado aqui).
 *
 * Apaga os lançamentos PENDENTES, porque um serviço que não aconteceu não pode
 * seguir gerando conta a pagar no DRE dos meses seguintes. E nunca toca nos
 * PAGOS: o dinheiro saiu de verdade, e o §40.8 exige que pagamentos permaneçam
 * registrados. Os logs também ficam: "por que este serviço tinha 20 hectares"
 * precisa ter resposta depois do cancelamento.
 */
export async function cancelServiceJob(
  db: TenantPrismaClient,
  input: { service_job_id: string; reason?: string | null; user_id?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const job = await db.serviceJob.findUnique({ where: { id: input.service_job_id } });
  if (!job) return fail("NOT_FOUND", "Serviço não encontrado.", 404);
  if (job.canceled_at) return fail("CONFLICT", "Este serviço já foi cancelado.", 409);

  await runSerializableTenantTransaction(db, async (tx) => {
    await tx.financialEntry.deleteMany({
      where: {
        related_module: "servico",
        related_id: job.id,
        status: { in: ["pending", "overdue"] },
      },
    });
    await tx.serviceJob.update({
      where: { id: job.id },
      data: {
        canceled_at: new Date(),
        canceled_reason: input.reason?.trim() || null,
        canceled_by_user_id: input.user_id ?? null,
        status: "cancelado",
      },
    });
  });

  return ok({ id: job.id });
}

/**
 * Acrescenta produção a um serviço em andamento (§19 e §20).
 *
 * A CONTA EM ABERTO ACOMPANHA. O §22 mostra o total ao lado do que já foi
 * pago, e um serviço que cresceu de 5 para 16 horas com a conta parada em
 * R$ 750 mostraria "faltam 750" quando faltam 2.400. Por isso o lançamento
 * pendente é ajustado aqui, e não só a quantidade.
 *
 * ⚠️ O `fechado` NÃO aceita log de quantidade: o §16 diz que o valor fechado
 * não exige cálculo por hora ou hectare, e uma quantidade ali não muda o total
 * nem significa nada. Recusar é mais honesto que aceitar e ignorar.
 */
export async function addServiceJobLog(
  db: TenantPrismaClient,
  input: {
    service_job_id: string;
    quantity?: number | null;
    occurred_at?: Date | null;
    notes?: string | null;
    hour_meter_start?: number | null;
    hour_meter_end?: number | null;
  },
): Promise<ActionResult<{ id: string; quantidade: number; total: number; horas: number | null }>> {
  const job = await db.serviceJob.findUnique({
    where: { id: input.service_job_id },
    include: INCLUDE,
  });
  if (!job) return fail("NOT_FOUND", "Serviço não encontrado.", 404);
  if (job.canceled_at) {
    return fail("CONFLICT", "Este serviço foi cancelado, então não há o que lançar.", 409);
  }
  if (job.pricing === "fechado") {
    return fail(
      "CONFLICT",
      "Este serviço foi combinado por valor fechado, então não tem quantidade para lançar.",
      409,
      "quantity",
    );
  }

  /**
   * §33: com o horímetro, a quantidade sai da diferença, e o produtor não
   * precisa fazer a conta. Digitar os dois E a quantidade é contradição, e o
   * silêncio aqui esconderia qual dos dois valeu.
   */
  let horas: number | null = null;
  const inicial = input.hour_meter_start;
  const final = input.hour_meter_end;
  if (inicial !== null && inicial !== undefined && final !== null && final !== undefined) {
    if (!Number.isFinite(inicial) || !Number.isFinite(final)) {
      return fail("VALIDATION_ERROR", "Informe o horímetro com números.", 422, "hour_meter_end");
    }
    if (final <= inicial) {
      return fail(
        "VALIDATION_ERROR",
        "O horímetro final precisa ser maior que o inicial.",
        422,
        "hour_meter_end",
      );
    }
    horas = Math.round((final - inicial) * 10) / 10;
    if (input.quantity !== null && input.quantity !== undefined) {
      return fail(
        "VALIDATION_ERROR",
        "Informe o horímetro OU a quantidade, não os dois: com o horímetro a conta é automática.",
        422,
        "quantity",
      );
    }
  }

  const quantidade = horas ?? input.quantity ?? null;
  if (quantidade === null || !Number.isFinite(quantidade) || quantidade <= 0) {
    return fail("VALIDATION_ERROR", "Informe quanto foi feito.", 422, "quantity");
  }

  const quando = input.occurred_at ?? new Date();

  await runSerializableTenantTransaction(db, async (tx) => {
    await tx.serviceJobLog.create({
      data: scoped({
        service_job_id: job.id,
        occurred_at: quando,
        quantity: quantidade,
        notes: input.notes?.trim() || null,
      }),
    });

    if (horas !== null) {
      await tx.serviceJob.update({
        where: { id: job.id },
        data: { hour_meter_start: inicial, hour_meter_end: final },
      });
      /**
       * Decisão 19: o horímetro final é o número da máquina agora. Ele só
       * ANDA PARA A FRENTE: um serviço lançado fora de ordem não pode fazer o
       * horímetro da máquina voltar, porque o §34 vai comparar esse número com
       * a próxima manutenção prevista.
       */
      if (job.machine_id) {
        const maquina = await tx.machine.findFirst({ where: { id: job.machine_id } });
        const atual = decToNum(maquina?.hour_meter) ?? 0;
        if (final > atual) {
          await tx.machine.update({ where: { id: job.machine_id }, data: { hour_meter: final } });
        }
      }
    }

    // A conta em aberto acompanha o total novo.
    const logs = [
      ...job.logs.map((l) => ({
        quantity: decToNum(l.quantity) ?? 0,
        canceled_at: l.canceled_at,
      })),
      { quantity: quantidade, canceled_at: null as Date | null },
    ];
    const total = totalDoServico(
      {
        pricing: job.pricing,
        unit_price: decToNum(job.unit_price),
        agreed_amount: decToNum(job.agreed_amount),
        worker_count: job.worker_count,
      },
      logs,
    );

    const pendentes = await tx.financialEntry.findMany({
      where: {
        related_module: "servico",
        related_id: job.id,
        status: { in: ["pending", "overdue"] },
      },
      orderBy: { due_date: "asc" },
    });
    const jaPago = (
      await tx.financialEntry.findMany({
        where: { related_module: "servico", related_id: job.id, status: "paid" },
        select: { amount: true },
      })
    ).reduce((s, e) => s + (decToNum(e.amount) ?? 0), 0);

    const emAberto = Math.round((total - jaPago) * 100) / 100;
    if (pendentes.length > 0) {
      // Ajusta a primeira e apaga as outras: o §22 é saldo aberto, não
      // parcelamento (decisão 3 da fase 33.2).
      await tx.financialEntry.update({
        where: { id: pendentes[0].id },
        data: { amount: emAberto },
      });
      for (const extra of pendentes.slice(1)) {
        await tx.financialEntry.delete({ where: { id: extra.id } });
      }
    } else if (emAberto > 0) {
      await createLinkedEntry(tx as never, {
        entry_type: sinalDe(job.direction),
        category: categoriaDe(job.direction),
        amount: emAberto,
        related_module: "servico",
        related_id: job.id,
        occurred_at: quando,
        status: "pending",
      });
    }
  });

  const depois = await getServiceJobDetail(db, job.id);
  if (!depois.ok) return depois;
  return ok({
    id: job.id,
    quantidade: depois.data.quantidade,
    total: depois.data.total,
    horas,
  });
}

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
