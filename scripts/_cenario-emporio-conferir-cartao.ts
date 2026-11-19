import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { abrirTurnoDeTeste } from "./_emporio-turno";
import { estadoDaParcela } from "@/lib/actions/emporio-conferencia-cartao";

/**
 * Monta, no banco LOCAL, o cenario da conferencia do cartao do Meu Emporio (frente B, Q349 a Q353) para o
 * roteiro `scripts/navegador/emporio-conferir-cartao.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Cc ", sem tocar no que outros cenarios criaram e SEM mexer em configuracao da
 * conta (EmporioSettings, regra de dia util): so cria lojas, conta, adquirente, vendas e parcelas proprias.
 *   - "Cc Loja 1" e "Cc Loja 2"; cc-gestor@teste.local e Gestor da Loja 1 so;
 *   - a conta "Cc Banco" (saldo inicial 5000) e a adquirente "Cc Adquirente";
 *   - nove vendas no credito a vista da Loja 1, cada uma com 1 parcela de liquido igual ao bruto (sem taxa), com as
 *     datas calculadas de HOJE em Brasilia e do calendario de dia util do cartao (os feriados nacionais entram):
 *       Prevista:   R$ 70,00 daqui a 2 dias;
 *       A conferir: R$ 80,00 e R$ 90,00, que caem hoje (a de 90 e a que o roteiro confere com diferenca e desfaz:
 *                   a lista do A receber so mantem a parcela conferida de HOJE em diante, entao so a de hoje
 *                   tem o botao Desfazer na tela);
 *                   e R$ 55,00 de ONTEM, tambem A conferir (o A receber de hoje diz que traz as anteriores);
 *       Atrasada, dia D1 (a data mais recente que ja esta atrasada): R$ 100,00 e R$ 200,00 (o "Conferir o dia" de
 *                   R$ 300,00 previstos);
 *       Atrasada, dia D2 (o dia anterior a D1): R$ 60,00 e R$ 40,00 (R$ 100,00 previstos);
 *       Conferida:  R$ 50,00 num dia mais antigo, conferida pelo previsto (sem ajuste).
 *   - tres vendas na Loja 2, em contas proprias (a conta "Cc Banco" nao muda): "Cc Reserva" com R$ 130,00
 *     conferida hoje (Retirar e Carimbar) e R$ 120,00 Prevista (antecipacao pontual); "Cc Estorno" (saldo inicial
 *     1000) com R$ 200,00 de ontem, venda de numero 4043 (conferir com diferenca e cancelar a venda).
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. `--limpar` so apaga. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Cc ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAIL_GESTOR = "cc-gestor@teste.local";
const NOME_ADQUIRENTE = `${PREFIXO}Adquirente`;
const DIA = 86_400_000;

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meiaNoite = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

/** O dia mais recente, a partir de ontem para tras, em que a parcela ja esta Atrasada (mesma regra do servidor). */
function diaAtrasadoMaisRecente(): string {
  const hoje = meiaNoite(hojeStr);
  for (let n = 1; n <= 30; n++) {
    const d = somaDias(hojeStr, -n);
    if (estadoDaParcela({ effective_on: meiaNoite(d), reconciled_at: null }, hoje) === "atrasada") return d;
  }
  throw new Error("Nenhum dia atrasado nos ultimos 30 dias.");
}

async function limpar(tenant_id: string) {
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const clientes = (await prisma.emporioCustomer.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const parcelas = (
    await prisma.cardReceivable.findMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }] }, select: { id: true } })
  ).map((p) => p.id);
  const antecipacoes = (await prisma.cardAnticipation.findMany({ where: { tenant_id, bank_account_id: { in: contas } }, select: { id: true } })).map((a) => a.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { related_id: { in: vendas } }] }, select: { id: true } })
  ).map((l) => l.id);

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...clientes, ...vendas, ...lancamentos, ...lojas, ...parcelas, ...contas, ...antecipacoes] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.cashMovement.deleteMany({
    where: {
      tenant_id,
      OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }, { card_receivable_id: { in: parcelas } }],
    },
  });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, id: { in: parcelas } } });
  await prisma.cardAnticipation.deleteMany({ where: { tenant_id, id: { in: antecipacoes } } });
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
  await prisma.cardAcquirer.deleteMany({ where: { tenant_id, name: NOME_ADQUIRENTE } });
  await prisma.establishment.deleteMany({ where: { tenant_id, id: { in: lojas } } });
  await prisma.bankAccount.deleteMany({ where: { tenant_id, id: { in: contas } } });
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

  const gestorDados = { active: true, role: "OPERADOR" as const, tenant_id, emporio_keys: [] as string[], emporio_role: "gestor" as const, emporio_only: false };
  const gestor = await prisma.user.upsert({
    where: { email: EMAIL_GESTOR },
    update: gestorDados,
    create: { ...gestorDados, email: EMAIL_GESTOR, name: "Cc Gestor", password_hash: SENHA_INUTIL },
  });

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const db = prismaForTenant(tenant_id);
  const dono = { id: owner.id, role: owner.role };

  const categoria = await prisma.productCategory.findFirst({ where: { tenant_id, archived_at: null }, orderBy: { name: "asc" } });
  if (!categoria) throw new Error("A conta do seed nao tem categoria de produto: abra o Estoque uma vez.");

  const loja1 = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 1` } as never), "loja 1") as { id: string }).id;
  const loja2 = (exigir(await cat.criarEstabelecimentoAction(db, dono, { name: `${PREFIXO}Loja 2` } as never), "loja 2") as { id: string }).id;
  await prisma.userEstablishment.create({ data: { tenant_id, user_id: gestor.id, establishment_id: loja1 } });

  const racao = (exigir(await cat.criarProdutoEmporioAction(db, dono, { name: `${PREFIXO}Ração`, category_id: categoria.id, base_unit: "quilograma" } as never), "produto") as { id: string }).id;
  const quilo = (exigir(await cat.criarApresentacaoAction(db, dono, racao, { name: "Quilo", base_qty: 1, is_sealed_package: false } as never), "quilo") as { id: string }).id;
  for (const l of [loja1, loja2]) {
    exigir(await cat.definirPrecoAction(db, dono, { establishment_id: l, presentation_id: quilo, price: 10 }), "preco");
    exigir(await est.implantarEstoqueAction(db, dono, { establishment_id: l, emporio_product_id: racao, sealed: [], loose_qty: 100000, unit_cost: 4 } as never), "estoque");
  }

  const conta = (exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Banco`, bank: "Banco Cc" }), "conta") as { id: string }).id;
  exigir(await cx.saldoInicialCaixaAction(db, dono, { bank_account_id: conta, amount: 5000 }), "saldo inicial da conta");
  const turno1 = await abrirTurnoDeTeste(db, dono, loja1);
  exigir(
    await cx.definirRegraCartaoAction(db, dono, { establishment_id: loja1, kind: "credito_vista", fee_pct: 2, days: 1, bank_account_id: conta }),
    "regra de cartao",
  );
  const adquirente = await prisma.cardAcquirer.create({ data: { tenant_id, name: NOME_ADQUIRENTE, updated_by_user_id: owner.id } });

  const cliente = await prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}Cliente`, person_kind: "pf", phone: "34990000099" } as never });
  let seq = 0;
  /** Uma venda no credito a vista, cuja unica parcela vira liquida (sem taxa) e cai em `dia`, da adquirente do cenario. */
  const parcela = async (valor: number, dia: string, conferida = false, o: { loja?: string; turno?: string; conta?: string; numero?: number } = {}) => {
    const venda = exigir(
      await vendas.venderAction(db, dono, {
        operation_key: `cenario-cc-${Date.now()}-${(seq += 1)}`,
        establishment_id: o.loja ?? loja1,
        cash_register_id: o.turno ?? turno1.cash_register_id,
        customer_id: cliente.id,
        items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: valor / 10 }],
        payments: [{ kind: "credito_vista", amount: valor }],
      } as never),
      `venda de ${valor}`,
    ) as { id: string };
    const linhas = await prisma.cardReceivable.findMany({ where: { sale_id: venda.id } });
    if (linhas.length !== 1) throw new Error(`esperava 1 parcela de cartao na venda ${venda.id}, vieram ${linhas.length}`);
    await prisma.cardReceivable.update({
      where: { id: linhas[0].id },
      data: {
        expected_on: meiaNoite(dia),
        effective_on: meiaNoite(dia),
        net_amount: linhas[0].gross_amount,
        effective_net: linhas[0].gross_amount,
        fee_amount: 0,
        acquirer_id: adquirente.id,
        ...(o.conta ? { bank_account_id: o.conta } : {}),
        ...(conferida ? { reconciled_at: meioDia(hojeStr), reconciled_by_user_id: owner.id, confirmed_net: linhas[0].gross_amount } : {}),
      },
    });
    if (o.numero !== undefined) await prisma.emporioSale.update({ where: { id: venda.id }, data: { number: o.numero } });
  };

  const d1 = diaAtrasadoMaisRecente();
  const d2 = somaDias(d1, -1);
  const d3 = somaDias(d1, -3);
  await parcela(70, somaDias(hojeStr, 2));
  await parcela(80, hojeStr);
  await parcela(90, hojeStr);
  await parcela(100, d1);
  await parcela(200, d1);
  await parcela(60, d2);
  await parcela(40, d2);
  await parcela(50, d3, true);
  // A conferir de um dia ANTERIOR: o "Vence hoje" do A receber traz esta tambem, e diz isso. Ontem nunca esta
  // Atrasada (o limite e o proximo dia util depois de ontem, sempre >= hoje); a conferencia abaixo e so sanidade.
  const ontem = somaDias(hojeStr, -1);
  if (estadoDaParcela({ effective_on: meiaNoite(ontem), reconciled_at: null }, meiaNoite(hojeStr)) !== "a_conferir") {
    throw new Error(`Ontem (${ontem}) nao saiu como A conferir: o cenario precisa de uma A conferir anterior a hoje.`);
  }
  await parcela(55, ontem);

  // Loja 2, fora da conta da Loja 1 (os numeros dos passos 1 a 10 nao mudam): carimbo, antecipacao e cancelamento.
  const conta2 = (exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Reserva`, bank: "Banco Cc" }), "conta 2") as { id: string }).id;
  const conta3 = (exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Estorno`, bank: "Banco Cc" }), "conta 3") as { id: string }).id;
  exigir(await cx.saldoInicialCaixaAction(db, dono, { bank_account_id: conta3, amount: 1000 }), "saldo inicial da conta 3");
  const turno2 = await abrirTurnoDeTeste(db, dono, loja2);
  exigir(
    await cx.definirRegraCartaoAction(db, dono, { establishment_id: loja2, kind: "credito_vista", fee_pct: 2, days: 1, bank_account_id: conta2 }),
    "regra de cartao da loja 2",
  );
  const l2 = { loja: loja2, turno: turno2.cash_register_id };
  await parcela(130, hojeStr, true, { ...l2, conta: conta2 }); // conferida (previsto 130): o Retirar e o Carimbar do extrato
  await parcela(120, somaDias(hojeStr, 3), false, { ...l2, conta: conta2 }); // Prevista: a antecipacao pontual do roteiro
  // Conta so dela, com saldo inicial 1000: depois de conferida com diferenca e cancelada, o saldo tem de voltar a 1000.
  // O numero 4043 aparece como "004043": a venda que o roteiro abre para provar que o `eh_404` nao o confunde com a pagina 404.
  await parcela(200, ontem, false, { ...l2, conta: conta3, numero: 4043 });

  console.log("Conta do seed:", tenant_id, "(hoje:", hojeStr + ", D1:", d1 + ", D2:", d2 + ", D3 conferida:", d3 + ")");
  console.log("Lojas:", loja1, loja2, "Gestor:", EMAIL_GESTOR, "Conta:", conta);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
