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
import { resolvePendingEntriesCalendar } from "@/lib/actions/financial-reports";
import { upsertVaccinationForecastAction } from "@/lib/actions/vaccination-forecast";
import { CONFIRMATION_THRESHOLD } from "@/lib/whatsapp-intents";
import { ask, failReply, str, num, confirmFlow, type Handler } from "./shared";

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

function formatUtcCivilDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function parseDueDate(value: string): Date | null {
  const civilMatch = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  if (!civilMatch) return null;

  const year = Number(civilMatch[1]);
  const month = Number(civilMatch[2]);
  const day = Number(civilMatch[3]);
  const civilDate = new Date(Date.UTC(year, month - 1, day));
  if (
    civilDate.getUTCFullYear() !== year ||
    civilDate.getUTCMonth() !== month - 1 ||
    civilDate.getUTCDate() !== day
  ) {
    return null;
  }

  const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function utcCivilDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function supportsThreeDayReminder(dueDate: Date, now = new Date()): boolean {
  const today = resolvePendingEntriesCalendar(now).today;
  return utcCivilDay(dueDate) - utcCivilDay(today) >= 3 * 86_400_000;
}

export const cadastrarAnimal: Handler = async ({ db, parameters }) => {
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
  if (!result.ok) return failReply("cadastrar_animal", result);
  return {
    reply_text: `Animal ${result.data.ear_tag} cadastrado com sucesso! ✅`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `cadastrar_animal:${result.data.id}`,
  };
};

export const registrarPeso: Handler = async ({ db, parameters }) => {
  const ear_tag = str(parameters.ear_tag);
  const weight = num(parameters.weight);
  if (!ear_tag || weight == null) {
    return ask("Para registrar o peso, preciso do brinco do animal e do peso em kg.");
  }
  const animal = await findAnimalByEarTag(db, ear_tag);
  if (!animal) return ask(`Não encontrei nenhum animal com o brinco '${ear_tag}'.`);

  const result = await addWeightLogAction(db, { animal_id: animal.id, weight });
  if (!result.ok) return failReply("registrar_peso", result);
  return {
    reply_text: `Peso de ${weight}kg registrado para o brinco ${ear_tag}. Peso atual: ${result.data.current_weight}kg${
      result.data.gmd != null ? ` (GMD: ${result.data.gmd}kg/dia)` : ""
    }.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `registrar_peso:${animal.id}`,
  };
};

export const registrarVacina: Handler = async ({ db, parameters }) => {
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
  if (!result.ok) return failReply("registrar_vacina", result);
  const reconciliationText = result.data.reconciled
    ? ` Previsão de R$ ${result.data.reconciled.previous_amount.toFixed(2)} conciliada com o custo real de R$ ${result.data.reconciled.new_amount.toFixed(2)} e marcada como paga.`
    : result.data.pending_prevision_amount !== undefined
      ? ` Você tem uma previsão de R$ ${result.data.pending_prevision_amount.toFixed(2)} pendente para essa vacina; me diga o valor real quando quiser que eu quite.`
      : "";
  return {
    reply_text: `Vacina ${result.data.vaccine_name} registrada para o brinco ${ear_tag}.${
      result.data.next_due_at
        ? ` Próxima dose: ${formatUtcCivilDate(result.data.next_due_at)}.`
        : ""
    }${reconciliationText}`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `registrar_vacina:${animal.id}`,
  };
};

export const registrarPrevisaoVacina: Handler = async ({ db, parameters }) => {
  const earTag = str(parameters.ear_tag);
  const vaccineName = str(parameters.vaccine_name);
  if (!earTag || !vaccineName) {
    return ask(
      "Para registrar a previsão, preciso do brinco do animal e do nome da vacina.",
    );
  }

  const animal = await findAnimalByEarTag(db, earTag);
  if (!animal) return ask(`Não encontrei nenhum animal com o brinco '${earTag}'.`);

  const vaccine = await findVaccineByName(db, vaccineName);
  if (!vaccine) {
    const all = await db.vaccine.findMany({ orderBy: { name: "asc" } });
    return ask(
      `Não encontrei a vacina '${vaccineName}' no catálogo. Vacinas disponíveis: ${
        all.map((item) => item.name).join(", ") || "nenhuma cadastrada"
      }.`,
    );
  }

  const cost = num(parameters.cost);
  if (cost == null) {
    return ask(
      `Qual o valor previsto para ${vaccine.name} (brinco ${animal.ear_tag})?`,
    );
  }
  if (cost <= 0) {
    return ask(
      `Informe um valor positivo para a previsão de ${vaccine.name} (brinco ${animal.ear_tag}).`,
    );
  }

  let dueDate: Date | null = null;
  const dueDateRaw = str(parameters.due_date);
  if (dueDateRaw) {
    dueDate = parseDueDate(dueDateRaw);
  } else {
    const latestVaccination = await db.animalVaccination.findFirst({
      where: { animal_id: animal.id, vaccine_id: vaccine.id },
      orderBy: { applied_at: "desc" },
      select: { next_due_at: true },
    });
    dueDate = latestVaccination?.next_due_at ?? null;
  }
  if (!dueDate) {
    return ask(
      `Qual a data prevista para ${vaccine.name} (brinco ${animal.ear_tag})?`,
    );
  }

  const outcome = await upsertVaccinationForecastAction(db, {
    animal_id: animal.id,
    vaccine_id: vaccine.id,
    vaccine_name: vaccine.name,
    ear_tag: animal.ear_tag,
    cost,
    due_date: dueDate,
  });
  if (!outcome.ok) {
    return failReply("registrar_previsao_vacina", outcome);
  }

  const reminder = supportsThreeDayReminder(dueDate)
    ? " Vou te lembrar 3 dias antes."
    : "";
  const statusText = outcome.data.updated
    ? "Previsão atualizada"
    : "Previsão registrada";
  return {
    reply_text: `${statusText}: Vacinação ${vaccine.name} (brinco ${animal.ear_tag}), R$ ${cost.toFixed(2)}, vencimento ${formatUtcCivilDate(dueDate)}.${reminder}`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `registrar_previsao_vacina:${outcome.data.id}`,
  };
};

export const registrarMovimento: Handler = async ({ db, parameters, confirmed, explicitNo }) => {
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
    const verb = movement_type === "sale" ? "venda" : "compra";
    const gate = confirmFlow({
      intent: "registrar_movimento",
      explicitNo,
      confirmed,
      question: `Confirma a ${verb} do animal ${ear_tag} por R$ ${value.toFixed(2)}? Responda "sim" para confirmar.`,
      auxiliary: { ear_tag, movement_type, value },
    });
    if (gate) return gate;
  }

  const result = await addMovementAction(db, {
    animal_id: animal.id,
    movement_type,
    value,
    to_property_id,
  });
  if (!result.ok) return failReply("registrar_movimento", result);
  return {
    reply_text: `${MOVEMENT_LABEL[movement_type]} registrada para o brinco ${ear_tag}${
      value != null ? ` (R$ ${value.toFixed(2)})` : ""
    }.`,
    requires_confirmation: false,
    auxiliary_data: null,
    report_url: null,
    action_taken: `registrar_movimento:${animal.id}`,
  };
};

export const consultarAnimal: Handler = async ({ db, parameters }) => {
  const ear_tag = str(parameters.ear_tag);
  if (!ear_tag) return ask("Qual o brinco do animal que você quer consultar?");
  const result = await getAnimalSummaryAction(db, ear_tag);
  if (!result.ok) return failReply("consultar_animal", result);
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
};
