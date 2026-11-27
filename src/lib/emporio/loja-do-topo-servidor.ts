import { cookies } from "next/headers";
import type { TenantPrismaClient } from "@/lib/prisma";
import { perRequestCache } from "@/lib/per-request-cache";
import { listarEstabelecimentosAction, type Ator } from "@/lib/actions/emporio-catalogo";
import { LOJA_DO_TOPO_COOKIE, escolherLojaDoTopo } from "@/lib/emporio/loja-do-topo";

type LojaDoTopo = { lojas: { id: string; name: string }[]; loja: string };

/**
 * A memoização do React compara os argumentos por identidade. O `ator` costuma ser
 * um objeto novo a cada chamada, então a chave é o par de strings (id e papel) e o
 * `Ator` é remontado aqui dentro. O client Prisma é a mesma instância por tenant
 * (ver `active-property.ts`); se um dia deixar de ser, só se perde a memoização.
 */
const lerPorRequest = perRequestCache(async function lerLojaDoTopoMemo(
  db: TenantPrismaClient,
  atorId: string,
  atorRole: Ator["role"],
  daUrl: string,
): Promise<LojaDoTopo> {
  const r = await listarEstabelecimentosAction(db, { id: atorId, role: atorRole });
  const lojas = r.ok ? r.data.map((l) => ({ id: l.id, name: l.name })) : [];
  const doCookie = (await cookies()).get(LOJA_DO_TOPO_COOKIE)?.value;
  return { lojas, loja: escolherLojaDoTopo({ daUrl: daUrl || undefined, doCookie, lojas }) };
});

/**
 * As lojas ao alcance de quem olha e a loja valendo no topo (a da URL, depois a do
 * cookie, depois "" = Todas). Quem chama é a página ou o layout, nunca uma action.
 */
export function lerLojaDoTopo(db: TenantPrismaClient, ator: Ator, daUrl?: string): Promise<LojaDoTopo> {
  return lerPorRequest(db, ator.id, ator.role, daUrl ?? "");
}
