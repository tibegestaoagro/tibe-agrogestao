import { openEventConsignment, closeEventConsignment } from "@/lib/actions/event-consignments";
import { listStays } from "@/lib/actions/herd-stays";
import {
  savePendingEvent,
  loadPendingEvent,
  clearPendingEvent,
  aplicarRespostaRemessa,
} from "@/lib/actions/event-pending";
import { resolverCategoria, resolverFazenda, nomeDaCategoria } from "./herd";
import { ask, failReply, str, num, type Handler, type RouterResult } from "./shared";
import { lerDinheiro } from "./parsers";

/**
 * Leilão, feira e evento pelo WhatsApp (Módulo 31, missão 3, §19).
 *
 * O §19 pede três coisas por conversa: criar remessas, registrar vendas
 * parciais e registrar o retorno dos que não venderam. As duas últimas são o
 * mesmo gesto, o encerramento, porque o documento manda a soma dos destinos
 * bater com o enviado: informar só os vendidos deixaria os outros no limbo.
 *
 * O CLASSIFICADOR DO N8N NÃO FOI TOCADO (decisão do usuário: o agente fica
 * congelado até o sistema estar completo). Estas intenções existem, são
 * roteadas e são testadas, e ficam esperando o dia em que o classificador
 * aprender a emiti-las. Handler pronto e classificador parado é um estado
 * conhecido; o contrário seria uma intenção que chega e não tem quem atenda.
 *
 * AS TRÊS REGRAS QUE NÃO PODEM AFROUXAR, todas herdadas de defeitos reais:
 *
 * 1. **"não"/"cancela" cancela, e é a PRIMEIRA coisa checada.** Em 2026-08-18,
 *    no estoque, "não, deixa pra lá" gravou a compra recusada. A assimetria
 *    manda: deixar de cancelar escreve no livro; cancelar por engano custa uma
 *    frase repetida.
 * 2. **O "sim" executa o que foi MOSTRADO**, lido do pedido guardado em
 *    `event-pending.ts`, nunca o que o classificador remontou da própria
 *    resposta do assistente. Sem âncora, confirmação é assinatura em papel em
 *    branco.
 * 3. **Confirmação sempre**, nos dois gestos. Abrir uma remessa tira gado da
 *    fazenda; encerrar grava venda e dinheiro. Nenhum dos dois tem tamanho
 *    pequeno o bastante para dispensar a pergunta.
 */

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** A resposta comum aos dois gestos quando o produtor recusa. */
async function cancelar(
  intent: string,
  tenantId: string,
  userId: string | undefined,
): Promise<RouterResult> {
  if (userId) await clearPendingEvent(tenantId, userId);
  return {
    reply_text: "Tudo bem, não registrei nada.",
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:cancelado`,
  };
}

export const registrarRemessaEvento: Handler = async ({
  db,
  tenant_id,
  user_id,
  parameters: parametrosDaMensagem,
  confirmed,
  explicitNo,
}) => {
  const intent = "registrar_remessa_evento";

  // Regra 1: a recusa vem primeiro, antes de qualquer pergunta.
  if (explicitNo) return cancelar(intent, tenant_id, user_id);

  const temMemoria = !!user_id;
  const pendente = temMemoria ? await loadPendingEvent(tenant_id, user_id!) : null;
  let parameters = parametrosDaMensagem;

  // Regra 2: o "sim" só vale para o que foi mostrado.
  if (confirmed) {
    if (!temMemoria) {
      return ask(
        "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
          "Me conte de novo qual gado você mandou para o evento.",
      );
    }
    if (pendente?.gesto === "abrir" && pendente.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else {
      return ask(
        "Não tenho nenhuma remessa esperando confirmação. Me conte de novo o que você mandou para o evento.",
      );
    }
  } else if (pendente?.gesto === "abrir" && pendente.aguardando !== "confirmacao") {
    // O produtor está respondendo a pergunta: da mensagem nova entra SÓ o
    // campo perguntado, por cima do que já estava guardado.
    const juntos = aplicarRespostaRemessa(pendente, parametrosDaMensagem);
    if (juntos) parameters = juntos;
  }

  const guardar = async (aguardando: Parameters<typeof savePendingEvent>[2]["aguardando"]) => {
    if (temMemoria) {
      await savePendingEvent(tenant_id, user_id!, { parameters, aguardando, gesto: "abrir" });
    }
  };

  const evento = str(parameters.evento) ?? str(parameters.event_name) ?? str(parameters.local);
  if (!evento) {
    await guardar("evento");
    return ask("Para qual leilão ou evento você mandou o gado?");
  }

  const termo = str(parameters.categoria) ?? str(parameters.category) ?? str(parameters.item);
  if (!termo) {
    await guardar("categoria");
    return ask("Qual categoria de animal você mandou?");
  }
  const categoria = resolverCategoria(termo);
  if (!categoria.ok) {
    await guardar("categoria");
    return categoria.resposta;
  }

  const quantidade = num(parameters.quantidade) ?? num(parameters.quantity);
  if (!quantidade || !Number.isInteger(quantidade) || quantidade <= 0) {
    await guardar("quantidade");
    return ask(`Quantos ${nomeDaCategoria(categoria.categoria, 2)} você mandou?`);
  }

  const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
  if (!fazenda.ok) {
    await guardar("fazenda");
    return fazenda.resposta;
  }

  // Regra 3: confirmação sempre, com a frase que diz o que NÃO vai acontecer.
  if (!confirmed) {
    await guardar("confirmacao");
    return {
      reply_text:
        `Mandar ${quantidade} ${nomeDaCategoria(categoria.categoria, quantidade)} para ` +
        `${evento}? Eles continuam no seu rebanho e nenhuma venda é registrada agora. Confirma?`,
      requires_confirmation: true,
      auxiliary_data: { evento, quantidade, categoria: categoria.categoria.id },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const resultado = await openEventConsignment(db, {
    property_id: fazenda.id,
    category_id: categoria.categoria.id,
    quantity: quantidade,
    event_name: evento,
    event_type: str(parameters.tipo_evento) ?? str(parameters.event_type),
    city: str(parameters.municipio) ?? str(parameters.city),
    organizer_name: str(parameters.organizador) ?? str(parameters.leiloeira),
    notes: str(parameters.observacao) ?? str(parameters.notes),
  });
  if (temMemoria) await clearPendingEvent(tenant_id, user_id!);
  if (!resultado.ok) return failReply(intent, resultado);

  return {
    reply_text:
      `Anotado: ${quantidade} ${nomeDaCategoria(categoria.categoria, quantidade)} em ${evento}. ` +
      `Eles continuam no seu rebanho e não registrei venda nenhuma. ` +
      `Quando o evento terminar, me diga quantos venderam e quantos voltaram.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:ok:${resultado.data.id}`,
  };
};

export const encerrarRemessaEvento: Handler = async ({
  db,
  tenant_id,
  user_id,
  parameters: parametrosDaMensagem,
  confirmed,
  explicitNo,
}) => {
  const intent = "encerrar_remessa_evento";

  if (explicitNo) return cancelar(intent, tenant_id, user_id);

  const temMemoria = !!user_id;
  const pendente = temMemoria ? await loadPendingEvent(tenant_id, user_id!) : null;
  let parameters = parametrosDaMensagem;

  if (confirmed) {
    if (!temMemoria) {
      return ask(
        "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
          "Me conte de novo como terminou o evento.",
      );
    }
    if (pendente?.gesto === "encerrar" && pendente.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else {
      return ask(
        "Não tenho nenhum encerramento esperando confirmação. Me conte de novo como terminou o evento.",
      );
    }
  } else if (pendente?.gesto === "encerrar" && pendente.aguardando !== "confirmacao") {
    const juntos = aplicarRespostaRemessa(pendente, parametrosDaMensagem);
    if (juntos) parameters = juntos;
  }

  // As remessas abertas saem do saldo, nunca de um campo: uma remessa está
  // aberta enquanto ainda houver cabeça nela.
  const estadias = await listStays(db, { type: "evento", apenas_abertas: true });
  if (!estadias.ok) return failReply(intent, estadias);
  if (estadias.data.length === 0) {
    return ask("Você não tem nenhuma remessa aberta em leilão ou evento agora.");
  }

  const evento = str(parameters.evento) ?? str(parameters.event_name) ?? str(parameters.local);
  const candidatas = evento
    ? estadias.data.filter((e) =>
        (e.location_name ?? "").toLowerCase().includes(evento.toLowerCase()),
      )
    : estadias.data;

  if (candidatas.length === 0) {
    const nomes = estadias.data.map((e) => `- ${e.location_name ?? "sem nome"}`).join("\n");
    return ask(`Não achei remessa aberta em "${evento}". As que estão abertas:\n${nomes}`);
  }
  if (candidatas.length > 1) {
    // Escolher sozinho aqui erraria duas remessas de uma vez: a que fecha
    // errado e a que fica aberta com gado que já voltou.
    const nomes = candidatas.map((e) => `- ${e.location_name ?? "sem nome"}`).join("\n");
    if (temMemoria) {
      await savePendingEvent(tenant_id, user_id!, { parameters, aguardando: "evento", gesto: "encerrar" });
    }
    return ask(`Você tem mais de uma remessa aberta. Qual delas terminou?\n${nomes}`);
  }

  const remessa = candidatas[0];
  const negociacao = await db.herdStay.findFirst({
    where: { id: remessa.id },
    select: { negotiation_id: true },
  });
  if (!negociacao?.negotiation_id) {
    return ask(
      "Essa remessa foi registrada pelo painel antigo e não tem um negócio ligado. " +
        "Encerre por lá, em Rebanho.",
    );
  }
  const negotiationId = negociacao.negotiation_id;

  const guardar = async (aguardando: Parameters<typeof savePendingEvent>[2]["aguardando"]) => {
    if (temMemoria) {
      await savePendingEvent(tenant_id, user_id!, {
        parameters,
        aguardando,
        gesto: "encerrar",
        negotiation_id: negotiationId,
      });
    }
  };

  const vendidos = num(parameters.vendidos) ?? 0;
  const informouVendidos = parameters.vendidos != null;
  if (!informouVendidos) {
    await guardar("vendidos");
    return ask(`Quantos animais foram vendidos em ${remessa.location_name ?? "o evento"}?`);
  }

  // O que não foi vendido voltou, a menos que o produtor diga outra coisa. É a
  // leitura do documento: os destinos possíveis são vendido, retornado e
  // "outro destino", e o último exige um lugar, que a conversa não tem como
  // adivinhar. Quando a soma não fechar, quem recusa é a action.
  const retornados = num(parameters.retornados) ?? remessa.saldo_aberto - vendidos;
  const valor = lerDinheiro(parameters, "valor", "amount", "preco");

  if (vendidos > 0 && valor == null) {
    await guardar("valor");
    return ask(`Por quanto os ${vendidos} foram vendidos no total?`);
  }

  if (!confirmed) {
    await guardar("confirmacao");
    const partes = [`${vendidos} vendido(s)`, `${retornados} de volta`];
    return {
      reply_text:
        `Encerrar a remessa de ${remessa.location_name ?? "evento"}: ${partes.join(" e ")}` +
        (valor != null ? `, por ${reais(valor)}` : "") +
        `. Confirma?`,
      requires_confirmation: true,
      auxiliary_data: { vendidos, retornados, valor },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const resultado = await closeEventConsignment(db, negotiationId, {
    vendidos,
    retornados,
    amount: valor,
    pago: true,
  });
  if (temMemoria) await clearPendingEvent(tenant_id, user_id!);
  if (!resultado.ok) return failReply(intent, resultado);

  return {
    reply_text:
      `Pronto. ${vendidos} vendido(s)` +
      (valor != null ? ` por ${reais(valor)}` : "") +
      ` e ${retornados} de volta na fazenda.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:ok:${resultado.data.id}`,
  };
};
