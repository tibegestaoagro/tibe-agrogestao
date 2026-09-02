import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 34, fase 1: o serviço PRESTADO com máquina própria.
 *
 * Prova, por seção do documento de Máquinas:
 *   1. §13 e §28: o serviço prestado gera RECEITA, não despesa.
 *   2. §17 e a decisão 10: `machine_id` aceito no prestado, RECUSADO no
 *      contratado.
 *   3. §18: o status vem da DATA, e não é mais sempre `concluido`.
 *   4. §17: as recusas do prestado, e o que continua opcional no contratado.
 *   5. §26 e §27: o recebimento parcial, com o SINAL certo nos dois lançamentos.
 *   6. §32: o histórico da máquina, somado POR UNIDADE.
 *   7. §39: a agenda de hoje e dos próximos.
 *
 * ⚠️ A `m58` (145 conferências sobre o CONTRATADO) é a prova de que esta fase
 * não quebrou a anterior: ela cobre o mesmo arquivo, e tem que continuar verde.
 *
 * Roda: `npm run test:m59`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🚜 M59: serviço prestado (Módulo 34, fase 1)\n");

async function main() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const {
    createServiceJob,
    getServiceJobDetail,
    recordServiceJobPayment,
    cancelServiceJob,
    SERVICOS_MECANIZADOS,
  } = await import(
    "@/lib/actions/service-jobs"
  );

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M59 ${stamp}`, document: `M59${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M59" }) });
    // A máquina é obrigatória no prestado, então ela vem antes de tudo.
    const trator = await db.machine.create({
      data: scoped({ property_id: fazenda.id, name: "Trator Massey", type: "Trator" }),
    });

    // ── 1. §13 e §28: o prestado gera RECEITA ─────────────────────────────

    console.log("1. §13 e §28: o serviço prestado gera RECEITA");
    check(
      "os 21 serviços mecanizados do §5 estão sugeridos",
      SERVICOS_MECANIZADOS.length === 21 && SERVICOS_MECANIZADOS.includes("Terraplanagem"),
      String(SERVICOS_MECANIZADOS.length),
    );

    const rocada = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 180,
      quantity: 25,
      machine_id: trator.id,
      contact_name: "João Vizinho",
      client_location: "Fazenda do João, Unaí",
    });
    check("cadastro devolve ok", rocada.ok, rocada.ok ? "" : rocada.message);
    if (!rocada.ok) throw new Error("createServiceJob falhou");

    check("total 4.500", rocada.data.total === 4500, String(rocada.data.total));
    check("a receber 4.500", rocada.data.a_receber === 4500, String(rocada.data.a_receber));
    check("recebido 0", rocada.data.recebido === 0);

    const lanc = await db.financialEntry.findFirst({
      where: { related_module: "servico", related_id: rocada.data.id },
    });
    check(
      "o lançamento é RECEITA, não despesa",
      lanc?.entry_type === "income",
      String(lanc?.entry_type),
    );
    check("pendente (conta a receber)", lanc?.status === "pending");
    check(
      "com a categoria do prestado, não a do terceirizado",
      lanc?.category === "Serviço prestado",
      String(lanc?.category),
    );
    check(
      "e o local do cliente ficou gravado",
      rocada.data.client_location === "Fazenda do João, Unaí",
      String(rocada.data.client_location),
    );

    // ── 2. `machine_id`: aceito no prestado, RECUSADO no contratado ───────

    console.log("\n2. `machine_id`: aceito no prestado, RECUSADO no contratado");
    check("no prestado, gravou a máquina", rocada.data.machine_id === trator.id);
    check("e a listagem traz o nome dela", rocada.data.machine_name === "Trator Massey");

    const contratadoComMaquina = await createServiceJob(db, {
      direction: "contratado",
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Manutenção do trator",
      pricing: "fechado",
      agreed_amount: 800,
      machine_id: trator.id,
    });
    check("no contratado, recusado", !contratadoComMaquina.ok);
    check(
      "no campo machine_id, apontando para Máquinas",
      !contratadoComMaquina.ok && contratadoComMaquina.field === "machine_id",
      !contratadoComMaquina.ok ? String(contratadoComMaquina.field) : "aceitou",
    );

    // ── 3. §18: o status vem da DATA ─────────────────────────────────────

    console.log("\n3. §18: o status vem da DATA, e não é mais sempre `concluido`");
    check("serviço com data passada nasce concluído", rocada.data.status === "concluido");

    const amanha = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const futuro = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: amanha,
      description: "Gradagem",
      pricing: "hectare",
      unit_price: 200,
      quantity: 20,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    check(
      "serviço marcado para o futuro nasce AGENDADO",
      futuro.ok && futuro.data.status === "agendado",
      futuro.ok ? futuro.data.status : "recusado",
    );
    check(
      "e o CONTRATADO segue a mesma regra",
      (
        await createServiceJob(db, {
          direction: "contratado",
          property_id: fazenda.id,
          occurred_at: amanha,
          description: "Roçada contratada",
          pricing: "fechado",
          agreed_amount: 500,
        })
      ).ok,
    );

    // ── 4. §17: as recusas do prestado ───────────────────────────────────

    console.log("\n4. §17: as recusas do prestado, e o que segue opcional no contratado");
    const antes = await db.serviceJob.count();

    const semMaquina = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 180,
      quantity: 10,
      contact_name: "João Vizinho",
    });
    check(
      "prestado SEM máquina é recusado no campo machine_id",
      !semMaquina.ok && semMaquina.field === "machine_id",
      !semMaquina.ok ? String(semMaquina.field) : "aceitou",
    );

    const semCliente = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 180,
      quantity: 10,
      machine_id: trator.id,
    });
    check(
      "prestado SEM cliente é recusado no campo contact_name (§17)",
      !semCliente.ok && semCliente.field === "contact_name",
      !semCliente.ok ? String(semCliente.field) : "aceitou",
    );

    /**
     * ⚠️ A MESMA coluna, duas exigências. No contratado o cliente continua
     * OPCIONAL, porque o §14 da Mão de Obra descreve "vieram 3 homens
     * trabalhar na cerca" sem nome nenhum. Exigir nos dois quebraria o caso
     * mais comum da fase anterior.
     */
    const contratadoSemCliente = await createServiceJob(db, {
      direction: "contratado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Reforma de cerca",
      pricing: "dia",
      unit_price: 150,
      quantity: 4,
      worker_count: 3,
    });
    check(
      "mas o CONTRATADO sem cliente continua aceito (§14)",
      contratadoSemCliente.ok,
      contratadoSemCliente.ok ? "" : contratadoSemCliente.message,
    );

    const maquinaFantasma = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 180,
      quantity: 10,
      machine_id: "clnaoexiste000000000000",
      contact_name: "João Vizinho",
    });
    check("máquina inexistente devolve 404", !maquinaFantasma.ok && maquinaFantasma.status === 404);
    check(
      "no campo machine_id",
      !maquinaFantasma.ok && maquinaFantasma.field === "machine_id",
      !maquinaFantasma.ok ? String(maquinaFantasma.field) : "aceitou",
    );

    const operadorFantasma = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 180,
      quantity: 10,
      machine_id: trator.id,
      contact_name: "João Vizinho",
      operator_worker_id: "clnaoexiste000000000000",
    });
    check(
      "operador inexistente devolve 404 no campo operator_worker_id",
      !operadorFantasma.ok && operadorFantasma.field === "operator_worker_id",
      !operadorFantasma.ok ? String(operadorFantasma.field) : "aceitou",
    );

    check(
      "e as recusas só deixaram passar o contratado sem cliente",
      (await db.serviceJob.count()) === antes + 1,
      `${antes} -> ${await db.serviceJob.count()}`,
    );

    // O operador de verdade, com vínculo.
    const { createWorker } = await import("@/lib/actions/workers");
    const tratorista = await createWorker(db, {
      name: "Zé Tratorista",
      role: "Tratorista",
      type: "eventual",
    });
    if (!tratorista.ok) throw new Error("createWorker falhou");
    const comOperador = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Aração",
      pricing: "hora",
      unit_price: 250,
      quantity: 8,
      machine_id: trator.id,
      contact_name: "João Vizinho",
      operator_worker_id: tratorista.data.id,
      implement: "Arado",
    });
    check("com operador cadastrado, aceito", comOperador.ok, comOperador.ok ? "" : comOperador.message);
    check(
      "e o nome dele volta na leitura (§8: reutilizar o cadastro)",
      comOperador.ok && comOperador.data.operator_name === "Zé Tratorista",
      comOperador.ok ? String(comOperador.data.operator_name) : "recusado",
    );
    check("e o implemento também", comOperador.ok && comOperador.data.implement === "Arado");

    const detalhe = await getServiceJobDetail(db, rocada.data.id);
    check("o detalhe devolve ok", detalhe.ok);
    check(
      "com a receita no lançamento",
      detalhe.ok && detalhe.data.entries.every((e) => e.amount === 4500),
    );

    // ── 5. §26 e §27: o recebimento parcial ──────────────────────────────

    console.log("\n5. §27: o exemplo literal (8.000, recebe 3.000, ficam 5.000)");
    const oitomil = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Ensilagem",
      pricing: "fechado",
      agreed_amount: 8000,
      machine_id: trator.id,
      contact_name: "Cliente do §27",
    });
    if (!oitomil.ok) throw new Error("createServiceJob falhou");

    const parcial = await recordServiceJobPayment(db, {
      service_job_id: oitomil.data.id,
      amount: 3000,
    });
    check("recebimento parcial aceito", parcial.ok, parcial.ok ? "" : parcial.message);
    check("recebido 3.000", parcial.ok && parcial.data.pago === 3000, parcial.ok ? String(parcial.data.pago) : "");
    check(
      "a receber 5.000",
      parcial.ok && parcial.data.restante === 5000,
      parcial.ok ? String(parcial.data.restante) : "",
    );

    /**
     * ⚠️ O CASO QUE DISCRIMINA, e que a versão fraca perderia.
     *
     * Se `recordServiceJobPayment` criar `expense`, o serviço mostra "recebido
     * 3.000" na tela E o DRE registra uma DESPESA de R$ 3.000. O saldo bateria;
     * só o sinal do dinheiro estaria trocado, que é onde ninguém olha até o fim
     * do ano. Por isso o teste cobra o `entry_type` dos DOIS lançamentos, e não
     * só a soma.
     */
    const entries = await db.financialEntry.findMany({
      where: { related_module: "servico", related_id: oitomil.data.id },
    });
    check("são dois lançamentos", entries.length === 2, String(entries.length));
    check(
      "e os DOIS são RECEITA, incluindo o do recebimento",
      entries.every((e) => e.entry_type === "income"),
      entries.map((e) => e.entry_type).join(","),
    );
    check(
      "com a categoria do prestado nos dois",
      entries.every((e) => e.category === "Serviço prestado"),
      entries.map((e) => e.category).join(","),
    );

    const viewDoOitomil = await getServiceJobDetail(db, oitomil.data.id);
    check(
      "e a leitura usa o vocabulário do prestado",
      viewDoOitomil.ok &&
        viewDoOitomil.data.recebido === 3000 &&
        viewDoOitomil.data.a_receber === 5000,
      viewDoOitomil.ok
        ? `${viewDoOitomil.data.recebido} / ${viewDoOitomil.data.a_receber}`
        : "recusado",
    );

    console.log("   e receber MAIS que o restante continua recusado");
    const demais = await recordServiceJobPayment(db, {
      service_job_id: oitomil.data.id,
      amount: 9000,
    });
    check("recusado", !demais.ok);
    check(
      "no campo amount, dizendo quanto falta",
      !demais.ok && demais.field === "amount" && demais.message.includes("5.000"),
      !demais.ok ? demais.message : "aceitou",
    );

    console.log("   e quitar não deixa conta a receber de R$ 0,00");
    const quitou = await recordServiceJobPayment(db, {
      service_job_id: oitomil.data.id,
      amount: 5000,
    });
    check("quitação aceita", quitou.ok);
    check("a receber zerou", quitou.ok && quitou.data.restante === 0);
    check(
      "e nenhum lançamento pendente sobrou",
      (await db.financialEntry.count({
        where: { related_module: "servico", related_id: oitomil.data.id, status: "pending" },
      })) === 0,
    );
    /**
     * Dois, não três: a conta a receber que zerou é APAGADA, e o que sobra são
     * os dois recebimentos (3.000 e 5.000). Conta a receber de R$ 0,00 seria
     * ruído no Financeiro do produtor.
     */
    check(
      "e os dois recebimentos ficam como RECEITA paga",
      (await db.financialEntry.count({
        where: {
          related_module: "servico",
          related_id: oitomil.data.id,
          entry_type: "income",
          status: "paid",
        },
      })) === 2,
    );
    check(
      "somando os 8.000 do §27",
      (
        await db.financialEntry.findMany({
          where: { related_module: "servico", related_id: oitomil.data.id },
          select: { amount: true },
        })
      ).reduce((s, e) => s + Number(e.amount), 0) === 8000,
    );
    // ── 6. §32: o histórico da máquina ───────────────────────────────────

    console.log("\n6. §32: o histórico da máquina, somado POR UNIDADE");
    const { getMachineServices, getServiceAgenda } = await import(
      "@/lib/actions/machine-services"
    );

    // Máquina nova, para os números do §32 não se misturarem com os serviços
    // dos blocos anteriores.
    const massey = await db.machine.create({
      data: scoped({ property_id: fazenda.id, name: "Trator Massey §32", type: "Trator" }),
    });
    const colheitadeira = await db.machine.create({
      data: scoped({ property_id: fazenda.id, name: "Colheitadeira", type: "Colheitadeira" }),
    });

    const gradagem = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-08-20T12:00:00.000Z"),
      description: "Gradagem",
      pricing: "hora",
      unit_price: 150,
      quantity: 12,
      machine_id: massey.id,
      contact_name: "Cliente João",
    });
    const rocadaDoMassey = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-08-22T12:00:00.000Z"),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 180,
      quantity: 25,
      machine_id: massey.id,
      contact_name: "Cliente Maria",
    });
    await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-08-23T12:00:00.000Z"),
      description: "Colheita",
      pricing: "hectare",
      unit_price: 300,
      quantity: 40,
      machine_id: colheitadeira.id,
      contact_name: "Cliente Pedro",
    });
    check("os três serviços do bloco 6 entraram", gradagem.ok && rocadaDoMassey.ok);

    const hist = await getMachineServices(db, massey.id);
    check("dois serviços na ficha do Massey", hist.servicos === 2, String(hist.servicos));
    check(
      "e o da colheitadeira NÃO entrou",
      !hist.linhas.some((l) => l.description === "Colheita"),
    );
    check("faturado 6.300 (1.800 + 4.500)", hist.faturado === 6300, String(hist.faturado));

    /**
     * ⚠️ O CASO QUE DISCRIMINA. Um trator que fez 12 horas de gradagem e 25
     * hectares de roçada NÃO trabalhou 37 de nada. Se a soma virar um número
     * só, a ficha da máquina passa a exibir uma unidade que não existe, e o
     * produtor lê "37" achando que é hora. Por isso o mapa, e por isso o teste
     * cobra as DUAS chaves separadas.
     */
    check(
      "12 horas, no mapa por unidade",
      hist.quantidade_por_unidade.hora === 12,
      JSON.stringify(hist.quantidade_por_unidade),
    );
    check(
      "e 25 hectares, sem virar 37",
      hist.quantidade_por_unidade.hectare === 25,
      JSON.stringify(hist.quantidade_por_unidade),
    );
    check(
      "duas unidades, não uma soma",
      Object.keys(hist.quantidade_por_unidade).length === 2,
      JSON.stringify(hist.quantidade_por_unidade),
    );
    check(
      "e a linha traz o cliente, como no §32",
      hist.linhas.some((l) => l.contact_name === "Cliente João" && l.quantidade === 12),
    );

    // ── 7. §39: a agenda ─────────────────────────────────────────────────

    console.log("\n7. §39: a agenda de hoje e dos próximos");
    const meioDiaDeHoje = new Date();
    meioDiaDeHoje.setUTCHours(12, 0, 0, 0);
    const daquiATres = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const deHoje = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: meioDiaDeHoje,
      description: "Aração de hoje",
      pricing: "hora",
      unit_price: 150,
      quantity: 4,
      machine_id: massey.id,
      contact_name: "Cliente de hoje",
    });
    const deOntem = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: ontem,
      description: "Aração de ontem",
      pricing: "hora",
      unit_price: 150,
      quantity: 4,
      machine_id: massey.id,
      contact_name: "Cliente de ontem",
    });
    const daqui3 = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: daquiATres,
      description: "Subsolagem",
      pricing: "hora",
      unit_price: 150,
      quantity: 4,
      machine_id: massey.id,
      contact_name: "Cliente de depois",
    });
    const cancelado = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      description: "Serviço que caiu",
      pricing: "hora",
      unit_price: 150,
      quantity: 4,
      machine_id: massey.id,
      contact_name: "Cliente que desistiu",
    });
    if (!deHoje.ok || !deOntem.ok || !daqui3.ok || !cancelado.ok) {
      throw new Error("createServiceJob do bloco 7 falhou");
    }
    await cancelServiceJob(db, { service_job_id: cancelado.data.id });

    /**
     * O de hoje e o de ontem nascem `concluido` (a data já passou, §18), e a
     * agenda é sobre o que AINDA vai acontecer. Marcá-los como `agendado` é o
     * caso realista ("o produtor agendou para hoje de manhã e ainda não marcou
     * como feito") e, principalmente, é o que faz o teste discriminar pela
     * DATA: com os dois no mesmo status, o de ontem só pode ficar de fora se o
     * corte por dia funcionar.
     */
    await db.serviceJob.updateMany({
      where: { id: { in: [deHoje.data.id, deOntem.data.id] } },
      data: { status: "agendado" },
    });

    const agenda = await getServiceAgenda(db);
    const idsHoje = agenda.hoje.map((l) => l.id);
    const idsProximos = agenda.proximos.map((l) => l.id);
    check("o de hoje aparece em `hoje`", idsHoje.includes(deHoje.data.id));
    check("o de daqui a três dias aparece em `proximos`", idsProximos.includes(daqui3.data.id));
    check(
      "o de ONTEM não aparece em nenhum dos dois",
      !idsHoje.includes(deOntem.data.id) && !idsProximos.includes(deOntem.data.id),
    );
    check(
      "o cancelado some da agenda",
      !idsHoje.includes(cancelado.data.id) && !idsProximos.includes(cancelado.data.id),
    );
    check(
      "e a linha da agenda diz a máquina e o cliente",
      agenda.hoje.some(
        (l) => l.id === deHoje.data.id && l.machine_name === "Trator Massey §32" && l.contact_name === "Cliente de hoje",
      ),
    );
    check(
      "um serviço já concluído não entra na agenda",
      !idsHoje.includes(rocadaDoMassey.ok ? rocadaDoMassey.data.id : ""),
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M59 verde" : `\n❌ M59: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
