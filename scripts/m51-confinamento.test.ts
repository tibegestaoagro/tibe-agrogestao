import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import {
  situacaoDaEstadia,
  donoDaEstadia,
  tipoDeEnvio,
  encerramentosPermitidos,
  permiteEncerramento,
} from "@/lib/herd/stay-rules";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";

exigirBancoLocal();

/**
 * Confinamento: fase 3 do Módulo 30 (docs/superpowers/specs/
 * 2026-08-31-confinamento-fase-3-do-modulo-30.md).
 *
 * ⚠️ REESCRITA em T18 (2026-08-31): a versão anterior desta suíte era
 * "escrita cega da spec" e permanecia assim depois da implementação nascer.
 * As 34 asserções que ela tinha exercitavam só o terreno HERDADO da fase 2
 * (`openStay`/`closeStay`/`herd-ledger`/`stock-ledger`), com a estadia de
 * confinamento aberta chamando `openStay` diretamente e o local criado com
 * `db.confinementSite.create` cru. Nenhuma linha de `confinement.ts` (as
 * cinco funções que esta frente escreveu: `createConfinementSite`,
 * `openConfinementStay`, `recordConfinementFeeding`,
 * `getConfinementLotSummary`, `listConfinementLots`) nem as sete rotas em
 * `src/app/api/v1/confinement/` tinham cobertura. O caso mais nítido: a
 * seção de dias confinados lia `started_at` do banco e calculava os dias ELA
 * MESMA, então passaria intacta se a função de produção devolvesse `0` fixo.
 * Ver docs/conhecimento/portao-mede-a-relacao-que-lhe-deram.md.
 *
 * Esta versão chama as cinco funções de produção diretamente, com o contrato
 * lido em `src/lib/actions/confinement.ts` (exceção explícita do briefing
 * T18: suíte de reparo pós-implementação, não escrita cega da onda 1).
 *
 * Prova, por seção:
 *   1. As regras puras: `confinamento` sabe onde o animal fica, de quem é, o
 *      envio e os encerramentos (stay-rules.ts, terreno já testado, mantido
 *      como fumaça rápida sem banco).
 *   2. `createConfinementSite` valida o §5 (fazenda obrigatória quando
 *      próprio, contraparte quando boitel, fazenda arquivada recusada).
 *   3. `openConfinementStay` DERIVA o tipo da estadia do `ConfinementSite.type`
 *      (site próprio nunca vira estadia boitel), sem alterar o total do
 *      rebanho (§27.1) e tirando os animais da localização anterior (§7).
 *   4. `getConfinementLotSummary` calcula os dias a partir de `started_at`
 *      (§8): dois lotes com datas de entrada diferentes precisam devolver
 *      dias DIFERENTES, o que uma função de retorno fixo não passaria.
 *   5. `recordConfinementFeeding` recusa sem produto (`PRODUCT_REQUIRED`,
 *      §10 a §12) sem gravar nada, e registra vinculado à estadia quando o
 *      produto existe, reduzindo o saldo (§11).
 *   6. Site arquivado é recusado por `openConfinementStay`.
 *   7. Saída parcial deixa o restante no lote (§20).
 *   8. Venda direto do confinamento reduz o rebanho e cria a receita (§19).
 *   9. Morte reduz lote e rebanho (§21).
 *  10. A cobrança NÃO é multiplicada por nada (decisão 3 da spec), e o
 *      resumo do lote soma o mesmo valor literal (§13, §14, §24).
 *  11. O retorno ao pasto grava o pasto informado (§18), e recusa pasto de
 *      OUTRA propriedade.
 *  12. Os quatro números do §25 (`listConfinementLots`): confinados agora,
 *      confinamento próprio, boitel, lotes ativos.
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
  const { closeStay, listStays, cancelStay } = await import("@/lib/actions/herd-stays");
  const { getPositions, recordMovement } = await import("@/lib/actions/herd-ledger");
  const { recordStockMovement, getStockBalance } = await import("@/lib/actions/stock-ledger");
  const {
    createConfinementSite,
    archiveConfinementSite,
    openConfinementStay,
    recordConfinementFeeding,
    getConfinementLotSummary,
    listConfinementLots,
  } = await import("@/lib/actions/confinement");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M51 ${stamp}`, document: `M51${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  const soma = (posicoes: { quantity: number }[]) => posicoes.reduce((s, p) => s + p.quantity, 0);

  // A pendência do WhatsApp é guardada por (tenant, usuário) no Redis, e o
  // `HerdStay` grava `recorded_by_user_id` com chave estrangeira: o id
  // precisa ser de um usuário de verdade, não uma string inventada.
  const usuarioDoTeste = (
    await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Produtor M51",
        email: `m51-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
      },
    })
  ).id;

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M51" }) });
    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto M51", area_hectares: 40 }),
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

    console.log("\n2. createConfinementSite valida o §5 (fazenda obrigatória quando próprio, contraparte quando boitel)");
    let site: { id: string } | null = null;
    let siteBoitel: { id: string } | null = null;
    {
      const semFazenda = await createConfinementSite(db, { name: "Sem fazenda", type: "proprio" });
      check(
        "proprio sem property_id é recusado",
        !semFazenda.ok && semFazenda.code === "VALIDATION_ERROR" && semFazenda.field === "property_id",
        semFazenda.ok ? "passou" : `${semFazenda.code} (${semFazenda.field})`,
      );

      const semContraparte = await createConfinementSite(db, { name: "Sem contraparte", type: "boitel" });
      check(
        "boitel sem counterparty_name é recusado",
        !semContraparte.ok && semContraparte.code === "VALIDATION_ERROR" && semContraparte.field === "counterparty_name",
        semContraparte.ok ? "passou" : `${semContraparte.code} (${semContraparte.field})`,
      );

      const fazendaArquivada = await db.property.create({ data: scoped({ name: "Fazenda arquivada M51" }) });
      await db.property.update({ where: { id: fazendaArquivada.id }, data: { archived_at: new Date() } });
      const emArquivada = await createConfinementSite(db, {
        name: "Tentativa em fazenda arquivada",
        type: "proprio",
        property_id: fazendaArquivada.id,
      });
      check(
        "proprio numa fazenda arquivada é recusado",
        !emArquivada.ok && emArquivada.code === "PROPERTY_ARCHIVED",
        emArquivada.ok ? "passou" : emArquivada.code,
      );

      const rProprio = await createConfinementSite(db, {
        name: "Confinamento Sede",
        type: "proprio",
        property_id: fazenda.id,
        capacity: 500,
      });
      check("site próprio é criado", rProprio.ok, rProprio.ok ? "" : `${rProprio.code}: ${rProprio.message}`);
      site = rProprio.ok ? rProprio.data : null;

      const rBoitel = await createConfinementSite(db, {
        name: "Boitel Vizinho",
        type: "boitel",
        counterparty_name: "Fazenda Vizinha LTDA",
      });
      check("site boitel é criado", rBoitel.ok, rBoitel.ok ? "" : `${rBoitel.code}: ${rBoitel.message}`);
      siteBoitel = rBoitel.ok ? rBoitel.data : null;
    }

    console.log(
      "\n3. openConfinementStay DERIVA o tipo da estadia do ConfinementSite.type (site próprio nunca vira estadia boitel)",
    );
    let stayA = "";
    {
      const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));

      const r = await openConfinementStay(db, {
        confinement_site_id: site?.id ?? "",
        category_id: "macho_25_36",
        quantity: 37,
        pasture_id: pasto.id,
        charge_type: "fechado",
        charge_value: 4500,
      });
      check("a estadia no site próprio abre", r.ok, r.ok ? "" : `${r.code}: ${r.message}`);
      stayA = r.ok ? r.data.id : "";
      check(
        "um site PRÓPRIO vira estadia do tipo `confinamento`, não `boitel`",
        r.ok && r.data.type === "confinamento",
        r.ok ? r.data.type : `${r.code}`,
      );

      const rBoitelStay = await openConfinementStay(db, {
        confinement_site_id: siteBoitel?.id ?? "",
        category_id: "macho_25_36",
        property_id: fazenda.id,
        quantity: 21,
        pasture_id: pasto.id,
        charge_type: "por_cabeca",
        charge_value: 3,
      });
      check(
        "um site BOITEL vira estadia do tipo `boitel`, não `confinamento`: a mesma função distingue os dois sentidos",
        rBoitelStay.ok && rBoitelStay.data.type === "boitel",
        rBoitelStay.ok ? rBoitelStay.data.type : `${rBoitelStay.code}`,
      );

      const proprioDepois = soma(await getPositions(db, { owner: "proprio" }));
      check(
        "o total próprio não muda com as duas entradas (§27.1)",
        proprioDepois === proprioAntes,
        `${proprioDepois} vs ${proprioAntes}`,
      );

      const presente = soma(await getPositions(db, { owner: "proprio", situation: "presente" }));
      const confinados = soma(await getPositions(db, { owner: "proprio", situation: "confinamento" }));
      const emBoitel = soma(await getPositions(db, { owner: "proprio", situation: "boitel" }));
      check("os 37 + 21 saíram do pasto (500 - 37 - 21 = 442)", presente === 442, String(presente));
      check("os 37 aparecem na situação `confinamento`", confinados === 37, String(confinados));
      check("os 21 aparecem na situação `boitel`, separados (§7)", emBoitel === 21, String(emBoitel));
    }

    console.log(
      "\n4. getConfinementLotSummary calcula os DIAS a partir de `started_at` (§8): reprova se a função devolver um número fixo",
    );
    {
      const dezDiasAtras = new Date(Date.now() - 10 * DIA_MS);
      const tresDiasAtras = new Date(Date.now() - 3 * DIA_MS);

      const r10 = await openConfinementStay(db, {
        confinement_site_id: site?.id ?? "",
        category_id: "macho_25_36",
        quantity: 5,
        pasture_id: pasto.id,
        started_at: dezDiasAtras,
      });
      check("abre com entrada há dez dias", r10.ok, r10.ok ? "" : `${r10.code}: ${r10.message}`);
      const stay10 = r10.ok ? r10.data.id : "";

      const r3 = await openConfinementStay(db, {
        confinement_site_id: site?.id ?? "",
        category_id: "macho_25_36",
        quantity: 5,
        pasture_id: pasto.id,
        started_at: tresDiasAtras,
      });
      check("abre com entrada há três dias", r3.ok, r3.ok ? "" : `${r3.code}: ${r3.message}`);
      const stay3 = r3.ok ? r3.data.id : "";

      const resumo10 = await getConfinementLotSummary(db, stay10);
      const resumo3 = await getConfinementLotSummary(db, stay3);
      check(
        "o lote de dez dias atrás mostra 10 dias confinados",
        resumo10.ok && resumo10.data.days_confined === 10,
        resumo10.ok ? String(resumo10.data.days_confined) : `${resumo10.code}`,
      );
      check(
        "o lote de três dias atrás mostra 3, um número DIFERENTE do outro: uma função de retorno fixo (ou 0) falharia num dos dois",
        resumo3.ok && resumo3.data.days_confined === 3,
        resumo3.ok ? String(resumo3.data.days_confined) : `${resumo3.code}`,
      );
      check(
        "a quantidade do resumo é a que entrou, ainda sem saída",
        resumo10.ok && resumo10.data.quantity === 5,
        resumo10.ok ? String(resumo10.data.quantity) : "",
      );
      check("sem alimentação lançada, a lista vem vazia", resumo10.ok && resumo10.data.feeding.length === 0);
      check(
        "sem cobrança informada, o custo financeiro é zero",
        resumo10.ok && resumo10.data.financial_cost === 0,
        resumo10.ok ? String(resumo10.data.financial_cost) : "",
      );
    }

    console.log(
      "\n5. recordConfinementFeeding: recusa sem produto (PRODUCT_REQUIRED, §10 a §12), registra e reduz o saldo quando informado (§11)",
    );
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

      const semProduto = await recordConfinementFeeding(db, { stay_id: stayA, quantity: 50 });
      check(
        "sem product_id a ação RECUSA com PRODUCT_REQUIRED",
        !semProduto.ok && semProduto.code === "PRODUCT_REQUIRED" && semProduto.field === "product_id",
        semProduto.ok ? "passou" : `${semProduto.code} (${semProduto.field})`,
      );

      const movimentosAntes = await db.stockMovement.count({ where: { stay_id: stayA } });
      check("e NADA fica gravado: nenhum StockMovement nasce da recusa", movimentosAntes === 0, String(movimentosAntes));

      const antes = soma(await getStockBalance(db, { product_id: racao.id, property_id: fazenda.id }));
      check("2000kg comprados para o confinamento", antes === 2000, String(antes));

      const uso = await recordConfinementFeeding(db, { stay_id: stayA, quantity: 180, product_id: racao.id });
      check("com product_id a alimentação é registrada", uso.ok, uso.ok ? "" : `${uso.code}: ${uso.message}`);

      const depois = soma(await getStockBalance(db, { product_id: racao.id, property_id: fazenda.id }));
      check("e o saldo cai os 180kg usados", depois === antes - 180, `${depois} vs ${antes - 180}`);

      const movimento =
        uso.ok && uso.data.stock_movement_id
          ? await db.stockMovement.findUnique({ where: { id: uso.data.stock_movement_id } })
          : null;
      check(
        "a utilização fica VINCULADA à estadia (§11), não solta",
        movimento?.stay_id === stayA,
        movimento?.stay_id ?? "null",
      );

      const resumo = await getConfinementLotSummary(db, stayA);
      const linha = resumo.ok ? resumo.data.feeding.find((f) => f.product_id === racaoId) : undefined;
      check(
        "e o resumo do lote reflete a alimentação por produto (§13)",
        linha?.quantity === 180,
        resumo.ok ? JSON.stringify(resumo.data.feeding) : `${resumo.code}`,
      );
    }

    console.log("\n6. Site arquivado é recusado: openConfinementStay não abre estadia nele");
    {
      const siteTemp = await createConfinementSite(db, { name: "Confinamento a arquivar", type: "proprio", property_id: fazenda.id });
      check("site auxiliar criado para o teste", siteTemp.ok, siteTemp.ok ? "" : `${siteTemp.code}`);
      const siteTempId = siteTemp.ok ? siteTemp.data.id : "";

      const arquivado = await archiveConfinementSite(db, siteTempId);
      check(
        "o site é arquivado",
        arquivado.ok && arquivado.data.archived_at != null,
        arquivado.ok ? String(arquivado.data.archived_at) : `${arquivado.code}`,
      );

      const tentativa = await openConfinementStay(db, {
        confinement_site_id: siteTempId,
        category_id: "macho_25_36",
        quantity: 4,
        pasture_id: pasto.id,
      });
      check(
        "abrir estadia num site arquivado é recusado",
        !tentativa.ok && tentativa.code === "CONFINEMENT_SITE_ARCHIVED",
        tentativa.ok ? "passou" : tentativa.code,
      );
    }

    console.log("\n7. Saída parcial deixa o restante no lote (§20)");
    let stayParcial = "";
    {
      const aberta = await openConfinementStay(db, {
        confinement_site_id: site?.id ?? "",
        category_id: "macho_25_36",
        quantity: 30,
        pasture_id: pasto.id,
      });
      check("estadia de 30 cabeças abre para o teste de saída parcial", aberta.ok, aberta.ok ? "" : `${aberta.code}: ${aberta.message}`);
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
      const aberta = await openConfinementStay(db, {
        confinement_site_id: site?.id ?? "",
        category_id: "macho_25_36",
        quantity: 15,
        pasture_id: pasto.id,
      });
      check("estadia de 15 cabeças abre para o teste de morte", aberta.ok, aberta.ok ? "" : `${aberta.code}: ${aberta.message}`);
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

    console.log("\n10. A cobrança NÃO é multiplicada por nada (decisão 3), e o resumo soma o valor literal (§13, §14, §24)");
    {
      const r = await openConfinementStay(db, {
        confinement_site_id: site?.id ?? "",
        category_id: "macho_25_36",
        quantity: 52,
        pasture_id: pasto.id,
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

      const resumo = await getConfinementLotSummary(db, stayId);
      check(
        "e getConfinementLotSummary soma o MESMO valor literal, não 12,5 × 52",
        resumo.ok && resumo.data.financial_cost === 12.5,
        resumo.ok ? String(resumo.data.financial_cost) : `${resumo.code}`,
      );
    }

    console.log("\n11. O retorno ao pasto grava o pasto informado, e recusa pasto de outra propriedade (§18)");
    {
      // stayA segue aberta (37 confinados, nunca fechada nas seções 3 a 5):
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

    console.log(
      "\n12. Os quatro números do §25 (`listConfinementLots`): confinados agora, confinamento próprio, boitel, lotes ativos",
    );
    {
      const siteProprio2 = await createConfinementSite(db, {
        name: "Confinamento M51 (números)",
        type: "proprio",
        property_id: fazenda.id,
      });
      const siteBoitel2 = await createConfinementSite(db, {
        name: "Boitel M51 (números)",
        type: "boitel",
        counterparty_name: "Boitel Números LTDA",
      });
      check("sites auxiliares criados", siteProprio2.ok && siteBoitel2.ok);

      const p1 = await openConfinementStay(db, {
        confinement_site_id: siteProprio2.ok ? siteProprio2.data.id : "",
        category_id: "macho_25_36",
        quantity: 12,
        pasture_id: pasto.id,
      });
      const p2 = await openConfinementStay(db, {
        confinement_site_id: siteProprio2.ok ? siteProprio2.data.id : "",
        category_id: "macho_25_36",
        quantity: 8,
        pasture_id: pasto.id,
      });
      const b1 = await openConfinementStay(db, {
        confinement_site_id: siteBoitel2.ok ? siteBoitel2.data.id : "",
        category_id: "macho_25_36",
        property_id: fazenda.id,
        quantity: 15,
        pasture_id: pasto.id,
      });
      check(
        "os três lotes auxiliares abrem",
        p1.ok && p2.ok && b1.ok,
        [p1, p2, b1].map((r) => (r.ok ? "" : r.code)).join(","),
      );

      const idsDesteBloco = new Set([p1.ok ? p1.data.id : "", p2.ok ? p2.data.id : "", b1.ok ? b1.data.id : ""]);

      const lotes = await listConfinementLots(db, { apenas_abertas: true });
      const doBloco = lotes.filter((l) => idsDesteBloco.has(l.id));

      const confinadosAgora = doBloco.reduce((s, l) => s + l.quantity, 0);
      const confinamentoProprio = doBloco.filter((l) => l.type === "confinamento").reduce((s, l) => s + l.quantity, 0);
      const boitel = doBloco.filter((l) => l.type === "boitel").reduce((s, l) => s + l.quantity, 0);
      const lotesAtivos = doBloco.length;

      check("confinados agora: 12 + 8 + 15 = 35", confinadosAgora === 35, String(confinadosAgora));
      check("confinamento próprio: 12 + 8 = 20, separado do boitel", confinamentoProprio === 20, String(confinamentoProprio));
      check("boitel: 15, separado do próprio", boitel === 15, String(boitel));
      check("lotes ativos: os três, nenhum a mais nem a menos", lotesAtivos === 3, String(lotesAtivos));

      const soDoSiteProprio = await listConfinementLots(db, {
        confinement_site_id: siteProprio2.ok ? siteProprio2.data.id : "",
      });
      const doSiteNesteBloco = soDoSiteProprio.filter((l) => idsDesteBloco.has(l.id));
      check(
        "o filtro por confinement_site_id devolve só os lotes daquele site (2, não os 3)",
        doSiteNesteBloco.length === 2,
        String(doSiteNesteBloco.length),
      );
    }

    console.log("\n13. Cancelar o lote não pode deixar a conta a pagar viva");
    {
      // O defeito que este bloco trava: `cancelStay` procurava as contas com
      // `related_module: "rebanho"` fixo, e a cobrança do confinamento nasce
      // em "confinamento". A conta não era encontrada, continuava `pending`
      // para sempre, seguia em Contas a pagar, seguia pesando na DRE (que só
      // exclui `cancelled`) e seguia gerando alerta de vencimento.
      //
      // O caso do boitel (m47, seção 16) continuava passando, e é por isso que
      // ninguém viu: até 31/08 a conta dele nascia no mesmo módulo que a busca
      // citava.
      const r = await openConfinementStay(db, {
        confinement_site_id: site?.id ?? "",
        category_id: "macho_25_36",
        quantity: 9,
        pasture_id: pasto.id,
        charge_type: "fechado",
        charge_value: 4500,
      });
      check("o lote com cobrança abre", r.ok, r.ok ? "" : `${r.code}: ${r.message}`);
      const stayId = r.ok ? r.data.id : "";

      const antes = await db.financialEntry.findMany({ where: { related_id: stayId } });
      check("e nasce com a conta a pagar", antes.length === 1, String(antes.length));

      const confinadosAntes = soma(await getPositions(db, { owner: "proprio", situation: "confinamento" }));
      const cancel = await cancelStay(db, stayId, { reason: "lançado errado" });
      check("cancela", cancel.ok, cancel.ok ? "" : `${cancel.code}: ${cancel.message}`);

      // Busca SEM filtro de módulo, de propósito: com o filtro, uma conta viva
      // em outro módulo sairia daqui como "zero contas" e o teste aprovaria o
      // defeito. É a mesma lição da nota do cofre sobre o portão medir a
      // relação que lhe deram.
      const depois = await db.financialEntry.findMany({ where: { related_id: stayId } });
      check(
        "e a conta a pagar some, em módulo NENHUM: não sobra órfã",
        depois.length === 0,
        depois.map((c) => `${c.related_module}/${c.status}`).join(",") || "0",
      );
      check(
        "e as 9 cabeças voltam a sair do confinamento",
        soma(await getPositions(db, { owner: "proprio", situation: "confinamento" })) === confinadosAntes - 9,
      );
    }

    console.log("\n14. As SEIS formas de cobrança, inclusive as duas do §15 e do §16 do cliente");
    {
      const { HERD_CHARGE_TYPES } = await import("@/lib/actions/herd-ledger");
      const { HerdChargeType } = await import("@/generated/prisma/enums");

      // Esta é a asserção que impede a lista paralela de voltar. Ela ERA uma
      // lista à mão com quatro valores, e ficou para trás quando o enum ganhou
      // `por_dia` e `por_cabeca_dia`: o Select da tela oferecia as seis, a
      // rota recusava duas com 422, e o `tsc` não reclamava, porque
      // `satisfies readonly HerdChargeType[]` aceita subconjunto.
      const doEnum = Object.values(HerdChargeType).sort();
      check(
        "HERD_CHARGE_TYPES cobre o enum INTEIRO, sem lista paralela para ficar para trás",
        JSON.stringify([...HERD_CHARGE_TYPES].sort()) === JSON.stringify(doEnum),
        `${HERD_CHARGE_TYPES.length} contra ${doEnum.length}: ${doEnum.filter((v) => !HERD_CHARGE_TYPES.includes(v)).join(",") || "nenhuma faltando"}`,
      );

      // O exemplo literal do §16: "30 animais para o Boitel Boa Engorda,
      // cobrança de R$ 12,00 por cabeça/dia".
      const r = await openConfinementStay(db, {
        confinement_site_id: site?.id ?? "",
        category_id: "macho_25_36",
        quantity: 30,
        pasture_id: pasto.id,
        charge_type: "por_cabeca_dia",
        charge_value: 12,
      });
      check("o §16 abre: 30 cabeças a R$ 12,00 por cabeça/dia", r.ok, r.ok ? "" : `${r.code}: ${r.message}`);
      const stayId = r.ok ? r.data.id : "";
      const estadia = await db.herdStay.findUnique({ where: { id: stayId } });
      check(
        "e a forma de cobrança fica GRAVADA como por_cabeca_dia, não trocada por outra",
        estadia?.charge_type === "por_cabeca_dia",
        estadia?.charge_type ?? "nenhuma",
      );
      const conta = await db.financialEntry.findFirst({ where: { related_id: stayId } });
      check(
        "e o valor continua LITERAL: 12, nunca 12 × 30 nem 12 × dias (decisão 3)",
        conta != null && Number(conta.amount) === 12,
        conta ? String(conta.amount) : "nenhuma conta",
      );

      const porDia = await openConfinementStay(db, {
        confinement_site_id: site?.id ?? "",
        category_id: "macho_25_36",
        quantity: 5,
        pasture_id: pasto.id,
        charge_type: "por_dia",
        charge_value: 300,
      });
      check("e `por_dia`, a outra forma nova, também abre", porDia.ok, porDia.ok ? "" : `${porDia.code}`);
    }

    console.log("\n15. Os handlers do WhatsApp: o 'sim' que aceita a sugestão, e o boitel que existe");
    {
      // Os quatro handlers do Confinamento nasceram no T08 sem suíte nenhuma,
      // enquanto os irmãos (`herd`, `negociacao`, `permuta`, `estoque`) têm as
      // suas desde sempre. Estas asserções cobrem os dois defeitos de conversa,
      // não o fluxo inteiro.
      const { registrarEntradaConfinamento, registrarAlimentacaoConfinamento } = await import(
        "@/lib/actions/whatsapp-handlers/confinamento"
      );
      const { clearPendingConfinement, loadPendingConfinement } = await import(
        "@/lib/actions/confinamento-pending"
      );

      const ctx = (
        parameters: Record<string, unknown>,
        opts: { confirmed?: boolean } = {},
      ): HandlerCtx => ({
        db,
        tenant_id: tenant.id,
        role: "OWNER",
        activeProfiles: ["fazenda"],
        parameters,
        confirmed: opts.confirmed ?? false,
        explicitNo: false,
        user_id: usuarioDoTeste,
      });

      await clearPendingConfinement(tenant.id, usuarioDoTeste);

      // Cenário próprio, isolado: a esta altura já existem duas fazendas e
      // três confinamentos no tenant, e o handler perguntaria "em qual?" antes
      // de chegar na pergunta do pasto, que é o que esta seção testa.
      const fazendaWa = await db.property.create({ data: scoped({ name: "Fazenda Zap M51" }) });
      const pastoWa = await db.pasture.create({
        data: scoped({ property_id: fazendaWa.id, name: "Pasto Zap", area_hectares: 12 }),
      });
      const saldoWa = await recordMovement(db, {
        movement_type: "saldo_inicial",
        quantity: 50,
        to: {
          category_id: "macho_25_36",
          property_id: fazendaWa.id,
          pasture_id: pastoWa.id,
          situation: "presente",
          owner: "proprio",
        },
      });
      check("o saldo do cenário isolado nasce", saldoWa.ok, saldoWa.ok ? "" : saldoWa.code);
      const siteWa = await createConfinementSite(db, {
        name: "Confinamento Zap",
        type: "proprio",
        property_id: fazendaWa.id,
      });
      check("cenário isolado do WhatsApp montado", siteWa.ok, siteWa.ok ? "" : siteWa.code);

      const pedido = {
        categoria: "macho_25_36",
        quantidade: 4,
        fazenda: "Zap M51",
        confinamento: "Confinamento Zap",
      };

      // O saldo desta categoria vive em `Pasto Zap`, e o produtor não cita
      // pasto: é o cenário do §7, o mesmo que fazia o agente dizer que ele
      // tem zero animais.
      const pergunta = await registrarEntradaConfinamento(ctx(pedido));
      check(
        "sem citar pasto, o agente diz onde o saldo está e pergunta",
        pergunta.reply_text.includes("Registro por lá?"),
        pergunta.reply_text.slice(0, 90),
      );

      const guardado = await loadPendingConfinement(tenant.id, usuarioDoTeste);
      check(
        "e guarda a SUGESTÃO junto do pedido, não só a pergunta",
        guardado?.sugestao_pasto === pastoWa.name,
        `${guardado?.aguardando}/${guardado?.sugestao_pasto ?? "nenhuma"}`,
      );

      // O defeito: "sim" caía no ramo de confirmação, via `aguardando: "pasto"`
      // em vez de `"confirmacao"`, e respondia "Não tenho nenhuma entrada
      // esperando confirmação", perdendo categoria e quantidade.
      const confinadosAntes = soma(await getPositions(db, { owner: "proprio", situation: "confinamento" }));
      const sim = await registrarEntradaConfinamento(ctx({}, { confirmed: true }));
      check(
        "e o 'sim' NÃO responde que não há nada esperando confirmação",
        !sim.reply_text.includes("Não tenho nenhuma entrada esperando confirmação"),
        sim.reply_text.slice(0, 90),
      );
      // "Registro por lá?" já É o pedido de registrar, então o "sim" grava:
      // não há segunda confirmação, e os dados vêm do pendente, nunca do que
      // o classificador remontou.
      check(
        "o 'sim' aceita a sugestão e grava as 4 cabeças, com categoria e quantidade preservadas",
        soma(await getPositions(db, { owner: "proprio", situation: "confinamento" })) ===
          confinadosAntes + 4,
        sim.reply_text.slice(0, 90),
      );
      const noPasto = await db.herdMovement.findFirst({
        where: { movement_type: "envio_confinamento", from_pasture_id: pastoWa.id },
      });
      check(
        "e sai do pasto que a pergunta sugeriu, não de 'sem pasto informado'",
        noPasto != null && noPasto.quantity === 4,
        noPasto ? String(noPasto.quantity) : "nenhum movimento saindo do Pasto Zap",
      );

      // O outro defeito: alimentar lote de boitel era negado com uma frase
      // falsa, porque o handler filtrava `type: "confinamento"`.
      await clearPendingConfinement(tenant.id, usuarioDoTeste);
      const alimentar = await registrarAlimentacaoConfinamento(
        ctx({ produto: "produto que não existe", quantidade: 5 }),
      );
      check(
        "e alimentar não responde mais que não existe lote aberto",
        !alimentar.reply_text.includes("Você não tem lote em confinamento aberto agora"),
        alimentar.reply_text.slice(0, 90),
      );
      await clearPendingConfinement(tenant.id, usuarioDoTeste);
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
