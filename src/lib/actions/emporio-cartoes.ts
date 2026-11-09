import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir, exigirUma, papelDoEmporio, pode } from "@/lib/emporio/papel";
import { lojaVisivel, lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { acharLojaParaEscrita } from "@/lib/actions/emporio-estoque";
import { diferencas, registrarNoHistorico } from "@/lib/emporio/historico";
import { runSerializableTenantTransaction } from "@/lib/financial";
import {
  BANDEIRAS,
  ROTULO_DA_BANDEIRA,
  hojeEmBrasilia,
  somarDias,
  type Bandeira,
  type LinhaDeTaxa,
} from "@/lib/emporio/cartao";
import { dataBr } from "@/lib/emporio/datas";

/**
 * Meu Empório, taxas de cartão (Q250 a Q258): adquirentes da conta e a tabela
 * de taxas por loja, adquirente, bandeira, modalidade, faixa de parcelas e
 * vigência. A validação é em TypeScript puro, porque o agente do WhatsApp
 * chama estas funções sem passar pelo Zod da rota.
 *
 * A taxa que a venda usou fica copiada no pagamento (Q254). Por isso uma linha
 * em uso nunca é editada no lugar nem apagada: muda-se por "nova vigência".
 */

const NAO_ACHADO = (o: string, field?: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404, field);

const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const dataValida = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());
const arred2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;
const diaDe = (d: Date) => d.toISOString().slice(0, 10);
/** A meia-noite UTC do dia: o valor que uma coluna `@db.Date` guarda. */
const soODia = (d: Date) => new Date(`${diaDe(d)}T00:00:00.000Z`);
const pct = (n: number) => `${n.toLocaleString("pt-BR")}%`;

function ehErroUnico(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}

const FORMAS = ["debito", "credito_vista", "credito_parcelado"] as const;
type Forma = (typeof FORMAS)[number];
const ROTULO_FORMA: Record<Forma, string> = {
  debito: "débito",
  credito_vista: "crédito à vista",
  credito_parcelado: "crédito parcelado",
};
const rotuloBandeira = (b: string) => ROTULO_DA_BANDEIRA[b as Bandeira | "qualquer"] ?? b;

// ---------------------------------------------------------------------------
// Adquirentes
// ---------------------------------------------------------------------------

const REGRAS_DIA_UTIL = ["proximo_dia_util", "dias_corridos"] as const;
type RegraDiaUtil = (typeof REGRAS_DIA_UTIL)[number];

export type AdquirenteView = {
  id: string;
  name: string;
  archived_at: string | null;
  rates_count: number;
  business_day_rule: RegraDiaUtil;
  refunds_mdr_on_cancel: boolean;
  auto_anticipation_enabled: boolean;
  auto_anticipation_pct_month: number | null;
  auto_anticipation_business_days: number;
  /** Dia de calendário (AAAA-MM-DD) a partir do qual a automática vale. */
  auto_anticipation_since: string | null;
};

type AdquirenteRow = {
  id: string;
  name: string;
  archived_at: Date | null;
  business_day_rule: RegraDiaUtil;
  refunds_mdr_on_cancel: boolean;
  auto_anticipation_enabled: boolean;
  auto_anticipation_pct_month: unknown;
  auto_anticipation_business_days: number;
  auto_anticipation_since: Date | null;
  _count: { fee_rates: number };
};

const viewDaAdquirente = (a: AdquirenteRow): AdquirenteView => ({
  id: a.id,
  name: a.name,
  archived_at: a.archived_at ? a.archived_at.toISOString() : null,
  rates_count: a._count.fee_rates,
  business_day_rule: a.business_day_rule,
  refunds_mdr_on_cancel: a.refunds_mdr_on_cancel,
  auto_anticipation_enabled: a.auto_anticipation_enabled,
  auto_anticipation_pct_month: decToNum(a.auto_anticipation_pct_month as never),
  auto_anticipation_business_days: a.auto_anticipation_business_days,
  auto_anticipation_since: a.auto_anticipation_since ? diaDe(a.auto_anticipation_since) : null,
});

/** Os seis campos de configuração da adquirente; ausente (undefined) = não muda. */
export type ConfigDaAdquirente = {
  business_day_rule?: RegraDiaUtil;
  refunds_mdr_on_cancel?: boolean;
  auto_anticipation_enabled?: boolean;
  auto_anticipation_pct_month?: number | null;
  auto_anticipation_business_days?: number;
  auto_anticipation_since?: Date | null;
};

type ConfigCompleta = {
  business_day_rule: RegraDiaUtil;
  refunds_mdr_on_cancel: boolean;
  auto_anticipation_enabled: boolean;
  auto_anticipation_pct_month: number | null;
  auto_anticipation_business_days: number;
  auto_anticipation_since: Date | null;
};

const CONFIG_PADRAO: ConfigCompleta = {
  business_day_rule: "proximo_dia_util",
  refunds_mdr_on_cancel: true,
  auto_anticipation_enabled: false,
  auto_anticipation_pct_month: null,
  auto_anticipation_business_days: 1,
  auto_anticipation_since: null,
};

const RECUSA_CONFIG = (msg: string, field: string) => fail("VALIDATION_ERROR", msg, 422, field);

/** Valida o que veio e funde com a base (o estado atual, ou o padrão na criação). */
function configFundida(input: ConfigDaAdquirente | undefined, base: ConfigCompleta): ActionResult<ConfigCompleta> {
  const i = (input ?? {}) as Record<string, unknown>;
  const c = { ...base };
  if (i.business_day_rule !== undefined) {
    if (!(REGRAS_DIA_UTIL as readonly unknown[]).includes(i.business_day_rule)) {
      return RECUSA_CONFIG("Escolha como a adquirente conta o prazo: próximo dia útil ou dias corridos.", "business_day_rule");
    }
    c.business_day_rule = i.business_day_rule as RegraDiaUtil;
  }
  if (i.refunds_mdr_on_cancel !== undefined) {
    if (typeof i.refunds_mdr_on_cancel !== "boolean") {
      return RECUSA_CONFIG("Informe se o cancelamento devolve a taxa.", "refunds_mdr_on_cancel");
    }
    c.refunds_mdr_on_cancel = i.refunds_mdr_on_cancel;
  }
  if (i.auto_anticipation_enabled !== undefined) {
    if (typeof i.auto_anticipation_enabled !== "boolean") {
      return RECUSA_CONFIG("Informe se a antecipação automática está ligada.", "auto_anticipation_enabled");
    }
    c.auto_anticipation_enabled = i.auto_anticipation_enabled;
  }
  if (i.auto_anticipation_pct_month !== undefined) {
    const p = i.auto_anticipation_pct_month;
    if (p !== null && (!numero(p) || p < 0 || p > 20)) {
      return RECUSA_CONFIG("A taxa da antecipação automática vai de 0 a 20% ao mês.", "auto_anticipation_pct_month");
    }
    c.auto_anticipation_pct_month = p === null ? null : arred2(p);
  }
  if (i.auto_anticipation_business_days !== undefined) {
    const d = i.auto_anticipation_business_days;
    if (!numero(d) || !Number.isInteger(d) || d < 0 || d > 30) {
      return RECUSA_CONFIG("O prazo da antecipação automática vai de 0 a 30 dias úteis.", "auto_anticipation_business_days");
    }
    c.auto_anticipation_business_days = d;
  }
  if (i.auto_anticipation_since !== undefined) {
    const s = i.auto_anticipation_since;
    if (s !== null && !dataValida(s)) {
      return RECUSA_CONFIG("Informe a data inicial da antecipação automática.", "auto_anticipation_since");
    }
    c.auto_anticipation_since = s === null ? null : soODia(s as Date);
  }
  if (c.auto_anticipation_enabled) {
    if (c.auto_anticipation_pct_month === null) {
      return RECUSA_CONFIG("Informe a taxa ao mês para ligar a antecipação automática.", "auto_anticipation_pct_month");
    }
    if (c.auto_anticipation_since === null) {
      return RECUSA_CONFIG("Informe a partir de quando a antecipação automática vale.", "auto_anticipation_since");
    }
  }
  return ok(c);
}

const CAMPOS_DA_CONFIG: Record<string, string> = {
  business_day_rule: "Regra do dia útil",
  refunds_mdr_on_cancel: "Cancelamento devolve a taxa",
  auto_anticipation_enabled: "Antecipação automática",
  auto_anticipation_pct_month: "Taxa da automática (% ao mês)",
  auto_anticipation_business_days: "Prazo da automática (dias úteis)",
  auto_anticipation_since: "Automática vale desde",
};

const paraHistorico = (c: ConfigCompleta | AdquirenteRow): Record<string, unknown> => ({
  business_day_rule: c.business_day_rule,
  refunds_mdr_on_cancel: c.refunds_mdr_on_cancel,
  auto_anticipation_enabled: c.auto_anticipation_enabled,
  auto_anticipation_pct_month: decToNum(c.auto_anticipation_pct_month as never),
  auto_anticipation_business_days: c.auto_anticipation_business_days,
  auto_anticipation_since: c.auto_anticipation_since ? diaDe(c.auto_anticipation_since) : null,
});

const configDaLinha = (a: AdquirenteRow): ConfigCompleta => ({
  business_day_rule: a.business_day_rule,
  refunds_mdr_on_cancel: a.refunds_mdr_on_cancel,
  auto_anticipation_enabled: a.auto_anticipation_enabled,
  auto_anticipation_pct_month: decToNum(a.auto_anticipation_pct_month as never),
  auto_anticipation_business_days: a.auto_anticipation_business_days,
  auto_anticipation_since: a.auto_anticipation_since,
});

const INCLUDE_ADQUIRENTE = { _count: { select: { fee_rates: true } } } as const;

export async function listarAdquirentesAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { incluir_arquivadas?: boolean } = {},
): Promise<ActionResult<AdquirenteView[]>> {
  const c = await papelDoEmporio(db, ator);
  if (!c.papel) return ok([]);
  const rows = await db.cardAcquirer.findMany({
    where: opts?.incluir_arquivadas ? {} : { archived_at: null },
    include: INCLUDE_ADQUIRENTE,
    orderBy: { name: "asc" },
  });
  return ok(rows.map(viewDaAdquirente));
}

async function nomeValido(
  db: TenantPrismaClient,
  nome: unknown,
  ignorarId?: string,
): Promise<ActionResult<string>> {
  if (typeof nome !== "string" || !nome.trim()) {
    return fail("VALIDATION_ERROR", "Dê um nome à adquirente.", 422, "name");
  }
  const name = nome.trim().replace(/\s+/g, " ");
  if (name.length > 80) return fail("VALIDATION_ERROR", "O nome deve ter até 80 caracteres.", 422, "name");
  const igual = await db.cardAcquirer.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true },
  });
  if (igual) return fail("VALIDATION_ERROR", "Já existe uma adquirente com esse nome.", 409, "name");
  return ok(name);
}

export async function criarAdquirenteAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { name: string } & ConfigDaAdquirente,
): Promise<ActionResult<AdquirenteView>> {
  const neg = await exigir(db, ator, "conta", "cadastrar uma adquirente");
  if (neg) return neg;
  const nome = await nomeValido(db, input?.name);
  if (!nome.ok) return nome;
  const config = configFundida(input, CONFIG_PADRAO);
  if (!config.ok) return config;
  try {
    const criada = await db.$transaction(async (tx) => {
      const a = await tx.cardAcquirer.create({
        data: scoped({ name: nome.data, updated_by_user_id: ator.id, ...config.data }),
        include: INCLUDE_ADQUIRENTE,
      });
      await registrarNoHistorico(tx, ator, {
        action: "cartao.adquirente.criar",
        target_type: "adquirente",
        target_id: a.id,
        summary: `Cadastrou a adquirente ${a.name}`,
      });
      return a;
    });
    return ok(viewDaAdquirente(criada));
  } catch (err) {
    if (!ehErroUnico(err)) throw err;
    return fail("VALIDATION_ERROR", "Já existe uma adquirente com esse nome.", 409, "name");
  }
}

/**
 * Muda o nome, a configuração e (opcional) o arquivamento numa transação só:
 * o PATCH que traz nome e `archived` não deixa a adquirente renomeada e
 * ainda ativa se o arquivamento for recusado (dívida 2.59).
 */
export async function editarAdquirenteAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { name?: string; archived?: boolean } & ConfigDaAdquirente,
): Promise<ActionResult<AdquirenteView>> {
  const neg = await exigir(db, ator, "conta", "editar uma adquirente");
  if (neg) return neg;
  const atual = await db.cardAcquirer.findFirst({ where: { id }, include: INCLUDE_ADQUIRENTE });
  if (!atual) return NAO_ACHADO("Adquirente");

  let nome: string | null = null;
  if (input?.name !== undefined) {
    const n = await nomeValido(db, input.name, atual.id);
    if (!n.ok) return n;
    nome = n.data;
  }
  const config = configFundida(input, configDaLinha(atual as unknown as AdquirenteRow));
  if (!config.ok) return config;

  const arquivar = input?.archived === true && !atual.archived_at;
  const reativar = input?.archived === false && !!atual.archived_at;
  if (arquivar) {
    const hoje = hojeEmBrasilia();
    const vigentes = await db.cardFeeRate.count({
      where: { acquirer_id: atual.id, OR: [{ valid_to: null }, { valid_to: { gte: hoje } }] },
    });
    if (vigentes > 0) {
      return fail("VALIDATION_ERROR", "Encerre as taxas desta adquirente antes de arquivar.", 409);
    }
  }

  const antesCfg = paraHistorico(atual as unknown as AdquirenteRow);
  const mudancas = diferencas(antesCfg, paraHistorico(config.data), CAMPOS_DA_CONFIG);
  try {
    const nova = await db.$transaction(async (tx) => {
      const a = await tx.cardAcquirer.update({
        where: { id: atual.id },
        data: {
          ...(nome !== null ? { name: nome } : {}),
          ...config.data,
          ...(arquivar ? { archived_at: new Date() } : {}),
          ...(reativar ? { archived_at: null } : {}),
          updated_by_user_id: ator.id,
        },
        include: INCLUDE_ADQUIRENTE,
      });
      if (nome !== null && atual.name !== a.name) {
        await registrarNoHistorico(tx, ator, {
          action: "cartao.adquirente.editar",
          target_type: "adquirente",
          target_id: a.id,
          summary: `Renomeou a adquirente ${atual.name} para ${a.name}`,
          changes: diferencas({ name: atual.name }, { name: a.name }, { name: "Nome" }),
        });
      }
      if (mudancas.length > 0) {
        await registrarNoHistorico(tx, ator, {
          action: "cartao.adquirente.editar",
          target_type: "adquirente",
          target_id: a.id,
          summary: `Mudou a configuração da adquirente ${a.name}`,
          changes: mudancas,
        });
      }
      if (arquivar) {
        await registrarNoHistorico(tx, ator, {
          action: "cartao.adquirente.arquivar",
          target_type: "adquirente",
          target_id: a.id,
          summary: `Arquivou a adquirente ${a.name}`,
        });
      }
      if (reativar) {
        await registrarNoHistorico(tx, ator, {
          action: "cartao.adquirente.reativar",
          target_type: "adquirente",
          target_id: a.id,
          summary: `Reativou a adquirente ${a.name}`,
        });
      }
      return a;
    });
    return ok(viewDaAdquirente(nova));
  } catch (err) {
    if (!ehErroUnico(err)) throw err;
    return fail("VALIDATION_ERROR", "Já existe uma adquirente com esse nome.", 409, "name");
  }
}

export async function arquivarAdquirenteAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<AdquirenteView>> {
  const neg = await exigir(db, ator, "conta", "arquivar uma adquirente");
  if (neg) return neg;
  const atual = await db.cardAcquirer.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Adquirente");
  if (atual.archived_at) {
    return ok(viewDaAdquirente({ ...atual, _count: { fee_rates: await db.cardFeeRate.count({ where: { acquirer_id: id } }) } }));
  }
  const hoje = hojeEmBrasilia();
  const vigentes = await db.cardFeeRate.count({
    where: { acquirer_id: atual.id, OR: [{ valid_to: null }, { valid_to: { gte: hoje } }] },
  });
  if (vigentes > 0) {
    return fail("VALIDATION_ERROR", "Encerre as taxas desta adquirente antes de arquivar.", 409);
  }
  const nova = await db.$transaction(async (tx) => {
    const a = await tx.cardAcquirer.update({
      where: { id: atual.id },
      data: { archived_at: new Date(), updated_by_user_id: ator.id },
      include: INCLUDE_ADQUIRENTE,
    });
    await registrarNoHistorico(tx, ator, {
      action: "cartao.adquirente.arquivar",
      target_type: "adquirente",
      target_id: a.id,
      summary: `Arquivou a adquirente ${a.name}`,
    });
    return a;
  });
  return ok(viewDaAdquirente(nova));
}

export async function reativarAdquirenteAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<AdquirenteView>> {
  const neg = await exigir(db, ator, "conta", "reativar uma adquirente");
  if (neg) return neg;
  const atual = await db.cardAcquirer.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO("Adquirente");
  if (!atual.archived_at) {
    return ok(viewDaAdquirente({ ...atual, _count: { fee_rates: await db.cardFeeRate.count({ where: { acquirer_id: id } }) } }));
  }
  const nova = await db.$transaction(async (tx) => {
    const a = await tx.cardAcquirer.update({
      where: { id: atual.id },
      data: { archived_at: null, updated_by_user_id: ator.id },
      include: INCLUDE_ADQUIRENTE,
    });
    await registrarNoHistorico(tx, ator, {
      action: "cartao.adquirente.reativar",
      target_type: "adquirente",
      target_id: a.id,
      summary: `Reativou a adquirente ${a.name}`,
    });
    return a;
  });
  return ok(viewDaAdquirente(nova));
}

/**
 * Para o wrapper da regra antiga (`definirRegraCartaoAction`): acha ou cria a
 * adquirente "Maquininha" da conta, reativando-a se estiver arquivada. Sem
 * checagem de papel: quem chama já checou a sua.
 */
export async function garantirAdquirenteMaquininha(
  db: TenantPrismaClient,
  ator: Ator,
): Promise<{ id: string; name: string }> {
  const achar = () =>
    db.cardAcquirer.findFirst({ where: { name: { equals: "Maquininha", mode: "insensitive" } } });
  let a = await achar();
  if (!a) {
    try {
      a = await db.$transaction(async (tx) => {
        const criada = await tx.cardAcquirer.create({
          data: scoped({ name: "Maquininha", updated_by_user_id: ator.id }),
        });
        await registrarNoHistorico(tx, ator, {
          action: "cartao.adquirente.criar",
          target_type: "adquirente",
          target_id: criada.id,
          summary: "Cadastrou a adquirente Maquininha",
        });
        return criada;
      });
    } catch (err) {
      if (!ehErroUnico(err)) throw err;
      a = await achar();
    }
  }
  if (!a) throw new Error("Não foi possível obter a adquirente Maquininha.");
  if (a.archived_at) {
    await db.cardAcquirer.update({ where: { id: a.id }, data: { archived_at: null, updated_by_user_id: ator.id } });
  }
  return { id: a.id, name: a.name };
}

// ---------------------------------------------------------------------------
// Taxas
// ---------------------------------------------------------------------------

export type TaxaView = LinhaDeTaxa & {
  establishment_id: string;
  acquirer_name: string;
  /** Conta é de quem gerencia: para os outros o nome vem nulo. */
  bank_account_name: string | null;
  /** Alguma venda copiou esta linha: ela não se edita nem se apaga. */
  in_use: boolean;
  updated_by_name: string | null;
};

const INCLUDE_TAXA = {
  acquirer: { select: { name: true } },
  bank_account: { select: { name: true } },
  establishment: { select: { name: true } },
  _count: { select: { sale_payments: true } },
} as const;

type TaxaRow = {
  id: string;
  establishment_id: string;
  acquirer_id: string;
  brand: string;
  kind: string;
  installments_from: number;
  installments_to: number;
  fee_pct: unknown;
  fee_fixed: unknown;
  days: number;
  bank_account_id: string;
  valid_from: Date;
  valid_to: Date | null;
  updated_by_user_id: string | null;
  acquirer: { name: string };
  bank_account: { name: string };
  establishment: { name: string };
  _count: { sale_payments: number };
};

async function podeVerConta(db: TenantPrismaClient, ator: Ator): Promise<boolean> {
  const c = await papelDoEmporio(db, ator);
  return pode(c, "gestor_da_loja") || pode(c, "dinheiro");
}

async function viewsDasTaxas(db: TenantPrismaClient, ator: Ator, rows: TaxaRow[]): Promise<TaxaView[]> {
  const veConta = await podeVerConta(db, ator);
  const ids = [...new Set(rows.map((r) => r.updated_by_user_id).filter((x): x is string => !!x))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nomes = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    establishment_id: r.establishment_id,
    acquirer_id: r.acquirer_id,
    acquirer_name: r.acquirer.name,
    brand: r.brand as LinhaDeTaxa["brand"],
    kind: r.kind as LinhaDeTaxa["kind"],
    installments_from: r.installments_from,
    installments_to: r.installments_to,
    fee_pct: decToNum(r.fee_pct as never) ?? 0,
    fee_fixed: decToNum(r.fee_fixed as never) ?? 0,
    days: r.days,
    bank_account_id: r.bank_account_id,
    bank_account_name: veConta ? r.bank_account.name : null,
    valid_from: diaDe(r.valid_from),
    valid_to: r.valid_to ? diaDe(r.valid_to) : null,
    in_use: r._count.sale_payments > 0,
    updated_by_name: r.updated_by_user_id ? (nomes.get(r.updated_by_user_id) ?? null) : null,
  }));
}

export type FiltroDeTaxas = {
  establishment_id?: string;
  acquirer_id?: string;
  vigentes_em?: Date;
  incluir_encerradas?: boolean;
};

export async function listarTaxasAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: FiltroDeTaxas = {},
): Promise<ActionResult<TaxaView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts?.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const hoje = hojeEmBrasilia();
  const dia = opts?.vigentes_em && dataValida(opts.vigentes_em) ? soODia(opts.vigentes_em) : null;
  const where: Record<string, unknown> = {
    ...(opts?.establishment_id
      ? { establishment_id: opts.establishment_id }
      : visiveis
        ? { establishment_id: { in: [...visiveis] } }
        : {}),
    ...(opts?.acquirer_id ? { acquirer_id: opts.acquirer_id } : {}),
  };
  if (dia) {
    where.valid_from = { lte: dia };
    where.OR = [{ valid_to: null }, { valid_to: { gte: dia } }];
  } else if (!opts?.incluir_encerradas) {
    where.OR = [{ valid_to: null }, { valid_to: { gte: hoje } }];
  }
  const rows = await db.cardFeeRate.findMany({
    where,
    include: INCLUDE_TAXA,
    orderBy: [
      { establishment: { name: "asc" } },
      { acquirer: { name: "asc" } },
      { kind: "asc" },
      { brand: "asc" },
      { installments_from: "asc" },
      { valid_from: "asc" },
    ],
  });
  return ok(await viewsDasTaxas(db, ator, rows as unknown as TaxaRow[]));
}

export type CriarTaxaInput = {
  establishment_id: string;
  acquirer_id: string;
  brand: Bandeira | "qualquer";
  kind: string;
  installments_from: number;
  installments_to: number;
  fee_pct: number;
  fee_fixed?: number;
  days: number;
  bank_account_id: string;
  valid_from: Date;
  valid_to?: Date | null;
};

type Campos = {
  brand: Bandeira | "qualquer";
  kind: Forma;
  installments_from: number;
  installments_to: number;
  fee_pct: number;
  fee_fixed: number;
  days: number;
  valid_from: Date;
  valid_to: Date | null;
};

/** As regras de campo, as mesmas para criar, editar e renovar. Devolve os campos normalizados. */
function validarCampos(c: {
  brand: unknown;
  kind: unknown;
  installments_from: unknown;
  installments_to: unknown;
  fee_pct: unknown;
  fee_fixed?: unknown;
  days: unknown;
  valid_from: unknown;
  valid_to?: unknown;
}): ActionResult<Campos> {
  if (c.brand !== "qualquer" && !(BANDEIRAS as readonly unknown[]).includes(c.brand)) {
    return fail("VALIDATION_ERROR", "Escolha a bandeira.", 422, "brand");
  }
  if (!(FORMAS as readonly unknown[]).includes(c.kind)) {
    return fail("VALIDATION_ERROR", "Escolha a modalidade: débito, crédito à vista ou crédito parcelado.", 422, "kind");
  }
  const kind = c.kind as Forma;
  const de = c.installments_from;
  const ate = c.installments_to;
  if (!numero(de) || !Number.isInteger(de)) {
    return fail("VALIDATION_ERROR", "Informe a primeira parcela da faixa.", 422, "installments_from");
  }
  if (!numero(ate) || !Number.isInteger(ate)) {
    return fail("VALIDATION_ERROR", "Informe a última parcela da faixa.", 422, "installments_to");
  }
  if (kind === "credito_parcelado") {
    if (de < 2 || de > 12) {
      return fail("VALIDATION_ERROR", "No crédito parcelado a faixa começa entre 2 e 12 parcelas.", 422, "installments_from");
    }
    if (ate < 2 || ate > 12) {
      return fail("VALIDATION_ERROR", "No crédito parcelado a faixa termina entre 2 e 12 parcelas.", 422, "installments_to");
    }
    if (de > ate) {
      return fail("VALIDATION_ERROR", "A faixa de parcelas começa depois de onde termina.", 422, "installments_to");
    }
  } else {
    if (de !== 1) {
      return fail("VALIDATION_ERROR", `No ${ROTULO_FORMA[kind]} a faixa é de 1 parcela só.`, 422, "installments_from");
    }
    if (ate !== 1) {
      return fail("VALIDATION_ERROR", `No ${ROTULO_FORMA[kind]} a faixa é de 1 parcela só.`, 422, "installments_to");
    }
  }
  if (!numero(c.fee_pct) || c.fee_pct < 0 || c.fee_pct > 100) {
    return fail("VALIDATION_ERROR", "A taxa deve ficar entre 0% e 100%.", 422, "fee_pct");
  }
  const feePct = arred2(c.fee_pct);
  if (c.fee_fixed !== undefined && c.fee_fixed !== null && (!numero(c.fee_fixed) || c.fee_fixed < 0)) {
    return fail("VALIDATION_ERROR", "O valor fixo por transação não pode ser negativo.", 422, "fee_fixed");
  }
  const feeFixed = arred2(numero(c.fee_fixed) ? c.fee_fixed : 0);
  if (!numero(c.days) || !Number.isInteger(c.days) || c.days < 0 || c.days > 120) {
    return fail("VALIDATION_ERROR", "O prazo deve ser um número inteiro de dias, de 0 a 120.", 422, "days");
  }
  if (!dataValida(c.valid_from)) {
    return fail("VALIDATION_ERROR", "Informe a data em que a taxa começa a valer.", 422, "valid_from");
  }
  const from = soODia(c.valid_from);
  let to: Date | null = null;
  if (c.valid_to !== undefined && c.valid_to !== null) {
    if (!dataValida(c.valid_to)) {
      return fail("VALIDATION_ERROR", "Informe uma data válida para o fim da vigência.", 422, "valid_to");
    }
    to = soODia(c.valid_to);
    if (to < from) {
      return fail("VALIDATION_ERROR", "O fim da vigência não pode ser antes do começo.", 422, "valid_to");
    }
  }
  return ok({
    brand: c.brand as Campos["brand"],
    kind,
    installments_from: de,
    installments_to: ate,
    fee_pct: feePct,
    fee_fixed: feeFixed,
    days: c.days,
    valid_from: from,
    valid_to: to,
  });
}

async function contaAtiva(db: TenantPrismaClient, id: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  const conta =
    typeof id === "string" && id
      ? await db.bankAccount.findFirst({ where: { id }, select: { id: true, name: true, archived_at: true } })
      : null;
  if (!conta || conta.archived_at) {
    return fail("VALIDATION_ERROR", "Escolha uma conta bancária ativa para receber o cartão.", 422, "bank_account_id");
  }
  return ok({ id: conta.id, name: conta.name });
}

/** Q253: a linha que cruza (mesma loja, adquirente, bandeira, modalidade, parcelas e período). */
async function acharSobreposicao(
  db: TenantPrismaClient,
  p: {
    establishment_id: string;
    acquirer_id: string;
    brand: string;
    kind: Forma;
    installments_from: number;
    installments_to: number;
    valid_from: Date;
    valid_to: Date | null;
    ignorar: string[];
  },
) {
  return db.cardFeeRate.findFirst({
    where: {
      establishment_id: p.establishment_id,
      acquirer_id: p.acquirer_id,
      brand: p.brand as never,
      kind: p.kind,
      installments_from: { lte: p.installments_to },
      installments_to: { gte: p.installments_from },
      ...(p.ignorar.length ? { id: { notIn: p.ignorar } } : {}),
      AND: [
        { OR: [{ valid_to: null }, { valid_to: { gte: p.valid_from } }] },
        ...(p.valid_to ? [{ valid_from: { lte: p.valid_to } }] : []),
      ],
    },
    select: { id: true },
  });
}

const RECUSA_SOBREPOSICAO = () =>
  fail(
    "VALIDATION_ERROR",
    "Já existe uma taxa desta adquirente, bandeira e modalidade para essas parcelas nesse período. Use \"nova vigência\" para mudar a taxa a partir de uma data.",
    409,
    "valid_from",
  );

const frasePeriodo = (from: Date, to: Date | null) =>
  to ? `de ${dataBr(diaDe(from))} a ${dataBr(diaDe(to))}` : `a partir de ${dataBr(diaDe(from))}`;

const fraseFaixa = (kind: Forma, de: number, ate: number) =>
  kind === "credito_parcelado" ? ` (${de === ate ? `${de}x` : `${de} a ${ate}x`})` : "";

export async function criarTaxaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: CriarTaxaInput,
): Promise<ActionResult<TaxaView>> {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "cadastrar uma taxa de cartão");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  const negLoja = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "cadastrar uma taxa de cartão", loja.data.id);
  if (negLoja) return negLoja;

  const adq =
    typeof input.acquirer_id === "string" && input.acquirer_id
      ? await db.cardAcquirer.findFirst({ where: { id: input.acquirer_id } })
      : null;
  if (!adq) return fail("VALIDATION_ERROR", "Escolha a adquirente.", 422, "acquirer_id");
  if (adq.archived_at) return fail("VALIDATION_ERROR", "Essa adquirente está arquivada.", 422, "acquirer_id");

  const campos = validarCampos(input);
  if (!campos.ok) return campos;
  const c = campos.data;
  const conta = await contaAtiva(db, input.bank_account_id);
  if (!conta.ok) return conta;

  const criada = await runSerializableTenantTransaction(db, async (tx) => {
    const cruza = await acharSobreposicao(tx as unknown as TenantPrismaClient, {
      establishment_id: loja.data.id,
      acquirer_id: adq.id,
      brand: c.brand,
      kind: c.kind,
      installments_from: c.installments_from,
      installments_to: c.installments_to,
      valid_from: c.valid_from,
      valid_to: c.valid_to,
      ignorar: [],
    });
    if (cruza) return null;
    const row = await tx.cardFeeRate.create({
      data: scoped({
        establishment_id: loja.data.id,
        acquirer_id: adq.id,
        brand: c.brand,
        kind: c.kind,
        installments_from: c.installments_from,
        installments_to: c.installments_to,
        fee_pct: c.fee_pct,
        fee_fixed: c.fee_fixed,
        days: c.days,
        bank_account_id: conta.data.id,
        valid_from: c.valid_from,
        valid_to: c.valid_to,
        updated_by_user_id: ator.id,
      }),
      include: INCLUDE_TAXA,
    });
    await registrarNoHistorico(tx, ator, {
      action: "cartao.taxa.criar",
      establishment_id: loja.data.id,
      target_type: "taxa_cartao",
      target_id: row.id,
      summary: `Criou a taxa de ${ROTULO_FORMA[c.kind]}${fraseFaixa(c.kind, c.installments_from, c.installments_to)} ${rotuloBandeira(c.brand)} da ${adq.name} na ${loja.data.name}: ${pct(c.fee_pct)} em ${c.days} ${c.days === 1 ? "dia" : "dias"}, ${frasePeriodo(c.valid_from, c.valid_to)}`,
    });
    return row;
  });
  if (!criada) return RECUSA_SOBREPOSICAO();
  return ok((await viewsDasTaxas(db, ator, [criada as unknown as TaxaRow]))[0]);
}

async function acharTaxa(db: TenantPrismaClient, ator: Ator, id: unknown) {
  const row =
    typeof id === "string" && id ? await db.cardFeeRate.findFirst({ where: { id }, include: INCLUDE_TAXA }) : null;
  if (!row || !(await lojaVisivel(db, ator, row.establishment_id))) return null;
  return row;
}

const RECUSA_EM_USO = (o: string) =>
  fail(
    "RATE_IN_USE",
    `Esta taxa já foi usada em vendas e não pode ${o}. Use "nova vigência" para mudar a taxa a partir de uma data.`,
    409,
  );

export type NovaVigenciaInput = {
  valid_from: Date;
  fee_pct?: number;
  fee_fixed?: number;
  days?: number;
  bank_account_id?: string;
  installments_from?: number;
  installments_to?: number;
};

/** Encerra a linha na véspera de `valid_from` e cria a nova, copiando o resto. Uma transação só. */
export async function novaVigenciaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: NovaVigenciaInput,
): Promise<ActionResult<TaxaView>> {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "mudar uma taxa de cartão");
  if (neg) return neg;
  const antiga = await acharTaxa(db, ator, id);
  if (!antiga) return NAO_ACHADO("Taxa de cartão");
  const negLoja = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "mudar uma taxa de cartão", antiga.establishment_id);
  if (negLoja) return negLoja;

  if (!dataValida(input?.valid_from)) {
    return fail("VALIDATION_ERROR", "Informe a data em que a nova taxa começa a valer.", 422, "valid_from");
  }
  const from = soODia(input.valid_from);
  if (antiga.valid_to) {
    return fail("VALIDATION_ERROR", "Esta taxa já foi encerrada. Cadastre uma taxa nova.", 422, "valid_from");
  }
  if (from <= antiga.valid_from) {
    return fail(
      "VALIDATION_ERROR",
      `A nova vigência tem de começar depois de ${dataBr(diaDe(antiga.valid_from))}, quando a taxa atual começou.`,
      422,
      "valid_from",
    );
  }
  const campos = validarCampos({
    brand: antiga.brand,
    kind: antiga.kind,
    installments_from: input.installments_from ?? antiga.installments_from,
    installments_to: input.installments_to ?? antiga.installments_to,
    fee_pct: input.fee_pct ?? decToNum(antiga.fee_pct),
    fee_fixed: input.fee_fixed ?? decToNum(antiga.fee_fixed),
    days: input.days ?? antiga.days,
    valid_from: from,
    valid_to: null,
  });
  if (!campos.ok) return campos;
  const c = campos.data;
  const conta = await contaAtiva(db, input.bank_account_id ?? antiga.bank_account_id);
  if (!conta.ok) return conta;
  if (antiga.acquirer && (await db.cardAcquirer.findFirst({ where: { id: antiga.acquirer_id, archived_at: { not: null } } }))) {
    return fail("VALIDATION_ERROR", "Essa adquirente está arquivada.", 422, "acquirer_id");
  }

  const fimDaAntiga = somarDias(from, -1);
  const nova = await runSerializableTenantTransaction(db, async (tx) => {
    const cruza = await acharSobreposicao(tx as unknown as TenantPrismaClient, {
      establishment_id: antiga.establishment_id,
      acquirer_id: antiga.acquirer_id,
      brand: c.brand,
      kind: c.kind,
      installments_from: c.installments_from,
      installments_to: c.installments_to,
      valid_from: from,
      valid_to: null,
      ignorar: [antiga.id],
    });
    if (cruza) return null;
    await tx.cardFeeRate.update({
      where: { id: antiga.id },
      data: { valid_to: fimDaAntiga, updated_by_user_id: ator.id },
    });
    const row = await tx.cardFeeRate.create({
      data: scoped({
        establishment_id: antiga.establishment_id,
        acquirer_id: antiga.acquirer_id,
        brand: c.brand,
        kind: c.kind,
        installments_from: c.installments_from,
        installments_to: c.installments_to,
        fee_pct: c.fee_pct,
        fee_fixed: c.fee_fixed,
        days: c.days,
        bank_account_id: conta.data.id,
        valid_from: from,
        valid_to: null,
        updated_by_user_id: ator.id,
      }),
      include: INCLUDE_TAXA,
    });
    await registrarNoHistorico(tx, ator, {
      action: "cartao.taxa.renovar",
      establishment_id: antiga.establishment_id,
      target_type: "taxa_cartao",
      target_id: row.id,
      summary: `Nova vigência da taxa de ${ROTULO_FORMA[c.kind]}${fraseFaixa(c.kind, c.installments_from, c.installments_to)} ${rotuloBandeira(c.brand)} da ${antiga.acquirer.name} na ${antiga.establishment.name}: ${pct(c.fee_pct)} a partir de ${dataBr(diaDe(from))} (a anterior vai até ${dataBr(diaDe(fimDaAntiga))})`,
      changes: diferencas(
        {
          fee_pct: decToNum(antiga.fee_pct),
          fee_fixed: decToNum(antiga.fee_fixed),
          days: antiga.days,
          conta: antiga.bank_account.name,
          de: antiga.installments_from,
          ate: antiga.installments_to,
        },
        {
          fee_pct: c.fee_pct,
          fee_fixed: c.fee_fixed,
          days: c.days,
          conta: conta.data.name,
          de: c.installments_from,
          ate: c.installments_to,
        },
        {
          fee_pct: "Taxa (%)",
          fee_fixed: "Valor fixo (R$)",
          days: "Prazo (dias)",
          conta: "Conta que recebe",
          de: "Parcelas, de",
          ate: "Parcelas, até",
        },
      ),
    });
    return row;
  });
  if (!nova) return RECUSA_SOBREPOSICAO();
  return ok((await viewsDasTaxas(db, ator, [nova as unknown as TaxaRow]))[0]);
}

export type EditarTaxaInput = Partial<Omit<CriarTaxaInput, "establishment_id" | "acquirer_id">>;

/** Edita no lugar uma linha que nenhuma venda usou. Em uso: `RATE_IN_USE` (use `novaVigenciaAction`). */
export async function editarTaxaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: EditarTaxaInput,
): Promise<ActionResult<TaxaView>> {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "editar uma taxa de cartão");
  if (neg) return neg;
  const atual = await acharTaxa(db, ator, id);
  if (!atual) return NAO_ACHADO("Taxa de cartão");
  const negLoja = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "editar uma taxa de cartão", atual.establishment_id);
  if (negLoja) return negLoja;
  if (atual._count.sale_payments > 0) return RECUSA_EM_USO("ser editada");

  const campos = validarCampos({
    brand: input?.brand ?? atual.brand,
    kind: input?.kind ?? atual.kind,
    installments_from: input?.installments_from ?? atual.installments_from,
    installments_to: input?.installments_to ?? atual.installments_to,
    fee_pct: input?.fee_pct ?? decToNum(atual.fee_pct),
    fee_fixed: input?.fee_fixed ?? decToNum(atual.fee_fixed),
    days: input?.days ?? atual.days,
    valid_from: input?.valid_from ?? atual.valid_from,
    valid_to: input && "valid_to" in input ? input.valid_to : atual.valid_to,
  });
  if (!campos.ok) return campos;
  const c = campos.data;
  const conta = await contaAtiva(db, input?.bank_account_id ?? atual.bank_account_id);
  if (!conta.ok) return conta;

  const nova = await runSerializableTenantTransaction(db, async (tx) => {
    const cruza = await acharSobreposicao(tx as unknown as TenantPrismaClient, {
      establishment_id: atual.establishment_id,
      acquirer_id: atual.acquirer_id,
      brand: c.brand,
      kind: c.kind,
      installments_from: c.installments_from,
      installments_to: c.installments_to,
      valid_from: c.valid_from,
      valid_to: c.valid_to,
      ignorar: [atual.id],
    });
    if (cruza) return null;
    const row = await tx.cardFeeRate.update({
      where: { id: atual.id },
      data: {
        brand: c.brand,
        kind: c.kind,
        installments_from: c.installments_from,
        installments_to: c.installments_to,
        fee_pct: c.fee_pct,
        fee_fixed: c.fee_fixed,
        days: c.days,
        bank_account_id: conta.data.id,
        valid_from: c.valid_from,
        valid_to: c.valid_to,
        updated_by_user_id: ator.id,
      },
      include: INCLUDE_TAXA,
    });
    await registrarNoHistorico(tx, ator, {
      action: "cartao.taxa.editar",
      establishment_id: atual.establishment_id,
      target_type: "taxa_cartao",
      target_id: row.id,
      summary: `Editou a taxa de ${ROTULO_FORMA[c.kind]}${fraseFaixa(c.kind, c.installments_from, c.installments_to)} ${rotuloBandeira(c.brand)} da ${atual.acquirer.name} na ${atual.establishment.name}: ${pct(c.fee_pct)} em ${c.days} ${c.days === 1 ? "dia" : "dias"}`,
      changes: diferencas(
        {
          brand: atual.brand,
          kind: atual.kind,
          de: atual.installments_from,
          ate: atual.installments_to,
          fee_pct: decToNum(atual.fee_pct),
          fee_fixed: decToNum(atual.fee_fixed),
          days: atual.days,
          conta: atual.bank_account.name,
          valid_from: diaDe(atual.valid_from),
          valid_to: atual.valid_to ? diaDe(atual.valid_to) : null,
        },
        {
          brand: c.brand,
          kind: c.kind,
          de: c.installments_from,
          ate: c.installments_to,
          fee_pct: c.fee_pct,
          fee_fixed: c.fee_fixed,
          days: c.days,
          conta: conta.data.name,
          valid_from: diaDe(c.valid_from),
          valid_to: c.valid_to ? diaDe(c.valid_to) : null,
        },
        {
          brand: "Bandeira",
          kind: "Modalidade",
          de: "Parcelas, de",
          ate: "Parcelas, até",
          fee_pct: "Taxa (%)",
          fee_fixed: "Valor fixo (R$)",
          days: "Prazo (dias)",
          conta: "Conta que recebe",
          valid_from: "Vale desde",
          valid_to: "Vale até",
        },
      ),
    });
    return row;
  });
  if (!nova) return RECUSA_SOBREPOSICAO();
  return ok((await viewsDasTaxas(db, ator, [nova as unknown as TaxaRow]))[0]);
}

/**
 * Apaga a linha que nenhuma venda usou. Em uso, só com `{ encerrar: true }`: a
 * linha fica no banco (o histórico da venda aponta para ela) e passa a valer
 * até ontem.
 */
export async function removerTaxaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  opts: { encerrar?: boolean } = {},
): Promise<ActionResult<{ id: string; encerrada: boolean }>> {
  const neg = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "remover uma taxa de cartão");
  if (neg) return neg;
  const atual = await acharTaxa(db, ator, id);
  if (!atual) return NAO_ACHADO("Taxa de cartão");
  const negLoja = await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], "remover uma taxa de cartão", atual.establishment_id);
  if (negLoja) return negLoja;

  const descricao = `${ROTULO_FORMA[atual.kind as Forma]}${fraseFaixa(atual.kind as Forma, atual.installments_from, atual.installments_to)} ${rotuloBandeira(atual.brand)} da ${atual.acquirer.name} na ${atual.establishment.name}`;

  if (atual._count.sale_payments === 0) {
    await db.$transaction(async (tx) => {
      await tx.cardFeeRate.delete({ where: { id: atual.id } });
      await registrarNoHistorico(tx, ator, {
        action: "cartao.taxa.remover",
        establishment_id: atual.establishment_id,
        target_type: "taxa_cartao",
        target_id: atual.id,
        summary: `Removeu a taxa de ${descricao}`,
      });
    });
    return ok({ id: atual.id, encerrada: false });
  }

  if (!opts?.encerrar) return RECUSA_EM_USO("ser removida");
  const ontem = somarDias(hojeEmBrasilia(), -1);
  if (atual.valid_to && atual.valid_to <= ontem) return ok({ id: atual.id, encerrada: true });
  if (atual.valid_from > ontem) {
    return fail(
      "VALIDATION_ERROR",
      "Esta taxa só começa a valer hoje ou depois e já foi usada: não dá para encerrá-la até ontem.",
      422,
    );
  }
  await db.$transaction(async (tx) => {
    await tx.cardFeeRate.update({ where: { id: atual.id }, data: { valid_to: ontem, updated_by_user_id: ator.id } });
    await registrarNoHistorico(tx, ator, {
      action: "cartao.taxa.remover",
      establishment_id: atual.establishment_id,
      target_type: "taxa_cartao",
      target_id: atual.id,
      summary: `Encerrou a taxa de ${descricao} em ${dataBr(diaDe(ontem))}`,
      changes: diferencas(
        { valid_to: atual.valid_to ? diaDe(atual.valid_to) : null },
        { valid_to: diaDe(ontem) },
        { valid_to: "Vale até" },
      ),
    });
  });
  return ok({ id: atual.id, encerrada: true });
}
