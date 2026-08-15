import type { TenantPrismaClient } from "@/lib/prisma";
import { createProductNegotiation } from "@/lib/actions/product-negotiations";
import { recordStockMovement, adjustStock, getStockBalance } from "@/lib/actions/stock-ledger";
import { listProductsWithBalance } from "@/lib/actions/products";
import {
  descreverQuantidade,
  findUnit,
  quantosOuQuantas,
  concordar,
  recusaPorFracao,
} from "@/lib/stock/units";
import {
  savePendingStock,
  loadPendingStock,
  clearPendingStock,
  quandoExecutouPorUltimo,
  quandoOutroDominioFalou,
  aplicarRespostaEstoque,
  MAX_TENTATIVAS,
  type CampoEstoque,
  type PedidoEstoquePendente,
} from "@/lib/actions/stock-pending";
import { resolverFazenda } from "./herd";
import { ask, failReply, str, type Handler, type RouterResult } from "./shared";
import {
  custosDosParametros,
  lerData,
  lerDinheiro,
  extrairNumeroDeParcelas,
  interpretarSim,
  montarParcelas,
  lerNumeroBr,
} from "./parsers";

/**
 * Estoque de insumos pelo WhatsApp (Módulo 31, §9 e §10).
 *
 * Quatro gestos: comprei produto, vendi produto, usei e contei. O uso é o que
 * mais acontece e o que menos combina com painel: quem acabou de dar sal ao
 * gado está no curral, não na frente do computador.
 *
 * AS REGRAS QUE NÃO PODEM AFROUXAR. A primeira versão deste arquivo quebrou
 * três delas de uma vez, e um revisor independente reproduziu cada uma ao vivo:
 *
 * 1. **O pedido fica GUARDADO** (`stock-pending.ts`) e é ele que manda. A
 *    primeira versão não guardava nada e afirmava, por escrito, que a
 *    confirmação viajava em `auxiliary_data`: falso, aquilo é só SAÍDA, o
 *    contrato da rota interna não tem por onde receber de volta, e o guia do
 *    n8n manda o LLM remontar os parâmetros pelo histórico. O "sim" acabava
 *    executando o que o classificador reconstruiu: mostrava 10 sacas e gravava
 *    100, com o frete sumindo no caminho.
 * 2. **"não"/"cancela" cancela, sem exceção**, nos três gestos que escrevem (a
 *    consulta não tem o que cancelar). Uma exceção foi tentada e removida: ver
 *    o comentário em `comMemoria`. A assimetria manda: deixar de cancelar
 *    escreve no livro; cancelar por engano custa uma frase repetida.
 * 3. **O campo perguntado é lido do lugar certo, e nada é jogado fora.** A
 *    resposta esperada entra no campo esperado; quando ela não vem, o que a
 *    mensagem trouxer entra POR CIMA do acumulado, nunca no lugar dele. As duas
 *    metades importam: sem a primeira, responder "2" a "quantas sacas?" apagava
 *    o produto já escolhido; sem a segunda, dizer "do Zé" quando se perguntou o
 *    valor perdia o fornecedor em silêncio.
 * 4. **O produto é resolvido no CATÁLOGO, nunca criado pela conversa.**
 *    Cadastrar exige categoria e unidade (§9.1), e adivinhar produziria "sal",
 *    "sal mineral" e "sal mineral 60" como três saldos para a mesma coisa.
 *
 * Confirmação: compra, venda e AJUSTE confirmam; uso não. A linha é o que a
 * operação pode estragar. Uso é limitado pelo saldo disponível e costuma ser
 * pequeno; ajuste é ilimitado para baixo, e "faltaram 2 sacas" lido como saldo
 * final tira 18 de um estoque de 20 sem nada denunciando.
 */

type ProdutoDoCatalogo = {
  id: string;
  name: string;
  unit: string;
};

/**
 * Acha o produto pelo nome dito, sem inventar.
 *
 * Compara sem acento e sem caixa, aceitando que o produtor fale menos do que
 * cadastrou: "sal" encontra "Sal mineral 60 P". Quando mais de um casa, mostra
 * os candidatos em vez de escolher o primeiro: dois produtos parecidos com
 * saldos diferentes é exatamente o caso em que chutar erra o estoque de dois
 * de uma vez.
 */
export async function resolverProduto(
  db: TenantPrismaClient,
  nome: string | null,
): Promise<{ ok: true; produto: ProdutoDoCatalogo } | { ok: false; resposta: RouterResult }> {
  const produtos = await db.product.findMany({
    where: { archived_at: null },
    select: { id: true, name: true, unit: true },
    orderBy: { name: "asc" },
  });

  if (produtos.length === 0) {
    return {
      ok: false,
      resposta: ask(
        "Você ainda não tem produto cadastrado no estoque. Cadastre no painel, em Estoque, e depois me chame.",
      ),
    };
  }

  if (!nome) {
    return {
      ok: false,
      resposta: ask(`Qual produto?\n${produtos.map((p) => `- ${p.name}`).join("\n")}`),
    };
  }

  const alvo = normalizar(nome);
  const exato = produtos.find((p) => normalizar(p.name) === alvo);
  if (exato) return { ok: true, produto: exato };

  const parciais = produtos.filter(
    (p) => normalizar(p.name).includes(alvo) || alvo.includes(normalizar(p.name)),
  );
  if (parciais.length === 1) return { ok: true, produto: parciais[0] };
  if (parciais.length > 1) {
    return {
      ok: false,
      resposta: ask(
        `Tenho mais de um parecido com "${nome}". Qual deles?\n${parciais.map((p) => `- ${p.name}`).join("\n")}`,
      ),
    };
  }

  return {
    ok: false,
    resposta: ask(
      `Não achei "${nome}" no seu estoque. Você tem:\n${produtos.map((p) => `- ${p.name}`).join("\n")}\n\nSe for produto novo, cadastre no painel, em Estoque.`,
    ),
  };
}

function normalizar(termo: string): string {
  return termo
    .toLowerCase()
    .normalize("NFD")
    // Escape explícito, não o caractere combinante cru: ele é invisível no
    // editor e some numa cópia distraída, e aí "ureia" deixa de achar "Ureia".
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * A quantidade dita, conferida contra a unidade do produto.
 *
 * Meia saca existe e meia enxada não (§10.5), e a recusa precisa acontecer
 * ANTES da confirmação: perguntar "confirma 2,5 enxadas?" já é aceitar a
 * premissa errada, e o produtor diria sim.
 */
function lerQuantidade(
  bruto: unknown,
  produto: ProdutoDoCatalogo,
): { ok: true; valor: number } | { ok: false; pergunta: string } {
  // `lerNumeroBr`, nao `num`: "comprei 2.000 kg de racao" virava 2 quilos no
  // estoque, e "usei 2,5 sacas" era recusado apesar de saca aceitar quantidade
  // quebrada. E o mesmo erro de ordem de grandeza que ja custou uma rodada com
  // dinheiro, repetido no saldo.
  const valor = lerNumeroBr(bruto);
  if (valor == null || valor <= 0) {
    return {
      ok: false,
      pergunta: `${quantosOuQuantas(produto.unit)} ${plural(produto)} de ${produto.name}?`,
    };
  }

  const recusa = recusaPorFracao(produto.name, valor, produto.unit);
  if (recusa) {
    return {
      ok: false,
      pergunta: `${recusa} ${quantosOuQuantas(produto.unit)} exatamente?`,
    };
  }

  return { ok: true, valor };
}

function plural(produto: ProdutoDoCatalogo): string {
  return findUnit(produto.unit)?.plural ?? "unidades";
}

/** A frase-modelo de cada gesto, para a saída do laço não mandar o produtor para o gesto errado. */
const EXEMPLO_POR_GESTO: Record<PedidoEstoquePendente["intent"], string> = {
  registrar_uso_estoque: "usei 2 sacas de sal mineral no lote do curral",
  ajustar_estoque: "contei e tem 8 sacas de sal mineral",
  registrar_negocio_produto: "comprei 10 sacas de sal do Zé por 1200, para pagar dia 10",
};

function responder(texto: string, acao: string): RouterResult {
  return {
    reply_text: texto,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: acao,
  };
}

/**
 * O começo de todo handler: junta a mensagem nova ao que estava guardado e
 * decide se este turno EXECUTA ou apenas pergunta.
 *
 * A decisão de executar mora aqui, e não no handler, porque a primeira versão
 * a espalhou em três lugares e perdeu metade da regra pelo caminho: bastava
 * existir um pendente em "confirmacao" para a PRÓXIMA MENSAGEM QUALQUER
 * executar. "Peraí, deixa eu contar de novo" apagava 18 sacas do livro; "qual
 * meu saldo?" gravava uma compra com conta a pagar. A confirmação existia e se
 * assinava sozinha.
 *
 * A regra completa, a mesma de `negociacao.ts`, que já a tinha certa:
 *
 * - `confirmed` vem de interpretar o TEXTO do produtor ("sim", "pode"), então
 *   sozinho ele não basta: precisa haver um pedido em "confirmacao" para o
 *   "sim" ter a que se referir.
 * - `confirmed` com pendência de CAMPO não confirma nada: o produtor está
 *   respondendo a pergunta, e ninguém confirma o que ainda não viu. Vale
 *   inclusive para "ok são 4 sacas", em que o "ok" é só muleta de fala.
 * - `confirmed` SEM pendência nenhuma não escreve: seria assinar em papel em
 *   branco o que o classificador remontou.
 * - Sem `user_id` não há onde guardar, então também não há âncora: um
 *   `confirmed` nesse caminho é recusado, em vez de gravar o remontado.
 */
async function comMemoria(
  intent: PedidoEstoquePendente["intent"],
  ctx: {
    tenant_id: string;
    user_id?: string;
    parameters: Record<string, unknown>;
    explicitNo: boolean;
    confirmed: boolean;
  },
): Promise<
  | {
      ok: true;
      parameters: Record<string, unknown>;
      /** Este turno grava. Só é true com um "sim" ancorado no que foi mostrado. */
      executar: boolean;
      /** O que estava guardado, para a trava de laço contar repergunta. */
      pendente: PedidoEstoquePendente | null;
      /**
       * Quantas vezes o MESMO campo ja foi perguntado.
       *
       * Precisa VIAJAR ate a proxima pergunta. Na primeira versao `perguntar`
       * gravava o pendente sem este campo, zerando o contador a cada volta, e a
       * trava de laco nunca disparava: o produtor ficava preso ouvindo a mesma
       * pergunta para sempre. E o mesmo defeito que o comentario logo abaixo
       * descreve, reintroduzido uma funcao adiante.
       */
      tentativas: number;
    }
  | { ok: false; resposta: RouterResult }
> {
  const pendente = ctx.user_id ? await loadPendingStock(ctx.tenant_id, ctx.user_id) : null;
  const meuPendente = pendente && pendente.intent === intent ? pendente : null;

  /**
   * RECUSA VENCE TUDO, SEM EXCEÇÃO.
   *
   * Houve uma exceção aqui, e ela foi removida depois de um revisor mostrar que
   * ela GRAVAVA. A ideia era boa no papel: "não sei ao certo, umas 3" é uma
   * resposta com um "não" no meio, então valeria a resposta. O que derruba a
   * ideia é que o guia do n8n manda o LLM REMONTAR os parâmetros pelo
   * histórico: depois de "usei 2 sacas de sal", qualquer mensagem seguinte
   * chega com produto e quantidade preenchidos, inclusive "não deixa pra lá".
   * A exceção então enxergava uma "resposta" onde havia uma recusa, e como o
   * uso não confirma, gravava as 2 sacas.
   *
   * A assimetria decide: deixar de cancelar ESCREVE no livro; cancelar por
   * engano custa uma frase repetida. É também o que o handler de gado faz, e
   * ele está validado em produção.
   */
  if (ctx.explicitNo) {
    if (ctx.user_id) await clearPendingStock(ctx.tenant_id, ctx.user_id);
    return {
      ok: false,
      resposta: responder("Ok, não registrei nada.", `${intent}:cancelado`),
    };
  }

  /**
   * A guarda do "sim" só existe para os gestos que PEDEM "sim".
   *
   * O uso não confirma nunca (§10.3, é o gesto mais frequente e não mexe em
   * dinheiro), então para ele `confirmed` não quer dizer nada. Aplicar a guarda
   * ali criava uma recusa absurda: "ok, usei 3 sacas de sal" tem um "ok" que o
   * interpretador de confirmação marca como sim, e o registro era recusado com
   * "não tenho nada esperando confirmação" em vez de acontecer.
   *
   * Achado por uma sonda adversarial minha, depois de três rodadas de juiz: é
   * mais uma regra copiada do handler de gado, onde ela é coerente porque lá
   * TODO registro confirma.
   */
  const gestoConfirma = intent !== "registrar_uso_estoque";

  if (ctx.confirmed && gestoConfirma) {
    if (!ctx.user_id) {
      return {
        ok: false,
        resposta: ask(
          "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
            "Me conte de novo o que você quer lançar no estoque.",
        ),
      };
    }
    if (meuPendente?.aguardando === "confirmacao") {
      /**
       * O pedido precisa ser POSTERIOR à última coisa que esta pessoa gravou.
       *
       * Sem isto, um pedido abandonado continuava executável para sempre (até o
       * TTL): o produtor deixava um ajuste sem confirmar, cinco minutos depois
       * fechava uma compra de gado com um "sim", e um segundo "sim" solto
       * executava o ajuste esquecido, tirando 14 sacas sem nada ter sido
       * perguntado na tela. Reproduzido por um revisor independente.
       */
      const ultimaExecucao = await quandoExecutouPorUltimo(ctx.tenant_id, ctx.user_id);
      /**
       * ...e precisa ser o MAIS RECENTE entre os três domínios de conversa.
       *
       * O desempate por data existia só no roteador, e lá ele nunca rodava
       * quando o palpite do classificador já era uma intenção de estoque. Um
       * revisor reproduziu: pedido de sal em confirmação, depois um negócio de
       * gado de R$ 60.000 também em confirmação, e o "sim" gravava o SAL. Aqui,
       * no ponto onde a escrita de fato acontece, a comparação vale sempre,
       * qualquer que tenha sido o caminho até chegar.
       */
      const outroDominio = await quandoOutroDominioFalou(ctx.tenant_id, ctx.user_id);
      const piso = Math.max(ultimaExecucao, outroDominio);
      if ((meuPendente.salvo_em ?? 0) <= piso) {
        await clearPendingStock(ctx.tenant_id, ctx.user_id);
        return {
          ok: false,
          resposta: ask(
            "Esse pedido não é o mais recente da nossa conversa, então não vou " +
              "executá-lo. Me conte de novo o que você quer lançar no estoque.",
          ),
        };
      }
      // Executa o que foi MOSTRADO, lido do guardado, nunca o que veio na
      // mensagem: é isto que a palavra "confirmar" significa.
      return { ok: true, parameters: { ...meuPendente.parameters }, executar: true, pendente, tentativas: 0 };
    }
    if (!pendente) {
      return {
        ok: false,
        resposta: ask(
          "Não tenho nada esperando confirmação. Me conte de novo o que você quer lançar no estoque.",
        ),
      };
    }
    // Pendência de campo: segue como resposta, sem executar.
  }

  if (!ctx.user_id || !meuPendente) {
    return { ok: true, parameters: { ...ctx.parameters }, executar: false, pendente, tentativas: 0 };
  }

  const juntos = aplicarRespostaEstoque(meuPendente, ctx.parameters);
  if (juntos) {
    return { ok: true, parameters: juntos, executar: false, pendente, tentativas: 0 };
  }

  /**
   * A resposta não trouxe o campo perguntado.
   *
   * O pendente NÃO é apagado aqui: apagar zerava o contador e a trava de laço
   * nunca disparava, defeito real do Módulo 30. Ele morre por TTL, por sucesso
   * ou por cancelamento.
   */
  const tentativas = meuPendente.tentativas ?? 0;
  /**
   * O que a mensagem traz entra POR CIMA do acumulado, nunca no lugar dele, e
   * nunca é descartado.
   *
   * A versão anterior devolvia só o guardado, jogando a mensagem nova fora:
   * quem dizia "comprei 10 sacas de sal", ouvia "por quanto?" e respondia "do
   * Zé" perdia o fornecedor, porque "do Zé" não é valor e por isso não casava.
   * O handler de gado já fazia certo, com o comentário explicando que o
   * conjunto empobrecido era o defeito; esta cópia ficou sem a parte.
   */
  const acumulado = { ...meuPendente.parameters, ...ctx.parameters };
  await savePendingStock(ctx.tenant_id, ctx.user_id, {
    ...meuPendente,
    parameters: acumulado,
    tentativas,
  });
  return { ok: true, parameters: acumulado, executar: false, pendente, tentativas };
}

/** Pergunta um campo E guarda o que já foi entendido, para não perder no caminho. */
/**
 * Pergunta um campo E guarda o que já foi entendido, para não perder no caminho.
 *
 * A TRAVA DE LAÇO CONTA REPERGUNTA DO MESMO CAMPO, não resposta ilegível.
 *
 * A versão anterior só incrementava quando a resposta não casava com o campo
 * esperado, e isso deixava um laço infinito de fora: "usei sal" com dois
 * produtos parecidos no catálogo pergunta qual; o produtor responde "sal", que
 * CASA com o campo `produto` e zera o contador, mas continua ambíguo e a mesma
 * pergunta volta. Para sempre, até o TTL. O handler de gado conta pelo campo
 * desde o Módulo 30, e é a contagem certa: o que cansa o produtor é ouvir a
 * mesma pergunta, não o parser falhar.
 */
async function perguntar(
  intent: PedidoEstoquePendente["intent"],
  ctx: { tenant_id: string; user_id?: string },
  parameters: Record<string, unknown>,
  campo: CampoEstoque,
  texto: string,
  pendenteAtual: PedidoEstoquePendente | null,
): Promise<RouterResult> {
  if (!ctx.user_id) return ask(texto);

  const tentativas = pendenteAtual?.aguardando === campo ? (pendenteAtual.tentativas ?? 1) + 1 : 1;
  if (tentativas >= MAX_TENTATIVAS) {
    await clearPendingStock(ctx.tenant_id, ctx.user_id);
    // O exemplo é do gesto em curso: oferecer "usei 2 sacas" a quem está
    // tentando registrar uma COMPRA manda o produtor para o lugar errado.
    return ask(
      "Não estou conseguindo entender essa parte. Tente mandar tudo numa frase só, " +
        `por exemplo: "${EXEMPLO_POR_GESTO[intent]}".`,
    );
  }

  await savePendingStock(ctx.tenant_id, ctx.user_id, {
    intent,
    parameters,
    aguardando: campo,
    tentativas,
  });
  return ask(texto);
}

/**
 * "Usei 2 sacas de sal no lote do curral" (§10.3).
 *
 * Não pede confirmação: é o gesto mais frequente do módulo, não mexe em
 * dinheiro, é limitado pelo saldo disponível, e um erro se desfaz contando de
 * novo. Exigir "sim" a cada saca de sal faria o produtor parar de registrar, e
 * estoque que ninguém registra não serve para nada.
 */
export const registrarUsoEstoque: Handler = async (ctx) => {
  const { db, parameters: brutos, tenant_id, user_id, explicitNo, confirmed } = ctx;
  const memoria = await comMemoria("registrar_uso_estoque", {
    tenant_id,
    user_id,
    parameters: brutos,
    explicitNo,
    confirmed,
  });
  if (!memoria.ok) return memoria.resposta;
  const parameters = memoria.parameters;
  const guardar = (campo: CampoEstoque, texto: string) =>
    perguntar("registrar_uso_estoque", ctx, parameters, campo, texto, memoria.pendente);

  const produtoResolvido = await resolverProduto(
    db,
    str(parameters.produto) ?? str(parameters.product) ?? str(parameters.item),
  );
  if (!produtoResolvido.ok) return guardar("produto", produtoResolvido.resposta.reply_text);
  const produto = produtoResolvido.produto;
  parameters.produto = produto.name;

  const quantidade = lerQuantidade(
    parameters.quantidade ?? parameters.quantity ?? parameters.qtd,
    produto,
  );
  if (!quantidade.ok) return guardar("quantidade", quantidade.pergunta);

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) return guardar("fazenda", fazenda.resposta.reply_text);

  const data = lerData(parameters, "data", "date", "occurred_at");
  if (data.tipo === "invalida") {
    // Guarda o campo DATA, nao "quantidade": guardando o campo errado, a
    // resposta certa nunca casava e o assistente repetia a data velha na cara
    // de quem tinha acabado de dar a nova, ate a trava de laco jogar a
    // conversa fora.
    return guardar("data", `Não entendi a data "${data.bruto}". Pode dizer 10/12 ou "hoje"?`);
  }

  const resultado = await recordStockMovement(db, {
    product_id: produto.id,
    property_id: fazenda.id,
    movement_type: "utilizacao",
    quantity: quantidade.valor,
    occurred_at: data.tipo === "ok" ? data.data : null,
    purpose: str(parameters.finalidade) ?? str(parameters.purpose) ?? null,
    // §10.6 exige usuario responsavel no historico. Sem isto, o canal que vai
    // gerar a MAIORIA dos registros gravava tudo sem autor.
    recorded_by_user_id: user_id ?? null,
  });
  // Só limpa quando DEU CERTO: apagar antes de saber fazia o produtor perder a
  // frase inteira numa recusa por saldo e ter que redigitar tudo.
  if (resultado.ok && user_id) await clearPendingStock(tenant_id, user_id);
  if (!resultado.ok) return failReply("registrar_uso_estoque", resultado);

  const [posicao] = await getStockBalance(db, {
    product_id: produto.id,
    property_id: fazenda.id,
  });
  const restante = posicao?.quantity ?? 0;

  return {
    reply_text:
      `✅ Anotei: ${descreverQuantidade(quantidade.valor, produto.unit)} de ${produto.name} ` +
      `${concordar("usadas", produto.unit, quantidade.valor)} em ${fazenda.nome}. ` +
      `Restam ${descreverQuantidade(restante, produto.unit)}.`,
    requires_confirmation: false,
    auxiliary_data: { movement_id: resultado.data.id, saldo: restante },
    report_url: null,
    action_taken: "registrar_uso_estoque:ok",
  };
};

/**
 * "Contei e tem só 6 sacas de sal" (§10.6).
 *
 * O produtor informa o que EXISTE; a diferença é conta do sistema.
 *
 * CONFIRMA, ao contrário do uso, e a razão é concreta: "faltaram 2 sacas" é
 * como o produtor fala, e lido como saldo final tira 18 de um estoque de 20.
 * O guia do n8n instrui o classificador a perguntar o total nesse caso, mas
 * regra que vive só no prompt não é trava: a confirmação mostrando "de 20 para
 * 2" é o par em código que barra o absurdo alto e claro. Um campo de diferença
 * vindo do classificador também vira pergunta, nunca saldo.
 */
export const ajustarEstoque: Handler = async (ctx) => {
  const { db, parameters: brutos, tenant_id, user_id, explicitNo, confirmed } = ctx;
  const memoria = await comMemoria("ajustar_estoque", {
    tenant_id,
    user_id,
    parameters: brutos,
    explicitNo,
    confirmed,
  });
  if (!memoria.ok) return memoria.resposta;
  const parameters = memoria.parameters;
  const guardar = (campo: CampoEstoque, texto: string) =>
    perguntar("ajustar_estoque", ctx, parameters, campo, texto, memoria.pendente);

  const produtoResolvido = await resolverProduto(
    db,
    str(parameters.produto) ?? str(parameters.product) ?? str(parameters.item),
  );
  if (!produtoResolvido.ok) return guardar("produto", produtoResolvido.resposta.reply_text);
  const produto = produtoResolvido.produto;
  parameters.produto = produto.name;

  // Par em código da regra do §10.6: diferença NÃO é saldo.
  const diferencaDita =
    parameters.diferenca ?? parameters.faltaram ?? parameters.sobraram ?? parameters.difference;
  if (diferencaDita != null && parameters.saldo == null && parameters.quantidade == null) {
    return guardar(
      "quantidade",
      "Para corrigir eu preciso do total, não da diferença. " +
        `${quantosOuQuantas(produto.unit)} ${plural(produto)} de ${produto.name} tem hoje, ao todo?`,
    );
  }

  const contado = lerNumeroBr(
    parameters.saldo ?? parameters.quantidade ?? parameters.quantity ?? parameters.corrected_balance,
  );
  if (contado == null || contado < 0) {
    return guardar(
      "quantidade",
      `${quantosOuQuantas(produto.unit)} ${plural(produto)} de ${produto.name} você contou?`,
    );
  }
  const recusaDoAjuste = recusaPorFracao(produto.name, contado, produto.unit);
  if (recusaDoAjuste) {
    return guardar("quantidade", `${recusaDoAjuste} ${quantosOuQuantas(produto.unit)} exatamente?`);
  }

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) return guardar("fazenda", fazenda.resposta.reply_text);

  const [posicao] = await getStockBalance(db, {
    product_id: produto.id,
    property_id: fazenda.id,
  });
  const atual = posicao?.quantity ?? 0;

  if (!memoria.executar) {
    if (user_id) {
      /**
       * A confirmação também conta tentativa.
       *
       * Sem o contador, "peraí, deixa eu ver" repetia a mesma confirmação para
       * sempre: o produtor não conseguia sair nem confirmando nem recusando, e
       * a única saída era um "ok" que executava.
       */
      const jaPerguntou =
        memoria.pendente?.aguardando === "confirmacao"
          ? (memoria.pendente.tentativas ?? 1) + 1
          : 1;
      if (jaPerguntou >= MAX_TENTATIVAS) {
        await clearPendingStock(tenant_id, user_id);
        return ask(
          "Vou deixar esse registro de lado por enquanto. Quando quiser, me conte de novo, " +
            `por exemplo: "${EXEMPLO_POR_GESTO["ajustar_estoque"]}".`,
        );
      }
      await savePendingStock(tenant_id, user_id, {
        intent: "ajustar_estoque",
        parameters: { ...parameters, saldo: contado, fazenda: fazenda.nome },
        aguardando: "confirmacao",
        tentativas: jaPerguntou,
      });
    }
    return {
      reply_text:
        `Confirma? ${produto.name} em ${fazenda.nome} passa de ` +
        `${descreverQuantidade(atual, produto.unit)} para ` +
        `${descreverQuantidade(contado, produto.unit)}.`,
      requires_confirmation: true,
      auxiliary_data: null,
      report_url: null,
      action_taken: "ajustar_estoque:aguardando_confirmacao",
    };
  }

  const resultado = await adjustStock(db, {
    product_id: produto.id,
    property_id: fazenda.id,
    corrected_balance: contado,
    reason: str(parameters.motivo) ?? str(parameters.reason) ?? "Contagem informada pelo WhatsApp",
    recorded_by_user_id: user_id ?? null,
  });
  if (resultado.ok && user_id) await clearPendingStock(tenant_id, user_id);
  if (!resultado.ok) {
    // `NO_CHANGE` não é alerta: o produtor conferiu e o sistema já estava
    // certo. O "⚠️" de `failReply` transformava um acerto em susto.
    if (resultado.code === "NO_CHANGE") {
      return responder(resultado.message, "ajustar_estoque:sem_mudanca");
    }
    return failReply("ajustar_estoque", resultado);
  }

  const diferenca = resultado.data.diferenca;
  const movimento =
    diferenca > 0
      ? `Somei ${descreverQuantidade(diferenca, produto.unit)}`
      : `Tirei ${descreverQuantidade(Math.abs(diferenca), produto.unit)}`;

  return {
    reply_text:
      `✅ Corrigido: ${produto.name} agora está com ` +
      `${descreverQuantidade(contado, produto.unit)} em ${fazenda.nome}. ${movimento}.`,
    requires_confirmation: false,
    auxiliary_data: { movement_id: resultado.data.id, diferenca },
    report_url: null,
    action_taken: "ajustar_estoque:ok",
  };
};

/** "Quanto tenho de sal?" e "o que está acabando?" (§10.2 e §10.8). */
export const consultarEstoque: Handler = async ({ db, parameters }) => {
  const nome = str(parameters.produto) ?? str(parameters.product) ?? str(parameters.item);
  const produtos = await listProductsWithBalance(db);

  if (produtos.length === 0) {
    return responder(
      "Você ainda não tem produto cadastrado no estoque. Cadastre no painel, em Estoque.",
      "consultar_estoque:vazio",
    );
  }

  if (nome) {
    const resolvido = await resolverProduto(db, nome);
    if (!resolvido.ok) return resolvido.resposta;
    const p = produtos.find((x) => x.id === resolvido.produto.id)!;
    const alerta =
      p.abaixo_do_minimo && p.minimum_stock != null
        ? ` (seu mínimo é ${descreverQuantidade(p.minimum_stock, p.unit)})`
        : "";
    return responder(
      `📦 ${p.name}: ${descreverQuantidade(p.saldo_total, p.unit)}${alerta}.`,
      "consultar_estoque:ok",
    );
  }

  /**
   * "O que está acabando" precisa dar a MESMA resposta do alerta diário.
   *
   * O alerta ignora produto que nunca movimentou, para não inundar quem
   * cadastrou 20 itens numa tarde; esta consulta não ignorava, e respondia
   * "precisa repor: Vermífugo, 0 frascos" para um produto cadastrado hoje,
   * escondendo o sal e o óleo que de fato têm saldo. Duas respostas para a
   * mesma pergunta, pelo mesmo produto, no mesmo dia.
   */
  const jaMovimentou = (p: (typeof produtos)[number]) => p.saldo_por_fazenda.length > 0;
  const acabando = produtos.filter((p) => p.abaixo_do_minimo && jaMovimentou(p));
  const comSaldo = produtos.filter((p) => p.saldo_total > 0);

  // Sem produto citado, a resposta é o que ele precisa saber, não o catálogo
  // inteiro: uma lista de 40 linhas no WhatsApp não é resposta, é despejo.
  const linhas = (acabando.length > 0 ? acabando : comSaldo)
    .slice(0, 10)
    .map((p) => `- ${p.name}: ${descreverQuantidade(p.saldo_total, p.unit)}`)
    .join("\n");

  if (acabando.length > 0) {
    return responder(
      `📦 Precisa repor:\n${linhas}` +
        (acabando.length > 10 ? `\n...e mais ${acabando.length - 10}.` : ""),
      "consultar_estoque:acabando",
    );
  }
  if (comSaldo.length === 0) {
    return responder("Seu estoque está zerado em todos os produtos.", "consultar_estoque:zerado");
  }
  return responder(
    `📦 No estoque:\n${linhas}` +
      (comSaldo.length > 10 ? `\n...e mais ${comSaldo.length - 10}.` : ""),
    "consultar_estoque:ok",
  );
};

const TIPOS: Record<string, "compra_produto" | "venda_produto"> = {
  compra: "compra_produto",
  compra_produto: "compra_produto",
  comprei: "compra_produto",
  venda: "venda_produto",
  venda_produto: "venda_produto",
  vendi: "venda_produto",
};

/**
 * "Comprei 10 sacas de sal do Zé por 1200, para pagar dia 10" (§9).
 *
 * Mesmo envelope, mesma confirmação obrigatória e mesmas regras de parcela e
 * custo do negócio de gado. A diferença é só o que entra no estoque em vez do
 * rebanho, e é por isso que os leitores de dinheiro, data e parcela vêm de
 * `parsers.ts`, compartilhados: "60 mil" precisa significar a mesma coisa nas
 * duas conversas.
 */
export const registrarNegocioProduto: Handler = async (ctx) => {
  const { db, parameters: brutos, tenant_id, user_id, explicitNo, confirmed } = ctx;
  const memoria = await comMemoria("registrar_negocio_produto", {
    tenant_id,
    user_id,
    parameters: brutos,
    explicitNo,
    confirmed,
  });
  if (!memoria.ok) return memoria.resposta;
  const parameters = memoria.parameters;
  const guardar = (campo: CampoEstoque, texto: string) =>
    perguntar("registrar_negocio_produto", ctx, parameters, campo, texto, memoria.pendente);

  /**
   * `movement_type` entra na lista pelo mesmo motivo do handler de gado: é o
   * campo que o classificador usa para dizer compra ou venda, e é o que
   * `desempatarIntencao` leu para rotear até aqui. Sem ele, a informação que
   * decidiu o roteamento era jogada fora e o assistente perguntava "comprou ou
   * vendeu?" logo depois de "comprei 10 sacas de sal".
   */
  const tipoBruto = (
    str(parameters.tipo) ??
    str(parameters.type) ??
    str(parameters.movement_type) ??
    ""
  ).toLowerCase();
  const tipo = TIPOS[tipoBruto];
  if (!tipo) return guardar("tipo", "Você comprou ou vendeu esse produto?");
  const compra = tipo === "compra_produto";

  const produtoResolvido = await resolverProduto(
    db,
    str(parameters.produto) ?? str(parameters.product) ?? str(parameters.item),
  );
  if (!produtoResolvido.ok) return guardar("produto", produtoResolvido.resposta.reply_text);
  const produto = produtoResolvido.produto;
  parameters.produto = produto.name;

  const quantidade = lerQuantidade(
    parameters.quantidade ?? parameters.quantity ?? parameters.qtd,
    produto,
  );
  if (!quantidade.ok) return guardar("quantidade", quantidade.pergunta);

  // `preco` NAO entra: "comprei 10 sacas a 120 reais" e preco UNITARIO, e ler
  // como total gravaria R$ 120 no lugar de R$ 1.200, com a confirmacao
  // imprimindo justamente o numero que o produtor falou. Mesma lista do
  // negocio de gado, de proposito.
  const valor = lerDinheiro(parameters, "valor", "amount", "valor_total");
  if (valor == null || valor <= 0) {
    return guardar(
      "valor",
      `Por quanto você ${compra ? "comprou" : "vendeu"} ` +
        `${descreverQuantidade(quantidade.valor, produto.unit)} de ${produto.name}?`,
    );
  }

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) return guardar("fazenda", fazenda.resposta.reply_text);

  const dataNegocio = lerData(parameters, "data", "date", "occurred_at");
  if (dataNegocio.tipo === "invalida") {
    return guardar("data", `Não entendi a data "${dataNegocio.bruto}". Pode dizer 10/12 ou "hoje"?`);
  }
  const occurredAt = dataNegocio.tipo === "ok" ? dataNegocio.data : new Date();

  const vencimento = lerData(parameters, "vencimento", "due_date");
  if (vencimento.tipo === "invalida") {
    return guardar("vencimento", `Não entendi o vencimento "${vencimento.bruto}". Pode dizer 10/12?`);
  }

  const pago = interpretarSim(parameters.pago ?? parameters.paid);
  /**
   * Parcelas: número OU texto, e o que não se entende PERGUNTA.
   *
   * `extrairNumeroDeParcelas` só lê texto ("3x", "em tres vezes"), e o contrato
   * publicado em `docs/n8n-whatsapp-workflow.md` manda o classificador enviar
   * `parcelas` como NÚMERO. As duas pontas discordavam: "comprei sal por 3.000
   * em 3 vezes" virava uma conta ÚNICA de R$ 3.000 vencendo hoje, calada, com
   * o `bill_due` disparando no mesmo dia. O handler de gado lê os dois formatos
   * e recusa seguir quando não entende; esta cópia tinha perdido as duas
   * metades. Um revisor reproduziu a tabela inteira.
   */
  const parcelasBrutas = parameters.parcelas ?? parameters.installments ?? parameters.parcelamento;
  const quantasParcelas =
    parcelasBrutas == null || parcelasBrutas === ""
      ? null
      : (lerNumeroBr(parcelasBrutas) ?? extrairNumeroDeParcelas(parcelasBrutas));
  if (parcelasBrutas != null && parcelasBrutas !== "" && quantasParcelas == null) {
    return guardar("pagamento", "Não entendi o parcelamento. Em quantas vezes você vai pagar?");
  }
  const custos = custosDosParametros(parameters);
  const contato = str(parameters.contato) ?? str(parameters.contact_name) ?? null;

  // "Já paguei" e "vou parcelar em 3x" não podem valer ao mesmo tempo. A
  // action recusaria, mas a pergunta aqui é melhor que o erro depois da
  // confirmação: o produtor ainda está com a frase na cabeça.
  if (pago && quantasParcelas != null && quantasParcelas > 1) {
    // Campo PAGAMENTO, dedicado: guardando "valor", nenhuma resposta possivel
    // resolvia a contradicao e a conversa morria na trava de laco.
    return guardar("pagamento", "Você já pagou ou vai parcelar? Uma coisa ou outra.");
  }

  const parcelas =
    !pago && quantasParcelas != null && quantasParcelas > 1
      ? montarParcelas(
          valor,
          quantasParcelas,
          occurredAt,
          vencimento.tipo === "ok" ? vencimento.data : null,
        )
      : [];

  const totalCustos = custos.reduce((s, c) => s + c.valor, 0);
  const descricaoCustos =
    custos.length > 0
      ? `\nCustos: ${custos.map((c) => `${c.descricao} ${reais(c.valor)}`).join(", ")}`
      : "";
  const descricaoPagamento = pago
    ? "\nJá pago."
    : parcelas.length > 0
      ? `\nEm ${parcelas.length}x de ${reais(parcelas[0].amount)}, a primeira em ${parcelas[0].due_date.toLocaleDateString("pt-BR")}.`
      : vencimento.tipo === "ok"
        ? `\nA ${compra ? "pagar" : "receber"} em ${vencimento.data.toLocaleDateString("pt-BR")}.`
        : `\nA ${compra ? "pagar" : "receber"}, sem data informada (vou lançar para hoje).`;
  // Contato e data ENTRAM na confirmação: os dois são gravados (o nome vira um
  // `Contact` de verdade, "ontem" muda o mês do lançamento), e pedir "sim" sem
  // mostrar é pedir assinatura no que não foi lido.
  const descricaoContato = contato ? `\nCom: ${contato}.` : "";
  const descricaoData = `\nData: ${occurredAt.toLocaleDateString("pt-BR")}.`;

  if (!memoria.executar) {
    if (user_id) {
      // O pedido inteiro fica GUARDADO: o "sim" executa o que foi MOSTRADO,
      // nunca o que o classificador remontar da própria resposta do
      // assistente. Sem âncora, confirmação é assinatura em papel em branco.
      /**
       * A confirmação também conta tentativa.
       *
       * Sem o contador, "peraí, deixa eu ver" repetia a mesma confirmação para
       * sempre: o produtor não conseguia sair nem confirmando nem recusando, e
       * a única saída era um "ok" que executava.
       */
      const jaPerguntou =
        memoria.pendente?.aguardando === "confirmacao"
          ? (memoria.pendente.tentativas ?? 1) + 1
          : 1;
      if (jaPerguntou >= MAX_TENTATIVAS) {
        await clearPendingStock(tenant_id, user_id);
        return ask(
          "Vou deixar esse registro de lado por enquanto. Quando quiser, me conte de novo, " +
            `por exemplo: "${EXEMPLO_POR_GESTO["registrar_negocio_produto"]}".`,
        );
      }
      await savePendingStock(tenant_id, user_id, {
        intent: "registrar_negocio_produto",
        parameters: { ...parameters, tipo, fazenda: fazenda.nome },
        aguardando: "confirmacao",
        tentativas: jaPerguntou,
      });
    }
    return {
      reply_text:
        `Confirma?\n${compra ? "Compra" : "Venda"} de ` +
        `${descreverQuantidade(quantidade.valor, produto.unit)} de ${produto.name} ` +
        `por ${reais(valor)}${totalCustos > 0 ? ` mais ${reais(totalCustos)} de custos` : ""}, ` +
        `em ${fazenda.nome}.${descricaoContato}${descricaoData}${descricaoCustos}${descricaoPagamento}`,
      requires_confirmation: true,
      auxiliary_data: null,
      report_url: null,
      action_taken: "registrar_negocio_produto:aguardando_confirmacao",
    };
  }

  const resultado = await createProductNegotiation(db, {
    type: tipo,
    property_id: fazenda.id,
    itens: [{ product_id: produto.id, quantity: quantidade.valor }],
    amount: valor,
    contact_name: contato,
    occurred_at: occurredAt,
    pago,
    due_date: vencimento.tipo === "ok" ? vencimento.data : null,
    parcelas: parcelas.map((p) => ({ due_date: p.due_date, amount: p.amount })),
    custos: custos.map((c) => ({ descricao: c.descricao, amount: c.valor })),
    notes: str(parameters.observacao) ?? str(parameters.notes) ?? null,
    recorded_by_user_id: user_id ?? null,
  });
  if (resultado.ok && user_id) await clearPendingStock(tenant_id, user_id);
  if (!resultado.ok) return failReply("registrar_negocio_produto", resultado);

  const [posicao] = await getStockBalance(db, {
    product_id: produto.id,
    property_id: fazenda.id,
  });

  return {
    reply_text:
      `✅ Registrado: ${compra ? "compra" : "venda"} de ` +
      `${descreverQuantidade(quantidade.valor, produto.unit)} de ${produto.name} ` +
      `por ${reais(valor)}. Estoque agora: ${descreverQuantidade(posicao?.quantity ?? 0, produto.unit)}.`,
    requires_confirmation: false,
    auxiliary_data: { negotiation_id: resultado.data.id },
    report_url: null,
    action_taken: "registrar_negocio_produto:ok",
  };
};
