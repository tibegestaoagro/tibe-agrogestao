import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getMachineServices } from "@/lib/actions/machine-services";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/machines/:id/services: o histórico do §32 do documento de
 * Máquinas ("Trator Massey: 12 horas de gradagem; Cliente João").
 *
 * Guard `maquinas:read`, e não `servicos:read`: isto é a ficha da máquina, e
 * quem pode ver a máquina pode ver o que ela fez. Pedir a permissão de serviços
 * aqui deixaria a própria ficha meio vazia para um VISUALIZADOR de máquinas.
 */

async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("maquinas", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  // A máquina é conferida antes: sem isso, um id inexistente devolveria um
  // histórico vazio com 200, e a tela mostraria "nenhum serviço" para uma
  // máquina que não existe.
  const maquina = await g.db.machine.findUnique({ where: { id }, select: { id: true } });
  if (!maquina) return apiError("NOT_FOUND", "Máquina não encontrada.", 404);

  const historico = await getMachineServices(g.db, id);
  return apiOk(historico, { total: historico.servicos });
}

export const GET = withApi(GETHandler);
