import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { isoOrNull } from "@/lib/serialize";
import { exigir, papelDoEmporio, type AtorPapel } from "@/lib/emporio/papel";
import { diferencas, registrarNoHistorico } from "@/lib/emporio/historico";
import { decToNum } from "@/lib/serialize";
import { MENSAGEM_DE_COBRANCA_PADRAO } from "@/lib/emporio/fiado";

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
} | null;

function viewConfiguracoes(l: Linha): EmporioSettingsView {
  return {
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
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      return fail("VALIDATION_ERROR", "O limite padrão deve ser zero ou mais.", 422, "fiado_default_limit");
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
    const mudancas = diferencas(so({ ...antes }), so({ ...viewConfiguracoes(l) }), ROTULOS);
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
