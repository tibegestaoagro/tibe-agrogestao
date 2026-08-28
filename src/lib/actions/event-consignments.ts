import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { recordMovementInTx, type HerdPositionKey } from "@/lib/actions/herd-ledger";
import { isValidCategory } from "@/lib/herd/categories";
import { findOrCreateContact } from "@/lib/actions/contacts";
import { donoDaEstadia, situacaoDaEstadia, tipoDeEnvio } from "@/lib/herd/stay-rules";
import { AbortarNegociacao, comRollback } from "@/lib/actions/negotiations";
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
