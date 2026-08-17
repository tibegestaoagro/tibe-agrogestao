import { getRedisConnection } from "@/lib/redis";

/**
 * O pedido de rebanho que ficou esperando uma resposta (Módulo 30, §14).
 *
 * POR QUE ISTO EXISTE. Quando o assistente pergunta a faixa de idade, o sexo
 * ou a fazenda, a resposta do produtor é curta ("13 a 24 meses"). Até
 * 2026-08-06 o pedido original não era guardado em lugar nenhum: contávamos
 * com o classificador do n8n para remontá-lo a partir do `recent_history`.
 * Isso falhou em três testes reais seguidos, sempre do mesmo jeito, e o pior
 * caso foi trocar o TIPO da movimentação (um "tenho 20 novilhas", que é saldo
 * inicial, voltou como nascimento, herdado de uma conversa de uma hora antes).
 *
 * Agora o pedido fica guardado e é ele que manda. Da mensagem seguinte
 * aproveitamos SÓ o campo que estava faltando; todo o resto (tipo,
 * quantidade, fazenda, pasto) vem daqui. O classificador deixa de poder
 * trocar o que já estava decidido.
 *
 * POR QUE NO REDIS, e não em tabela. É estado de conversa, efêmero e sem
 * valor de negócio: perder só faz o produtor repetir a frase. O Redis dá TTL
 * de graça, não exige migração, e principalmente NÃO colide com
 * `AgentFlowState`, que é `@@unique([tenant_id, user_id])` e cujo
 * `getActiveFlow` não filtra por tipo de fluxo: gravar o pendente de rebanho
 * lá dentro mataria em silêncio um cadastro assistido em andamento.
 */

/** Curto de propósito: conversa de WhatsApp que esfria não deve ressuscitar. */
const TTL_SEGUNDOS = 15 * 60;

/**
 * O campo que o assistente perguntou e está esperando.
 *
 * `movement_type` entra na lista porque o classificador erra o TIPO com
 * frequência (herda "nascimento" de uma conversa anterior). Quando o tipo
 * conflita com a categoria de forma impossível, perguntar o tipo é melhor do
 * que recusar: a informação que falta é uma só.
 */
export type CampoPendente =
  | "movement_type"
  | "categoria"
  | "categoria_destino"
  | "fazenda"
  | "pasto"
  /**
   * Não é um campo: é o pedido inteiro esperando um "sim". Guardado pelo mesmo
   * mecanismo porque o problema é o mesmo. Em 2026-08-10 um "sim" gravou 18
   * animais que o produtor nunca pediu: ele mandou VENDER 100, o assistente
   * respondeu "você tem 18", e o classificador montou um pedido novo com o 18
   * que leu na própria resposta. Com o pedido guardado, o "sim" executa o que
   * foi MOSTRADO, e um "sim" sem nada guardado não escreve nada.
   */
  | "confirmacao";

export type PedidoPendente = {
  parameters: Record<string, unknown>;
  aguardando: CampoPendente;
  /**
   * Quantas vezes o MESMO campo já foi perguntado. Se o classificador insiste
   * no mesmo valor errado, perguntar de novo vira laço e o produtor fica preso
   * respondendo a mesma coisa. A partir do limite, o assistente para de
   * perguntar e diz o que escrever.
   */
  tentativas?: number;
  /**
   * Quando este pedido foi guardado.
   *
   * É o desempate entre os três domínios de conversa (rebanho, negócio de gado,
   * estoque): quando há mais de um aberto, quem responde é o mais recente, e o
   * mais antigo continua vivo até o TTL. Ausente, num pedido gravado por uma
   * versão anterior, conta como o mais antigo de todos.
   */
  salvo_em?: number;
};

/** Depois disto, perguntar de novo só repete o problema. */
export const MAX_TENTATIVAS = 3;

function chave(tenantId: string, userId: string): string {
  return `tibe:herd-pending:${tenantId}:${userId}`;
}

export async function savePendingHerd(
  tenantId: string,
  userId: string,
  pedido: PedidoPendente,
): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(
      chave(tenantId, userId),
      JSON.stringify({ ...pedido, salvo_em: pedido.salvo_em ?? Date.now() }),
      "EX",
      TTL_SEGUNDOS,
    );
  } catch {
    // Redis fora do ar não pode derrubar o registro: sem o pendente o
    // assistente volta a depender do histórico, que é o comportamento antigo.
  }
}

export async function loadPendingHerd(
  tenantId: string,
  userId: string,
): Promise<PedidoPendente | null> {
  try {
    const redis = getRedisConnection();
    const bruto = await redis.get(chave(tenantId, userId));
    if (!bruto) return null;
    const pedido = JSON.parse(bruto) as PedidoPendente;
    if (!pedido || typeof pedido !== "object" || !pedido.parameters) return null;
    return pedido;
  } catch {
    return null;
  }
}

export async function clearPendingHerd(tenantId: string, userId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.del(chave(tenantId, userId));
  } catch {
    // idem
  }
}

/**
 * Junta a resposta ao pedido guardado.
 *
 * A regra é estreita de propósito: da mensagem nova entra APENAS o campo que
 * estava sendo perguntado. Deixar o resto entrar é exatamente o que permitia
 * o tipo da movimentação ser trocado no meio do caminho.
 *
 * Se a mensagem nova não traz nada para o campo perguntado, ela não é uma
 * resposta: é assunto novo, e o pendente deve ser descartado pelo chamador.
 */
export function aplicarResposta(
  pendente: PedidoPendente,
  novos: Record<string, unknown>,
): Record<string, unknown> | null {
  const valor = novos[pendente.aguardando] ?? novos[atalho(pendente.aguardando)];
  if (typeof valor !== "string" || valor.trim() === "") return null;

  return { ...pendente.parameters, [pendente.aguardando]: valor };
}

/**
 * Nome alternativo que o classificador às vezes usa para o mesmo campo.
 *
 * `categoria_destino` aceita `categoria` porque, para o modelo, a resposta a
 * "São machos ou fêmeas?" é só "uma categoria": ele não carrega de volta que a
 * pergunta era sobre o DESTINO. Sem isso, a resposta não casava, o pedido
 * guardado era descartado e a reconstrução do LLM punha a mesma categoria nas
 * duas pontas, gerando "transferir de Fêmea 25-36 para Fêmea 25-36".
 */
function atalho(campo: CampoPendente): string {
  if (campo === "categoria") return "category";
  if (campo === "categoria_destino") return "categoria";
  if (campo === "fazenda") return "property";
  if (campo === "pasto") return "pasto_origem";
  if (campo === "movement_type") return "tipo";
  return campo;
}
