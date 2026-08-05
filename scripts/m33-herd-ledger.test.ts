import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import {
  cancelMovement,
  getPeriodTotals,
  getPositions,
  listMovements,
  recordMovement,
} from "@/lib/actions/herd-ledger";

/**
 * Módulo 30, tarefa 3: o livro-razão em si.
 *
 * `getPositions` soma as movimentações não canceladas por posição
 * (categoria x fazenda x pasto x situação x dono); `recordMovement` valida e
 * grava, usando `getPositions` para bloquear saldo negativo (§10.3).
 *
 * Roda: `npm run test:m33`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
  } else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

async function main() {
  console.log("📒 Módulo 30: livro-razão do rebanho (getPositions + recordMovement)\n");

  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "M33 Ledger", document: `33${stamp}0`, plan: "fazenda" },
  });

  try {
    const db = prismaForTenant(tenant.id);
    const propA = await db.property.create({ data: scoped({ name: "Fazenda A" }) });
    const propB = await db.property.create({ data: scoped({ name: "Fazenda B" }) });
    const pastoSede = await db.pasture.create({
      data: scoped({ property_id: propA.id, name: "Pasto da Sede", area_hectares: 10 }),
    });
    const pastoBaixada = await db.pasture.create({
      data: scoped({ property_id: propA.id, name: "Pasto da Baixada", area_hectares: 8 }),
    });

    console.log("1. getPositions com o livro vazio");
    const vazio = await getPositions(db);
    assert(vazio.length === 0, "nenhuma posição sem movimentação nenhuma");

    console.log("\n2. saldo_inicial (§10, §16 critério 1)");
    const inicial = await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 18,
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-01"),
    });
    assert(inicial.ok, `saldo inicial registrado (${!inicial.ok ? inicial.message : ""})`);

    const posInicial = await getPositions(db, {
      category_id: "bezerro_0_7",
      property_id: propA.id,
      situation: "presente",
      owner: "proprio",
    });
    assert(
      posInicial.length === 1 && posInicial[0].quantity === 18,
      `posição reflete os 18 do saldo inicial (obtido: ${JSON.stringify(posInicial)})`,
    );

    console.log("\n3. compra soma, e gera FinancialEntry quando há valor (§10, decisão 7)");
    const compra = await recordMovement(db, {
      movement_type: "compra",
      quantity: 5,
      value: 15000,
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-05"),
    });
    assert(compra.ok, "compra registrada");
    if (compra.ok) {
      assert(compra.data.financial_entry_id !== null, "compra com valor gera lançamento financeiro");
      const entry = await db.financialEntry.findFirst({ where: { id: compra.data.financial_entry_id! } });
      assert(
        !!entry && entry.entry_type === "expense" && Number(entry.amount) === 15000,
        "lançamento é despesa de 15000",
      );
    }

    const posAposCompra = await getPositions(db, {
      category_id: "bezerro_0_7",
      property_id: propA.id,
      situation: "presente",
      owner: "proprio",
    });
    assert(posAposCompra[0]?.quantity === 23, `18 + 5 = 23 (obtido: ${posAposCompra[0]?.quantity})`);

    console.log("\n4. nascimento não gera financeiro (§10.4)");
    const nascimento = await recordMovement(db, {
      movement_type: "nascimento",
      quantity: 3,
      to: {
        category_id: "bezerra_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-10"),
    });
    assert(nascimento.ok && nascimento.data.financial_entry_id === null, "nascimento sem lançamento financeiro");

    console.log("\n5. venda reduz e bloqueia saldo negativo (§10.3, critério 14)");
    const vendaOk = await recordMovement(db, {
      movement_type: "venda",
      quantity: 4,
      value: 8000,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-15"),
    });
    assert(vendaOk.ok, "venda dentro do saldo é aceita");
    const posAposVenda = await getPositions(db, {
      category_id: "bezerro_0_7",
      property_id: propA.id,
      situation: "presente",
      owner: "proprio",
    });
    assert(posAposVenda[0]?.quantity === 19, `23 - 4 = 19 (obtido: ${posAposVenda[0]?.quantity})`);

    const vendaDemais = await recordMovement(db, {
      movement_type: "venda",
      quantity: 100,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-16"),
    });
    assert(!vendaDemais.ok, "venda de 100 quando só há 19 é recusada");
    assert(
      !vendaDemais.ok && vendaDemais.message === "Existem apenas 19 animais nesta categoria. Revise a quantidade informada.",
      `mensagem é a literal do cliente com o número certo (obtida: "${!vendaDemais.ok ? vendaDemais.message : ""}")`,
    );
    const posAposRecusa = await getPositions(db, {
      category_id: "bezerro_0_7",
      property_id: propA.id,
      situation: "presente",
      owner: "proprio",
    });
    assert(
      posAposRecusa[0]?.quantity === 19,
      "a tentativa recusada não gravou nada (saldo continua 19)",
    );

    console.log("\n6. morte reduz sem financeiro (§10.5)");
    const morte = await recordMovement(db, {
      movement_type: "morte",
      quantity: 1,
      reason: "doenca",
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-20"),
    });
    assert(morte.ok && morte.data.financial_entry_id === null, "morte registrada sem lançamento financeiro");

    console.log("\n7. transferência entre pastos não muda o total (§8.5)");
    const transferPasto = await recordMovement(db, {
      movement_type: "transferencia_pasto",
      quantity: 10,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: pastoBaixada.id,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-21"),
    });
    assert(transferPasto.ok, "transferência entre pastos aceita");
    const totalFazendaDepoisTransfPasto = await getPositions(db, {
      category_id: "bezerro_0_7",
      property_id: propA.id,
      situation: "presente",
      owner: "proprio",
    });
    const totalNaFazenda = totalFazendaDepoisTransfPasto.reduce((s, p) => s + p.quantity, 0);
    assert(totalNaFazenda === 18, `total na fazenda inalterado (18, obtido: ${totalNaFazenda})`);
    const noPastoBaixada = totalFazendaDepoisTransfPasto.find((p) => p.pasture_id === pastoBaixada.id);
    assert(noPastoBaixada?.quantity === 10, `10 animais no Pasto da Baixada (obtido: ${noPastoBaixada?.quantity})`);

    console.log("\n8. transferência entre fazendas não muda o total geral (§8.6)");
    const transferFazenda = await recordMovement(db, {
      movement_type: "transferencia_fazenda",
      quantity: 6,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      to: {
        category_id: "bezerro_0_7",
        property_id: propB.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-01-22"),
    });
    assert(transferFazenda.ok, "transferência entre fazendas aceita");
    const totalGeral = await getPositions(db, {
      category_id: "bezerro_0_7",
      situation: "presente",
      owner: "proprio",
    });
    const somaGeral = totalGeral.reduce((s, p) => s + p.quantity, 0);
    assert(somaGeral === 18, `total geral inalterado (18, obtido: ${somaGeral})`);

    console.log("\n9. mudança de categoria não muda o total (§9)");
    const mudancaCategoria = await recordMovement(db, {
      movement_type: "mudanca_categoria",
      quantity: 2,
      from: {
        category_id: "bezerra_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      to: {
        category_id: "femea_8_12",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      occurred_at: new Date("2026-02-01"),
    });
    assert(mudancaCategoria.ok, "mudança de categoria aceita");
    const femea812 = await getPositions(db, { category_id: "femea_8_12", property_id: propA.id });
    assert(femea812[0]?.quantity === 2, `2 animais migraram para Fêmea 8-12 (obtido: ${femea812[0]?.quantity})`);
    const bezerra07 = await getPositions(db, { category_id: "bezerra_0_7", property_id: propA.id });
    assert(bezerra07[0]?.quantity === 1, `sobrou 1 em Bezerra 0-7 (3 - 2, obtido: ${bezerra07[0]?.quantity})`);

    console.log("\n10. ajuste de saldo, histórico preservado (§8.7, critério 12)");
    const ajuste = await recordMovement(db, {
      movement_type: "ajuste",
      quantity: 2,
      reason: "contagem fisica",
      notes: "sistema mostrava 2 a mais",
      from: {
        category_id: "femea_8_12",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(ajuste.ok, "ajuste negativo registrado");
    const femea812AposAjuste = await getPositions(db, { category_id: "femea_8_12", property_id: propA.id });
    assert(
      (femea812AposAjuste[0]?.quantity ?? 0) === 0,
      `ajuste levou a posição a 0 (obtido: ${femea812AposAjuste[0]?.quantity})`,
    );
    const historico = await db.herdMovement.findMany({ where: { movement_type: "ajuste" } });
    assert(historico.length === 1 && historico[0].reason === "contagem fisica", "ajuste fica no histórico com o motivo");

    console.log("\n11. cancelar não conta mais no saldo, mas fica no histórico (§10.8)");
    const paraCancel = await recordMovement(db, {
      movement_type: "compra",
      quantity: 7,
      to: {
        category_id: "macho_8_12",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(paraCancel.ok, "compra a ser cancelada é registrada normalmente");
    if (paraCancel.ok) {
      const antes = await getPositions(db, { category_id: "macho_8_12", property_id: propA.id });
      assert(antes[0]?.quantity === 7, "antes de cancelar, os 7 contam no saldo");
      await db.herdMovement.update({
        where: { id: paraCancel.data.id },
        data: { canceled_at: new Date(), canceled_reason: "lançado errado" },
      });
      const depois = await getPositions(db, { category_id: "macho_8_12", property_id: propA.id });
      assert(
        (depois[0]?.quantity ?? 0) === 0,
        `cancelada, a movimentação some do saldo (obtido: ${depois[0]?.quantity})`,
      );
      const aindaExiste = await db.herdMovement.findUnique({ where: { id: paraCancel.data.id } });
      assert(!!aindaExiste, "a linha cancelada continua no histórico, não é apagada");
    }

    console.log("\n12. validações de forma por tipo de movimentação (§10.1, §10.2)");
    const semQuantidadeInteira = await recordMovement(db, {
      movement_type: "compra",
      quantity: 2.5,
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!semQuantidadeInteira.ok, "quantidade não inteira é recusada (§10.1)");

    const semQuantidadePositiva = await recordMovement(db, {
      movement_type: "compra",
      quantity: 0,
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!semQuantidadePositiva.ok, "quantidade zero é recusada (§10.2)");

    const vendaSemOrigem = await recordMovement(db, {
      movement_type: "venda",
      quantity: 1,
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!vendaSemOrigem.ok, "venda sem origem (só destino) é recusada, forma errada");

    const compraComOrigem = await recordMovement(db, {
      movement_type: "compra",
      quantity: 1,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!compraComOrigem.ok, "compra com origem é recusada, entrada não tem origem");

    const transferenciaSemDestino = await recordMovement(db, {
      movement_type: "transferencia_pasto",
      quantity: 1,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!transferenciaSemDestino.ok, "transferência sem destino é recusada");

    const ajusteComOsDois = await recordMovement(db, {
      movement_type: "ajuste",
      quantity: 1,
      from: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      to: {
        category_id: "bezerro_0_7",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!ajusteComOsDois.ok, "ajuste com origem E destino ao mesmo tempo é recusado");

    console.log("\n13. categoria e propriedade inválidas são recusadas");
    const categoriaInvalida = await recordMovement(db, {
      movement_type: "compra",
      quantity: 1,
      to: {
        category_id: "boi_gordo_inexistente",
        property_id: propA.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!categoriaInvalida.ok, "categoria que não está na constante das 12 é recusada");

    const propriedadeInvalida = await recordMovement(db, {
      movement_type: "compra",
      quantity: 1,
      to: {
        category_id: "bezerro_0_7",
        property_id: "propriedade-que-nao-existe",
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    assert(!propriedadeInvalida.ok, "propriedade que não existe no tenant é recusada");

    console.log("\n14. dono e situação (fase 2 nasce agora, §2 do módulo)");
    const terceiro = await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 4,
      to: {
        category_id: "macho_36_mais",
        property_id: propA.id,
        pasture_id: pastoSede.id,
        situation: "presente",
        owner: "terceiro",
      },
    });
    assert(terceiro.ok, "posição de animal de terceiro é aceita");
    const proprioPresente = await getPositions(db, { property_id: propA.id, situation: "presente", owner: "proprio" });
    const terceiroPresente = await getPositions(db, { property_id: propA.id, situation: "presente", owner: "terceiro" });
    assert(
      terceiroPresente.some((p) => p.category_id === "macho_36_mais" && p.quantity === 4),
      "rebanho de terceiro não se mistura ao próprio na mesma posição",
    );
    assert(
      !proprioPresente.some((p) => p.category_id === "macho_36_mais"),
      "o próprio não ganha os 4 de terceiro",
    );

    console.log("\n15. listMovements: os 9 campos obrigatórios do §10.7");
    const operador = await db.user.create({
      data: scoped({
        name: "Zé do Curral",
        email: `m33-${stamp}@tibe.test`,
        password_hash: "nao-usado-neste-teste",
        role: "OPERADOR",
      }),
    });
    const comTodosOsCampos = await recordMovement(db, {
      movement_type: "nascimento",
      quantity: 3,
      to: {
        category_id: "garrote_reprodutor",
        property_id: propA.id,
        pasture_id: pastoSede.id,
        situation: "presente",
        owner: "proprio",
      },
      reason: "parto normal",
      notes: "tres bezerros da vaca 42",
      recorded_by_user_id: operador.id,
      occurred_at: new Date("2026-06-15"),
    });
    assert(comTodosOsCampos.ok, "movimentação com motivo, observação e usuário é registrada");

    const historicoGarrote = await listMovements(db, { category_id: "garrote_reprodutor" });
    const linha = historicoGarrote.items[0];
    assert(
      historicoGarrote.total === 1,
      `o filtro por categoria acha exatamente 1 (obtido: ${historicoGarrote.total})`,
    );
    assert(!!linha && linha.occurred_at.getTime() === new Date("2026-06-15").getTime(), "1/9: data");
    assert(linha?.to?.category_id === "garrote_reprodutor", "2/9: categoria");
    assert(linha?.quantity === 3, "3/9: quantidade");
    assert(linha?.movement_type === "nascimento", "4/9: tipo de movimentação");
    assert(linha?.to?.property_id === propA.id, "5/9: fazenda");
    assert(linha?.to?.pasture_id === pastoSede.id, "6/9: pasto, quando informado");
    assert(linha?.recorded_by?.name === "Zé do Curral", "7/9: usuário responsável, pelo nome");
    assert(linha?.reason === "parto normal", "8/9: motivo, quando houver");
    assert(linha?.notes === "tres bezerros da vaca 42", "9/9: observação, quando houver");

    console.log("\n16. listMovements: filtros, ordem e paginação");
    const porTipo = await listMovements(db, { movement_type: "ajuste" });
    assert(
      porTipo.total === 1 && porTipo.items[0]?.movement_type === "ajuste",
      "filtro por tipo de movimentação",
    );
    const porFazendaB = await listMovements(db, { property_id: propB.id });
    assert(
      porFazendaB.items.every((m) => m.from?.property_id === propB.id || m.to?.property_id === propB.id),
      "filtro por fazenda casa nos dois lados da movimentação",
    );
    const noPeriodo = await listMovements(db, {
      since: new Date("2026-06-01"),
      until: new Date("2026-06-30"),
    });
    assert(
      noPeriodo.total === 1 && noPeriodo.items[0]?.movement_type === "nascimento",
      `filtro por período pega só junho (obtido: ${noPeriodo.total})`,
    );

    const tudo = await listMovements(db);
    assert(tudo.total > 5, `sem filtro, o histórico traz tudo (obtido: ${tudo.total})`);
    const ordenado = tudo.items.every(
      (m, i) => i === 0 || tudo.items[i - 1].occurred_at.getTime() >= m.occurred_at.getTime(),
    );
    assert(ordenado, "histórico vem da movimentação mais recente para a mais antiga");

    const pagina1 = await listMovements(db, {}, { limit: 2, offset: 0 });
    const pagina2 = await listMovements(db, {}, { limit: 2, offset: 2 });
    assert(pagina1.items.length === 2, "limit corta a página em 2");
    assert(pagina1.total === tudo.total, "total é o do filtro, não o da página");
    assert(
      pagina1.items.every((m) => !pagina2.items.some((o) => o.id === m.id)),
      "offset não repete linha entre páginas",
    );

    console.log("\n17. cancelMovement: cancela, some do saldo, fica no histórico (§10.8)");
    const compraParaCancelar = await recordMovement(db, {
      movement_type: "compra",
      quantity: 10,
      to: {
        category_id: "femea_25_36",
        property_id: propB.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      value: 30000,
    });
    assert(compraParaCancelar.ok, "compra de 10 registrada");
    if (!compraParaCancelar.ok) throw new Error("sem a compra o resto da seção não faz sentido");

    const vendaDeParte = await recordMovement(db, {
      movement_type: "venda",
      quantity: 8,
      from: {
        category_id: "femea_25_36",
        property_id: propB.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      value: 28000,
    });
    assert(vendaDeParte.ok, "venda de 8 das 10 registrada");
    if (!vendaDeParte.ok) throw new Error("sem a venda o resto da seção não faz sentido");

    console.log("\n18. cancelar o que já foi usado é bloqueado (§10.3 no cancelamento)");
    const cancelaCompraCedo = await cancelMovement(db, compraParaCancelar.data.id, "comprei errado");
    assert(
      !cancelaCompraCedo.ok,
      "cancelar a compra deixaria o saldo negativo, então é recusado",
    );
    assert(
      !cancelaCompraCedo.ok && cancelaCompraCedo.code === "INSUFFICIENT_BALANCE",
      "o código do erro é INSUFFICIENT_BALANCE",
    );
    const saldoIntacto = await getPositions(db, { category_id: "femea_25_36", property_id: propB.id });
    assert(saldoIntacto[0]?.quantity === 2, `saldo intacto depois da recusa (obtido: ${saldoIntacto[0]?.quantity})`);

    const cancelaVenda = await cancelMovement(db, vendaDeParte.data.id, "venda nao se concretizou");
    assert(cancelaVenda.ok, "cancelar a venda é permitido: ela só devolve animais à posição");
    const depoisDeDesfazerVenda = await getPositions(db, {
      category_id: "femea_25_36",
      property_id: propB.id,
    });
    assert(
      depoisDeDesfazerVenda[0]?.quantity === 10,
      `os 8 voltam para o saldo (obtido: ${depoisDeDesfazerVenda[0]?.quantity})`,
    );

    const cancelaCompraAgora = await cancelMovement(db, compraParaCancelar.data.id, "comprei errado");
    assert(cancelaCompraAgora.ok, "com a venda desfeita, a compra pode ser cancelada");
    const zerado = await getPositions(db, { category_id: "femea_25_36", property_id: propB.id });
    assert((zerado[0]?.quantity ?? 0) === 0, `posição volta a zero (obtido: ${zerado[0]?.quantity})`);

    console.log("\n19. cancelamento: uma vez só, e a linha continua identificada");
    const cancelaDeNovo = await cancelMovement(db, compraParaCancelar.data.id, "de novo");
    assert(!cancelaDeNovo.ok, "cancelar duas vezes a mesma movimentação é recusado");
    assert(
      !cancelaDeNovo.ok && cancelaDeNovo.code === "ALREADY_CANCELED",
      "o código do erro é ALREADY_CANCELED",
    );
    const inexistente = await cancelMovement(db, "id-que-nao-existe", "teste");
    assert(!inexistente.ok && inexistente.code === "NOT_FOUND", "id inexistente devolve NOT_FOUND");

    const comCanceladas = await listMovements(db, { movement_type: "compra" });
    const canceladaNoHistorico = comCanceladas.items.find((m) => m.id === compraParaCancelar.data.id);
    assert(!!canceladaNoHistorico, "a compra cancelada continua aparecendo no histórico (§10.8)");
    assert(
      !!canceladaNoHistorico?.canceled_at && canceladaNoHistorico.canceled_reason === "comprei errado",
      "a linha cancelada vem marcada, com o motivo do cancelamento",
    );
    const semCanceladas = await listMovements(db, {
      movement_type: "compra",
      include_canceled: false,
    });
    assert(
      !semCanceladas.items.some((m) => m.id === compraParaCancelar.data.id),
      "include_canceled: false esconde as canceladas, para quem quiser só o que conta",
    );

    console.log("\n20. financeiro do cancelamento: pago estorna, pendente apaga");
    const lancamentosDaCompra = await db.financialEntry.findMany({
      where: { related_module: "rebanho", related_id: compraParaCancelar.data.id },
    });
    const originalDaCompra = lancamentosDaCompra.find((e) => e.category === "Compra de animal");
    const estornoDaCompra = lancamentosDaCompra.find((e) => e.category === "Estorno de compra de animal");
    assert(
      lancamentosDaCompra.length === 2,
      `compra paga e cancelada fica com 2 linhas: original e estorno (obtido: ${lancamentosDaCompra.length})`,
    );
    assert(
      !!originalDaCompra && originalDaCompra.entry_type === "expense",
      "a despesa original continua no financeiro, não é apagada",
    );
    assert(
      !!estornoDaCompra && estornoDaCompra.entry_type === "income",
      "o estorno entra no sentido contrário (despesa vira receita)",
    );
    assert(Number(estornoDaCompra?.amount ?? 0) === 30000, "o estorno tem o mesmo valor da compra");

    const compraAPrazo = await recordMovement(db, {
      movement_type: "compra",
      quantity: 4,
      to: {
        category_id: "femea_36_mais",
        property_id: propB.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
      value: 12000,
    });
    assert(compraAPrazo.ok, "compra a prazo registrada");
    if (compraAPrazo.ok && compraAPrazo.data.financial_entry_id) {
      // recordMovement nasce `paid` (o evento já ocorreu). Forçamos `pending`
      // aqui para exercitar o outro ramo da régua, que passa a rodar sozinho
      // se um dia a compra a prazo entrar no contrato.
      await db.financialEntry.update({
        where: { id: compraAPrazo.data.financial_entry_id },
        data: { status: "pending", paid_at: null },
      });
      const cancelaAPrazo = await cancelMovement(db, compraAPrazo.data.id, "pedido cancelado");
      assert(cancelaAPrazo.ok, "compra com lançamento pendente pode ser cancelada");
      const lancamentoSumiu = await db.financialEntry.findFirst({
        where: { id: compraAPrazo.data.financial_entry_id },
      });
      assert(!lancamentoSumiu, "lançamento pendente é apagado, não estornado");
      assert(
        cancelaAPrazo.ok && cancelaAPrazo.data.financial_entry_id === null,
        "o vínculo não fica apontando para uma linha apagada",
      );
      const semEstorno = await db.financialEntry.findMany({
        where: { related_module: "rebanho", related_id: compraAPrazo.data.id },
      });
      assert(semEstorno.length === 0, "nada de estorno para o que nunca virou dinheiro");
    }

    console.log("\n21. getPeriodTotals: as 4 linhas de 'Movimentações do mês' (§12)");
    const inicioDeJunho = new Date("2026-06-01");
    const fimDeJunho = new Date("2026-06-30T23:59:59.999Z");
    const junho = await getPeriodTotals(db, inicioDeJunho, fimDeJunho);
    assert(
      junho.nascimentos === 3,
      `nascimentos de junho (o de 15/06, 3 cabeças): obtido ${junho.nascimentos}`,
    );
    assert(
      junho.compras === 0 && junho.vendas === 0 && junho.mortes === 0,
      "o que aconteceu fora de junho não entra na conta do mês",
    );

    const desdeSempre = await getPeriodTotals(db, new Date("2020-01-01"), new Date("2030-01-01"));
    assert(desdeSempre.nascimentos > 0 && desdeSempre.vendas > 0, "janela ampla pega tudo");
    // Foram registradas 3 compras: 5 (seção 3, viva), 10 e 4 (canceladas).
    // Obter 5 em vez de 19 é a prova de que o cancelamento vale aqui também.
    assert(
      desdeSempre.compras === 5,
      `compra cancelada não conta no período: esperado 5, obtido ${desdeSempre.compras}`,
    );

    const soFazendaB = await getPeriodTotals(db, new Date("2020-01-01"), new Date("2030-01-01"), {
      property_id: propB.id,
    });
    assert(
      soFazendaB.nascimentos === 0,
      `filtro por fazenda exclui o nascimento da fazenda A (obtido: ${soFazendaB.nascimentos})`,
    );

    console.log("\n22. isolamento multi-tenant continua valendo");
    const tenantB = await prisma.tenant.create({
      data: { name: "M33 Ledger B", document: `33${stamp}1`, plan: "fazenda" },
    });
    try {
      const dbB = prismaForTenant(tenantB.id);
      const posicoesTenantB = await getPositions(dbB);
      assert(posicoesTenantB.length === 0, "tenant B não enxerga nenhuma posição do tenant A");

      const historicoTenantB = await listMovements(dbB);
      assert(historicoTenantB.total === 0, "tenant B não enxerga o histórico do tenant A");

      const cancelaDoOutro = await cancelMovement(dbB, comTodosOsCampos.ok ? comTodosOsCampos.data.id : "x", "invasao");
      assert(
        !cancelaDoOutro.ok && cancelaDoOutro.code === "NOT_FOUND",
        "tenant B não consegue cancelar movimentação do tenant A",
      );
    } finally {
      await prisma.tenant.deleteMany({ where: { id: tenantB.id } });
    }
  } finally {
    await prisma.herdMovement.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.financialEntry.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.pasture.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.property.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }

  console.log("");
  if (failures === 0) {
    console.log("✅ Livro-razão do rebanho: 0 falhas.");
  } else {
    console.error(`❌ Livro-razão do rebanho: ${failures} falha(s).`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
