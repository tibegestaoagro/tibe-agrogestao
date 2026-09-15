import "dotenv/config";
import fs from "node:fs";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Agente do WhatsApp, Fase 2 (turno no Tibé). Spec:
 * docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md.
 * Nenhuma seção chama a OpenAI: o transporte do modelo é substituído.
 * Roda: `npm run test:m68`.
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
  const { INTENTS } = await import("@/lib/whatsapp-intents");
  const { INTENCOES, INTENCOES_FORA_DO_CLASSIFICADOR, DOMINIOS, intencoesDoDominio } = await import("@/lib/agente/intencoes");

  console.log("1. Registro de intenções cobre o Tibé inteiro");
  const registradas = new Set(INTENCOES.map((i) => i.intent));
  for (const intent of INTENTS) {
    if (INTENCOES_FORA_DO_CLASSIFICADOR.includes(intent)) continue;
    check(`${intent} tem definição`, registradas.has(intent));
  }
  check("nenhuma intenção registrada duas vezes", registradas.size === INTENCOES.length);
  for (const d of DOMINIOS) check(`domínio ${d} tem ao menos uma intenção`, intencoesDoDominio(d).length > 0);

  // Cada campo declarado precisa aparecer, pelo nome, no arquivo do handler que atende a intenção.
  // O mapa intenção -> arquivo sai de whatsapp-router.ts (import dos handlers).
  const router = fs.readFileSync("src/lib/actions/whatsapp-router.ts", "utf8");
  for (const def of INTENCOES) {
    const handler = localizarHandler(router, def.intent);
    check(`${def.intent}: handler localizado`, handler !== null, "adicione o mapeamento em localizarHandler");
    if (!handler) continue;
    const fonte = fs.readFileSync(handler, "utf8");
    for (const campo of def.campos) {
      check(`${def.intent}.${campo.nome} é lido pelo handler`, fonte.includes(campo.nome));
    }
    check(`${def.intent}: tem ao menos 2 exemplos`, def.exemplos.length >= 2);
  }

  // O classificador repassa o número e a data como o produtor falou (regra da spec).
  console.log("1b. Handlers leem número e data como o produtor fala");
  const { num } = await import("@/lib/actions/whatsapp-handlers/shared");
  check('num("1.500") é 1500, não 1,5', num("1.500") === 1500, String(num("1.500")));
  check('num("60 mil") é 60000', num("60 mil") === 60000, String(num("60 mil")));
  check('num("2,5") é 2,5', num("2,5") === 2.5, String(num("2,5")));
  check("num(12) segue 12", num(12) === 12);
  check('num("3x") segue null (parcelas caem no extrator)', num("3x") === null, String(num("3x")));
  const { lerDataPrevista } = await import("@/lib/actions/whatsapp-handlers/rebanho");
  const outubro20 = "2026-10-20T00:00:00.000Z";
  check("previsão ISO segue meia-noite UTC", lerDataPrevista("2026-10-20")?.toISOString() === outubro20);
  check('previsão "20/10/2026" vira o mesmo dia', lerDataPrevista("20/10/2026")?.toISOString() === outubro20, lerDataPrevista("20/10/2026")?.toISOString());
  check('previsão "dia 20" vira o dia 20 do mês corrente', lerDataPrevista("dia 20", new Date(2026, 9, 5, 12))?.toISOString() === outubro20);
  check("previsão ilegível devolve null para perguntar", lerDataPrevista("quando der") === null);

  console.log("\n2. Cliente do modelo");
  {
    const { chamarModelo, definirTransporteDoModelo, FalhaDoModelo } = await import("@/lib/agente/modelo");
    let corpoVisto: Record<string, unknown> | null = null;
    let chamadas = 0;
    definirTransporteDoModelo(async (corpo) => {
      corpoVisto = corpo;
      chamadas += 1;
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ ok: true }) } }] } };
    });
    process.env.AGENTE_MODELO = "gpt-4o-mini";
    const r = await chamarModelo<{ ok: boolean }>({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } });
    check("devolve o JSON do conteúdo", r.ok === true);
    const rf = (corpoVisto as unknown as { response_format: { type: string; json_schema: { strict: boolean } } }).response_format;
    check("pede json_schema estrito", rf.type === "json_schema" && rf.json_schema.strict === true);
    check("gpt-4o-mini recebe temperature 0", (corpoVisto as unknown as { temperature?: number }).temperature === 0);

    process.env.AGENTE_MODELO = "gpt-5.6-luna";
    await chamarModelo({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } });
    check("gpt-5 não recebe temperature", !("temperature" in (corpoVisto as unknown as object)));

    chamadas = 0;
    definirTransporteDoModelo(async () => {
      chamadas += 1;
      return { status: 503, json: {} };
    });
    let erro: unknown = null;
    try { await chamarModelo({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: {} }); } catch (e) { erro = e; }
    check("503 tenta de novo uma vez e desiste", chamadas === 2 && erro instanceof FalhaDoModelo);

    definirTransporteDoModelo(async () => ({ status: 200, json: { choices: [{ message: { content: "não é json" } }] } }));
    erro = null;
    try { await chamarModelo({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: {} }); } catch (e) { erro = e; }
    check("conteúdo que não é JSON vira FalhaDoModelo de formato", erro instanceof FalhaDoModelo && (erro as InstanceType<typeof FalhaDoModelo>).motivo === "formato");

    definirTransporteDoModelo(async () => ({ status: 200, json: null }));
    erro = null;
    try { await chamarModelo({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: {} }); } catch (e) { erro = e; }
    check("200 sem corpo vira FalhaDoModelo, não TypeError", erro instanceof FalhaDoModelo, String(erro));

    chamadas = 0;
    definirTransporteDoModelo(async () => {
      chamadas += 1;
      if (chamadas === 1) throw new FalhaDoModelo("http", "rede");
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ ok: true }) } }] } };
    });
    const depoisDaRede = await chamarModelo<{ ok: boolean }>({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: {} }).catch(() => null);
    check("falha de rede tenta de novo uma vez", chamadas === 2 && depoisDaRede?.ok === true);

    chamadas = 0;
    definirTransporteDoModelo(async () => {
      chamadas += 1;
      throw new FalhaDoModelo("tempo", "tempo");
    });
    erro = null;
    try { await chamarModelo({ etapa: "dominio", sistema: "s", usuario: "u", nomeDoSchema: "x", schema: {} }); } catch (e) { erro = e; }
    check("tempo esgotado não tenta de novo", chamadas === 1 && (erro as InstanceType<typeof FalhaDoModelo>)?.motivo === "tempo");
    definirTransporteDoModelo(null);
    process.env.AGENTE_MODELO = "gpt-4o-mini";
  }

  console.log("\n3. Classificação em duas etapas");
  {
    const { definirTransporteDoModelo } = await import("@/lib/agente/modelo");
    const { classificarMensagem, classificarResposta } = await import("@/lib/agente/classificar");
    const { conferirTrechoLiteral } = await import("@/lib/agente/trecho-literal");
    const { VERSAO_DO_PROMPT, promptDeExtracao, promptDeResposta } = await import("@/lib/agente/prompts");

    const vistos: { etapa: string; sistema: string; usuario: string }[] = [];
    definirTransporteDoModelo(async (corpo) => {
      const msgs = corpo.messages as { role: string; content: string }[];
      const nome = (corpo.response_format as { json_schema: { name: string } }).json_schema.name;
      vistos.push({ etapa: nome, sistema: msgs[0].content, usuario: msgs[1].content });
      let conteudo: unknown;
      if (nome === "dominio") {
        conteudo = { pedidos: [{ dominio: "rebanho", trecho: "quantos animais eu tenho" }, { dominio: "financeiro", trecho: "o que tenho a pagar" }] };
      } else if (nome.startsWith("extracao_rebanho")) {
        conteudo = { intent: "consultar_rebanho", parametros: { categoria: null, fazenda: null } };
      } else if (nome.startsWith("extracao_financeiro")) {
        // "category" é campo de registrar_lancamento_financeiro, não de consultar_saldo: não pode vazar.
        // "period" é declarado por consultar_saldo E por gerar_relatorio (mesmo objeto PERIODO); por
        // pertencer também à intenção escolhida, tem que sobreviver mesmo sendo compartilhado.
        conteudo = { intent: "consultar_saldo", parametros: { period: "agosto", category: "sal" } };
      } else {
        conteudo = { tipo: "responde", valor: "Pasto da Sede" };
      }
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify(conteudo) } }] } };
    });

    const pedidos = await classificarMensagem({ texto: "quantos animais eu tenho e o que tenho a pagar", hoje: "2026-09-15", perfis: ["fazenda"] });
    check("dois pedidos, na ordem", pedidos.length === 2 && pedidos[0].intent === "consultar_rebanho" && pedidos[1].intent === "consultar_saldo");
    check("campo de outra intenção do domínio não vaza para o pedido", !("category" in pedidos[1].parameters));
    check("campo compartilhado com outra intenção do domínio sobrevive, por pertencer à escolhida", pedidos[1].parameters.period === "agosto");
    check("nulls não viram parâmetro", Object.keys(pedidos[0].parameters).length === 0);
    check("a extração do rebanho só lista intenções do rebanho", vistos.some((v) => v.etapa.startsWith("extracao_rebanho") && v.sistema.includes("registrar_negocio_gado") && !v.sistema.includes("registrar_producao_leite")));
    check("o prompt de extração não oferece as intenções legadas", !promptDeExtracao("rebanho").sistema.includes("registrar_lote_animal"));
    check("versão do prompt tem 12 caracteres", VERSAO_DO_PROMPT.length === 12);

    const numero = (nome: string) => ({ nome, tipo: "numero" as const, descricao: "" });

    const limpo = conferirTrechoLiteral({ valor: "60 mil", quantidade: 20, comissao: 2000 }, "comprei 20 bezerros por 60 mil", [
      numero("valor"), numero("quantidade"), numero("comissao"),
    ]);
    check("número que não está na mensagem é removido", limpo.removidos.join() === "comissao" && limpo.parameters.valor === "60 mil" && limpo.parameters.quantidade === 20);
    check("1.200 casa com 1200", conferirTrechoLiteral({ valor: 1200 }, "paguei 1.200 no sal", [numero("valor")]).removidos.length === 0);
    check("1.200,50 casa com 1200.5", conferirTrechoLiteral({ valor: 1200.5 }, "paguei 1.200,50", [numero("valor")]).removidos.length === 0);
    check('"60 mil" casa com "por 60 mil"', conferirTrechoLiteral({ valor: "60 mil" }, "por 60 mil", [numero("valor")]).removidos.length === 0);
    check("60000 casa com o \"mil\" de \"por 60 mil\"", conferirTrechoLiteral({ valor: 60000 }, "por 60 mil", [numero("valor")]).removidos.length === 0);
    check(
      "200 NÃO casa com o 1200 de \"comprei 1200 kg de sal\" (substring não vale)",
      conferirTrechoLiteral({ valor: 200 }, "comprei 1200 kg de sal", [numero("valor")]).removidos.join() === "valor",
    );
    check(
      "1200 NÃO casa com o 12,00 de \"paguei 12,00 no sal\" (cem vezes a mais)",
      conferirTrechoLiteral({ valor: 1200 }, "paguei 12,00 no sal", [numero("valor")]).removidos.join() === "valor",
    );
    check(
      "1 NÃO casa com o 15 de \"vacinei dia 15\" (dia não é o valor)",
      conferirTrechoLiteral({ valor: 1 }, "vacinei dia 15", [numero("valor")]).removidos.join() === "valor",
    );
    check(
      "2000 continua removido em \"20 bois por 60 mil\" (caso já coberto, sem regressão)",
      conferirTrechoLiteral({ comissao: 2000 }, "20 bois por 60 mil", [numero("comissao")]).removidos.join() === "comissao",
    );

    const comLista = conferirTrechoLiteral(
      { itens: [{ categoria: "bezerro", quantidade: 20 }, { categoria: "vaca", quantidade: 999 }] },
      "comprei 20 bezerros e algumas vacas",
      [{ nome: "itens", tipo: "lista", descricao: "", itens: [{ nome: "categoria", tipo: "texto", descricao: "" }, numero("quantidade")] }],
    );
    check(
      "quantidade inventada dentro de um item da lista some, o item continua",
      comLista.removidos.join() === "itens.quantidade" &&
        (comLista.parameters.itens as Record<string, unknown>[]).length === 2 &&
        !("quantidade" in (comLista.parameters.itens as Record<string, unknown>[])[1]),
    );

    const listaToda = conferirTrechoLiteral(
      { itens: [{ quantidade: 999 }] },
      "só uma pergunta qualquer",
      [{ nome: "itens", tipo: "lista", descricao: "", itens: [numero("quantidade")] }],
    );
    check(
      "item que fica vazio sai da lista, e lista vazia sai de parameters",
      listaToda.removidos.join() === "itens.quantidade" && !("itens" in listaToda.parameters),
    );

    const r = await classificarResposta({ texto: "Pasto da Sede", pergunta: "De qual pasto?", intent: "registrar_movimentacao_rebanho", campo: "pasto" });
    check("resposta ao campo aberto", r.tipo === "responde");
    check("a leitura da resposta traz o valor do campo", r.valor === "Pasto da Sede", JSON.stringify(r));
    const schemaDaResposta = promptDeResposta().schema as { required: string[]; properties: Record<string, { type: unknown }> };
    check(
      "o schema da resposta exige valor, string ou null",
      schemaDaResposta.required.includes("valor") && JSON.stringify(schemaDaResposta.properties.valor?.type) === JSON.stringify(["string", "null"]),
      JSON.stringify(schemaDaResposta),
    );
    definirTransporteDoModelo(null);
  }

  console.log("\n3b. Classificador nunca perde o pedido");
  {
    const { definirTransporteDoModelo } = await import("@/lib/agente/modelo");
    const { classificarMensagem } = await import("@/lib/agente/classificar");

    let chamadas = 0;
    definirTransporteDoModelo(async () => {
      chamadas += 1;
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ pedidos: [{ dominio: "nenhum", trecho: "sei lá o que você quis dizer" }] }) } }] } };
    });
    const nenhum = await classificarMensagem({ texto: "sei lá o que você quis dizer", hoje: "2026-09-15", perfis: [] });
    check(
      "domínio nenhum vira ambígua sem chamar extração",
      chamadas === 1 && nenhum.length === 1 && nenhum[0].intent === "ambigua" && Object.keys(nenhum[0].parameters).length === 0,
    );

    chamadas = 0;
    definirTransporteDoModelo(async () => {
      chamadas += 1;
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ pedidos: [] }) } }] } };
    });
    const semPedido = await classificarMensagem({ texto: "oi", hoje: "2026-09-15", perfis: [] });
    check("pedidos vazio vira ambígua, nunca lista vazia", semPedido.length === 1 && semPedido[0].intent === "ambigua" && semPedido[0].trecho === "oi");

    definirTransporteDoModelo(async (corpo) => {
      const nome = (corpo.response_format as { json_schema: { name: string } }).json_schema.name;
      const conteudo =
        nome === "dominio"
          ? { pedidos: [{ dominio: "rebanho", trecho: "isso aqui não é nada que eu conheça" }] }
          : { intent: "ambigua", parametros: { categoria: "boi" } };
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify(conteudo) } }] } };
    });
    const extracaoAmbigua = await classificarMensagem({ texto: "isso aqui não é nada que eu conheça", hoje: "2026-09-15", perfis: [] });
    check(
      "extração que devolve ambigua não carrega parâmetro nenhum",
      extracaoAmbigua.length === 1 && extracaoAmbigua[0].intent === "ambigua" && Object.keys(extracaoAmbigua[0].parameters).length === 0,
    );

    // Limpeza: string vazia (ou só espaço), item de lista que fica vazio some, e a lista sobrevive com o item que restou.
    definirTransporteDoModelo(async (corpo) => {
      const nome = (corpo.response_format as { json_schema: { name: string } }).json_schema.name;
      const conteudo =
        nome === "dominio"
          ? { pedidos: [{ dominio: "rebanho", trecho: "nasceram 4 bezerros" }] }
          : {
              intent: "registrar_movimentacao_rebanho",
              parametros: {
                movement_type: "nascimento",
                itens: [{ categoria: "   ", quantidade: null }, { categoria: "bezerro", quantidade: 4 }],
                sentido: "",
                fazenda: null,
              },
            };
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify(conteudo) } }] } };
    });
    const limpeza = await classificarMensagem({ texto: "nasceram 4 bezerros", hoje: "2026-09-15", perfis: [] });
    const itensLimpos = limpeza[0].parameters.itens as Record<string, unknown>[];
    check(
      "string vazia e item vazio somem, o item com dado real sobrevive",
      !("sentido" in limpeza[0].parameters) &&
        !("fazenda" in limpeza[0].parameters) &&
        itensLimpos.length === 1 &&
        itensLimpos[0].categoria === "bezerro" &&
        itensLimpos[0].quantidade === 4,
    );

    // Trecho que o modelo devolveu não é recorte da mensagem: a conferência cai para a mensagem inteira.
    const mensagemDoNegocio = "vendi 10 bois por 500 a vista";
    definirTransporteDoModelo(async (corpo) => {
      const nome = (corpo.response_format as { json_schema: { name: string } }).json_schema.name;
      const conteudo =
        nome === "dominio"
          ? { pedidos: [{ dominio: "rebanho", trecho: "um recorte que o modelo inventou e não existe na mensagem" }] }
          : { intent: "registrar_negocio_gado", parametros: { tipo: "venda", valor: 500 } };
      return { status: 200, json: { choices: [{ message: { content: JSON.stringify(conteudo) } }] } };
    });
    const comTrechoTorto = await classificarMensagem({ texto: mensagemDoNegocio, hoje: "2026-09-15", perfis: [] });
    check(
      "trecho alucinado não derruba o número: a conferência usa a mensagem inteira",
      comTrechoTorto[0].parameters.valor === 500,
    );

    definirTransporteDoModelo(null);
  }

  console.log("\n4. Núcleo e intenção final");
  {
    const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
    const { recordMovement } = await import("@/lib/actions/herd-ledger");
    const { createConfinementSite, openConfinementStay } = await import("@/lib/actions/confinement");
    const { deleteTestTenants } = await import("./helpers/herd");
    const { executarIntencao } = await import("@/lib/actions/executar-intencao");
    const { atualizarCursor, carregarCursor, limparCursor } = await import("@/lib/agente/cursor");
    const { clearPendingHerd } = await import("@/lib/actions/herd-pending");
    const { clearPendingConfinement, loadPendingConfinement } = await import("@/lib/actions/confinamento-pending");

    const stamp = Date.now();
    // Telefone único por execução: a busca de identificarContato é
    // cross-tenant, e o banco de dev tem outros tenants com outros telefones.
    const phoneDono = `11${String(stamp).slice(-9)}`;
    const tenant = await prisma.tenant.create({
      data: { name: `M68 ${stamp}`, document: `M68${stamp}`.slice(0, 14), plan: "fazenda" },
    });
    const db = prismaForTenant(tenant.id);
    let ownerId: string | null = null;
    try {
      await prisma.tenantProfile.create({ data: { tenant_id: tenant.id, profile_type: "fazenda", active: true } });
      const owner = await prisma.user.create({
        data: { tenant_id: tenant.id, name: "Dono M68", email: `m68-${stamp}@teste.local`, password_hash: "x", role: "OWNER", active: true, phone: phoneDono },
      });
      ownerId = owner.id;
      const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M68" }) });
      const pasto = await db.pasture.create({ data: scoped({ property_id: fazenda.id, name: "Pasto M68", area_hectares: 10 }) });
      await recordMovement(db, {
        movement_type: "saldo_inicial",
        quantity: 20,
        to: { category_id: "macho_25_36", property_id: fazenda.id, pasture_id: pasto.id, situation: "presente", owner: "proprio" },
      });
      // Saldo da seção 5 (cursor): a morte ambígua resolve para "Fêmea - 13 a
      // 24 meses", e sem saldo aqui a confirmação vira INSUFFICIENT_BALANCE em
      // vez de executar, o que impediria o "sim" de apagar o cursor.
      await recordMovement(db, {
        movement_type: "saldo_inicial",
        quantity: 5,
        to: { category_id: "femea_13_24", property_id: fazenda.id, pasture_id: pasto.id, situation: "presente", owner: "proprio" },
      });
      const site = await createConfinementSite(db, { name: "Conf M68", type: "proprio", property_id: fazenda.id });
      check("fixture: confinamento criado", site.ok);
      if (site.ok) {
        const estadia = await openConfinementStay(db, { confinement_site_id: site.data.id, category_id: "macho_25_36", quantity: 5, pasture_id: pasto.id });
        check("fixture: lote de 5 aberto no confinamento", estadia.ok);
      }

      const r = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "registrar_negocio_gado", parameters: { tipo: "venda", categoria: "boi", quantidade: 2, valor: 9000 }, message_text: "vendi 2 bois do confinamento por 9 mil", confirmed_do_corpo: null, provider_message_id: null, registrar_entrada: false });
      check("a venda que cita o confinamento sai com intent_final encerrar_confinamento", r.intent_final === "encerrar_confinamento", r.intent_final);

      console.log("\n5. Cursor da conversa");
      // (c) O negócio de confinamento ainda não confirmado deixa o cursor
      // apontando para a intenção final (encerrar_confinamento), não para
      // registrar_negocio_gado: é o que o "sim" solto do produtor precisa achar.
      const cursorDoNegocio = await carregarCursor(tenant.id, owner.id);
      check(
        "venda do confinamento grava cursor com a intenção final",
        cursorDoNegocio?.intent === "encerrar_confinamento" && cursorDoNegocio?.aguardando === "confirmacao",
        JSON.stringify(cursorDoNegocio),
      );
      // Este negócio de confinamento FICA aberto de propósito (não limpa
      // aqui): é o "outro domínio, sem relação nenhuma" do ponto 2 abaixo. A
      // venda que cita o confinamento é roteada para o handler de
      // Confinamento, e o pendente fica em `confinamento-pending`, não em
      // `negocio-pending`.

      // (a) Termo ambíguo com item presente: o handler pergunta a faixa E
      // guarda o pedido (diferente de mandar sem item nenhum, que só pergunta).
      const morteAmbigua = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "registrar_movimentacao_rebanho", parameters: { movement_type: "morte", categoria: "novilha", quantidade: 2, pasto: "Pasto M68" }, message_text: "morreram 2 novilhas", confirmed_do_corpo: null, provider_message_id: "W2", registrar_entrada: false });
      check("morte ambígua pergunta a faixa", morteAmbigua.reply_text.includes("Qual é a idade aproximada?"), morteAmbigua.reply_text);
      const cursorDaCategoria = await carregarCursor(tenant.id, owner.id);
      check(
        "termo ambíguo com item guarda o pedido e move o cursor para 'categoria'",
        cursorDaCategoria?.aguardando === "categoria" && cursorDaCategoria?.intent === "registrar_movimentacao_rebanho",
        JSON.stringify(cursorDaCategoria),
      );

      // (b) A resposta ao campo pendente avança para a confirmação, e o "sim"
      // (sem nada no corpo: a mesma forma que o turno vai usar) executa e
      // apaga o cursor, porque não sobra pedido nenhum aberto.
      const respondeCategoria = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "registrar_movimentacao_rebanho", parameters: { categoria: "Fêmea - 13 a 24 meses" }, message_text: "Fêmea - 13 a 24 meses", confirmed_do_corpo: null, provider_message_id: "W3", registrar_entrada: false });
      check("resposta à categoria leva à confirmação", respondeCategoria.requires_confirmation === true, respondeCategoria.reply_text);
      const cursorDaConfirmacao = await carregarCursor(tenant.id, owner.id);
      check("cursor acompanha para 'confirmacao'", cursorDaConfirmacao?.aguardando === "confirmacao", JSON.stringify(cursorDaConfirmacao));

      const simSolto = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "registrar_movimentacao_rebanho", parameters: {}, message_text: "sim", confirmed_do_corpo: null, provider_message_id: "W4", registrar_entrada: false });
      check("o 'sim' executa a morte guardada", simSolto.action_taken === "registrar_movimentacao_rebanho:morte", simSolto.reply_text);

      // Ponto 2 (rodada de correção 1): o negócio do confinamento (passo c),
      // sem relação nenhuma com o rebanho, continua aberto, e MESMO ASSIM o
      // cursor apaga: ele aponta para o PRÓPRIO pedido (herd-pending), que
      // acabou de ser executado e limpo, não para "sobra alguma coisa aberta
      // em algum lugar". Antes desta correção, o confinamento aberto mantinha
      // o cursor preso na pergunta do rebanho que o "sim" já tinha resolvido.
      const confinamentoAindaAberto = await loadPendingConfinement(tenant.id, owner.id);
      check("o negócio do confinamento continua aberto, sem relação com o rebanho", confinamentoAindaAberto !== null);
      check(
        "e mesmo assim o cursor apaga, porque o PRÓPRIO pedido dele sumiu",
        (await carregarCursor(tenant.id, owner.id)) === null,
      );

      // Ponto 4: (d) precisa começar com um cursor PRÉ-EXISTENTE para provar
      // que a chamada realmente apaga, e não que já estava vazio por acaso.
      // Uma pergunta descartável de rebanho planta o cursor; limpamos o
      // pendente por fora (sem passar pelo roteador de novo) para simular um
      // domínio que expirou ou foi resolvido de outro jeito, deixando o
      // cursor bandeira, apontando pra um prefixo que não existe mais.
      const plantaCursor = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "registrar_movimentacao_rebanho", parameters: { movement_type: "morte", categoria: "novilha", quantidade: 1, pasto: "Pasto M68" }, message_text: "morreu 1 novilha", confirmed_do_corpo: null, provider_message_id: "W5", registrar_entrada: false });
      check("planta um cursor novo (fixture do próximo caso)", plantaCursor.reply_text.includes("Qual é a idade aproximada?"), plantaCursor.reply_text);
      const cursorPlantado = await carregarCursor(tenant.id, owner.id);
      check("cursor plantado de fato", cursorPlantado?.prefixo === "herd-pending", JSON.stringify(cursorPlantado));
      await clearPendingHerd(tenant.id, owner.id);
      await clearPendingConfinement(tenant.id, owner.id);

      const s = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "consultar_rebanho", parameters: {}, message_text: "quantos animais", confirmed_do_corpo: null, provider_message_id: "W1", registrar_entrada: false });
      const replay = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "consultar_rebanho", parameters: {}, message_text: "quantos animais", confirmed_do_corpo: null, provider_message_id: "W1", registrar_entrada: false });
      check("replay pelo núcleo", replay.replay === true && replay.reply_text === s.reply_text);

      // (d) Consulta, sem pedido aberto em lugar nenhum: APAGA o cursor
      // plantado (nada aqui seria verdade se `atualizarCursor` não fizesse
      // nada, porque o cursor JÁ havia sido gravado no passo anterior).
      check("consulta sem pedido aberto apaga o cursor plantado", (await carregarCursor(tenant.id, owner.id)) === null);

      console.log("\n5b. Cursor nunca trava a resposta nem impede o AgentRequest");
      {
        // Fake mínimo: `atualizarCursorSemLimite` só chama
        // `db.agentFlowState.findFirst`, nunca mais nada em `db`. Travar só
        // ISSO (em vez de proxyar o `db` de verdade) evita travar também o
        // `handleActiveFlow` que `routeIntent` roda com o MESMO `db`, o que
        // travaria o teste inteiro em vez de só o cursor.
        const dbSoParaFlowTravado = {
          agentFlowState: { findFirst: () => new Promise(() => {}) },
        } as unknown as typeof db;
        const cursorComFlowTravado: typeof atualizarCursor = (input) =>
          atualizarCursor({ ...input, db: dbSoParaFlowTravado });

        const avisos: string[] = [];
        const warnOriginal = console.warn;
        console.warn = (msg?: unknown) => {
          avisos.push(String(msg));
        };

        const t0 = Date.now();
        let resiliente: Awaited<ReturnType<typeof executarIntencao>>;
        try {
          resiliente = await executarIntencao({
            db,
            tenant_id: tenant.id,
            user: { id: owner.id, role: owner.role },
            contato_id: null,
            activeProfiles: ["fazenda"],
            intent: "consultar_rebanho",
            parameters: {},
            message_text: "quantos animais eu tenho",
            confirmed_do_corpo: null,
            provider_message_id: "W6",
            registrar_entrada: false,
            _atualizarCursorParaTeste: cursorComFlowTravado,
          });
        } finally {
          console.warn = warnOriginal;
        }
        const duracao = Date.now() - t0;

        check(
          "responde mesmo com o cursor travado, sem esperar os 500ms virarem 504 na rota",
          duracao < 2000,
          `${duracao}ms`,
        );
        check(
          "loga o tempo esgotado do cursor, não silencia e não quebra a resposta",
          avisos.some((a) => a.includes("cursor da conversa: tempo esgotado")),
        );
        const registroGravado = await prisma.agentRequest.findFirst({
          where: { provider_message_id: "W6#consultar_rebanho" },
        });
        check("o AgentRequest foi gravado mesmo com o cursor travado", registroGravado !== null, resiliente!.reply_text);
      }

      console.log("\n5c. Cursor entende o cadastro assistido (AgentFlowState)");
      {
        const assistido = await prisma.user.create({
          data: {
            tenant_id: tenant.id,
            name: "Assistido M68",
            email: `m68-assistido-${stamp}@teste.local`,
            password_hash: "x",
            role: "OWNER",
            active: true,
          },
        });
        const base = {
          db,
          tenant_id: tenant.id,
          user: { id: assistido.id, role: assistido.role },
          contato_id: null,
          activeProfiles: ["fazenda"] as ("fazenda" | "prestador")[],
          confirmed_do_corpo: null,
          registrar_entrada: false,
        };

        const abre = await executarIntencao({ ...base, intent: "cadastrar_animal", parameters: {}, message_text: "quero cadastrar um animal", provider_message_id: "A1" });
        check("abre o cadastro assistido, perguntando o primeiro campo", abre.reply_text.includes("brinco"), abre.reply_text);
        const cursorDoCampo = await carregarCursor(tenant.id, assistido.id);
        check(
          "flow fresco em campo: prefixo 'flow', aguardando o campo, intent forçado a cadastrar_animal",
          cursorDoCampo?.prefixo === "flow" &&
            cursorDoCampo?.aguardando === "ear_tag" &&
            cursorDoCampo?.intent === "cadastrar_animal",
          JSON.stringify(cursorDoCampo),
        );

        await executarIntencao({ ...base, intent: "cadastrar_animal", parameters: {}, message_text: "099", provider_message_id: "A2" });
        await executarIntencao({ ...base, intent: "cadastrar_animal", parameters: {}, message_text: "Nelore", provider_message_id: "A3" });
        await executarIntencao({ ...base, intent: "cadastrar_animal", parameters: {}, message_text: "macho", provider_message_id: "A4" });
        const ultimoCampo = await executarIntencao({ ...base, intent: "cadastrar_animal", parameters: {}, message_text: "Macho - 25 a 36 meses", provider_message_id: "A5" });
        check("o último campo fecha o item e abre o resumo", ultimoCampo.reply_text.includes("Confere antes de eu salvar"), ultimoCampo.reply_text);

        const cursorDoResumo = await carregarCursor(tenant.id, assistido.id);
        check(
          "flow no resumo: prefixo 'flow', aguardando 'confirmacao', intent forçado a cadastrar_animal",
          cursorDoResumo?.prefixo === "flow" &&
            cursorDoResumo?.aguardando === "confirmacao" &&
            cursorDoResumo?.intent === "cadastrar_animal",
          JSON.stringify(cursorDoResumo),
        );

        // Descarta sem confirmar: não faz parte deste teste gravar o animal de verdade.
        await db.agentFlowState.deleteMany({ where: { user_id: assistido.id } });
        await limparCursor(tenant.id, assistido.id);
      }

      console.log("\n6. Identificação do contato extraída para action");
      {
        const { identificarContato } = await import("@/lib/actions/whatsapp-contato");

        const primeira = await identificarContato(phoneDono);
        check("primeira chamada identifica o dono", primeira.identificado === true, JSON.stringify(primeira));
        check(
          "primeira chamada é o primeiro contato",
          primeira.identificado === true && primeira.primeiro_contato === true,
        );
        check(
          "primeira chamada devolve o tenant e o usuário certos",
          primeira.identificado === true && primeira.tenant_id === tenant.id && primeira.user.id === owner.id,
        );

        const segunda = await identificarContato(phoneDono);
        check("segunda chamada continua identificando o dono", segunda.identificado === true);
        check(
          "segunda chamada não é mais primeiro contato",
          segunda.identificado === true && segunda.primeiro_contato === false,
        );
      }

      console.log("\n7. Turno no Tibé");
      {
        const { executarTurno } = await import("@/lib/actions/turno");
        const { definirTransporteDoModelo } = await import("@/lib/agente/modelo");
        const { VERSAO_DO_PROMPT } = await import("@/lib/agente/prompts");
        const { ensureProductCategories, listProductCategories, createProduct } = await import("@/lib/actions/products");
        const { adjustStock } = await import("@/lib/actions/stock-ledger");

        // Responde pelo nome do schema; uma lista responde uma chamada por item, na ordem.
        const chamadas: string[] = [];
        let respostas: Record<string, unknown> = {};
        let statusDoModelo = 200;
        definirTransporteDoModelo(async (corpo) => {
          const nome = (corpo.response_format as { json_schema: { name: string } }).json_schema.name;
          chamadas.push(nome);
          if (statusDoModelo !== 200) return { status: statusDoModelo, json: {} };
          const r = respostas[nome];
          const conteudo = Array.isArray(r) ? r.shift() : r;
          return { status: 200, json: { choices: [{ message: { content: JSON.stringify(conteudo) } }] } };
        });
        const prepara = (r: Record<string, unknown>) => {
          respostas = r;
          chamadas.length = 0;
        };
        const turno = (texto: string, provider_message_id: string | null, extra: Partial<Parameters<typeof executarTurno>[0]> = {}) =>
          executarTurno({ telefone: phoneDono, texto, provider_message_id, ...extra });
        const FRASE_DE_FALHA = "Não consegui entender agora. Pode mandar de novo daqui a pouco?";

        try {
          // (a) duas perguntas numa mensagem: duas respostas, na ordem.
          prepara({
            dominio: { pedidos: [{ dominio: "rebanho", trecho: "quantos animais eu tenho" }, { dominio: "conversa", trecho: "o que tenho a pagar" }] },
            extracao_rebanho: { intent: "consultar_rebanho", parametros: {} },
            extracao_conversa: { intent: "resumo", parametros: { scope: "contas_a_pagar" } },
          });
          const textoA = "quantos animais eu tenho e o que tenho a pagar";
          const a = await turno(textoA, "T7a");
          check("(a) duas mensagens", a.mensagens.length === 2 && a.replay === false, JSON.stringify(a));
          check("(a) a primeira é o total do rebanho", a.mensagens[0]?.texto === s.reply_text, a.mensagens[0]?.texto);
          check("(a) total com número não pode ser humanizado", a.mensagens[0]?.pode_humanizar === false);
          check("(a) a segunda responde as contas a pagar, sem número, e pode ser humanizada", !!a.mensagens[1]?.texto.includes("pagar") && a.mensagens[1]?.pode_humanizar === true, JSON.stringify(a.mensagens[1]));

          // (g) log de entrada uma vez, com a versão do prompt.
          const entradas = await db.agentConversationLog.findMany({ where: { direction: "in", content: textoA } });
          check("(g) log de entrada gravado uma vez só", entradas.length === 1, String(entradas.length));
          check("(g) log de entrada com prompt_version", entradas[0]?.prompt_version === VERSAO_DO_PROMPT, entradas[0]?.prompt_version ?? "null");

          // (d) reenvio do mesmo wamid: as mesmas mensagens, sem modelo.
          prepara({});
          const d = await turno(textoA, "T7a");
          check("(d) replay devolve as mesmas mensagens", d.replay === true && d.mensagens.length === a.mensagens.length && d.mensagens.every((m, i) => m.texto === a.mensagens[i].texto && m.pode_humanizar === a.mensagens[i].pode_humanizar && m.report_url === a.mensagens[i].report_url), JSON.stringify(d));
          check("(d) replay não chama o modelo", chamadas.length === 0, chamadas.join());

          // Dois pedidos da mesma intenção não colidem na chave do núcleo.
          prepara({
            dominio: { pedidos: [{ dominio: "rebanho", trecho: "quantos animais eu tenho" }, { dominio: "rebanho", trecho: "quantas fêmeas de 13 a 24 meses" }] },
            extracao_rebanho: [
              { intent: "consultar_rebanho", parametros: {} },
              { intent: "consultar_rebanho", parametros: { categoria: "fêmeas de 13 a 24 meses" } },
            ],
          });
          const dup = await turno("quantos animais eu tenho e quantas fêmeas de 13 a 24 meses", "T7dup");
          check(
            "dois pedidos da mesma intenção devolvem duas respostas diferentes, não replay da primeira",
            dup.mensagens.length === 2 && dup.mensagens[0].texto === s.reply_text && dup.mensagens[1].texto.startsWith("Você possui"),
            JSON.stringify(dup.mensagens),
          );

          // (b) pergunta da faixa, resposta curta pelo cursor, "não" sem modelo.
          const morteAmbigua = {
            dominio: { pedidos: [{ dominio: "rebanho", trecho: "morreram 2 novilhas no Pasto M68" }] },
            extracao_rebanho: { intent: "registrar_movimentacao_rebanho", parametros: { movement_type: "morte", itens: [{ categoria: "novilha", quantidade: 2 }], pasto_origem: "Pasto M68" } },
          };
          prepara(morteAmbigua);
          const b1 = await turno("morreram 2 novilhas no Pasto M68", "T7b1");
          check("(b) pergunta a faixa", !!b1.mensagens[0]?.texto.includes("Qual é a idade aproximada?"), JSON.stringify(b1.mensagens));
          check("(b) a pergunta não pode ser humanizada", b1.mensagens.length === 1 && b1.mensagens[0].pode_humanizar === false);

          prepara({ resposta: { tipo: "responde", valor: "Fêmea - 13 a 24 meses" } });
          const b2 = await turno("Fêmea - 13 a 24 meses", "T7b2");
          const cursorB2 = await carregarCursor(tenant.id, owner.id);
          check("(b) a resposta da faixa chega à confirmação", cursorB2?.aguardando === "confirmacao" && b2.mensagens[0]?.pode_humanizar === false, JSON.stringify({ b2, cursorB2 }));
          check("(b) sem chamar a etapa de domínio", chamadas.join() === "resposta", chamadas.join());

          prepara({});
          const movimentosAntesDoNao = await db.herdMovement.count();
          const b3 = await turno("não", "T7b3");
          check("(b) o 'não' cancela", b3.mensagens.length === 1 && b3.mensagens[0].texto === "Tudo bem, não registrei nada." && (await carregarCursor(tenant.id, owner.id)) === null, JSON.stringify(b3));
          check("(b) o 'não' não grava movimentação", (await db.herdMovement.count()) === movimentosAntesDoNao);
          check("(b) o 'não' não chama o modelo", chamadas.length === 0, chamadas.join());

          // (c) cursor aberto, outro assunto: classifica de novo.
          prepara(morteAmbigua);
          await turno("morreram 2 novilhas no Pasto M68", "T7c1");
          prepara({
            resposta: { tipo: "outro_assunto", valor: null },
            dominio: { pedidos: [{ dominio: "estoque", trecho: "quanto tenho de sal?" }] },
            extracao_estoque: { intent: "consultar_estoque", parametros: { produto: "sal" } },
          });
          const c = await turno("quanto tenho de sal?", "T7c2");
          check("(c) outro assunto passa pela resposta e classifica de novo", chamadas.join() === "resposta,dominio,extracao_estoque", chamadas.join());
          check("(c) responde o estoque", c.mensagens.length === 1 && c.mensagens[0].texto.includes("estoque"), JSON.stringify(c.mensagens));
          await clearPendingHerd(tenant.id, owner.id);
          await limparCursor(tenant.id, owner.id);

          // Estoque com dois produtos: "usei 2 sacas" sem produto pergunta "Qual produto?", sem dígito.
          await ensureProductCategories(db);
          const [categoriaDeProduto] = await listProductCategories(db);
          for (const nome of ["Sal", "Ração"]) {
            const criado = await createProduct(db, { name: nome, category_id: categoriaDeProduto.id, unit: "saca" });
            check(`fixture: produto ${nome}`, criado.ok);
            if (criado.ok) {
              await adjustStock(db, { product_id: criado.data.id, property_id: fazenda.id, corrected_balance: 20, reason: "fixture M68", recorded_by_user_id: owner.id });
            }
          }
          const usoSemProduto = {
            dominio: { pedidos: [{ dominio: "estoque", trecho: "usei 2 sacas" }] },
            extracao_estoque: { intent: "registrar_uso_estoque", parametros: { quantidade: 2 } },
          };
          prepara(usoSemProduto);
          const qualProduto = await turno("usei 2 sacas", "T7u1");
          const cursorDoProduto = await carregarCursor(tenant.id, owner.id);
          check(
            "fixture: o uso sem produto pergunta o produto e abre o cursor",
            !!qualProduto.mensagens[0]?.texto.startsWith("Qual produto?") && cursorDoProduto?.aguardando === "produto",
            JSON.stringify({ qualProduto, cursorDoProduto }),
          );
          check("pergunta de campo sem dígito não pode ser humanizada", qualProduto.mensagens[0]?.pode_humanizar === false, JSON.stringify(qualProduto.mensagens[0]));

          const movimentosDeEstoque = await db.stockMovement.count();
          prepara({
            resposta: { tipo: "responde", valor: "quanto tenho de sal?" },
            dominio: { pedidos: [{ dominio: "estoque", trecho: "quanto tenho de sal?" }] },
            extracao_estoque: { intent: "consultar_estoque", parametros: { produto: "sal" } },
          });
          const perguntaNoMeio = await turno("quanto tenho de sal?", "T7u2");
          check("pergunta lida por engano como resposta não grava o uso", (await db.stockMovement.count()) === movimentosDeEstoque, JSON.stringify(perguntaNoMeio));
          check("e segue para a classificação", chamadas.join() === "resposta,dominio,extracao_estoque", chamadas.join());

          prepara({
            resposta: { tipo: "responde", valor: "Sal" },
            dominio: { pedidos: [{ dominio: "nenhum", trecho: "o de sempre" }] },
          });
          await turno("o de sempre", "T7u3");
          check("valor que não é recorte da mensagem não grava o uso", (await db.stockMovement.count()) === movimentosDeEstoque);
          check("e segue para a classificação", chamadas.join() === "resposta,dominio", chamadas.join());

          prepara({ resposta: { tipo: "responde", valor: "sal" } });
          const respostaDeVerdade = await turno("é o Sal", "T7u4");
          check(
            "resposta literal ao campo preenche o produto e grava o uso",
            (await db.stockMovement.count()) === movimentosDeEstoque + 1 && chamadas.join() === "resposta",
            JSON.stringify(respostaDeVerdade),
          );
          await limparCursor(tenant.id, owner.id);

          // Erro inesperado no segundo pedido: a primeira resposta não some, e o turno não é gravado.
          // O byte nulo na data volta no texto da pergunta, e o Postgres recusa gravar o log de saída.
          prepara({
            dominio: { pedidos: [{ dominio: "rebanho", trecho: "quantos animais eu tenho" }, { dominio: "estoque", trecho: "usei 2 sacas de sal" }] },
            extracao_rebanho: { intent: "consultar_rebanho", parametros: {} },
            extracao_estoque: { intent: "registrar_uso_estoque", parametros: { produto: "Sal", quantidade: 2, data: "ontem " } },
          });
          const quebraNoMeio = await turno("quantos animais eu tenho e usei 2 sacas de sal", "T7i");
          check(
            "falha interna depois de um pedido devolve o que já foi feito, seguido da frase de falha",
            quebraNoMeio.mensagens.length === 2 && quebraNoMeio.mensagens[0].texto === s.reply_text && quebraNoMeio.mensagens[1].texto === FRASE_DE_FALHA,
            JSON.stringify(quebraNoMeio),
          );
          check("falha interna não grava o AgentRequest do turno", (await db.agentRequest.findFirst({ where: { provider_message_id: "T7i#turno" } })) === null);
          const saidaInterna = await db.agentConversationLog.findFirst({ where: { direction: "out", action_taken: "turno:falha_interna" } });
          check("falha interna vai para o log de saída", saidaInterna?.content === FRASE_DE_FALHA);
          const { clearPendingStock } = await import("@/lib/actions/stock-pending");
          await clearPendingStock(tenant.id, owner.id);
          await limparCursor(tenant.id, owner.id);

          // (e) modelo fora do ar: frase de falha, sem gravar o turno, e o reenvio tenta de novo.
          prepara({});
          statusDoModelo = 503;
          const e = await turno("quantos animais eu tenho", "T7e");
          statusDoModelo = 200;
          check("(e) devolve a frase de falha", e.mensagens.length === 1 && e.mensagens[0].texto === FRASE_DE_FALHA && e.mensagens[0].pode_humanizar === false, JSON.stringify(e));
          check("(e) tentou o modelo duas vezes", chamadas.length === 2, chamadas.join());
          check("(e) não grava o AgentRequest do turno", (await db.agentRequest.findFirst({ where: { provider_message_id: "T7e#turno" } })) === null);
          const saidaDaFalha = await db.agentConversationLog.findFirst({ where: { direction: "out", content: FRASE_DE_FALHA }, orderBy: { created_at: "desc" } });
          check("(e) log de saída com o motivo", saidaDaFalha?.action_taken === "turno:falha_do_modelo:http", saidaDaFalha?.action_taken ?? "null");
          prepara({ dominio: { pedidos: [{ dominio: "rebanho", trecho: "quantos animais eu tenho" }] }, extracao_rebanho: { intent: "consultar_rebanho", parametros: {} } });
          const eDeNovo = await turno("quantos animais eu tenho", "T7e");
          check("(e) o reenvio depois da falha processa de verdade", eDeNovo.replay === false && eDeNovo.mensagens[0]?.texto === s.reply_text, JSON.stringify(eDeNovo));

          // (f) recibo: direto para a confirmação do lançamento, sem modelo.
          prepara({});
          const f = await turno("", "T7f", { recibo: { amount: 150, category: null, vendor: "Posto M68", description: null } });
          const cursorF = await carregarCursor(tenant.id, owner.id);
          check("(f) recibo vai para a confirmação do lançamento", cursorF?.intent === "registrar_lancamento_financeiro" && cursorF?.aguardando === "confirmacao" && f.mensagens[0]?.pode_humanizar === false, JSON.stringify({ f, cursorF }));
          check("(f) recibo não chama o modelo", chamadas.length === 0, chamadas.join());
          const lancamentosAntes = await db.financialEntry.count();
          const legendaSim = await turno("sim", "T7f1", { recibo: { amount: 90 } });
          check(
            "recibo com legenda 'sim' não confirma o lançamento anterior",
            (await db.financialEntry.count()) === lancamentosAntes && legendaSim.mensagens[0]?.pode_humanizar === false,
            JSON.stringify(legendaSim),
          );

          // Cursor esperando confirmação e texto que não é sim nem não: classifica direto, sem a etapa de resposta.
          prepara({
            dominio: { pedidos: [{ dominio: "estoque", trecho: "quanto tenho de sal?" }] },
            extracao_estoque: { intent: "consultar_estoque", parametros: { produto: "sal" } },
          });
          await turno("quanto tenho de sal?", "T7f2");
          check("confirmação aberta e outro texto não chama a etapa de resposta", chamadas.join() === "dominio,extracao_estoque", chamadas.join());
          prepara({});
          const fNao = await turno("não", "T7f3");
          check("o 'não' seguinte cancela o lançamento, sem modelo", fNao.mensagens[0]?.texto === "Lançamento cancelado." && chamadas.length === 0, JSON.stringify(fNao));

          // Primeiro contato: saudação, gravada para o reenvio repetir a saudação.
          const phoneNovo = `12${String(stamp).slice(-9)}`;
          await prisma.user.create({
            data: { tenant_id: tenant.id, name: "Novo M68", email: `m68-novo-${stamp}@teste.local`, password_hash: "x", role: "OPERADOR", active: true, phone: phoneNovo },
          });
          prepara({});
          const oi = await executarTurno({ telefone: phoneNovo, texto: "oi", provider_message_id: "T7p" });
          check("primeiro contato devolve a saudação", oi.mensagens.length === 1 && oi.mensagens[0].texto.includes("Bem-vindo"), JSON.stringify(oi));
          const oiDeNovo = await executarTurno({ telefone: phoneNovo, texto: "oi", provider_message_id: "T7p" });
          check("reenvio do primeiro contato repete a saudação, sem modelo", oiDeNovo.replay === true && oiDeNovo.mensagens[0]?.texto === oi.mensagens[0].texto && chamadas.length === 0, JSON.stringify(oiDeNovo));

          process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "segredo-m68";
          const { POST } = await import("@/app/api/internal/whatsapp/turno/route");
          const semTexto = await POST(
            new Request("http://localhost/api/internal/whatsapp/turno", {
              method: "POST",
              headers: { "content-type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET },
              body: JSON.stringify({ telefone: phoneDono, texto: "   ", provider_message_id: "T7r" }),
            }),
          );
          const corpoSemTexto = (await semTexto.json()) as { error?: { message?: string } };
          check("rota recusa texto vazio sem recibo, em português", semTexto.status === 422 && corpoSemTexto.error?.message === "Mande o texto da mensagem ou um recibo.", JSON.stringify(corpoSemTexto));

          const estranho = await executarTurno({ telefone: `19${String(stamp).slice(-9)}`, texto: "oi", provider_message_id: "T7x" });
          check("número não cadastrado recebe uma mensagem", estranho.mensagens.length === 1 && estranho.mensagens[0].texto.includes("não está cadastrado"), JSON.stringify(estranho));
        } finally {
          definirTransporteDoModelo(null);
        }
      }
    } finally {
      if (ownerId) {
        await clearPendingHerd(tenant.id, ownerId);
        await clearPendingConfinement(tenant.id, ownerId);
        const { clearPendingFinance } = await import("@/lib/actions/finance-pending");
        await clearPendingFinance(tenant.id, ownerId);
        await limparCursor(tenant.id, ownerId);
      }
      // WhatsAppContact criado na seção 6 não precisa de limpeza própria: a
      // relação com Tenant é onDelete: Cascade (schema.prisma), então
      // deleteTestTenants (abaixo) já leva o contato junto.
      await prisma.user.deleteMany({ where: { tenant_id: tenant.id } });
      await deleteTestTenants([tenant.id]);
    }
  }
}

/**
 * Descobre o arquivo do handler de uma intenção lendo o roteador: a tabela
 * `intent -> função` (o Record `HANDLERS`) e os imports
 * `from "@/lib/actions/whatsapp-handlers/<arquivo>"`.
 *
 * A tabela tem duas formas de linha: `intent: funcao,` (nome diferente) e a
 * forma curta `intent,` (import cujo nome já É o da intenção, caso de
 * `ajuda` e `resumo`). Sem a segunda forma, as duas intenções desta tarefa
 * não seriam localizadas.
 */
function localizarHandler(router: string, intent: string): string | null {
  const linhaDaTabela = router.split("\n").find((l) => new RegExp(`^\\s*${intent}\\s*[,:]`).test(l));
  if (!linhaDaTabela) return null;
  const funcao = linhaDaTabela.match(/:\s*([A-Za-z0-9_]+)/)?.[1] ?? intent;
  const imp = router.match(new RegExp(`import\\s*\\{[^}]*\\b${funcao}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`));
  if (!imp) return null;
  const caminho = imp[1].replace("@/", "src/");
  return fs.existsSync(`${caminho}.ts`) ? `${caminho}.ts` : null;
}

main()
  .then(() => {
    console.log(falhas === 0 ? "\n✅ M68: 0 falhas." : `\n❌ M68: ${falhas} falha(s).`);
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error("\n❌ M68 quebrou:", e);
    process.exit(1);
  });
