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

/**
 * Os campos que uma CORREÇÃO pode trazer durante a confirmação.
 *
 * Exportado porque o handler precisa da mesma lista para distinguir "não, é o
 * 60 P" (correção) de "não, deixa pra lá" (recusa): duas listas divergiriam no
 * primeiro campo novo que alguém acrescentasse de um lado só.
 */
export const CAMPOS_DE_CORRECAO = [
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
  "vendedor",
  "comprador",
  "vencimento",
  "due_date",
  "data_pagamento",
  "parcelas",
  "pago",
] as const;


/** Normaliza para comparar: sem acento, sem caixa, sem espaco sobrando. */
function texto(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "compra", "comprei" e "compra_produto" sao a mesma coisa. */
function tipoNormalizado(v: unknown): string {
  const t = texto(v);
  if (t.startsWith("compr")) return "compra";
  if (t.startsWith("vend")) return "venda";
  return t;
}

/** Numero escrito de qualquer jeito: "10", 10, "1.200" e 1200. */
function numeroNormalizado(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const bruto = texto(v);
  if (!bruto) return "";
  const semMilhar = bruto.includes(",")
    ? bruto.replace(/\./g, "").replace(",", ".")
    : /\.\d{1,2}$/.test(bruto)
      ? bruto
      : bruto.replace(/\./g, "");
  const n = Number(semMilhar);
  return Number.isFinite(n) ? String(n) : bruto;
}

const NUMERICOS = new Set(["quantidade", "quantity", "qtd", "saldo", "valor", "amount", "valor_total"]);

function comparavel(campo: string, valor: unknown): string {
  if (campo === "tipo" || campo === "type") return tipoNormalizado(valor);
  if (NUMERICOS.has(campo)) return numeroNormalizado(valor);
  if (campo === "pago" || campo === "paid") {
    const t = texto(valor);
    return t === "true" || t === "sim" || t === "paguei" || t === "pago" ? "sim" : t;
  }
  return texto(valor);
}

/**
 * A mensagem MUDA o pedido que está guardado?
 *
 * ESTA É A PERGUNTA CERTA, e levou cinco rodadas para aparecer. As anteriores
 * perguntavam "a mensagem traz dado?", e a resposta em produção é SEMPRE sim:
 * o guia do n8n (`docs/n8n-whatsapp-workflow.md`) manda o classificador
 * **remontar a intenção e os parâmetros** a cada turno, inclusive no "não". Ou
 * seja, todo "não" chega carregando o pedido inteiro de volta, e qualquer regra
 * baseada em "traz dado" lê uma recusa como resposta.
 *
 * Um revisor reproduziu o estrago: "não" repetia a confirmação para sempre, e
 * um "ok obrigado" duas voltas depois GRAVAVA a compra recusada.
 *
 * Com a pergunta certa, três coisas caem no lugar de uma vez:
 *
 * - **eco do pedido = recusa.** "Não" que devolve exatamente o que foi mostrado
 *   é "não", não é resposta.
 * - **diferença = correção.** "Não é o proteinado, é o 60 P" muda `produto`,
 *   então corrige em vez de cancelar.
 * - **contador de laço de graça.** Repetir o mesmo pedido É o laço; mudar o
 *   pedido é progresso.
 *
 * A normalização não é detalhe: o guardado tem `tipo: "compra_produto"` e o
 * produto já resolvido ("Sal mineral 60 P"), enquanto o classificador reenvia
 * `"compra"` e `"sal mineral 60 P"`. Sem normalizar, NADA nunca é igual, e a
 * regra volta a valer o oposto do que promete.
 */
export function mudaOPedido(
  pendente: PedidoEstoquePendente,
  novos: Record<string, unknown>,
): boolean {
  for (const campo of CAMPOS_DE_CORRECAO) {
    const chegou = novos[campo];
    if (chegou === undefined || chegou === null || chegou === "") continue;

    // O guardado pode ter o valor sob o mesmo nome ou sob o canônico.
    const guardado =
      pendente.parameters[campo] ??
      (campo === "type" ? pendente.parameters.tipo : undefined) ??
      (campo === "product" || campo === "item" ? pendente.parameters.produto : undefined) ??
      (campo === "quantity" || campo === "qtd" ? pendente.parameters.quantidade : undefined) ??
      (campo === "amount" || campo === "valor_total" ? pendente.parameters.valor : undefined) ??
      (campo === "property" ? pendente.parameters.fazenda : undefined);

    const a = comparavel(campo, chegou);
    const b = comparavel(campo, guardado);
    if (a === b) continue;

    /**
     * O PRODUTO é comparado por conteúdo, não por igualdade exata.
     *
     * O pendente guarda o nome RESOLVIDO ("Sal mineral 60 P") e o produtor
     * digita o apelido ("sal"), que é justamente o que `resolverProduto`
     * aceita. Exigir igualdade exata fazia toda recusa parecer correção: o
     * "não" remontado trazia "sal", o guardado dizia "Sal mineral 60 P", e a
     * conversa entendia que o produtor tinha trocado de produto.
     *
     * A regra é a mesma do catálogo, com uma direção: vale como IGUAL quando o
     * guardado já é o nome completo e a mensagem traz o apelido. O contrário é
     * MUDANÇA, e é o caso mais importante do módulo: quando o assistente
     * pergunta "qual deles?", o guardado é o termo ambíguo ("sal") e a resposta
     * é o nome específico ("Sal mineral 60 P"). Tratar isso como igual faria
     * "não é o proteinado, é o 60 P" cancelar o registro, que é exatamente o
     * defeito que motivou esta rodada.
     */
    if (campo === "produto" || campo === "product" || campo === "item") {
      if (a && b && b.includes(a)) continue;
    }
    return true;
  }
  return false;
}

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
      const CAMPOS_DE_DADO = CAMPOS_DE_CORRECAO;
      for (const campo of CAMPOS_DE_DADO) {
        const valor = novos[campo];
        if (valor !== undefined && valor !== null && valor !== "") juntos[campo] = valor;
      }
      return juntos;
    }
  }
}
