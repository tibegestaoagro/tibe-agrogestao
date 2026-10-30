import { perRequestCache } from "@/lib/per-request-cache";
import type { TenantPrismaClient } from "@/lib/prisma";
import { fail } from "@/lib/actions/types";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Meu Empório, F6b (Q118 a Q133): quem é quem e o que cada um pode. É o único
 * lugar da tabela de permissão do Empório. O papel sai do banco a cada
 * request, nunca do JWT, para mudar na hora.
 */

export type PapelEmporio = "dono" | "gerente_geral" | "gestor" | "vendedor";

/** Q129: as chaves de confiança do Vendedor, com o rótulo da tela. */
export const EMPORIO_KEYS = [
  { id: "devolver_trocar", label: "Devolver e trocar" },
  { id: "lancar_compra", label: "Lançar compra" },
  { id: "contagem", label: "Fazer contagem de estoque" },
  { id: "perda", label: "Registrar perda" },
  { id: "estoque_inicial", label: "Informar estoque inicial" },
  { id: "producao", label: "Registrar produção" },
  { id: "transferir_caixa", label: "Levar a gaveta ao banco" },
  { id: "depositar_cheque", label: "Depositar cheque" },
  { id: "cadastrar_produto", label: "Cadastrar e editar produto" },
] as const;
export type EmporioKey = (typeof EMPORIO_KEYS)[number]["id"];
export const EMPORIO_KEY_IDS: readonly string[] = EMPORIO_KEYS.map((k) => k.id);

export type PapelContexto = {
  papel: PapelEmporio | null;
  /** Lojas do ator; nulo para Dono e Gerente geral, que veem todas. */
  lojas: Set<string> | null;
  chaves: Set<string>;
  /** Q120: Gestor, Vendedor, ou Gerente geral com `emporio_only`. */
  soDaLoja: boolean;
};

export type AtorPapel = { id: string; role?: AppUserRole };

const SEM_PAPEL: PapelContexto = { papel: null, lojas: new Set(), chaves: new Set(), soDaLoja: false };

/**
 * Memoizado por request. O client escopado não expõe o tenant, então ele entra
 * na chave por identidade: `prismaForTenant` devolve sempre o mesmo objeto por
 * tenant, e o `user_id` é string (e já pertence a um tenant só).
 */
const carregar = perRequestCache(async function carregarPapel(
  db: TenantPrismaClient,
  userId: string,
): Promise<PapelContexto> {
  const u = await db.user.findFirst({
    where: { id: userId, active: true },
    select: { role: true, emporio_role: true, emporio_only: true, emporio_keys: true },
  });
  if (!u) return SEM_PAPEL;
  if (u.role === "OWNER") return { papel: "dono", lojas: null, chaves: new Set(), soDaLoja: false };
  if (!u.emporio_role) return SEM_PAPEL;
  if (u.emporio_role === "gerente_geral") {
    return { papel: "gerente_geral", lojas: null, chaves: new Set(), soDaLoja: u.emporio_only };
  }
  const links = await db.userEstablishment.findMany({
    where: { user_id: userId },
    select: { establishment_id: true },
  });
  return {
    papel: u.emporio_role,
    lojas: new Set(links.map((l) => l.establishment_id)),
    chaves: new Set(u.emporio_role === "vendedor" ? u.emporio_keys : []),
    soDaLoja: true,
  };
});

export function papelDoEmporio(db: TenantPrismaClient, ator: AtorPapel): Promise<PapelContexto> {
  return carregar(db, ator.id);
}

export type AcaoEmporio =
  | "conta"
  | "gestor_da_loja"
  | "vendedor_da_loja"
  | `chave:${EmporioKey}`;

const noAlcance = (c: PapelContexto, lojaId?: string) => !lojaId || !c.lojas || c.lojas.has(lojaId);

/**
 * `lojaId` ausente significa "em alguma loja dele" (Gestor e Vendedor) e é
 * como se checa uma ação que não pertence a uma loja só.
 */
export function pode(c: PapelContexto, acao: AcaoEmporio, lojaId?: string): boolean {
  if (!c.papel) return false;
  const conta = c.papel === "dono" || c.papel === "gerente_geral";
  if (acao === "conta") return conta;
  if (conta) return true;
  if (acao === "gestor_da_loja") return c.papel === "gestor" && noAlcance(c, lojaId);
  if (acao === "vendedor_da_loja") return noAlcance(c, lojaId);
  const chave = acao.slice("chave:".length);
  if (c.papel === "gestor") return noAlcance(c, lojaId);
  return c.papel === "vendedor" && c.chaves.has(chave) && noAlcance(c, lojaId);
}

/** Lojas que o ator enxerga por inteiro: nulo = todas. Papel nulo não vê nenhuma. */
export function lojasDoPapel(c: PapelContexto): Set<string> | null {
  return c.papel ? c.lojas : new Set();
}

/** Q128: o Gestor lê o ESTOQUE de qualquer loja (só leitura). */
export function alcanceDeLeitura(c: PapelContexto): Set<string> | null {
  if (c.papel === "gestor") return null;
  return lojasDoPapel(c);
}

const FRASES: Record<string, string> = {
  conta: "Só o dono e o gerente geral podem fazer isso.",
  gestor_da_loja: "Só o gestor da loja, o gerente geral e o dono podem fazer isso.",
  vendedor_da_loja: "Seu acesso não permite fazer isso nessa loja.",
};

/** Frase de recusa por papel (403). `oQue` complementa: "cancelar uma venda". */
export function recusaDe(acao: AcaoEmporio, oQue?: string) {
  if (acao.startsWith("chave:")) {
    return fail(
      "FORBIDDEN",
      `Você não tem a chave para ${oQue ?? "fazer isso"}. Peça ao gestor da loja ou ao dono.`,
      403,
    );
  }
  if (oQue && acao === "conta") return fail("FORBIDDEN", `Só o dono e o gerente geral podem ${oQue}.`, 403);
  if (oQue && acao === "gestor_da_loja") {
    return fail("FORBIDDEN", `Só o gestor da loja pode ${oQue}.`, 403);
  }
  return fail("FORBIDDEN", FRASES[acao] ?? "Você não tem permissão para isso.", 403);
}

/**
 * Checa a permissão e devolve a recusa pronta (ou nulo quando pode):
 * `const neg = await exigir(db, ator, "conta", "criar um estabelecimento"); if (neg) return neg;`
 */
export async function exigir(
  db: TenantPrismaClient,
  ator: AtorPapel,
  acao: AcaoEmporio,
  oQue?: string,
  lojaId?: string,
) {
  const c = await papelDoEmporio(db, ator);
  return pode(c, acao, lojaId) ? null : recusaDe(acao, oQue);
}
