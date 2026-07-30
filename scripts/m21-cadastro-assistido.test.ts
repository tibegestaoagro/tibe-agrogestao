import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import {
  startFlow,
  applyAnswer,
  getActiveFlow,
  cancelFlow,
  finishFlow,
  resumeHint,
  shouldRemind,
  isBusinessHour,
  purgeExpiredFlows,
  collectPendingReminders,
  MAX_ITEMS,
  REMINDER_AFTER_MINUTES,
} from "@/lib/actions/agent-flows";

/**
 * Testes do cadastro assistido (2026-07-30).
 * O que mais importa aqui: NADA existe no rebanho antes da confirmação, e a
 * máquina de estados aguenta interrupção, erro de digitação e abandono.
 * Roda: `npm run test:m21`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

async function main() {
  console.log("🧑‍🌾 Cadastro assistido pelo WhatsApp\n");

  const stamp = Date.now().toString().slice(-9);
  const tA = await prisma.tenant.create({
    data: { name: "M21 A", document: `41${stamp}`, plan: "fazenda", status: "trial" },
  });
  const tB = await prisma.tenant.create({
    data: { name: "M21 B", document: `42${stamp}`, plan: "fazenda", status: "trial" },
  });
  const dbA = prismaForTenant(tA.id);
  const dbB = prismaForTenant(tB.id);
  const ids = [tA.id, tB.id];

  try {
    const uA = await dbA.user.create({
      data: scoped({ name: "Dono A", email: `m21a-${stamp}@t.local`, password_hash: "x", role: "OWNER" }),
    });
    const uB = await dbB.user.create({
      data: scoped({ name: "Dono B", email: `m21b-${stamp}@t.local`, password_hash: "x", role: "OWNER" }),
    });

    // ── abre o fluxo e pergunta UM campo por vez ──────────────────────
    const s1 = await startFlow(dbA, uA.id, "cadastrar_animal", 2);
    assert(s1.reply.includes("brinco"), "a primeira pergunta é o brinco");
    assert(s1.reply.includes("2 animais"), "avisa quantos animais serão cadastrados");

    const st = await getActiveFlow(dbA, uA.id);
    assert(st?.pending_field === "ear_tag", "estado guarda qual campo está pendente");

    // ── resposta inválida repete a MESMA pergunta ─────────────────────
    const r1 = await applyAnswer(dbA, uA.id, "  ");
    assert(r1.kind === "question" && r1.reply.includes("brinco"), "resposta vazia repete a pergunta do brinco");
    const stAinda = await getActiveFlow(dbA, uA.id);
    assert(stAinda?.pending_field === "ear_tag", "campo inválido NÃO avança o formulário");

    // ── sequência normal do primeiro animal ───────────────────────────
    const r2 = await applyAnswer(dbA, uA.id, "042");
    assert(r2.kind === "question" && r2.reply.includes("raça"), "depois do brinco pergunta a raça");
    const r3 = await applyAnswer(dbA, uA.id, "Nelore");
    assert(r3.kind === "question" && r3.reply.includes("macho"), "depois da raça pergunta o sexo");

    const rSexoRuim = await applyAnswer(dbA, uA.id, "sei lá");
    assert(rSexoRuim.kind === "question" && rSexoRuim.reply.includes("macho"), "sexo inválido repete a pergunta");

    const r4 = await applyAnswer(dbA, uA.id, "macho");
    assert(r4.kind === "question", "com 2 animais, o primeiro não fecha o fluxo");
    assert(r4.reply.includes("Brinco 042"), "confirma o animal recém-fechado numa linha");
    assert(r4.reply.includes("Faltam 1"), "avisa quantos faltam");

    assert(
      (await dbA.animal.count()) === 0,
      "NENHUM animal existe no banco com o cadastro em andamento",
    );

    // ── segundo animal fecha com o resumo ─────────────────────────────
    await applyAnswer(dbA, uA.id, "043");
    await applyAnswer(dbA, uA.id, "Angus");
    const fim = await applyAnswer(dbA, uA.id, "femea");
    assert(fim.kind === "summary", "o último animal produz o resumo");
    if (fim.kind === "summary") {
      assert(fim.items.length === 2, "o resumo traz os 2 animais coletados");
      assert(fim.reply.includes("042") && fim.reply.includes("043"), "resumo lista os dois brincos");
      assert(fim.items[1].sex === "female", "'femea' sem acento é aceito como fêmea");
    }
    assert((await dbA.animal.count()) === 0, "mesmo no resumo, ainda NADA foi gravado");

    // ── REGRESSAO 2026-07-30: audio transcrito vem com pontuacao ──────
    await finishFlow(dbA, uA.id);
    await startFlow(dbA, uA.id, "cadastrar_animal", 1);
    await applyAnswer(dbA, uA.id, "081");
    await applyAnswer(dbA, uA.id, "Nelori");
    const audio = await applyAnswer(dbA, uA.id, "Macho.");
    assert(audio.kind === "summary", "'Macho.' com ponto final (transcricao de audio) e aceito");
    if (audio.kind === "summary") {
      assert(audio.items[0].sex === "male", "'Macho.' vira male");
    }

    await finishFlow(dbA, uA.id);
    await startFlow(dbA, uA.id, "cadastrar_animal", 1);
    await applyAnswer(dbA, uA.id, "082");
    await applyAnswer(dbA, uA.id, "Nelore");
    const frase = await applyAnswer(dbA, uA.id, "É macho, sim.");
    assert(frase.kind === "summary", "frase falada ('E macho, sim.') e entendida");

    await finishFlow(dbA, uA.id);
    await startFlow(dbA, uA.id, "cadastrar_animal", 1);
    await applyAnswer(dbA, uA.id, "083");
    await applyAnswer(dbA, uA.id, "Gir");
    const femeaAudio = await applyAnswer(dbA, uA.id, "Fêmea!");
    assert(femeaAudio.kind === "summary", "'Fêmea!' com acento e exclamacao e aceito");
    if (femeaAudio.kind === "summary") {
      assert(femeaAudio.items[0].sex === "female", "'Fêmea!' vira female");
    }

    // ── REGRESSAO 2026-07-30: os 3 campos numa mensagem so ────────────
    await finishFlow(dbA, uA.id);
    await startFlow(dbA, uA.id, "cadastrar_animal", 1);
    const tudoJunto = await applyAnswer(dbA, uA.id, "082, nelori, macho");
    assert(tudoJunto.kind === "summary", "os 3 campos numa mensagem so completam o animal");
    if (tudoJunto.kind === "summary") {
      assert(tudoJunto.items[0].ear_tag === "082", `brinco fica so '082' (obtido: '${tudoJunto.items[0].ear_tag}')`);
      assert(tudoJunto.items[0].breed === "nelori", "raca fica separada do brinco");
      assert(tudoJunto.items[0].sex === "male", "sexo fica separado do brinco");
    }

    await finishFlow(dbA, uA.id);
    await startFlow(dbA, uA.id, "cadastrar_animal", 1);
    const frasePart = await applyAnswer(dbA, uA.id, "084 e Angus");
    assert(frasePart.kind === "question", "2 de 3 campos avanca para o campo que falta");
    if (frasePart.kind === "question") {
      assert(frasePart.reply.includes("macho"), "pergunta so o que ainda falta (sexo)");
    }

    await finishFlow(dbA, uA.id);
    await startFlow(dbA, uA.id, "cadastrar_animal", 2);
    await applyAnswer(dbA, uA.id, "042");
    await applyAnswer(dbA, uA.id, "Nelore");
    await applyAnswer(dbA, uA.id, "macho");
    await applyAnswer(dbA, uA.id, "043");
    await applyAnswer(dbA, uA.id, "Angus");
    await applyAnswer(dbA, uA.id, "femea");

    // ── retomada depois de interrupção ────────────────────────────────
    const stResumo = await getActiveFlow(dbA, uA.id);
    assert(stResumo?.awaiting_summary === true, "estado marca que aguarda confirmação do resumo");
    assert((resumeHint(stResumo!) ?? "").length > 0, "existe texto de retomada para o resumo");

    await finishFlow(dbA, uA.id);
    assert((await getActiveFlow(dbA, uA.id)) === null, "finishFlow encerra o cadastro");

    // ── cancelamento informa quantos foram descartados ────────────────
    await startFlow(dbA, uA.id, "cadastrar_animal", 3);
    await applyAnswer(dbA, uA.id, "100");
    await applyAnswer(dbA, uA.id, "Gir");
    await applyAnswer(dbA, uA.id, "macho");
    const cancel = await cancelFlow(dbA, uA.id);
    assert(cancel?.discarded === 1, `cancelar informa o que foi descartado (obtido: ${cancel?.discarded})`);
    assert((await getActiveFlow(dbA, uA.id)) === null, "cancelar apaga o estado");
    assert((await cancelFlow(dbA, uA.id)) === null, "cancelar sem cadastro em andamento não quebra");

    // ── um cadastro por usuário ───────────────────────────────────────
    await startFlow(dbA, uA.id, "cadastrar_animal", 1);
    await applyAnswer(dbA, uA.id, "200");
    await startFlow(dbA, uA.id, "cadastrar_animal", 1);
    const novo = await getActiveFlow(dbA, uA.id);
    assert(novo?.pending_field === "ear_tag", "começar outro cadastro reinicia do zero");
    assert((await dbA.agentFlowState.count()) === 1, "nunca existe mais de um cadastro por usuário");

    // ── teto de itens ─────────────────────────────────────────────────
    const muitos = await startFlow(dbA, uA.id, "cadastrar_animal", 500);
    assert(muitos.reply.includes(String(MAX_ITEMS)), "acima do teto o agente avisa e limita");
    const stTeto = await getActiveFlow(dbA, uA.id);
    assert(stTeto?.target_count === MAX_ITEMS, `target_count limitado a ${MAX_ITEMS}`);

    // ── lembrete de abandono ──────────────────────────────────────────
    const agora8h = new Date(2026, 6, 30, 10, 0, 0);
    const antigo = new Date(agora8h.getTime() - (REMINDER_AFTER_MINUTES + 5) * 60_000);
    const recente = new Date(agora8h.getTime() - 5 * 60_000);
    assert(shouldRemind({ updated_at: antigo, reminded_at: null }, agora8h), "cadastro parado há mais de 30 min gera lembrete");
    assert(!shouldRemind({ updated_at: recente, reminded_at: null }, agora8h), "cadastro recente NÃO gera lembrete");
    assert(
      !shouldRemind({ updated_at: antigo, reminded_at: new Date() }, agora8h),
      "quem já foi lembrado não recebe um segundo lembrete",
    );
    const madrugada = new Date(2026, 6, 30, 3, 0, 0);
    assert(!shouldRemind({ updated_at: antigo, reminded_at: null }, madrugada), "não lembra de madrugada");
    assert(isBusinessHour(agora8h) && !isBusinessHour(madrugada), "janela comercial é 8h-18h");

    // ── expiração ─────────────────────────────────────────────────────
    await dbA.agentFlowState.updateMany({
      where: { user_id: uA.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    assert((await getActiveFlow(dbA, uA.id)) === null, "cadastro vencido não é mais retomado");
    const purga = await purgeExpiredFlows(dbA);
    assert(purga.deleted >= 1, "a purga remove cadastros vencidos");

    // ── coletor de lembretes marca e nao repete ───────────────────────
    await dbA.user.update({ where: { id: uA.id }, data: { phone: "5522988887777" } });
    await startFlow(dbA, uA.id, "cadastrar_animal", 2);
    await applyAnswer(dbA, uA.id, "777");
    const agoraCom = new Date();
    agoraCom.setHours(10, 0, 0, 0);
    await dbA.agentFlowState.updateMany({
      where: { user_id: uA.id },
      data: { updated_at: new Date(agoraCom.getTime() - 45 * 60_000) },
    });
    const lembretes = await collectPendingReminders(dbA, agoraCom);
    assert(lembretes.length === 1, `coleta 1 lembrete do cadastro parado (obtido: ${lembretes.length})`);
    assert(lembretes[0]?.phone === "5522988887777", "lembrete vai para o telefone do usuário");
    assert(
      (lembretes[0]?.message ?? "").includes("cancelar"),
      "o lembrete oferece saída, para não virar armadilha",
    );
    const denovo = await collectPendingReminders(dbA, agoraCom);
    assert(denovo.length === 0, "a segunda passada NÃO reenvia o mesmo lembrete");

    const semTelefone = await dbB.user.update({ where: { id: uB.id }, data: { phone: null } });
    await startFlow(dbB, semTelefone.id, "cadastrar_animal", 1);
    await dbB.agentFlowState.updateMany({
      where: { user_id: uB.id },
      data: { updated_at: new Date(agoraCom.getTime() - 45 * 60_000) },
    });
    const semTel = await collectPendingReminders(dbB, agoraCom);
    assert(semTel.length === 0, "usuário sem telefone não entra na fila de lembrete");
    await dbB.agentFlowState.deleteMany({ where: { user_id: uB.id } });
    await dbA.agentFlowState.deleteMany({ where: { user_id: uA.id } });

    // ── isolamento multi-tenant ───────────────────────────────────────
    await startFlow(dbA, uA.id, "cadastrar_animal", 1);
    await startFlow(dbB, uB.id, "cadastrar_animal", 1);
    await applyAnswer(dbB, uB.id, "999");
    const flowA = await getActiveFlow(dbA, uA.id);
    assert(flowA?.pending_field === "ear_tag", "avanço no tenant B não mexe no cadastro do tenant A");
    assert((await dbA.agentFlowState.count()) === 1, "tenant A só enxerga o próprio cadastro");
    assert((await getActiveFlow(dbA, uB.id)) === null, "usuário de outro tenant não é alcançável pelo client escopado");
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Cadastro assistido: 0 falhas.");
  else console.error(`❌ Cadastro assistido: ${failures} falha(s).`);
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
