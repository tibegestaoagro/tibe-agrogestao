import type { ServiceJobStatus, ServicePricing } from "@/generated/prisma/client";
import type { TenantPrismaClient } from "@/lib/prisma";
import { totalDoServico, quantidadeTrabalhada } from "@/lib/mao-de-obra/total-do-servico";
import { decToNum } from "@/lib/serialize";

/**
 * Duas leituras sobre `ServiceJob`: o histórico da máquina (§32) e a agenda
 * (§39) do documento de Máquinas.
 *
 * Ficam fora de `service-jobs.ts` porque nenhuma das duas escreve nada, e
 * porque quem as consome é outra tela: a ficha da máquina e o Meu Dia, não o
 * cadastro de serviço.
 *
 * NENHUM NÚMERO É GRAVADO (invariante 2): o faturado e a quantidade saem dos
 * mesmos `totalDoServico` e `quantidadeTrabalhada` que a listagem usa. Guardar
 * um total na `Machine` faria a ficha divergir do serviço em silêncio.
 */

export type MachineServiceLine = {
  id: string;
  occurred_at: string;
  description: string;
  quantidade: number;
  pricing: ServicePricing;
  contact_name: string | null;
  total: number;
};

export type MachineServiceSummary = {
  machine_id: string;
  servicos: number;
  /**
   * ⚠️ Um MAPA por unidade, nunca um número só.
   *
   * Um trator que fez 12 horas de gradagem e 25 hectares de roçada não
   * trabalhou 37 de nada. Somar tudo inventaria uma unidade que não existe, e
   * a ficha da máquina exibiria "37" para um produtor que lê aquilo como hora.
   * O `fechado` fica DE FORA do mapa: empreito não tem unidade, e a quantidade
   * dele não significa nada comparável.
   */
  quantidade_por_unidade: Partial<Record<ServicePricing, number>>;
  faturado: number;
  linhas: MachineServiceLine[];
};

export async function getMachineServices(
  db: TenantPrismaClient,
  machineId: string,
): Promise<MachineServiceSummary> {
  /**
   * Sem filtro de `direction`: só o `prestado` aceita `machine_id` (a validação
   * do §17 recusa a máquina no contratado), então filtrar por máquina já
   * seleciona o prestado. Um filtro a mais aqui sugeriria que existe serviço
   * contratado com máquina própria, que é justamente o que a decisão 10 nega.
   */
  const jobs = await db.serviceJob.findMany({
    where: { machine_id: machineId, canceled_at: null },
    include: { logs: true, contact: { select: { name: true } } },
    orderBy: { occurred_at: "desc" },
  });

  const quantidade_por_unidade: Partial<Record<ServicePricing, number>> = {};
  let faturado = 0;
  const linhas: MachineServiceLine[] = [];

  for (const job of jobs) {
    const logs = job.logs.map((l) => ({
      quantity: decToNum(l.quantity) ?? 0,
      canceled_at: l.canceled_at,
    }));
    const quantidade = quantidadeTrabalhada(logs);
    const total = totalDoServico(
      {
        pricing: job.pricing,
        unit_price: decToNum(job.unit_price),
        agreed_amount: decToNum(job.agreed_amount),
        worker_count: job.worker_count,
      },
      logs,
    );

    faturado += total;
    if (job.pricing !== "fechado" && quantidade > 0) {
      quantidade_por_unidade[job.pricing] =
        (quantidade_por_unidade[job.pricing] ?? 0) + quantidade;
    }

    linhas.push({
      id: job.id,
      occurred_at: job.occurred_at.toISOString(),
      description: job.description,
      quantidade,
      pricing: job.pricing,
      contact_name: job.contact?.name ?? null,
      total,
    });
  }

  return {
    machine_id: machineId,
    servicos: jobs.length,
    quantidade_por_unidade,
    faturado: Math.round(faturado * 100) / 100,
    linhas,
  };
}

export type AgendaLine = {
  id: string;
  occurred_at: string;
  description: string;
  contact_name: string | null;
  machine_name: string | null;
  status: ServiceJobStatus;
};

/**
 * A agenda do §39: o que está marcado para hoje e o que vem depois.
 *
 * O corte é por DATA, e o status só separa o que ainda vai acontecer do que já
 * aconteceu. Serviço de ontem que ninguém marcou como concluído NÃO volta para
 * a agenda: ele ficou para trás, e reaparecer em "hoje" faria a lista crescer
 * sozinha até ninguém mais olhar para ela.
 */
export async function getServiceAgenda(
  db: TenantPrismaClient,
): Promise<{ hoje: AgendaLine[]; proximos: AgendaLine[] }> {
  const inicioDeHoje = new Date();
  inicioDeHoje.setUTCHours(0, 0, 0, 0);
  const amanha = new Date(inicioDeHoje.getTime() + 24 * 60 * 60 * 1000);

  const jobs = await db.serviceJob.findMany({
    where: {
      canceled_at: null,
      status: { in: ["agendado", "em_andamento"] },
      occurred_at: { gte: inicioDeHoje },
    },
    include: { contact: { select: { name: true } }, machine: { select: { name: true } } },
    orderBy: { occurred_at: "asc" },
  });

  const linha = (j: (typeof jobs)[number]): AgendaLine => ({
    id: j.id,
    occurred_at: j.occurred_at.toISOString(),
    description: j.description,
    contact_name: j.contact?.name ?? null,
    machine_name: j.machine?.name ?? null,
    status: j.status,
  });

  return {
    hoje: jobs.filter((j) => j.occurred_at < amanha).map(linha),
    proximos: jobs.filter((j) => j.occurred_at >= amanha).map(linha),
  };
}
