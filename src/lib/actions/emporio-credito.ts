import type { Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir, exigirUma, papelDoEmporio, pode } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import {
  diasDeAtraso,
  diasTexto,
  diaUtc,
  LIMITE_MAXIMO_DE_FIADO,
  MENSAGEM_DE_COBRANCA_PADRAO,
  mensagemDeCobranca,
  regraDePrazo,
  sugerirVencimento,
  type RegraDePrazo,
} from "@/lib/emporio/fiado";
import { telefoneParaWhatsApp } from "@/lib/emporio/telefone";
import { fimDoDiaEmSaoPaulo } from "@/lib/dia-calendario";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { dinheiro, registrarNoHistorico, type MudancaDoHistorico } from "@/lib/emporio/historico";
import { entradasAbertas } from "@/lib/actions/emporio-caixa";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";

/**
 * Meu Empório, financeiro, entrega 2: o crédito do fiado de cada cliente (limite, prazo,
 * bloqueio por atraso). O saldo nunca é gravado (invariante 2): é a soma dos lançamentos em
 * aberto, de TODAS as lojas, porque o cliente é um só. Validação em TypeScript puro: o agente
 * do WhatsApp chama estas funções sem passar pelo Zod.
 */

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const reais = (cent: number) => cent / 100;
const dia = (d: Date) => d.toISOString().slice(0, 10);

export type ConfiguracoesDoFiado = {
  fiado_due_days: number;
  fiado_block_after_days: number;
  fiado_default_limit: number | null;
  fiado_collection_message: string | null;
};

const SELECAO_FIADO = {
  fiado_due_days: true,
  fiado_block_after_days: true,
  fiado_default_limit: true,
  fiado_collection_message: true,
} as const;

function paraConfiguracoes(l: {
  fiado_due_days: number;
  fiado_block_after_days: number;
  fiado_default_limit: unknown;
  fiado_collection_message: string | null;
}): ConfiguracoesDoFiado {
  return {
    fiado_due_days: l.fiado_due_days,
    fiado_block_after_days: l.fiado_block_after_days,
    fiado_default_limit: decToNum(l.fiado_default_limit as never) ?? null,
    fiado_collection_message: l.fiado_collection_message,
  };
}

/** As configurações do fiado da conta; cria a linha com os padrões se ainda não existe. */
export async function lerConfiguracoesDoFiado(db: TenantPrismaClient): Promise<ConfiguracoesDoFiado> {
  const l = await db.emporioSettings.findFirst({ select: SELECAO_FIADO });
  if (l) return paraConfiguracoes(l);
  try {
    const criada = await db.emporioSettings.upsert({
      where: scoped({}),
      create: scoped({}),
      update: {},
      select: SELECAO_FIADO,
    });
    return paraConfiguracoes(criada);
  } catch {
    // Outra requisição criou a linha no mesmo instante.
    const outra = await db.emporioSettings.findFirst({ select: SELECAO_FIADO });
    if (outra) return paraConfiguracoes(outra);
    throw new Error("Não foi possível ler as configurações do fiado.");
  }
}

export type EstadoDeCredito = {
  customer: {
    id: string;
    name: string;
    phone: string | null;
    fiado_limit: number | null;
    fiado_due_days: number | null;
    fiado_due_day: number | null;
  };
  settings: ConfiguracoesDoFiado;
  /** O limite que vale: o do cliente, senão o padrão da conta; nulo é sem limite. */
  limit: number | null;
  limit_source: "cliente" | "conta" | null;
  due_rule: RegraDePrazo;
  owed_cent: number;
  overdue_cent: number;
  oldest_overdue: { due_date: Date; days: number } | null;
  by_store: Map<string, { owed_cent: number; overdue_cent: number }>;
  /** Atraso maior que `fiado_block_after_days`. */
  blocked_by_delay: boolean;
  /** Limite menos o que deve (em centavos, pode ser negativo); nulo sem limite. */
  available_cent: number | null;
};

/**
 * O estado de crédito do cliente. O saldo e o atraso são de TODAS as lojas; `lojasVisiveis` só
 * recorta o `by_store` (o que o ator enxerga por loja), nunca o total nem o bloqueio.
 * O chamador garante que o cliente é da conta (lança se não for).
 */
/** O client escopado ou o da transação (a conferência do fiado se repete dentro da gravação da venda). */
export type ClienteOuTransacao = TenantPrismaClient | Prisma.TransactionClient;

export async function estadoDeCredito(
  dbOuTx: ClienteOuTransacao,
  customerId: string,
  /** `semAVenda`: a edição de uma venda (Q249) não deve a si mesma, então o lançamento dela fica fora da dívida e do atraso. */
  opts: { lojasVisiveis?: Set<string> | null; semAVenda?: string | null } = {},
): Promise<EstadoDeCredito> {
  // A transação já é escopada pelo tenant (runSerializableTenantTransaction): o cast só acalma o tipo.
  const db = dbOuTx as TenantPrismaClient;
  const c = await db.emporioCustomer.findFirst({
    where: { id: customerId },
    select: { id: true, name: true, phone: true, fiado_limit: true, fiado_due_days: true, fiado_due_day: true },
  });
  if (!c) throw new Error("Cliente do Empório não encontrado para o cálculo de crédito.");
  const settings = await lerConfiguracoesDoFiado(db);
  const todas = await entradasAbertas(db, { emporio_customer_id: customerId }, { prazoPadraoDias: settings.fiado_due_days });
  const abertas = opts.semAVenda ? todas.filter((e) => e.related_id !== opts.semAVenda) : todas;
  const hoje = hojeEmBrasilia();

  let owed = 0;
  let overdue = 0;
  let oldest: { due_date: Date; days: number } | null = null;
  const porLoja = new Map<string, { owed_cent: number; overdue_cent: number }>();
  for (const e of abertas) {
    const dias = diasDeAtraso(e.effective_due_date, hoje);
    owed += e.open_cent;
    if (dias > 0) {
      overdue += e.open_cent;
      if (!oldest || dias > oldest.days) oldest = { due_date: new Date(diaUtc(e.effective_due_date)), days: dias };
    }
    const loja = e.establishment_id;
    if (loja && (!opts.lojasVisiveis || opts.lojasVisiveis.has(loja))) {
      const acc = porLoja.get(loja) ?? { owed_cent: 0, overdue_cent: 0 };
      acc.owed_cent += e.open_cent;
      if (dias > 0) acc.overdue_cent += e.open_cent;
      porLoja.set(loja, acc);
    }
  }

  // Q280: o boleto aberto e vencido conta nos dias de atraso (e no bloqueio), pelo vencimento dele.
  // Não soma em `owed` nem em `overdue`: o lançamento da venda já está pago, o dinheiro é que ainda não chegou.
  const boletosVencidos = await db.emporioBoleto.findMany({
    where: {
      customer_id: customerId,
      status: "aberto",
      due_on: { lt: hoje },
      ...(opts.semAVenda ? { sale_id: { not: opts.semAVenda } } : {}),
    },
    select: { due_on: true },
  });
  for (const b of boletosVencidos) {
    const dias = diasDeAtraso(b.due_on, hoje);
    if (dias > 0 && (!oldest || dias > oldest.days)) oldest = { due_date: new Date(diaUtc(b.due_on)), days: dias };
  }

  const limiteDoCliente = decToNum(c.fiado_limit as never);
  const limit =limiteDoCliente ?? settings.fiado_default_limit;
  return {
    customer: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      fiado_limit: limiteDoCliente ?? null,
      fiado_due_days: c.fiado_due_days,
      fiado_due_day: c.fiado_due_day,
    },
    settings,
    limit,
    limit_source: limiteDoCliente != null ? "cliente" : settings.fiado_default_limit != null ? "conta" : null,
    due_rule: regraDePrazo(c, settings),
    owed_cent: owed,
    overdue_cent: overdue,
    oldest_overdue: oldest,
    by_store: porLoja,
    blocked_by_delay: oldest !== null && oldest.days > settings.fiado_block_after_days,
    available_cent: limit === null ? null : centavos(limit) - owed,
  };
}

// ---------------------------------------------------------------------------
// A ficha de crédito
// ---------------------------------------------------------------------------

export type CreditoView = {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  phone_whatsapp: string | null;
  /** O que está gravado NO CLIENTE (nulo = vale o padrão da conta): a tela de edição parte daqui. */
  fiado_limit: number | null;
  fiado_due_days: number | null;
  fiado_due_day: number | null;
  status: "em_dia" | "no_limite" | "bloqueado_por_atraso";
  limit: number | null;
  limit_source: "cliente" | "conta" | "nenhum";
  due_rule: RegraDePrazo;
  /** O vencimento que uma venda nova em fiado teria hoje (dia, YYYY-MM-DD). */
  suggested_due_date: string;
  block_after_days: number;
  owed_total: number;
  overdue_total: number;
  available: number | null;
  oldest_overdue: { due_date: string; days: number } | null;
  owed_by_store: { establishment_id: string; establishment_name: string; owed: number; overdue: number }[];
  releases: {
    id: string;
    establishment_id: string;
    establishment_name: string;
    released_by_name: string;
    reason: string;
    valid_until: string;
    consumed_sale_id: string | null;
    consumed_at: string | null;
    created_at: string;
  }[];
  last_charged_at: string | null;
};

/** `lojasVisiveis` recorta só as listas por loja (`owed_by_store`, `releases`); os totais e o bloqueio somam todas. */
async function montarCredito(
  db: TenantPrismaClient,
  estado: EstadoDeCredito,
  lojasVisiveis: Set<string> | null = null,
): Promise<CreditoView> {
  const lojaIds = [...estado.by_store.keys()];
  const liberacoes = await db.emporioCreditRelease.findMany({
    where: { customer_id: estado.customer.id, ...(lojasVisiveis ? { establishment_id: { in: [...lojasVisiveis] } } : {}) },
    orderBy: { created_at: "desc" },
    take: 10,
    include: { released_by: { select: { name: true } }, establishment: { select: { name: true } } },
  });
  const nomes = new Map(
    (await db.establishment.findMany({ where: { id: { in: lojaIds } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]),
  );
  const cobrado = await db.emporioAuditLog.findFirst({
    where: { action: "fiado.cobrar", target_id: estado.customer.id },
    orderBy: { created_at: "desc" },
    select: { created_at: true },
  });

  const status: CreditoView["status"] = estado.blocked_by_delay
    ? "bloqueado_por_atraso"
    : estado.limit !== null && (estado.available_cent ?? 0) <= 0
      ? "no_limite"
      : "em_dia";

  return {
    customer_id: estado.customer.id,
    customer_name: estado.customer.name,
    phone: estado.customer.phone,
    phone_whatsapp: telefoneParaWhatsApp(estado.customer.phone),
    fiado_limit: estado.customer.fiado_limit,
    fiado_due_days: estado.customer.fiado_due_days,
    fiado_due_day: estado.customer.fiado_due_day,
    status,
    limit: estado.limit,
    limit_source: estado.limit_source ?? "nenhum",
    due_rule: estado.due_rule,
    suggested_due_date: dia(sugerirVencimento(estado.due_rule, hojeEmBrasilia())),
    block_after_days: estado.settings.fiado_block_after_days,
    owed_total: reais(estado.owed_cent),
    overdue_total: reais(estado.overdue_cent),
    available: estado.available_cent === null ? null : reais(estado.available_cent),
    oldest_overdue: estado.oldest_overdue ? { due_date: dia(estado.oldest_overdue.due_date), days: estado.oldest_overdue.days } : null,
    owed_by_store: [...estado.by_store.entries()].map(([id, v]) => ({
      establishment_id: id,
      establishment_name: nomes.get(id) ?? "",
      owed: reais(v.owed_cent),
      overdue: reais(v.overdue_cent),
    })),
    releases: liberacoes.map((r) => ({
      id: r.id,
      establishment_id: r.establishment_id,
      establishment_name: r.establishment.name,
      released_by_name: r.released_by.name,
      reason: r.reason,
      valid_until: r.valid_until.toISOString(),
      consumed_sale_id: r.consumed_sale_id,
      consumed_at: r.consumed_at ? r.consumed_at.toISOString() : null,
      created_at: r.created_at.toISOString(),
    })),
    last_charged_at: cobrado ? cobrado.created_at.toISOString() : null,
  };
}

async function carregarEstado(
  db: TenantPrismaClient,
  customerId: unknown,
  lojasVisiveis: Set<string> | null = null,
): Promise<ActionResult<EstadoDeCredito>> {
  const naoAchado = fail("NOT_FOUND", "Cliente não encontrado.", 404, "customer_id");
  if (typeof customerId !== "string" || !customerId) return naoAchado;
  const c = await db.emporioCustomer.findFirst({ where: { id: customerId }, select: { system_key: true } });
  if (!c || c.system_key === "consumidor_final") return naoAchado;
  return ok(await estadoDeCredito(db, customerId, { lojasVisiveis }));
}

export async function lerCreditoDoClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  customerId: string,
): Promise<ActionResult<CreditoView>> {
  const neg = await exigirUma(db, ator, ["vendedor_da_loja", "dinheiro"], "ver o crédito do cliente");
  if (neg) return neg;
  // Quem não mexe no dinheiro (o Vendedor e o Gestor) vê por loja só as lojas dele.
  const papel = await papelDoEmporio(db, ator);
  const visiveis = pode(papel, "dinheiro") ? null : await lojasDoAtor(db, ator);
  const estado = await carregarEstado(db, customerId, visiveis);
  if (!estado.ok) return estado;
  return ok(await montarCredito(db, estado.data, visiveis));
}

export type DefinirCreditoInput = {
  fiado_limit?: number | null;
  fiado_due_days?: number | null;
  fiado_due_day?: number | null;
};

const textoDoPrazo = (dias: number | null, diaDoMes: number | null) =>
  diaDoMes != null ? `todo dia ${diaDoMes}` : dias != null ? diasTexto(dias) : "o padrão da conta";

/** Limite e prazo do fiado de UM cliente. Chave ausente mantém; nulo limpa (volta ao padrão da conta). */
export async function definirCreditoDoClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  customerId: string,
  input: DefinirCreditoInput,
): Promise<ActionResult<CreditoView>> {
  const neg = await exigir(db, ator, "dinheiro", "mudar o crédito do cliente");
  if (neg) return neg;
  const existe = await carregarEstado(db, customerId);
  if (!existe.ok) return existe;
  const id = existe.data.customer.id;

  const dados: Record<string, unknown> = {};
  if (input.fiado_limit !== undefined) {
    const v = input.fiado_limit;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > LIMITE_MAXIMO_DE_FIADO)) {
      return fail("VALIDATION_ERROR", "O limite deve ser de zero a R$ 99.999.999,99.", 422, "fiado_limit");
    }
    dados.fiado_limit = v === null ? null : centavos(v) / 100;
  }
  if (input.fiado_due_days !== undefined) {
    const v = input.fiado_due_days;
    if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 365)) {
      return fail("VALIDATION_ERROR", "O prazo deve ser de 1 a 365 dias.", 422, "fiado_due_days");
    }
    dados.fiado_due_days = v;
  }
  if (input.fiado_due_day !== undefined) {
    const v = input.fiado_due_day;
    if (v !== null && (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 31)) {
      return fail("VALIDATION_ERROR", "O dia do mês deve ser de 1 a 31.", 422, "fiado_due_day");
    }
    dados.fiado_due_day = v;
  }
  // O "antes", a exclusão mútua e a gravação ficam na MESMA transação serializável: dois PATCH
  // simultâneos (um com dias, outro com dia fixo) não podem gravar os dois juntos.
  const recusa = await runSerializableTenantTransaction(db, async (tx) => {
    const c = await tx.emporioCustomer.findFirst({
      where: { id },
      select: { id: true, name: true, fiado_limit: true, fiado_due_days: true, fiado_due_day: true },
    });
    if (!c) return fail("NOT_FOUND", "Cliente não encontrado.", 404, "customer_id");
    const antes = {
      id: c.id,
      name: c.name,
      fiado_limit: decToNum(c.fiado_limit as never) ?? null,
      fiado_due_days: c.fiado_due_days,
      fiado_due_day: c.fiado_due_day,
    };
    // Os dois juntos não valem: confere o resultado, não só o corpo.
    const diasDepois = "fiado_due_days" in dados ? (dados.fiado_due_days as number | null) : antes.fiado_due_days;
    const diaDepois = "fiado_due_day" in dados ? (dados.fiado_due_day as number | null) : antes.fiado_due_day;
    if (diasDepois != null && diaDepois != null) {
      return fail("VALIDATION_ERROR", "Escolha o prazo em dias ou o dia fixo do mês, não os dois.", 422, "fiado_due_day");
    }

    const limiteDepois = "fiado_limit" in dados ? (dados.fiado_limit as number | null) : antes.fiado_limit;
    const mudouLimite = (limiteDepois ?? null) !== (antes.fiado_limit ?? null);
    const mudouPrazo = (diasDepois ?? null) !== (antes.fiado_due_days ?? null) || (diaDepois ?? null) !== (antes.fiado_due_day ?? null);

    if (mudouLimite || mudouPrazo) {
      await tx.emporioCustomer.update({ where: { id: antes.id }, data: dados });
      const alvo = { target_type: "cliente", target_id: antes.id } as const;
      if (mudouLimite) {
        const mudancas: MudancaDoHistorico[] = [
          {
            campo: "Limite de fiado",
            antes: antes.fiado_limit === null ? null : dinheiro(antes.fiado_limit),
            depois: limiteDepois === null ? null : dinheiro(limiteDepois),
          },
        ];
        await registrarNoHistorico(tx, ator, {
          action: "fiado.limite",
          ...alvo,
          summary: `Mudou o limite de fiado de ${antes.name}`,
          changes: mudancas,
        });
      }
      if (mudouPrazo) {
        await registrarNoHistorico(tx, ator, {
          action: "fiado.prazo",
          ...alvo,
          summary: `Mudou o prazo de fiado de ${antes.name}`,
          changes: [
            {
              campo: "Prazo do fiado",
              antes: textoDoPrazo(antes.fiado_due_days, antes.fiado_due_day),
              depois: textoDoPrazo(diasDepois ?? null, diaDepois ?? null),
            },
          ],
        });
      }
    }
    return null;
  });
  if (recusa) return recusa;
  const depois = await carregarEstado(db, customerId);
  if (!depois.ok) return depois;
  return ok(await montarCredito(db, depois.data));
}

// ---------------------------------------------------------------------------
// A liberação pontual do Gestor
// ---------------------------------------------------------------------------

export type LiberacaoView = {
  id: string;
  customer_id: string;
  establishment_id: string;
  establishment_name: string;
  released_by_name: string;
  reason: string;
  valid_until: string;
  consumed_sale_id: string | null;
  created_at: string;
};

/**
 * A liberação que vale agora para o cliente NESTA loja: não consumida e dentro da validade.
 * Vale só na loja em que foi criada (a da venda).
 */
export async function liberacaoValida(
  dbOuTx: ClienteOuTransacao,
  customerId: string,
  establishmentId: string,
  agora: Date,
): Promise<{ id: string } | null> {
  return (dbOuTx as TenantPrismaClient).emporioCreditRelease.findFirst({
    where: {
      customer_id: customerId,
      establishment_id: establishmentId,
      consumed_sale_id: null,
      valid_until: { gte: agora },
    },
    select: { id: true },
  });
}

/** `operation_key` é aceita pelo contrato, mas a liberação não a grava: a unicidade é "uma válida por cliente e loja". */
export type LiberarFiadoInput = { establishment_id: string; reason: string; operation_key?: string };

/** O Gestor da loja (ou o Dono e o Gerente geral) libera UMA venda em fiado de cliente bloqueado, até o fim do dia. */
export async function liberarFiadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  customerId: string,
  input: LiberarFiadoInput,
): Promise<ActionResult<LiberacaoView>> {
  const lojaId = typeof input?.establishment_id === "string" ? input.establishment_id.trim() : "";
  if (!lojaId) return fail("VALIDATION_ERROR", "Escolha a loja da liberação.", 422, "establishment_id");
  const neg = await exigir(db, ator, "gestor_da_loja", "liberar fiado", lojaId);
  if (neg) return neg;

  const motivo = typeof input.reason === "string" ? input.reason.trim() : "";
  if (motivo.length < 3 || motivo.length > 300) {
    return fail("VALIDATION_ERROR", "Diga o motivo da liberação, de 3 a 300 caracteres.", 422, "reason");
  }
  const cliente = await carregarEstado(db, customerId);
  if (!cliente.ok) return cliente;
  const loja = await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true } });
  if (!loja) return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");

  const agora = new Date();
  // A conferência e a criação ficam na MESMA transação serializável: dois toques simultâneos
  // no botão não podem criar duas liberações válidas para o mesmo cliente e loja.
  const criada = await runSerializableTenantTransaction(db, async (tx) => {
    if (await liberacaoValida(tx as unknown as TenantPrismaClient, cliente.data.customer.id, lojaId, agora)) {
      return fail("LIBERACAO_JA_EXISTE", "Este cliente já tem uma liberação válida hoje nesta loja.", 409, "establishment_id");
    }
    const r = await tx.emporioCreditRelease.create({
      data: scoped({
        customer_id: cliente.data.customer.id,
        establishment_id: lojaId,
        released_by_user_id: ator.id,
        reason: motivo,
        valid_until: fimDoDiaEmSaoPaulo(agora),
      }),
      include: { released_by: { select: { name: true } }, establishment: { select: { name: true } } },
    });
    await registrarNoHistorico(tx, ator, {
      action: "fiado.liberar",
      establishment_id: lojaId,
      target_type: "cliente",
      target_id: cliente.data.customer.id,
      summary: `Liberou fiado para ${cliente.data.customer.name}: ${motivo}`,
    });
    return r;
  });
  if ("ok" in criada) return criada;
  return ok({
    id: criada.id,
    customer_id: criada.customer_id,
    establishment_id: criada.establishment_id,
    establishment_name: criada.establishment.name,
    released_by_name: criada.released_by.name,
    reason: criada.reason,
    valid_until: criada.valid_until.toISOString(),
    consumed_sale_id: criada.consumed_sale_id,
    created_at: criada.created_at.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// A cobrança do fiado vencido
// ---------------------------------------------------------------------------

export const FAIXAS_DE_COBRANCA = ["1-15", "16-30", "31-60", "60+"] as const;
export type FaixaDeCobranca = (typeof FAIXAS_DE_COBRANCA)[number];

const naFaixa = (dias: number, faixa: FaixaDeCobranca) =>
  faixa === "1-15"
    ? dias >= 1 && dias <= 15
    : faixa === "16-30"
      ? dias >= 16 && dias <= 30
      : faixa === "31-60"
        ? dias >= 31 && dias <= 60
        : dias > 60;

export type CobrancaView = {
  /** O modelo que vale: o da conta, senão o padrão. */
  message_template: string;
  customers: {
    customer_id: string;
    customer_name: string;
    phone: string | null;
    phone_whatsapp: string | null;
    whatsapp_url: string | null;
    message: string;
    overdue_total: number;
    oldest_days: number;
    stores: { establishment_id: string; establishment_name: string; overdue: number }[];
    last_charged_at: string | null;
  }[];
};

/** O fiado vencido de quem tem atraso, do mais atrasado ao menos, com a mensagem e o link do WhatsApp prontos. */
export async function listarCobrancaAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; faixa?: FaixaDeCobranca } = {},
): Promise<ActionResult<CobrancaView>> {
  const neg = await exigir(db, ator, "dinheiro", "ver a cobrança do fiado");
  if (neg) return neg;
  if (opts.faixa !== undefined && !FAIXAS_DE_COBRANCA.includes(opts.faixa)) {
    return fail("VALIDATION_ERROR", "Escolha uma faixa de atraso válida.", 422, "faixa");
  }
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }

  const settings = await lerConfiguracoesDoFiado(db);
  const abertas = await entradasAbertas(
    db,
    {
      emporio_customer_id: { not: null },
      ...(opts.establishment_id
        ? { establishment_id: opts.establishment_id }
        : visiveis
          ? { establishment_id: { in: [...visiveis] } }
          : {}),
    },
    { prazoPadraoDias: settings.fiado_due_days },
  );
  const hoje = hojeEmBrasilia();

  type Acc = { overdue_cent: number; oldest_days: number; oldest_store: string | null; stores: Map<string, number> };
  const porCliente = new Map<string, Acc>();
  for (const e of abertas) {
    const dias = diasDeAtraso(e.effective_due_date, hoje);
    if (dias <= 0 || !e.emporio_customer_id) continue;
    const acc = porCliente.get(e.emporio_customer_id) ?? { overdue_cent: 0, oldest_days: 0, oldest_store: null, stores: new Map() };
    acc.overdue_cent += e.open_cent;
    if (dias > acc.oldest_days) {
      acc.oldest_days = dias;
      acc.oldest_store = e.establishment_id;
    }
    if (e.establishment_id) acc.stores.set(e.establishment_id, (acc.stores.get(e.establishment_id) ?? 0) + e.open_cent);
    porCliente.set(e.emporio_customer_id, acc);
  }

  const ids = [...porCliente.keys()];
  const clientes = new Map(
    (await db.emporioCustomer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true } })).map((c) => [c.id, c]),
  );
  const lojaIds = [...new Set([...porCliente.values()].flatMap((a) => [...a.stores.keys()]))];
  const lojas = new Map(
    (await db.establishment.findMany({ where: { id: { in: lojaIds } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]),
  );
  const cobrancas = await db.emporioAuditLog.findMany({
    where: { action: "fiado.cobrar", target_id: { in: ids } },
    orderBy: { created_at: "desc" },
    select: { target_id: true, created_at: true },
  });
  const ultima = new Map<string, Date>();
  for (const c of cobrancas) if (c.target_id && !ultima.has(c.target_id)) ultima.set(c.target_id, c.created_at);

  const modelo =
    settings.fiado_collection_message && settings.fiado_collection_message.trim() !== ""
      ? settings.fiado_collection_message
      : MENSAGEM_DE_COBRANCA_PADRAO;
  const customers: CobrancaView["customers"] = [];
  for (const [id, acc] of porCliente) {
    if (opts.faixa && !naFaixa(acc.oldest_days, opts.faixa)) continue;
    const c = clientes.get(id);
    if (!c) continue;
    const message = mensagemDeCobranca(modelo, {
      nome: c.name,
      valor: dinheiro(reais(acc.overdue_cent)),
      dias: acc.oldest_days,
      loja: (acc.oldest_store && lojas.get(acc.oldest_store)) || "",
    });
    const fone = telefoneParaWhatsApp(c.phone);
    customers.push({
      customer_id: id,
      customer_name: c.name,
      phone: c.phone,
      phone_whatsapp: fone,
      whatsapp_url: fone ? `https://wa.me/${fone}?text=${encodeURIComponent(message)}` : null,
      message,
      overdue_total: reais(acc.overdue_cent),
      oldest_days: acc.oldest_days,
      stores: [...acc.stores.entries()]
        .map(([lojaId, cent]) => ({ establishment_id: lojaId, establishment_name: lojas.get(lojaId) ?? "", overdue: reais(cent) }))
        .sort((a, b) => b.overdue - a.overdue),
      last_charged_at: ultima.get(id)?.toISOString() ?? null,
    });
  }
  customers.sort((a, b) => b.oldest_days - a.oldest_days || a.customer_name.localeCompare(b.customer_name, "pt-BR"));
  return ok({ message_template: modelo, customers });
}

/**
 * Registra que o Financeiro cobrou o cliente. Não envia nada: o envio é o WhatsApp do aparelho,
 * aberto pelo link da lista. Só grava o `fiado.cobrar` no Histórico (dele sai o `last_charged_at`).
 */
export async function registrarCobrancaAction(
  db: TenantPrismaClient,
  ator: Ator,
  customerId: string,
  input: { establishment_id?: string | null; message?: string } = {},
): Promise<ActionResult<{ charged_at: string }>> {
  const neg = await exigir(db, ator, "dinheiro", "registrar uma cobrança");
  if (neg) return neg;
  const cliente = await carregarEstado(db, customerId);
  if (!cliente.ok) return cliente;

  const lojaId = typeof input?.establishment_id === "string" && input.establishment_id.trim() ? input.establishment_id.trim() : null;
  if (lojaId) {
    const loja = await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true } });
    if (!loja) return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }

  const hoje = hojeEmBrasilia();
  const abertas = await entradasAbertas(
    db,
    { emporio_customer_id: cliente.data.customer.id, ...(lojaId ? { establishment_id: lojaId } : {}) },
    { prazoPadraoDias: cliente.data.settings.fiado_due_days },
  );
  let vencidoCent = 0;
  let maiorAtraso = 0;
  for (const e of abertas) {
    const dias = diasDeAtraso(e.effective_due_date, hoje);
    if (dias <= 0) continue;
    vencidoCent += e.open_cent;
    maiorAtraso = Math.max(maiorAtraso, dias);
  }
  if (vencidoCent === 0) {
    return fail("SEM_FIADO_VENCIDO", "Este cliente não tem fiado vencido para cobrar.", 422, "customer_id");
  }

  const mensagem = typeof input?.message === "string" ? input.message.trim() : "";
  if (mensagem.length > 1000) return fail("VALIDATION_ERROR", "A mensagem pode ter até 1000 caracteres.", 422, "message");
  await registrarNoHistorico(db, ator, {
    action: "fiado.cobrar",
    establishment_id: lojaId,
    target_type: "cliente",
    target_id: cliente.data.customer.id,
    summary: `Cobrou ${cliente.data.customer.name} pelo WhatsApp: ${dinheiro(reais(vencidoCent))} vencido há ${diasTexto(maiorAtraso)}`,
    ...(mensagem ? { changes: [{ campo: "Mensagem", antes: null, depois: mensagem }] } : {}),
  });
  return ok({ charged_at: new Date().toISOString() });
}
