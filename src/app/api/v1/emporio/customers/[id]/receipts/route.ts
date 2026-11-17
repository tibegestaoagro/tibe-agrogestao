import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { listarRecebimentosDoClienteAction } from "@/lib/actions/emporio-clientes";
import { diaEmTexto, guardEmporio, queryComoObjeto, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/customers/:id/receipts  ?before=AAAA-MM-DD&limit=
 * Os recebimentos do cliente (dinheiro, PIX e cartão da venda, fiado recebido, boleto pago e cheque), do mais
 * recente ao mais antigo, nas lojas que quem pede enxerga. `before` é o dia de corte (só vêm os de antes dele);
 * `next_before` é o `before` da página seguinte, nulo quando não há mais. Limite padrão 20, no máximo 100.
 */

const schema = z.object({
  // O dia (AAAA-MM-DD) ou o `next_before` da página anterior (AAAA-MM-DD_id).
  before: z
    .string()
    .refine((v) => {
      const [dia, id, resto] = v.split("_");
      return diaEmTexto.safeParse(dia).success && resto === undefined && (id === undefined || /^[A-Za-z0-9]+$/.test(id));
    }, "Informe uma data válida (AAAA-MM-DD).")
    .optional(),
  limit: z.coerce
    .number({ error: "O limite é um número inteiro de 1 a 100." })
    .int("O limite é um número inteiro de 1 a 100.")
    .min(1, "O limite é um número inteiro de 1 a 100.")
    .max(100, "O limite é um número inteiro de 1 a 100.")
    .optional(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const parsed = schema.safeParse(queryComoObjeto(request));
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(await listarRecebimentosDoClienteAction(g.db, g.user, id, parsed.data));
}

export const GET = withApi(GETHandler);
