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
 * As estadias temporárias do rebanho (Módulo 30, fase 2).
 *
 * Este bloco é FUNÇÃO PURA, sem banco: são as regras que o documento do
 * cliente escreve por tipo, e elas precisam valer para todo caminho de
 * escrita, inclusive os que ainda não existem. Deixá-las dentro da action
 * significaria testá-las só pelo caminho que a action expõe.
 *
 * Roda: `npm run test:m47`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🐄 M47: estadias temporárias do rebanho\n");

console.log("1. Cada tipo sabe onde o animal fica e de quem ele é");
check("pasto de terceiro leva à situação homônima", situacaoDaEstadia("pasto_terceiro") === "pasto_terceiro");
check("boitel idem", situacaoDaEstadia("boitel") === "boitel");
check("evento idem, e ele já existe para a missão 3", situacaoDaEstadia("evento") === "evento");
check("desaparecimento vai para desaparecido", situacaoDaEstadia("desaparecimento") === "desaparecido");
check(
  "animal de terceiro está PRESENTE na fazenda, não fora dela",
  situacaoDaEstadia("terceiro_na_fazenda") === "presente",
);
check("e o dono dele é terceiro", donoDaEstadia("terceiro_na_fazenda") === "terceiro");
check("no boitel o animal continua sendo do produtor", donoDaEstadia("boitel") === "proprio");
check("no desaparecimento também", donoDaEstadia("desaparecimento") === "proprio");

console.log("\n2. O envio de cada tipo tem o seu movimento");
check("pasto de terceiro: envio_pasto_terceiro", tipoDeEnvio("pasto_terceiro") === "envio_pasto_terceiro");
check("boitel: envio_boitel", tipoDeEnvio("boitel") === "envio_boitel");
check("terceiro na fazenda: entrada_terceiro", tipoDeEnvio("terceiro_na_fazenda") === "entrada_terceiro");
check("desaparecimento: desaparecimento", tipoDeEnvio("desaparecimento") === "desaparecimento");
// Sem um `envio_evento` proprio, a remessa para um leilao ficaria gravada no
// livro-razao como envio para pasto de terceiro: mentira no registro contabil,
// e so descoberta na missao 3.
check("evento tem envio próprio, e não empresta o de outro", tipoDeEnvio("evento") === "envio_evento");

console.log("\n3. O desaparecimento só sai pelos três caminhos do documento");
{
  const permitidos = encerramentosPermitidos("desaparecimento");
  check("encontrado: volta para presente", permitidos.includes("retorno_estadia"));
  check("morte confirmada reusa o tipo `morte`", permitidos.includes("morte"));
  check("perda confirmada sai definitivamente", permitidos.includes("perda_confirmada"));
  check("e mais nada", permitidos.length === 3, permitidos.join(","));

  // A regra escrita: "nao podera ser vendido, transferido ou movimentado".
  check("vender animal desaparecido é recusado", !permiteEncerramento("desaparecimento", "venda"));
  check("transferir também", !permiteEncerramento("desaparecimento", "transferencia_pasto"));
  check("mudar de categoria também", !permiteEncerramento("desaparecimento", "mudanca_categoria"));
  check("morte confirmada passa", permiteEncerramento("desaparecimento", "morte"));
}

console.log("\n4. Boitel e pasto de terceiro permitem venda direta");
{
  // "permitir retorno, venda direta ou morte", diz o documento sobre o boitel.
  check("boitel permite venda", permiteEncerramento("boitel", "venda"));
  check("boitel permite morte", permiteEncerramento("boitel", "morte"));
  check("boitel permite retorno", permiteEncerramento("boitel", "retorno_estadia"));
  check("pasto de terceiro permite retorno", permiteEncerramento("pasto_terceiro", "retorno_estadia"));
  check("pasto de terceiro permite venda", permiteEncerramento("pasto_terceiro", "venda"));
}

console.log("\n5. Animal de terceiro sai, mas nunca vira rebanho próprio");
{
  check("sai por saida_terceiro", permiteEncerramento("terceiro_na_fazenda", "saida_terceiro"));
  check(
    "e NÃO pode ser vendido pelo produtor: não é dele",
    !permiteEncerramento("terceiro_na_fazenda", "venda"),
  );
  check(
    "nem virar retorno para o rebanho próprio",
    !permiteEncerramento("terceiro_na_fazenda", "retorno_estadia"),
  );
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { openStay, closeStay, listStays, cancelStay } = await import("@/lib/actions/herd-stays");
  const { getPositions, recordMovement } = await import("@/lib/actions/herd-ledger");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M47 ${stamp}`, document: `M47${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  const soma = (posicoes: { quantity: number }[]) =>
    posicoes.reduce((s, p) => s + p.quantity, 0);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M47" }) });
    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto A", area_hectares: 10 }),
    });

    // Saldo inicial: 100 vacas presentes, para haver de onde tirar.
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 500,
      to: {
        category_id: "femea_36_mais",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });

    console.log("\n6. Abrir estadia tira o animal da fazenda sem tirar do rebanho");
    {
      const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
      const r = await openStay(db, {
        type: "pasto_terceiro",
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        pasture_id: pasto.id,
        quantity: 20,
        counterparty_name: "Sítio do João",
      });
      check("a estadia abre", r.ok, r.ok ? "" : r.message);

      const proprio = soma(await getPositions(db, { owner: "proprio" }));
      const presente = soma(await getPositions(db, { owner: "proprio", situation: "presente" }));
      const fora = soma(await getPositions(db, { owner: "proprio", situation: "pasto_terceiro" }));
      check("o rebanho próprio NÃO muda: o animal continua sendo dele", proprio === proprioAntes, `${proprio} vs ${proprioAntes}`);
      check("20 cabeças ficam em pasto de terceiro", fora === 20, String(fora));
      check("e saem da quantidade física da fazenda", presente === proprioAntes - 20, String(presente));

      const mov = await db.herdMovement.findFirst({
        where: { stay_id: r.ok ? r.data.id : "" },
      });
      check("a movimentação aponta para a estadia", mov != null);
      check("com o tipo de envio certo", mov?.movement_type === "envio_pasto_terceiro", mov?.movement_type);
      check("e sem pasto no destino: pasto de terceiro não é pasto nosso", mov?.to_pasture_id === null);
    }

    console.log("\n7. Com valor informado nasce a conta; sem valor, não nasce nada");
    {
      const r = await openStay(db, {
        type: "boitel",
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        pasture_id: pasto.id,
        quantity: 10,
        counterparty_name: "Boitel Central",
        charge_type: "fechado",
        charge_value: 3000,
      });
      check("a estadia com cobrança abre", r.ok, r.ok ? "" : r.message);

      const contas = await db.financialEntry.findMany({
        where: { related_module: "rebanho", related_id: r.ok ? r.data.id : "" },
      });
      check("um lançamento, nem zero nem dois", contas.length === 1, String(contas.length));
      check("boitel gera DESPESA", contas[0]?.entry_type === "expense", contas[0]?.entry_type);
      check("com o valor que o produtor informou, sem cálculo", Number(contas[0]?.amount) === 3000, String(contas[0]?.amount));
      check("como conta a pagar, não como pago", contas[0]?.status === "pending", contas[0]?.status);

      const semValor = await openStay(db, {
        type: "boitel",
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        pasture_id: pasto.id,
        quantity: 5,
        counterparty_name: "Boitel Central",
      });
      const nenhuma = await db.financialEntry.findMany({
        where: { related_module: "rebanho", related_id: semValor.ok ? semValor.data.id : "" },
      });
      check("sem valor informado, nenhum lançamento nasce", nenhuma.length === 0, String(nenhuma.length));
    }

    console.log("\n8. Animal de terceiro entra sem virar rebanho próprio");
    {
      const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
      const r = await openStay(db, {
        type: "terceiro_na_fazenda",
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        pasture_id: pasto.id,
        quantity: 40,
        counterparty_name: "Vizinho",
        charge_type: "por_cabeca",
        charge_value: 800,
      });
      check("a entrada de terceiros abre", r.ok, r.ok ? "" : r.message);
      check(
        "o rebanho próprio NÃO cresce com animal dos outros",
        soma(await getPositions(db, { owner: "proprio" })) === proprioAntes,
      );
      check("eles contam como de terceiro", soma(await getPositions(db, { owner: "terceiro" })) === 40);

      const mov = await db.herdMovement.findFirst({ where: { stay_id: r.ok ? r.data.id : "" } });
      check("é ENTRADA: não sai de lugar nenhum", mov?.from_category_id === null);
      check("e fica num pasto daqui, porque ocupa o pasto", mov?.to_pasture_id === pasto.id);

      const contas = await db.financialEntry.findMany({
        where: { related_module: "rebanho", related_id: r.ok ? r.data.id : "" },
      });
      check("aluguel de pasto gera RECEITA, não despesa", contas[0]?.entry_type === "income", contas[0]?.entry_type);
    }

    console.log("\n9. Sem saldo não abre, e nada fica pela metade");
    {
      const estadiasAntes = await db.herdStay.count();
      const r = await openStay(db, {
        type: "boitel",
        property_id: fazenda.id,
        category_id: "tourinho_reprodutor",
        quantity: 999,
        counterparty_name: "Boitel Central",
      });
      check("recusa por saldo, como qualquer saída", !r.ok && r.code === "INSUFFICIENT_BALANCE", r.ok ? "abriu" : r.code);
      check("apontando o campo da quantidade", !r.ok && r.field === "quantity", r.ok ? "" : String(r.field));
      check(
        "e NÃO deixa a estadia órfã gravada",
        (await db.herdStay.count()) === estadiasAntes,
        `${await db.herdStay.count()} vs ${estadiasAntes}`,
      );
    }

    console.log("\n10. Quantidade e categoria são conferidas antes de qualquer escrita");
    {
      const antes = await db.herdStay.count();
      const zero = await openStay(db, {
        type: "boitel",
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        quantity: 0,
        counterparty_name: "x",
      });
      check("quantidade zero é recusada", !zero.ok && zero.field === "quantity");

      const categoria = await openStay(db, {
        type: "boitel",
        property_id: fazenda.id,
        category_id: "categoria_inventada",
        quantity: 1,
        counterparty_name: "x",
      });
      check("categoria fora das 12 é recusada", !categoria.ok && categoria.code === "INVALID_CATEGORY");
      check("e nenhuma das duas gravou estadia", (await db.herdStay.count()) === antes);
    }
    // Uma estadia de 20 cabeças, sempre nova, para os casos de encerramento.
    const abrirComVinte = async () => {
      const r = await openStay(db, {
        type: "pasto_terceiro",
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        pasture_id: pasto.id,
        quantity: 20,
        counterparty_name: "Sítio do João",
      });
      if (!r.ok) throw new Error(`abrirComVinte falhou: ${r.message}`);
      return r.data;
    };

    console.log(
      "\n11. Passar do saldo é recusado, bater fecha, e ficar abaixo é aceito deixando o resto aberto",
    );
    {
      const foraAntes = soma(await getPositions(db, { owner: "proprio", situation: "pasto_terceiro" }));
      const estadia = await abrirComVinte();

      const demais = await closeStay(db, estadia.id, {
        destinos: [
          { movement_type: "venda", quantity: 12 },
          { movement_type: "retorno_estadia", quantity: 9 },
        ],
      });
      check("21 de 20 é recusado", !demais.ok && demais.code === "DESTINOS_NAO_BATEM", demais.ok ? "passou" : demais.code);
      check("apontando a quantidade", !demais.ok && demais.field === "quantity");

      const aindaLa = soma(await getPositions(db, { owner: "proprio", situation: "pasto_terceiro" }));
      check(
        "e nenhuma cabeça se mexeu na recusa",
        aindaLa === foraAntes + 20,
        `${aindaLa} onde deveria haver ${foraAntes + 20}`,
      );

      const parcial = await closeStay(db, estadia.id, {
        destinos: [
          { movement_type: "venda", quantity: 12 },
          { movement_type: "retorno_estadia", quantity: 5 },
        ],
      });
      check(
        "17 de 20 é aceito, e não fecha a estadia",
        parcial.ok && parcial.data.encerrada === false,
        parcial.ok ? String(parcial.data.encerrada) : parcial.code,
      );

      const listaParcial = await listStays(db, {});
      const abertaParcial = listaParcial.ok ? listaParcial.data.find((e) => e.id === estadia.id) : null;
      check("o saldo aberto cai para 3", abertaParcial?.saldo_aberto === 3, String(abertaParcial?.saldo_aberto));
      check("e a estadia continua aberta", abertaParcial?.aberta === true);

      const foraDepois = soma(await getPositions(db, { owner: "proprio", situation: "pasto_terceiro" }));
      check(
        "só as 17 saíram do pasto de terceiro, as outras 3 continuam lá",
        foraDepois === foraAntes + 3,
        `${foraDepois} onde deveria haver ${foraAntes + 3}`,
      );

      // Limpa para o proximo caso.
      await closeStay(db, estadia.id, { destinos: [{ movement_type: "retorno_estadia", quantity: 3 }] });
    }

    console.log("\n12. Venda parcial: o exemplo do documento, 12 vendidos e 8 retornados");
    {
      const presenteAntes = soma(await getPositions(db, { owner: "proprio", situation: "presente" }));
      const proprioAntes = soma(await getPositions(db, { owner: "proprio" }));
      const foraAntes12 = soma(await getPositions(db, { owner: "proprio", situation: "pasto_terceiro" }));
      const estadia = await abrirComVinte();

      const r = await closeStay(db, estadia.id, {
        destinos: [
          { movement_type: "venda", quantity: 12, value: 60000 },
          { movement_type: "retorno_estadia", quantity: 8 },
        ],
      });
      check("12 vendidos mais 8 retornados fecha os 20", r.ok, r.ok ? "" : r.message);
      check("e a estadia fica encerrada", r.ok && r.data.encerrada);

      const fora = soma(await getPositions(db, { owner: "proprio", situation: "pasto_terceiro" }));
      const presente = soma(await getPositions(db, { owner: "proprio", situation: "presente" }));
      const proprio = soma(await getPositions(db, { owner: "proprio" }));
      check(
        "esta estadia não deixa ninguém em pasto de terceiro",
        fora === foraAntes12,
        `${fora} onde deveria haver ${foraAntes12}`,
      );
      check("os 8 voltaram para a fazenda", presente === presenteAntes - 12, `${presente} vs ${presenteAntes - 12}`);
      check("e o rebanho próprio caiu só os 12 vendidos", proprio === proprioAntes - 12, `${proprio} vs ${proprioAntes - 12}`);

      const receita = await db.financialEntry.findMany({
        where: { related_module: "rebanho", entry_type: "income", amount: 60000 },
      });
      check("a receita nasce só para os vendidos", receita.length === 1, String(receita.length));
    }

    console.log("\n13. Encerramento parcial mantém a estadia aberta com o saldo certo");
    {
      // O parcial de verdade: fecha uma fração, confere que segue aberta com
      // o saldo certo, depois fecha o resto numa segunda chamada.
      const estadia = await abrirComVinte();

      const primeira = await closeStay(db, estadia.id, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 5 }],
      });
      check("a primeira etapa (5 de 20) é aceita", primeira.ok, primeira.ok ? "" : primeira.message);
      check("e não fecha a estadia", primeira.ok && primeira.data.encerrada === false);

      const meioCaminho = await listStays(db, {});
      const aberta = meioCaminho.ok ? meioCaminho.data.find((e) => e.id === estadia.id) : null;
      check("o saldo aberto cai para 15", aberta?.saldo_aberto === 15, String(aberta?.saldo_aberto));
      check("e a estadia segue aberta", aberta?.aberta === true);

      const segunda = await closeStay(db, estadia.id, {
        destinos: [
          { movement_type: "venda", quantity: 10, value: 50000 },
          { movement_type: "retorno_estadia", quantity: 5 },
        ],
      });
      check(
        "a segunda etapa (o resto, 15) fecha a estadia",
        segunda.ok && segunda.data.encerrada === true,
        segunda.ok ? String(segunda.data.encerrada) : segunda.code,
      );

      const final = await listStays(db, {});
      const fechada = final.ok ? final.data.find((e) => e.id === estadia.id) : null;
      check("saldo final zero", fechada?.saldo_aberto === 0, String(fechada?.saldo_aberto));
      check("e deixa de estar aberta", fechada?.aberta === false);
    }

    console.log("\n14. Desaparecido recusa venda, mas aceita os três encerramentos");
    {
      const sumico = await openStay(db, {
        type: "desaparecimento",
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        pasture_id: pasto.id,
        quantity: 5,
        reason: "não apareceram na contagem",
      });
      check("o desaparecimento é registrado", sumico.ok, sumico.ok ? "" : sumico.message);

      const proprio = soma(await getPositions(db, { owner: "proprio" }));
      const desaparecidos = soma(await getPositions(db, { owner: "proprio", situation: "desaparecido" }));
      check("os 5 aparecem como desaparecidos", desaparecidos === 5, String(desaparecidos));
      check("e continuam no rebanho próprio", proprio > 0);

      const venda = await closeStay(db, sumico.ok ? sumico.data.id : "", {
        destinos: [{ movement_type: "venda", quantity: 5 }],
      });
      check(
        "não se vende animal desaparecido",
        !venda.ok && venda.code === "ENCERRAMENTO_NAO_PERMITIDO",
        venda.ok ? "vendeu" : venda.code,
      );

      const encontrados = await closeStay(db, sumico.ok ? sumico.data.id : "", {
        destinos: [
          { movement_type: "retorno_estadia", quantity: 3 },
          { movement_type: "perda_confirmada", quantity: 2 },
        ],
      });
      check("3 encontrados e 2 dados como perdidos fecha", encontrados.ok, encontrados.ok ? "" : encontrados.message);
      check(
        "e não sobra desaparecido nenhum",
        soma(await getPositions(db, { owner: "proprio", situation: "desaparecido" })) === 0,
      );
    }
    console.log("\n15. A lista traz o saldo aberto, derivado das movimentações");
    {
      const estadia = await abrirComVinte();
      const antes = await listStays(db, {});
      const aberta = antes.ok ? antes.data.find((e) => e.id === estadia.id) : null;
      check("estadia recém-aberta tem saldo 20", aberta?.saldo_aberto === 20, String(aberta?.saldo_aberto));
      check("e está aberta", aberta?.aberta === true);

      await closeStay(db, estadia.id, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 20 }],
      });
      const depois = await listStays(db, {});
      const fechada = depois.ok ? depois.data.find((e) => e.id === estadia.id) : null;
      check("depois de encerrada, saldo zero", fechada?.saldo_aberto === 0, String(fechada?.saldo_aberto));
      check("e deixa de estar aberta", fechada?.aberta === false);

      const soAbertas = await listStays(db, { apenas_abertas: true });
      check(
        "o filtro de abertas não traz a encerrada",
        soAbertas.ok && !soAbertas.data.some((e) => e.id === estadia.id),
      );
    }

    console.log("\n16. Cancelar desfaz o rebanho e o dinheiro pendente");
    {
      const presenteAntes = soma(await getPositions(db, { owner: "proprio", situation: "presente" }));
      const boitelAntes = soma(await getPositions(db, { owner: "proprio", situation: "boitel" }));
      const r = await openStay(db, {
        type: "boitel",
        property_id: fazenda.id,
        category_id: "femea_36_mais",
        pasture_id: pasto.id,
        quantity: 20,
        counterparty_name: "Boitel Central",
        charge_type: "fechado",
        charge_value: 3000,
      });
      const id = r.ok ? r.data.id : "";
      check(
        "as 20 saíram da fazenda ao abrir",
        soma(await getPositions(db, { owner: "proprio", situation: "presente" })) === presenteAntes - 20,
      );

      const cancel = await cancelStay(db, id, { reason: "lançado errado" });
      check("cancela", cancel.ok, cancel.ok ? "" : cancel.message);
      check(
        "as 20 cabeças voltam para a fazenda",
        soma(await getPositions(db, { owner: "proprio", situation: "presente" })) === presenteAntes,
      );
      check(
        "e esta estadia não deixa ninguém no boitel",
        soma(await getPositions(db, { owner: "proprio", situation: "boitel" })) === boitelAntes,
      );

      const contas = await db.financialEntry.findMany({ where: { related_module: "rebanho", related_id: id } });
      check("a conta a pagar pendente some", contas.length === 0, String(contas.length));

      const movimentos = await db.herdMovement.findMany({ where: { stay_id: id } });
      check("mas a movimentação continua no histórico, marcada", movimentos.length === 1);
      check("com a data de cancelamento", movimentos[0]?.canceled_at != null);

      const denovo = await cancelStay(db, id, {});
      check("cancelar duas vezes é recusado", !denovo.ok && denovo.code === "ESTADIA_JA_CANCELADA");
    }

    console.log("\n17. Estadia com encerramento não pode ser cancelada inteira");
    {
      const estadia = await abrirComVinte();
      await closeStay(db, estadia.id, {
        destinos: [
          { movement_type: "venda", quantity: 10, value: 30000 },
          { movement_type: "retorno_estadia", quantity: 10 },
        ],
      });
      const r = await cancelStay(db, estadia.id, { reason: "mudei de ideia" });
      check(
        "recusa, porque desfazer venda é decisão do produtor",
        !r.ok && r.code === "ESTADIA_JA_ENCERRADA",
        r.ok ? "cancelou" : r.code,
      );
    }
    console.log(
      "\n18. Ao voltar do pasto de terceiro, o pasto informado é gravado; pasto de outra propriedade é recusado (§18)",
    );
    {
      // Generalização estrita do T10 (31/08): o mecanismo já provado no
      // confinamento (m51) precisa valer para os outros cinco tipos também,
      // e continuar aceitando omitir o pasto (grava nulo, como sempre).
      const outraFazenda = await db.property.create({ data: scoped({ name: "Fazenda M47 (outra)" }) });
      const pastoErrado = await db.pasture.create({
        data: scoped({ property_id: outraFazenda.id, name: "Pasto de outra fazenda", area_hectares: 5 }),
      });
      const pastoB = await db.pasture.create({
        data: scoped({ property_id: fazenda.id, name: "Pasto B", area_hectares: 8 }),
      });

      const estadia = await abrirComVinte();

      const semPastoAntes = soma(
        await getPositions(db, { owner: "proprio", situation: "presente", pasture_id: null }),
      );
      const noPastoBAntes = soma(
        await getPositions(db, { owner: "proprio", situation: "presente", pasture_id: pastoB.id }),
      );

      // A PONTA QUE FALTA: pasto de OUTRA propriedade precisa ser recusado,
      // não gravado em silêncio.
      const errado = await closeStay(db, estadia.id, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 5, pasture_id: pastoErrado.id }],
      });
      check(
        "retorno para pasto de OUTRA propriedade é recusado",
        !errado.ok && errado.code === "INVALID_PASTURE",
        errado.ok ? "passou" : errado.code,
      );
      check(
        "e nenhuma cabeça se mexe na recusa",
        soma(await getPositions(db, { owner: "proprio", situation: "presente", pasture_id: pastoB.id })) === noPastoBAntes,
      );

      const semInformar = await closeStay(db, estadia.id, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 8 }],
      });
      check("sem informar pasto, o encerramento é aceito", semInformar.ok, semInformar.ok ? "" : semInformar.message);
      check(
        "e o pasto continua nulo: omitir é generalização estrita, não regressão",
        soma(await getPositions(db, { owner: "proprio", situation: "presente", pasture_id: null })) === semPastoAntes + 8,
      );

      const comPasto = await closeStay(db, estadia.id, {
        destinos: [{ movement_type: "retorno_estadia", quantity: 7, pasture_id: pastoB.id }],
      });
      check("com pasto da mesma propriedade, o encerramento é aceito", comPasto.ok, comPasto.ok ? "" : comPasto.message);
      check(
        "e as 7 cabeças aparecem NAQUELE pasto, não em nulo",
        soma(await getPositions(db, { owner: "proprio", situation: "presente", pasture_id: pastoB.id })) === noPastoBAntes + 7,
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
        ? `\n✅ M47: estadias temporárias, 0 falhas.`
        : `\n❌ M47: ${falhas} falha(s).`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((erro) => {
    console.error("\n❌ M47 quebrou:", erro);
    process.exit(1);
  });
