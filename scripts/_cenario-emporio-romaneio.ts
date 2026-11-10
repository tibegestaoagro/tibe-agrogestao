import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario do plano 3 do Meu Emporio (pedido para
 * entrega e romaneio, 2026-11-06) para o roteiro
 * `scripts/navegador/emporio-romaneio.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Rom ":
 *   - o recurso ligado para a conta inteira;
 *   - uma loja, "Rom Loja", com o Caixa 1 ABERTO e a bobina de 58 mm;
 *   - dois produtos de R$ 20,00 e R$ 10,00 o quilo: um de nome com 60
 *     caracteres (para o romaneio na bobina estreita) e o "Rom Sal";
 *   - tres clientes: "Rom Cliente PF" (nome, telefone e endereco principal
 *     SEM numero, sem CPF), "Rom Cliente PJ" (completa, com endereco de
 *     entrega) e "Rom Cliente Sem CPF" (PF com endereco principal completo e
 *     sem CPF: o da venda que o Caixa muda para entrega);
 *   - rom-caixa@teste.local: Caixa; rom-gestor@teste.local: Gestor;
 *     rom-vendedor@teste.local: Vendedor.
 *
 * Os assentos: o plano "grupo" tem 5. Dono, gestor, vendedor e o Caixa cabem; os
 * demais usuarios da conta do seed ficam desativados.
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Rom ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  caixa: "rom-caixa@teste.local",
  gestor: "rom-gestor@teste.local",
  vendedor: "rom-vendedor@teste.local",
};
const NOME_LONGO = "Rom Ração Premium Super Concentrada para Bovinos de Corte 25"; // 60 caracteres
if (NOME_LONGO.length !== 60) throw new Error(`O nome longo tem ${NOME_LONGO.length} caracteres, nao 60.`);

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const clientes = (await prisma.emporioCustomer.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: {
        tenant_id,
        OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }, { emporio_customer_id: { in: clientes } }],
      },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.cashMovement.deleteMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }] },
  });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  // O orcamento so sai depois das vendas: a venda guarda `quote_id` com Restrict.
  await prisma.emporioQuote.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, id: { in: clientes } } });
  await prisma.cashHandover.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashSession.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashRegister.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporio } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  // O rateio e a ocorrência de despesa fixa seguram a loja (Restrict); ver a dívida 2.68.
  await prisma.fixedExpenseSplit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.fixedExpenseOccurrence.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });

  // O Caixa e cadastrado pela Equipe a cada rodada: o email antigo sai do caminho.
  const antigo = await prisma.user.findUnique({ where: { email: EMAILS.caixa } });
  if (antigo) {
    try {
      await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: antigo.id } });
      await prisma.user.delete({ where: { id: antigo.id } });
    } catch {
      await prisma.user.update({ where: { id: antigo.id }, data: { active: false, email: `rom-antigo-${antigo.id}@teste.local` } });
    }
  }
}

async function usuario(tenant_id: string, email: string, name: string, emporio_role: "gestor" | "vendedor") {
  const dados = { active: true, role: "OPERADOR" as const, tenant_id, emporio_role, emporio_only: false, emporio_keys: [] as string[] };
  return prisma.user.upsert({
    where: { email },
    update: dados,
    create: { ...dados, email, name, password_hash: SENHA_INUTIL },
  });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  await limpar(tenant_id);

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Rom Gestor", "gestor");
  const vendedor = await usuario(tenant_id, EMAILS.vendedor, "Rom Vendedor", "vendedor");

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, vendedor.id] } }, data: { active: false } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const caixaActions = await import("@/lib/actions/emporio-caixa");
  const equipe = await import("@/lib/actions/emporio-equipe");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja` }), "loja") as { id: string };
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: gestor.id, establishment_id: loja.id },
      { tenant_id, user_id: vendedor.id, establishment_id: loja.id },
    ],
  });

  // A bobina de 58 mm e a validade padrao, seja qual for a configuracao que outra suite deixou.
  await prisma.emporioSettings.upsert({
    where: { tenant_id },
    update: { receipt_width: 58, quote_validity_days: 7 },
    create: { tenant_id, receipt_width: 58, quote_validity_days: 7 },
  });

  const caixa = exigir(
    await equipe.cadastrarMembroAction(db, dono, {
      name: "Rom Caixa",
      email: EMAILS.caixa,
      emporio_role: "caixa",
      establishment_ids: [loja.id],
    }),
    "cadastro do caixa",
  );
  if (!caixa.id) throw new Error("O cadastro do Caixa nao devolveu o id.");

  async function produto(nome: string, preco: number, estoque: number) {
    const p = (
      exigir(await cat.criarProdutoEmporioAction(db, dono, { name: nome, category_id: categoria!.id, base_unit: "quilograma" } as never), nome) as { id: string }
    ).id;
    const ap = (
      exigir(await cat.criarApresentacaoAction(db, dono, p, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), `quilo de ${nome}`) as { id: string }
    ).id;
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: ap, price: preco }), `preco de ${nome}`);
    exigir(
      await est.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: p, sealed: [], loose_qty: estoque, unit_cost: 5 } as never),
      `estoque de ${nome}`,
    );
    return { id: p, ap };
  }
  await produto(NOME_LONGO, 20, 500);
  await produto(`${PREFIXO}Sal`, 10, 500);

  const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja.id, number: 1 } });
  if (!registro) throw new Error(`A loja ${loja.id} nasceu sem o Caixa 1.`);
  exigir(await caixaActions.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 100 }), "saldo inicial do caixa");
  await abrirTurnoDeTeste(db, dono, loja.id);

  // PF: so nome e telefone; o principal sem numero; sem CPF.
  await prisma.emporioCustomer.create({
    data: {
      tenant_id,
      name: "Rom Cliente PF",
      person_kind: "pf",
      phone: "11987650001",
      address_zip: "38400000",
      address_street: "Rua das Palmeiras",
      address_district: "Centro",
      city: "Uberlandia",
      address_state: "MG",
    } as never,
  });
  // PJ completa, com endereco de entrega no cadastro.
  await prisma.emporioCustomer.create({
    data: {
      tenant_id,
      name: "Rom Cliente PJ",
      person_kind: "pj",
      document: "72918364000166",
      phone: "11987650002",
      address_zip: "38400100",
      address_street: "Avenida Brasil",
      address_number: "100",
      address_district: "Centro",
      city: "Uberlandia",
      address_state: "MG",
      delivery_zip: "38400200",
      delivery_street: "Rodovia BR 050",
      delivery_number: "km 12",
      delivery_district: "Zona Rural",
      delivery_city: "Uberlandia",
      delivery_state: "MG",
    } as never,
  });
  // PF com o principal completo e sem CPF: a venda dela vira entrega pelo "Completar cadastro" do painel Mudar.
  await prisma.emporioCustomer.create({
    data: {
      tenant_id,
      name: "Rom Cliente Sem CPF",
      person_kind: "pf",
      phone: "11987650003",
      address_zip: "38400300",
      address_street: "Rua do Cerrado",
      address_number: "30",
      address_district: "Jardim",
      city: "Uberlandia",
      address_state: "MG",
    } as never,
  });

  console.log("Conta do seed:", tenant_id);
  console.log("Loja:", loja.id, "Produto longo:", NOME_LONGO.length, "caracteres");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
