import type {
  HerdChargeType,
  HerdMovementType,
  HerdOwner,
  HerdSituation,
  HerdStayType,
} from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { recordMovementInTx, type HerdPositionKey } from "@/lib/actions/herd-ledger";
import { isValidCategory } from "@/lib/herd/categories";
import { decToNum } from "@/lib/serialize";
import {
  donoDaEstadia,
  permiteEncerramento,
  situacaoDaEstadia,
  tipoDeEnvio,
} from "@/lib/herd/stay-rules";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * As estadias temporárias do rebanho (Módulo 30, fase 2). Ver
 * docs/superpowers/specs/2026-08-27-modulo-30-fase-2-design.md.
 *
 * A estadia guarda a IDENTIDADE e os atributos do episódio; a quantidade
 * continua sendo a soma das movimentações que apontam para ela (invariante 2),
 * e "aberta" é `saldo > 0`, nunca um campo.
 *
 * Nada de cálculo de cobrança: `charge_type` é informação do acordo, e o valor
 * lançado é o que o produtor digitou. O documento do cliente não define a
 * fórmula, e fórmula inventada gera dinheiro errado em silêncio.
 */

export type OpenStayInput = {
  type: HerdStayType;
  property_id: string;
  category_id: string;
  quantity: number;
  /** Pasto de origem (ou de destino, quando o animal é de terceiro). */
  pasture_id?: string | null;
  counterparty_name?: string | null;
  location_name?: string | null;
  city?: string | null;
  started_at?: Date | null;
  expected_end_at?: Date | null;
  charge_type?: HerdChargeType | null;
  charge_value?: number | null;
  /** Vencimento da conta gerada. Sem ele, vale o retorno previsto, e depois hoje. */
  due_date?: Date | null;
  reason?: string | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
  /**
   * Fase 3 (confinamento, docs/superpowers/specs/2026-08-31-confinamento-fase-3-do-modulo-30.md).
   * Aponta para o `ConfinementSite` cadastrado. Opcional: os outros quatro
   * tipos de estadia não têm site cadastrado, e continuam sem ele.
   */
  confinement_site_id?: string | null;
};

export type HerdStayRecord = {
  id: string;
  type: HerdStayType;
  property_id: string;
  counterparty_name: string | null;
  started_at: Date;
  quantity: number;
  financial_entry_id: string | null;
  confinement_site_id: string | null;
};

/**
 * Despesa para quem cobra do produtor, receita para quem paga a ele.
 *
 * O documento é explícito nos dois sentidos: pasto de terceiros e boitel
 * "geram despesa ou conta a pagar"; animais de terceiros na fazenda "geram
 * receita ou conta a receber". Desaparecimento não gera nada: não há acordo
 * nem contraparte.
 */
const COBRANCA: Partial<
  Record<
    HerdStayType,
    { entry_type: "expense" | "income"; category: string; related_module: "rebanho" | "confinamento" }
  >
> = {
  pasto_terceiro: { entry_type: "expense", category: "Arrendamento de pasto", related_module: "rebanho" },
  boitel: { entry_type: "expense", category: "Boitel", related_module: "rebanho" },
  evento: { entry_type: "expense", category: "Leilão e feira", related_module: "rebanho" },
  terceiro_na_fazenda: { entry_type: "income", category: "Aluguel de pasto", related_module: "rebanho" },
  /**
   * Confinamento próprio (fase 3 do Módulo 30). `related_module` PRÓPRIO, e
   * não "rebanho" reaproveitado, como o comentário do enum no schema explica:
   * o custo do lote confinado (§13, §24 da spec) precisa ser somável separado
   * do resto do rebanho.
   */
  confinamento: { entry_type: "expense", category: "Confinamento", related_module: "confinamento" },
};

export async function openStay(
  db: TenantPrismaClient,
  input: OpenStayInput,
): Promise<ActionResult<HerdStayRecord>> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return fail(
      "VALIDATION_ERROR",
      "A quantidade deve ser um número inteiro maior que zero.",
      422,
      "quantity",
    );
  }
  if (!isValidCategory(input.category_id)) {
    return fail("INVALID_CATEGORY", "Categoria inválida.", 422, "category_id");
  }
  if (input.charge_value != null && input.charge_value <= 0) {
    return fail(
      "VALIDATION_ERROR",
      "O valor combinado precisa ser maior que zero.",
      422,
      "charge_value",
    );
  }

  const situacao = situacaoDaEstadia(input.type);
  const dono = donoDaEstadia(input.type);
  const started_at = input.started_at ?? new Date();

  return runSerializableTenantTransaction(db, async (tx) => {
    const stay = await tx.herdStay.create({
      data: scoped({
        type: input.type,
        property_id: input.property_id,
        counterparty_name: input.counterparty_name ?? null,
        location_name: input.location_name ?? null,
        city: input.city ?? null,
        started_at,
        expected_end_at: input.expected_end_at ?? null,
        charge_type: input.charge_type ?? null,
        charge_value: input.charge_value ?? null,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
        confinement_site_id: input.confinement_site_id ?? null,
      }),
    });

    // A posição de onde as cabeças saem, e a de onde elas passam a estar.
    // Animal de terceiro é ENTRADA: não sai de lugar nenhum, porque não estava
    // aqui. Nos outros, ele sai de `presente`/`proprio`, que é onde estava.
    const daFazenda: HerdPositionKey = {
      category_id: input.category_id,
      property_id: input.property_id,
      pasture_id: input.pasture_id ?? null,
      situation: "presente",
      owner: "proprio",
    };
    const naEstadia: HerdPositionKey = {
      category_id: input.category_id,
      property_id: input.property_id,
      // Quem está em pasto de terceiro, boitel ou evento não ocupa pasto NOSSO,
      // e quem desapareceu saiu da quantidade disponível do pasto. O animal de
      // terceiro é o único que fica num pasto daqui.
      pasture_id: input.type === "terceiro_na_fazenda" ? input.pasture_id ?? null : null,
      situation: situacao,
      owner: dono,
    };

    const ehEntrada = input.type === "terceiro_na_fazenda";
    const movimento = await recordMovementInTx(db, tx, {
      movement_type: tipoDeEnvio(input.type),
      quantity: input.quantity,
      from: ehEntrada ? null : daFazenda,
      to: naEstadia,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      occurred_at: started_at,
      recorded_by_user_id: input.recorded_by_user_id ?? null,
      stay_id: stay.id,
    });

    // A recusa do movimento (saldo insuficiente, propriedade inexistente) tem
    // que derrubar a estadia junto: estadia sem movimento é saldo mentindo.
    // Devolver o erro AQUI não desfaz a transação sozinho, então o `throw` é
    // deliberado, e o `catch` de fora traduz de volta.
    if (!movimento.ok) throw new EstadiaRecusada(movimento.code, movimento.message, movimento.field);

    const cobranca = COBRANCA[input.type];
    let financial_entry_id: string | null = null;
    if (cobranca && input.charge_value != null) {
      const entry = await createLinkedEntry(tx, {
        entry_type: cobranca.entry_type,
        category: cobranca.category,
        amount: input.charge_value,
        related_module: cobranca.related_module,
        related_id: stay.id,
        occurred_at: started_at,
        status: "pending",
        due_date: input.due_date ?? input.expected_end_at ?? started_at,
      });
      financial_entry_id = entry.id;
    }

    return ok({
      id: stay.id,
      type: stay.type,
      property_id: stay.property_id,
      counterparty_name: stay.counterparty_name,
      started_at: stay.started_at,
      quantity: input.quantity,
      financial_entry_id,
      confinement_site_id: stay.confinement_site_id,
    });
  }).catch((erro: unknown) => {
    if (erro instanceof EstadiaRecusada) {
      return fail(erro.code, erro.message, 422, erro.field);
    }
    throw erro;
  });
}

export type DestinoDeEncerramento = {
  movement_type: HerdMovementType;
  quantity: number;
  /** Só para venda: gera a receita dos vendidos. */
  value?: number | null;
  /**
   * Só para `retorno_estadia`: o pasto em que as cabeças voltam a ficar.
   *
   * É por destino, e não por chamada, porque um encerramento pode mandar parte
   * para um pasto e parte para venda. Ausente grava nulo, que era o único
   * comportamento possível até 31/08.
   */
  pasture_id?: string | null;
};

export type CloseStayInput = {
  destinos: DestinoDeEncerramento[];
  occurred_at?: Date | null;
  recorded_by_user_id?: string | null;
};

/**
 * O saldo ABERTO de uma estadia: o que entrou nela menos o que já saiu.
 *
 * Derivado das movimentações que apontam para ela, nunca gravado. É o mesmo
 * princípio do saldo do rebanho, aplicado ao episódio: assim não existe um
 * campo que possa divergir da realidade.
 */
export function saldoAberto(
  movimentos: {
    quantity: number;
    from_situation: HerdSituation | null;
    from_owner: HerdOwner | null;
    to_situation: HerdSituation | null;
    to_owner: HerdOwner | null;
  }[],
  situacao: HerdSituation,
  dono: HerdOwner,
): number {
  return movimentos.reduce((total, m) => {
    const entra = m.to_situation === situacao && m.to_owner === dono;
    const sai = m.from_situation === situacao && m.from_owner === dono;
    return total + (entra ? m.quantity : 0) - (sai ? m.quantity : 0);
  }, 0);
}

/**
 * A estadia já teve encerramento? Qualquer movimento que TIRE cabeças dela
 * conta: venda, retorno, morte.
 *
 * Mora aqui, e não dentro de `cancelStay`, porque a missão 3 do Módulo 31
 * precisa da mesma decisão ao cancelar a negociação que criou a remessa. Em
 * dois lugares, uma das cópias envelhece, e a que envelhecesse deixaria
 * desfazer um negócio cujas cabeças já foram vendidas.
 */
export function estadiaJaEncerrada(
  movimentos: { from_situation: HerdSituation | null; from_owner: HerdOwner | null }[],
  situacao: HerdSituation,
  dono: HerdOwner,
): boolean {
  return movimentos.some((m) => m.from_situation === situacao && m.from_owner === dono);
}

/**
 * Encerra uma estadia, total ou parcialmente.
 *
 * Dois documentos do cliente se contradiziam aqui: o das estadias (fase 2)
 * pede que "a soma dessas destinações deverá corresponder à quantidade
 * enviada" (só fecharia exigindo o total); o do Confinamento §20 dá o
 * exemplo oposto ("lote de 40, saem 15 para venda, 25 permanecem no lote").
 * Decisão do usuário em 31/08: o do Confinamento vence. Informar menos que o
 * saldo aberto é aceito, e a estadia segue aberta com o restante; informar mais
 * continua recusado. É o que evita que vender 15 de 40 obrigue fechar o lote e
 * reabrir outro com 25, zerando a contagem de dias do §8 para cabeças que nunca
 * saíram do curral.
 *
 * ⚠️ Vale para os tipos que passam por AQUI, e a remessa de evento não passa.
 * Ela é encerrada por `closeEventConsignment` (`event-consignments.ts`), que
 * tem a própria cópia da regra e **continua exigindo soma exata**, de
 * propósito: lá o encerramento fecha o envelope comercial da negociação, e não
 * só a posição no rebanho. A versão anterior deste comentário dizia "para todos
 * os tipos de estadia" e estava larga demais; corrigido no mesmo dia, depois
 * que um julgamento independente apontou a divergência.
 */
export async function closeStay(
  db: TenantPrismaClient,
  stayId: string,
  input: CloseStayInput,
): Promise<ActionResult<{ id: string; encerrada: boolean; saldo_aberto: number }>> {
  const destinos = input.destinos.filter((d) => d.quantity > 0);
  if (destinos.length === 0) {
    return fail("VALIDATION_ERROR", "Informe ao menos um destino.", 422, "quantity");
  }
  if (destinos.some((d) => !Number.isInteger(d.quantity) || d.quantity <= 0)) {
    return fail("VALIDATION_ERROR", "Cada destino precisa de uma quantidade inteira.", 422, "quantity");
  }

  const stay = await db.herdStay.findFirst({ where: { id: stayId } });
  if (!stay) return fail("NOT_FOUND", "Estadia não encontrada.", 404);
  if (stay.canceled_at) {
    return fail("ESTADIA_CANCELADA", "Esta estadia foi cancelada e não pode ser encerrada.", 422);
  }

  const situacao = situacaoDaEstadia(stay.type);
  const dono = donoDaEstadia(stay.type);

  for (const destino of destinos) {
    if (!permiteEncerramento(stay.type, destino.movement_type)) {
      return fail(
        "ENCERRAMENTO_NAO_PERMITIDO",
        `Este tipo de estadia não permite ${destino.movement_type}.`,
        422,
        "movement_type",
      );
    }
  }

  const occurred_at = input.occurred_at ?? new Date();

  return runSerializableTenantTransaction(db, async (tx) => {
    const movimentos = await tx.herdMovement.findMany({
      where: { stay_id: stayId, canceled_at: null },
      select: {
        quantity: true,
        from_situation: true,
        from_owner: true,
        to_situation: true,
        to_owner: true,
        to_category_id: true,
        to_property_id: true,
      },
    });

    const aberto = saldoAberto(movimentos, situacao, dono);
    const informado = destinos.reduce((s, d) => s + d.quantity, 0);
    if (informado > aberto) {
      throw new EstadiaRecusada(
        "DESTINOS_NAO_BATEM",
        `A soma dos destinos (${informado}) não pode ser maior que o que está na estadia (${aberto}).`,
        "quantity",
      );
    }

    // A categoria e a fazenda vêm do DESTINO do movimento de abertura, que é o
    // único lado sempre preenchido (a entrada de terceiro não tem origem).
    // Encerrar não é hora de escolher categoria de novo: deixar escolher
    // abriria caminho para as cabeças voltarem numa categoria diferente da que
    // saiu, e o saldo fecharia mentindo.
    const abertura = movimentos.find((m) => m.to_situation === situacao && m.to_owner === dono);
    if (!abertura?.to_category_id || !abertura.to_property_id) {
      throw new EstadiaRecusada("ESTADIA_SEM_ABERTURA", "Esta estadia não tem movimentação de abertura.", undefined);
    }
    const category_id = abertura.to_category_id;
    const property_id = abertura.to_property_id;

    const naEstadia: HerdPositionKey = {
      category_id,
      property_id,
      pasture_id: null,
      situation: situacao,
      owner: dono,
    };
    for (const destino of destinos) {
      /**
       * O pasto de volta é POR DESTINO, e por isso esta posição é montada
       * dentro do laço.
       *
       * Até 31/08 ela ficava fora, com `pasture_id: null` fixo, e o §18 do
       * documento do Confinamento pede o contrário: "serão vinculados ao pasto
       * informado". O produtor tirava 10 bois "para o Pasto da Sede", a tela e
       * o agente confirmavam citando o pasto, e as cabeças voltavam sem pasto
       * nenhum: ele tinha que transferir depois para onde já havia dito que
       * tinha colocado. Decisão do usuário em 31/08, e vale para os seis tipos
       * de estadia, porque este é o mesmo caminho de código para todos.
       *
       * Venda e morte ignoram o pasto por construção, não por checagem: elas
       * não entram em `volta`, então `to` vai nulo e o campo não é lido. E o
       * pasto de outra propriedade já é recusado por `validatePosition`
       * (`herd-ledger.ts`), por onde toda posição de destino passa: uma segunda
       * validação aqui seria a mesma regra em dois lugares, divergindo na
       * primeira vez que uma delas mudasse.
       */
      const naFazenda: HerdPositionKey = {
        category_id,
        property_id,
        pasture_id: destino.pasture_id ?? null,
        situation: "presente",
        owner: dono === "terceiro" ? "terceiro" : "proprio",
      };

      const volta = destino.movement_type === "retorno_estadia";
      const movimento = await recordMovementInTx(db, tx, {
        movement_type: destino.movement_type,
        quantity: destino.quantity,
        from: naEstadia,
        to: volta ? naFazenda : null,
        value: destino.value ?? null,
        occurred_at,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
        stay_id: stayId,
      });
      if (!movimento.ok) {
        throw new EstadiaRecusada(movimento.code, movimento.message, movimento.field);
      }
    }

    const restante = aberto - informado;
    return ok({ id: stayId, encerrada: restante === 0, saldo_aberto: restante });
  }).catch((erro: unknown) => {
    if (erro instanceof EstadiaRecusada) {
      return fail(erro.code, erro.message, 422, erro.field);
    }
    throw erro;
  });
}

export type HerdStayListItem = {
  id: string;
  type: HerdStayType;
  property_id: string;
  counterparty_name: string | null;
  location_name: string | null;
  /** De qual negociação a estadia nasceu. Só a remessa de evento tem. */
  negotiation_id: string | null;
  started_at: Date;
  expected_end_at: Date | null;
  charge_type: HerdChargeType | null;
  charge_value: number | null;
  /** O que ainda está na estadia. Derivado, nunca gravado. */
  saldo_aberto: number;
  /** Aberta é `saldo_aberto > 0`. Não existe campo dizendo isso. */
  aberta: boolean;
  canceled_at: Date | null;
};

/**
 * Lista as estadias com o saldo aberto de cada uma.
 *
 * O saldo sai das movimentações, numa consulta só para todas as estadias: uma
 * por estadia viraria N+1 na tela que mais importa desta frente.
 */
export async function listStays(
  db: TenantPrismaClient,
  filtro: { property_id?: string; type?: HerdStayType; apenas_abertas?: boolean } = {},
): Promise<ActionResult<HerdStayListItem[]>> {
  const stays = await db.herdStay.findMany({
    where: {
      ...(filtro.property_id ? { property_id: filtro.property_id } : {}),
      ...(filtro.type ? { type: filtro.type } : {}),
    },
    orderBy: { started_at: "desc" },
  });
  if (stays.length === 0) return ok([]);

  const movimentos = await db.herdMovement.findMany({
    where: { stay_id: { in: stays.map((s) => s.id) }, canceled_at: null },
    select: {
      stay_id: true,
      quantity: true,
      from_situation: true,
      from_owner: true,
      to_situation: true,
      to_owner: true,
    },
  });

  const porEstadia = new Map<string, typeof movimentos>();
  for (const m of movimentos) {
    if (!m.stay_id) continue;
    const lista = porEstadia.get(m.stay_id) ?? [];
    lista.push(m);
    porEstadia.set(m.stay_id, lista);
  }

  const itens = stays.map((stay) => {
    const aberto = saldoAberto(
      porEstadia.get(stay.id) ?? [],
      situacaoDaEstadia(stay.type),
      donoDaEstadia(stay.type),
    );
    return {
      id: stay.id,
      type: stay.type,
      property_id: stay.property_id,
      counterparty_name: stay.counterparty_name,
      location_name: stay.location_name,
      negotiation_id: stay.negotiation_id,
      started_at: stay.started_at,
      expected_end_at: stay.expected_end_at,
      charge_type: stay.charge_type,
      charge_value: decToNum(stay.charge_value),
      saldo_aberto: aberto,
      aberta: aberto > 0 && stay.canceled_at === null,
      canceled_at: stay.canceled_at,
    };
  });

  return ok(filtro.apenas_abertas ? itens.filter((i) => i.aberta) : itens);
}

/**
 * Cancela a estadia inteira: as cabeças voltam para onde estavam e o dinheiro
 * pendente para de contar.
 *
 * Cancelar NÃO apaga, aqui como no resto do projeto: a estadia e as
 * movimentações continuam no histórico, marcadas, e param de contar no saldo.
 *
 * Recusa estadia que já teve encerramento, e isso é deliberado: desfazer um
 * encerramento parcial exigiria decidir o que fazer com o que já foi vendido,
 * e essa decisão é do produtor, não nossa. O caminho é cancelar a movimentação
 * de encerramento primeiro.
 */
export async function cancelStay(
  db: TenantPrismaClient,
  stayId: string,
  input: { reason?: string | null; canceled_by_user_id?: string | null } = {},
): Promise<ActionResult<{ id: string }>> {
  const stay = await db.herdStay.findFirst({ where: { id: stayId } });
  if (!stay) return fail("NOT_FOUND", "Estadia não encontrada.", 404);
  if (stay.canceled_at) return fail("ESTADIA_JA_CANCELADA", "Esta estadia já foi cancelada.", 422);

  const situacao = situacaoDaEstadia(stay.type);
  const dono = donoDaEstadia(stay.type);

  return runSerializableTenantTransaction(db, async (tx) => {
    const movimentos = await tx.herdMovement.findMany({
      where: { stay_id: stayId, canceled_at: null },
    });

    if (estadiaJaEncerrada(movimentos, situacao, dono)) {
      throw new EstadiaRecusada(
        "ESTADIA_JA_ENCERRADA",
        "Esta estadia já tem encerramento registrado. Cancele a movimentação de encerramento antes.",
      );
    }

    const agora = new Date();
    await tx.herdMovement.updateMany({
      where: { stay_id: stayId, canceled_at: null },
      data: { canceled_at: agora, canceled_reason: input.reason ?? "Estadia cancelada" },
    });

    // O dinheiro segue o mesmo tratamento do `cancelMovement`: pendente é
    // apagado, porque nunca virou dinheiro; pago ganha estorno datado de hoje,
    // porque o dinheiro saiu de verdade e o fluxo de caixa precisa ver a volta.
    const contas = await tx.financialEntry.findMany({
      where: { related_module: "rebanho", related_id: stayId },
    });
    for (const conta of contas) {
      if (conta.status === "pending") {
        await tx.financialEntry.delete({ where: { id: conta.id } });
      } else {
        await createLinkedEntry(tx, {
          entry_type: conta.entry_type === "income" ? "expense" : "income",
          category: "Estorno de estadia do rebanho",
          amount: decToNum(conta.amount) ?? 0,
          related_module: "rebanho",
          related_id: stayId,
          occurred_at: agora,
        });
      }
    }

    await tx.herdStay.update({
      where: { id: stayId },
      data: {
        canceled_at: agora,
        canceled_reason: input.reason ?? null,
        canceled_by_user_id: input.canceled_by_user_id ?? null,
      },
    });

    return ok({ id: stayId });
  }).catch((erro: unknown) => {
    if (erro instanceof EstadiaRecusada) {
      return fail(erro.code, erro.message, 422, erro.field);
    }
    throw erro;
  });
}

/**
 * Recusa de negócio de dentro da transação.
 *
 * Existe porque devolver `fail()` de dentro do `$transaction` CONFIRMA a
 * transação: é a armadilha que a seção 6 da spec do Módulo 31 documenta, e que
 * aqui deixaria a estadia gravada sem a movimentação dela.
 */
class EstadiaRecusada extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "EstadiaRecusada";
  }
}
