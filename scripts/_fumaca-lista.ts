import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import {
  criarItemAction,
  listarItensAction,
  atualizarItemAction,
  concluirItemAction,
  removerItemAction,
  repetirItemAction,
  registrarCompraDoItemAction,
} from "@/lib/actions/shopping-items";

/**
 * Fumaca da T02: prova o caminho feliz e as recusas das actions da Lista de
 * Compra enquanto a suite da T10 nao existe.
 *
 * ⚠️ **Apague este arquivo quando a `m63` entrar.** Ele existe para o codigo
 * nao ficar sem prova nenhuma entre a T02 e a T10, nao para virar uma segunda
 * suite paralela que ninguem lembra de rodar.
 */
exigirBancoLocal();

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function main() {
  const tenant = await prisma.tenant.create({
    data: { name: "Fumaca Lista", document: `FUM-${Date.now()}`, plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const soDescricao = await criarItemAction(db, { description: "Comprar arame" });
    check("item so com descricao e aceito", soDescricao.ok, JSON.stringify(soDescricao));

    const vazio = await criarItemAction(db, { description: "   " });
    check(
      "descricao vazia recusa com o campo nomeado",
      !vazio.ok && vazio.field === "description",
      JSON.stringify(vazio),
    );

    const fracao = await criarItemAction(db, {
      description: "Vermifugo",
      quantity: 2.5,
      unit: "frasco",
    });
    check(
      "fracao em unidade nao fracionavel recusa",
      !fracao.ok && fracao.code === "QUANTIDADE_FRACIONADA",
      JSON.stringify(fracao),
    );

    const negativa = await criarItemAction(db, {
      description: "Sal mineral",
      quantity: -1,
      unit: "saca",
    });
    check("quantidade negativa recusa", !negativa.ok && negativa.field === "quantity");

    const sal = await criarItemAction(db, {
      description: "Sal mineral",
      quantity: 10,
      unit: "saca",
      priority: "urgente",
    });
    check("item com quantidade e unidade e aceito", sal.ok);

    const repetido = await criarItemAction(db, { description: "sal mineral" });
    check(
      "duplicata AVISA em vez de aceitar calado",
      !repetido.ok && repetido.code === "ITEM_JA_NA_LISTA",
      JSON.stringify(repetido),
    );
    check(
      "e a mensagem diz o que ja esta na lista",
      !repetido.ok && repetido.message.includes("10 sacas de Sal mineral"),
      !repetido.ok ? repetido.message : "",
    );

    const insistindo = await criarItemAction(
      db,
      { description: "sal mineral" },
      { permitirDuplicata: true },
    );
    check("mas quem insiste consegue adicionar", insistindo.ok);

    const lista = await listarItensAction(db);
    check("a lista traz os tres pendentes", lista.length === 3, `obtido ${lista.length}`);
    check("urgente aparece primeiro", lista[0]?.priority === "urgente", lista[0]?.description);

    if (soDescricao.ok) {
      const comQuantidade = await atualizarItemAction(db, soDescricao.data.id, {
        quantity: 2,
        unit: "rolo",
      });
      check("a quantidade pode chegar depois (§5)", comQuantidade.ok, JSON.stringify(comQuantidade));

      const concluido = await concluirItemAction(db, soDescricao.data.id);
      check("concluir tira da lista", concluido.ok && concluido.data.status === "comprado");

      const naoEdita = await atualizarItemAction(db, soDescricao.data.id, { description: "outro" });
      check("item concluido nao volta a ser editado", !naoEdita.ok && naoEdita.code === "NOT_EDITABLE");

      const deNovo = await concluirItemAction(db, soDescricao.data.id);
      check("concluir duas vezes recusa", !deNovo.ok && deNovo.code === "ITEM_JA_RESOLVIDO");

      const repetiu = await repetirItemAction(db, soDescricao.data.id);
      check("repetir cria item novo (§14)", repetiu.ok);
      const antigo = await db.shoppingItem.findFirst({ where: { id: soDescricao.data.id } });
      check("e nao mexe no antigo", antigo?.status === "comprado");
    }

    if (sal.ok) {
      const removido = await removerItemAction(db, sal.data.id);
      check("remover tira da lista sem apagar", removido.ok && removido.data.status === "removido");
      const aindaExiste = await db.shoppingItem.count({ where: { id: sal.data.id } });
      check("a linha continua no banco (§19.6)", aindaExiste === 1);
    }

    // Isolamento pelo model. A camada HTTP fica para a suite da T10.
    const outro = await prisma.tenant.create({
      data: { name: "Fumaca Lista B", document: `FUMB-${Date.now()}`, plan: "fazenda" },
    });
    const dbB = prismaForTenant(outro.id);
    try {
      const doB = await criarItemAction(dbB, { description: "Item que so B enxerga" });
      check("tenant B cria o proprio item", doB.ok);
      const listaDeA = await listarItensAction(db);
      check(
        "tenant A nao ve o item de B",
        !listaDeA.some((i) => i.description === "Item que so B enxerga"),
      );
      if (doB.ok) {
        const cruzado = await concluirItemAction(db, doB.data.id);
        check(
          "e A nao consegue concluir item de B",
          !cruzado.ok && cruzado.code === "NOT_FOUND",
          JSON.stringify(cruzado),
        );
      }
    } finally {
      await prisma.shoppingItem.deleteMany({ where: { tenant_id: outro.id } });
      await prisma.tenant.delete({ where: { id: outro.id } });
    }

    // ── §12: o item vira compra, e quem registra e Negociacoes ───────────
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda da Fumaca" }) });
    const categoria = await db.productCategory.create({ data: scoped({ name: "Sal mineral" }) });

    const semProduto = await criarItemAction(
      db,
      { description: "Arame liso", quantity: 2, unit: "rolo", property_id: fazenda.id },
      { permitirDuplicata: true },
    );
    check("item para comprar foi criado", semProduto.ok);

    if (semProduto.ok) {
      const semDizerQual = await registrarCompraDoItemAction(db, semProduto.data.id, {
        amount: 300,
      });
      check(
        "item SEM produto nao vira compra sozinho",
        !semDizerQual.ok && semDizerQual.code === "PRODUTO_NECESSARIO",
        JSON.stringify(semDizerQual),
      );
      check(
        "e a recusa aponta o campo do produto",
        !semDizerQual.ok && semDizerQual.field === "product_id",
      );
      check(
        "nada foi gravado na tentativa recusada",
        (await db.negotiation.count()) === 0 && (await db.financialEntry.count()) === 0,
      );

      const compra = await registrarCompraDoItemAction(db, semProduto.data.id, {
        amount: 300,
        pago: true,
        novo_produto: { unit: "rolo", category_id: categoria.id },
      });
      check("com o produto cadastrado na hora, a compra entra", compra.ok, JSON.stringify(compra));

      if (compra.ok) {
        const item = await db.shoppingItem.findFirst({ where: { id: semProduto.data.id } });
        check("o item saiu da lista", item?.status === "comprado");
        check("e guardou de qual negociacao veio", item?.negotiation_id === compra.data.negotiation_id);

        const despesas = await db.financialEntry.count({ where: { entry_type: "expense" } });
        check("a compra criou a despesa (§12)", despesas === 1, String(despesas));
        const entradas = await db.stockMovement.count({ where: { movement_type: "compra" } });
        check("e a entrada no estoque", entradas === 1, String(entradas));

        const produto = await db.product.findFirst({ where: { id: compra.data.product_id } });
        check("o produto novo herdou o nome do item", produto?.name === "Arame liso", produto?.name);

        const deNovo = await registrarCompraDoItemAction(db, semProduto.data.id, { amount: 300 });
        check(
          "comprar duas vezes o mesmo item e recusado",
          !deNovo.ok && deNovo.code === "ITEM_JA_RESOLVIDO",
        );
      }

      /*
       * Atomicidade: compra que falha NAO tira o item da lista. O produto
       * inexistente derruba a transacao la dentro, depois da negociacao ja ter
       * sido criada, e e o rollback que precisa apagar as duas coisas.
       */
      const outroItem = await criarItemAction(
        db,
        { description: "Item da compra que vai falhar", property_id: fazenda.id, quantity: 1 },
        { permitirDuplicata: true },
      );
      if (outroItem.ok) {
        const negociacoesAntes = await db.negotiation.count();
        const falhou = await registrarCompraDoItemAction(db, outroItem.data.id, {
          amount: 100,
          product_id: "produto-que-nao-existe",
        });
        check("compra com produto inexistente e recusada", !falhou.ok, JSON.stringify(falhou));
        const aindaNaLista = await db.shoppingItem.findFirst({ where: { id: outroItem.data.id } });
        check("e o item CONTINUA na lista", aindaNaLista?.status === "pendente");
        check(
          "e nenhuma negociacao sobrou pela metade",
          (await db.negotiation.count()) === negociacoesAntes,
        );
      }
    }

    const lancamentos = await db.financialEntry.count({ where: { negotiation_id: null } });
    const movimentos = await db.stockMovement.count({ where: { negotiation_id: null } });
    check(
      "anotar, editar, concluir e remover nao criaram NADA no financeiro nem no estoque (§19.1, §19.2)",
      lancamentos === 0 && movimentos === 0,
      `lancamentos=${lancamentos} movimentos=${movimentos}`,
    );
  } finally {
    await prisma.shoppingItem.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }

  console.log("");
  console.log(falhas === 0 ? "✅ Fumaca: 0 falhas." : `❌ Fumaca: ${falhas} falha(s).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error("❌", e);
    await prisma.$disconnect();
    process.exit(1);
  });
