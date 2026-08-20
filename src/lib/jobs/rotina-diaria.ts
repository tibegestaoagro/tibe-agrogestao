import { generateAllAlerts } from "@/lib/actions/alerts";
import { deliverAllPendingAlerts } from "@/lib/actions/alert-delivery";
import { purgeExpiredSignups } from "@/lib/actions/signup-flow";
import { sweepCanceledSubscriptions } from "@/lib/actions/cancellation-sweep";
import { log } from "@/lib/log";

/**
 * O trabalho diário do sistema, num lugar só.
 *
 * Extraído da rota de cron em 2026-08-20 para que a MESMA função possa ser
 * executada de dois jeitos: dentro da requisição (como sempre foi) ou por um
 * worker que consome a fila. Sem essa extração, worker e rota teriam duas
 * cópias da rotina, e elas divergiriam.
 *
 * Por que isso importa: `generateAllAlerts` percorre TODOS os tenants ativos.
 * Rodando dentro da requisição da Vercel Cron, existe um teto duro no timeout
 * da função, e ele chega junto com o crescimento da base. O worker remove esse
 * teto; enquanto ele não existir, o caminho antigo continua valendo.
 */
export type ResultadoDaRotina = {
  expired_signups_deleted: number;
  tenants_archived: number;
  tenants_unarchived: number;
  tenants_pending_decision: number;
  [chave: string]: unknown;
};

export async function executarRotinaDiaria(): Promise<ResultadoDaRotina> {
  const inicio = Date.now();

  const generated = await generateAllAlerts();
  const delivered = await deliverAllPendingAlerts();

  // Varre cadastros públicos abandonados (Módulo 19): dado pessoal de quem
  // nunca virou cliente não fica guardado. Falha aqui não derruba a rotina.
  const purged = await purgeExpiredSignups().catch((e) => {
    log.warn("rotina diaria: purgeExpiredSignups falhou", { code: "PURGE_FALHOU" });
    void e;
    return { deleted: 0 };
  });

  // Reflete a janela de arquivamento de quem cancelou (spec 2026-08-04).
  // É bookkeeping para o painel da plataforma: o acesso em si é decidido por
  // `getBillingAccess()` a cada request, então falhar aqui não libera nem
  // bloqueia ninguém indevidamente.
  const swept = await sweepCanceledSubscriptions().catch((e) => {
    log.warn("rotina diaria: sweepCanceledSubscriptions falhou", { code: "SWEEP_FALHOU" });
    void e;
    return { archived: 0, unarchived: 0, pending_decision: 0 };
  });

  const resultado: ResultadoDaRotina = {
    ...generated,
    ...delivered,
    expired_signups_deleted: purged.deleted,
    tenants_archived: swept.archived,
    tenants_unarchived: swept.unarchived,
    tenants_pending_decision: swept.pending_decision,
  };

  log.info("rotina diaria concluida", { duration_ms: Date.now() - inicio });
  return resultado;
}
