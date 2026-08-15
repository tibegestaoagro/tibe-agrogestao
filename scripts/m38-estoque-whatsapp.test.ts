import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped, type TenantPrismaClient } from "@/lib/prisma";
import {
  registrarUsoEstoque,
  ajustarEstoque,
  consultarEstoque,
  registrarNegocioProduto,
  resolverProduto,
} from "@/lib/actions/whatsapp-handlers/estoque";
import { desempatarIntencao, routeIntent } from "@/lib/actions/whatsapp-router";
import { createProduct, ensureProductCategories, listProductCategories } from "@/lib/actions/products";
import { getStockBalance, recordStockMovement } from "@/lib/actions/stock-ledger";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";
import { loadPendingStock, clearPendingStock } from "@/lib/actions/stock-pending";
import { lerNumeroBr } from "@/lib/numero-br";
import {
  savePendingNegotiation,
  clearPendingNegotiation,
} from "@/lib/actions/negotiation-pending";

exigirBancoLocal();

/**
 * Módulo 31, missão 2: estoque pelo WhatsApp (§9 e §10).
 *
 * O que este arquivo protege:
 *
 * 1. **O produto nunca nasce da conversa.** Adivinhar categoria e unidade a
 *    partir de uma frase criaria "sal", "sal mineral" e "sal mineral 60" como
 *    três saldos para a mesma coisa.
 * 2. **O desempate entre gado e produto é código, não prompt.** As duas
 *    direções têm teste: produto que é gado e gado que é produto.
 * 3. **Escrita de dinheiro confirma; uso e ajuste não.** As duas bordas, porque
 *    afrouxar a primeira grava conta a pagar sem ninguém ver e apertar a
 *    segunda faz o produtor parar de registrar.
 *
 * Roda: `npm run test:m38`
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.error(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

/**
 * `toLocaleString("pt-BR", {style:"currency"})` separa "R$" do numero com
 * ESPACO NAO SEPARAVEL (U+00A0), nao com espaco comum. Sem normalizar, uma
 * asercao escrita do jeito que a gente le falha e parece defeito de produto.
 */
function semNbsp(texto: string): string {
  return texto.replace(/\u00a0/g, " ");
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
  console.log("💬 Módulo 31: estoque pelo WhatsApp (§9 e §10)\n");

  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "M38 Estoque Whats", document: `38${stamp}0`, plan: "fazenda" },
  });
  await prisma.tenantProfile.create({
    data: { tenant_id: tenant.id, profile_type: "fazenda", active: true },
  });

  try {
    const db = prismaForTenant(tenant.id);
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda Unica" }) });

    await ensureProductCategories(db);
    const categorias = await listProductCategories(db);
    const salMineral = categorias.find((c) => c.name === "Sal mineral")!;
    const ferramentas = categorias.find((c) => c.name === "Ferramentas")!;

    const saldoDe = async (produtoId: string) => {
      const p = await getStockBalance(db, { product_id: produtoId, property_id: fazenda.id });
      return p.reduce((s, x) => s + x.quantity, 0);
    };

    /**
     * Um usuario para os gestos que CONFIRMAM.
     *
     * Confirmacao sem usuario resolvido passou a ser recusada, e e a regra
     * certa: sem quem, nao ha onde guardar o que foi mostrado, e o "sim" so
     * poderia executar o que o classificador remontou. Os testes que exercitam
     * gravacao viram, por isso, conversa de duas voltas: pergunta e confirma.
     */
    const operador = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Operador Padrao",
        email: `m38-op-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
      },
    });
    const comOperador = (
      parametros: Record<string, unknown>,
      opts: { confirmed?: boolean; explicitNo?: boolean } = {},
    ) => ctx(db, tenant.id, parametros, { ...opts, userId: operador.id });

    /** Pergunta e confirma, que e como o produtor de fato faz. */
    const ajustarConfirmando = async (parametros: Record<string, unknown>) => {
      await clearPendingStock(tenant.id, operador.id);
      await ajustarEstoque(comOperador(parametros));
      return ajustarEstoque(comOperador({}, { confirmed: true }));
    };
    const comprarConfirmando = async (parametros: Record<string, unknown>) => {
      await clearPendingStock(tenant.id, operador.id);
      await registrarNegocioProduto(comOperador(parametros));
      return registrarNegocioProduto(comOperador({}, { confirmed: true }));
    };

    // ------------------------------------------------------------------
    console.log("1. O produto sai do CATÁLOGO, nunca da conversa");
    // ------------------------------------------------------------------
    const semCatalogo = await resolverProduto(db, "sal");
    check(
      "sem catálogo, manda cadastrar no painel em vez de inventar",
      !semCatalogo.ok && semCatalogo.resposta.reply_text.includes("Cadastre no painel"),
      semCatalogo.ok ? "INVENTOU" : semCatalogo.resposta.reply_text,
    );

    const sal = await createProduct(db, {
      name: "Sal mineral 60 P",
      category_id: salMineral.id,
      unit: "saca",
      minimum_stock: 3,
    });
    if (!sal.ok) throw new Error("faltou o produto");

    const enxada = await createProduct(db, {
      name: "Enxada",
      category_id: ferramentas.id,
      unit: "unidade",
    });
    if (!enxada.ok) throw new Error("faltou a enxada");

    const porApelido = await resolverProduto(db, "sal");
    check(
      '"sal" acha "Sal mineral 60 P": o produtor fala menos do que cadastrou',
      porApelido.ok && porApelido.produto.id === sal.data.id,
    );
    check(
      "e acha sem acento também",
      (await resolverProduto(db, "SAL MINERAL")).ok,
    );

    const inexistente = await resolverProduto(db, "veneno de formiga");
    check(
      "produto que não existe NÃO é criado: mostra o que existe",
      !inexistente.ok && inexistente.resposta.reply_text.includes("Sal mineral 60 P"),
      inexistente.ok ? "CRIOU" : "",
    );

    // Dois parecidos: mostra os dois em vez de chutar o primeiro.
    const salBranco = await createProduct(db, {
      name: "Sal branco",
      category_id: salMineral.id,
      unit: "saca",
    });
    if (!salBranco.ok) throw new Error("faltou o segundo sal");
    const ambiguo = await resolverProduto(db, "sal");
    check(
      "com dois parecidos, pergunta qual em vez de chutar",
      !ambiguo.ok && ambiguo.resposta.reply_text.includes("Qual deles"),
      ambiguo.ok ? `CHUTOU ${ambiguo.produto.name}` : "",
    );
    // Volta ao caso simples para o resto do arquivo.
    await db.product.update({
      where: { id: salBranco.data.id },
      data: { archived_at: new Date() },
    });

    // ------------------------------------------------------------------
    console.log("\n2. §10.3: usei");
    // ------------------------------------------------------------------
    await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazenda.id,
      movement_type: "compra",
      quantity: 10,
    });

    const uso = await registrarUsoEstoque(
      ctx(db, tenant.id, { produto: "sal", quantidade: 2.5, finalidade: "lote do curral" }),
    );
    check("uso registrado sem pedir confirmação", uso.requires_confirmation === false);
    check("e o saldo caiu para 7,5", (await saldoDe(sal.data.id)) === 7.5, String(await saldoDe(sal.data.id)));
    check(
      "a resposta diz quanto sobrou, que é o que o produtor quer saber",
      uso.reply_text.includes("Restam 7,5 sacas"),
      uso.reply_text,
    );

    const usoDemais = await registrarUsoEstoque(
      ctx(db, tenant.id, { produto: "sal", quantidade: 100 }),
    );
    check(
      "usar mais do que tem é recusado com a mensagem do §10.7",
      usoDemais.reply_text.includes("Existem apenas") &&
        usoDemais.reply_text.includes("Revise a quantidade"),
      usoDemais.reply_text,
    );
    check("e o saldo não mudou depois da recusa", (await saldoDe(sal.data.id)) === 7.5);

    const semQuantidade = await registrarUsoEstoque(ctx(db, tenant.id, { produto: "sal" }));
    check(
      "sem quantidade, PERGUNTA em vez de assumir 1",
      semQuantidade.action_taken === "clarification_requested",
      semQuantidade.reply_text,
    );

    // §10.5 nas duas bordas: meia saca pode, meia enxada não.
    await recordStockMovement(db, {
      product_id: enxada.data.id,
      property_id: fazenda.id,
      movement_type: "compra",
      quantity: 5,
    });
    const meiaEnxada = await registrarUsoEstoque(
      ctx(db, tenant.id, { produto: "enxada", quantidade: 2.5 }),
    );
    check(
      "meia enxada é recusada ANTES de gravar",
      meiaEnxada.action_taken === "clarification_requested" &&
        meiaEnxada.reply_text.includes("não aceita quantidade quebrada"),
      meiaEnxada.reply_text,
    );
    check("e nenhuma enxada saiu", (await saldoDe(enxada.data.id)) === 5);

    // ------------------------------------------------------------------
    console.log("\n3. §10.6: contei e está diferente");
    // ------------------------------------------------------------------
    const semConfirmar = await ajustarEstoque(ctx(db, tenant.id, { produto: "sal", saldo: 6 }));
    check(
      "ajuste PEDE confirmação, mostrando o antes e o depois",
      semConfirmar.requires_confirmation === true &&
        semConfirmar.reply_text.includes("passa de"),
      semConfirmar.reply_text,
    );

    const ajusteMenos = await ajustarConfirmando({
      produto: "sal",
      saldo: 6,
      motivo: "contagem do galpao",
    });
    check("com o sim, o ajuste entra", ajusteMenos.action_taken === "ajustar_estoque:ok");
    check("saldo virou 6", (await saldoDe(sal.data.id)) === 6, String(await saldoDe(sal.data.id)));
    check(
      "a resposta diz que TIROU, porque foi para menos",
      ajusteMenos.reply_text.includes("Tirei 1,5 sacas"),
      ajusteMenos.reply_text,
    );

    // A borda contrária, que é onde o sinal errado passaria despercebido.
    const ajusteMais = await ajustarConfirmando({ produto: "sal", saldo: 9 });
    check("saldo virou 9", (await saldoDe(sal.data.id)) === 9);
    check(
      "e a resposta diz que SOMOU",
      ajusteMais.reply_text.includes("Somei 3 sacas"),
      ajusteMais.reply_text,
    );

    const semMudanca = await ajustarConfirmando({ produto: "sal", saldo: 9 });
    check(
      "contar o mesmo número não grava movimento de zero",
      semMudanca.reply_text.includes("Não mudei nada"),
      semMudanca.reply_text,
    );

    check(
      "ajuste aceita ZERO: contou e não tinha nada",
      (await ajustarConfirmando({ produto: "enxada", saldo: 0 })).action_taken ===
        "ajustar_estoque:ok",
    );

    // ------------------------------------------------------------------
    console.log("\n4. §9: comprei produtos, com confirmação obrigatória");
    // ------------------------------------------------------------------
    const negociosAntes = await db.negotiation.count();
    const pergunta = await registrarNegocioProduto(
      ctx(db, tenant.id, {
        tipo: "compra",
        produto: "sal",
        quantidade: 10,
        // "1.200" pelo leitor de dinheiro compartilhado: por `num()` isso
        // viraria R$ 1,20 e a conta a pagar nasceria mil vezes menor.
        valor: "1.200",
        contato: "Agropecuaria Central",
        vencimento: "dia 10",
        custos: [{ descricao: "Frete", valor: "150" }],
      }),
    );
    check("compra pede confirmação, sempre", pergunta.requires_confirmation === true);
    check(
      "e mostra o valor certo, lido como milhar",
      semNbsp(pergunta.reply_text).includes("R$ 1.200,00"),
      pergunta.reply_text,
    );
    check(
      "com o frete separado, como o §15 pede",
      semNbsp(pergunta.reply_text).includes("Frete R$ 150,00"),
      pergunta.reply_text,
    );
    check(
      "e NADA foi gravado enquanto espera o sim",
      (await db.negotiation.count()) === negociosAntes,
    );

    const recusa = await registrarNegocioProduto(
      ctx(db, tenant.id, { tipo: "compra", produto: "sal", quantidade: 10, valor: 1200 }, { explicitNo: true }),
    );
    check(
      "recusa vence tudo e não grava",
      recusa.action_taken === "registrar_negocio_produto:cancelado" &&
        (await db.negotiation.count()) === negociosAntes,
      recusa.reply_text,
    );

    const saldoAntes = await saldoDe(sal.data.id);
    const executada = await comprarConfirmando({
      tipo: "compra",
      produto: "sal",
      quantidade: 10,
      valor: "1.200",
      contato: "Agropecuaria Central",
      vencimento: "dia 10",
      custos: [{ descricao: "Frete", valor: "150" }],
    });
    check("com o sim, grava", executada.action_taken === "registrar_negocio_produto:ok", executada.reply_text);
    check("o estoque subiu 10 sacas", (await saldoDe(sal.data.id)) === saldoAntes + 10);

    const negociacao = await db.negotiation.findFirst({
      where: { type: "compra_produto" },
      orderBy: { created_at: "desc" },
    });
    check("nasceu a negociação de produto", negociacao !== null);
    const lancamentos = await db.financialEntry.findMany({
      where: { negotiation_id: negociacao!.id },
    });
    check(
      "com a conta a pagar do valor E a do frete",
      lancamentos.length === 2 && lancamentos.every((l) => l.entry_type === "expense"),
      String(lancamentos.length),
    );
    check(
      "o valor foi lido como R$ 1.200, não R$ 1,20",
      lancamentos.some((l) => Number(l.amount) === 1200),
      lancamentos.map((l) => String(l.amount)).join(", "),
    );
    const contato = await db.contact.findFirst({ where: { name: "Agropecuaria Central" } });
    check("e o fornecedor citado virou contato", contato !== null);

    const semValor = await registrarNegocioProduto(
      ctx(db, tenant.id, { tipo: "compra", produto: "sal", quantidade: 5 }),
    );
    check(
      "sem valor, PERGUNTA por quanto, em vez de gravar zero",
      semValor.action_taken === "clarification_requested" &&
        semValor.reply_text.includes("Por quanto"),
      semValor.reply_text,
    );

    const pagoEParcelado = await registrarNegocioProduto(
      ctx(db, tenant.id, {
        tipo: "compra",
        produto: "sal",
        quantidade: 1,
        valor: 300,
        pago: "sim",
        parcelas: "3x",
      }),
    );
    check(
      '"já paguei" e "parcelo em 3x" não valem juntos: pergunta',
      pagoEParcelado.action_taken === "clarification_requested",
      pagoEParcelado.reply_text,
    );

    // ------------------------------------------------------------------
    console.log("\n5. O desempate gado x produto, nas DUAS direções");
    // ------------------------------------------------------------------
    check(
      "produto que na verdade é gado vira negócio de gado",
      desempatarIntencao("registrar_negocio_produto", { produto: "bezerros", quantidade: 20 }) ===
        "registrar_negocio_gado",
    );
    check(
      "e um produto de verdade continua produto",
      desempatarIntencao("registrar_negocio_produto", { produto: "sal mineral", quantidade: 10 }) ===
        "registrar_negocio_produto",
    );
    check(
      "compra de gado segue virando negócio, como antes",
      desempatarIntencao("registrar_movimentacao_rebanho", { movement_type: "compra" }) ===
        "registrar_negocio_gado",
      "regressão da missão 1",
    );
    check(
      "e morte continua sendo movimentação de rebanho",
      desempatarIntencao("registrar_movimentacao_rebanho", { movement_type: "morte" }) ===
        "registrar_movimentacao_rebanho",
    );

    // A direção que precisa de banco: o classificador manda gado, o item é
    // produto do catálogo, e o roteador corrige.
    const usuario = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Produtor de Teste",
        email: `m38-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
      },
    });

    const roteado = await routeIntent(db, {
      tenant_id: tenant.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_negocio_gado",
      parameters: { tipo: "compra", produto: "sal", quantidade: 5, valor: 600 },
      confirmed: false,
      explicitNo: false,
      user_id: usuario.id,
    });
    check(
      "gado que na verdade é produto cai no handler de produto",
      roteado.action_taken.startsWith("registrar_negocio_produto"),
      roteado.action_taken,
    );
    check(
      "e a confirmação fala de sacas, não de animais",
      roteado.reply_text.includes("sacas de Sal mineral 60 P"),
      roteado.reply_text,
    );

    // A borda contrária: com categoria de rebanho na mensagem, NÃO desvia.
    const gadoDeVerdade = await routeIntent(db, {
      tenant_id: tenant.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_negocio_gado",
      parameters: { tipo: "compra", categoria: "bezerro", quantidade: 20, valor: 60000 },
      confirmed: false,
      explicitNo: false,
      user_id: usuario.id,
    });
    check(
      "compra de gado de verdade NÃO é desviada para o estoque",
      !gadoDeVerdade.action_taken.startsWith("registrar_negocio_produto"),
      gadoDeVerdade.action_taken,
    );

    // ------------------------------------------------------------------
    console.log("\n6. Consulta");
    // ------------------------------------------------------------------
    const consulta = await consultarEstoque(ctx(db, tenant.id, { produto: "sal" }));
    check(
      "diz quanto tem do produto perguntado",
      consulta.reply_text.includes("Sal mineral 60 P") && consulta.reply_text.includes("sacas"),
      consulta.reply_text,
    );

    const geral = await consultarEstoque(ctx(db, tenant.id, {}));
    check(
      "sem produto citado, prioriza o que precisa repor",
      geral.action_taken === "consultar_estoque:acabando" ||
        geral.action_taken === "consultar_estoque:ok",
      geral.action_taken,
    );

    // ------------------------------------------------------------------
    console.log("\n7. A QUANTIDADE também é dinheiro em matéria de magnitude");
    // ------------------------------------------------------------------
    // Um revisor independente notou que a quantidade ainda passava pelo leitor
    // genérico, o mesmo que já tinha feito "60.000" virar 60 no dinheiro.
    const racao = await createProduct(db, {
      name: "Racao",
      category_id: salMineral.id,
      unit: "quilograma",
      minimum_stock: 100,
    });
    if (!racao.ok) throw new Error("faltou a ração");

    await comprarConfirmando({
      tipo: "compra",
      produto: "racao",
      quantidade: "2.000",
      valor: "4 mil",
    });
    check(
      '"2.000 kg" entra como 2000, não como 2',
      (await saldoDe(racao.data.id)) === 2000,
      String(await saldoDe(racao.data.id)),
    );

    const comVirgula = await registrarUsoEstoque(
      ctx(db, tenant.id, { produto: "racao", quantidade: "2,5" }),
    );
    check(
      '"2,5" com vírgula é aceito, não recusado como texto',
      comVirgula.action_taken === "registrar_uso_estoque:ok",
      comVirgula.reply_text,
    );
    check("e tirou 2,5 quilos", (await saldoDe(racao.data.id)) === 1997.5);

    const contagemGrande = await ajustarConfirmando({ produto: "racao", saldo: "1.500" });
    check(
      '"contei 1.500" ajusta para 1500, não para 1,5',
      contagemGrande.action_taken === "ajustar_estoque:ok" &&
        (await saldoDe(racao.data.id)) === 1500,
      String(await saldoDe(racao.data.id)),
    );

    // `preco` é preço UNITÁRIO em português: lê-lo como total gravaria R$ 120
    // no lugar de R$ 1.200, com a confirmação imprimindo o número que o
    // produtor de fato falou. A resposta certa é PERGUNTAR o total.
    const soComPrecoUnitario = await registrarNegocioProduto(
      ctx(db, tenant.id, { tipo: "compra", produto: "sal", quantidade: 10, preco: 120 }),
    );
    check(
      "preço unitário sozinho NÃO vira o valor do negócio: pergunta o total",
      soComPrecoUnitario.action_taken === "clarification_requested" &&
        soComPrecoUnitario.reply_text.includes("Por quanto"),
      soComPrecoUnitario.reply_text,
    );

    // ------------------------------------------------------------------
    console.log("\n8. Toda escrita guarda QUEM fez");
    // ------------------------------------------------------------------
    const autor = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Operador do Curral",
        email: `m38-autor-${stamp}@teste.local`,
        password_hash: "x",
        role: "OPERADOR",
      },
    });
    await registrarUsoEstoque(
      ctx(db, tenant.id, { produto: "racao", quantidade: 1 }, { userId: autor.id }),
    );
    const comAutor = await db.stockMovement.findFirst({
      where: { product_id: racao.data.id, movement_type: "utilizacao" },
      orderBy: { created_at: "desc" },
    });
    check(
      "o uso pelo WhatsApp guarda o usuário responsável (§10.6)",
      comAutor?.recorded_by_user_id === autor.id,
      String(comAutor?.recorded_by_user_id),
    );

    await clearPendingStock(tenant.id, autor.id);
    await ajustarEstoque(ctx(db, tenant.id, { produto: "racao", saldo: 1000 }, { userId: autor.id }));
    await ajustarEstoque(ctx(db, tenant.id, {}, { userId: autor.id, confirmed: true }));
    const ajusteComAutor = await db.stockMovement.findFirst({
      where: { product_id: racao.data.id, movement_type: "ajuste" },
      orderBy: { created_at: "desc" },
    });
    check(
      "e o ajuste também, que é onde o §10.6 exige por escrito",
      ajusteComAutor?.recorded_by_user_id === autor.id,
      String(ajusteComAutor?.recorded_by_user_id),
    );

    // ------------------------------------------------------------------
    console.log("\n9. A CONVERSA de várias voltas (a lacuna que deixou tudo passar)");
    // ------------------------------------------------------------------
    const conversador = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Produtor Conversador",
        email: `m38-conversa-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
      },
    });
    const comoEle = (
      parametros: Record<string, unknown>,
      opts: { confirmed?: boolean; explicitNo?: boolean } = {},
    ) => ctx(db, tenant.id, parametros, { ...opts, userId: conversador.id });

    await clearPendingStock(tenant.id, conversador.id);

    // 9a. Responder um campo NÃO apaga o que já tinha sido entendido.
    const perguntouQuantidade = await registrarUsoEstoque(comoEle({ produto: "sal" }));
    check(
      "sem quantidade, pergunta e GUARDA o produto",
      perguntouQuantidade.action_taken === "clarification_requested",
      perguntouQuantidade.reply_text,
    );
    const guardado = await loadPendingStock(tenant.id, conversador.id);
    check(
      "o pedido ficou guardado esperando a quantidade",
      guardado?.aguardando === "quantidade" && guardado.intent === "registrar_uso_estoque",
      JSON.stringify(guardado),
    );

    const saldoAntesDoUso = await saldoDe(sal.data.id);
    const soONumero = await registrarUsoEstoque(comoEle({ quantidade: 2 }));
    check(
      'responder só "2" completa o uso, sem perguntar o produto de novo',
      soONumero.action_taken === "registrar_uso_estoque:ok",
      soONumero.reply_text,
    );
    check("e tirou 2 do saldo", (await saldoDe(sal.data.id)) === saldoAntesDoUso - 2);

    // 9b. A trava de laço: o mesmo campo perguntado vezes demais desiste.
    await registrarUsoEstoque(comoEle({ produto: "sal" }));
    await registrarUsoEstoque(comoEle({ observacao: "nada a ver" }));
    await registrarUsoEstoque(comoEle({ observacao: "nada a ver" }));
    const segundaVolta = await registrarUsoEstoque(comoEle({ observacao: "nada a ver" }));
    check(
      "depois de tentativas demais, desiste em vez de perguntar para sempre",
      segundaVolta.action_taken === "registrar_uso_estoque:desisti",
      segundaVolta.action_taken,
    );

    // 9c. "cancela" no meio de uma pergunta funciona.
    await registrarUsoEstoque(comoEle({ produto: "sal" }));
    const cancelou = await registrarUsoEstoque(comoEle({}, { explicitNo: true }));
    check(
      '"cancela" no meio da pergunta cancela de verdade',
      cancelou.action_taken === "registrar_uso_estoque:cancelado",
      cancelou.reply_text,
    );
    check("e o pendente some junto", (await loadPendingStock(tenant.id, conversador.id)) === null);

    // 9d. O "sim" executa o que foi MOSTRADO, não o que o LLM remontar.
    const saldoAntesDaCompra = await saldoDe(sal.data.id);
    const mostrou = await registrarNegocioProduto(
      comoEle({ tipo: "compra", produto: "sal", quantidade: 10, valor: 1200 }),
    );
    check("a compra pediu confirmação", mostrou.requires_confirmation === true);
    check(
      "e a confirmação mostra a DATA, que também vai ser gravada",
      mostrou.reply_text.includes("Data:"),
      mostrou.reply_text,
    );

    // O classificador remonta ERRADO: 100 sacas em vez de 10.
    const executou = await registrarNegocioProduto(
      comoEle({ tipo: "compra", produto: "sal", quantidade: 100, valor: 1200 }, { confirmed: true }),
    );
    check(
      "o sim executou",
      executou.action_taken === "registrar_negocio_produto:ok",
      executou.reply_text,
    );
    check(
      "e gravou as 10 sacas MOSTRADAS, não as 100 que o classificador remontou",
      (await saldoDe(sal.data.id)) === saldoAntesDaCompra + 10,
      `${await saldoDe(sal.data.id)} vs ${saldoAntesDaCompra + 10}`,
    );

    // 9e. Um "sim" de estoque não pode executar um negócio de GADO pendente.
    await savePendingNegotiation(tenant.id, conversador.id, {
      parameters: { tipo: "compra", categoria: "bezerro", quantidade: 20, valor: 60000 },
      aguardando: "confirmacao",
    });
    const negociosGadoAntes = await db.negotiation.count({ where: { type: "compra_gado" } });

    await routeIntent(db, {
      tenant_id: tenant.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_negocio_gado",
      parameters: { tipo: "compra", produto: "sal", quantidade: 5, valor: 600 },
      confirmed: false,
      explicitNo: false,
      user_id: conversador.id,
    });
    const simDepoisDoSal = await routeIntent(db, {
      tenant_id: tenant.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_negocio_gado",
      parameters: {},
      confirmed: true,
      explicitNo: false,
      user_id: conversador.id,
    });
    check(
      'o "sim" de uma compra de sal NÃO executa o gado pendente',
      (await db.negotiation.count({ where: { type: "compra_gado" } })) === negociosGadoAntes,
      simDepoisDoSal.action_taken,
    );
    check(
      "ele executa a compra de sal que estava na tela",
      simDepoisDoSal.action_taken === "registrar_negocio_produto:ok",
      simDepoisDoSal.action_taken,
    );

    // 9f. "faltaram 2 sacas" não pode virar saldo final.
    await clearPendingStock(tenant.id, conversador.id);
    const saldoAntesDaDiferenca = await saldoDe(sal.data.id);
    const diferencaDita = await ajustarEstoque(comoEle({ produto: "sal", diferenca: 2 }));
    check(
      'diferença dita ("faltaram 2") vira pergunta pelo TOTAL',
      diferencaDita.action_taken === "clarification_requested" &&
        diferencaDita.reply_text.includes("ao todo"),
      diferencaDita.reply_text,
    );
    check("e nada foi ajustado", (await saldoDe(sal.data.id)) === saldoAntesDaDiferenca);

    // 9g. Ajuste confirma antes de mexer.
    await clearPendingStock(tenant.id, conversador.id);
    const ajustePergunta = await ajustarEstoque(comoEle({ produto: "sal", saldo: 2 }));
    check(
      "ajuste mostra o antes e o depois e pede confirmação",
      ajustePergunta.requires_confirmation === true &&
        ajustePergunta.reply_text.includes("passa de"),
      ajustePergunta.reply_text,
    );
    check("e não mexeu no saldo ainda", (await saldoDe(sal.data.id)) === saldoAntesDaDiferenca);
    const ajusteConfirma = await ajustarEstoque(comoEle({}, { confirmed: true }));
    check(
      "com o sim, ajusta para o valor MOSTRADO",
      ajusteConfirma.action_taken === "ajustar_estoque:ok" && (await saldoDe(sal.data.id)) === 2,
      String(await saldoDe(sal.data.id)),
    );

    // ------------------------------------------------------------------
    console.log("\n10. Concordância: o produtor lê isso todo dia");
    // ------------------------------------------------------------------
    const diesel = await createProduct(db, {
      name: "Oleo diesel",
      category_id: categorias.find((c) => c.name === "Combustível")!.id,
      unit: "litro",
    });
    if (!diesel.ok) throw new Error("faltou o diesel");
    await recordStockMovement(db, {
      product_id: diesel.data.id,
      property_id: fazenda.id,
      movement_type: "compra",
      quantity: 500,
    });
    await clearPendingStock(tenant.id, conversador.id);

    const perguntaMasculina = await registrarUsoEstoque(comoEle({ produto: "diesel" }));
    check(
      '"Quantos litros", não "Quantas litros"',
      perguntaMasculina.reply_text.startsWith("Quantos litros"),
      perguntaMasculina.reply_text,
    );
    const usoMasculino = await registrarUsoEstoque(comoEle({ quantidade: 30 }));
    check(
      '"30 litros usados", não "usadas"',
      usoMasculino.reply_text.includes("usados"),
      usoMasculino.reply_text,
    );
    const perguntaFeminina = await registrarUsoEstoque(comoEle({ produto: "sal" }));
    check(
      'e continua "Quantas sacas" para a unidade feminina',
      perguntaFeminina.reply_text.startsWith("Quantas sacas"),
      perguntaFeminina.reply_text,
    );
    await clearPendingStock(tenant.id, conversador.id);

    // ------------------------------------------------------------------
    console.log("\n12. A borda que faltava: o produtor NAO disse sim");
    // ------------------------------------------------------------------
    // Todos os casos abaixo vieram de um revisor independente que reproduziu
    // cada um ao vivo. A suite anterior passava verde porque so exercitava
    // `confirmed: true`, ou seja, nunca testava a confirmacao de fato.
    await clearPendingStock(tenant.id, conversador.id);
    // Repoe o estoque: os blocos anteriores gastaram o sal, e uma falha por
    // falta de saldo aqui pareceria defeito de confirmacao.
    await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazenda.id,
      movement_type: "compra",
      quantity: 40,
    });
    const saldoBase = await saldoDe(sal.data.id);

    const mostrouAjuste = await ajustarEstoque(comoEle({ produto: "sal", saldo: 7 }));
    check(
      "o ajuste pergunta antes",
      mostrouAjuste.requires_confirmation === true,
      mostrouAjuste.reply_text,
    );
    const enrolou = await ajustarEstoque(comoEle({ observacao: "perai, deixa eu contar de novo" }));
    check(
      '"peraí, deixa eu contar de novo" NAO confirma o ajuste',
      enrolou.action_taken !== "ajustar_estoque:ok",
      enrolou.action_taken,
    );
    check(
      "e o saldo continua intacto",
      (await saldoDe(sal.data.id)) === saldoBase,
      String(await saldoDe(sal.data.id)),
    );

    // A borda contraria, para a correcao nao criar o problema oposto: o "sim"
    // de verdade ainda executa.
    const simDeVerdade = await ajustarEstoque(comoEle({}, { confirmed: true }));
    check(
      "e o sim de verdade executa",
      simDeVerdade.action_taken === "ajustar_estoque:ok" && (await saldoDe(sal.data.id)) === 7,
      simDeVerdade.action_taken,
    );

    // Corrigir o valor no meio da confirmacao NAO pode valer como sim.
    await clearPendingStock(tenant.id, conversador.id);
    const negociosAntesDaCorrecao = await db.negotiation.count();
    await registrarNegocioProduto(
      comoEle({ tipo: "compra", produto: "sal", quantidade: 10, valor: 1200 }),
    );
    const corrigindo = await registrarNegocioProduto(
      comoEle({ tipo: "compra", produto: "sal", quantidade: 50, valor: 6000 }),
    );
    check(
      "corrigir a quantidade durante a confirmacao NAO grava a versao antiga",
      corrigindo.action_taken !== "registrar_negocio_produto:ok" &&
        (await db.negotiation.count()) === negociosAntesDaCorrecao,
      corrigindo.action_taken,
    );
    check(
      "e a nova confirmacao mostra o valor CORRIGIDO",
      corrigindo.reply_text.includes("50 sacas"),
      corrigindo.reply_text,
    );

    // "ok sao 4 sacas": o "ok" e muleta de fala, nao confirmacao de nada.
    await clearPendingStock(tenant.id, conversador.id);
    const saldoAntesDoOk = await saldoDe(sal.data.id);
    await ajustarEstoque(comoEle({ produto: "sal" }));
    const okComNumero = await ajustarEstoque(comoEle({ saldo: 4 }, { confirmed: true }));
    check(
      '"ok são 4 sacas" responde a pergunta, nao confirma o ajuste',
      okComNumero.requires_confirmation === true,
      okComNumero.reply_text,
    );
    check("e nao mexeu no saldo", (await saldoDe(sal.data.id)) === saldoAntesDoOk);

    // "sim" sem nada guardado nao escreve.
    await clearPendingStock(tenant.id, conversador.id);
    const simSozinho = await registrarNegocioProduto(
      comoEle({ tipo: "compra", produto: "sal", quantidade: 99, valor: 9999 }, { confirmed: true }),
    );
    check(
      '"sim" sem nada esperando confirmacao NAO grava',
      simSozinho.action_taken === "clarification_requested",
      simSozinho.action_taken,
    );

    // Sem user_id nao ha ancora, entao um confirmed tambem nao escreve.
    const semAncora = await registrarNegocioProduto(
      ctx(db, tenant.id, { tipo: "compra", produto: "sal", quantidade: 7, valor: 700 }, { confirmed: true }),
    );
    check(
      "sem usuario resolvido, confirmed NAO escreve",
      semAncora.action_taken === "clarification_requested",
      semAncora.action_taken,
    );

    // ------------------------------------------------------------------
    console.log("\n13. Assunto novo NAO e engolido pela conversa aberta");
    // ------------------------------------------------------------------
    const rotear = (intent: string, parametros: Record<string, unknown>) =>
      routeIntent(db, {
        tenant_id: tenant.id,
        role: "OWNER",
        activeProfiles: ["fazenda"],
        intent: intent as Parameters<typeof routeIntent>[1]["intent"],
        parameters: parametros,
        confirmed: false,
        explicitNo: false,
        user_id: conversador.id,
      });

    await clearPendingStock(tenant.id, conversador.id);
    await registrarUsoEstoque(comoEle({ produto: "sal" })); // deixa uma pergunta aberta

    const tarefa = await rotear("criar_tarefa", { titulo: "vacinar o lote 3", quando: "amanha" });
    check(
      "uma tarefa nova nao vira 'Quantas sacas de sal?'",
      !tarefa.action_taken.startsWith("registrar_uso_estoque"),
      tarefa.action_taken,
    );

    const ajudaPedida = await rotear("ajuda", {});
    check(
      '"o que voce faz?" tambem nao',
      !ajudaPedida.action_taken.startsWith("registrar_uso_estoque"),
      ajudaPedida.action_taken,
    );

    const despesa = await rotear("registrar_lancamento_financeiro", {
      amount: 500,
      category: "Combustível",
      description: "diesel",
    });
    check(
      "e uma despesa avulsa tambem nao",
      !despesa.action_taken.startsWith("registrar_uso_estoque"),
      despesa.action_taken,
    );

    // A borda contraria: uma RESPOSTA curta continua voltando para o estoque.
    const respostaCurta = await rotear("ambigua", { quantidade: 1 });
    check(
      "mas uma resposta curta ainda volta para a pergunta do estoque",
      respostaCurta.action_taken.startsWith("registrar_uso_estoque"),
      respostaCurta.action_taken,
    );
    await clearPendingStock(tenant.id, conversador.id);

    // ------------------------------------------------------------------
    console.log("\n14. Duas conversas abertas: a MAIS RECENTE responde");
    // ------------------------------------------------------------------
    await clearPendingStock(tenant.id, conversador.id);
    await clearPendingNegotiation(tenant.id, conversador.id);

    // Estoque primeiro, gado depois: o "sim" e do GADO.
    await registrarUsoEstoque(comoEle({ produto: "sal" }));
    await savePendingNegotiation(tenant.id, conversador.id, {
      parameters: { tipo: "compra", categoria: "bezerro", quantidade: 20, valor: 60000 },
      aguardando: "confirmacao",
      salvo_em: Date.now() + 1000,
    });
    const gadoAntes = await db.negotiation.count({ where: { type: "compra_gado" } });
    await routeIntent(db, {
      tenant_id: tenant.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_negocio_gado",
      parameters: {},
      confirmed: true,
      explicitNo: false,
      user_id: conversador.id,
    });
    check(
      'com o gado mais recente, o "sim" registra o GADO',
      (await db.negotiation.count({ where: { type: "compra_gado" } })) === gadoAntes + 1,
      "o estoque roubou a resposta",
    );
    check(
      "e a pergunta do estoque continua viva, nao foi destruida",
      (await loadPendingStock(tenant.id, conversador.id)) !== null,
      "APAGADA",
    );
    await clearPendingStock(tenant.id, conversador.id);
    await clearPendingNegotiation(tenant.id, conversador.id);

    // ------------------------------------------------------------------
    console.log("\n15. Perguntas que guardavam o campo ERRADO");
    // ------------------------------------------------------------------
    await clearPendingStock(tenant.id, conversador.id);
    const dataRuim = await registrarUsoEstoque(
      comoEle({ produto: "sal", quantidade: 1, data: "2026-02-31" }),
    );
    check(
      "data impossivel vira pergunta",
      dataRuim.action_taken === "clarification_requested",
      dataRuim.reply_text,
    );
    const dataBoa = await registrarUsoEstoque(comoEle({ data: "10/12" }));
    check(
      "e a data certa RESOLVE, em vez de repetir a velha",
      dataBoa.action_taken === "registrar_uso_estoque:ok",
      dataBoa.reply_text,
    );

    await clearPendingStock(tenant.id, conversador.id);
    const contradicao = await registrarNegocioProduto(
      comoEle({ tipo: "compra", produto: "sal", quantidade: 1, valor: 300, pago: "sim", parcelas: "3x" }),
    );
    check(
      "pago e parcelado ao mesmo tempo vira pergunta",
      contradicao.action_taken === "clarification_requested",
      contradicao.reply_text,
    );
    const escolheu = await registrarNegocioProduto(comoEle({ parcelas: "3x" }));
    check(
      "e escolher um dos lados RESOLVE a contradicao",
      escolheu.requires_confirmation === true,
      escolheu.reply_text,
    );
    await clearPendingStock(tenant.id, conversador.id);

    // ------------------------------------------------------------------
    console.log("\n16. Recusa nao pode engolir resposta");
    // ------------------------------------------------------------------
    await clearPendingStock(tenant.id, conversador.id);
    await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazenda.id,
      movement_type: "compra",
      quantity: 20,
    });
    const saldoAntesDoNao = await saldoDe(sal.data.id);
    await registrarUsoEstoque(comoEle({ produto: "sal" }));
    const naoSeiAoCerto = await registrarUsoEstoque(
      comoEle({ quantidade: 1 }, { explicitNo: true }),
    );
    check(
      '"nao sei ao certo, umas 1" e RESPOSTA, nao cancelamento',
      naoSeiAoCerto.action_taken === "registrar_uso_estoque:ok",
      naoSeiAoCerto.action_taken,
    );
    check("e o uso entrou", (await saldoDe(sal.data.id)) === saldoAntesDoNao - 1);

    // A borda contraria: "nao" seco continua cancelando.
    await registrarUsoEstoque(comoEle({ produto: "sal" }));
    const naoSeco = await registrarUsoEstoque(comoEle({}, { explicitNo: true }));
    check(
      'e "nao" seco continua cancelando',
      naoSeco.action_taken === "registrar_uso_estoque:cancelado",
      naoSeco.action_taken,
    );

    // ------------------------------------------------------------------
    console.log("\n17. Concordancia de NUMERO, nao so de genero");
    // ------------------------------------------------------------------
    await clearPendingStock(tenant.id, conversador.id);
    const umaSaca = await registrarUsoEstoque(comoEle({ produto: "sal", quantidade: 1 }));
    check(
      '"1 saca usada", nao "1 saca usadas"',
      umaSaca.reply_text.includes("usada em") && !umaSaca.reply_text.includes("usadas em"),
      umaSaca.reply_text,
    );
    const umLitro = await registrarUsoEstoque(comoEle({ produto: "diesel", quantidade: 1 }));
    check(
      '"1 litro usado", nao "usados"',
      umLitro.reply_text.includes("usado em") && !umLitro.reply_text.includes("usados em"),
      umLitro.reply_text,
    );
    await clearPendingStock(tenant.id, conversador.id);
    // ------------------------------------------------------------------
    console.log("\n18. Recusa na hora de CONFIRMAR (a borda que faltava)");
    // ------------------------------------------------------------------
    // A correcao anterior do `explicitNo` criou o problema oposto: "nao" na
    // hora de confirmar nao cancelava, a mesma confirmacao voltava, o contador
    // de tentativas nem subia, e a unica saida do produtor preso era dizer
    // "ok", que EXECUTAVA o ajuste que ele tinha acabado de recusar.
    await clearPendingStock(tenant.id, conversador.id);
    await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazenda.id,
      movement_type: "compra",
      quantity: 20,
    });
    const saldoAntesDaRecusa = await saldoDe(sal.data.id);

    const pediuConfirmacao = await ajustarEstoque(comoEle({ produto: "sal", saldo: 2 }));
    check(
      "o ajuste pede confirmacao",
      pediuConfirmacao.requires_confirmation === true,
      pediuConfirmacao.reply_text,
    );
    const recusou = await ajustarEstoque(comoEle({}, { explicitNo: true }));
    check(
      '"nao" na hora de confirmar CANCELA',
      recusou.action_taken === "ajustar_estoque:cancelado",
      recusou.action_taken,
    );
    check(
      "e o pendente morre junto, sem laco",
      (await loadPendingStock(tenant.id, conversador.id)) === null,
      "SOBREVIVEU",
    );
    check(
      "o saldo fica intacto depois da recusa",
      (await saldoDe(sal.data.id)) === saldoAntesDaRecusa,
      String(await saldoDe(sal.data.id)),
    );
    // E o "ok" seguinte NAO pode ressuscitar o ajuste recusado.
    const okDepoisDaRecusa = await ajustarEstoque(comoEle({}, { confirmed: true }));
    check(
      'um "ok" depois da recusa nao executa o ajuste que foi recusado',
      okDepoisDaRecusa.action_taken !== "ajustar_estoque:ok" &&
        (await saldoDe(sal.data.id)) === saldoAntesDaRecusa,
      okDepoisDaRecusa.action_taken,
    );

    // A borda contraria, para a correcao nao criar o oposto de novo: "nao"
    // esperando um CAMPO, com a resposta junto, continua sendo resposta.
    await clearPendingStock(tenant.id, conversador.id);
    const saldoAntesDoTalvez = await saldoDe(sal.data.id);
    await registrarUsoEstoque(comoEle({ produto: "sal" }));
    const naoComResposta = await registrarUsoEstoque(
      comoEle({ quantidade: 2 }, { explicitNo: true }),
    );
    check(
      '"nao sei ao certo, umas 2" esperando CAMPO continua sendo resposta',
      naoComResposta.action_taken === "registrar_uso_estoque:ok",
      naoComResposta.action_taken,
    );
    check("e o uso entrou", (await saldoDe(sal.data.id)) === saldoAntesDoTalvez - 2);

    // ------------------------------------------------------------------
    console.log("\n19. O leitor de numero e o MESMO na tela e na conversa");
    // ------------------------------------------------------------------
    // Um revisor achou que a correcao de magnitude tinha sido feita so no
    // WhatsApp: a tela seguia com `Number` cru, e "1.500" virava 1,5 num campo
    // que sobrescreve o saldo com um clique e sem como desfazer.
    check('"1.500" e mil e quinhentos', lerNumeroBr("1.500") === 1500, String(lerNumeroBr("1.500")));
    check('"1.000" e mil', lerNumeroBr("1.000") === 1000, String(lerNumeroBr("1.000")));
    check('"2,5" e dois e meio', lerNumeroBr("2,5") === 2.5, String(lerNumeroBr("2,5")));
    check('"2.5" tambem e dois e meio', lerNumeroBr("2.5") === 2.5, String(lerNumeroBr("2.5")));
    check('"60 mil" e sessenta mil', lerNumeroBr("60 mil") === 60000, String(lerNumeroBr("60 mil")));
    check('"12.50" e doze e cinquenta', lerNumeroBr("12.50") === 12.5, String(lerNumeroBr("12.50")));
    check("texto sem numero nao vira zero", lerNumeroBr("umas quantas") === null);
    check("vazio nao vira zero", lerNumeroBr("") === null);
    check("mas o zero de verdade continua zero", lerNumeroBr("0") === 0);

    // ------------------------------------------------------------------
    console.log("\n11. Permissão: VISUALIZADOR não escreve pelo WhatsApp");    // ------------------------------------------------------------------
    const semPermissao = await routeIntent(db, {
      tenant_id: tenant.id,
      role: "VISUALIZADOR",
      activeProfiles: ["fazenda"],
      intent: "registrar_uso_estoque",
      parameters: { produto: "sal", quantidade: 1 },
      confirmed: false,
      explicitNo: false,
    });
    check(
      "visualizador não registra uso",
      semPermissao.action_taken === "registrar_uso_estoque:sem_permissao",
      semPermissao.action_taken,
    );
    const podeLer = await routeIntent(db, {
      tenant_id: tenant.id,
      role: "VISUALIZADOR",
      activeProfiles: ["fazenda"],
      intent: "consultar_estoque",
      parameters: {},
      confirmed: false,
      explicitNo: false,
    });
    check(
      "mas consulta, porque leitura é permitida para ele",
      !podeLer.action_taken.includes("sem_permissao"),
      podeLer.action_taken,
    );
  } finally {
    await prisma.alert.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.financialEntry.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.stockMovement.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.herdMovement.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.negotiation.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.contact.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.product.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.productCategory.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.property.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.user.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenantProfile.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }

  console.log("");
  console.log(
    falhas === 0
      ? "✅ Estoque pelo WhatsApp: 0 falhas."
      : `❌ Estoque pelo WhatsApp: ${falhas} falha(s).`,
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
