import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getVapidPublicKey } from "@/lib/notify";

/**
 * GET /api/v1/notifications/public-key (Onda 2): devolve a chave pública
 * VAPID para o cliente chamar `pushManager.subscribe({ applicationServerKey })`.
 *
 * Existe porque o navegador PRECISA da chave pública para criar a inscrição
 * de push, e uma variável `NEXT_PUBLIC_*` ficaria fixada no bundle no
 * momento do BUILD: como a Vercel de produção ainda não tem as 3 variáveis
 * VAPID configuradas (ver .env.example e o relatório da Onda 2), servir a
 * chave em runtime por esta rota faz o opt-in começar a funcionar assim que
 * a env var for definida, sem exigir um novo deploy só para "descongelar" um
 * valor que teria sido embutido vazio. Não é um endpoint sensível: a chave
 * PÚBLICA é, por definição, segura para expor (a privada nunca sai do
 * servidor). Ainda assim fica atrás de `guard()` como toda rota /api/v1,
 * por consistência com o resto do projeto (o componente de opt-in só
 * aparece dentro do painel autenticado de qualquer forma).
 */
export async function GET() {
  const g = await guard("alertas", "read");
  if ("error" in g) return g.error;

  return apiOk({ vapid_public_key: getVapidPublicKey() });
}
