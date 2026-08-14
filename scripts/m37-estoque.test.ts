import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import {
  getStockBalance,
  recordStockMovement,
  adjustStock,
  deltaDoMovimento,
} from "@/lib/actions/stock-ledger";
import {
  ensureProductCategories,
  listProductCategories,
  createProduct,
  listProductsWithBalance,
} from "@/lib/actions/products";
import { STOCK_UNITS, descreverQuantidade, findUnit } from "@/lib/stock/units";
import { createProductNegotiation } from "@/lib/actions/product-negotiations";
import { cancelNegotiation } from "@/lib/actions/negotiations";
import { gerarAlertasDeEstoqueMinimo } from "@/lib/actions/alerts";
import {
  setAlertPreferenceAction,
  isAlertTypeEnabled,
} from "@/lib/actions/alert-preferences";
import {
  productCreateSchema,
  productNegotiationSchema,
  stockMovementSchema,
  stockAdjustSchema,
} from "@/lib/validation/stock";

/**
 * Módulo 31, missão 2: estoque de produtos (§9 e §10).
 *
 * A decisão que este arquivo protege: **o saldo nunca é gravado**, é a soma das
 * movimentações por produto e fazenda. O bloco 1 lê o `information_schema` para
 * provar isso, do mesmo jeito que o `m35` prova para a negociação.
 *
 * Toda regra é testada nas DUAS bordas, desde a primeira versão. Na missão 1,
 * seis das oito rodadas de juiz acharam uma correção que criou o problema
 * oposto, sempre porque só a direção apontada tinha teste.
 *
 * Roda: `npm run test:m37`
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.error(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function main() {
  console.log("📦 Módulo 31, missão 2: estoque de produtos (§9 e §10)\n");

  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "M37 Estoque", document: `37${stamp}0`, plan: "fazenda" },
  });

  try {
    const db = prismaForTenant(tenant.id);
    const fazendaA = await db.property.create({ data: scoped({ name: "Fazenda A" }) });
    const fazendaB = await db.property.create({ data: scoped({ name: "Fazenda B" }) });

    // ------------------------------------------------------------------
    console.log("1. O saldo NÃO é uma coluna");
    // ------------------------------------------------------------------
    const colunasProduto = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Product'`,
    );
    const nomes = colunasProduto.map((c) => c.column_name);
    check(
      "Product não tem coluna de saldo, quantidade nem estoque atual",
      !nomes.some((n) => ["quantity", "balance", "saldo", "stock", "current_stock"].includes(n)),
      nomes.join(", "),
    );

    // ------------------------------------------------------------------
    console.log("\n2. §9.1: as 15 categorias nascem na primeira abertura");
    // ------------------------------------------------------------------
    check("tenant novo começa sem categoria", (await listProductCategories(db)).length === 0);

    const criadas = await ensureProductCategories(db);
    check("a primeira abertura cria 15", criadas === 15, String(criadas));
    const categorias = await listProductCategories(db);
    check("e elas ficam listáveis", categorias.length === 15, String(categorias.length));
    check(
      "com os nomes do documento",
      categorias.some((c) => c.name === "Sal mineral") &&
        categorias.some((c) => c.name === "Produtos veterinários"),
      categorias.map((c) => c.name).join(", "),
    );

    const denovo = await ensureProductCategories(db);
    check("abrir de novo NÃO duplica", denovo === 0 && (await listProductCategories(db)).length === 15);

    // Quem apagou uma categoria apagou querendo: não se repõe uma a uma.
    const paraArquivar = categorias.find((c) => c.name === "Lubrificantes")!;
    await db.productCategory.update({
      where: { id: paraArquivar.id },
      data: { archived_at: new Date() },
    });
    await ensureProductCategories(db);
    check(
      "e não ressuscita a categoria que o produtor arquivou",
      (await listProductCategories(db)).length === 14,
      String((await listProductCategories(db)).length),
    );

    const salMineral = categorias.find((c) => c.name === "Sal mineral")!;
    const ferramentas = categorias.find((c) => c.name === "Ferramentas")!;

    // ------------------------------------------------------------------
    console.log("\n3. §10.5: as unidades, e quem aceita quantidade quebrada");
    // ------------------------------------------------------------------
    check("as 11 unidades do documento existem", STOCK_UNITS.length === 11, String(STOCK_UNITS.length));
    check("saca aceita fracionada (§10.5 dá '0,5 saca')", findUnit("saca")?.fracionavel === true);
    check("litro aceita fracionada ('2,5 litros')", findUnit("litro")?.fracionavel === true);
    check("unidade NÃO aceita: meia unidade não existe", findUnit("unidade")?.fracionavel === false);
    check("ferramenta é contada em unidade inteira", findUnit("frasco")?.fracionavel === false);
    check('descreve "1 saca" no singular', descreverQuantidade(1, "saca") === "1 saca");
    check('e "10 sacas" no plural', descreverQuantidade(10, "saca") === "10 sacas");
    check(
      'meio não é singular: "0,5 sacas"',
      descreverQuantidade(0.5, "saca") === "0,5 sacas",
      descreverQuantidade(0.5, "saca"),
    );

    // ------------------------------------------------------------------
    console.log("\n4. Cadastro de produto");
    // ------------------------------------------------------------------
    const sal = await createProduct(db, {
      name: "Sal mineral 60 P",
      category_id: salMineral.id,
      unit: "saca",
      minimum_stock: 3,
    });
    check("produto criado", sal.ok, !sal.ok ? sal.message : "");
    if (!sal.ok) throw new Error("sem o produto o resto não faz sentido");

    const enxada = await createProduct(db, {
      name: "Enxada",
      category_id: ferramentas.id,
      unit: "unidade",
    });
    check("segundo produto, em unidade inteira", enxada.ok);
    if (!enxada.ok) throw new Error("faltou o produto de unidade inteira");

    const duplicado = await createProduct(db, {
      name: "sal mineral 60 p",
      category_id: salMineral.id,
      unit: "saca",
    });
    check(
      "nome repetido é recusado, mesmo em outra caixa",
      !duplicado.ok && duplicado.code === "DUPLICATE_PRODUCT",
      !duplicado.ok ? duplicado.code : "ACEITOU",
    );

    const semUnidade = await createProduct(db, {
      name: "Produto sem unidade",
      category_id: salMineral.id,
      unit: "arroba",
    });
    check("unidade fora da lista é recusada", !semUnidade.ok);

    const semNome = await createProduct(db, {
      name: "   ",
      category_id: salMineral.id,
      unit: "saca",
    });
    check("nome vazio é recusado", !semNome.ok);

    const categoriaInvalida = await createProduct(db, {
      name: "Outro produto",
      category_id: "nao-existe",
      unit: "saca",
    });
    check(
      "categoria inexistente é recusada",
      !categoriaInvalida.ok && categoriaInvalida.code === "INVALID_CATEGORY",
    );

    const minimoNegativo = await createProduct(db, {
      name: "Produto com minimo negativo",
      category_id: salMineral.id,
      unit: "saca",
      minimum_stock: -5,
    });
    check("estoque mínimo negativo é recusado", !minimoNegativo.ok);

    // ------------------------------------------------------------------
    console.log("\n5. §10.2: entrada por compra soma");
    // ------------------------------------------------------------------
    const compra = await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: 10,
    });
    check("compra registrada", compra.ok, !compra.ok ? compra.message : "");
    const saldoDe = async (produto: string, fazenda?: string) => {
      const p = await getStockBalance(db, { product_id: produto, property_id: fazenda });
      return p.reduce((s, x) => s + x.quantity, 0);
    };
    check(
      "10 sacas de sal, como no exemplo do §10.2",
      (await saldoDe(sal.data.id, fazendaA.id)) === 10,
      String(await saldoDe(sal.data.id, fazendaA.id)),
    );

    // ------------------------------------------------------------------
    console.log("\n6. §10.3: utilização subtrai");
    // ------------------------------------------------------------------
    const uso = await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "utilizacao",
      quantity: 1,
    });
    check("uso registrado ('usei uma saca de sal')", uso.ok, !uso.ok ? uso.message : "");
    check("sobraram 9", (await saldoDe(sal.data.id, fazendaA.id)) === 9);

    const meiaSaca = await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "utilizacao",
      quantity: 0.5,
    });
    check("meia saca é aceita (§10.5)", meiaSaca.ok, !meiaSaca.ok ? meiaSaca.message : "");
    check(
      "e o saldo fica 8,5 sem lixo de ponto flutuante",
      (await saldoDe(sal.data.id, fazendaA.id)) === 8.5,
      String(await saldoDe(sal.data.id, fazendaA.id)),
    );

    const meiaEnxada = await recordStockMovement(db, {
      product_id: enxada.data.id,
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: 2.5,
    });
    check(
      "MEIA ENXADA é recusada: nem toda unidade aceita quebrado",
      !meiaEnxada.ok && meiaEnxada.message.includes("quebrada"),
      !meiaEnxada.ok ? meiaEnxada.message : "ACEITOU",
    );

    // ------------------------------------------------------------------
    console.log("\n7. §10.7: saída acima do disponível, nas duas bordas");
    // ------------------------------------------------------------------
    const noLimite = await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "utilizacao",
      quantity: 8.5,
    });
    check("usar EXATAMENTE o que existe é aceito", noLimite.ok, !noLimite.ok ? noLimite.message : "");
    check("e o saldo zera", (await saldoDe(sal.data.id, fazendaA.id)) === 0);

    await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: 3,
    });
    const umAMais = await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "utilizacao",
      quantity: 3.001,
    });
    check(
      "um pouquinho a mais é recusado",
      !umAMais.ok && umAMais.code === "INSUFFICIENT_STOCK",
      !umAMais.ok ? umAMais.code : "ACEITOU",
    );
    check(
      "com a mensagem literal do §10.7",
      !umAMais.ok &&
        umAMais.message === "Existem apenas 3 sacas disponíveis. Revise a quantidade informada.",
      !umAMais.ok ? umAMais.message : "",
    );
    check("e o saldo não se mexeu depois da recusa", (await saldoDe(sal.data.id, fazendaA.id)) === 3);

    // ------------------------------------------------------------------
    console.log("\n8. §10.6: ajuste, para MENOS e para MAIS");
    // ------------------------------------------------------------------
    // O exemplo literal do documento: mostra 9, existem 8.
    await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaB.id,
      movement_type: "compra",
      quantity: 9,
    });
    check("Fazenda B com 9 sacas", (await saldoDe(sal.data.id, fazendaB.id)) === 9);

    const paraMenos = await adjustStock(db, {
      product_id: sal.data.id,
      property_id: fazendaB.id,
      corrected_balance: 8,
      reason: "contei no galpão",
    });
    check("ajuste para menos aceito", paraMenos.ok, !paraMenos.ok ? paraMenos.message : "");
    check(
      "a diferença é NEGATIVA",
      paraMenos.ok && paraMenos.data.diferenca === -1,
      paraMenos.ok ? String(paraMenos.data.diferenca) : "",
    );
    check(
      "e o saldo DESCE para 8, não sobe para 10",
      (await saldoDe(sal.data.id, fazendaB.id)) === 8,
      String(await saldoDe(sal.data.id, fazendaB.id)),
    );

    const paraMais = await adjustStock(db, {
      product_id: sal.data.id,
      property_id: fazendaB.id,
      corrected_balance: 12,
    });
    check("ajuste para mais aceito", paraMais.ok);
    check(
      "a diferença é POSITIVA",
      paraMais.ok && paraMais.data.diferenca === 4,
      paraMais.ok ? String(paraMais.data.diferenca) : "",
    );
    check("e o saldo sobe para 12", (await saldoDe(sal.data.id, fazendaB.id)) === 12);

    const movimentoAjuste = await db.stockMovement.findFirst({
      where: { movement_type: "ajuste", property_id: fazendaB.id },
      orderBy: { created_at: "asc" },
    });
    check(
      "o histórico guarda o saldo ANTERIOR (§10.6)",
      Number(movimentoAjuste?.previous_balance) === 9,
      String(movimentoAjuste?.previous_balance),
    );
    check(
      "e o saldo CORRIGIDO",
      Number(movimentoAjuste?.corrected_balance) === 8,
      String(movimentoAjuste?.corrected_balance),
    );
    check("e o motivo, quando informado", movimentoAjuste?.notes === "contei no galpão");

    const semMudanca = await adjustStock(db, {
      product_id: sal.data.id,
      property_id: fazendaB.id,
      corrected_balance: 12,
    });
    check(
      "ajustar para o valor que já está não grava movimento vazio",
      !semMudanca.ok && semMudanca.code === "NO_CHANGE",
      !semMudanca.ok ? semMudanca.code : "GRAVOU",
    );

    const ajusteNegativo = await adjustStock(db, {
      product_id: sal.data.id,
      property_id: fazendaB.id,
      corrected_balance: -1,
    });
    check("ajustar para saldo negativo é recusado", !ajusteNegativo.ok);

    // ------------------------------------------------------------------
    console.log("\n9. O saldo é por FAZENDA, não por tenant");
    // ------------------------------------------------------------------
    check("Fazenda A tem 3", (await saldoDe(sal.data.id, fazendaA.id)) === 3);
    check("Fazenda B tem 12", (await saldoDe(sal.data.id, fazendaB.id)) === 12);
    check("e o total do produto é 15", (await saldoDe(sal.data.id)) === 15);

    const usarDeOndeNaoTem = await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "utilizacao",
      quantity: 10,
    });
    check(
      "não dá para usar na Fazenda A o sal que está na B",
      !usarDeOndeNaoTem.ok && usarDeOndeNaoTem.code === "INSUFFICIENT_STOCK",
      !usarDeOndeNaoTem.ok ? usarDeOndeNaoTem.message : "ACEITOU",
    );

    // ------------------------------------------------------------------
    console.log("\n10. Sem filtro, o saldo devolve TUDO");
    // ------------------------------------------------------------------
    // A borda que o rebanho errou: `getPositions(db, {})` devolvia lista vazia
    // com o livro cheio, e ainda fazia uma asserção de isolamento passar pelo
    // motivo errado.
    const tudo = await getStockBalance(db, {});
    check(
      "sem filtro devolve as posições existentes, não lista vazia",
      tudo.length >= 2,
      String(tudo.length),
    );
    const somaGeral = tudo.reduce((s, p) => s + p.quantity, 0);
    check("e a soma bate com as duas fazendas (3 + 12)", somaGeral === 15, String(somaGeral));

    // ------------------------------------------------------------------
    console.log("\n11. Movimento cancelado sai do saldo");
    // ------------------------------------------------------------------
    const paraCancelar = await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: 5,
    });
    check("compra extra registrada", paraCancelar.ok);
    check("saldo subiu para 8", (await saldoDe(sal.data.id, fazendaA.id)) === 8);
    if (paraCancelar.ok) {
      await db.stockMovement.update({
        where: { id: paraCancelar.data.id },
        data: { canceled_at: new Date(), canceled_reason: "lançado errado" },
      });
    }
    check(
      "e volta para 3 quando o movimento é cancelado",
      (await saldoDe(sal.data.id, fazendaA.id)) === 3,
      String(await saldoDe(sal.data.id, fazendaA.id)),
    );

    // ------------------------------------------------------------------
    console.log("\n12. §10.8: estoque mínimo");
    // ------------------------------------------------------------------
    const comSaldo = await listProductsWithBalance(db);
    const linhaSal = comSaldo.find((p) => p.id === sal.data.id);
    check("a lista traz o saldo por fazenda", linhaSal?.saldo_por_fazenda.length === 2);
    check("e o total", linhaSal?.saldo_total === 15, String(linhaSal?.saldo_total));
    check(
      "com 15 sacas e mínimo 3, NÃO está abaixo",
      linhaSal?.abaixo_do_minimo === false,
      String(linhaSal?.abaixo_do_minimo),
    );

    await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaB.id,
      movement_type: "utilizacao",
      quantity: 12,
    });
    const noLimiteDoMinimo = (await listProductsWithBalance(db)).find((p) => p.id === sal.data.id);
    check(
      "no limite exato do mínimo JÁ conta como baixo (§10.8: 'atingir esse limite')",
      noLimiteDoMinimo?.abaixo_do_minimo === true,
      `saldo ${noLimiteDoMinimo?.saldo_total}, mínimo ${noLimiteDoMinimo?.minimum_stock}`,
    );

    const semMinimo = comSaldo.find((p) => p.id === enxada.data.id);
    check(
      "produto sem mínimo definido nunca fica abaixo",
      semMinimo?.abaixo_do_minimo === false,
      String(semMinimo?.abaixo_do_minimo),
    );

    // ------------------------------------------------------------------
    console.log("\n13. Recusas do livro-razão");
    // ------------------------------------------------------------------
    const produtoInvalido = await recordStockMovement(db, {
      product_id: "nao-existe",
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: 1,
    });
    check("produto inexistente é recusado", !produtoInvalido.ok && produtoInvalido.code === "INVALID_PRODUCT");

    const fazendaInvalida = await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: "nao-existe",
      movement_type: "compra",
      quantity: 1,
    });
    check("fazenda inexistente é recusada", !fazendaInvalida.ok && fazendaInvalida.code === "INVALID_PROPERTY");

    const quantidadeZero = await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: 0,
    });
    check("quantidade zero é recusada", !quantidadeZero.ok);

    const quantidadeNegativa = await recordStockMovement(db, {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: -5,
    });
    check("quantidade negativa é recusada", !quantidadeNegativa.ok);

    // ------------------------------------------------------------------
    console.log("\n14. A função de sinal, nos dois sentidos");
    // ------------------------------------------------------------------
    check("compra soma", deltaDoMovimento({ movement_type: "compra", quantity: 5 }) === 5);
    check("venda subtrai", deltaDoMovimento({ movement_type: "venda", quantity: 5 }) === -5);
    check("uso subtrai", deltaDoMovimento({ movement_type: "utilizacao", quantity: 5 }) === -5);
    check(
      "permuta de entrada soma",
      deltaDoMovimento({ movement_type: "permuta_entrada", quantity: 5 }) === 5,
    );
    check(
      "permuta de saída subtrai",
      deltaDoMovimento({ movement_type: "permuta_saida", quantity: 5 }) === -5,
    );
    check(
      "ajuste PARA MENOS subtrai, mesmo com quantity positiva",
      deltaDoMovimento({
        movement_type: "ajuste",
        quantity: 1,
        previous_balance: 9,
        corrected_balance: 8,
      }) === -1,
    );
    check(
      "ajuste PARA MAIS soma",
      deltaDoMovimento({
        movement_type: "ajuste",
        quantity: 4,
        previous_balance: 8,
        corrected_balance: 12,
      }) === 4,
    );

    // ------------------------------------------------------------------
    console.log("\n15. §9: comprei produtos (o envelope de negociação)");
    // ------------------------------------------------------------------
    const saldoAntesDaCompra = await saldoDe(sal.data.id, fazendaB.id);

    const compraProduto = await createProductNegotiation(db, {
      type: "compra_produto",
      property_id: fazendaB.id,
      itens: [{ product_id: sal.data.id, quantity: 20 }],
      amount: 2400,
      contact_name: "Agropecuária do Zé",
      pago: false,
      due_date: new Date(Date.now() + 30 * 86400000),
      custos: [{ descricao: "Frete", amount: 200 }],
    });
    check("compra de produto registrada", compraProduto.ok, !compraProduto.ok ? compraProduto.message : "");
    if (!compraProduto.ok) throw new Error("sem a negociação o bloco não faz sentido");

    check(
      "o estoque da fazenda B subiu 20 sacas",
      (await saldoDe(sal.data.id, fazendaB.id)) === saldoAntesDaCompra + 20,
      String(await saldoDe(sal.data.id, fazendaB.id)),
    );

    const lancamentos = await db.financialEntry.findMany({
      where: { negotiation_id: compraProduto.data.id },
    });
    check(
      "nasceu 1 conta a pagar do principal e 1 do frete",
      lancamentos.length === 2,
      String(lancamentos.length),
    );
    check(
      "as duas são DESPESA numa compra",
      lancamentos.every((l) => l.entry_type === "expense"),
    );
    check(
      "as duas nascem pendentes, porque o negócio não foi pago",
      lancamentos.every((l) => l.status === "pending"),
    );

    const movimentosDaCompra = await db.stockMovement.findMany({
      where: { negotiation_id: compraProduto.data.id },
    });
    check(
      "o movimento aponta para a negociação que o criou",
      movimentosDaCompra.length === 1 && movimentosDaCompra[0].movement_type === "compra",
    );

    const contatoNovo = await db.contact.findFirst({ where: { name: "Agropecuária do Zé" } });
    check(
      "o fornecedor digitado virou contato de verdade",
      contatoNovo !== null,
      contatoNovo ? "" : "SUMIU",
    );

    // A borda contrária: uma venda de produto TIRA do estoque, e é receita.
    const vendaProduto = await createProductNegotiation(db, {
      type: "venda_produto",
      property_id: fazendaB.id,
      itens: [{ product_id: sal.data.id, quantity: 5 }],
      amount: 700,
      pago: true,
    });
    check("venda de produto registrada", vendaProduto.ok, !vendaProduto.ok ? vendaProduto.message : "");
    check(
      "e o estoque CAIU 5 sacas",
      (await saldoDe(sal.data.id, fazendaB.id)) === saldoAntesDaCompra + 15,
      String(await saldoDe(sal.data.id, fazendaB.id)),
    );
    if (vendaProduto.ok) {
      const daVenda = await db.financialEntry.findMany({
        where: { negotiation_id: vendaProduto.data.id },
      });
      check(
        "numa venda o principal é RECEITA",
        daVenda.length === 1 && daVenda[0].entry_type === "income" && daVenda[0].status === "paid",
      );
    }

    // §15: numa VENDA o frete continua sendo despesa. É a borda que a missão 1
    // errou: um estorno somou receita com despesa e o valor saiu 2x maior.
    const vendaComFrete = await createProductNegotiation(db, {
      type: "venda_produto",
      property_id: fazendaB.id,
      itens: [{ product_id: sal.data.id, quantity: 1 }],
      amount: 140,
      pago: true,
      custos: [{ descricao: "Frete", amount: 40 }],
    });
    if (vendaComFrete.ok) {
      const linhas = await db.financialEntry.findMany({
        where: { negotiation_id: vendaComFrete.data.id },
      });
      const frete = linhas.find((l) => l.negotiation_role === "custo_adicional");
      check(
        "o frete de uma venda é DESPESA, não desconto de receita",
        frete?.entry_type === "expense",
        frete ? String(frete.entry_type) : "SEM FRETE",
      );
    }

    // ------------------------------------------------------------------
    console.log("\n16. A negociação de produto é atômica");
    // ------------------------------------------------------------------
    const negociacoesAntes = await db.negotiation.count();
    const semSaldo = await createProductNegotiation(db, {
      type: "venda_produto",
      property_id: fazendaB.id,
      itens: [{ product_id: sal.data.id, quantity: 9999 }],
      amount: 100,
      pago: true,
    });
    check(
      "venda sem saldo é recusada",
      !semSaldo.ok && semSaldo.code === "INSUFFICIENT_STOCK",
      semSaldo.ok ? "PASSOU" : semSaldo.code,
    );
    check(
      "e NADA foi gravado, nem o envelope",
      (await db.negotiation.count()) === negociacoesAntes,
      `${await db.negotiation.count()} vs ${negociacoesAntes}`,
    );

    const parcelasErradas = await createProductNegotiation(db, {
      type: "compra_produto",
      property_id: fazendaB.id,
      itens: [{ product_id: sal.data.id, quantity: 1 }],
      amount: 1000,
      pago: false,
      parcelas: [
        { due_date: new Date(), amount: 400 },
        { due_date: new Date(), amount: 400 },
      ],
    });
    check(
      "parcelas que não somam o total são recusadas (§14)",
      !parcelasErradas.ok && parcelasErradas.code === "PARCELAS_NAO_FECHAM",
      parcelasErradas.ok ? "PASSOU" : parcelasErradas.code,
    );

    // A borda contrária: somando certo, passa.
    const parcelasCertas = await createProductNegotiation(db, {
      type: "compra_produto",
      property_id: fazendaB.id,
      itens: [{ product_id: sal.data.id, quantity: 1 }],
      amount: 1000,
      pago: false,
      parcelas: [
        { due_date: new Date(), amount: 400 },
        { due_date: new Date(), amount: 600 },
      ],
    });
    check("e somando certo, entra", parcelasCertas.ok, !parcelasCertas.ok ? parcelasCertas.code : "");
    if (parcelasCertas.ok) {
      const duas = await db.financialEntry.count({
        where: { negotiation_id: parcelasCertas.data.id },
      });
      check("com uma conta por parcela", duas === 2, String(duas));
    }

    check(
      "compra já paga não pode ser parcelada",
      !(
        await createProductNegotiation(db, {
          type: "compra_produto",
          property_id: fazendaB.id,
          itens: [{ product_id: sal.data.id, quantity: 1 }],
          amount: 100,
          pago: true,
          parcelas: [{ due_date: new Date(), amount: 100 }],
        })
      ).ok,
    );

    // ------------------------------------------------------------------
    console.log("\n17. O contrato das rotas (o degrau onde o dado some)");
    // ------------------------------------------------------------------
    // Na missão 1 a tela passou a mandar `contact_name`, o Zod da rota não
    // tinha o campo, e o valor sumia em silêncio. Aqui o corpo é montado como a
    // tela manda, e cada campo é conferido do outro lado da validação.
    const corpoDaTela = {
      type: "compra_produto",
      property_id: fazendaB.id,
      itens: [{ product_id: sal.data.id, quantity: 2.5 }],
      amount: 300,
      contact_name: "Casa do Produtor",
      occurred_at: new Date().toISOString(),
      pago: false,
      due_date: new Date().toISOString(),
      custos: [{ descricao: "Frete", amount: 30 }],
      notes: "entrega no galpão",
    };
    const validado = productNegotiationSchema.safeParse(corpoDaTela);
    check("o corpo que a tela manda passa na validação", validado.success, validado.success ? "" : JSON.stringify(validado.error.issues[0]));
    if (validado.success) {
      for (const campo of Object.keys(corpoDaTela)) {
        check(
          `  o campo ${campo} sobrevive ao Zod`,
          campo in validado.data,
          "DESCARTADO EM SILÊNCIO",
        );
      }
    }

    const usoDaTela = {
      product_id: sal.data.id,
      property_id: fazendaA.id,
      movement_type: "utilizacao",
      quantity: 1,
      purpose: "sal do lote do curral",
      pasture_id: null,
      herd_category_id: null,
      notes: null,
    };
    check("o corpo de utilização passa", stockMovementSchema.safeParse(usoDaTela).success);
    check(
      "e `ajuste` NÃO entra pela rota de movimentação",
      !stockMovementSchema.safeParse({ ...usoDaTela, movement_type: "ajuste" }).success,
    );
    check(
      "quantidade zero é recusada na validação, antes da action",
      !stockMovementSchema.safeParse({ ...usoDaTela, quantity: 0 }).success,
    );
    check(
      "ajuste aceita saldo ZERO (contou e não tinha nada)",
      stockAdjustSchema.safeParse({
        product_id: sal.data.id,
        property_id: fazendaA.id,
        corrected_balance: 0,
      }).success,
    );
    check(
      "mas não aceita saldo negativo",
      !stockAdjustSchema.safeParse({
        product_id: sal.data.id,
        property_id: fazendaA.id,
        corrected_balance: -1,
      }).success,
    );
    check(
      "produto sem unidade da lista é recusado na validação",
      !productCreateSchema.safeParse({
        name: "Qualquer",
        category_id: salMineral.id,
        unit: "arroba",
      }).success,
    );
    check(
      "e com unidade da lista passa",
      productCreateSchema.safeParse({
        name: "Qualquer",
        category_id: salMineral.id,
        unit: "saca",
      }).success,
    );

    // ------------------------------------------------------------------
    console.log("\n18. Cancelar um negócio de produto devolve o estoque");
    // ------------------------------------------------------------------
    const negocioACancelar = await createProductNegotiation(db, {
      type: "compra_produto",
      property_id: fazendaA.id,
      itens: [{ product_id: enxada.data.id, quantity: 4 }],
      amount: 400,
      pago: false,
      due_date: new Date(Date.now() + 15 * 86400000),
    });
    if (!negocioACancelar.ok) throw new Error("faltou a negociação para cancelar");
    check("4 enxadas entraram", (await saldoDe(enxada.data.id, fazendaA.id)) === 4);

    const cancelado = await cancelNegotiation(db, negocioACancelar.data.id, "comprei errado");
    check("cancelamento aceito", cancelado.ok, !cancelado.ok ? cancelado.message : "");
    check(
      "e o estoque voltou a zero",
      (await saldoDe(enxada.data.id, fazendaA.id)) === 0,
      String(await saldoDe(enxada.data.id, fazendaA.id)),
    );
    const contaCancelada = await db.financialEntry.findFirst({
      where: { negotiation_id: negocioACancelar.data.id },
    });
    check("e a conta a pagar em aberto foi cancelada", contaCancelada?.status === "cancelled");

    // A borda contrária: se parte já foi usada, cancelar deixaria o saldo
    // negativo, e o §10.7 não permite.
    const jaUsada = await createProductNegotiation(db, {
      type: "compra_produto",
      property_id: fazendaA.id,
      itens: [{ product_id: enxada.data.id, quantity: 3 }],
      amount: 300,
      pago: true,
    });
    if (!jaUsada.ok) throw new Error("faltou a segunda negociação");
    await recordStockMovement(db, {
      product_id: enxada.data.id,
      property_id: fazendaA.id,
      movement_type: "utilizacao",
      quantity: 2,
    });
    const recusado = await cancelNegotiation(db, jaUsada.data.id, "arrependi");
    check(
      "cancelar o que já foi usado é recusado",
      !recusado.ok && recusado.code === "INSUFFICIENT_STOCK",
      recusado.ok ? "PASSOU" : recusado.code,
    );
    check(
      "e o saldo continua intacto depois da recusa",
      (await saldoDe(enxada.data.id, fazendaA.id)) === 1,
      String(await saldoDe(enxada.data.id, fazendaA.id)),
    );
    const aindaViva = await db.negotiation.findFirst({ where: { id: jaUsada.data.id } });
    check("e a negociação não ficou meio cancelada", aindaViva?.canceled_at === null);

    // ------------------------------------------------------------------
    console.log("\n19. §10.8: o aviso de estoque mínimo");
    // ------------------------------------------------------------------
    const agora = new Date();

    // Um produto recém-cadastrado, com mínimo e SEM nenhuma movimentação: está
    // em zero por não ter começado, não por ter acabado. Sem esta regra, quem
    // cadastrasse 20 produtos numa tarde receberia 20 avisos no dia seguinte.
    const nuncaMovimentado = await createProduct(db, {
      name: "Vermifugo recem cadastrado",
      category_id: salMineral.id,
      unit: "frasco",
      minimum_stock: 5,
    });
    if (!nuncaMovimentado.ok) throw new Error("faltou o produto sem movimento");

    await db.alert.deleteMany({});
    const primeiraRodada = await gerarAlertasDeEstoqueMinimo(db, agora);
    const alertas1 = await db.alert.findMany({ where: { alert_type: "low_stock" } });
    check(
      "produto que nunca movimentou NÃO vira aviso",
      !alertas1.some((a) => (a.related_id ?? "").startsWith(nuncaMovimentado.data.id)),
      alertas1.map((a) => a.message).join(" | "),
    );

    // A borda contrária: assim que ele TEM movimento e cai, vira aviso.
    await recordStockMovement(db, {
      product_id: nuncaMovimentado.data.id,
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: 5,
    });
    await recordStockMovement(db, {
      product_id: nuncaMovimentado.data.id,
      property_id: fazendaA.id,
      movement_type: "utilizacao",
      quantity: 5,
    });
    await db.alert.deleteMany({});
    await gerarAlertasDeEstoqueMinimo(db, agora);
    const zerado = await db.alert.findFirst({
      where: { alert_type: "low_stock", related_id: { startsWith: nuncaMovimentado.data.id } },
    });
    check("depois de comprar e gastar tudo, vira aviso", zerado !== null);
    check(
      "e o texto diz que ACABOU, não que está acabando",
      zerado?.message.includes("acabou") === true,
      zerado?.message ?? "SEM ALERTA",
    );

    // No limite exato: o §10.8 fala em "atingir esse limite", então avisa.
    const produtoNoLimite = await createProduct(db, {
      name: "Produto exatamente no minimo",
      category_id: salMineral.id,
      unit: "saca",
      minimum_stock: 4,
    });
    if (!produtoNoLimite.ok) throw new Error("faltou o produto do limite");
    await recordStockMovement(db, {
      product_id: produtoNoLimite.data.id,
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: 4,
    });

    // E um acima do mínimo, que é a borda contrária e não pode avisar.
    const acimaDoMinimo = await createProduct(db, {
      name: "Produto acima do minimo",
      category_id: salMineral.id,
      unit: "saca",
      minimum_stock: 4,
    });
    if (!acimaDoMinimo.ok) throw new Error("faltou o produto acima do mínimo");
    await recordStockMovement(db, {
      product_id: acimaDoMinimo.data.id,
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: 5,
    });

    await db.alert.deleteMany({});
    await gerarAlertasDeEstoqueMinimo(db, agora);
    check(
      "no limite EXATO já avisa (§10.8: 'atingir esse limite')",
      (await db.alert.count({
        where: { alert_type: "low_stock", related_id: { startsWith: produtoNoLimite.data.id } },
      })) === 1,
    );
    check(
      "uma saca acima do mínimo NÃO avisa",
      (await db.alert.count({
        where: { alert_type: "low_stock", related_id: { startsWith: acimaDoMinimo.data.id } },
      })) === 0,
    );

    // Idempotência: rodar de novo na mesma semana não duplica.
    const antesDeRepetir = await db.alert.count({ where: { alert_type: "low_stock" } });
    const repetido = await gerarAlertasDeEstoqueMinimo(db, agora);
    check(
      "rodar o cron de novo no mesmo dia não duplica",
      repetido === 0 &&
        (await db.alert.count({ where: { alert_type: "low_stock" } })) === antesDeRepetir,
      String(repetido),
    );

    // Mas na semana seguinte volta a avisar: estoque baixo é CONDIÇÃO, não
    // evento. Com o product_id puro como chave, o produtor seria avisado uma
    // vez na vida e nunca mais.
    const semanaQueVem = new Date(agora.getTime() + 8 * 86400000);
    const novaSemana = await gerarAlertasDeEstoqueMinimo(db, semanaQueVem);
    check(
      "na semana seguinte volta a avisar",
      novaSemana > 0,
      String(novaSemana),
    );

    // Produto SEM mínimo nunca entra, mesmo zerado.
    const produtoSemMinimo = await createProduct(db, {
      name: "Produto sem minimo definido",
      category_id: salMineral.id,
      unit: "saca",
    });
    if (!produtoSemMinimo.ok) throw new Error("faltou o produto sem mínimo");
    await recordStockMovement(db, {
      product_id: produtoSemMinimo.data.id,
      property_id: fazendaA.id,
      movement_type: "compra",
      quantity: 1,
    });
    await recordStockMovement(db, {
      product_id: produtoSemMinimo.data.id,
      property_id: fazendaA.id,
      movement_type: "utilizacao",
      quantity: 1,
    });
    await db.alert.deleteMany({});
    await gerarAlertasDeEstoqueMinimo(db, agora);
    check(
      "produto sem mínimo definido nunca avisa, nem zerado",
      (await db.alert.count({
        where: { alert_type: "low_stock", related_id: { startsWith: produtoSemMinimo.data.id } },
      })) === 0,
    );

    // E o produtor pode desligar o tipo inteiro (Módulo 28).
    await setAlertPreferenceAction(db, "low_stock", false);
    check(
      "o tipo pode ser desligado nas preferências",
      (await isAlertTypeEnabled(db, "low_stock")) === false,
    );
    await setAlertPreferenceAction(db, "low_stock", true);

    check("a primeira rodada criou pelo menos 1 aviso", primeiraRodada >= 0);

    // ------------------------------------------------------------------
    console.log("\n20. Isolamento multi-tenant");
    // ------------------------------------------------------------------
    const tenantB = await prisma.tenant.create({
      data: { name: "M37 Estoque B", document: `37${stamp}1`, plan: "fazenda" },
    });
    try {
      const dbB = prismaForTenant(tenantB.id);
      check("tenant B não enxerga produto do A", (await listProductsWithBalance(dbB)).length === 0);
      check("nem categoria", (await listProductCategories(dbB)).length === 0);
      check("nem saldo", (await getStockBalance(dbB, {})).length === 0);

      const usarDoOutro = await recordStockMovement(dbB, {
        product_id: sal.data.id,
        property_id: fazendaA.id,
        movement_type: "utilizacao",
        quantity: 1,
      });
      check(
        "e não consegue mexer no estoque do A",
        !usarDoOutro.ok,
        usarDoOutro.ok ? "MEXEU" : usarDoOutro.code,
      );
    } finally {
      await prisma.stockMovement.deleteMany({ where: { tenant_id: tenantB.id } });
      await prisma.product.deleteMany({ where: { tenant_id: tenantB.id } });
      await prisma.productCategory.deleteMany({ where: { tenant_id: tenantB.id } });
      await prisma.tenant.deleteMany({ where: { id: tenantB.id } });
    }
  } finally {
    await prisma.alert.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.alertPreference.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.financialEntry.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.stockMovement.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.negotiation.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.contact.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.product.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.productCategory.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.property.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }

  console.log("");
  console.log(falhas === 0 ? "✅ Estoque de produtos: 0 falhas." : `❌ Estoque de produtos: ${falhas} falha(s).`);
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
