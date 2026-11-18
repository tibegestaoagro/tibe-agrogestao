import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { salvarConfiguracoesDoBalcaoAction } from "@/lib/actions/emporio-configuracoes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** PATCH /api/v1/emporio/settings/balcao: teclas dos atalhos, legenda e medidas das etiquetas (só Dono e Gerente geral). */

const tecla = z.string({ error: "Escolha uma tecla da lista." });
const inteiro = (msg: string) => z.number({ error: msg });
const mm = z.number({ error: "Informe a medida em milímetros." });

// A faixa e a grade são conferidas na action, que o agente do WhatsApp também chama.
const schema = z.object({
  shortcut_product: tecla.optional(),
  shortcut_customer: tecla.optional(),
  shortcut_seller: tecla.optional(),
  shortcut_payment: tecla.optional(),
  shortcut_close: tecla.optional(),
  show_shortcut_legend: z.boolean({ error: "Informe se a legenda aparece ou não." }).optional(),
  label_default_format: z.string({ error: "Escolha folha A4 ou rolo." }).optional(),
  label_a4_columns: inteiro("Informe de 1 a 20 colunas.").optional(),
  label_a4_rows: inteiro("Informe de 1 a 50 linhas.").optional(),
  label_a4_width: mm.optional(),
  label_a4_height: mm.optional(),
  label_a4_margin_top: mm.optional(),
  label_a4_margin_left: mm.optional(),
  label_a4_gap_x: mm.optional(),
  label_a4_gap_y: mm.optional(),
  label_roll_width: mm.optional(),
  label_roll_height: mm.optional(),
  label_roll_columns: inteiro("O rolo tem de 1 a 3 colunas.").optional(),
  label_roll_gap_x: mm.optional(),
});

async function PATCHHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await salvarConfiguracoesDoBalcaoAction(g.db, g.user, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
