import { getRedisConnection } from "@/lib/redis";

/**
 * O pedido que ficou esperando uma resposta, no Redis. Um mecanismo, sete
 * domínios.
 *
 * POR QUE ISTO EXISTE. Quando o assistente pergunta a faixa de idade, o sexo ou
 * a fazenda, a resposta do produtor é curta ("13 a 24 meses"). Até 2026-08-06 o
 * pedido original não era guardado em lugar nenhum: contávamos com o
 * classificador do n8n para remontá-lo a partir do `recent_history`. Isso falhou
 * em três testes reais seguidos, sempre do mesmo jeito, e o pior caso foi trocar
 * o TIPO da movimentação (um "tenho 20 novilhas", que é saldo inicial, voltou
 * como nascimento, herdado de uma conversa de uma hora antes).
 *
 * Agora o pedido fica guardado e é ele que manda. Da mensagem seguinte
 * aproveitamos SÓ o campo que estava faltando; todo o resto vem daqui. O
 * classificador deixa de poder trocar o que já estava decidido.
 *
 * POR QUE NO REDIS, e não em tabela. É estado de conversa, efêmero e sem valor
 * de negócio: perder só faz o produtor repetir a frase. O Redis dá TTL de graça,
 * não exige migração, e principalmente NÃO colide com `AgentFlowState`, que é
 * `@@unique([tenant_id, user_id])` e cujo `getActiveFlow` não filtra por tipo de
 * fluxo: gravar o pendente de rebanho lá dentro mataria em silêncio um cadastro
 * assistido em andamento.
 *
 * POR QUE UM ARQUIVO SÓ, desde 02/09. O mecanismo estava copiado em sete
 * arquivos (`herd`, `negotiation`, `stock`, `event`, `barter`, `leite`,
 * `confinamento`): cerca de 90 linhas iguais cada um, com o prefixo de chave
 * trocado. O comentário de `negotiation-pending.ts` previa extrair "quando o
 * terceiro domínio precisar disto", e chegamos ao sétimo quando o Confinamento
 * copiou `event-pending.ts` linha a linha. Estava na `docs/agents/dividas.md`
 * §3.2. Cada domínio continua sendo o dono do SEU vocabulário (os campos, os
 * atalhos, o que é uma resposta válida); o que mora aqui é só o Redis.
 *
 * O que este arquivo NÃO absorve: `aplicarRespostaEstoque`, que tem apelido
 * múltiplo por campo e regras de contradição próprias, e a coordenação entre
 * domínios de `stock-pending.ts`. Generalizá-las seria inventar abstração para
 * um caso só.
 */

/** Curto de propósito: conversa de WhatsApp que esfria não deve ressuscitar. */
const TTL_PADRAO_SEGUNDOS = 15 * 60;

/** Depois disto, perguntar de novo só repete o problema. */
export const MAX_TENTATIVAS = 3;

export type PedidoBase<C extends string> = {
  parameters: Record<string, unknown>;
  /** O campo que o assistente perguntou e está esperando. */
  aguardando: C;
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
   * É o desempate entre os domínios de conversa: quando há mais de um aberto,
   * quem responde é o mais recente, e o mais antigo continua vivo até o TTL.
   * Ausente, num pedido gravado por uma versão anterior, conta como o mais
   * antigo de todos.
   */
  salvo_em?: number;
};

export type ConfigDePendencia<C extends string> = {
  /** Vira `tibe:<prefixo>:<tenant>:<user>`. NUNCA mude o de um domínio vivo. */
  prefixo: string;
  ttlSegundos?: number;
  /**
   * O nome alternativo que o classificador usa para o mesmo campo.
   *
   * Existe porque o modelo não carrega de volta qual era a pergunta: para ele,
   * a resposta a "São machos ou fêmeas?" é só "uma categoria", não "a categoria
   * de DESTINO". Sem o atalho, a resposta não casava, o pedido guardado era
   * descartado, e a reconstrução do LLM punha a mesma categoria nas duas
   * pontas, gerando "transferir de Fêmea 25-36 para Fêmea 25-36".
   */
  atalho?: (campo: C) => string;
  /**
   * Se um NÚMERO conta como resposta, além de texto.
   *
   * `true` na maioria, porque `quantidade` e `valor` chegam do classificador
   * como número e exigir string descartaria a resposta certa.
   *
   * ⚠️ `false` em `herd` e `stock`, e isso é PRESERVADO da implementação
   * anterior, não escolhido agora: os dois só aceitavam string quando o
   * mecanismo foi extraído, em 02/09. Se algum dia fizer sentido uniformizar,
   * é decisão de produto sobre o caminho do WhatsApp, com banco de provas,
   * não faxina de refatoração.
   */
  aceitaNumero?: boolean;
};

export type StoreDePendencia<C extends string, P extends PedidoBase<C>> = {
  /**
   * A chave no Redis.
   *
   * Exposta porque `stock-pending.ts` precisa LER a chave de outros domínios
   * para desempatar por data, e antes disto ele as montava por string literal,
   * com um comentário pedindo que alguém lembrasse de acompanhar mudanças.
   */
  chave(tenantId: string, userId: string): string;
  salvar(tenantId: string, userId: string, pedido: P): Promise<void>;
  carregar(tenantId: string, userId: string): Promise<P | null>;
  limpar(tenantId: string, userId: string): Promise<void>;
  /**
   * Junta a resposta ao pedido guardado.
   *
   * A regra é estreita de propósito: da mensagem nova entra APENAS o campo que
   * estava sendo perguntado. Deixar o resto entrar é exatamente o que permitia
   * o tipo da movimentação ser trocado no meio do caminho.
   *
   * Devolve `null` quando a mensagem não traz nada para o campo perguntado: aí
   * ela não é uma resposta, é assunto novo, e o pendente deve ser descartado
   * pelo chamador.
   */
  aplicarResposta(
    pendente: Pick<P, "parameters" | "aguardando">,
    novos: Record<string, unknown>,
  ): Record<string, unknown> | null;
};

export function criarStoreDePendencia<
  C extends string,
  P extends PedidoBase<C> = PedidoBase<C>,
>(config: ConfigDePendencia<C>): StoreDePendencia<C, P> {
  const ttl = config.ttlSegundos ?? TTL_PADRAO_SEGUNDOS;
  const aceitaNumero = config.aceitaNumero ?? true;
  const atalho = config.atalho ?? ((campo: C) => campo as string);

  const chave = (tenantId: string, userId: string) =>
    `tibe:${config.prefixo}:${tenantId}:${userId}`;

  return {
    chave,

    async salvar(tenantId, userId, pedido) {
      try {
        const redis = getRedisConnection();
        await redis.set(
          chave(tenantId, userId),
          JSON.stringify({ ...pedido, salvo_em: pedido.salvo_em ?? Date.now() }),
          "EX",
          ttl,
        );
      } catch {
        // Redis fora do ar não pode derrubar o registro: sem o pendente o
        // assistente volta a depender do histórico, que é o comportamento
        // antigo. Pior, não quebrado.
      }
    },

    async carregar(tenantId, userId) {
      try {
        const redis = getRedisConnection();
        const bruto = await redis.get(chave(tenantId, userId));
        if (!bruto) return null;
        const pedido = JSON.parse(bruto) as P;
        if (!pedido || typeof pedido !== "object" || !pedido.parameters) return null;
        return pedido;
      } catch {
        return null;
      }
    },

    async limpar(tenantId, userId) {
      try {
        await getRedisConnection().del(chave(tenantId, userId));
      } catch {
        // idem
      }
    },

    aplicarResposta(pendente, novos) {
      const campo = pendente.aguardando;
      const bruto = novos[campo] ?? novos[atalho(campo)];

      if (aceitaNumero && typeof bruto === "number" && Number.isFinite(bruto)) {
        return { ...pendente.parameters, [campo]: bruto };
      }
      if (typeof bruto === "string" && bruto.trim() !== "") {
        return { ...pendente.parameters, [campo]: bruto.trim() };
      }
      return null;
    },
  };
}
