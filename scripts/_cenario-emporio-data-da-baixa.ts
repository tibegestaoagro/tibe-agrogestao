import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";

/**
 * Monta, no banco LOCAL, o cenario da data da baixa do Meu Emporio (Q370 a Q373) para o roteiro
 * `scripts/navegador/emporio-data-da-baixa.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Dd ", SEM mexer em configuracao da conta: so cria loja, conta,
 * produto, clientes, usuarios e vendas proprias.
 *   - "Dd Loja 1" com o turno do Caixa 1 aberto; "Dd Ração" a R$ 10,00 o quilo, com estoque;
 *   - a conta "Dd Banco" (liberada para todas as lojas e padrao da loja, para o PIX do fiado);
 *   - dd-financeiro@teste.local (Financeiro, sem loja) e dd-vendedor@teste.local (Vendedor da Loja 1);
 *   - FIADO: "Dd Maria" deve R$ 200,00 (venda no fiado);
 *   - BOLETO: R$ 60,00 de "Dd Joao", aberto, vence daqui a 10 dias;
 *   - CHEQUE: R$ 80,00 de "Dd Joao", completo (nº 000444, Caixa, bom para hoje) e ja DEPOSITADO na "Dd Banco";
 *   - PIX (Q372): duas vendas de "Dd Joao" pagas por PIX na "Dd Banco", de R$ 30,00 (sem carimbo, o roteiro corrige a
 *     data) e de R$ 40,00 (a linha ja CARIMBADA, que nao mostra o botao "Corrigir a data").
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. `--limpar` so apaga. So banco local:
 * `exigirBancoLocal()` barra o resto. Os dois usuarios ficam na conta (como nos outros cenarios): sao
 * inofensivos e o upsert os reaproveita.
 */
exigirBancoLocal();

const PREFIXO = "Dd ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = { financeiro: "dd-financeiro@teste.local", vendedor: "dd-vendedor@teste.local" };
const DIA = 86_400_000;

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const clientes = (await prisma.emporioCustomer.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const cheques = (await prisma.emporioCheck.findMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] }, select: { id: true } })).map((c) => c.id);
  const boletos = (await prisma.emporioBoleto.findMany({ where: { tenant_id, sale_id: { in: vendas } }, select: { id: true } })).map((b) => b.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] }, select: { id: true } })
  ).map((l) => l.id);
  const ondeHaDinheiro = [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }, { sale_id: { in: vendas } }];
  const movimentos = await prisma.cashMovement.findMany({ where: { tenant_id, OR: ondeHaDinheiro }, select: { cash_transfer_id: true } });
  const transferencias = [...new Set(movimentos.map((m) => m.cash_transfer_id).filter((x): x is string => !!x))];

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...clientes, ...vendas, ...lancamentos, ...lojas, ...contas, ...cheques, ...boletos] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: ondeHaDinheiro } });
  await prisma.cashTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, id: { in: cheques } } });
  await prisma.emporioBoleto.deleteMany({ where: { tenant_id, id: { in: boletos } } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
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
  await prisma.bankAccount.deleteMany({ where: { tenant_id, id: { in: contas } } });
}

async function usuario(tenant_id: string, email: string, name: string, extra: Record<string, unknown>) {
  const dados = { active: true, role: "OPERADOR" as const, tenant_id, emporio_keys: [] as string[], ...extra };
  return prisma.user.upsert({ where: { email }, update: dados, create: { ...dados, email, name, password_hash: SENHA_INUTIL } });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  await limpar(tenant_id);
  if (process.argv.includes("--limpar")) {
    console.log("Limpo o prefixo", JSON.stringify(PREFIXO), "na conta", tenant_id);
    await prisma.$disconnect();
    return;
  }

  await usuario(tenant_id, EMAILS.financeiro, "Dd Financeiro", papelFinanceiro());
  const vendedor = await usuario(tenant_id, EMAILS.vendedor, "Dd Vendedor", { emporio_role: "vendedor", emporio_only: false });

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 1` } as never), "loja") as { id: string }).id;
  await prisma.userEstablishment.createMany({ data: [{ tenant_id, user_id: vendedor.id, establishment_id: loja }] });

  const racao = (exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja, presentation_id: quilo, price: 10 }), "preco");
  exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: loja, emporio_product_id: racao, sealed: [], loose_qty: 100000, unit_cost: 4 } as never), "estoque");
  const conta = (
    exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Banco`, bank: "Banco Dd", pix_all_establishments: true } as never), "conta") as { id: string }
  ).id;
  exigir(await cx.definirContaPixAction(db, dono, loja, { bank_account_id: conta }), "conta PIX padrao da loja");
  const turno = await abrirTurnoDeTeste(db, dono, loja);

  const maria = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Maria`, person_kind: "pf", phone: "34990000096" } as never });
  const joao = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Joao`, person_kind: "pf", phone: "34990000095" } as never });

  let seq = 0;
  /** Uma venda so no meio de pagamento dado (o preco e 10 o quilo, entao o valor define a quantidade). */
  const venda = async (cliente: string, valor: number, pagamento: Record<string, unknown>) =>
    exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-dd-${Date.now()}-${(seq += 1)}`,
        establishment_id: loja,
        cash_register_id: turno.cash_register_id,
        customer_id: cliente,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: valor / 10 }],
        payments: [{ amount: valor, ...pagamento }],
      } as never),
      `venda de ${valor}`,
    ) as { id: string };

  await venda(maria.id, 200, { kind: "fiado", due_date: new Date(`${somaDias(hojeStr, 5)}T12:00:00Z`) });
  await venda(joao.id, 60, { kind: "boleto", boleto: { number: "BOL-DD-1", due_on: new Date(`${somaDias(hojeStr, 10)}T00:00:00Z`) } });
  await venda(joao.id, 80, { kind: "cheque", check: { number: "000444", bank: "Caixa", good_for: new Date(`${hojeStr}T00:00:00Z`), holder_name: `${PREFIXO}Joao` } });

  const cheque = await prisma.emporioCheck.findFirst({ where: { tenant_id, number: "000444", establishment_id: loja } });
  if (!cheque) throw new Error("O cheque do cenario nao nasceu.");
  exigir(await cx.depositarChequeAction(db, dono, cheque.id, { bank_account_id: conta }), "depositar o cheque");

  await venda(joao.id, 30, { kind: "pix", bank_account_id: conta });
  await venda(joao.id, 40, { kind: "pix", bank_account_id: conta });
  const carimbada = await prisma.cashMovement.findFirst({ where: { tenant_id, bank_account_id: conta, origin: "venda", amount: 40 } });
  if (!carimbada) throw new Error("O PIX de R$ 40,00 do cenario nao nasceu.");
  await prisma.cashMovement.update({ where: { id: carimbada.id }, data: { reconciled_at: new Date(), reconciled_by_user_id: owner.id } });

  console.log("Conta do seed:", tenant_id, "(hoje:", hojeStr + ")");
  console.log("Loja:", loja, "Conta:", conta, "Financeiro:", EMAILS.financeiro, "Vendedor:", EMAILS.vendedor);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
