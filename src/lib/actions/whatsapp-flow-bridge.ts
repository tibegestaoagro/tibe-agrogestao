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
 * Grava os animais coletados. Erro num item não derruba os outros: quem passou
 * 5 animais no funil não pode perder os 5 porque o terceiro tinha brinco
 * repetido.
 */
async function commitAnimals(
  db: TenantPrismaClient,
  items: Record<string, string>[],
): Promise<{ ok: number; failed: number }> {
  const props = await listActiveProperties(db);
  const propertyId = props[0]?.id;
  if (!propertyId) return { ok: 0, failed: items.length };

  // Categoria padrão: o cadastro assistido pergunta brinco, raça e sexo, não
  // categoria. "Não classificado" é a mesma que a migração usou.
  const category =
    (await db.animalCategory.findFirst({ where: { name: "Não classificado" } })) ??
    (await db.animalCategory.create({ data: scoped({ name: "Não classificado" }) }));
  const categoryId = category.id;

  let ok = 0;
  let failed = 0;
  for (const item of items) {
    try {
      // Modelo único (2026-08-04): cada animal identificado do cadastro
      // assistido vira um lote de 1 cabeça, na categoria padrão.
      await db.animalBatch.create({
        data: scoped({
          ear_tag: item.ear_tag,
          breed: item.breed,
          sex: item.sex as "male" | "female",
          property_id: propertyId,
          category_id: categoryId,
          quantity: 1,
        }),
      });
      ok++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}
