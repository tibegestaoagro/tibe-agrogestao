import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";

/**
 * Integração do cadastro assistido pela rota real (2026-07-30, abertura
 * consolidada desde 2026-08-01).
 *
 * O m21 cobre a máquina de estados isolada; aqui o caminho é o de verdade:
 * execute-action -> routeIntent -> ponte -> fluxo. É onde os dois bugs
 * relatados pelo usuário apareceram, e nenhum teste passava por aqui. Por
 * isso a prova de que o caminho feliz caiu para 2 mensagens (abertura
 * consolidada + confirmação) também mora aqui, não só no m21.
 * Roda: `npm run test:m22`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else { console.error(`  ❌ ${msg}`); failures++; }
}

const SECRET = process.env.INTERNAL_API_SECRET ?? "dev-internal-secret";

async function say(tenantId: string, userId: string, intent: string, text: string, parameters: Record<string, unknown> = {}) {
  const req = new Request("http://localhost/api/internal/whatsapp/execute-action", {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": SECRET },
    body: JSON.stringify({ tenant_id: tenantId, user_id: userId, intent, parameters, message_text: text }),
  });
  const res = await executeAction(req);
  const body = await res.json();
  return (body?.data?.reply_text as string) ?? `ERRO: ${JSON.stringify(body)}`;
}

async function main() {
  console.log("🔗 Cadastro assistido: integração pela rota real\n");
  const stamp = Date.now().toString().slice(-9);
  const t = await prisma.tenant.create({
    data: { name: "M22", document: `43${stamp}`, plan: "fazenda", status: "trial" },
  });
  const db = prismaForTenant(t.id);
  try {
    await db.tenantProfile.create({ data: scoped({ profile_type: "fazenda", active: true }) });
    const prop = await db.property.create({ data: scoped({ name: "Sede" }) });
    const u = await db.user.create({
      data: scoped({ name: "Dono", email: `m22-${stamp}@t.local`, password_hash: "x", role: "OWNER" }),
    });

    const abre = await say(t.id, u.id, "cadastrar_animal", "quero cadastrar um boi, me ajuda");
    assert(
      abre.includes("brinco") && abre.includes("raça") && abre.includes("sexo"),
      `pedido sem campos abre o modo assistido pedindo os 3 campos de uma vez (resposta: "${abre.slice(0, 80)}")`,
    );

    // Caminho feliz (2026-08-01): abertura consolidada + os 3 campos numa
    // mensagem so + confirmacao = 2 perguntas do agente antes de salvar, em
    // vez das 4 de antes (brinco, raca, sexo, confirmacao). Era o BUG 2
    // relatado (a frase inteira virava o brinco); agora e o caminho normal.
    const tudo = await say(t.id, u.id, "ambigua", "082, nelori, macho");
    assert(tudo.includes("Confere antes de eu salvar"), "3 campos numa mensagem so chegam direto ao resumo (2a e ultima pergunta do agente)");
    // O resumo formata como "Brinco 082, nelori, macho.", entao procurar a
    // substring "082, nelori" daria falso positivo: a prova de que os campos
    // foram separados e o resumo trazer os TRES, e o brinco no banco (abaixo).
    assert(
      tudo.includes("Brinco 082") && tudo.includes("nelori") && tudo.includes("macho"),
      "o resumo traz os 3 campos separados, nao a frase crua no brinco",
    );

    assert((await db.animal.count()) === 0, "nada gravado antes da confirmacao");

    const ok = await say(t.id, u.id, "ambigua", "sim");
    assert(ok.includes("cadastrado"), `confirmacao grava (resposta: "${ok.slice(0, 40)}")`);
    const criado = await db.animal.findFirst({});
    assert(criado?.ear_tag === "082", `brinco gravado corretamente (obtido: "${criado?.ear_tag}")`);
    assert(criado?.property_id === prop.id, "animal vai para a propriedade ativa");

    // BUG 1 relatado: audio transcrito com pontuacao. Tambem confirma que a
    // abertura do 2o cadastro (independente do 1o) continua consolidada, e
    // que quem responde campo a campo (habito antigo) ainda e atendido.
    const abre2 = await say(t.id, u.id, "cadastrar_animal", "cadastrar mais um boi");
    assert(
      abre2.includes("raça") && abre2.includes("sexo"),
      `abertura de um novo cadastro tambem pede os 3 campos de uma vez (resposta: "${abre2.slice(0, 80)}")`,
    );
    await say(t.id, u.id, "ambigua", "090");
    await say(t.id, u.id, "ambigua", "Angus");
    const audio = await say(t.id, u.id, "ambigua", "Macho.");
    assert(audio.includes("Confere antes de eu salvar"), "'Macho.' vindo de audio e aceito pela rota real");

    // interrupcao no meio nao perde o formulario
    const saldo = await say(t.id, u.id, "consultar_saldo", "qual meu saldo?");
    assert(!saldo.includes("Confere antes"), "pergunta de outro assunto e respondida, nao tratada como campo");
    const aindaTem = await db.agentFlowState.count();
    assert(aindaTem === 1, "o cadastro sobrevive a interrupcao");

    const cancel = await say(t.id, u.id, "ambigua", "cancelar");
    assert(cancel.toLowerCase().includes("cancelei"), "cancelar encerra pelo caminho real");
    assert((await db.agentFlowState.count()) === 0, "estado apagado apos cancelar");

    // resposta parcial (2 de 3 campos) pela rota real: m21 cobre isolado,
    // aqui confirma que o roteador de verdade chega no mesmo resultado, sem
    // reiniciar o item do zero.
    await say(t.id, u.id, "cadastrar_animal", "cadastrar outro boi");
    const parcial = await say(t.id, u.id, "ambigua", "091 e Nelore");
    assert(
      parcial.includes("macho") && !parcial.includes("Confere antes de eu salvar"),
      `2 de 3 campos numa mensagem so pergunta so o que falta (resposta: "${parcial.slice(0, 60)}")`,
    );
    const limpa = await say(t.id, u.id, "ambigua", "cancelar");
    assert(limpa.toLowerCase().includes("cancelei"), "limpa o cadastro de teste ao final");
  } finally {
    await prisma.tenant.delete({ where: { id: t.id } });
  }
  console.log("");
  if (failures === 0) console.log("✅ Integração: 0 falhas.");
  else console.error(`❌ Integração: ${failures} falha(s).`);
}

main().then(async () => { await prisma.$disconnect(); process.exit(failures === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("❌ Erro inesperado:", e); await prisma.$disconnect(); process.exit(1); });
