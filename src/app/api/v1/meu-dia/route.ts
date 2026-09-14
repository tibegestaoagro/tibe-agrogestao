import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getActivePropertyId } from "@/lib/active-property";
import { classificar, lerItensDoDia, type ItemDoDia } from "@/lib/actions/meu-dia";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/meu-dia   as três seções do Meu Dia, já na ordem do §50
 *
 * Módulo 38. `?property_id=` filtra por fazenda, e sem ele vale a fazenda
 * ativa do seletor do topo, como no Financeiro. Item sem fazenda aparece em
 * todas (ver `lerItensDoDia`).
 *
 * A tela lê a mesma consulta direto no servidor; esta rota existe porque tela
 * sem rota atrás não conta como entregue, e é por ela que o app e qualquer
 * outro cliente chegam no Meu Dia.
 */

function serializar(item: ItemDoDia) {
  return {
    chave: item.chave,
    origem: item.origem,
    titulo: item.titulo,
    data: item.data?.toISOString() ?? null,
    horario: item.horario,
    valor: item.valor,
    urgente: item.urgente,
    dias: item.dias,
    fazenda: item.fazenda,
    href: item.href,
    task_id: item.task_id ?? null,
  };
}

async function GETHandler(request: Request) {
  const g = await guard("tarefas", "read");
  if ("error" in g) return g.error;

  const params = new URL(request.url).searchParams;
  const property_id = params.get("property_id") ?? (await getActivePropertyId(g.db));

  const dia = classificar(await lerItensDoDia(g.db, { property_id }));

  return apiOk(
    {
      atencao: dia.atencao.map(serializar),
      hoje: dia.hoje.map(serializar),
      proximos: dia.proximos.map(serializar),
      sem_data: dia.semData.map(serializar),
    },
    {
      property_id: property_id ?? null,
      total: dia.atencao.length + dia.hoje.length + dia.proximos.length + dia.semData.length,
    },
  );
}

export const GET = withApi(GETHandler);
