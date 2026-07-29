import { createServiceOrderAction, findClientsByName, findServiceByName } from "@/lib/actions/service-orders";
import { getClientSummaryAction } from "@/lib/actions/service-clients";
import { decToNum } from "@/lib/serialize";
import { CONFIRMATION_THRESHOLD } from "@/lib/whatsapp-intents";
import { ask, failReply, str, num, confirmFlow, type Handler } from "./shared";

export const cadastrarServicoOrdem: Handler = async ({ db, parameters, confirmed, explicitNo }) => {
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
    const gate = confirmFlow({
      intent: "cadastrar_servico_ordem",
      explicitNo,
      confirmed,
      question: `Confirma a ordem de serviço "${service.name}" para ${client.name} no valor de R$ ${total_value.toFixed(2)}? Responda "sim" para confirmar.`,
      auxiliary: { client_id: client.id, service_id: service.id, quantity: effectiveQty },
    });
    if (gate) return gate;
  }

  const result = await createServiceOrderAction(db, {
    service_client_id: client.id,
    service_id: service.id,
    quantity: effectiveQty,
    performed_at: new Date(),
  });
  if (!result.ok) return failReply("cadastrar_servico_ordem", result);
  return {
    reply_text: `Ordem de serviço registrada para ${client.name}: ${service.name}, total R$ ${result.data.total_value.toFixed(2)}.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `cadastrar_servico_ordem:${result.data.id}`,
  };
};

export const consultarCliente: Handler = async ({ db, parameters }) => {
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
  if (!result.ok) return failReply("consultar_cliente", result);
  const s = result.data;
  return {
    reply_text: `${s.client_name}: faturado R$ ${s.total_invoiced.toFixed(2)}, pendente R$ ${s.total_pending.toFixed(2)} (${s.orders_count} ordens registradas).`,
    requires_confirmation: false,
    auxiliary_data: s,
    report_url: null,
    action_taken: "consultar_cliente",
  };
};
