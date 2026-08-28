import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import type { TenantPrismaClient } from "@/lib/prisma";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";

exigirBancoLocal();

/**
 * Módulo 31, missão 4: permuta.
 *
 * A frase do cliente que esta suíte protege é o §12.6: "a permuta deverá ser
 * registrada como uma única negociação. O produtor não deverá precisar criar
 * manualmente uma venda e depois uma compra."
 *
 * Roda: `npm run test:m49`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

function ctx(
  db: TenantPrismaClient,
  tenantId: string,
  parameters: Record<string, unknown>,
  opts: { confirmed?: boolean; explicitNo?: boolean; userId?: string } = {},
): HandlerCtx {
  return {
    db,
    tenant_id: tenantId,
    role: "OWNER",
    activeProfiles: ["fazenda"],
    parameters,
    confirmed: opts.confirmed ?? false,
    explicitNo: opts.explicitNo ?? false,
    user_id: opts.userId,
  };
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { getPositions, recordMovement } = await import("@/lib/actions/herd-ledger");
  const { createBarter } = await import("@/lib/actions/barters");
  const { getNegotiation, situacaoLabel } = await import("@/lib/actions/negotiations");
  const { getStockBalance, recordStockMovement } = await import("@/lib/actions/stock-ledger");
  const { ensureProductCategories, listProductCategories, createProduct } = await import(
    "@/lib/actions/products"
  );

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M49 ${stamp}`, document: `M49${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const usuario = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "Produtor de Teste",
      email: `m49-${stamp}@teste.local`,
      password_hash: "x",
      role: "OWNER",
    },
  });
  const USUARIO = usuario.id;
  const db = prismaForTenant(tenant.id);

  const soma = (posicoes: { quantity: number }[]) =>
    posicoes.reduce((s, p) => s + p.quantity, 0);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M49" }) });
    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto A", area_hectares: 10 }),
    });

    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 300,
      to: {
        category_id: "macho_36_mais",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 300,
      to: {
        category_id: "femea_13_24",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });

    console.log("1. A forma dos movimentos novos, antes de qualquer permuta");
    {
      // A ARMADILHA DA MISSÃO 3, que custou uma rodada: um tipo de movimento
      // novo que não entra nas listas de forma cai no ramo de `ajuste`, que
      // exige exatamente UMA das pontas. A action devolveria `ok` e o
      // movimento ficaria gravado com a forma errada.
      const posicaoBoi = {
        category_id: "macho_36_mais",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente" as const,
        owner: "proprio" as const,
      };
      const posicaoFemea = {
        category_id: "femea_13_24",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente" as const,
        owner: "proprio" as const,
      };

      // ⚠️ AS DUAS CONFERÊNCIAS QUE DISCRIMINAM, e não as óbvias.
      //
      // Um tipo fora das listas de forma cai no ramo de `ajuste`, que recusa
      // as DUAS pontas juntas. Por isso "recusa quando vem com as duas" passa
      // igual antes e depois da correção: é uma asserção que não distingue
      // nada, o mesmo erro de teste que este projeto já pagou.
      //
      // A diferença real está na ponta que FALTA. Sob `ajuste`, uma
      // `permuta_entrada` com só a ORIGEM é aceita, e aí ela TIRA cabeças do
      // rebanho em vez de acrescentar: uma entrada que subtrai, gravada em
      // silêncio.
      const entradaSemDestino = await recordMovement(db, {
        movement_type: "permuta_entrada",
        quantity: 1,
        from: posicaoBoi,
      });
      check(
        "permuta_entrada exige o DESTINO: sem ele, seria uma entrada que subtrai",
        !entradaSemDestino.ok,
        entradaSemDestino.ok ? "aceitou entrada sem destino" : entradaSemDestino.code,
      );

      const saidaSemOrigem = await recordMovement(db, {
        movement_type: "permuta_saida",
        quantity: 1,
        to: posicaoFemea,
      });
      check(
        "permuta_saida exige a ORIGEM: sem ela, seria uma saída que soma",
        !saidaSemOrigem.ok,
        saidaSemOrigem.ok ? "aceitou saída sem origem" : saidaSemOrigem.code,
      );

      const entradaComOrigem = await recordMovement(db, {
        movement_type: "permuta_entrada",
        quantity: 1,
        from: posicaoBoi,
        to: posicaoFemea,
      });
      check(
        "e nenhuma das duas aceita as duas pontas",
        !entradaComOrigem.ok,
        entradaComOrigem.ok ? "aceitou as duas pontas" : entradaComOrigem.code,
      );

      const saidaOk = await recordMovement(db, {
        movement_type: "permuta_saida",
        quantity: 2,
        from: posicaoBoi,
      });
      check("saída com só a origem passa", saidaOk.ok, saidaOk.ok ? "" : saidaOk.message);
      check(
        "e tira as 2 cabeças do rebanho",
        soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" })) === 298,
        String(soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" }))),
      );

      const entradaOk = await recordMovement(db, {
        movement_type: "permuta_entrada",
        quantity: 5,
        to: posicaoFemea,
      });
      check("entrada com só o destino passa", entradaOk.ok, entradaOk.ok ? "" : entradaOk.message);
      check(
        "e ACRESCENTA 5 cabeças, em vez de tirar",
        soma(await getPositions(db, { owner: "proprio", category_id: "femea_13_24" })) === 305,
        String(soma(await getPositions(db, { owner: "proprio", category_id: "femea_13_24" }))),
      );
    }

    console.log("\n2. O exemplo §12.8: 15 fêmeas por 10 bezerros e R$ 18.000 recebidos");
    {
      const femeasAntes = soma(await getPositions(db, { owner: "proprio", category_id: "femea_13_24" }));
      const bezerrosAntes = soma(await getPositions(db, { owner: "proprio", category_id: "bezerro_0_7" }));

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "femea_13_24", quantity: 15, pasture_id: pasto.id },
        recebido: { kind: "animais", category_id: "bezerro_0_7", quantity: 10, pasture_id: pasto.id },
        diferenca: { direcao: "recebi", amount: 18000 },
        pago: true,
        contact_name: "Fazenda Vizinha",
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);

      check(
        "saíram 15 fêmeas",
        soma(await getPositions(db, { owner: "proprio", category_id: "femea_13_24" })) === femeasAntes - 15,
      );
      check(
        "entraram 10 bezerros",
        soma(await getPositions(db, { owner: "proprio", category_id: "bezerro_0_7" })) === bezerrosAntes + 10,
      );

      const movs = await db.herdMovement.findMany({
        where: { negotiation_id: r.ok ? r.data.id : "" },
        select: { movement_type: true, quantity: true },
      });
      check("dois movimentos, um de cada lado", movs.length === 2, String(movs.length));
      check(
        "o extrato diz PERMUTA, nunca venda",
        movs.every((m) => m.movement_type === "permuta_saida" || m.movement_type === "permuta_entrada"),
        movs.map((m) => m.movement_type).join(","),
      );

      const lancamentos = await db.financialEntry.findMany({
        where: { negotiation_id: r.ok ? r.data.id : "" },
      });
      check("um lançamento só", lancamentos.length === 1, String(lancamentos.length));
      check("e ele é RECEITA", lancamentos[0]?.entry_type === "income", lancamentos[0]?.entry_type);
      check("de R$ 18.000", Number(lancamentos[0]?.amount) === 18000, String(lancamentos[0]?.amount));

      // A ARMADILHA: `ehVenda()` decide pelo TIPO, e numa permuta a direção do
      // dinheiro depende da diferença. Sem tratar, a linha diria "A pagar"
      // numa permuta em que o produtor RECEBEU.
      const detalhe = await getNegotiation(db, r.ok ? r.data.id : "");
      check("a negociação sabe que o dinheiro ENTROU", detalhe?.recebe_dinheiro === true);
      check(
        "e a tela diz Recebida, nunca 'A pagar'",
        situacaoLabel(detalhe?.situacao ?? "", detalhe?.recebe_dinheiro ?? false) === "Recebida",
        situacaoLabel(detalhe?.situacao ?? "", detalhe?.recebe_dinheiro ?? false),
      );
      check("o valor da negociação é a diferença", Number(detalhe?.amount) === 18000, String(detalhe?.amount));
      check("o contato foi criado", detalhe?.contact_name === "Fazenda Vizinha", detalhe?.contact_name ?? "");
    }

    console.log("\n3. Sem saldo, nada fica pela metade");
    {
      const negociacoesAntes = await db.negotiation.count();
      const contatosAntes = await db.contact.count();
      const bezerrosAntes = soma(await getPositions(db, { owner: "proprio", category_id: "bezerro_0_7" }));

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "femea_13_24", quantity: 9999, pasture_id: pasto.id },
        recebido: { kind: "animais", category_id: "bezerro_0_7", quantity: 10, pasture_id: pasto.id },
        contact_name: "Contato Fantasma",
      });
      check("recusa por saldo", !r.ok && r.code === "INSUFFICIENT_BALANCE", r.ok ? "abriu" : r.code);
      check("apontando a quantidade", !r.ok && r.field === "quantity");
      check("nenhuma negociação órfã", (await db.negotiation.count()) === negociacoesAntes);
      check("nenhum contato órfão", (await db.contact.count()) === contatosAntes);
      check(
        "e os bezerros do outro lado NÃO entraram",
        soma(await getPositions(db, { owner: "proprio", category_id: "bezerro_0_7" })) === bezerrosAntes,
      );
    }

    console.log("\n4. O exemplo §12.7: 20 bois por 1 trator, pagando R$ 30.000");
    {
      const boisAntes = soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" }));

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "macho_36_mais", quantity: 20, pasture_id: pasto.id },
        recebido: { kind: "maquina", name: "Trator John Deere 6110", type: "Trator", brand: "John Deere" },
        diferenca: { direcao: "paguei", amount: 30000 },
        pago: true,
        contact_name: "Revenda Agrícola",
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);

      check(
        "saíram os 20 bois",
        soma(await getPositions(db, { owner: "proprio", category_id: "macho_36_mais" })) === boisAntes - 20,
      );

      const maquina = await db.machine.findFirst({ where: { id: r.ok ? r.data.machine_id ?? "" : "" } });
      check("o trator foi cadastrado", maquina != null);
      check("apontando para a permuta", maquina?.acquired_negotiation_id === (r.ok ? r.data.id : null));
      check("ativo", maquina?.status === "active", maquina?.status);
      // A máquina veio de gado, não de dinheiro: pôr valor aqui geraria uma
      // despesa de aquisição ALÉM da diferença.
      check("e SEM custo de aquisição", maquina?.acquisition_cost === null, String(maquina?.acquisition_cost));

      const lancamentos = await db.financialEntry.findMany({
        where: { negotiation_id: r.ok ? r.data.id : "" },
      });
      check("UM lançamento, não dois", lancamentos.length === 1, String(lancamentos.length));
      check("e ele é DESPESA", lancamentos[0]?.entry_type === "expense", lancamentos[0]?.entry_type);
      check("de R$ 30.000", Number(lancamentos[0]?.amount) === 30000, String(lancamentos[0]?.amount));

      const detalhe = await getNegotiation(db, r.ok ? r.data.id : "");
      check("o dinheiro SAIU", detalhe?.recebe_dinheiro === false);
      check(
        "e a tela diz Quitada",
        situacaoLabel(detalhe?.situacao ?? "", detalhe?.recebe_dinheiro ?? false) === "Quitada",
        situacaoLabel(detalhe?.situacao ?? "", detalhe?.recebe_dinheiro ?? false),
      );
    }

    console.log("\n5. A máquina que SAI vira 'negociada', não 'vendida'");
    {
      const velha = await db.machine.create({
        data: scoped({ property_id: fazenda.id, name: "Trator velho", type: "Trator" }),
      });

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "maquina", machine_id: velha.id },
        recebido: { kind: "animais", category_id: "bezerro_0_7", quantity: 8, pasture_id: pasto.id },
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);

      const depois = await db.machine.findFirst({ where: { id: velha.id } });
      check("o status é negociada", depois?.status === "negociada", depois?.status);
      check("apontando para a permuta que a levou", depois?.disposed_negotiation_id === (r.ok ? r.data.id : null));
      check("e o vínculo de entrada continua vazio", depois?.acquired_negotiation_id === null);

      const lancamentos = await db.financialEntry.count({
        where: { negotiation_id: r.ok ? r.data.id : "" },
      });
      check("troca seca não gera lançamento nenhum", lancamentos === 0, String(lancamentos));

      const detalhe = await getNegotiation(db, r.ok ? r.data.id : "");
      check("e a situação é sem_valor", detalhe?.situacao === "sem_valor", detalhe?.situacao);
      // A palavra muda por tipo: "Sem venda" serve para a remessa de leilão
      // ainda aberta, mas numa permuta a troca ACONTECEU, o que não houve foi
      // dinheiro.
      check(
        "e a tela diz 'Troca sem dinheiro'",
        situacaoLabel(detalhe?.situacao ?? "", false, "permuta") === "Troca sem dinheiro",
        situacaoLabel(detalhe?.situacao ?? "", false, "permuta"),
      );
      check(
        "sem o tipo, a palavra de sempre continua",
        situacaoLabel("sem_valor", false) === "Sem venda",
        situacaoLabel("sem_valor", false),
      );
    }

    console.log("\n6. Máquina que já saiu não sai de novo");
    {
      const jaSaiu = await db.machine.findFirst({ where: { name: "Trator velho" } });
      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "maquina", machine_id: jaSaiu?.id ?? "" },
        recebido: { kind: "animais", category_id: "bezerro_0_7", quantity: 1, pasture_id: pasto.id },
      });
      check(
        "recusa: ela não é mais do produtor",
        !r.ok && r.code === "MAQUINA_INDISPONIVEL",
        r.ok ? "aceitou" : r.code,
      );
    }

    console.log("\n7. Produto por animal, e o estoque cai");
    {
      await ensureProductCategories(db);
      const categorias = await listProductCategories(db);
      const produto = await createProduct(db, {
        name: "Sal mineral",
        category_id: categorias[0].id,
        unit: "saca",
      });
      const produtoId = produto.ok ? produto.data.id : "";
      await recordStockMovement(db, {
        product_id: produtoId,
        property_id: fazenda.id,
        movement_type: "compra",
        quantity: 100,
      });

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "produtos", product_id: produtoId, quantity: 30 },
        recebido: { kind: "animais", category_id: "bezerro_0_7", quantity: 5, pasture_id: pasto.id },
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);

      const saldo = await getStockBalance(db, { product_id: produtoId, property_id: fazenda.id });
      check("o estoque caiu 30 sacas", (saldo[0]?.quantity ?? 0) === 70, String(saldo[0]?.quantity));

      const movs = await db.stockMovement.findMany({
        where: { negotiation_id: r.ok ? r.data.id : "" },
        select: { movement_type: true },
      });
      check("com o tipo permuta_saida", movs[0]?.movement_type === "permuta_saida", movs[0]?.movement_type);

      // Sem saldo, o estoque recusa e nada fica pela metade.
      const semSaldo = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "produtos", product_id: produtoId, quantity: 9999 },
        recebido: { kind: "animais", category_id: "bezerro_0_7", quantity: 1, pasture_id: pasto.id },
      });
      check(
        "sem saca suficiente, recusa",
        !semSaldo.ok && semSaldo.code === "INSUFFICIENT_STOCK",
        semSaldo.ok ? "abriu" : semSaldo.code,
      );
      const saldoDepois = await getStockBalance(db, { product_id: produtoId, property_id: fazenda.id });
      check("e o saldo não se mexeu", (saldoDepois[0]?.quantity ?? 0) === 70, String(saldoDepois[0]?.quantity));
    }

    console.log("\n8. Bezerro por serviço: o que o Tibé sabe registrar, ele registra");
    {
      const bezerrosAntes = soma(await getPositions(db, { owner: "proprio", category_id: "bezerro_0_7" }));

      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "bezerro_0_7", quantity: 1, pasture_id: pasto.id },
        recebido: { kind: "descricao", texto: "Construção de 500m de cerca" },
        contact_name: "Seu Zé da cerca",
      });
      check("a permuta abre", r.ok, r.ok ? "" : r.message);
      check(
        "o bezerro sai do rebanho de verdade",
        soma(await getPositions(db, { owner: "proprio", category_id: "bezerro_0_7" })) === bezerrosAntes - 1,
      );

      const negociacao = await db.negotiation.findFirst({ where: { id: r.ok ? r.data.id : "" } });
      check(
        "e o outro lado fica como texto",
        negociacao?.barter_in_note === "Construção de 500m de cerca",
        negociacao?.barter_in_note ?? "",
      );
      check("o lado entregue não vira texto", negociacao?.barter_out_note === null);
    }

    console.log("\n9. Permuta que não move nada é recusada");
    {
      const negociacoesAntes = await db.negotiation.count();
      const r = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "descricao", texto: "Uma tarde de trabalho" },
        recebido: { kind: "descricao", texto: "Uma tarde de trabalho" },
      });
      check(
        "sem item e sem dinheiro, não é negócio",
        !r.ok && r.code === "PERMUTA_VAZIA",
        r.ok ? "aceitou" : r.code,
      );
      check("e nada é gravado", (await db.negotiation.count()) === negociacoesAntes);

      // Com dinheiro, os dois lados descritivos passam: o dinheiro é real.
      const comDinheiro = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "descricao", texto: "Uma tarde de trabalho" },
        recebido: { kind: "descricao", texto: "Reparo do curral" },
        diferenca: { direcao: "paguei", amount: 500 },
        pago: true,
      });
      check("com diferença, passa", comDinheiro.ok, comDinheiro.ok ? "" : comDinheiro.message);
    }

    console.log("\n10. As recusas de entrada");
    {
      const semLados = await createBarter(db, {
        property_id: fazenda.id,
        entregue: null,
        recebido: null,
        diferenca: { direcao: "paguei", amount: 100 },
        pago: true,
      });
      // §12.3 põe "item entregue" e "item recebido" entre os obrigatórios: uma
      // troca com um lado só não é troca, é venda, compra ou pagamento.
      check(
        "os dois lados vazios é recusado, mesmo com dinheiro",
        !semLados.ok && semLados.code === "PERMUTA_INCOMPLETA",
        semLados.ok ? "aceitou" : semLados.code,
      );
      check("apontando o lado que falta", !semLados.ok && semLados.field === "entregue");

      const soUmLado = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "bezerro_0_7", quantity: 1, pasture_id: pasto.id },
        recebido: null,
      });
      check(
        "um lado só também é recusado",
        !soUmLado.ok && soUmLado.code === "PERMUTA_INCOMPLETA",
        soUmLado.ok ? "aceitou" : soUmLado.code,
      );
      check("apontando o lado recebido", !soUmLado.ok && soUmLado.field === "recebido");

      const parcelaErrada = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "bezerro_0_7", quantity: 1, pasture_id: pasto.id },
        recebido: { kind: "descricao", texto: "Uma roçadeira" },
        diferenca: { direcao: "paguei", amount: 1000 },
        parcelas: [
          { due_date: new Date(), amount: 300 },
          { due_date: new Date(), amount: 300 },
        ],
      });
      check(
        "parcela que não fecha com a diferença é recusada",
        !parcelaErrada.ok && parcelaErrada.code === "PARCELAS_NAO_FECHAM",
        parcelaErrada.ok ? "aceitou" : parcelaErrada.code,
      );

      const maquinaSemNome = await createBarter(db, {
        property_id: fazenda.id,
        entregue: { kind: "animais", category_id: "bezerro_0_7", quantity: 1, pasture_id: pasto.id },
        recebido: { kind: "maquina", name: "   ", type: "Trator" },
      });
      check(
        "máquina sem nome é recusada",
        !maquinaSemNome.ok && maquinaSemNome.field === "name",
        maquinaSemNome.ok ? "aceitou" : String(maquinaSemNome.field),
      );
    }
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

comBanco()
  .then(() => {
    console.log(
      falhas === 0 ? `\n✅ M49: permuta, 0 falhas.` : `\n❌ M49: ${falhas} falha(s).`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((erro) => {
    console.error("\n❌ M49 quebrou:", erro);
    process.exit(1);
  });
