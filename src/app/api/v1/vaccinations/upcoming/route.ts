import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";

/**
 * GET /api/v1/vaccinations/upcoming   (contrato spec 1.4)
 * Vacinações vencendo nos próximos 15 dias (usado pelo Módulo 4 — Alertas).
 */
export async function GET() {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const now = new Date();
  const limit = new Date(now.getTime() + 15 * 86_400_000);

  const rows = await g.db.animalVaccination.findMany({
    where: { next_due_at: { gte: now, lte: limit } },
    orderBy: { next_due_at: "asc" },
    include: {
      animal: { select: { ear_tag: true } },
      vaccine: { select: { name: true } },
    },
  });

  const data = rows.map((r) => ({
    animal_id: r.animal_id,
    ear_tag: r.animal?.ear_tag ?? null,
    vaccine_name: r.vaccine?.name ?? null,
    last_applied_at: r.applied_at.toISOString(),
    next_due_at: r.next_due_at!.toISOString(),
    days_remaining: Math.ceil(
      (r.next_due_at!.getTime() - now.getTime()) / 86_400_000,
    ),
  }));

  return apiOk(data, { total: data.length });
}
