import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { normalizarTermo } from "@/lib/actions/whatsapp-handlers/shared";

/** Propriedades ativas (não arquivadas) do tenant. */
export async function listActiveProperties(db: TenantPrismaClient) {
  return db.property.findMany({ where: { archived_at: null }, orderBy: { name: "asc" } });
}

/**
 * Soma das áreas dos pastos ativos de uma propriedade x tamanho total da
 * fazenda (doc "Minha Fazenda" §6): usada pra exibir a soma na tela e pro
 * aviso de "soma dos pastos maior que o total" (aviso apenas, nunca bloqueia
 * salvar: decisão do usuário, 2026-08-04).
 */
export async function getPastureAreaSummary(db: TenantPrismaClient, propertyId: string) {
  const [property, pastures] = await Promise.all([
    db.property.findFirst({ where: { id: propertyId }, select: { area_hectares: true } }),
    db.pasture.findMany({ where: { property_id: propertyId, archived_at: null }, select: { area_hectares: true } }),
  ]);

  const total_area = decToNum(property?.area_hectares ?? null);
  const distributed_area = pastures.reduce((sum, p) => sum + (decToNum(p.area_hectares) ?? 0), 0);
  const over_allocated = total_area != null && distributed_area > total_area;

  return {
    total_area,
    distributed_area,
    remaining_area: total_area != null ? total_area - distributed_area : null,
    over_allocated,
  };
}

/**
 * Casa um nome dito (resposta livre ou parâmetro) com uma lista de fazendas já
 * carregada, sem acento nem caixa. Exato primeiro; "contém" (nos dois
 * sentidos, para aceitar "na Fazenda B") só quando sobra EXATAMENTE uma.
 *
 * Zero ou duas-ou-mais batidas devolvem `null`: nunca escolhe entre duas. O
 * `contains` + `findFirst` antigo devolvia a primeira do banco quando "Fazenda"
 * casava "Fazenda A" e "Fazenda B" ao mesmo tempo.
 */
export function casarFazenda<T extends { name: string }>(props: T[], texto: string): T | null {
  const alvo = normalizarTermo(texto);
  if (!alvo) return null;

  const exato = props.filter((p) => normalizarTermo(p.name) === alvo);
  if (exato.length > 0) return exato.length === 1 ? exato[0] : null;

  const parcial = props.filter((p) => {
    const nome = normalizarTermo(p.name);
    return alvo.includes(nome) || nome.includes(alvo);
  });
  return parcial.length === 1 ? parcial[0] : null;
}

/** Propriedade ativa pelo nome, pela regra de `casarFazenda`. `null` se nenhuma ou ambígua. */
export async function findActivePropertyByName(db: TenantPrismaClient, name: string) {
  return casarFazenda(await listActiveProperties(db), name);
}
