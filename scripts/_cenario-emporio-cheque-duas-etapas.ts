import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";

/**
 * Monta, no banco LOCAL, o cenario do cheque em duas etapas do Meu Emporio (frente C, Q354 a Q356) para o roteiro
 * `scripts/navegador/emporio-cheque-duas-etapas.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Ch ", SEM mexer em configuracao da conta (plano, EmporioSettings, outros
 * usuarios): so cria loja, conta, produto, clientes, usuarios e vendas proprias.
 *   - "Ch Loja 1" com o turno do Caixa 1 aberto; "Ch Ração" a R$ 10,00 o quilo, com estoque;
 *   - a conta "Ch Banco" e os clientes "Ch Maria" e "Ch Joao";
 *   - ch-gestor@teste.local (Gestor da Loja 1), ch-financeiro@teste.local (Financeiro, sem loja) e
 *     ch-vendedor@teste.local (Vendedor da Loja 1);
 *   - tres cheques ja existentes, todos "recebido":
 *       A: R$ 150,00 de "Ch Joao", so valor e nome (incompleto);
 *       E: venda de "Ch Maria" com dois cheques: R$ 50,00 completo (nº 000222, Sicoob, bom para daqui a 10 dias) e
 *          R$ 30,00 de "Ch Terceiro Dois" incompleto (o roteiro edita essa venda);
 *       P: R$ 70,00 de "Ch Joao" com numero 000333 e banco Caixa, mas sem data (incompleto, fora das faixas).
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. `--limpar` so apaga. So banco local:
 * `exigirBancoLocal()` barra o resto. Os tres usuarios ficam na conta (como nos outros cenarios): sao
 * inofensivos e o upsert os reaproveita.
 */
exigirBancoLocal();

const PREFIXO = "Ch ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = { gestor: "ch-gestor@teste.local", financeiro: "ch-financeiro@teste.local", vendedor: "ch-vendedor@teste.local" };
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
  const lancamentos = (
    await prisma.financialEntry.findMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] }, select: { id: true } })
  ).map((l) => l.id);
  const ondeHaDinheiro = [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }, { sale_id: { in: vendas } }];
  const movimentos = await prisma.cashMovement.findMany({ where: { tenant_id, OR: ondeHaDinheiro }, select: { cash_transfer_id: true } });
  const transferencias = [...new Set(movimentos.map((m) => m.cash_transfer_id).filter((x): x is string => !!x))];

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...clientes, ...vendas, ...lancamentos, ...lojas, ...contas, ...cheques] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.cashMovement.deleteMany({ where: { tenant_id, OR: ondeHaDinheiro } });
  await prisma.cashTransfer.deleteMany({ where: { tenant_id, id: { in: transferencias } } });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, id: { in: cheques } } });
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

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Ch Gestor", { emporio_role: "gestor", emporio_only: false });
  await usuario(tenant_id, EMAILS.financeiro, "Ch Financeiro", papelFinanceiro());
  const vendedor = await usuario(tenant_id, EMAILS.vendedor, "Ch Vendedor", { emporio_role: "vendedor", emporio_only: false });

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 1` } as never), "loja") as { id: string }).id;
  await prisma.userEstablishment.createMany({ data: [gestor, vendedor].map((u) => ({ tenant_id, user_id: u.id, establishment_id: loja })) });

  const racao = (exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  exigir(await cat.definirPrecoAction(db, dono, { establishment_id: loja, presentation_id: quilo, price: 10 }), "preco");
  exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: loja, emporio_product_id: racao, sealed: [], loose_qty: 100000, unit_cost: 4 } as never), "estoque");
  const conta = (exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Banco`, bank: "Banco Ch" }), "conta") as { id: string }).id;
  const turno = await abrirTurnoDeTeste(db, dono, loja);

  const maria = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Maria`, person_kind: "pf", phone: "34990000098" } as never });
  const joao = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Joao`, person_kind: "pf", phone: "34990000097" } as never });

  let seq = 0;
  /** Uma venda so no cheque (o preco e 10 o quilo, entao o total dos cheques define a quantidade). */
  const venda = async (cliente: string, cheques: { amount: number; check: Record<string, string | Date> }[]) => {
    const total = cheques.reduce((s, c) => s + c.amount, 0);
    return exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-ch-${Date.now()}-${(seq += 1)}`,
        establishment_id: loja,
        cash_register_id: turno.cash_register_id,
        customer_id: cliente,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: total / 10 }],
        payments: cheques.map((c) => ({ kind: "cheque", amount: c.amount, check: c.check })),
      } as never),
      `venda de ${total}`,
    ) as { id: string };
  };

  await venda(joao.id, [{ amount: 150, check: { holder_name: `${PREFIXO}Joao` } }]);
  await venda(maria.id, [
    { amount: 50, check: { number: "000222", bank: "Sicoob", good_for: new Date(`${somaDias(hojeStr, 10)}T00:00:00Z`), holder_name: `${PREFIXO}Maria` } },
    { amount: 30, check: { holder_name: `${PREFIXO}Terceiro Dois` } },
  ]);
  await venda(joao.id, [{ amount: 70, check: { number: "000333", bank: "Caixa", holder_name: `${PREFIXO}Joao` } }]);

  console.log("Conta do seed:", tenant_id, "(hoje:", hojeStr + ")");
  console.log("Loja:", loja, "Conta:", conta, "Gestor:", EMAILS.gestor, "Financeiro:", EMAILS.financeiro, "Vendedor:", EMAILS.vendedor);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
