import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import {
  situacaoDaEstadia,
  donoDaEstadia,
  tipoDeEnvio,
  encerramentosPermitidos,
  permiteEncerramento,
} from "@/lib/herd/stay-rules";

exigirBancoLocal();

/**
 * Confinamento: fase 3 do Módulo 30 (docs/superpowers/specs/
 * 2026-08-31-confinamento-fase-3-do-modulo-30.md).
 *
 * ESCRITA CEGA DA SPEC: esta suíte não leu `src/lib/actions/confinement.ts`
 * nem `src/app/api/v1/confinement/`, que nascem na mesma onda. O que ela
 * exercita são os dois pontos que a spec §2 cita como terreno já existente e
 * reusado: `stay-rules.ts` (regras puras de cada tipo de estadia) e as
 * primitivas do livro-razão (`recordMovement`/`getPositions`, em
 * `herd-ledger.ts`), mais `openStay`/`closeStay`/`listStays`
 * (`herd-stays.ts`) e `recordStockMovement`/`getStockBalance`
 * (`stock-ledger.ts`), cujo contrato já está estável em produção (fase 2 do
 * Módulo 30 e missão 2 do Módulo 31) e cuja forma este arquivo conhece pelas
 * suítes irmãs `m47-estadias.test.ts` e `m37-estoque.test.ts`, não pela
 * implementação desta frente.
 *
 * Prova, por seção (espelhando spec §6):
 *   1. As regras puras: `confinamento` sabe onde o animal fica, de quem é, o
 *      envio e os encerramentos (stay-rules.ts precisa aprender o tipo novo).
 *   2. Entrada em confinamento NÃO altera o total do rebanho (§27.1).
 *   3. O animal sai da localização anterior e passa a contar em confinamento (§7).
 *   4. Dias confinados batem com a data de entrada (§8).
 *   5. Alimentação com produto do estoque REDUZ o saldo (§11).
 *   6. Alimentação com produto fora do estoque não mexe em saldo nenhum (§12).
 *   7. Saída parcial deixa o restante no lote (§20).
 *   8. Venda direto do confinamento reduz o rebanho e cria a receita (§19).
 *   9. Morte reduz lote e rebanho (§21).
 *  10. A cobrança NÃO é multiplicada por nada (decisão 3 da spec).
 *  11. O retorno ao pasto grava o pasto informado (§18, decisão do usuário em
 *      31/08, T11), e recusa pasto de OUTRA propriedade.
 *
 * Roda: `npm run test:m51`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🐂 M51: confinamento, a fase 3 do Módulo 30\n");

console.log("1. As regras puras: stay-rules.ts precisa conhecer `confinamento`");
check("fica na situação homônima", situacaoDaEstadia("confinamento") === "confinamento");
check(
  "continua do produtor: o princípio do §3 ('não representa entrada ou saída definitiva')",
  donoDaEstadia("confinamento") === "proprio",
);
check("o envio é `envio_confinamento`, e não empresta o do boitel", tipoDeEnvio("confinamento") === "envio_confinamento");
{
  const permitidos = encerramentosPermitidos("confinamento");
  check("permite retorno ao pasto", permitidos.includes("retorno_estadia"));
  check("permite venda direta (§19)", permitidos.includes("venda"));
  check("permite morte (§21)", permitidos.includes("morte"));
  check("e só esses três, como o boitel", permitidos.length === 3, permitidos.join(","));
}
check(
  "não é confinamento de terceiro: saida_terceiro não é encerramento válido",
  !permiteEncerramento("confinamento", "saida_terceiro"),
);

const DIA_MS = 24 * 60 * 60 * 1000;

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { openStay, closeStay, listStays } = await import("@/lib/actions/herd-stays");
  const { getPositions, recordMovement } = await import("@/lib/actions/herd-ledger");
  const { recordStockMovement, getStockBalance } = await import("@/lib/actions/stock-ledger");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M51 ${stamp}`, document: `M51${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  const soma = (posicoes: { quantity: number }[]) => posicoes.reduce((s, p) => s + p.quantity, 0);
  const saldoEstoque = (posicoes: { quantity: number }[]) => posicoes.reduce((s, p) => s + p.quantity, 0);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M51" }) });
    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto M51", area_hectares: 40 }),
    });
    const site = await db.confinementSite.create({
      data: scoped({
        name: "Confinamento Sede",
        type: "proprio",
        property_id: fazenda.id,
      }),
    });

    // Base para haver de onde tirar: 500 cabeças presentes, próprias.
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 500,
      to: {
        category_id: "macho_25_36",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });

    console.log("\n2. Entrada em confinamento não altera o total do rebanho (§27.1)");
    let stayA: string = "";
    {
      const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
      const r = await openStay(db, {
        type: "confinamento",
        property_id: fazenda.id,
        category_id: "macho_25_36",
        pasture_id: pasto.id,
        quantity: 37,
        confinement_site_id: site.id,
        charge_type: "fechado",
        charge_value: 4500,
      });
      check("a estadia de confinamento abre", r.ok, r.ok ? "" : `${r.code}: ${r.message}`);
      stayA = r.ok ? r.data.id : "";

      const proprioDepois = soma(await getPositions(db, { owner: "proprio" }));
      check(
        "o total próprio não muda: os animais continuam do produtor",
        proprioDepois === proprioAntes,
        `${proprioDepois} vs ${proprioAntes}`,
      );
    }

    console.log("\n3. O animal sai da localização anterior e passa a contar em confinamento (§7)");
    {
      const presente = soma(await getPositions(db, { owner: "proprio", situation: "presente" }));
      const confinados = soma(await getPositions(db, { owner: "proprio", situation: "confinamento" }));
      check("37 cabeças saíram do pasto (500 - 37 = 463)", presente === 463, String(presente));
      check("e as mesmas 37 aparecem em confinamento", confinados === 37, String(confinados));

      const mov = await db.herdMovement.findFirst({ where: { stay_id: stayA } });
      check("a movimentação de envio aponta para a estadia", mov != null);
      check("com o tipo `envio_confinamento`", mov?.movement_type === "envio_confinamento", mov?.movement_type);
      check("saindo da situação presente", mov?.from_situation === "presente", mov?.from_situation ?? "null");
      check("e chegando na situação confinamento", mov?.to_situation === "confinamento", mov?.to_situation ?? "null");
    }

    console.log("\n4. Dias confinados batem com a data de entrada (§8)");
    {
      const dezDiasAtras = new Date(Date.now() - 10 * DIA_MS);
      const r = await openStay(db, {
        type: "confinamento",
        property_id: fazenda.id,
        category_id: "macho_25_36",
        pasture_id: pasto.id,
        quantity: 5,
        confinement_site_id: site.id,
        started_at: dezDiasAtras,
      });
      check("abre com data de entrada informada", r.ok, r.ok ? "" : `${r.code}: ${r.message}`);

      const stay = r.ok ? await db.herdStay.findUnique({ where: { id: r.data.id } }) : null;
      check("started_at grava a data de entrada informada, não a de hoje", stay?.started_at?.getTime() === dezDiasAtras.getTime());

      const dias = stay ? Math.round((Date.now() - stay.started_at.getTime()) / DIA_MS) : -1;
      check("e os dias confinados batem: dez dias desde a entrada", dias === 10, String(dias));
    }

    console.log("\n5. Alimentação com produto do estoque reduz o saldo (§11)");
    let racaoId = "";
    {
      const categoria = await db.productCategory.create({ data: scoped({ name: "Ração M51" }) });
      const racao = await db.product.create({
        data: scoped({ name: "Ração de confinamento", category_id: categoria.id, unit: "kg" }),
      });
      racaoId = racao.id;

      await recordStockMovement(db, {
        product_id: racao.id,
        property_id: fazenda.id,
        movement_type: "compra",
        quantity: 2000,
      });
      const antes = saldoEstoque(await getStockBalance(db, { product_id: racao.id, property_id: fazenda.id }));
      check("2000kg comprados para o confinamento", antes === 2000, String(antes));

      const uso = await recordStockMovement(db, {
        product_id: racao.id,
        property_id: fazenda.id,
        movement_type: "utilizacao",
        quantity: 180,
        stay_id: stayA,
      });
      check("a alimentação é registrada", uso.ok, uso.ok ? "" : `${uso.code}: ${uso.message}`);

      const depois = saldoEstoque(await getStockBalance(db, { product_id: racao.id, property_id: fazenda.id }));
      check("e o saldo cai os 180kg usados", depois === antes - 180, `${depois} vs ${antes - 180}`);

      const movimento = uso.ok ? await db.stockMovement.findUnique({ where: { id: uso.data.id } }) : null;
      check(
        "a utilização fica VINCULADA à estadia (§11), não solta",
        movimento?.stay_id === stayA,
        movimento?.stay_id ?? "null",
      );
    }

    console.log("\n6. Alimentação com produto fora do estoque não mexe em saldo nenhum (§12)");
    {
      // O contrato exato de como o produtor registra um trato com produto
      // FORA do catálogo (nome livre, sem StockMovement) não está no
      // briefing desta suíte: nasce em `confinement.ts`, que esta suíte não
      // lê. O que É verificável sem ele é a INVARIANTE que sustenta o §12: um
      // produto nunca tocado por movimentação nenhuma permanece com saldo
      // zero, mesmo com outras alimentações acontecendo na mesma estadia. Se
      // alguma implementação decidisse "descontar de qualquer jeito" um
      // produto genérico, este produto B acusaria o vazamento.
      const categoriaB = await db.productCategory.create({ data: scoped({ name: "Suplemento M51" }) });
      const suplemento = await db.product.create({
        data: scoped({ name: "Suplemento nunca comprado", category_id: categoriaB.id, unit: "kg" }),
      });

      const antes = saldoEstoque(await getStockBalance(db, { product_id: suplemento.id, property_id: fazenda.id }));
      check("produto fora do estoque começa em zero", antes === 0, String(antes));

      // Mais alimentação do produto QUE ESTÁ no estoque, para a mesma estadia.
      await recordStockMovement(db, {
        product_id: racaoId,
        property_id: fazenda.id,
        movement_type: "utilizacao",
        quantity: 20,
        stay_id: stayA,
      });

      const depois = saldoEstoque(await getStockBalance(db, { product_id: suplemento.id, property_id: fazenda.id }));
      check(
        "e continua em zero: nenhuma alimentação mexe no saldo de um produto que não é dele",
        depois === 0,
        String(depois),
      );
    }

    console.log("\n7. Saída parcial deixa o restante no lote (§20)");
    let stayParcial = "";
    {
      const aberta = await openStay(db, {
        type: "confinamento",
        property_id: fazenda.id,
        category_id: "macho_25_36",
        pasture_id: pasto.id,
        quantity: 30,
        confinement_site_id: site.id,
      });
      check("estadia de 30 cabeças abre para o teste de saída parcial", aberta.ok, aberta.ok ? "" : aberta.message);
      stayParcial = aberta.ok ? aberta.data.id : "";

      const confinadosAntes = soma(await getPositions(db, { owner: "proprio", situation: "confinamento" }));
      const r = await closeStay(db, stayParcial, {
        destinos: [{ movement_type: "venda", quantity: 10, value: 25000 }],
      });
      check("fechar só 10 de 30 é aceito (saída parcial)", r.ok, r.ok ? "" : `${r.code}: ${r.message}`);
      check("e a estadia CONTINUA aberta", r.ok && r.data.encerrada === false, r.ok ? String(r.data.encerrada) : "");

      const lista = await listStays(db, {});
      const item = lista.ok ? lista.data.find((e) => e.id === stayParcial) : null;
      check("o saldo aberto reflete os 20 que restaram", item?.saldo_aberto === 20, String(item?.saldo_aberto));

      const confinadosDepois = soma(await getPositions(db, { owner: "proprio", situation: "confinamento" }));
      check(
        "só os 10 vendidos saem de confinamento; os outros 20 continuam no lote",
        confinadosDepois === confinadosAntes - 10,
        `${confinadosDepois} vs ${confinadosAntes - 10}`,
      );
    }

    console.log("\n8. Venda direto do confinamento reduz o rebanho e cria a receita (§19)");
    {
      const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
      const r = await closeStay(db, stayParcial, {
        destinos: [{ movement_type: "venda", quantity: 20, value: 50000 }],
      });
      check("fecha o restante do lote com venda", r.ok, r.ok ? "" : `${r.code}: ${r.message}`);
      check("e a estadia agora está encerrada", r.ok && r.data.encerrada === true);

      const proprioDepois = soma(await getPositions(db, { owner: "proprio" }));
      check(
        "o rebanho próprio cai os 20 vendidos agora",
        proprioDepois === proprioAntes - 20,
        `${proprioDepois} vs ${proprioAntes - 20}`,
      );

      const receita = await db.financialEntry.findFirst({
        where: { entry_type: "income", amount: 50000 },
      });
      check("e nasce a receita da venda, com o valor informado", receita != null && Number(receita.amount) === 50000);
    }

    console.log("\n9. Morte reduz lote e rebanho (§21)");
    {
      const aberta = await openStay(db, {
        type: "confinamento",
        property_id: fazenda.id,
        category_id: "macho_25_36",
        pasture_id: pasto.id,
        quantity: 15,
        confinement_site_id: site.id,
      });
      check("estadia de 15 cabeças abre para o teste de morte", aberta.ok, aberta.ok ? "" : aberta.message);
      const stayId = aberta.ok ? aberta.data.id : "";

      const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
      const confinadosAntes = soma(await getPositions(db, { owner: "proprio", situation: "confinamento" }));

      const r = await closeStay(db, stayId, { destinos: [{ movement_type: "morte", quantity: 15 }] });
      check("a morte encerra o lote", r.ok && r.data.encerrada === true, r.ok ? "" : `${r.code}: ${r.message}`);

      const proprioDepois = soma(await getPositions(db, { owner: "proprio" }));
      const confinadosDepois = soma(await getPositions(db, { owner: "proprio", situation: "confinamento" }));
      check("o rebanho próprio cai os 15 mortos", proprioDepois === proprioAntes - 15, `${proprioDepois} vs ${proprioAntes - 15}`);
      check(
        "e eles saem de confinamento",
        confinadosDepois === confinadosAntes - 15,
        `${confinadosDepois} vs ${confinadosAntes - 15}`,
      );

      const movimento = await db.herdMovement.findFirst({ where: { stay_id: stayId, movement_type: "morte" } });
      check("morte não gera lançamento financeiro nenhum", movimento?.financial_entry_id == null);
    }

    console.log("\n10. A cobrança NÃO é multiplicada por nada (decisão 3)");
    {
      const r = await openStay(db, {
        type: "confinamento",
        property_id: fazenda.id,
        category_id: "macho_25_36",
        pasture_id: pasto.id,
        quantity: 52,
        confinement_site_id: site.id,
        charge_type: "por_cabeca",
        charge_value: 12.5,
      });
      check("abre com cobrança por cabeça informada", r.ok, r.ok ? "" : `${r.code}: ${r.message}`);
      const stayId = r.ok ? r.data.id : "";

      const contas = await db.financialEntry.findMany({ where: { related_id: stayId } });
      check("nasce EXATAMENTE um lançamento, nunca um por cabeça", contas.length === 1, String(contas.length));
      check(
        "com o valor gravado LITERAL: 12,5, não 12,5 × 52 (650) nem qualquer outra conta",
        contas[0] != null && Number(contas[0].amount) === 12.5,
        contas[0] ? String(contas[0].amount) : "nenhum",
      );
      check("é despesa, como o boitel", contas[0]?.entry_type === "expense", contas[0]?.entry_type);
      check(
        "e soma separado do resto do rebanho: related_module = confinamento",
        contas[0]?.related_module === "confinamento",
        contas[0]?.related_module,
      );
    }

    console.log("\n11. O retorno ao pasto grava o pasto informado, e recusa pasto de outra propriedade (§18)");
    {
      // stayA segue aberta (37 confinados, nunca fechada nas seções 2 a 6):
      // é o teste do §18 ao pé da letra, no tipo que o documento cita.
      const outraFazenda = await db.property.create({ data: scoped({ name: "Fazenda M51 (outra)" }) });
      const pastoErrado = await db.pasture.create({
        data: scoped({ property_id: outraFazenda.id, name: "Pasto de outra fazenda", area_hectares: 5 }),
      });

      const confinadosAntes = soma(await getPositions(db, { owner: "proprio", situation: "confinamento" }));
      const noPastoAntes = soma(
        await getPositions(db, { owner: "proprio", situation: "presente", pasture_id: pasto.id }),
      );

      // A PONTA QUE FALTA: pasto de OUTRA propriedade precisa ser recusado,
      // não gravado em silêncio.
      const errado = await closeStay(db, stayA, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 5, pasture_id: pastoErrado.id }],
      });
      check(
        "retorno para pasto de OUTRA propriedade é recusado",
        !errado.ok && errado.code === "INVALID_PASTURE",
        errado.ok ? "passou" : errado.code,
      );
      check(
        "e nenhuma cabeça se mexe na recusa",
        soma(await getPositions(db, { owner: "proprio", situation: "confinamento" })) === confinadosAntes,
      );

      const certo = await closeStay(db, stayA, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 5, pasture_id: pasto.id }],
      });
      check(
        "retorno para o pasto certo (da mesma propriedade) é aceito",
        certo.ok,
        certo.ok ? "" : `${certo.code}: ${certo.message}`,
      );
      check(
        "e as 5 cabeças voltam PARA AQUELE pasto, não para pasto nenhum: o defeito que o §18 aponta",
        soma(await getPositions(db, { owner: "proprio", situation: "presente", pasture_id: pasto.id })) === noPastoAntes + 5,
      );
    }
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

comBanco()
  .then(() => {
    console.log(
      falhas === 0
        ? `\n✅ M51: confinamento (Módulo 30, fase 3), 0 falhas.`
        : `\n❌ M51: ${falhas} falha(s).`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((erro) => {
    console.error("\n❌ M51 quebrou:", erro);
    process.exit(1);
  });
