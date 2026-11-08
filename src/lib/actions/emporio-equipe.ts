import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { inviteUserAction } from "@/lib/actions/users";
import { checkSeatAvailable, getSeatUsage, type SeatUsage } from "@/lib/seats";
import { EMPORIO_KEYS, EMPORIO_KEY_IDS, exigir, papelDoEmporio, type PapelEmporio } from "@/lib/emporio/papel";
import { diferencas, registrarNoHistorico } from "@/lib/emporio/historico";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Meu Empório, F6b: a Equipe (Módulo 39, Q118, Q129, Q133, Q190). Só Dono e
 * Gerente geral. A validação é em TypeScript puro de propósito: o WhatsApp
 * chama estas mesmas funções sem passar pelo Zod da rota.
 *
 * Q190: a equipe do Empório (quem tem `emporio_role`) é separada dos usuários
 * do Tibé. Conta no limite próprio (`EMPORIO_SEATS`), não no do plano; a
 * Equipe não dá função a um usuário do Tibé; e tirar da equipe DESATIVA a
 * pessoa, guardando função, chaves e lojas para o Reativar. Toda a equipe é só
 * do Empório, o Gerente geral inclusive (`emporio_only` do pedido é ignorado).
 */

type Ator = { id: string; role: AppUserRole };

type FuncaoEmporio = Exclude<PapelEmporio, "dono">;
const FUNCOES: readonly string[] = ["gerente_geral", "financeiro", "gestor", "vendedor", "caixa"];

/** Q118: o papel da conta acompanha a função (Gerente geral é ADMIN, o resto OPERADOR). */
const roleDaFuncao = (f: FuncaoEmporio): AppUserRole => (f === "gerente_geral" ? "ADMIN" : "OPERADOR");

export type MembroView = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: AppUserRole;
  emporio_role: FuncaoEmporio | null;
  emporio_only: boolean;
  emporio_keys: string[];
  establishment_ids: string[];
};

export type EquipeView = {
  /** Os ativos da equipe, mais o Dono (que não conta no limite do Empório). */
  users: MembroView[];
  /** Q190: quem saiu da equipe, desativado, com função, chaves e lojas guardadas para o Reativar. */
  inactive_users: MembroView[];
  /** O limite da equipe do Empório (`EMPORIO_SEATS`), não o do plano. */
  seats: SeatUsage;
  establishments: { id: string; name: string }[];
};

type EstadoFinal = {
  emporio_role: FuncaoEmporio;
  establishment_ids: string[];
  emporio_keys: string[];
  emporio_only: boolean;
};

async function exigirConta(db: TenantPrismaClient, ator: Ator, oQue: string) {
  return exigir(db, ator, "conta", oQue);
}

const NOME_DA_FUNCAO: Record<string, string> = {
  gerente_geral: "gerente geral",
  financeiro: "financeiro",
  gestor: "gestor",
  vendedor: "vendedor",
  caixa: "caixa",
};

const ROTULOS_EQUIPE: Record<string, string> = {
  funcao: "Função",
  lojas: "Lojas",
  chaves: "Chaves ligadas",
  so_emporio: "Acesso só ao Empório",
};

type FotoDoMembro = {
  emporio_role: string | null;
  emporio_only: boolean;
  emporio_keys: string[];
  establishment_ids: string[];
};

/** O estado do membro em palavras (função, lojas pelo nome, chaves pelo rótulo), para o antes e o depois. */
async function fotoEmTexto(db: Pick<TenantPrismaClient, "establishment">, f: FotoDoMembro) {
  const lojas = f.establishment_ids.length
    ? await db.establishment.findMany({ where: { id: { in: f.establishment_ids } }, select: { name: true } })
    : [];
  const rotuloDaChave = (id: string) => EMPORIO_KEYS.find((k) => k.id === id)?.label ?? id;
  return {
    funcao: f.emporio_role ? (NOME_DA_FUNCAO[f.emporio_role] ?? f.emporio_role) : "sem função",
    lojas: lojas.map((l) => l.name).sort((a, b) => a.localeCompare(b, "pt-BR")),
    chaves: EMPORIO_KEY_IDS.filter((id) => f.emporio_keys.includes(id)).map(rotuloDaChave),
    so_emporio: f.emporio_only,
  };
}

const ehFuncao = (v: unknown): v is FuncaoEmporio => typeof v === "string" && FUNCOES.includes(v);

/**
 * Confere o estado FINAL (o que ficaria gravado) e devolve a recusa no campo,
 * ou null. Serve ao cadastro e à alteração: a regra é uma só.
 */
async function validarEstado(
  db: TenantPrismaClient,
  e: { emporio_role: unknown; establishment_ids: unknown; emporio_keys: unknown },
) {
  if (!ehFuncao(e.emporio_role)) {
    return fail("VALIDATION_ERROR", "Escolha a função: gerente geral, financeiro, gestor, vendedor ou caixa.", 422, "emporio_role");
  }
  const funcao = e.emporio_role;

  if (e.emporio_keys !== undefined && !Array.isArray(e.emporio_keys)) {
    return fail("VALIDATION_ERROR", "As chaves precisam ser uma lista.", 422, "emporio_keys");
  }
  const chaves = (e.emporio_keys as unknown[] | undefined) ?? [];
  if (chaves.some((k) => typeof k !== "string" || !EMPORIO_KEY_IDS.includes(k))) {
    return fail("VALIDATION_ERROR", "Há uma chave que não existe.", 422, "emporio_keys");
  }
  if (chaves.length > 0 && funcao !== "vendedor") {
    return fail("VALIDATION_ERROR", "Só o vendedor recebe chaves. O caixa não tem chaves.", 422, "emporio_keys");
  }

  if (funcao !== "gerente_geral" && funcao !== "financeiro") {
    const ids = e.establishment_ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((i) => typeof i !== "string")) {
      return fail("VALIDATION_ERROR", "Escolha pelo menos uma loja.", 422, "establishment_ids");
    }
    const unicos = [...new Set(ids as string[])];
    const achadas = await db.establishment.count({ where: { id: { in: unicos }, archived_at: null } });
    if (achadas !== unicos.length) {
      return fail("VALIDATION_ERROR", "Há uma loja que não existe ou está arquivada.", 422, "establishment_ids");
    }
  }
  return null;
}

/**
 * Q132: ids das lojas (entre as pedidas) que não têm nenhum Gestor ATIVO
 * vinculado. Só aviso: nada bloqueia por causa disso.
 */
export async function lojasSemGestor(db: TenantPrismaClient, lojaIds: string[]): Promise<Set<string>> {
  if (lojaIds.length === 0) return new Set();
  const comGestor = await db.userEstablishment.findMany({
    where: { establishment_id: { in: lojaIds }, user: { active: true, emporio_role: "gestor" } },
    select: { establishment_id: true },
  });
  const cobertas = new Set(comGestor.map((v) => v.establishment_id));
  return new Set(lojaIds.filter((id) => !cobertas.has(id)));
}

async function tenantDoAtor(db: TenantPrismaClient, ator: Ator): Promise<string | null> {
  const u = await db.user.findFirst({ where: { id: ator.id }, select: { tenant_id: true } });
  return u?.tenant_id ?? null;
}

export async function listarEquipeAction(db: TenantPrismaClient, ator: Ator): Promise<ActionResult<EquipeView>> {
  const neg = await exigirConta(db, ator, "ver a equipe");
  if (neg) return neg;
  const tenantId = await tenantDoAtor(db, ator);
  if (!tenantId) return fail("NOT_FOUND", "Usuário não encontrado.", 404);

  const [ativos, desativados, vinculos, lojas, seats] = await Promise.all([
    db.user.findMany({
      where: { active: true, OR: [{ emporio_role: { not: null } }, { role: "OWNER" }] },
      orderBy: { created_at: "asc" },
    }),
    db.user.findMany({ where: { active: false, emporio_role: { not: null } }, orderBy: { name: "asc" } }),
    db.userEstablishment.findMany({ select: { user_id: true, establishment_id: true } }),
    db.establishment.findMany({
      where: { archived_at: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getSeatUsage(db, tenantId, "emporio"),
  ]);
  const porUsuario = new Map<string, string[]>();
  for (const v of vinculos) porUsuario.set(v.user_id, [...(porUsuario.get(v.user_id) ?? []), v.establishment_id]);

  const emView = (u: (typeof ativos)[number]): MembroView => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    emporio_role: u.emporio_role,
    emporio_only: u.emporio_only,
    emporio_keys: u.emporio_keys,
    establishment_ids: porUsuario.get(u.id) ?? [],
  });

  return ok({
    users: ativos.map(emView),
    inactive_users: desativados.map(emView),
    seats,
    establishments: lojas,
  });
}

export async function cadastrarMembroAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: {
    name: string;
    email: string;
    phone?: string | null;
    emporio_role: string;
    establishment_ids?: string[];
    emporio_keys?: string[];
    /** Aceito e ignorado (Q190): o Gerente geral é sempre só do Empório, e o resto da equipe também. */
    emporio_only?: boolean;
  },
): Promise<ActionResult<{ id: string; temp_password: string }>> {
  const neg = await exigirConta(db, ator, "cadastrar alguém na equipe");
  if (neg) return neg;

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return fail("VALIDATION_ERROR", "Informe o nome.", 422, "name");
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("VALIDATION_ERROR", "Informe um email válido.", 422, "email");
  }

  const recusa = await validarEstado(db, {
    emporio_role: input.emporio_role,
    establishment_ids: input.establishment_ids ?? [],
    emporio_keys: input.emporio_keys,
  });
  if (recusa) return recusa;
  const funcao = input.emporio_role as FuncaoEmporio;

  const tenantId = await tenantDoAtor(db, ator);
  if (!tenantId) return fail("NOT_FOUND", "Usuário não encontrado.", 404);

  // O convite checa o email com o client base (a unicidade é global), então não
  // cabe na mesma transação do resto. Cria-se o usuário como OPERADOR, o menor
  // papel, contra o limite do Empório (Q190), e a transação abaixo grava
  // função, papel final, lojas e chaves. Se ela falhar, o convite é desfeito
  // (o usuário criado é apagado): ativo e sem função, ele seria um usuário do
  // Tibé ocupando um assento do plano que o convite não conferiu.
  const convite = await inviteUserAction(db, tenantId, { name, email, phone: input.phone, role: "OPERADOR" }, "emporio");
  if (!convite.ok) return convite;

  const ids = funcao === "gerente_geral" || funcao === "financeiro" ? [] : [...new Set(input.establishment_ids as string[])];
  const gravado: FotoDoMembro & { emporio_role: FuncaoEmporio } = {
    emporio_role: funcao,
    emporio_only: funcao === "gerente_geral",
    emporio_keys: funcao === "vendedor" ? (input.emporio_keys ?? []) : [],
    establishment_ids: ids,
  };
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: convite.data.id },
        data: {
          role: roleDaFuncao(funcao),
          emporio_role: gravado.emporio_role,
          emporio_only: gravado.emporio_only,
          emporio_keys: gravado.emporio_keys,
        },
      });
      if (ids.length > 0) {
        await tx.userEstablishment.createMany({
          data: ids.map((establishment_id) => scoped({ user_id: convite.data.id, establishment_id })),
        });
      }
      const depois = await fotoEmTexto(tx, gravado);
      await registrarNoHistorico(tx, ator, {
        action: "equipe.cadastrar",
        target_type: "usuario",
        target_id: convite.data.id,
        summary: `Cadastrou ${name} na equipe como ${NOME_DA_FUNCAO[funcao]}`,
        changes: diferencas(
          { funcao: "sem função", lojas: [], chaves: [], so_emporio: false },
          depois,
          ROTULOS_EQUIPE,
        ),
      });
    });
  } catch (e) {
    await db.user.delete({ where: { id: convite.data.id } });
    throw e;
  }

  return ok(convite.data);
}

/**
 * Acha o alvo e recusa o que a Equipe nunca altera: o Dono e, para o Gerente
 * geral, qualquer ADMIN da conta. Não só outro Gerente geral: dar função de
 * loja a um ADMIN da fazenda o rebaixaria a OPERADOR só da loja, e isso é
 * decisão do Dono.
 */
async function alvoPermitido(db: TenantPrismaClient, ator: Ator, userId: unknown) {
  const naoAchado = { alvo: null, neg: fail("NOT_FOUND", "Usuário não encontrado.", 404) };
  if (typeof userId !== "string" || !userId) return naoAchado;
  const alvo = await db.user.findFirst({ where: { id: userId } });
  if (!alvo) return naoAchado;
  if (alvo.role === "OWNER") {
    return { alvo: null, neg: fail("FORBIDDEN", "O dono não pode ser alterado pela equipe.", 403) };
  }
  const papel = await papelDoEmporio(db, ator);
  if (papel.papel === "gerente_geral" && alvo.role === "ADMIN") {
    const quem = alvo.emporio_role === "gerente_geral" ? "outro gerente geral" : "um administrador da conta";
    return { alvo: null, neg: fail("FORBIDDEN", `O gerente geral não altera ${quem}. Peça ao dono.`, 403) };
  }
  return { alvo, neg: null };
}

/** Q190: a Equipe só mexe em quem é da equipe; o usuário do Tibé é de Configurações → Usuários. */
const naoEDaEquipe = () =>
  fail(
    "NOT_EMPORIO_TEAM",
    "Essa pessoa é usuária do Tibé, não da equipe do Empório. Ela se altera em Configurações > Usuários.",
    409,
  );

export async function alterarMembroAction(
  db: TenantPrismaClient,
  ator: Ator,
  userId: string,
  input: {
    emporio_role?: string;
    establishment_ids?: string[];
    emporio_keys?: string[];
    /** Aceito e ignorado (Q190). */
    emporio_only?: boolean;
  },
): Promise<ActionResult<{ id: string }>> {
  const neg = await exigirConta(db, ator, "alterar a equipe");
  if (neg) return neg;
  const { alvo, neg: recusaAlvo } = await alvoPermitido(db, ator, userId);
  if (recusaAlvo || !alvo) return recusaAlvo ?? fail("NOT_FOUND", "Usuário não encontrado.", 404);
  if (!alvo.emporio_role) return naoEDaEquipe();
  if (!alvo.active) return fail("INACTIVE", "Essa pessoa está desativada. Reative antes de alterar.", 409);

  const atual = alvo.emporio_role as FuncaoEmporio;
  const nova = input.emporio_role ?? atual;
  const mudou = nova !== atual;

  const vinculosAtuais = (
    await db.userEstablishment.findMany({ where: { user_id: userId }, select: { establishment_id: true } })
  ).map((v) => v.establishment_id);

  // Q133: virar Vendedor zera as chaves, virar Gerente geral limpa as lojas e as
  // chaves. O que vem no mesmo pedido vale. `emporio_only` do pedido é aceito e
  // ignorado (Q190): o Gerente geral grava sempre verdadeiro, o resto falso, e
  // o papel trata toda a equipe como só do Empório de qualquer jeito.
  const final = {
    emporio_role: nova,
    establishment_ids: nova === "gerente_geral" || nova === "financeiro" ? [] : (input.establishment_ids ?? vinculosAtuais),
    emporio_keys: input.emporio_keys ?? (mudou ? [] : alvo.emporio_keys),
    emporio_only: nova === "gerente_geral",
  };
  // Quem não é Vendedor não guarda chave: a do pedido é recusada, a do estado antigo some.
  if (nova !== "vendedor" && input.emporio_keys === undefined) final.emporio_keys = [];

  const recusa = await validarEstado(db, final);
  if (recusa) return recusa;
  const estado: EstadoFinal = { ...final, emporio_role: nova as FuncaoEmporio };

  const antesEmTexto = await fotoEmTexto(db, {
    emporio_role: atual,
    emporio_only: alvo.emporio_only,
    emporio_keys: alvo.emporio_keys,
    establishment_ids: vinculosAtuais,
  });
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        role: roleDaFuncao(estado.emporio_role),
        emporio_role: estado.emporio_role,
        emporio_only: estado.emporio_only,
        emporio_keys: estado.emporio_keys,
      },
    });
    await tx.userEstablishment.deleteMany({ where: { user_id: userId } });
    const ids = [...new Set(estado.establishment_ids)];
    if (ids.length > 0) {
      await tx.userEstablishment.createMany({
        data: ids.map((establishment_id) => scoped({ user_id: userId, establishment_id })),
      });
    }
    const depoisEmTexto = await fotoEmTexto(tx, { ...estado, establishment_ids: ids });
    await registrarNoHistorico(tx, ator, {
      action: "equipe.alterar",
      target_type: "usuario",
      target_id: userId,
      summary: `Alterou ${alvo.name} na equipe`,
      changes: diferencas(antesEmTexto, depoisEmTexto, ROTULOS_EQUIPE, {
        so_emporio: (x) => (x ? "Sim" : "Não"),
      }),
    });
  });
  return ok({ id: userId });
}

export async function tirarDoEmporioAction(
  db: TenantPrismaClient,
  ator: Ator,
  userId: string,
): Promise<ActionResult<{ id: string }>> {
  const neg = await exigirConta(db, ator, "tirar alguém da equipe");
  if (neg) return neg;
  const { alvo, neg: recusaAlvo } = await alvoPermitido(db, ator, userId);
  if (recusaAlvo || !alvo) return recusaAlvo ?? fail("NOT_FOUND", "Usuário não encontrado.", 404);
  if (!alvo.emporio_role) return naoEDaEquipe();
  if (!alvo.active) return fail("ALREADY_INACTIVE", "Essa pessoa já está desativada.", 409);

  // Q190: tirar DESATIVA. Função, chaves, só-Empório e lojas ficam guardados,
  // e o Reativar devolve a pessoa como estava. Ela não vira usuária do Tibé.
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { active: false } });
    await registrarNoHistorico(tx, ator, {
      action: "equipe.desativar",
      target_type: "usuario",
      target_id: userId,
      summary: `Desativou ${alvo.name} da equipe`,
      changes: diferencas({ situacao: "Ativa" }, { situacao: "Desativada" }, { situacao: "Situação" }),
    });
  });
  return ok({ id: userId });
}

/**
 * Q190: devolve à equipe quem foi desativado, com a função, as chaves e as
 * lojas que tinha. Ocupa vaga no limite do Empório, então confere antes.
 */
export async function reativarMembroAction(
  db: TenantPrismaClient,
  ator: Ator,
  userId: string,
): Promise<ActionResult<{ id: string }>> {
  const neg = await exigirConta(db, ator, "reativar alguém da equipe");
  if (neg) return neg;
  const { alvo, neg: recusaAlvo } = await alvoPermitido(db, ator, userId);
  if (recusaAlvo || !alvo) return recusaAlvo ?? fail("NOT_FOUND", "Usuário não encontrado.", 404);
  if (!alvo.emporio_role) return naoEDaEquipe();
  if (alvo.active) return fail("ALREADY_ACTIVE", "Essa pessoa já está ativa na equipe.", 409);
  const funcao = NOME_DA_FUNCAO[alvo.emporio_role] ?? alvo.emporio_role;

  const tenantId = await tenantDoAtor(db, ator);
  if (!tenantId) return fail("NOT_FOUND", "Usuário não encontrado.", 404);
  const semVaga = await checkSeatAvailable(db, tenantId, "emporio");
  if (semVaga) return fail("SEAT_LIMIT_REACHED", semVaga, 422);

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { active: true } });
    await registrarNoHistorico(tx, ator, {
      action: "equipe.reativar",
      target_type: "usuario",
      target_id: userId,
      summary: `Reativou ${alvo.name} na equipe como ${funcao}`,
      changes: diferencas({ situacao: "Desativada" }, { situacao: "Ativa" }, { situacao: "Situação" }),
    });
  });
  return ok({ id: userId });
}
