import "dotenv/config";
import { cancelMovement } from "@/lib/actions/herd-ledger";
import { getDre } from "@/lib/actions/financial-reports";
import { negotiationCreateSchema } from "@/lib/validation/negotiation";
import { createContact, listContacts, findOrCreateContact } from "@/lib/actions/contacts";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { getPositions, recordMovement } from "@/lib/actions/herd-ledger";
import {
  cancelNegotiation,
  getOpenTotals,
  situacaoLabel,
  createCattleNegotiation,
  getNegotiation,
  listNegotiations,
} from "@/lib/actions/negotiations";

/**
 * Área Negociações, missão 1: negócio de gado.
 *
 * A decisão central que este teste protege: a Negociação é um ENVELOPE, não a
 * fonte da verdade. O saldo do rebanho continua sendo a soma de HerdMovement e
 * o dinheiro continua em FinancialEntry; a negociação amarra os dois e guarda o
 * que é comercial. Se algum dia alguém gravar saldo aqui, os testes de soma
 * abaixo quebram.
 *
 * Roda: `npm run test:m35`
 */

let falhas = 0;
/**
 * Ordem `(condição, nome)`, igual ao `assert` do m33. **Atenção: o m34 e o m36
 * usam a ordem INVERSA**, `(nome, condição)`, seguindo o padrão mais comum do
 * repositório. As duas convivem, e a afirmação anterior deste comentário
 * ("igual ao m33 e m34") estava errada.
 *
 * Por que isso merece um aviso: este helper nasceu na ordem trocada e 42 das 43
 * verificações passaram a receber uma string não vazia como condição, ou seja,
 * passavam SEMPRE, sem verificar nada. Quem pegou foi o `tsc`, que é o que
 * continua protegendo as duas ordens hoje: `boolean` e `string` não se
 * confundem em silêncio. Ao copiar um bloco de teste de um arquivo para o
 * outro, confira a ordem antes de confiar no verde.
 */
function check(cond: boolean, nome: string, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.error(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function main() {
  console.log("🤝 Negociações, missão 1: negócio de gado\n");

  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "M35 Negoc", document: `35${stamp}0`, plan: "fazenda" },
  });

  try {
    const db = prismaForTenant(tenant.id);
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda Boa Sorte" }) });
    const contato = await db.contact.create({
      data: scoped({ name: "João da Ponte", type: "fazendeiro", city: "Unaí" }),
    });

    // Saldo de partida, para as vendas terem de onde sair.
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 50,
      to: {
        category_id: "femea_36_mais",
        property_id: fazenda.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-01"),
    });

    const saldoDe = async (categoria: string) => {
      const pos = await getPositions(db, {
        category_id: categoria,
        property_id: fazenda.id,
        owner: "proprio",
      });
      return pos.reduce((s, p) => s + p.quantity, 0);
    };

    console.log("1. §6: compra de gado à vista");
    const compra = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      contact_id: contato.id,
      itens: [{ category_id: "bezerro_0_7", quantity: 20 }],
      amount: 60000,
      pago: true,
      occurred_at: new Date("2026-02-01"),
    });
    check(compra.ok, "compra registrada", !compra.ok ? compra.message : "");
    if (!compra.ok) throw new Error("sem a compra o resto não faz sentido");

    check(
      (await saldoDe("bezerro_0_7")) === 20,
      "os 20 bezerros entraram no rebanho (§6.4)",
      String(await saldoDe("bezerro_0_7")),
    );

    const detalheCompra = await getNegotiation(db, compra.data.id);
    check(detalheCompra?.movimentos.length === 1, "a negociação aponta para 1 movimento");
    check(
      detalheCompra?.movimentos[0]?.movement_type === "compra",
      "o movimento é do tipo compra",
    );
    check(detalheCompra?.lancamentos.length === 1, "gerou 1 lançamento financeiro");
    check(
      detalheCompra?.lancamentos[0]?.entry_type === "expense" &&
        detalheCompra.lancamentos[0].status === "paid",
      "despesa, e já paga porque o pagamento foi à vista (§6.3)",
    );
    check(detalheCompra?.situacao === "paga", `situação derivada = paga (obtida: ${detalheCompra?.situacao})`);

    console.log("\n2. §6.3 e §14: compra a prazo, em parcelas");
    const aPrazo = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "macho_13_24", quantity: 10 }],
      amount: 45000,
      pago: false,
      parcelas: [
        { due_date: new Date("2026-03-10"), amount: 15000 },
        { due_date: new Date("2026-04-10"), amount: 15000 },
        { due_date: new Date("2026-05-10"), amount: 15000 },
      ],
      occurred_at: new Date("2026-02-10"),
    });
    check(aPrazo.ok, "compra a prazo registrada", !aPrazo.ok ? aPrazo.message : "");
    if (aPrazo.ok) {
      const d = await getNegotiation(db, aPrazo.data.id);
      check(d?.lancamentos.length === 3, `3 contas a pagar (obtido: ${d?.lancamentos.length})`);
      check(
        !!d?.lancamentos.every((l) => l.status === "pending"),
        "todas pendentes: viram conta a pagar",
      );
      check(
        d?.totais.principal === 45000,
        `soma das parcelas = valor da operação (obtido: ${d?.totais.principal})`,
      );
      check(
        d?.situacao === "vencida",
        `nenhuma paga e as parcelas ja venceram: "vencida" (§14) (obtida: ${d?.situacao})`,
      );
    }

    console.log("\n3. §14: soma das parcelas diferente do valor é RECUSADA");
    const somaErrada = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "macho_13_24", quantity: 5 }],
      amount: 30000,
      pago: false,
      parcelas: [
        { due_date: new Date("2026-03-10"), amount: 10000 },
        { due_date: new Date("2026-04-10"), amount: 10000 },
      ],
    });
    check(!somaErrada.ok, "recusa quando a soma das parcelas não bate");
    const negociacoesDepois = await listNegotiations(db, {}, { limit: 100 });
    check(
      !negociacoesDepois.items.some((n) => Number(n.amount) === 30000),
      "e NADA foi gravado: a recusa é atômica",
    );

    console.log("\n4. §15: custos adicionais são lançamentos próprios");
    const comCustos = await createCattleNegotiation(db, {
      type: "venda_gado",
      property_id: fazenda.id,
      contact_id: contato.id,
      itens: [{ category_id: "femea_36_mais", quantity: 10 }],
      amount: 80000,
      pago: true,
      custos: [
        { descricao: "Comissão", amount: 4000 },
        { descricao: "Frete", amount: 1500 },
      ],
      occurred_at: new Date("2026-02-20"),
    });
    check(comCustos.ok, "venda com custos registrada", !comCustos.ok ? comCustos.message : "");
    if (comCustos.ok) {
      const d = await getNegotiation(db, comCustos.data.id);
      check(d?.totais.principal === 80000, "principal é o valor combinado");
      check(d?.totais.custos === 5500, `custos somam 5500 (obtido: ${d?.totais.custos})`);
      check(
        d?.totais.liquido === 74500,
        `líquido da venda = 74.500, como no exemplo do §15 (obtido: ${d?.totais.liquido})`,
      );
      check(
        d?.lancamentos.filter((l) => l.negotiation_role === "custo_adicional").length === 2,
        "os dois custos são lançamentos filhos, não campos",
      );
      check(
        !!d?.lancamentos.some((l) => l.negotiation_role === "custo_adicional" && l.entry_type === "expense"),
        "custo entra como DESPESA, então aparece no DRE",
      );
    }

    console.log("\n5. §7: venda reduz o rebanho");
    check(
      (await saldoDe("femea_36_mais")) === 40,
      `50 - 10 = 40 (obtido: ${await saldoDe("femea_36_mais")})`,
    );

    console.log("\n6. §7.5: venda acima do disponível é recusada, e não grava nada");
    const antes = await listNegotiations(db, {}, { limit: 100 });
    const vendaDemais = await createCattleNegotiation(db, {
      type: "venda_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "femea_36_mais", quantity: 999 }],
      amount: 100000,
      pago: true,
    });
    check(!vendaDemais.ok, "venda de 999 com 40 no saldo é recusada");
    check(
      !vendaDemais.ok && vendaDemais.message.includes("Revise a quantidade informada"),
      `mensagem é a do documento (obtida: ${!vendaDemais.ok ? vendaDemais.message : ""})`,
    );
    const depois = await listNegotiations(db, {}, { limit: 100 });
    check(
      antes.total === depois.total,
      `ATOMICIDADE: nenhuma negociação órfã (antes ${antes.total}, depois ${depois.total})`,
    );
    check((await saldoDe("femea_36_mais")) === 40, "e o saldo não se mexeu");

    console.log("\n7. §17.9: cancelar a negociação cancela os filhos");
    const paraCancelar = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "bezerra_0_7", quantity: 8 }],
      amount: 20000,
      // Em aberto de propósito: este bloco testa a volta do rebanho. Negócio
      // já pago tem trava própria, exercitada no bloco 8.b.
      pago: false,
    });
    check(paraCancelar.ok, "compra a ser cancelada registrada");
    if (paraCancelar.ok) {
      check((await saldoDe("bezerra_0_7")) === 8, "as 8 entraram");
      const cancel = await cancelNegotiation(db, paraCancelar.data.id, "comprei errado");
      check(cancel.ok, "cancelamento aceito", !cancel.ok ? cancel.message : "");
      check((await saldoDe("bezerra_0_7")) === 0, "o rebanho voltou ao que era");

      const d = await getNegotiation(db, paraCancelar.data.id);
      check(d?.situacao === "cancelada", "situação derivada vira cancelada");
      check(
        (d?.movimentos.length ?? 0) > 0 && !!d?.movimentos.every((m) => m.canceled_at !== null),
        `os movimentos filhos ficaram cancelados (${d?.movimentos.length ?? 0} movimento(s))`,
      );
      check(
        (d?.lancamentos.length ?? 0) > 0 && !!d?.lancamentos.every((l) => l.status === "cancelled"),
        `os lançamentos filhos ficaram cancelados (${d?.lancamentos.length ?? 0} lançamento(s))`,
      );
      check(!!d, "a negociação continua no histórico, não foi apagada (§17.10)");
    }

    console.log("\n8. §17.9: cancelar é bloqueado quando os animais já saíram");
    const compraUsada = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "macho_25_36", quantity: 10 }],
      amount: 30000,
      pago: false,
    });
    if (compraUsada.ok) {
      await createCattleNegotiation(db, {
        type: "venda_gado",
        property_id: fazenda.id,
        itens: [{ category_id: "macho_25_36", quantity: 8 }],
        amount: 28000,
        pago: true,
      });
      const bloqueado = await cancelNegotiation(db, compraUsada.data.id, "tentando desfazer");
      check(!bloqueado.ok, "recusa: 8 dos 10 já foram vendidos");
      check(
        !bloqueado.ok &&
          bloqueado.code === "INSUFFICIENT_BALANCE" &&
          bloqueado.message.includes("10") &&
          bloqueado.message.includes("2"),
        `explica quantos trouxe e quantos restam (obtida: ${!bloqueado.ok ? bloqueado.message : ""})`,
      );
      check((await saldoDe("macho_25_36")) === 2, "o saldo continua intacto depois da recusa");
    }

    console.log("\n9. §16: situação parcialmente paga é DERIVADA");
    const parcial = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "femea_8_12", quantity: 4 }],
      amount: 20000,
      pago: false,
      parcelas: [
        { due_date: new Date("2026-06-10"), amount: 10000 },
        { due_date: new Date("2026-07-10"), amount: 10000 },
      ],
    });
    if (parcial.ok) {
      const antesDoPagamento = await getNegotiation(db, parcial.data.id);
      check(
        antesDoPagamento?.situacao === "vencida",
        `sem pagar nada e com parcela vencida: "vencida" (obtida: ${antesDoPagamento?.situacao})`,
      );

      const primeira = antesDoPagamento!.lancamentos[0];
      await db.financialEntry.update({
        where: { id: primeira.id },
        data: { status: "paid", paid_at: new Date() },
      });
      const meioPago = await getNegotiation(db, parcial.data.id);
      check(
        meioPago?.situacao === "vencida",
        `uma paga e a outra vencida: "vencida" vence sobre "parcialmente paga", porque e a unica que pede acao hoje (obtida: ${meioPago?.situacao})`,
      );

      await db.financialEntry.updateMany({
        where: { negotiation_id: parcial.data.id, negotiation_role: "principal" },
        data: { status: "paid", paid_at: new Date() },
      });
      const tudoPago = await getNegotiation(db, parcial.data.id);
      check(tudoPago?.situacao === "paga", `todas pagas: paga (obtida: ${tudoPago?.situacao})`);
    }

    console.log("\n10. Nenhuma coluna de situação gravada");
    const cru = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'Negotiation'`,
    );
    const colunas = cru.map((c) => c.column_name);
    check(
      !colunas.includes("status") && !colunas.includes("situacao"),
      `situação é derivada, não gravada (colunas: ${colunas.join(", ")})`,
    );

    console.log("\n12. Caminhos de ERRO: cada recusa da action, uma a uma");
    // Um juiz independente apontou que ~10 ramos de recusa existiam no código e
    // nenhum era exercitado. Testar só o caminho feliz deixa a mensagem de erro,
    // que é justamente o que o produtor lê quando algo dá errado, sem nenhuma
    // prova de que chega até ele.
    const base = {
      type: "compra_gado" as const,
      property_id: fazenda.id,
      itens: [{ category_id: "bezerro_0_7", quantity: 5 }],
      amount: 10000,
    };

    const semValor = await createCattleNegotiation(db, { ...base, amount: 0 });
    check(!semValor.ok && semValor.code === "VALIDATION_ERROR", "valor zero é recusado");

    const valorNegativo = await createCattleNegotiation(db, { ...base, amount: -1 });
    check(!valorNegativo.ok, "valor negativo é recusado");

    const semItens = await createCattleNegotiation(db, { ...base, itens: [] });
    check(!semItens.ok && semItens.message.includes("categoria"), "sem itens é recusado");

    const quantidadeQuebrada = await createCattleNegotiation(db, {
      ...base,
      itens: [{ category_id: "bezerro_0_7", quantity: 2.5 }],
    });
    check(!quantidadeQuebrada.ok, "quantidade fracionada de animal é recusada");

    const quantidadeZero = await createCattleNegotiation(db, {
      ...base,
      itens: [{ category_id: "bezerro_0_7", quantity: 0 }],
    });
    check(!quantidadeZero.ok, "quantidade zero é recusada");

    const fazendaInvalida = await createCattleNegotiation(db, { ...base, property_id: "nao-existe" });
    check(
      !fazendaInvalida.ok && fazendaInvalida.code === "INVALID_PROPERTY",
      `fazenda inexistente é recusada (${!fazendaInvalida.ok ? fazendaInvalida.code : "ACEITOU"})`,
    );

    const contatoInvalido = await createCattleNegotiation(db, { ...base, contact_id: "nao-existe" });
    check(
      !contatoInvalido.ok && contatoInvalido.code === "INVALID_CONTACT",
      `contato inexistente é recusado (${!contatoInvalido.ok ? contatoInvalido.code : "ACEITOU"})`,
    );

    const custoNegativo = await createCattleNegotiation(db, {
      ...base,
      custos: [{ descricao: "Frete", amount: -100 }],
    });
    check(
      !custoNegativo.ok && custoNegativo.message.includes("negativo"),
      "custo adicional negativo é recusado",
    );

    const parcelaZerada = await createCattleNegotiation(db, {
      ...base,
      pago: false,
      parcelas: [
        { due_date: new Date("2026-09-10"), amount: 10000 },
        { due_date: new Date("2026-10-10"), amount: 0 },
      ],
    });
    check(!parcelaZerada.ok, "parcela de valor zero é recusada");

    const pagoEParcelado = await createCattleNegotiation(db, {
      ...base,
      pago: true,
      parcelas: [{ due_date: new Date("2026-09-10"), amount: 10000 }],
    });
    check(
      !pagoEParcelado.ok && pagoEParcelado.message.includes("não pode ser parcelado"),
      "pago à vista E parcelado é contradição, e é recusado em vez de descartar as parcelas calado",
    );

    console.log("\n13. Cancelamento: os três jeitos de ser recusado");
    const inexistente = await cancelNegotiation(db, "nao-existe", "teste");
    check(
      !inexistente.ok && inexistente.code === "NOT_FOUND",
      "cancelar negociação inexistente devolve NOT_FOUND",
    );

    const paraCancelarDuasVezes = await createCattleNegotiation(db, {
      ...base,
      itens: [{ category_id: "bezerro_0_7", quantity: 3 }],
      amount: 5000,
      pago: false,
    });
    if (paraCancelarDuasVezes.ok) {
      const primeiro = await cancelNegotiation(db, paraCancelarDuasVezes.data.id, "certo");
      check(primeiro.ok, "primeiro cancelamento aceito");
      const segundo = await cancelNegotiation(db, paraCancelarDuasVezes.data.id, "de novo");
      check(
        !segundo.ok && segundo.code === "ALREADY_CANCELED",
        "cancelar duas vezes devolve ALREADY_CANCELED",
      );
    }

    // CANCELAR UM NEGÓCIO NÃO DES-GASTA O DINHEIRO.
    //
    // Duas versões erradas antecederam esta. A primeira marcava `cancelled` todo
    // lançamento, inclusive os `paid`: uma compra quitada em janeiro, cancelada
    // em março, sumia do DRE e do fluxo de caixa como se o dinheiro nunca
    // tivesse saído da conta. A segunda recusou o cancelamento inteiro quando
    // havia qualquer pago, e foi pior: o formulário nasce em "à vista", então o
    // caminho mais comum do módulo passou a gerar um registro que ninguém
    // conseguia desfazer, com uma mensagem mandando "desfazer o pagamento no
    // Financeiro", ação que a tela não oferece para lançamento pago.
    //
    // A resposta certa é contábil: os animais voltam, as contas em aberto somem,
    // e o que saiu da conta permanece lançado, porque saiu mesmo.
    const jaPaga = await createCattleNegotiation(db, {
      ...base,
      itens: [{ category_id: "bezerro_0_7", quantity: 4 }],
      amount: 8000,
      pago: true,
      custos: [{ descricao: "Frete", amount: 500 }],
    });
    if (jaPaga.ok) {
      const saldoAntes = await saldoDe("bezerro_0_7");
      const cancelado = await cancelNegotiation(db, jaPaga.data.id, "comprei errado");
      check(cancelado.ok, "negócio já pago PODE ser cancelado", !cancelado.ok ? cancelado.message : "");
      check(
        cancelado.ok && cancelado.data.valor_pago_mantido === 8500,
        `e devolve quanto continua lançado, para a tela avisar (obtido: ${cancelado.ok ? cancelado.data.valor_pago_mantido : "-"})`,
      );
      check(
        (await saldoDe("bezerro_0_7")) === saldoAntes - 4,
        "os animais voltaram do rebanho",
      );
      const depoisDoCancelamento = await getNegotiation(db, jaPaga.data.id);
      check(
        (depoisDoCancelamento?.lancamentos.length ?? 0) > 0 &&
          depoisDoCancelamento?.lancamentos.every((l) => l.status === "paid") === true,
        `o dinheiro que saiu continua lançado como pago (obtido: ${depoisDoCancelamento?.lancamentos.map((l) => l.status).join(", ")})`,
      );
      check(
        depoisDoCancelamento != null && depoisDoCancelamento.canceled_at instanceof Date,
        "e a negociação fica marcada como cancelada no histórico",
      );
    }

    // Já as contas em ABERTO somem, que é o outro lado da mesma regra.
    const abertaComParcela = await createCattleNegotiation(db, {
      ...base,
      itens: [{ category_id: "bezerro_0_7", quantity: 2 }],
      amount: 6000,
      pago: false,
    });
    if (abertaComParcela.ok) {
      await cancelNegotiation(db, abertaComParcela.data.id, "desfeito");
      const d = await getNegotiation(db, abertaComParcela.data.id);
      check(
        (d?.lancamentos.length ?? 0) > 0 &&
          d?.lancamentos.every((l) => l.status === "cancelled") === true,
        `conta em aberto de negócio cancelado some do financeiro (obtido: ${d?.lancamentos.map((l) => l.status).join(", ")})`,
      );
    }

    console.log("\n14. §6.3: vencimento informado, sem parcelamento");
    const comVencimento = await createCattleNegotiation(db, {
      ...base,
      itens: [{ category_id: "bezerro_0_7", quantity: 2 }],
      amount: 4000,
      pago: false,
      due_date: new Date("2026-12-20T12:00:00"),
      occurred_at: new Date("2026-08-13T12:00:00"),
    });
    if (comVencimento.ok) {
      const d = await getNegotiation(db, comVencimento.data.id);
      const principal = d?.lancamentos.find((l) => l.negotiation_role === "principal");
      check(
        principal?.due_date?.toISOString().slice(0, 10) === "2026-12-20",
        `a conta vence na data combinada, não no dia da compra (obtida: ${principal?.due_date?.toISOString().slice(0, 10)})`,
      );
      check(
        d?.situacao === "confirmada",
        `vencimento no futuro não é "vencida" (obtida: ${d?.situacao})`,
      );
    }

    console.log("\n20. O dinheiro já pago: as três saídas, todas na mesma tela");
    // Decisão do usuário (2026-08-13): correto contabilmente, mas sem obrigar
    // o produtor a um segundo passo no Financeiro.
    const comPagamento = async (quantidade: number, valor: number) =>
      await createCattleNegotiation(db, {
        ...base,
        itens: [{ category_id: "bezerro_0_7", quantity: quantidade }],
        amount: valor,
        pago: true,
      });

    const paraManter = await comPagamento(2, 4000);
    if (paraManter.ok) {
      const r = await cancelNegotiation(db, paraManter.data.id, "desfeito", "mantem");
      check(r.ok, "mantem: cancela");
      check(
        r.ok && r.data.valor_pago_mantido === 4000 && r.data.valor_estornado === 0,
        `mantem: o dinheiro continua lançado (mantido ${r.ok ? r.data.valor_pago_mantido : "-"})`,
      );
      const d = await getNegotiation(db, paraManter.data.id);
      check(
        d?.lancamentos.every((l) => l.status === "paid") === true,
        "mantem: a despesa segue paga, porque saiu mesmo",
      );
    }

    const paraDevolver = await comPagamento(2, 5000);
    if (paraDevolver.ok) {
      const r = await cancelNegotiation(db, paraDevolver.data.id, "vendedor devolveu", "devolvido");
      check(r.ok && r.data.valor_estornado === 5000, "devolvido: registra o estorno");
      const d = await getNegotiation(db, paraDevolver.data.id);
      const estorno = d?.lancamentos.find((l) => l.negotiation_role === "estorno");
      check(estorno != null, "devolvido: nasce um lançamento de estorno");
      check(
        estorno?.entry_type === "income",
        `devolvido: numa COMPRA o estorno é entrada (obtido: ${estorno?.entry_type})`,
      );
      check(
        d?.lancamentos.some((l) => l.negotiation_role === "principal" && l.status === "paid") === true,
        "devolvido: a despesa original NÃO é apagada, senão o mês em que o dinheiro saiu fecharia errado",
      );
    }

    const foiEngano = await comPagamento(2, 3000);
    if (foiEngano.ok) {
      const r = await cancelNegotiation(db, foiEngano.data.id, "digitei errado", "engano");
      check(r.ok && r.data.valor_pago_mantido === 0, "engano: nada continua lançado");
      const d = await getNegotiation(db, foiEngano.data.id);
      check(
        d?.lancamentos.every((l) => l.status === "cancelled") === true,
        `engano: o pagamento que nunca existiu some (obtido: ${d?.lancamentos.map((l) => l.status).join(", ")})`,
      );
      check(
        d?.lancamentos.every((l) => l.negotiation_role !== "estorno") === true,
        "engano: e NÃO inventa um estorno de dinheiro que nunca voltou",
      );
    }

    console.log("\n26. O que a TELA manda sobrevive à validação da rota");
    // O degrau em que um defeito real morou: o formulário passou a mandar
    // `contact_name` e o schema da rota não tinha esse campo, então o Zod
    // descartava a chave em silêncio. O nome digitado sumia entre a tela e o
    // banco, o formulário parecia funcionar e o contato nunca nascia. Nenhuma
    // suíte pegou, porque elas chamam a action direto e as rotas /api/v1 ficam
    // atrás de sessão.
    const corpoDaTela = {
      type: "compra_gado" as const,
      property_id: fazenda.id,
      contact_name: "Zé do Caminhão",
      itens: [{ category_id: "bezerro_0_7", quantity: 5 }],
      amount: 12000,
      occurred_at: new Date().toISOString(),
      pago: false,
      due_date: new Date("2027-01-10T12:00:00Z").toISOString(),
      parcelas: [],
      custos: [{ descricao: "Frete", amount: 500 }],
      notes: "teste",
    };
    const validado = negotiationCreateSchema.safeParse(corpoDaTela);
    check(validado.success, "o corpo que o formulário envia passa na validação");
    for (const campo of Object.keys(corpoDaTela) as (keyof typeof corpoDaTela)[]) {
      check(
        validado.success && campo in validado.data,
        `o campo "${campo}" sobrevive à validação, em vez de ser descartado calado`,
      );
    }

    console.log("\n25. Contato não fica órfão quando a negociação é recusada");
    // A criação do contato foi movida para DENTRO da transação com essa
    // justificativa, e a justificativa não tinha prova. É o mesmo lugar em que
    // uma afirmação sem prova já precisou ser corrigida antes.
    const contatosAntesDaRecusa = await db.contact.count();
    const vendaSemSaldoComContato = await createCattleNegotiation(db, {
      type: "venda_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "femea_36_mais", quantity: 99999 }],
      amount: 500000,
      contact_name: "Frigorífico Que Não Deve Existir",
      pago: false,
    });
    check(!vendaSemSaldoComContato.ok, "a venda sem saldo é recusada");
    check(
      (await db.contact.count()) === contatosAntesDaRecusa,
      `e o contato citado NÃO foi criado (${contatosAntesDaRecusa} -> ${await db.contact.count()})`,
    );
    check(
      (await db.contact.findFirst({ where: { name: "Frigorífico Que Não Deve Existir" } })) === null,
      "confirmado pelo nome: o rollback levou o contato junto",
    );

    console.log("\n22. VENDA com custos: estorno não pode somar receita com despesa");
    // O caso que quebrava. Numa venda o principal é RECEITA e os custos são
    // DESPESA; somar os dois com o mesmo sinal errava o estorno em exatamente
    // 2x os custos. Com o exemplo do §15 (venda 80.000, comissão 4.000, frete
    // 1.500) o estorno saía como despesa de 85.500 e o resultado ia para
    // -11.000, quando o certo é 0.
    const vendaComCustos = await createCattleNegotiation(db, {
      type: "venda_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "femea_36_mais", quantity: 5 }],
      amount: 80000,
      pago: true,
      custos: [
        { descricao: "Comissão", amount: 4000 },
        { descricao: "Frete", amount: 1500 },
      ],
    });
    if (vendaComCustos.ok) {
      const antesDeDesfazer = await getNegotiation(db, vendaComCustos.data.id);
      check(
        antesDeDesfazer?.situacao === "paga",
        `venda recebida com frete pago: "paga" (obtida: ${antesDeDesfazer?.situacao})`,
      );

      const r = await cancelNegotiation(db, vendaComCustos.data.id, "comprador desistiu", "devolvido");
      check(r.ok, "cancela com devolução", !r.ok ? r.message : "");
      const d = await getNegotiation(db, vendaComCustos.data.id);
      const estornos = d?.lancamentos.filter((l) => l.negotiation_role === "estorno") ?? [];

      const estornoDespesa = estornos.filter((l) => l.entry_type === "expense");
      const estornoReceita = estornos.filter((l) => l.entry_type === "income");
      check(
        estornoDespesa.reduce((s, l) => s + l.amount, 0) === 80000,
        `o que foi RECEBIDO volta como despesa de 80.000 (obtido: ${estornoDespesa.reduce((s, l) => s + l.amount, 0)})`,
      );
      check(
        estornoReceita.reduce((s, l) => s + l.amount, 0) === 5500,
        `o que foi PAGO em custos volta como receita de 5.500 (obtido: ${estornoReceita.reduce((s, l) => s + l.amount, 0)})`,
      );

      // A prova que importa: depois do estorno, o negócio não deixa resultado.
      const receitaLiquida =
        (d?.lancamentos ?? [])
          .filter((l) => l.status === "paid" && l.entry_type === "income")
          .reduce((s, l) => s + l.amount, 0) -
        (d?.lancamentos ?? [])
          .filter((l) => l.status === "paid" && l.entry_type === "expense")
          .reduce((s, l) => s + l.amount, 0);
      check(
        receitaLiquida === 0,
        `o negócio desfeito não deixa resultado nenhum (obtido: ${receitaLiquida})`,
      );
    }

    console.log("\n23. §16: venda recebida com frete EM ABERTO continua 'Recebida'");
    // O erro oposto, que a correção anterior tinha criado: numa venda, o frete
    // é despesa e não torna a venda "parcialmente recebida". Ele é uma conta a
    // pagar de verdade, e aparece em "Ainda tenho a pagar".
    const vendaComFreteAberto = await createCattleNegotiation(db, {
      type: "venda_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "femea_36_mais", quantity: 2 }],
      amount: 12000,
      pago: true,
      custos: [{ descricao: "Frete", amount: 900 }],
    });
    if (vendaComFreteAberto.ok) {
      // O frete nasce pago junto (pago: true). Deixa ele em aberto à mão, que é
      // o caso real: recebi a venda, o frete eu pago depois.
      const d0 = await getNegotiation(db, vendaComFreteAberto.data.id);
      const frete = d0?.lancamentos.find((l) => l.negotiation_role === "custo_adicional");
      await prisma.financialEntry.update({
        where: { id: frete!.id },
        data: { status: "pending", paid_at: null },
      });
      const d = await getNegotiation(db, vendaComFreteAberto.data.id);
      check(
        d?.situacao === "paga",
        `venda inteiramente recebida continua "paga", mesmo com frete em aberto (obtida: ${d?.situacao})`,
      );
    }

    console.log("\n24. §16: COMPRA com frete em aberto NÃO está quitada");
    // E o outro lado da mesma regra: numa compra tudo é despesa, então o frete
    // em aberto significa que ainda há o que pagar.
    const compraComFreteAberto = await createCattleNegotiation(db, {
      type: "compra_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "bezerro_0_7", quantity: 2 }],
      amount: 5000,
      pago: true,
      custos: [{ descricao: "Frete", amount: 700 }],
    });
    if (compraComFreteAberto.ok) {
      const d0 = await getNegotiation(db, compraComFreteAberto.data.id);
      const frete = d0?.lancamentos.find((l) => l.negotiation_role === "custo_adicional");
      await prisma.financialEntry.update({
        where: { id: frete!.id },
        data: { status: "pending", paid_at: null, due_date: new Date("2027-06-01") },
      });
      const d = await getNegotiation(db, compraComFreteAberto.data.id);
      check(
        d?.situacao === "parcialmente_paga",
        `compra com frete em aberto não é "Quitada" (obtida: ${d?.situacao})`,
      );
    }

    console.log("\n21. Negócio cancelado sai do RESULTADO DO MÊS");
    // Bug real e anterior a este módulo: `getDre` filtrava só por data, sem
    // olhar status, então um lançamento `cancelled` continuava pesando no
    // "Resultado do mês" do Financeiro. Ficou latente enquanto cancelar era
    // raro; este módulo tornou isso o caminho comum, porque cancelar uma
    // negociação cancela as contas em aberto dela.
    const inicioDoMes = new Date();
    inicioDoMes.setDate(1);
    inicioDoMes.setHours(0, 0, 0, 0);
    const fimDoMes = new Date(inicioDoMes.getFullYear(), inicioDoMes.getMonth() + 1, 0, 23, 59, 59);

    const dreAntes = await getDre(db, { start: inicioDoMes, end: fimDoMes });
    const rebanhoAntes = dreAntes.by_module.find((m) => m.module === "rebanho")!.total_expense;

    const paraSairDoDre = await createCattleNegotiation(db, {
      ...base,
      itens: [{ category_id: "bezerro_0_7", quantity: 4 }],
      amount: 40000,
      pago: false,
      due_date: new Date(),
    });
    if (paraSairDoDre.ok) {
      const dreComNegocio = await getDre(db, { start: inicioDoMes, end: fimDoMes });
      check(
        dreComNegocio.by_module.find((m) => m.module === "rebanho")!.total_expense ===
          rebanhoAntes + 40000,
        "a compra a prazo entra no resultado do mês por competência (§ DRE)",
      );

      await cancelNegotiation(db, paraSairDoDre.data.id, "desfeito");
      const dreDepois = await getDre(db, { start: inicioDoMes, end: fimDoMes });
      check(
        dreDepois.by_module.find((m) => m.module === "rebanho")!.total_expense === rebanhoAntes,
        `e SAI quando o negócio é cancelado (antes ${rebanhoAntes}, depois ${dreDepois.by_module.find((m) => m.module === "rebanho")!.total_expense})`,
      );
    }

    console.log("\n15. §16: o rótulo depende do TIPO, não só da situação");
    // Já houve inversão de sinal aqui: uma venda em aberto aparecia como
    // "A pagar", na única coluna que o produtor lê de relance.
    check(situacaoLabel("confirmada", false) === "A pagar", "compra em aberto: A pagar");
    check(situacaoLabel("confirmada", true) === "A receber", "venda em aberto: A receber");
    check(situacaoLabel("paga", false) === "Quitada", "compra paga: Quitada");
    check(situacaoLabel("paga", true) === "Recebida", "venda paga: Recebida");
    check(
      situacaoLabel("parcialmente_paga", true) === "Parcialmente recebida",
      "venda parcial: Parcialmente recebida (§16)",
    );
    check(situacaoLabel("vencida", true) === "Vencida", "vencida é vencida nos dois lados");

    console.log("\n16. §16: parcialmente paga, com vencimentos no FUTURO");
    // O bloco 9 usa parcelas já vencidas, então lá o resultado é "vencida" e o
    // ramo "parcialmente_paga" nunca era exercitado, apesar de ser um dos cinco
    // estados que o §16 exige.
    const doisAnosAFrente = new Date();
    doisAnosAFrente.setFullYear(doisAnosAFrente.getFullYear() + 2);
    const outroAno = new Date(doisAnosAFrente);
    outroAno.setMonth(outroAno.getMonth() + 1);

    const parcialFuturo = await createCattleNegotiation(db, {
      ...base,
      itens: [{ category_id: "bezerro_0_7", quantity: 2 }],
      amount: 10000,
      pago: false,
      parcelas: [
        { due_date: doisAnosAFrente, amount: 5000 },
        { due_date: outroAno, amount: 5000 },
      ],
    });
    if (parcialFuturo.ok) {
      const antesDePagar = await getNegotiation(db, parcialFuturo.data.id);
      check(
        antesDePagar?.situacao === "confirmada",
        `nada pago e nada vencido: confirmada (obtida: ${antesDePagar?.situacao})`,
      );
      const primeira = antesDePagar?.lancamentos.find((l) => l.negotiation_role === "principal");
      await prisma.financialEntry.update({
        where: { id: primeira!.id },
        data: { status: "paid", paid_at: new Date() },
      });
      const meioPagoFuturo = await getNegotiation(db, parcialFuturo.data.id);
      check(
        meioPagoFuturo?.situacao === "parcialmente_paga",
        `uma paga, a outra ainda no prazo: parcialmente_paga (obtida: ${meioPagoFuturo?.situacao})`,
      );
    }

    console.log("\n17. Os dois números do topo somam TUDO, não só a página");
    const totais = await getOpenTotals(db);
    const pendentes = await db.financialEntry.findMany({
      where: { status: "pending", negotiation: { canceled_at: null } },
      select: { amount: true, entry_type: true },
    });
    const esperadoPagar = pendentes
      .filter((l) => l.entry_type === "expense")
      .reduce((s, l) => s + Number(l.amount), 0);
    const esperadoReceber = pendentes
      .filter((l) => l.entry_type === "income")
      .reduce((s, l) => s + Number(l.amount), 0);
    check(
      Math.round(totais.aPagar * 100) === Math.round(esperadoPagar * 100),
      `"ainda tenho a pagar" bate com o banco (${totais.aPagar} vs ${esperadoPagar})`,
    );
    check(
      Math.round(totais.aReceber * 100) === Math.round(esperadoReceber * 100),
      `"ainda tenho a receber" bate com o banco (${totais.aReceber} vs ${esperadoReceber})`,
    );
    // A comparação acima usa a MESMA consulta da implementação, então prova
    // pouco sozinha: o que ela pega é a paginação. O ramo de receita precisa de
    // um valor de verdade, senão "0 vs 0" passa sem nunca ter sido exercitado.
    const vendaEmAberto = await createCattleNegotiation(db, {
      type: "venda_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "femea_36_mais", quantity: 3 }],
      amount: 21000,
      pago: false,
      due_date: new Date("2027-01-15"),
    });
    if (vendaEmAberto.ok) {
      const comReceita = await getOpenTotals(db);
      check(
        Math.round((comReceita.aReceber - totais.aReceber) * 100) === Math.round(21000 * 100),
        `uma venda em aberto soma exatamente em "a receber" (${totais.aReceber} -> ${comReceita.aReceber})`,
      );
      check(
        comReceita.aPagar === totais.aPagar,
        "e NÃO vaza para 'a pagar', que é o erro que a separação por entry_type evita",
      );
      await cancelNegotiation(db, vendaEmAberto.data.id, "limpando o teste");
      const depoisDeCancelar = await getOpenTotals(db);
      check(
        Math.round(depoisDeCancelar.aReceber * 100) === Math.round(totais.aReceber * 100),
        "e negócio cancelado sai da conta, em vez de continuar prometendo dinheiro",
      );
    }

    console.log("\n18. Movimento de negócio não se desfaz pela porta do rebanho");
    const comMovimento = await createCattleNegotiation(db, {
      ...base,
      itens: [{ category_id: "bezerro_0_7", quantity: 3 }],
      amount: 6000,
      pago: false,
    });
    if (comMovimento.ok) {
      const detalhe = await getNegotiation(db, comMovimento.data.id);
      const movimentoId = detalhe!.movimentos[0].id;
      const porFora = await cancelMovement(db, movimentoId, "tentando por fora");
      check(
        !porFora.ok && porFora.code === "BELONGS_TO_NEGOTIATION",
        `recusa e aponta o caminho certo (${!porFora.ok ? porFora.code : "ACEITOU"})`,
      );
      check(
        !porFora.ok && porFora.message.includes("Negociações"),
        `e diz ONDE cancelar (obtida: ${!porFora.ok ? porFora.message : ""})`,
      );
      const intacta = await getNegotiation(db, comMovimento.data.id);
      check(
        intacta?.movimentos.every((m) => m.canceled_at === null) === true,
        "o movimento continua valendo depois da recusa",
      );
    }

    console.log("\n19. Contatos (§4 e §5)");
    const criado = await createContact(db, { name: "Frigorífico Boi Bom", type: "frigorifico" });
    check(criado.ok, "cria com nome e tipo");
    const soNome = await createContact(db, { name: "Zé da Ponte" });
    check(soNome.ok, "cria só com o nome, sem tipo (§4)");
    const lista = await listContacts(db);
    check(lista.length >= 2, `lista devolve os dois (${lista.length})`);
    const filtrada = await listContacts(db, { type: "frigorifico" });
    check(
      filtrada.length === 1 && filtrada[0].name === "Frigorífico Boi Bom",
      `filtro por tipo funciona (${filtrada.length})`,
    );
    const achado = await findOrCreateContact(db, "zé da ponte");
    check(
      !achado.criado && soNome.ok && achado.id === soNome.data.id,
      "acha o mesmo contato escrito em outra caixa, em vez de duplicar",
    );

    console.log("\n11. Isolamento multi-tenant");
    const tenantB = await prisma.tenant.create({
      data: { name: "M35 Negoc B", document: `35${stamp}1`, plan: "fazenda" },
    });
    try {
      const dbB = prismaForTenant(tenantB.id);
      const listaB = await listNegotiations(dbB, {}, { limit: 100 });
      check(listaB.total === 0, "tenant B não enxerga negociação do tenant A");
      const espiar = await getNegotiation(dbB, compra.data.id);
      check(espiar === null, "tenant B não abre negociação do tenant A pelo id");
    } finally {
      await prisma.tenant.deleteMany({ where: { id: tenantB.id } });
    }
  } finally {
    await prisma.financialEntry.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.herdMovement.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.negotiation.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.contact.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.property.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }

  console.log("");
  console.log(
    falhas === 0
      ? "✅ Negociação de gado: 0 falhas."
      : `❌ Negociação de gado: ${falhas} falha(s).`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
