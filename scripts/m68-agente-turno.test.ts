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
    const { VERSAO_DO_PROMPT, promptDeExtracao } = await import("@/lib/agente/prompts");

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
        conteudo = { tipo: "responde" };
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

    const stamp = Date.now();
    const tenant = await prisma.tenant.create({
      data: { name: `M68 ${stamp}`, document: `M68${stamp}`.slice(0, 14), plan: "fazenda" },
    });
    const db = prismaForTenant(tenant.id);
    try {
      await prisma.tenantProfile.create({ data: { tenant_id: tenant.id, profile_type: "fazenda", active: true } });
      const owner = await prisma.user.create({
        data: { tenant_id: tenant.id, name: "Dono M68", email: `m68-${stamp}@teste.local`, password_hash: "x", role: "OWNER", active: true },
      });
      const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M68" }) });
      const pasto = await db.pasture.create({ data: scoped({ property_id: fazenda.id, name: "Pasto M68", area_hectares: 10 }) });
      await recordMovement(db, {
        movement_type: "saldo_inicial",
        quantity: 20,
        to: { category_id: "macho_25_36", property_id: fazenda.id, pasture_id: pasto.id, situation: "presente", owner: "proprio" },
      });
      const site = await createConfinementSite(db, { name: "Conf M68", type: "proprio", property_id: fazenda.id });
      if (site.ok) {
        await openConfinementStay(db, { confinement_site_id: site.data.id, category_id: "macho_25_36", quantity: 5, pasture_id: pasto.id });
      }

      const r = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "registrar_negocio_gado", parameters: { tipo: "venda", categoria: "boi", quantidade: 2, valor: 9000 }, message_text: "vendi 2 bois do confinamento por 9 mil", confirmed_do_corpo: null, provider_message_id: null, registrar_entrada: false });
      check("a venda que cita o confinamento sai com intent_final encerrar_confinamento", r.intent_final === "encerrar_confinamento", r.intent_final);
      const s = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "consultar_rebanho", parameters: {}, message_text: "quantos animais", confirmed_do_corpo: null, provider_message_id: "W1", registrar_entrada: false });
      const replay = await executarIntencao({ db, tenant_id: tenant.id, user: { id: owner.id, role: owner.role }, contato_id: null, activeProfiles: ["fazenda"], intent: "consultar_rebanho", parameters: {}, message_text: "quantos animais", confirmed_do_corpo: null, provider_message_id: "W1", registrar_entrada: false });
      check("replay pelo núcleo", replay.replay === true && replay.reply_text === s.reply_text);
    } finally {
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
