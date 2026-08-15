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
 * **A REGRA: a conversa MAIS RECENTE manda, e nenhuma é destruída.**
 *
 * Com três chaves independentes no Redis, um pendente de gado de 15 minutos
 * atrás sobrevivia a uma compra de sal, e o "sim" seguinte executava o gado: o
 * produtor confirmava R$ 600 de sal e levava 20 bezerros e R$ 60.000 de conta a
 * pagar.
 *
 * A primeira tentativa de resolver isso APAGAVA os pendentes dos outros
 * domínios, e criou o defeito oposto: "morreram 3 bezerros", ainda sem
 * confirmar, era destruído por uma pergunta de estoque, e o "sim" seguinte não
 * registrava a morte nem avisava ninguém. Um revisor reproduziu ao vivo.
 *
 * Por isso agora cada pedido carrega `salvo_em`, e quem decide é a data: o mais
 * recente responde, e o mais antigo continua vivo até o TTL, disponível se a
 * conversa nova terminar antes. Nada é apagado por conta de outro assunto.
 */

const TTL_SEGUNDOS = 15 * 60;

/** O campo que o assistente perguntou e está esperando. */
export type CampoEstoque =
  | "tipo"
  | "produto"
  | "quantidade"
  | "valor"
  | "fazenda"
  | "data"
  | "vencimento"
  /** A contradição "já paguei" + "vou parcelar". Responder LIMPA o lado oposto. */
  | "pagamento"
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
  /**
   * Quando este pedido foi guardado. É o desempate entre os três domínios de
   * conversa; ausente (pedido gravado por uma versão anterior) conta como o
   * mais antigo de todos.
   */
  salvo_em?: number;
};

export const MAX_TENTATIVAS = 3;

function chave(tenantId: string, userId: string): string {
  return `tibe:estoque-pending:${tenantId}:${userId}`;
}

/**
 * As chaves das outras duas conversas, só para LER a data delas.
 *
 * Nunca para apagar: ver o comentário do topo. Ficam escritas aqui porque os
 * dois módulos donos foram validados em produção e não vale reabri-los; se
 * alguma dessas chaves mudar lá, esta lista precisa acompanhar.
 */
const CHAVES_DE_OUTROS_DOMINIOS = [
  (t: string, u: string) => `tibe:negocio-pending:${t}:${u}`,
  (t: string, u: string) => `tibe:herd-pending:${t}:${u}`,
];

/**
 * Quando a conversa mais recente de OUTRO domínio foi guardada.
 *
 * `0` quando não há nenhuma. Pedido antigo, gravado antes de `salvo_em` existir,
 * conta como muito antigo (1), não como inexistente: assim ele perde para o
 * estoque recente mas ainda se distingue de "não existe".
 */
export async function quandoOutroDominioFalou(
  tenantId: string,
  userId: string,
): Promise<number> {
  try {
    const redis = getRedisConnection();
    const brutos = await Promise.all(
      CHAVES_DE_OUTROS_DOMINIOS.map((montar) => redis.get(montar(tenantId, userId))),
    );
    let maisRecente = 0;
    for (const bruto of brutos) {
      if (!bruto) continue;
      let quando = 1;
      try {
        const pedido = JSON.parse(bruto) as { salvo_em?: number };
        if (typeof pedido?.salvo_em === "number") quando = pedido.salvo_em;
      } catch {
        // JSON quebrado conta como pendente antigo, não como ausente.
      }
      if (quando > maisRecente) maisRecente = quando;
    }
    return maisRecente;
  } catch {
    return 0;
  }
}

function chaveDaUltimaExecucao(tenantId: string, userId: string): string {
  return `tibe:ultima-execucao:${tenantId}:${userId}`;
}

/**
 * Marca que ALGUMA COISA foi gravada para esta pessoa, agora.
 *
 * Serve para invalidar pedido pendente ANTERIOR à última gravação. O caso que
 * obrigou isto, reproduzido por um revisor: o produtor deixa um ajuste de
 * estoque sem confirmar, cinco minutos depois fecha uma compra de gado e diz
 * "sim" (que registra o gado, correto), e um segundo "sim" solto executa o
 * ajuste abandonado, tirando 14 sacas do livro sem nada ter sido perguntado na
 * tela.
 *
 * É a terceira volta do MESMO eixo. Primeiro os pendentes eram independentes e
 * um "sim" pegava o do domínio errado; a correção passou a apagar os outros, e
 * isso destruía conversa legítima; a correção seguinte parou de apagar e
 * desempatou por data, e sobrou este buraco. A regra que faltava: pendência
 * anterior à última execução também é papel em branco.
 */
export async function marcarExecucao(tenantId: string, userId: string): Promise<void> {
  try {
    await getRedisConnection().set(
      chaveDaUltimaExecucao(tenantId, userId),
      String(Date.now()),
      "EX",
      TTL_SEGUNDOS,
    );
  } catch {
    // Sem Redis, o comportamento volta a ser o anterior: pior, não quebrado.
  }
}

/** Quando esta pessoa gravou alguma coisa pela última vez. `0` se nunca. */
export async function quandoExecutouPorUltimo(
  tenantId: string,
  userId: string,
): Promise<number> {
  try {
    const bruto = await getRedisConnection().get(chaveDaUltimaExecucao(tenantId, userId));
    const n = bruto ? Number(bruto) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export async function savePendingStock(
  tenantId: string,
  userId: string,
  pedido: PedidoEstoquePendente,
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
    case "data":
      return atalho("data", "date", "occurred_at") ? juntos : null;
    case "vencimento":
      return atalho("vencimento", "due_date") ? juntos : null;
    case "pagamento": {
      /**
       * "Já paguei" e "vou parcelar" não podem valer juntos, então responder um
       * lado tem de LIMPAR o outro. Sem isso a contradição era impossível de
       * resolver: qualquer resposta reencontrava os dois campos preenchidos e a
       * mesma pergunta voltava até a conversa ser jogada fora.
       */
      /**
       * Lê a FALA, não só os campos estruturados.
       *
       * A versão anterior olhava apenas `parcelas` e `pago`, e isso quebrava dos
       * dois lados: "vou parcelar" chegando como `{pago: false}` gravava `pago`
       * e APAGAVA as parcelas (o produtor pedia 3x e levava uma conta única); e
       * a mesma frase chegando no campo `pagamento` não casava com nada, então
       * a contradição era impossível de resolver e a compra inteira ia para a
       * trava de laço. O handler de gado, validado em produção, lê o texto por
       * regex; esta cópia tinha ficado só com os campos.
       */
      const dito = [novos.pagamento, novos.resposta, novos.pago, novos.parcelas]
        .map((v) => (typeof v === "string" ? v : ""))
        .join(" ")
        .toLowerCase();

      const parcelou = novos.parcelas ?? novos.installments ?? novos.parcelamento;
      const falouEmParcelar = /parcel|vezes|prazo|\dx/.test(dito);
      if (falouEmParcelar || (parcelou !== undefined && parcelou !== null && parcelou !== "")) {
        if (parcelou !== undefined && parcelou !== null && parcelou !== "") juntos.parcelas = parcelou;
        else if (dito) juntos.parcelas = dito;
        juntos.pago = false;
        delete juntos.paid;
        return juntos;
      }

      const falouEmPagar = /\bpago\b|paguei|a vista|à vista/.test(dito);
      const pagou = novos.pago ?? novos.paid;
      if (falouEmPagar || pagou === true) {
        juntos.pago = true;
        delete juntos.parcelas;
        delete juntos.installments;
        delete juntos.parcelamento;
        return juntos;
      }
      return null;
    }
    case "confirmacao": {
      /**
       * Esperando um "sim", mas veio outra coisa.
       *
       * Se a mensagem traz DADO, ela é uma correção ("foram 50 sacas, não 10"),
       * e o corrigido tem de vencer o guardado: descartar a correção fazia o
       * assistente repetir a confirmação antiga como se nada tivesse sido dito,
       * e a segunda tentativa do produtor era ainda pior, porque ele já achava
       * que tinha corrigido.
       *
       * Se não traz dado nenhum ("peraí", "deixa eu ver"), o guardado continua
       * valendo e a confirmação é repetida: é o caso em que a correção da
       * rodada anterior errou para o outro lado, executando a compra.
       *
       * Quem decide EXECUTAR é o chamador, e só com um "sim" de verdade. Aqui
       * só se decide o que está sobre a mesa.
       */
      const CAMPOS_DE_DADO = [
        "produto",
        "product",
        "item",
        "quantidade",
        "quantity",
        "qtd",
        "saldo",
        "valor",
        "amount",
        "valor_total",
        "tipo",
        "type",
        "fazenda",
        "property",
        "contato",
        "contact_name",
        "vencimento",
        "due_date",
        "parcelas",
        "pago",
      ];
      for (const campo of CAMPOS_DE_DADO) {
        const valor = novos[campo];
        if (valor !== undefined && valor !== null && valor !== "") juntos[campo] = valor;
      }
      return juntos;
    }
  }
}
