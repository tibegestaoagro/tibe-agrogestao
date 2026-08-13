import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { listContacts, createContact, CONTACT_TYPES } from "@/lib/actions/contacts";

/**
 * GET  /api/v1/contacts   lista contatos de negociação (Módulo 31, §5)
 * POST /api/v1/contacts   cadastro simplificado
 *
 * Wrapper fino: a regra vive em `src/lib/actions/contacts.ts`, porque o
 * caminho do WhatsApp cria contato pela mesma porta (§18.1, "comprei 20
 * bezerros DO JOÃO").
 *
 * Reusa o guard de "rebanho": o PRD §5.2 não define um módulo de permissão
 * para Negociações, e as matrizes de `rebanho` e `financeiro` são idênticas
 * hoje (OWNER, ADMIN e OPERADOR escrevem; VISUALIZADOR lê). Se um dia elas
 * divergirem, esta escolha precisa ser revisitada, porque uma negociação
 * escreve nos dois módulos.
 */

const TIPOS = CONTACT_TYPES;

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

  const contatos = await listContacts(g.db, {
    busca,
    type: tipo && (TIPOS as readonly string[]).includes(tipo) ? (tipo as (typeof TIPOS)[number]) : null,
  });

  return apiOk(contatos, { total: contatos.length });
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

  const resultado = await createContact(g.db, d);
  if (!resultado.ok) return apiError(resultado.code, resultado.message, resultado.status);

  return apiOk(resultado.data, {}, { status: 201 });
}
