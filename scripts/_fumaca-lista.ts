import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import {
  criarItemAction,
  listarItensAction,
  atualizarItemAction,
  concluirItemAction,
  removerItemAction,
  repetirItemAction,
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

    const lancamentos = await db.financialEntry.count();
    const movimentos = await db.stockMovement.count();
    check(
      "NADA disso criou lancamento financeiro ou movimento de estoque (§19.1, §19.2)",
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
