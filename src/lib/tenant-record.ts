import { perRequestCache } from "@/lib/per-request-cache";
import { prisma } from "@/lib/prisma";

/**
 * Leitura única da linha do `Tenant` por request (auditoria de performance,
 * 2026-08-04).
 *
 * Antes disso, um render do dashboard buscava a MESMA linha 3 vezes, porque
 * cada consumidor pedia um `select` diferente: o gate de sessão queria
 * `plan_confirmed`, o controle de inadimplência queria `status`/
 * `trial_ends_at`, e o layout queria `name`. Como eram funções distintas,
 * memoizar cada uma isoladamente não resolvia: só unificando o `select`.
 *
 * `Tenant` não é tenant-scoped (ele É o tenant), então usa o client base,
 * sempre com um `tenantId` já resolvido da sessão pelo caller, nunca vindo
 * do client. A memoização é por request (ver o aviso em tenant-context.ts).
 */
export type TenantRecord = {
  name: string;
  plan_confirmed: boolean;
  status: string;
  trial_ends_at: Date | null;
};

export const getTenantRecord = perRequestCache(async function getTenantRecord(
  tenantId: string,
): Promise<TenantRecord | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, plan_confirmed: true, status: true, trial_ends_at: true },
  });
  return tenant as TenantRecord | null;
});
