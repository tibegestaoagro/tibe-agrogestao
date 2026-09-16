import "dotenv/config";
import fs from "node:fs";
import { exigirBancoLocal, exigirRedisLocal } from "./_banco-local";

exigirBancoLocal();
exigirRedisLocal();

/**
 * Avaliação do agente, Fase 3 (Módulo do agente WhatsApp).
 * Nenhuma seção chama a OpenAI: o transporte do modelo é substituído.
 * Roda: `npm run test:m69`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function main() {
  console.log("1. Medidor de custo");
  {
    const os = await import("node:os");
    const path = await import("node:path");
    const { custoDaChamada, criarMedidor, OrcamentoEsgotado } = await import("./avaliacao/medidor");
    check("1M de entrada sem cache no gpt-4o-mini custa US$ 0,15", Math.abs(custoDaChamada("gpt-4o-mini", { prompt_tokens: 1_000_000, completion_tokens: 0 }) - 0.15) < 1e-9);
    check("entrada em cache cobra o preço de cache", Math.abs(custoDaChamada("gpt-4o-mini", { prompt_tokens: 1_000_000, prompt_tokens_details: { cached_tokens: 1_000_000 }, completion_tokens: 0 }) - 0.075) < 1e-9);
    check("saída do gpt-5.6-terra custa US$ 12 por milhão", Math.abs(custoDaChamada("gpt-5.6-terra", { completion_tokens: 1_000_000 }) - 12) < 1e-9);
    check("cached_tokens maior que prompt_tokens nunca gera custo negativo", custoDaChamada("gpt-4o-mini", { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 1_000_000 }, completion_tokens: 0 }) >= 0);
    let semPreco = false;
    try { custoDaChamada("modelo-inexistente", {}); } catch { semPreco = true; }
    check("modelo sem preço recusa em vez de contar zero", semPreco);

    const arquivo = path.join(os.tmpdir(), `gasto-m69-${Date.now()}.json`);
    try {
      fs.writeFileSync(arquivo, JSON.stringify({ total_usd: 29.99 }));
      let enviadas = 0;
      const medidor = criarMedidor({
        arquivo,
        enviar: async () => {
          enviadas += 1;
          return { status: 200, json: { usage: { prompt_tokens: 100_000, completion_tokens: 0 }, choices: [] } };
        },
      });
      await medidor.transporte({ model: "gpt-5.6-terra" });
      check("chamada abaixo do teto passa e soma o custo", enviadas === 1 && Math.abs(medidor.gastoTotal() - 30.19) < 1e-6, String(medidor.gastoTotal()));
      let parou = false;
      try { await medidor.transporte({ model: "gpt-5.6-terra" }); } catch (e) { parou = e instanceof OrcamentoEsgotado; }
      check("no teto, a chamada seguinte nem sai", parou && enviadas === 1);
      check("o gasto fica gravado no arquivo", JSON.parse(fs.readFileSync(arquivo, "utf8")).total_usd > 30);

      let naoEnviouComModeloInvalido = true;
      let enviadas2 = 0;
      const medidor2 = criarMedidor({
        arquivo: path.join(os.tmpdir(), `gasto-m69-2-${Date.now()}.json`),
        enviar: async () => {
          enviadas2 += 1;
          return { status: 200, json: { usage: { prompt_tokens: 100_000, completion_tokens: 0 }, choices: [] } };
        },
      });
      try { await medidor2.transporte({ model: "modelo-inexistente" }); } catch { naoEnviouComModeloInvalido = enviadas2 === 0; }
      check("medidor recusa modelo sem preço antes de enviar", naoEnviouComModeloInvalido);
    } finally {
      fs.rmSync(arquivo, { force: true });
    }
  }

  console.log("\n2. Casos, partição e pontuação");
  {
    const { validarCasos, particao, particaoDoCaso } = await import("./avaliacao/casos");
    const { pontuarMensagem, agregar, aprovar, compararCampo } = await import("./avaliacao/pontuar");
    const { buscarIntencao } = await import("@/lib/agente/intencoes");
    const hoje = new Date(2026, 8, 15, 12);

    check("caso válido passa", validarCasos([{ id: "p-1", autor: "produtor", tipo: "mensagem", texto: "quantos animais eu tenho", esperado: [{ intent: "consultar_rebanho" }] }]).length === 0);
    check("intenção inexistente é recusada", validarCasos([{ id: "p-2", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "vender_fazenda" }] }]).length === 1);
    check("intenção legada é recusada", validarCasos([{ id: "p-3", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "registrar_lote_animal" }] }]).length === 1);
    check("campo que a intenção não declara é recusado", validarCasos([{ id: "p-4", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "consultar_rebanho", campos: { valor: 10 } }] }]).length === 1);
    check("id repetido é recusado", validarCasos([
      { id: "p-5", autor: "produtor", tipo: "mensagem", texto: "a", esperado: [{ intent: "ajuda" }] },
      { id: "p-5", autor: "produtor", tipo: "mensagem", texto: "b", esperado: [{ intent: "ajuda" }] },
    ]).length === 1);
    check("conversa com grava inválido é recusada", validarCasos([{ id: "c-1", autor: "conversa", tipo: "conversa", passos: [{ texto: "a", grava: "talvez" }, { texto: "b", grava: "nao" }] }]).length === 1);
    check("coincide_com_exemplo literal e molde são aceitos", validarCasos([
      { id: "p-6", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "ajuda" }], coincide_com_exemplo: "literal" },
      { id: "p-7", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "ajuda" }], coincide_com_exemplo: "molde" },
    ]).length === 0);
    check("coincide_com_exemplo com outro valor é recusado", validarCasos([
      { id: "p-8", autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "ajuda" }], coincide_com_exemplo: "parecido" },
    ]).length === 1);
    check("partição é estável", particao("p-1") === particao("p-1"));
    const ids = Array.from({ length: 1000 }, (_, i) => `caso-${i}`);
    const noAjuste = ids.filter((id) => particao(id) === "ajuste").length;
    check("partição fica perto de 70/30", noAjuste > 640 && noAjuste < 760, String(noAjuste));

    const idDeFinal = ids.find((id) => particao(id) === "final")!;
    check(
      "caso com coincide_com_exemplo é sempre ajuste, mesmo com hash de final",
      particaoDoCaso({ id: idDeFinal, autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "ajuda" }], coincide_com_exemplo: "literal" }) === "ajuste",
    );
    check(
      "caso sem coincide_com_exemplo segue o hash de particao",
      particaoDoCaso({ id: idDeFinal, autor: "produtor", tipo: "mensagem", texto: "x", esperado: [{ intent: "ajuda" }] }) === particao(idDeFinal),
    );

    const negocio = buscarIntencao("registrar_negocio_gado")!;
    const campo = (nome: string) => negocio.campos.find((c) => c.nome === nome)!;
    check("60 mil casa com 60000", compararCampo(campo("valor"), 60000, "60 mil", hoje));
    check("texto com preposição casa", compararCampo(campo("contato"), "João", "do João", hoje));
    check("dia 10 casa com 10/09/2026", compararCampo(campo("vencimento"), "dia 10", "10/09/2026", hoje));
    check("itens comparados item a item", compararCampo(campo("itens"), [{ categoria: "bezerro", quantidade: 20 }], [{ categoria: "bezerros", quantidade: "20" }], hoje));
    check("numero ilegivel dos dois lados nao e acerto", compararCampo(campo("valor"), "abc", "xyz", hoje) === false);
    check("texto esperado vazio nunca acerta", compararCampo(campo("contato"), "", "João", hoje) === false);
    check("quinta casa com quinta-feira: nenhum lado e legivel por interpretarData", compararCampo(campo("vencimento"), "quinta", "quinta-feira", hoje));
    check("dia 20 nao casa com quinta: so um lado e legivel", compararCampo(campo("vencimento"), "dia 20", "quinta", hoje) === false);
    const categoriaDoItem = campo("itens").itens!.find((c) => c.nome === "categoria")!;
    check("plural no meio da frase casa depois de tirar o s de cada palavra", compararCampo(categoriaDoItem, "fêmeas de 13 a 24 meses", "fêmea de 13 a 24 meses", hoje));
    check("bezerro casa com bezerros, continua", compararCampo(categoriaDoItem, "bezerro", "bezerros", hoje));
    check("sal casa com salsicha por inclusao, nao e regressao", compararCampo(categoriaDoItem, "sal", "salsicha", hoje));

    const caso = { id: "p-9", autor: "produtor" as const, tipo: "mensagem" as const, texto: "comprei 20 bezerros do João por 60 mil, pago dia 10", esperado: [{ intent: "registrar_negocio_gado", campos: { tipo: "compra", valor: 60000, vencimento: "dia 10" } }] };
    const certa = pontuarMensagem(caso, [{ intent: "registrar_negocio_gado", parameters: { tipo: "compra", valor: "60 mil", vencimento: "dia 10" } }], hoje);
    check("classificação certa pontua tudo", certa.pedidos_certos === 1 && certa.pedidos_total === 1 && certa.campos_certos === 3 && certa.campos_total === 3, JSON.stringify(certa));
    const cortada = pontuarMensagem(caso, [
      { intent: "registrar_negocio_gado", parameters: { tipo: "compra" } },
      { intent: "ambigua", parameters: {} },
    ], hoje);
    check("ação cortada em dois pedidos é erro e perde os campos", cortada.pedidos_certos === 1 && cortada.pedidos_total === 2 && cortada.campos_certos === 1 && cortada.erros.some((e) => e.startsWith("pedido a mais")), JSON.stringify(cortada));
    const inventada = pontuarMensagem(caso, [{ intent: "registrar_negocio_gado", parameters: { tipo: "compra", valor: 60000, vencimento: "dia 10", parcelas: 3 } }], hoje);
    check("número inventado conta como campo errado", inventada.campos_total === 4 && inventada.campos_certos === 3 && inventada.erros.includes("número inventado: parcelas"), JSON.stringify(inventada));

    const casoDiaria = { id: "p-15", autor: "produtor" as const, tipo: "mensagem" as const, texto: "fiz uma diaria", esperado: [{ intent: "registrar_diaria", campos: { servico: "diaria" } }] };
    const numeroDito = pontuarMensagem(casoDiaria, [{ intent: "registrar_diaria", parameters: { servico: "diaria", quantidade: 1 } }], hoje);
    check(
      "numero extra dito na mensagem nao e numero inventado",
      numeroDito.erros.length === 0 && numeroDito.campos_total === 1,
      JSON.stringify(numeroDito),
    );

    const casoBezerros = {
      id: "p-16",
      autor: "produtor" as const,
      tipo: "mensagem" as const,
      texto: "comprei uns bezerros do Joao",
      esperado: [{ intent: "registrar_negocio_gado", campos: { itens: [{ categoria: "bezerros" }] } }],
    };
    const subcampoInventado = pontuarMensagem(casoBezerros, [{ intent: "registrar_negocio_gado", parameters: { itens: [{ categoria: "bezerros", quantidade: 20 }] } }], hoje);
    check(
      "subcampo numerico de lista nao esperado e nao dito na mensagem e numero inventado",
      subcampoInventado.erros.includes("número inventado: itens.quantidade"),
      JSON.stringify(subcampoInventado),
    );

    // A nota de campos só olha pedido com intenção certa, então quem erra mais intenção é medido numa base menor.
    const erradaComCampos = pontuarMensagem(caso, [{ intent: "ambigua", parameters: {} }], hoje);
    check("intenção errada não entra na base de campos de hoje", erradaComCampos.campos_total === 0 && erradaComCampos.campos_certos === 0);
    check("os campos esperados do pedido que errou a intenção entram na base absoluta", erradaComCampos.campos_total_absoluto === 3, JSON.stringify(erradaComCampos));
    const absoluta = agregar([certa, erradaComCampos]);
    check(
      "campos absoluto mede na base maior, campos continua como está",
      absoluta.campos === 1 && Math.abs(absoluta.campos_absoluto - 0.5) < 1e-9,
      JSON.stringify(absoluta),
    );
    check("agregar sem mensagens não gera NaN no absoluto", agregar([]).campos_absoluto === 1);

    const m = agregar([certa, cortada]);
    check("agrega intenção geral", Math.abs(m.intencao_geral - 2 / 3) < 1e-9, String(m.intencao_geral));
    check("gravação indevida reprova mesmo com nota cheia", aprovar(agregar([certa]), 1).aprovado === false);
    check("nota cheia sem gravação indevida aprova", aprovar(agregar([certa]), 0).aprovado === true);
    const comFalhas = aprovar(agregar([certa]), 0, { falhas: 3, passos: 10 });
    check("falha do modelo em 30% dos passos reprova", comFalhas.aprovado === false && comFalhas.motivos.includes("falhas do modelo 30.0% > 2%"), JSON.stringify(comFalhas));
    check("sem falha do modelo nos passos aprova", aprovar(agregar([certa]), 0, { falhas: 0, passos: 10 }).aprovado === true);

    // Confirmação que não gravou é o outro lado da gravação indevida: o modelo que nunca escreve também não serve.
    const muitasConfirmacoes = aprovar(agregar([certa]), 0, { falhas: 0, passos: 20, confirmacoesSemGravar: 3, passosQueDevem: 10 });
    check(
      "confirmação que não gravou em mais de 10% dos passos que deviam gravar reprova",
      muitasConfirmacoes.aprovado === false && muitasConfirmacoes.motivos.some((m) => m.startsWith("confirmações que não gravaram")),
      JSON.stringify(muitasConfirmacoes),
    );
    check(
      "no limite de 10% ainda aprova",
      aprovar(agregar([certa]), 0, { falhas: 0, passos: 20, confirmacoesSemGravar: 1, passosQueDevem: 10 }).aprovado === true,
    );
    check(
      "sem o dado das confirmações, o comportamento é o de hoje",
      aprovar(agregar([certa]), 0, { falhas: 0, passos: 20 }).aprovado === true,
    );
    check("agregar sem mensagens nao gera NaN", agregar([]).intencao_geral === 0 && agregar([]).campos === 1);
    check("sem mensagens reprova", aprovar(agregar([]), 0).aprovado === false);

    // O relatório passa a base de TODAS as partições pro limite de 85%: a partição filtrada
    // sozinha pode ter poucos casos por intenção (o gate de "total >= 5" nem entra em jogo).
    const metricasFiltradas = { intencao_geral: 1, por_intencao: { consultar_estoque: { certos: 1, total: 3 } }, campos: 1, campos_absoluto: 1, mensagens: 3 };
    const porIntencaoTodas = { consultar_estoque: { certos: 5, total: 10 } };
    check("sem a base de todas as particoes, poucos casos escapam do limite de 85%", aprovar(metricasFiltradas, 0).aprovado === true);
    const comBaseDeTodas = aprovar(metricasFiltradas, 0, undefined, porIntencaoTodas);
    check(
      "com a base de todas as particoes, o limite de 85% pega o caso que a filtrada escondia",
      comBaseDeTodas.aprovado === false && comBaseDeTodas.motivos.some((m) => m.startsWith("consultar_estoque 50%")),
      JSON.stringify(comBaseDeTodas),
    );
  }

  console.log("\n3. Fazenda de avaliação");
  {
    const { montarFazenda, contarLinhasDeNegocio, descreverFazenda, descreverCatalogo } = await import("./avaliacao/fazenda");
    const fazenda = await montarFazenda(`m69-${Date.now()}`);
    try {
      const { db } = fazenda;
      check("duas fazendas", (await db.property.count()) === 2);
      check("quatro pastos", (await db.pasture.count()) === 4);
      check("produto Sal mineral existe", (await db.product.count({ where: { name: "Sal mineral" } })) === 1);
      check("contato do WhatsApp já existe (não é primeiro contato)", (await db.whatsAppContact.count()) === 1);
      const marco = new Date();
      const antes = await contarLinhasDeNegocio(db, marco);
      await db.shoppingItem.create({ data: (await import("@/lib/prisma")).scoped({ description: "Teste M69" }) as never });
      const depois = await contarLinhasDeNegocio(db, marco);
      check("uma linha de negócio nova é contada", depois.total === antes.total + 1 && depois.porModel.ShoppingItem === antes.porModel.ShoppingItem + 1);
      const { algumaEscritaEntre } = await import("./avaliacao/fazenda");
      check("a linha nova aparece como escrita", algumaEscritaEntre(antes, depois));
      // Marco novo, como o executor faz a cada passo: o que interessa é linha alterada DEPOIS dele.
      const item = (await db.shoppingItem.findFirst({ where: { description: "Teste M69" } }))!;
      const marcoDoUpdate = new Date();
      const antesDoUpdate = await contarLinhasDeNegocio(db, marcoDoUpdate);
      await db.shoppingItem.update({ where: { id: item.id }, data: { status: "comprado", resolved_at: new Date() } });
      const aposUpdate = await contarLinhasDeNegocio(db, marcoDoUpdate);
      check("atualizar sem criar linha também é escrita", aposUpdate.total === antesDoUpdate.total && algumaEscritaEntre(antesDoUpdate, aposUpdate));
      await db.shoppingItem.delete({ where: { id: item.id } });
      check("apagar também é escrita", algumaEscritaEntre(aposUpdate, await contarLinhasDeNegocio(db, marcoDoUpdate)));
      check("briefing da fazenda cita o Pasto da Baixada", descreverFazenda().includes("Pasto da Baixada"));
      check("catálogo cita registrar_negocio_gado e não cita exemplos", descreverCatalogo().includes("registrar_negocio_gado") && !descreverCatalogo().includes("(§"));
    } finally {
      await fazenda.limpar();
    }

    // A próxima tarefa monta uma fazenda por conversa: duas montagens na
    // mesma janela de milissegundo não podem colidir em nenhum campo único
    // (Tenant.document, User.email).
    const [fazendaA, fazendaB] = await Promise.all([montarFazenda("dupla-a"), montarFazenda("dupla-b")]);
    try {
      check("duas montagens simultâneas não colidem", fazendaA.tenantId !== fazendaB.tenantId);
      check("cada uma tem sua própria fazenda", (await fazendaA.db.property.count()) === 2 && (await fazendaB.db.property.count()) === 2);
    } finally {
      await Promise.all([fazendaA.limpar(), fazendaB.limpar()]);
    }

    // O que um handler grava numa conversa e aponta com Restrict para fazenda ou catálogo: sem apagar antes, o tenant não sai.
    {
      const { scoped, prisma } = await import("@/lib/prisma");
      const gravada = await montarFazenda(`m69-restrict-${Date.now()}`);
      const { db } = gravada;
      const propriedade = (await db.property.findFirst())!;
      const cliente = (await db.serviceClient.findFirst())!;
      const servico = (await db.service.findFirst())!;
      await db.milkProduction.create({ data: scoped({ property_id: propriedade.id, liters: 120, shift: "dia", recorded_at: new Date() }) as never });
      await db.lactationEntry.create({ data: scoped({ property_id: propriedade.id, type: "entrada", quantity: 3, recorded_at: new Date() }) as never });
      await db.serviceOrder.create({ data: scoped({ service_client_id: cliente.id, service_id: servico.id }) as never });
      await db.serviceJob.create({ data: scoped({ property_id: propriedade.id, occurred_at: new Date(), description: "Gradagem", pricing: "hectare" }) as never });
      const tanque = await db.milkSite.create({ data: scoped({ name: "Tanque", type: "proprio", property_id: propriedade.id }) as never });
      const comprador = (await db.contact.findFirst())!;
      await db.milkMovement.create({ data: scoped({ movement_type: "saida", liters: 50, occurred_at: new Date(), from_site_id: (tanque as { id: string }).id, buyer_id: comprador.id }) as never });
      await db.milkCharge.create({ data: scoped({ owner_id: comprador.id, type: "fixo", amount: 10, occurred_at: new Date(), site_id: (tanque as { id: string }).id }) as never });
      await db.worker.create({ data: scoped({ name: "Tonho", role: "Vaqueiro", type: "fixo", property_id: propriedade.id }) as never });
      await db.plot.create({ data: scoped({ property_id: propriedade.id, name: "Talhão 1" }) as never });
      let erro: unknown = null;
      try {
        await gravada.limpar();
      } catch (e) {
        erro = e;
      }
      check("limpar remove o tenant com leite, lactação, ordem e serviço gravados", erro === null && (await prisma.tenant.count({ where: { id: gravada.tenantId } })) === 0, String(erro));
    }
  }

  console.log("\n4. Executor");
  {
    const { avaliarModelo } = await import("./avaliacao/executor");
    const { OrcamentoEsgotado } = await import("./avaliacao/medidor");
    type Corpo = Record<string, unknown>;

    // O transporte responde pelo nome do schema e pela mensagem do produtor (última linha, depois de "mensagem: ").
    const ler = (corpo: Corpo) => {
      const nome = (corpo.response_format as { json_schema: { name: string } }).json_schema.name;
      const usuario = (corpo.messages as { content: string }[])[1].content;
      const texto = usuario.split("\n").pop()!.replace(/^mensagem( do produtor)?: /, "");
      return { nome, texto };
    };
    const responder = (conteudo: unknown) => ({ status: 200, json: { choices: [{ message: { content: JSON.stringify(conteudo) } }] } });
    const falso = async (corpo: Corpo) => {
      const { nome, texto } = ler(corpo);
      if (texto === "quebra o modelo") return { status: 400, json: {} };
      if (nome === "resposta") return responder({ tipo: "outro_assunto", valor: null });
      if (nome === "dominio") {
        const dominio = texto.startsWith("quantos") || texto.startsWith("comprei") ? "rebanho" : texto.startsWith("usei") ? "estoque" : "nenhum";
        return responder({ pedidos: [{ dominio, trecho: texto }] });
      }
      if (texto.startsWith("quantos")) return responder({ intent: "consultar_rebanho", parametros: {} });
      if (texto.startsWith("comprei")) return responder({ intent: "registrar_negocio_gado", parametros: { valor: null } });
      if (texto.startsWith("usei")) return responder({ intent: "registrar_uso_estoque", parametros: { produto: "Sal mineral", quantidade: 2, fazenda: "Fazenda Boa Vista" } });
      return responder({ intent: "ambigua", parametros: {} });
    };

    const casos = [
      { id: "m69-msg-1", autor: "produtor" as const, tipo: "mensagem" as const, texto: "quantos animais eu tenho", esperado: [{ intent: "consultar_rebanho" }] },
      { id: "m69-msg-2", autor: "produtor" as const, tipo: "mensagem" as const, texto: "comprei 20 bezerros do João por 60 mil", esperado: [{ intent: "registrar_negocio_gado", campos: { valor: 60000 } }] },
      {
        id: "m69-conv-1",
        autor: "conversa" as const,
        tipo: "conversa" as const,
        passos: [
          // Com a fazenda na frase: a de avaliação tem duas, e sem ela o handler pergunta em vez de gravar.
          { texto: "usei 2 sacas de sal mineral na Fazenda Boa Vista", grava: "nao" as const },
          { texto: "quantos animais eu tenho", grava: "nao" as const },
          { texto: "sim", grava: "deve" as const },
        ],
      },
    ];

    const r = await avaliarModelo({ modelo: "gpt-4o-mini", esforco: null, casos, particao: "todas", transporte: falso, prefixo: `m69-${Date.now()}` });
    check("intenção geral 100% nas duas mensagens", r.metricas.intencao_geral === 1, JSON.stringify(r.metricas));
    check("valor que faltou derruba os campos", r.metricas.campos < 1, JSON.stringify(r.metricas));
    check("conversa com três passos avaliados", r.conversas.length === 1 && r.conversas[0].passos.length === 3, JSON.stringify(r.conversas));
    check("uso de estoque gravado num passo que não podia gravar é gravação indevida", r.gravacoes_indevidas === 1 && r.conversas[0]?.passos[0]?.indevida === true, JSON.stringify(r.conversas));
    check("pergunta não grava", r.conversas[0]?.passos[1]?.linhas_novas === 0);
    check("sim sem nada pendente é confirmação que não gravou", r.confirmacoes_que_nao_gravaram === 1 && r.conversas[0]?.passos[2]?.faltou === true);
    check("gravação indevida reprova", r.aprovacao.aprovado === false && r.aprovacao.motivos.some((m) => m.startsWith("gravações indevidas")), JSON.stringify(r.aprovacao));
    check("rodada completa não fica interrompida", r.interrompido === null && r.falhas_do_modelo === 0, String(r.interrompido));
    check("latência medida", r.latencia_p95_ms >= r.latencia_p50_ms && r.latencia_p50_ms >= 0);

    const comFalha = await avaliarModelo({
      modelo: "gpt-4o-mini",
      esforco: null,
      casos: [casos[0], { id: "m69-msg-3", autor: "produtor", tipo: "mensagem", texto: "quebra o modelo", esperado: [{ intent: "consultar_rebanho" }] }],
      particao: "todas",
      transporte: falso,
      prefixo: `m69-falha-${Date.now()}`,
    });
    const notaQuebrada = comFalha.notas.find((n) => n.id === "m69-msg-3");
    check("falha do modelo vira nota errada sem interromper", comFalha.interrompido === null && comFalha.notas.length === 2 && notaQuebrada?.falha === "http" && notaQuebrada.pedidos_certos === 0, JSON.stringify(comFalha.notas));

    let lancou = false;
    const semVerba = async () => {
      lancou = true;
      throw new OrcamentoEsgotado(30, 30);
    };
    let escapou: unknown = null;
    const semOrcamento = await avaliarModelo({ modelo: "gpt-4o-mini", esforco: null, casos, particao: "todas", transporte: semVerba, prefixo: `m69-orc-${Date.now()}`, orcamentoEsgotado: () => lancou }).catch((e) => {
      escapou = e;
      return null;
    });
    check("orçamento esgotado nas mensagens interrompe sem exceção", escapou === null && semOrcamento?.interrompido === "orçamento" && semOrcamento.conversas.length === 0, String(escapou ?? semOrcamento?.interrompido));

    // Na conversa o turno engole o erro e devolve a frase de falha: quem avisa é orcamentoEsgotado().
    lancou = false;
    const semOrcamentoNaConversa = await avaliarModelo({ modelo: "gpt-4o-mini", esforco: null, casos: [casos[2]], particao: "todas", transporte: semVerba, prefixo: `m69-orc2-${Date.now()}`, orcamentoEsgotado: () => lancou });
    check(
      "orçamento esgotado no meio da conversa interrompe e não conta o passo",
      semOrcamentoNaConversa.interrompido === "orçamento" && (semOrcamentoNaConversa.conversas[0]?.passos.length ?? 0) === 0 && semOrcamentoNaConversa.falhas_do_modelo === 0,
      JSON.stringify(semOrcamentoNaConversa.conversas),
    );

    // Verba exatamente no teto depois de uma conversa que respondeu normalmente: o modelo terminou.
    const noTeto = await avaliarModelo({ modelo: "gpt-4o-mini", esforco: null, casos: [casos[2]], particao: "todas", transporte: falso, prefixo: `m69-teto-${Date.now()}`, orcamentoEsgotado: () => true });
    check("modelo que termina a conversa no teto não sai interrompido", noTeto.interrompido === null && noTeto.conversas[0]?.passos.length === 3, `${noTeto.interrompido} ${noTeto.conversas[0]?.passos.length}`);

    const { avaliarPasso } = await import("./avaliacao/executor");
    const { FRASE_DE_FALHA_PARCIAL, FRASE_DE_FALHA } = await import("@/lib/actions/turno");
    const gravouEFalhou = avaliarPasso({ texto: "usei sal e vendi gado", grava: "nao" }, { linhas_novas: 1, escreveu: true }, ["✅ Anotei o sal.", FRASE_DE_FALHA_PARCIAL], 10, () => true);
    check("passo com frase de falha que gravou continua gravação indevida, mesmo no teto", gravouEFalhou.passo?.indevida === true && gravouEFalhou.interromper === true, JSON.stringify(gravouEFalhou));
    const falhouSemGravar = avaliarPasso({ texto: "quantos animais", grava: "nao" }, { linhas_novas: 0, escreveu: false }, [FRASE_DE_FALHA], 10, () => true);
    check("passo que falhou no teto sem gravar sai da lista e interrompe", falhouSemGravar.passo === null && falhouSemGravar.interromper === true);
    const alterouEFalhou = avaliarPasso({ texto: "comprei o arame", grava: "nao" }, { linhas_novas: 0, escreveu: true }, [FRASE_DE_FALHA], 10, () => true);
    check("passo que só ALTEROU linha no teto continua na lista, como gravação indevida", alterouEFalhou.passo?.indevida === true && alterouEFalhou.interromper === true);
    const falhouComVerba = avaliarPasso({ texto: "quantos animais", grava: "nao" }, { linhas_novas: 0, escreveu: false }, [FRASE_DE_FALHA], 10, () => false);
    check("frase de falha com verba é falha do modelo e não interrompe", falhouComVerba.passo?.falha_do_modelo === true && !falhouComVerba.interromper);

    // Escrita que ATUALIZA não cria linha nova: riscar um item que já estava na lista é gravação indevida do mesmo jeito.
    const riscaDaLista = async (corpo: Corpo) => {
      const { nome, texto } = ler(corpo);
      if (nome === "resposta") return responder({ tipo: "outro_assunto", valor: null });
      if (nome === "dominio") return responder({ pedidos: [{ dominio: texto.startsWith("comprei") ? "lista_de_compra" : "rebanho", trecho: texto }] });
      if (texto.startsWith("comprei")) return responder({ intent: "comprei_item_lista", parametros: { descricao: "arame" } });
      return responder({ intent: "consultar_rebanho", parametros: {} });
    };
    const comUpdate = await avaliarModelo({
      modelo: "gpt-4o-mini",
      esforco: null,
      casos: [{
        id: "m69-conv-2",
        autor: "conversa" as const,
        tipo: "conversa" as const,
        passos: [
          { texto: "comprei o arame", grava: "nao" as const },
          { texto: "quantos animais eu tenho", grava: "nao" as const },
        ],
      }],
      particao: "todas",
      transporte: riscaDaLista,
      prefixo: `m69-update-${Date.now()}`,
    });
    check(
      "riscar item que já existia na lista é gravação indevida, mesmo sem linha nova",
      comUpdate.gravacoes_indevidas === 1 &&
        comUpdate.conversas[0]?.passos[0]?.indevida === true &&
        comUpdate.conversas[0]?.passos[0]?.linhas_novas === 0 &&
        comUpdate.conversas[0]?.passos[1]?.indevida === false,
      JSON.stringify(comUpdate.conversas),
    );

    const soAjuste = await avaliarModelo({ modelo: "gpt-4o-mini", esforco: null, casos: [casos[0], casos[1]], particao: "ajuste", transporte: falso, prefixo: `m69-part-${Date.now()}` });
    const { particao } = await import("./avaliacao/casos");
    check("partição filtra os casos", soAjuste.notas.every((n) => particao(n.id) === "ajuste") && soAjuste.notas.length === [casos[0], casos[1]].filter((c) => particao(c.id) === "ajuste").length);
  }

  console.log("\n5. Carimbo da partição guardada no relatório");
  {
    const { avisoDeParticaoGuardada } = await import("./avaliacao/relatorio");
    const particoes = new Map<string, "ajuste" | "final">([["c-ajuste", "ajuste"], ["c-final", "final"]]);

    const carimbo = avisoDeParticaoGuardada("ajuste-3", ["c-ajuste", "c-final"], particoes);
    check("rodada de ajuste com caso da partição final é carimbada", carimbo !== null && carimbo.startsWith("**") && carimbo.includes("final"), String(carimbo));
    check("sem caso da partição final não carimba", avisoDeParticaoGuardada("ajuste-3", ["c-ajuste"], particoes) === null);
    check("a rodada chamada final não carimba", avisoDeParticaoGuardada("final", ["c-ajuste", "c-final"], particoes) === null);
    check("rodada fora da amostra não carimba", avisoDeParticaoGuardada("forademostra", ["c-ajuste", "c-final"], particoes) === null);
    check("id que não está mais nos casos não carimba sozinho", avisoDeParticaoGuardada("ajuste-3", ["some-id"], particoes) === null);
  }

  console.log("\n6. Espera no limite da conta");
  {
    const { comEsperaEmLimite } = await import("./avaliacao/limite");
    type Corpo = Record<string, unknown>;
    const resposta429 = (mensagem?: string) => ({ status: 429, json: mensagem ? { error: { message: mensagem } } : {} });
    const resposta200 = { status: 200, json: { ok: true } };

    // (a) duas respostas 429 com "Please try again in 1.5s" e depois 200.
    {
      let chamadas = 0;
      const enviar = async (_corpo: Corpo) => {
        chamadas += 1;
        return chamadas < 3 ? resposta429("Please try again in 1.5s") : resposta200;
      };
      const esperas: number[] = [];
      const transporte = comEsperaEmLimite(enviar, { esperar: async (ms) => { esperas.push(ms); } });
      const r = await transporte({});
      check("429 com tempo na mensagem devolve o 200 depois de esperar", r.status === 200 && chamadas === 3, JSON.stringify({ status: r.status, chamadas }));
      check("espera o tempo dito mais 250 ms, duas vezes", esperas.length === 2 && esperas.every((e) => e === 1750), JSON.stringify(esperas));
    }

    // (b) 429 sem tempo na mensagem: espera exponencial.
    {
      let chamadas = 0;
      const enviar = async (_corpo: Corpo) => {
        chamadas += 1;
        return chamadas < 3 ? resposta429() : resposta200;
      };
      const esperas: number[] = [];
      const transporte = comEsperaEmLimite(enviar, { esperar: async (ms) => { esperas.push(ms); } });
      const r = await transporte({});
      check("429 sem tempo na mensagem também devolve o 200", r.status === 200);
      check("espera exponencial 1s, depois 2s", esperas.length === 2 && esperas[0] === 1000 && esperas[1] === 2000, JSON.stringify(esperas));
    }

    // (c) 429 sempre, com tentativas: 3: devolve 429 depois de 3 esperas.
    {
      let chamadas = 0;
      const enviar = async (_corpo: Corpo) => {
        chamadas += 1;
        return resposta429();
      };
      const esperas: number[] = [];
      const transporte = comEsperaEmLimite(enviar, { tentativas: 3, esperar: async (ms) => { esperas.push(ms); } });
      const r = await transporte({});
      check("tentativas esgotadas devolve a última 429", r.status === 429);
      check("esperou exatamente 3 vezes", esperas.length === 3, JSON.stringify(esperas));
    }

    // (d) status 500 passa direto, sem esperar.
    {
      let chamadas = 0;
      const enviar = async (_corpo: Corpo) => {
        chamadas += 1;
        return { status: 500, json: {} };
      };
      let esperou = false;
      const transporte = comEsperaEmLimite(enviar, { esperar: async () => { esperou = true; } });
      const r = await transporte({});
      check("500 não é 429: passa direto sem esperar", r.status === 500 && chamadas === 1 && !esperou);
    }
  }

  if (falhas === 0) console.log("\n✅ Todos os testes passaram");
  else console.log(`\n❌ ${falhas} testes falharam`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro ao rodar testes:", e);
  process.exit(1);
});
