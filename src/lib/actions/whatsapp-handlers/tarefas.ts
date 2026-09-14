import { createTaskAction } from "@/lib/actions/tasks";
import { str, confirmFlow, failReply, ask, type Handler } from "./shared";
import { lerData } from "./parsers";

/**
 * Módulo 27 (Meu Dia): "me lembra de comprar sal na quinta". A interpretação
 * de data relativa ("quinta", "amanhã") é feita pelo prompt do classificador
 * no N8N (estado vivo, não neste repositório: ver
 * docs/n8n-whatsapp-workflow.md), que devolve `due_date` já como data ISO.
 * Esta rodada só CRIA tarefa: concluir/cancelar fica no painel (spec §2.6).
 *
 * Módulo 38: a data deixou de ser obrigatória (§19). "Anota consertar a
 * porteira" é tarefa legítima e nasce sem dia, em vez de o assistente
 * perguntar "de quando?" a quem não tem quando. Aceita também horário,
 * urgência e responsável, quando o classificador os mandar.
 */

const HORARIO = /^([01]?\d|2[0-3])(?::?([0-5]\d))?h?$/i;

/** "14h", "14:00", "14" viram "14:00". Qualquer outra coisa não vira nada. */
function lerHorario(bruto: unknown): string | null {
  const texto = str(bruto)?.replace(/\s/g, "");
  if (!texto) return null;
  const casa = texto.match(HORARIO);
  if (!casa) return null;
  return `${casa[1].padStart(2, "0")}:${casa[2] ?? "00"}`;
}

function lerUrgente(parameters: Record<string, unknown>): boolean {
  const prioridade = str(parameters.priority) ?? str(parameters.prioridade);
  return parameters.urgente === true || prioridade === "urgente";
}

export const criarTarefa: Handler = async ({ db, parameters, confirmed, explicitNo }) => {
  const title = str(parameters.title);
  const dataLida = lerData(parameters, "due_date", "data", "date");

  if (!title) {
    return ask("O que você quer anotar? (ex: 'comprar sal na quinta')");
  }

  // `lerData`, e não `new Date` cru. O comentário acima diz que o
  // classificador devolve a data já em ISO, e isso é verdade quando ele
  // colabora; nas voltas em que ele repassa a fala ("dia 10", "10/12/2026"),
  // `new Date` devolvia Invalid Date e o lembrete morria numa pergunta que o
  // produtor já tinha respondido. Os outros handlers já liam essas formas.
  if (dataLida.tipo === "invalida") {
    return ask("Não entendi a data. Pode dizer de novo, com o dia?");
  }
  const dueDate = dataLida.tipo === "vazio" ? null : dataLida.data;
  /* Horário sem dia não diz quando: some em silêncio não, mas também não
     trava a anotação. Sem data, o horário é simplesmente ignorado. */
  const dueTime = dueDate ? lerHorario(parameters.due_time ?? parameters.horario ?? parameters.hora) : null;
  const urgente = lerUrgente(parameters);
  const responsavel = str(parameters.assignee) ?? str(parameters.responsavel);

  const quando = dueDate
    ? `dia ${dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}${dueTime ? ` às ${dueTime}` : ""}`
    : "sem data";
  const detalhes = [quando, urgente ? "urgente" : null, responsavel ? `com ${responsavel}` : null]
    .filter(Boolean)
    .join(", ");

  const gate = confirmFlow({
    intent: "criar_tarefa",
    explicitNo,
    confirmed,
    cancelledText: "Lembrete cancelado.",
    question: `Confirma: ${title}, ${detalhes}?`,
    // A data normalizada, e não o texto cru: o pendente é reenviado na
    // confirmação, e devolver "dia 10" ali obrigaria a interpretar de novo.
    auxiliary: {
      title,
      due_date: dueDate?.toISOString() ?? null,
      due_time: dueTime,
      priority: urgente ? "urgente" : "normal",
      assignee: responsavel,
    },
  });
  if (gate) return gate;

  const result = await createTaskAction(db, {
    title,
    due_date: dueDate,
    due_time: dueTime,
    priority: urgente ? "urgente" : "normal",
    assignee: responsavel,
  });
  if (!result.ok) return failReply("criar_tarefa", result);

  return {
    reply_text: dueDate
      ? `Combinado! Vou te lembrar: ${title}, ${detalhes}.`
      : `Anotado: ${title}. Fica na sua lista até você concluir.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: "criar_tarefa",
  };
};
