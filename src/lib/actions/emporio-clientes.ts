import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { EmporioCustomer, Prisma } from "@/generated/prisma/client";
import type { Ator } from "@/lib/actions/emporio-catalogo";
import { CONSUMIDOR_FINAL, conferirCadastro, type CadastroDoContato } from "@/lib/contatos/cadastro";
import { faltaNoCadastro, recusaDocumentoRepetido } from "@/lib/emporio/cliente-cadastro";
import { exigir } from "@/lib/emporio/papel";
import { diferencas, registrarNoHistorico } from "@/lib/emporio/historico";

/**
 * O cliente do Empório (`EmporioCustomer`), separado dos Contatos da fazenda.
 * O formato dos campos é de `conferirCadastro`; o que é obrigatório por tipo é
 * de `faltaNoCadastro` (PF: nome e telefone; PJ: mais CNPJ e endereço principal).
 * O "Consumidor final" é o cliente fixo de quem não quer se identificar.
 */

export type ClienteInput = CadastroDoContato & { name?: string | null; notes?: string | null };

export type ClienteView = {
  id: string;
  name: string;
  person_kind: "pf" | "pj" | null;
  document: string | null;
  phone: string | null;
  state_registration: string | null;
  birth_date: string | null;
  responsible_name: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_district: string | null;
  city: string | null;
  address_state: string | null;
  delivery_zip: string | null;
  delivery_street: string | null;
  delivery_number: string | null;
  delivery_complement: string | null;
  delivery_district: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  notes: string | null;
  archived: boolean;
  /** Falta algo do que `faltaNoCadastro` exige para o tipo (o migrado só com nome, por exemplo). */
  incomplete: boolean;
  /** O Consumidor final: fixo, não edita nem arquiva. */
  fixed: boolean;
};

export const RECUSA_CONSUMIDOR_FINAL = "O Consumidor final é fixo e não pode ser editado nem arquivado.";
const NAO_ACHADO = () => fail("NOT_FOUND", "Cliente não encontrado.", 404);

/** Os campos do cadastro que a edição trata como "ausente = mantém, nulo = limpa". */
const CAMPOS = [
  "name", "person_kind", "document", "phone", "state_registration", "birth_date", "responsible_name",
  "address_zip", "address_street", "address_number", "address_complement", "address_district", "city", "address_state",
  "delivery_zip", "delivery_street", "delivery_number", "delivery_complement", "delivery_district", "delivery_city",
  "delivery_state",
] as const;

const ROTULOS: Record<string, string> = {
  name: "Nome",
  phone: "Telefone",
  city: "Cidade",
  notes: "Observações",
  person_kind: "Tipo de pessoa",
  document: "CPF/CNPJ",
  state_registration: "Inscrição estadual",
  birth_date: "Nascimento",
  responsible_name: "Responsável",
  address_zip: "CEP",
  address_street: "Rua",
  address_number: "Número",
  address_complement: "Complemento",
  address_district: "Bairro",
  address_state: "UF",
  delivery_zip: "CEP de entrega",
  delivery_street: "Rua de entrega",
  delivery_number: "Número de entrega",
  delivery_complement: "Complemento de entrega",
  delivery_district: "Bairro de entrega",
  delivery_city: "Cidade de entrega",
  delivery_state: "UF de entrega",
};

// O Histórico não se apaga: dado pessoal entra só como "informado".
const mascarar = (v: unknown) => (v ? "informado" : null);
const PESSOAIS = { document: mascarar, phone: mascarar, birth_date: mascarar };

const ehUnico = (e: unknown) => (e as { code?: unknown })?.code === "P2002";
const textoOuNulo = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function serializarCliente(c: EmporioCustomer): ClienteView {
  const view: Omit<ClienteView, "incomplete"> = {
    id: c.id,
    name: c.name,
    person_kind: c.person_kind,
    document: c.document,
    phone: c.phone,
    state_registration: c.state_registration,
    birth_date: c.birth_date ? c.birth_date.toISOString().slice(0, 10) : null,
    responsible_name: c.responsible_name,
    address_zip: c.address_zip,
    address_street: c.address_street,
    address_number: c.address_number,
    address_complement: c.address_complement,
    address_district: c.address_district,
    city: c.city,
    address_state: c.address_state,
    delivery_zip: c.delivery_zip,
    delivery_street: c.delivery_street,
    delivery_number: c.delivery_number,
    delivery_complement: c.delivery_complement,
    delivery_district: c.delivery_district,
    delivery_city: c.delivery_city,
    delivery_state: c.delivery_state,
    notes: c.notes,
    archived: c.archived_at !== null,
    fixed: c.system_key !== null,
  };
  return { ...view, incomplete: faltaNoCadastro({ ...view, system_key: c.system_key }) !== null };
}

function paraBanco(dados: CadastroDoContato): Record<string, unknown> {
  const { birth_date, ...resto } = dados;
  return {
    ...resto,
    ...(birth_date !== undefined
      ? { birth_date: birth_date ? new Date(`${birth_date}T00:00:00.000Z`) : null }
      : {}),
  };
}

/** Os campos que `faltaNoCadastro` lê, a partir dos dados conferidos (ausente vira nulo). */
function paraConferir(d: CadastroDoContato) {
  return {
    name: d.name ?? null,
    person_kind: d.person_kind ?? null,
    phone: d.phone ?? null,
    document: d.document ?? null,
    address_zip: d.address_zip ?? null,
    address_street: d.address_street ?? null,
    address_number: d.address_number ?? null,
    address_complement: d.address_complement ?? null,
    address_district: d.address_district ?? null,
    city: d.city ?? null,
    address_state: d.address_state ?? null,
  };
}

/**
 * Quem já usa o documento entre os clientes da conta. Conta os arquivados: o
 * índice único não os ignora, e a recusa precisa dizer onde o cliente está.
 */
async function documentoRepetido(
  db: TenantPrismaClient,
  documento: string,
  selfId: string | null,
): Promise<ActionResult<never> | null> {
  const c = await db.emporioCustomer.findFirst({
    where: { document: documento, ...(selfId ? { id: { not: selfId } } : {}) },
    select: { name: true, archived_at: true },
  });
  return c ? recusaDocumentoRepetido("cliente", { name: c.name, archived: c.archived_at !== null }, documento) : null;
}

export async function cadastrarClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ClienteInput,
): Promise<ActionResult<ClienteView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "cadastrar um cliente");
  if (neg) return neg;

  const conf = conferirCadastro(input);
  if (!conf.ok) return fail("VALIDATION_ERROR", conf.message, 422, conf.field);
  const falta = faltaNoCadastro(paraConferir(conf.dados));
  if (falta) return fail("VALIDATION_ERROR", falta.message, 422, falta.field);
  const documento = conf.dados.document ?? null;

  if (documento) {
    const rep = await documentoRepetido(db, documento, null);
    if (rep) return rep;
  }

  try {
    const cliente = await db.$transaction(async (tx) => {
      const criado = await tx.emporioCustomer.create({
        data: scoped({
          ...paraBanco(conf.dados),
          name: conf.dados.name as string,
          notes: textoOuNulo(input.notes),
        }) as Prisma.EmporioCustomerUncheckedCreateInput,
      });
      await registrarNoHistorico(tx, ator, {
        action: "cliente.cadastrar",
        target_type: "cliente",
        target_id: criado.id,
        summary: `Cadastrou o cliente ${criado.name}`,
      });
      return criado;
    });
    return ok(serializarCliente(cliente));
  } catch (e) {
    // Dois balcões com o mesmo documento ao mesmo tempo: o índice único decide.
    if (documento && ehUnico(e)) {
      const rep = await documentoRepetido(db, documento, null);
      if (rep) return rep;
    }
    throw e;
  }
}

/**
 * Edita o cadastro (inclusive o do cliente migrado, só com nome). Mescla o
 * guardado com o que veio (ausente = mantém, nulo = limpa) e confere o
 * RESULTADO: formato e o que o tipo exige. Só se grava o cadastro completo.
 */
export async function editarClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: Partial<ClienteInput>,
): Promise<ActionResult<ClienteView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "editar um cliente");
  if (neg) return neg;

  const atual = await db.emporioCustomer.findFirst({ where: { id } });
  if (!atual) return NAO_ACHADO();
  if (atual.system_key) return fail("VALIDATION_ERROR", RECUSA_CONSUMIDOR_FINAL, 422);
  if (atual.archived_at) {
    return fail("VALIDATION_ERROR", "Esse cliente está arquivado: desarquive em Clientes antes de editar.", 422);
  }

  const guardado = serializarCliente(atual) as unknown as Record<string, string | null>;
  const entrada = input as unknown as Record<string, string | null | undefined>;
  const mesclado: Record<string, string | null> = {};
  for (const k of CAMPOS) mesclado[k] = k in entrada ? (entrada[k] ?? null) : guardado[k];

  const conf = conferirCadastro(mesclado as CadastroDoContato);
  if (!conf.ok) return fail("VALIDATION_ERROR", conf.message, 422, conf.field);
  const falta = faltaNoCadastro(paraConferir(conf.dados));
  if (falta) return fail("VALIDATION_ERROR", falta.message, 422, falta.field);
  const documento = conf.dados.document ?? null;

  if (documento) {
    const rep = await documentoRepetido(db, documento, id);
    if (rep) return rep;
  }

  const dados: Record<string, unknown> = { ...paraBanco(conf.dados) };
  if ("notes" in entrada) dados.notes = textoOuNulo(entrada.notes);

  try {
    const cliente = await db.$transaction(async (tx) => {
      const novo = await tx.emporioCustomer.update({ where: { id }, data: dados as Prisma.EmporioCustomerUncheckedUpdateInput });
      await registrarNoHistorico(tx, ator, {
        action: "cliente.editar",
        target_type: "cliente",
        target_id: id,
        summary: `Editou o cliente ${novo.name}`,
        changes: diferencas(guardado, serializarCliente(novo) as unknown as Record<string, unknown>, ROTULOS, PESSOAIS),
      });
      return novo;
    });
    return ok(serializarCliente(cliente));
  } catch (e) {
    if (documento && ehUnico(e)) {
      const rep = await documentoRepetido(db, documento, id);
      if (rep) return rep;
    }
    throw e;
  }
}

/**
 * Lê um cliente. Por enquanto devolve o cadastro; a ficha (vendas e orçamentos)
 * entra com a tela Clientes.
 */
export async function lerClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<ClienteView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "ver um cliente");
  if (neg) return neg;
  const c = await db.emporioCustomer.findFirst({ where: { id } });
  return c ? ok(serializarCliente(c)) : NAO_ACHADO();
}

/**
 * O cliente fixo "Consumidor final" da conta, criado na primeira vez. Não é
 * escrita do usuário (nome sem `Action`, fora do Histórico). Race-safe: o
 * índice único [tenant_id, system_key] decide, e quem perde a corrida relê.
 */
export async function garantirConsumidorFinal(db: TenantPrismaClient): Promise<{ id: string; name: string }> {
  const achar = () => db.emporioCustomer.findFirst({ where: { system_key: CONSUMIDOR_FINAL.system_key } });
  const existente = await achar();
  if (existente) return { id: existente.id, name: existente.name };
  try {
    const novo = await db.emporioCustomer.create({
      data: scoped({ name: CONSUMIDOR_FINAL.name, system_key: CONSUMIDOR_FINAL.system_key }) as Prisma.EmporioCustomerUncheckedCreateInput,
    });
    return { id: novo.id, name: novo.name };
  } catch (e) {
    if (!ehUnico(e)) throw e;
    const depois = await achar();
    if (!depois) throw e;
    return { id: depois.id, name: depois.name };
  }
}
