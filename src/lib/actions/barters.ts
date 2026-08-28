import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { recordMovementInTx, type HerdPositionKey } from "@/lib/actions/herd-ledger";
import { isValidCategory } from "@/lib/herd/categories";
import { findOrCreateContact } from "@/lib/actions/contacts";
import { AbortarNegociacao, comRollback, validarPagamento } from "@/lib/actions/negotiations";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Módulo 31, missão 4: a permuta. Ver
 * docs/superpowers/specs/2026-08-28-modulo-31-missao-4-permuta-design.md.
 *
 * A exigência dura do §12.6: "a permuta deverá ser registrada como uma única
 * negociação. O produtor não deverá precisar criar manualmente uma venda e
 * depois uma compra."
 *
 * Cada lado é gravado por quem já sabe gravá-lo, seguindo a decisão 1 da spec
 * do Módulo 31 (a Negociação é ENVELOPE, não fonte da verdade): animais no
 * livro-razão do rebanho, produtos no do estoque, máquina no cadastro de
 * Máquinas, e o lado que não tem área no Tibé vira texto.
 *
 * O VALOR da negociação é a DIFERENÇA em dinheiro, e só ela. Os valores
 * estimados do §12.4 ficam fora da v1: o único número que o sistema pode
 * defender é o dinheiro que de fato mudou de mão.
 */

export type LadoEntregue =
  | { kind: "animais"; category_id: string; quantity: number; pasture_id?: string | null }
  | { kind: "produtos"; product_id: string; quantity: number }
  | { kind: "maquina"; machine_id: string }
  | { kind: "descricao"; texto: string };

export type LadoRecebido =
  | { kind: "animais"; category_id: string; quantity: number; pasture_id?: string | null }
  | { kind: "produtos"; product_id: string; quantity: number }
  | {
      kind: "maquina";
      name: string;
      type: string;
      brand?: string | null;
      model?: string | null;
      year?: number | null;
    }
  | { kind: "descricao"; texto: string };

export type BarterInput = {
  property_id: string;
  entregue: LadoEntregue | null;
  recebido: LadoRecebido | null;
  /** §12.2: "houve diferença em dinheiro?". É o valor da negociação. */
  diferenca?: { direcao: "paguei" | "recebi"; amount: number } | null;
  contact_id?: string | null;
  contact_name?: string | null;
  occurred_at?: Date | null;
  pago?: boolean;
  due_date?: Date | null;
  parcelas?: { due_date: Date; amount: number }[];
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

/** Este lado movimenta alguma área do Tibé, ou é só descrição? */
function move(lado: LadoEntregue | LadoRecebido | null): boolean {
  return lado != null && lado.kind !== "descricao";
}

/** As recusas de forma de um lado, iguais nos dois sentidos. */
function validarLado(
  lado: LadoEntregue | LadoRecebido | null,
  campo: string,
): { code: string; message: string; field: string } | null {
  if (!lado) return null;
  if (lado.kind === "animais") {
    if (!isValidCategory(lado.category_id)) {
      return { code: "INVALID_CATEGORY", message: "Categoria inválida.", field: "category_id" };
    }
    if (!Number.isInteger(lado.quantity) || lado.quantity <= 0) {
      return {
        code: "VALIDATION_ERROR",
        message: "A quantidade de animais deve ser um número inteiro maior que zero.",
        field: "quantity",
      };
    }
  }
  if (lado.kind === "descricao" && !lado.texto.trim()) {
    return { code: "VALIDATION_ERROR", message: "Descreva o item.", field: campo };
  }
  // A mesma checagem que `createMachineAction` faz: sem ela um nome vazio vira
  // uma linha inútil no cadastro de Máquinas.
  if (lado.kind === "maquina" && "name" in lado) {
    if (!lado.name.trim()) {
      return { code: "VALIDATION_ERROR", message: "Informe o nome da máquina.", field: "name" };
    }
    if (!lado.type.trim()) {
      return { code: "VALIDATION_ERROR", message: "Informe o tipo da máquina.", field: "type" };
    }
  }
  return null;
}

export async function createBarter(
  db: TenantPrismaClient,
  input: BarterInput,
): Promise<ActionResult<{ id: string; machine_id: string | null }>> {
  /**
   * §12: uma permuta em que nada se move e nenhum dinheiro muda de mão é uma
   * anotação, não um negócio. Gravá-la encheria a lista de linhas que não
   * representam nada, e nenhuma área do Tibé teria o que atualizar.
   */
  if (!move(input.entregue) && !move(input.recebido) && !input.diferenca) {
    return fail(
      "PERMUTA_VAZIA",
      "Esta permuta não movimenta nada e não tem diferença em dinheiro. Informe ao menos um item ou o valor da diferença.",
      422,
    );
  }

  for (const [lado, campo] of [
    [input.entregue, "entregue"],
    [input.recebido, "recebido"],
  ] as const) {
    const erro = validarLado(lado, campo);
    if (erro) return fail(erro.code, erro.message, 422, erro.field);
  }

  if (input.diferenca) {
    if (!Number.isFinite(input.diferenca.amount) || input.diferenca.amount <= 0) {
      return fail("VALIDATION_ERROR", "A diferença deve ser maior que zero.", 422, "amount");
    }
    // A regra do §14, num lugar só: a soma das parcelas corresponde ao valor.
    const erro = validarPagamento({
      amount: input.diferenca.amount,
      pago: input.pago,
      parcelas: input.parcelas,
    });
    if (erro) return fail(erro.code, erro.message, 422, "amount");
  }

  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Fazenda inválida.", 422, "property_id");
  if (input.contact_id) {
    const contato = await db.contact.findFirst({ where: { id: input.contact_id } });
    if (!contato) return fail("INVALID_CONTACT", "Contato inválido.", 422, "contact_id");
  }

  const occurred_at = input.occurred_at ?? new Date();
  // Montados ANTES do create: uma escrita a menos que um update depois.
  const barter_out_note =
    input.entregue?.kind === "descricao" ? input.entregue.texto.trim() : null;
  const barter_in_note =
    input.recebido?.kind === "descricao" ? input.recebido.texto.trim() : null;

  return comRollback(() =>
    runSerializableTenantTransaction(db, async (tx) => {
      // O contato nasce dentro da transação: se o saldo recusar adiante, ele
      // não fica cadastrado por um negócio que não existiu.
      let contactId = input.contact_id ?? null;
      if (!contactId && input.contact_name?.trim()) {
        contactId = (await findOrCreateContact(tx, input.contact_name)).id;
      }

      const negociacao = await tx.negotiation.create({
        data: scoped({
          type: "permuta",
          occurred_at,
          property_id: input.property_id,
          contact_id: contactId,
          // O valor é a DIFERENÇA, e nada mais.
          amount: input.diferenca?.amount ?? null,
          barter_out_note,
          barter_in_note,
          notes: input.notes ?? null,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
        }),
      });

      let machineId: string | null = null;

      // A MÁQUINA QUE SAI: já existe, e passa a não ser mais do produtor.
      if (input.entregue?.kind === "maquina") {
        const maquina = await tx.machine.findFirst({ where: { id: input.entregue.machine_id } });
        if (!maquina) {
          throw new AbortarNegociacao({
            ok: false,
            code: "MAQUINA_INDISPONIVEL",
            message: "Máquina não encontrada.",
            status: 422,
            field: "machine_id",
          });
        }
        if (
          maquina.disposed_negotiation_id ||
          maquina.status === "negociada" ||
          maquina.status === "sold"
        ) {
          throw new AbortarNegociacao({
            ok: false,
            code: "MAQUINA_INDISPONIVEL",
            message: `${maquina.name} já saiu do seu patrimônio e não pode ser entregue de novo.`,
            status: 422,
            field: "machine_id",
          });
        }
        await tx.machine.update({
          where: { id: maquina.id },
          // `negociada` e não `sold`: a tela mostra `sold` como "Vendida", e
          // esta máquina não foi vendida, foi trocada.
          data: { status: "negociada", disposed_negotiation_id: negociacao.id },
        });
      }

      // A MÁQUINA QUE ENTRA: nasce aqui, ligada à troca que a trouxe.
      if (input.recebido?.kind === "maquina") {
        const maquina = await tx.machine.create({
          data: scoped({
            property_id: input.property_id,
            name: input.recebido.name.trim(),
            type: input.recebido.type.trim(),
            brand: input.recebido.brand ?? null,
            model: input.recebido.model ?? null,
            year: input.recebido.year ?? null,
            acquired_at: occurred_at,
            // SEM custo de aquisição: o que o trator custou foi o gado, não
            // dinheiro. `createMachineAction` cria um `FinancialEntry` sozinha
            // quando recebe custo, e aqui isso seria uma despesa fantasma além
            // da diferença. É também por isso que esta action grava a Machine
            // direto, e não por aquela: ela não aceita `tx`.
            acquisition_cost: null,
            acquired_negotiation_id: negociacao.id,
          }),
        });
        machineId = maquina.id;
      }

      const posicaoDe = (lado: {
        category_id: string;
        pasture_id?: string | null;
      }): HerdPositionKey => ({
        category_id: lado.category_id,
        property_id: input.property_id,
        pasture_id: lado.pasture_id ?? null,
        situation: "presente",
        owner: "proprio",
      });

      if (input.entregue?.kind === "animais") {
        const movimento = await recordMovementInTx(db, tx, {
          movement_type: "permuta_saida",
          quantity: input.entregue.quantity,
          from: posicaoDe(input.entregue),
          to: null,
          // O dinheiro é criado por esta action, com a diferença e as
          // parcelas. Deixar o livro-razão criar também geraria dois
          // lançamentos para a mesma troca.
          value: null,
          occurred_at,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
          negotiation_id: negociacao.id,
        });
        // throw, nunca return: devolver de dentro do `$transaction` CONFIRMA a
        // transação, e a negociação ficaria gravada apontando para nada.
        if (!movimento.ok) throw new AbortarNegociacao(movimento);
      }

      if (input.recebido?.kind === "animais") {
        const movimento = await recordMovementInTx(db, tx, {
          movement_type: "permuta_entrada",
          quantity: input.recebido.quantity,
          from: null,
          to: posicaoDe(input.recebido),
          value: null,
          occurred_at,
          recorded_by_user_id: input.recorded_by_user_id ?? null,
          negotiation_id: negociacao.id,
        });
        if (!movimento.ok) throw new AbortarNegociacao(movimento);
      }

      // O dinheiro, e só a diferença. Despesa quando o produtor paga, receita
      // quando recebe: é o §12.5 literal.
      if (input.diferenca) {
        const recebe = input.diferenca.direcao === "recebi";
        const parcelas =
          input.pago || !input.parcelas || input.parcelas.length === 0
            ? [
                {
                  due_date: input.pago ? occurred_at : (input.due_date ?? new Date()),
                  amount: input.diferenca.amount,
                },
              ]
            : input.parcelas;

        for (const parcela of parcelas) {
          await createLinkedEntry(tx, {
            entry_type: recebe ? "income" : "expense",
            category: "Diferença de permuta",
            amount: parcela.amount,
            // `geral` e não `rebanho`: uma permuta pode ser estoque por
            // máquina, sem animal nenhum. É o que `moduloDoEstorno` já devolve
            // para `permuta`, então o estorno cai na mesma gaveta.
            related_module: "geral",
            related_id: negociacao.id,
            occurred_at,
            due_date: parcela.due_date,
            status: input.pago ? "paid" : "pending",
            negotiation_id: negociacao.id,
            negotiation_role: "principal",
          });
        }
      }

      return ok({ id: negociacao.id, machine_id: machineId });
    }),
  );
}
