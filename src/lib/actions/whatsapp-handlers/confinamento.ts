import type { ConfinementSiteType } from "@/generated/prisma/client";
import type { TenantPrismaClient } from "@/lib/prisma";
import {
  openConfinementStay,
  recordConfinementFeeding,
  listConfinementLots,
  listConfinementSites,
  type ConfinementSiteRecord,
} from "@/lib/actions/confinement";
import { closeStay } from "@/lib/actions/herd-stays";
import { getStockBalance } from "@/lib/actions/stock-ledger";
import { descreverQuantidade, findUnit, quantosOuQuantas, concordar, recusaPorFracao } from "@/lib/stock/units";
import {
  savePendingConfinement,
  loadPendingConfinement,
  clearPendingConfinement,
  aplicarRespostaConfinamento,
  type CampoConfinamento,
  type GestoConfinamento,
} from "@/lib/actions/confinamento-pending";
import { resolverCategoria, resolverFazenda, resolverPasto, nomeDaCategoria, descreverData } from "./herd";
import { resolverProduto } from "./estoque";
import { ask, failReply, str, type Handler, type RouterResult } from "./shared";
import { lerData, lerDinheiro, lerNumeroBr, interpretarSim } from "./parsers";

/**
 * Confinamento pelo WhatsApp (Módulo 30, fase 3, §26 do documento do
 * cliente). Quatro conversas: entrada em confinamento, envio a boitel,
 * alimentação e saída. As quatro reusam `openConfinementStay`,
 * `recordConfinementFeeding`, `listConfinementLots` e `closeStay`
 * (`src/lib/actions/confinement.ts` e `herd-stays.ts`, do time de
 * servidor-acao): nada aqui reimplementa o livro-razão do rebanho ou do
 * estoque, a quantidade continua sendo a soma das movimentações (invariante
 * 2), e a cobrança do lote continua sendo o que o produtor digitou, nunca
 * calculada (decisão 3 da spec de 31/08).
 *
 * O CLASSIFICADOR DO N8N NÃO FOI TOCADO (decisão do usuário: o agente fica
 * congelado até o sistema estar revisado). As quatro intenções existem, são
 * roteadas e são testadas, e ficam esperando o dia em que o classificador
 * aprender a emiti-las. Mesmo estado de `evento.ts` e `permuta.ts`.
 *
 * AS TRÊS REGRAS QUE NÃO PODEM AFROUXAR, todas herdadas de defeitos reais:
 *
 * 1. **"não"/"cancela" cancela, e é a PRIMEIRA coisa checada.** Em 2026-08-18,
 *    no estoque, "não, deixa pra lá" gravou a compra recusada.
 * 2. **O "sim" executa o que foi MOSTRADO**, lido do pedido guardado em
 *    `confinamento-pending.ts`, nunca o que o classificador remontou da
 *    própria resposta do assistente.
 * 3. **Confirmação sempre**, nas quatro conversas: as três primeiras tiram
 *    gado de um lugar ou gastam estoque; a quarta grava venda ou morte.
 *    Nenhuma tem tamanho pequeno o bastante para dispensar a pergunta, e o
 *    §26 do documento pede "Deseja registrar" nas quatro.
 */

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function cancelar(
  intent: string,
  tenantId: string,
  userId: string | undefined,
): Promise<RouterResult> {
  if (userId) await clearPendingConfinement(tenantId, userId);
  return {
    reply_text: "Tudo bem, não registrei nada.",
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:cancelado`,
  };
}

function normalizar(termo: string): string {
  // Filtro por código numérico, não regex de caractere combinante: o próprio
  // caractere é invisível no editor e some numa cópia distraída (é a
  // armadilha que este projeto já pagou para aprender). Os combinantes
  // Unicode do bloco NFD vão de 0x0300 a 0x036f.
  const semAcento = Array.from(termo.toLowerCase().normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
  return semAcento.replace(/\s+/g, " ").trim();
}

/**
 * Acha o `ConfinementSite` cadastrado, sem inventar (§5). Sem nome informado:
 * usa o único do tipo pedido quando só existe um, e PERGUNTA quando existe
 * mais de um. Nunca cadastra um novo pela conversa: o §5 exige fazenda (para
 * confinamento próprio) ou nome de empresa/proprietário (para boitel), e uma
 * frase do WhatsApp não é lugar seguro para decidir isso sozinho.
 */
async function resolverConfinamento(
  db: TenantPrismaClient,
  type: ConfinementSiteType,
  nome: string | null,
): Promise<{ ok: true; site: ConfinementSiteRecord } | { ok: false; resposta: RouterResult }> {
  const sites = await listConfinementSites(db, { type });
  const rotulo = type === "boitel" ? "Boitel" : "confinamento";

  if (sites.length === 0) {
    return {
      ok: false,
      resposta: ask(
        `Você ainda não tem ${rotulo} cadastrado. Cadastre no painel, em Confinamento, e depois me chame.`,
      ),
    };
  }

  if (nome) {
    const alvo = normalizar(nome);
    const encontrados = sites.filter(
      (s) => normalizar(s.name).includes(alvo) || alvo.includes(normalizar(s.name)),
    );
    if (encontrados.length === 1) return { ok: true, site: encontrados[0] };
    if (encontrados.length > 1) {
      return {
        ok: false,
        resposta: ask(
          `Tenho mais de um parecido com "${nome}". Qual deles?\n${encontrados.map((s) => `- ${s.name}`).join("\n")}`,
        ),
      };
    }
    return {
      ok: false,
      resposta: ask(
        `Não achei "${nome}". Você tem:\n${sites.map((s) => `- ${s.name}`).join("\n")}`,
      ),
    };
  }

  if (sites.length === 1) return { ok: true, site: sites[0] };

  return {
    ok: false,
    resposta: ask(`Em qual ${rotulo}?\n${sites.map((s) => `- ${s.name}`).join("\n")}`),
  };
}

// ── §6, §7: entrada em confinamento e envio a boitel ────────────────────

/**
 * Fábrica dos dois gestos de ENTRADA: confinamento próprio e envio a boitel
 * são o mesmo movimento (`openConfinementStay`), diferindo só no tipo de
 * `ConfinementSite`. Duplicar o handler inteiro para trocar uma palavra seria
 * o mesmo erro que este projeto já cobrou de `commitAnimals`.
 */
function fabricarEntrada(siteType: ConfinementSiteType, intent: string, gesto: GestoConfinamento): Handler {
  return async ({ db, tenant_id, user_id, parameters: parametrosDaMensagem, confirmed, explicitNo }) => {
    // Regra 1: a recusa vem primeiro, antes de qualquer pergunta.
    if (explicitNo) return cancelar(intent, tenant_id, user_id);

    const temMemoria = !!user_id;
    const pendente = temMemoria ? await loadPendingConfinement(tenant_id, user_id!) : null;
    let parameters = parametrosDaMensagem;

    // Regra 2: o "sim" só vale para o que foi mostrado.
    if (confirmed) {
      if (!temMemoria) {
        return ask(
          "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
            "Me conte de novo o que você colocou no confinamento.",
        );
      }
      if (pendente?.gesto === gesto && pendente.aguardando === "confirmacao") {
        parameters = pendente.parameters;
      } else {
        return ask(
          "Não tenho nenhuma entrada esperando confirmação. Me conte de novo o que você colocou no confinamento.",
        );
      }
    } else if (pendente?.gesto === gesto && pendente.aguardando !== "confirmacao") {
      const juntos = aplicarRespostaConfinamento(pendente, parametrosDaMensagem);
      if (juntos) parameters = juntos;
    }

    const guardar = async (aguardando: CampoConfinamento) => {
      if (temMemoria) {
        await savePendingConfinement(tenant_id, user_id!, { parameters, aguardando, gesto });
      }
    };

    const termo = str(parameters.categoria) ?? str(parameters.category);
    if (!termo) {
      await guardar("categoria");
      return ask("Esses animais pertencem a qual categoria?");
    }
    const categoria = resolverCategoria(termo);
    if (!categoria.ok) {
      await guardar("categoria");
      return categoria.resposta;
    }

    const verbo = siteType === "boitel" ? "mandou" : "colocou no confinamento";
    const quantidade = lerNumeroBr(parameters.quantidade) ?? lerNumeroBr(parameters.quantity);
    if (quantidade == null || !Number.isInteger(quantidade) || quantidade <= 0) {
      await guardar("quantidade");
      return ask(`Quantos ${nomeDaCategoria(categoria.categoria, 2)} você ${verbo}?`);
    }

    const fazenda = await resolverFazenda(db, str(parameters.fazenda) ?? str(parameters.property));
    if (!fazenda.ok) {
      await guardar("fazenda");
      return fazenda.resposta;
    }

    const nomeDoLocal = str(parameters.confinamento) ?? str(parameters.local) ?? str(parameters.site);
    const local = await resolverConfinamento(db, siteType, nomeDoLocal);
    if (!local.ok) {
      await guardar("confinamento");
      return local.resposta;
    }

    const pastoOrigem = await resolverPasto(db, fazenda.id, str(parameters.pasto) ?? str(parameters.pasture));
    if (!pastoOrigem.ok) {
      await guardar("pasto");
      return pastoOrigem.resposta;
    }

    const dataLida = lerData(parameters, "data", "date", "occurred_at");
    if (dataLida.tipo === "invalida") {
      await guardar("data");
      return ask(`Não entendi a data "${dataLida.bruto}". Diga por exemplo 'hoje' ou '05/08/2026'.`);
    }
    const quando = dataLida.tipo === "ok" ? dataLida.data : new Date();

    const pergunta =
      siteType === "boitel"
        ? `Deseja registrar o envio de ${quantidade} animais para o Boitel ${local.site.name}?`
        : `Deseja registrar a entrada de ${quantidade} ${nomeDaCategoria(categoria.categoria, quantidade)} ` +
          `no confinamento ${descreverData(quando)}?`;

    if (!confirmed) {
      await guardar("confirmacao");
      return {
        reply_text: pergunta,
        requires_confirmation: true,
        auxiliary_data: { quantidade, categoria: categoria.categoria.id, confinement_site_id: local.site.id },
        report_url: null,
        action_taken: `${intent}:aguardando_confirmacao`,
      };
    }

    const resultado = await openConfinementStay(db, {
      confinement_site_id: local.site.id,
      category_id: categoria.categoria.id,
      quantity: quantidade,
      property_id: fazenda.id,
      pasture_id: pastoOrigem.id,
      started_at: quando,
      recorded_by_user_id: user_id ?? null,
    });
    if (temMemoria) await clearPendingConfinement(tenant_id, user_id!);
    if (!resultado.ok) return failReply(intent, resultado);

    const respostaFinal =
      siteType === "boitel"
        ? `✅ Anotado: ${quantidade} ${nomeDaCategoria(categoria.categoria, quantidade)} enviados para ` +
          `o Boitel ${local.site.name}. Eles continuam no seu rebanho.`
        : `✅ Registrado: entrada de ${quantidade} ${nomeDaCategoria(categoria.categoria, quantidade)} ` +
          `no confinamento ${local.site.name}.`;

    return {
      reply_text: respostaFinal,
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: `${intent}:ok:${resultado.data.id}`,
    };
  };
}

export const registrarEntradaConfinamento = fabricarEntrada(
  "proprio",
  "registrar_entrada_confinamento",
  "entrada_confinamento",
);
export const registrarEnvioBoitel = fabricarEntrada("boitel", "registrar_envio_boitel", "entrada_boitel");

// ── §10, §11, §12: alimentação ───────────────────────────────────────────

/**
 * "Usei 5 sacas de ração no confinamento" (§10, §11).
 *
 * DIFERENTE do uso geral de estoque (`registrarUsoEstoque`, que não confirma
 * por ser o gesto mais frequente do módulo): aqui o §26 do documento mostra o
 * assistente perguntando "Deseja registrar", então esta conversa confirma
 * sempre, como as outras três do confinamento.
 *
 * Sem produto no catálogo, RECUSA (`PRODUCT_REQUIRED`, decisão de 31/08 em
 * `recordConfinementFeeding`): `resolverProduto` já impede um `product_id`
 * nulo de chegar até lá, então a recusa nunca precisa se manifestar por este
 * caminho, mas a action continua sendo a última linha de defesa.
 */
export const registrarAlimentacaoConfinamento: Handler = async ({
  db,
  tenant_id,
  user_id,
  parameters: parametrosDaMensagem,
  confirmed,
  explicitNo,
}) => {
  const intent = "registrar_alimentacao_confinamento";
  const gesto: GestoConfinamento = "alimentacao";

  if (explicitNo) return cancelar(intent, tenant_id, user_id);

  const temMemoria = !!user_id;
  const pendente = temMemoria ? await loadPendingConfinement(tenant_id, user_id!) : null;
  let parameters = parametrosDaMensagem;

  if (confirmed) {
    if (!temMemoria) {
      return ask(
        "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
          "Me conte de novo o que você usou no confinamento.",
      );
    }
    if (pendente?.gesto === gesto && pendente.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else {
      return ask(
        "Não tenho nenhuma alimentação esperando confirmação. Me conte de novo o que você usou no confinamento.",
      );
    }
  } else if (pendente?.gesto === gesto && pendente.aguardando !== "confirmacao") {
    const juntos = aplicarRespostaConfinamento(pendente, parametrosDaMensagem);
    if (juntos) parameters = juntos;
  }

  const guardar = async (aguardando: CampoConfinamento) => {
    if (temMemoria) await savePendingConfinement(tenant_id, user_id!, { parameters, aguardando, gesto });
  };

  const produtoResolvido = await resolverProduto(
    db,
    str(parameters.produto) ?? str(parameters.product) ?? str(parameters.item),
  );
  if (!produtoResolvido.ok) {
    await guardar("produto");
    return produtoResolvido.resposta;
  }
  const produto = produtoResolvido.produto;
  parameters.produto = produto.name;

  const quantidade = lerNumeroBr(parameters.quantidade ?? parameters.quantity ?? parameters.qtd);
  if (quantidade == null || quantidade <= 0) {
    await guardar("quantidade");
    return ask(`${quantosOuQuantas(produto.unit)} ${findUnit(produto.unit)?.plural ?? "unidades"} de ${produto.name}?`);
  }
  const recusa = recusaPorFracao(produto.name, quantidade, produto.unit);
  if (recusa) {
    await guardar("quantidade");
    return ask(`${recusa} ${quantosOuQuantas(produto.unit)} exatamente?`);
  }

  const lotes = await listConfinementLots(db, { type: "confinamento", apenas_abertas: true });
  if (lotes.length === 0) {
    return ask("Você não tem lote em confinamento aberto agora.");
  }
  const nomeDoLote = str(parameters.confinamento) ?? str(parameters.local);
  const candidatos = nomeDoLote
    ? lotes.filter((l) => normalizar(l.location_name ?? "").includes(normalizar(nomeDoLote)))
    : lotes;

  if (candidatos.length === 0) {
    const nomes = lotes.map((l) => `- ${l.location_name ?? "sem nome"}`).join("\n");
    return ask(`Não achei lote aberto em "${nomeDoLote}". Os que estão abertos:\n${nomes}`);
  }
  if (candidatos.length > 1) {
    await guardar("confinamento");
    const nomes = candidatos.map((l) => `- ${l.location_name ?? "sem nome"} (${l.quantity} animais)`).join("\n");
    return ask(`Você tem mais de um lote em confinamento. Qual deles?\n${nomes}`);
  }
  const lote = candidatos[0];

  if (!confirmed) {
    await guardar("confirmacao");
    return {
      reply_text: `Deseja registrar a utilização de ${descreverQuantidade(quantidade, produto.unit)} de ${produto.name} no confinamento?`,
      requires_confirmation: true,
      auxiliary_data: { produto: produto.id, quantidade, stay_id: lote.id },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const resultado = await recordConfinementFeeding(db, {
    stay_id: lote.id,
    quantity: quantidade,
    product_id: produto.id,
    recorded_by_user_id: user_id ?? null,
  });
  if (temMemoria) await clearPendingConfinement(tenant_id, user_id!);
  if (!resultado.ok) return failReply(intent, resultado);

  // §26: quando o produto existe no estoque, informar o saldo depois da
  // utilização. `recordConfinementFeeding` hoje sempre exige produto do
  // catálogo, então `registered_in_stock` é sempre `true`, mas a leitura do
  // saldo continua condicionada a ele para não mentir se isso mudar.
  let saldoTexto = "";
  if (resultado.data.registered_in_stock) {
    const [posicao] = await getStockBalance(db, { product_id: produto.id, property_id: lote.property_id });
    const restante = posicao?.quantity ?? 0;
    saldoTexto = ` Restam ${descreverQuantidade(restante, produto.unit)}.`;
  }

  return {
    reply_text:
      `✅ Anotei: ${descreverQuantidade(quantidade, produto.unit)} de ${produto.name} ` +
      `${concordar("usadas", produto.unit, quantidade)} no confinamento.${saldoTexto}`,
    requires_confirmation: false,
    auxiliary_data: { movement_id: resultado.data.stock_movement_id },
    report_url: null,
    action_taken: `${intent}:ok`,
  };
};

// ── §17 a §20: saída ─────────────────────────────────────────────────────

/**
 * "Tirei 10 bois do confinamento e mandei para o Pasto da Sede" (§17, §18,
 * §20). Reusa `closeStay` (fase 2 do Módulo 30): total ou parcial, pelas
 * mesmas regras que já valem para boitel e para as outras estadias.
 *
 * Cobre os três encerramentos que o §17 a §21 permitem para o confinamento
 * (retorno ao pasto, venda direta, morte), lidos pelo que a mensagem trouxer:
 * um valor dito é venda, uma morte dita é morte, e o padrão é retorno.
 *
 * O pasto citado no retorno é resolvido (`resolverPasto`, mesma função do
 * resto do arquivo) e vai como `pasture_id` no destino de `closeStay`. Venda
 * e morte não têm pasto: `closeStay` grava `to: null` pra elas, e um pasto
 * ali não teria onde pousar.
 */
export const encerrarConfinamento: Handler = async ({
  db,
  tenant_id,
  user_id,
  parameters: parametrosDaMensagem,
  confirmed,
  explicitNo,
}) => {
  const intent = "encerrar_confinamento";
  const gesto: GestoConfinamento = "saida";

  if (explicitNo) return cancelar(intent, tenant_id, user_id);

  const temMemoria = !!user_id;
  const pendente = temMemoria ? await loadPendingConfinement(tenant_id, user_id!) : null;
  let parameters = parametrosDaMensagem;

  if (confirmed) {
    if (!temMemoria) {
      return ask(
        "Não consegui identificar quem está falando comigo, então não vou registrar nada. " +
          "Me conte de novo a saída do confinamento.",
      );
    }
    if (pendente?.gesto === gesto && pendente.aguardando === "confirmacao") {
      parameters = pendente.parameters;
    } else {
      return ask(
        "Não tenho nenhuma saída esperando confirmação. Me conte de novo a saída do confinamento.",
      );
    }
  } else if (pendente?.gesto === gesto && pendente.aguardando !== "confirmacao") {
    const juntos = aplicarRespostaConfinamento(pendente, parametrosDaMensagem);
    if (juntos) parameters = juntos;
  }

  const guardar = async (aguardando: CampoConfinamento) => {
    if (temMemoria) await savePendingConfinement(tenant_id, user_id!, { parameters, aguardando, gesto });
  };

  const lotes = await listConfinementLots(db, { apenas_abertas: true });
  if (lotes.length === 0) {
    return ask("Você não tem lote em confinamento ou boitel aberto agora.");
  }

  const nomeDoLote = str(parameters.confinamento) ?? str(parameters.local);
  const candidatos = nomeDoLote
    ? lotes.filter((l) => normalizar(l.location_name ?? "").includes(normalizar(nomeDoLote)))
    : lotes;

  if (candidatos.length === 0) {
    const nomes = lotes.map((l) => `- ${l.location_name ?? "sem nome"}`).join("\n");
    return ask(`Não achei lote aberto em "${nomeDoLote}". Os que estão abertos:\n${nomes}`);
  }
  if (candidatos.length > 1) {
    await guardar("confinamento");
    const nomes = candidatos.map((l) => `- ${l.location_name ?? "sem nome"} (${l.quantity} animais)`).join("\n");
    return ask(`Você tem mais de um lote aberto. De qual deles?\n${nomes}`);
  }
  const lote = candidatos[0];

  const quantidade = lerNumeroBr(parameters.quantidade) ?? lerNumeroBr(parameters.quantity);
  if (quantidade == null || !Number.isInteger(quantidade) || quantidade <= 0) {
    await guardar("quantidade");
    return ask("Quantos animais saíram?");
  }
  if (quantidade > lote.quantity) {
    await guardar("quantidade");
    return ask(`Esse lote só tem ${lote.quantity} animais. Revise a quantidade.`);
  }

  const morreu =
    interpretarSim(parameters.morte) || interpretarSim(parameters.morreu) || str(parameters.tipo) === "morte";
  // "vendeu" pode chegar sem valor ainda ("vendi 10 do confinamento"): o sinal
  // de INTENÇÃO de venda é separado do valor, senão o guard abaixo (perguntar
  // o valor que falta) nunca teria como disparar.
  const pretendeVender =
    str(parameters.tipo) === "venda" || interpretarSim(parameters.vendeu) || interpretarSim(parameters.venda);
  const valor = lerDinheiro(parameters, "valor", "amount", "preco");
  const destino =
    str(parameters.destino) ?? str(parameters.pasto) ?? str(parameters.fazenda_destino) ?? str(parameters.local);

  const movementType: "retorno_estadia" | "venda" | "morte" = morreu
    ? "morte"
    : pretendeVender || valor != null
      ? "venda"
      : "retorno_estadia";

  if (movementType === "venda" && valor == null) {
    await guardar("valor");
    return ask(`Por quanto os ${quantidade} foram vendidos?`);
  }

  // §18: só o retorno ao pasto grava posição. Resolve o pasto citado do
  // mesmo jeito que o resto do arquivo (nunca adivinha): sem achar, pergunta.
  let pasto: { id: string | null; nome: string | null } = { id: null, nome: null };
  if (movementType === "retorno_estadia" && destino) {
    const resolvido = await resolverPasto(db, lote.property_id, destino);
    if (!resolvido.ok) {
      await guardar("pasto");
      return resolvido.resposta;
    }
    pasto = resolvido;
  }
  const nomeDoDestino = pasto.nome ?? destino;

  const pergunta =
    movementType === "morte"
      ? `Deseja registrar a morte de ${quantidade} animais no confinamento?`
      : movementType === "venda"
        ? `Deseja registrar a venda de ${quantidade} animais do confinamento por ${reais(valor as number)}?`
        : `Deseja registrar a saída de ${quantidade} animais do confinamento${nomeDoDestino ? ` para ${nomeDoDestino}` : ""}?`;

  if (!confirmed) {
    await guardar("confirmacao");
    return {
      reply_text: pergunta,
      requires_confirmation: true,
      auxiliary_data: { quantidade, stay_id: lote.id, movement_type: movementType, pasture_id: pasto.id },
      report_url: null,
      action_taken: `${intent}:aguardando_confirmacao`,
    };
  }

  const resultado = await closeStay(db, lote.id, {
    destinos: [
      {
        movement_type: movementType,
        quantity: quantidade,
        value: movementType === "venda" ? valor : null,
        pasture_id: pasto.id,
      },
    ],
    recorded_by_user_id: user_id ?? null,
  });
  if (temMemoria) await clearPendingConfinement(tenant_id, user_id!);
  if (!resultado.ok) return failReply(intent, resultado);

  const respostaFinal =
    movementType === "morte"
      ? `Registrado. ${quantidade} morte(s) no confinamento.`
      : movementType === "venda"
        ? `Registrado. Venda de ${quantidade} animais do confinamento por ${reais(valor as number)}.`
        : `Registrado. ${quantidade} animais saíram do confinamento${nomeDoDestino ? ` para ${nomeDoDestino}` : ""}.`;

  return {
    reply_text: respostaFinal,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:ok:${resultado.data.id}`,
  };
};
