import type { PayFrequency, Prisma, WorkerStatus, WorkerType } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { proximaDataDePagamento } from "@/lib/mao-de-obra/proxima-data";
import { decToNum, isoOrNull } from "@/lib/serialize";

/**
 * Mão de obra fixa (Módulo 33, fase 1: §5 a §11, §33, §35 a §38, §40).
 *
 * NÃO É FOLHA DE PAGAMENTO, e isso é decisão do cliente, não escopo adiado: os
 * §35 e §41 excluem eSocial, FGTS, INSS, férias, 13º, rescisão e ponto, e o §4
 * diz que o produtor "não deverá precisar cadastrar informações trabalhistas
 * complexas para registrar uma pessoa". Se alguém chegar aqui querendo
 * acrescentar cálculo de encargo, o lugar da conversa é a spec, não este
 * arquivo.
 *
 * NENHUM VALOR PAGO OU DEVIDO É GRAVADO NO `Worker` (invariante 2). Todo
 * dinheiro é `FinancialEntry` criado por `createLinkedEntry`, com
 * `related_module: "mao_de_obra"` e `related_id` do trabalhador. É o que faz
 * conta a pagar, parcelamento, alerta `bill_due`, DRE por competência e a
 * quitação pelo painel financeiro funcionarem sem uma linha nova.
 *
 * A PREVISÃO É ROLANTE: existe SEMPRE UMA pendente por trabalhador fixo ativo.
 * Ela nasce no cadastro e a próxima nasce quando o produtor confirma o
 * pagamento, na mesma transação. Não precisa de cron, então não depende do
 * worker da rotina diária, que ainda é pendência de infraestrutura. E casa com
 * o §40.3, que proíbe marcar pagamento automaticamente.
 */

/**
 * As dez funções do §6, oferecidas na tela como sugestão.
 *
 * `role` continua sendo TEXTO LIVRE, não enum: a lista do §6 termina em
 * "Outro", e o documento não pede lista fechada. Um "campeiro de apoio" não
 * pode ser recusado pelo cadastro.
 */
export const FUNCOES_SUGERIDAS = [
  "Vaqueiro",
  "Trabalhador rural",
  "Tratorista",
  "Ordenhador",
  "Gerente",
  "Caseiro",
  "Auxiliar de fazenda",
  "Campeiro",
  "Serviços gerais",
  "Outro",
] as const;

/** A categoria do lançamento previsto. Texto, como todo `category` do projeto. */
const CATEGORIA_FIXA = "Mão de obra fixa";

export type WorkerInput = {
  name: string;
  role: string;
  type: WorkerType;
  pay_frequency?: PayFrequency | null;
  pay_amount?: number | null;
  pay_day?: number | null;
  property_id?: string | null;
  phone?: string | null;
  started_at?: Date | null;
  notes?: string | null;
};

export type WorkerView = {
  id: string;
  name: string;
  role: string;
  type: WorkerType;
  status: WorkerStatus;
  pay_frequency: PayFrequency | null;
  pay_amount: number | null;
  pay_day: number | null;
  property_id: string | null;
  phone: string | null;
  started_at: string | null;
  notes: string | null;
  /** A previsão pendente mais próxima. `null` no eventual e no inativo. */
  proximo_pagamento: { id: string; amount: number; due_date: string } | null;
};

export type WorkerEntryView = {
  id: string;
  kind: string | null;
  amount: number;
  category: string | null;
  due_date: string | null;
  paid_at: string | null;
  status: string;
  notes: string | null;
};

export type WorkerDetailView = WorkerView & { entries: WorkerEntryView[] };

type WorkerRow = {
  id: string;
  name: string;
  role: string;
  type: WorkerType;
  status: WorkerStatus;
  pay_frequency: PayFrequency | null;
  pay_amount: Prisma.Decimal | null;
  pay_day: number | null;
  property_id: string | null;
  phone: string | null;
  started_at: Date | null;
  notes: string | null;
};

function serializar(
  w: WorkerRow,
  previsao: { id: string; amount: Prisma.Decimal; due_date: Date | null } | null,
): WorkerView {
  return {
    id: w.id,
    name: w.name,
    role: w.role,
    type: w.type,
    status: w.status,
    pay_frequency: w.pay_frequency,
    pay_amount: decToNum(w.pay_amount),
    pay_day: w.pay_day,
    property_id: w.property_id,
    phone: w.phone,
    started_at: isoOrNull(w.started_at),
    notes: w.notes,
    proximo_pagamento:
      previsao && previsao.due_date
        ? {
            id: previsao.id,
            amount: decToNum(previsao.amount) ?? 0,
            due_date: previsao.due_date.toISOString(),
          }
        : null,
  };
}

/**
 * A validação do §5, em ordem, e SEMPRE com `field`.
 *
 * O `field` é o que faz a mensagem aparecer embaixo do campo em vez de num
 * rodapé genérico. Recusa sem ele foi o defeito que as 71 rotas tinham até
 * 31/08.
 */
function validar(input: WorkerInput): ActionResult<null> {
  if (!(input.name ?? "").trim()) {
    return fail("VALIDATION_ERROR", "Informe o nome do trabalhador.", 422, "name");
  }
  if (!(input.role ?? "").trim()) {
    return fail("VALIDATION_ERROR", "Informe a função.", 422, "role");
  }
  if (input.type === "fixo") {
    if (!input.pay_frequency) {
      return fail(
        "VALIDATION_ERROR",
        "Escolha de quanto em quanto tempo você paga (mensal, quinzenal, semanal ou diária).",
        422,
        "pay_frequency",
      );
    }
    if (
      input.pay_amount === null ||
      input.pay_amount === undefined ||
      !Number.isFinite(input.pay_amount) ||
      input.pay_amount <= 0
    ) {
      return fail(
        "VALIDATION_ERROR",
        "Informe quanto este trabalhador recebe por período.",
        422,
        "pay_amount",
      );
    }
  }
  const dia = input.pay_day;
  if (dia !== null && dia !== undefined) {
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      return fail(
        "VALIDATION_ERROR",
        "O dia de pagamento precisa estar entre 1 e 31.",
        422,
        "pay_day",
      );
    }
  }
  return ok(null);
}

/** Os campos gravados, já limpos. Um lugar só, para criar e editar não divergirem. */
function dadosDe(input: WorkerInput) {
  const fixo = input.type === "fixo";
  return {
    name: input.name.trim(),
    role: input.role.trim(),
    type: input.type,
    // O eventual não tem frequência nem valor de período: quem paga é a diária
    // do §13, que na fase 33.2 vira um `ServiceJob`. Deixar o valor gravado num
    // eventual faria a previsão rolante nascer para quem não deve tê-la.
    pay_frequency: fixo ? (input.pay_frequency ?? null) : null,
    pay_amount: fixo ? (input.pay_amount ?? null) : null,
    pay_day: fixo ? (input.pay_day ?? null) : null,
    property_id: input.property_id ?? null,
    phone: input.phone?.trim() || null,
    started_at: input.started_at ?? null,
    notes: input.notes?.trim() || null,
  };
}

/** O client mínimo que `garantirPrevisao` precisa: serve ao `db` e ao `tx`. */
type ClientDePrevisao = {
  financialEntry: {
    findFirst(args: Prisma.FinancialEntryFindFirstArgs): Promise<{ id: string } | null>;
    create(args: Prisma.FinancialEntryCreateArgs): Promise<{ id: string }>;
    deleteMany(args: Prisma.FinancialEntryDeleteManyArgs): Promise<{ count: number }>;
  };
};

/**
 * Garante que existe UMA previsão pendente para este trabalhador, e só uma.
 *
 * IDEMPOTENTE de propósito, e é isso que sustenta a regra da previsão rolante.
 * Sem a checagem, um clique duplo no botão de reativar criaria duas contas a
 * pagar para o mesmo mês, e o produtor pagaria o dobro achando que o sistema
 * sabia o que estava fazendo.
 *
 * Só cria para `fixo` e `ativo`: o eventual é pago por diária (§13), e o
 * inativo não deve gerar conta.
 */
async function garantirPrevisao(
  db: ClientDePrevisao,
  worker: {
    id: string;
    type: WorkerType;
    status: WorkerStatus;
    pay_frequency: PayFrequency | null;
    pay_amount: Prisma.Decimal | null;
    pay_day: number | null;
  },
  apartirDe: Date,
): Promise<void> {
  if (worker.type !== "fixo" || worker.status !== "ativo") return;
  if (!worker.pay_frequency) return;
  const valor = decToNum(worker.pay_amount);
  if (valor === null || valor <= 0) return;

  const jaExiste = await db.financialEntry.findFirst({
    where: { related_module: "mao_de_obra", related_id: worker.id, status: "pending" },
  });
  if (jaExiste) return;

  await createLinkedEntry(db as never, {
    entry_type: "expense",
    category: CATEGORIA_FIXA,
    amount: valor,
    related_module: "mao_de_obra",
    related_id: worker.id,
    occurred_at: apartirDe,
    status: "pending",
    due_date: proximaDataDePagamento(worker.pay_frequency, worker.pay_day, apartirDe),
    worker_entry_kind: "pagamento",
  });
}

export async function listWorkers(
  db: TenantPrismaClient,
  filtro: { status?: WorkerStatus | null; property_id?: string | null } = {},
): Promise<WorkerView[]> {
  const workers = await db.worker.findMany({
    where: {
      archived_at: null,
      ...(filtro.status ? { status: filtro.status } : {}),
      ...(filtro.property_id ? { property_id: filtro.property_id } : {}),
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  if (workers.length === 0) return [];

  // Uma consulta só para todas as previsões, não uma por trabalhador: a tela
  // do §38 lista a equipe inteira, e N+1 aqui seria uma consulta por linha.
  const previsoes = await db.financialEntry.findMany({
    where: {
      related_module: "mao_de_obra",
      related_id: { in: workers.map((w) => w.id) },
      status: "pending",
    },
    orderBy: { due_date: "asc" },
    select: { id: true, amount: true, due_date: true, related_id: true },
  });
  const porWorker = new Map<string, (typeof previsoes)[number]>();
  for (const p of previsoes) {
    if (p.related_id && !porWorker.has(p.related_id)) porWorker.set(p.related_id, p);
  }

  return workers.map((w) => serializar(w, porWorker.get(w.id) ?? null));
}

export async function createWorker(
  db: TenantPrismaClient,
  input: WorkerInput,
): Promise<ActionResult<WorkerView>> {
  const recusa = validar(input);
  if (!recusa.ok) return recusa;

  // Tudo numa transação: uma recusa no meio não pode deixar trabalhador sem a
  // previsão que a tela promete, nem previsão sem trabalhador.
  const criado = await runSerializableTenantTransaction(db, async (tx) => {
    const worker = await tx.worker.create({ data: scoped(dadosDe(input)) });
    await garantirPrevisao(tx as unknown as ClientDePrevisao, worker, new Date());
    return worker;
  });

  const previsao = await db.financialEntry.findFirst({
    where: { related_module: "mao_de_obra", related_id: criado.id, status: "pending" },
    orderBy: { due_date: "asc" },
    select: { id: true, amount: true, due_date: true },
  });
  return ok(serializar(criado, previsao));
}

export async function updateWorker(
  db: TenantPrismaClient,
  id: string,
  input: WorkerInput,
): Promise<ActionResult<WorkerView>> {
  const recusa = validar(input);
  if (!recusa.ok) return recusa;

  const atual = await db.worker.findUnique({ where: { id } });
  if (!atual) return fail("NOT_FOUND", "Trabalhador não encontrado.", 404);

  const atualizado = await db.worker.update({ where: { id }, data: dadosDe(input) });

  const previsao = await db.financialEntry.findFirst({
    where: { related_module: "mao_de_obra", related_id: id, status: "pending" },
    orderBy: { due_date: "asc" },
    select: { id: true, amount: true, due_date: true },
  });
  return ok(serializar(atualizado, previsao));
}

/**
 * Ativa ou inativa (§39).
 *
 * Inativar APAGA as previsões PENDENTES e nunca as pagas: o §40.8 exige que
 * pagamentos permaneçam registrados, e um trabalhador que saiu da fazenda não
 * pode continuar gerando conta a pagar no DRE dos meses seguintes.
 *
 * Reativar recria a previsão, uma só.
 */
export async function setWorkerStatus(
  db: TenantPrismaClient,
  id: string,
  status: WorkerStatus,
): Promise<ActionResult<WorkerView>> {
  const atual = await db.worker.findUnique({ where: { id } });
  if (!atual) return fail("NOT_FOUND", "Trabalhador não encontrado.", 404);

  const atualizado = await runSerializableTenantTransaction(db, async (tx) => {
    const w = await tx.worker.update({ where: { id }, data: { status } });
    if (status === "inativo") {
      await tx.financialEntry.deleteMany({
        where: { related_module: "mao_de_obra", related_id: id, status: "pending" },
      });
    } else {
      await garantirPrevisao(tx as unknown as ClientDePrevisao, w, new Date());
    }
    return w;
  });

  const previsao = await db.financialEntry.findFirst({
    where: { related_module: "mao_de_obra", related_id: id, status: "pending" },
    orderBy: { due_date: "asc" },
    select: { id: true, amount: true, due_date: true },
  });
  return ok(serializar(atualizado, previsao));
}

/** Recusa comum aos três caminhos de dinheiro. */
function validarValor(amount: number | null | undefined): ActionResult<null> {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount <= 0) {
    return fail("VALIDATION_ERROR", "Informe um valor maior que zero.", 422, "amount");
  }
  return ok(null);
}

/**
 * Confirma o pagamento previsto (§8).
 *
 * NUNCA INVENTA UM VALOR. Se não houver previsão pendente, recusa: o §40.3 diz
 * que o sistema PREVÊ e o produtor CONFIRMA, e criar um lançamento do nada aqui
 * seria o sistema decidindo que alguém foi pago. Um "paguei o João" sem
 * previsão é conversa a ser esclarecida, não dinheiro a ser gravado.
 *
 * `amount` opcional sobrescreve o previsto, porque o produtor às vezes paga
 * diferente (adiantou parte, descontou uma falta), e o lançamento tem que
 * guardar o valor REAL, não o combinado.
 *
 * A próxima previsão nasce NA MESMA TRANSAÇÃO. Fora dela, um erro entre as duas
 * escritas deixaria o trabalhador sem próxima previsão, e a regra "existe
 * sempre uma" morreria em silêncio até alguém reparar meses depois.
 */
export async function confirmWorkerPayment(
  db: TenantPrismaClient,
  input: { worker_id: string; amount?: number | null; paid_at?: Date; notes?: string | null },
): Promise<ActionResult<{ pago: number; proxima_previsao: string | null }>> {
  if (input.amount !== undefined && input.amount !== null) {
    const recusa = validarValor(input.amount);
    if (!recusa.ok) return recusa;
  }

  const worker = await db.worker.findUnique({ where: { id: input.worker_id } });
  if (!worker) return fail("NOT_FOUND", "Trabalhador não encontrado.", 404);

  const previsao = await db.financialEntry.findFirst({
    where: { related_module: "mao_de_obra", related_id: worker.id, status: "pending" },
    orderBy: { due_date: "asc" },
  });
  if (!previsao) {
    return fail(
      "NOT_FOUND",
      `Não há pagamento previsto para ${worker.name}. Registre um adiantamento ou um pagamento avulso, ou confira se o cadastro tem valor e frequência.`,
      404,
    );
  }

  const quando = input.paid_at ?? new Date();
  const valor = input.amount ?? decToNum(previsao.amount) ?? 0;

  /**
   * A próxima previsão é ancorada no VENCIMENTO da que acabou de ser paga, não
   * na data em que o produtor pagou.
   *
   * Ancorar em "hoje" parece natural e está errado nos dois sentidos, e o teste
   * pegou o primeiro: quem paga no dia 2 a parcela que vencia no dia 5 recebia
   * outra parcela para o MESMO dia 5, porque `proximaDataDePagamento` a partir
   * do dia 2 devolve o dia 5. No sentido oposto, quem paga com 20 dias de
   * atraso pularia um mês inteiro do ciclo.
   *
   * O ciclo de salário é ancorado em vencimento, não em quando o dinheiro saiu.
   */
  const ancora = previsao.due_date ?? quando;

  await runSerializableTenantTransaction(db, async (tx) => {
    await tx.financialEntry.update({
      where: { id: previsao.id },
      data: {
        amount: valor,
        status: "paid",
        paid_at: quando,
        ...(input.notes ? { notes: input.notes } : {}),
      },
    });
    await garantirPrevisao(tx as unknown as ClientDePrevisao, worker, ancora);
  });

  const proxima = await db.financialEntry.findFirst({
    where: { related_module: "mao_de_obra", related_id: worker.id, status: "pending" },
    orderBy: { due_date: "asc" },
    select: { due_date: true },
  });

  return ok({ pago: valor, proxima_previsao: isoOrNull(proxima?.due_date ?? null) });
}

/**
 * Adiantamento (§9): valor pago ANTES da data normal.
 *
 * Lançamento próprio, já quitado, e NÃO mexe na previsão do mês. O §9 pede o
 * adiantamento "mostrado separado do pagamento normal", e abater da previsão
 * faria a conta a pagar do mês encolher sem que ninguém tivesse decidido isso.
 * Quanto o produtor vai descontar no dia 5 é escolha dele, e ele a exerce
 * passando `amount` na confirmação.
 */
export async function recordWorkerAdvance(
  db: TenantPrismaClient,
  input: { worker_id: string; amount: number; occurred_at?: Date; notes?: string | null },
): Promise<ActionResult<{ id: string; amount: number }>> {
  const recusa = validarValor(input.amount);
  if (!recusa.ok) return recusa;

  const worker = await db.worker.findUnique({ where: { id: input.worker_id } });
  if (!worker) return fail("NOT_FOUND", "Trabalhador não encontrado.", 404);

  const quando = input.occurred_at ?? new Date();
  const criado = await createLinkedEntry(db as never, {
    entry_type: "expense",
    category: "Adiantamento",
    amount: input.amount,
    related_module: "mao_de_obra",
    related_id: worker.id,
    occurred_at: quando,
    status: "paid",
    worker_entry_kind: "adiantamento",
  });
  return ok({ id: criado.id, amount: input.amount });
}

/**
 * Os outros pagamentos do §10 (gratificação, bonificação, hora extra) e os
 * gastos relacionados do §11 (alimentação, moradia, transporte).
 *
 * Registra o valor, e SÓ. O §10 é explícito: "o objetivo será apenas registrar
 * o valor, sem realizar cálculos trabalhistas automáticos".
 */
export async function recordWorkerExtra(
  db: TenantPrismaClient,
  input: {
    worker_id: string;
    kind: "gratificacao" | "beneficio" | "outro";
    amount: number;
    category: string;
    occurred_at?: Date;
    notes?: string | null;
  },
): Promise<ActionResult<{ id: string; amount: number }>> {
  const recusa = validarValor(input.amount);
  if (!recusa.ok) return recusa;

  const worker = await db.worker.findUnique({ where: { id: input.worker_id } });
  if (!worker) return fail("NOT_FOUND", "Trabalhador não encontrado.", 404);

  const quando = input.occurred_at ?? new Date();
  const criado = await createLinkedEntry(db as never, {
    entry_type: "expense",
    category: input.category.trim() || "Mão de obra",
    amount: input.amount,
    related_module: "mao_de_obra",
    related_id: worker.id,
    occurred_at: quando,
    status: "paid",
    worker_entry_kind: input.kind,
  });
  return ok({ id: criado.id, amount: input.amount });
}

/**
 * O trabalhador e o histórico dele (§37).
 *
 * Os lançamentos vêm todos, pagos e pendentes, do mais recente para o mais
 * antigo, porque o §37 pede "pagamentos, adiantamentos, atividades" e o §22
 * pede o saldo visível. Quem separa adiantamento de pagamento é
 * `worker_entry_kind`, não a categoria.
 */
export async function getWorkerDetail(
  db: TenantPrismaClient,
  id: string,
): Promise<ActionResult<WorkerDetailView>> {
  const worker = await db.worker.findUnique({ where: { id } });
  if (!worker) return fail("NOT_FOUND", "Trabalhador não encontrado.", 404);

  const lancamentos = await db.financialEntry.findMany({
    where: { related_module: "mao_de_obra", related_id: id },
    orderBy: [{ due_date: "desc" }, { created_at: "desc" }],
    take: 200,
  });

  const previsao = lancamentos.find((e) => e.status === "pending") ?? null;

  return ok({
    ...serializar(
      worker,
      previsao
        ? { id: previsao.id, amount: previsao.amount, due_date: previsao.due_date }
        : null,
    ),
    entries: lancamentos.map((e) => ({
      id: e.id,
      kind: e.worker_entry_kind,
      amount: decToNum(e.amount) ?? 0,
      category: e.category,
      due_date: isoOrNull(e.due_date),
      paid_at: isoOrNull(e.paid_at),
      status: e.status,
      notes: e.notes,
    })),
  });
}
