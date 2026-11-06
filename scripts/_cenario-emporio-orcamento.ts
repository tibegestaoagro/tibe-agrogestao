import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da entrega 4 do Meu Emporio (Modulo 39,
 * orcamento) para o roteiro `scripts/navegador/emporio-orcamento.py`. Nao e
 * suite. Parte do cenario do vendedor (`_cenario-emporio-vendedor.ts`).
 *
 * Na conta do seed, com o prefixo "Orc ":
 *   - o recurso ligado para a conta inteira;
 *   - uma loja, "Orc Loja", com o Caixa 1 ABERTO (turno aberto pelo Dono);
 *   - o produto "Orc Ração" (100 kg, R$ 20,00 o quilo), o produto "Orc Escasso"
 *     (3 kg, R$ 10,00 o quilo) e o produto "Orc Parado" (R$ 15,00, sem estoque
 *     que importe: o orcamento vencido pede 1 kg, e ha 50);
 *   - dois clientes de cadastro completo: "Orc Cliente" (telefone 11987654321) e
 *     "Orc Vencido";
 *   - um orcamento VENCIDO (valid_until ontem) do cliente "Orc Vencido", de
 *     1 kg do "Orc Parado" a R$ 15,00; o preco de hoje do "Orc Parado" e R$ 18,00;
 *   - orc-caixa@teste.local: Caixa da loja; orc-gestor@teste.local: Gestor;
 *     orc-vendedor@teste.local: Vendedor.
 *
 * Os assentos: o plano "grupo" tem 5. Dono, gestor, vendedor e o Caixa cabem; os
 * demais usuarios da conta do seed ficam desativados.
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Orc ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  caixa: "orc-caixa@teste.local",
  gestor: "orc-gestor@teste.local",
  vendedor: "orc-vendedor@teste.local",
};

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] },
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
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, name: { startsWith: PREFIXO } } });
  await prisma.cashHandover.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashSession.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cashRegister.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.presentationPrice.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporio } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporio } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });

  // O Caixa e cadastrado pela Equipe a cada rodada: o email antigo sai do caminho.
  const antigo = await prisma.user.findUnique({ where: { email: EMAILS.caixa } });
  if (antigo) {
    try {
      await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: antigo.id } });
      await prisma.user.delete({ where: { id: antigo.id } });
    } catch {
      await prisma.user.update({ where: { id: antigo.id }, data: { active: false, email: `orc-antigo-${antigo.id}@teste.local` } });
    }
  }
}

async function usuario(tenant_id: string, email: string, name: string, role: "ADMIN" | "OPERADOR", emporio_role: "gestor" | "vendedor") {
  const dados = { active: true, role, tenant_id, emporio_role, emporio_only: false, emporio_keys: [] as string[] };
  return prisma.user.upsert({
    where: { email },
    update: dados,
    create: { ...dados, email, name, password_hash: SENHA_INUTIL },
  });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("O seed nao tem owner@damata.com.br: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  await limpar(tenant_id);

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Orc Gestor", "OPERADOR", "gestor");
  const vendedor = await usuario(tenant_id, EMAILS.vendedor, "Orc Vendedor", "OPERADOR", "vendedor");

  // Assentos: o dono e os dois de cima; sobra espaco para o Caixa, cadastrado pela Equipe.
  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, vendedor.id] } }, data: { active: false } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const caixaActions = await import("@/lib/actions/emporio-caixa");
  const equipe = await import("@/lib/actions/emporio-equipe");
  const orc = await import("@/lib/actions/emporio-orcamentos");
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

  const caixa = exigir(
    await equipe.cadastrarMembroAction(db, dono, {
      name: "Orc Caixa",
      email: EMAILS.caixa,
      emporio_role: "caixa",
      establishment_ids: [loja.id],
    }),
    "cadastro do caixa",
  );
  if (!caixa.id) throw new Error("O cadastro do Caixa nao devolveu o id.");

  async function produto(nome: string, preco: number, estoque: number) {
    const p = (
      exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}${nome}`, category_id: categoria!.id, base_unit: "quilograma" } as never), nome) as { id: string }
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
  const racao = await produto("Ração", 20, 100);
  await produto("Escasso", 10, 3);
  const parado = await produto("Parado", 15, 50);

  // O troco do Caixa 1 e o turno aberto: sem turno aberto nao ha venda.
  const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: loja.id, number: 1 } });
  if (!registro) throw new Error(`A loja ${loja.id} nasceu sem o Caixa 1.`);
  exigir(await caixaActions.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 100 }), "saldo inicial do caixa");
  await abrirTurnoDeTeste(db, dono, loja.id);

  // A validade fica em 7 dias, seja qual for a configuracao que outra suite deixou.
  await prisma.emporioSettings.upsert({
    where: { tenant_id },
    update: { quote_validity_days: 7 },
    create: { tenant_id, quote_validity_days: 7 },
  });

  // Dois clientes do Empório de cadastro completo (PF com nome, CPF e telefone).
  await prisma.emporioCustomer.create({
    data: { tenant_id, name: "Orc Cliente", person_kind: "pf", document: "24681357928", phone: "11987654321" } as never,
  });
  const vencido = await prisma.emporioCustomer.create({
    data: { tenant_id, name: "Orc Vencido", person_kind: "pf", document: "13579246828", phone: "11955554444" } as never,
  });

  // O orcamento vencido: salvo pelo Vendedor a R$ 15,00 e depois envelhecido para
  // ontem; o preco de hoje do produto sobe para R$ 18,00.
  const salvo = await orc.salvarOrcamentoAction(db, { id: vendedor.id, role: vendedor.role }, {
    operation_key: `cenario-orcamento-vencido-${Date.now()}`,
    establishment_id: loja.id,
    customer_id: vencido.id,
    items: [{ emporio_product_id: parado.id, presentation_id: parado.ap, quantity: 1 }],
  });
  if (!salvo.ok) throw new Error(`orcamento vencido: ${salvo.message}`);
  const ontem = new Date(Date.now() - 86_400_000);
  const ontemBr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(ontem); // YYYY-MM-DD
  await prisma.emporioQuote.update({ where: { id: salvo.data.id }, data: { valid_until: new Date(`${ontemBr}T00:00:00.000Z`) } });
  exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: parado.ap, price: 18 }), "preco de hoje do parado");

  console.log("Conta do seed:", tenant_id);
  console.log("Loja:", loja.id, "Racao:", racao.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
