import { scoped, type TenantPrismaClient } from "@/lib/prisma";

/**
 * Cadastro assistido pelo WhatsApp (2026-07-30, abertura consolidada desde
 * 2026-08-01).
 *
 * Antes disso, `cadastrar_animal` pedia TODOS os campos de uma vez ("preciso do
 * brinco, raça e sexo, envie novamente com esses dados"): quem não decorou os
 * campos ficava sem saída. Depois, passou a perguntar um campo por mensagem
 * (até 4 idas e vindas por animal, contando a confirmação).
 *
 * A partir de outubro de 2026 a Meta cobra por mensagem de serviço dentro da
 * janela de 24h, então a pergunta de ABERTURA de cada item volta a pedir os 3
 * campos de uma vez (`FlowDef.openingQuestion`), sem reintroduzir o problema
 * original: quem responde só uma parte cai de volta no fluxo campo a campo
 * (`pending_field`), que continua existindo pra esse caso. O ganho é só no
 * caminho feliz (quem já manda tudo de uma vez).
 *
 * O motor é dirigido por DADOS (`FLOWS` abaixo): acrescentar cadastro de vacina
 * ou de ordem de serviço depois é adicionar uma entrada, não escrever fluxo
 * novo. Por decisão do usuário, só `cadastrar_animal` está ligado por enquanto.
 *
 * Regra central: **nada é gravado antes da confirmação do resumo**. Os itens
 * ficam em `completed_items` e só viram registro real no fim. O risco de perder
 * trabalho no meio é coberto pelo lembrete de abandono (30 min, uma vez, em
 * horário comercial), não por gravação parcial: gravar animal pela metade
 * deixaria lixo no rebanho que alguém teria que limpar na mão.
 */

export const MAX_ITEMS = 20;
const FLOW_TTL_HOURS = 24;
export const REMINDER_AFTER_MINUTES = 30;
const BUSINESS_HOUR_START = 8;
const BUSINESS_HOUR_END = 18;

export type FlowField = {
  name: string;
  question: string;
  /** Normaliza a resposta crua; devolve null quando não serve. */
  parse: (raw: string) => string | null;
  invalid: string;
};

export type FlowDef = {
  label: string;
  fields: FlowField[];
  /**
   * Pergunta de abertura de cada item, pedindo todos os campos de uma vez
   * (economia de mensagem: ver comentário do topo do arquivo). Usada tanto no
   * primeiro item quanto na abertura dos itens seguintes num cadastro
   * multi-animal; resposta parcial cai no fluxo campo a campo de sempre
   * (`fields[n].question`), que não muda.
   */
  openingQuestion: string;
  /** Uma linha curta de confirmação ao fechar cada item. */
  summarizeItem: (item: Record<string, string>) => string;
};

const SEX_MAP: Record<string, string> = {
  macho: "male", m: "male", boi: "male", touro: "male", male: "male",
  femea: "female", "fêmea": "female", f: "female", vaca: "female", female: "female",
};

/**
 * Normaliza a fala do usuário. Tira pontuação de propósito: o Whisper devolve
 * "Macho." com ponto final, e a comparação exata rejeitava a resposta correta
 * (bug real reportado em 2026-07-30, com o usuário mandando áudio duas vezes).
 */
function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/^[.,;:!?]+/g, "")
    .trim();
}

/** Separadores que a pessoa usa ao mandar vários campos numa tacada só. */
export function splitValues(raw: string): string[] {
  return raw
    .split(/[,;\r\n]+|\s+e\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export const FLOWS: Record<string, FlowDef> = {
  cadastrar_animal: {
    label: "cadastro de animal",
    fields: [
      {
        name: "ear_tag",
        question: "Qual o número do brinco?",
        parse: (raw) => {
          const v = norm(raw);
          // Sem vírgula e sem espaço: "082, nelori, macho" ficava gravado
          // inteiro como brinco (bug real de 2026-07-30). Frase não é brinco.
          if (v.length === 0 || v.length > 30) return null;
          if (/[,;]/.test(v) || v.split(/\s+/).length > 2) return null;
          return raw.trim().replace(/[.,;:]+$/g, "");
        },
        invalid: "Não entendi o brinco. Pode mandar só o número ou código dele?",
      },
      {
        name: "breed",
        question: "Qual a raça?",
        parse: (raw) => {
          const v = raw.trim().replace(/[.,;:!?]+$/g, "");
          return v.length > 1 && v.length <= 40 ? v : null;
        },
        invalid: "Não entendi a raça. Pode escrever o nome dela? (ex: Nelore)",
      },
      {
        name: "sex",
        question: "É macho ou fêmea?",
        parse: (raw) => {
          const n = norm(raw);
          if (SEX_MAP[n]) return SEX_MAP[n];
          // Áudio raramente vem com a palavra sozinha ("é macho", "macho mesmo").
          if (/\b(macho|boi|touro)\b/.test(n)) return "male";
          if (/\b(femea|vaca|novilha)\b/.test(n)) return "female";
          return null;
        },
        invalid: "Não entendi. Responda macho ou fêmea.",
      },
    ],
    openingQuestion: "Me diga o brinco, a raça e o sexo, um por linha ou separados por vírgula.",
    summarizeItem: (i) =>
      `Brinco ${i.ear_tag}, ${i.breed}, ${i.sex === "male" ? "macho" : "fêmea"}.`,
  },
};

export type FlowState = {
  id: string;
  flow: string;
  target_count: number;
  completed_items: Record<string, string>[];
  current_item: Record<string, string>;
  pending_field: string | null;
  awaiting_summary: boolean;
};

function asState(row: {
  id: string; flow: string; target_count: number;
  completed_items: unknown; current_item: unknown;
  pending_field: string | null; awaiting_summary: boolean;
}): FlowState {
  return {
    id: row.id,
    flow: row.flow,
    target_count: row.target_count,
    completed_items: Array.isArray(row.completed_items)
      ? (row.completed_items as Record<string, string>[])
      : [],
    current_item: (row.current_item as Record<string, string>) ?? {},
    pending_field: row.pending_field,
    awaiting_summary: row.awaiting_summary,
  };
}

export async function getActiveFlow(
  db: TenantPrismaClient,
  userId: string,
): Promise<FlowState | null> {
  const row = await db.agentFlowState.findFirst({
    where: { user_id: userId, expires_at: { gt: new Date() } },
  });
  return row ? asState(row) : null;
}

export async function cancelFlow(
  db: TenantPrismaClient,
  userId: string,
): Promise<{ discarded: number } | null> {
  const state = await getActiveFlow(db, userId);
  if (!state) return null;
  const discarded = state.completed_items.length + (Object.keys(state.current_item).length > 0 ? 1 : 0);
  await db.agentFlowState.deleteMany({ where: { user_id: userId } });
  return { discarded };
}

function expiry(): Date {
  return new Date(Date.now() + FLOW_TTL_HOURS * 3600_000);
}

/** Abre (ou reabre) um cadastro assistido e devolve a primeira pergunta. */
export async function startFlow(
  db: TenantPrismaClient,
  userId: string,
  flow: string,
  targetCount: number,
): Promise<{ reply: string }> {
  const def = FLOWS[flow];
  if (!def) return { reply: "Esse cadastro ainda não tem modo assistido." };

  const count = Math.min(Math.max(Math.trunc(targetCount) || 1, 1), MAX_ITEMS);
  const capped = targetCount > MAX_ITEMS;

  await db.agentFlowState.deleteMany({ where: { user_id: userId } });
  await db.agentFlowState.create({
    data: scoped({
      user_id: userId,
      flow,
      target_count: count,
      completed_items: [],
      current_item: {},
      pending_field: def.fields[0].name,
      awaiting_summary: false,
      expires_at: expiry(),
    }),
  });

  const aviso = capped
    ? `Consigo cadastrar até ${MAX_ITEMS} de uma vez por aqui; acima disso o painel resolve melhor. Vou seguir com ${count}. `
    : "";
  const quantos = count > 1 ? `Vamos cadastrar ${count} animais, um de cada vez. ` : "";
  return { reply: `${aviso}${quantos}${def.openingQuestion}` };
}

export type AnswerResult =
  | { kind: "question"; reply: string }
  | { kind: "summary"; reply: string; items: Record<string, string>[] }
  | { kind: "none" };

/**
 * Aplica a resposta do usuário ao campo pendente e devolve a próxima pergunta,
 * ou o resumo quando todos os itens ficaram prontos.
 */
export async function applyAnswer(
  db: TenantPrismaClient,
  userId: string,
  raw: string,
): Promise<AnswerResult> {
  const state = await getActiveFlow(db, userId);
  if (!state || !state.pending_field) return { kind: "none" };

  const def = FLOWS[state.flow];
  if (!def) return { kind: "none" };

  const field = def.fields.find((f) => f.name === state.pending_field);
  if (!field) return { kind: "none" };

  // Vários campos numa mensagem só ("082, nelori, macho"): bug real de
  // 2026-07-30, em que a frase inteira virava o brinco. Se a pessoa mandou
  // partes separadas e cada uma serve para os campos seguintes, aproveitamos
  // todas; se qualquer parte não servir, caímos no comportamento de um campo
  // por vez, que é o previsível.
  const idxPend = def.fields.findIndex((f) => f.name === field.name);
  const restantes = def.fields.slice(idxPend);
  const partes = splitValues(raw);
  if (partes.length > 1 && restantes.length > 1) {
    const usar = Math.min(partes.length, restantes.length);
    const coletado: Record<string, string> = {};
    let todasValidas = true;
    for (let i = 0; i < usar; i++) {
      const v = restantes[i].parse(partes[i]);
      if (v === null) { todasValidas = false; break; }
      coletado[restantes[i].name] = v;
    }
    if (todasValidas && Object.keys(coletado).length > 1) {
      return applyManyValues(db, userId, state, def, coletado, idxPend + usar);
    }
  }

  const value = field.parse(raw);
  if (value === null) {
    // Repete a MESMA pergunta: avançar com valor inválido produziria um
    // cadastro errado que só apareceria no resumo.
    return { kind: "question", reply: field.invalid };
  }

  const item = { ...state.current_item, [field.name]: value };
  const idx = def.fields.findIndex((f) => f.name === field.name);
  const next = def.fields[idx + 1];

  if (next) {
    await db.agentFlowState.updateMany({
      where: { user_id: userId },
      data: { current_item: item, pending_field: next.name, expires_at: expiry() },
    });
    return { kind: "question", reply: next.question };
  }

  // Item completo: confirma numa linha (erro no brinco do 1o nao pode so
  // aparecer no resumo do 5o) e comeca o proximo, ou fecha com o resumo.
  const completed = [...state.completed_items, item];
  const faltam = state.target_count - completed.length;

  if (faltam > 0) {
    await db.agentFlowState.updateMany({
      where: { user_id: userId },
      data: {
        completed_items: completed,
        current_item: {},
        pending_field: def.fields[0].name,
        expires_at: expiry(),
      },
    });
    return {
      kind: "question",
      reply: `${def.summarizeItem(item)} Faltam ${faltam}. ${def.openingQuestion}`,
    };
  }

  await db.agentFlowState.updateMany({
    where: { user_id: userId },
    data: {
      completed_items: completed,
      current_item: {},
      pending_field: null,
      awaiting_summary: true,
      expires_at: expiry(),
    },
  });

  const linhas = completed.map((i, n) => `${n + 1}. ${def.summarizeItem(i)}`).join("\n");
  return {
    kind: "summary",
    reply: `Confere antes de eu salvar:\n${linhas}\n\nPosso cadastrar? Responda sim para confirmar.`,
    items: completed,
  };
}

/** Chamado depois de gravar de verdade: encerra o fluxo. */
export async function finishFlow(db: TenantPrismaClient, userId: string): Promise<void> {
  await db.agentFlowState.deleteMany({ where: { user_id: userId } });
}

/** Texto que o agente repete ao voltar de uma interrupção. */
export function resumeHint(state: FlowState): string | null {
  const def = FLOWS[state.flow];
  if (!def) return null;
  if (state.awaiting_summary) return "Voltando: posso cadastrar os animais do resumo?";
  // pending_field só volta a ser o 1o campo quando o item atual está vazio
  // (abertura, seja do 1o animal ou de um seguinte): repete a pergunta
  // consolidada, não só a do brinco, senão o lembrete contradiz o que foi
  // perguntado de fato.
  if (state.pending_field === def.fields[0].name) {
    return `Voltando ao ${def.label}: ${def.openingQuestion}`;
  }
  const field = def.fields.find((f) => f.name === state.pending_field);
  return field ? `Voltando ao ${def.label}: ${field.question}` : null;
}

/** Só entre 8h e 18h: lembrete às 3 da manhã seria hostil. */
export function isBusinessHour(now = new Date()): boolean {
  const h = now.getHours();
  return h >= BUSINESS_HOUR_START && h < BUSINESS_HOUR_END;
}

export function shouldRemind(row: { updated_at: Date; reminded_at: Date | null }, now = new Date()): boolean {
  if (row.reminded_at) return false; // um lembrete por cadastro, nunca uma sequência
  if (!isBusinessHour(now)) return false;
  return now.getTime() - row.updated_at.getTime() >= REMINDER_AFTER_MINUTES * 60_000;
}

export async function purgeExpiredFlows(db: TenantPrismaClient): Promise<{ deleted: number }> {
  const r = await db.agentFlowState.deleteMany({ where: { expires_at: { lte: new Date() } } });
  return { deleted: r.count };
}

/**
 * Cadastros parados que merecem um empurrão (chamado pelo agendador do n8n a
 * cada 15 min). Devolve o texto pronto e marca `reminded_at` na mesma passada,
 * para que duas execuções sobrepostas não mandem o lembrete duas vezes.
 */
export async function collectPendingReminders(
  db: TenantPrismaClient,
  now = new Date(),
): Promise<{ user_id: string; phone: string; message: string }[]> {
  const rows = await db.agentFlowState.findMany({
    where: { reminded_at: null, expires_at: { gt: now } },
  });

  const out: { user_id: string; phone: string; message: string }[] = [];
  for (const row of rows) {
    if (!shouldRemind({ updated_at: row.updated_at, reminded_at: row.reminded_at }, now)) continue;

    const user = await db.user.findFirst({ where: { id: row.user_id, active: true } });
    if (!user?.phone) continue;

    const state = asState(row);
    const hint = resumeHint(state);
    if (!hint) continue;

    // Marca ANTES de devolver: se o envio falhar, perdemos um lembrete, o que é
    // melhor que mandar o mesmo empurrão várias vezes por causa de retry.
    const marked = await db.agentFlowState.updateMany({
      where: { id: row.id, reminded_at: null },
      data: { reminded_at: now },
    });
    if (marked.count === 0) continue; // outra execução pegou primeiro

    const feitos = state.completed_items.length;
    const progresso = feitos > 0 ? ` Você já tinha ${feitos} animal(is) prontos.` : "";
    out.push({
      user_id: row.user_id,
      phone: user.phone,
      message: `Oi! Vi que seu cadastro ficou pela metade.${progresso} ${hint} Se preferir, responda "cancelar".`,
    });
  }
  return out;
}

/**
 * Aplica de uma vez os campos que vieram juntos numa mensagem e continua o
 * fluxo do ponto certo (próxima pergunta, próximo animal ou resumo).
 */
async function applyManyValues(
  db: TenantPrismaClient,
  userId: string,
  state: FlowState,
  def: FlowDef,
  coletado: Record<string, string>,
  proximoIdx: number,
): Promise<AnswerResult> {
  const item = { ...state.current_item, ...coletado };
  const next = def.fields[proximoIdx];

  if (next) {
    await db.agentFlowState.updateMany({
      where: { user_id: userId },
      data: { current_item: item, pending_field: next.name, expires_at: expiry() },
    });
    return { kind: "question", reply: next.question };
  }

  const completed = [...state.completed_items, item];
  const faltam = state.target_count - completed.length;

  if (faltam > 0) {
    await db.agentFlowState.updateMany({
      where: { user_id: userId },
      data: {
        completed_items: completed,
        current_item: {},
        pending_field: def.fields[0].name,
        expires_at: expiry(),
      },
    });
    return {
      kind: "question",
      reply: `${def.summarizeItem(item)} Faltam ${faltam}. ${def.openingQuestion}`,
    };
  }

  await db.agentFlowState.updateMany({
    where: { user_id: userId },
    data: {
      completed_items: completed,
      current_item: {},
      pending_field: null,
      awaiting_summary: true,
      expires_at: expiry(),
    },
  });
  const linhas = completed.map((i, n) => `${n + 1}. ${def.summarizeItem(i)}`).join("\n");
  return {
    kind: "summary",
    reply: `Confere antes de eu salvar:
${linhas}

Posso cadastrar? Responda sim para confirmar.`,
    items: completed,
  };
}
