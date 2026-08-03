import { createTaskAction } from "@/lib/actions/tasks";
import { str, confirmFlow, failReply, ask, type Handler } from "./shared";

/**
 * Módulo 27 (Meu Dia): "me lembra de comprar sal na quinta". A interpretação
 * de data relativa ("quinta", "amanhã") é feita pelo prompt do classificador
 * no N8N (estado vivo, não neste repositório: ver
 * docs/n8n-whatsapp-workflow.md), que devolve `due_date` já como data ISO.
 * Esta rodada só CRIA tarefa: concluir/cancelar fica no painel (spec §2.6).
 */
export const criarTarefa: Handler = async ({ db, parameters, confirmed, explicitNo }) => {
  const title = str(parameters.title);
  const dueDateRaw = str(parameters.due_date);

  if (!title || !dueDateRaw) {
    return ask("Para criar o lembrete, preciso do que é e de quando (ex: 'comprar sal na quinta').");
  }

  const dueDate = new Date(dueDateRaw);
  if (Number.isNaN(dueDate.getTime())) {
    return ask("Não entendi a data. Pode dizer de novo, com o dia?");
  }

  const gate = confirmFlow({
    intent: "criar_tarefa",
    explicitNo,
    confirmed,
    cancelledText: "Lembrete cancelado.",
    question: `Confirma: ${title}, dia ${dueDate.toLocaleDateString("pt-BR")}?`,
    auxiliary: { title, due_date: dueDateRaw },
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
