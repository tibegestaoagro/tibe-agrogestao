import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import {
  diaDoProdutor,
  inicioDoDia,
  fimDoDia,
  somarDias,
  diasEntre,
  janelasDoPeriodo,
} from "@/lib/milk/periodos";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";

exigirBancoLocal();

/**
 * Área Leite, fase 1 (Módulo 32). Ver docs/specs/module-32-area-leite.md.
 *
 * Prova, por seção:
 *   1. O calendário do produtor: dia, limites de dia e as seis janelas do §11,
 *      sem banco. É o alicerce de todo número da tela, e um erro de fuso aqui
 *      move a produção de hoje para ontem às 21h.
 *   2. `recordLactationEntry` e o dobramento do §4/§7: `definir` fixa,
 *      `entrada` soma, `saida` subtrai, e a contagem NUNCA é gravada.
 *   3. A contagem antes do primeiro `definir` é `null`, e não zero.
 *   4. Saída maior que a contagem é recusada com `field: "quantity"`, e a
 *      conferência vale para os dias SEGUINTES ao registro, não só o dele.
 *   5. `recordMilkProduction` grava uma linha por turno (§9.2) e recusa as
 *      duas formas juntas (`FORMAS_MISTURADAS`).
 *   6. `vacas_em_lactacao` no registro de produção grava um `LactationEntry`,
 *      e NÃO uma coluna de produção: uma fonte só para o mesmo número.
 *   7. Cancelar tira das somas e mantém na lista (§37.11).
 *   8. A média por vaca é litros por vaca/dia, com os dias sem contagem fora
 *      dos DOIS lados da divisão (§10).
 *   9. O lote leiteiro não conta cabeça e recusa lote de outra fazenda.
 *  10. A Área Leite NÃO altera o rebanho (§37.1, §37.2, §37.4).
 *  11. Os handlers do WhatsApp (§36): "não" cancela, o "sim" executa o que foi
 *      MOSTRADO, e os três verbos de lactação não se confundem.
 *
 * Roda: `npm run test:m52`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🥛 M52: Área Leite, fase 1 (Módulo 32)\n");

// ── 1. O calendário do produtor, sem banco ───────────────────────────────

console.log("1. O calendário do produtor (§11)");

{
  // 2026-09-02 às 00:30 UTC ainda é 01/09 para quem está em Sao_Paulo (UTC-3).
  // Este é o defeito que o §11 sofreria calculado em UTC: a produção da noite
  // apareceria no dia seguinte.
  const meiaNoiteEMeiaUTC = new Date("2026-09-02T00:30:00.000Z");
  check(
    "00:30 UTC de 02/09 ainda é 01/09 para o produtor",
    diaDoProdutor(meiaNoiteEMeiaUTC) === "2026-09-01",
    diaDoProdutor(meiaNoiteEMeiaUTC),
  );

  const inicio = inicioDoDia("2026-09-01");
  check(
    "o dia do produtor começa às 03:00 UTC",
    inicio.toISOString() === "2026-09-01T03:00:00.000Z",
    inicio.toISOString(),
  );
  check(
    "o limite do dia é o começo do dia seguinte (exclusivo)",
    fimDoDia("2026-09-01").toISOString() === inicioDoDia("2026-09-02").toISOString(),
  );
  check(
    "um instante dentro do dia cai entre os dois limites",
    new Date("2026-09-01T23:00:00.000Z") >= inicio &&
      new Date("2026-09-01T23:00:00.000Z") < fimDoDia("2026-09-01"),
  );

  check("somarDias atravessa o fim do mês", somarDias("2026-08-31", 1) === "2026-09-01");
  check("somarDias volta no tempo", somarDias("2026-01-01", -1) === "2025-12-31");
  check("diasEntre inclui as duas pontas", diasEntre("2026-09-01", "2026-09-03").length === 3);

  const janelas = janelasDoPeriodo(new Date("2026-09-10T15:00:00.000Z"));
  const porChave = Object.fromEntries(janelas.map((j) => [j.chave, j]));
  check("as seis janelas do §11 existem", janelas.length === 6);
  check("hoje é um dia só", porChave.hoje.de === "2026-09-10" && porChave.hoje.ate === "2026-09-10");
  check("ontem é o dia anterior", porChave.ontem.de === "2026-09-09");
  check(
    "semana são SETE dias corridos terminando hoje, não a semana do calendário",
    porChave.semana.de === "2026-09-04" && porChave.semana.ate === "2026-09-10",
    `${porChave.semana.de} a ${porChave.semana.ate}`,
  );
  check(
    "o mês em curso termina HOJE, não no fim do mês",
    porChave.mes.de === "2026-09-01" && porChave.mes.ate === "2026-09-10",
  );
  check(
    "o mês anterior é o mês inteiro",
    porChave.mes_anterior.de === "2026-08-01" && porChave.mes_anterior.ate === "2026-08-31",
    `${porChave.mes_anterior.de} a ${porChave.mes_anterior.ate}`,
  );
  check("o ano começa em 1º de janeiro", porChave.ano.de === "2026-01-01");

  // Janeiro é o caso que quebra a conta ingênua de "mês menos um".
  const emJaneiro = janelasDoPeriodo(new Date("2026-01-05T15:00:00.000Z"));
  const anterior = emJaneiro.find((j) => j.chave === "mes_anterior")!;
  check(
    "em janeiro, o mês anterior é dezembro do ano passado",
    anterior.de === "2025-12-01" && anterior.ate === "2025-12-31",
    `${anterior.de} a ${anterior.ate}`,
  );
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { createMilkGroup, listMilkGroups, setMilkGroupArchived } = await import(
    "@/lib/actions/milk-groups"
  );
  const {
    recordLactationEntry,
    cancelLactationEntry,
    contagemAtual,
    contagemPorDia,
    listLactationEntries,
  } = await import("@/lib/actions/milk-lactation");
  const {
    recordMilkProduction,
    cancelMilkProduction,
    listMilkProduction,
    getResumoDoLeite,
  } = await import("@/lib/actions/milk-production");
  const { getPositions, recordMovement } = await import("@/lib/actions/herd-ledger");
  const {
    registrarProducaoLeite,
    definirVacasEmLactacao,
    registrarEntradaLactacao,
    registrarSaidaLactacao,
  } = await import("@/lib/actions/whatsapp-handlers/leite");
  const { clearPendingMilk } = await import("@/lib/actions/leite-pending");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M52 ${stamp}`, document: `M52${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  const usuarioDoTeste = (
    await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Produtor M52",
        email: `m52-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
      },
    })
  ).id;

  /** Meio-dia local de um dia do produtor: longe de qualquer borda de fuso. */
  const meioDia = (diaISO: string) => new Date(`${diaISO}T15:00:00.000Z`);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M52" }) });
    const outraFazenda = await db.property.create({ data: scoped({ name: "Outra M52" }) });
    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto M52", area_hectares: 20 }),
    });

    // ── 2. O dobramento da lactação ──────────────────────────────────────

    console.log("\n2. Vacas em lactação: o dobramento do §4 e do §7");

    const semRegistro = await contagemAtual(db, fazenda.id, meioDia("2026-09-01"));
    check(
      "antes do primeiro registro a contagem é NULL, não zero",
      semRegistro === null,
      String(semRegistro),
    );

    const definir = await recordLactationEntry(db, {
      property_id: fazenda.id,
      type: "definir",
      quantity: 30,
      recorded_at: meioDia("2026-09-01"),
      pasture_id: pasto.id,
    });
    check("`definir` é aceito", definir.ok, definir.ok ? "" : definir.message);
    check(
      "a contagem passa a ser o valor definido",
      (await contagemAtual(db, fazenda.id, meioDia("2026-09-01"))) === 30,
    );

    await recordLactationEntry(db, {
      property_id: fazenda.id,
      type: "entrada",
      quantity: 4,
      recorded_at: meioDia("2026-09-02"),
    });
    check(
      "`entrada` soma: 30 + 4 = 34",
      (await contagemAtual(db, fazenda.id, meioDia("2026-09-02"))) === 34,
    );

    await recordLactationEntry(db, {
      property_id: fazenda.id,
      type: "saida",
      quantity: 3,
      recorded_at: meioDia("2026-09-03"),
    });
    check(
      "`saida` subtrai: 34 - 3 = 31",
      (await contagemAtual(db, fazenda.id, meioDia("2026-09-03"))) === 31,
    );

    check(
      "a contagem de ONTEM não muda quando hoje muda: o dobramento é por data",
      (await contagemAtual(db, fazenda.id, meioDia("2026-09-01"))) === 30,
    );

    // O saldo não é gravado em lugar nenhum (invariante 2). Se existisse uma
    // coluna, ela apareceria aqui.
    const colunas = Object.keys(
      (await db.lactationEntry.findFirst({ where: { property_id: fazenda.id } }))!,
    );
    check(
      "nenhuma coluna de saldo no registro de lactação (invariante 2)",
      !colunas.some((c) => /total|saldo|balance|current/i.test(c)),
      colunas.join(","),
    );

    // ── 3. Um `definir` posterior REESCREVE, não soma ────────────────────

    console.log("\n3. `definir` reescreve a contagem, não acumula");

    await recordLactationEntry(db, {
      property_id: fazenda.id,
      type: "definir",
      quantity: 50,
      recorded_at: meioDia("2026-09-04"),
    });
    check(
      "depois de um `definir` de 50, a contagem é 50 e não 81",
      (await contagemAtual(db, fazenda.id, meioDia("2026-09-04"))) === 50,
    );

    // ── 4. A recusa de contagem negativa ─────────────────────────────────

    console.log("\n4. Saída maior que a contagem é recusada (§6.2 da spec)");

    const demais = await recordLactationEntry(db, {
      property_id: fazenda.id,
      type: "saida",
      quantity: 80,
      recorded_at: meioDia("2026-09-05"),
    });
    check("saída de 80 sobre 50 é recusada", !demais.ok);
    check(
      "a recusa aponta o campo `quantity`",
      !demais.ok && demais.field === "quantity",
      demais.ok ? "" : String(demais.field),
    );
    check(
      "a recusa diz quantas existem",
      !demais.ok && demais.message.includes("50"),
      demais.ok ? "" : demais.message,
    );
    check(
      "nada foi gravado pela recusa",
      (await contagemAtual(db, fazenda.id, meioDia("2026-09-05"))) === 50,
    );

    // A versão retroativa do mesmo erro: 01/09 tinha 30, e uma saída de 40
    // naquele dia fecharia 01/09 em -10. O dia do registro é o que a conta
    // ingênua olharia; aqui interessa que TODOS os dias seguintes também são
    // conferidos, e é isso que a próxima asserção prova.
    const retroativa = await recordLactationEntry(db, {
      property_id: fazenda.id,
      type: "saida",
      quantity: 40,
      recorded_at: meioDia("2026-09-01"),
    });
    check("saída retroativa que deixaria o passado negativo é recusada", !retroativa.ok);

    // Esta é a que uma conferência "só do dia do registro" deixaria passar:
    // em 02/09 havia 34, então tirar 34 fecha o próprio dia em zero, mas o
    // `definir` de 04/09 é posterior e não conserta 03/09, que ficaria em -3.
    const soODiaFecha = await recordLactationEntry(db, {
      property_id: fazenda.id,
      type: "saida",
      quantity: 34,
      recorded_at: meioDia("2026-09-02"),
    });
    check(
      "saída que zera o próprio dia mas deixa o SEGUINTE negativo é recusada",
      !soODiaFecha.ok,
      soODiaFecha.ok ? "gravou" : soODiaFecha.code,
    );

    // ── 5. Produção: uma linha por turno ─────────────────────────────────

    console.log("\n5. Produção: uma linha por turno (§9)");

    const doDia = await recordMilkProduction(db, {
      property_id: fazenda.id,
      recorded_at: meioDia("2026-09-04"),
      dia: 500,
    });
    check("produção do dia inteiro grava UMA linha", doDia.ok && doDia.data.length === 1);
    check("com turno `dia`", doDia.ok && doDia.data[0].shift === "dia");

    const porOrdenha = await recordMilkProduction(db, {
      property_id: fazenda.id,
      recorded_at: meioDia("2026-09-05"),
      manha: 300,
      tarde: 180,
    });
    check(
      "duas ordenhas gravam DUAS linhas (§9.2)",
      porOrdenha.ok && porOrdenha.data.length === 2,
      porOrdenha.ok ? String(porOrdenha.data.length) : porOrdenha.message,
    );
    check(
      "com os turnos certos",
      porOrdenha.ok &&
        porOrdenha.data.map((d) => d.shift).join(",") === "manha,tarde",
      porOrdenha.ok ? porOrdenha.data.map((d) => d.shift).join(",") : "",
    );

    const misturado = await recordMilkProduction(db, {
      property_id: fazenda.id,
      recorded_at: meioDia("2026-09-06"),
      dia: 500,
      manha: 300,
    });
    check("as duas formas juntas são recusadas", !misturado.ok);
    check(
      "com o código FORMAS_MISTURADAS",
      !misturado.ok && misturado.code === "FORMAS_MISTURADAS",
      misturado.ok ? "" : misturado.code,
    );

    const vazio = await recordMilkProduction(db, {
      property_id: fazenda.id,
      recorded_at: meioDia("2026-09-06"),
    });
    check("registro sem litros nenhum é recusado", !vazio.ok);

    const negativo = await recordMilkProduction(db, {
      property_id: fazenda.id,
      recorded_at: meioDia("2026-09-06"),
      dia: -10,
    });
    check("litros negativos são recusados", !negativo.ok);

    // ── 6. O atalho do §8 grava lactação, não coluna de produção ─────────

    console.log("\n6. `vacas_em_lactacao` do §8 vira LactationEntry, não coluna");

    const antesDoAtalho = await db.lactationEntry.count({ where: { property_id: fazenda.id } });
    const comVacas = await recordMilkProduction(db, {
      property_id: fazenda.id,
      recorded_at: meioDia("2026-09-06"),
      dia: 400,
      vacas_em_lactacao: 25,
    });
    check("o registro com vacas é aceito", comVacas.ok, comVacas.ok ? "" : comVacas.message);
    check(
      "criou UM registro de lactação novo",
      (await db.lactationEntry.count({ where: { property_id: fazenda.id } })) ===
        antesDoAtalho + 1,
    );
    check(
      "e a contagem passou a ser 25",
      (await contagemAtual(db, fazenda.id, meioDia("2026-09-06"))) === 25,
    );
    const colunasProducao = Object.keys(
      (await db.milkProduction.findFirst({ where: { property_id: fazenda.id } }))!,
    );
    check(
      "a produção NÃO tem coluna de vacas: uma fonte só para o mesmo número",
      !colunasProducao.some((c) => /vaca|cow|lactation/i.test(c)),
      colunasProducao.join(","),
    );

    // ── 7. Cancelamento (§37.11) ─────────────────────────────────────────

    console.log("\n7. Cancelar tira das somas e mantém na lista (§37.11)");

    const antesDeCancelar = await getResumoDoLeite(db, fazenda.id, meioDia("2026-09-06"));
    const litrosDia6 = antesDeCancelar.periodos.find((p) => p.chave === "hoje")!.litros;
    check("06/09 soma 400 litros antes do cancelamento", litrosDia6 === 400, String(litrosDia6));

    const alvo = comVacas.ok ? comVacas.data[0].id : "";
    const cancelou = await cancelMilkProduction(db, alvo);
    check("o cancelamento é aceito", cancelou.ok);

    const depois = await getResumoDoLeite(db, fazenda.id, meioDia("2026-09-06"));
    check(
      "o registro cancelado sai da soma",
      depois.periodos.find((p) => p.chave === "hoje")!.litros === 0,
    );
    const listado = await listMilkProduction(db, { property_id: fazenda.id, limit: 50 });
    check(
      "e CONTINUA na lista, marcado",
      listado.some((r) => r.id === alvo && r.cancelled_at !== null),
    );
    check("cancelar de novo é recusado", !(await cancelMilkProduction(db, alvo)).ok);

    const lactCancelavel = await recordLactationEntry(db, {
      property_id: fazenda.id,
      type: "entrada",
      quantity: 7,
      recorded_at: meioDia("2026-09-06"),
    });
    check(
      "entrada de 7 sobe a contagem para 32",
      (await contagemAtual(db, fazenda.id, meioDia("2026-09-06"))) === 32,
    );
    if (lactCancelavel.ok) await cancelLactationEntry(db, lactCancelavel.data.id);
    check(
      "cancelar o registro de lactação recalcula a contagem para 25",
      (await contagemAtual(db, fazenda.id, meioDia("2026-09-06"))) === 25,
    );
    check(
      "e ele continua no histórico",
      (await listLactationEntries(db, { property_id: fazenda.id, limit: 50 })).some(
        (l) => lactCancelavel.ok && l.id === lactCancelavel.data.id && l.cancelled_at !== null,
      ),
    );

    // ── 8. Média por vaca (§10) ──────────────────────────────────────────

    console.log("\n8. Média por vaca: litros por vaca/dia (§10)");

    const fazendaMedia = await db.property.create({ data: scoped({ name: "Média M52" }) });

    // O exemplo literal do §10: 450 litros, 30 vacas, 15 litros por vaca.
    await recordLactationEntry(db, {
      property_id: fazendaMedia.id,
      type: "definir",
      quantity: 30,
      recorded_at: meioDia("2026-09-01"),
    });
    await recordMilkProduction(db, {
      property_id: fazendaMedia.id,
      recorded_at: meioDia("2026-09-01"),
      dia: 450,
    });

    const resumoDia1 = await getResumoDoLeite(db, fazendaMedia.id, meioDia("2026-09-01"));
    check(
      "o exemplo do §10: 450 litros / 30 vacas = 15 litros por vaca",
      resumoDia1.hoje.media_por_vaca === 15,
      String(resumoDia1.hoje.media_por_vaca),
    );

    // Agora o caso que uma média ingênua erra: o rebanho leiteiro DOBRA no
    // meio do período. Dia 1: 450 litros com 30 vacas. Dia 2: 900 com 60.
    // Litros por vaca/dia = 1350 / 90 = 15. Dividir 1350 pela contagem final
    // (60) daria 22,5 por dia, que é falso nos dois dias.
    await recordLactationEntry(db, {
      property_id: fazendaMedia.id,
      type: "definir",
      quantity: 60,
      recorded_at: meioDia("2026-09-02"),
    });
    await recordMilkProduction(db, {
      property_id: fazendaMedia.id,
      recorded_at: meioDia("2026-09-02"),
      dia: 900,
    });

    const doisDias = await getResumoDoLeite(db, fazendaMedia.id, meioDia("2026-09-02"));
    const semana = doisDias.periodos.find((p) => p.chave === "semana")!;
    check("os dois dias somam 1350 litros", semana.litros === 1350, String(semana.litros));
    check(
      "a média por vaca é 15, e não 22,5: cada dia divide pela contagem DELE",
      semana.media_por_vaca === 15,
      String(semana.media_por_vaca),
    );
    check(
      "só os dois dias com contagem entraram na conta",
      semana.dias_com_contagem === 2 && semana.dias === 7,
      `${semana.dias_com_contagem} de ${semana.dias}`,
    );

    // Produção num dia ANTERIOR ao primeiro `definir`: sem contagem conhecida,
    // aquele dia sai dos dois lados da divisão. Se entrasse só no numerador, a
    // média subiria sem que nenhuma vaca tivesse produzido mais.
    await recordMilkProduction(db, {
      property_id: fazendaMedia.id,
      recorded_at: meioDia("2026-08-30"),
      dia: 999,
    });
    const comDiaCego = await getResumoDoLeite(db, fazendaMedia.id, meioDia("2026-09-02"));
    const semanaCega = comDiaCego.periodos.find((p) => p.chave === "semana")!;
    check(
      "o dia sem contagem entra nos LITROS do período",
      semanaCega.litros === 2349,
      String(semanaCega.litros),
    );
    check(
      "mas NÃO entra na média por vaca, que continua 15",
      semanaCega.media_por_vaca === 15,
      String(semanaCega.media_por_vaca),
    );

    const fazendaMuda = await db.property.create({ data: scoped({ name: "Sem contagem M52" }) });
    await recordMilkProduction(db, {
      property_id: fazendaMuda.id,
      recorded_at: meioDia("2026-09-02"),
      dia: 100,
    });
    const resumoMudo = await getResumoDoLeite(db, fazendaMuda.id, meioDia("2026-09-02"));
    check(
      "sem contagem nenhuma, a média por vaca é NULL e não zero",
      resumoMudo.hoje.media_por_vaca === null,
      String(resumoMudo.hoje.media_por_vaca),
    );
    check(
      "e as vacas em lactação também",
      resumoMudo.hoje.vacas_em_lactacao === null,
      String(resumoMudo.hoje.vacas_em_lactacao),
    );
    check("mas os litros do dia aparecem", resumoMudo.hoje.litros === 100);

    // ── 9. O lote leiteiro (§6) ──────────────────────────────────────────

    console.log("\n9. O lote leiteiro: organização, não rebanho (§6, §37.3)");

    const lote = await createMilkGroup(db, {
      property_id: fazenda.id,
      name: "Recém-paridas",
    });
    check("o lote é criado", lote.ok, lote.ok ? "" : lote.message);
    const colunasLote = Object.keys(
      (await db.milkGroup.findFirst({ where: { property_id: fazenda.id } }))!,
    );
    check(
      "o lote NÃO tem quantidade nem categoria: ele não conta cabeça (§37.3)",
      !colunasLote.some((c) => /quantity|category|head|cabec/i.test(c)),
      colunasLote.join(","),
    );

    const repetido = await createMilkGroup(db, {
      property_id: fazenda.id,
      name: "Recém-paridas",
    });
    check("nome repetido na mesma fazenda é recusado", !repetido.ok);
    check(
      "e a recusa aponta o campo `name`",
      !repetido.ok && repetido.field === "name",
      repetido.ok ? "" : String(repetido.field),
    );

    const loteId = lote.ok ? lote.data.id : "";
    const deOutra = await recordMilkProduction(db, {
      property_id: outraFazenda.id,
      recorded_at: meioDia("2026-09-06"),
      dia: 10,
      group_id: loteId,
    });
    check("lote de OUTRA fazenda é recusado", !deOutra.ok);
    check(
      "com o código LOTE_DE_OUTRA_FAZENDA",
      !deOutra.ok && deOutra.code === "LOTE_DE_OUTRA_FAZENDA",
      deOutra.ok ? "" : deOutra.code,
    );

    await setMilkGroupArchived(db, loteId, true);
    check(
      "lote arquivado some da lista padrão",
      (await listMilkGroups(db, { property_id: fazenda.id })).every((g) => g.id !== loteId),
    );
    check(
      "e volta quando pedido",
      (await listMilkGroups(db, { property_id: fazenda.id, include_archived: true })).some(
        (g) => g.id === loteId,
      ),
    );
    await setMilkGroupArchived(db, loteId, false);
    check(
      "desarquivar traz o lote de volta",
      (await listMilkGroups(db, { property_id: fazenda.id })).some((g) => g.id === loteId),
    );

    // ── 10. O leite NÃO mexe no rebanho ──────────────────────────────────

    console.log("\n10. A Área Leite não altera o rebanho (§37.1, §37.2, §37.4)");

    const fazendaRebanho = await db.property.create({ data: scoped({ name: "Rebanho M52" }) });
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 60,
      to: {
        category_id: "femea_36_mais",
        property_id: fazendaRebanho.id,
        pasture_id: null,
        situation: "presente",
        owner: "proprio",
      },
    });
    const totalAntes = (await getPositions(db, {})).reduce((s, p) => s + p.quantity, 0);

    await recordLactationEntry(db, {
      property_id: fazendaRebanho.id,
      type: "definir",
      quantity: 35,
      recorded_at: meioDia("2026-09-01"),
    });
    await recordLactationEntry(db, {
      property_id: fazendaRebanho.id,
      type: "entrada",
      quantity: 5,
      recorded_at: meioDia("2026-09-02"),
    });
    await recordLactationEntry(db, {
      property_id: fazendaRebanho.id,
      type: "saida",
      quantity: 3,
      recorded_at: meioDia("2026-09-03"),
    });
    await recordMilkProduction(db, {
      property_id: fazendaRebanho.id,
      recorded_at: meioDia("2026-09-03"),
      dia: 700,
    });

    const totalDepois = (await getPositions(db, {})).reduce((s, p) => s + p.quantity, 0);
    check(
      "o total do rebanho não mudou depois de lactação e produção",
      totalAntes === totalDepois,
      `${totalAntes} -> ${totalDepois}`,
    );
    check(
      "e a contagem de lactação (37) é MENOR que as 60 fêmeas: é condição, não categoria",
      (await contagemAtual(db, fazendaRebanho.id, meioDia("2026-09-03"))) === 37,
    );
    check(
      "nenhuma HerdMovement nasceu da Área Leite",
      (await db.herdMovement.count({
        where: { to_property_id: fazendaRebanho.id, movement_type: { not: "saldo_inicial" } },
      })) === 0,
    );

    // ── 11. Os handlers do WhatsApp (§36) ────────────────────────────────

    console.log("\n11. WhatsApp (§36): confirma, e o 'não' não grava");

    const fazendaWa = await db.property.create({ data: scoped({ name: "Zap M52" }) });
    const ctx = (
      parameters: Record<string, unknown>,
      extra: Partial<HandlerCtx> = {},
    ): HandlerCtx => ({
      db,
      tenant_id: tenant.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      parameters,
      confirmed: false,
      explicitNo: false,
      user_id: usuarioDoTeste,
      ...extra,
    });

    await clearPendingMilk(tenant.id, usuarioDoTeste);

    const pergunta = await registrarProducaoLeite(
      ctx({ litros: 480, fazenda: "Zap M52", data: "2026-09-01" }),
    );
    check(
      "produção pergunta antes de gravar",
      pergunta.requires_confirmation,
      pergunta.reply_text.slice(0, 80),
    );
    check(
      "e a pergunta cita os 480 litros",
      pergunta.reply_text.includes("480"),
      pergunta.reply_text.slice(0, 80),
    );
    check(
      "nada foi gravado ainda",
      (await listMilkProduction(db, { property_id: fazendaWa.id })).length === 0,
    );

    // O defeito de 2026-08-18: "não, deixa pra lá" gravando o que foi recusado.
    const recusou = await registrarProducaoLeite(
      ctx({ litros: 480 }, { explicitNo: true, confirmed: true }),
    );
    check("o 'não' cancela", recusou.action_taken.endsWith(":cancelado"));
    check(
      "e NÃO grava nada, mesmo com confirmed: true junto",
      (await listMilkProduction(db, { property_id: fazendaWa.id })).length === 0,
      "gravou a produção recusada",
    );

    // O "sim" executa o que foi MOSTRADO, não o que o classificador remontou:
    // aqui a segunda mensagem manda 999 litros, e o registro tem que sair com
    // os 480 da pergunta.
    await registrarProducaoLeite(ctx({ litros: 480, fazenda: "Zap M52", data: "2026-09-01" }));
    const gravou = await registrarProducaoLeite(ctx({ litros: 999 }, { confirmed: true }));
    check("o 'sim' grava", gravou.action_taken.endsWith(":ok"), gravou.reply_text.slice(0, 80));
    const gravados = await listMilkProduction(db, { property_id: fazendaWa.id });
    check(
      "e grava o que foi MOSTRADO (480), não o que a segunda mensagem trouxe (999)",
      gravados.length === 1 && gravados[0].liters === 480,
      gravados.map((g) => g.liters).join(","),
    );

    // As duas ordenhas numa frase só, o exemplo literal do §36.
    await clearPendingMilk(tenant.id, usuarioDoTeste);
    const duasOrdenhas = await registrarProducaoLeite(
      ctx({ manha: 300, tarde: 180, fazenda: "Zap M52", data: "2026-09-02" }),
    );
    check(
      "'300 de manhã e 180 à tarde' pergunta pelo TOTAL de 480 (§36)",
      duasOrdenhas.reply_text.includes("480"),
      duasOrdenhas.reply_text.slice(0, 100),
    );
    await registrarProducaoLeite(ctx({}, { confirmed: true }));
    const dia2 = await listMilkProduction(db, {
      property_id: fazendaWa.id,
      de: "2026-09-02",
      ate: "2026-09-02",
    });
    check("e grava DUAS linhas", dia2.length === 2, String(dia2.length));

    // Os três verbos de lactação não podem se confundir: é o motivo de serem
    // três intenções, e não uma com o sentido em `parameters`.
    await clearPendingMilk(tenant.id, usuarioDoTeste);
    await definirVacasEmLactacao(ctx({ quantidade: 32, fazenda: "Zap M52", data: "2026-09-01" }));
    await definirVacasEmLactacao(ctx({}, { confirmed: true }));
    check(
      "'estou com 32 vacas' define 32",
      (await contagemAtual(db, fazendaWa.id, meioDia("2026-09-01"))) === 32,
    );

    await clearPendingMilk(tenant.id, usuarioDoTeste);
    await registrarEntradaLactacao(ctx({ quantidade: 4, fazenda: "Zap M52", data: "2026-09-02" }));
    await registrarEntradaLactacao(ctx({}, { confirmed: true }));
    check(
      "'entraram mais 4' soma: 36, e não 4",
      (await contagemAtual(db, fazendaWa.id, meioDia("2026-09-02"))) === 36,
    );

    await clearPendingMilk(tenant.id, usuarioDoTeste);
    await registrarSaidaLactacao(ctx({ quantidade: 3, fazenda: "Zap M52", data: "2026-09-03" }));
    await registrarSaidaLactacao(ctx({}, { confirmed: true }));
    check(
      "'sequei 3' subtrai: 33",
      (await contagemAtual(db, fazendaWa.id, meioDia("2026-09-03"))) === 33,
    );

    // Um "sim" sem nada guardado não pode escrever.
    await clearPendingMilk(tenant.id, usuarioDoTeste);
    const antesDoSimSolto = await db.lactationEntry.count({ where: { property_id: fazendaWa.id } });
    const simSolto = await registrarEntradaLactacao(ctx({ quantidade: 9 }, { confirmed: true }));
    check(
      "um 'sim' sem pedido guardado não grava",
      (await db.lactationEntry.count({ where: { property_id: fazendaWa.id } })) ===
        antesDoSimSolto,
      simSolto.reply_text.slice(0, 80),
    );

    // A recusa de saldo chega ao produtor como frase, não como exceção.
    await clearPendingMilk(tenant.id, usuarioDoTeste);
    await registrarSaidaLactacao(ctx({ quantidade: 500, fazenda: "Zap M52", data: "2026-09-03" }));
    const recusaSaldo = await registrarSaidaLactacao(ctx({}, { confirmed: true }));
    check(
      "secar mais vacas do que existem vira uma frase de recusa",
      recusaSaldo.action_taken.includes("SALDO_INSUFICIENTE"),
      recusaSaldo.action_taken,
    );
    check(
      "e a contagem continua 33",
      (await contagemAtual(db, fazendaWa.id, meioDia("2026-09-03"))) === 33,
    );

    // A contagem por dia, usada pela média, precisa carregar o último valor
    // conhecido para a frente nos dias sem registro nenhum.
    const serie = await contagemPorDia(db, fazendaWa.id, [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
    check(
      "a contagem se propaga para o dia sem registro: 04/09 herda os 33 de 03/09",
      serie.get("2026-09-04") === 33,
      String(serie.get("2026-09-04")),
    );
    check(
      "e um dia anterior ao primeiro registro continua desconhecido",
      (await contagemPorDia(db, fazendaWa.id, ["2026-08-20"])).get("2026-08-20") === null,
    );

    await clearPendingMilk(tenant.id, usuarioDoTeste);
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

comBanco()
  .then(() => {
    console.log(
      falhas === 0
        ? `\n✅ M52: Área Leite, fase 1 (Módulo 32), 0 falhas.`
        : `\n❌ M52: ${falhas} falha(s).`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((erro) => {
    console.error("\n❌ M52 quebrou:", erro);
    process.exit(1);
  });
