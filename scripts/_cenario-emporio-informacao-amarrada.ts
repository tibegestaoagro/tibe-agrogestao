import "./_env-local";
import { limparTaxasDeCenario } from "./_cartao-cenario";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { soltarDespesaFixa } from "./_cenario-despesa-fixa";
import { abrirTurnoDeTeste } from "./_emporio-turno";

/**
 * Monta, no banco LOCAL, o cenario da informacao amarrada do Meu Emporio (frente A, Q345 a Q348) para o
 * roteiro `scripts/navegador/emporio-informacao-amarrada.py`. Nao e suite.
 *
 * Na conta do seed, com o prefixo "Ia ", sem tocar no que outros cenarios criaram:
 *   - "Ia Loja 1" e "Ia Loja 2"; ia-gestor@teste.local e Gestor da Loja 1 so;
 *   - a conta "Ia Banco" (Pix das duas lojas e cartao a vista da Loja 1);
 *   - A RECEBER da Loja 1 (todos os valores de hoje, ontem e amanha em Brasilia):
 *       fiado: Vencido 130 (ontem), Parcial 100 (ontem, 60 pagos ontem: aberto 40), Hoje 40, Amanha 50,
 *              e o fiado de 80 do cliente da ficha (ontem); um fiado de 40 quitado no dia 10 do mes passado;
 *       cheques em carteira: 20 (bom para ontem) e 50 (daqui a 15 dias); compensado de 30 (ontem) e
 *              devolvido de 20, ambos do cliente da ficha;
 *       boletos: 60 (venceu ontem), 70 (daqui a 20 dias) e 50 pago ontem;
 *       cartoes: 200 que cai hoje, 150 que caiu ontem, 100 daqui a 2 dias (cliente da ficha) e 60 daqui a
 *              2 dias no Consumidor final; e R$ 45,00 em dinheiro hoje, que nunca e "a receber";
 *     => Vencido 330 (5 itens), Vence hoje 240 (2), A vencer 330 (5), Recebido de Este mes 490 (5),
 *        Recebido de Mes passado 40 (1).
 *   - A PAGAR: na Loja 1, 70 vencida ontem (do "Ia Fornecedor"), 80 hoje, 90 amanha e 60 paga ontem (do
 *     "Ia Fornecedor"); na Loja 2, 100 daqui a 5 dias.
 *   - FICHA do "Ia Cliente Ficha": compras de 430 no total (340 na Loja 1 e 90 na Loja 2); Em aberto 220,
 *     Vencido 80, Recebido 190 (cartao 100, Pix 60 e cheque compensado 30).
 *   - "Ia Cliente Loja 2": fiado de 70 vencido ontem, so na Loja 2.
 *
 * Apaga antes o que rodadas anteriores criaram. Idempotente. `--limpar` so apaga. So banco local:
 * `exigirBancoLocal()` barra o resto.
 */
exigirBancoLocal();

const PREFIXO = "Ia ";
const SENHA_INUTIL = "sem-senha"; // hash que nenhuma senha produz: a sessao vem do cookie
const EMAIL_GESTOR = "ia-gestor@teste.local";
const DIA = 86_400_000;

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
/** Um instante de Brasilia (UTC-3, sem horario de verao). */
const brt = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`);
const ONTEM = somaDias(hojeStr, -1);
const mesPassado10 = (() => {
  const [a, m] = hojeStr.split("-").map(Number);
  const t = a * 12 + (m - 1) - 1;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-10`;
})();

function exigir<T>(r: { ok: true; data: T } | { ok: false; message: string }, o_que: string): T {
  if (!r.ok) throw new Error(`${o_que}: ${r.message}`);
  return r.data;
}

async function restaurarConfiguracoes(tenant_id: string) {
  const padrao = { fiado_due_days: 30, fiado_block_after_days: 15, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null };
  await prisma.emporioSettings.upsert({ where: { tenant_id }, update: padrao, create: { tenant_id, ...padrao } });
}

async function limpar(tenant_id: string) {
  await restaurarConfiguracoes(tenant_id);
  const lojas = (await prisma.establishment.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((l) => l.id);
  const contas = (await prisma.bankAccount.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const produtos = (await prisma.product.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((p) => p.id);
  const emporio = (await prisma.emporioProduct.findMany({ where: { tenant_id, product_id: { in: produtos } }, select: { id: true } })).map((p) => p.id);
  const vendas = (await prisma.emporioSale.findMany({ where: { tenant_id, establishment_id: { in: lojas } }, select: { id: true } })).map((v) => v.id);
  const fornecedores = (await prisma.emporioSupplier.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((f) => f.id);
  const clientes = (await prisma.emporioCustomer.findMany({ where: { tenant_id, name: { startsWith: PREFIXO } }, select: { id: true } })).map((c) => c.id);
  const lancamentos = (
    await prisma.financialEntry.findMany({
      where: {
        tenant_id,
        OR: [
          { establishment_id: { in: lojas } },
          { related_id: { in: vendas } },
          { emporio_customer_id: { in: clientes } },
          { emporio_supplier_id: { in: fornecedores } },
        ],
      },
      select: { id: true },
    })
  ).map((l) => l.id);

  await prisma.emporioAuditLog.deleteMany({
    where: { tenant_id, OR: [{ target_id: { in: [...clientes, ...vendas, ...lancamentos, ...lojas] } }, { establishment_id: { in: lojas } }] },
  });
  await prisma.emporioCreditRelease.deleteMany({ where: { tenant_id, OR: [{ customer_id: { in: clientes } }, { establishment_id: { in: lojas } }] } });
  await prisma.cashMovement.deleteMany({
    where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { manager_establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }] },
  });
  await prisma.cashCount.deleteMany({ where: { tenant_id, establishment_id: { in: lojas } } });
  await prisma.cardReceivable.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { bank_account_id: { in: contas } }] } });
  await prisma.emporioCheck.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] } });
  await prisma.emporioBoleto.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { sale_id: { in: vendas } }] } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id, OR: [{ establishment_id: { in: lojas } }, { product_id: { in: produtos } }] } });
  await prisma.emporioSalePayment.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.financialPayment.deleteMany({ where: { tenant_id, entry_id: { in: lancamentos } } });
  await soltarDespesaFixa(prisma, { tenant_id, lojas, lancamentos });
  await prisma.financialEntry.deleteMany({ where: { tenant_id, id: { in: lancamentos } } });
  await prisma.emporioSaleItem.deleteMany({ where: { tenant_id, sale_id: { in: vendas } } });
  await prisma.emporioSale.deleteMany({ where: { tenant_id, id: { in: vendas } } });
  await prisma.emporioCustomer.deleteMany({ where: { tenant_id, id: { in: clientes } } });
  await prisma.emporioSupplier.deleteMany({ where: { tenant_id, id: { in: fornecedores } } });
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
    create: { ...gestorDados, email: EMAIL_GESTOR, name: "Ia Gestor", password_hash: SENHA_INUTIL },
  });

  // O fiado vencido de ontem nao pode bloquear a venda de montagem do mesmo cliente.
  const PADRAO = { fiado_due_days: 30, fiado_block_after_days: 365, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null };
  await prisma.emporioSettings.upsert({ where: { tenant_id }, update: PADRAO, create: { tenant_id, ...PADRAO } });

  const cat = await import("@/lib/actions/emporio-catalogo");
  const est = await import("@/lib/actions/emporio-estoque");
  const cx = await import("@/lib/actions/emporio-caixa");
  const vendas = await import("@/lib/actions/emporio-vendas");
  const desp = await import("@/lib/actions/emporio-despesas");
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

  const conta = (exigir(await cx.criarContaAction(db, dono, { name: `${PREFIXO}Banco`, bank: "Banco Ia" }), "conta") as { id: string }).id;
  exigir(await cx.saldoInicialCaixaAction(db, dono, { bank_account_id: conta, amount: 5000 }), "saldo inicial da conta");
  const turno1 = await abrirTurnoDeTeste(db, dono, loja1);
  const turno2 = await abrirTurnoDeTeste(db, dono, loja2);
  exigir(await cx.definirContaPixAction(db, dono, loja1, { bank_account_id: conta }), "conta do Pix da Loja 1");
  exigir(await cx.definirContaPixAction(db, dono, loja2, { bank_account_id: conta }), "conta do Pix da Loja 2");
  exigir(
    await cx.definirRegraCartaoAction(db, dono, { establishment_id: loja1, kind: "credito_vista", fee_pct: 2, days: 1, bank_account_id: conta }),
    "regra de cartao",
  );

  const cliente = (nome: string, telefone: string) =>
    prisma.emporioCustomer.create({ data: { tenant_id, name: `${PREFIXO}${nome}`, person_kind: "pf", phone: telefone } as never });
  const cVencido = await cliente("Cliente Vencido", "34990000001");
  const cParcial = await cliente("Cliente Parcial", "34990000002");
  const cHoje = await cliente("Cliente Hoje", "34990000003");
  const cAmanha = await cliente("Cliente Amanha", "34990000004");
  const cMesPassado = await cliente("Cliente Mes Passado", "34990000005");
  const cCheque = await cliente("Cliente Cheque", "34990000006");
  const cBoleto = await cliente("Cliente Boleto", "34990000007");
  const cCartao = await cliente("Cliente Cartao", "34990000008");
  const cFicha = await cliente("Cliente Ficha", "34990000009");
  const cLoja2 = await cliente("Cliente Loja 2", "34990000010");
  const fornecedor = await prisma.emporioSupplier.create({ data: { tenant_id, kind: "externo", name: `${PREFIXO}Fornecedor` } as never });

  let seq = 0;
  const vender = async (loja: string, turno: { cash_register_id: string }, valor: number, pagamento: Record<string, unknown>, clienteId: string | null, vendidaHa = 0) =>
    (
      exigir(
        await vendas.venderAction(db, dono, {
          operation_key: `cenario-ia-${Date.now()}-${(seq += 1)}`,
          establishment_id: loja,
          cash_register_id: turno.cash_register_id,
          ...(clienteId ? { customer_id: clienteId } : {}),
          ...(vendidaHa > 0 ? { sold_at: new Date(Date.now() - vendidaHa * DIA) } : {}),
          items: [{ emporio_product_id: racao, presentation_id: quilo, quantity: valor / 10 }],
          payments: [pagamento],
        } as never),
        `venda de ${valor}`,
      ) as { id: string }
    ).id;
  // Fiado que venceu `ontemOuAntes` dias atras: vendido 5 dias antes do vencimento (o vencimento nao precede a venda).
  const fiado = (loja: string, turno: { cash_register_id: string }, valor: number, vencEm: number, clienteId: string) =>
    vender(loja, turno, valor, { kind: "fiado", amount: valor, due_date: meioDia(somaDias(hojeStr, vencEm)) }, clienteId, vencEm < 0 ? -vencEm + 5 : 0);

  const receberFiado = async (clienteId: string, valor: number, quando: Date) => {
    const chave = `cenario-ia-rec-${Date.now()}-${(seq += 1)}`;
    exigir(await cx.receberFiadoAction(db, dono, { operation_key: chave, customer_id: clienteId, establishment_id: loja1, amount: valor, kind: "pix", bank_account_id: conta } as never), "receber fiado");
    const entradas = await prisma.financialEntry.findMany({ where: { tenant_id, emporio_customer_id: clienteId }, select: { id: true } });
    const pgs = await prisma.financialPayment.findMany({ where: { entry_id: { in: entradas.map((e) => e.id) } }, select: { id: true } });
    const ids = pgs.map((p) => p.id);
    await prisma.financialPayment.updateMany({ where: { id: { in: ids } }, data: { paid_at: quando } });
    await prisma.cashMovement.updateMany({ where: { OR: [{ financial_payment_id: { in: ids } }, { operation_key: chave }] }, data: { occurred_at: quando } });
  };

  // ----- A receber, Loja 1: fiado
  await fiado(loja1, turno1, 130, -1, cVencido.id);
  await fiado(loja1, turno1, 100, -1, cParcial.id);
  await receberFiado(cParcial.id, 60, brt(ONTEM, "15:00"));
  await fiado(loja1, turno1, 40, 0, cHoje.id);
  await fiado(loja1, turno1, 50, 1, cAmanha.id);
  await fiado(loja1, turno1, 40, 30, cMesPassado.id);
  await receberFiado(cMesPassado.id, 40, brt(mesPassado10, "15:00"));

  // ----- cheques, boletos, cartoes e o dinheiro do ato da venda
  const cheque = (numero: string, valor: number) => ({ kind: "cheque", amount: valor, check: { holder_name: "Titular Ia", number: numero, bank: "Banco Ia", good_for: meioDia(somaDias(hojeStr, 15)) } });
  const boleto = (numero: string, valor: number) => ({ kind: "boleto", amount: valor, boleto: { due_on: meioDia(somaDias(hojeStr, 20)), number: numero } });
  await vender(loja1, turno1, 20, cheque("IA-K1", 20), cCheque.id);
  await prisma.emporioCheck.updateMany({ where: { tenant_id, number: "IA-K1" }, data: { good_for: meioDia(ONTEM) } });

  await vender(loja1, turno1, 60, boleto("IA-B1", 60), cBoleto.id);
  await prisma.emporioBoleto.updateMany({ where: { tenant_id, number: "IA-B1" }, data: { due_on: meioDia(ONTEM) } });
  await vender(loja1, turno1, 70, boleto("IA-B2", 70), cBoleto.id);
  await vender(loja1, turno1, 50, boleto("IA-B3", 50), cBoleto.id);
  const b3 = await prisma.emporioBoleto.findFirst({ where: { tenant_id, number: "IA-B3" } });
  if (!b3) throw new Error("O boleto IA-B3 nao foi criado.");
  exigir(await cx.pagarBoletoAction(db, dono, b3.id, { bank_account_id: conta, paid_on: new Date(ONTEM) }), "baixa do boleto");

  const ajustarCartao = async (vendaId: string, dia: string) => {
    const linhas = await prisma.cardReceivable.findMany({ where: { sale_id: vendaId } });
    if (linhas.length !== 1) throw new Error(`esperava 1 parcela de cartao na venda ${vendaId}, vieram ${linhas.length}`);
    await prisma.cardReceivable.update({
      where: { id: linhas[0].id },
      data: { expected_on: meioDia(dia), effective_on: meioDia(dia), net_amount: linhas[0].gross_amount, effective_net: linhas[0].gross_amount, fee_amount: 0 },
    });
  };
  await ajustarCartao(await vender(loja1, turno1, 200, { kind: "credito_vista", amount: 200 }, cCartao.id), hojeStr);
  await ajustarCartao(await vender(loja1, turno1, 150, { kind: "credito_vista", amount: 150 }, cCartao.id), ONTEM);
  // O Consumidor final (o cliente padrao da conta) nao vira link.
  const padrao =
    (await prisma.emporioCustomer.findFirst({ where: { tenant_id, system_key: "consumidor_final" } })) ??
    (await prisma.emporioCustomer.create({ data: { tenant_id, name: "Consumidor final", system_key: "consumidor_final" } as never }));
  await ajustarCartao(await vender(loja1, turno1, 60, { kind: "credito_vista", amount: 60 }, padrao.id), somaDias(hojeStr, 2));
  await vender(loja1, turno1, 45, { kind: "dinheiro", amount: 45 }, cCartao.id);

  // ----- a ficha do cliente (compras de 430: 340 na Loja 1 e 90 na Loja 2)
  await ajustarCartao(await vender(loja1, turno1, 100, { kind: "credito_vista", amount: 100 }, cFicha.id), somaDias(hojeStr, 2));
  await vender(loja1, turno1, 60, { kind: "pix", amount: 60 }, cFicha.id);
  await vender(loja1, turno1, 50, cheque("IA-K2", 50), cFicha.id);
  await vender(loja1, turno1, 30, cheque("IA-K3", 30), cFicha.id);
  await vender(loja1, turno1, 20, cheque("IA-K4", 20), cFicha.id);
  await prisma.emporioCheck.updateMany({
    where: { tenant_id, number: "IA-K3" },
    data: { good_for: meioDia(ONTEM), status: "compensado", cleared_at: brt(ONTEM, "15:00"), bank_account_id: conta },
  });
  await prisma.emporioCheck.updateMany({
    where: { tenant_id, number: "IA-K4" },
    data: { good_for: meioDia(ONTEM), status: "devolvido", returned_at: new Date(), return_reason: "Sem fundos" },
  });
  await fiado(loja2, turno2, 90, 10, cFicha.id);
  await fiado(loja1, turno1, 80, -1, cFicha.id);

  // ----- a Loja 2: so o que o Gestor da Loja 1 nao pode ver
  await fiado(loja2, turno2, 70, -1, cLoja2.id);

  // ----- A pagar
  const avulsa = async (descricao: string, valor: number, venc: string, loja: string, opcoes: { fornecedor?: string; paga?: boolean } = {}) =>
    exigir(
      await desp.criarContaAvulsaAction(db, dono, {
        establishment_id: loja,
        description: `${PREFIXO}${descricao}`,
        amount: valor,
        due_date: new Date(`${venc}T00:00:00Z`),
        status: opcoes.paga ? "paid" : "pending",
        ...(opcoes.fornecedor ? { emporio_supplier_id: opcoes.fornecedor } : {}),
        ...(opcoes.paga ? { paid_at: new Date(`${ONTEM}T00:00:00Z`), from: { bank_account_id: conta } } : {}),
      } as never),
      `conta ${descricao}`,
    );
  await avulsa("Conta vencida", 70, ONTEM, loja1, { fornecedor: fornecedor.id });
  await avulsa("Conta de hoje", 80, hojeStr, loja1);
  await avulsa("Conta de amanha", 90, somaDias(hojeStr, 1), loja1);
  await avulsa("Conta paga", 60, ONTEM, loja1, { fornecedor: fornecedor.id, paga: true });
  await avulsa("Conta da Loja 2", 100, somaDias(hojeStr, 5), loja2);

  // As configurações são da conta inteira: devolve o padrão (15 dias) para não deixar a ficha dos outros
  // cenários "Em dia" com fiado vencido (o manual quebrou assim em 17/11).
  await restaurarConfiguracoes(tenant_id);

  console.log("Conta do seed:", tenant_id, "(hoje:", hojeStr + ", ontem:", ONTEM + ")");
  console.log("Lojas:", loja1, loja2, "Gestor:", EMAIL_GESTOR, "Ficha:", cFicha.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
