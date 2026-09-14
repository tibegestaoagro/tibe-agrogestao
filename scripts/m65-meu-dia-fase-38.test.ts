import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import {
  createTaskAction,
  updateTaskAction,
  updateTaskStatusAction,
  postponeTaskAction,
  proximaOcorrencia,
  serializeTask,
} from "@/lib/actions/tasks";
import {
  classificar,
  lerItensDoDia,
  ordenarPorImportancia,
  type ItemDoDia,
} from "@/lib/actions/meu-dia";
import { inicioDoDiaEmSaoPaulo } from "@/lib/dia-calendario";
import { createTestAnimal, deleteTestTenants } from "./helpers/herd";
import { POST as executeAction } from "@/app/api/internal/whatsapp/execute-action/route";

exigirBancoLocal();

/**
 * Módulo 38: Meu Dia (a numeração de suíte não bate com a de módulo).
 *
 * Escrita da spec `docs/superpowers/specs/2026-09-11-modulo-38-meu-dia.md`,
 * com o caso que discrimina em cada regra, e com os três defeitos que só a
 * validação achou: a tarefa sem data que derrubaria a página, as vacinas
 * reaplicadas que apareciam como atrasadas, e a deriva do fim de mês.
 *
 * Roda: `npm run test:m65`.
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

process.env.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ?? "m65-test-internal-secret";
const SECRET = process.env.INTERNAL_API_SECRET;

/** Meio-dia UTC de N dias a partir de hoje em São Paulo: a convenção de data de calendário. */
function dia(n: number): Date {
  const hoje = inicioDoDiaEmSaoPaulo(new Date());
  return new Date(hoje.getTime() + n * 86_400_000 + 12 * 3_600_000);
}

function item(parcial: Partial<ItemDoDia> & { titulo: string }): ItemDoDia {
  return {
    chave: parcial.titulo,
    origem: "tarefa",
    data: new Date(),
    horario: null,
    valor: null,
    urgente: false,
    dias: 0,
    fazenda: null,
    href: "/meu-dia",
    ...parcial,
  };
}

async function main() {
  console.log("📅 M65: Meu Dia, Módulo 38\n");

  console.log("1. Tarefa sem data nunca é atrasada (decisão 19)");
  {
    const base = { id: "x", title: "Consertar a porteira", remind: false, status: "pending", created_by: null, created_at: new Date() };
    let estourou = false;
    let status = "";
    try {
      status = serializeTask({ ...base, due_date: null }).effective_status;
    } catch {
      estourou = true;
    }
    /* O caso que discrimina: sem a guarda, isto ESTOURA em vez de responder. */
    assert(!estourou, "serializar tarefa sem data não estoura (sem a guarda, derrubaria a página)");
    assert(status === "pending", "tarefa sem data é pendente, não atrasada");
    assert(
      serializeTask({ ...base, due_date: dia(-2) }).effective_status === "overdue",
      "a mesma tarefa com data de anteontem é atrasada",
    );
  }

  console.log("\n2. A ordem do §50");
  {
    const hoje = ordenarPorImportancia([
      item({ titulo: "comum de hoje" }),
      item({ titulo: "urgente sem hora", urgente: true }),
      item({ titulo: "pagar hoje", origem: "pagar", valor: 100 }),
      item({ titulo: "veterinario 14h", horario: "14:00" }),
    ]).map((i) => i.titulo);
    /* O caso que discrimina: o urgente PERDE para o compromisso com horário. */
    assert(hoje[0] === "veterinario 14h", "compromisso com horário vem antes de tarefa urgente");
    assert(hoje.indexOf("pagar hoje") < hoje.indexOf("urgente sem hora"), "pagamento de hoje vem antes de tarefa urgente");
    assert(hoje[hoje.length - 1] === "comum de hoje", "a tarefa comum fica por último");

    const proximos = ordenarPorImportancia([
      item({ titulo: "em 5 dias as 8h", dias: 5, horario: "08:00" }),
      item({ titulo: "amanha sem hora", dias: 1 }),
    ]);
    assert(proximos[0].titulo === "amanha sem hora", "em Próximos dias a data desempata antes do horário");
  }

  console.log("\n3. Atenção só recebe o que já passou (§31)");
  {
    const dia0 = classificar([
      item({ titulo: "vence hoje", origem: "pagar", dias: 0 }),
      item({ titulo: "venceu ontem", origem: "pagar", dias: -1 }),
      item({ titulo: "sem data", dias: null, data: null }),
      item({ titulo: "estoque baixo", origem: "estoque", dias: null, data: null }),
    ]);
    assert(dia0.hoje.some((i) => i.titulo === "vence hoje"), "a conta que vence hoje vai para Hoje");
    assert(!dia0.atencao.some((i) => i.titulo === "vence hoje"), "e NÃO para Atenção");
    assert(dia0.atencao.some((i) => i.titulo === "venceu ontem"), "a que venceu ontem vai para Atenção");
    assert(dia0.semData.some((i) => i.titulo === "sem data"), "tarefa sem data tem seção própria");
    assert(dia0.atencao.some((i) => i.titulo === "estoque baixo"), "estoque baixo vai para Atenção");
  }

  console.log("\n4. Recorrência rolante (decisão 25)");
  {
    const segunda = new Date("2026-09-07T12:00:00Z");
    const quarta = new Date("2026-09-09T15:00:00Z");
    assert(
      proximaOcorrencia(segunda, "semanal", quarta).toISOString().slice(0, 10) === "2026-09-14",
      "semanal concluída na quarta nasce na PRÓXIMA segunda",
    );
    assert(
      proximaOcorrencia(new Date("2026-08-17T12:00:00Z"), "semanal", quarta).toISOString().slice(0, 10) === "2026-09-14",
      "três segundas puladas deixam UMA pendência, na próxima segunda",
    );

    /*
     * A deriva do fim de mês, MEDIDA e aceita (ponytail em tasks.ts). Este teste
     * fixa o comportamento atual: se alguém corrigir com uma coluna nova, ele
     * reprova e obriga a atualizar o comentário que documenta o teto.
     */
    const fev = proximaOcorrencia(new Date("2026-01-31T12:00:00Z"), "mensal", new Date("2026-02-05T15:00:00Z"));
    const mar = proximaOcorrencia(fev, "mensal", new Date("2026-03-05T15:00:00Z"));
    assert(fev.toISOString().slice(0, 10) === "2026-02-28", "dia 31 em fevereiro cai no 28, e não em 3 de março");
    assert(mar.toISOString().slice(0, 10) === "2026-03-28", "a cadeia real deriva para o 28 (teto documentado)");
  }

  const tenantA = await prisma.tenant.create({
    data: { name: "M65 Tenant A", document: `M65A-${Date.now()}`, plan: "fazenda" },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "M65 Tenant B", document: `M65B-${Date.now()}`, plan: "fazenda" },
  });
  const dbA = prismaForTenant(tenantA.id);
  const dbB = prismaForTenant(tenantB.id);

  try {
    const ownerA = await dbA.user.create({
      data: {
        tenant_id: tenantA.id,
        name: "Dono A",
        email: `m65-owner-a-${Date.now()}@teste.com`,
        password_hash: "x",
        role: "OWNER",
        active: true,
      },
    });
    const fazendaA = await dbA.property.create({ data: scoped({ name: "Fazenda A" }) });
    const fazendaA2 = await dbA.property.create({ data: scoped({ name: "Fazenda A2" }) });

    console.log("\n5. Criar e editar: coerência dos campos opcionais");
    {
      const horaSemDia = await createTaskAction(dbA, { title: "Veterinário", due_time: "14:00" });
      assert(!horaSemDia.ok && horaSemDia.field === "due_time", "horário sem dia é recusado no campo due_time");

      const repeteSemDia = await createTaskAction(dbA, { title: "Bebedouros", recurrence: "semanal" });
      assert(!repeteSemDia.ok && repeteSemDia.field === "recurrence", "recorrência sem dia é recusada no campo recurrence");

      const semData = await createTaskAction(dbA, { title: "Consertar a porteira" });
      assert(semData.ok, "tarefa só com título é criada");

      const comHora = await createTaskAction(dbA, { title: "Vacinar bezerros", due_date: dia(0), due_time: "14:00" });
      assert(comHora.ok, "tarefa com dia e horário é criada");
      if (comHora.ok) {
        const tirarData = await updateTaskAction(dbA, comHora.data.id, { due_date: null });
        assert(
          !tirarData.ok && tirarData.field === "due_time",
          "tirar a data de uma tarefa que TEM horário é recusado (a coerência vale para o estado final)",
        );
      }
    }

    console.log("\n6. Concluir uma recorrente gera UMA próxima");
    {
      const criada = await createTaskAction(dbA, { title: "Conferir sal", due_date: dia(0), recurrence: "semanal" });
      if (!criada.ok) throw new Error("recorrente não criada");

      const concluida = await updateTaskStatusAction(dbA, criada.data.id, "completed");
      assert(concluida.ok && concluida.data.next_task_id !== null, "concluir devolve o id da próxima");

      const reconcluida = await updateTaskStatusAction(dbA, criada.data.id, "completed");
      assert(reconcluida.ok && reconcluida.data.next_task_id === null, "reconcluir NÃO gera uma segunda cópia");

      const quantas = await dbA.task.count({ where: { title: "Conferir sal" } });
      assert(quantas === 2, "existem exatamente duas: a concluída e a próxima");

      const outra = await createTaskAction(dbA, { title: "Limpar cocho", due_date: dia(0), recurrence: "diaria" });
      if (outra.ok) {
        const cancelada = await updateTaskStatusAction(dbA, outra.data.id, "cancelled");
        assert(cancelada.ok && cancelada.data.next_task_id === null, "cancelar uma recorrente para de repetir");
      }
    }

    console.log("\n7. Adiar só pendente, e o lembrete volta a valer");
    {
      const t = await createTaskAction(dbA, { title: "Buscar vacina", due_date: dia(0) });
      if (!t.ok) throw new Error("tarefa não criada");
      await dbA.task.update({ where: { id: t.data.id }, data: { reminded_at: new Date() } });

      const adiada = await postponeTaskAction(dbA, t.data.id, dia(1));
      const depois = await dbA.task.findFirst({ where: { id: t.data.id } });
      assert(adiada.ok, "adiar tarefa pendente funciona");
      assert(depois?.reminded_at === null, "adiar zera o reminded_at, e o lembrete do novo dia volta a valer");

      await updateTaskStatusAction(dbA, t.data.id, "completed");
      const adiarConcluida = await postponeTaskAction(dbA, t.data.id, dia(2));
      assert(!adiarConcluida.ok, "adiar tarefa concluída é recusado");
    }

    console.log("\n8. Item sem fazenda aparece com o filtro ligado");
    {
      await createTaskAction(dbA, { title: "Tarefa da A2", due_date: dia(1), property_id: fazendaA2.id });
      await createTaskAction(dbA, { title: "Tarefa sem fazenda", due_date: dia(1) });

      const soDaA = await lerItensDoDia(dbA, { property_id: fazendaA.id });
      const titulos = soDaA.map((i) => i.titulo);
      assert(titulos.includes("Tarefa sem fazenda"), "a tarefa sem fazenda aparece filtrando pela Fazenda A");
      assert(!titulos.includes("Tarefa da A2"), "a tarefa da outra fazenda não aparece");
    }

    console.log("\n9. Conta parcialmente paga aparece pelo SALDO");
    {
      const conta = await dbA.financialEntry.create({
        data: scoped({ entry_type: "expense", category: "Ração", amount: 1000, due_date: dia(0), status: "pending" }),
      });
      await dbA.financialPayment.create({
        data: scoped({ entry_id: conta.id, amount: 400, paid_at: new Date() }),
      });
      const itens = await lerItensDoDia(dbA);
      const daConta = itens.find((i) => i.chave === `pagar:${conta.id}`);
      assert(daConta?.valor === 600, "a conta de 1.000 com 400 pagos aparece como 600");
    }

    console.log("\n10. Vacina reaplicada não aparece de novo (achado da T03)");
    {
      const animal = await createTestAnimal(dbA, tenantA.id, { ear_tag: "M65-01", property_id: fazendaA.id });
      const vacina = await dbA.vaccine.create({ data: scoped({ name: "Aftosa M65" }) });
      /* A primeira aplicação diz "próxima dose em 3 dias"; a reaplicação de
         hoje empurra a próxima para daqui a 180. A de 3 dias não pode aparecer. */
      await dbA.animalVaccination.create({
        data: scoped({ batch_id: animal.id, vaccine_id: vacina.id, applied_at: dia(-30), next_due_at: dia(3) }),
      });
      await dbA.animalVaccination.create({
        data: scoped({ batch_id: animal.id, vaccine_id: vacina.id, applied_at: dia(0), next_due_at: dia(180) }),
      });
      const itens = await lerItensDoDia(dbA);
      const vacinas = itens.filter((i) => i.origem === "vacina" && i.titulo.includes("M65-01"));
      assert(vacinas.length === 0, "a próxima dose de uma aplicação já substituída não aparece");
    }

    console.log("\n11. Isolamento: o dia de um tenant não vê o do outro");
    {
      const itensB = await lerItensDoDia(dbB);
      assert(!itensB.some((i) => i.titulo.includes("Consertar a porteira")), "o tenant B não vê as tarefas do A");
    }

    console.log("\n12. WhatsApp: consultar o dia e criar sem data");
    {
      const req = new Request("http://localhost/api/internal/whatsapp/execute-action", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": SECRET },
        body: JSON.stringify({ tenant_id: tenantA.id, user_id: ownerA.id, intent: "consultar_meu_dia", parameters: {} }),
      });
      const res = await executeAction(req);
      const body = await res.json();
      assert(res.status === 200, "consultar_meu_dia responde 200");
      assert(
        typeof body?.data?.reply_text === "string" && body.data.reply_text.includes("Hoje você tem"),
        "a resposta traz o resumo de hoje",
      );

      const criar = new Request("http://localhost/api/internal/whatsapp/execute-action", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-secret": SECRET },
        body: JSON.stringify({
          tenant_id: tenantA.id,
          user_id: ownerA.id,
          intent: "criar_tarefa",
          parameters: { title: "Limpar o bebedouro" },
          confirmed: true,
        }),
      });
      const criada = await executeAction(criar);
      const corpo = await criada.json();
      const existe = await dbA.task.findFirst({ where: { title: "Limpar o bebedouro" } });
      assert(
        typeof corpo?.data?.reply_text === "string" && !corpo.data.reply_text.includes("preciso do que é e de quando"),
        "criar tarefa sem data pelo WhatsApp NÃO pergunta a data",
      );
      assert(existe !== null && existe.due_date === null, "e a tarefa nasce sem data");
    }
  } finally {
    const ids = [tenantA.id, tenantB.id];
    await prisma.financialPayment.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.financialEntry.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.task.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.animalVaccination.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.vaccine.deleteMany({ where: { tenant_id: { in: ids } } });
    await prisma.user.deleteMany({ where: { tenant_id: { in: ids } } });
    await deleteTestTenants(ids);
  }

  console.log("");
  if (failures === 0) console.log("✅ M65: 0 falhas.");
  else console.error(`❌ M65: ${failures} falha(s).`);
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
