import "dotenv/config";
import { prisma, prismaForTenant, scoped, type TenantPrismaClient } from "@/lib/prisma";
import {
  registrarNegocioGado,
  _montarParcelas,
  _custosDosParametros,
} from "@/lib/actions/whatsapp-handlers/negociacao";
import {
  clearPendingNegotiation,
  loadPendingNegotiation,
} from "@/lib/actions/negotiation-pending";
import { desempatarIntencao, routeIntent } from "@/lib/actions/whatsapp-router";
import { getPositions, recordMovement } from "@/lib/actions/herd-ledger";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";

/**
 * Módulo 31: registro de negócio de gado pelo WhatsApp (§18).
 *
 * O que este arquivo protege são as três regras que já falharam em produção no
 * Módulo 30, agora num caminho que grava rebanho E financeiro de uma vez:
 * recusa vence tudo, confirmação é sempre obrigatória, e o "sim" executa o que
 * foi MOSTRADO. Cada uma delas custou uma rodada de teste com o usuário.
 *
 * Roda: `npm run test:m36`
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.error(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}


function ctx(
  db: TenantPrismaClient,
  tenantId: string,
  parameters: Record<string, unknown>,
  opts: { confirmed?: boolean; explicitNo?: boolean; userId?: string } = {},
): HandlerCtx {
  return {
    db,
    tenant_id: tenantId,
    role: "OWNER",
    activeProfiles: ["fazenda"],
    parameters,
    confirmed: opts.confirmed ?? false,
    explicitNo: opts.explicitNo ?? false,
    user_id: opts.userId,
  };
}

async function main() {
  console.log("💬 Módulo 31: negócio de gado pelo WhatsApp (§18)\n");

  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "M36 Negocio Whats", document: `36${stamp}0`, plan: "fazenda" },
  });

  // O perfil ativo e checado pela ROTA, nao pelo handler: sem ele o teste de
  // rota recebe 'requer o perfil Fazenda' e nada do resto e exercitado.
  await prisma.tenantProfile.create({
    data: { tenant_id: tenant.id, profile_type: "fazenda", active: true },
  });

  const usuario = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "Produtor de Teste",
      email: `m36-${stamp}@teste.local`,
      password_hash: "x",
      role: "OWNER",
    },
  });
  const USUARIO = usuario.id;

  try {
    const db = prismaForTenant(tenant.id);
    const fazenda = await db.property.create({
      data: scoped({ name: "Fazenda Boa Vista" }),
    });
    await clearPendingNegotiation(tenant.id, USUARIO);

    // ------------------------------------------------------------------
    console.log("\n1. Funções puras: parcelas e custos");
    // ------------------------------------------------------------------

    const p3 = _montarParcelas(60000, 3, new Date("2026-08-13T12:00:00Z"));
    check("3 parcelas geradas", p3.length === 3, String(p3.length));
    check(
      "a soma das parcelas bate exatamente com o total",
      p3.reduce((s, x) => s + x.amount, 0) === 60000,
      String(p3.reduce((s, x) => s + x.amount, 0)),
    );
    check("primeira parcela vence no mês seguinte", p3[0].due_date.getMonth() === 8, String(p3[0].due_date));

    // O caso que a divisão simples erra: 100 / 3 = 33,333...
    const p3quebrado = _montarParcelas(100, 3, new Date("2026-08-13T12:00:00Z"));
    check(
      "divisão inexata: a soma continua exata (a última parcela absorve o centavo)",
      p3quebrado.reduce((s, x) => s + x.amount, 0) === 100,
      JSON.stringify(p3quebrado.map((x) => x.amount)),
    );

    check(
      "custo plano: 'com 2 mil de frete'",
      _custosDosParametros({ frete: 2000 })[0]?.valor === 2000,
    );
    check(
      "custo estruturado: lista com descrição",
      _custosDosParametros({ custos: [{ descricao: "Comissão", valor: 1500 }] })[0]?.descricao ===
        "Comissão",
    );
    check("custo zero é ignorado", _custosDosParametros({ frete: 0 }).length === 0);

    // ------------------------------------------------------------------
    console.log("\n2. Confirmação é obrigatória, e nada é gravado antes dela");
    // ------------------------------------------------------------------

    const pergunta = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "bezerro", quantidade: 20, valor: 60000 }),
    );
    check("pede confirmação", pergunta.requires_confirmation === true, pergunta.reply_text);
    check(
      "mostra o que vai ser escrito, com valor",
      pergunta.reply_text.includes("20 bezerros") && pergunta.reply_text.includes("60.000"),
      pergunta.reply_text,
    );
    check(
      "avisa que vai mexer no rebanho e no financeiro",
      pergunta.reply_text.includes("rebanho") && pergunta.reply_text.includes("financeiro"),
      pergunta.reply_text,
    );
    check(
      "NADA foi gravado antes do sim",
      (await db.negotiation.count()) === 0,
      String(await db.negotiation.count()),
    );

    // Valor de R$ 500, bem abaixo do limite de R$ 5.000 do Módulo 3: ainda
    // assim confirma. Um negócio pequeno lançado errado suja o rebanho igual.
    const pequeno = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "bezerro", quantidade: 1, valor: 500 }),
    );
    check(
      "valor abaixo do CONFIRMATION_THRESHOLD também confirma",
      pequeno.requires_confirmation === true,
      pequeno.reply_text,
    );

    // ------------------------------------------------------------------
    console.log('\n3. Regra 1: "cancela" vence tudo, inclusive uma pergunta pendente');
    // ------------------------------------------------------------------

    const recusa = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { explicitNo: true, userId: USUARIO }),
    );
    check("recusa não grava nada", recusa.reply_text.includes("não registrei nada"), recusa.reply_text);
    check("recusa não pede confirmação de novo", recusa.requires_confirmation === false);
    check("recusa é registrada como cancelamento", recusa.action_taken.endsWith(":cancelado"));

    // Com uma pergunta em aberto, "cancela" ainda cancela: era exatamente aqui
    // que o rebanho devolvia a pergunta de novo, sem cancelar (achado real).
    await registrarNegocioGado(ctx(db, tenant.id, { tipo: "compra" }, { userId: USUARIO }));
    check(
      "sanidade: existe um pedido pendente antes da recusa",
      (await loadPendingNegotiation(tenant.id, USUARIO)) !== null,
    );
    const recusaComPendencia = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { explicitNo: true, userId: USUARIO }),
    );
    check(
      "com pergunta pendente, cancela de verdade em vez de repetir a pergunta",
      recusaComPendencia.reply_text.includes("não registrei nada"),
      recusaComPendencia.reply_text,
    );
    // Verificar só o TEXTO passaria mesmo se o pendente nunca fosse limpo, que
    // é justamente o defeito que a frase acima alega cobrir: `explicitNo` é a
    // primeira instrução do handler e a resposta sairia igual. O que prova o
    // cancelamento é o pedido ter sumido.
    check(
      "e o pedido guardado sumiu de verdade, não só a mensagem",
      (await loadPendingNegotiation(tenant.id, USUARIO)) === null,
    );

    // ------------------------------------------------------------------
    console.log('\n4. Regra 3: "sim" sem nada mostrado não escreve');
    // ------------------------------------------------------------------

    await clearPendingNegotiation(tenant.id, USUARIO);
    const simSolto = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "bezerro", quantidade: 18, valor: 1000 }, {
        confirmed: true,
        userId: USUARIO,
      }),
    );
    check(
      "sim sem pedido guardado é recusado",
      simSolto.reply_text.includes("Não tenho nenhum negócio esperando confirmação"),
      simSolto.reply_text,
    );
    check("e não gravou nada", (await db.negotiation.count()) === 0);

    // ------------------------------------------------------------------
    console.log("\n5. Compra completa: rebanho sobe e o financeiro nasce junto");
    // ------------------------------------------------------------------

    await clearPendingNegotiation(tenant.id, USUARIO);
    const antes = await getPositions(db, {});
    const totalAntes = antes.reduce((s, p) => s + p.quantity, 0);

    await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "compra", categoria: "bezerro", quantidade: 20, valor: 60000, parcelas: 3, frete: 2000 },
        { userId: USUARIO },
      ),
    );
    const gravou = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { confirmed: true, userId: USUARIO }),
    );

    check("confirma e registra", gravou.reply_text.startsWith("✅ Compra registrada"), gravou.reply_text);
    check("diz que os animais entraram", gravou.reply_text.includes("entraram no rebanho"), gravou.reply_text);
    check("diz quantas parcelas", gravou.reply_text.includes("3 parcelas"), gravou.reply_text);

    const depois = await getPositions(db, {});
    const totalDepois = depois.reduce((s, p) => s + p.quantity, 0);
    check("o rebanho subiu 20", totalDepois - totalAntes === 20, `${totalAntes} -> ${totalDepois}`);

    const negociacoes = await db.negotiation.findMany();
    check("uma negociação criada", negociacoes.length === 1, String(negociacoes.length));
    check("do tipo compra_gado", negociacoes[0]?.type === "compra_gado", negociacoes[0]?.type);

    const lancamentos = await db.financialEntry.findMany({
      where: { negotiation_id: negociacoes[0].id },
    });
    const principais = lancamentos.filter((l) => l.negotiation_role === "principal");
    const adicionais = lancamentos.filter((l) => l.negotiation_role === "custo_adicional");
    check("3 lançamentos de principal", principais.length === 3, String(principais.length));
    check("1 lançamento de custo adicional", adicionais.length === 1, String(adicionais.length));
    check(
      "a soma das parcelas é o valor combinado, sem os custos",
      principais.reduce((s, l) => s + Number(l.amount), 0) === 60000,
      String(principais.reduce((s, l) => s + Number(l.amount), 0)),
    );
    check(
      "todos os lançamentos de compra são despesa",
      lancamentos.every((l) => l.entry_type === "expense"),
    );

    const movimentos = await db.herdMovement.findMany({
      where: { negotiation_id: negociacoes[0].id },
    });
    check("um movimento de rebanho ligado à negociação", movimentos.length === 1);
    check("do tipo compra", movimentos[0]?.movement_type === "compra", movimentos[0]?.movement_type);
    check(
      "na categoria certa",
      movimentos[0]?.to_category_id === "bezerro_0_7",
      String(movimentos[0]?.to_category_id),
    );

    // ------------------------------------------------------------------
    console.log("\n6. Venda: o rebanho desce e o financeiro vira receita");
    // ------------------------------------------------------------------

    await clearPendingNegotiation(tenant.id, USUARIO);
    await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "venda", categoria: "bezerro", quantidade: 5, valor: 20000 },
        { userId: USUARIO },
      ),
    );
    const vendeu = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { confirmed: true, userId: USUARIO }),
    );
    check("venda registrada", vendeu.reply_text.startsWith("✅ Venda registrada"), vendeu.reply_text);
    check("diz que saíram do rebanho", vendeu.reply_text.includes("saíram do rebanho"), vendeu.reply_text);
    check("lança como conta a receber", vendeu.reply_text.includes("a receber"), vendeu.reply_text);

    const depoisVenda = await getPositions(db, {});
    check(
      "o rebanho desceu 5",
      depoisVenda.reduce((s, p) => s + p.quantity, 0) === totalDepois - 5,
      String(depoisVenda.reduce((s, p) => s + p.quantity, 0)),
    );

    const vendaNeg = await db.negotiation.findFirst({ where: { type: "venda_gado" } });
    const receitas = await db.financialEntry.findMany({ where: { negotiation_id: vendaNeg!.id } });
    check("venda gera receita", receitas.every((l) => l.entry_type === "income"), JSON.stringify(receitas.map((r) => r.entry_type)));

    // ------------------------------------------------------------------
    console.log("\n7. Não chuta: categoria ambígua e saldo insuficiente");
    // ------------------------------------------------------------------

    await clearPendingNegotiation(tenant.id, USUARIO);
    const ambigua = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "novilha", quantidade: 10, valor: 30000 }),
    );
    check(
      "categoria ambígua vira pergunta, não chute",
      ambigua.reply_text.includes("pode ser mais de uma categoria"),
      ambigua.reply_text,
    );
    check("e não pede confirmação", ambigua.requires_confirmation === false);

    await clearPendingNegotiation(tenant.id, USUARIO);
    await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "venda", categoria: "bezerro", quantidade: 9999, valor: 100 },
        { userId: USUARIO },
      ),
    );
    const semSaldo = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { confirmed: true, userId: USUARIO }),
    );
    check(
      "vender mais do que existe é recusado pelo livro-razão",
      semSaldo.reply_text.startsWith("⚠️"),
      semSaldo.reply_text,
    );
    check(
      "e a recusa não deixou negociação órfã",
      (await db.negotiation.count()) === 2,
      String(await db.negotiation.count()),
    );

    // ------------------------------------------------------------------
    console.log("\n8. O que falta vira pergunta, um campo por vez");
    // ------------------------------------------------------------------

    await clearPendingNegotiation(tenant.id, USUARIO);
    const semTipo = await registrarNegocioGado(
      ctx(db, tenant.id, { categoria: "bezerro", quantidade: 10 }, { userId: USUARIO }),
    );
    check("sem tipo, pergunta compra ou venda", semTipo.reply_text.includes("compra ou uma venda"), semTipo.reply_text);

    // A resposta curta "compra" precisa se juntar ao que já estava guardado:
    // é aqui que o classificador do Módulo 30 trocava o pedido inteiro.
    const respondeuTipo = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra" }, { userId: USUARIO }),
    );
    check(
      "a resposta curta se junta ao pedido guardado (quantidade e categoria preservadas)",
      respondeuTipo.reply_text.includes("Por quanto"),
      respondeuTipo.reply_text,
    );

    const respondeuValor = await registrarNegocioGado(
      ctx(db, tenant.id, { valor: 25000 }, { userId: USUARIO }),
    );
    check(
      "com o valor, chega na confirmação com TUDO que foi dito ao longo da conversa",
      respondeuValor.requires_confirmation === true &&
        respondeuValor.reply_text.includes("10 bezerros") &&
        respondeuValor.reply_text.includes("25.000"),
      respondeuValor.reply_text,
    );

    // ------------------------------------------------------------------
    console.log("\n9. O desempate entre as duas intenções vive em CÓDIGO");
    // ------------------------------------------------------------------
    // "Comprei 20 bezerros por 60 mil" satisfaz tanto
    // registrar_movimentacao_rebanho quanto registrar_negocio_gado. Deixar a
    // escolha só para o prompt do classificador seria dois caminhos de escrita
    // para o mesmo gesto, e caminho duplicado é onde o dado diverge.
    check(
      "compra COM valor vira negócio",
      desempatarIntencao("registrar_movimentacao_rebanho", {
        movement_type: "compra",
        valor: 60000,
      }) === "registrar_negocio_gado",
    );
    check(
      "venda COM valor vira negócio",
      desempatarIntencao("registrar_movimentacao_rebanho", { movement_type: "venda", amount: "500" }) ===
        "registrar_negocio_gado",
    );
    check(
      "compra SEM valor continua no rebanho (correção de livro-razão, sem dinheiro)",
      desempatarIntencao("registrar_movimentacao_rebanho", { movement_type: "compra" }) ===
        "registrar_movimentacao_rebanho",
    );
    check(
      "valor zero não é negócio",
      desempatarIntencao("registrar_movimentacao_rebanho", { movement_type: "compra", valor: 0 }) ===
        "registrar_movimentacao_rebanho",
    );
    check(
      "nascimento nunca vira negócio, mesmo com valor",
      desempatarIntencao("registrar_movimentacao_rebanho", {
        movement_type: "nascimento",
        valor: 1000,
      }) === "registrar_movimentacao_rebanho",
    );
    check(
      "outras intenções passam intactas",
      desempatarIntencao("consultar_rebanho", { valor: 10 }) === "consultar_rebanho",
    );

    // TESTAR A FUNÇÃO PURA NÃO BASTA. O desempate decide lendo `movement_type`,
    // e o handler de destino não lia esse campo: o produtor dizia "comprei 20
    // bezerros por 60 mil" e ouvia de volta "foi uma compra ou uma venda?". A
    // suíte ficava verde com o defeito vivo porque só a função isolada era
    // exercitada. Agora o teste vai pela `routeIntent`, que é o caminho real.
    await clearPendingNegotiation(tenant.id, USUARIO);
    const pelaRota = await routeIntent(db, {
      tenant_id: tenant.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_movimentacao_rebanho",
      parameters: { movement_type: "compra", categoria: "bezerro", quantidade: 20, valor: 60000 },
      confirmed: false,
      explicitNo: false,
      user_id: USUARIO,
    });
    check(
      "a frase que o desempate converteu NÃO volta perguntando compra ou venda",
      !pelaRota.reply_text.includes("compra ou uma venda"),
      pelaRota.reply_text,
    );
    check(
      "ela chega direto na confirmação do negócio",
      pelaRota.requires_confirmation === true && pelaRota.reply_text.includes("20 bezerros"),
      pelaRota.reply_text,
    );

    // ------------------------------------------------------------------
    console.log("\n10. Sem usuário identificado, o 'sim' NÃO escreve");
    // ------------------------------------------------------------------
    // A regra 3 vivia atrás de `temMemoria`, então uma chamada sem user_id
    // caía direto na gravação com o que o classificador tinha remontado,
    // mexendo em rebanho E financeiro sem âncora nenhuma.
    const negociacoesAntes = await db.negotiation.count();
    const semUsuario = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "bezerro", quantidade: 30, valor: 90000 }, {
        confirmed: true,
      }),
    );
    check(
      "recusa e explica",
      semUsuario.reply_text.includes("não vou registrar nada"),
      semUsuario.reply_text,
    );
    check(
      "e não gravou nada",
      (await db.negotiation.count()) === negociacoesAntes,
      `${negociacoesAntes} -> ${await db.negotiation.count()}`,
    );

    // ------------------------------------------------------------------
    console.log("\n11. O que já foi dito não se perde no meio da conversa");
    // ------------------------------------------------------------------
    await clearPendingNegotiation(tenant.id, USUARIO);
    await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "bezerro", quantidade: 7 }, { userId: USUARIO }),
    );
    // O assistente perguntou o valor. O produtor responde com o VENDEDOR, que
    // não é o que foi perguntado. Antes, isso jogava fora os 7 bezerros e
    // voltava para a primeira pergunta.
    const respostaFora = await registrarNegocioGado(
      ctx(db, tenant.id, { vendedor: "João" }, { userId: USUARIO }),
    );
    check(
      "responder outra coisa não apaga o que já foi coletado",
      respostaFora.reply_text.includes("Por quanto"),
      respostaFora.reply_text,
    );
    const comValorDepois = await registrarNegocioGado(
      ctx(db, tenant.id, { valor: 14000 }, { userId: USUARIO }),
    );
    check(
      "e a confirmação traz os 7 bezerros E o vendedor, ditos em mensagens diferentes",
      comValorDepois.reply_text.includes("7 bezerros") &&
        comValorDepois.reply_text.includes("João"),
      comValorDepois.reply_text,
    );

    // ------------------------------------------------------------------
    console.log("\n12. §18.1: o exemplo do cliente, inteiro");
    // ------------------------------------------------------------------
    // "Comprei 20 bezerros do João por 60 mil para pagar dia 10."
    await clearPendingNegotiation(tenant.id, USUARIO);
    const exemplo = await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        {
          tipo: "compra",
          categoria: "bezerro",
          quantidade: 20,
          valor: 60000,
          vendedor: "João",
          vencimento: "2026-12-10",
        },
        { userId: USUARIO },
      ),
    );
    check("mostra o vendedor", exemplo.reply_text.includes("Vendedor: João"), exemplo.reply_text);
    check(
      "mostra o vencimento combinado, não a data de hoje",
      exemplo.reply_text.includes("10/12/2026"),
      exemplo.reply_text,
    );
    const exemploGravado = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { confirmed: true, userId: USUARIO }),
    );
    check("grava", exemploGravado.reply_text.startsWith("✅"), exemploGravado.reply_text);

    const contatoCriado = await db.contact.findFirst({ where: { name: "João" } });
    check("o contato João foi criado (§4: só o nome basta)", contatoCriado !== null);
    const negExemplo = contatoCriado
      ? await db.negotiation.findFirst({ where: { contact_id: contatoCriado.id } })
      : null;
    check(
      "e a negociação ficou pendurada nele",
      contatoCriado != null && negExemplo != null && negExemplo.contact_id === contatoCriado.id,
    );
    const contaDoExemplo = await db.financialEntry.findFirst({
      where: { negotiation_id: negExemplo?.id, negotiation_role: "principal" },
    });
    check(
      "a conta vence em 10/12, não hoje",
      contaDoExemplo?.due_date?.toISOString().slice(0, 10) === "2026-12-10",
      String(contaDoExemplo?.due_date),
    );

    // Repetir o mesmo vendedor não pode criar um segundo João.
    await clearPendingNegotiation(tenant.id, USUARIO);
    await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "compra", categoria: "bezerro", quantidade: 1, valor: 900, vendedor: "joão" },
        { userId: USUARIO },
      ),
    );
    await registrarNegocioGado(ctx(db, tenant.id, {}, { confirmed: true, userId: USUARIO }));
    check(
      "o mesmo vendedor, escrito diferente, não vira um contato novo",
      (await db.contact.count({ where: { name: { equals: "João", mode: "insensitive" } } })) === 1,
      String(await db.contact.count()),
    );

    // ------------------------------------------------------------------
    console.log("\n13. Uma cabeça só: a frase precisa fazer sentido");
    // ------------------------------------------------------------------
    await clearPendingNegotiation(tenant.id, USUARIO);
    const umaCabeca = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "bezerro", quantidade: 1, valor: 500 }),
    );
    check(
      'diz "1 bezerro", não "1 bezerros" nem o rótulo de tabela',
      umaCabeca.reply_text.includes("1 bezerro por") &&
        !umaCabeca.reply_text.includes("1 bezerros") &&
        !umaCabeca.reply_text.includes("Bezerro - 0 a 7 meses"),
      umaCabeca.reply_text,
    );
    // A regra do singular vale para os nomes compostos também: só a primeira
    // palavra flexiona, o resto é complemento de idade.
    await clearPendingNegotiation(tenant.id, USUARIO);
    const umaFemea = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "femea_8_12", quantidade: 1, valor: 900 }),
    );
    check(
      'e "1 fêmea de 8 a 12 meses", não "1 fêmeas de 8 a 12 meses"',
      umaFemea.reply_text.includes("1 fêmea de 8 a 12 meses"),
      umaFemea.reply_text,
    );

    // ------------------------------------------------------------------
    console.log("\n14. Parcela não pode pular o mês");
    // ------------------------------------------------------------------
    // 31/01 + 1 mês com setMonth vira 03/03, porque fevereiro não tem 31 dias:
    // a parcela de fevereiro apareceria em março.
    const fimDeMes = _montarParcelas(3000, 3, new Date(2026, 0, 31, 12));
    check(
      "31 de janeiro gera parcela em fevereiro, não em março",
      fimDeMes[0].due_date.getMonth() === 1,
      fimDeMes.map((p) => p.due_date.toISOString().slice(0, 10)).join(", "),
    );
    check(
      "e cai no último dia do mês quando o dia não existe",
      fimDeMes[0].due_date.getDate() === 28,
      String(fimDeMes[0].due_date.getDate()),
    );

    // ------------------------------------------------------------------
    console.log("\n15. §15: os custos do documento, todos");
    // ------------------------------------------------------------------
    const todosOsCustos = _custosDosParametros({
      frete: 1000,
      comissao: 500,
      taxa_leilao: 300,
      carregamento: 200,
      guia_transporte: 100,
      exames: 80,
    });
    check(
      "taxa de leilão, carregamento, guia e exames deixaram de sumir em silêncio",
      todosOsCustos.length === 6,
      todosOsCustos.map((c) => c.descricao).join(", "),
    );

    // ------------------------------------------------------------------
    console.log("\n16. Vender quem está em PASTO: diz onde está, não 'você tem 0'");
    // ------------------------------------------------------------------
    // A venda procura em (categoria, fazenda, pasto=null), porque a conversa
    // não fala de pasto. Quem lançou o rebanho por pasto tem o saldo em
    // (categoria, fazenda, pasto=P): sem a conferência, o produtor com 45
    // cabeças no pasto ouvia "existem apenas 0 animais", e pior, só DEPOIS de
    // ter dito "sim". Este defeito já tinha acontecido no rebanho em 2026-08-10.
    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto da Baixada", area_hectares: 30 }),
    });
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 45,
      to: {
        category_id: "femea_36_mais",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });

    await clearPendingNegotiation(tenant.id, USUARIO);
    const vendaEmPasto = await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "venda", categoria: "vaca", quantidade: 10, valor: 50000 },
        { userId: USUARIO },
      ),
    );
    check(
      "não diz que o produtor tem 0 animais",
      !vendaEmPasto.reply_text.includes("apenas 0"),
      vendaEmPasto.reply_text,
    );
    check(
      "diz ONDE os animais estão, e devolve a escolha ao produtor",
      vendaEmPasto.reply_text.includes("Pasto da Baixada"),
      vendaEmPasto.reply_text,
    );
    check(
      "e não pede confirmação enquanto isso não se resolve",
      vendaEmPasto.requires_confirmation === false,
      vendaEmPasto.reply_text,
    );

    // ------------------------------------------------------------------
    console.log("\n20. As travas contra o formato que o modelo manda");
    // ------------------------------------------------------------------
    // Estas existem porque o classificador repassa o que o produtor falou, e
    // não o formato ideal. Sem teste, elas eram promessa: o R5 do contrato pede
    // par em código TESTADO, não só em código.

    await clearPendingNegotiation(tenant.id, USUARIO);
    const pagoComoTexto = await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "compra", categoria: "bezerro", quantidade: 2, valor: 3000, pago: "sim" },
        { userId: USUARIO },
      ),
    );
    check(
      '`pago: "sim"` conta como pago, em vez de virar conta em aberto calada',
      pagoComoTexto.reply_text.includes("já foi feito"),
      pagoComoTexto.reply_text,
    );

    await clearPendingNegotiation(tenant.id, USUARIO);
    const parcelasComoTexto = await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "compra", categoria: "bezerro", quantidade: 2, valor: 3000, parcelas: "3x" },
        { userId: USUARIO },
      ),
    );
    check(
      '`parcelas: "3x"` vira 3 parcelas, em vez de uma conta única',
      parcelasComoTexto.reply_text.includes("Em 3x"),
      parcelasComoTexto.reply_text,
    );

    await clearPendingNegotiation(tenant.id, USUARIO);
    const parcelasComoObjeto = await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        {
          tipo: "compra",
          categoria: "bezerro",
          quantidade: 2,
          valor: 3000,
          parcelas: [{ valor: 1500 }, { valor: 1500 }],
        },
        { userId: USUARIO },
      ),
    );
    check(
      "parcelamento em formato que não dá para ler vira pergunta",
      parcelasComoObjeto.reply_text.includes("Em quantas vezes"),
      parcelasComoObjeto.reply_text,
    );
    check(
      'e NUNCA imprime "[object Object]" na cara do produtor',
      !parcelasComoObjeto.reply_text.includes("[object Object]"),
      parcelasComoObjeto.reply_text,
    );

    // ------------------------------------------------------------------
    console.log("\n21. A contradição 'já paguei' + 'vou parcelar' TEM saída");
    // ------------------------------------------------------------------
    // A pergunta existia mas era irrespondível: a mesclagem é aditiva, então
    // nenhuma resposta removia o campo antigo e o produtor girava até bater no
    // limite de tentativas e ouvir "tente mandar tudo numa frase só".
    await clearPendingNegotiation(tenant.id, USUARIO);
    const contradicao = await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        {
          tipo: "compra",
          categoria: "bezerro",
          quantidade: 2,
          valor: 3000,
          pago: true,
          parcelas: 3,
        },
        { userId: USUARIO },
      ),
    );
    check(
      "pergunta qual dos dois é",
      contradicao.reply_text.includes("já foi pago ou vai ser parcelado"),
      contradicao.reply_text,
    );
    const resolveu = await registrarNegocioGado(
      ctx(db, tenant.id, { pagamento: "já paguei" }, { userId: USUARIO }),
    );
    check(
      'responder "já paguei" SAI do impasse, em vez de repetir a pergunta',
      !resolveu.reply_text.includes("já foi pago ou vai ser parcelado"),
      resolveu.reply_text,
    );
    check(
      "e chega na confirmação como pago à vista, sem parcelamento",
      resolveu.requires_confirmation === true &&
        resolveu.reply_text.includes("já foi feito") &&
        !resolveu.reply_text.includes("Em 3x"),
      resolveu.reply_text,
    );

    // ------------------------------------------------------------------
    console.log("\n17. Pela ROTA de verdade, não pela função");
    // ------------------------------------------------------------------
    // O CLAUDE.md exige teste de rota em todo módulo que adiciona endpoint. As
    // rotas /api/v1 ficam atrás de sessão e o padrão do projeto é testá-las
    // pela action; a rota interna do agente é testável de verdade, com Request
    // construído, e é ela que cobre o registro da intenção, o gate de permissão
    // e a serialização, que nenhum teste de função alcança.
    const chamarRota = async (body: Record<string, unknown>) => {
      const req = new Request("http://localhost/api/internal/whatsapp/execute-action", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
        },
        body: JSON.stringify({ parameters: {}, ...body }),
      });
      const res = await executeAction(req);
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    };

    await clearPendingNegotiation(tenant.id, USUARIO);
    const rotaPergunta = await chamarRota({
      tenant_id: tenant.id,
      user_id: USUARIO,
      intent: "registrar_negocio_gado",
      parameters: { tipo: "compra", categoria: "bezerro", quantidade: 6, valor: 12000 },
    });
    const dadosPergunta = rotaPergunta.body.data as Record<string, unknown> | undefined;
    check("a rota responde 200", rotaPergunta.status === 200, String(rotaPergunta.status));
    check(
      "e a intenção nova está registrada de verdade (não cai em 'não entendi')",
      dadosPergunta?.requires_confirmation === true,
      JSON.stringify(rotaPergunta.body).slice(0, 300),
    );

    const rotaGrava = await chamarRota({
      tenant_id: tenant.id,
      user_id: USUARIO,
      intent: "registrar_negocio_gado",
      confirmed: true,
    });
    check(
      "o 'sim' pela rota grava",
      String((rotaGrava.body.data as Record<string, unknown>)?.reply_text ?? "").startsWith("✅"),
      JSON.stringify(rotaGrava.body).slice(0, 300),
    );

    // VISUALIZADOR não escreve, e a checagem tem que acontecer na rota, não só
    // no handler: é a role RELIDA do banco que vale, nunca a que o caller diz.
    const leitor = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Somente Leitura",
        email: `m36-leitor-${stamp}@teste.local`,
        password_hash: "x",
        role: "VISUALIZADOR",
      },
    });
    const rotaBarrada = await chamarRota({
      tenant_id: tenant.id,
      user_id: leitor.id,
      intent: "registrar_negocio_gado",
      parameters: { tipo: "compra", categoria: "bezerro", quantidade: 5, valor: 9000 },
    });
    check(
      "VISUALIZADOR é barrado pela rota",
      String((rotaBarrada.body.data as Record<string, unknown>)?.reply_text ?? "").includes(
        "não tem permissão",
      ),
      JSON.stringify(rotaBarrada.body).slice(0, 300),
    );

    // ------------------------------------------------------------------
    console.log("\n18. Datas ditas como o produtor fala, não como o LLM idealmente emitiria");
    // ------------------------------------------------------------------
    // "10/12/2026" produzia Invalid Date e o vencimento sumia em silêncio: o
    // exemplo-bandeira do §18.1 dependia do modelo acertar o formato ISO.
    await clearPendingNegotiation(tenant.id, USUARIO);
    const dataBr = await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        {
          tipo: "compra",
          categoria: "bezerro",
          quantidade: 3,
          valor: 7000,
          vencimento: "10/12/2026",
        },
        { userId: USUARIO },
      ),
    );
    check(
      "vencimento em formato brasileiro é entendido",
      dataBr.reply_text.includes("10/12/2026"),
      dataBr.reply_text,
    );

    await clearPendingNegotiation(tenant.id, USUARIO);
    const dataOntem = await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "compra", categoria: "bezerro", quantidade: 3, valor: 7000, data: "ontem" },
        { userId: USUARIO },
      ),
    );
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    check(
      '"ontem" é entendido, em vez de virar hoje calado',
      dataOntem.reply_text.includes(ontem.toLocaleDateString("pt-BR")),
      dataOntem.reply_text,
    );

    await clearPendingNegotiation(tenant.id, USUARIO);
    const dataRuim = await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "compra", categoria: "bezerro", quantidade: 3, valor: 7000, data: "sei lá quando" },
        { userId: USUARIO },
      ),
    );
    // "dia 10" é SEMPRE o mês corrente, mesmo que o dia já tenha passado
    // (decisão do usuário, 2026-08-13). Empurrar para o mês seguinte esconderia
    // uma conta vencida e tiraria o lançamento do mês a que ele pertence.
    await clearPendingNegotiation(tenant.id, USUARIO);
    const soDia = await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "compra", categoria: "bezerro", quantidade: 3, valor: 7000, vencimento: "dia 1" },
        { userId: USUARIO },
      ),
    );
    const primeiroDesteMes = new Date();
    primeiroDesteMes.setDate(1);
    check(
      '"dia 1" cai no mês corrente mesmo já tendo passado, para a conta aparecer VENCIDA',
      soDia.reply_text.includes(primeiroDesteMes.toLocaleDateString("pt-BR")),
      soDia.reply_text,
    );

    await clearPendingNegotiation(tenant.id, USUARIO);
    check(
      "data que não dá para entender vira PERGUNTA, não sumiço",
      dataRuim.reply_text.includes("Não entendi a data"),
      dataRuim.reply_text,
    );
    check("e não pede confirmação enquanto isso", dataRuim.requires_confirmation === false);

    // ------------------------------------------------------------------
    console.log("\n19. Nada é gravado antes do sim: nem contato");
    // ------------------------------------------------------------------
    await clearPendingNegotiation(tenant.id, USUARIO);
    const contatosAntes = await db.contact.count();
    await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        {
          tipo: "compra",
          categoria: "bezerro",
          quantidade: 2,
          valor: 3000,
          vendedor: "Sebastião do Vale",
        },
        { userId: USUARIO },
      ),
    );
    check(
      "o contato NÃO nasce só por ter sido citado na descrição",
      (await db.contact.count()) === contatosAntes,
      `${contatosAntes} -> ${await db.contact.count()}`,
    );
    await registrarNegocioGado(ctx(db, tenant.id, {}, { explicitNo: true, userId: USUARIO }));
    check(
      "e depois de cancelar, ele continua não existindo",
      (await db.contact.findFirst({ where: { name: "Sebastião do Vale" } })) === null,
    );

    await clearPendingNegotiation(tenant.id, USUARIO);
  } finally {
    await prisma.financialEntry.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.herdMovement.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.negotiation.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.contact.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.pasture.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.property.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.user.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenantProfile.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    await clearPendingNegotiation(tenant.id, USUARIO);
  }

  console.log("");
  console.log(
    falhas === 0
      ? "✅ Negócio de gado pelo WhatsApp: 0 falhas."
      : `❌ Negócio de gado pelo WhatsApp: ${falhas} falha(s).`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
