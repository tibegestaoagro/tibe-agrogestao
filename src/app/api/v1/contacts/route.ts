import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";

/**
 * GET  /api/v1/contacts   lista contatos de negociação (Módulo 31, §5)
 * POST /api/v1/contacts   cadastro simplificado
 *
 * §5 é explícito sobre a simplicidade: nesta primeira versão o sistema NÃO
 * deve exigir CPF, CNPJ, inscrição estadual, endereço completo, dados
 * bancários nem documentação fiscal. Só o nome é obrigatório, e até o TIPO é
 * opcional, porque "o usuário não deverá ser obrigado a classificar a pessoa
 * ou empresa quando não souber" (§4).
 *
 * Reusa o guard de "rebanho": o PRD §5.2 não define um módulo de permissão
 * para Negociações, e as matrizes de `rebanho` e `financeiro` são idênticas
 * hoje (OWNER, ADMIN e OPERADOR escrevem; VISUALIZADOR lê). Se um dia elas
 * divergirem, esta escolha precisa ser revisitada, porque uma negociação
 * escreve nos dois módulos.
 */

const TIPOS = [
  "particular",
  "fazendeiro",
  "comerciante_gado",
  "frigorifico",
  "leilao",
  "feira_evento",
  "cooperativa",
  "loja_fornecedor",
  "prestador_servico",
  "outro",
] as const;

const createSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do contato"),
  type: z.enum(TIPOS).nullish(),
  phone: z.string().trim().max(40).nullish(),
  city: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

export async function GET(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const params = new URL(request.url).searchParams;
  const busca = params.get("q")?.trim();
  const tipo = params.get("type");

  const contatos = await g.db.contact.findMany({
    where: {
      archived_at: null,
      ...(busca ? { name: { contains: busca, mode: "insensitive" as const } } : {}),
      ...(tipo && (TIPOS as readonly string[]).includes(tipo)
        ? { type: tipo as (typeof TIPOS)[number] }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  return apiOk(
    contatos.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      phone: c.phone,
      city: c.city,
      notes: c.notes,
    })),
    { total: contatos.length },
  );
}

export async function POST(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const d = parsed.data;

  const contato = await g.db.contact.create({
    data: scoped({
      name: d.name,
      type: d.type ?? null,
      phone: d.phone ?? null,
      city: d.city ?? null,
      notes: d.notes ?? null,
    }),
  });

  return apiOk(
    {
      id: contato.id,
      name: contato.name,
      type: contato.type,
      phone: contato.phone,
      city: contato.city,
      notes: contato.notes,
    },
    {},
    { status: 201 },
  );
}
