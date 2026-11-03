import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { Prisma } from "@/generated/prisma/client";
import type { Ator } from "@/lib/actions/emporio-catalogo";
import {
  CAMPOS_NOVOS,
  RECUSA_CONSUMIDOR_FINAL,
  documentoRepetido,
  ehUnico,
  paraBanco,
  recusaDocumento,
  serializar,
  type ContactInput,
  type ContactView,
} from "@/lib/actions/contacts";
import { CONSUMIDOR_FINAL, conferirCadastro, type CadastroDoContato } from "@/lib/contatos/cadastro";
import { exigir } from "@/lib/emporio/papel";
import { diferencas, registrarNoHistorico } from "@/lib/emporio/historico";

/**
 * Cliente do balcão do Empório. Aqui o cadastro é EXIGIDO (modo "balcao":
 * tipo, nome, CPF/CNPJ e telefone). Fora do balcão, Contatos continua livre.
 * O "Consumidor final" é o contato fixo de quem não quer se identificar.
 */

const ROTULOS: Record<string, string> = {
  name: "Nome",
  phone: "Telefone",
  city: "Cidade",
  type: "Tipo de contato",
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

const mascarar = (v: unknown) => (v ? "informado" : null);

export async function cadastrarClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: ContactInput,
): Promise<ActionResult<ContactView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "cadastrar um cliente");
  if (neg) return neg;

  const conf = conferirCadastro(input, "balcao");
  if (!conf.ok) return fail("VALIDATION_ERROR", conf.message, 422, conf.field);
  const documento = conf.dados.document ?? null;
  const nome = (conf.dados.name ?? input.name ?? "").trim();

  if (documento) {
    const rep = await documentoRepetido(db, documento, null);
    if (rep) return recusaDocumento(rep, documento);
  }

  try {
    const contato = await db.$transaction(async (tx) => {
      const criado = await tx.contact.create({
        data: scoped({
          ...paraBanco(conf.dados),
          name: nome,
          type: input.type ?? null,
          notes: input.notes ?? null,
        }) as Prisma.ContactUncheckedCreateInput,
      });
      await registrarNoHistorico(tx, ator, {
        action: "cliente.cadastrar",
        target_type: "contato",
        target_id: criado.id,
        summary: `Cadastrou o cliente ${criado.name}`,
      });
      return criado;
    });
    return ok(serializar(contato));
  } catch (e) {
    if (documento && ehUnico(e)) {
      const rep = await documentoRepetido(db, documento, null);
      if (rep) return recusaDocumento(rep, documento);
    }
    throw e;
  }
}

/**
 * Completa o cadastro de um contato que já existe (o antigo, só com nome).
 * Mescla o guardado com o que veio (ausente = mantém, nulo = limpa) e confere o
 * RESULTADO em modo balcão: só se grava o cadastro completo.
 */
export async function completarClienteAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: ContactInput | Partial<ContactInput>,
): Promise<ActionResult<ContactView>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "completar o cadastro de um cliente");
  if (neg) return neg;

  const atual = await db.contact.findUnique({ where: { id } });
  if (!atual) return fail("NOT_FOUND", "Contato não encontrado.", 404);
  if (atual.system_key) return fail("VALIDATION_ERROR", RECUSA_CONSUMIDOR_FINAL, 422);
  if (atual.archived_at) {
    return fail("VALIDATION_ERROR", "Esse contato está arquivado: desarquive em Contatos antes de completar o cadastro.", 422);
  }

  const guardado = serializar(atual) as unknown as Record<string, string | null>;
  const entrada = input as unknown as Record<string, string | null | undefined>;
  const mesclado: Record<string, string | null> = {};
  for (const k of ["name", "phone", "city", ...CAMPOS_NOVOS] as const) {
    mesclado[k] = k in entrada ? (entrada[k] ?? null) : guardado[k];
  }

  const conf = conferirCadastro(mesclado as CadastroDoContato, "balcao");
  if (!conf.ok) return fail("VALIDATION_ERROR", conf.message, 422, conf.field);
  const documento = conf.dados.document ?? null;

  if (documento) {
    const rep = await documentoRepetido(db, documento, id);
    if (rep) return recusaDocumento(rep, documento);
  }

  const dados: Record<string, unknown> = { ...paraBanco(conf.dados) };
  if ("type" in entrada) dados.type = entrada.type ?? null;
  if ("notes" in entrada) dados.notes = entrada.notes ?? null;

  try {
    const contato = await db.$transaction(async (tx) => {
      const novo = await tx.contact.update({ where: { id }, data: dados as Prisma.ContactUncheckedUpdateInput });
      await registrarNoHistorico(tx, ator, {
        action: "cliente.completar",
        target_type: "contato",
        target_id: id,
        summary: `Completou o cadastro do cliente ${novo.name}`,
        changes: diferencas(guardado, serializar(novo) as unknown as Record<string, unknown>, ROTULOS, {
          // O Histórico não se apaga: dado pessoal entra só como "informado".
          document: mascarar,
          birth_date: mascarar,
        }),
      });
      return novo;
    });
    return ok(serializar(contato));
  } catch (e) {
    if (documento && ehUnico(e)) {
      const rep = await documentoRepetido(db, documento, id);
      if (rep) return recusaDocumento(rep, documento);
    }
    throw e;
  }
}

/**
 * O contato fixo "Consumidor final" do tenant, criado na primeira vez. Não é
 * escrita do usuário (nome sem `Action`, fora do Histórico). Race-safe: o
 * índice único [tenant_id, system_key] decide, e quem perde a corrida relê.
 */
export async function garantirConsumidorFinal(db: TenantPrismaClient): Promise<{ id: string; name: string }> {
  const achar = () => db.contact.findFirst({ where: { system_key: CONSUMIDOR_FINAL.system_key } });
  const existente = await achar();
  if (existente) return { id: existente.id, name: existente.name };
  try {
    const novo = await db.contact.create({
      data: scoped({ name: CONSUMIDOR_FINAL.name, system_key: CONSUMIDOR_FINAL.system_key }),
    });
    return { id: novo.id, name: novo.name };
  } catch (e) {
    if (!ehUnico(e)) throw e;
    const depois = await achar();
    if (!depois) throw e;
    return { id: depois.id, name: depois.name };
  }
}
