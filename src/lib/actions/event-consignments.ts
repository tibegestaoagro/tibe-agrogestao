import type { HerdStayType } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { recordMovementInTx, type HerdPositionKey } from "@/lib/actions/herd-ledger";
import { isValidCategory } from "@/lib/herd/categories";
import { findOrCreateContact } from "@/lib/actions/contacts";
import { saldoAberto } from "@/lib/actions/herd-stays";
import { donoDaEstadia, situacaoDaEstadia, tipoDeEnvio } from "@/lib/herd/stay-rules";
import { AbortarNegociacao, comRollback, validarPagamento } from "@/lib/actions/negotiations";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Módulo 31, missão 3: a remessa para leilão, feira ou evento. Ver
 * docs/superpowers/specs/2026-08-28-modulo-31-missao-3-leilao-design.md.
 *
 * A frase do cliente que este arquivo existe para obedecer: "o simples envio
 * de animais para um evento não será considerado venda. Primeiro deverá
 * existir uma remessa temporária" (§8, repetido no §17.8).
 *
 * A estrutura sai da tensão entre duas peças que já existiam: `Negotiation` é
 * o ENVELOPE comercial (é onde o produtor procura o negócio) e `HerdStay` diz
 * ONDE as cabeças estão. A remessa é as duas coisas, então a estadia nasce
 * FILHA da negociação, e as movimentações apontam para ambas.
 *
 * NADA de `createLinkedEntry` na abertura. Receita antes da confirmação é
 * exatamente o erro que o §17.8 proíbe, e é o primeiro caso do `test:m48`.
 */

export type OpenEventConsignmentInput = {
  property_id: string;
  category_id: string;
  quantity: number;
  /** Pasto de onde as cabeças saem. No destino não há pasto: elas foram embora. */
  pasture_id?: string | null;
  /** "Nome do evento" do §8.1. Vira o `location_name` da estadia. */
  event_name: string;
  /** "Tipo do evento" do §8.1: leilão, feira, exposição. Texto livre. */
  event_type?: string | null;
  city?: string | null;
  /** Leiloeira ou organizador. Resolvido ou criado dentro da transação. */
  organizer_name?: string | null;
  contact_id?: string | null;
  occurred_at?: Date | null;
  expected_end_at?: Date | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

export async function openEventConsignment(
  db: TenantPrismaClient,
  input: OpenEventConsignmentInput,
): Promise<ActionResult<{ id: string; stay_id: string }>> {
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
  if (!input.event_name?.trim()) {
    return fail("VALIDATION_ERROR", "Informe o nome do evento.", 422, "event_name");
  }

  // A negociação é criada ANTES do movimento, e a chave estrangeira da fazenda
  // estouraria como erro de banco em vez de recusa de negócio. Mesma checagem
  // que `createCattleNegotiation` faz, pelo mesmo motivo.
  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Fazenda inválida.", 422, "property_id");
  if (input.contact_id) {
    const contato = await db.contact.findFirst({ where: { id: input.contact_id } });
    if (!contato) return fail("INVALID_CONTACT", "Contato inválido.", 422, "contact_id");
  }

  const occurred_at = input.occurred_at ?? new Date();

  return comRollback(() =>
    runSerializableTenantTransaction(db, async (tx) => {
      // O contato nasce dentro da transação: se o saldo recusar adiante, a
      // leiloeira não fica cadastrada por um negócio que não existiu.
      let contactId = input.contact_id ?? null;
      if (!contactId && input.organizer_name?.trim()) {
        contactId = (await findOrCreateContact(tx, input.organizer_name)).id;
      }

      const negociacao = await tx.negotiation.create({
        data: scoped({
          type: "evento",
          occurred_at,
          property_id: input.property_id,
          contact_id: contactId,
          // SEM valor: quanto o leilão rendeu só se sabe no encerramento, e
          // preencher aqui seria a receita que o §17.8 proíbe.
          amount: null,
          notes: input.notes ?? null,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
        }),
      });

      const estadia = await tx.herdStay.create({
        data: scoped({
          type: "evento",
          property_id: input.property_id,
          negotiation_id: negociacao.id,
          event_type: input.event_type?.trim() || null,
          location_name: input.event_name.trim(),
          counterparty_name: input.organizer_name?.trim() || null,
          city: input.city ?? null,
          started_at: occurred_at,
          expected_end_at: input.expected_end_at ?? null,
          notes: input.notes ?? null,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
        }),
      });

      const naFazenda: HerdPositionKey = {
        category_id: input.category_id,
        property_id: input.property_id,
        pasture_id: input.pasture_id ?? null,
        situation: "presente",
        owner: "proprio",
      };
      const noEvento: HerdPositionKey = {
        category_id: input.category_id,
        property_id: input.property_id,
        // Quem foi para o leilão não ocupa pasto nosso.
        pasture_id: null,
        situation: situacaoDaEstadia("evento"),
        owner: donoDaEstadia("evento"),
      };

      const movimento = await recordMovementInTx(db, tx, {
        movement_type: tipoDeEnvio("evento"),
        quantity: input.quantity,
        from: naFazenda,
        to: noEvento,
        // Sem valor: o livro-razão não é quem cria dinheiro aqui, e aqui não
        // nasce dinheiro nenhum.
        value: null,
        occurred_at,
        notes: input.notes ?? null,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
        negotiation_id: negociacao.id,
        stay_id: estadia.id,
      });
      // throw, não return: devolver de dentro do `$transaction` CONFIRMA a
      // transação, e a negociação ficaria gravada apontando para nada.
      if (!movimento.ok) throw new AbortarNegociacao(movimento);

      return ok({ id: negociacao.id, stay_id: estadia.id });
    }),
  );
}

/**
 * Recusa de dentro da transação. `throw`, e não `return`: devolver um valor de
 * dentro do callback de `$transaction` CONFIRMA a transação, e o encerramento
 * ficaria gravado pela metade.
 */
function recusa(code: string, message: string, field?: string): AbortarNegociacao {
  return new AbortarNegociacao({
    ok: false,
    code,
    message,
    status: 422,
    ...(field ? { field } : {}),
  });
}

/** Para onde as cabeças que não venderam nem voltaram seguiram. */
export type OutroDestino = {
  quantity: number;
  type: HerdStayType;
  counterparty_name?: string | null;
  location_name?: string | null;
  city?: string | null;
  expected_end_at?: Date | null;
};

export type CloseEventConsignmentInput = {
  vendidos?: number;
  retornados?: number;
  outro_destino?: OutroDestino | null;
  /** Valor da VENDA, só dos vendidos. Sem venda, não se aceita valor. */
  amount?: number | null;
  pago?: boolean;
  due_date?: Date | null;
  parcelas?: { due_date: Date; amount: number }[];
  custos?: { descricao: string; amount: number }[];
  occurred_at?: Date | null;
  recorded_by_user_id?: string | null;
};

/**
 * Encerra a remessa: o produtor diz quantos venderam, quantos voltaram e
 * quantos seguiram para outro destino.
 *
 * A regra que o documento cobra em duas seções: "a soma dessas destinações
 * deverá corresponder à quantidade enviada". Não batendo, NADA se move.
 *
 * Encerramento parcial não é caso especial: é um encerramento em que um dos
 * baldes é "outro destino". A soma sempre fecha; o que varia é para onde foram.
 */
export async function closeEventConsignment(
  db: TenantPrismaClient,
  negotiationId: string,
  input: CloseEventConsignmentInput,
): Promise<ActionResult<{ id: string; encerrada: boolean; nova_estadia_id: string | null }>> {
  const vendidos = input.vendidos ?? 0;
  const retornados = input.retornados ?? 0;
  const outros = input.outro_destino?.quantity ?? 0;

  for (const [nome, valor] of [
    ["vendidos", vendidos],
    ["retornados", retornados],
    ["outro_destino", outros],
  ] as const) {
    if (!Number.isInteger(valor) || valor < 0) {
      return fail("VALIDATION_ERROR", `A quantidade de ${nome} precisa ser um número inteiro.`, 422, "quantity");
    }
  }
  if (vendidos + retornados + outros === 0) {
    return fail("VALIDATION_ERROR", "Informe ao menos um destino.", 422, "quantity");
  }

  // Decisão 4 da spec, que não está no documento do cliente: aceitar valor num
  // encerramento sem venda criaria receita sem contrapartida no rebanho.
  if (vendidos === 0 && input.amount != null) {
    return fail(
      "VALOR_SEM_VENDA",
      "Não houve venda neste encerramento, então não há valor a informar.",
      422,
      "amount",
    );
  }
  // O espelho da regra acima: o encerramento é o momento em que o documento
  // manda confirmar a venda, e uma venda sem valor tira gado do rebanho sem
  // gerar receita nenhuma, em silêncio.
  if (vendidos > 0 && (input.amount == null || !Number.isFinite(input.amount) || input.amount <= 0)) {
    return fail("VENDA_SEM_VALOR", "Informe o valor da venda.", 422, "amount");
  }

  if (input.amount != null) {
    const erro = validarPagamento({
      amount: input.amount,
      pago: input.pago,
      parcelas: input.parcelas,
      custos: input.custos,
    });
    if (erro) return fail(erro.code, erro.message, 422, "amount");
  }

  // Animal do produtor não vira animal de terceiro por mudar de lugar. É o
  // único tipo de estadia que não pode receber cabeças vindas de um evento.
  if (input.outro_destino && donoDaEstadia(input.outro_destino.type) !== "proprio") {
    return fail(
      "DESTINO_INVALIDO",
      "As cabeças continuam sendo suas: escolha um destino de animal próprio.",
      422,
      "outro_destino",
    );
  }

  const negociacao = await db.negotiation.findFirst({ where: { id: negotiationId } });
  if (!negociacao) return fail("NOT_FOUND", "Negociação não encontrada.", 404);
  if (negociacao.type !== "evento") {
    return fail("NAO_E_REMESSA", "Esta negociação não é uma remessa para evento.", 422);
  }
  if (negociacao.canceled_at) {
    return fail("NEGOCIACAO_CANCELADA", "Esta remessa foi cancelada.", 422);
  }

  const occurred_at = input.occurred_at ?? new Date();

  return comRollback(() =>
    runSerializableTenantTransaction(db, async (tx) => {
      const estadia = await tx.herdStay.findFirst({
        where: { negotiation_id: negotiationId, type: "evento", canceled_at: null },
      });
      if (!estadia) {
        throw recusa("REMESSA_SEM_ESTADIA", "Esta remessa não tem estadia aberta.");
      }

      const movimentos = await tx.herdMovement.findMany({
        where: { stay_id: estadia.id, canceled_at: null },
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

      const situacao = situacaoDaEstadia("evento");
      const dono = donoDaEstadia("evento");
      const aberto = saldoAberto(movimentos, situacao, dono);
      const informado = vendidos + retornados + outros;
      if (informado !== aberto) {
        throw recusa(
          "DESTINOS_NAO_BATEM",
          `A soma dos destinos (${informado}) precisa ser igual ao que está na remessa (${aberto}).`,
          "quantity",
        );
      }

      // Categoria e fazenda vêm do DESTINO do envio, o único lado sempre
      // preenchido. Encerrar não é hora de escolher categoria de novo: as
      // cabeças voltariam numa categoria diferente da que saiu e o saldo
      // fecharia mentindo. Mesma regra do `closeStay`.
      const abertura = movimentos.find((m) => m.to_situation === situacao && m.to_owner === dono);
      if (!abertura?.to_category_id || !abertura.to_property_id) {
        throw recusa("REMESSA_SEM_ABERTURA", "Esta remessa não tem movimentação de envio.");
      }
      const category_id = abertura.to_category_id;
      const property_id = abertura.to_property_id;

      const noEvento: HerdPositionKey = {
        category_id,
        property_id,
        pasture_id: null,
        situation: situacao,
        owner: dono,
      };
      const naFazenda: HerdPositionKey = {
        category_id,
        property_id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      };

      const gravar = async (entrada: Parameters<typeof recordMovementInTx>[2]) => {
        const movimento = await recordMovementInTx(db, tx, entrada);
        if (!movimento.ok) throw new AbortarNegociacao(movimento);
      };

      if (vendidos > 0) {
        await gravar({
          movement_type: "venda",
          quantity: vendidos,
          from: noEvento,
          to: null,
          // O dinheiro é criado aqui embaixo, com as parcelas e os custos do
          // negócio. Deixar o livro-razão criar também geraria dois
          // lançamentos para a mesma venda.
          value: null,
          occurred_at,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
          negotiation_id: negotiationId,
          stay_id: estadia.id,
        });
      }

      if (retornados > 0) {
        await gravar({
          movement_type: "retorno_estadia",
          quantity: retornados,
          from: noEvento,
          to: naFazenda,
          occurred_at,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
          negotiation_id: negotiationId,
          stay_id: estadia.id,
        });
      }

      let novaEstadiaId: string | null = null;
      if (input.outro_destino && outros > 0) {
        const destino = input.outro_destino;
        const nova = await tx.herdStay.create({
          data: scoped({
            type: destino.type,
            property_id,
            counterparty_name: destino.counterparty_name ?? null,
            location_name: destino.location_name ?? null,
            city: destino.city ?? null,
            started_at: occurred_at,
            expected_end_at: destino.expected_end_at ?? null,
            notes: `Seguiu direto de ${estadia.location_name ?? "um evento"}.`,
            recorded_by_user_id: input.recorded_by_user_id ?? null,
          }),
        });
        novaEstadiaId = nova.id;

        // DOIS movimentos, e não um só de `evento` direto para a situação
        // nova. `HerdMovement.stay_id` aponta para UMA estadia, e o saldo de
        // cada estadia é a soma dos movimentos que apontam para ela: com um
        // movimento só, uma das duas ficaria mentindo (a remessa aberta com
        // saldo fantasma, ou a estadia nova nascendo vazia). Os dois entram na
        // mesma transação e no mesmo instante, então a passagem pela fazenda
        // não é observável em saldo nenhum.
        await gravar({
          movement_type: "retorno_estadia",
          quantity: outros,
          from: noEvento,
          to: naFazenda,
          occurred_at,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
          negotiation_id: negotiationId,
          stay_id: estadia.id,
        });
        await gravar({
          movement_type: tipoDeEnvio(destino.type),
          quantity: outros,
          from: naFazenda,
          to: {
            category_id,
            property_id,
            pasture_id: null,
            situation: situacaoDaEstadia(destino.type),
            owner: donoDaEstadia(destino.type),
          },
          occurred_at,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
          negotiation_id: negotiationId,
          stay_id: nova.id,
        });
      }

      // O dinheiro, só agora, e só se houve venda. É a confirmação que o
      // §17.8 exige antes de qualquer receita.
      if (vendidos > 0 && input.amount != null) {
        await tx.negotiation.update({
          where: { id: negotiationId },
          data: { amount: input.amount },
        });

        const parcelas =
          input.pago || !input.parcelas || input.parcelas.length === 0
            ? [
                {
                  due_date: input.pago ? occurred_at : (input.due_date ?? new Date()),
                  amount: input.amount,
                },
              ]
            : input.parcelas;

        for (const parcela of parcelas) {
          await createLinkedEntry(tx, {
            entry_type: "income",
            category: "Venda de animal",
            amount: parcela.amount,
            related_module: "rebanho",
            related_id: negotiationId,
            occurred_at,
            due_date: parcela.due_date,
            status: input.pago ? "paid" : "pending",
            negotiation_id: negotiationId,
            negotiation_role: "principal",
          });
        }
      }

      // §15: comissão da leiloeira, taxa do evento e frete são DESPESA sempre,
      // mesmo numa venda, e lançamento próprio. Em campo da negociação eles
      // sumiriam do DRE, e o produtor veria a venda render menos sem
      // conseguir apontar onde.
      for (const custo of input.custos ?? []) {
        await createLinkedEntry(tx, {
          entry_type: "expense",
          category: custo.descricao,
          amount: custo.amount,
          related_module: "rebanho",
          related_id: negotiationId,
          occurred_at,
          due_date: input.pago ? occurred_at : (input.due_date ?? new Date()),
          status: input.pago ? "paid" : "pending",
          negotiation_id: negotiationId,
          negotiation_role: "custo_adicional",
        });
      }

      return ok({
        id: negotiationId,
        encerrada: aberto - informado === 0,
        nova_estadia_id: novaEstadiaId,
      });
    }),
  );
}
