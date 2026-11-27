import type { TenantPrismaClient } from "@/lib/prisma";
import { fail, ok, type ActionResult } from "@/lib/actions/types";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";

/**
 * Confere a loja escolhida no seletor do topo. É preferência de tela, não escrita de
 * negócio: todo papel do Empório pode escolher (o Caixa inclusive, porque escolher não
 * mostra nada novo) e nada é gravado no banco nem no histórico. O cookie é gravado pela
 * rota, só depois deste `ok`. `null` é "Todas".
 */
export async function escolherLojaDoTopoAction(
  db: TenantPrismaClient,
  ator: Ator,
  establishmentId: string | null,
): Promise<ActionResult<{ establishment_id: string | null }>> {
  if (establishmentId === null) return ok({ establishment_id: null });
  const naoAchou = () => fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  if (typeof establishmentId !== "string" || !establishmentId.trim()) return naoAchou();
  const visiveis = await lojasDoAtor(db, ator);
  if (visiveis && !visiveis.has(establishmentId)) return naoAchou();
  const loja = await db.establishment.findFirst({ where: { id: establishmentId, archived_at: null }, select: { id: true } });
  if (!loja) return naoAchou();
  return ok({ establishment_id: establishmentId });
}
