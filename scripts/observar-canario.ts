import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * Fase 7 do agente: a semana observada do canário. SÓ LEITURA.
 *
 * Lista toda conversa dos contatos que passaram pela rota de turno nos últimos
 * N dias, na ordem em que aconteceu, para conferir à mão o que o agente
 * entendeu e o que fez. Lê o banco do `.env`, que é produção: é de propósito,
 * e é por isso que o script não escreve nada.
 *
 * ⚠️ Quem marca o contato como "do caminho novo" é a ENTRADA: só ela carrega
 * `prompt_version`. A resposta é gravada pelo núcleo (`executar-intencao.ts`),
 * que não conhece a versão do prompt e é quem tem a intenção e a ação. Filtrar
 * a listagem por `prompt_version` esconderia metade da conversa, que é
 * justamente a metade que diz o que foi feito.
 *
 *   npx tsx scripts/observar-canario.ts        # últimos 7 dias
 *   npx tsx scripts/observar-canario.ts 1      # só as últimas 24 horas
 */
async function main() {
  const dias = Number(process.argv[2] ?? 7);
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const doTurno = await prisma.agentConversationLog.findMany({
    where: { prompt_version: { not: null }, created_at: { gte: desde } },
    select: { whatsapp_contact_id: true },
    distinct: ["whatsapp_contact_id"],
  });
  const contatos = doTurno.map((l) => l.whatsapp_contact_id);

  const linhas = await prisma.agentConversationLog.findMany({
    where: { whatsapp_contact_id: { in: contatos }, created_at: { gte: desde } },
    orderBy: { created_at: "asc" },
    select: {
      created_at: true,
      direction: true,
      content: true,
      intent_detected: true,
      action_taken: true,
      prompt_version: true,
      tenant: { select: { name: true } },
    },
  });

  const porAcao = new Map<string, number>();
  for (const l of linhas) {
    const quando = l.created_at.toISOString().slice(5, 16).replace("T", " ");
    const seta = l.direction === "in" ? ">>" : "<<";
    console.log(`${quando} ${l.tenant.name} ${seta} [${l.intent_detected ?? "-"} / ${l.action_taken ?? "-"}] ${l.content ?? ""}`);
    const chave = `${l.intent_detected ?? "-"} / ${l.action_taken ?? "-"}`;
    porAcao.set(chave, (porAcao.get(chave) ?? 0) + 1);
  }

  console.log(`\n${linhas.length} registros em ${dias} dia(s), versões de prompt: ${[...new Set(linhas.map((l) => l.prompt_version))].join(", ") || "nenhuma"}`);
  for (const [chave, n] of [...porAcao].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${chave}`);
}

main().finally(() => prisma.$disconnect());
