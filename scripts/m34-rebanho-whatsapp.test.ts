import "dotenv/config";
import { prisma, prismaForTenant, scoped, type TenantPrismaClient } from "@/lib/prisma";
import { recordMovement } from "@/lib/actions/herd-ledger";
import {
  consultarRebanho,
  registrarMovimentacaoRebanho,
} from "@/lib/actions/whatsapp-handlers/herd";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";

/**
 * Módulo 30, tarefa 6: o rebanho pelo WhatsApp (§13 e §14).
 *
 * Os 7 diálogos do §13 do documento do cliente, um a um, mais a regra que
 * fecha o §14: "o sistema não deverá escolher uma categoria sem confirmação".
 *
 * Roda: `npm run test:m34`
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.error(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

function ctx(
  db: TenantPrismaClient,
  tenantId: string,
  parameters: Record<string, unknown>,
  opts: { confirmed?: boolean; explicitNo?: boolean } = {},
): HandlerCtx {
  return {
    db,
    tenant_id: tenantId,
    role: "OWNER",
    activeProfiles: ["fazenda"],
    parameters,
    confirmed: opts.confirmed ?? false,
    explicitNo: opts.explicitNo ?? false,
  };
}

async function main() {
  console.log("💬 Módulo 30: rebanho pelo WhatsApp (§13 e §14)\n");

  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "M34 Whats", document: `34${stamp}0`, plan: "fazenda" },
  });

  try {
    const db = prismaForTenant(tenant.id);
    const santaHelena = await db.property.create({
      data: scoped({ name: "Fazenda Santa Helena" }),
    });
    const pastoSede = await db.pasture.create({
      data: scoped({ property_id: santaHelena.id, name: "Pasto da Sede", area_hectares: 20 }),
    });
    const pastoBaixada = await db.pasture.create({
      data: scoped({ property_id: santaHelena.id, name: "Pasto da Baixada", area_hectares: 15 }),
    });

    const semear = (category_id: string, quantity: number, pasture_id: string | null = null) =>
      recordMovement(db, {
        movement_type: "saldo_inicial",
        quantity,
        to: {
          category_id,
          property_id: santaHelena.id,
          pasture_id,
          situation: "presente",
          owner: "proprio",
        },
        occurred_at: new Date("2026-01-01"),
      });

    await semear("femea_13_24", 25);
    await semear("femea_36_mais", 45, pastoBaixada.id);
    await semear("bezerra_0_7", 21);
    await semear("femea_8_12", 20, pastoSede.id);

    console.log("1. §13.1 consulta geral");
    const geral = await consultarRebanho(ctx(db, tenant.id, {}));
    check(
      "responde com o total do rebanho",
      geral.reply_text.includes("111"),
      geral.reply_text,
    );
    check("separa fêmeas e machos", geral.reply_text.includes("Fêmeas: 111"));
    check("consulta não pede confirmação", geral.requires_confirmation === false);

    console.log("\n2. §13.2 consulta por categoria");
    const porCategoria = await consultarRebanho(
      ctx(db, tenant.id, { categoria: "Fêmea - 13 a 24 meses" }),
    );
    check(
      "responde a quantidade da categoria pedida",
      porCategoria.reply_text.includes("25 fêmeas de 13 a 24 meses"),
      porCategoria.reply_text,
    );

    const comFazenda = await consultarRebanho(
      ctx(db, tenant.id, { categoria: "vaca", fazenda: "Santa Helena" }),
    );
    check(
      "diz o nome da fazenda quando ela é informada",
      comFazenda.reply_text.includes("Fazenda Santa Helena") &&
        comFazenda.reply_text.includes("45"),
      comFazenda.reply_text,
    );

    console.log("\n3. §14 termo ambíguo NUNCA vira chute");
    const ambigua = await consultarRebanho(ctx(db, tenant.id, { categoria: "novilha" }));
    check(
      "pergunta a faixa de idade em vez de responder",
      ambigua.reply_text.includes("Qual é a idade aproximada"),
      ambigua.reply_text,
    );
    check(
      "oferece as faixas candidatas como opção",
      ambigua.reply_text.includes("8 a 12") && ambigua.reply_text.includes("25 a 36"),
    );
    check("nada é registrado ao perguntar", ambigua.action_taken === "clarification_requested");

    const desconhecida = await consultarRebanho(ctx(db, tenant.id, { categoria: "jumento" }));
    check(
      "termo que não existe pede sexo e idade",
      desconhecida.reply_text.includes("Não reconheci a categoria"),
      desconhecida.reply_text,
    );

    console.log("\n4. §13.3 saldo inicial só entra depois de confirmar");
    const pedeConfirmacao = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, {
        movement_type: "saldo_inicial",
        categoria: "bezerros",
        quantidade: 18,
      }),
    );
    check(
      "primeiro pergunta, na redacao do documento (§13.3)",
      pedeConfirmacao.requires_confirmation === true &&
        pedeConfirmacao.reply_text.startsWith("Deseja registrar 18 bezerros hoje em Fazenda Santa Helena"),
      pedeConfirmacao.reply_text,
    );
    const antesDeConfirmar = await consultarRebanho(ctx(db, tenant.id, {}));
    check(
      "sem confirmação, o saldo não muda",
      antesDeConfirmar.reply_text.includes("111"),
      antesDeConfirmar.reply_text,
    );

    const confirmado = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "saldo_inicial", categoria: "bezerros", quantidade: 18 },
        { confirmed: true },
      ),
    );
    check(
      "confirmado, registra e devolve o total novo",
      confirmado.reply_text.includes("129"),
      confirmado.reply_text,
    );

    console.log("\n5. §13.4 nascimento de machos E fêmeas numa mensagem só");
    const nascimento = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        {
          movement_type: "nascimento",
          itens: [
            // Termos que o classificador do n8n manda de verdade (teste real
            // de WhatsApp, 2026-08-05): sexo sozinho, sem idade.
            { categoria: "macho", quantidade: 4 },
            { categoria: "femea", quantidade: 3 },
          ],
        },
        { confirmed: true },
      ),
    );
    check(
      "as duas categorias entram na mesma confirmação",
      nascimento.reply_text.includes("4 bezerros") && nascimento.reply_text.includes("3 bezerras"),
      nascimento.reply_text,
    );
    const aposNascimento = await consultarRebanho(ctx(db, tenant.id, {}));
    check(
      "o total sobe os 7 de uma vez",
      aposNascimento.reply_text.includes("136"),
      aposNascimento.reply_text,
    );

    console.log("\n6. §13.5 morte, com pasto, usando o termo popular 'vaca'");
    const morte = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "morte", categoria: "vaca", quantidade: 2, pasto: "Baixada" },
        { confirmed: true },
      ),
    );
    check("'vaca' resolve sozinho, sem perguntar", morte.action_taken.includes("morte"), morte.reply_text);

    console.log("\n7. §13.6 mudança de categoria não muda o total");
    const antesDaMudanca = await consultarRebanho(ctx(db, tenant.id, {}));
    const mudanca = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        {
          movement_type: "mudanca_categoria",
          categoria: "bezerra",
          quantidade: 10,
          categoria_destino: "Fêmea - 8 a 12 meses",
        },
        { confirmed: true },
      ),
    );
    const depoisDaMudanca = await consultarRebanho(ctx(db, tenant.id, {}));
    check("mudança de categoria é aceita", mudanca.action_taken.includes("mudanca_categoria"), mudanca.reply_text);
    check(
      "o total do rebanho não se mexe",
      antesDaMudanca.reply_text.split("animais")[0] ===
        depoisDaMudanca.reply_text.split("animais")[0],
      `${antesDaMudanca.reply_text} != ${depoisDaMudanca.reply_text}`,
    );

    console.log("\n8. §13.7 transferência entre pastos: pergunta a faixa primeiro");
    const transferenciaAmbigua = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, {
        movement_type: "transferencia_pasto",
        categoria: "novilhas",
        quantidade: 20,
        pasto_origem: "Sede",
        pasto_destino: "Baixada",
      }),
    );
    check(
      "termo ambíguo interrompe antes de qualquer confirmação",
      transferenciaAmbigua.requires_confirmation === false &&
        transferenciaAmbigua.reply_text.includes("Qual é a idade aproximada"),
      transferenciaAmbigua.reply_text,
    );

    const transferencia = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        {
          movement_type: "transferencia_pasto",
          categoria: "femea_8_12",
          quantidade: 20,
          pasto_origem: "Sede",
          pasto_destino: "Baixada",
        },
        { confirmed: true },
      ),
    );
    check(
      "com a faixa escolhida, transfere",
      transferencia.action_taken.includes("transferencia_pasto"),
      transferencia.reply_text,
    );
    const naBaixada = await db.herdMovement.findFirst({
      where: { movement_type: "transferencia_pasto", to_pasture_id: pastoBaixada.id },
    });
    check("a movimentação aponta para o pasto de destino certo", !!naBaixada);

    console.log("\n9. Recusa e erro");
    const recusado = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "nascimento", categoria: "bezerro", quantidade: 5 },
        { explicitNo: true },
      ),
    );
    check(
      "dizer não cancela sem registrar",
      recusado.action_taken.endsWith(":cancelado"),
      recusado.reply_text,
    );

    const semSaldo = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "venda", categoria: "tourinho reprodutor", quantidade: 99 },
        { confirmed: true },
      ),
    );
    check(
      "venda sem saldo devolve a mensagem literal do cliente",
      semSaldo.reply_text.includes("Revise a quantidade informada."),
      semSaldo.reply_text,
    );

    console.log("\n10. Pasto sem saldo: diz onde os animais estão, não 'existem apenas 0'");
    // femea_13_24 foi cadastrada SEM pasto. Pedir a saída dela citando um
    // pasto não pode responder que não existem: existem 25, em outro lugar.
    const pastoErrado = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, {
        movement_type: "morte",
        categoria: "Fêmea - 13 a 24 meses",
        quantidade: 2,
        pasto: "Sede",
      }),
    );
    check(
      "não devolve a mensagem de saldo zerado",
      !pastoErrado.reply_text.includes("Existem apenas"),
      pastoErrado.reply_text,
    );
    check(
      "diz onde os animais realmente estão",
      pastoErrado.reply_text.includes("sem pasto informado") &&
        pastoErrado.reply_text.includes("25"),
      pastoErrado.reply_text,
    );
    check(
      "devolve a escolha ao produtor, não move sozinho",
      pastoErrado.action_taken === "clarification_requested",
    );

    const semSaldoDeVerdade = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "morte", categoria: "garrote reprodutor", quantidade: 1 },
        { confirmed: true },
      ),
    );
    check(
      "categoria sem saldo em lugar nenhum continua com a mensagem do cliente",
      semSaldoDeVerdade.reply_text.includes("Revise a quantidade informada."),
      semSaldoDeVerdade.reply_text,
    );

    console.log("\n11. 'cancela' vence tudo, inclusive pergunta pendente");
    // Teste real: o produtor disse "cancela" e recebeu a pergunta de faixa de
    // novo, porque o explicitNo era checado só lá no fim, depois de toda
    // pergunta de esclarecimento retornar cedo.
    const cancelaComTermoAmbiguo = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "transferencia_pasto", categoria: "novilhas", quantidade: 20 },
        { explicitNo: true },
      ),
    );
    check(
      "cancela mesmo com categoria ambígua pendente",
      cancelaComTermoAmbiguo.action_taken.endsWith(":cancelado"),
      cancelaComTermoAmbiguo.reply_text,
    );
    const cancelaSemDados = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, {}, { explicitNo: true }),
    );
    check(
      "cancela mesmo sem tipo nem categoria na mensagem",
      cancelaSemDados.action_taken.endsWith(":cancelado"),
      cancelaSemDados.reply_text,
    );

    console.log("\n12. Nascimento não entra em categoria de bicho adulto");
    // Teste real: o classificador se confundiu e mandou nascimento com
    // femea_13_24. Recém-nascido tem 0 a 7 meses; a trava é de código.
    const nascimentoImpossivel = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        {
          movement_type: "nascimento",
          categoria: "Fêmea - 13 a 24 meses",
          quantidade: 4,
        },
        { confirmed: true },
      ),
    );
    check(
      "recusa nascimento em Fêmea 13 a 24 meses",
      nascimentoImpossivel.action_taken === "clarification_requested" &&
        nascimentoImpossivel.reply_text.includes("Bezerro ou Bezerra"),
      nascimentoImpossivel.reply_text,
    );
    check(
      "e explica qual é o registro certo",
      nascimentoImpossivel.reply_text.includes("saldo inicial ou compra"),
    );
    const nascimentoValido = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "nascimento", categoria: "bezerra", quantidade: 1 },
        { confirmed: true },
      ),
    );
    check(
      "nascimento em Bezerra continua passando",
      nascimentoValido.action_taken.includes("nascimento"),
      nascimentoValido.reply_text,
    );

    console.log("\n13. Faixa sem sexo pergunta o sexo, não recusa");
    // Teste real: "Tenho 20 novilhas de 13 a 24 meses" fez o classificador
    // mandar categoria "13 a 24 meses", sem o sexo, e a resposta era
    // "não reconheci a categoria". A informação estava quase toda lá.
    const faixaSemSexo = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, {
        movement_type: "saldo_inicial",
        categoria: "13 a 24 meses",
        quantidade: 20,
        fazenda: "Santa Helena",
      }),
    );
    check(
      "não responde 'não reconheci'",
      !faixaSemSexo.reply_text.includes("Não reconheci"),
      faixaSemSexo.reply_text,
    );
    check(
      "pergunta o SEXO, não a idade que o produtor já disse",
      faixaSemSexo.reply_text.includes("São machos ou fêmeas?"),
      faixaSemSexo.reply_text,
    );
    check(
      "oferece as duas categorias da mesma faixa",
      faixaSemSexo.reply_text.includes("Fêmea - 13 a 24 meses") &&
        faixaSemSexo.reply_text.includes("Macho - 13 a 24 meses"),
    );

    const termoDeIdadeAmbigua = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, {
        movement_type: "saldo_inicial",
        categoria: "novilha",
        quantidade: 20,
        fazenda: "Santa Helena",
      }),
    );
    check(
      "termo de sexo conhecido e idade incerta continua perguntando a IDADE",
      termoDeIdadeAmbigua.reply_text.includes("Qual é a idade aproximada?"),
      termoDeIdadeAmbigua.reply_text,
    );

    console.log("\n14. Fazenda: não adivinha quando há mais de uma");
    await db.property.create({ data: scoped({ name: "Sítio Recanto" }) });
    const qualFazenda = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, { movement_type: "nascimento", categoria: "bezerro", quantidade: 2 }),
    );
    check(
      "com duas fazendas e nenhuma informada, pergunta",
      qualFazenda.reply_text.startsWith("Em qual fazenda?"),
      qualFazenda.reply_text,
    );
  } finally {
    await prisma.herdMovement.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.financialEntry.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.pasture.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.property.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }

  console.log("");
  console.log(
    falhas === 0
      ? "✅ Rebanho pelo WhatsApp: 0 falhas."
      : `❌ Rebanho pelo WhatsApp: ${falhas} falha(s).`,
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
