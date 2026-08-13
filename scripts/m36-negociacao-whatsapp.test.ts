import "dotenv/config";
import { prisma, prismaForTenant, scoped, type TenantPrismaClient } from "@/lib/prisma";
import {
  registrarNegocioGado,
  _montarParcelas,
  _custosDosParametros,
} from "@/lib/actions/whatsapp-handlers/negociacao";
import { clearPendingNegotiation } from "@/lib/actions/negotiation-pending";
import { getPositions } from "@/lib/actions/herd-ledger";
import type { HandlerCtx } from "@/lib/actions/whatsapp-handlers/shared";

/**
 * Módulo 31: registro de negócio de gado pelo WhatsApp (§22).
 *
 * O que este arquivo protege são as três regras que já falharam em produção no
 * Módulo 30, agora num caminho que grava rebanho E financeiro de uma vez:
 * recusa vence tudo, confirmação é sempre obrigatória, e o "sim" executa o que
 * foi MOSTRADO. Cada uma delas custou uma rodada de teste com o usuário.
 *
 * Roda: `npm run test:m36`
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
    user_id: opts.userId,
  };
}

async function main() {
  console.log("💬 Módulo 31: negócio de gado pelo WhatsApp (§22)\n");

  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "M36 Negocio Whats", document: `36${stamp}0`, plan: "fazenda" },
  });

  const usuario = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "Produtor de Teste",
      email: `m36-${stamp}@teste.local`,
      password_hash: "x",
      role: "OWNER",
    },
  });
  const USUARIO = usuario.id;

  try {
    const db = prismaForTenant(tenant.id);
    const fazenda = await db.property.create({
      data: scoped({ name: "Fazenda Boa Vista" }),
    });
    await clearPendingNegotiation(tenant.id, USUARIO);

    // ------------------------------------------------------------------
    console.log("\n1. Funções puras: parcelas e custos");
    // ------------------------------------------------------------------

    const p3 = _montarParcelas(60000, 3, new Date("2026-08-13T12:00:00Z"));
    check("3 parcelas geradas", p3.length === 3, String(p3.length));
    check(
      "a soma das parcelas bate exatamente com o total",
      p3.reduce((s, x) => s + x.amount, 0) === 60000,
      String(p3.reduce((s, x) => s + x.amount, 0)),
    );
    check("primeira parcela vence no mês seguinte", p3[0].due_date.getMonth() === 8, String(p3[0].due_date));

    // O caso que a divisão simples erra: 100 / 3 = 33,333...
    const p3quebrado = _montarParcelas(100, 3, new Date("2026-08-13T12:00:00Z"));
    check(
      "divisão inexata: a soma continua exata (a última parcela absorve o centavo)",
      p3quebrado.reduce((s, x) => s + x.amount, 0) === 100,
      JSON.stringify(p3quebrado.map((x) => x.amount)),
    );

    check(
      "custo plano: 'com 2 mil de frete'",
      _custosDosParametros({ frete: 2000 })[0]?.valor === 2000,
    );
    check(
      "custo estruturado: lista com descrição",
      _custosDosParametros({ custos: [{ descricao: "Comissão", valor: 1500 }] })[0]?.descricao ===
        "Comissão",
    );
    check("custo zero é ignorado", _custosDosParametros({ frete: 0 }).length === 0);

    // ------------------------------------------------------------------
    console.log("\n2. Confirmação é obrigatória, e nada é gravado antes dela");
    // ------------------------------------------------------------------

    const pergunta = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "bezerro", quantidade: 20, valor: 60000 }),
    );
    check("pede confirmação", pergunta.requires_confirmation === true, pergunta.reply_text);
    check(
      "mostra o que vai ser escrito, com valor",
      pergunta.reply_text.includes("20 bezerros") && pergunta.reply_text.includes("60.000"),
      pergunta.reply_text,
    );
    check(
      "avisa que vai mexer no rebanho e no financeiro",
      pergunta.reply_text.includes("rebanho") && pergunta.reply_text.includes("financeiro"),
      pergunta.reply_text,
    );
    check(
      "NADA foi gravado antes do sim",
      (await db.negotiation.count()) === 0,
      String(await db.negotiation.count()),
    );

    // Valor de R$ 500, bem abaixo do limite de R$ 5.000 do Módulo 3: ainda
    // assim confirma. Um negócio pequeno lançado errado suja o rebanho igual.
    const pequeno = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "bezerro", quantidade: 1, valor: 500 }),
    );
    check(
      "valor abaixo do CONFIRMATION_THRESHOLD também confirma",
      pequeno.requires_confirmation === true,
      pequeno.reply_text,
    );

    // ------------------------------------------------------------------
    console.log('\n3. Regra 1: "cancela" vence tudo, inclusive uma pergunta pendente');
    // ------------------------------------------------------------------

    const recusa = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { explicitNo: true, userId: USUARIO }),
    );
    check("recusa não grava nada", recusa.reply_text.includes("não registrei nada"), recusa.reply_text);
    check("recusa não pede confirmação de novo", recusa.requires_confirmation === false);
    check("recusa é registrada como cancelamento", recusa.action_taken.endsWith(":cancelado"));

    // Com uma pergunta em aberto, "cancela" ainda cancela: era exatamente aqui
    // que o rebanho devolvia a pergunta de novo, sem cancelar (achado real).
    await registrarNegocioGado(ctx(db, tenant.id, { tipo: "compra" }, { userId: USUARIO }));
    const recusaComPendencia = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { explicitNo: true, userId: USUARIO }),
    );
    check(
      "com pergunta pendente, cancela de verdade em vez de repetir a pergunta",
      recusaComPendencia.reply_text.includes("não registrei nada"),
      recusaComPendencia.reply_text,
    );

    // ------------------------------------------------------------------
    console.log('\n4. Regra 3: "sim" sem nada mostrado não escreve');
    // ------------------------------------------------------------------

    await clearPendingNegotiation(tenant.id, USUARIO);
    const simSolto = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "bezerro", quantidade: 18, valor: 1000 }, {
        confirmed: true,
        userId: USUARIO,
      }),
    );
    check(
      "sim sem pedido guardado é recusado",
      simSolto.reply_text.includes("Não tenho nenhum negócio esperando confirmação"),
      simSolto.reply_text,
    );
    check("e não gravou nada", (await db.negotiation.count()) === 0);

    // ------------------------------------------------------------------
    console.log("\n5. Compra completa: rebanho sobe e o financeiro nasce junto");
    // ------------------------------------------------------------------

    await clearPendingNegotiation(tenant.id, USUARIO);
    const antes = await getPositions(db, {});
    const totalAntes = antes.reduce((s, p) => s + p.quantity, 0);

    await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "compra", categoria: "bezerro", quantidade: 20, valor: 60000, parcelas: 3, frete: 2000 },
        { userId: USUARIO },
      ),
    );
    const gravou = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { confirmed: true, userId: USUARIO }),
    );

    check("confirma e registra", gravou.reply_text.startsWith("✅ Compra registrada"), gravou.reply_text);
    check("diz que os animais entraram", gravou.reply_text.includes("entraram no rebanho"), gravou.reply_text);
    check("diz quantas parcelas", gravou.reply_text.includes("3 parcelas"), gravou.reply_text);

    const depois = await getPositions(db, {});
    const totalDepois = depois.reduce((s, p) => s + p.quantity, 0);
    check("o rebanho subiu 20", totalDepois - totalAntes === 20, `${totalAntes} -> ${totalDepois}`);

    const negociacoes = await db.negotiation.findMany();
    check("uma negociação criada", negociacoes.length === 1, String(negociacoes.length));
    check("do tipo compra_gado", negociacoes[0]?.type === "compra_gado", negociacoes[0]?.type);

    const lancamentos = await db.financialEntry.findMany({
      where: { negotiation_id: negociacoes[0].id },
    });
    const principais = lancamentos.filter((l) => l.negotiation_role === "principal");
    const adicionais = lancamentos.filter((l) => l.negotiation_role === "custo_adicional");
    check("3 lançamentos de principal", principais.length === 3, String(principais.length));
    check("1 lançamento de custo adicional", adicionais.length === 1, String(adicionais.length));
    check(
      "a soma das parcelas é o valor combinado, sem os custos",
      principais.reduce((s, l) => s + Number(l.amount), 0) === 60000,
      String(principais.reduce((s, l) => s + Number(l.amount), 0)),
    );
    check(
      "todos os lançamentos de compra são despesa",
      lancamentos.every((l) => l.entry_type === "expense"),
    );

    const movimentos = await db.herdMovement.findMany({
      where: { negotiation_id: negociacoes[0].id },
    });
    check("um movimento de rebanho ligado à negociação", movimentos.length === 1);
    check("do tipo compra", movimentos[0]?.movement_type === "compra", movimentos[0]?.movement_type);
    check(
      "na categoria certa",
      movimentos[0]?.to_category_id === "bezerro_0_7",
      String(movimentos[0]?.to_category_id),
    );

    // ------------------------------------------------------------------
    console.log("\n6. Venda: o rebanho desce e o financeiro vira receita");
    // ------------------------------------------------------------------

    await clearPendingNegotiation(tenant.id, USUARIO);
    await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "venda", categoria: "bezerro", quantidade: 5, valor: 20000 },
        { userId: USUARIO },
      ),
    );
    const vendeu = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { confirmed: true, userId: USUARIO }),
    );
    check("venda registrada", vendeu.reply_text.startsWith("✅ Venda registrada"), vendeu.reply_text);
    check("diz que saíram do rebanho", vendeu.reply_text.includes("saíram do rebanho"), vendeu.reply_text);
    check("lança como conta a receber", vendeu.reply_text.includes("a receber"), vendeu.reply_text);

    const depoisVenda = await getPositions(db, {});
    check(
      "o rebanho desceu 5",
      depoisVenda.reduce((s, p) => s + p.quantity, 0) === totalDepois - 5,
      String(depoisVenda.reduce((s, p) => s + p.quantity, 0)),
    );

    const vendaNeg = await db.negotiation.findFirst({ where: { type: "venda_gado" } });
    const receitas = await db.financialEntry.findMany({ where: { negotiation_id: vendaNeg!.id } });
    check("venda gera receita", receitas.every((l) => l.entry_type === "income"), JSON.stringify(receitas.map((r) => r.entry_type)));

    // ------------------------------------------------------------------
    console.log("\n7. Não chuta: categoria ambígua e saldo insuficiente");
    // ------------------------------------------------------------------

    await clearPendingNegotiation(tenant.id, USUARIO);
    const ambigua = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra", categoria: "novilha", quantidade: 10, valor: 30000 }),
    );
    check(
      "categoria ambígua vira pergunta, não chute",
      ambigua.reply_text.includes("pode ser mais de uma categoria"),
      ambigua.reply_text,
    );
    check("e não pede confirmação", ambigua.requires_confirmation === false);

    await clearPendingNegotiation(tenant.id, USUARIO);
    await registrarNegocioGado(
      ctx(
        db,
        tenant.id,
        { tipo: "venda", categoria: "bezerro", quantidade: 9999, valor: 100 },
        { userId: USUARIO },
      ),
    );
    const semSaldo = await registrarNegocioGado(
      ctx(db, tenant.id, {}, { confirmed: true, userId: USUARIO }),
    );
    check(
      "vender mais do que existe é recusado pelo livro-razão",
      semSaldo.reply_text.startsWith("⚠️"),
      semSaldo.reply_text,
    );
    check(
      "e a recusa não deixou negociação órfã",
      (await db.negotiation.count()) === 2,
      String(await db.negotiation.count()),
    );

    // ------------------------------------------------------------------
    console.log("\n8. O que falta vira pergunta, um campo por vez");
    // ------------------------------------------------------------------

    await clearPendingNegotiation(tenant.id, USUARIO);
    const semTipo = await registrarNegocioGado(
      ctx(db, tenant.id, { categoria: "bezerro", quantidade: 10 }, { userId: USUARIO }),
    );
    check("sem tipo, pergunta compra ou venda", semTipo.reply_text.includes("compra ou uma venda"), semTipo.reply_text);

    // A resposta curta "compra" precisa se juntar ao que já estava guardado:
    // é aqui que o classificador do Módulo 30 trocava o pedido inteiro.
    const respondeuTipo = await registrarNegocioGado(
      ctx(db, tenant.id, { tipo: "compra" }, { userId: USUARIO }),
    );
    check(
      "a resposta curta se junta ao pedido guardado (quantidade e categoria preservadas)",
      respondeuTipo.reply_text.includes("Por quanto"),
      respondeuTipo.reply_text,
    );

    const respondeuValor = await registrarNegocioGado(
      ctx(db, tenant.id, { valor: 25000 }, { userId: USUARIO }),
    );
    check(
      "com o valor, chega na confirmação com TUDO que foi dito ao longo da conversa",
      respondeuValor.requires_confirmation === true &&
        respondeuValor.reply_text.includes("10 bezerros") &&
        respondeuValor.reply_text.includes("25.000"),
      respondeuValor.reply_text,
    );

    await clearPendingNegotiation(tenant.id, USUARIO);
  } finally {
    await prisma.financialEntry.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.herdMovement.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.negotiation.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.contact.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.property.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.user.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    await clearPendingNegotiation(tenant.id, USUARIO);
  }

  console.log("");
  console.log(
    falhas === 0
      ? "✅ Negócio de gado pelo WhatsApp: 0 falhas."
      : `❌ Negócio de gado pelo WhatsApp: ${falhas} falha(s).`,
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
