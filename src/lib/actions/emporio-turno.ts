import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { exigir, papelDoEmporio, pode } from "@/lib/emporio/papel";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { CATEGORIA_DIFERENCA_CAIXA } from "@/lib/emporio/cartao";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import { dinheiro, registrarNoHistorico } from "@/lib/emporio/historico";
import { acharLojaParaEscrita } from "@/lib/actions/emporio-estoque";
import {
  contarCaixa,
  fraseDaDiferenca,
  RecusaCaixa,
  saldoDaGerencia,
  saldoDoCaixa,
  viewsDosCaixas,
  type CaixaRegistradoView,
} from "@/lib/actions/emporio-caixa";

export { resolverTurno, type ResultadoDoTurno, type TurnoResolvido } from "@/lib/emporio/turno";

/**
 * Meu Empório, entrega 2: caixa com turno. Caixas numerados por loja (cada um
 * uma gaveta física), o turno (abrir com o troco, sangria, encerrar com o
 * malote) e "Com a gerência", o lugar por loja que recebe a sangria e o malote
 * quando o gerente confirma o valor.
 *
 * Nenhum saldo é gravado (invariante 2): o do caixa, o da gaveta e o da
 * gerência são somas de `CashMovement`. A diferença de contagem segue a regra
 * única de `contarCaixa` (Q93). Toda escrita é serializável e idempotente pela
 * `operation_key`.
 */

const NAO_ACHADO = (o: string, field?: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404, field);
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ehErroUnico = (e: unknown) => (e as { code?: unknown })?.code === "P2002";

const JA_ABERTO = () => fail("SESSION_ALREADY_OPEN", "Este caixa já está aberto.", 409, "cash_register_id");
const TURNO_ENCERRADO = () => fail("SESSION_CLOSED", "Este turno já foi encerrado.", 409);
const SEM_DINHEIRO = (campo: string) => fail("INSUFFICIENT_CASH", "Não há dinheiro suficiente para isso.", 409, campo);
const SO_QUEM_ABRIU = () => fail("NOT_SESSION_OWNER", "Só quem abriu o caixa ou o gestor da loja encerra este turno.", 403);
const MALOTE_GRANDE = () => fail("MALOTE_TOO_BIG", "O malote não pode passar do que foi contado.", 422, "malote_amount");
const JA_CONFIRMADA = () => fail("HANDOVER_ALREADY_CONFIRMED", "Esta entrega já foi confirmada.", 409);
const SEM_CHAVE = () => fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");
const CHAVE_USADA = () => fail("OPERATION_KEY_REUSED", "Esta chave de operação já foi usada em outra operação.", 409, "operation_key");

async function lojaVisivel(db: TenantPrismaClient, ator: Ator, lojaId: string): Promise<boolean> {
  const v = await lojasDoAtor(db, ator);
  return !v || v.has(lojaId);
}

/** "Loja sem Caixa" não é configuração: é a loja onde nenhum usuário ativo tem o papel Caixa. */
async function lojaTemCaixa(db: TenantPrismaClient, lojaId: string): Promise<boolean> {
  const n = await db.userEstablishment.count({
    where: { establishment_id: lojaId, user: { active: true, emporio_role: "caixa" } },
  });
  return n > 0;
}

function contado(v: unknown): ActionResult<number> {
  if (!numero(v) || centavos(v) < 0) return fail("VALIDATION_ERROR", "Informe quanto há na gaveta (zero ou mais).", 422, "counted");
  return ok(centavos(v));
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type EntregaView = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  cash_register_id: string;
  register_number: number;
  cash_session_id: string;
  kind: "sangria" | "malote";
  amount: number;
  notes: string | null;
  created_by_user_id: string;
  created_at: string;
  status: "pending" | "confirmed";
  confirmed_at: string | null;
  confirmed_by_user_id: string | null;
  received_amount: number | null;
  difference: number | null;
  confirm_notes: string | null;
};

const INCLUDE_ENTREGA = {
  establishment: { select: { name: true } },
  cash_register: { select: { number: true } },
} as const;

type EntregaRow = {
  id: string;
  establishment_id: string;
  cash_register_id: string;
  cash_session_id: string;
  kind: "sangria" | "malote";
  amount: unknown;
  notes: string | null;
  created_by_user_id: string;
  created_at: Date;
  confirmed_at: Date | null;
  confirmed_by_user_id: string | null;
  received_amount: unknown;
  difference: unknown;
  confirm_notes: string | null;
  establishment: { name: string };
  cash_register: { number: number };
};

function viewDaEntrega(h: EntregaRow): EntregaView {
  return {
    id: h.id,
    establishment_id: h.establishment_id,
    establishment_name: h.establishment.name,
    cash_register_id: h.cash_register_id,
    register_number: h.cash_register.number,
    cash_session_id: h.cash_session_id,
    kind: h.kind,
    amount: decToNum(h.amount as never) ?? 0,
    notes: h.notes,
    created_by_user_id: h.created_by_user_id,
    created_at: h.created_at.toISOString(),
    status: h.confirmed_at ? "confirmed" : "pending",
    confirmed_at: isoOrNull(h.confirmed_at),
    confirmed_by_user_id: h.confirmed_by_user_id,
    received_amount: decToNum(h.received_amount as never),
    difference: decToNum(h.difference as never),
    confirm_notes: h.confirm_notes,
  };
}

export type TurnoView = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  cash_register_id: string;
  number: number;
  nome: string;
  status: "open" | "closed";
  opened_by: { id: string; name: string };
  opened_at: string;
  opening_expected: number;
  opening_counted: number;
  reinforcement: number;
  closed_at: string | null;
  closed_by: { id: string; name: string } | null;
  closing_expected: number | null;
  closing_counted: number | null;
  malote_amount: number | null;
  /** O saldo do caixa agora (soma dos movimentos dele). */
  balance: number;
  handovers: EntregaView[];
};

export type TurnoGravadoView = TurnoView & { replayed: boolean };

async function viewsDosTurnos(
  db: TenantPrismaClient,
  where: Record<string, unknown>,
  take = 100,
): Promise<TurnoView[]> {
  const sessoes = await db.cashSession.findMany({
    where,
    include: {
      establishment: { select: { name: true } },
      cash_register: { select: { number: true } },
      handovers: { include: INCLUDE_ENTREGA, orderBy: { created_at: "asc" } },
    },
    orderBy: { opened_at: "desc" },
    take,
  });
  if (sessoes.length === 0) return [];
  const pessoas = [...new Set(sessoes.flatMap((s) => [s.opened_by_user_id, s.closed_by_user_id]).filter((x): x is string => !!x))];
  const nomes = new Map(
    (await db.user.findMany({ where: { id: { in: pessoas } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const caixas = [...new Set(sessoes.map((s) => s.cash_register_id))];
  const linhas = await db.cashMovement.groupBy({
    by: ["cash_register_id", "direction"],
    where: { cash_register_id: { in: caixas } },
    _sum: { amount: true },
  });
  const saldo = new Map<string, number>();
  for (const l of linhas) {
    const id = l.cash_register_id as string;
    const v = centavos(decToNum(l._sum.amount) ?? 0);
    saldo.set(id, (saldo.get(id) ?? 0) + (l.direction === "entrada" ? v : -v));
  }
  const pessoa = (id: string) => ({ id, name: nomes.get(id) ?? "" });
  return sessoes.map((s) => ({
    id: s.id,
    establishment_id: s.establishment_id,
    establishment_name: s.establishment.name,
    cash_register_id: s.cash_register_id,
    number: s.cash_register.number,
    nome: `Caixa ${s.cash_register.number}`,
    status: s.closed_at ? "closed" : "open",
    opened_by: pessoa(s.opened_by_user_id),
    opened_at: s.opened_at.toISOString(),
    opening_expected: decToNum(s.opening_expected) ?? 0,
    opening_counted: decToNum(s.opening_counted) ?? 0,
    reinforcement: decToNum(s.reinforcement) ?? 0,
    closed_at: isoOrNull(s.closed_at),
    closed_by: s.closed_by_user_id ? pessoa(s.closed_by_user_id) : null,
    closing_expected: decToNum(s.closing_expected),
    closing_counted: decToNum(s.closing_counted),
    malote_amount: decToNum(s.malote_amount),
    balance: (saldo.get(s.cash_register_id) ?? 0) / 100,
    handovers: s.handovers.map(viewDaEntrega),
  }));
}

async function turnoPorId(db: TenantPrismaClient, id: string, replayed: boolean): Promise<ActionResult<TurnoGravadoView>> {
  const [t] = await viewsDosTurnos(db, { id }, 1);
  return t ? ok({ ...t, replayed }) : NAO_ACHADO("Turno");
}

/**
 * A repetição (§23.2): a chave já gravada devolve o turno, com `replayed`. A
 * chave só repete a MESMA operação: gravada noutro turno (ou noutro caixa, na
 * abertura), é recusada, nunca devolve o registro alheio.
 */
async function turnoGravado(
  db: TenantPrismaClient,
  ator: Ator,
  where: { operation_key: string } | { close_operation_key: string },
  dono: { id?: string; cash_register_id?: string | null },
): Promise<ActionResult<TurnoGravadoView> | null> {
  const s = await db.cashSession.findFirst({ where, select: { id: true, establishment_id: true, cash_register_id: true } });
  if (!s) return null;
  if (!(await lojaVisivel(db, ator, s.establishment_id))) return NAO_ACHADO("Turno");
  if ((dono.id && s.id !== dono.id) || (dono.cash_register_id && s.cash_register_id !== dono.cash_register_id)) return CHAVE_USADA();
  return turnoPorId(db, s.id, true);
}

async function entregaPorId(db: TenantPrismaClient, id: string, replayed: boolean): Promise<ActionResult<EntregaView & { replayed: boolean }>> {
  const h = await db.cashHandover.findFirst({ where: { id }, include: INCLUDE_ENTREGA });
  return h ? ok({ ...viewDaEntrega(h), replayed }) : NAO_ACHADO("Entrega");
}

async function entregaGravada(
  db: TenantPrismaClient,
  ator: Ator,
  where: { operation_key: string } | { confirm_operation_key: string },
  dono: { id?: string; cash_session_id?: string; kind?: "sangria" | "malote" },
): Promise<ActionResult<EntregaView & { replayed: boolean }> | null> {
  const h = await db.cashHandover.findFirst({
    where,
    select: { id: true, establishment_id: true, cash_session_id: true, kind: true },
  });
  if (!h) return null;
  if (!(await lojaVisivel(db, ator, h.establishment_id))) return NAO_ACHADO("Entrega");
  if (
    (dono.id && h.id !== dono.id) ||
    (dono.cash_session_id && h.cash_session_id !== dono.cash_session_id) ||
    (dono.kind && h.kind !== dono.kind)
  ) {
    return CHAVE_USADA();
  }
  return entregaPorId(db, h.id, true);
}

/** A chave do malote: uma por turno, num espaço que a chave de sangria não alcança (`sangriaAction` recusa o prefixo). */
const PREFIXO_DO_MALOTE = "malote:";
const chaveDoMalote = (sessionId: string) => `${PREFIXO_DO_MALOTE}${sessionId}`;

// ---------------------------------------------------------------------------
// Caixas
// ---------------------------------------------------------------------------

export async function listarCaixasAction(
  db: TenantPrismaClient,
  ator: Ator,
  establishmentId: string,
): Promise<ActionResult<CaixaRegistradoView[]>> {
  const lojaId = texto(establishmentId);
  if (!lojaId) return fail("VALIDATION_ERROR", "Escolha o estabelecimento.", 422, "establishment_id");
  if (!(await lojaVisivel(db, ator, lojaId))) return NAO_ACHADO("Estabelecimento", "establishment_id");
  if (!(await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true } }))) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  return ok(await viewsDosCaixas(db, [lojaId]));
}

/** Quem edita a loja (o Gestor dela para cima) cria o próximo caixa: `number` = o maior + 1. */
export async function criarCaixaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { establishment_id: string },
): Promise<ActionResult<CaixaRegistradoView>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "criar um caixa");
  if (neg) return neg;
  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  const negLoja = await exigir(db, ator, "gestor_da_loja", "criar um caixa", loja.data.id);
  if (negLoja) return negLoja;

  const gravar = () =>
    runSerializableTenantTransaction(db, async (tx) => {
      const ultimo = await tx.cashRegister.aggregate({ where: { establishment_id: loja.data.id }, _max: { number: true } });
      const novo = await tx.cashRegister.create({
        data: scoped({ establishment_id: loja.data.id, number: (ultimo._max.number ?? 0) + 1, created_by_user_id: ator.id }),
      });
      await registrarNoHistorico(tx, ator, {
        action: "caixa.criar",
        establishment_id: loja.data.id,
        target_type: "caixa",
        target_id: novo.id,
        summary: `Criou o Caixa ${novo.number} da ${loja.data.name}`,
      });
      return novo.id;
    });
  let id: string;
  try {
    id = await gravar();
  } catch (err) {
    if (!ehErroUnico(err)) throw err;
    id = await gravar();
  }
  const [v] = (await viewsDosCaixas(db, [loja.data.id])).filter((c) => c.id === id);
  return v ? ok(v) : NAO_ACHADO("Caixa");
}

// ---------------------------------------------------------------------------
// Turno
// ---------------------------------------------------------------------------

export type AbrirTurnoInput = {
  operation_key: string;
  cash_register_id: string;
  /** O troco que o operador contou na gaveta (já com o reforço, se houver). */
  counted: number;
  justification?: string | null;
  /** Reforço de troco vindo da gerência da loja, antes de conferir. */
  reinforcement?: number | null;
};

/**
 * Abrir é conferir o troco (a abertura confere o que o encerramento anterior
 * deixou): o reforço sai da gerência e entra no caixa ANTES do esperado ser
 * calculado, e a diferença segue `contarCaixa`.
 */
export async function abrirTurnoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: AbrirTurnoInput,
): Promise<ActionResult<TurnoGravadoView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "abrir o caixa");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return SEM_CHAVE();
  const caixaId = texto(input?.cash_register_id);
  const repeticao = () => turnoGravado(db, ator, { operation_key: chave }, { cash_register_id: caixaId });
  const gravado = await repeticao();
  if (gravado) return gravado;

  if (!caixaId) return fail("VALIDATION_ERROR", "Escolha o caixa.", 422, "cash_register_id");
  const caixa = await db.cashRegister.findFirst({ where: { id: caixaId }, select: { id: true, establishment_id: true, number: true } });
  if (!caixa) return NAO_ACHADO("Caixa", "cash_register_id");
  const negLoja = await exigir(db, ator, "vendedor_da_loja", "abrir o caixa", caixa.establishment_id);
  if (negLoja) return negLoja;
  const loja = await acharLojaParaEscrita(db, ator, caixa.establishment_id);
  if (!loja.ok) return loja;
  const cont = contado(input.counted);
  if (!cont.ok) return cont;
  const contadoCent = cont.data;
  if (input.reinforcement != null && (!numero(input.reinforcement) || centavos(input.reinforcement) < 0)) {
    return fail("VALIDATION_ERROR", "O reforço do troco não pode ser negativo.", 422, "reinforcement");
  }
  const reforcoCent = input.reinforcement == null ? 0 : centavos(input.reinforcement);
  const justificativa = texto(input.justification);

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const leitor = tx as unknown as TenantPrismaClient;
      if (await tx.cashSession.findFirst({ where: { open_register_id: caixa.id }, select: { id: true } })) {
        throw new RecusaCaixa(JA_ABERTO());
      }
      if (reforcoCent > 0 && (await saldoDaGerencia(leitor, loja.data.id)) < reforcoCent) {
        throw new RecusaCaixa(SEM_DINHEIRO("reinforcement"));
      }
      const esperadoCent = (await saldoDoCaixa(leitor, caixa.id)) + reforcoCent;
      const agora = new Date();
      const sessao = await tx.cashSession.create({
        data: scoped({
          establishment_id: loja.data.id,
          cash_register_id: caixa.id,
          open_register_id: caixa.id,
          operation_key: chave,
          opened_by_user_id: ator.id,
          opened_at: agora,
          opening_expected: esperadoCent / 100,
          opening_counted: contadoCent / 100,
          reinforcement: reforcoCent / 100,
        }),
      });
      if (reforcoCent > 0) {
        const comum = {
          amount: reforcoCent / 100,
          origin: "reforco" as const,
          occurred_at: agora,
          notes: "Reforço de troco",
          created_by_user_id: ator.id,
        };
        await tx.cashMovement.create({ data: scoped({ ...comum, manager_establishment_id: loja.data.id, direction: "saida" as const }) });
        await tx.cashMovement.create({
          data: scoped({
            ...comum,
            establishment_id: loja.data.id,
            cash_register_id: caixa.id,
            cash_session_id: sessao.id,
            direction: "entrada" as const,
          }),
        });
      }
      const contagem = await contarCaixa(tx, ator, {
        establishment_id: loja.data.id,
        cash_register_id: caixa.id,
        cash_session_id: sessao.id,
        kind: "abertura",
        esperadoCent,
        contadoCent,
        justificativa,
        agora,
      });
      await registrarNoHistorico(tx, ator, {
        action: "caixa.abrir",
        establishment_id: loja.data.id,
        target_type: "turno",
        target_id: sessao.id,
        summary:
          `Abriu o Caixa ${caixa.number} da ${loja.data.name} com ${dinheiro(contadoCent / 100)} de troco` +
          (reforcoCent > 0 ? ` (reforço de ${dinheiro(reforcoCent / 100)} da gerência)` : "") +
          `, ${fraseDaDiferenca(contagem.diffCent)}`,
      });
      return sessao.id;
    });
    return turnoPorId(db, id, false);
  } catch (err) {
    // A mesma chave em paralelo: a segunda espera, recebe o conflito (único ou
    // 40001 com nova tentativa) e precisa devolver a abertura da primeira.
    if (err instanceof RecusaCaixa || ehErroUnico(err)) {
      const igual = await repeticao();
      if (igual) return igual;
      if (err instanceof RecusaCaixa) return err.recusa;
      return JA_ABERTO();
    }
    throw err;
  }
}

/** Sangria: notas saem da gaveta para o gerente, aguardando a confirmação dele. */
export async function sangriaAction(
  db: TenantPrismaClient,
  ator: Ator,
  sessionId: string,
  input: { operation_key: string; amount: number; notes?: string | null },
): Promise<ActionResult<EntregaView & { replayed: boolean }>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "fazer sangria");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return SEM_CHAVE();
  if (chave.startsWith(PREFIXO_DO_MALOTE)) return CHAVE_USADA();
  const repeticao = () => entregaGravada(db, ator, { operation_key: chave }, { cash_session_id: String(sessionId ?? ""), kind: "sangria" });
  const gravada = await repeticao();
  if (gravada) return gravada;

  const sessao = await db.cashSession.findFirst({
    where: { id: String(sessionId ?? "") },
    include: { establishment: { select: { name: true } }, cash_register: { select: { number: true } } },
  });
  if (!sessao) return NAO_ACHADO("Turno");
  const negLoja = await exigir(db, ator, "vendedor_da_loja", "fazer sangria", sessao.establishment_id);
  if (negLoja) return negLoja;
  if (sessao.closed_at) return (await repeticao()) ?? TURNO_ENCERRADO();
  if (!numero(input.amount) || centavos(input.amount) <= 0) {
    return fail("VALIDATION_ERROR", "O valor da sangria deve ser maior que zero.", 422, "amount");
  }
  const valorCent = centavos(input.amount);
  const notas = texto(input.notes);

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const aberta = await tx.cashSession.findFirst({ where: { id: sessao.id, open_register_id: { not: null } }, select: { id: true } });
      if (!aberta) throw new RecusaCaixa(TURNO_ENCERRADO());
      if ((await saldoDoCaixa(tx as unknown as TenantPrismaClient, sessao.cash_register_id)) < valorCent) {
        throw new RecusaCaixa(SEM_DINHEIRO("amount"));
      }
      const agora = new Date();
      const entrega = await tx.cashHandover.create({
        data: scoped({
          establishment_id: sessao.establishment_id,
          cash_register_id: sessao.cash_register_id,
          cash_session_id: sessao.id,
          kind: "sangria" as const,
          amount: valorCent / 100,
          operation_key: chave,
          notes: notas,
          created_by_user_id: ator.id,
        }),
      });
      await tx.cashMovement.create({
        data: scoped({
          establishment_id: sessao.establishment_id,
          cash_register_id: sessao.cash_register_id,
          cash_session_id: sessao.id,
          cash_handover_id: entrega.id,
          direction: "saida" as const,
          amount: valorCent / 100,
          origin: "sangria" as const,
          occurred_at: agora,
          notes: notas,
          created_by_user_id: ator.id,
        }),
      });
      await registrarNoHistorico(tx, ator, {
        action: "caixa.sangria",
        establishment_id: sessao.establishment_id,
        target_type: "entrega",
        target_id: entrega.id,
        summary: `Fez uma sangria de ${dinheiro(valorCent / 100)} do Caixa ${sessao.cash_register.number} da ${sessao.establishment.name}`,
      });
      return entrega.id;
    });
    return entregaPorId(db, id, false);
  } catch (err) {
    if (err instanceof RecusaCaixa || ehErroUnico(err)) {
      const igual = await repeticao();
      if (igual) return igual;
      if (err instanceof RecusaCaixa) return err.recusa;
    }
    throw err;
  }
}

/**
 * Encerrar: o operador conta tudo, separa o malote para o gerente (aguardando
 * a confirmação) e o resto fica na gaveta como troco do próximo turno. Encerra
 * quem abriu, o gestor da loja, ou qualquer um da loja quando ela não tem Caixa.
 */
export async function encerrarTurnoAction(
  db: TenantPrismaClient,
  ator: Ator,
  sessionId: string,
  input: { operation_key: string; counted: number; justification?: string | null; malote_amount: number },
): Promise<ActionResult<TurnoGravadoView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "encerrar o caixa");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return SEM_CHAVE();
  const repeticao = () => turnoGravado(db, ator, { close_operation_key: chave }, { id: String(sessionId ?? "") });
  const gravado = await repeticao();
  if (gravado) return gravado;

  const sessao = await db.cashSession.findFirst({
    where: { id: String(sessionId ?? "") },
    include: { establishment: { select: { name: true } }, cash_register: { select: { number: true } } },
  });
  if (!sessao) return NAO_ACHADO("Turno");
  const negLoja = await exigir(db, ator, "vendedor_da_loja", "encerrar o caixa", sessao.establishment_id);
  if (negLoja) return negLoja;
  if (sessao.closed_at) return (await repeticao()) ?? TURNO_ENCERRADO();
  const papel = await papelDoEmporio(db, ator);
  if (
    sessao.opened_by_user_id !== ator.id &&
    !pode(papel, "gestor_da_loja", sessao.establishment_id) &&
    (await lojaTemCaixa(db, sessao.establishment_id))
  ) {
    return SO_QUEM_ABRIU();
  }
  const cont = contado(input.counted);
  if (!cont.ok) return cont;
  const contadoCent = cont.data;
  if (!numero(input.malote_amount) || centavos(input.malote_amount) < 0) {
    return fail("VALIDATION_ERROR", "Informe o valor do malote (zero ou mais).", 422, "malote_amount");
  }
  const maloteCent = centavos(input.malote_amount);
  if (maloteCent > contadoCent) return MALOTE_GRANDE();
  const justificativa = texto(input.justification);

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const agora = new Date();
      const fechou = await tx.cashSession.updateMany({
        where: { id: sessao.id, open_register_id: { not: null } },
        data: { open_register_id: null, closed_at: agora, closed_by_user_id: ator.id, close_operation_key: chave },
      });
      if (fechou.count === 0) throw new RecusaCaixa(TURNO_ENCERRADO());
      const esperadoCent = await saldoDoCaixa(tx as unknown as TenantPrismaClient, sessao.cash_register_id);
      const contagem = await contarCaixa(tx, ator, {
        establishment_id: sessao.establishment_id,
        cash_register_id: sessao.cash_register_id,
        cash_session_id: sessao.id,
        kind: "encerramento",
        esperadoCent,
        contadoCent,
        justificativa,
        agora,
      });
      await tx.cashSession.update({
        where: { id: sessao.id },
        data: { closing_expected: esperadoCent / 100, closing_counted: contadoCent / 100, malote_amount: maloteCent / 100 },
      });
      if (maloteCent > 0) {
        const malote = await tx.cashHandover.create({
          data: scoped({
            establishment_id: sessao.establishment_id,
            cash_register_id: sessao.cash_register_id,
            cash_session_id: sessao.id,
            kind: "malote" as const,
            amount: maloteCent / 100,
            operation_key: chaveDoMalote(sessao.id),
            created_by_user_id: ator.id,
          }),
        });
        await tx.cashMovement.create({
          data: scoped({
            establishment_id: sessao.establishment_id,
            cash_register_id: sessao.cash_register_id,
            cash_session_id: sessao.id,
            cash_handover_id: malote.id,
            direction: "saida" as const,
            amount: maloteCent / 100,
            origin: "malote" as const,
            occurred_at: agora,
            created_by_user_id: ator.id,
          }),
        });
      }
      await registrarNoHistorico(tx, ator, {
        action: "caixa.encerrar",
        establishment_id: sessao.establishment_id,
        target_type: "turno",
        target_id: sessao.id,
        summary:
          `Encerrou o Caixa ${sessao.cash_register.number} da ${sessao.establishment.name}: contou ${dinheiro(contadoCent / 100)}, ${fraseDaDiferenca(contagem.diffCent)}` +
          (maloteCent > 0 ? `, malote de ${dinheiro(maloteCent / 100)}` : ""),
      });
    });
    return turnoPorId(db, sessao.id, false);
  } catch (err) {
    // A mesma chave em paralelo: a segunda encontra o turno já fechado pela
    // primeira e devolve o encerramento dela, não SESSION_CLOSED.
    if (err instanceof RecusaCaixa || ehErroUnico(err)) {
      const igual = await repeticao();
      if (igual) return igual;
      if (err instanceof RecusaCaixa) return err.recusa;
    }
    throw err;
  }
}

/**
 * O gerente confirma o valor recebido de uma sangria ou de um malote: só então
 * ele entra em "Com a gerência". A diferença fica na entrega e vira "Diferença
 * de caixa" (despesa se faltou, receita se sobrou), como na conferência (Q93).
 */
export async function confirmarEntregaAction(
  db: TenantPrismaClient,
  ator: Ator,
  handoverId: string,
  input: { operation_key: string; received_amount: number; notes?: string | null },
): Promise<ActionResult<EntregaView & { replayed: boolean }>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "confirmar o dinheiro recebido");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return SEM_CHAVE();
  const repeticao = () => entregaGravada(db, ator, { confirm_operation_key: chave }, { id: String(handoverId ?? "") });
  const gravada = await repeticao();
  if (gravada) return gravada;

  const entrega = await db.cashHandover.findFirst({ where: { id: String(handoverId ?? "") }, include: INCLUDE_ENTREGA });
  if (!entrega || !(await lojaVisivel(db, ator, entrega.establishment_id))) return NAO_ACHADO("Entrega");
  const negLoja = await exigir(db, ator, "gestor_da_loja", "confirmar o dinheiro recebido", entrega.establishment_id);
  if (negLoja) return negLoja;
  if (entrega.confirmed_at) return (await repeticao()) ?? JA_CONFIRMADA();
  if (!numero(input.received_amount) || centavos(input.received_amount) < 0) {
    return fail("VALIDATION_ERROR", "Informe quanto foi recebido (zero ou mais).", 422, "received_amount");
  }
  const recebidoCent = centavos(input.received_amount);
  const valorCent = centavos(decToNum(entrega.amount) ?? 0);
  const diffCent = recebidoCent - valorCent;
  const notas = texto(input.notes);
  if (diffCent !== 0 && !notas) {
    return fail(
      "VALIDATION_ERROR",
      `O valor recebido tem ${diffCent > 0 ? "sobra" : "falta"} de ${brl(Math.abs(diffCent) / 100)}: diga o motivo.`,
      422,
      "notes",
    );
  }

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const agora = new Date();
      const confirmou = await tx.cashHandover.updateMany({
        where: { id: entrega.id, confirmed_at: null },
        data: {
          confirmed_at: agora,
          confirmed_by_user_id: ator.id,
          confirm_operation_key: chave,
          received_amount: recebidoCent / 100,
          difference: diffCent / 100,
          confirm_notes: notas,
        },
      });
      if (confirmou.count === 0) throw new RecusaCaixa(JA_CONFIRMADA());
      if (recebidoCent > 0) {
        await tx.cashMovement.create({
          data: scoped({
            manager_establishment_id: entrega.establishment_id,
            cash_handover_id: entrega.id,
            direction: "entrada" as const,
            amount: recebidoCent / 100,
            origin: "entrega_gerencia" as const,
            occurred_at: agora,
            notes: notas,
            created_by_user_id: ator.id,
          }),
        });
      }
      if (diffCent !== 0) {
        await createLinkedEntry(tx, {
          entry_type: diffCent > 0 ? "income" : "expense",
          category: CATEGORIA_DIFERENCA_CAIXA,
          amount: Math.abs(diffCent) / 100,
          related_module: "emporio",
          related_id: entrega.id,
          occurred_at: agora,
          status: "paid",
          establishment_id: entrega.establishment_id,
          payment_method: "dinheiro",
        });
      }
      await registrarNoHistorico(tx, ator, {
        action: "caixa.confirmar_entrega",
        establishment_id: entrega.establishment_id,
        target_type: "entrega",
        target_id: entrega.id,
        summary:
          `Confirmou ${dinheiro(recebidoCent / 100)} recebidos d${entrega.kind === "sangria" ? "a sangria" : "o malote"} de ${dinheiro(valorCent / 100)} do Caixa ${entrega.cash_register.number} da ${entrega.establishment.name}` +
          (diffCent !== 0 ? `, ${fraseDaDiferenca(diffCent)}` : ""),
      });
    });
    return entregaPorId(db, entrega.id, false);
  } catch (err) {
    // A mesma chave em paralelo: a segunda acha a entrega já confirmada pela primeira e devolve essa confirmação.
    if (err instanceof RecusaCaixa || ehErroUnico(err)) {
      const igual = await repeticao();
      if (igual) return igual;
      if (err instanceof RecusaCaixa) return err.recusa;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

export async function listarEntregasAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; status?: string } = {},
): Promise<ActionResult<EntregaView[]>> {
  const status = opts.status ?? "pending";
  if (status !== "pending" && status !== "confirmed") {
    return fail("VALIDATION_ERROR", "Escolha a situação: pending ou confirmed.", 422, "status");
  }
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const linhas = await db.cashHandover.findMany({
    where: {
      ...(opts.establishment_id ? { establishment_id: opts.establishment_id } : visiveis ? { establishment_id: { in: [...visiveis] } } : {}),
      confirmed_at: status === "pending" ? null : { not: null },
    },
    include: INCLUDE_ENTREGA,
    orderBy: { created_at: status === "pending" ? "asc" : "desc" },
    take: 200,
  });
  return ok(linhas.map(viewDaEntrega));
}

export async function listarTurnosAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; status?: string } = {},
): Promise<ActionResult<TurnoView[]>> {
  if (opts.status !== undefined && opts.status !== "open" && opts.status !== "closed") {
    return fail("VALIDATION_ERROR", "Escolha a situação: open ou closed.", 422, "status");
  }
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  return ok(
    await viewsDosTurnos(db, {
      ...(opts.establishment_id ? { establishment_id: opts.establishment_id } : visiveis ? { establishment_id: { in: [...visiveis] } } : {}),
      ...(opts.status === "open" ? { open_register_id: { not: null } } : opts.status === "closed" ? { closed_at: { not: null } } : {}),
    }),
  );
}

export async function lerTurnoAction(db: TenantPrismaClient, ator: Ator, sessionId: string): Promise<ActionResult<TurnoView>> {
  const s = await db.cashSession.findFirst({ where: { id: String(sessionId ?? "") }, select: { id: true, establishment_id: true } });
  if (!s || !(await lojaVisivel(db, ator, s.establishment_id))) return NAO_ACHADO("Turno");
  const [t] = await viewsDosTurnos(db, { id: s.id }, 1);
  return t ? ok(t) : NAO_ACHADO("Turno");
}
