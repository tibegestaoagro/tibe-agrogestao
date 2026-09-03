import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import type { RouterResult } from "@/lib/actions/whatsapp-handlers/shared";
import type { Intent } from "@/lib/whatsapp-intents";
import {
  getActiveFlow,
  applyAnswer,
  cancelFlow,
  finishFlow,
  startFlow,
  resumeHint,
  FLOWS,
} from "@/lib/actions/agent-flows";
import { listActiveProperties } from "@/lib/actions/properties";
import { createBatchAction } from "@/lib/actions/animal-batches";
import { findCategory } from "@/lib/herd/categories";
import { log } from "@/lib/log";

/**
 * Ponte entre o roteador de intenções e o cadastro assistido (2026-07-30).
 *
 * Fica separada do `agent-flows.ts` de propósito: lá mora a máquina de estados
 * pura (testável sem HTTP e sem intenção), aqui mora a decisão de QUANDO a
 * mensagem pertence ao formulário e quando é outro assunto.
 */

function reply(text: string, action: string): RouterResult {
  return {
    reply_text: text,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: action,
  };
}

const CANCEL_WORDS = ["cancelar", "cancela", "parar", "para", "esquece", "esquecer", "deixa pra la", "deixa pra lá"];

function isCancel(text: string): boolean {
  const t = text.trim().toLowerCase();
  return CANCEL_WORDS.some((w) => t === w || t.startsWith(w + " "));
}

function isYes(text: string): boolean {
  const t = text.trim().toLowerCase();
  return ["sim", "s", "isso", "confirmo", "pode", "pode sim", "ok", "correto"].includes(t);
}

/**
 * Intenções que interrompem o formulário para serem respondidas. Qualquer coisa
 * fora dessa lista (inclusive `ambigua`, que é como o LLM classifica um "Nelore"
 * solto) é tratada como resposta de campo.
 */
const INTERRUPTING: ReadonlySet<string> = new Set([
  "consultar_saldo", "consultar_animal", "consultar_cliente",
  "gerar_relatorio", "resumo", "ajuda",
  /**
   * Estoque (Módulo 31). As quatro entraram aqui porque ficar de fora tem
   * consequência dupla: "usei 2 sacas de sal hoje", dito no meio de um cadastro
   * de animal, era tratado como RESPOSTA DE CAMPO. A saída de estoque sumia sem
   * aviso e o animal ficava com raça "usei 2 sacas de sal hoje". `consultar_*`
   * já estava aqui por esse motivo; faltava o estoque.
   */
  "consultar_estoque", "registrar_uso_estoque", "ajustar_estoque",
  "registrar_negocio_produto",
]);

export async function handleActiveFlow(params: {
  db: TenantPrismaClient;
  userId: string;
  intent: Intent;
  messageText: string | null;
  confirmed: boolean;
  explicitNo: boolean;
}): Promise<RouterResult | null> {
  const { db, userId, intent, messageText, confirmed, explicitNo } = params;
  const state = await getActiveFlow(db, userId);
  if (!state) return null;

  const text = (messageText ?? "").trim();

  if (isCancel(text) || explicitNo) {
    const res = await cancelFlow(db, userId);
    const n = res?.discarded ?? 0;
    return reply(
      n > 0
        ? `Cancelei. ${n} animal(is) que estávamos montando não foram salvos.`
        : "Cancelei o cadastro. Nada foi salvo.",
      "cadastro_assistido:cancelado",
    );
  }

  // Resumo aguardando confirmação: é aqui que os animais finalmente existem.
  if (state.awaiting_summary) {
    if (confirmed || isYes(text)) {
      const created = await commitAnimals(db, state.completed_items);
      await finishFlow(db, userId);
      return reply(
        `Pronto! ${created.ok} animal(is) cadastrado(s).` +
          (created.failed > 0 ? ` ${created.failed} não pude cadastrar (brinco repetido ou dado inválido).` : ""),
        "cadastro_assistido:concluido",
      );
    }
    if (INTERRUPTING.has(intent)) return null; // responde a dúvida e o roteador segue
    return reply(resumeHint(state) ?? "Posso cadastrar os animais do resumo?", "cadastro_assistido:aguardando_confirmacao");
  }

  // Pergunta de outro assunto no meio do formulário: deixa o roteador
  // responder. O texto de retomada volta na mensagem seguinte do agente.
  if (INTERRUPTING.has(intent) && text.length > 0) return null;

  if (text.length === 0) return null;

  const res = await applyAnswer(db, userId, text);
  if (res.kind === "none") return null;
  return reply(res.reply, `cadastro_assistido:${res.kind}`);
}

/** Abre o modo assistido quando faltam campos para cadastrar o animal. */
export async function maybeStartAnimalFlow(
  db: TenantPrismaClient,
  userId: string,
  parameters: Record<string, unknown>,
): Promise<RouterResult | null> {
  const def = FLOWS.cadastrar_animal;
  const faltando = def.fields.some((f) => {
    if (f.triggersFlow === false) return false;
    const v = parameters[f.name];
    return typeof v !== "string" || v.trim().length === 0;
  });
  if (!faltando) return null; // veio completo: segue o caminho direto de sempre

  const props = await listActiveProperties(db);
  if (props.length === 0) {
    return reply(
      "Você ainda não tem nenhuma propriedade cadastrada. Cadastre uma propriedade antes de adicionar animais.",
      "cadastro_assistido:sem_propriedade",
    );
  }

  const raw = parameters.count ?? parameters.quantidade ?? parameters.quantity;
  const count = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? "1"), 10) || 1;
  const { reply: texto } = await startFlow(db, userId, "cadastrar_animal", count);
  return reply(texto, "cadastro_assistido:iniciado");
}

/**
 * Encontra (ou cria) a linha de `AnimalCategory` cujo NOME é o rótulo exato
 * de uma das 12 categorias do livro-razão (`src/lib/herd/categories.ts`).
 *
 * `createBatchAction` só aceita `category_id` da tabela antiga, e por dentro
 * traduz o NOME dela de volta para as 12 via `resolveCategoryTerm`. Usar o
 * rótulo exato como nome garante que essa tradução sempre resolve `exact`,
 * porque é comparação literal (`mesmaFrase`), não achismo: aqui não há
 * ambiguidade para resolver de novo, porque a pergunta do fluxo já resolveu.
 */
async function categoriaDoLivroRazao(db: TenantPrismaClient, herdCategoryId: string) {
  const rotulo = findCategory(herdCategoryId)?.label ?? "Não classificado";
  return (
    (await db.animalCategory.findFirst({ where: { name: rotulo } })) ??
    (await db.animalCategory.create({ data: scoped({ name: rotulo }) }))
  );
}

/**
 * Grava os animais coletados. Erro num item não derruba os outros: quem passou
 * 5 animais no funil não pode perder os 5 porque o terceiro tinha brinco
 * repetido.
 *
 * ⚠️ Chama `createBatchAction` (invariante 6: regra de negócio vive na
 * action), e não `db.animalBatch.create()` direto. É o que faz o lote ENTRAR
 * no saldo: a action grava o `HerdMovement` sozinha, a partir da categoria
 * que a pergunta nova do fluxo já resolveu (`dividas.md` §2.9).
 */
async function commitAnimals(
  db: TenantPrismaClient,
  items: Record<string, string>[],
): Promise<{ ok: number; failed: number }> {
  const props = await listActiveProperties(db);
  const propertyId = props[0]?.id;
  if (!propertyId) return { ok: 0, failed: items.length };

  let ok = 0;
  let failed = 0;
  for (const item of items) {
    const category = await categoriaDoLivroRazao(db, item.category);
    const res = await createBatchAction(db, {
      category_id: category.id,
      property_id: propertyId,
      quantity: 1,
      ear_tag: item.ear_tag,
      breed: item.breed,
      sex: item.sex as "male" | "female",
    });
    if (res.ok) {
      ok++;
    } else {
      failed++;
      // Motivo estruturado, não engolido: quem perde gado do cadastro precisa
      // de rastro (`dividas.md` §2.9, decisão 4). Sem o brinco nem a mensagem
      // no log: são dado do produtor, e a regra de privacidade do log
      // estruturado não abre exceção para o cadastro assistido.
      log.warn("cadastro assistido: item nao gravado", {
        intent: "cadastro_assistido",
        code: res.code,
      });
    }
  }
  return { ok, failed };
}
