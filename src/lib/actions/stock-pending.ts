import { getRedisConnection } from "@/lib/redis";

/**
 * O pedido de estoque que ficou esperando resposta (Módulo 31, §9 e §10).
 *
 * NASCEU DE UM ACHADO DE REVISOR, não de um teste. A primeira versão do handler
 * de estoque não guardava nada e afirmava, em comentário, que a confirmação
 * viajava em `auxiliary_data`. Era falso: `auxiliary_data` é só SAÍDA, o
 * contrato de `POST /api/internal/whatsapp/execute-action` não tem por onde
 * receber de volta, e o guia do n8n manda o LLM remontar os parâmetros pelo
 * histórico. Ou seja, o "sim" executava o que o classificador reconstruiu, não
 * o que o produtor leu. Um revisor reproduziu ao vivo: confirmação mostrando 10
 * sacas, gravação de 100, e o frete sumindo.
 *
 * É o terceiro domínio a precisar disto (rebanho, negócio de gado, estoque), e
 * o comentário de `negotiation-pending.ts` previa exatamente este momento: dois
 * casos são coincidência, três são padrão. Os dois antigos seguem como estão
 * porque já foram validados em produção; o que este arquivo acrescenta é a
 * regra que faltava aos três.
 *
 * **A REGRA NOVA: no máximo UM pendente por pessoa.** Uma pessoa tem uma
 * conversa. Com três chaves independentes no Redis, um pendente de gado de 15
 * minutos atrás sobrevivia a uma compra de sal e o "sim" seguinte executava o
 * gado: o produtor confirmava R$ 600 de sal e levava 20 bezerros e R$ 60.000 de
 * conta a pagar. Guardar um pendente aqui APAGA os outros dois, porque assunto
 * novo encerra o anterior.
 */

const TTL_SEGUNDOS = 15 * 60;

/** O campo que o assistente perguntou e está esperando. */
export type CampoEstoque =
  | "tipo"
  | "produto"
  | "quantidade"
  | "valor"
  | "fazenda"
  /** Não é campo: é o pedido inteiro esperando um "sim". */
  | "confirmacao";

export type PedidoEstoquePendente = {
  /** Qual das quatro conversas está aberta. */
  intent:
    | "registrar_negocio_produto"
    | "registrar_uso_estoque"
    | "ajustar_estoque";
  parameters: Record<string, unknown>;
  aguardando: CampoEstoque;
  /** Quantas vezes o MESMO campo já foi perguntado: trava de laço. */
  tentativas?: number;
};

export const MAX_TENTATIVAS = 3;

function chave(tenantId: string, userId: string): string {
  return `tibe:estoque-pending:${tenantId}:${userId}`;
}

/** As outras duas conversas, que precisam morrer quando esta começa. */
const CHAVES_DE_OUTROS_DOMINIOS = [
  (t: string, u: string) => `tibe:negocio-pending:${t}:${u}`,
  (t: string, u: string) => `tibe:herd-pending:${t}:${u}`,
];

export async function savePendingStock(
  tenantId: string,
  userId: string,
  pedido: PedidoEstoquePendente,
): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(chave(tenantId, userId), JSON.stringify(pedido), "EX", TTL_SEGUNDOS);
    // Assunto novo encerra o anterior: ver o comentário do topo.
    await Promise.all(
      CHAVES_DE_OUTROS_DOMINIOS.map((montar) => redis.del(montar(tenantId, userId))),
    );
  } catch {
    // Redis fora do ar não pode derrubar o registro: sem o pendente o
    // assistente volta a depender do histórico, que é o comportamento antigo.
  }
}

export async function loadPendingStock(
  tenantId: string,
  userId: string,
): Promise<PedidoEstoquePendente | null> {
  try {
    const redis = getRedisConnection();
    const bruto = await redis.get(chave(tenantId, userId));
    if (!bruto) return null;
    const pedido = JSON.parse(bruto) as PedidoEstoquePendente;
    if (!pedido || typeof pedido !== "object" || !pedido.parameters) return null;
    return pedido;
  } catch {
    return null;
  }
}

export async function clearPendingStock(tenantId: string, userId: string): Promise<void> {
  try {
    await getRedisConnection().del(chave(tenantId, userId));
  } catch {
    // idem
  }
}

/**
 * Junta a resposta nova ao pedido guardado.
 *
 * O GUARDADO MANDA. Da mensagem seguinte entra **só o campo que foi
 * perguntado**, nunca o pacote inteiro que o classificador remontou: é a lição
 * do Módulo 30, em que uma resposta curta trocava o tipo da movimentação porque
 * o LLM reconstruía tudo a cada turno.
 *
 * Devolve `null` quando a mensagem não traz o campo esperado, e aí o chamador
 * decide entre repetir a pergunta e desistir (`MAX_TENTATIVAS`).
 */
export function aplicarRespostaEstoque(
  pedido: PedidoEstoquePendente,
  novos: Record<string, unknown>,
): Record<string, unknown> | null {
  const juntos = { ...pedido.parameters };

  const atalho = (campo: string, ...apelidos: string[]): boolean => {
    for (const chaveCandidata of [campo, ...apelidos]) {
      const valor = novos[chaveCandidata];
      if (valor !== undefined && valor !== null && valor !== "") {
        juntos[campo] = valor;
        return true;
      }
    }
    return false;
  };

  switch (pedido.aguardando) {
    case "produto":
      return atalho("produto", "product", "item", "nome") ? juntos : null;
    case "quantidade":
      // `saldo` entra aqui porque, num ajuste, a quantidade PERGUNTADA é o
      // saldo contado, e o classificador usa os dois nomes.
      return atalho("quantidade", "quantity", "qtd", "saldo") ? juntos : null;
    case "valor":
      return atalho("valor", "amount", "valor_total") ? juntos : null;
    case "tipo":
      return atalho("tipo", "type") ? juntos : null;
    case "fazenda":
      return atalho("fazenda", "property", "property_name") ? juntos : null;
    case "confirmacao":
      // Nada da mensagem nova entra: o "sim" confirma o que foi MOSTRADO.
      return juntos;
  }
}
