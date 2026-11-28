import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";
import { limparForaDaDemonstracao } from "./_limpar-conta-do-seed";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da loja no topo do Meu Emporio (onda 6 da frente de UX, plano
 * 2026-11-27) para o roteiro `scripts/navegador/emporio-ux-onda6.py`. Nao e suite.
 *
 * Antes de tudo tira da conta do seed o que outros cenarios deixaram (lojas, clientes, contas bancarias e
 * modelos de despesa fora da demonstracao) e apaga o que uma rodada anterior DESTE cenario criou fora das
 * lojas (os produtos "U6 "). A conta do seed ainda tem as tres lojas da demonstracao, que o Dono enxerga em
 * "Todas": os numeros exatos do roteiro valem com a loja "U6 " escolhida.
 *
 * Com o prefixo "U6 ":
 *   - "U6 Loja 1" e "U6 Loja 2", cada uma com o Caixa 1 aberto;
 *   - u6-gestor@teste.local: Gestor so da Loja 1; u6-fin@teste.local: Financeiro (todas as lojas);
 *     u6-caixa@teste.local: Caixa da Loja 1; e o Dono (owner@example.com);
 *   - produto "U6 Racao" (preco 10, custo 4, nas duas lojas) e "U6 Sal" (preco 10, so na Loja 1, minimo 500 kg,
 *     saldo 100 kg: aparece em Precisa repor SO na Loja 1);
 *   - Loja 1, hoje: 22 vendas de 10,00 em dinheiro (duas paginas de 20) e fiado de "U6 Ana" de 60,00: total 280,00;
 *   - Loja 2, hoje: venda de 50,00 em dinheiro e fiado de "U6 Beto" de 80,00: total 130,00;
 *   - compras: Loja 1 de 123,00, Loja 2 de 456,00 (a prazo, recebidas);
 *   - contas a pagar: "U6 Conta Um" de 111,00 (Loja 1) e "U6 Conta Dois" de 222,00 (Loja 2).
 *
 * Idempotente. So banco local: `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "U6 ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = { gestor: "u6-gestor@teste.local", financeiro: "u6-fin@teste.local", caixa: "u6-caixa@teste.local" };
const DIA = 86_400_000;

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function usuario(tenant_id: string, email: string, name: string, extra: Record<string, unknown>) {
  const dados = { active: true, role: "OPERADOR" as const, tenant_id, emporio_keys: [] as string[], emporio_only: false, ...extra };
  return prisma.user.upsert({
    where: { email },
    update: { ...dados, name },
    create: { ...dados, email, name, password_hash: SENHA_INUTIL },
  });
}

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@example.com" } });
  if (!owner) throw new Error("O seed nao tem owner@example.com: rode npm run db:seed.");
  const tenant_id = owner.tenant_id;

  const limpo = await limparForaDaDemonstracao(tenant_id);
  console.log(`Sujeira de outros cenarios apagada: ${limpo.lojas} lojas, ${limpo.clientes} clientes, ${limpo.contas} contas bancarias.`);

  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporioProdutos = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  await prisma.stockMovement.deleteMany({ where: { tenant_id, product_id: { in: produtos } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporioProdutos } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporioProdutos } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporioProdutos } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  if ((await prisma.establishment.count({ where: { tenant_id, name: { startsWith: PREFIXO } } })) > 0) throw new Error("A limpeza deixou lojas U6 para tras.");

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Zeca Gestor U6", { emporio_role: "gestor" });
  const financeiro = await usuario(tenant_id, EMAILS.financeiro, "Fin U6", papelFinanceiro());
  const caixa = await usuario(tenant_id, EMAILS.caixa, "Cida Caixa U6", { emporio_role: "caixa" });

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, financeiro.id, caixa.id] } }, data: { active: false } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: { in: [gestor.id, financeiro.id, caixa.id] } } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const desp = await import("@/lib/actions/emporio-despesas");
  const compras = await import("@/lib/actions/emporio-compras");
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

  const produto = async (nome: string, preco: number, custo: number, lojas: string[], kg = 10000) => {
    const p = exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}${nome}`, category_id: categoria.id, base_unit: "quilograma" } as never), nome) as { id: string };
    const a = exigir(await cat.criarApresentacaoAction(db, dono, p.id, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), `${nome} quilo`) as { id: string };
    for (const l of lojas) {
      exigir(await cat.definirPrecoAction(db, dono, { establishment_id: l, presentation_id: a.id, price: preco }), `${nome} preco`);
      exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: l, emporio_product_id: p.id, sealed: [], loose_qty: kg, unit_cost: custo } as never), `${nome} estoque`);
    }
    return { id: p.id, pres: a.id };
  };
  const racao = await produto("Ração", 10, 4, [loja1, loja2]);
  const sal = await produto("Sal", 10, 2, [loja1], 100);
  // Minimo de 500 kg com saldo de 100 kg: o Sal entra em Precisa repor, so na Loja 1.
  await prisma.stockLimit.create({ data: { tenant_id, establishment_id: loja1, emporio_product_id: sal.id, min_qty: 500 } as never });

  const registroDe: Record<string, string> = {};
  for (const l of [loja1, loja2]) {
    await abrirTurnoDeTeste(db, dono, l);
    registroDe[l] = (await prisma.cashRegister.findFirstOrThrow({ where: { tenant_id, establishment_id: l, number: 1 } })).id;
  }

  const cliente = async (name: string) => prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}${name}` } as never });
  const ana = await cliente("Ana");
  const beto = await cliente("Beto");
  const consumidor = (await (await import("@/lib/actions/emporio-clientes")).garantirConsumidorFinal(db)).id;

  const rodada = Date.now();
  const vender = async (chave: string, loja: string, qty: number, customer_id: string, payments: unknown[]) =>
    exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-u6-${chave}-${rodada}`,
        establishment_id: loja,
        cash_register_id: registroDe[loja],
        customer_id,
        items: [{ emporio_product_id: racao.id, presentation_id: racao.pres, quantity: qty }],
        payments,
      } as never),
      `venda ${chave}`,
    );
  const dinheiro = (valor: number) => [{ kind: "dinheiro", amount: valor }];
  const fiado = (valor: number) => [{ kind: "fiado", amount: valor, due_date: meioDia(somaDias(hojeStr, 10)) }];

  for (let i = 1; i <= 22; i++) await vender(`a${i}`, loja1, 1, consumidor, dinheiro(10));
  await vender("ana", loja1, 6, ana.id, fiado(60));
  await vender("b1", loja2, 5, consumidor, dinheiro(50));
  await vender("beto", loja2, 8, beto.id, fiado(80));

  const hoje = hojeStr;
  const compra = async (chave: string, loja: string, total: number) =>
    exigir(
      await compras.criarCompraAction(db, dono, {
        operation_key: `cenario-u6-compra-${chave}-${rodada}`,
        establishment_id: loja,
        purchased_at: new Date(`${hoje}T00:00:01-03:00`),
        received: true,
        freight: 0,
        items: [{ emporio_product_id: racao.id, presentation_id: racao.pres, quantity: 10, item_total: total }],
        payment: { kind: "a_prazo", due_date: meioDia(somaDias(hojeStr, 30)) },
      } as never),
      `compra ${chave}`,
    );
  await compra("1", loja1, 123);
  await compra("2", loja2, 456);

  for (const [loja, nome, valor] of [[loja1, "Conta Um", 111], [loja2, "Conta Dois", 222]] as const) {
    exigir(
      await desp.criarContaAvulsaAction(db, dono, {
        establishment_id: loja,
        description: `${PREFIXO}${nome}`,
        amount: valor,
        due_date: meioDia(somaDias(hojeStr, 15)),
        status: "pending",
      }),
      nome,
    );
  }

  console.log("Conta do seed:", tenant_id);
  console.log("Loja 1:", loja1, "| Loja 2:", loja2, "| hoje em Sao Paulo:", hojeStr);
  console.log("Loja 1: 23 vendas hoje (280,00), fiado Ana 60,00, compra 123,00, conta 111,00, Sal em Precisa repor");
  console.log("Loja 2: 2 vendas hoje (130,00), fiado Beto 80,00, compra 456,00, conta 222,00");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
