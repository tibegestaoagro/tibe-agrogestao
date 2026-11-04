import { z } from "zod";
import { apiError, apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { lerLogoAction, removerLogoAction, salvarLogoAction } from "@/lib/actions/emporio-configuracoes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET (a imagem), PUT e DELETE /api/v1/emporio/settings/logo. */

const logoSchema = z.object({
  data_base64: z.string({ error: "Envie a imagem do logo." }).min(1, "Envie a imagem do logo."),
  mime: z.string().optional(),
});

async function GETHandler() {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const r = await lerLogoAction(g.db, g.user);
  if (!r.ok) return apiError(r.code, r.message, r.status, r.field);
  return new Response(Buffer.from(r.data.bytes), {
    status: 200,
    headers: { "Content-Type": r.data.mime, "Cache-Control": "private, max-age=300" },
  });
}

async function PUTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = logoSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(
    await salvarLogoAction(g.db, g.user, { data_base64: parsed.data.data_base64, mime: parsed.data.mime ?? "" }),
  );
}

async function DELETEHandler() {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  return respostaDaAction(await removerLogoAction(g.db, g.user));
}

export const GET = withApi(GETHandler);
export const PUT = withApi(PUTHandler);
export const DELETE = withApi(DELETEHandler);
