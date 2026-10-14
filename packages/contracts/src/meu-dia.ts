import { z } from "zod";
import { apiOkSchema } from "./envelope";

/**
 * Meu Dia (Módulo 38).
 *
 * Rotas cobertas:
 *   GET /api/v1/meu-dia
 *
 * O item é o `serializar` da própria rota (src/app/api/v1/meu-dia/route.ts), a
 * partir de `ItemDoDia` (src/lib/actions/meu-dia.ts). É UMA forma só para as
 * sete origens (tarefa, contas, vacina, serviço, estadia, estoque): o Meu Dia
 * já as apresenta achatadas, então não há schema de outro domínio a importar.
 */

/** `OrigemDoItem` (src/lib/actions/meu-dia.ts). Não é enum do Prisma. */
export const meuDiaOrigemSchema = z.enum(["tarefa", "pagar", "receber", "vacina", "servico", "estadia", "estoque"]);
export type MeuDiaOrigem = z.infer<typeof meuDiaOrigemSchema>;

export const meuDiaItemSchema = z.object({
  /** `origem:id`, estável entre chamadas. */
  chave: z.string(),
  origem: meuDiaOrigemSchema,
  titulo: z.string(),
  /** Nulo só em tarefa sem data e em alerta de estoque. */
  data: z.iso.datetime().nullable(),
  /** "HH:MM", só tarefa com data tem. */
  horario: z.string().nullable(),
  /** Saldo ainda devido, só nas contas. */
  valor: z.number().nullable(),
  urgente: z.boolean(),
  /** Negativo passou, zero hoje, positivo vem. Nulo sem data. */
  dias: z.number().int().nullable(),
  fazenda: z.string().nullable(),
  href: z.string(),
  /** Presente (não nulo) só em tarefa. */
  task_id: z.string().nullable(),
});
export type MeuDiaItem = z.infer<typeof meuDiaItemSchema>;

export const meuDiaMetaSchema = z.object({
  property_id: z.string().nullable(),
  total: z.number().int().nonnegative(),
});

// ─────────────────────────────────────────────────────────────
// GET /api/v1/meu-dia
// ─────────────────────────────────────────────────────────────

export const getMeuDiaResponseSchema = apiOkSchema(
  z.object({
    atencao: z.array(meuDiaItemSchema),
    hoje: z.array(meuDiaItemSchema),
    proximos: z.array(meuDiaItemSchema),
    sem_data: z.array(meuDiaItemSchema),
  }),
  meuDiaMetaSchema,
);
export type GetMeuDiaResponse = z.infer<typeof getMeuDiaResponseSchema>;
