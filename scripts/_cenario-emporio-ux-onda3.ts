import "./_env-local";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { limparForaDaDemonstracao } from "./_limpar-conta-do-seed";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario do Vender novo do Meu Emporio (onda 3 da frente de UX,
 * plano 2026-11-26) para o roteiro `scripts/navegador/emporio-ux-onda3.py`. Nao e suite.
 *
 * Antes de tudo tira da conta do seed o que outros cenarios deixaram (lojas, clientes e
 * contas fora da demonstracao, como o cenario da onda 2), e apaga o que uma rodada anterior
 * DESTE cenario criou (produtos, usuarios vinculados, vendas e turnos saem com as lojas).
 *
 * Com o prefixo "U3 ":
 *   - loja "U3 Loja A": o caixa FECHADO. Vendedores que o Caixa enxerga: Ana, Bruno, o Dono
 *     (sempre vendedor de toda loja, `vendedoresDaLoja`) e o Gestor Zeca, nesta ordem
 *     (a lista vem por nome). Ana e Bruno sao Vendedores vinculados a A; Zeca e Gestor de A;
 *   - loja "U3 Loja B": o caixa ABERTO "ontem as 23h50 de Sao Paulo" (a data sai do calendario
 *     no fuso -3, nunca de "ha N horas"). Nenhum Vendedor ou Gestor vinculado: o unico
 *     vendedor possivel e o Dono, que por regra vende em qualquer loja. E a "loja de um
 *     vendedor so" do desenho;
 *   - o produto "U3 Racao" (R$ 10,00 o quilo nas duas lojas, 1000 kg em cada);
 *   - o cliente de verdade "U3 Cliente";
 *   - em B, duas vendas gravadas do Dono: uma COM FRETE de R$ 30,00 (para editar) e uma para
 *     a troca;
 *   - u3-caixa@teste.local: Caixa das lojas A e B;
 *   - u3-gestor@teste.local: Gestor da Loja A; u3-ana e u3-bruno: Vendedores da Loja A.
 *
 * Os assentos: o plano "grupo" tem 5; Dono, Ana, Bruno, Zeca e o Caixa cabem, e os demais
 * usuarios da conta do seed ficam desativados.
 *
 * Idempotente. So banco local: `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "U3 ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAILS = {
  ana: "u3-ana@teste.local",
  bruno: "u3-bruno@teste.local",
  gestor: "u3-gestor@teste.local",
  caixa: "u3-caixa@teste.local",
};
const DIA = 86_400_000;

// O dia de hoje em Sao Paulo, pelo calendario (sem horario de verao desde 2019: UTC-3).
const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);

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

  // Produtos de rodadas anteriores deste cenario (as lojas ja sairam na limpeza, com vendas e turnos).
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporioProdutos = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  await prisma.stockMovement.deleteMany({ where: { tenant_id, product_id: { in: produtos } } });
  await prisma.stockLimit.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporioProdutos } } });
  await prisma.productPresentation.deleteMany({ where: { tenant_id, emporio_product_id: { in: emporioProdutos } } });
  await prisma.emporioProduct.deleteMany({ where: { tenant_id, id: { in: emporioProdutos } } });
  await prisma.product.deleteMany({ where: { tenant_id, id: { in: produtos } } });
  const lojasAntigas = await prisma.establishment.count({ where: { tenant_id, name: { startsWith: PREFIXO } } });
  if (lojasAntigas > 0) throw new Error("A limpeza deixou lojas U3 para tras.");

  const ana = await usuario(tenant_id, EMAILS.ana, "Ana U3", { emporio_role: "vendedor" });
  const bruno = await usuario(tenant_id, EMAILS.bruno, "Bruno U3", { emporio_role: "vendedor" });
  const gestor = await usuario(tenant_id, EMAILS.gestor, "Zeca Gestor U3", { emporio_role: "gestor" });
  const caixa = await usuario(tenant_id, EMAILS.caixa, "Cida Caixa U3", { emporio_role: "caixa" });

  await prisma.tenant.update({ where: { id: tenant_id }, data: { plan: "grupo" } });
  await prisma.user.updateMany({
    where: { tenant_id, id: { notIn: [owner.id, ana.id, bruno.id, gestor.id, caixa.id] } },
    data: { active: false },
  });
  await prisma.userEstablishment.deleteMany({ where: { tenant_id, user_id: { in: [ana.id, bruno.id, gestor.id, caixa.id] } } });

  const ligado = await setTenantFeatureAction({ tenantId: tenant_id, key: "emporio", enabled: true, user_ids: [] });
  if (!ligado.ok) throw new Error(ligado.message);

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const lojaA = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja A` }), "loja A") as { id: string }).id;
  const lojaB = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja B` }), "loja B") as { id: string }).id;
  await prisma.userEstablishment.createMany({
    data: [
      { tenant_id, user_id: ana.id, establishment_id: lojaA },
      { tenant_id, user_id: bruno.id, establishment_id: lojaA },
      { tenant_id, user_id: gestor.id, establishment_id: lojaA },
      { tenant_id, user_id: caixa.id, establishment_id: lojaA },
      { tenant_id, user_id: caixa.id, establishment_id: lojaB },
    ],
  });

  const racao = (
    exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }
  ).id;
  const quilo = (
    exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }
  ).id;
  for (const l of [lojaA, lojaB]) {
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: l, presentation_id: quilo, price: 10 }), "preco");
    exigir(
      await est.implantarEstoqueAction(db, dono, { establishment_id: l, emporio_product_id: racao, sealed: [], loose_qty: 1000, unit_cost: 4 } as never),
      "estoque",
    );
  }

  // O troco de cada loja; so a B tem turno aberto (a A fica com o caixa fechado, para o roteiro abri-lo).
  const registroDe: Record<string, string> = {};
  for (const l of [lojaA, lojaB]) {
    const registro = await prisma.cashRegister.findFirst({ where: { tenant_id, establishment_id: l, number: 1 } });
    if (!registro) throw new Error(`A loja ${l} nasceu sem o Caixa 1.`);
    registroDe[l] = registro.id;
    exigir(await cx.saldoInicialCaixaAction(db, dono, { cash_register_id: registro.id, amount: 200 }), "troco do caixa");
  }
  await abrirTurnoDeTeste(db, dono, lojaB);
  // "Ontem as 23h50 de Sao Paulo" = hoje as 02h50 UTC (a data vem do calendario em Sao Paulo, nao de "ha N horas").
  await prisma.cashSession.updateMany({
    where: { tenant_id, establishment_id: lojaB, closed_at: null },
    data: { opened_at: new Date(`${hojeStr}T02:50:00Z`) },
  });

  const cliente = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Cliente` } });

  // Duas vendas do Dono na loja B: uma com frete (a edicao abre "Mais opcoes" ja aberto) e outra para a troca.
  const rodada = Date.now();
  const vender = async (chave: string, qty: number, payments: unknown[], extra: Record<string, unknown> = {}) =>
    exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-u3-${chave}-${rodada}`,
        establishment_id: lojaB,
        cash_register_id: registroDe[lojaB],
        customer_id: cliente.id,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: qty }],
        payments,
        ...extra,
      } as never),
      `venda ${chave}`,
    );
  await vender("frete", 2, [{ kind: "dinheiro", amount: 50 }], { freight_amount: 30 });
  await vender("troca", 3, [{ kind: "dinheiro", amount: 30 }]);

  console.log("Conta do seed:", tenant_id);
  console.log("Lojas A, B:", lojaA, lojaB, "(hoje em Sao Paulo:", hojeStr + ", turno da B desde", somaDias(hojeStr, -1), "23:50)");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
