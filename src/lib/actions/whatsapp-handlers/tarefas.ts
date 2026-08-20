import { createTaskAction } from "@/lib/actions/tasks";
import { str, confirmFlow, failReply, ask, type Handler } from "./shared";
import { lerData } from "./parsers";

/**
 * Módulo 27 (Meu Dia): "me lembra de comprar sal na quinta". A interpretação
 * de data relativa ("quinta", "amanhã") é feita pelo prompt do classificador
 * no N8N (estado vivo, não neste repositório: ver
 * docs/n8n-whatsapp-workflow.md), que devolve `due_date` já como data ISO.
 * Esta rodada só CRIA tarefa: concluir/cancelar fica no painel (spec §2.6).
 */
export const criarTarefa: Handler = async ({ db, parameters, confirmed, explicitNo }) => {
  const title = str(parameters.title);
  const dataLida = lerData(parameters, "due_date", "data", "date");

  if (!title || dataLida.tipo === "vazio") {
    return ask("Para criar o lembrete, preciso do que é e de quando (ex: 'comprar sal na quinta').");
  }

  // `lerData`, e não `new Date` cru. O comentário acima diz que o
  // classificador devolve a data já em ISO, e isso é verdade quando ele
  // colabora; nas voltas em que ele repassa a fala ("dia 10", "10/12/2026"),
  // `new Date` devolvia Invalid Date e o lembrete morria numa pergunta que o
  // produtor já tinha respondido. Os outros handlers já liam essas formas.
  if (dataLida.tipo === "invalida") {
    return ask("Não entendi a data. Pode dizer de novo, com o dia?");
  }
  const dueDate = dataLida.data;

  const gate = confirmFlow({
    intent: "criar_tarefa",
    explicitNo,
    confirmed,
    cancelledText: "Lembrete cancelado.",
    question: `Confirma: ${title}, dia ${dueDate.toLocaleDateString("pt-BR")}?`,
    // A data normalizada, e não o texto cru: o pendente é reenviado na
    // confirmação, e devolver "dia 10" ali obrigaria a interpretar de novo.
    auxiliary: { title, due_date: dueDate.toISOString() },
  });
  if (gate) return gate;

  const result = await createTaskAction(db, { title, due_date: dueDate });
  if (!result.ok) return failReply("criar_tarefa", result);

  return {
    reply_text: `Combinado! Vou te lembrar: ${title}, dia ${dueDate.toLocaleDateString("pt-BR")}.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: "criar_tarefa",
  };
};
