import type { Prisma } from "@/generated/prisma/client";
import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { papelDoEmporio } from "@/lib/emporio/papel";
import { ACOES_DO_HISTORICO, linkDoAlvo, rotuloDaAcao, type MudancaDoHistorico } from "@/lib/emporio/historico";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Meu Empório, F6b (Q134): a leitura do Histórico. Só leitura: nada aqui edita
 * ou apaga linha. Dono e Gerente geral leem tudo; o Gestor lê as lojas dele
 * (a linha sem loja fica de fora); o Vendedor e quem não tem função recebem 403.
 */

type Ator = { id: string; role: AppUserRole };

export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 200;

export type HistoricoFiltros = {
  user_id?: string | null;
  establishment_id?: string | null;
  /** Data e hora, ou AAAA-MM-DD (o dia inteiro, em Brasília). */
  de?: Date | string | null;
  ate?: Date | string | null;
  action?: string | null;
  cursor?: string | null;
  limite?: number | string | null;
};

export type HistoricoLinha = {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  establishment_id: string | null;
  establishment_name: string | null;
  action: string;
  action_label: string;
  target_type: string;
  target_id: string | null;
  summary: string;
  changes: MudancaDoHistorico[] | null;
  /** Caminho do painel para o alvo, quando existe tela. */
  link: string | null;
};

export type HistoricoPagina = { items: HistoricoLinha[]; next_cursor: string | null };

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const codificarCursor = (criada: Date, id: string) =>
  Buffer.from(`${criada.toISOString()}|${id}`, "utf8").toString("base64url");

function decodificarCursor(cursor: string): { criada: Date; id: string } | null {
  try {
    const texto = Buffer.from(cursor, "base64url").toString("utf8");
    const corte = texto.indexOf("|");
    if (corte < 1) return null;
    const criada = new Date(texto.slice(0, corte));
    const id = texto.slice(corte + 1);
    if (Number.isNaN(criada.getTime()) || !id) return null;
    return { criada, id };
  } catch {
    return null;
  }
}

/** Uma data do filtro: `Date`, ISO completo, ou AAAA-MM-DD (início ou fim do dia em Brasília). */
function lerData(v: unknown, fimDoDia: boolean): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (DIA_ISO.test(t)) {
    const d = new Date(`${t}${fimDoDia ? "T23:59:59.999" : "T00:00:00.000"}-03:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const vazio = (v: unknown) => v === undefined || v === null || v === "";

export async function listarHistoricoAction(
  db: TenantPrismaClient,
  ator: Ator,
  filtros: HistoricoFiltros = {},
): Promise<ActionResult<HistoricoPagina>> {
  const papel = await papelDoEmporio(db, ator);
  const conta = papel.papel === "dono" || papel.papel === "gerente_geral";
  if (!conta && papel.papel !== "gestor") {
    return fail("FORBIDDEN", "Só o dono, o gerente geral e o gestor podem ver o Histórico.", 403);
  }
  const f = filtros ?? {};

  for (const campo of ["user_id", "establishment_id", "action", "cursor"] as const) {
    const v = f[campo];
    if (!vazio(v) && typeof v !== "string") {
      return fail("VALIDATION_ERROR", "Filtro inválido.", 422, campo);
    }
  }
  if (!vazio(f.action) && !(String(f.action) in ACOES_DO_HISTORICO)) {
    return fail("VALIDATION_ERROR", "Escolha uma ação da lista.", 422, "action");
  }

  let de: Date | null = null;
  if (!vazio(f.de)) {
    de = lerData(f.de, false);
    if (!de) return fail("VALIDATION_ERROR", "Informe uma data inicial válida.", 422, "de");
  }
  let ate: Date | null = null;
  if (!vazio(f.ate)) {
    ate = lerData(f.ate, true);
    if (!ate) return fail("VALIDATION_ERROR", "Informe uma data final válida.", 422, "ate");
  }
  if (de && ate && de.getTime() > ate.getTime()) {
    return fail("VALIDATION_ERROR", "A data inicial vem depois da final.", 422, "de");
  }

  let limite = LIMITE_PADRAO;
  if (!vazio(f.limite)) {
    const n = typeof f.limite === "string" ? Number(f.limite) : f.limite;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
      return fail("VALIDATION_ERROR", "O limite deve ser um número inteiro de 1 em diante.", 422, "limite");
    }
    limite = Math.min(n, LIMITE_MAXIMO);
  }

  let corte: { criada: Date; id: string } | null = null;
  if (!vazio(f.cursor)) {
    corte = decodificarCursor(String(f.cursor));
    if (!corte) return fail("VALIDATION_ERROR", "O cursor é inválido.", 422, "cursor");
  }

  const condicoes: Prisma.EmporioAuditLogWhereInput[] = [];
  if (!conta) {
    // Gestor: só as lojas dele. A linha sem loja fica de fora (`in` não casa com nulo).
    condicoes.push({ establishment_id: { in: [...(papel.lojas ?? [])] } });
  }
  if (!vazio(f.user_id)) condicoes.push({ user_id: String(f.user_id) });
  if (!vazio(f.establishment_id)) condicoes.push({ establishment_id: String(f.establishment_id) });
  if (!vazio(f.action)) condicoes.push({ action: String(f.action) });
  if (de) condicoes.push({ created_at: { gte: de } });
  if (ate) condicoes.push({ created_at: { lte: ate } });
  if (corte) {
    condicoes.push({
      OR: [{ created_at: { lt: corte.criada } }, { created_at: corte.criada, id: { lt: corte.id } }],
    });
  }

  const linhas = await db.emporioAuditLog.findMany({
    where: condicoes.length > 0 ? { AND: condicoes } : {},
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limite + 1,
  });
  const temMais = linhas.length > limite;
  const pagina = temMais ? linhas.slice(0, limite) : linhas;

  const userIds = [...new Set(pagina.map((l) => l.user_id).filter((x): x is string => !!x))];
  const lojaIds = [...new Set(pagina.map((l) => l.establishment_id).filter((x): x is string => !!x))];
  const [usuarios, lojas] = await Promise.all([
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    lojaIds.length
      ? db.establishment.findMany({ where: { id: { in: lojaIds } }, select: { id: true, name: true } })
      : [],
  ]);
  const nomeDoUsuario = new Map(usuarios.map((u) => [u.id, u.name]));
  const nomeDaLoja = new Map(lojas.map((l) => [l.id, l.name]));

  const items: HistoricoLinha[] = pagina.map((l) => ({
    id: l.id,
    created_at: l.created_at.toISOString(),
    user_id: l.user_id,
    user_name: l.user_id ? (nomeDoUsuario.get(l.user_id) ?? null) : null,
    establishment_id: l.establishment_id,
    establishment_name: l.establishment_id ? (nomeDaLoja.get(l.establishment_id) ?? null) : null,
    action: l.action,
    action_label: rotuloDaAcao(l.action),
    target_type: l.target_type,
    target_id: l.target_id,
    summary: l.summary,
    changes: Array.isArray(l.changes) ? (l.changes as unknown as MudancaDoHistorico[]) : null,
    link: linkDoAlvo(l.target_type, l.target_id),
  }));
  const ultima = pagina[pagina.length - 1];
  return ok({ items, next_cursor: temMais && ultima ? codificarCursor(ultima.created_at, ultima.id) : null });
}
