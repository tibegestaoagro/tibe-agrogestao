import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { executarIntencao } from "@/lib/actions/executar-intencao";
import { executarTurno } from "@/lib/actions/turno";

exigirBancoLocal();

/**
 * Módulo 39 (Meu Empório), F6b, Q120: quem é só da loja (Gestor, Vendedor, ou
 * Gerente geral com `emporio_only`) não usa o agente do WhatsApp. A trava vale
 * nos dois caminhos (`executarIntencao`, que serve ao `execute-action` e ao
 * turno, e o próprio `executarTurno`, que recusa antes de classificar).
 *
 * Roda: `npm run test:m88`
 */

const FRASE = "O Empório ainda não está no WhatsApp. Use o Tibé pelo navegador.";

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.error(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function main() {
  console.log("💬 Módulo 39, F6b: o agente do WhatsApp recusa quem é só da loja\n");

  // Nenhuma chamada ao modelo de verdade: conta e falha.
  const fetchReal = globalThis.fetch;
  let chamadasAoModelo = 0;
  globalThis.fetch = (async () => {
    chamadasAoModelo += 1;
    throw new Error("sem rede nesta suíte");
  }) as typeof fetch;

  const stamp = Date.now().toString().slice(-9);
  const tenant = await prisma.tenant.create({
    data: { name: "M88 So da loja", document: `88${stamp}0`, plan: "fazenda" },
  });
  await prisma.tenantProfile.create({ data: { tenant_id: tenant.id, profile_type: "fazenda", active: true } });
  const db = prismaForTenant(tenant.id);

  try {
    await db.property.create({ data: scoped({ name: "Fazenda M88" }) });
    let n = 0;
    const mk = async (suf: string, role: "OWNER" | "ADMIN" | "OPERADOR", extra: Record<string, unknown> = {}) => {
      n += 1;
      const phone = `55119${String(stamp).slice(-6)}${String(n).padStart(2, "0")}`;
      const u = await prisma.user.create({
        data: { tenant_id: tenant.id, name: `M88 ${suf}`, email: `m88-${suf}-${stamp}@teste.local`, password_hash: "x", role, phone, active: true, ...extra },
      });
      const c = await prisma.whatsAppContact.create({ data: { tenant_id: tenant.id, phone, user_id: u.id, last_interaction_at: new Date() } });
      return { id: u.id, role, phone, contato: c.id };
    };

    const dono = await mk("dono", "OWNER");
    const ggSoLoja = await mk("ggsl", "ADMIN", { emporio_role: "gerente_geral", emporio_only: true });
    const ggNormal = await mk("ggn", "ADMIN", { emporio_role: "gerente_geral", emporio_only: false });
    const gestor = await mk("gestor", "OPERADOR", { emporio_role: "gestor" });
    const vendedor = await mk("vend", "OPERADOR", { emporio_role: "vendedor" });

    const efeitos = async (userId: string) => ({
      fluxos: await db.agentFlowState.count({ where: { user_id: userId } }),
      requests: await db.agentRequest.count(),
      animais: await db.animalBatch.count(),
    });

    const intencao = (a: { id: string; role: "OWNER" | "ADMIN" | "OPERADOR" }, texto: string, wamid: string) =>
      executarIntencao({
        db,
        tenant_id: tenant.id,
        user: { id: a.id, role: a.role },
        contato_id: null,
        activeProfiles: ["fazenda"],
        intent: "cadastrar_animal",
        parameters: { property_name: "Fazenda M88", ear_tag: "M88-1" },
        message_text: texto,
        confirmed_do_corpo: null,
        provider_message_id: wamid,
        registrar_entrada: false,
      });

    console.log("1. Caminho do execute-action e do turno (executarIntencao)");
    for (const [nome, a] of [["Vendedor", vendedor], ["Gestor", gestor], ["Gerente geral com emporio_only", ggSoLoja]] as const) {
      const antes = await efeitos(a.id);
      const r = await intencao(a, "cadastra um animal", `w-${nome}`);
      const depois = await efeitos(a.id);
      check(`${nome}: recebe a frase exata`, r.reply_text === FRASE, r.reply_text);
      check(`${nome}: nada é gravado (fluxo, request, animal)`, JSON.stringify(antes) === JSON.stringify(depois), JSON.stringify({ antes, depois }));
      const sim = await intencao(a, "sim", `w-${nome}-sim`);
      check(`${nome}: um "sim" também recebe a frase`, sim.reply_text === FRASE, sim.reply_text);
    }

    console.log("\n2. Fluxo pendente não é retomado");
    await db.agentFlowState.create({
      data: scoped({ user_id: vendedor.id, flow: "cadastrar_animal", data: {}, expires_at: new Date(Date.now() + 3600_000) }) as never,
    }).catch(() => null);
    const fluxoAntes = await db.agentFlowState.count({ where: { user_id: vendedor.id } });
    const retomada = await intencao(vendedor, "brinco 123", "w-retomada");
    check("Vendedor com fluxo aberto: recebe a frase", retomada.reply_text === FRASE, retomada.reply_text);
    check("fluxo aberto não muda", (await db.agentFlowState.count({ where: { user_id: vendedor.id } })) === fluxoAntes);

    console.log("\n3. Quem não é só da loja segue normal");
    for (const [nome, a] of [["Dono", dono], ["Gerente geral sem emporio_only", ggNormal]] as const) {
      const r = await intencao(a, "cadastra um animal", `w-${nome}`);
      check(`${nome}: NÃO recebe a frase`, r.reply_text !== FRASE, r.reply_text);
      check(`${nome}: a intenção foi tratada`, r.action_taken !== "so_da_loja", r.action_taken);
    }

    console.log("\n4. O turno recusa antes de classificar");
    for (const [nome, a] of [["Vendedor", vendedor], ["Gestor", gestor], ["Gerente geral com emporio_only", ggSoLoja]] as const) {
      const antes = await efeitos(a.id);
      const s = await executarTurno({ telefone: a.phone, texto: "cadastra um animal brinco 5", provider_message_id: `t-${nome}` });
      const depois = await efeitos(a.id);
      check(`${nome}: uma mensagem com a frase`, s.mensagens.length === 1 && s.mensagens[0].texto === FRASE, JSON.stringify(s.mensagens));
      check(`${nome}: nada gravado`, antes.fluxos === depois.fluxos && antes.animais === depois.animais, JSON.stringify({ antes, depois }));
    }
    check("o modelo não foi chamado para quem é só da loja", chamadasAoModelo === 0, String(chamadasAoModelo));

    const sDono = await executarTurno({ telefone: dono.phone, texto: "oi", provider_message_id: "t-dono" });
    check("Dono no turno: NÃO recebe a frase", !sDono.mensagens.some((m) => m.texto === FRASE), JSON.stringify(sDono.mensagens));
    const sGg = await executarTurno({ telefone: ggNormal.phone, texto: "oi", provider_message_id: "t-ggn" });
    check("Gerente geral sem emporio_only no turno: NÃO recebe a frase", !sGg.mensagens.some((m) => m.texto === FRASE), JSON.stringify(sGg.mensagens));
  } finally {
    globalThis.fetch = fetchReal;
    for (const m of ["agentConversationLog", "agentRequest", "agentFlowState", "animalBatch", "whatsAppContact", "property", "user", "tenantProfile"]) {
      try {
        await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenant_id: tenant.id } });
      } catch {
        // limpeza de melhor esforço
      }
    }
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }
}

main()
  .catch((e) => {
    falhas += 1;
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(falhas === 0 ? "\n✅ M88 verde" : `\n❌ M88: ${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  });
