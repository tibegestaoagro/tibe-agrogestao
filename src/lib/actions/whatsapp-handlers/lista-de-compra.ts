import { decToNum } from "@/lib/serialize";
import { descreverQuantidade, isStockUnit } from "@/lib/stock/units";
import {
  criarItemAction,
  listarItensAction,
  concluirItemAction,
  removerItemAction,
  registrarCompraDoItemAction,
  pendentesParecidos,
} from "@/lib/actions/shopping-items";
import { lerDinheiro } from "./parsers";
import { ask, failReply, str, num, confirmFlow, normalizarTermo, type Handler } from "./shared";

/**
 * Minha Lista de Compra pelo WhatsApp (Módulo 36, §17).
 *
 * O §17 chama o WhatsApp de "principal forma de alimentar essa área", e faz
 * sentido: a lista nasce no curral, não na mesa.
 *
 * ⚠️ **O classificador do n8n ainda NÃO emite estas intenções**, como acontece
 * com `registrar_remessa_evento` e `registrar_permuta` desde o Módulo 31. Elas
 * ficam roteadas e testadas, esperando a rodada em que o agente for atualizado.
 * Decisão do usuário em 11/09: construir agora, descongelar depois.
 */

type ItemBruto = {
  descricao: string;
  quantidade?: number | null;
  unidade?: string | null;
  urgente?: boolean;
};

/**
 * §17: "Coloca na lista 2 rolos de arame, 5 litros de óleo e uma correia"
 * precisa virar TRÊS itens.
 *
 * O classificador pode mandar isso de duas formas, e as duas são aceitas: uma
 * lista em `itens`, ou os campos soltos de um item só. Exigir a primeira
 * jogaria fora a frase simples, que é a maioria.
 */
function lerItens(parameters: Record<string, unknown>): ItemBruto[] {
  const lista = parameters.itens ?? parameters.items ?? parameters.produtos;
  if (Array.isArray(lista)) {
    return lista
      .map((bruto): ItemBruto | null => {
        if (typeof bruto === "string") {
          const texto = bruto.trim();
          return texto ? { descricao: texto } : null;
        }
        if (bruto && typeof bruto === "object") {
          const obj = bruto as Record<string, unknown>;
          const descricao =
            str(obj.descricao) ?? str(obj.description) ?? str(obj.produto) ?? str(obj.item);
          if (!descricao) return null;
          return {
            descricao,
            quantidade: num(obj.quantidade) ?? num(obj.quantity),
            unidade: str(obj.unidade) ?? str(obj.unit),
          };
        }
        return null;
      })
      .filter((i): i is ItemBruto => i !== null);
  }

  const descricao =
    str(parameters.descricao) ??
    str(parameters.description) ??
    str(parameters.produto) ??
    str(parameters.item);
  if (!descricao) return [];
  return [
    {
      descricao,
      quantidade: num(parameters.quantidade) ?? num(parameters.quantity),
      unidade: str(parameters.unidade) ?? str(parameters.unit),
      urgente: parameters.urgente === true || str(parameters.prioridade) === "urgente",
    },
  ];
}

/** "10 sacas de sal mineral", ou só "arame" quando não há quantidade. */
function descreverItem(item: {
  description: string;
  quantity: unknown;
  unit: string | null;
}): string {
  const quantidade = decToNum(item.quantity);
  if (quantidade == null) return item.description;
  if (!item.unit) return `${quantidade} ${item.description}`;
  return `${descreverQuantidade(quantidade, item.unit)} de ${item.description}`;
}

/**
 * Acha o item pendente que a frase cita.
 *
 * ⚠️ **Ambiguidade PERGUNTA, nunca escolhe o primeiro.** Mesma regra de
 * `resolverPasto` e `resolverTrabalhador`: dado errado gravado em silêncio é a
 * pior classe de defeito deste produto.
 */
async function acharItem(
  db: Parameters<typeof listarItensAction>[0],
  termo: string,
): Promise<
  | { ok: true; item: Awaited<ReturnType<typeof listarItensAction>>[number] }
  | { ok: false; resposta: ReturnType<typeof ask> }
> {
  const pendentes = await listarItensAction(db);
  if (pendentes.length === 0) {
    return { ok: false, resposta: ask("Sua Lista de Compra está vazia.") };
  }

  const alvo = normalizarTermo(termo);
  const achados = pendentes.filter((i) => normalizarTermo(i.description).includes(alvo));

  if (achados.length === 0) {
    const nomes = pendentes.map((i) => `- ${descreverItem(i)}`).join("\n");
    return {
      ok: false,
      resposta: ask(`Não achei "${termo}" na sua lista. O que tem nela:\n${nomes}`),
    };
  }
  if (achados.length > 1) {
    const exato = achados.find((i) => normalizarTermo(i.description) === alvo);
    if (exato) return { ok: true, item: exato };
    const nomes = achados.map((i) => `- ${descreverItem(i)}`).join("\n");
    return { ok: false, resposta: ask(`Tenho mais de um parecido. Qual deles?\n${nomes}`) };
  }
  return { ok: true, item: achados[0] };
}

/**
 * §17: "Coloca 10 sacas de sal na minha lista", e também "preciso comprar
 * arame", sem quantidade nenhuma.
 */
export const adicionarItemLista: Handler = async ({ db, user_id, parameters, confirmed, explicitNo }) => {
  const itens = lerItens(parameters);
  if (itens.length === 0) {
    return ask("O que você quer colocar na lista?");
  }

  /*
   * §19.7: item parecido já pendente PERGUNTA antes de duplicar. O "sim" chega
   * na volta como confirmação, e aí anota mesmo assim.
   *
   * Só vale para o item único: numa frase com três itens, perguntar por cada
   * um viraria interrogatório, e o produtor acabou de dizer o que quer.
   */
  if (itens.length === 1) {
    const parecidos = await pendentesParecidos(db, { description: itens[0].descricao });
    if (parecidos.length > 0) {
      if (explicitNo) {
        return {
          reply_text: "Tudo bem, não anotei de novo.",
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "adicionar_item_lista:cancelado",
        };
      }
      if (!confirmed) {
        const lista = parecidos.map(descreverItem).join(", ");
        return ask(`Você já tem ${lista} na sua lista. Quer anotar mais assim mesmo?`, {
          descricao: itens[0].descricao,
        });
      }
    }
  }

  const anotados: string[] = [];
  for (const bruto of itens) {
    const resultado = await criarItemAction(
      db,
      {
        description: bruto.descricao,
        quantity: bruto.quantidade ?? null,
        unit: bruto.unidade && isStockUnit(bruto.unidade) ? bruto.unidade : null,
        priority: bruto.urgente ? "urgente" : "normal",
      },
      { created_by_user_id: user_id ?? null, permitirDuplicata: true },
    );
    if (!resultado.ok) return failReply("adicionar_item_lista", resultado);
    anotados.push(
      descreverItem({
        description: bruto.descricao,
        quantity: bruto.quantidade ?? null,
        unit: bruto.unidade ?? null,
      }),
    );
  }

  const texto =
    anotados.length === 1
      ? `Anotei ${anotados[0]} na sua Lista de Compra.`
      : `Anotei na sua Lista de Compra:\n${anotados.map((a) => `- ${a}`).join("\n")}`;

  return {
    reply_text: texto,
    requires_confirmation: false,
    auxiliary_data: { anotados },
    report_url: null,
    action_taken: "adicionar_item_lista",
  };
};

/** §15 e §17: "O que tenho para comprar?" */
export const consultarListaCompra: Handler = async ({ db }) => {
  const itens = await listarItensAction(db);
  if (itens.length === 0) {
    return {
      reply_text: "Sua Lista de Compra está vazia.",
      requires_confirmation: false,
      auxiliary_data: { total: 0 },
      report_url: null,
      action_taken: "consultar_lista_compra",
    };
  }

  // Urgentes primeiro, que é a ordem em que `listarItensAction` já devolve.
  const linhas = itens.map((i) => {
    const marca = i.priority === "urgente" ? "🔴 " : "- ";
    const onde = i.place ? ` (${i.place})` : "";
    return `${marca}${descreverItem(i)}${onde}`;
  });

  return {
    reply_text: `Sua lista tem ${itens.length} ${itens.length === 1 ? "item" : "itens"}:\n${linhas.join("\n")}`,
    requires_confirmation: false,
    auxiliary_data: { total: itens.length },
    report_url: null,
    action_taken: "consultar_lista_compra",
  };
};

/** §17: "Tira o arame da lista." */
export const removerItemLista: Handler = async ({ db, parameters, confirmed, explicitNo }) => {
  const termo = str(parameters.descricao) ?? str(parameters.description) ?? str(parameters.item);
  if (!termo) return ask("O que você quer tirar da lista?");

  const achado = await acharItem(db, termo);
  if (!achado.ok) return achado.resposta;

  const gate = confirmFlow({
    intent: "remover_item_lista",
    explicitNo,
    confirmed,
    cancelledText: "Tudo bem, continua na lista.",
    question: `Quer tirar ${descreverItem(achado.item)} da sua Lista de Compra?`,
    auxiliary: { item_id: achado.item.id },
  });
  if (gate) return gate;

  const resultado = await removerItemAction(db, achado.item.id);
  if (!resultado.ok) return failReply("remover_item_lista", resultado);

  return {
    reply_text: `Tirei ${descreverItem(achado.item)} da sua lista.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `remover_item_lista:${achado.item.id}`,
  };
};

/**
 * §17: "Comprei o sal."
 *
 * Duas saídas, e é o §11 quem as separa:
 *
 * 1. **Sem valor na frase**, risca da lista e não gera nada. É a opção 1 do
 *    §11, e o caso comum de quem só quer o papel em dia.
 * 2. **Com valor**, registra a compra de verdade: despesa, conta a pagar e
 *    entrada no estoque, por Negociações.
 *
 * ⚠️ **Pelo WhatsApp, registrar exige que o item já tenha produto e fazenda.**
 * Sem isso a compra precisaria de um interrogatório de quatro perguntas (qual
 * produto do catálogo, qual unidade, qual categoria, qual fazenda), e errar
 * qualquer uma cria produto duplicado no estoque. Nesse caso o agente risca da
 * lista e diz onde terminar. A fronteira é a mesma da T06, e vale nos dois
 * canais.
 */
export const compreiItemLista: Handler = async ({ db, user_id, parameters }) => {
  const termo = str(parameters.descricao) ?? str(parameters.description) ?? str(parameters.item);
  if (!termo) return ask("O que você comprou?");

  const achado = await acharItem(db, termo);
  if (!achado.ok) return achado.resposta;
  const item = achado.item;

  const valor = lerDinheiro(parameters, "valor", "amount", "valor_total");

  if (valor == null) {
    const resultado = await concluirItemAction(db, item.id);
    if (!resultado.ok) return failReply("comprei_item_lista", resultado);
    return {
      reply_text:
        `Riscei ${descreverItem(item)} da sua lista. ` +
        "Se quiser registrar a compra no financeiro, me diga quanto pagou.",
      requires_confirmation: false,
      auxiliary_data: { item_id: item.id, registrou_compra: false },
      report_url: null,
      action_taken: `comprei_item_lista:${item.id}`,
    };
  }

  if (!item.product_id || !item.property_id) {
    const resultado = await concluirItemAction(db, item.id);
    if (!resultado.ok) return failReply("comprei_item_lista", resultado);
    return {
      reply_text:
        `Riscei ${descreverItem(item)} da sua lista. ` +
        "Para lançar a compra no estoque eu preciso saber qual produto do seu catálogo é esse, " +
        "e isso é mais rápido no painel, em Lista de Compra.",
      requires_confirmation: false,
      auxiliary_data: { item_id: item.id, registrou_compra: false },
      report_url: null,
      action_taken: `comprei_item_lista:${item.id}`,
    };
  }

  // Sem sinal contrário, compra dita no WhatsApp é à vista: é como o produtor
  // fala ("comprei o sal por 1800"). Quem comprou a prazo diz, e o
  // classificador manda `pago: false` ou `pagamento: "prazo"`.
  const pago = parameters.pago !== false && str(parameters.pagamento) !== "prazo";
  const compra = await registrarCompraDoItemAction(db, item.id, {
    amount: valor,
    pago,
    recorded_by_user_id: user_id ?? null,
  });
  if (!compra.ok) return failReply("comprei_item_lista", compra);

  return {
    reply_text:
      `Registrei a compra de ${descreverItem(item)} por R$ ${valor.toFixed(2)}` +
      `${pago ? "" : ", como conta a pagar"}, e risquei da sua lista.`,
    requires_confirmation: false,
    auxiliary_data: { item_id: item.id, negotiation_id: compra.data.negotiation_id },
    report_url: null,
    action_taken: `comprei_item_lista:${item.id}`,
  };
};
