import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario do credito do fiado do Meu Emporio (entrega
 * 2 do financeiro das lojas, plano 2026-11-08) para o roteiro
 * `scripts/navegador/emporio-financeiro-credito.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Cred ":
 *   - o recurso ligado para a conta inteira;
 *   - duas lojas, "Cred Loja 1" e "Cred Loja 2", cada uma com turno aberto;
 *   - cred-gestor@teste.local: Gestor da Loja 1;
 *   - cred-caixa@teste.local: Caixa da Loja 1, com o Caixa 1 ABERTO;
 *   - cred-casa@teste.local: Financeiro (sem loja, so do Emporio);
 *   - o produto "Cred Ração", a R$ 10,00 o quilo, com estoque nas duas lojas;
 *   - as configuracoes da conta: prazo 30, bloqueio 15, limite padrao nulo, mensagem padrao;
 *   - "Cred Bloqueado" (telefone (34) 99876-1234): fiado de R$ 80,00 vencido ha 20 dias na Loja 2;
 *   - "Cred Limite" (limite proprio de R$ 100,00): deve R$ 80,00 na Loja 1, em dia;
 *   - "Cred Semtel" (sem telefone): R$ 25,00 vencido ha 10 dias na Loja 1.
 *
 * Os assentos: o plano "grupo" tem 5; Dono, Gestor, Caixa e Financeiro cabem, e
 * os demais usuarios da conta do seed ficam desativados.
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Cred ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  financeiro: "cred-casa@teste.local",
  gestor: "cred-gestor@teste.local",
  caixa: "cred-caixa@teste.local",
};
const DIA = 86_400_000;

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);

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

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...clientes, ...vendas] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.emporioCreditRelease.deleteMany({ where: { tenant_id, OR: [{ customer_id: { in: clientes } }, { establishment_id: { in: lojas } }] } });
  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }] } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
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
  await limparTaxasDeCenario(prisma, { tenant_id, establishment_ids: lojas });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
}

async function usuario(tenant_id: string, email: string, name: string, extra: Record<string, unknown>) {
  const dados = { active: true, role: "OPERADOR" as const, tenant_id, emporio_keys: [] as string[], ...extra };
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
  if (process.argv.includes("--limpar")) {
    // So apaga: o manual fotografa a Cobranca sem os clientes de teste na lista.
    console.log("Limpo o prefixo", JSON.stringify(PREFIXO), "na conta", tenant_id);
    await prisma.$disconnect();
    return;
  }

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Cred Gestor", { emporio_role: "gestor", emporio_only: false });
  const caixa = await usuario(tenant_id, EMAILS.caixa, "Cred Caixa", { emporio_role: "caixa", emporio_only: false });
  const financeiro = await usuario(tenant_id, EMAILS.financeiro, "Cred Financeiro", papelFinanceiro());

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, caixa.id, financeiro.id] } }, data: { active: false } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  // Os padroes do fiado da conta: o roteiro muda o limite e a mensagem no passo 1.
  await prisma.emporioSettings.upsert({
    where: { tenant_id },
    update: { fiado_due_days: 30, fiado_block_after_days: 15, fiado_default_limit: null, fiado_collection_message: null },
    create: { tenant_id, fiado_due_days: 30, fiado_block_after_days: 15, fiado_default_limit: null, fiado_collection_message: null },
  });

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const credito = await import("@/lib/actions/emporio-credito");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja1 = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 1` }), "loja 1") as { id: string }).id;
  const loja2 = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 2` }), "loja 2") as { id: string }).id;
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: gestor.id, establishment_id: loja1 },
      { tenant_id, user_id: caixa.id, establishment_id: loja1 },
    ],
  });

  const racao = (
    exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }
  ).id;
  const quilo = (
    exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }
  ).id;
  for (const l of [loja1, loja2]) {
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: l, presentation_id: quilo, price: 10 }), "preco");
    exigir(
      await est.implantarEstoqueAction(db, dono, { establishment_id: l, emporio_product_id: racao, sealed: [], loose_qty: 1000, unit_cost: 4 } as never),
      "estoque",
    );
  }

  // Os turnos: o da Loja 1 e o do Caixa que vende no roteiro; o da Loja 2, para a venda antiga do Cred Bloqueado.
  const turno1 = await abrirTurnoDeTeste(db, dono, loja1);
  const turno2 = await abrirTurnoDeTeste(db, dono, loja2);

  const cliente = (nome: string, extra: Record<string, unknown> = {}) =>
    prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}${nome}`, ...extra } as never });
  const bloqueado = await cliente("Bloqueado", { person_kind: "pf", phone: "34998761234" });
  const limite = await cliente("Limite");
  const semtel = await cliente("Semtel");

  const fiado = async (chave: string, loja: string, caixaId: string, clienteId: string, qty: number, valor: number, venceEm: number, vendidaHa: number) =>
    exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-cred-${chave}`,
        establishment_id: loja,
        cash_register_id: caixaId,
        customer_id: clienteId,
        sold_at: new Date(Date.now() - vendidaHa * DIA),
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: qty }],
        payments: [{ kind: "fiado", amount: valor, due_date: meioDia(somaDias(hojeStr, venceEm)) }],
      } as never),
      `venda ${chave}`,
    );
  await fiado("bloqueado", loja2, turno2.cash_register_id, bloqueado.id, 8, 80, -20, 25);
  await fiado("limite", loja1, turno1.cash_register_id, limite.id, 8, 80, 10, 5);
  await fiado("semtel", loja1, turno1.cash_register_id, semtel.id, 2.5, 25, -10, 15);

  // O limite proprio do Cred Limite, depois da venda (o limite vale daqui para frente).
  exigir(await credito.definirCreditoDoClienteAction(db, dono, limite.id, { fiado_limit: 100 }), "limite do Cred Limite");

  console.log("Conta do seed:", tenant_id);
  console.log("Lojas:", loja1, loja2, "(hoje:", hojeStr + ")");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
