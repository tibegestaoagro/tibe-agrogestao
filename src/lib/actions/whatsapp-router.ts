import type { TenantPrismaClient } from "@/lib/prisma";
import type { AppUserRole } from "@/types/next-auth";
import type { ProfileType } from "@/lib/tenant-context";
import { canAccess, canWrite } from "@/lib/permissions";
import { INTENT_ACCESS, type Intent } from "@/lib/whatsapp-intents";
import type { RouterResult, HandlerCtx, Handler } from "@/lib/actions/whatsapp-handlers/shared";
import {
  cadastrarAnimal,
  registrarPeso,
  registrarVacina,
  registrarPrevisaoVacina,
  registrarMovimento,
  consultarAnimal,
} from "@/lib/actions/whatsapp-handlers/rebanho";
import { cadastrarServicoOrdem, consultarCliente } from "@/lib/actions/whatsapp-handlers/prestador";
import {
  consultarSaldo,
  gerarRelatorio,
  registrarLancamentoFinanceiro,
} from "@/lib/actions/whatsapp-handlers/financeiro";
import { ajuda } from "@/lib/actions/whatsapp-handlers/ajuda";
import { resumo } from "@/lib/actions/whatsapp-handlers/resumo";
import { handleActiveFlow, maybeStartAnimalFlow } from "@/lib/actions/whatsapp-flow-bridge";

export type { RouterResult } from "@/lib/actions/whatsapp-handlers/shared";

/**
 * Roteador de intenções do agente WhatsApp (spec 3.5). Recebe a intenção já
 * classificada (pelo LLM, no N8N) e os parâmetros extraídos, checa
 * permissão/perfil e despacha para o handler da intenção (um por domínio em
 * src/lib/actions/whatsapp-handlers/*), que reusa a mesma lógica de negócio
 * dos Módulos 1/2 e devolve uma resposta em português pronta para envio.
 *
 * O Record abaixo é exaustivo por construção: uma intenção nova em
 * whatsapp-intents.ts que não ganhar entrada aqui é erro de compilação, não
 * silêncio em produção.
 */
const HANDLERS: Record<Exclude<Intent, "ambigua">, Handler> = {
  cadastrar_animal: cadastrarAnimal,
  registrar_peso: registrarPeso,
  registrar_vacina: registrarVacina,
  registrar_previsao_vacina: registrarPrevisaoVacina,
  registrar_movimento: registrarMovimento,
  cadastrar_servico_ordem: cadastrarServicoOrdem,
  consultar_saldo: consultarSaldo,
  consultar_animal: consultarAnimal,
  consultar_cliente: consultarCliente,
  gerar_relatorio: gerarRelatorio,
  registrar_lancamento_financeiro: registrarLancamentoFinanceiro,
  ajuda,
  resumo,
};

export async function routeIntent(
  db: TenantPrismaClient,
  ctx: {
    tenant_id: string;
    role: AppUserRole;
    activeProfiles: ProfileType[];
    intent: Intent;
    parameters: Record<string, unknown>;
    /** true quando o N8N/usuário confirmou explicitamente a ação pendente. */
    confirmed: boolean;
    /** true quando o usuário recusou explicitamente ("não", "cancela"...). */
    explicitNo: boolean;
    /** Necessários para o cadastro assistido (2026-07-30): o estado é por usuário. */
    user_id?: string;
    message_text?: string | null;
  },
): Promise<RouterResult> {
  const { tenant_id, role, activeProfiles, intent, parameters, confirmed, explicitNo } = ctx;

  // Cadastro assistido tem prioridade sobre o roteamento normal: se existe um
  // formulário em andamento, a mensagem é primeiro oferecida a ele. O bridge
  // devolve null quando a mensagem claramente não é resposta de campo, e aí o
  // fluxo segue normalmente (a interrupção é respondida e o formulário retomado
  // logo em seguida).
  if (ctx.user_id) {
    const flowResult = await handleActiveFlow({
      db,
      userId: ctx.user_id,
      intent,
      messageText: ctx.message_text ?? null,
      confirmed,
      explicitNo,
    });
    if (flowResult) return flowResult;
  }

  // Permissão por módulo/role e por perfil ativo (spec: "visualizador não
  // consegue cadastrar nada via WhatsApp"). gerar_relatorio/ambigua checam à parte.
  if (intent !== "ambigua" && intent !== "gerar_relatorio") {
    const rule = INTENT_ACCESS[intent];
    if (rule.module) {
      const allowed =
        rule.action === "write" ? canWrite(role, rule.module) : canAccess(role, rule.module);
      if (!allowed) {
        return {
          reply_text: "Você não tem permissão para executar essa ação.",
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: `${intent}:sem_permissao`,
        };
      }
    }
    if (rule.profile && !activeProfiles.includes(rule.profile)) {
      const label = rule.profile === "fazenda" ? "Fazenda" : "Prestador de Serviço";
      return {
        reply_text: `Esse recurso requer o perfil "${label}" ativo, que não está habilitado para sua empresa.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: `${intent}:perfil_inativo`,
      };
    }
  }

  if (intent === "ambigua") {
    return {
      reply_text:
        "Não entendi. Posso cadastrar novas informações ou te contar o que já está cadastrado: me diga o que você precisa, ou pergunte 'o que você faz?' que eu te mostro as opções.",
      requires_confirmation: false,
      auxiliary_data: null,
      report_url: null,
      action_taken: "ambigua",
    };
  }

  // "quero cadastrar bois, me ajuda": sem os campos, abre o modo assistido em
  // vez de despejar a lista inteira de campos numa mensagem só.
  if (intent === "cadastrar_animal" && ctx.user_id) {
    const started = await maybeStartAnimalFlow(db, ctx.user_id, parameters);
    if (started) return started;
  }

  const handlerCtx: HandlerCtx = { db, tenant_id, role, activeProfiles, parameters, confirmed, explicitNo };
  return HANDLERS[intent](handlerCtx);
}
