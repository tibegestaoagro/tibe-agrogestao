import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { isoOrNull } from "@/lib/serialize";
import { exigir, papelDoEmporio, type AtorPapel } from "@/lib/emporio/papel";
import { dinheiro, diferencas, registrarNoHistorico } from "@/lib/emporio/historico";
import { decToNum } from "@/lib/serialize";
import { LIMITE_MAXIMO_DE_FIADO, MENSAGEM_DE_COBRANCA_PADRAO } from "@/lib/emporio/fiado";
import { ACOES_DE_ATALHO, ATALHOS_PADRAO, TECLAS_PERMITIDAS, type AcaoDeAtalho } from "@/lib/emporio/atalhos";

/**
 * Meu Empório, entrega 1: configurações da conta (validade e rodapé do papel,
 * largura da bobina, logo). Uma linha por conta, criada só na primeira gravação.
 */

type Ator = AtorPapel;

export type EmporioSettingsView = {
  quote_validity_days: number;
  quote_footer: string | null;
  sale_footer: string | null;
  receipt_width: 80 | 58;
  has_logo: boolean;
  logo_updated_at: string | null;
  /** Entrega 2 do financeiro: o prazo e o bloqueio do fiado, o limite padrão e o modelo da cobrança. */
  fiado_due_days: number;
  fiado_block_after_days: number;
  fiado_default_limit: number | null;
  fiado_collection_message: string | null;
  /** O modelo cru que vale (o próprio ou o padrão), sem trocar os marcadores. */
  fiado_collection_message_effective: string;
  /** Entrega 3 do financeiro: acima deste valor, quem não é da conta pede aprovação para pagar. Nulo: sem teto. */
  payment_approval_limit: number | null;
  /** Balcão rápido (Q361): a tecla de cada ação, a legenda e as medidas das etiquetas (mm). */
  shortcuts: Record<AcaoDeAtalho, string>;
  show_shortcut_legend: boolean;
  label_default_format: "a4" | "rolo";
  label_a4: {
    columns: number;
    rows: number;
    width: number;
    height: number;
    margin_top: number;
    margin_left: number;
    gap_x: number;
    gap_y: number;
  };
  label_roll: { width: number; height: number; columns: number; gap_x: number };
};

export type EmporioSettingsInput = Partial<{
  quote_validity_days: number;
  quote_footer: string | null;
  sale_footer: string | null;
  receipt_width: number;
}>;

const PADRAO = { quote_validity_days: 7, quote_footer: null, sale_footer: null, receipt_width: 80 } as const;
const LIMITE_LOGO = 200 * 1024;

const ROTULOS: Record<string, string> = {
  quote_validity_days: "Validade do orçamento (dias)",
  quote_footer: "Rodapé do orçamento",
  sale_footer: "Rodapé da venda",
  receipt_width: "Largura da bobina (mm)",
  fiado_due_days: "Prazo padrão do fiado (dias)",
  fiado_block_after_days: "Bloquear o fiado após (dias de atraso)",
  fiado_default_limit: "Limite padrão de fiado",
  fiado_collection_message: "Mensagem de cobrança",
  payment_approval_limit: "Teto sem aprovação",
};

type Linha = {
  quote_validity_days: number;
  quote_footer: string | null;
  sale_footer: string | null;
  receipt_width: number;
  logo_mime: string | null;
  logo_updated_at: Date | null;
  fiado_due_days: number;
  fiado_block_after_days: number;
  fiado_default_limit: unknown;
  fiado_collection_message: string | null;
  payment_approval_limit: unknown;
  shortcut_product: string;
  shortcut_customer: string;
  shortcut_seller: string;
  shortcut_payment: string;
  shortcut_close: string;
  show_shortcut_legend: boolean;
  label_default_format: string;
  label_a4_columns: number;
  label_a4_rows: number;
  label_a4_width: unknown;
  label_a4_height: unknown;
  label_a4_margin_top: unknown;
  label_a4_margin_left: unknown;
  label_a4_gap_x: unknown;
  label_a4_gap_y: unknown;
  label_roll_width: unknown;
  label_roll_height: unknown;
  label_roll_columns: number;
  label_roll_gap_x: unknown;
} | null;

/** Q361: as medidas de fábrica (modelo de 21 etiquetas na folha; 40 x 25 mm no rolo). */
const PADRAO_ETIQUETA = {
  a4: { columns: 3, rows: 7, width: 63.5, height: 38.1, margin_top: 15.15, margin_left: 7.2, gap_x: 2.5, gap_y: 0 },
  roll: { width: 40, height: 25, columns: 1, gap_x: 2 },
} as const;

const medida = (v: unknown, padrao: number): number => decToNum(v as never) ?? padrao;

function viewConfiguracoes(l: Linha): EmporioSettingsView {
  const a4 = PADRAO_ETIQUETA.a4;
  const rolo = PADRAO_ETIQUETA.roll;
  return {
    shortcuts: {
      produto: l?.shortcut_product ?? ATALHOS_PADRAO.produto,
      cliente: l?.shortcut_customer ?? ATALHOS_PADRAO.cliente,
      vendedor: l?.shortcut_seller ?? ATALHOS_PADRAO.vendedor,
      pagamento: l?.shortcut_payment ?? ATALHOS_PADRAO.pagamento,
      fechar: l?.shortcut_close ?? ATALHOS_PADRAO.fechar,
    },
    show_shortcut_legend: l?.show_shortcut_legend ?? true,
    label_default_format: l?.label_default_format === "rolo" ? "rolo" : "a4",
    label_a4: {
      columns: l?.label_a4_columns ?? a4.columns,
      rows: l?.label_a4_rows ?? a4.rows,
      width: medida(l?.label_a4_width, a4.width),
      height: medida(l?.label_a4_height, a4.height),
      margin_top: medida(l?.label_a4_margin_top, a4.margin_top),
      margin_left: medida(l?.label_a4_margin_left, a4.margin_left),
      gap_x: medida(l?.label_a4_gap_x, a4.gap_x),
      gap_y: medida(l?.label_a4_gap_y, a4.gap_y),
    },
    label_roll: {
      width: medida(l?.label_roll_width, rolo.width),
      height: medida(l?.label_roll_height, rolo.height),
      columns: l?.label_roll_columns ?? rolo.columns,
      gap_x: medida(l?.label_roll_gap_x, rolo.gap_x),
    },
    quote_validity_days: l?.quote_validity_days ?? PADRAO.quote_validity_days,
    quote_footer: l?.quote_footer ?? null,
    sale_footer: l?.sale_footer ?? null,
    receipt_width: l?.receipt_width === 58 ? 58 : 80,
    has_logo: !!l?.logo_mime,
    logo_updated_at: isoOrNull(l?.logo_updated_at ?? null),
    fiado_due_days: l?.fiado_due_days ?? 30,
    fiado_block_after_days: l?.fiado_block_after_days ?? 15,
    fiado_default_limit: decToNum(l?.fiado_default_limit as never) ?? null,
    fiado_collection_message: l?.fiado_collection_message ?? null,
    payment_approval_limit: decToNum(l?.payment_approval_limit as never) ?? null,
    fiado_collection_message_effective: l?.fiado_collection_message ?? MENSAGEM_DE_COBRANCA_PADRAO,
  };
}

const SELECAO = {
  quote_validity_days: true,
  quote_footer: true,
  sale_footer: true,
  receipt_width: true,
  logo_mime: true,
  logo_updated_at: true,
  fiado_due_days: true,
  fiado_block_after_days: true,
  fiado_default_limit: true,
  fiado_collection_message: true,
  payment_approval_limit: true,
  shortcut_product: true,
  shortcut_customer: true,
  shortcut_seller: true,
  shortcut_payment: true,
  shortcut_close: true,
  show_shortcut_legend: true,
  label_default_format: true,
  label_a4_columns: true,
  label_a4_rows: true,
  label_a4_width: true,
  label_a4_height: true,
  label_a4_margin_top: true,
  label_a4_margin_left: true,
  label_a4_gap_x: true,
  label_a4_gap_y: true,
  label_roll_width: true,
  label_roll_height: true,
  label_roll_columns: true,
  label_roll_gap_x: true,
} as const;

export async function lerConfiguracoesAction(
  db: TenantPrismaClient,
  ator: Ator,
): Promise<ActionResult<EmporioSettingsView>> {
  const c = await papelDoEmporio(db, ator);
  if (!c.papel) return fail("FORBIDDEN", "Você não tem permissão para isso.", 403);
  const l = await db.emporioSettings.findFirst({ select: SELECAO });
  return ok(viewConfiguracoes(l));
}

export async function salvarConfiguracoesAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: EmporioSettingsInput,
): Promise<ActionResult<EmporioSettingsView>> {
  const neg = await exigir(db, ator, "conta", "alterar as configurações do Empório");
  if (neg) return neg;

  const dados: Record<string, unknown> = {};
  if (input.quote_validity_days !== undefined) {
    const d = input.quote_validity_days;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > 365) {
      return fail("VALIDATION_ERROR", "A validade deve ser de 1 a 365 dias.", 422, "quote_validity_days");
    }
    dados.quote_validity_days = d;
  }
  for (const campo of ["quote_footer", "sale_footer"] as const) {
    const v = input[campo];
    if (v === undefined) continue;
    const texto = v === null ? "" : typeof v === "string" ? v.trim() : null;
    if (texto === null || texto.length > 500) {
      return fail("VALIDATION_ERROR", "O rodapé aceita até 500 caracteres.", 422, campo);
    }
    dados[campo] = texto || null;
  }
  if (input.receipt_width !== undefined) {
    if (input.receipt_width !== 80 && input.receipt_width !== 58) {
      return fail("VALIDATION_ERROR", "Escolha a largura da bobina: 80 ou 58 mm.", 422, "receipt_width");
    }
    dados.receipt_width = input.receipt_width;
  }

  const antes = await db.emporioSettings.findFirst({ select: SELECAO });
  const linhaAntes = viewConfiguracoes(antes);
  const depois = await db.$transaction(async (tx) => {
    const l = await tx.emporioSettings.upsert({
      where: scoped({}),
      create: scoped({ ...dados }),
      update: dados,
      select: SELECAO,
    });
    const mudancas = diferencas(
      { ...linhaAntes },
      { ...viewConfiguracoes(l) },
      ROTULOS,
    );
    if (mudancas.length > 0) {
      await registrarNoHistorico(tx, ator, {
        action: "configuracoes.editar",
        target_type: "configuracoes",
        summary: "Editou as configurações do Empório",
        changes: mudancas,
      });
    }
    return l;
  });
  return ok(viewConfiguracoes(depois));
}

export type ConfiguracoesDoFiadoInput = Partial<{
  fiado_due_days: number;
  fiado_block_after_days: number;
  fiado_default_limit: number | null;
  fiado_collection_message: string | null;
}>;

const CAMPOS_DO_FIADO = ["fiado_due_days", "fiado_block_after_days", "fiado_default_limit", "fiado_collection_message"];

/** Prazo, bloqueio por atraso, limite padrão e modelo da cobrança do fiado. Só o dinheiro (Financeiro, Gerente geral, Dono). */
export async function salvarConfiguracoesDoFiadoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ConfiguracoesDoFiadoInput,
): Promise<ActionResult<EmporioSettingsView>> {
  const neg = await exigir(db, ator, "dinheiro", "alterar as configurações do fiado");
  if (neg) return neg;

  const dados: Record<string, unknown> = {};
  const dias: [keyof ConfiguracoesDoFiadoInput, string][] = [
    ["fiado_due_days", "O prazo padrão deve ser de 1 a 365 dias."],
    ["fiado_block_after_days", "O bloqueio deve ser de 1 a 365 dias de atraso."],
  ];
  for (const [campo, msg] of dias) {
    const v = input[campo];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 365) {
      return fail("VALIDATION_ERROR", msg, 422, campo);
    }
    dados[campo] = v;
  }
  if (input.fiado_default_limit !== undefined) {
    const v = input.fiado_default_limit;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > LIMITE_MAXIMO_DE_FIADO)) {
      return fail("VALIDATION_ERROR", "O limite padrão deve ser de zero a R$ 99.999.999,99.", 422, "fiado_default_limit");
    }
    dados.fiado_default_limit = v === null ? null : Math.round(Number((v * 100).toPrecision(12))) / 100;
  }
  if (input.fiado_collection_message !== undefined) {
    const v = input.fiado_collection_message;
    const texto = v === null ? "" : typeof v === "string" ? v.trim() : null;
    if (texto === null || texto.length > 500) {
      return fail("VALIDATION_ERROR", "A mensagem de cobrança aceita até 500 caracteres.", 422, "fiado_collection_message");
    }
    dados.fiado_collection_message = texto || null;
  }

  const antes = viewConfiguracoes(await db.emporioSettings.findFirst({ select: SELECAO }));
  const depois = await db.$transaction(async (tx) => {
    const l = await tx.emporioSettings.upsert({
      where: scoped({}),
      create: scoped({ ...dados }),
      update: dados,
      select: SELECAO,
    });
    const so = (v: Record<string, unknown>) => Object.fromEntries(CAMPOS_DO_FIADO.map((c) => [c, v[c]]));
    const mudancas = diferencas(so({ ...antes }), so({ ...viewConfiguracoes(l) }), ROTULOS, {
      fiado_default_limit: (v) => (v == null ? null : dinheiro(Number(v))),
    });
    if (mudancas.length > 0) {
      await registrarNoHistorico(tx, ator, {
        action: "configuracoes.editar",
        target_type: "configuracoes",
        summary: "Editou as configurações do fiado",
        changes: mudancas,
      });
    }
    return l;
  });
  return ok(viewConfiguracoes(depois));
}

/** Q227: o teto do pagamento sem aprovação. Só a conta (Dono e Gerente geral) o define, porque ele limita quem não é dela. */
export async function salvarAlcadaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { payment_approval_limit: number | null },
): Promise<ActionResult<EmporioSettingsView>> {
  const neg = await exigir(db, ator, "conta", "definir o teto de pagamento sem aprovação");
  if (neg) return neg;

  const v = input?.payment_approval_limit;
  if (v === undefined || (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0.01 || v > LIMITE_MAXIMO_DE_FIADO))) {
    return fail("VALIDATION_ERROR", "O teto deve ser de R$ 0,01 a R$ 99.999.999,99, ou vazio para não ter teto.", 422, "payment_approval_limit");
  }
  const valor = v === null ? null : Math.round(Number((v * 100).toPrecision(12))) / 100;

  const antes = viewConfiguracoes(await db.emporioSettings.findFirst({ select: SELECAO }));
  const depois = await db.$transaction(async (tx) => {
    const l = await tx.emporioSettings.upsert({
      where: scoped({}),
      create: scoped({ payment_approval_limit: valor }),
      update: { payment_approval_limit: valor },
      select: SELECAO,
    });
    const mudancas = diferencas(
      { payment_approval_limit: antes.payment_approval_limit },
      { payment_approval_limit: viewConfiguracoes(l).payment_approval_limit },
      { payment_approval_limit: ROTULOS.payment_approval_limit },
      { payment_approval_limit: (x) => (x == null ? null : dinheiro(Number(x))) },
    );
    if (mudancas.length > 0) {
      await registrarNoHistorico(tx, ator, {
        action: "configuracoes.editar",
        target_type: "configuracoes",
        summary: "Editou o teto de pagamento sem aprovação",
        changes: mudancas,
      });
    }
    return l;
  });
  return ok(viewConfiguracoes(depois));
}

export type ConfiguracoesDoBalcaoInput = Partial<{
  shortcut_product: string;
  shortcut_customer: string;
  shortcut_seller: string;
  shortcut_payment: string;
  shortcut_close: string;
  show_shortcut_legend: boolean;
  label_default_format: string;
  label_a4_columns: number;
  label_a4_rows: number;
  label_a4_width: number;
  label_a4_height: number;
  label_a4_margin_top: number;
  label_a4_margin_left: number;
  label_a4_gap_x: number;
  label_a4_gap_y: number;
  label_roll_width: number;
  label_roll_height: number;
  label_roll_columns: number;
  label_roll_gap_x: number;
}>;

const CAMPO_DO_ATALHO: Record<AcaoDeAtalho, keyof ConfiguracoesDoBalcaoInput> = {
  produto: "shortcut_product",
  cliente: "shortcut_customer",
  vendedor: "shortcut_seller",
  pagamento: "shortcut_payment",
  fechar: "shortcut_close",
};

const ROTULOS_DO_BALCAO: Record<string, string> = {
  shortcut_product: "Atalho: produto",
  shortcut_customer: "Atalho: cliente",
  shortcut_seller: "Atalho: vendedor",
  shortcut_payment: "Atalho: pagamento",
  shortcut_close: "Atalho: fechar a venda",
  show_shortcut_legend: "Legenda dos atalhos",
  label_default_format: "Formato padrão da etiqueta",
  label_a4_columns: "Folha A4: colunas",
  label_a4_rows: "Folha A4: linhas",
  label_a4_width: "Folha A4: largura da etiqueta (mm)",
  label_a4_height: "Folha A4: altura da etiqueta (mm)",
  label_a4_margin_top: "Folha A4: margem de cima (mm)",
  label_a4_margin_left: "Folha A4: margem da esquerda (mm)",
  label_a4_gap_x: "Folha A4: espaço entre colunas (mm)",
  label_a4_gap_y: "Folha A4: espaço entre linhas (mm)",
  label_roll_width: "Rolo: largura da etiqueta (mm)",
  label_roll_height: "Rolo: altura da etiqueta (mm)",
  label_roll_columns: "Rolo: colunas",
  label_roll_gap_x: "Rolo: espaço entre colunas (mm)",
};

/** A visão achatada, com os nomes planos do PATCH (a que o Histórico compara). */
function planosDoBalcao(v: EmporioSettingsView): Record<string, unknown> {
  return {
    shortcut_product: v.shortcuts.produto,
    shortcut_customer: v.shortcuts.cliente,
    shortcut_seller: v.shortcuts.vendedor,
    shortcut_payment: v.shortcuts.pagamento,
    shortcut_close: v.shortcuts.fechar,
    show_shortcut_legend: v.show_shortcut_legend,
    label_default_format: v.label_default_format,
    label_a4_columns: v.label_a4.columns,
    label_a4_rows: v.label_a4.rows,
    label_a4_width: v.label_a4.width,
    label_a4_height: v.label_a4.height,
    label_a4_margin_top: v.label_a4.margin_top,
    label_a4_margin_left: v.label_a4.margin_left,
    label_a4_gap_x: v.label_a4.gap_x,
    label_a4_gap_y: v.label_a4.gap_y,
    label_roll_width: v.label_roll.width,
    label_roll_height: v.label_roll.height,
    label_roll_columns: v.label_roll.columns,
    label_roll_gap_x: v.label_roll.gap_x,
  };
}

const LARGURA_DA_FOLHA = 210;
const ALTURA_DA_FOLHA = 297;
const MAXIMO_DE_MEDIDA = 9999.99;

/** Medida em mm com 2 casas: positiva (ou, para margem e espaço, a partir de zero). Devolve o número, ou a mensagem. */
function lerMedida(v: unknown, minimoZero: boolean): { valor: number } | { mensagem: string } {
  if (typeof v !== "number" || !Number.isFinite(v)) return { mensagem: "Informe a medida em milímetros." };
  if (minimoZero ? v < 0 : v <= 0) {
    return { mensagem: minimoZero ? "A medida não pode ser negativa." : "A medida deve ser maior que zero." };
  }
  if (v > MAXIMO_DE_MEDIDA) return { mensagem: "A medida deve ser de até 9.999,99 mm." };
  return { valor: Math.round(Number((v * 100).toPrecision(12))) / 100 };
}

function lerInteiro(v: unknown, min: number, max: number, mensagem: string): { valor: number } | { mensagem: string } {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return { mensagem };
  return { valor: v };
}

/**
 * Q361: teclas dos atalhos, legenda e medidas das etiquetas. Só a conta (Dono e
 * Gerente geral). Cada campo recusa no próprio nome; a conferência da grade
 * usa o valor que vai valer (o novo, ou o que já estava gravado).
 */
export async function salvarConfiguracoesDoBalcaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ConfiguracoesDoBalcaoInput,
): Promise<ActionResult<EmporioSettingsView>> {
  const neg = await exigir(db, ator, "conta", "alterar o balcão e as etiquetas");
  if (neg) return neg;

  const antes = viewConfiguracoes(await db.emporioSettings.findFirst({ select: SELECAO }));
  const dados: Record<string, unknown> = {};
  const recusa = (campo: string, mensagem: string) => fail("VALIDATION_ERROR", mensagem, 422, campo);

  // Teclas: da lista, e sem repetir entre as ações (o que vale = o novo, ou o gravado).
  const efetivas: Record<string, string> = {};
  for (const acao of ACOES_DE_ATALHO) {
    const campo = CAMPO_DO_ATALHO[acao];
    const v = input[campo];
    if (v !== undefined) {
      if (typeof v !== "string" || !TECLAS_PERMITIDAS.includes(v)) {
        return recusa(campo, "Escolha uma tecla da lista.");
      }
      dados[campo] = v;
    }
    efetivas[campo] = (v as string | undefined) ?? antes.shortcuts[acao];
  }
  for (let i = 0; i < ACOES_DE_ATALHO.length; i++) {
    for (let j = 0; j < i; j++) {
      const campoI = CAMPO_DO_ATALHO[ACOES_DE_ATALHO[i]] as string;
      const campoJ = CAMPO_DO_ATALHO[ACOES_DE_ATALHO[j]] as string;
      if (efetivas[campoI] !== efetivas[campoJ]) continue;
      // A recusa vai no campo da segunda; se só a primeira veio no pedido, vai nela.
      const alvo = campoI in dados || !(campoJ in dados) ? campoI : campoJ;
      return recusa(alvo, `A tecla ${efetivas[campoI]} já está em outra ação.`);
    }
  }

  if (input.show_shortcut_legend !== undefined) {
    if (typeof input.show_shortcut_legend !== "boolean") {
      return recusa("show_shortcut_legend", "Informe se a legenda aparece ou não.");
    }
    dados.show_shortcut_legend = input.show_shortcut_legend;
  }
  if (input.label_default_format !== undefined) {
    if (input.label_default_format !== "a4" && input.label_default_format !== "rolo") {
      return recusa("label_default_format", "Escolha folha A4 ou rolo.");
    }
    dados.label_default_format = input.label_default_format;
  }

  const inteiros: [keyof ConfiguracoesDoBalcaoInput, number, number, string][] = [
    ["label_a4_columns", 1, 20, "Informe de 1 a 20 colunas."],
    ["label_a4_rows", 1, 50, "Informe de 1 a 50 linhas."],
    ["label_roll_columns", 1, 3, "O rolo tem de 1 a 3 colunas."],
  ];
  for (const [campo, min, max, msg] of inteiros) {
    if (input[campo] === undefined) continue;
    const r = lerInteiro(input[campo], min, max, msg);
    if ("mensagem" in r) return recusa(campo, r.mensagem);
    dados[campo] = r.valor;
  }
  const medidas: [keyof ConfiguracoesDoBalcaoInput, boolean][] = [
    ["label_a4_width", false],
    ["label_a4_height", false],
    ["label_a4_margin_top", true],
    ["label_a4_margin_left", true],
    ["label_a4_gap_x", true],
    ["label_a4_gap_y", true],
    ["label_roll_width", false],
    ["label_roll_height", false],
    ["label_roll_gap_x", true],
  ];
  for (const [campo, aceitaZero] of medidas) {
    if (input[campo] === undefined) continue;
    const r = lerMedida(input[campo], aceitaZero);
    if ("mensagem" in r) return recusa(campo, r.mensagem);
    dados[campo] = r.valor;
  }

  // A grade da folha tem de caber nos 210 x 297 mm, com o que vai valer depois da gravação.
  const planoAntes = planosDoBalcao(antes);
  const v = (campo: string) => (dados[campo] ?? planoAntes[campo]) as number;
  const largura = v("label_a4_margin_left") + v("label_a4_columns") * v("label_a4_width") + (v("label_a4_columns") - 1) * v("label_a4_gap_x");
  if (largura > LARGURA_DA_FOLHA + 1e-9) {
    return recusa("label_a4_width", `A grade não cabe na folha: as colunas ocupam ${numeroBR(largura)} mm de ${LARGURA_DA_FOLHA}.`);
  }
  const altura = v("label_a4_margin_top") + v("label_a4_rows") * v("label_a4_height") + (v("label_a4_rows") - 1) * v("label_a4_gap_y");
  if (altura > ALTURA_DA_FOLHA + 1e-9) {
    return recusa("label_a4_height", `A grade não cabe na folha: as linhas ocupam ${numeroBR(altura)} mm de ${ALTURA_DA_FOLHA}.`);
  }

  const depois = await db.$transaction(async (tx) => {
    const l = await tx.emporioSettings.upsert({
      where: scoped({}),
      create: scoped({ ...dados }),
      update: dados,
      select: SELECAO,
    });
    const mudancas = diferencas(planoAntes, planosDoBalcao(viewConfiguracoes(l)), ROTULOS_DO_BALCAO, {
      show_shortcut_legend: (x) => (x ? "Ligada" : "Desligada"),
      label_default_format: (x) => (x === "rolo" ? "Rolo" : "Folha A4"),
    });
    if (mudancas.length > 0) {
      await registrarNoHistorico(tx, ator, {
        action: "configuracoes.balcao",
        target_type: "configuracoes",
        summary: "Editou o balcão e as etiquetas",
        changes: mudancas,
      });
    }
    return l;
  });
  return ok(viewConfiguracoes(depois));
}

function numeroBR(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function assinatura(b: Buffer): "image/png" | "image/jpeg" | null {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

export async function salvarLogoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { data_base64: string; mime: string },
): Promise<ActionResult<EmporioSettingsView>> {
  const neg = await exigir(db, ator, "conta", "alterar o logo do Empório");
  if (neg) return neg;

  const bytes = Buffer.from(typeof input.data_base64 === "string" ? input.data_base64 : "", "base64");
  const mime = assinatura(bytes);
  if (!mime) return fail("VALIDATION_ERROR", "O logo deve ser PNG ou JPEG.", 422, "logo");
  if (bytes.length > LIMITE_LOGO) return fail("VALIDATION_ERROR", "O logo deve ter até 200 KB.", 422, "logo");

  const agora = new Date();
  const l = await db.$transaction(async (tx) => {
    const linha = await tx.emporioSettings.upsert({
      where: scoped({}),
      create: scoped({ logo: bytes, logo_mime: mime, logo_updated_at: agora }),
      update: { logo: bytes, logo_mime: mime, logo_updated_at: agora },
      select: SELECAO,
    });
    await registrarNoHistorico(tx, ator, {
      action: "configuracoes.logo",
      target_type: "configuracoes",
      summary: "Trocou o logo do Empório",
    });
    return linha;
  });
  return ok(viewConfiguracoes(l));
}

export async function removerLogoAction(
  db: TenantPrismaClient,
  ator: Ator,
): Promise<ActionResult<EmporioSettingsView>> {
  const neg = await exigir(db, ator, "conta", "alterar o logo do Empório");
  if (neg) return neg;

  const atual = await db.emporioSettings.findFirst({ select: SELECAO });
  if (!atual?.logo_mime) return ok(viewConfiguracoes(atual));
  const l = await db.$transaction(async (tx) => {
    const linha = await tx.emporioSettings.update({
      where: scoped({}),
      data: { logo: null, logo_mime: null, logo_updated_at: null },
      select: SELECAO,
    });
    await registrarNoHistorico(tx, ator, {
      action: "configuracoes.logo",
      target_type: "configuracoes",
      summary: "Removeu o logo do Empório",
    });
    return linha;
  });
  return ok(viewConfiguracoes(l));
}

/** Para a rota GET: qualquer papel no Empório lê; sem logo gravado, 404. */
export async function lerLogoAction(
  db: TenantPrismaClient,
  ator: Ator,
): Promise<ActionResult<{ bytes: Uint8Array; mime: string }>> {
  const c = await papelDoEmporio(db, ator);
  if (!c.papel) return fail("FORBIDDEN", "Você não tem permissão para isso.", 403);
  const logo = await lerLogo(db);
  if (!logo) return fail("NOT_FOUND", "Esta conta ainda não tem logo.", 404);
  return ok(logo);
}

/** Sem permissão própria: a rota GET exige papel no Empório. */
export async function lerLogo(db: TenantPrismaClient): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const l = await db.emporioSettings.findFirst({ select: { logo: true, logo_mime: true } });
  if (!l?.logo || !l.logo_mime) return null;
  return { bytes: l.logo, mime: l.logo_mime };
}
