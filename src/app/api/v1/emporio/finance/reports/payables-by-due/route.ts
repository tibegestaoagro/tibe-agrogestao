import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { aPagarPorVencimentoAction } from "@/lib/actions/emporio-relatorios-financeiro";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/finance/reports/payables-by-due  ?establishment_id= &de= &ate= (AAAA-MM-DD; padrão: de hoje a hoje + 30)  o a pagar por semana e por nome. */

const DIA_MS = 86_400_000;

const diaIso = (campo: string) =>
  z
    .string({ error: `Informe a data ${campo === "de" ? "inicial" : "final"}.` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida (AAAA-MM-DD).")
    .refine((v) => {
      const t = Date.parse(`${v}T00:00:00Z`);
      // O Date.parse aceita 2026-02-31 e rola para março: só vale a data que volta igual.
      return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
    }, "Informe uma data válida (AAAA-MM-DD).")
    .transform((v) => new Date(`${v}T00:00:00Z`));

const schema = z.object({ de: diaIso("de"), ate: diaIso("ate") });

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const hoje = hojeEmBrasilia();
  const parsed = schema.safeParse({
    de: sp.get("de") ?? hoje.toISOString().slice(0, 10),
    ate: sp.get("ate") ?? new Date(hoje.getTime() + 30 * DIA_MS).toISOString().slice(0, 10),
  });
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(
    await aPagarPorVencimentoAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      de: parsed.data.de,
      ate: parsed.data.ate,
    }),
  );
}

export const GET = withApi(GETHandler);
