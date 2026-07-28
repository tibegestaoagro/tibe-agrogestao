import type { TenantPrismaClient } from "@/lib/prisma";
import type { AppUserRole } from "@/types/next-auth";
import type { ProfileType } from "@/lib/tenant-context";
import type { ModuleKey } from "@/lib/permissions";
import { canAccess, canWrite } from "@/lib/permissions";
import { decToNum } from "@/lib/serialize";
import {
  createAnimalAction,
  findAnimalByEarTag,
  addWeightLogAction,
  addVaccinationAction,
  findVaccineByName,
  addMovementAction,
  getAnimalSummaryAction,
} from "@/lib/actions/animals";
import { findActivePropertyByName, listActiveProperties } from "@/lib/actions/properties";
import {
  createServiceOrderAction,
  findClientsByName,
  findServiceByName,
} from "@/lib/actions/service-orders";
import { getClientSummaryAction } from "@/lib/actions/service-clients";
import { getBalanceAction } from "@/lib/actions/financial-summary";
import { resolvePeriod } from "@/lib/actions/financial-reports";
import { buildReportLink } from "@/lib/reports/report-link";
import { createManualEntryAction } from "@/lib/actions/financial-entries";
import { FINANCIAL_CATEGORIES } from "@/lib/category-suggestions";
import { INTENT_ACCESS, CONFIRMATION_THRESHOLD, type Intent } from "@/lib/whatsapp-intents";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Roteador de intenções do agente WhatsApp (spec 3.5). Recebe a intenção já
 * classificada (pelo LLM, no N8N) e os parâmetros extraídos, executa a ação
 * reusando a mesma lógica de negócio dos Módulos 1/2, e devolve uma resposta
 * em português pronta para envio.
 */

export type RouterResult = {
  reply_text: string;
  requires_confirmation: boolean;
  auxiliary_data: Record<string, unknown> | null;
  report_url: string | null;
  /** Uso interno (log), não faz parte do contrato de resposta HTTP. */
  action_taken: string;
};

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function ask(text: string, auxiliary: Record<string, unknown> | null = null): RouterResult {
  return {
    reply_text: text,
    requires_confirmation: false,
    auxiliary_data: auxiliary,
    report_url: null,
    action_taken: "clarification_requested",
  };
}

function failReply(intent: string, result: Extract<ActionResult<unknown>, { ok: false }>): RouterResult {
  return {
    reply_text: `⚠️ ${result.message}`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `${intent}:falhou:${result.code}`,
  };
}

const MOVEMENT_LABEL: Record<string, string> = {
  purchase: "Compra",
  sale: "Venda",
  transfer: "Transferência",
  death: "Morte",
};
const SEX_LABEL: Record<string, string> = { male: "macho", female: "fêmea" };
const STATUS_LABEL: Record<string, string> = {
  active: "ativo",
  sold: "vendido",
  deceased: "morto",
};
const REPORT_TYPE_MODULE: Record<string, ModuleKey> = {
  financeiro: "financeiro",
  rebanho: "rebanho",
  lavoura: "lavoura",
  prestador: "prestador",
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
  },
): Promise<RouterResult> {
  const { tenant_id, role, activeProfiles, intent, parameters, confirmed, explicitNo } = ctx;

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

  switch (intent) {
    case "cadastrar_animal": {
      const ear_tag = str(parameters.ear_tag);
      const breed = str(parameters.breed);
      const sexRaw = parameters.sex;
      const sex = sexRaw === "male" || sexRaw === "female" ? sexRaw : null;
      if (!ear_tag || !breed || !sex) {
        return ask(
          "Para cadastrar o animal preciso do brinco, raça e sexo (macho/fêmea). Pode enviar novamente com esses dados?",
        );
      }

      let propertyId = str(parameters.property_id);
      if (!propertyId) {
        const propertyName = str(parameters.property_name) ?? str(parameters.property);
        if (propertyName) {
          const prop = await findActivePropertyByName(db, propertyName);
          if (!prop) return ask(`Não encontrei a propriedade '${propertyName}'. Pode confirmar o nome?`);
          propertyId = prop.id;
        } else {
          const props = await listActiveProperties(db);
          if (props.length === 0) {
            return ask(
              "Você ainda não tem nenhuma propriedade cadastrada. Cadastre uma propriedade antes de adicionar animais.",
            );
          }
          if (props.length === 1) {
            propertyId = props[0].id;
          } else {
            return ask(
              `Você tem mais de uma propriedade. Em qual devo cadastrar o animal? Opções: ${props.map((p) => p.name).join(", ")}.`,
              { properties: props.map((p) => ({ id: p.id, name: p.name })) },
            );
          }
        }
      }

      const result = await createAnimalAction(db, { ear_tag, breed, sex, property_id: propertyId });
      if (!result.ok) return failReply(intent, result);
      return {
        reply_text: `Animal ${result.data.ear_tag} cadastrado com sucesso! ✅`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: `cadastrar_animal:${result.data.id}`,
      };
    }

    case "registrar_peso": {
      const ear_tag = str(parameters.ear_tag);
      const weight = num(parameters.weight);
      if (!ear_tag || weight == null) {
        return ask("Para registrar o peso, preciso do brinco do animal e do peso em kg.");
      }
      const animal = await findAnimalByEarTag(db, ear_tag);
      if (!animal) return ask(`Não encontrei nenhum animal com o brinco '${ear_tag}'.`);

      const result = await addWeightLogAction(db, { animal_id: animal.id, weight });
      if (!result.ok) return failReply(intent, result);
      return {
        reply_text: `Peso de ${weight}kg registrado para o brinco ${ear_tag}. Peso atual: ${result.data.current_weight}kg${
          result.data.gmd != null ? ` (GMD: ${result.data.gmd}kg/dia)` : ""
        }.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: `registrar_peso:${animal.id}`,
      };
    }

    case "registrar_vacina": {
      const ear_tag = str(parameters.ear_tag);
      const vaccineName = str(parameters.vaccine_name);
      if (!ear_tag || !vaccineName) {
        return ask("Para registrar a vacina, preciso do brinco do animal e do nome da vacina.");
      }
      const animal = await findAnimalByEarTag(db, ear_tag);
      if (!animal) return ask(`Não encontrei nenhum animal com o brinco '${ear_tag}'.`);

      const vaccine = await findVaccineByName(db, vaccineName);
      if (!vaccine) {
        const all = await db.vaccine.findMany({ orderBy: { name: "asc" } });
        return ask(
          `Não encontrei a vacina '${vaccineName}' no catálogo. Vacinas disponíveis: ${
            all.map((v) => v.name).join(", ") || "nenhuma cadastrada"
          }.`,
        );
      }
      const cost = num(parameters.cost);

      const result = await addVaccinationAction(db, {
        animal_id: animal.id,
        vaccine_id: vaccine.id,
        cost,
      });
      if (!result.ok) return failReply(intent, result);
      return {
        reply_text: `Vacina ${result.data.vaccine_name} registrada para o brinco ${ear_tag}.${
          result.data.next_due_at
            ? ` Próxima dose: ${result.data.next_due_at.toLocaleDateString("pt-BR")}.`
            : ""
        }`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: `registrar_vacina:${animal.id}`,
      };
    }

    case "registrar_movimento": {
      const ear_tag = str(parameters.ear_tag);
      const movementTypeRaw = str(parameters.movement_type);
      const movement_type = (["purchase", "sale", "transfer", "death"] as const).find(
        (t) => t === movementTypeRaw,
      );
      if (!ear_tag || !movement_type) {
        return ask(
          "Para registrar a movimentação, preciso do brinco do animal e do tipo (compra, venda, transferência ou morte).",
        );
      }
      const animal = await findAnimalByEarTag(db, ear_tag);
      if (!animal) return ask(`Não encontrei nenhum animal com o brinco '${ear_tag}'.`);

      const value = num(parameters.value);

      let to_property_id: string | null = null;
      if (movement_type === "transfer") {
        to_property_id = str(parameters.to_property_id);
        if (!to_property_id) {
          const destName = str(parameters.to_property_name) ?? str(parameters.property_name);
          if (!destName) return ask("Para qual propriedade devo transferir o animal?");
          const dest = await findActivePropertyByName(db, destName);
          if (!dest) return ask(`Não encontrei a propriedade '${destName}'.`);
          to_property_id = dest.id;
        }
      }

      // Confirmação para venda/compra com valor relevante (spec 3.6).
      if (
        (movement_type === "sale" || movement_type === "purchase") &&
        value != null &&
        value > CONFIRMATION_THRESHOLD
      ) {
        if (explicitNo) {
          return {
            reply_text: "Ação cancelada.",
            requires_confirmation: false,
            auxiliary_data: null,
            report_url: null,
            action_taken: "registrar_movimento:cancelado",
          };
        }
        if (!confirmed) {
          const verb = movement_type === "sale" ? "venda" : "compra";
          return {
            reply_text: `Confirma a ${verb} do animal ${ear_tag} por R$ ${value.toFixed(2)}? Responda "sim" para confirmar.`,
            requires_confirmation: true,
            auxiliary_data: { ear_tag, movement_type, value },
            report_url: null,
            action_taken: "registrar_movimento:aguardando_confirmacao",
          };
        }
      }

      const result = await addMovementAction(db, {
        animal_id: animal.id,
        movement_type,
        value,
        to_property_id,
      });
      if (!result.ok) return failReply(intent, result);
      return {
        reply_text: `${MOVEMENT_LABEL[movement_type]} registrada para o brinco ${ear_tag}${
          value != null ? ` (R$ ${value.toFixed(2)})` : ""
        }.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: `registrar_movimento:${animal.id}`,
      };
    }

    case "cadastrar_servico_ordem": {
      const clientName = str(parameters.client_name);
      const serviceName = str(parameters.service_name);
      const quantity = num(parameters.quantity) ?? 1;
      if (!clientName || !serviceName) {
        return ask("Para registrar a ordem, preciso do nome do cliente e do serviço prestado.");
      }

      const clients = await findClientsByName(db, clientName);
      if (clients.length === 0) {
        return ask(`Não encontrei nenhum cliente chamado '${clientName}'. Cadastre o cliente primeiro.`);
      }
      if (clients.length > 1) {
        return ask(
          `Encontrei mais de um cliente com esse nome: ${clients.map((c) => c.name).join(", ")}. Qual deles?`,
          { clients: clients.map((c) => ({ id: c.id, name: c.name })) },
        );
      }
      const client = clients[0];

      const service = await findServiceByName(db, serviceName);
      if (!service) return ask(`Não encontrei o serviço '${serviceName}' no catálogo.`);

      const unitPrice = decToNum(service.unit_price) ?? 0;
      const effectiveQty = service.pricing_type === "fixed" ? 1 : quantity;
      const total_value = Number((effectiveQty * unitPrice).toFixed(2));

      if (total_value > CONFIRMATION_THRESHOLD) {
        if (explicitNo) {
          return {
            reply_text: "Ação cancelada.",
            requires_confirmation: false,
            auxiliary_data: null,
            report_url: null,
            action_taken: "cadastrar_servico_ordem:cancelado",
          };
        }
        if (!confirmed) {
          return {
            reply_text: `Confirma a ordem de serviço "${service.name}" para ${client.name} no valor de R$ ${total_value.toFixed(2)}? Responda "sim" para confirmar.`,
            requires_confirmation: true,
            auxiliary_data: { client_id: client.id, service_id: service.id, quantity: effectiveQty },
            report_url: null,
            action_taken: "cadastrar_servico_ordem:aguardando_confirmacao",
          };
        }
      }

      const result = await createServiceOrderAction(db, {
        service_client_id: client.id,
        service_id: service.id,
        quantity: effectiveQty,
        performed_at: new Date(),
      });
      if (!result.ok) return failReply(intent, result);
      return {
        reply_text: `Ordem de serviço registrada para ${client.name}: ${service.name}, total R$ ${result.data.total_value.toFixed(2)}.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: `cadastrar_servico_ordem:${result.data.id}`,
      };
    }

    case "registrar_lancamento_financeiro": {
      const amount = num(parameters.amount);
      const categoryRaw = str(parameters.category);
      const vendor = str(parameters.vendor);
      const description = str(parameters.description);

      if (amount == null) {
        return ask("Não consegui identificar o valor do lançamento. Pode informar quanto foi?");
      }

      const category = (FINANCIAL_CATEGORIES as readonly string[]).includes(categoryRaw ?? "")
        ? (categoryRaw as string)
        : "Outros";

      if (explicitNo) {
        return {
          reply_text: "Lançamento cancelado.",
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "registrar_lancamento_financeiro:cancelado",
        };
      }

      if (!confirmed) {
        return {
          reply_text: `Entendi: R$ ${amount.toFixed(2)}, categoria ${category}${vendor ? `, ${vendor}` : ""}. Confirma o lançamento?`,
          requires_confirmation: true,
          auxiliary_data: { amount, category, vendor, description },
          report_url: null,
          action_taken: "registrar_lancamento_financeiro:aguardando_confirmacao",
        };
      }

      const result = await createManualEntryAction(db, {
        entry_type: "expense",
        category,
        amount,
        due_date: new Date(),
        notes: vendor ?? description ?? null,
      });
      if (!result.ok) return failReply(intent, result);
      return {
        reply_text: `Lançamento registrado: R$ ${amount.toFixed(2)}, ${category}${vendor ? `, ${vendor}` : ""}.`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: `registrar_lancamento_financeiro:${result.data.id}`,
      };
    }

    case "consultar_saldo": {
      const period = str(parameters.period);
      const result = await getBalanceAction(db, period);
      if (!result.ok) return failReply(intent, result);
      return {
        reply_text: `Saldo de ${result.data.period_label}: receita R$ ${result.data.income.toFixed(2)}, despesa R$ ${result.data.expense.toFixed(2)}, saldo R$ ${result.data.balance.toFixed(2)}.`,
        requires_confirmation: false,
        auxiliary_data: result.data,
        report_url: null,
        action_taken: "consultar_saldo",
      };
    }

    case "consultar_animal": {
      const ear_tag = str(parameters.ear_tag);
      if (!ear_tag) return ask("Qual o brinco do animal que você quer consultar?");
      const result = await getAnimalSummaryAction(db, ear_tag);
      if (!result.ok) return failReply(intent, result);
      const a = result.data;
      let text = `Brinco ${a.ear_tag} (${a.breed ?? "raça não informada"}, ${SEX_LABEL[a.sex] ?? a.sex}): status: ${STATUS_LABEL[a.status] ?? a.status}.`;
      if (a.property_name) text += ` Propriedade: ${a.property_name}.`;
      if (a.current_weight != null) text += ` Peso atual: ${a.current_weight}kg.`;
      if (a.gmd != null) text += ` GMD: ${a.gmd}kg/dia.`;
      if (a.last_vaccination) {
        text += ` Última vacina: ${a.last_vaccination.vaccine_name} em ${new Date(a.last_vaccination.applied_at).toLocaleDateString("pt-BR")}.`;
      }
      return {
        reply_text: text,
        requires_confirmation: false,
        auxiliary_data: a,
        report_url: null,
        action_taken: "consultar_animal",
      };
    }

    case "consultar_cliente": {
      const clientName = str(parameters.client_name);
      if (!clientName) return ask("Qual o nome do cliente que você quer consultar?");
      const clients = await findClientsByName(db, clientName);
      if (clients.length === 0) return ask(`Não encontrei nenhum cliente chamado '${clientName}'.`);
      if (clients.length > 1) {
        return ask(
          `Encontrei mais de um cliente: ${clients.map((c) => c.name).join(", ")}. Qual deles?`,
          { clients: clients.map((c) => ({ id: c.id, name: c.name })) },
        );
      }
      const result = await getClientSummaryAction(db, clients[0].id);
      if (!result.ok) return failReply(intent, result);
      const s = result.data;
      return {
        reply_text: `${s.client_name}: faturado R$ ${s.total_invoiced.toFixed(2)}, pendente R$ ${s.total_pending.toFixed(2)} (${s.orders_count} ordens registradas).`,
        requires_confirmation: false,
        auxiliary_data: s,
        report_url: null,
        action_taken: "consultar_cliente",
      };
    }

    case "gerar_relatorio": {
      const tipoRaw = str(parameters.tipo);
      const tipo = tipoRaw && REPORT_TYPE_MODULE[tipoRaw] ? tipoRaw : null;
      if (!tipo) {
        return ask("Qual tipo de relatório você quer? (financeiro, rebanho, lavoura ou prestador)");
      }
      const moduleForTipo = REPORT_TYPE_MODULE[tipo];
      if (!canAccess(role, moduleForTipo)) {
        return {
          reply_text: "Você não tem permissão para gerar esse relatório.",
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "gerar_relatorio:sem_permissao",
        };
      }
      const profileNeeded: ProfileType | null =
        moduleForTipo === "rebanho" || moduleForTipo === "lavoura"
          ? "fazenda"
          : moduleForTipo === "prestador"
            ? "prestador"
            : null;
      if (profileNeeded && !activeProfiles.includes(profileNeeded)) {
        return ask(`O perfil necessário para o relatório de ${tipo} não está ativo neste tenant.`);
      }

      // Só o relatório financeiro (DRE + lançamentos) tem PDF pronto (spec 4.7).
      // Relatórios de rebanho/lavoura/prestador ainda não têm gerador dedicado.
      if (tipo !== "financeiro") {
        return {
          reply_text: `O relatório de ${tipo} em PDF ainda não está disponível: por enquanto só o relatório financeiro é gerado. Em breve!`,
          requires_confirmation: false,
          auxiliary_data: null,
          report_url: null,
          action_taken: "gerar_relatorio:tipo_nao_suportado",
        };
      }

      const { start, end } = resolvePeriod(str(parameters.period), null);
      const report_url = buildReportLink(tenant_id, start, end);
      return {
        reply_text: `Aqui está o relatório financeiro de ${start.toLocaleDateString("pt-BR")} a ${end.toLocaleDateString("pt-BR")}: ${report_url}`,
        requires_confirmation: false,
        auxiliary_data: null,
        report_url,
        action_taken: "gerar_relatorio:financeiro",
      };
    }

    case "ambigua":
    default:
      return {
        reply_text:
          "Desculpe, não entendi sua mensagem. Posso ajudar com cadastro de animais, pesagens, vacinas, movimentações, ordens de serviço e consultas. Pode reformular?",
        requires_confirmation: false,
        auxiliary_data: null,
        report_url: null,
        action_taken: "ambigua",
      };
  }
}
