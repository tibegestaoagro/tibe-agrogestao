import { perRequestCache } from "@/lib/per-request-cache";
import type { TenantPrismaClient } from "@/lib/prisma";
import { fail } from "@/lib/actions/types";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Meu Empório, F6b (Q118 a Q133): quem é quem e o que cada um pode. É o único
 * lugar da tabela de permissão do Empório. O papel sai do banco a cada
 * request, nunca do JWT, para mudar na hora.
 */

export type PapelEmporio = "dono" | "gerente_geral" | "gestor" | "vendedor" | "caixa" | "financeiro";

/** Q129: as chaves de confiança do Vendedor, com o rótulo da tela. */
export const EMPORIO_KEYS = [
  { id: "devolver_trocar", label: "Devolver e trocar" },
  { id: "lancar_compra", label: "Lançar compra" },
  { id: "contagem", label: "Fazer contagem de estoque" },
  { id: "perda", label: "Registrar perda" },
  { id: "estoque_inicial", label: "Informar estoque inicial" },
  { id: "producao", label: "Registrar produção" },
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
  /** Q120 e Q190: todo membro da equipe do Empório (Gerente geral, Gestor, Vendedor, Caixa). */
  soDaLoja: boolean;
  /** Q190: usuário desativado (ou inexistente). Fica bloqueado: sem papel E só da loja, nunca liberado. */
  inativo?: boolean;
};

export type AtorPapel = { id: string; role?: AppUserRole };

const SEM_PAPEL: PapelContexto = { papel: null, lojas: new Set(), chaves: new Set(), soDaLoja: false };

/**
 * Q190: o desativado não é "sem papel". Sem papel libera a fazenda (é o usuário
 * do Tibé), e um Vendedor desativado com o cookie ainda válido ganharia a
 * fazenda. Bloqueado é: nenhuma ação do Empório (`papel` nulo) e a trava do só
 * da loja ligada para o resto.
 */
const BLOQUEADO: PapelContexto = { papel: null, lojas: new Set(), chaves: new Set(), soDaLoja: true, inativo: true };

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
    where: { id: userId },
    select: { active: true, role: true, emporio_role: true, emporio_keys: true },
  });
  if (!u || !u.active) return BLOQUEADO;
  if (u.role === "OWNER") return { papel: "dono", lojas: null, chaves: new Set(), soDaLoja: false };
  if (!u.emporio_role) return SEM_PAPEL;
  // Q190: toda a equipe do Empório é só do Empório, o Gerente geral inclusive.
  // Quem precisa da fazenda ganha outra conta, de usuário do Tibé.
  if (u.emporio_role === "gerente_geral") {
    return { papel: "gerente_geral", lojas: null, chaves: new Set(), soDaLoja: true };
  }
  // Q215: o Financeiro cuida do dinheiro de todas as lojas, sem vínculo com loja.
  if (u.emporio_role === "financeiro") {
    return { papel: "financeiro", lojas: null, chaves: new Set(), soDaLoja: true };
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
  /** Verdadeira para todo papel com Empório, menos o Caixa (que só vende, recebe fiado e opera o caixa). */
  | "fora_do_caixa"
  /** Quem muda o pedido para entrega: Dono e Gerente geral sempre; Gestor, Caixa e Vendedor nas lojas deles. */
  | "fatura_na_loja"
  /** Q215: mexer no dinheiro das lojas (pagar, receber, conciliar): Financeiro, Gerente geral e Dono. */
  | "dinheiro"
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
  if (acao === "dinheiro") return conta || c.papel === "financeiro";
  if (acao === "fora_do_caixa") return c.papel !== "caixa";
  if (c.papel === "financeiro") return false;
  if (conta) return true;
  if (acao === "gestor_da_loja") return c.papel === "gestor" && noAlcance(c, lojaId);
  if (acao === "vendedor_da_loja") return noAlcance(c, lojaId);
  if (acao === "fatura_na_loja") return noAlcance(c, lojaId);
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
  fora_do_caixa: "O acesso de caixa não inclui isso.",
  fatura_na_loja: "Seu acesso não permite fazer isso nessa loja.",
  dinheiro: "Só o financeiro, o gerente geral e o dono podem fazer isso.",
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
  if (oQue && acao === "dinheiro") {
    return fail("FORBIDDEN", `Só o financeiro, o gerente geral e o dono podem ${oQue}.`, 403);
  }
  if (oQue && acao === "gestor_da_loja") {
    return fail("FORBIDDEN", `Só o gestor da loja pode ${oQue}.`, 403);
  }
  // `fatura_na_loja`: toda função do Empório passa nas lojas dela, e a venda de outra loja já
  // é 404 na leitura. A recusa só sobra como defesa (conta sem função), então a frase é a
  // genérica de FRASES, sem listar quem pode.
  if (oQue && acao === "fatura_na_loja") {
    return fail("FORBIDDEN", `Seu acesso não permite ${oQue} nessa loja.`, 403);
  }
  return fail("FORBIDDEN", FRASES[acao] ?? "Você não tem permissão para isso.", 403);
}

/**
 * Recusa (403) só o Caixa. Para as leituras que já devolviam lista vazia a quem
 * não tem função: elas seguem assim, e o Caixa passa a receber a recusa.
 */
export async function recusarCaixa(db: TenantPrismaClient, ator: AtorPapel, oQue: string) {
  const c = await papelDoEmporio(db, ator);
  return c.papel === "caixa" ? fail("FORBIDDEN", `O acesso de caixa não inclui ${oQue}.`, 403) : null;
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

/** Nulo se ALGUMA das ações passa; senão a recusa da primeira da lista. */
export async function exigirUma(
  db: TenantPrismaClient,
  ator: AtorPapel,
  acoes: AcaoEmporio[],
  oQue?: string,
  lojaId?: string,
) {
  const c = await papelDoEmporio(db, ator);
  return acoes.some((a) => pode(c, a, lojaId)) ? null : recusaDe(acoes[0], oQue);
}
