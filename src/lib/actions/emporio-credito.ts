import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir, exigirUma } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { diasDeAtraso, diaUtc, regraDePrazo, sugerirVencimento, type RegraDePrazo } from "@/lib/emporio/fiado";
import { dinheiro, registrarNoHistorico, type MudancaDoHistorico } from "@/lib/emporio/historico";
import { entradasAbertas } from "@/lib/actions/emporio-caixa";
import type { Ator } from "@/lib/actions/emporio-catalogo";

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
export async function estadoDeCredito(
  db: TenantPrismaClient,
  customerId: string,
  opts: { lojasVisiveis?: Set<string> | null } = {},
): Promise<EstadoDeCredito> {
  const c = await db.emporioCustomer.findFirst({
    where: { id: customerId },
    select: { id: true, name: true, phone: true, fiado_limit: true, fiado_due_days: true, fiado_due_day: true },
  });
  if (!c) throw new Error("Cliente do Empório não encontrado para o cálculo de crédito.");
  const settings = await lerConfiguracoesDoFiado(db);
  const abertas = await entradasAbertas(db, { emporio_customer_id: customerId }, { prazoPadraoDias: settings.fiado_due_days });
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

  const limiteDoCliente = decToNum(c.fiado_limit as never);
  const limit = limiteDoCliente ?? settings.fiado_default_limit;
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
  customer: EstadoDeCredito["customer"];
  status: "em_dia" | "no_limite" | "bloqueado_por_atraso";
  limit: number | null;
  limit_source: "cliente" | "conta" | null;
  due_rule: RegraDePrazo;
  /** O vencimento que uma venda nova em fiado teria hoje (dia, YYYY-MM-DD). */
  suggested_due_date: string;
  block_after_days: number;
  owed_total: number;
  overdue_total: number;
  available: number | null;
  oldest_overdue: { due_date: string; days: number } | null;
  by_store: { establishment_id: string; establishment_name: string; owed: number; overdue: number }[];
  releases: {
    id: string;
    establishment_id: string;
    establishment_name: string;
    released_by_name: string;
    reason: string;
    valid_until: string;
    consumed_at: string | null;
    created_at: string;
  }[];
  last_charged_at: string | null;
};

async function montarCredito(db: TenantPrismaClient, estado: EstadoDeCredito): Promise<CreditoView> {
  const lojaIds = [...estado.by_store.keys()];
  const liberacoes = await db.emporioCreditRelease.findMany({
    where: { customer_id: estado.customer.id },
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
    customer: estado.customer,
    status,
    limit: estado.limit,
    limit_source: estado.limit_source,
    due_rule: estado.due_rule,
    suggested_due_date: dia(sugerirVencimento(estado.due_rule, hojeEmBrasilia())),
    block_after_days: estado.settings.fiado_block_after_days,
    owed_total: reais(estado.owed_cent),
    overdue_total: reais(estado.overdue_cent),
    available: estado.available_cent === null ? null : reais(estado.available_cent),
    oldest_overdue: estado.oldest_overdue ? { due_date: dia(estado.oldest_overdue.due_date), days: estado.oldest_overdue.days } : null,
    by_store: [...estado.by_store.entries()].map(([id, v]) => ({
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
      consumed_at: r.consumed_at ? r.consumed_at.toISOString() : null,
      created_at: r.created_at.toISOString(),
    })),
    last_charged_at: cobrado ? cobrado.created_at.toISOString() : null,
  };
}

async function carregarEstado(db: TenantPrismaClient, customerId: unknown): Promise<ActionResult<EstadoDeCredito>> {
  const naoAchado = fail("NOT_FOUND", "Cliente não encontrado.", 404, "customer_id");
  if (typeof customerId !== "string" || !customerId) return naoAchado;
  const c = await db.emporioCustomer.findFirst({ where: { id: customerId }, select: { system_key: true } });
  if (!c || c.system_key === "consumidor_final") return naoAchado;
  return ok(await estadoDeCredito(db, customerId));
}

export async function lerCreditoDoClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  customerId: string,
): Promise<ActionResult<CreditoView>> {
  const neg = await exigirUma(db, ator, ["vendedor_da_loja", "dinheiro"], "ver o crédito do cliente");
  if (neg) return neg;
  const estado = await carregarEstado(db, customerId);
  if (!estado.ok) return estado;
  return ok(await montarCredito(db, estado.data));
}

export type DefinirCreditoInput = {
  fiado_limit?: number | null;
  fiado_due_days?: number | null;
  fiado_due_day?: number | null;
};

const textoDoPrazo = (dias: number | null, diaDoMes: number | null) =>
  diaDoMes != null ? `todo dia ${diaDoMes}` : dias != null ? `${dias} dias` : "o padrão da conta";

/** Limite e prazo do fiado de UM cliente. Chave ausente mantém; nulo limpa (volta ao padrão da conta). */
export async function definirCreditoDoClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  customerId: string,
  input: DefinirCreditoInput,
): Promise<ActionResult<CreditoView>> {
  const neg = await exigir(db, ator, "dinheiro", "mudar o crédito do cliente");
  if (neg) return neg;
  const atual = await carregarEstado(db, customerId);
  if (!atual.ok) return atual;
  const antes = atual.data.customer;

  const dados: Record<string, unknown> = {};
  if (input.fiado_limit !== undefined) {
    const v = input.fiado_limit;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      return fail("VALIDATION_ERROR", "O limite deve ser zero ou mais.", 422, "fiado_limit");
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
    await db.$transaction(async (tx) => {
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
    });
  }
  const depois = await carregarEstado(db, customerId);
  if (!depois.ok) return depois;
  return ok(await montarCredito(db, depois.data));
}
