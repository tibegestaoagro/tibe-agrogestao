import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped, type TenantPrismaClient } from "@/lib/prisma";
import { recordMovement } from "@/lib/actions/herd-ledger";
import {
  consultarRebanho,
  registrarMovimentacaoRebanho,
} from "@/lib/actions/whatsapp-handlers/herd";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";

exigirBancoLocal();


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
    // Sem `user_id` não há memória de pergunta pendente: a maioria das seções
    // roda assim de propósito, para provar que cada resposta se sustenta
    // sozinha. A seção do pendente passa um id.
    user_id: opts.userId,
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
      "não grava nascimento em Fêmea 13 a 24 meses",
      nascimentoImpossivel.action_taken === "clarification_requested",
      nascimentoImpossivel.reply_text,
    );
    check(
      "explica por que não é nascimento e oferece a saída",
      nascimentoImpossivel.reply_text.includes("não é nascimento") &&
        nascimentoImpossivel.reply_text.includes("Saldo inicial"),
      nascimentoImpossivel.reply_text,
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

    console.log("\n14. Pergunta pendente: o pedido guardado manda, não o LLM");
    // A regressão exata do teste real de 2026-08-06: "Tenho 20 novilhas" (que
    // é saldo inicial) virava NASCIMENTO quando o produtor respondia a faixa,
    // porque o classificador herdava o tipo de outra conversa. Agora o tipo
    // vem do pedido guardado, e da resposta entra só a categoria.
    const quemPergunta = `user-pendente-${stamp}`;

    const perguntaFaixa = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        {
          movement_type: "saldo_inicial",
          categoria: "novilhas",
          quantidade: 20,
          fazenda: "Santa Helena",
        },
        { userId: quemPergunta },
      ),
    );
    check(
      "primeiro pergunta a faixa",
      perguntaFaixa.reply_text.includes("Qual é a idade aproximada?"),
      perguntaFaixa.reply_text,
    );

    // O classificador volta com o TIPO ERRADO e sem a quantidade, que é
    // exatamente o que ele fez em produção.
    const respostaComLixo = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "nascimento", categoria: "Fêmea - 13 a 24 meses" },
        { userId: quemPergunta },
      ),
    );
    check(
      "o tipo errado do classificador é ignorado: vale o pedido guardado",
      respostaComLixo.reply_text.startsWith("Deseja registrar 20 fêmeas de 13 a 24 meses"),
      respostaComLixo.reply_text,
    );
    check(
      "e NÃO caiu na trava de nascimento, porque nunca foi nascimento",
      !respostaComLixo.reply_text.includes("Bezerro ou Bezerra"),
      respostaComLixo.reply_text,
    );

    const simFinal = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, {}, { confirmed: true, userId: quemPergunta }),
    );
    check(
      "o 'sim' executa o pedido guardado, mesmo sem parâmetro nenhum na mensagem",
      simFinal.action_taken.includes("saldo_inicial") &&
        simFinal.reply_text.includes("20 fêmeas de 13 a 24 meses"),
      `${simFinal.action_taken} | ${simFinal.reply_text}`,
    );

    const semPendenteAgora = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "morte", categoria: "Fêmea - 13 a 24 meses", quantidade: 1 },
        { userId: quemPergunta },
      ),
    );
    check(
      "depois de registrar, o pendente é limpo e o pedido novo passa inteiro",
      semPendenteAgora.reply_text.startsWith("Deseja registrar a morte de 1"),
      `${semPendenteAgora.action_taken} | ${semPendenteAgora.reply_text}`,
    );

    console.log("\n14b. 'sim' sem nada pendente NÃO grava (gravação fantasma)");
    // O pior defeito do teste real de 2026-08-10: o produtor mandou VENDER
    // 100, o assistente respondeu "você tem 18", e o "sim" gravou 18 animais
    // de saldo inicial que ninguem pediu. O numero veio da propria resposta
    // do assistente, lida do historico pelo classificador.
    const quemSoDizSim = `user-sim-solto-${stamp}`;
    const simSolto = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "saldo_inicial", categoria: "Fêmea - 13 a 24 meses", quantidade: 18 },
        { confirmed: true, userId: quemSoDizSim },
      ),
    );
    check(
      "não registra: nada foi mostrado para confirmar",
      simSolto.action_taken === "clarification_requested" &&
        simSolto.reply_text.includes("esperando confirmação"),
      `${simSolto.action_taken} | ${simSolto.reply_text}`,
    );

    console.log("\n14c. Saldo insuficiente na MESMA posição usa a mensagem do cliente");
    // Teste real: "vendi 100" com 18 em estoque respondia "Não encontrei ...
    // sem pasto informado. Você tem 18 em sem pasto informado", apontando o
    // mesmo lugar duas vezes. O aviso de "onde estão" só vale para OUTRO lugar.
    const quemVendeDemais = `user-vende-${stamp}`;
    const pedeVenda = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "venda", categoria: "Fêmea - 13 a 24 meses", quantidade: 999 },
        { userId: quemVendeDemais },
      ),
    );
    check(
      "não devolve o aviso de pasto quando o saldo está no mesmo lugar",
      !pedeVenda.reply_text.includes("Não encontrei"),
      pedeVenda.reply_text,
    );

    console.log("\n15. Nascimento com categoria adulta: pergunta o tipo, não recusa");
    // Teste real de 2026-08-06: o classificador mandava nascimento JA NA
    // PRIMEIRA mensagem de "tenho 20 novilhas". Guardar o pedido preservava o
    // tipo errado, e a trava recusava: o produtor repetia a frase e caía no
    // mesmo lugar. Agora a saída é perguntar o tipo, que é o dado errado.
    const quemInsiste = `user-conflito-${stamp}`;
    const conflito = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        {
          movement_type: "nascimento",
          categoria: "Fêmea - 13 a 24 meses",
          quantidade: 20,
          fazenda: "Santa Helena",
        },
        { userId: quemInsiste },
      ),
    );
    check(
      "não é mais um beco sem saída: pergunta o que registrar",
      conflito.reply_text.includes("O que você quer registrar?"),
      conflito.reply_text,
    );
    check(
      "oferece saldo inicial e compra",
      conflito.reply_text.includes("Saldo inicial") && conflito.reply_text.includes("Compra"),
    );

    const respondeuTipo = await registrarMovimentacaoRebanho(
      ctx(
        db,
        tenant.id,
        { movement_type: "saldo_inicial" },
        { confirmed: true, userId: quemInsiste },
      ),
    );
    check(
      "respondido o tipo, registra com a categoria e a quantidade originais",
      respondeuTipo.reply_text.includes("20 fêmeas de 13 a 24 meses"),
      `${respondeuTipo.action_taken} | ${respondeuTipo.reply_text}`,
    );

    console.log("\n16. Laço de pergunta: para depois de insistir");
    const quemNaoResolve = `user-laco-${stamp}`;
    const params = {
      movement_type: "saldo_inicial",
      categoria: "novilhas",
      quantidade: 5,
      fazenda: "Santa Helena",
    };
    const volta1 = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, params, { userId: quemNaoResolve }),
    );
    const volta2 = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, params, { userId: quemNaoResolve }),
    );
    const volta3 = await registrarMovimentacaoRebanho(
      ctx(db, tenant.id, params, { userId: quemNaoResolve }),
    );
    check("1a e 2a vez ainda perguntam", volta1.reply_text.includes("idade aproximada") && volta2.reply_text.includes("idade aproximada"));
    check(
      "3a vez para de perguntar e ensina o que escrever",
      volta3.reply_text.includes("tudo numa frase só"),
      volta3.reply_text,
    );

    console.log("\n17. Fazenda: não adivinha quando há mais de uma");
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
