import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { withApi } from "@/lib/route";
import { identificarContato } from "@/lib/actions/whatsapp-contato";

/**
 * POST /api/internal/whatsapp/resolve-contact (spec 3.2)
 *
 * Rota fina: autenticação e validação do corpo ficam aqui; a identificação do
 * contato (o único lookup cross-tenant legítimo do sistema, ver
 * .claude/rules/isolamento.md) vive em `identificarContato`
 * (src/lib/actions/whatsapp-contato.ts, task 9 da fase 2).
 *
 * Extensões aditivas ao contrato da spec (documentadas, não fazem parte de "data"):
 * - meta.first_contact: true quando o vínculo WhatsAppContact acabou de ser criado
 *   (usado para a saudação personalizada da task 3.8).
 * - meta.recent_history: últimas 5 interações de AgentConversationLog, já que a
 *   spec (task 3.3) exige esse histórico para o LLM mas não define de onde o N8N
 *   o obtém: resolve-contact é chamado primeiro no fluxo, então é o lugar natural.
 * - meta.suggested_reply: mensagem pronta para os dois casos "de fronteira" da
 *   task 3.8 (contato não identificado / primeira mensagem de usuário recém
 *   vinculado): permite ao N8N responder direto, sem passar pelo LLM.
 */

const schema = z.object({ phone: z.string().min(3) });

async function POSTHandler(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "phone é obrigatório", 422);
  }

  const resultado = await identificarContato(parsed.data.phone);

  if (!resultado.identificado) {
    // O telefone nem chegou a ter um WhatsAppContact vinculado a um User: só
    // esse caso vem com resposta_sugerida preenchida (número desconhecido).
    // Os outros dois (contato sem user_id, user inativo) não tinham meta
    // nenhuma na rota original: manter o `{}` default do apiOk é o que
    // preserva a resposta.
    return apiOk(
      { identified: false },
      resultado.resposta_sugerida !== null ? { suggested_reply: resultado.resposta_sugerida } : {},
    );
  }

  return apiOk(
    {
      identified: true,
      tenant_id: resultado.tenant_id,
      user_id: resultado.user.id,
      user_name: resultado.user.name,
      role: resultado.user.role,
      active_profiles: resultado.activeProfiles,
    },
    {
      first_contact: resultado.primeiro_contato,
      suggested_reply: resultado.resposta_sugerida,
      recent_history: resultado.historico.map((h) => ({
        direction: h.direction,
        content: h.content,
        intent_detected: h.intent_detected,
        created_at: h.created_at.toISOString(),
      })),
    },
  );
}

export const POST = withApi(POSTHandler);
