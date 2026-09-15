import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import type { RouterResult } from "@/lib/actions/whatsapp-handlers/shared";
import { str } from "@/lib/actions/whatsapp-handlers/shared";
import type { Intent } from "@/lib/whatsapp-intents";
import {
  getActiveFlow,
  applyAnswer,
  cancelFlow,
  finishFlow,
  startFlow,
  startPropertyQuestion,
  resumeHint,
  FLOWS,
  PROPERTY_PENDING_FIELD,
} from "@/lib/actions/agent-flows";
import { casarFazenda, listActiveProperties } from "@/lib/actions/properties";
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

function isYes(text: string): boolean {
  const t = text.trim().toLowerCase();
  return ["sim", "s", "isso", "confirmo", "pode", "pode sim", "ok", "correto"].includes(t);
}

/**
 * Toda intenção diferente de `ambigua` (resposta curta, sem assunto próprio,
 * que o LLM devolve para algo como "Nelore" solto) e de `cadastrar_animal`
 * (a própria intenção do formulário, inclusive quando ela chega de novo com
 * um campo preenchido) INTERROMPE o formulário: é assunto novo, o roteador
 * responde por fora e o cadastro continua guardado, sem perder o que já foi
 * coletado (Task 10, 2026-09-14).
 *
 * Antes desta regra havia uma lista fixa de intenções "que interrompem", e
 * toda intenção NOVA nascia de fora dela por padrão: cada módulo que chegou
 * precisou lembrar de somar sua própria intenção lá (foi o caso do Estoque,
 * Módulo 31). A lista fixa também tinha o defeito oposto: qualquer intenção
 * que ela não citasse era ENGOLIDA como resposta de campo, e foi assim que
 * "o que tenho pra hoje", dito no meio de um cadastro de animal, quase virou
 * uma tentativa de responder "qual a raça?".
 */
function interrompe(intent: Intent): boolean {
  return intent !== "ambigua" && intent !== "cadastrar_animal";
}

function perguntaFazenda(props: { id: string; name: string }[]): string {
  return `Em qual fazenda? Opções: ${props.map((p) => p.name).join(", ")}.`;
}

/**
 * Resolve a fazenda do cadastro assistido a partir do que se tem: um
 * `property_id`/`property_name` explícito nos parâmetros, ou o texto puro
 * digitado em resposta à pergunta "Em qual fazenda?". Nunca escolhe sozinha
 * entre duas fazendas: só decide quando não há ambiguidade, e pede para o
 * chamador perguntar (de novo, sempre com a MESMA pergunta) nos outros casos.
 */
type ResolucaoDeFazenda = { kind: "resolved"; id: string } | { kind: "ask"; message: string };

function resolverFazenda(
  props: { id: string; name: string }[],
  parameters: Record<string, unknown>,
): ResolucaoDeFazenda {
  const id = str(parameters.property_id);
  if (id) {
    // Nunca confia cego (achado Minor b do review): property_id só vale se
    // for uma das fazendas ATIVAS já carregadas.
    if (props.some((p) => p.id === id)) return { kind: "resolved", id };
    return { kind: "ask", message: perguntaFazenda(props) };
  }

  const nome = str(parameters.property_name) ?? str(parameters.property);
  if (nome) {
    const achada = casarFazenda(props, nome);
    if (achada) return { kind: "resolved", id: achada.id };
    return { kind: "ask", message: perguntaFazenda(props) };
  }

  if (props.length === 1) return { kind: "resolved", id: props[0].id };

  return { kind: "ask", message: perguntaFazenda(props) };
}

export async function handleActiveFlow(params: {
  db: TenantPrismaClient;
  userId: string;
  intent: Intent;
  messageText: string | null;
  confirmed: boolean;
  explicitNo: boolean;
  /**
   * Os parâmetros da intenção (fix round 1): quando o classificador reemite
   * `cadastrar_animal` com `property_name`/`property_id` já preenchido (em
   * vez de só texto livre), é isto que a resposta da fazenda usa PRIMEIRO,
   * antes do texto puro. Opcional para não quebrar chamador que não passa.
   */
  parameters?: Record<string, unknown>;
}): Promise<RouterResult | null> {
  const { db, userId, intent, messageText, confirmed, explicitNo, parameters = {} } = params;
  const state = await getActiveFlow(db, userId);
  if (!state) return null;

  const text = (messageText ?? "").trim();

  // Recusa só pelo `explicitNo` (`detectConfirmation`): a lista própria que
  // vivia aqui tinha "para", e "para a Fazenda B" cancelava o cadastro.
  if (explicitNo) {
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
    if (interrompe(intent)) return null; // responde a dúvida e o roteador segue
    return reply(resumeHint(state) ?? "Posso cadastrar os animais do resumo?", "cadastro_assistido:aguardando_confirmacao");
  }

  // Pergunta de outro assunto no meio do formulário: deixa o roteador
  // responder. O texto de retomada volta na mensagem seguinte do agente.
  if (interrompe(intent) && text.length > 0) return null;

  if (text.length === 0) return null;

  // Ainda não escolheu a fazenda (Task 10): a resposta é o NOME dela, não um
  // campo do animal. Só chega aqui depois do desvio de interrupção acima, então
  // uma intenção com assunto próprio já voltou null antes deste ponto.
  if (state.pending_field === PROPERTY_PENDING_FIELD) {
    const props = await listActiveProperties(db);
    // O classificador pode reemitir `cadastrar_animal` com property_id/name
    // já preenchido (fix round 1, achado Importante): isso vale MAIS que o
    // texto puro. Só cai pro texto livre quando os parâmetros não trazem
    // nada disso.
    const temParametroDeFazenda = str(parameters.property_id) ?? str(parameters.property_name) ?? str(parameters.property);
    const fazenda = resolverFazenda(props, temParametroDeFazenda ? parameters : { property_name: text });
    if (fazenda.kind === "ask") {
      return reply(fazenda.message, "cadastro_assistido:fazenda_nao_encontrada");
    }
    const { reply: texto } = await startFlow(db, userId, "cadastrar_animal", state.target_count, {
      property_id: fazenda.id,
    });
    return reply(texto, "cadastro_assistido:iniciado");
  }

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

  // Com mais de uma fazenda ativa e nenhuma indicada, pergunta ANTES de abrir
  // o formulário, em vez de cair no primeiro item da lista (Task 10): quem
  // cadastra pela Fazenda B não pode ver o animal nascer na Fazenda A porque
  // ela é a primeira em ordem alfabética.
  const fazenda = resolverFazenda(props, parameters);
  if (fazenda.kind === "ask") {
    await startPropertyQuestion(db, userId, count);
    return reply(fazenda.message, "cadastro_assistido:pergunta_fazenda");
  }

  const { reply: texto } = await startFlow(db, userId, "cadastrar_animal", count, {
    property_id: fazenda.id,
  });
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
export async function categoriaDoLivroRazao(db: TenantPrismaClient, herdCategoryId: string) {
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
 *
 * A fazenda vem do PRÓPRIO item (`item.property_id`, gravado quando o fluxo
 * abriu: ver `resolverFazenda`/`startPropertyQuestion` acima). Task 10: antes,
 * este ponto sempre gravava em `props[0]`, a primeira em ordem alfabética,
 * mesmo quando o produtor tinha escolhido outra. O fallback só serve para uma
 * linha que já estivesse em voo antes desta mudança, e só quando não há
 * ambiguidade: nunca escolhe entre duas fazendas aqui.
 */
async function commitAnimals(
  db: TenantPrismaClient,
  items: Record<string, string>[],
): Promise<{ ok: number; failed: number }> {
  const props = await listActiveProperties(db);
  const fallbackPropertyId = props.length === 1 ? props[0].id : null;

  let ok = 0;
  let failed = 0;
  for (const item of items) {
    const propertyId = item.property_id ?? fallbackPropertyId;
    if (!propertyId) {
      failed++;
      log.warn("cadastro assistido: item sem fazenda resolvida", { intent: "cadastro_assistido" });
      continue;
    }
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
