import "dotenv/config";
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
    const ajusteMenos = await ajustarEstoque(
      ctx(db, tenant.id, { produto: "sal", saldo: 6, motivo: "contagem do galpao" }),
    );
    check("ajuste registrado sem confirmação", ajusteMenos.requires_confirmation === false);
    check("saldo virou 6", (await saldoDe(sal.data.id)) === 6, String(await saldoDe(sal.data.id)));
    check(
      "a resposta diz que TIROU, porque foi para menos",
      ajusteMenos.reply_text.includes("Tirei 1,5 sacas"),
      ajusteMenos.reply_text,
    );

    // A borda contrária, que é onde o sinal errado passaria despercebido.
    const ajusteMais = await ajustarEstoque(ctx(db, tenant.id, { produto: "sal", saldo: 9 }));
    check("saldo virou 9", (await saldoDe(sal.data.id)) === 9);
    check(
      "e a resposta diz que SOMOU",
      ajusteMais.reply_text.includes("Somei 3 sacas"),
      ajusteMais.reply_text,
    );

    const semMudanca = await ajustarEstoque(ctx(db, tenant.id, { produto: "sal", saldo: 9 }));
    check(
      "contar o mesmo número não grava movimento de zero",
      semMudanca.reply_text.includes("Não mudei nada"),
      semMudanca.reply_text,
    );

    check(
      "ajuste aceita ZERO: contou e não tinha nada",
      (await ajustarEstoque(ctx(db, tenant.id, { produto: "enxada", saldo: 0 }))).action_taken ===
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
    const executada = await registrarNegocioProduto(
      ctx(
        db,
        tenant.id,
        {
          tipo: "compra",
          produto: "sal",
          quantidade: 10,
          valor: "1.200",
          contato: "Agropecuaria Central",
          vencimento: "dia 10",
          custos: [{ descricao: "Frete", valor: "150" }],
        },
        { confirmed: true },
      ),
    );
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
    console.log("\n7. Permissão: VISUALIZADOR não escreve pelo WhatsApp");
    // ------------------------------------------------------------------
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
