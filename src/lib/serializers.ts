import { decToNum, isoOrNull } from "@/lib/serialize";

/**
 * Serializers de domínio: convertem registros Prisma para o formato dos contratos
 * de API (Decimal → number, Date → ISO8601). Centralizados para consistência.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeProperty(p: any) {
  return {
    id: p.id,
    name: p.name,
    address: p.address ?? null,
    area_hectares: decToNum(p.area_hectares),
    archived: p.archived_at != null,
    archived_at: isoOrNull(p.archived_at),
    created_at: p.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeAnimal(a: any) {
  return {
    id: a.id,
    ear_tag: a.ear_tag,
    breed: a.breed ?? null,
    sex: a.sex,
    property_id: a.property_id,
    birth_date: isoOrNull(a.birth_date),
    status: a.status,
    current_weight: decToNum(a.current_weight),
    created_at: a.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeWeightLog(w: any) {
  return {
    id: w.id,
    animal_id: w.animal_id,
    weight: decToNum(w.weight),
    measured_at: w.measured_at.toISOString(),
    created_at: w.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeVaccination(v: any) {
  return {
    id: v.id,
    animal_id: v.animal_id,
    vaccine_id: v.vaccine_id,
    vaccine_name: v.vaccine?.name ?? null,
    applied_at: v.applied_at.toISOString(),
    next_due_at: isoOrNull(v.next_due_at),
    cost: decToNum(v.cost),
    created_at: v.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeMovement(m: any) {
  return {
    id: m.id,
    animal_id: m.animal_id,
    movement_type: m.movement_type,
    from_property_id: m.from_property_id ?? null,
    to_property_id: m.to_property_id ?? null,
    value: decToNum(m.value),
    notes: m.notes ?? null,
    occurred_at: m.occurred_at.toISOString(),
    created_at: m.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializePlot(p: any) {
  return {
    id: p.id,
    name: p.name,
    property_id: p.property_id,
    area_hectares: decToNum(p.area_hectares),
    current_crop: p.current_crop ?? null,
    created_at: p.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeCycle(c: any) {
  return {
    id: c.id,
    plot_id: c.plot_id,
    crop_name: c.crop_name,
    planted_at: isoOrNull(c.planted_at),
    expected_harvest_at: isoOrNull(c.expected_harvest_at),
    harvested_at: isoOrNull(c.harvested_at),
    yield_amount: decToNum(c.yield_amount),
    yield_unit: c.yield_unit ?? null,
    status: c.status,
    created_at: c.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeServiceClient(c: any) {
  return {
    id: c.id,
    name: c.name,
    document: c.document ?? null,
    phone: c.phone ?? null,
    email: c.email ?? null,
    notes: c.notes ?? null,
    created_at: c.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeService(s: any) {
  return {
    id: s.id,
    name: s.name,
    pricing_type: s.pricing_type,
    unit_price: decToNum(s.unit_price),
    created_at: s.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeServiceOrder(o: any) {
  return {
    id: o.id,
    service_client_id: o.service_client_id,
    service_id: o.service_id,
    description: o.description ?? null,
    quantity: decToNum(o.quantity),
    total_value: decToNum(o.total_value),
    performed_at: isoOrNull(o.performed_at),
    status: o.status,
    created_at: o.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeFinancialEntry(e: any) {
  return {
    id: e.id,
    entry_type: e.entry_type,
    category: e.category ?? null,
    amount: decToNum(e.amount),
    related_module: e.related_module,
    related_id: e.related_id ?? null,
    due_date: isoOrNull(e.due_date),
    paid_at: isoOrNull(e.paid_at),
    status: e.status,
    notes: e.notes ?? null,
    created_at: e.created_at.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeInput(i: any) {
  return {
    id: i.id,
    cycle_id: i.cycle_id,
    input_type: i.input_type,
    name: i.name,
    quantity: decToNum(i.quantity),
    unit: i.unit ?? null,
    cost: decToNum(i.cost),
    applied_at: isoOrNull(i.applied_at),
    created_at: i.created_at.toISOString(),
  };
}
