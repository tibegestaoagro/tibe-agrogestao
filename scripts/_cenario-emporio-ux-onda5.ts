import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { papelFinanceiro } from "./_emporio-papel";
import { limparForaDaDemonstracao } from "./_limpar-conta-do-seed";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario das Estatisticas do Meu Emporio (onda 5 da frente de UX, plano
 * 2026-11-27) para o roteiro `scripts/navegador/emporio-ux-onda5.py`. Nao e suite.
 *
 * Antes de tudo tira da conta do seed o que outros cenarios deixaram (lojas, clientes, contas bancarias e
 * modelos de despesa fora da demonstracao) e apaga o que uma rodada anterior DESTE cenario criou fora das
 * lojas (os produtos "U5 "). Os numeros exatos do roteiro valem com `?loja=<id>` de uma loja "U5 ": a
 * conta do seed ainda tem as tres lojas da demonstracao, que o dono enxerga em "Todas".
 *
 * Com o prefixo "U5 ", todos os valores sao fixos (os totais abaixo nao dependem do dia do mes):
 *   - "U5 Loja A", com o Caixa 1 aberto, e "U5 Loja B", idem;
 *   - u5-gestor@teste.local: Gestor so da U5 Loja A (SEM Dinheiro); u5-fin@teste.local: Financeiro;
 *     u5-caixa@teste.local: Caixa da U5 Loja A; u5-gestor2@teste.local: Gestor das DUAS lojas U5, sem Dinheiro; e o Dono (owner@example.com);
 *   - produtos de venda: "U5 Ração" (preco 10, custo 4, nas duas lojas), "U5 Adubo" (preco 10, custo 15: a
 *     venda de margem negativa) e "U5 Milheto" (preco 10, so na Loja A, NUNCA vendido: o produto parado);
 *   - Loja A, no dia 1 do MES CORRENTE (todas em dinheiro):
 *       V1 200,00 (20 kg de Ração, vendedor Zeca Gestor U5)
 *       V2 100,00 (10 kg de Ração, vendedor Dono)
 *       V3  50,00 (5 kg de Ração, vendedor Dono) e a DEVOLUCAO dela inteira, no mesmo dia: -50,00
 *       V4  30,00 (3 kg de Adubo, vendedor Zeca Gestor U5): custo 45,00, margem -15,00
 *     total do mes SEM a devolucao 380,00; COM ela, 330,00. Vendedores: Zeca 230,00 e Dono 100,00;
 *   - Loja A, no dia 1 do MES ANTERIOR: V0 300,00 (30 kg de Ração, Dono). O mesmo trecho do mes anterior do
 *     periodo "Este mes" e do dia 1 ao dia 30: 300,00. Logo 330 sobre 300 = "10% acima de <mes anterior>";
 *     sem descontar a devolucao seriam 380 sobre 300, "27% acima";
 *   - Loja B, hoje: V5 50,00 em dinheiro (Ração, Dono), e fiado de "U5 Joao" de 100,00 vencido ha 10 dias e de
 *     "U5 Maria" de 40,00 a vencer em 10 dias (hoje); a loja soma 190,00 no mes. Sem venda no mes
 *     anterior: "Sem vendas em <mes anterior>, no mesmo periodo". A receber 140,00, dos quais vencido 100,00;
 *   - uma conta a pagar da Loja B, "U5 Frete avulso", de 250,00, vencendo daqui a 15 dias.
 *
 * Os assentos: o plano "grupo" tem 5; Dono, os dois Gestores, Financeiro e Caixa cabem (5), e os demais usuarios da conta
 * do seed ficam desativados.
 *
 * Idempotente. So banco local: `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "U5 ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = { gestor: "u5-gestor@teste.local", financeiro: "u5-fin@teste.local", caixa: "u5-caixa@teste.local", gestor2: "u5-gestor2@teste.local" };
const DIA = 86_400_000;

// O dia de hoje em Sao Paulo, pelo calendario (sem horario de verao desde 2019: UTC-3).
const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);

const dia1DoMes = `${hojeStr.slice(0, 7)}-01`;
const dia1DoMesAnterior = `${somaDias(dia1DoMes, -1).slice(0, 7)}-01`;

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

  // Produtos de rodadas anteriores deste cenario (as lojas ja sairam na limpeza, com vendas e movimentos).
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporioProdutos = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  await prisma.stockMovement.deleteMany({ where: { tenant_id, product_id: { in: produtos } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporioProdutos } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporioProdutos } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporioProdutos } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  if ((await prisma.establishment.count({ where: { tenant_id, name: { startsWith: PREFIXO } } })) > 0) throw new Error("A limpeza deixou lojas U5 para tras.");

  const gestor = await usuario(tenant_id, EMAILS.gestor, "Zeca Gestor U5", { emporio_role: "gestor" });
  const financeiro = await usuario(tenant_id, EMAILS.financeiro, "Fin U5", papelFinanceiro());
  const caixa = await usuario(tenant_id, EMAILS.caixa, "Cida Caixa U5", { emporio_role: "caixa" });
  const gestor2 = await usuario(tenant_id, EMAILS.gestor2, "U5 Gestor Duas", { emporio_role: "gestor" });

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({ where: { tenant_id, id: { notIn: [owner.id, gestor.id, financeiro.id, caixa.id, gestor2.id] } }, data: { active: false } });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: { in: [gestor.id, financeiro.id, caixa.id, gestor2.id] } } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const desp = await import("@/lib/actions/emporio-despesas");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const lojaA = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja A` }), "loja A") as { id: string }).id;
  const lojaB = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja B` }), "loja B") as { id: string }).id;
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: gestor.id, establishment_id: lojaA },
      { tenant_id, user_id: caixa.id, establishment_id: lojaA },
      { tenant_id, user_id: gestor2.id, establishment_id: lojaA },
      { tenant_id, user_id: gestor2.id, establishment_id: lojaB },
    ],
  });

  // Os produtos: preco e estoque implantado so onde o cenario precisa deles.
  const produto = async (nome: string, preco: number, custo: number, lojas: string[], kg = 10000) => {
    const p = exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}${nome}`, category_id: categoria.id, base_unit: "quilograma" } as never), nome) as { id: string };
    const a = exigir(await cat.criarApresentacaoAction(db, dono, p.id, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), `${nome} quilo`) as { id: string };
    for (const l of lojas) {
      exigir(await cat.definirPrecoAction(db, dono, { establishment_id: l, presentation_id: a.id, price: preco }), `${nome} preco`);
      exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: l, emporio_product_id: p.id, sealed: [], loose_qty: kg, unit_cost: custo } as never), `${nome} estoque`);
    }
    return { id: p.id, pres: a.id };
  };
  const racao = await produto("Ração", 10, 4, [lojaA, lojaB]);
  const adubo = await produto("Adubo", 10, 15, [lojaA]);
  await produto("Milheto", 10, 2, [lojaA], 100);

  const registroDe: Record<string, string> = {};
  for (const l of [lojaA, lojaB]) {
    await abrirTurnoDeTeste(db, dono, l);
    registroDe[l] = (await prisma.cashRegister.findFirstOrThrow({ where: { tenant_id, establishment_id: l, number: 1 } })).id;
  }

  const cliente = async (name: string) => prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}${name}` } as never });
  const joao = await cliente("Joao");
  const maria = await cliente("Maria");
  const consumidor = (await (await import("@/lib/actions/emporio-clientes")).garantirConsumidorFinal(db)).id;

  const rodada = Date.now();
  type Prod = { id: string; pres: string };
  const vender = async (chave: string, loja: string, p: Prod, qty: number, customer_id: string, payments: unknown[], quando?: Date) => {
    const v = exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-u5-${chave}-${rodada}`,
        establishment_id: loja,
        cash_register_id: registroDe[loja],
        customer_id,
        items: [{ emporio_product_id: p.id, presentation_id: p.pres, quantity: qty }],
        payments,
        ...(quando ? { sold_at: quando } : {}),
      } as never),
      `venda ${chave}`,
    ) as { id: string };
    return v.id;
  };
  const dinheiro = (valor: number) => [{ kind: "dinheiro", amount: valor }];
  const noMes = meioDia(dia1DoMes);
  const noMesAnterior = meioDia(dia1DoMesAnterior);
  const trocarVendedor = (id: string, user_id: string) => prisma.emporioSale.update({ where: { id }, data: { seller_user_id: user_id } });

  // O mes anterior (o trecho do dia 1 ao dia 30 vale 300,00).
  await vender("v0", lojaA, racao, 30, consumidor, dinheiro(300), noMesAnterior);

  // O mes corrente, na Loja A.
  const v1 = await vender("v1", lojaA, racao, 20, consumidor, dinheiro(200), noMes);
  await vender("v2", lojaA, racao, 10, consumidor, dinheiro(100), noMes);
  const v3 = await vender("v3", lojaA, racao, 5, consumidor, dinheiro(50), noMes);
  const v4 = await vender("v4", lojaA, adubo, 3, consumidor, dinheiro(30), noMes);
  await trocarVendedor(v1, gestor.id);
  await trocarVendedor(v4, gestor.id);

  // A devolucao inteira da V3, no mesmo dia (o relatorio conta a devolucao pela data dela).
  const item3 = await prisma.emporioSaleItem.findFirstOrThrow({ where: { sale_id: v3 } });
  const dev = exigir(
    await vendas.devolverAction(db, dono, v3, {
      operation_key: `cenario-u5-dev-${rodada}`,
      refund_kind: "dinheiro",
      cash_register_id: registroDe[lojaA],
      items: [{ sale_item_id: item3.id, quantity: 5 }],
    } as never),
    "devolucao",
  ) as { id: string };
  await prisma.emporioSaleReturn.update({ where: { id: dev.id }, data: { returned_at: new Date(`${dia1DoMes}T17:00:00Z`) } });

  // Loja B: uma venda em dinheiro e o fiado (vencido e a vencer), todos hoje.
  await vender("v5", lojaB, racao, 5, consumidor, dinheiro(50));
  await vender("fiado-vencido", lojaB, racao, 10, joao.id, [{ kind: "fiado", amount: 100, due_date: meioDia(somaDias(hojeStr, -10)) }]);
  await vender("fiado-a-vencer", lojaB, racao, 4, maria.id, [{ kind: "fiado", amount: 40, due_date: meioDia(somaDias(hojeStr, 10)) }]);

  // A conta a pagar nos proximos 30 dias.
  exigir(
    await desp.criarContaAvulsaAction(db, dono, {
      establishment_id: lojaB,
      description: `${PREFIXO}Frete avulso`,
      amount: 250,
      due_date: meioDia(somaDias(hojeStr, 15)),
      status: "pending",
    }),
    "conta a pagar",
  );

  console.log("Conta do seed:", tenant_id);
  console.log("Loja A:", lojaA, "| Loja B:", lojaB, "| hoje em Sao Paulo:", hojeStr);
  console.log("Mes corrente (dia 1):", dia1DoMes, "| mes anterior (dia 1):", dia1DoMesAnterior);
  console.log("Loja A: mes 330,00 (380,00 sem a devolucao), mes anterior 300,00, Zeca 230,00, Dono 100,00, 1 parado, 1 margem negativa");
  console.log("Loja B: mes 190,00, a receber 140,00 (vencido 100,00), a pagar 250,00");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
