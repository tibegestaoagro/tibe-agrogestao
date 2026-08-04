import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  getCancellationWindow,
  getBillingAccess,
  subscriptionStatusData,
  ARCHIVE_WINDOW_DAYS,
} from "@/lib/billing-access";
import {
  sweepCanceledSubscriptions,
  listTenantsPendingDecision,
} from "@/lib/actions/cancellation-sweep";

/**
 * Cancelamento com janela de arquivamento (spec 2026-08-04).
 *
 * Regra: acesso total até o fim do período pago, depois leitura por
 * ARCHIVE_WINDOW_DAYS dias, depois bloqueio. O fim da janela NÃO apaga nada:
 * o tenant fica pendente de decisão humana.
 *
 * A maior parte é testada como função PURA (`getCancellationWindow`), sem
 * banco: a régua é aritmética de datas, e testá-la contra o relógio real
 * exigiria esperar 60 dias. Só o varredor e o `getBillingAccess` tocam o
 * banco, porque leem estado.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) {
    console.log(`  ✅ ${nome}`);
  } else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

const DIA = 86_400_000;
const dias = (n: number) => new Date(Date.now() + n * DIA);

async function testaReguaDeDatas() {
  console.log("\n1. Régua de datas (função pura)");

  // Cancelou hoje, com 10 dias de período pago pela frente.
  const emDia = getCancellationWindow({
    next_due_date: dias(10),
    canceled_at: dias(0),
    created_at: dias(-100),
  });
  check("período pago ainda correndo -> paid_period", emDia.phase === "paid_period", emDia.phase);
  check(
    "janela começa no fim do período pago, não no cancelamento",
    Math.abs(emDia.archive_starts_at.getTime() - dias(10).getTime()) < 1000,
  );
  check(
    `janela dura ${ARCHIVE_WINDOW_DAYS} dias`,
    Math.round((emDia.archive_ends_at.getTime() - emDia.archive_starts_at.getTime()) / DIA) ===
      ARCHIVE_WINDOW_DAYS,
  );

  // Período pago acabou há 5 dias: está dentro da janela de leitura.
  const naJanela = getCancellationWindow({
    next_due_date: dias(-5),
    canceled_at: dias(-40),
    created_at: dias(-200),
  });
  check("período pago vencido há 5 dias -> archived", naJanela.phase === "archived", naJanela.phase);

  // Período pago acabou há mais que a janela inteira.
  const expirada = getCancellationWindow({
    next_due_date: dias(-(ARCHIVE_WINDOW_DAYS + 1)),
    canceled_at: dias(-(ARCHIVE_WINDOW_DAYS + 10)),
    created_at: dias(-300),
  });
  check("passou da janela -> expired", expirada.phase === "expired", expirada.phase);

  // Cancelou JÁ VENCIDO: não há período pago a honrar, a janela começa no
  // cancelamento. Sem o `max`, a janela nasceria vencida e bloquearia na hora.
  const jaVencido = getCancellationWindow({
    next_due_date: dias(-90),
    canceled_at: dias(-1),
    created_at: dias(-300),
  });
  check(
    "cancelou já vencido -> janela começa no cancelamento, não no vencimento",
    Math.abs(jaVencido.archive_starts_at.getTime() - dias(-1).getTime()) < 1000,
    jaVencido.archive_starts_at.toISOString(),
  );
  check("cancelou já vencido -> ainda tem leitura", jaVencido.phase === "archived", jaVencido.phase);

  // Sem canceled_at (assinatura cancelada antes desta spec): cai no vencimento.
  const semData = getCancellationWindow({
    next_due_date: dias(-2),
    canceled_at: null,
    created_at: dias(-300),
  });
  check("sem canceled_at cai no vencimento", semData.phase === "archived", semData.phase);

  // Sem nenhuma das duas: cai na criação.
  const soCriacao = getCancellationWindow({
    next_due_date: null,
    canceled_at: null,
    created_at: dias(-1),
  });
  check("sem vencimento e sem cancelamento cai na criação", soCriacao.phase === "archived");
}

function testaHelperDeStatus() {
  console.log("\n2. Helper que grava a data");
  const cancelado = subscriptionStatusData("canceled");
  check("cancelar preenche canceled_at", cancelado.canceled_at instanceof Date);
  const reativado = subscriptionStatusData("active");
  check("reativar LIMPA canceled_at", reativado.canceled_at === null);
  check("status é repassado", reativado.status === "active");
}

async function testaAcessoEVarredura() {
  console.log("\n3. Acesso real e varredura (banco)");

  const marca = `cancel-test-${Date.now()}`;
  const tenant = await prisma.tenant.create({
    data: { name: marca, document: marca.slice(0, 18), plan: "fazenda", status: "active" },
  });

  try {
    // Fase 1: cancelado, mas ainda dentro do período pago.
    await prisma.subscription.create({
      data: {
        tenant_id: tenant.id,
        plan: "fazenda",
        status: "canceled",
        next_due_date: dias(10),
        canceled_at: dias(0),
      },
    });
    check("dentro do período pago -> full", (await getBillingAccess(tenant.id)) === "full");

    // Fase 2: período pago acabou, dentro da janela de leitura.
    await prisma.subscription.update({
      where: { tenant_id: tenant.id },
      data: { next_due_date: dias(-3), canceled_at: dias(-30) },
    });
    check(
      "dentro da janela -> read_only (dá para exportar o próprio dado)",
      (await getBillingAccess(tenant.id)) === "read_only",
    );

    let sweep = await sweepCanceledSubscriptions();
    check("varredura marcou o tenant como arquivado", sweep.archived >= 1);
    let atual = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    check("archived_at foi preenchido", atual?.archived_at != null);

    // Fase 3: janela vencida.
    await prisma.subscription.update({
      where: { tenant_id: tenant.id },
      data: {
        next_due_date: dias(-(ARCHIVE_WINDOW_DAYS + 5)),
        canceled_at: dias(-(ARCHIVE_WINDOW_DAYS + 20)),
      },
    });
    check("passada a janela -> blocked", (await getBillingAccess(tenant.id)) === "blocked");

    const pendentes = await listTenantsPendingDecision();
    check(
      "aparece na lista de pendentes de decisão",
      pendentes.some((p) => p.tenant_id === tenant.id),
    );
    check(
      "nada foi apagado: o tenant continua no banco",
      (await prisma.tenant.findUnique({ where: { id: tenant.id } })) != null,
    );

    // Reativação: volta ao normal e o arquivamento é desfeito.
    await prisma.subscription.update({
      where: { tenant_id: tenant.id },
      data: subscriptionStatusData("active"),
    });
    check("reativado -> full", (await getBillingAccess(tenant.id)) === "full");
    sweep = await sweepCanceledSubscriptions();
    atual = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    check("varredura desfez o arquivamento", atual?.archived_at == null);
  } finally {
    await prisma.subscription.deleteMany({ where: { tenant_id: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

async function main() {
  console.log("🧾 Cancelamento com janela de arquivamento (spec 2026-08-04)");
  await testaReguaDeDatas();
  testaHelperDeStatus();
  await testaAcessoEVarredura();
  console.log(
    falhas === 0
      ? `\n✅ Cancelamento com janela: 0 falhas.`
      : `\n❌ Cancelamento com janela: ${falhas} falha(s).`,
  );
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main();
